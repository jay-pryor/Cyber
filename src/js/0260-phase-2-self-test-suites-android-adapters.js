  (function (App) {
    'use strict';
    var T = App.test;
    var A = App.adapters.android;

    T.suite('android.packages parse', function (s) {
      s.test('strips package: prefix, =path, dedupes, sorts', function () {
        var r = A.packages.parse('package:com.b\npackage:com.a=/data/app/a\ncom.a\n# comment\n\n');
        T.assertDeepEqual(r.keys, ['com.a', 'com.b']);
        T.assertEqual(r.errors.length, 0);
        T.assertEqual(r.warnings.length, 1); // duplicate com.a
      });
      s.test('empty file errors', function () {
        var r = A.packages.parse('\n\n# only comments\n');
        T.assertEqual(r.errors.length, 1);
      });
      s.test('line with a space errors (malformed token)', function () {
        var r = A.packages.parse('com.foo bar');
        T.assert(r.errors.some(function (e) { return /valid package token/.test(e.message); }));
      });
    });

    T.suite('android.tactical flatten/rebuild', function (s) {
      var doc = {
        radios: [{ mode: 'a' }, { mode: 'b' }],
        enabled: true,
        dns: ['1.1.1.1', '8.8.8.8'],
        count: 3, ratio: 1.5, name: 'x',
        nested: { deep: { flag: false } }
      };
      s.test('flatten produces expected leaves & types', function () {
        var leaves = A.flattenTactical(doc);
        var byKey = {};
        leaves.forEach(function (l) { byKey[l.key] = l; });
        // FW-1: a list of OBJECTS is ONE leaf holding the whole list, not positional
        // `radios[0].mode` keys — the element's index is not its identity, and a key set
        // that depends on how many elements a capture had is what broke firewall rules.
        T.assert(!('radios[0].mode' in byKey), 'positional keys must be gone');
        T.assertEqual(byKey['radios'].type, 'json');
        T.assertDeepEqual(byKey['radios'].value, [{ mode: 'a' }, { mode: 'b' }]);
        T.assertEqual(byKey['enabled'].type, 'bool');
        T.assertEqual(byKey['dns'].type, 'array');
        T.assertDeepEqual(byKey['dns'].value, ['1.1.1.1', '8.8.8.8']);
        T.assertEqual(byKey['count'].type, 'int');
        T.assertEqual(byKey['ratio'].type, 'float');
        T.assertEqual(byKey['nested.deep.flag'].value, false);
      });
      s.test('rebuild from decided values round-trips to original', function () {
        var leaves = A.flattenTactical(doc);
        var items = leaves.map(function (l) { return { key: l.key, decision: { value: l.value, type: l.type }, controlRefs: [], status: 'decided' }; });
        var rebuilt = A.rebuildTacticalDoc(doc, items);
        T.assertEqual(App.util.stable.stableStringify(rebuilt), App.util.stable.stableStringify(doc));
      });
      s.test('rebuild preserves untouched keys (partial decisions)', function () {
        var rebuilt = A.rebuildTacticalDoc(doc, [{ key: 'count', decision: { value: 9, type: 'int' }, controlRefs: [], status: 'decided' }]);
        T.assertEqual(rebuilt.count, 9);
        T.assertEqual(rebuilt.enabled, true); // untouched
        T.assertEqual(rebuilt.nested.deep.flag, false);
      });
      s.test('invalid JSON errors', function () {
        var r = A.tactical.parse('{ bad ');
        T.assertEqual(r.errors.length, 1);
      });
      s.test('non-object root rejected (D-002)', function () {
        T.assert(A.tactical.parse('[1,2,3]').errors.some(function (e) { return /root must be a JSON object/.test(e.message); }));
        T.assert(A.tactical.parse('5').errors.length === 1);
        T.assert(A.tactical.parse('"x"').errors.length === 1);
      });
      s.test('type fidelity: bool/number preserved as JSON types', function () {
        var r = A.tactical.parse('{"a":true,"b":2}');
        var item = { key: 'a', decision: { value: true, type: 'bool' }, controlRefs: [], status: 'decided' };
        var out = A.rebuildTacticalDoc(r.template, [item]);
        T.assertEqual(out.a, true);
        T.assert(JSON.stringify(out).indexOf('"a":true') !== -1, 'bool serialized as string');
      });
    });

    T.suite('decisionSchema / isComplete / validateDecision', function (s) {
      s.test('packages isComplete only when action valid', function () {
        T.assertEqual(A.packages.isComplete({ key: 'x', decision: null, controlRefs: [] }), false);
        T.assertEqual(A.packages.isComplete({ key: 'x', decision: { action: 'disable' }, controlRefs: [] }), true);
        T.assertEqual(A.packages.isComplete({ key: 'x', decision: { action: 'nope' }, controlRefs: [] }), false);
      });
      s.test('tactical isComplete with falsey value', function () {
        T.assertEqual(A.tactical.isComplete({ key: 't', decision: { value: false, type: 'bool' }, controlRefs: [] }), true);
        T.assertEqual(A.tactical.isComplete({ key: 't', decision: null, controlRefs: [] }), false);
      });
    });

    T.suite('two-layer shell escaping (injection-safety, Appendix B)', function (s) {
      function psUnquote(str) { return str.slice(1, -1).replace(/''/g, "'"); }
      function shUnquote(str) {
        var out = '', i = 0;
        while (i < str.length) {
          if (str[i] === "'") { i++; while (i < str.length && str[i] !== "'") { out += str[i]; i++; } i++; }
          else if (str[i] === '\\' && str[i + 1] === "'") { out += "'"; i += 2; }
          else { i++; }
        }
        return out;
      }
      s.test('psSingleQuote/shSingleQuote round-trip the adversarial value', function () {
        var v = "a'b\"c$(whoami)` d;e";
        var prefix = 'cmd package set-x ';
        var deviceCmd = prefix + A.shSingleQuote(v);
        var psArg = A.psSingleQuote(deviceCmd);
        // Unwrap PowerShell layer, then POSIX layer, recover the value.
        var afterPs = psUnquote(psArg);
        T.assertEqual(afterPs, deviceCmd, 'PS layer did not round-trip');
        var quotedVal = afterPs.slice(prefix.length);
        T.assertEqual(shUnquote(quotedVal), v, 'POSIX layer did not round-trip');
      });
      s.test('a generated package line embeds the value as ONE PS-quoted token', function () {
        var line = A.packages.generateImplementation(
          [{ key: "com.evil'pkg", decision: { action: 'disable' }, controlRefs: [], status: 'decided' }], {})[0].content;
        // The pm command now lives in the preamble helper; the emitted line passes the
        // package to it, so that call site is where the quoting has to hold.
        var call = line.split('\n').filter(function (l) { return /^Apply-Package/.test(l); })[0];
        T.assertEqual(call, "Apply-Package 'com.evil''pkg' 'disable'", 'package name not a single PS-quoted arg');
      });
    });

    T.suite('platform registration (android-adb)', function (s) {
      s.test('profile exposes its three datasets (Settings retired in v2.0; Custom Actions added in CUS-1)', function () {
        var p = App.platforms.androidAdb;
        T.assertEqual(p.id, 'android-adb');
        T.assertDeepEqual(p.datasets.map(function (d) { return d.id; }), ['android.packages', 'android.tactical', 'android.custom']);
      });
      s.test('tactical generateImplementation emits ONLY the rebuilt JSON (Knox upload; no script)', function () {
        var tac = App.platforms.androidAdb.datasets[1];
        var files = tac.generateImplementation(
          [{ key: 'enabled', decision: { value: false, type: 'bool' }, controlRefs: [], status: 'decided' }],
          { device: { snapshots: { 'android.tactical': { template: { enabled: true, mode: 'x' } } } } });
        T.assertEqual(files.length, 1, 'tactical impl should emit exactly one file');
        T.assertEqual(files[0].name, 'tactical.json');
        T.assert(!/\.ps1$/.test(files[0].name), 'tactical impl must not emit a script');
        // Rebuilt JSON is valid and in the same shape as the input, with the decision applied.
        T.assertDeepEqual(JSON.parse(files[0].content), { enabled: false, mode: 'x' });
      });
    });

  })(App);
