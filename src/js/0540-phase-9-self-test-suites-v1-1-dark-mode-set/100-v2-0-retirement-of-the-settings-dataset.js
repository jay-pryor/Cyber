    /* ===== SUITES: v2.0 — retirement of the Settings dataset ===== */
    T.suite('v2.0 Settings retirement (legacy projects still load)', function (s) {
      var RETIRED = 'android.settings';

      /** A v1.x-shaped project text: valid apart from carrying the retired dataset. */
      function legacyText(extra) {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Legacy', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.setDecision('android.packages', 'com.a', { action: 'disable' });
        var p = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        // Splice the retired dataset back in, exactly as v1.x would have written it.
        p.items[RETIRED] = [
          { key: 'secure/x', decision: { value: '0' }, controlRefs: [], status: 'decided' },
          { key: 'secure/y', decision: null, controlRefs: [], status: 'undecided' }
        ];
        p.deviceConfigs[0].snapshots[RETIRED] = {
          capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: 'settings.txt',
          sha256: App.util.hash.sha256Hex('secure:\nx=0'), keys: ['secure/x', 'secure/y'],
          values: { 'secure/x': '0', 'secure/y': '1' }
        };
        p.deviceConfigs[0].overrides = p.deviceConfigs[0].overrides || {};
        p.deviceConfigs[0].overrides[RETIRED] = { 'secure/x': { value: '9' } };
        if (extra) extra(p);
        return JSON.stringify(p);
      }

      s.test('the dataset is gone from the registry and from the active platform', function () {
        ensureA();
        T.assertEqual(App.registry.getDataset('android-adb', RETIRED), null, 'the adapter must be unregistered');
        T.assert(App.registry.datasetIds('android-adb').indexOf(RETIRED) === -1, 'still listed as a platform dataset');
        T.assert(!App.adapters.android.settings, 'the adapter object must not be exported');
      });

      s.test('a legacy project still LOADS, and says loudly what it dropped', function () {
        var res = App.projectIo.parseProject(legacyText());
        T.assertEqual(res.ok, true, 'a v1.x project must still open: ' + JSON.stringify(res.issues));
        T.assert(!(RETIRED in res.value.items), 'retired items must be gone');
        T.assert(!(RETIRED in res.value.deviceConfigs[0].snapshots), 'retired snapshot must be gone');
        T.assert(!res.value.deviceConfigs[0].overrides || !(RETIRED in res.value.deviceConfigs[0].overrides), 'retired override must be gone');
        var w = res.issues.filter(function (i) { return i.location === RETIRED && i.severity === 'warning'; });
        T.assertEqual(w.length, 1, 'exactly one warning expected, got ' + JSON.stringify(res.issues));
        T.assert(/retired/i.test(w[0].message) && /2 register item/.test(w[0].message) && /1 captured/.test(w[0].message),
          'the warning must say what was dropped, got: ' + w[0].message);
      });

      s.test('everything else in the legacy project survives untouched', function () {
        var res = App.projectIo.parseProject(legacyText());
        T.assertEqual(res.value.deviceConfigs.length, 1);
        T.assertDeepEqual(res.value.items['android.packages'][0].decision, { action: 'disable' });
        T.assert(res.value.items['android.tactical'].length >= 1, 'tactical register lost');
        T.assertEqual(res.value.deviceConfigs[0].snapshots['android.packages'].keys.length, 1);
      });

      s.test('a group override on the retired dataset is dropped too', function () {
        var text = legacyText(function (p) {
          p.groups = [{ id: 'g1', name: 'G1', deviceBaseIds: ['legacy-m1'], overrides: { 'android.settings': { 'secure/x': { value: '3' } } } }];
        });
        var res = App.projectIo.parseProject(text);
        T.assertEqual(res.ok, true, JSON.stringify(res.issues));
        T.assert(!res.value.groups[0].overrides || !(RETIRED in res.value.groups[0].overrides), 'group override must be dropped');
      });

      s.test('a project with no retired data is a byte-for-byte no-op (no spurious warning)', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Clean', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var text = App.projectIo.serializeProject(App.store.getProject());
        var res = App.projectIo.parseProject(text);
        T.assertEqual(res.ok, true);
        T.assertEqual(res.issues.filter(function (i) { return i.location === RETIRED; }).length, 0, 'no warning without retired data');
        T.assertEqual(App.projectIo.serializeProject(res.value), text, 'a clean project must round-trip unchanged');
      });

      s.test('re-saving after the load makes the removal permanent', function () {
        var res = App.projectIo.parseProject(legacyText());
        var text2 = App.projectIo.serializeProject(res.value);
        T.assert(text2.indexOf(RETIRED) === -1, 'the retired id must not survive a re-save');
        var again = App.projectIo.parseProject(text2);
        T.assertEqual(again.ok, true);
        T.assertEqual(again.issues.filter(function (i) { return i.location === RETIRED; }).length, 0, 'the second load must be silent');
      });

      s.test('an UNKNOWN (not merely retired) dataset id is still a hard error', function () {
        var text = legacyText(function (p) {
          p.items['android.bogus'] = [{ key: 'k', decision: null, controlRefs: [], status: 'undecided' }];
        });
        var res = App.projectIo.parseProject(text);
        T.assertEqual(res.ok, false, 'a typo/unknown dataset must not be silently dropped');
        T.assert(res.issues.some(function (i) { return /android\.bogus/.test(i.message) && i.severity === 'error'; }));
      });

      s.test('generation and capture guidance no longer mention Settings', function () {
        var pf = App.registry.getPlatform('android-adb');
        T.assert(!/settings/i.test(pf.captureInstructions), 'capture instructions still mention settings');
        T.assert(!/Verify-Setting/.test(pf.scriptPreamble({ device: { name: 'd', model: 'm', firmware: 'f' }, toolVersion: 'v', generatedUtc: '2026-01-01T00:00:00.000Z' })),
          'the preamble still declares the settings verify helper');
        // Every Help section, not just the default one.
        var H = App.ui.views.help;
        H.SECTIONS.forEach(function (sec) {
          H._help.section = sec.id;
          // `imsSettings` is a tactical LEAF, and PRO-2's step is called "Configure
          // Tactical Settings" — neither is the retired Settings DATASET, which is what
          // this guard is about. Both are removed before the check rather than weakening
          // the word boundary, so a genuine "Settings" reference still fails.
          var html = H.render(null).replace(/imsSettings/g, '').replace(/Tactical Settings/g, 'Tactical');
          T.assert(!/\bSettings\b/.test(html), 'the Help manual still mentions Settings in section "' + sec.id + '"');
        });
        H._help.section = H.SECTIONS[0].id;
      });
    });

    // =========================================================================
    // CMD-1 · COL-1 · DIV-1/2/3 — the column picker, the divergence record, and
    // the Control Manager's one-character-per-row device names.
    // =========================================================================

    /** The inline stylesheet, read back from the document (empty outside a browser). */
    function sheet() {
      var el = document.querySelector('style');
      return (el && (el.textContent || el.innerHTML)) || '';
    }
    /** The body of one CSS rule, by exact selector text. */
    function cssRule(selector) {
      var s = sheet();
      var i = s.indexOf(selector + ' {');
      if (i === -1) i = s.indexOf(selector + '{');
      if (i === -1) return '';
      var open = s.indexOf('{', i), close = s.indexOf('}', open);
      return close === -1 ? '' : s.slice(open + 1, close);
    }

    /* ===== SUITES: columns & device read-across (CMD-1 · COL-1) ===== */
    T.suite('CMD-1 the Applies-to device names read across, not down', function (s) {
      // The bug: .detail-form's `input { width: 100% }` also matched the device
      // checkboxes in the Control Manager's row expander. A checkbox stretched to the
      // full width of its own inline-flex label leaves the label's TEXT no width at all,
      // so a device called "TA5" rendered one character per row. Exactly the failure the
      // control multiselect had already been fixed for (review-9 #2).
      function cmProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'TA5', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.addControl({ title: 'A control', type: 'ISM' }).id;
      }
      function expandedTable() {
        var id = cmProject();
        var CV = App.ui.views.controls;
        CV._cm.expanded = {}; CV._cm.expanded[id] = true;
        var html = CV.renderTable(App.store.getProject());
        CV._cm.expanded = {};
        return html;
      }

      s.test('the device option is a classed label, not an inline-styled one', function () {
        var html = expandedTable();
        T.assert(/<label class="ctl-dev-opt"><input type="checkbox" data-ctl-device=/.test(html),
          'the expander must render .ctl-dev-opt labels — inline styles cannot beat the ' +
          '.detail-form input rule that caused the one-character-per-row wrap');
        T.assert(html.indexOf('style="display:inline-flex;align-items:center;gap:4px;margin-right:10px') === -1,
          'the old inline-styled label must be gone');
        T.assert(/<span>TA5<\/span>/.test(html), 'the device name must be its own span, so it can be kept on one line');
      });

      s.test('the rule that BROKE it is still there — which is why the override must be', function () {
        if (!sheet()) return; // no inline stylesheet in this environment
        var r = cssRule('.detail-form input, .detail-form textarea');
        T.assert(/width:\s*100%/.test(r),
          'if this rule ever loses width:100% the override below is harmless, but the ' +
          'assertion is what explains why the override exists');
      });

      s.test('the checkbox keeps its natural size and the name stays on one line', function () {
        if (!sheet()) return;
        var box = cssRule('.ctl-devices input[type="checkbox"]');
        T.assert(/width:\s*auto/.test(box),
          'without width:auto the checkbox is stretched to 100% of the label and the ' +
          'device name is squeezed to one character per row');
        T.assert(/flex:\s*0 0 auto/.test(box), 'the box must not flex-grow either');
        var opt = cssRule('.ctl-dev-opt');
        T.assert(/white-space:\s*nowrap/.test(opt), 'the name must not wrap mid-word');
        var wrap = cssRule('.ctl-devices');
        T.assert(/flex-wrap:\s*wrap/.test(wrap), 'several devices should flow across the row and wrap');
      });
    });

    T.suite('COL-1 every column is hidable except the key column', function (s) {
      function colProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.getProject();
      }
      function adapter(dsId) { ensureA(); return App.registry.getDataset('android-adb', dsId); }
      function keys(cols) { return cols.map(function (c) { return c.key; }); }

      s.test('the key column of EVERY dataset is the locked one — read off the adapter', function () {
        colProject();
        T.assertEqual(App.ui.tables.lockedColumnKey(adapter('android.packages')), 'key');
        T.assertEqual(App.ui.tables.lockedColumnKey(adapter('android.tactical')), 'key');
        // …and it is the one labelled Package / Path, i.e. the FIRST column of the tab.
        T.assertEqual(App.ui.tables.allColumns(adapter('android.packages'))[0].label, 'Package');
        T.assertEqual(App.ui.tables.allColumns(adapter('android.tactical'))[0].label, 'Path');
      });

      s.test('every other column, core ones included, can be hidden', function () {
        colProject();
        var a = adapter('android.packages');
        var all = keys(App.ui.tables.allColumns(a));
        // COL-2: Diverges sits before Status — an attribute of the decision, ahead of the verdict.
        T.assertDeepEqual(all, ['key', 'description', 'decision', 'controlRefs', 'relevance', 'appliesTo', 'diverges', 'status']);
        all.filter(function (k) { return k !== 'key'; }).forEach(function (k) {
          var hidden = {}; hidden[k] = true;
          T.assert(keys(App.ui.tables.visibleColumns(a, { hiddenCols: hidden })).indexOf(k) === -1,
            'column "' + k + '" should be hidable');
        });
      });

      s.test('asking to hide the key column is refused, not obeyed', function () {
        colProject();
        var vis = App.ui.tables.visibleColumns(adapter('android.tactical'),
          { hiddenCols: { key: true, description: true, decision: true, controlRefs: true,
                          relevance: true, appliesTo: true, status: true, diverges: true } });
        T.assertDeepEqual(keys(vis), ['key'],
          'hiding everything must still leave the row its identity — a table of anonymous rows is not a view');
      });

      s.test('a hidden column leaves the table entirely — header, filter row and cells', function () {
        var p = colProject();
        var shown = App.ui.tables.renderTableHtml(p, 'android.packages', {}, {});
        T.assert(/data-col="description"/.test(shown) && /data-col-filter="android.packages" data-col="relevance"/.test(shown));
        var hidden = App.ui.tables.renderTableHtml(p, 'android.packages',
          { hiddenCols: { description: true, relevance: true } }, {});
        T.assert(hidden.indexOf('data-col="description"') === -1, 'the header must go');
        T.assert(hidden.indexOf('data-relevance') === -1, 'the relevance editor must go with its column');
        T.assert(hidden.indexOf('data-col="relevance"') === -1, 'and so must its filter dropdown');
        T.assert(/data-col="key"/.test(hidden), 'the key column stays');
        // Every row must have exactly as many cells as there are headers.
        var headers = (hidden.match(/<th data-col=/g) || []).length;
        T.assertEqual(headers, App.ui.tables.visibleColumns(adapter('android.packages'),
          { hiddenCols: { description: true, relevance: true } }).length);
      });

      s.test('the expander spans the columns that are actually there', function () {
        var p = colProject();
        var ui = { expanded: { 'com.a': true }, hiddenCols: { description: true, decision: true } };
        var html = App.ui.tables.renderTableHtml(p, 'android.packages', ui, {});
        // 8 columns - 2 hidden + 1 for the leading expander column = 7.
        T.assert(/<tr class="detail-row" data-detail-key="com.a"><td colspan="7"/.test(html),
          'the detail row must span the VISIBLE columns, or the expander sticks out past the table');
      });

      s.test('the picker offers one box per hidable column and a locked chip for the key', function () {
        var p = colProject();
        var html = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, p.controls, null, adapter('android.packages'));
        T.assert(/class="col-visbar"/.test(html), 'no column picker rendered');
        T.assertEqual((html.match(/data-col-vis="/g) || []).length, 7, 'one box per hidable column');
        T.assert(html.indexOf('data-col-vis="key"') === -1, 'the key column must not be offered as a box');
        T.assert(/col-vis-fixed[^>]*>Package &middot; always shown</.test(html),
          'the key column belongs there as an "always shown" chip, not as a missing box — ' +
          'and as TEXT, so it does not depend on an emoji the machine may not have');
        T.assert(/data-col-vis-all=/.test(html) && /data-col-vis-none=/.test(html), 'All / None missing');
        T.assert(/8 of 8 shown/.test(html), 'the count must read off the real column set');
      });

      s.test('the count follows what is hidden, and the boxes show the state', function () {
        var p = colProject();
        var html = App.ui.tables.renderToolbar('android.packages', { hiddenCols: { status: true, diverges: true } },
          2, 2, p.controls, null, adapter('android.packages'));
        T.assert(/6 of 8 shown/.test(html), 'the count must follow ui.hiddenCols');
        T.assert(/data-col-vis="status" data-ds="android.packages" aria-label/.test(html), 'a hidden column must render UNticked');
        T.assert(/data-col-vis="description" data-ds="android.packages" checked/.test(html), 'a shown column must render ticked');
      });

      s.test('no picker without an adapter — older callers keep every column', function () {
        var p = colProject();
        var html = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, p.controls, null);
        T.assert(html.indexOf('col-visbar') === -1, 'the bar cannot be built without the dataset it describes');
      });

      s.test('hiding a column clears its filter (FIL-1: never a hidden narrowing)', function () {
        var ui = { colFilters: { decision: 'remove', relevance: 'HIGH' }, hiddenCols: {} };
        App.ui.app._hideColumn(ui, 'decision');
        T.assertDeepEqual(ui.colFilters, { relevance: 'HIGH' },
          'a filter whose dropdown has just been hidden is exactly the mysteriously-short ' +
          'table FIL-1 exists to prevent');
        T.assertDeepEqual(ui.hiddenCols, { decision: true });
      });

      s.test('the visible-column choice is a VIEW — it never reaches the project file', function () {
        var p = colProject();
        var before = App.projectIo.serializeProject(p);
        App.ui.tables.renderTableHtml(p, 'android.packages', { hiddenCols: { status: true } }, {});
        T.assertEqual(App.projectIo.serializeProject(App.store.getProject()), before,
          'rendering with columns hidden must not touch the project');
        T.assert(before.indexOf('hiddenCols') === -1, 'hiddenCols must never be serialised');
      });
    });

