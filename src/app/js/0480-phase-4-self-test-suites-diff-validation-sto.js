  (function (App) {
    'use strict';
    var T = App.test;
    function ensureAndroid() { if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb); }
    var ISO = '2026-01-01T00:00:00.000Z';

    function snap(dsId, raw) {
      ensureAndroid();
      var a = App.registry.getDataset('android-adb', dsId);
      var pr = a.parse(raw);
      var s = { capturedUtc: ISO, sourceFilename: dsId + '.txt', sha256: App.util.hash.sha256Hex(raw), keys: pr.keys };
      if (pr.values) s.values = pr.values;
      if (pr.template !== undefined) s.template = pr.template;
      return s;
    }
    function snaps(pkgRaw, tacRaw) {
      return { 'android.packages': snap('android.packages', pkgRaw), 'android.tactical': snap('android.tactical', tacRaw) };
    }
    function freshProject() { App.store.init(App.store.empty('android-adb')); }

    T.suite('diff.triage', function (s) {
      s.test('splits new vs existing, preserves order, dedupes', function () {
        T.assertDeepEqual(App.diff.triage(['b', 'a', 'a', 'c'], ['a']), { newKeys: ['b', 'c'], existingKeys: ['a'] });
      });
      s.test('register-only keys are ignored (not-applicable)', function () {
        T.assertDeepEqual(App.diff.triage(['a'], ['a', 'z']), { newKeys: [], existingKeys: ['a'] });
      });
    });

    T.suite('validation.validateOnboarding', function (s) {
      s.test('missing name -> error', function () {
        var iss = App.validation.validateOnboarding({ name: '', parsed: {} }, []);
        T.assert(iss.some(function (i) { return /name is required/i.test(i.message); }));
      });
      s.test('parse errors in a slot surface as located issues', function () {
        var parsed = { 'android.packages': { errors: [{ message: 'bad', location: 'line 1' }], warnings: [], keys: [] } };
        var iss = App.validation.validateOnboarding({ name: 'X', parsed: parsed }, ['android.packages']);
        T.assert(iss.some(function (i) { return /bad/.test(i.message) && /android\.packages/.test(i.location); }));
      });
    });

    T.suite('store.onboardDevice (fresh + inheritance)', function (s) {
      s.test('no project -> located error', function () {
        App.store.init(null); // simulate no project
        var res = App.store.onboardDevice({ name: 'X', snapshots: {} });
        T.assertEqual(res.ok, false);
      });
      s.test('fresh onboard creates v1 and appends all keys undecided', function () {
        freshProject();
        var res = App.store.onboardDevice({ name: 'Tab A', model: 'M1', firmware: 'F1', snapshots: snaps('com.a\ncom.b', '{"enabled":true}') });
        T.assertEqual(res.ok, true);
        T.assertEqual(res.result.noop, false);
        T.assertEqual(res.result.version, 1);
        T.assertEqual(res.result.deviceId, 'tab-a-m1');
        var p = App.store.getProject();
        T.assertEqual(p.deviceConfigs.length, 1);
        T.assertDeepEqual(p.items['android.packages'].map(function (i) { return i.key; }).sort(), ['com.a', 'com.b']);
        T.assert(p.items['android.packages'].every(function (i) { return i.status === 'undecided'; }));
      });
      s.test('onboard device #2 inherits common keys, flags only new', function () {
        freshProject();
        App.store.onboardDevice({ name: 'Tab A', model: 'M1', firmware: 'F1', snapshots: snaps('com.a\ncom.b', '{"enabled":true}') });
        var res = App.store.onboardDevice({ name: 'S23', model: 'M2', firmware: 'F2', snapshots: snaps('com.a\ncom.c', '{"enabled":true}') });
        T.assertEqual(res.result.perDataset['android.packages'].newCount, 1);    // com.c
        T.assertEqual(res.result.perDataset['android.packages'].existingCount, 1); // com.a
        var p = App.store.getProject();
        T.assertDeepEqual(p.items['android.packages'].map(function (i) { return i.key; }).sort(), ['com.a', 'com.b', 'com.c']);
      });
      s.test('captured-default drift surfaces an info issue (§8.4)', function () {
        // §8.4 is adapter-driven: it fires for ANY dataset whose snapshot records
        // per-key capture values. No shipped adapter emits `values` today (Settings,
        // which did, was retired in v2.0), so the snapshots are built by hand here to
        // keep the mechanism itself covered for the next dataset that needs it.
        freshProject();
        function valued(v) {
          var raw = 'k=' + v;
          return { capturedUtc: ISO, sourceFilename: 'x.txt', sha256: App.util.hash.sha256Hex(raw), keys: ['com.a'], values: { 'com.a': v } };
        }
        App.store.onboardDevice({ name: 'Tab A', model: 'M1', firmware: 'F1', snapshots: { 'android.packages': valued('0') } });
        var res = App.store.onboardDevice({ name: 'S23', model: 'M2', firmware: 'F2', snapshots: { 'android.packages': valued('1') } });
        T.assert(res.result.drift.length >= 1, 'expected drift info');
        T.assert(/com\.a default differs/.test(res.result.drift[0].message), 'got: ' + res.result.drift[0].message);
      });
    });

    T.suite('store re-onboard versioning (§8.7)', function (s) {
      s.test('identical snapshots -> NO-OP (no new config, no mutation)', function () {
        freshProject();
        var sn = snaps('com.a\ncom.b', '{"enabled":true}');
        App.store.onboardDevice({ name: 'Tab A', model: 'M1', firmware: 'F1', snapshots: sn });
        var before = App.projectIo.serializeProject(App.store.getProject());
        var res = App.store.onboardDevice({ name: 'Tab A', model: 'M1', firmware: 'F1', snapshots: snaps('com.a\ncom.b', '{"enabled":true}') });
        T.assertEqual(res.result.noop, true);
        T.assertEqual(App.store.getProject().deviceConfigs.length, 1);
        T.assertEqual(App.projectIo.serializeProject(App.store.getProject()), before, 'no-op mutated state');
      });
      s.test('differing snapshots -> new v2 supersedes v1; decisions untouched; append-only', function () {
        freshProject();
        App.store.onboardDevice({ name: 'Tab A', model: 'M1', firmware: 'F1', snapshots: snaps('com.a\ncom.b', '{"enabled":true}') });
        // Record a decision on com.a (simulate Phase-5 editing via the transactional commit).
        App.store._commit(function (p) { p.items['android.packages'].filter(function (i) { return i.key === 'com.a'; })[0].decision = { action: 'disable' }; });
        var res = App.store.onboardDevice({ name: 'Tab A', model: 'M1', firmware: 'F1', snapshots: snaps('com.a\ncom.c', '{"enabled":true}') });
        T.assertEqual(res.result.noop, false);
        T.assertEqual(res.result.version, 2);
        T.assertEqual(res.result.deviceId, 'tab-a-m1-v2');
        T.assertEqual(res.result.supersedesId, 'tab-a-m1');
        var p = App.store.getProject();
        T.assertEqual(p.deviceConfigs.length, 2);             // v1 retained
        var latest = App.store.getLatestConfigs(p).map(function (c) { return c.id; });
        T.assertDeepEqual(latest, ['tab-a-m1-v2']);
        // Decision preserved (register is shared/unified, append-only).
        T.assertDeepEqual(p.items['android.packages'].filter(function (i) { return i.key === 'com.a'; })[0].decision, { action: 'disable' });
        // New key com.c appended; com.b retained (append-only).
        T.assertDeepEqual(p.items['android.packages'].map(function (i) { return i.key; }).sort(), ['com.a', 'com.b', 'com.c']);
      });
      s.test('reonboardDevice shares the same code path', function () {
        freshProject();
        App.store.onboardDevice({ name: 'Tab A', model: 'M1', snapshots: snaps('com.a', '{"enabled":true}') });
        var res = App.store.reonboardDevice({ name: 'Tab A', model: 'M1', snapshots: snaps('com.a\ncom.b', '{"enabled":true}') });
        T.assertEqual(res.result.version, 2);
      });
    });

    T.suite('store.applicableItems / undecidedCount', function (s) {
      s.test('applicableItems returns only the device\'s keys', function () {
        freshProject();
        App.store.onboardDevice({ name: 'Tab A', model: 'M1', snapshots: snaps('com.a\ncom.b', '{"enabled":true}') });
        App.store.onboardDevice({ name: 'S23', model: 'M2', snapshots: snaps('com.a\ncom.c', '{"enabled":true}') });
        var ap = App.store.applicableItems('s23-m2', 'android.packages').map(function (i) { return i.key; }).sort();
        T.assertDeepEqual(ap, ['com.a', 'com.c']);
      });
      s.test('undecidedCount per device counts only applicable undecided', function () {
        freshProject();
        App.store.onboardDevice({ name: 'Tab A', model: 'M1', snapshots: snaps('com.a\ncom.b', '{"enabled":true}') });
        // 2 packages + 3 tactical (the captured leaf plus the two injected imsSettings
        // slots, review-17 #4) applicable, all undecided = 5
        T.assertEqual(App.store.undecidedCount('tab-a-m1'), 5);
      });
    });

  })(App);
