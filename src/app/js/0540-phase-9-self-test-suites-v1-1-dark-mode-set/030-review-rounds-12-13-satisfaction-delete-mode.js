    /* ===== SUITES: review rounds 12-13 — satisfaction · delete mode · relevance · undo/redo ===== */
    T.suite('review-12 #1 per-device control satisfaction state', function (s) {
      s.test('a control added to a device starts Unsatisfied', function () {
        r12Project();
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM', assignedDeviceIds: ['r12-m1'] }).id;
        var c = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertEqual(c.deviceStates['r12-m1'], 'unsatisfied');
        T.assertEqual(App.store.controlDeviceState(c, 'r12-m1'), 'unsatisfied');
      });
      s.test('assigning a device later also seeds unsatisfied; un-assigning drops the state', function () {
        r12Project();
        var id = App.store.addControl({ title: 'Later', type: 'ISM' }).id;
        App.store.updateControl(id, { assignedDeviceIds: ['r12-m1'] });
        var c1 = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertEqual(c1.deviceStates['r12-m1'], 'unsatisfied');
        App.store.setControlDeviceState(id, 'r12-m1', 'satisfied');
        App.store.updateControl(id, { assignedDeviceIds: [] });
        var c2 = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertDeepEqual(c2.deviceStates, {}, 'state must not linger for an un-assigned device');
      });
      s.test('setControlDeviceState flips to satisfied; bad state / unassigned device refused', function () {
        r12Project();
        var id = App.store.addControl({ title: 'Flip', type: 'ISM', assignedDeviceIds: ['r12-m1'] }).id;
        T.assertEqual(App.store.setControlDeviceState(id, 'r12-m1', 'satisfied').ok, true);
        var c = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertEqual(App.store.controlDeviceState(c, 'r12-m1'), 'satisfied');
        T.assertEqual(App.store.setControlDeviceState(id, 'r12-m1', 'maybe').ok, false, 'unknown state must be refused');
        T.assertEqual(App.store.setControlDeviceState(id, 'other-dev', 'satisfied').ok, false, 'unassigned device must be refused');
      });
      s.test('AMENDED by JUS-2 — the list shows the state; the modal is where you change it', function () {
        // The toggle used to sit on the summary row, so a control could be marked
        // satisfied without ever looking at what satisfies it. It now lives in the
        // modal, under the evidence and beside the justification box.
        r12Project();
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM', assignedDeviceIds: ['r12-m1'] }).id;
        var html = App.ui.views.devices.renderDetail(App.store.getProject(), 'r12-m1');
        T.assert(/<span class="badge unsatisfied" data-control-state="/.test(html), 'no state badge on the list row');
        T.assert(html.indexOf('data-control-state-toggle') === -1, 'the state toggle must NOT be on the list row any more');
        // REV-1: the row's ONE route into the modal is the control button itself. There
        // used to be a second "Review…" button beside it going to the same place.
        T.assert(/class="ctl-applies-item" data-control-open="/.test(html), 'the row should route into the modal instead');
        T.assert(html.indexOf('Review…') === -1, 'the duplicate Review… button must be gone');
        var modal = App.ui.views.devices.renderControlModal(App.store.getProject(), 'r12-m1', id);
        T.assert(new RegExp('data-control-state-toggle="' + id + '" data-state="satisfied"').test(modal), 'the modal must carry the toggle');
        T.assert(new RegExp('data-control-justification="' + id + '"').test(modal), 'the modal must carry the justification box');
      });
      s.test('the device LIST flags devices with controls left unsatisfied', function () {
        r12Project();
        App.store.addControl({ title: 'No Bluetooth', type: 'ISM', assignedDeviceIds: ['r12-m1'] });
        App.store.addControl({ title: 'Disable GPS', type: 'AHG', assignedDeviceIds: ['r12-m1'] });
        var list = App.ui.views.devices.renderList(App.store.getProject());
        T.assert(/badge unsatisfied dev-unsat[^>]*>⚠ 2 controls unsatisfied</.test(list), 'no unsatisfied indicator: ' + list.slice(0, 400));
        App.store.setControlDeviceState('no-bluetooth', 'r12-m1', 'satisfied');
        T.assert(/⚠ 1 control unsatisfied/.test(App.ui.views.devices.renderList(App.store.getProject())), 'indicator count did not drop');
        App.store.setControlDeviceState('disable-gps', 'r12-m1', 'satisfied');
        T.assert(App.ui.views.devices.renderList(App.store.getProject()).indexOf('dev-unsat') === -1, 'indicator must vanish once all are satisfied');
      });
      s.test('deviceStates survive a project round-trip', function () {
        r12Project();
        App.store.addControl({ title: 'No Bluetooth', type: 'ISM', assignedDeviceIds: ['r12-m1'] });
        App.store.setControlDeviceState('no-bluetooth', 'r12-m1', 'satisfied');
        var text = App.projectIo.serializeProject(App.store.getProject());
        var res = App.projectIo.parseProject(text);
        T.assertEqual(res.ok, true, 'round-trip must validate');
        T.assertEqual(res.value.controls[0].deviceStates['r12-m1'], 'satisfied');
        T.assertEqual(App.projectIo.serializeProject(res.value), text, 'not byte-stable');
      });
      s.test('an unknown control state fails schema validation', function () {
        r12Project();
        App.store.addControl({ title: 'Bad', type: 'ISM', assignedDeviceIds: ['r12-m1'] });
        var p = App.store.getProject();
        p.controls[0].deviceStates['r12-m1'] = 'kinda';
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /deviceStates/.test(i.message) && i.severity === 'error'; }), 'bad state accepted');
      });
    });

    T.suite('review-12 #2 Delete Mode + Undo', function (s) {
      s.test('toolbar: Delete Items button, then a counted confirm + Cancel while armed', function () {
        r12Project();
        var off = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, [], null);
        T.assert(/data-delete-toggle="android.packages"[^>]*>Delete Items</.test(off), 'no Delete Items button');
        T.assert(off.indexOf('data-delete-cancel') === -1, 'Cancel must only appear while armed');
        var on = App.ui.tables.renderToolbar('android.packages', { deleteMode: true, deleteSel: { 'com.a': true } }, 2, 2, [], null);
        T.assert(/class="active danger"/.test(on), 'armed button not in the active state');
        T.assert(/>Delete selected \(1\)</.test(on), 'armed button must show the selection count');
        T.assert(/data-delete-cancel="android.packages"/.test(on), 'no Cancel button while armed');
      });
      s.test('Delete Mode and Apply Control Mode disable each other in the toolbar', function () {
        r12Project();
        var del = App.ui.tables.renderToolbar('android.packages', { deleteMode: true }, 2, 2, [], null);
        T.assert(/data-apply-toggle="android.packages"[^>]*disabled/.test(del), 'apply button must be disabled in delete mode');
        var app = App.ui.tables.renderToolbar('android.packages', { applyMode: true }, 2, 2, [], null);
        T.assert(/data-delete-toggle="android.packages"[^>]*disabled/.test(app), 'delete button must be disabled in apply mode');
      });
      s.test('table adds a Delete column with per-row checkboxes only while armed', function () {
        r12Project();
        var p = App.store.getProject();
        var on = App.ui.tables.renderTableHtml(p, 'android.packages', { deleteMode: true, deleteSel: { 'com.a': true } }, {});
        T.assert(/<th class="del-col"/.test(on), 'no delete column header');
        T.assert(on.indexOf('data-delete-check data-key="com.a" checked') !== -1, 'ticked row not reflected');
        T.assert(on.indexOf('data-delete-check data-key="com.b"') !== -1, 'every row needs a delete checkbox');
        T.assert(/class="undecided del-marked"/.test(on), 'ticked row not tinted');
        var off = App.ui.tables.renderTableHtml(p, 'android.packages', {}, {});
        T.assert(off.indexOf('del-col') === -1 && off.indexOf('data-delete-check') === -1, 'delete column leaked outside delete mode');
      });
      s.test('store.removeItems deletes the ticked items and prunes their overrides', function () {
        var devId = r12Project();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDeviceOverride(devId, 'android.packages', 'com.a', { action: 'disable' });
        var res = App.store.removeItems('android.packages', ['com.a']);
        T.assertEqual(res.ok, true); T.assertEqual(res.removed, 1);
        var p = App.store.getProject();
        T.assertDeepEqual(p.items['android.packages'].map(function (i) { return i.key; }), ['com.b']);
        var dc = p.deviceConfigs.filter(function (c) { return c.id === devId; })[0];
        T.assert(!(dc.overrides && dc.overrides['android.packages'] && dc.overrides['android.packages']['com.a']), 'override for a deleted item must be pruned');
        T.assertEqual(App.store.removeItems('android.packages', ['nope']).removed, 0, 'unknown keys delete nothing');
      });
      s.test('undo restores deleted items AND their overrides exactly', function () {
        var devId = r12Project();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDeviceOverride(devId, 'android.packages', 'com.a', { action: 'disable' });
        // Compare the dataset's own state (meta.modifiedUtc legitimately moves on each commit).
        function dsState() {
          var p = App.store.getProject();
          var dc = p.deviceConfigs.filter(function (c) { return c.id === devId; })[0];
          return App.util.stable.stableStringify({ items: p.items['android.packages'], ov: (dc.overrides || {})['android.packages'] || null });
        }
        var before = dsState();
        var snap = App.store.datasetSnapshot('android.packages');
        App.store.removeItems('android.packages', ['com.a', 'com.b']);
        T.assertEqual(App.store.getProject().items['android.packages'].length, 0);
        T.assertEqual(App.store.restoreDatasetSnapshot(snap).ok, true);
        T.assertEqual(dsState(), before, 'undo did not restore the exact prior state');
      });
      s.test('undo also reverses an Apply-Control-Mode change', function () {
        r12Project();
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM' }).id;
        var snap = App.store.datasetSnapshot('android.packages');
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [id] });
        T.assertDeepEqual(App.store.getProject().items['android.packages'][0].controlRefs, [id]);
        App.store.restoreDatasetSnapshot(snap);
        T.assertDeepEqual(App.store.getProject().items['android.packages'][0].controlRefs, [], 'controlRefs not restored');
      });
      s.test('the Undo button is greyed out until a bulk change has been made', function () {
        r12Project();
        var none = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, [], { canUndo: false });
        T.assert(/data-undo="android.packages"[^>]*disabled/.test(none), 'Undo must start disabled');
        var some = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, [], { canUndo: true, label: 'deletion of 2 item(s)' });
        T.assert(/data-undo="android.packages"(?![^>]*disabled)/.test(some), 'Undo must enable once there is something to undo');
        T.assert(/Undo the deletion of 2 item\(s\)/.test(some), 'Undo tooltip must name the change');
      });
      s.test('restoreDatasetSnapshot refuses a missing/!empty snapshot instead of throwing', function () {
        r12Project();
        T.assertEqual(App.store.restoreDatasetSnapshot(null).ok, false);
        T.assertEqual(App.store.datasetSnapshot('nope.nope'), null);
      });
    });

    T.suite('review-12 #3 Security Relevance column', function (s) {
      s.test('every dataset table gets the column with an editable badge-select', function () {
        r12Project();
        var p = App.store.getProject();
        ['android.packages', 'android.tactical'].forEach(function (dsId) {
          var html = App.ui.tables.renderTableHtml(p, dsId, {}, {});
          T.assert(/data-col="relevance"[^>]*>Security Relevance/.test(html), 'no Security Relevance header in ' + dsId);
          T.assert(/<select class="rel-select "[^>]*data-relevance/.test(html), 'no relevance select in ' + dsId);
          T.assert(/<option value="HIGH"/.test(html) && /<option value="MEDIUM"/.test(html) && /<option value="LOW"/.test(html), 'missing options in ' + dsId);
        });
      });
      s.test('an empty relevance renders as "—"; a set one wears the coloured badge class', function () {
        r12Project();
        var empty = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/<option value="" selected>—<\/option>/.test(empty), 'unset value must show as —');
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'HIGH' });
        App.store.setItemFields('android.packages', 'com.b', { relevance: 'LOW' });
        var set = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/class="rel-select rel-high"/.test(set), 'HIGH not styled red');
        T.assert(/class="rel-select rel-low"/.test(set), 'LOW not styled blue');
        T.assertEqual(App.ui.tables.relevanceClass('MEDIUM'), 'rel-medium');
        T.assertEqual(App.ui.tables.relevanceBadge('HIGH'), '<span class="badge rel-high">HIGH</span>');
        T.assertEqual(App.ui.tables.relevanceBadge(''), '', 'an empty relevance must render nothing');
      });
      s.test('setItemFields sets, clears and validates the value', function () {
        r12Project();
        T.assertEqual(App.store.setItemFields('android.packages', 'com.a', { relevance: 'MEDIUM' }).ok, true);
        T.assertEqual(App.store.getProject().items['android.packages'][0].relevance, 'MEDIUM');
        T.assertEqual(App.store.setItemFields('android.packages', 'com.a', { relevance: '' }).ok, true);
        T.assert(!('relevance' in App.store.getProject().items['android.packages'][0]), 'clearing must drop the key (canonical)');
        T.assertEqual(App.store.setItemFields('android.packages', 'com.a', { relevance: 'CRITICAL' }).ok, false, 'unknown option accepted');
      });
      s.test('sorting is by severity (HIGH → MEDIUM → LOW → unset), not alphabetical', function () {
        r12Project();
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'LOW' });
        App.store.setItemFields('android.packages', 'com.b', { relevance: 'HIGH' });
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var rows = App.ui.model.filterSortRows(App.store.getProject(), 'android.packages', a, { sortKey: 'relevance', sortDir: 'asc' });
        T.assertDeepEqual(rows.map(function (r) { return r.item.key; }), ['com.b', 'com.a'], 'HIGH must sort above LOW');
      });
      s.test('an invalid relevance in a project file fails schema validation + survives round-trip', function () {
        r12Project();
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'HIGH' });
        var text = App.projectIo.serializeProject(App.store.getProject());
        var res = App.projectIo.parseProject(text);
        T.assertEqual(res.ok, true);
        T.assertEqual(res.value.items['android.packages'][0].relevance, 'HIGH');
        var bad = App.store.getProject(); bad.items['android.packages'][0].relevance = 'SEVERE';
        T.assert(App.projectIo.validateSchema(bad).some(function (i) { return /relevance/.test(i.message) && i.severity === 'error'; }), 'bad relevance accepted');
      });
    });

    T.suite('review-12 #4 rationale + relevance columns in the decisions import', function (s) {
      var pkgA = function () { ensureA(); return App.registry.getDataset('android-adb', 'android.packages'); };

      s.test('packages CSV accepts 3, 4 or 5 columns', function () {
        var a = pkgA();
        T.assertEqual(a.parseAssignment('package,action,description\ncom.a,keep,d').errors.length, 0, '3-column form must still work');
        var r4 = a.parseAssignment('package,action,description,rationale\ncom.a,keep,d,"because, reasons"');
        T.assertEqual(r4.errors.length, 0);
        T.assertEqual(r4.assignments[0].fields.rationale, 'because, reasons');
        T.assert(!('relevance' in r4.assignments[0].fields), 'an absent column must not be invented');
        var r5 = a.parseAssignment('package,action,description,rationale,relevance\ncom.a,keep,d,why,high\ncom.b,remove,d2,,');
        T.assertEqual(r5.errors.length, 0);
        T.assertEqual(r5.assignments[0].fields.relevance, 'HIGH', 'relevance must be case-normalised');
        T.assertEqual(r5.assignments[1].fields.relevance, '', 'a blank cell clears the value');
      });
      s.test('packages CSV rejects a bad header order/name and an invalid relevance', function () {
        var a = pkgA();
        T.assert(a.parseAssignment('package,action,description,relevance\ncom.a,keep,d,HIGH').errors.some(function (e) { return /Header row/.test(e.message); }), 'relevance without rationale must be refused (column order)');
        T.assert(a.parseAssignment('package,action,description,rationale,notes\ncom.a,keep,d,w,x').errors.some(function (e) { return /Header row/.test(e.message); }), 'unknown 5th column accepted');
        T.assert(a.parseAssignment('package,action,description,rationale,relevance\ncom.a,keep,d,w,SEVERE').errors.some(function (e) { return /Invalid relevance/.test(e.message); }), 'invalid relevance accepted');
      });
      s.test('applyDeviceAssignment fills the Rationale box and the Security Relevance column', function () {
        r12Project();
        var a = pkgA();
        var res = App.store.applyDeviceAssignment('r12-m1', 'android.packages',
          a.parseAssignment('package,action,description,rationale,relevance\ncom.a,disable,desc-a,why-a,HIGH\ncom.b,keep,desc-b,why-b,'));
        T.assertEqual(res.ok, true, JSON.stringify(res.issues));
        var items = App.store.getProject().items['android.packages'];
        T.assertEqual(items[0].rationale, 'why-a');
        T.assertEqual(items[0].relevance, 'HIGH');
        T.assertEqual(items[0].description, 'desc-a');
        T.assertEqual(items[1].rationale, 'why-b');
        T.assert(!('relevance' in items[1]), 'a blank relevance cell must clear, not set');
        T.assert(res.issues.some(function (i) { return /rationale\(s\)/.test(i.message) && /relevance value\(s\)/.test(i.message); }), 'the log should report what extra columns were applied');
      });
      s.test('a bad relevance never half-applies (atomic refusal)', function () {
        r12Project();
        var before = App.projectIo.serializeProject(App.store.getProject());
        var parsed = pkgA().parseAssignment('package,action,description,rationale,relevance\ncom.a,keep,d,w,HIGH\ncom.b,keep,d,w,HIGH');
        parsed.assignments[1].fields.relevance = 'SEVERE'; // bypass the parser to test the store guard
        var res = App.store.applyDeviceAssignment('r12-m1', 'android.packages', parsed);
        T.assertEqual(res.ok, false);
        T.assertEqual(App.projectIo.serializeProject(App.store.getProject()), before, 'a refused import must not mutate state');
      });
    });

    // =========================================================================
    // review-13: delete tint over the row stripe · an apply RUN is one undo step ·
    // redo · per-device checkbox columns in Control Manager.
    // =========================================================================
    var H = App.ui.app._history;

    /** Apply a control to several keys the way Apply Control Mode does (tick by tick). */
    function applyRun(dsId, controlId, keys) {
      keys.forEach(function (k) {
        H.noteApplyTick(dsId, controlId, controlId);
        var it = App.store.getProject().items[dsId].filter(function (i) { return i.key === k; })[0];
        App.store.setItemFields(dsId, k, { controlRefs: (it.controlRefs || []).concat([controlId]) });
      });
    }
    function refCounts(dsId) {
      return App.store.getProject().items[dsId].map(function (i) { return (i.controlRefs || []).length; }).join(',');
    }

    T.suite('review-13 #1 delete selection tint', function (s) {
      s.test('every ticked row carries del-marked, odd and even alike', function () {
        r12Project();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages',
          { deleteMode: true, deleteSel: { 'com.a': true, 'com.b': true } }, {});
        var marked = html.match(/del-marked/g) || [];
        T.assertEqual(marked.length, 2, 'both ticked rows must be marked (the stripe must not win)');
      });
    });

    T.suite('review-13 #2/#3 apply runs undo as one action, plus redo', function (s) {
      s.test('consecutive ticks of one control fold into a SINGLE undo entry', function () {
        r12Project(); H.reset();
        var id = App.store.addControl({ title: 'Group', type: 'ISM' }).id;
        applyRun('android.packages', id, ['com.a', 'com.b']);
        var info = H.info('android.packages');
        T.assertEqual(info.canUndo, true);
        T.assert(/to 2 items/.test(info.label), 'the entry must count the whole run, got: ' + info.label);
        T.assertEqual(refCounts('android.packages'), '1,1');
        T.assertEqual(H.undo('android.packages'), true);
        T.assertEqual(refCounts('android.packages'), '0,0', 'one undo must reverse the WHOLE run');
        T.assertEqual(H.info('android.packages').canUndo, false, 'the run was one entry, so the stack is now empty');
      });
      s.test('closeRun (leaving the mode) and a different control each start a new entry', function () {
        r12Project(); H.reset();
        var a = App.store.addControl({ title: 'A', type: 'ISM' }).id;
        var b = App.store.addControl({ title: 'B', type: 'ISM' }).id;
        applyRun('android.packages', a, ['com.a']);
        H.closeRun();                                   // e.g. exited/re-entered the mode
        applyRun('android.packages', a, ['com.b']);
        applyRun('android.packages', b, ['com.a']);     // different control ⇒ new entry
        T.assertEqual(refCounts('android.packages'), '2,1');
        H.undo('android.packages'); T.assertEqual(refCounts('android.packages'), '1,1', 'undo 1 should drop only control B');
        H.undo('android.packages'); T.assertEqual(refCounts('android.packages'), '1,0', 'undo 2 should drop the second run');
        H.undo('android.packages'); T.assertEqual(refCounts('android.packages'), '0,0', 'undo 3 should drop the first run');
        T.assertEqual(H.info('android.packages').canUndo, false);
      });
      s.test('redo re-applies a whole undone run and is offered only after an undo', function () {
        r12Project(); H.reset();
        var id = App.store.addControl({ title: 'Redo me', type: 'ISM' }).id;
        applyRun('android.packages', id, ['com.a', 'com.b']);
        T.assertEqual(H.info('android.packages').canRedo, false, 'redo must start empty');
        T.assertEqual(H.redo('android.packages'), false, 'redo with an empty stack is a no-op');
        H.undo('android.packages');
        var info = H.info('android.packages');
        T.assertEqual(info.canRedo, true);
        T.assert(/to 2 items/.test(info.redoLabel), 'redo must name the run');
        T.assertEqual(H.redo('android.packages'), true);
        T.assertEqual(refCounts('android.packages'), '1,1', 'redo must restore the whole run');
        T.assertEqual(H.info('android.packages').canUndo, true, 'a redone action is undoable again');
      });
      s.test('a new action clears the redo branch', function () {
        r12Project(); H.reset();
        var id = App.store.addControl({ title: 'Branch', type: 'ISM' }).id;
        applyRun('android.packages', id, ['com.a']);
        H.undo('android.packages');
        T.assertEqual(H.info('android.packages').canRedo, true);
        H.pushUndo('android.packages', 'deletion of 1 item(s)');   // any new bulk action
        T.assertEqual(H.info('android.packages').canRedo, false, 'the redo branch must be dropped');
      });
      s.test('undo/redo are per dataset and both buttons render their state', function () {
        r12Project(); H.reset();
        var id = App.store.addControl({ title: 'Scoped', type: 'ISM' }).id;
        applyRun('android.packages', id, ['com.a']);
        T.assertEqual(H.info('android.tactical').canUndo, false, 'another dataset must be unaffected');
        var none = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, [], { canUndo: false, canRedo: false });
        T.assert(/data-redo="android.packages"[^>]*disabled/.test(none), 'Redo must start disabled');
        var both = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, [], { canUndo: true, label: 'x', canRedo: true, redoLabel: 'application of control "Scoped" to 1 item' });
        T.assert(/data-redo="android.packages"(?![^>]*disabled)/.test(both), 'Redo must enable when there is a redo entry');
        // The tooltip is HTML-escaped like every other attribute (the label has quotes).
        T.assert(both.indexOf('Redo the application of control &quot;Scoped&quot; to 1 item') !== -1, 'Redo tooltip must name the change');
      });
    });

