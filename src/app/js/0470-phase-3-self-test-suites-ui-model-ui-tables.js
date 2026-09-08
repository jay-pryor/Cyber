  (function (App) {
    'use strict';
    var T = App.test;

    // Lazily ensure android-adb is registered (inside tests only — see D-007).
    function ensureAndroid() { if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb); }

    var ISO = '2026-01-01T00:00:00.000Z';
    function sha(x) { return App.util.hash.sha256Hex(x); }
    function androidSample() {
      ensureAndroid();
      return {
        schemaVersion: 1, platformProfileId: 'android-adb',
        meta: { createdUtc: ISO, modifiedUtc: ISO, appVersion: '1.0' },
        deviceConfigs: [
          { id: 'tab', baseId: 'tab', version: 1, supersedesId: null, name: 'Tab', model: 'M1', firmware: 'F1', onboardedUtc: ISO,
            snapshots: {
              'android.packages': { capturedUtc: ISO, sourceFilename: 'p', sha256: sha('p1'), keys: ['com.a', 'com.b'] },
              'android.tactical': { capturedUtc: ISO, sourceFilename: 't', sha256: sha('t1'), keys: ['enabled'], template: { enabled: true } }
            } },
          { id: 's23', baseId: 's23', version: 1, supersedesId: null, name: 'S23', model: 'M2', firmware: 'F2', onboardedUtc: ISO,
            snapshots: {
              'android.packages': { capturedUtc: ISO, sourceFilename: 'p', sha256: sha('p2'), keys: ['com.a', 'com.c'] },
              'android.tactical': { capturedUtc: ISO, sourceFilename: 't', sha256: sha('t2'), keys: ['enabled'], template: { enabled: true } }
            } }
        ],
        items: {
          'android.packages': [
            { key: 'com.a', description: 'alpha', decision: { action: 'keep' }, controlRefs: ['ISM-1'], status: 'decided' },
            { key: 'com.b', description: 'beta', decision: null, controlRefs: [], status: 'undecided' },
            { key: 'com.c', description: 'gamma', decision: { action: 'remove' }, controlRefs: [], status: 'decided' }
          ],
          'android.tactical': [{ key: 'enabled', decision: { value: true, type: 'bool' }, controlRefs: [], status: 'decided' }]
        }
      };
    }

    T.suite('ui.model', function (s) {
      s.test('getLatestConfigs excludes superseded', function () {
        var p = androidSample();
        p.deviceConfigs.push({ id: 'tab-v2', baseId: 'tab', version: 2, supersedesId: 'tab', name: 'Tab', model: 'M1', firmware: 'F2', onboardedUtc: ISO, snapshots: p.deviceConfigs[0].snapshots });
        var latest = App.ui.model.getLatestConfigs(p).map(function (c) { return c.id; }).sort();
        T.assertDeepEqual(latest, ['s23', 'tab-v2']);
      });
      s.test('computeAppliesTo maps keys to device names', function () {
        var m = App.ui.model.computeAppliesTo(androidSample(), 'android.packages');
        T.assertDeepEqual(m['com.a'].sort(), ['S23', 'Tab']);
        T.assertDeepEqual(m['com.b'], ['Tab']);
        T.assertDeepEqual(m['com.c'], ['S23']);
      });
      s.test('countIncomplete counts not-decided', function () {
        T.assertEqual(App.ui.model.countIncomplete(androidSample(), 'android.packages'), 1);
      });
      s.test('filterSortRows: search filters by key/description', function () {
        var p = androidSample(), a = App.registry.getDataset('android-adb', 'android.packages');
        var rows = App.ui.model.filterSortRows(p, 'android.packages', a, { search: 'beta' });
        T.assertEqual(rows.length, 1);
        T.assertEqual(rows[0].item.key, 'com.b');
      });
      s.test('filterSortRows: incompleteOnly hides decided', function () {
        var p = androidSample(), a = App.registry.getDataset('android-adb', 'android.packages');
        var rows = App.ui.model.filterSortRows(p, 'android.packages', a, { incompleteOnly: true });
        T.assertEqual(rows.length, 1);
        T.assertEqual(rows[0].item.key, 'com.b');
      });
      s.test('filterSortRows: sort desc by key', function () {
        var p = androidSample(), a = App.registry.getDataset('android-adb', 'android.packages');
        var rows = App.ui.model.filterSortRows(p, 'android.packages', a, { sortKey: 'key', sortDir: 'desc' });
        T.assertDeepEqual(rows.map(function (r) { return r.item.key; }), ['com.c', 'com.b', 'com.a']);
      });
    });

    T.suite('ui.tables render', function (s) {
      s.test('renders one row per item with applies-to and status', function () {
        var p = androidSample();
        var html = App.ui.tables.renderTableHtml(p, 'android.packages', { sortKey: 'key', sortDir: 'asc' });
        T.assert(/com\.a/.test(html) && /com\.b/.test(html) && /com\.c/.test(html));
        T.assert(/badge undecided/.test(html), 'no undecided badge');
        T.assert(/badge decided/.test(html), 'no decided badge');
        T.assert(/Applies to/.test(html) && /Status/.test(html));
      });
      s.test('undecided row gets the flag class', function () {
        var html = App.ui.tables.renderTableHtml(androidSample(), 'android.packages', {});
        T.assert(/<tr class="undecided">/.test(html));
      });
      s.test('cells are HTML-escaped', function () {
        var p = androidSample();
        p.items['android.packages'][0].description = '<script>x</' + 'script>';
        var html = App.ui.tables.renderTableHtml(p, 'android.packages', {});
        T.assert(html.indexOf('<script>x') === -1, 'unescaped HTML leaked');
        T.assert(html.indexOf('&lt;script&gt;') !== -1, 'expected escaped form');
      });
      s.test('large dataset (1500 rows) renders without error', function () {
        var p = androidSample();
        var big = [];
        for (var i = 0; i < 1500; i++) big.push({ key: 'pkg.' + ('0000' + i).slice(-4), decision: null, controlRefs: [], status: 'undecided' });
        p.items['android.packages'] = big;
        var html = App.ui.tables.renderTableHtml(p, 'android.packages', {});
        T.assert(html.length > 1000);
        // Count body rows only — the header row carries no class, and FIL-1 adds a
        // `filter-row` beneath it, so match the row class the body actually uses.
        T.assertEqual((html.match(/<tr class="undecided"/g) || []).length, 1500);
        T.assertEqual((html.match(/<tr class="filter-row"/g) || []).length, 1, 'exactly one filter row');
      });
    });

  })(App);
