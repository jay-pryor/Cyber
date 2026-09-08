  (function (App) {
    'use strict';
    var T = App.test;

    T.suite('util.clock', function (s) {
      s.test('nowIso is injectable & UTC ISO', function () {
        App.util.clock.setClock(function () { return new Date('1980-01-01T00:00:00.000Z'); });
        T.assertEqual(App.util.clock.nowIso(), '1980-01-01T00:00:00.000Z');
        App.util.clock.resetClock();
      });
    });

    T.suite('util.html', function (s) {
      s.test('esc handles all five entities', function () {
        T.assertEqual(App.util.html.esc('<a href="x">\'&\'</a>'),
          '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
      });
      s.test('esc coerces null/undefined to empty', function () {
        T.assertEqual(App.util.html.esc(null), '');
        T.assertEqual(App.util.html.esc(undefined), '');
      });
      s.test('el escapes attrs, joins children', function () {
        T.assertEqual(App.util.html.el('span', { 'class': 'x"y' }, ['a', 'b']),
          '<span class="x&quot;y">ab</span>');
      });
    });

    T.suite('util.hash (SHA-256)', function (s) {
      // FIPS 180-4 published vectors.
      s.test('empty string', function () {
        T.assertEqual(App.util.hash.sha256Hex(''),
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      });
      s.test('"abc"', function () {
        T.assertEqual(App.util.hash.sha256Hex('abc'),
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      });
      s.test('448-bit message', function () {
        T.assertEqual(App.util.hash.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
          '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
      });
      s.test('multi-block (1 million? no — long string)', function () {
        var str = '';
        for (var i = 0; i < 1000; i++) str += 'a';
        // sha256 of 1000 'a' chars (known vector)
        T.assertEqual(App.util.hash.sha256Hex(str),
          '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
      });
      s.test('UTF-8 multibyte', function () {
        // 'é' (U+00E9, UTF-8 bytes C3 A9) sha256 — verified against Node crypto.
        T.assertEqual(App.util.hash.sha256Hex('é'),
          '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c');
      });
    });

    T.suite('util.crc32', function (s) {
      s.test('crc32 of "123456789" == 0xCBF43926', function () {
        var bytes = App.util.hash.utf8Bytes('123456789');
        T.assertEqual(App.util.crc32.crc32(bytes), 0xCBF43926);
      });
      s.test('crc32 of empty == 0', function () {
        T.assertEqual(App.util.crc32.crc32(new Uint8Array(0)), 0);
      });
    });

    T.suite('util.zip (determinism)', function (s) {
      function bytesEqual(a, b) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      }
      s.test('zipBytes(files) byte-equals a second zipBytes(files)', function () {
        var files = [{ name: 'a.txt', content: 'hello' }, { name: 'dir/b.json', content: '{"x":1}' }];
        var b1 = App.util.zip.zipBytes(files);
        var b2 = App.util.zip.zipBytes(files);
        T.assert(bytesEqual(b1, b2), 'two zips of identical input differ byte-for-byte');
      });
      s.test('zip uses fixed DOS date 0x0021 / time 0x0000 (determinism)', function () {
        // Local header: bytes 10-11 = time, 12-13 = date (little-endian) after the 4-byte sig
        // sig(4)+ver(2)+flag(2)+method(2) = offset 10 for time, 12 for date.
        var b = App.util.zip.zipBytes([{ name: 'x', content: 'y' }]);
        T.assertEqual(b[10] | (b[11] << 8), 0x0000, 'DOS time not fixed');
        T.assertEqual(b[12] | (b[13] << 8), 0x0021, 'DOS date not fixed');
      });
      s.test('zip starts with PK local-file signature', function () {
        var b = App.util.zip.zipBytes([{ name: 'x', content: 'y' }]);
        T.assert(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04, 'bad PK sig');
      });
      s.test('zip Blob has application/zip mime', function () {
        var blob = App.util.zip.zip([{ name: 'x', content: 'y' }]);
        T.assert(blob.type === 'application/zip', 'wrong mime');
      });
    });

  })(App);
