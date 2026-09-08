    T.suite('JUS-1/JUS-2 control satisfaction + justification', function (s) {
      function jusProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM', description: 'd', assignedDeviceIds: ['dev-m1'] }).id;
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [id] });
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        return id;
      }
      function ctl(id) { return App.store.getProject().controls.filter(function (c) { return c.id === id; })[0]; }
      function named(files, n) { return files.filter(function (f) { return f.name === n; })[0]; }

      s.test('a justification is stored per (control, device) and round-trips', function () {
        var id = jusProject();
        T.assertEqual(App.store.setControlDeviceJustification(id, 'dev-m1', 'BT stack removed; no operational need.').ok, true);
        T.assertEqual(App.store.controlDeviceJustification(ctl(id), 'dev-m1'), 'BT stack removed; no operational need.');
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assertEqual(back.ok, true, JSON.stringify(back.issues));
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'must round-trip byte-identically');
        T.assertEqual(back.value.controls[0].deviceJustifications['dev-m1'], 'BT stack removed; no operational need.');
      });

      s.test('blank clears it, and the empty map is dropped (one canonical form)', function () {
        var id = jusProject();
        App.store.setControlDeviceJustification(id, 'dev-m1', 'because');
        App.store.setControlDeviceJustification(id, 'dev-m1', '   ');
        T.assertEqual(ctl(id).deviceJustifications, undefined, 'the key must go, not linger as {}');
        T.assertEqual(App.store.controlDeviceJustification(ctl(id), 'dev-m1'), '');
      });

      s.test('a justification for an unassigned device is refused', function () {
        var id = jusProject();
        T.assertEqual(App.store.setControlDeviceJustification(id, 'no-such-device', 'x').ok, false);
      });

      s.test('the schema rejects a malformed justification map', function () {
        var id = jusProject();
        App.store.setControlDeviceJustification(id, 'dev-m1', 'why');
        var bad = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        bad.controls[0].deviceJustifications['dev-m1'] = 42;
        T.assert(App.projectIo.validateSchema(bad).some(function (i) { return /deviceJustifications/.test(i.message) && i.severity === 'error'; }));
      });

      s.test('the modal carries the state toggle, the textbox and the current text', function () {
        var id = jusProject();
        App.store.setControlDeviceJustification(id, 'dev-m1', 'Bluetooth stack removed.');
        var modal = App.ui.views.devices.renderControlModal(App.store.getProject(), 'dev-m1', id);
        T.assert(/class="ctl-decide"/.test(modal), 'no decision block');
        T.assert(new RegExp('data-control-state-toggle="' + id + '" data-state="satisfied"').test(modal), 'no Mark satisfied');
        T.assert(/data-control-justification="[^"]+"[^>]*>Bluetooth stack removed\.<\/textarea>/.test(modal), 'the textbox must show the stored text');
        // ...and it still lists the evidence it is a justification FOR.
        T.assert(/class="panel"/.test(modal) && /com\.a/.test(modal), 'the item lists must still be there');
      });

      s.test('satisfied with no justification is flagged, in the modal and the list', function () {
        var id = jusProject();
        App.store.setControlDeviceState(id, 'dev-m1', 'satisfied');
        var modal = App.ui.views.devices.renderControlModal(App.store.getProject(), 'dev-m1', id);
        T.assert(/ctl-just-warn/.test(modal), 'the modal should point out the missing justification');
        var detail = App.ui.views.devices.renderDetail(App.store.getProject(), 'dev-m1');
        T.assert(/badge nojust/.test(detail), 'the list row should flag it too');
        App.store.setControlDeviceJustification(id, 'dev-m1', 'because reasons');
        T.assert(!/ctl-just-warn/.test(App.ui.views.devices.renderControlModal(App.store.getProject(), 'dev-m1', id)), 'the warning must clear');
        T.assert(!/badge nojust/.test(App.ui.views.devices.renderDetail(App.store.getProject(), 'dev-m1')), 'and so must the badge');
      });

      s.test('REV-2 the summary row shows the STATE, never the justification text', function () {
        // The justification is prose; echoing it on the row squeezed the control button to
        // fit, so no two rows lined up and the target shrank the more you wrote. It lives
        // with the evidence, in the modal. The row keeps the badges — including the
        // "no justification" flag, which reports something MISSING and is a fixed width.
        var id = jusProject();
        App.store.setControlDeviceState(id, 'dev-m1', 'satisfied');
        App.store.setControlDeviceJustification(id, 'dev-m1', 'Bluetooth stack removed under policy 4.2.');
        var detail = App.ui.views.devices.renderDetail(App.store.getProject(), 'dev-m1');
        T.assert(detail.indexOf('Bluetooth stack removed under policy 4.2.') === -1,
          'the justification text must NOT appear on the summary row');
        T.assert(detail.indexOf('ctl-just-peek') === -1, 'the peek element must be gone entirely');
        T.assert(/<span class="badge satisfied" data-control-state="/.test(detail), 'the state badge must stay');
        T.assert(/class="ctl-applies-state"/.test(detail),
          'the badges belong in their own holder, so the space the justification used to ' +
          'take goes back to the button instead of being reserved for nothing');
        // ...and the text is still exactly one click away, in the modal.
        T.assert(App.ui.views.devices.renderControlModal(App.store.getProject(), 'dev-m1', id)
          .indexOf('Bluetooth stack removed under policy 4.2.') !== -1, 'the modal must still hold it');
      });

      s.test('CTLM-1 the modal item lists are Key + Decision only', function () {
        // The panels sit side by side in a grid and a package key is one long unbreakable
        // token, so a third column pushed the table past its track and Packages ended up
        // underneath Tactical. Status was the least useful of the three anyway: an
        // undecided item simply shows an empty Decision.
        var id = jusProject();
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [id] });
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        var modal = App.ui.views.devices.renderControlModal(App.store.getProject(), 'dev-m1', id);
        T.assert(/<thead><tr><th>Key<\/th><th>Decision<\/th><\/tr><\/thead>/.test(modal),
          'the item list must be Key + Decision only, got: ' + modal.slice(modal.indexOf('<thead'), modal.indexOf('<thead') + 120));
        T.assert(!/<th>Status<\/th>/.test(modal), 'no Status column in this view');
        T.assert(modal.indexOf('badge decided') === -1 && modal.indexOf('badge undecided') === -1,
          'and no per-row status badges either');
        T.assert(/<table class="ctl-items"/.test(modal),
          'the table needs its own class — fixed layout is what stops a long key overflowing the panel');
        T.assert(modal.indexOf('com.a') !== -1 && modal.indexOf('remove') !== -1, 'the key and its decision must still show');
      });

      s.test('JUS-3 the justification reaches BOTH generated reports', function () {
        var id = jusProject();
        App.store.setControlDeviceState(id, 'dev-m1', 'satisfied');
        App.store.setControlDeviceJustification(id, 'dev-m1', 'BT removed and disabled by policy.');
        // Make the device ready so generation runs.
        var p0 = App.store.getProject();
        var cap = App.registry.getDataset('android-adb', 'android.tactical').capturedDefaults(p0.deviceConfigs[0].snapshots['android.tactical']);
        p0.items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: cap[it.key] ? cap[it.key].value : '' });
        });
        // COL-3: Type and Items ship OFF, so a test about the full six-column row asks
        // for them the way an operator would.
        var rep = named(App.generate.buildReport(App.store.getProject(), 'dev-m1',
          { columns: { control: { type: true, items: true } } }).files, 'report.md').content;
        // Six columns wrap their headings across source lines, so the row is asserted
        // through the preview, which reassembles a cell column-aware.
        var head = App.ui.mdPreview.toHtml(rep).html;
        ['Control', 'Type', 'Description', 'Status', 'Items \\(by dataset\\)', 'Justification'].forEach(function (h) {
          T.assert(new RegExp('<th>' + h.replace(/ /g, '\\s+') + '</th>').test(head), 'Control coverage needs a ' + h + ' column');
        });
        T.assert(/BT\s+removed\s+and\s+disabled\s+by\s+policy\./.test(head), 'the justification must appear in the report');
        T.assert(rep.indexOf('Satisfied') !== -1, 'the state must appear too');
        var cr = named(App.generate.buildControlReport(App.store.getProject(), 'dev-m1', {}).files, 'control-report.md').content;
        T.assert(cr.indexOf('BT removed and disabled by policy.') !== -1, 'the control report must carry it as well');
        T.assert(/\*\*Status on Dev:\*\* Satisfied/.test(cr), 'and the per-device status');
      });

      s.test('an unjustified satisfied control says so in the report rather than looking clean', function () {
        var id = jusProject();
        App.store.setControlDeviceState(id, 'dev-m1', 'satisfied');
        var p0 = App.store.getProject();
        var cap = App.registry.getDataset('android-adb', 'android.tactical').capturedDefaults(p0.deviceConfigs[0].snapshots['android.tactical']);
        p0.items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: cap[it.key] ? cap[it.key].value : '' });
        });
        var rep = named(App.generate.buildReport(App.store.getProject(), 'dev-m1').files, 'report.md').content;
        T.assert(/No\s+justification\s+recorded\./.test(App.ui.mdPreview.toHtml(rep).html), 'an unjustified control must be visible as such');
      });
    });

    /* ===== SUITES: layout stability on tick (STAB-1 · STAB-3) ===== */
    T.suite('STAB-1 a tick never changes a row height', function (s) {
      s.test('the cells that grow when you tick are clamped to a fixed height', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Long Device Name Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'A control with a fairly long title', type: 'ISM' }).id;
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [id] });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        // Control Refs and Applies-to are the two cells that gain text on a tick.
        // EDIT-1 added attributes to the Control Refs cell (it is a way into the row
        // editor), so the assertion is on the clamp inside it rather than on a bare <td>.
        T.assert(/<td[^>]*><span class="cell-clamp" title="A control with a fairly long title">/.test(html),
          'the Control Refs cell must be clamped, or ticking Apply re-wraps it and grows the row');
        T.assert(/<span class="cell-clamp" title="Long Device Name Alpha">/.test(html),
          'the Applies-to cell must be clamped too');
      });
      s.test('an EMPTY clamped cell is emitted too, so the first tick does not resize it', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'D', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/<td[^>]*><span class="cell-clamp"><\/span><\/td>/.test(html),
          'an item with no controls must still render the clamp span (min-height keeps the row stable)');
      });
      s.test('the Control Manager Applies-to and Tags cells are clamped as well', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev One', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'C', type: 'ISM' }).id;
        App.store.setControlsDevice([id], 'dev-one-m1', true);
        App.store.setControlTag([id], 'administrative', true);
        var html = App.ui.views.controls.renderTable(App.store.getProject());
        T.assert(/<td class="ctl-applies-cell"><span class="cell-clamp" title="Dev One">/.test(html), 'Applies-to not clamped');
        T.assert(/<td class="ctl-tags-cell"><span class="cell-clamp" title="administrative">/.test(html), 'Tags not clamped');
      });
      s.test('the clamp CSS pins a FIXED height, not a range', function () {
        var el = document.querySelector('style');
        var sheet = (el && (el.textContent || el.innerHTML)) || '';
        if (!sheet) return;
        var i = sheet.indexOf('.cell-clamp {');
        T.assert(i !== -1, 'no .cell-clamp rule');
        var rule = sheet.slice(sheet.indexOf('{', i) + 1, sheet.indexOf('}', i));
        T.assert(/height:\s*1\.45em/.test(rule), 'the height must be FIXED — a 1-2 line range still grows the row on the first tick');
        T.assert(/overflow:\s*hidden/.test(rule) && /text-overflow:\s*ellipsis/.test(rule), 'overflow must be clipped, not shown');
      });
      s.test('TAG-4 the Tags cell clamp is tall enough for a whole badge', function () {
        // A badge is an inline-block with 1px padding AND a 1px border, so it stands
        // taller than the text line the shared clamp height was sized for — at 1.45em
        // its bottom border was clipped off by overflow:hidden.
        var el = document.querySelector('style');
        var sheet = (el && (el.textContent || el.innerHTML)) || '';
        if (!sheet) return;
        var i = sheet.indexOf('table.ctl-table .ctl-tags-cell .cell-clamp {');
        T.assert(i !== -1, 'the Tags cell must override the shared clamp height');
        var rule = sheet.slice(sheet.indexOf('{', i) + 1, sheet.indexOf('}', i));
        var px = /height:\s*(\d+)px/.exec(rule);
        T.assert(!!px, 'the override must still be a FIXED height (STAB-1: row height cannot depend on tag count)');
        // 10px font x 1.45 line-height + 2px padding + 2px border = 18.5px of badge.
        T.assert(Number(px[1]) >= 19, 'a ' + px[1] + 'px clamp still cuts the badge border off');
      });
    });

    T.suite('STAB-3 a tick in the Control Manager does not move the page', function (s) {
      // The row-height work (STAB-1/STAB-2) kept the CONTENT still, but ticking a box in
      // the Control Manager still went through store.onChange -> a full render() of the
      // shell and the tab, which repaints from the top before the scroll offsets are put
      // back. The handlers now edit quietly and repaint the two cells they changed, so
      // the row under the pointer is never rebuilt at all.
      function cmProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev One', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.addControl({ title: 'No Bluetooth', type: 'ISM' });
      }
      s.test('every row carries the handle the surgical repaint addresses it by', function () {
        cmProject();
        var html = App.ui.views.controls.renderTable(App.store.getProject());
        T.assert(/<tr data-ctl-row="no-bluetooth">/.test(html),
          'without data-ctl-row the handler cannot find the row it must repaint, and would ' +
          'have to fall back to re-rendering the table');
      });
      s.test('the controller exposes a quiet edit for the checkbox handlers', function () {
        // The whole fix rests on this hook existing on the shared ctx (spec §11).
        T.assertEqual(typeof App.ui.app._quietEdit, 'function',
          'no quiet-edit hook — a checkbox tick would re-render the whole tab again');
      });
    });

    /* ===== SUITES: control tags & column-wide device assign (TAG-1/2/3) ===== */
    T.suite('TAG-3 the device column heading assigns the whole shown column', function (s) {
      function cmProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        ['Alpha', 'Bravo'].forEach(function (n, i) {
          App.store.onboardDevice({ name: n, model: 'M' + i, snapshots: {
            'android.packages': snapB('android.packages', 'com.a'),
            'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        });
        ['Bluetooth off', 'Bluetooth pairing off', 'Wifi off', 'Staff vetting'].forEach(function (t) {
          App.store.addControl({ title: t, type: 'ISM', description: 'desc' });
        });
        return App.store.getProject();
      }
      var CV = function () { return App.ui.views.controls; };
      function titlesWith(baseId) {
        return App.store.getProject().controls.filter(function (c) { return (c.assignedDeviceIds || []).indexOf(baseId) !== -1; })
          .map(function (c) { return c.title; }).sort();
      }

      s.test('the heading is a button, and the shown set follows the search', function () {
        var p = cmProject();
        CV()._cm.search = '';
        var html = CV().render(p);
        T.assert(/data-cm-dev-toggle="alpha-m0"[^>]*>Alpha</.test(html), 'the device name must be a bulk toggle');
        T.assertEqual(CV().shownControls(p).length, 4);
        CV()._cm.search = 'bluetooth';
        T.assertDeepEqual(CV().shownControls(App.store.getProject()).map(function (c) { return c.title; }),
          ['Bluetooth off', 'Bluetooth pairing off'], 'the search must define the shown set');
        CV()._cm.search = '';
      });

      s.test('it assigns only the shown controls, and toggles back off', function () {
        cmProject();
        CV()._cm.search = 'bluetooth';
        var shown = CV().shownControls(App.store.getProject()).map(function (c) { return c.id; });
        App.store.setControlsDevice(shown, 'alpha-m0', true);
        T.assertDeepEqual(titlesWith('alpha-m0'), ['Bluetooth off', 'Bluetooth pairing off'], 'only the shown controls');
        T.assertEqual(CV().allShownHaveDevice(App.store.getProject(), 'alpha-m0'), true, 'all shown now have it');
        // ...so the next click removes.
        App.store.setControlsDevice(shown, 'alpha-m0', false);
        T.assertDeepEqual(titlesWith('alpha-m0'), []);
        CV()._cm.search = '';
      });

      s.test('assigning seeds the per-device Unsatisfied state, un-assigning drops it', function () {
        cmProject();
        var id = App.store.getProject().controls[0].id;
        App.store.setControlsDevice([id], 'alpha-m0', true);
        var c = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertEqual(c.deviceStates['alpha-m0'], 'unsatisfied', 'review-12 #1 must still hold on the bulk path');
        App.store.setControlsDevice([id], 'alpha-m0', false);
        c = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertEqual(c.deviceStates['alpha-m0'], undefined);
      });

      s.test('the heading marks itself when every shown control already has the device', function () {
        var p = cmProject();
        CV()._cm.search = '';
        App.store.setControlsDevice(p.controls.map(function (c) { return c.id; }), 'alpha-m0', true);
        var html = CV().render(App.store.getProject());
        T.assert(/class="cm-dev-head all-on" data-cm-dev-toggle="alpha-m0"/.test(html), 'the heading should show it is fully applied');
        T.assert(/data-cm-dev-toggle="alpha-m0"[^>]*title="[^"]*remove it from all/.test(html), 'and offer to remove');
      });
    });

