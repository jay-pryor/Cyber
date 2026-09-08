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
    function setup() {
      ensureAndroid();
      App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'Tab', model: 'M1', firmware: 'F1', snapshots: {
        'android.packages': snap('android.packages', 'com.a\ncom.b'),
        'android.tactical': snap('android.tactical', '{"enabled":true}') } });
      App.store.onboardDevice({ name: 'S23', model: 'M2', firmware: 'F2', snapshots: {
        'android.packages': snap('android.packages', 'com.a\ncom.c'),
        'android.tactical': snap('android.tactical', '{"enabled":true}') } });
      // Decide com.a (applicable to both) and com.c (applicable to S23 only). Leave com.b undecided.
      App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
      App.store.setDecision('android.packages', 'com.c', { action: 'remove' });
      return App.store.getProject();
    }

    T.suite('ui.views.devices list', function (s) {
      s.test('lists each device with model/version, counts and a View button', function () {
        var p = setup();
        var html = App.ui.views.devices.renderList(p);
        T.assert(/Tab</.test(html) && /S23</.test(html));
        T.assert(/data-device-view="tab-m1"/.test(html) && /data-device-view="s23-m2"/.test(html));
        T.assert(/Packages 1\/2/.test(html), 'Tab packages count 1 decided of 2 applicable expected');
        T.assert(/v1/.test(html));
      });
      s.test('superseded versions are grouped and flagged', function () {
        setup();
        // Re-onboard Tab with a differing snapshot -> v2 supersedes v1.
        App.store.onboardDevice({ name: 'Tab', model: 'M1', firmware: 'F2', snapshots: {
          'android.packages': snap('android.packages', 'com.a\ncom.b\ncom.d'),
          'android.tactical': snap('android.tactical', '{"enabled":true}') } });
        var html = App.ui.views.devices.renderList(App.store.getProject());
        T.assert(/badge superseded/.test(html), 'no superseded badge');
        T.assert(/data-device-view="tab-m1-v2"/.test(html), 'v2 not listed');
      });
    });

    T.suite('ui.views.devices detail (DOD-9)', function (s) {
      s.test('panels list APPLICABLE items with effective decisions + an override editor (DOD-9 amended §19.5)', function () {
        var p = setup();
        var html = App.ui.views.devices.renderDetail(p, 'tab-m1');
        // one panel per dataset (Packages, Tactical, Custom Actions)
        T.assertEqual((html.match(/class="panel"/g) || []).length, 3);
        // Tab packages: both com.a (decided) and com.b (undecided) are APPLICABLE -> shown;
        // com.c is not applicable -> not shown.
        T.assert(html.indexOf('com.a') !== -1, 'applicable com.a should appear');
        T.assert(html.indexOf('com.b') !== -1, 'applicable com.b should now appear (panels list applicable items)');
        T.assert(html.indexOf('com.c') === -1, 'com.c (not applicable) must NOT appear');
        T.assert(/2 of 2 applicable/.test(html), 'packages note should count applicable items');
        T.assert(/data-ov-ds="android.packages"/.test(html), 'latest device view should expose an override editor');
      });
      s.test('effective decision value is displayed via the adapter column', function () {
        var p = setup();
        var html = App.ui.views.devices.renderDetail(p, 's23-m2');
        T.assert(/com\.c/.test(html) && /remove/.test(html), 'S23 should show com.c = remove');
      });
      s.test('superseded device detail shows the read-only banner', function () {
        setup();
        App.store.onboardDevice({ name: 'Tab', model: 'M1', firmware: 'F2', snapshots: {
          'android.packages': snap('android.packages', 'com.a\ncom.b\ncom.d'),
          'android.tactical': snap('android.tactical', '{"enabled":true}') } });
        var html = App.ui.views.devices.renderDetail(App.store.getProject(), 'tab-m1'); // v1, now superseded
        T.assert(/superseded-banner/.test(html));
      });
      s.test('missing device id falls back gracefully', function () {
        var p = setup();
        T.assert(/not found/i.test(App.ui.views.devices.renderDetail(p, 'no-such')));
      });
    });

    T.suite('review-5 #1 device panels collapsible + per-control view', function (s) {
      s.test('panels are collapsible and DROP the Control Refs column', function () {
        var p = setup();
        var html = App.ui.views.devices.renderPanels(p, 'tab-m1', '');
        T.assert(/data-panel-toggle="android.packages"/.test(html), 'no panel collapse toggle');
        T.assert(/aria-expanded="true"/.test(html), 'panel should default expanded');
        T.assert(html.indexOf('Control Refs') === -1, 'Control Refs column should be removed from the device panels');
        // review-8 #3: Key / Effective / Override headers (now resizable, data-dev-col).
        T.assert(/data-dev-col[^>]*>Key<span/.test(html) && /data-dev-col[^>]*>Effective<span/.test(html) && /data-dev-col[^>]*>Override<span/.test(html), 'panel table should be Key/Effective/Override (latest, §19.5)');
      });
      s.test('controls assigned to the device are listed, clickable, with a count', function () {
        setup();
        var ctlId = App.store.addControl({ title: 'No BT', type: 'ISM', assignedDeviceIds: ['tab-m1'] }).id;
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [ctlId] });
        var p = App.store.getProject();
        var html = App.ui.views.devices.renderDeviceControls(p, 'tab-m1');
        T.assert(new RegExp('data-control-open="' + ctlId + '"').test(html), 'control not listed as openable');
        T.assert(/No BT/.test(html), 'control title not shown');
        // com.a (applicable to tab-m1 + references the control) counts; com.b applicable but unref'd does not.
        T.assertEqual(App.ui.views.devices.countControlItems(p, 'tab-m1', ctlId), 1);
        T.assert(/1 item/.test(html), 'item count not shown on the control row');
      });
      s.test('a device with no assigned controls shows the empty note', function () {
        var p = setup();
        var html = App.ui.views.devices.renderDeviceControls(p, 'tab-m1');
        T.assert(/No controls are assigned/.test(html), 'expected the empty-controls note');
      });
      s.test('the control modal lists ONLY device-applicable items referencing the control', function () {
        setup();
        var ctlId = App.store.addControl({ title: 'No BT', type: 'ISM', assignedDeviceIds: ['tab-m1'] }).id;
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [ctlId] });
        var p = App.store.getProject();
        var html = App.ui.views.devices.renderControlModal(p, 'tab-m1', ctlId);
        T.assert(/modal-overlay/.test(html) && /data-control-modal/.test(html), 'no modal overlay');
        T.assert(/data-control-modal-close/.test(html), 'no close (×) button');
        T.assert(html.indexOf('com.a') !== -1, 'referencing applicable item should appear');
        T.assert(html.indexOf('com.b') === -1, 'a non-referencing applicable item must NOT appear');
        T.assertEqual((html.match(/class="panel"/g) || []).length, 3); // one list per dataset
      });
    });

  })(App);
