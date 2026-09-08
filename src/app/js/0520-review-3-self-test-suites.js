  (function (App) {
    'use strict';
    var T = App.test, A = App.adapters.android;
    function ensureA() { if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb); }
    function snap(d, r) { ensureA(); var a = App.registry.getDataset('android-adb', d), pr = a.parse(r); var o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: d, sha256: App.util.hash.sha256Hex(r), keys: pr.keys }; if (pr.values) o.values = pr.values; if (pr.template !== undefined) o.template = pr.template; return o; }
    function ready() {
      ensureA(); App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'R3', model: 'M1', firmware: 'F', snapshots: {
        'android.packages': snap('android.packages', 'com.a\ncom.b'),
        'android.tactical': snap('android.tactical', '{"enabled":true}') } });
      App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
      App.store.setDecision('android.packages', 'com.b', { action: 'disable' });
      App.store.setDecision('android.tactical', 'enabled', { value: true });
      return App.store.getProject();
    }

    T.suite('review-3 #1 generate scripts as .txt', function (s) {
      s.test('default emits .ps1; scriptsAsTxt emits .txt but keeps the preamble; data files unchanged', function () {
        var p = ready();
        var def = App.generate.buildImplementation(p, 'r3-m1').files.map(function (f) { return f.name; });
        T.assert(def.indexOf('packages.impl.ps1') !== -1, 'default should be .ps1');
        var r = App.generate.buildImplementation(p, 'r3-m1', { scriptsAsTxt: true });
        var names = r.files.map(function (f) { return f.name; });
        T.assert(names.indexOf('packages.impl.txt') !== -1, 'scripts not renamed to .txt');
        T.assert(names.indexOf('packages.impl.ps1') === -1, '.ps1 should be gone');
        T.assert(names.indexOf('tactical.json') !== -1, 'data file should be unchanged');
        var pk = r.files.filter(function (f) { return f.name === 'packages.impl.txt'; })[0];
        T.assert(/Set-StrictMode/.test(pk.content), 'preamble lost when renaming to .txt');
      });
    });

    T.suite('review-3 #3 / review-4 #1 policyList (prefixed internal key, stripped for display)', function (s) {
      var doc = { policyList: [{ checked: false, name: 'Disable Bluetooth' }, { checked: true, name: 'Enable X' }], other: 1 };
      var tac = A.tactical; // adapter object directly (no platform registration needed)
      s.test('flatten keys policies by `policyList.<name>` (stable internal identity), valued by checked', function () {
        var leaves = A.flattenTactical(doc), by = {};
        leaves.forEach(function (l) { by[l.key] = l; });
        T.assertEqual(by['policyList.Disable Bluetooth'].value, false);
        T.assertEqual(by['policyList.Enable X'].value, true);
        T.assertEqual(by['policyList.Disable Bluetooth'].type, 'bool');
        T.assert(!leaves.some(function (l) { return /policyList\[/.test(l.key); }), 'no index-style policy keys');
        T.assertEqual(by['other'].value, 1);
      });
      s.test('review-4 #1: displayKey strips the policyList. prefix (incl. nested) but NOT the stored key', function () {
        T.assertEqual(A.stripPolicyPrefix('policyList.Disable Bluetooth'), 'Disable Bluetooth');
        T.assertEqual(A.stripPolicyPrefix('parent.policyList.Bar'), 'parent.Bar');
        T.assertEqual(A.stripPolicyPrefix('com.example.flag'), 'com.example.flag', 'non-policy keys are untouched');
        T.assertEqual(tac.displayKey('policyList.Disable Bluetooth'), 'Disable Bluetooth');
        // The tactical Path column shows the bare name; the stored key keeps the prefix.
        var keyCol = tac.columns.filter(function (c) { return c.key === 'key'; })[0];
        T.assertEqual(keyCol.get({ key: 'policyList.Disable Bluetooth' }), 'Disable Bluetooth');
      });
      s.test('rebuild routes checked by name via the prefixed key (round-trips + targeted change)', function () {
        var leaves = A.flattenTactical(doc);
        var items = leaves.map(function (l) { return { key: l.key, decision: { value: l.value }, controlRefs: [], status: 'decided' }; });
        T.assertEqual(App.util.stable.stableStringify(A.rebuildTacticalDoc(doc, items)), App.util.stable.stableStringify(doc));
        var changed = A.rebuildTacticalDoc(doc, [{ key: 'policyList.Disable Bluetooth', decision: { value: true }, controlRefs: [], status: 'decided' }]);
        T.assertEqual(changed.policyList.filter(function (p) { return p.name === 'Disable Bluetooth'; })[0].checked, true);
        T.assertEqual(changed.policyList.filter(function (p) { return p.name === 'Enable X'; })[0].checked, true); // untouched
      });
      s.test('a policy name containing dots: stored prefixed, displayed bare, routes correctly', function () {
        var d2 = { policyList: [{ checked: false, name: 'Disable Hotspot 2.0' }] };
        var leaves = A.flattenTactical(d2);
        T.assertEqual(leaves[0].key, 'policyList.Disable Hotspot 2.0');
        T.assertEqual(tac.displayKey(leaves[0].key), 'Disable Hotspot 2.0');
        var changed = A.rebuildTacticalDoc(d2, [{ key: 'policyList.Disable Hotspot 2.0', decision: { value: true }, controlRefs: [], status: 'decided' }]);
        T.assertEqual(changed.policyList[0].checked, true);
      });
      s.test('review-4 #1 regression: a sibling key sharing a policy name is NOT misrouted (no collision)', function () {
        // 'enabled' exists BOTH as a real top-level field and as a policy name.
        var d3 = { enabled: true, policyList: [{ checked: false, name: 'enabled' }] };
        var out = A.rebuildTacticalDoc(d3, [
          { key: 'enabled', decision: { value: false }, controlRefs: [], status: 'decided' },                 // the real field
          { key: 'policyList.enabled', decision: { value: true }, controlRefs: [], status: 'decided' }        // the policy
        ]);
        T.assertEqual(out.enabled, false, 'real top-level field must take its own decision');
        T.assertEqual(out.policyList[0].checked, true, 'policy must take its own decision');
      });
    });

    T.suite('review-3 #5a/#5b control types + import', function (s) {
      s.test('addControlType registers a new type; dup is a no-op', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        T.assertEqual(App.store.addControlType('STIG').ok, true);
        T.assert(App.store.knownControlTypes().indexOf('STIG') !== -1);
        T.assertEqual(App.store.addControlType('').ok, false);
        var before = App.store.knownControlTypes().length;
        App.store.addControlType('ISM'); // already seeded
        T.assertEqual(App.store.knownControlTypes().length, before, 'dup added');
      });
      s.test('importControls creates controls + auto-registers unknown types', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        var res = App.store.importControls([{ title: 'Alpha', type: 'ISM', description: 'a' }, { title: 'Beta', type: 'NIST', description: '' }]);
        T.assertEqual(res.count, 2);
        var p = App.store.getProject();
        T.assertEqual(p.controls.length, 2);
        T.assert(App.store.knownControlTypes().indexOf('NIST') !== -1, 'new type not registered');
        T.assert(p.controls.every(function (c) { return /^[a-z0-9-]+$/.test(c.id); }));
      });
    });

    T.suite('review-3 #6 device-detail search', function (s) {
      s.test('renderPanels filters decided items by term', function () {
        var p = ready();
        var all = App.ui.views.devices.renderPanels(p, 'r3-m1', '');
        T.assert(all.indexOf('com.a') !== -1 && all.indexOf('com.b') !== -1);
        var f = App.ui.views.devices.renderPanels(p, 'r3-m1', 'com.b');
        T.assert(f.indexOf('com.b') !== -1 && f.indexOf('com.a') === -1, 'search did not filter');
        var none = App.ui.views.devices.renderPanels(p, 'r3-m1', 'zzz-nomatch');
        T.assert(/No matching applicable items/.test(none));
      });
    });

  })(App);
