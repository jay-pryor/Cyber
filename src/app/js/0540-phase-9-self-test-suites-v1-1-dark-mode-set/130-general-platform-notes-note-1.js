    // ---- NOTE-1: General Platform Notes ----------------------------------------
    /* ===== SUITES: general platform notes (NOTE-1) ===== */
    T.suite('NOTE-1 General Platform Notes', function (s) {
      var D = App.ui.views.devices;
      function noteProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.getProject();
      }

      s.test('the Devices list offers a Notes button beside View, per device', function () {
        noteProject();
        var html = D.renderList(App.store.getProject());
        T.assert(/data-device-view="dev-m1"/.test(html) && /data-device-notes="dev-m1"/.test(html),
          'the notes page must be reachable from the row it is about');
      });

      s.test('notes are stored per device baseId, and blank clears them', function () {
        noteProject();
        T.assertEqual(App.store.deviceNotes(App.store.getProject(), 'dev-m1'), '', 'a new device has none');
        App.store.setDeviceNotes('dev-m1', '<p>Reboots re-enable <b>com.b</b>.</p>');
        T.assertEqual(App.store.deviceNotes(App.store.getProject(), 'dev-m1'), '<p>Reboots re-enable <b>com.b</b>.</p>');
        App.store.setDeviceNotes('dev-m1', '   ');
        T.assert(!App.store.getProject().deviceNotes, 'blanking must leave no trace at all (canonical)');
      });

      s.test('they survive save/load byte-stably, and a re-onboard', function () {
        noteProject();
        App.store.setDeviceNotes('dev-m1', '<ul><li>Seal the SIM tray first.</li></ul>');
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, JSON.stringify(back.issues));
        T.assertEqual(back.value.deviceNotes['dev-m1'], '<ul><li>Seal the SIM tray first.</li></ul>');
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'round-trip must be byte-stable');
        // A new VERSION of the same device is the same device: baseId keying is the point.
        App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b\ncom.c'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        T.assertEqual(App.store.deviceNotes(App.store.getProject(), 'dev-m1'), '<ul><li>Seal the SIM tray first.</li></ul>',
          're-onboarding must not lose what was written about the device');
      });

      s.test('the sanitiser keeps the formatting and strips everything else', function () {
        T.assertEqual(D.scrubNotes('<b>bold</b> and <em>italic</em>'), '<b>bold</b> and <em>italic</em>');
        T.assertEqual(D.scrubNotes('<ul><li>one</li><li>two</li></ul>'), '<ul><li>one</li><li>two</li></ul>');
        T.assertEqual(D.scrubNotes('<p onclick="steal()" style="color:red">x</p>'), '<p>x</p>',
          'every attribute goes — no style, no handlers');
        // Split literal: an unbroken "</scr"+"ipt>" in this file would end the block it is written in.
        T.assertEqual(D.scrubNotes('<scr' + 'ipt>bad()</scr' + 'ipt>keep'), 'keep', 'a script element goes, content and all');
        T.assertEqual(D.scrubNotes('<font color="red"><b>kept</b></font>'), '<b>kept</b>',
          'an unknown element is unwrapped, not dropped — the words survive');
        T.assertEqual(D.scrubNotes('<img src=x onerror=alert(1)>'), '', 'no images, no smuggled handlers');
        T.assertEqual(D.scrubNotes(''), '');
      });

      s.test('the page shows what the device IS, then the box to write in', function () {
        noteProject();
        App.store.setDeviceNotes('dev-m1', '<p>KNOWN-NOTE-TEXT</p>');
        var html = D.renderNotes(App.store.getProject(), 'dev-m1');
        T.assert(/platform notes/.test(html) && /Dev/.test(html), 'the heading names the device');
        T.assert(/note-fact-label">Model/.test(html) && /note-fact-label">Firmware/.test(html), 'device facts belong at the top');
        T.assert(/data-note-cmd="bold"/.test(html) && /data-note-cmd="insertUnorderedList"/.test(html) &&
                 /data-note-cmd="formatBlock"/.test(html), 'bold / bullets / headings must be offered');
        T.assert(/contenteditable="true"[^>]*data-note-editor="dev-m1"/.test(html), 'the editor must be the rich-text surface');
        T.assert(/KNOWN-NOTE-TEXT/.test(html), 'what was written must come back');
        T.assert(/data-notes-back/.test(html), 'and there must be a way out');
      });

      s.test('notes from a hand-edited project file are sanitised on the way OUT too', function () {
        noteProject();
        App.store.setDeviceNotes('dev-m1', '<p>ok</p><scr' + 'ipt>alert(1)</scr' + 'ipt><b onclick="x()">b</b>');
        var html = D.renderNotes(App.store.getProject(), 'dev-m1');
        T.assert(html.indexOf('alert(1)') === -1, 'the page must never re-emit a stored script');
        T.assert(html.indexOf('onclick') === -1, 'nor a stored handler attribute');
        T.assert(/<b>b<\/b>/.test(html), 'while the formatting itself survives');
      });

      s.test('a bad deviceNotes shape is a schema error, not a silent drop', function () {
        var p = noteProject();
        p.deviceNotes = { 'dev-m1': 42 };
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /deviceNotes/.test(i.message) && i.severity === 'error'; }));
      });

      s.test('the Help manual documents it', function () {
        var H = App.ui.views.help;
        H._help.section = 'devices';
        var html = H.render(null);
        T.assert(/Platform notes/.test(html), 'there must be a section saying what the page is for');
        T.assert(/rich text/.test(html), 'and that it takes formatting');
        T.assert(/per device/.test(html), 'and the baseId rule, which is the surprising part');
        T.assert(/not carried into any generated output/.test(html), 'and where it does NOT travel');
        H._help.section = 'reference';
        T.assert(/Platform notes/.test(H.render(null)), 'the glossary should carry the term');
        H._help.section = H.SECTIONS[0].id;
      });
    });

    // ---- PRO-1/PRO-2: procedures, and the Procedure report ---------------------
    /* ===== SUITES: procedures & the Procedure report (PRO-1 · PRO-2) ===== */
    T.suite('PRO-1/PRO-2 Procedures and the Procedure report', function (s) {
      var CUS = 'android.custom';
      function proProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.packages', 'com.b', { action: 'remove' });
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: true });
        });
        App.store.addItem(CUS, 'Seal the SIM tray');
        App.store.setDecision(CUS, 'Seal the SIM tray', { action: 'Fit and sign the tamper seal.' });
        App.store.addItem(CUS, 'Knox tactical passcode');
        App.store.setDecision(CUS, 'Knox tactical passcode', { action: 'Set a 6-digit passcode.' });
        return App.store.getProject();
      }
      function stepIds(p) {
        return App.generate.procedureSteps(p, 'dev-m1').map(function (x) { return x.id; });
      }
      function fileNamed(files, name) { return files.filter(function (f) { return f.name === name; })[0]; }

      // ---- PRO-1: the per-action procedure box
      s.test('only the datasets that ask for one get a Procedure box', function () {
        proProject();
        var p = App.store.getProject();
        var cus = App.ui.tables.detailRowHtml(p, CUS, 'Seal the SIM tray', {}, {});
        T.assert(/data-field-edit="procedure"/.test(cus), 'a manual action must have somewhere to write its steps');
        var pkg = App.ui.tables.detailRowHtml(p, 'android.packages', 'com.a', {}, {});
        T.assert(pkg.indexOf('data-field-edit="procedure"') === -1,
          'a package removal\'s procedure IS the generated adb line — an empty box would be noise');
      });

      s.test('the procedure is set, cleared and round-tripped like any other prose field', function () {
        proProject();
        T.assertEqual(App.store.setItemFields(CUS, 'Seal the SIM tray', { procedure: '1. Power off.\n2. Fit seal.' }).ok, true);
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, JSON.stringify(back.issues));
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'round-trip must be byte-stable');
        App.store.setItemFields(CUS, 'Seal the SIM tray', { procedure: '' });
        var it = App.store.getProject().items[CUS].filter(function (x) { return x.key === 'Seal the SIM tray'; })[0];
        T.assert(!('procedure' in it), 'clearing must drop the key (canonical)');
      });

      s.test('the runbook carries the procedure, indented under its action', function () {
        proProject();
        App.store.setItemFields(CUS, 'Seal the SIM tray', { procedure: 'Power off.\nFit the seal.' });
        var files = App.generate.buildImplementation(App.store.getProject(), 'dev-m1').files;
        var txt = fileNamed(files, 'custom-actions.txt').content;
        T.assert(/ {2}Procedure:\n {4}Power off\.\n {4}Fit the seal\./.test(txt),
          'the steps are the part someone actually follows — they belong in the runbook');
      });

      // ---- PRO-2: the ordered report
      s.test('the steps are one per captured register and one per manual action', function () {
        var p = proProject();
        T.assertDeepEqual(stepIds(p), [
          'ds:android.packages', 'ds:android.tactical',
          'item:android.custom:Knox tactical passcode', 'item:android.custom:Seal the SIM tray'
        ], '400 packages must not become 400 steps, and each manual action must have its own');
        var steps = App.generate.procedureSteps(p, 'dev-m1');
        T.assertEqual(steps[0].label, 'Configure Packages', 'the label comes from the adapter, not from core');
        T.assertEqual(steps[1].label, 'Configure Tactical Settings');
        T.assertEqual(steps[0].count, 2);
      });

      s.test('the saved order is a ranking, so it survives deletions and new actions', function () {
        proProject();
        App.store.setProcedureOrder(['item:android.custom:Seal the SIM tray', 'ds:android.tactical',
          'ds:android.packages', 'item:android.custom:Knox tactical passcode', 'item:android.custom:gone']);
        T.assertDeepEqual(stepIds(App.store.getProject()), [
          'item:android.custom:Seal the SIM tray', 'ds:android.tactical',
          'ds:android.packages', 'item:android.custom:Knox tactical passcode'
        ], 'a step id that no longer exists must simply rank nothing');
        App.store.addItem(CUS, 'Zzz later action');
        App.store.setDecision(CUS, 'Zzz later action', { action: 'Do it.' });
        T.assertEqual(stepIds(App.store.getProject()).pop(), 'item:android.custom:Zzz later action',
          'an action the saved order has never seen falls to the end, never out');
      });

      s.test('the order is a project decision — saved, reloaded, byte-stable', function () {
        proProject();
        App.store.setProcedureOrder(['ds:android.tactical', 'ds:android.packages']);
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, JSON.stringify(back.issues));
        T.assertDeepEqual(back.value.procedure.order, ['ds:android.tactical', 'ds:android.packages']);
        T.assertEqual(App.projectIo.serializeProject(back.value), text);
        App.store.setProcedureOrder([]);
        T.assert(!App.store.getProject().procedure, 'an empty order leaves no trace');
      });

      s.test('the report numbers the steps in that order and carries each one\'s detail', function () {
        proProject();
        App.store.setItemFields(CUS, 'Seal the SIM tray', { procedure: 'Fit the tamper seal.', rollback: 'Cut and re-seal.' });
        App.store.setProcedureOrder(['item:android.custom:Seal the SIM tray', 'ds:android.packages', 'ds:android.tactical',
          'item:android.custom:Knox tactical passcode']);
        App.store.setProcedureNote('ds:android.packages', 'Run from the build laptop.');
        var out = App.generate.buildProcedure(App.store.getProject(), 'dev-m1');
        var html = fileNamed(out.files, 'procedure.md').content;
        T.assert(/^# \d+ Step 1 — Seal the SIM tray/m.test(html), 'the configured order must be the numbering');
        T.assert(/^# \d+ Step 2 — Configure Packages/m.test(html));
        T.assert(/^# \d+ Step 4 — Knox tactical passcode/m.test(html));
        T.assert(/Running order/.test(html), 'the sequence must be checkable before anyone touches a device');
        T.assert(/Fit the tamper seal\./.test(html) && /Cut and re-seal\./.test(html), 'the action\'s own detail travels');
        T.assert(/Run from the build laptop\./.test(html), 'and a note written against a register step');
        // v2.2: a document is one .md — its provenance is in its own metadata block.
        T.assert(fileNamed(out.files, 'manifest.json') == null, 'a document carries no manifest');
        T.assert(/\ntool: "CH Config Tool/.test(html) && /\nproject-sha256: /.test(html), 'provenance missing from the metadata');
        T.assert(/-procedure-\d{8}T\d{6}Z\.md$/.test(out.name), 'the download must name the command: ' + out.name);
      });

      s.test('an unticked step leaves the report and the numbering closes up', function () {
        proProject();
        App.store.setProcedureOrder(['ds:android.packages', 'ds:android.tactical']);
        var opts = { exclude: {} }; opts.exclude['ds:android.packages'] = true;
        var html = fileNamed(App.generate.buildProcedure(App.store.getProject(), 'dev-m1', opts).files, 'procedure.md').content;
        T.assert(html.indexOf('Configure Packages') === -1, 'an excluded step must not appear');
        T.assert(/^# \d+ Step 1 — Configure Tactical Settings/m.test(html), 'and the rest must renumber');
      });

      s.test('it is deterministic under a fixed clock (DOD-7)', function () {
        App.util.clock.setClock(function () { return new Date('2026-02-02T02:02:02.000Z'); });
        proProject();
        var a = App.generate.buildProcedure(App.store.getProject(), 'dev-m1').files;
        var b = App.generate.buildProcedure(App.store.getProject(), 'dev-m1').files;
        T.assertDeepEqual(a, b);
        App.util.clock.resetClock();
      });

      s.test('the Generate tab offers it, with a draggable running order', function () {
        proProject();
        var V = App.ui.views.generate;
        V._gen.deviceId = 'dev-m1';
        V._gen.openOptions.procedure = true;
        var html = V.render(App.store.getProject());
        T.assert(/data-generate-action="procedure"/.test(html), 'the command must be on the tab');
        T.assert(/class="proc-list"/.test(html) && /data-proc-step="ds:android.packages"/.test(html), 'the order editor must render');
        T.assert(/draggable="true"/.test(html) && /data-proc-up="ds:android.tactical"/.test(html),
          'drag AND buttons — the buttons are the keyboard path, not a fallback');
        T.assert(/data-proc-include="ds:android.packages" checked/.test(html), 'every step starts included');
        T.assert(/data-proc-note="ds:android.packages"/.test(html), 'a register step takes a note');
        V._gen.openOptions.procedure = false;
      });

      s.test('the Help manual documents both halves', function () {
        var H = App.ui.views.help;
        H._help.section = 'custom';
        T.assert(/Procedure/.test(H.render(null)), 'the action\'s Procedure box belongs in the Custom actions section');
        H._help.section = 'generate';
        var gen = H.render(null);
        T.assert(/five commands/.test(gen), 'the command list must have grown');
        T.assert(/running order/i.test(gen) && /drag/i.test(gen), 'and say how the order is set');
        T.assert(/saved <strong>in the project<\/strong>/.test(gen),
          'the manual must say the order is NOT session-only like every other option — that is the surprising part');
        H._help.section = 'reference';
        T.assert(/Procedure/.test(H.render(null)), 'the glossary should carry the term');
        H._help.section = H.SECTIONS[0].id;
      });
    });

    // ---- CMF-1: Control Manager column filters ---------------------------------
    /* ===== SUITES: Control Manager column filters (CMF-1) ===== */
    T.suite('CMF-1 Control Manager column filters', function (s) {
      var C = App.ui.views.controls;
      var NONE = App.ui.model.FILTER_NONE;
      function cmProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.onboardDevice({ name: 'Bravo', model: 'M2', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var a = App.store.addControl({ title: 'A ism', type: 'ISM', description: 'bluetooth off' });
        var b = App.store.addControl({ title: 'B ahg', type: 'AHG', description: 'sim sealed' });
        App.store.addControl({ title: 'C ism', type: 'ISM', description: 'nothing' });
        App.store.addControlTag('administrative');
        App.store.setControlTag([a.id], 'administrative', true);
        App.store.updateControl(b.id, { assignedDeviceIds: ['alpha-m1'] });
        C._cm.search = ''; C._cm.filters = {};
        return App.store.getProject();
      }
      function shownTitles() {
        return C.shownControls(App.store.getProject()).map(function (c) { return c.title; }).join(',');
      }

      s.test('the vocabulary comes from the project — types, tags and onboarded devices', function () {
        var p = cmProject();
        var cols = C.cmFilterColumns(p);
        T.assertDeepEqual(Object.keys(cols).sort(), ['applies', 'tags', 'type']);
        T.assert(cols.type.options.some(function (o) { return o.value === 'AHG'; }), 'a type in use must be offered');
        T.assertDeepEqual(cols.tags.options.map(function (o) { return o.label; }), ['administrative', '(untagged)']);
        T.assertDeepEqual(cols.applies.options.map(function (o) { return o.label; }), ['Alpha', 'Bravo', '(unassigned)']);
        T.assertEqual(cols.applies.options[0].value, 'alpha-m1',
          'matched on the baseId the control stores, so renaming a device cannot orphan the filter');
      });

      s.test('each filter narrows on its own column', function () {
        cmProject();
        T.assertEqual(shownTitles(), 'A ism,B ahg,C ism');
        C._cm.filters = { type: 'ISM' };
        T.assertEqual(shownTitles(), 'A ism,C ism');
        C._cm.filters = { tags: 'administrative' };
        T.assertEqual(shownTitles(), 'A ism');
        C._cm.filters = { tags: NONE };
        T.assertEqual(shownTitles(), 'B ahg,C ism', '"(untagged)" is a real answer, not the absence of a filter');
        C._cm.filters = { applies: 'alpha-m1' };
        T.assertEqual(shownTitles(), 'B ahg');
        C._cm.filters = { applies: NONE };
        T.assertEqual(shownTitles(), 'A ism,C ism');
        C._cm.filters = {};
      });

      s.test('they compose with each other and with the search box', function () {
        cmProject();
        C._cm.filters = { type: 'ISM', tags: NONE };
        T.assertEqual(shownTitles(), 'C ism');
        C._cm.filters = { type: 'ISM' };
        C._cm.search = 'bluetooth';
        T.assertEqual(shownTitles(), 'A ism', 'the search narrows whatever the filters left');
        C._cm.search = ''; C._cm.filters = {};
      });

      s.test('the table renders a filter row under the headers, and says it is filtering', function () {
        cmProject();
        var off = C.renderTable(App.store.getProject());
        T.assert(/<tr class="filter-row">/.test(off), 'no filter row');
        T.assert(/data-cm-filter="type"/.test(off) && /data-cm-filter="tags"/.test(off) && /data-cm-filter="applies"/.test(off),
          'Type, Tags and Applies to are the three that were asked for');
        T.assert(off.indexOf('data-cm-filter-clear') === -1, 'nothing to clear when nothing is filtering');
        C._cm.filters = { type: 'ISM' };
        var on = C.renderTable(App.store.getProject());
        T.assert(/2 of 3 shown/.test(on), 'the count must follow the filter');
        T.assert(/1 column filter active/.test(on) && /data-cm-filter-clear/.test(on),
          'a short table must never be mysterious — say what is narrowing it, and offer the way out');
        T.assert(/class="col-filter on"/.test(on), 'an active filter must look active');
        C._cm.filters = {};
      });

      s.test('the bulk actions act on the FILTERED set, not the whole catalogue', function () {
        cmProject();
        C._cm.filters = { type: 'ISM' };
        var p = App.store.getProject();
        T.assertEqual(C.allShownHaveTag(p, 'administrative'), false);
        var ids = C.shownControls(p).map(function (c) { return c.id; });
        App.store.setControlTag(ids, 'administrative', true);
        T.assertEqual(C.allShownHaveTag(App.store.getProject(), 'administrative'), true,
          '"tag all shown" must mean exactly what the table is showing');
        var untouched = App.store.getProject().controls.filter(function (c) { return c.title === 'B ahg'; })[0];
        T.assert(!(untouched.tags || []).length, 'a control the filter hid must not be touched');
        C._cm.filters = {};
      });

      s.test('the Help manual documents it', function () {
        var H = App.ui.views.help;
        H._help.section = 'controls';
        var html = H.render(null);
        T.assert(/Filtering the catalogue/.test(html));
        T.assert(/untagged/.test(html) && /unassigned/.test(html), 'the two sentinels need explaining, not guessing');
        T.assert(/compose/.test(html), 'and that they stack with the search box');
        H._help.section = H.SECTIONS[0].id;
      });
    });

