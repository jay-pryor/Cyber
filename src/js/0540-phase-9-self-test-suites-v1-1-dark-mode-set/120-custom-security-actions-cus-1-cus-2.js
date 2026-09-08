    // ---- CUS-1/CUS-2: Custom Security Actions ---------------------------------
    // The dataset that has no capture behind it. Most of what is asserted here is that
    // it needed NO special-casing anywhere: the tab, the tools rail, the filters, the
    // report and the manifest all reached it through the same data-driven machinery
    // Packages and Tactical use. What IS special — applicability without a snapshot —
    // is asserted directly, because it is the one rule that had to be taught.
    /* ===== SUITES: custom security actions (CUS-1/CUS-2) ===== */
    T.suite('CUS-1/CUS-2 Custom Security Actions', function (s) {
      var DS = 'android.custom';
      function cusProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.getProject();
      }
      /** A device with every item decided, so generation is unblocked. */
      function readyWithAction(actionText) {
        cusProject();
        App.store.addItem(DS, 'Knox tactical passcode');
        App.store.setDecision(DS, 'Knox tactical passcode', { action: actionText || 'Set a 6-digit tactical passcode in Knox.' });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.packages', 'com.b', { action: 'remove' });
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: true });
        });
        return App.store.getProject();
      }
      function adapter() { return App.registry.getDataset('android-adb', DS); }
      function item(key) { return App.store.getProject().items[DS].filter(function (i) { return i.key === key; })[0]; }
      function fileNamed(files, name) { return files.filter(function (f) { return f.name === name; })[0]; }

      s.test('the dataset is registered after Packages and Tactical, and is virtual', function () {
        ensureA();
        T.assertDeepEqual(App.registry.datasetIds('android-adb'),
          ['android.packages', 'android.tactical', 'android.custom']);
        T.assert(App.registry.isVirtualDataset(adapter()), 'it must declare itself virtual');
        T.assert(!App.registry.isVirtualDataset(App.registry.getDataset('android-adb', 'android.packages')),
          'a captured dataset must NOT be virtual');
      });

      s.test('Onboard offers no slot for it, and does not gate the button on one', function () {
        cusProject();
        var html = App.ui.views.onboard.render(App.store.getProject());
        T.assertDeepEqual(html.match(/data-onboard-file="[^"]+"/g),
          ['data-onboard-file="android.packages"', 'data-onboard-file="android.tactical"'],
          'a dataset with nothing to capture must not ask for a file');
      });

      s.test('items are authored, not captured: addItem trims, refuses blanks and duplicates', function () {
        cusProject();
        var ok = App.store.addItem(DS, '  Knox tactical passcode  ');
        T.assert(ok.ok && ok.key === 'Knox tactical passcode', 'the name should be trimmed');
        T.assertEqual(App.store.getProject().items[DS].length, 1);
        T.assertEqual(item('Knox tactical passcode').status, 'undecided', 'a new action starts undecided');
        T.assert(!App.store.addItem(DS, 'Knox tactical passcode').ok, 'a duplicate name must be refused');
        T.assert(!App.store.addItem(DS, '   ').ok, 'an empty name must be refused');
        T.assertEqual(App.store.getProject().items[DS].length, 1, 'a refused add must change nothing');
      });

      s.test('a CAPTURED dataset refuses hand-added items', function () {
        cusProject();
        var res = App.store.addItem('android.packages', 'com.zz');
        T.assert(!res.ok, 'a package with no capture behind it would never be applicable to anything');
        T.assertEqual(App.store.getProject().items['android.packages'].length, 2);
      });

      s.test('applicability without a snapshot: every action applies to every device', function () {
        cusProject();
        App.store.onboardDevice({ name: 'Second', model: 'M2', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":false}') } });
        App.store.addItem(DS, 'Seal the SIM tray');
        var p = App.store.getProject();
        T.assertDeepEqual(App.ui.model.computeAppliesTo(p, DS)['Seal the SIM tray'].slice().sort(),
          ['Dev', 'Second']);
        T.assertDeepEqual(App.registry.applicableKeys(p, p.deviceConfigs[0], DS), ['Seal the SIM tray']);
        T.assert(App.registry.deviceHasDataset(p, p.deviceConfigs[0], DS),
          'a virtual dataset is carried by every device, snapshot or not');
      });

      s.test('an empty action is not a decision (unlike a blank tactical value)', function () {
        cusProject();
        App.store.addItem(DS, 'Knox tactical passcode');
        var res = App.store.setDecision(DS, 'Knox tactical passcode', { action: '   ' });
        T.assert(!res.ok, 'whitespace is not an action');
        T.assertEqual(item('Knox tactical passcode').status, 'undecided',
          'the value is still stored (DOD-10) but must not count as decided');
        App.store.setDecision(DS, 'Knox tactical passcode', { action: 'Set it in Knox.' });
        T.assertEqual(item('Knox tactical passcode').status, 'decided');
      });

      s.test('an undecided action blocks generation for every device, like any other item', function () {
        cusProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.packages', 'com.b', { action: 'keep' });
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: true });
        });
        T.assert(App.completeness.deviceReady(App.store.getProject(), 'dev-m1'), 'baseline should be ready');
        App.store.addItem(DS, 'Knox tactical passcode');
        var r = App.completeness.deviceReadiness(App.store.getProject(), 'dev-m1');
        T.assert(!r.ready && r.totalUndecided === 1, 'a new action must un-ready the device');
        T.assertEqual(r.reasons[0].label, 'Custom Security Actions');
      });

      s.test('the tab renders the SAME tools rail as Packages, plus an add bar', function () {
        cusProject();
        var ctls = [];
        var custom = App.ui.tables.renderToolbar(DS, {}, 0, 0, ctls, null, adapter());
        var pkgs = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, ctls, null,
          App.registry.getDataset('android-adb', 'android.packages'));
        ['data-apply-toggle', 'data-delete-toggle', 'data-undo', 'data-redo', 'rail-title', 'data-rail-toggle']
          .forEach(function (marker) {
            T.assert(custom.indexOf(marker) !== -1, 'the rail must carry ' + marker);
            T.assert(pkgs.indexOf(marker) !== -1, 'Packages must carry ' + marker + ' too (same rail)');
          });
        T.assert(/data-add-item="android\.custom"/.test(custom), 'an authored register needs a way to add a row');
        T.assert(pkgs.indexOf('data-add-item') === -1, 'a captured register must NOT offer one');
      });

      s.test('the row carries every universal aspect, and a rename box; the action box is plain text', function () {
        cusProject();
        App.store.addControl({ title: 'Device authentication', type: 'ISM' });
        App.store.addItem(DS, 'Knox tactical passcode');
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), DS,
          { expanded: { 'Knox tactical passcode': true } }, {});
        ['data-col="key"', 'data-col="description"', 'data-col="decision"', 'data-col="controlRefs"',
         'data-col="relevance"', 'data-col="appliesTo"', 'data-col="status"', 'data-col="diverges"']
          .forEach(function (c) { T.assert(html.indexOf(c) !== -1, 'missing column ' + c); });
        T.assert(/<th data-col="key"[^>]*>Action Name/.test(html), 'the key column is the action name');
        T.assert(/data-field-edit="rationale"/.test(html) && /data-field-edit="rollback"/.test(html),
          'rationale and rollback must be in the expander');
        T.assert(/data-control-ref-toggle/.test(html), 'control refs must be selectable in the expander');
        T.assert(/data-rename-key/.test(html), 'a hand-authored name must be editable');
        T.assert(/<textarea [^>]*data-field="action"[^>]*class="val-edit"/.test(html),
          'the action editor must be a plain text box');
        T.assert(html.indexOf('data-format-pick') === -1,
          'no value-format picker: the action box is open-ended by design');
      });

      s.test('a captured row has NO rename box — its key is evidence', function () {
        cusProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { expanded: { 'com.a': true } }, {});
        T.assert(html.indexOf('data-rename-key') === -1);
      });

      s.test('renaming carries the decision and every override with it', function () {
        readyWithAction();
        App.store.addGroup({ name: 'G', deviceBaseIds: ['dev-m1'] });
        var gid = App.store.getProject().groups[0].id;
        App.store.setGroupOverride(gid, DS, 'Knox tactical passcode', { action: 'Group variant.' });
        App.store.setDeviceOverride('dev-m1', DS, 'Knox tactical passcode', { action: 'Device variant.' });
        var res = App.store.renameItem(DS, 'Knox tactical passcode', 'Knox passcode (6-digit)');
        T.assert(res.ok && res.key === 'Knox passcode (6-digit)');
        var p = App.store.getProject();
        T.assertDeepEqual(p.items[DS].map(function (i) { return i.key; }), ['Knox passcode (6-digit)']);
        T.assertEqual(p.items[DS][0].decision.action, 'Set a 6-digit tactical passcode in Knox.');
        T.assertDeepEqual(p.deviceConfigs[0].overrides[DS], { 'Knox passcode (6-digit)': { action: 'Device variant.' } });
        T.assertDeepEqual(p.groups[0].overrides[DS], { 'Knox passcode (6-digit)': { action: 'Group variant.' } });
        T.assert(!App.store.renameItem('android.packages', 'com.a', 'com.zz').ok, 'a captured key cannot be renamed');
      });

      s.test('implementation emits an UNWRAPPED runbook, not a PowerShell script', function () {
        var p = readyWithAction();
        var r = App.generate.buildImplementation(p, 'dev-m1');
        var names = r.files.map(function (f) { return f.name; });
        T.assert(names.indexOf('custom-actions.txt') !== -1, 'missing custom-actions.txt');
        T.assert(names.indexOf('custom-actions.ps1') === -1, 'a manual action must not pretend to be a script');
        var txt = fileNamed(r.files, 'custom-actions.txt').content;
        T.assert(txt.indexOf('Set-StrictMode') === -1, 'a .txt runbook must not be wrapped in the ADB preamble');
        T.assert(/ACTION: Knox tactical passcode/.test(txt) && /Perform: Set a 6-digit tactical passcode in Knox\./.test(txt));
        var v = App.generate.buildVerification(p, 'dev-m1');
        T.assert(/EVIDENCED Knox tactical passcode = /.test(fileNamed(v.files, 'custom-actions.verify.txt').content));
      });

      s.test('with no custom actions, nothing extra lands in the bundle', function () {
        cusProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.packages', 'com.b', { action: 'keep' });
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: true });
        });
        var names = App.generate.buildImplementation(App.store.getProject(), 'dev-m1').files
          .map(function (f) { return f.name; });
        T.assert(names.indexOf('custom-actions.txt') === -1,
          'an empty runbook would read as a step someone forgot to write');
      });

      s.test('the report carries its own section, and the manifest records the decision', function () {
        var p = readyWithAction();
        var ctl = App.store.addControl({ title: 'Device authentication', type: 'ISM', assignedDeviceIds: ['dev-m1'] });
        App.store.setItemFields(DS, 'Knox tactical passcode', {
          controlRefs: [ctl.id], rationale: 'Authentication is required.', rollback: 'Clear it in Knox.'
        });
        p = App.store.getProject();
        // COL-3: Rollback ships OFF, so the section that carries it is asked for it.
        var html = fileNamed(App.generate.buildReport(p, 'dev-m1',
          { columns: { 'android.custom': { rollback: true } } }).files, 'report.md').content;
        T.assert(/^# \d+ Custom Security Actions \{#sec-ds-android-custom\}$/m.test(html), 'no Custom Security Actions section');
        // Padded rather than tight: the table is wide enough to need the grid form now,
        // so the assertion is about the CELLS, not about which form carries them.
        var headRow = App.ui.mdPreview.toHtml(html).html;
        T.assert(/<th>Action\s+Name<\/th>/.test(headRow) && /<th>Rollback<\/th>/.test(headRow),
          'the section is keyed by the action name and carries Rollback');
        // A grid-table cell WRAPS, so a phrase can straddle two source lines. The preview
        // reassembles a cell column-aware (which is what it is for), so the assertion is
        // made against that rather than against the raw markdown.
        var shown = App.ui.mdPreview.toHtml(html).html;
        T.assert(/Knox\s+tactical\s+passcode/.test(shown), 'the action key must appear as an identifier');
        T.assert(/Clear it in\s+Knox\./.test(shown), 'the rollback text must be carried');
        T.assert(/Device\s+authentication/.test(App.ui.mdPreview.toHtml(html).html), 'Control coverage must pick it up');

        var dropped = fileNamed(App.generate.buildReport(p, 'dev-m1',
          { columns: { 'android.custom': { rollback: false } } }).files, 'report.md').content;
        T.assert(dropped.indexOf('<th>Rollback</th>') === -1, 'its optional columns must be droppable like any other');
        var omitted = fileNamed(App.generate.buildReport(p, 'dev-m1',
          { datasetSections: { 'android.custom': { _all: false } } }).files, 'report.md').content;
        T.assert(!/<h2>Custom Security Actions<\/h2>/.test(omitted), 'the section must be omittable');

        var man = JSON.parse(fileNamed(App.generate.buildImplementation(p, 'dev-m1').files, 'manifest.json').content);
        T.assertDeepEqual(man.decisions[DS],
          [{ key: 'Knox tactical passcode', decision: { action: 'Set a 6-digit tactical passcode in Knox.' }, source: 'default' }]);

        var ctlReport = App.generate.buildControlReport(p, 'dev-m1').files[0].content;
        T.assert(/Knox\s+tactical\s+passcode/.test(App.ui.mdPreview.toHtml(ctlReport).html),
          'the control report must list it beside the other datasets');
      });

      s.test('a device override on an action survives save/load and a re-onboard', function () {
        readyWithAction();
        App.store.setDeviceOverride('dev-m1', DS, 'Knox tactical passcode', { action: 'Use the 8-digit variant here.' });
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, 'the project must still load');
        T.assertDeepEqual(back.value.deviceConfigs[0].overrides[DS],
          { 'Knox tactical passcode': { action: 'Use the 8-digit variant here.' } },
          'selfHeal must not prune an override just because the dataset has no snapshot');
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'round-trip must be byte-stable');

        // Re-onboarding with the SAME captures is still a no-op — the virtual dataset
        // must not make every re-capture look like a change.
        var res = App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        T.assert(res.ok && res.result.noop, 're-onboard of identical captures must stay a no-op');
        // …and a genuine re-capture keeps the override rather than pruning it.
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b\ncom.c'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var v2 = App.store.getProject().deviceConfigs.filter(function (c) { return c.version === 2; })[0];
        T.assertDeepEqual(v2.overrides[DS], { 'Knox tactical passcode': { action: 'Use the 8-digit variant here.' } },
          'a carried-forward override must survive the version bump');
      });

      s.test('a project saved before the tab existed still opens, and can be edited', function () {
        ensureA();
        var p = cusProject();
        var raw = JSON.parse(App.projectIo.serializeProject(p));
        delete raw.items[DS];                       // exactly what an older file looks like
        var res = App.projectIo.parseProject(JSON.stringify(raw));
        T.assert(res.ok, 'an older project must not fail to open: ' + JSON.stringify(res.issues));
        T.assertDeepEqual(res.value.items[DS], [], 'the register must be seeded so the first edit is accepted');
        App.store.init(res.value);
        T.assert(App.store.addItem(DS, 'Seal the SIM tray').ok, 'and the tab must be usable straight away');
      });

      s.test('the Help manual documents it', function () {
        var H = App.ui.views.help;
        H._help.section = 'custom';
        var html = H.render(null);
        T.assert(/Custom Security Actions/.test(html));
        T.assert(/Knox tactical passcode/.test(html), 'the worked example belongs in the manual');
        T.assert(/custom-actions\.txt/.test(html), 'the manual must say what is generated');
        T.assert(/Every device in the project/.test(html), 'and the applicability rule, which is the surprising part');
        H._help.section = H.SECTIONS[0].id;
      });
    });

    // ---- REL-1: 'CONTEXT' renamed to 'LOW' -------------------------------------
    // A closed vocabulary cannot simply be edited: every project already saved carries
    // the old word, and an unknown value is a hard schema error. So what is asserted
    // here is mostly the TRANSLATION — that an existing project still opens, says what
    // it changed, and is otherwise untouched.
    /* ===== SUITES: security relevance renamed (REL-1) ===== */
    T.suite('REL-1 Security Relevance "Context" becomes "Low"', function (s) {
      function relProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.getProject();
      }

      s.test('LOW replaces CONTEXT in the vocabulary, in severity order', function () {
        T.assertDeepEqual(App.projectIo.RELEVANCE_OPTIONS, ['HIGH', 'MEDIUM', 'LOW', 'REPORT', 'IRRELEVANT']);
        T.assertEqual(App.projectIo.RELEVANCE_OPTIONS.indexOf('CONTEXT'), -1, 'the old name must be gone');
        T.assertDeepEqual(App.projectIo.RELEVANCE_RENAMES, { CONTEXT: 'LOW', REPORTING: 'REPORT' },
          'every translation must be declared, not implied');
      });

      s.test('the cell offers LOW, wears the blue badge class, and refuses the old name', function () {
        relProject();
        T.assertEqual(App.store.setItemFields('android.packages', 'com.a', { relevance: 'LOW' }).ok, true);
        T.assertEqual(App.store.setItemFields('android.packages', 'com.b', { relevance: 'CONTEXT' }).ok, false,
          'CONTEXT is not an option any more — only load/import translate it');
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/<option value="LOW"/.test(html), 'LOW must be pickable');
        T.assert(html.indexOf('<option value="CONTEXT"') === -1, 'CONTEXT must not be offered');
        T.assertEqual(App.ui.tables.relevanceClass('LOW'), 'rel-low');
        T.assert(/class="rel-select rel-low"/.test(html), 'a LOW item must wear the blue badge skin');
      });

      s.test('a project saved with CONTEXT still opens — translated, warned about, nothing else touched', function () {
        var p = relProject();
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'HIGH' });
        var raw = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        raw.items['android.packages'].filter(function (it) { return it.key === 'com.b'; })[0].relevance = 'CONTEXT';
        var res = App.projectIo.parseProject(JSON.stringify(raw));
        T.assert(res.ok, 'an older project must not fail to open: ' + JSON.stringify(res.issues));
        var byKey = {}; res.value.items['android.packages'].forEach(function (it) { byKey[it.key] = it; });
        T.assertEqual(byKey['com.b'].relevance, 'LOW', 'CONTEXT must become LOW');
        T.assertEqual(byKey['com.a'].relevance, 'HIGH', 'every other value is untouched');
        T.assert(res.issues.some(function (i) { return /renamed to "LOW"/.test(i.message) && i.severity === 'warning'; }),
          'the rename must be reported, not silent');
        T.assertEqual(App.projectIo.validateSchema(res.value).filter(function (i) { return i.severity === 'error'; }).length, 0);
        T.assertEqual(res.value.deviceConfigs.length, p.deviceConfigs.length, 'nothing else about the project moved');
      });

      s.test('a decisions CSV written against the old vocabulary still imports', function () {
        ensureA();
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var r = a.parseAssignment('package,action,description,rationale,relevance\ncom.a,keep,d,w,context\ncom.b,keep,d,w,LOW');
        T.assertEqual(r.errors.length, 0, JSON.stringify(r.errors));
        T.assertEqual(r.assignments[0].fields.relevance, 'LOW', 'the retired name must be translated on import');
        T.assertEqual(r.assignments[1].fields.relevance, 'LOW');
        T.assert(/HIGH\|MEDIUM\|LOW\|/.test(a.assignmentHint), 'the hint must name the current vocabulary');
      });

      s.test('the Help manual names the current vocabulary and nothing else', function () {
        var H = App.ui.views.help;
        ['tables', 'devices'].forEach(function (sec) {
          H._help.section = sec;
          var html = H.render(null);
          T.assert(/LOW/.test(html), 'the manual must list LOW in section "' + sec + '"');
          T.assert(html.indexOf('CONTEXT') === -1, 'and must not still offer CONTEXT in section "' + sec + '"');
        });
        H._help.section = H.SECTIONS[0].id;
      });
    });

