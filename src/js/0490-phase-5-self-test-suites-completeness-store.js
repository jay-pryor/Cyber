  (function (App) {
    'use strict';
    var T = App.test;
    function ensureAndroid() { if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb); }

    function snap(dsId, raw) {
      ensureAndroid();
      var a = App.registry.getDataset('android-adb', dsId), pr = a.parse(raw);
      var s = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: dsId, sha256: App.util.hash.sha256Hex(raw), keys: pr.keys };
      if (pr.values) s.values = pr.values; if (pr.template !== undefined) s.template = pr.template; return s;
    }
    function deviceProject() {
      ensureAndroid();
      App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F', snapshots: {
        'android.packages': snap('android.packages', 'com.a\ncom.b'),
        'android.tactical': snap('android.tactical', '{"enabled":true}')
      } });
      return 'dev-m1';
    }
    function decideAll() {
      App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
      App.store.setDecision('android.packages', 'com.b', { action: 'disable' });
      App.store.setDecision('android.tactical', 'enabled', { value: true, type: 'bool' });
      // review-17 #4: every tactical onboard also carries the two imsSettings slots.
      App.store.setDecision('android.tactical', 'imsSettings.simSlot0.enabled', { value: false, type: 'bool' });
      App.store.setDecision('android.tactical', 'imsSettings.simSlot1.enabled', { value: false, type: 'bool' });
    }

    T.suite('completeness', function (s) {
      s.test('itemComplete reflects adapter.isComplete', function () {
        var a = App.registry.getDataset('android-adb', 'android.packages');
        T.assertEqual(App.completeness.itemComplete(a, { key: 'x', decision: { action: 'keep' }, controlRefs: [] }), true);
        T.assertEqual(App.completeness.itemComplete(a, { key: 'x', decision: null, controlRefs: [] }), false);
      });
      s.test('REQUIRE_CONTROL_REF folds into completeness', function () {
        var a = App.registry.getDataset('android-adb', 'android.packages');
        App.completeness.REQUIRE_CONTROL_REF = true;
        T.assertEqual(App.completeness.itemComplete(a, { key: 'x', decision: { action: 'keep' }, controlRefs: [] }), false);
        T.assertEqual(App.completeness.itemComplete(a, { key: 'x', decision: { action: 'keep' }, controlRefs: ['ISM-1'] }), true);
        App.completeness.REQUIRE_CONTROL_REF = false; // restore
      });
      s.test('deviceReadiness: undecided -> not ready with reasons; decided -> ready', function () {
        var id = deviceProject();
        var r0 = App.completeness.deviceReadiness(App.store.getProject(), id);
        T.assertEqual(r0.ready, false);
        T.assert(r0.totalUndecided === 5, 'expected 5 undecided, got ' + r0.totalUndecided);
        T.assert(r0.reasons.length === 2, 'expected 2 dataset reasons');
        decideAll();
        var r1 = App.completeness.deviceReadiness(App.store.getProject(), id);
        T.assertEqual(r1.ready, true);
        T.assertEqual(App.completeness.deviceReady(App.store.getProject(), id), true);
      });
    });

    T.suite('store.setDecision / setItemFields', function (s) {
      s.test('valid decision commits and flips status to decided', function () {
        deviceProject();
        var res = App.store.setDecision('android.packages', 'com.a', { action: 'disable' });
        T.assertEqual(res.ok, true);
        var it = App.store.getProject().items['android.packages'].filter(function (i) { return i.key === 'com.a'; })[0];
        T.assertDeepEqual(it.decision, { action: 'disable' });
        T.assertEqual(it.status, 'decided');
      });
      s.test('invalid decision is stored but stays incomplete + returns issues', function () {
        deviceProject();
        // packages action is still a constrained enum, so an invalid action exercises this path.
        var res = App.store.setDecision('android.packages', 'com.a', { action: 'bogus' });
        T.assertEqual(res.ok, false);
        T.assert(res.issues.length >= 1);
        var it = App.store.getProject().items['android.packages'].filter(function (i) { return i.key === 'com.a'; })[0];
        T.assertDeepEqual(it.decision, { action: 'bogus' }, 'value should still be stored (no silent drop)');
        T.assertEqual(it.status, 'undecided');
      });
      s.test('clearing a decision (null) returns to undecided', function () {
        deviceProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.packages', 'com.a', null);
        var it = App.store.getProject().items['android.packages'].filter(function (i) { return i.key === 'com.a'; })[0];
        T.assertEqual(it.decision, null);
        T.assertEqual(it.status, 'undecided');
      });
      s.test('unknown item -> located error', function () {
        deviceProject();
        T.assertEqual(App.store.setDecision('android.packages', 'no.such', { action: 'keep' }).ok, false);
      });
      s.test('setItemFields updates description/controlRefs/rationale/rollback', function () {
        deviceProject();
        App.store.setItemFields('android.packages', 'com.a', { description: 'desc', controlRefs: ['ISM-9'], rationale: 'why', rollback: 'undo' });
        var it = App.store.getProject().items['android.packages'].filter(function (i) { return i.key === 'com.a'; })[0];
        T.assertEqual(it.description, 'desc');
        T.assertDeepEqual(it.controlRefs, ['ISM-9']);
        T.assertEqual(it.rationale, 'why');
        T.assertEqual(it.rollback, 'undo');
      });
    });

    T.suite('ui.tables decision editors (data-driven)', function (s) {
      s.test('packages renders an action <select> with the enum options', function () {
        deviceProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { sortKey: 'key' }, {});
        T.assert(/data-kind="enum"/.test(html));
        T.assert(/>keep</.test(html) && />disable</.test(html) && />remove</.test(html));
      });
      s.test('tactical renders value-typed input + type select', function () {
        deviceProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', { sortKey: 'key' }, {});
        T.assert(/data-kind="value-typed"/.test(html));
      });
      s.test('expander renders the detail editor form', function () {
        deviceProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { expanded: { 'com.a': true } }, {});
        T.assert(/detail-form/.test(html) && /data-field-edit="description"/.test(html) && /data-field-edit="rollback"/.test(html));
      });
      s.test('tactical prefills the value editor from the capture, typed by format (VF-8)', function () {
        deviceProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', { sortKey: 'key' }, {});
        // The captured leaf is a BOOLEAN, so the inferred format gives a true/false
        // picker rather than a free-text box, pre-selected from the capture.
        T.assert(/class="val-edit val-bool"/.test(html), 'a bool leaf should render a true/false picker');
        T.assert(/data-fmt-kind="bool"/.test(html), 'the editor must declare its format kind');
        T.assert(/<option value="true" selected>true<\/option>/.test(html), 'captured value not pre-selected');
      });
      s.test('invalid-decision cell is flagged when issues passed', function () {
        deviceProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', {}, { issues: { 'android.tactical|enabled': [{ severity: 'error', message: 'bad' }] } });
        T.assert(/dcell invalid/.test(html));
      });
    });

    T.suite('ui.views.generate gating', function (s) {
      s.test('not-ready device -> disabled buttons + reason', function () {
        deviceProject();
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-generate-action="implementation" disabled/.test(html));
        T.assert(/undecided/.test(html));
      });
      s.test('ready device -> enabled buttons', function () {
        deviceProject(); decideAll();
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-generate-action="implementation"[^>]*>Generate Implementation/.test(html));
        T.assert(!/data-generate-action="implementation" disabled/.test(html), 'should be enabled');
        T.assert(/Ready —/.test(html));
      });
    });

  })(App);
