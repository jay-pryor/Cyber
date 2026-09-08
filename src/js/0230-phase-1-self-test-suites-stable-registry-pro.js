  (function (App) {
    'use strict';
    var T = App.test;

    // A self-contained test platform with three dataset ids, so projectIo's
    // dataset-id cross-checks and the "registered platform" check are exercised
    // without depending on the Android adapters (Phase 2). Distinct id => never
    // clobbers the real 'android-adb' platform.
    // D-007: registered LAZILY (inside tests) — registering at module-load would
    // run on every page load and, being first, make this mock the ACTIVE platform.
    var ST_PLATFORM_ID = 'selftest.platform';
    var DS = ['selftest.a', 'selftest.b', 'selftest.c'];
    function ensureST() {
      if (!App.registry.hasPlatform(ST_PLATFORM_ID)) App.registry.registerPlatform({
        id: ST_PLATFORM_ID, label: 'Self-test', outputLanguage: 'none',
        datasets: DS.map(function (id) { return { id: id, label: id }; }),
        captureInstructions: '', scriptPreamble: function () { return ''; }, scriptPostamble: function () { return ''; }
      });
    }

    var ISO = '2026-01-01T00:00:00.000Z';
    function sha(x) { return App.util.hash.sha256Hex(x); }

    function sampleProject() {
      ensureST();
      return {
        schemaVersion: App.projectIo.SCHEMA_VERSION,
        platformProfileId: ST_PLATFORM_ID,
        meta: { createdUtc: ISO, modifiedUtc: '2026-01-02T00:00:00.000Z', appVersion: '1.0' },
        groups: [],
        controls: [{ id: 'ism-1', title: 'ISM-1', type: 'ISM', description: '', assignedDeviceIds: [] }],
        deviceConfigs: [
          {
            id: 'tab-active-5', baseId: 'tab-active-5', version: 1, supersedesId: null,
            name: 'Tab Active 5', model: 'SM-X306B', firmware: 'X306B-1', onboardedUtc: ISO,
            snapshots: {
              'selftest.a': { capturedUtc: ISO, sourceFilename: 'a.txt', sha256: sha('a1'), keys: ['k1', 'k2'] },
              'selftest.b': { capturedUtc: ISO, sourceFilename: 'b.txt', sha256: sha('b1'), keys: ['s1', 's2'], values: { s1: '0', s2: '1' } },
              'selftest.c': { capturedUtc: ISO, sourceFilename: 'c.json', sha256: sha('c1'), keys: ['t1'], template: { t1: true } }
            }
          },
          {
            id: 's23', baseId: 's23', version: 1, supersedesId: null,
            name: 'S23', model: 'SM-S911', firmware: 'S911-1', onboardedUtc: ISO,
            snapshots: {
              'selftest.a': { capturedUtc: ISO, sourceFilename: 'a.txt', sha256: sha('a2'), keys: ['k1', 'k3'] },
              'selftest.b': { capturedUtc: ISO, sourceFilename: 'b.txt', sha256: sha('b2'), keys: ['s1', 's2'], values: { s1: '1', s2: '1' } },
              'selftest.c': { capturedUtc: ISO, sourceFilename: 'c.json', sha256: sha('c2'), keys: ['t1'], template: { t1: true } }
            }
          }
        ],
        items: {
          'selftest.a': [
            { key: 'k1', description: 'pkg one', decision: { action: 'keep' }, controlRefs: ['ism-1'], status: 'decided' },
            { key: 'k2', decision: null, controlRefs: [], status: 'undecided' },
            { key: 'k3', decision: null, controlRefs: [], status: 'undecided' }
          ],
          'selftest.b': [
            { key: 's1', decision: { value: '0', type: 'int' }, controlRefs: [], status: 'decided' },
            { key: 's2', decision: null, controlRefs: [], status: 'undecided' }
          ],
          'selftest.c': [
            { key: 't1', decision: { value: true, type: 'bool' }, controlRefs: [], status: 'decided' }
          ]
        }
      };
    }

    T.suite('util.stable.stableStringify', function (s) {
      s.test('sorts object keys ascending', function () {
        T.assertEqual(App.util.stable.stableStringify({ b: 1, a: 2 }), '{\n  "a": 2,\n  "b": 1\n}');
      });
      s.test('preserves array order (tactical-template safety)', function () {
        T.assertEqual(App.util.stable.stableStringify([3, 1, 2]), '[\n  3,\n  1,\n  2\n]');
      });
      s.test('drops undefined-valued keys (JSON parity)', function () {
        T.assertEqual(App.util.stable.stableStringify({ a: undefined, b: 1 }), '{\n  "b": 1\n}');
      });
      s.test('empty object/array compact', function () {
        T.assertEqual(App.util.stable.stableStringify({ a: {}, b: [] }), '{\n  "a": {},\n  "b": []\n}');
      });
      s.test('escapes strings correctly', function () {
        T.assertEqual(App.util.stable.stableStringify('a"b\n'), '"a\\"b\\n"');
      });
    });

    T.suite('projectIo schema validation', function (s) {
      s.test('valid sample project has no errors', function () {
        var issues = App.projectIo.validateSchema(sampleProject());
        var errs = issues.filter(function (i) { return i.severity === 'error'; });
        T.assertEqual(errs.length, 0, 'unexpected errors: ' + JSON.stringify(errs));
      });
      s.test('malformed JSON -> located parse error', function () {
        var r = App.projectIo.parseProject('{ not json ');
        T.assertEqual(r.ok, false);
        T.assertEqual(r.issues[0].category, 'parse');
      });
      s.test('unknown top-level key rejected', function () {
        var p = sampleProject(); p.extra = 1;
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assertEqual(r.ok, false);
        T.assert(r.issues.some(function (i) { return /Unknown top-level/.test(i.message); }));
      });
      s.test('unknown schemaVersion rejected', function () {
        var p = sampleProject(); p.schemaVersion = 99;
        T.assertEqual(App.projectIo.parseProject(JSON.stringify(p)).ok, false);
      });
      s.test('unregistered platform id rejected', function () {
        var p = sampleProject(); p.platformProfileId = 'nope.platform';
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assertEqual(r.ok, false);
        T.assert(r.issues.some(function (i) { return /not a registered platform/.test(i.message); }));
      });
      s.test('unknown dataset id in items rejected', function () {
        var p = sampleProject(); p.items['selftest.zzz'] = [];
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assertEqual(r.ok, false);
        T.assert(r.issues.some(function (i) { return /not a dataset/.test(i.message); }));
      });
      s.test('bad sha256 rejected', function () {
        var p = sampleProject(); p.deviceConfigs[0].snapshots['selftest.a'].sha256 = 'xyz';
        T.assertEqual(App.projectIo.parseProject(JSON.stringify(p)).ok, false);
      });
      s.test('unsorted snapshot keys rejected', function () {
        var p = sampleProject(); p.deviceConfigs[0].snapshots['selftest.a'].keys = ['k2', 'k1'];
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assert(r.issues.some(function (i) { return /sorted ascending/.test(i.message); }));
      });
      s.test('duplicate item key rejected', function () {
        var p = sampleProject(); p.items['selftest.a'].push({ key: 'k1', decision: null, controlRefs: [], status: 'undecided' });
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assert(r.issues.some(function (i) { return /Duplicate item key/.test(i.message); }));
      });
      s.test('version integrity: broken supersedes chain rejected', function () {
        var p = sampleProject();
        // Add a v2 for tab-active-5 with a wrong supersedesId.
        p.deviceConfigs.push({
          id: 'tab-active-5-v2', baseId: 'tab-active-5', version: 2, supersedesId: 'wrong-id',
          name: 'Tab Active 5', model: 'SM-X306B', firmware: 'X306B-2', onboardedUtc: ISO,
          snapshots: p.deviceConfigs[0].snapshots
        });
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assert(r.issues.some(function (i) { return /supersedesId must reference/.test(i.message); }));
      });
      s.test('version integrity: valid v2 chain accepted', function () {
        var p = sampleProject();
        p.deviceConfigs.push({
          id: 'tab-active-5-v2', baseId: 'tab-active-5', version: 2, supersedesId: 'tab-active-5',
          name: 'Tab Active 5', model: 'SM-X306B', firmware: 'X306B-2', onboardedUtc: ISO,
          snapshots: p.deviceConfigs[0].snapshots
        });
        T.assertEqual(App.projectIo.parseProject(JSON.stringify(p)).ok, true);
      });
    });

    T.suite('projectIo round-trip & determinism (DOD-2/DOD-7)', function (s) {
      s.test('serialize(parse(serialize(P))) === serialize(P)', function () {
        var p = sampleProject();
        var s1 = App.projectIo.serializeProject(p);
        var r = App.projectIo.parseProject(s1);
        T.assertEqual(r.ok, true, 'reparse failed: ' + JSON.stringify(r.issues));
        var s2 = App.projectIo.serializeProject(r.value);
        T.assertEqual(s1, s2);
      });
      s.test('serialization is order-independent (shuffled input -> same bytes)', function () {
        var p = sampleProject();
        var shuffled = sampleProject();
        // Reverse item arrays & device order to prove canonicalization.
        shuffled.items['selftest.a'].reverse();
        shuffled.deviceConfigs.reverse();
        T.assertEqual(App.projectIo.serializeProject(p), App.projectIo.serializeProject(shuffled));
      });
      s.test('migrate at the current version is identity', function () {
        var p = sampleProject();
        T.assert(App.projectIo.migrate(p) === p);
      });
      // TW-1: v3 -> v4 is a version stamp and nothing else. Asserted rather than assumed
      // because a migration that quietly rewrote a document would be invisible otherwise.
      s.test('migrate v3 -> v4 changes nothing but the version', function () {
        var v3 = sampleProject(); v3.schemaVersion = 3;
        var v4 = App.projectIo.migrate(v3);
        T.assertEqual(v4.schemaVersion, 4);
        var a = JSON.parse(JSON.stringify(v3)); a.schemaVersion = 4;
        T.assertEqual(App.util.stable.stableStringify(a), App.util.stable.stableStringify(v4));
        T.assertEqual(App.projectIo.validateSchema(v4).filter(function (i) { return i.severity === 'error'; }).length, 0);
      });
      s.test('migrate v1 -> v3 builds controls from legacy ismRefs + adds groups/overrides (lossless)', function () {
        ensureST();
        var v1 = {
          schemaVersion: 1, platformProfileId: ST_PLATFORM_ID,
          meta: { createdUtc: ISO, modifiedUtc: ISO, appVersion: '1.0' }, deviceConfigs: [],
          items: { 'selftest.a': [{ key: 'k1', decision: null, ismRefs: ['ISM-1', 'AHG-2', 'misc'], status: 'undecided' }], 'selftest.b': [], 'selftest.c': [] }
        };
        var v3 = App.projectIo.migrate(v1); // chains v1 -> v2 -> v3 -> v4
        T.assertEqual(v3.schemaVersion, App.projectIo.SCHEMA_VERSION);
        T.assert(Array.isArray(v3.groups), 'groups not added by v2->v3');
        T.assertEqual(v3.controls.length, 3);
        var types = {}; v3.controls.forEach(function (c) { types[c.title] = c.type; });
        T.assertEqual(types['ISM-1'], 'ISM'); T.assertEqual(types['AHG-2'], 'AHG'); T.assertEqual(types['misc'], 'Custom');
        var item = v3.items['selftest.a'][0];
        T.assertEqual(item.ismRefs, undefined, 'legacy ismRefs not removed');
        T.assertEqual(item.controlRefs.length, 3);
        // controlRefs point at real control ids; passes schema validation.
        T.assertEqual(App.projectIo.validateSchema(v3).filter(function (i) { return i.severity === 'error'; }).length, 0);
      });
    });

    T.suite('T10.1 schema v3 (groups, overrides, migrate, prune)', function (s) {
      // A v3 sample carrying a group (with a group override) + a device override.
      function v3Sample() {
        var p = sampleProject();          // schemaVersion 3, selftest platform
        p.groups = [{ id: 'rugged', name: 'Rugged', deviceBaseIds: ['tab-active-5'], overrides: { 'selftest.a': { k1: { action: 'disable' } } } }];
        p.deviceConfigs[0].overrides = { 'selftest.a': { k1: { action: 'remove' } } };  // device beats group
        return p;
      }
      s.test('v2 -> v3 migrate adds groups + per-config overrides and validates', function () {
        var v2 = sampleProject(); v2.schemaVersion = 2; delete v2.groups; delete v2.deviceConfigs[0].overrides;
        var v3 = App.projectIo.migrate(v2);
        T.assertEqual(v3.schemaVersion, App.projectIo.SCHEMA_VERSION);
        T.assert(Array.isArray(v3.groups) && v3.groups.length === 0, 'groups not initialised');
        T.assert(v3.deviceConfigs.every(function (dc) { return typeof dc.overrides === 'object'; }), 'overrides not initialised on configs');
        T.assertEqual(App.projectIo.validateSchema(v3).filter(function (i) { return i.severity === 'error'; }).length, 0);
      });
      s.test('round-trip identity with a group + device override', function () {
        var s1 = App.projectIo.serializeProject(v3Sample());
        var r = App.projectIo.parseProject(s1);
        T.assertEqual(r.ok, true, 'reparse failed: ' + JSON.stringify(r.issues));
        var s2 = App.projectIo.serializeProject(r.value);
        T.assertEqual(s1, s2, 'v3 round-trip not byte-identical');
        // The override survived the round-trip.
        T.assertDeepEqual(r.value.deviceConfigs.filter(function (c) { return c.id === 'tab-active-5'; })[0].overrides, { 'selftest.a': { k1: { action: 'remove' } } });
      });
      s.test('empty override maps are dropped from serialized output', function () {
        var p = sampleProject(); p.deviceConfigs[0].overrides = { 'selftest.a': {} };
        T.assert(App.projectIo.serializeProject(p).indexOf('"overrides"') === -1, 'empty overrides should not serialize');
      });
      s.test('a non-applicable device override is pruned on load with a warning', function () {
        var p = sampleProject();
        p.deviceConfigs[0].overrides = { 'selftest.a': { k1: { action: 'x' }, zzz: { action: 'y' } } }; // zzz not in snapshot keys
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assertEqual(r.ok, true);
        var ov = r.value.deviceConfigs.filter(function (c) { return c.id === 'tab-active-5'; })[0].overrides;
        T.assert(ov['selftest.a'].k1 && !('zzz' in ov['selftest.a']), 'non-applicable override not pruned');
        T.assert(r.issues.some(function (i) { return i.severity === 'warning' && /zzz.*not applicable/.test(i.message); }), 'no prune warning');
      });
      s.test('a baseId in two groups is removed from one, with a warning', function () {
        var p = sampleProject();
        p.groups = [
          { id: 'g1', name: 'G1', deviceBaseIds: ['tab-active-5'], overrides: {} },
          { id: 'g2', name: 'G2', deviceBaseIds: ['tab-active-5', 's23'], overrides: {} }
        ];
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assertEqual(r.ok, true);
        var g1 = r.value.groups.filter(function (g) { return g.id === 'g1'; })[0];
        var g2 = r.value.groups.filter(function (g) { return g.id === 'g2'; })[0];
        var inG1 = g1.deviceBaseIds.indexOf('tab-active-5') !== -1;
        var inG2 = g2.deviceBaseIds.indexOf('tab-active-5') !== -1;
        T.assert(inG1 !== inG2, 'tab-active-5 must be in exactly one group after prune');
        T.assert(r.issues.some(function (i) { return i.severity === 'warning' && /already in another group/.test(i.message); }), 'no single-group warning');
      });
      s.test('serialization deterministic across two calls (groups + overrides)', function () {
        var p = v3Sample();
        T.assertEqual(App.projectIo.serializeProject(p), App.projectIo.serializeProject(v3Sample()));
      });
    });

    T.suite('T10.2 App.overrides resolver', function (s) {
      // tab-active-5: selftest.a default k1={action:keep}; group 'rugged' override
      // k1={action:disable}; device override k1={action:remove}. k2 has no overrides.
      function proj(opts) {
        opts = opts || {};
        var p = sampleProject();
        p.groups = [{ id: 'rugged', name: 'Rugged', deviceBaseIds: ['tab-active-5'], overrides: {} }];
        if (opts.group) p.groups[0].overrides = { 'selftest.a': { k1: opts.group } };
        if (opts.device) p.deviceConfigs[0].overrides = { 'selftest.a': { k1: opts.device } };
        return p;
      }
      function k1(p) { return p.items['selftest.a'].filter(function (it) { return it.key === 'k1'; })[0]; }
      // NB: resolve App.overrides INSIDE each test — this suite is registered before
      // the overrides module loads, so capturing it at registration would be undefined.

      s.test('groupForDevice resolves by baseId', function () {
        var O = App.overrides;
        var p = proj();
        T.assertEqual(O.groupForDevice(p, 'tab-active-5').id, 'rugged');
        T.assertEqual(O.groupForDevice(p, 's23'), null);
      });
      s.test('precedence device > group > default', function () {
        var O = App.overrides;
        var p = proj({ group: { action: 'disable' }, device: { action: 'remove' } });
        var e = O.effectiveDecision(p, 'selftest.a', k1(p), 'tab-active-5');
        T.assertDeepEqual(e.decision, { action: 'remove' }); T.assertEqual(e.source, 'device');
        // drop the device override -> group wins
        delete p.deviceConfigs[0].overrides;
        var g = O.effectiveDecision(p, 'selftest.a', k1(p), 'tab-active-5');
        T.assertDeepEqual(g.decision, { action: 'disable' }); T.assertEqual(g.source, 'group');
        // drop the group override -> default wins
        p.groups[0].overrides = {};
        var d = O.effectiveDecision(p, 'selftest.a', k1(p), 'tab-active-5');
        T.assertDeepEqual(d.decision, { action: 'keep' }); T.assertEqual(d.source, 'default');
      });
      s.test('effectiveItem replaces decision; adapters stay override-blind', function () {
        var O = App.overrides;
        var p = proj({ device: { action: 'remove' } });
        var ei = O.effectiveItem(p, 'selftest.a', k1(p), 'tab-active-5');
        T.assertDeepEqual(ei.decision, { action: 'remove' });
        T.assertEqual(ei.key, 'k1', 'other fields preserved');
      });
      s.test('classify is value-based (a device override equal to group is NOT device)', function () {
        var O = App.overrides;
        var p = proj({ group: { action: 'disable' }, device: { action: 'remove' } });
        T.assertEqual(O.classify(p, 'selftest.a', k1(p), 'tab-active-5'), 'device');
        // device override equal to the group value => classify group (value comparison, OVR-8)
        p.deviceConfigs[0].overrides = { 'selftest.a': { k1: { action: 'disable' } } };
        T.assertEqual(O.classify(p, 'selftest.a', k1(p), 'tab-active-5'), 'group');
        // group-only override => group
        delete p.deviceConfigs[0].overrides;
        T.assertEqual(O.classify(p, 'selftest.a', k1(p), 'tab-active-5'), 'group');
        // no overrides => default
        p.groups[0].overrides = {};
        T.assertEqual(O.classify(p, 'selftest.a', k1(p), 'tab-active-5'), 'default');
      });
      s.test('deviceDeviations lists diverging applicable items with all three layers', function () {
        var O = App.overrides;
        var p = proj({ group: { action: 'disable' }, device: { action: 'remove' } });
        var devs = O.deviceDeviations(p, 'tab-active-5');
        T.assertEqual(devs.length, 1);
        T.assertEqual(devs[0].key, 'k1'); T.assertEqual(devs[0].source, 'device');
        T.assertDeepEqual(devs[0].defaultValue, { action: 'keep' });
        T.assertDeepEqual(devs[0].groupValue, { action: 'disable' });
        T.assertDeepEqual(devs[0].deviceValue, { action: 'remove' });
      });
      s.test('groupDeviations lists group overrides that differ from default', function () {
        var O = App.overrides;
        var p = proj({ group: { action: 'disable' } });
        var gd = O.groupDeviations(p, 'rugged');
        T.assertEqual(gd.length, 1);
        T.assertEqual(gd[0].key, 'k1'); T.assertEqual(gd[0].source, 'group');
        T.assertDeepEqual(gd[0].groupValue, { action: 'disable' });
      });
    });

    T.suite('store basics', function (s) {
      s.test('empty() seeds an item array per dataset', function () {
        ensureST();
        var p = App.store.empty(ST_PLATFORM_ID);
        T.assertDeepEqual(Object.keys(p.items).sort(), DS.slice().sort());
        T.assertEqual(p.deviceConfigs.length, 0);
      });
      s.test('init + getProject returns a deep clone (no external mutation)', function () {
        App.store.init(sampleProject());
        var a = App.store.getProject();
        a.items['selftest.a'][0].key = 'HACKED';
        var b = App.store.getProject();
        T.assertEqual(b.items['selftest.a'][0].key, 'k1', 'external mutation leaked into store');
      });
      s.test('onChange fires on init and unsubscribe works', function () {
        var count = 0;
        var off = App.store.onChange(function () { count++; });
        App.store.init(sampleProject());
        T.assertEqual(count, 1);
        off();
        App.store.init(sampleProject());
        T.assertEqual(count, 1, 'handler fired after unsubscribe');
      });
      s.test('_commit bumps modifiedUtc and marks dirty', function () {
        App.util.clock.setClock(function () { return new Date('2030-05-05T05:05:05.000Z'); });
        App.store.init(sampleProject());
        App.store._commit(function (p) { p.items['selftest.a'][1].description = 'edited'; });
        T.assertEqual(App.store.getProject().meta.modifiedUtc, '2030-05-05T05:05:05.000Z');
        T.assertEqual(App.store.isDirty(), true);
        App.util.clock.resetClock();
      });
    });

  })(App);
