    // =========================================================================
    // UNDO-1: Undo covers EVERY change a data tab can make, not just the two bulk
    // modes. The unit under test is withUndo() — the wrapper each mutating handler
    // runs inside — since that is what decides "what is one action".
    // =========================================================================
    T.suite('UNDO-1 universal undo', function (s) {
      function decisionOf(key) {
        var it = App.store.getProject().items['android.packages'].filter(function (i) { return i.key === key; })[0];
        return it && it.decision ? String(it.decision.action) : null;
      }

      s.test('an ordinary decision is one undoable action', function () {
        r12Project(); H.reset();
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        H.reset();                                   // the seeded value is the "before"
        H.withUndo('android.packages', 'decision change on "com.a"', function () {
          App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        });
        T.assertEqual(decisionOf('com.a'), 'remove');
        var info = H.info('android.packages');
        T.assertEqual(info.canUndo, true, 'a hand-made decision must be undoable');
        T.assertEqual(info.label, 'decision change on "com.a"');
        T.assertEqual(H.undo('android.packages'), true);
        T.assertEqual(decisionOf('com.a'), 'keep', 'undo must put back the value that was there before');
      });

      s.test('several edits of different kinds step back one at a time, newest first', function () {
        r12Project(); H.reset();
        H.withUndo('android.packages', 'decision change on "com.a"', function () {
          App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        });
        H.withUndo('android.packages', 'rationale edit on "com.a"', function () {
          App.store.setItemFields('android.packages', 'com.a', { rationale: 'Not needed.' });
        });
        H.withUndo('android.packages', 'Security Relevance change on "com.b"', function () {
          App.store.setItemFields('android.packages', 'com.b', { relevance: 'HIGH' });
        });
        function item(k) { return App.store.getProject().items['android.packages'].filter(function (i) { return i.key === k; })[0]; }
        T.assertEqual(item('com.b').relevance, 'HIGH');
        H.undo('android.packages');
        T.assertEqual(item('com.b').relevance, undefined, 'undo 1 must drop the relevance');
        T.assertEqual(item('com.a').rationale, 'Not needed.', '…and nothing else');
        H.undo('android.packages');
        T.assertEqual(item('com.a').rationale, undefined, 'undo 2 must drop the rationale');
        T.assertEqual(decisionOf('com.a'), 'remove', '…and leave the decision alone');
        H.undo('android.packages');
        T.assertEqual(decisionOf('com.a'), null, 'undo 3 must take the decision back to undecided');
        T.assertEqual(H.info('android.packages').canUndo, false, 'three edits, three undos, empty stack');
      });

      s.test('ONE action that touched many rows is ONE undo', function () {
        r12Project(); H.reset();
        var id = App.store.addControl({ title: 'Bulk', type: 'ISM' }).id;
        // This is what the "✓ Apply all N" heading does: every shown row inside one entry.
        H.withUndo('android.packages', 'application of "Bulk" to 2 shown item(s)', function () {
          ['com.a', 'com.b'].forEach(function (k) {
            App.store.setItemFields('android.packages', k, { controlRefs: [id] });
          });
        });
        T.assertEqual(refCounts('android.packages'), '1,1');
        T.assertEqual(H.undo('android.packages'), true);
        T.assertEqual(refCounts('android.packages'), '0,0', 'one click must undo every row the action touched');
        T.assertEqual(H.info('android.packages').canUndo, false, 'and it must have cost exactly one entry');
      });

      s.test('an edit that changed nothing does not spend an undo step', function () {
        r12Project(); H.reset();
        H.withUndo('android.packages', 'decision change on "com.a"', function () {
          App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        });
        H.undo('android.packages');
        T.assertEqual(H.info('android.packages').canRedo, true, 'precondition: there is a redo branch');
        // Re-committing the value already in force (a blur with nothing typed) is a no-op.
        H.withUndo('android.packages', 'decision change on "com.b"', function () {
          App.store.setDecision('android.packages', 'com.b', null);
        });
        var info = H.info('android.packages');
        T.assertEqual(info.canUndo, false, 'a no-op must not push an entry Undo would spend a click on');
        T.assertEqual(info.canRedo, true, 'and it must not throw away the redo branch either');
      });

      s.test('an ordinary edit ends an open Apply-Control-Mode run', function () {
        r12Project(); H.reset();
        var id = App.store.addControl({ title: 'Run', type: 'ISM' }).id;
        applyRun('android.packages', id, ['com.a']);
        H.withUndo('android.packages', 'rationale edit on "com.b"', function () {
          App.store.setItemFields('android.packages', 'com.b', { rationale: 'x' });
        });
        applyRun('android.packages', id, ['com.b']);   // same control, but after an edit
        T.assertEqual(refCounts('android.packages'), '1,1');
        H.undo('android.packages');
        T.assertEqual(refCounts('android.packages'), '1,0', 'the second tick must be its own entry, not folded into the first');
      });

      s.test('undo is bounded and per dataset, and the toolbar says so when empty', function () {
        r12Project(); H.reset();
        for (var i = 0; i < H.limit + 5; i++) {
          (function (n) {
            H.withUndo('android.packages', 'description edit on "com.a"', function () {
              App.store.setItemFields('android.packages', 'com.a', { description: 'v' + n });
            });
          })(i);
        }
        var steps = 0;
        while (H.undo('android.packages')) steps++;
        T.assertEqual(steps, H.limit, 'the history must be capped at UNDO_LIMIT entries');
        T.assertEqual(H.info('android.tactical').canUndo, false, 'the other tab keeps its own history');
        var off = App.ui.tables.renderToolbar('android.packages', {}, 2, 2, [], { canUndo: false });
        T.assert(off.indexOf('no change has been made in this table') !== -1,
          'the greyed-out tooltip must no longer claim Undo is only for the bulk modes');
      });
    });

    T.suite('review-13 #4 Control Manager per-device checkbox columns', function (s) {
      function twoDevices() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        ['Alpha', 'Bravo'].forEach(function (n, i) {
          App.store.onboardDevice({ name: n, model: 'M' + (i + 1), firmware: 'F', snapshots: {
            'android.packages': snapB('android.packages', 'com.a'),
            'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        });
        App.ui.views.controls._cm.deviceCols = null; // default: every device gets a column
        App.ui.views.controls._cm.expanded = {};
        return App.store.addControl({ title: 'No Bluetooth', type: 'ISM' }).id;
      }
      s.test('a picker lists every device and the table gets one column each by default', function () {
        twoDevices();
        var html = App.ui.views.controls.render(App.store.getProject());
        T.assert(/class="cm-devbar"/.test(html), 'no device-columns picker');
        T.assert(/data-cm-devcol="alpha-m1" checked/.test(html) && /data-cm-devcol="bravo-m2" checked/.test(html), 'picker must list both devices, ticked');
        // TAG-3: the device name in the header is now a bulk-toggle button.
        T.assert(/data-cm-col="dev:alpha-m1"/.test(html) && /data-cm-col="dev:bravo-m2"/.test(html), 'missing per-device columns');
        T.assert(/data-cm-dev-toggle="alpha-m1"[^>]*>Alpha</.test(html) && /data-cm-dev-toggle="bravo-m2"[^>]*>Bravo</.test(html), 'the device name must be a column toggle');
        T.assert(/2 of 2 shown/.test(html), 'picker count wrong');
      });
      s.test('each cell is an assignment checkbox that reflects (and drives) assignment', function () {
        var id = twoDevices();
        var off = App.ui.views.controls.renderTable(App.store.getProject());
        T.assert(off.indexOf('data-ctl-device="' + id + '" data-baseid="alpha-m1"') !== -1, 'no per-device cell checkbox');
        T.assert(off.indexOf('data-baseid="alpha-m1" checked') === -1, 'unassigned device must be unticked');
        App.store.updateControl(id, { assignedDeviceIds: ['alpha-m1'] });
        var on = App.ui.views.controls.renderTable(App.store.getProject());
        T.assert(on.indexOf('data-baseid="alpha-m1" checked') !== -1, 'assigned device must be ticked');
        T.assert(on.indexOf('data-baseid="bravo-m2" checked') === -1, 'only the assigned device may be ticked');
        // The shared store path also seeds the per-device state (review-12 #1).
        var c = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertEqual(App.store.controlDeviceState(c, 'alpha-m1'), 'unsatisfied');
      });
      s.test('the picker filters which devices get a column', function () {
        twoDevices();
        var CV = App.ui.views.controls;
        CV._cm.deviceCols = { 'bravo-m2': true };
        var one = CV.render(App.store.getProject());
        T.assert(one.indexOf('data-cm-col="dev:bravo-m2"') !== -1 && one.indexOf('data-cm-col="dev:alpha-m1"') === -1, 'only the ticked device may have a column');
        T.assert(/1 of 2 shown/.test(one));
        CV._cm.deviceCols = {};
        var none = CV.render(App.store.getProject());
        T.assert(none.indexOf('data-cm-col="dev:') === -1, 'None must remove every device column');
        T.assert(/data-cm-devcol="alpha-m1"(?![^>]*checked)/.test(none), 'picker must show the devices as unticked');
        CV._cm.deviceCols = null;
      });
      s.test('the expanded detail row spans the widened table', function () {
        var id = twoDevices();
        var CV = App.ui.views.controls;
        CV._cm.expanded = {}; CV._cm.expanded[id] = true;
        var html = CV.renderTable(App.store.getProject());
        T.assert(/<tr class="detail-row"><td colspan="8"/.test(html), 'detail row must span 1 lead + 5 base + 2 device columns');
        CV._cm.deviceCols = {};
        T.assert(/<tr class="detail-row"><td colspan="6"/.test(CV.renderTable(App.store.getProject())), 'colspan must follow the shown columns');
        // ...and the Apply-Tag tick column widens it again (TAG-2).
        CV._cm.tagMode = true;
        T.assert(/<tr class="detail-row"><td colspan="7"/.test(CV.renderTable(App.store.getProject())), 'the tag column must count too');
        CV._cm.tagMode = false;
        CV._cm.expanded = {}; CV._cm.deviceCols = null;
      });
      s.test('device columns are drag-resizable like the rest', function () {
        twoDevices();
        var CV = App.ui.views.controls;
        CV._cm.colWidths = { 'dev:alpha-m1': 222 };
        var html = CV.renderTable(App.store.getProject());
        T.assert(/data-cm-col-resize="dev:alpha-m1"/.test(html), 'no resize handle on a device column');
        T.assert(/data-cm-col="dev:alpha-m1"[^>]*style="width:222px"/.test(html), 'stored width not applied');
        CV._cm.colWidths = {};
      });
    });

    // =========================================================================
    // review-14, as amended by REL-8: REPORT and IRRELEVANT are both offered on every
    // item, but only IRRELEVANT is PARKED (hidden until "Include irrelevant" is on).
    // =========================================================================
    /* ===== SUITES: review rounds 14-17 — relevance options · column widths · manual · editors ===== */
    T.suite('review-14 REPORT + IRRELEVANT relevance options', function (s) {
      /** com.a=HIGH, com.b=REPORT, com.c=IRRELEVANT, com.d untagged. */
      function tagged() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'R14', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b\ncom.c\ncom.d'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'HIGH' });
        App.store.setItemFields('android.packages', 'com.b', { relevance: 'REPORT' });
        App.store.setItemFields('android.packages', 'com.c', { relevance: 'IRRELEVANT' });
        return App.registry.getDataset('android-adb', 'android.packages');
      }
      function keysFor(ui) {
        return App.ui.model.filterSortRows(App.store.getProject(), 'android.packages', tagged.adapter, ui)
          .map(function (r) { return r.item.key; }).join(',');
      }

      s.test('both options are offered, accepted and schema-valid', function () {
        tagged();
        T.assertDeepEqual(App.projectIo.RELEVANCE_OPTIONS, ['HIGH', 'MEDIUM', 'LOW', 'REPORT', 'IRRELEVANT']);
        T.assertEqual(App.store.setItemFields('android.packages', 'com.d', { relevance: 'REPORT' }).ok, true);
        T.assertEqual(App.store.setItemFields('android.packages', 'com.d', { relevance: 'IRRELEVANT' }).ok, true);
        var p = App.store.getProject();
        T.assertEqual(App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; }).length, 0);
        var html = App.ui.tables.renderTableHtml(p, 'android.packages', { includeRelevance: ['IRRELEVANT'] }, {});
        T.assert(/<option value="REPORT"/.test(html) && /<option value="IRRELEVANT"/.test(html), 'both options must be pickable in the cell');
      });
      s.test('REPORT is purple and IRRELEVANT grey, as badge classes', function () {
        T.assertEqual(App.ui.tables.relevanceClass('REPORT'), 'rel-report');
        T.assertEqual(App.ui.tables.relevanceClass('IRRELEVANT'), 'rel-irrelevant');
        T.assertEqual(App.ui.tables.relevanceBadge('REPORT'), '<span class="badge rel-report">REPORT</span>');
        T.assertEqual(App.ui.tables.relevanceBadge('IRRELEVANT'), '<span class="badge rel-irrelevant">IRRELEVANT</span>');
      });
      s.test('REL-8: REPORT items sit in the table; only IRRELEVANT is parked', function () {
        tagged.adapter = tagged();
        T.assertEqual(keysFor({}), 'com.a,com.b,com.d', 'a REPORT item must NOT be hidden; an IRRELEVANT one must be');
      });
      s.test('REL-8: Include irrelevant ADDS them to the view, it does not replace it', function () {
        tagged.adapter = tagged();
        T.assertEqual(keysFor({ includeRelevance: ['IRRELEVANT'] }), 'com.a,com.b,com.c,com.d',
          'the whole table plus the parked ones — not the parked ones alone');
        T.assertEqual(keysFor({ includeRelevance: [] }), 'com.a,com.b,com.d', 'and switching it back off hides them again');
      });
      s.test('the parked view composes with search and Incomplete-only', function () {
        tagged.adapter = tagged();
        App.store.setDecision('android.packages', 'com.b', { action: 'keep' }); // decided
        T.assertEqual(keysFor({ includeRelevance: ['IRRELEVANT'], incompleteOnly: true }), 'com.a,com.c,com.d',
          'the decided item drops out, the included parked one stays');
        T.assertEqual(keysFor({ includeRelevance: ['IRRELEVANT'], search: 'com.c' }), 'com.c', 'search still applies to an included parked item');
        T.assertEqual(keysFor({ search: 'com.c' }), '', 'and cannot reach one that is still hidden');
      });
      s.test('the toolbar offers one Include toggle per parked category, and says what is hidden', function () {
        tagged();
        var off = App.ui.tables.renderToolbar('android.packages', {}, 4, 2, [], null);
        T.assert(/data-include-rel="IRRELEVANT"/.test(off), 'the Include irrelevant toggle must render');
        T.assertEqual((off.match(/data-include-rel=/g) || []).length, App.projectIo.RELEVANCE_PARKED.length,
          'exactly one toggle per parked category — no Report-only button any more');
        T.assert(off.indexOf('data-include-rel="REPORT"') === -1, 'REPORT is not parked, so it gets no toggle');
        T.assert(/Include irrelevant</.test(off), 'the label must say what ticking it does');
        T.assert(off.indexOf('IRRELEVANT items are hidden.') !== -1, 'the default view must say what it hides');
        T.assert(off.indexOf('data-include-rel="IRRELEVANT" checked') === -1, 'it starts unticked');
        var on = App.ui.tables.renderToolbar('android.packages', { includeRelevance: ['IRRELEVANT'] }, 4, 4, [], null);
        T.assert(on.indexOf('data-include-rel="IRRELEVANT" checked') !== -1, 'ticked state not reflected');
        T.assert(/class="rel-view rel-irrelevant active"/.test(on), 'an active toggle must wear its category colour');
        T.assert(/Every item is in view\./.test(on), 'with nothing hidden the note must say so');
      });
      s.test('severity sort places REPORT then IRRELEVANT after LOW, before unset', function () {
        var a = tagged();
        App.store.setItemFields('android.packages', 'com.d', { relevance: 'LOW' });
        var rows = App.ui.model.filterSortRows(App.store.getProject(), 'android.packages', a,
          { includeRelevance: ['IRRELEVANT'], sortKey: 'relevance', sortDir: 'asc' });
        T.assertDeepEqual(rows.map(function (r) { return r.item.relevance; }), ['HIGH', 'LOW', 'REPORT', 'IRRELEVANT']);
      });
      s.test('the decisions import accepts both new values (and still rejects junk)', function () {
        ensureA();
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var r = a.parseAssignment('package,action,description,rationale,relevance\ncom.a,keep,d,w,report\ncom.b,keep,d,w,Irrelevant');
        T.assertEqual(r.errors.length, 0, JSON.stringify(r.errors));
        T.assertEqual(r.assignments[0].fields.relevance, 'REPORT');
        T.assertEqual(r.assignments[1].fields.relevance, 'IRRELEVANT');
        T.assert(a.parseAssignment('package,action,description,rationale,relevance\ncom.a,keep,d,w,REPORTABLE').errors.some(function (e) { return /Invalid relevance/.test(e.message); }), 'a near-miss must still be refused');
      });
      s.test('a decisions import applies the parked values end to end', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'R14b', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var keys = App.store.getProject().deviceConfigs[0].snapshots['android.packages'].keys;
        var csv = 'package,action,description,rationale,relevance\n' + keys.map(function (k, i) {
          return k + ',keep,d' + i + ',why' + i + ',' + (i ? 'IRRELEVANT' : 'REPORT');
        }).join('\n');
        var res = App.store.applyDeviceAssignment('r14b-m1', 'android.packages',
          App.registry.getDataset('android-adb', 'android.packages').parseAssignment(csv));
        T.assertEqual(res.ok, true, JSON.stringify(res.issues));
        var items = App.store.getProject().items['android.packages'];
        T.assertDeepEqual(items.map(function (i) { return i.relevance; }), ['REPORT', 'IRRELEVANT']);
        // ...and the IRRELEVANT one — only that one — is parked out of the default view.
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var shown = App.ui.model.filterSortRows(App.store.getProject(), 'android.packages', a, {});
        T.assertDeepEqual(shown.map(function (r) { return r.item.relevance; }), ['REPORT'],
          'an imported IRRELEVANT item is hidden by default; an imported REPORT one is not');
        T.assertEqual(App.ui.model.filterSortRows(App.store.getProject(), 'android.packages', a, { includeRelevance: ['IRRELEVANT'] }).length, 2);
      });
    });

    // =========================================================================
    // review-15: starting column widths + the rewritten, sectioned Help manual.
    // =========================================================================
    T.suite('review-15 starting column widths', function (s) {
      function widths(dsId) {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'R15', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), dsId, {}, {});
        var out = {};
        // SORT-1 put a title= between the heading's attributes, so this reads across
        // whatever else the <th> carries rather than pinning their order.
        (html.match(/data-col="[^"]+"[^>]*style="width:\d+px"/g) || []).forEach(function (m) {
          out[m.match(/data-col="([^"]+)"/)[1]] = parseInt(m.match(/width:(\d+)px/)[1], 10);
        });
        return out;
      }
      s.test('Description starts 3x wider (220 -> 660) in every table', function () {
        ['android.packages', 'android.tactical'].forEach(function (dsId) {
          T.assertEqual(widths(dsId).description, 660, 'wrong Description width for ' + dsId);
        });
      });
      s.test('every dataset key column keeps the shared 240 default', function () {
        T.assertEqual(widths('android.packages').key, 240);
        T.assertEqual(widths('android.tactical').key, 240);
      });
      s.test('a stored (dragged) width still wins over the new defaults', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'R15b', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a') } });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { colWidths: { key: 120, description: 130 } }, {});
        T.assert(/data-col="key"[^>]*style="width:120px"/.test(html) && /data-col="description"[^>]*style="width:130px"/.test(html), 'stored widths must override the defaults');
      });
    });

