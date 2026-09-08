  /* =============================================================================
   * MODULE: App.util.zip  — VENDORED store-only ZIP writer
   * PURPOSE: Build a valid store-only (no compression) ZIP as a Blob, on file://
   *          without any library (spec §17.C.3, §10.4).
   * PURITY:  pure (returns a Blob deterministically from its input)
   * DEPENDS: App.util.crc32, App.util.hash (utf8Bytes)
   * INVARIANTS (determinism, MUST):
   *   * Every entry uses FIXED DOS time=0x0000, date=0x0021 (1980-01-01).
   *   * version/flags/attributes/disk fields are fixed constants.
   *   * UTF-8 language-encoding flag (bit 11) is set; filenames UTF-8.
   *   * Entry order = input order.  => zip(files) is byte-reproducible.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var DOS_TIME = 0x0000;            // 00:00:00
    var DOS_DATE = 0x0021;            // 1980-01-01 (minimum legal DOS date)
    var VERSION = 20;                 // version made by / needed to extract (2.0)
    var FLAG_UTF8 = 0x0800;           // general-purpose bit 11: filename is UTF-8
    var METHOD_STORE = 0;             // no compression

    function pushU16(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff); }
    function pushU32(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }
    function pushBytes(arr, bytes) { for (var i = 0; i < bytes.length; i++) arr.push(bytes[i]); }

    /**
     * Build a store-only ZIP as a raw byte array (deterministic). Exposed
     * separately from zip() so determinism self-tests can compare bytes
     * synchronously without FileReader (which is async in real browsers).
     * @param {{name:string, content:string}[]} files  Order is preserved.
     * @returns {Uint8Array}
     */
    function zipBytes(files) {
      var crc32 = App.util.crc32.crc32;
      var utf8 = App.util.hash.utf8Bytes;

      var local = [];          // accumulated local headers + data
      var central = [];        // central directory records
      var offset = 0;          // running offset of each local header

      for (var i = 0; i < files.length; i++) {
        var nameBytes = utf8(files[i].name);
        var dataBytes = utf8(files[i].content);
        var crc = crc32(dataBytes);
        var size = dataBytes.length;

        // ---- Local file header ----
        var localStart = local.length;
        pushU32(local, 0x04034b50);   // local file header signature
        pushU16(local, VERSION);      // version needed
        pushU16(local, FLAG_UTF8);    // general purpose bit flag
        pushU16(local, METHOD_STORE); // compression method
        pushU16(local, DOS_TIME);     // last mod time (FIXED)
        pushU16(local, DOS_DATE);     // last mod date (FIXED)
        pushU32(local, crc);          // crc-32
        pushU32(local, size);         // compressed size (== uncompressed, stored)
        pushU32(local, size);         // uncompressed size
        pushU16(local, nameBytes.length);
        pushU16(local, 0);            // extra field length
        pushBytes(local, nameBytes);
        pushBytes(local, dataBytes);

        // ---- Central directory record ----
        pushU32(central, 0x02014b50); // central file header signature
        pushU16(central, VERSION);    // version made by
        pushU16(central, VERSION);    // version needed
        pushU16(central, FLAG_UTF8);  // general purpose bit flag
        pushU16(central, METHOD_STORE);
        pushU16(central, DOS_TIME);
        pushU16(central, DOS_DATE);
        pushU32(central, crc);
        pushU32(central, size);
        pushU32(central, size);
        pushU16(central, nameBytes.length);
        pushU16(central, 0);          // extra field length
        pushU16(central, 0);          // file comment length
        pushU16(central, 0);          // disk number start
        pushU16(central, 0);          // internal file attributes
        pushU32(central, 0);          // external file attributes
        pushU32(central, offset);     // relative offset of local header

        pushBytes(central, nameBytes);

        offset += (local.length - localStart);
      }

      var centralStart = local.length;
      var combined = local.concat(central);

      // ---- End of central directory record ----
      pushU32(combined, 0x06054b50);
      pushU16(combined, 0);                    // disk number
      pushU16(combined, 0);                    // disk with central dir
      pushU16(combined, files.length);         // entries on this disk
      pushU16(combined, files.length);         // total entries
      pushU32(combined, central.length);       // size of central directory
      pushU32(combined, centralStart);         // offset of central directory
      pushU16(combined, 0);                    // comment length

      return new Uint8Array(combined);
    }

    /**
     * Build a store-only ZIP Blob from an ordered list of files.
     * @param {{name:string, content:string}[]} files  Order is preserved.
     * @returns {Blob} application/zip
     * @example App.util.zip.zip([{name:'a.txt', content:'hi'}])
     */
    function zip(files) {
      return new Blob([zipBytes(files)], { type: 'application/zip' });
    }

    App.util = App.util || {};
    App.util.zip = { zip: zip, zipBytes: zipBytes };
  })(App);
