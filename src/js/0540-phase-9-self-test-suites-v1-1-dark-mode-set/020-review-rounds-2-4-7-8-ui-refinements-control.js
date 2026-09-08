    T.suite('T10.7/T10.8 report deviations + determinism (overrides/groups)', function (s) {
      var FIXED = function () { return new Date('2026-01-01T00:00:00.000Z'); };
      function decideAll() {
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.packages', 'com.b', { action: 'keep' });
          App.store.setDecision('android.tactical', 'enabled', { value: true });
      }
      function ready() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        decideAll();
      }
      function readyWithOverrides() {
        ready();
        var g = App.store.addGroup({ name: 'GroupG', deviceBaseIds: ['dev-m1'] });
        App.store.setGroupOverride(g.id, 'android.packages', 'com.a', { action: 'disable' }); // group deviation
        App.store.setDeviceOverride('dev-m1', 'android.packages', 'com.b', { action: 'remove' }); // device deviation
        return App.store.getProject();
      }
      function reportHtml(p) {
        App.util.clock.setClock(FIXED);
        var html = App.generate.buildReport(p, 'dev-m1').files.filter(function (f) { return f.name === 'report.md'; })[0].content;
        App.util.clock.resetClock();
        return html;
      }
      /* The report no longer carries a "Deviations from default" section — the override
       * chain is a working view, not a finding, and it reads on the Devices tab where
       * the overrides are actually made. What still has to hold here is that an
       * override reaches the DOCUMENT: the report prints the effective decision, not
       * the default it was overridden from. */
      s.test('an override reaches the report as the effective decision (OVR-7)', function () {
        var html = reportHtml(readyWithOverrides());
        T.assert(/\| `com\.a` \|[^\n]*disable/i.test(html), 'the group override should be what the report prints: ' + (html.match(/\| `com\.a` \|[^\n]*/) || ''));
        T.assert(/\| `com\.b` \|[^\n]*remove/i.test(html), 'the device override should be what the report prints: ' + (html.match(/\| `com\.b` \|[^\n]*/) || ''));
        T.assert(html.indexOf('Deviations from default') === -1, 'the deviations section is gone');
      });
      s.test('serialize + report are byte-deterministic with overrides/groups (DOD-2/DOD-7)', function () {
        var p = readyWithOverrides();
        T.assertEqual(App.projectIo.serializeProject(p), App.projectIo.serializeProject(p));
        // round-trip identity through parse
        var r = App.projectIo.parseProject(App.projectIo.serializeProject(p));
        T.assertEqual(r.ok, true);
        T.assertEqual(App.projectIo.serializeProject(r.value), App.projectIo.serializeProject(p));
        T.assertEqual(reportHtml(p), reportHtml(p), 'report not byte-deterministic under a fixed clock');
      });
    });

    /* ===== SUITES: review rounds 2-4, 7-8 — UI refinements + control refs in tables/report ===== */
    T.suite('review-2: AEST banner time + resizable/wrapping value columns', function (s) {
      s.test('toAest converts UTC to UTC+10 with an AEST label', function () {
        T.assertEqual(App.ui.app.toAest('2026-06-30T00:00:00.000Z'), '2026-06-30 10:00:00 AEST');
        T.assertEqual(App.ui.app.toAest('2026-06-30T15:30:00.000Z'), '2026-07-01 01:30:00 AEST'); // rolls the date
      });
      s.test('a text value box is a full-width wrapping textarea', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        // A STRING leaf (not a bool) — the kind that still wants a wrapping text box.
        App.store.onboardDevice({ name: 'V', model: 'M1', snapshots: { 'android.packages': snapB('android.packages', 'com.a'), 'android.tactical': snapB('android.tactical', '{"note":"hi there"}') } });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', {}, {});
        T.assert(/<textarea [^>]*class="val-edit"/.test(html), 'value box not a val-edit textarea');
      });
      s.test('table columns are resizable: handles + width styles + stored width override', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'V', model: 'M1', snapshots: { 'android.packages': snapB('android.packages', 'com.a'), 'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { colWidths: { key: 333 } }, {});
        T.assert(/data-col-resize="key"/.test(html), 'no resize handle');
        T.assert(/data-col="key"[^>]*style="width:333px"/.test(html), 'stored column width not applied');
        T.assert(/class="data resizable"/.test(html), 'table not in fixed/resizable layout');
      });
    });

    T.suite('review-7 collapse-all + Apply Control Mode', function (s) {
      function withCtl() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM' }).id;
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [id] });
        return { id: id, project: App.store.getProject() };
      }
      s.test('#1 device detail has a Collapse-all button; its label flips with state', function () {
        var w = withCtl();
        var D = App.ui.views.devices;
        D._dev.collapsed = {};
        var html = D.renderDetail(w.project, 'dev-m1');
        T.assert(/data-dev-collapse-all/.test(html), 'no collapse-all button');
        T.assert(/>Collapse all</.test(html), 'should read "Collapse all" when panels are expanded');
        D._dev.collapsed = { 'android.packages': true, 'android.tactical': true, 'android.custom': true };
        T.assert(/>Expand all</.test(D.renderDetail(w.project, 'dev-m1')), 'should read "Expand all" when all collapsed');
        D._dev.collapsed = {};
      });
      s.test('#2 the side rail shows the Apply Control Mode button + a filterable picker when on', function () {
        var w = withCtl();
        var off = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, w.project.controls);
        T.assert(/data-apply-toggle="android.packages"/.test(off) && />Apply Control Mode</.test(off), 'no apply-mode button');
        T.assert(off.indexOf('data-rail-control') === -1, 'picker must be hidden when mode is off');
        var on = App.ui.tables.renderToolbar('android.packages', { applyMode: true, applyControlId: w.id }, 2, 2, w.project.controls);
        T.assert(/class="active"/.test(on) && />Exit control mode</.test(on), 'button not in active/exit state');
        T.assert(/data-rail-search="android.packages"/.test(on), 'no control filter box in the rail');
        T.assert(on.indexOf('data-rail-control="' + w.id + '"') !== -1, 'the control is not offered as a card in the rail');
        T.assert(new RegExp('class="ctl-card active" data-rail-control="' + w.id + '"').test(on), 'the selected control is not marked active');
        T.assert(/<aside class="side-rail" data-side-rail>/.test(on), 'the rail itself is missing');
      });
      s.test('#2 table adds an Apply column + per-row checkboxes reflecting membership', function () {
        var w = withCtl(); // com.a already has the control; com.b does not
        var html = App.ui.tables.renderTableHtml(w.project, 'android.packages', { applyMode: true, applyControlId: w.id }, {});
        // BULK-3: the heading is the bulk-apply button now, so it names the shown count.
        T.assert(/<th class="apply-col"[^>]*><button[^>]*data-apply-all="android.packages"/.test(html), 'no apply column header');
        T.assert(html.indexOf('>✓ Apply all 2</button>') !== -1, 'the heading must name the shown count');
        T.assert(html.indexOf('data-apply-check data-key="com.a" checked') !== -1, 'com.a checkbox should be checked (control applied)');
        T.assert(html.indexOf('data-apply-check data-key="com.b" checked') === -1, 'com.b checkbox should NOT be checked');
        T.assert(html.indexOf('data-apply-check data-key="com.b"') !== -1, 'com.b should still have an apply checkbox');
      });
      s.test('#2 with no control selected the row checkboxes are disabled', function () {
        var w = withCtl();
        var html = App.ui.tables.renderTableHtml(w.project, 'android.packages', { applyMode: true }, {});
        T.assert(html.indexOf('data-apply-check data-key="com.a" disabled') !== -1, 'checkbox should be disabled without a selected control');
      });
      s.test('#2 no apply column when the mode is off', function () {
        var w = withCtl();
        var html = App.ui.tables.renderTableHtml(w.project, 'android.packages', {}, {});
        T.assert(html.indexOf('apply-col') === -1 && html.indexOf('data-apply-check') === -1, 'apply column should only appear in apply mode');
      });
    });

    T.suite('review-8 name-only picker + Apply-to action + resizable panels', function (s) {
      function withCtl() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.addControl({ title: 'No Bluetooth', type: 'ISM' }).id;
      }
      s.test('#1 SUPERSEDED by SP-3 — the picker now shows name AND description', function () {
        // RV8-1 asked for a name-only picker because the old <datalist> could not show
        // anything else legibly. SP-3 replaces it with a card list, and the description
        // is the point: it is what tells you what a control means while assigning it.
        var id = withCtl();
        var on = App.ui.tables.renderToolbar('android.packages', { applyMode: true, applyControlId: id }, 2, 2, App.store.getProject().controls);
        T.assert(/class="ctl-card-title">No Bluetooth</.test(on), 'the control title must show');
        T.assert(/class="ctl-card-desc">/.test(on), 'the control description must show beside the title');
        T.assert(on.indexOf('apply-control-list') === -1, 'the old datalist picker should be gone');
      });
      s.test('#2 SUPERSEDED by BULK-1/BULK-3 — the action dropdown is now the ✓ Apply heading', function () {
        // RV8-2 sliced the bulk apply by an enum decision field, which made it
        // packages-only and could not express "everything Bluetooth-related". BULK-1
        // replaced it with one button over whatever the table currently shows, and
        // BULK-3 moved that button onto the tick column's own heading — so the rail
        // must no longer carry a second button saying the same thing.
        var id = withCtl();
        var noCtl = App.ui.tables.renderToolbar('android.packages', { applyMode: true }, 2, 2, App.store.getProject().controls);
        T.assert(noCtl.indexOf('pick a control, then tick rows') === -1, 'old hint text should be removed');
        T.assert(noCtl.indexOf('data-apply-to=') === -1, 'the action dropdown should be gone');
        T.assert(noCtl.indexOf('data-apply-all') === -1, 'the rail must not duplicate the heading button');
        var withC = App.ui.tables.renderToolbar('android.packages', { applyMode: true, applyControlId: id }, 2, 2, App.store.getProject().controls);
        T.assert(withC.indexOf('data-apply-all') === -1, 'the rail must not duplicate the heading button');
        T.assert(/apply-all-note/.test(withC) && withC.indexOf('✓ Apply') !== -1,
          'the rail must still point at the heading — a clickable column heading is not self-evident');
        T.assert(!/all \d+ shown/.test(withC),
          'no count here: this toolbar is not re-rendered while you type in the search box, ' +
          'so a number in the rail would go stale — the heading owns the count');
      });
      s.test('#2 tactical has NO "Apply to" (it has no enum decision field)', function () {
        var id = withCtl();
        var st = App.ui.tables.renderToolbar('android.tactical', { applyMode: true, applyControlId: id }, 2, 2, App.store.getProject().controls);
        var tc = App.ui.tables.renderToolbar('android.tactical', { applyMode: true, applyControlId: id }, 2, 2, App.store.getProject().controls);
        T.assert(st.indexOf('data-apply-to="') === -1, 'tactical must not have an Apply-to');
        T.assert(tc.indexOf('data-apply-to="') === -1, 'tactical must not have an Apply-to');
      });
      s.test('#3 device panels are per-dataset resizable AND tactical has an editable override', function () {
        withCtl();
        var D = App.ui.views.devices; D._dev.collapsed = {}; D._dev.panelColWidths = {};
        var html = D.renderPanels(App.store.getProject(), 'dev-m1', '');
        T.assert(/class="dev-panel-table"/.test(html), 'panels should be fixed/resizable tables');
        T.assert(/data-dev-col-resize="android.tactical\|override"/.test(html), 'no tactical Override resize handle');
        T.assert(/data-dev-col-resize="android.packages\|key"/.test(html), 'no packages key resize handle');
        // tactical override editor is present + editable — review-8 #3.
        T.assert(/data-ov-ds="android.tactical"/.test(html), 'tactical should expose an editable override control');
        // widths are stored INDEPENDENTLY per dataset.
        D._dev.panelColWidths = { 'android.tactical': { key: 321 } };
        var html2 = D.renderPanels(App.store.getProject(), 'dev-m1', '');
        T.assert(/data-dev-col scope="col" style="width:321px">Key<span class="col-resize" data-dev-col-resize="android.tactical\|key"/.test(html2), 'stored tactical key width not applied');
        // packages key keeps its default (independent of tactical)
        T.assert(/data-dev-col scope="col" style="width:220px">Key<span class="col-resize" data-dev-col-resize="android.packages\|key"/.test(html2), 'packages column width should be independent of tactical');
        D._dev.panelColWidths = {};
      });
    });

    T.suite('T9.8/T9.9 control refs in tables & report', function (s) {
      function withControl() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Ctl', model: 'M1', snapshots: { 'android.packages': snapB('android.packages', 'com.a'), 'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM' }).id;
        App.store.setDecision('android.packages', 'com.a', { action: 'disable' });
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [id] });
        return { id: id, project: App.store.getProject() };
      }
      s.test('table column shows control TITLES, expander has a checkbox multi-select', function () {
        var w = withControl();
        var html = App.ui.tables.renderTableHtml(w.project, 'android.packages', { expanded: { 'com.a': true } }, {});
        T.assert(/Control Refs/.test(html), 'column not renamed');
        T.assert(html.indexOf('No Bluetooth') !== -1, 'title not shown in column');
        // review-5 #2: a searchable checkbox list (not a native <select multiple>).
        T.assert(!/<select multiple/.test(html), 'should no longer be a native select multiple');
        T.assert(/data-control-multiselect/.test(html), 'no control-multiselect container');
        T.assert(/data-control-search/.test(html), 'no control filter search box');
        T.assert(/data-control-ref-toggle/.test(html), 'no control-ref checkbox toggles');
        T.assert(/data-control-ref-toggle[^>]*checked/.test(html), 'the referenced control should render checked');
      });
      s.test('report Control coverage groups by control title/type', function () {
        var w = withControl();
        // tactical still undecided -> decide it so the device is ready for a fuller report
        App.store.setDecision('android.tactical', 'enabled', { value: true, type: 'bool' });
        // COL-3: Type ships OFF — a column of one repeated word in most projects — so a
        // test about what it carries asks for it.
        var r = App.generate.buildReport(App.store.getProject(), 'ctl-m1', { columns: { control: { type: true } } });
        var html = r.files.filter(function (f) { return f.name === 'report.md'; })[0].content;
        T.assert(/Control coverage/.test(html));
        // CCOL-2: the type is its own column now, not brackets after the title.
        T.assert(html.indexOf('No Bluetooth') !== -1, 'control label missing in coverage');
        T.assert(/\|\s*Type\s*\|/.test(html) && /\|\s*ISM\s*\|/.test(html), 'the type should have its own column');
      });
    });

    T.suite('review-4 #2/#3/#4 UI: incomplete default + control layout/description', function (s) {
      function projWithControl() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Ctl', model: 'M1', snapshots: { 'android.packages': snapB('android.packages', 'com.a'), 'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.addControl({ title: 'No Bluetooth', type: 'ISM', description: 'a long description that should wrap onto multiple lines' });
        return App.store.getProject();
      }
      s.test('#2 the Incomplete-only checkbox defaults to UNticked (and reflects state when set)', function () {
        // Default per-dataset UI state has no incompleteOnly => checkbox must be unchecked.
        var off = App.ui.tables.renderToolbar('android.packages', {}, 10, 10);
        T.assert(/data-incomplete="android.packages"> Incomplete only/.test(off), 'Incomplete-only should be unticked by default');
        T.assert(!/data-incomplete="android.packages" checked/.test(off), 'Incomplete-only should not be checked by default');
        // ...but it still reflects the filter when a user turns it on.
        var on = App.ui.tables.renderToolbar('android.packages', { incompleteOnly: true }, 10, 2);
        T.assert(/data-incomplete="android.packages" checked> Incomplete only/.test(on), 'checkbox should reflect incompleteOnly=true');
      });
      s.test('#3 add-type + import tools render to the right of the title (header, before the add form/table)', function () {
        var html = App.ui.views.controls.render(projWithControl());
        T.assert(/<div class="ctl-header"><h2>Control Manager<\/h2>/.test(html), 'title not at the start of the header');
        var hdr = html.indexOf('class="ctl-header"'), tools = html.indexOf('class="ctl-tools"');
        var addForm = html.indexOf('class="ctl-add"'), tableHost = html.indexOf('id="ctl-table-host"');
        T.assert(tools !== -1 && tools > hdr, 'tools not inside the header');
        T.assert(tools < addForm && tools < tableHost, 'tools should precede the add form and table (beside the title, not beneath)');
      });
      s.test('#4 Control Manager is a SEARCHABLE TABLE with a per-row dropdown', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Ctl', model: 'M1', snapshots: { 'android.packages': snapB('android.packages', 'com.a'), 'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM', description: 'a long description that should wrap onto multiple lines' }).id;
        var project = App.store.getProject();
        var CV = App.ui.views.controls;
        // Collapsed: a table with a search box, a wrapping description column, a per-row
        // expander, and NO inline remove / NO inline description <input>.
        CV._cm.search = ''; CV._cm.expanded = {};
        var collapsed = CV.render(project);
        T.assert(/data-ctl-search/.test(collapsed), 'no search box');
        T.assert(/class="data ctl-table resizable"/.test(collapsed), 'controls not rendered as a resizable table');
        // review-6 #4: columns are drag-resizable (handles + width styles) like the data tables.
        T.assert(/data-cm-col-resize="title"/.test(collapsed) && /data-cm-col-resize="description"/.test(collapsed), 'no column resize handles');
        T.assert(/data-cm-col="title" scope="col" style="width:\d+px"/.test(collapsed), 'no per-column width styles');
        T.assert(/ctl-desc-cell/.test(collapsed) && collapsed.indexOf('a long description that should wrap') !== -1, 'no wrapping description column');
        T.assert(new RegExp('data-ctl-expand="' + id + '"').test(collapsed), 'no per-row expander');
        T.assert(!/<input[^>]*data-ctl-field="description"/.test(collapsed), 'description must never be a one-line input');
        T.assert(!/data-ctl-remove=/.test(collapsed), 'Remove must live in the dropdown, not the row');
        // Expanded: the dropdown holds the wrapping description textarea AND the Remove button.
        CV._cm.expanded = {}; CV._cm.expanded[id] = true;
        var open = CV.render(project);
        T.assert(/<textarea class="ctl-desc" data-ctl-field="description"/.test(open), 'dropdown has no wrapping description textarea');
        T.assert(/class="detail-row"[\s\S]*data-ctl-remove="/.test(open), 'Remove button not inside the dropdown');
        // review-6 #4: a stored column width overrides the default.
        CV._cm.expanded = {}; CV._cm.colWidths = { title: 333 };
        T.assert(/data-cm-col="title" scope="col" style="width:333px"/.test(CV.render(project)), 'stored column width not applied');
        CV._cm.colWidths = {};
      });
      s.test('#4 controls table search filters by title/type/description', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Ctl', model: 'M1', snapshots: { 'android.packages': snapB('android.packages', 'com.a'), 'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.addControl({ title: 'No Bluetooth', type: 'ISM' });
        App.store.addControl({ title: 'Disable GPS', type: 'AHG' });
        var project = App.store.getProject();
        var CV = App.ui.views.controls;
        CV._cm.expanded = {};
        CV._cm.search = 'bluetooth';
        var filtered = CV.renderTable(project);
        T.assert(filtered.indexOf('No Bluetooth') !== -1 && filtered.indexOf('Disable GPS') === -1, 'search did not filter to the matching control');
        T.assert(/1 of 2 shown/.test(filtered), 'count line wrong for a filtered view');
        CV._cm.search = '';
      });
    });

    // =========================================================================
    // review-12: per-device control state · Delete Mode + Undo · Security
    // Relevance column · rationale/relevance columns in the decisions import.
    // =========================================================================
    /** A one-device project with two packages, one setting and one tactical leaf. */
    function r12Project() {
      ensureA(); App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'R12', model: 'M1', firmware: 'F', snapshots: {
        'android.packages': snapB('android.packages', 'com.a\ncom.b'),
        'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
      return 'r12-m1'; // deviceId (= baseId here, v1)
    }

