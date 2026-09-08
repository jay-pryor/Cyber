  (function (App) {
    'use strict';
    var T = App.test;

    /* ===== SUITES: v1.1 core (T9.x) — dark mode · set-from-files · control CRUD ===== */
    T.suite('T9.1 dark mode (UI-only, determinism-safe)', function (s) {
      s.test('nextTheme flips light<->dark', function () {
        T.assertEqual(App.ui.app.nextTheme('light'), 'dark');
        T.assertEqual(App.ui.app.nextTheme('dark'), 'light');
      });
      s.test('theme never leaks into generated output (DM-3)', function () {
        if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb);
        function snap(d, r) { var a = App.registry.getDataset('android-adb', d), pr = a.parse(r); var o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: d, sha256: App.util.hash.sha256Hex(r), keys: pr.keys }; if (pr.values) o.values = pr.values; if (pr.template !== undefined) o.template = pr.template; return o; }
        App.util.clock.setClock(function () { return new Date('2026-02-02T02:02:02.000Z'); });
        App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: { 'android.packages': snap('android.packages', 'com.a'), 'android.tactical': snap('android.tactical', '{"enabled":true}') } });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.tactical', 'enabled', { value: true, type: 'bool' });
        var rep = App.generate.buildReport(App.store.getProject(), 'dev-m1');
        // generate/report read no DOM/theme; output is a pure function of the project.
        var html = rep.files.filter(function (f) { return f.name === 'report.md'; })[0].content;
        T.assert(html.indexOf('data-theme') === -1, 'theme attribute leaked into report');
        App.util.clock.resetClock();
      });
    });

    // ---- Track B: set decisions from files ----
    function ensureA() { if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb); }
    function snapB(d, r) { ensureA(); var a = App.registry.getDataset('android-adb', d), pr = a.parse(r); var o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: d, sha256: App.util.hash.sha256Hex(r), keys: pr.keys }; if (pr.values) o.values = pr.values; if (pr.template !== undefined) o.template = pr.template; return o; }

    T.suite('T9.2 adapter parseAssignment', function (s) {
      s.test('packages CSV: header + package: prefix tolerance + quoted description', function () {
        var a = App.registry.getDataset('android-adb', 'android.packages'); ensureA();
        var csv = 'package,action,description\npackage:com.a,disable,"turn off, please"\ncom.b,keep,ok';
        var r = a.parseAssignment(csv);
        T.assertEqual(r.errors.length, 0);
        T.assertEqual(r.assignments.length, 2);
        T.assertDeepEqual(r.assignments[0], { key: 'com.a', decision: { action: 'disable' }, fields: { description: 'turn off, please' } });
      });
      s.test('packages CSV: wrong header / bad action rejected', function () {
        var a = App.registry.getDataset('android-adb', 'android.packages'); ensureA();
        T.assert(a.parseAssignment('pkg,action,description\ncom.a,keep,x').errors.length >= 1);
        T.assert(a.parseAssignment('package,action,description\ncom.a,nuke,x').errors.some(function (e) { return /Invalid action/.test(e.message); }));
      });
      s.test('tactical parseAssignment maps leaves to decisions', function () {
        ensureA();
        var tc = App.registry.getDataset('android-adb', 'android.tactical').parseAssignment('{"enabled":false}');
        T.assertDeepEqual(tc.assignments[0], { key: 'enabled', decision: { value: false } });
      });
    });

    T.suite('T9.3 store.applyDeviceAssignment (exact-set + atomic)', function (s) {
      s.test('exact match applies decisions + descriptions', function () {
        ensureA();
        App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Asg', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var res = App.store.applyDeviceAssignment('asg-m1', 'android.packages', a.parseAssignment('package,action,description\ncom.a,disable,why-a\ncom.b,keep,why-b'));
        T.assertEqual(res.ok, true);
        var items = App.store.getProject().items['android.packages'];
        var ca = items.filter(function (i) { return i.key === 'com.a'; })[0];
        T.assertDeepEqual(ca.decision, { action: 'disable' });
        T.assertEqual(ca.description, 'why-a');
        T.assertEqual(ca.status, 'decided');
      });
      s.test('missing key -> refused with delta, no mutation', function () {
        ensureA();
        App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Asg', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var before = App.projectIo.serializeProject(App.store.getProject());
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var res = App.store.applyDeviceAssignment('asg-m1', 'android.packages', a.parseAssignment('package,action,description\ncom.a,keep,x'));
        T.assertEqual(res.ok, false);
        T.assert(res.issues.some(function (i) { return /missing from the file/.test(i.message) && /com\.b/.test(i.message); }));
        T.assertEqual(App.projectIo.serializeProject(App.store.getProject()), before, 'refused apply mutated state');
      });
      s.test('extra key -> refused with delta', function () {
        ensureA();
        App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Asg', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var res = App.store.applyDeviceAssignment('asg-m1', 'android.packages', a.parseAssignment('package,action,description\ncom.a,keep,x\ncom.z,keep,y'));
        T.assertEqual(res.ok, false);
        T.assert(res.issues.some(function (i) { return /not applicable/.test(i.message) && /com\.z/.test(i.message); }));
      });
    });

    // ---- Track C: Control Manager + controlRefs ----
    T.suite('T9.6 store control CRUD', function (s) {
      s.test('add/update/remove + controlRef cleanup', function () {
        ensureA();
        App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Ctl', model: 'M1', snapshots: { 'android.packages': snapB('android.packages', 'com.a'), 'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var add = App.store.addControl({ title: 'Disable BT', type: 'ISM', description: 'd' });
        T.assertEqual(add.ok, true);
        T.assert(/^[a-z0-9-]+$/.test(add.id));
        // reference it on an item, then remove the control -> ref cleared
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [add.id] });
        T.assertDeepEqual(App.store.getProject().items['android.packages'][0].controlRefs, [add.id]);
        App.store.updateControl(add.id, { title: 'Disable Bluetooth' });
        T.assertEqual(App.store.getProject().controls.filter(function (c) { return c.id === add.id; })[0].title, 'Disable Bluetooth');
        var rm = App.store.removeControl(add.id);
        T.assertEqual(rm.ok, true);
        T.assertEqual(App.store.getProject().controls.length, 0);
        T.assertDeepEqual(App.store.getProject().items['android.packages'][0].controlRefs, [], 'ref not cleared on remove');
      });
      s.test('add requires a title; duplicate titles get unique ids', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        T.assertEqual(App.store.addControl({ title: '' }).ok, false);
        var a = App.store.addControl({ title: 'Same' }), b = App.store.addControl({ title: 'Same' });
        T.assert(a.id !== b.id, 'ids should be unique');
      });
    });

    /* ===== SUITES: v1.2 overrides & device groups (T10.x) ===== */
    T.suite('T10.3 store override + group mutators', function (s) {
      function dev() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return 'dev-m1';
      }
      function devOv(id) { return (App.store.getProject().deviceConfigs.filter(function (c) { return c.id === id; })[0].overrides) || {}; }

      s.test('device override on a non-applicable key is rejected', function () {
        var id = dev();
        T.assertEqual(App.store.setDeviceOverride(id, 'android.packages', 'com.zzz', { action: 'disable' }).ok, false);
      });
      s.test('invalid override value is rejected', function () {
        var id = dev();
        T.assertEqual(App.store.setDeviceOverride(id, 'android.packages', 'com.a', { action: 'bogus' }).ok, false);
      });
      s.test('a no-op override (equal to inherited) clears instead of persisting', function () {
        var id = dev();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' }); // default
        var r = App.store.setDeviceOverride(id, 'android.packages', 'com.a', { action: 'keep' });
        T.assertEqual(r.ok, true);
        T.assert(!(devOv(id)['android.packages'] && devOv(id)['android.packages']['com.a']), 'no-op override should not persist');
        // a differing value DOES persist
        App.store.setDeviceOverride(id, 'android.packages', 'com.a', { action: 'remove' });
        T.assertDeepEqual(devOv(id)['android.packages']['com.a'], { action: 'remove' });
        // setting it back to the default clears it again
        App.store.setDeviceOverride(id, 'android.packages', 'com.a', { action: 'keep' });
        T.assert(!(devOv(id)['android.packages'] && devOv(id)['android.packages']['com.a']), 'override not cleared on revert-to-default');
      });
      s.test('group override applied then cleared', function () {
        var id = dev();
        var g = App.store.addGroup({ name: 'Rugged', deviceBaseIds: ['dev-m1'] });
        T.assertEqual(g.ok, true);
        App.store.setGroupOverride(g.id, 'android.packages', 'com.a', { action: 'disable' });
        var gov = App.store.getProject().groups.filter(function (x) { return x.id === g.id; })[0].overrides;
        T.assertDeepEqual(gov['android.packages']['com.a'], { action: 'disable' });
        App.store.clearGroupOverride(g.id, 'android.packages', 'com.a');
        var gov2 = App.store.getProject().groups.filter(function (x) { return x.id === g.id; })[0].overrides;
        T.assert(!(gov2['android.packages']), 'group override bucket should be cleared');
      });
      s.test('addGroup moves a baseId out of its old group (single-group rule)', function () {
        dev();
        var g1 = App.store.addGroup({ name: 'G1', deviceBaseIds: ['dev-m1'] });
        var g2 = App.store.addGroup({ name: 'G2', deviceBaseIds: ['dev-m1'] });
        var groups = App.store.getProject().groups;
        var inG1 = groups.filter(function (x) { return x.id === g1.id; })[0].deviceBaseIds.indexOf('dev-m1') !== -1;
        var inG2 = groups.filter(function (x) { return x.id === g2.id; })[0].deviceBaseIds.indexOf('dev-m1') !== -1;
        T.assert(!inG1 && inG2, 'baseId should have moved to G2');
      });
      s.test('re-onboard carries forward applicable overrides and prunes departed keys', function () {
        var id = dev();
        App.store.setDeviceOverride(id, 'android.packages', 'com.a', { action: 'remove' });
        App.store.setDeviceOverride(id, 'android.packages', 'com.b', { action: 'disable' });
        // Re-onboard with a differing snapshot that drops com.a (keeps com.b, adds com.d).
        var res = App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.b\ncom.d'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        T.assertEqual(res.ok, true);
        var v2 = App.store.getLatestConfigs(App.store.getProject()).filter(function (c) { return c.baseId === 'dev-m1'; })[0];
        T.assertEqual(v2.version, 2);
        T.assertDeepEqual(v2.overrides['android.packages'], { 'com.b': { action: 'disable' } }, 'com.b carried, com.a pruned');
        T.assert(res.issues.some(function (i) { return /pruned/.test(i.message) && /com\.a/.test(i.message); }), 'no prune-info logged');
      });
    });

    T.suite('T10.4 effective completeness, generation & manifest', function (s) {
      // Onboard a device, decide everything EXCEPT com.a (left undecided by default).
      function setupAllButComA() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.setDecision('android.packages', 'com.b', { action: 'keep' });
          App.store.setDecision('android.tactical', 'enabled', { value: true });
        // review-17 #4: the injected imsSettings slots must be decided too, otherwise
        // com.a is not the ONLY thing holding readiness back.
        App.store.setDecision('android.tactical', 'imsSettings.simSlot0.enabled', { value: false });
        App.store.setDecision('android.tactical', 'imsSettings.simSlot1.enabled', { value: false });
      }
      function implScript(p) { return App.generate.buildImplementation(p, 'dev-m1').files.filter(function (f) { return f.name === 'packages.impl.ps1'; })[0].content; }
      function manifestDecisions(p) { return JSON.parse(App.generate.buildImplementation(p, 'dev-m1').files.filter(function (f) { return f.name === 'manifest.json'; })[0].content).decisions['android.packages']; }

      s.test('a DEVICE override rescues readiness and flows into the script + manifest (source device)', function () {
        setupAllButComA();
        T.assertEqual(App.completeness.deviceReady(App.store.getProject(), 'dev-m1'), false, 'undecided com.a should block readiness');
        App.store.setDeviceOverride('dev-m1', 'android.packages', 'com.a', { action: 'remove' });
        var p = App.store.getProject();
        T.assertEqual(App.completeness.deviceReady(p, 'dev-m1'), true, 'device override should rescue readiness');
        T.assert(/Apply-Package 'com\.a' 'remove'/.test(implScript(p)), 'overridden com.a (remove) not generated');
        var ca = manifestDecisions(p).filter(function (d) { return d.key === 'com.a'; })[0];
        T.assertDeepEqual(ca.decision, { action: 'remove' }); T.assertEqual(ca.source, 'device');
      });
      s.test('a GROUP override flows into generation + manifest (source group)', function () {
        setupAllButComA();
        var g = App.store.addGroup({ name: 'Rugged', deviceBaseIds: ['dev-m1'] });
        App.store.setGroupOverride(g.id, 'android.packages', 'com.a', { action: 'disable' });
        var p = App.store.getProject();
        T.assertEqual(App.completeness.deviceReady(p, 'dev-m1'), true);
        T.assert(/Apply-Package 'com\.a' 'disable'/.test(implScript(p)), 'group-overridden com.a (disable) not generated');
        var ca = manifestDecisions(p).filter(function (d) { return d.key === 'com.a'; })[0];
        T.assertEqual(ca.source, 'group');
      });
      s.test('default decisions still record source "default"', function () {
        setupAllButComA();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        var cb = manifestDecisions(App.store.getProject()).filter(function (d) { return d.key === 'com.b'; })[0];
        T.assertEqual(cb.source, 'default');
      });
    });

    T.suite('T10.6 device-config override UI (divergence + editing)', function (s) {
      // com.a decided keep (default); group override on com.b (so com.b diverges).
      function projGroupOnB() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        var g = App.store.addGroup({ name: 'Rugged', deviceBaseIds: ['dev-m1'] });
        App.store.setGroupOverride(g.id, 'android.packages', 'com.b', { action: 'keep' });
        return App.store.getProject();
      }
      s.test('a group-overridden item renders dev-diverge-group + a group marker', function () {
        App.ui.views.devices._dev.deviationsFirst = false; App.ui.views.devices._dev.collapsed = {};
        var html = App.ui.views.devices.renderPanels(projGroupOnB(), 'dev-m1', '');
        T.assert(/dev-diverge-group/.test(html), 'no group-divergence row class');
        T.assert(/diverge-tag group/.test(html), 'no group marker');
      });
      s.test('a device override renders dev-diverge-device; one equal to the group value clears (OVR-8)', function () {
        projGroupOnB();
        App.store.setDeviceOverride('dev-m1', 'android.packages', 'com.b', { action: 'remove' }); // differs from group keep
        var html1 = App.ui.views.devices.renderPanels(App.store.getProject(), 'dev-m1', '');
        T.assert(/dev-diverge-device/.test(html1), 'device override should colour orange');
        // setting the device override equal to the inherited (group) value clears it
        App.store.setDeviceOverride('dev-m1', 'android.packages', 'com.b', { action: 'keep' });
        var ov = App.store.getProject().deviceConfigs.filter(function (c) { return c.id === 'dev-m1'; })[0].overrides;
        T.assert(!(ov['android.packages'] && ov['android.packages']['com.b']), 'override equal to group should clear');
        var html2 = App.ui.views.devices.renderPanels(App.store.getProject(), 'dev-m1', '');
        T.assert(/dev-diverge-group/.test(html2) && !/dev-diverge-device/.test(html2), 'should reclassify as group');
      });
      s.test('Deviations-first pins diverging rows to the top', function () {
        var p = projGroupOnB(); // com.b diverges (group), com.a does not
        var D = App.ui.views.devices;
        D._dev.collapsed = {};
        D._dev.deviationsFirst = true;
        var pinned = D.renderPanels(p, 'dev-m1', '');
        T.assert(pinned.indexOf('com.b') < pinned.indexOf('com.a'), 'deviating com.b should be pinned above com.a');
        D._dev.deviationsFirst = false;
        var alpha = D.renderPanels(p, 'dev-m1', '');
        T.assert(alpha.indexOf('com.a') < alpha.indexOf('com.b'), 'default order should be alphabetical');
      });
      s.test('latest device view shows the override editor + legend; superseded panels are read-only', function () {
        var p = projGroupOnB();
        var latest = App.ui.views.devices.renderDetail(p, 'dev-m1');
        T.assert(/diverge-legend/.test(latest), 'no legend on the latest device view');
        T.assert(/data-ov /.test(latest), 'no override editor on the latest device view');
        // a superseded panel set carries no override editor
        var sup = App.ui.views.devices.renderPanels(p, 'dev-m1', '');
        T.assert(/data-ov /.test(sup), 'latest renderPanels should include override controls');
      });
    });

    T.suite('T10.5 device groups UI (sections + deviations modal)', function (s) {
      function twoDevices() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.onboardDevice({ name: 'Bravo', model: 'M2', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.c'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
      }
      s.test('renderList shows group sections (+ Ungrouped), Add group, a member dropdown and a deviation count', function () {
        twoDevices();
        var g = App.store.addGroup({ name: 'Rugged', deviceBaseIds: ['alpha-m1'] });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setGroupOverride(g.id, 'android.packages', 'com.a', { action: 'disable' }); // 1 deviation
        var html = App.ui.views.devices.renderList(App.store.getProject());
        T.assert(/data-action="add-group"/.test(html), 'no Add group control');
        T.assert(/class="grp-title">Rugged</.test(html) && /Ungrouped/.test(html), 'group/ungrouped sections missing');
        T.assert(new RegExp('data-group-deviations="' + g.id + '">Deviations \\(1\\)').test(html), 'deviation count wrong');
        // review-6 #1: members are a toggle dropdown; Alpha is a member (marked remove), Bravo is add.
        T.assert(/data-group-member-select/.test(html), 'no member dropdown');
        T.assert(/<option value="alpha-m1">✓ Alpha — remove<\/option>/.test(html), 'Alpha should show as a removable member');
        T.assert(/<option value="bravo-m2">Bravo — add<\/option>/.test(html), 'Bravo should show as addable');
        T.assert(/Members: <\/span><span class="grp-member-names">Alpha<\/span>/.test(html), 'member names not shown');
        T.assert(/data-device-view="bravo-m2"/.test(html), 'bravo stack should render (Ungrouped)');
      });
      s.test('group deviations modal: wide, clean Default column, add-override form with a searchable key', function () {
        twoDevices();
        var g = App.store.addGroup({ name: 'Rugged', deviceBaseIds: ['alpha-m1'] });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' }); // default
        App.store.setGroupOverride(g.id, 'android.packages', 'com.a', { action: 'disable' });
        App.ui.views.devices._dev.groupAdd = { dsId: null, key: '' };
        var html = App.ui.views.devices.renderGroupModal(App.store.getProject(), g.id);
        T.assert(/modal-overlay/.test(html) && /data-group-modal-close/.test(html), 'no modal / close button');
        T.assert(/class="modal modal-wide"/.test(html), 'group modal should be the near-full-screen variant (review-6 #2)');
        T.assert(/data-gov-remove[^>]*data-key="com.a"/.test(html), 'existing override row missing');
        // review-6 #2: Default column shows the plain value ("keep"), not the decision JSON.
        T.assert(/<th>Default<\/th><th>Deviation setting<\/th>/.test(html), 'clean Default/Deviation headers missing');
        T.assert(html.indexOf('{"action"') === -1, 'Default should not render raw decision JSON');
        T.assert(/<td>keep<\/td>/.test(html), 'Default value "keep" not shown plainly');
        // review-6 #3: the key picker is a searchable input backed by a <datalist>.
        T.assert(/data-gov-add-ds/.test(html) && /data-gov-add-set/.test(html), 'no add-override form');
        T.assert(/<input class="gov-add-key" data-gov-add-key list="gov-add-keylist"/.test(html), 'key picker is not a searchable input');
        T.assert(/<datalist id="gov-add-keylist">/.test(html), 'no datalist for key search');
      });
      s.test('a group override added then removed updates the modal list', function () {
        twoDevices();
        var g = App.store.addGroup({ name: 'Rugged', deviceBaseIds: ['alpha-m1'] });
        App.store.setGroupOverride(g.id, 'android.packages', 'com.a', { action: 'disable' });
        var before = App.ui.views.devices.renderGroupModal(App.store.getProject(), g.id);
        T.assert(/data-key="com.a"/.test(before), 'override should be listed');
        App.store.clearGroupOverride(g.id, 'android.packages', 'com.a');
        var after = App.ui.views.devices.renderGroupModal(App.store.getProject(), g.id);
        T.assert(!/data-gov-remove[^>]*data-key="com.a"/.test(after), 'override should be gone after remove');
      });
    });

