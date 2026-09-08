    // v2.0: Settings was retired. Projects saved by v1.x still carry android.settings
    // items/snapshots/overrides; those ids are no longer datasets of the platform, so
    // without the retirement path validateSchema would reject every existing project.
    // ---- v2.1: value formats (VF), sticky tools rail (SP) ------------------------
    /* ===== SUITES: v2.1 value formats (VF-1…VF-8) ===== */
    T.suite('VF value formats — inference, editors, enforcement', function (s) {
      var VF = App.valueFormats;
      /** A device whose tactical capture has one leaf of every interesting shape. */
      function vfProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'VF', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical',
            '{"flag":true,"mtu":1500,"mode":"enable_both","names":["a","b"],"ports":[1,2]}') } });
        return App.store.getProject();
      }
      function adapter() { ensureA(); return App.registry.getDataset('android-adb', 'android.tactical'); }
      function captured(p) { return adapter().capturedDefaults(p.deviceConfigs[0].snapshots['android.tactical']); }
      function item(p, key) { return p.items['android.tactical'].filter(function (i) { return i.key === key; })[0]; }
      function fmtFor(p, key) { var c = captured(p)[key]; return VF.resolve(p, item(p, key), c && c.type, c && c.value); }

      s.test('VF-2 every shape infers its editor from the capture, with NO configuration', function () {
        var p = vfProject();
        T.assertEqual(fmtFor(p, 'flag').kind, 'bool');
        T.assertEqual(fmtFor(p, 'mtu').kind, 'number', 'the flattener reports int/float, not "number"');
        T.assertEqual(fmtFor(p, 'mode').kind, 'string');
        T.assertEqual(fmtFor(p, 'names').kind, 'stringArray');
        // An array that is NOT all strings would change JSON type through a text editor,
        // so it stays raw JSON rather than being silently stringified.
        T.assertEqual(fmtFor(p, 'ports').kind, 'json', 'a non-string array must keep JSON fidelity');
      });

      s.test('VF-8 the rendered editor matches the format', function () {
        var p = vfProject();
        var boolHtml = App.ui.tables.renderTableHtml(p, 'android.tactical', { search: 'flag' }, {});
        T.assert(/class="val-edit val-bool"/.test(boolHtml) && /<option value="true" selected>/.test(boolHtml), 'bool should be a true/false picker seeded from the capture');
        var numHtml = App.ui.tables.renderTableHtml(p, 'android.tactical', { search: 'mtu' }, {});
        T.assert(/class="val-edit val-number"[^>]*value="1500"/.test(numHtml), 'number should be a numeric box');
        var listHtml = App.ui.tables.renderTableHtml(p, 'android.tactical', { search: 'names' }, {});
        T.assert(/class="val-edit val-list"/.test(listHtml) && /placeholder="one entry per line"/.test(listHtml), 'a string list should be a one-per-line box');
      });

      s.test('VF-1 display/parseInput are exact inverses for every kind', function () {
        [['bool', true], ['bool', false], ['number', 1500], ['number', 0],
         ['string', 'hello'], ['string', ''], ['stringArray', ['a', 'b']], ['stringArray', []],
         ['json', { a: [1, 2] }]].forEach(function (pair) {
          var fmt = { kind: pair[0] }, val = pair[1];
          var back = VF.parseInput(fmt, VF.display(fmt, val));
          if (back.undecided) { T.assert(val === '' || val === undefined, pair[0] + ': unexpected undecided for ' + JSON.stringify(val)); return; }
          T.assertDeepEqual(back.value, val, pair[0] + ' did not round-trip');
        });
      });

      s.test('VF-1 an empty box means the right thing per kind', function () {
        T.assertEqual(VF.parseInput({ kind: 'bool' }, '').undecided, true, 'blank bool = undecided');
        T.assertEqual(VF.parseInput({ kind: 'number' }, '').undecided, true, 'blank number = undecided');
        T.assertEqual(VF.parseInput({ kind: 'options' }, '').undecided, true, 'blank option = undecided');
        // review-16 #1 is preserved: a blank TEXT box is a real value, not undecided.
        T.assertDeepEqual(VF.parseInput({ kind: 'string' }, ''), { ok: true, value: '', issues: [] });
        // ...and a blank LIST is a real empty list (a dozen Knox whitelists are exactly this).
        T.assertDeepEqual(VF.parseInput({ kind: 'stringArray' }, '').value, []);
      });

      s.test('VF-5 a named options format is reusable across keys and round-trips', function () {
        var p = vfProject();
        var res = App.store.addValueFormat({ name: '5G radio mode', kind: 'options', description: 'How the radio is driven.',
          options: [{ value: 'enable_both', description: 'Both SA and NSA' }, { value: 'disable', description: 'Radio off' }] });
        T.assertEqual(res.ok, true, JSON.stringify(res.issues));
        T.assertEqual(res.id, '5g-radio-mode', 'id should be slugified from the name');
        var ap = App.store.setItemFormats('android.tactical', ['mode'], res.id);
        T.assertEqual(ap.applied, 1);
        var p2 = App.store.getProject();
        T.assertEqual(App.valueFormats.usageCount(p2, res.id), 1);
        var text = App.projectIo.serializeProject(p2);
        var back = App.projectIo.parseProject(text);
        T.assertEqual(back.ok, true, JSON.stringify(back.issues));
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'a project with formats must round-trip byte-identically');
        T.assertDeepEqual(back.value.valueFormats[0].options[0], { value: 'enable_both', description: 'Both SA and NSA' });
        T.assertEqual(item(back.value, 'mode').format, res.id);
      });

      s.test('VF-8 an options format renders a select carrying each option description', function () {
        var p = vfProject();
        var id = App.store.addValueFormat({ name: 'Mode', kind: 'options',
          options: [{ value: 'enable_both', description: 'Both SIM slots active' }, { value: 'disable', description: 'Off' }] }).id;
        App.store.setItemFormats('android.tactical', ['mode'], id);
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', { search: 'mode' }, {});
        T.assert(/class="val-edit val-options"/.test(html), 'expected an options select');
        T.assert(html.indexOf('enable_both — Both SIM slots active') !== -1, 'the option must show its description');
        T.assert(/<option value="enable_both" selected/.test(html), 'the captured value must be pre-selected');
      });

      s.test('VF-7 a value outside its format blocks completeness, with a reason', function () {
        var p = vfProject();
        var id = App.store.addValueFormat({ name: 'Mode', kind: 'options',
          options: [{ value: 'enable_both', description: '' }, { value: 'disable', description: '' }] }).id;
        App.store.setItemFormats('android.tactical', ['mode'], id);
        App.store.setDecision('android.tactical', 'mode', { value: 'nonsense' });
        var p2 = App.store.getProject(), a = adapter(), cap = captured(p2);
        var it = item(p2, 'mode');
        T.assertEqual(a.isComplete(it), true, 'the adapter alone has no opinion about the vocabulary');
        T.assertEqual(App.completeness.itemComplete(a, it, p2, cap), false, 'the format must block completeness');
        var iss = App.completeness.formatIssues(a, it, p2, cap);
        T.assertEqual(iss.length, 1);
        T.assert(/must be one of/.test(iss[0].message), 'got: ' + iss[0].message);
        // ...and the device is therefore not ready.
        T.assertEqual(App.completeness.deviceReadiness(p2, p2.deviceConfigs[0].id).ready, false);
        // A legal value clears it.
        App.store.setDecision('android.tactical', 'mode', { value: 'disable' });
        var p3 = App.store.getProject();
        T.assertEqual(App.completeness.itemComplete(a, item(p3, 'mode'), p3, captured(p3)), true);
      });

      s.test('VF-7 an off-vocabulary value stays visible instead of snapping to a legal one', function () {
        var p = vfProject();
        var id = App.store.addValueFormat({ name: 'Mode', kind: 'options', options: [{ value: 'disable', description: '' }] }).id;
        App.store.setItemFormats('android.tactical', ['mode'], id);
        // The CAPTURED value ('enable_both') is not in the vocabulary.
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', { search: 'mode' }, {});
        T.assert(html.indexOf('enable_both (not an allowed value)') !== -1, 'the mismatch must be shown, not hidden');
      });

      s.test('VF-7 numbers and lists are enforced too', function () {
        var fmtN = { kind: 'number' }, fmtL = { kind: 'stringArray' };
        T.assertEqual(VF.validate(fmtN, 12).length, 0);
        T.assertEqual(VF.validate(fmtN, '12').length, 1, 'a numeric STRING is not a number');
        T.assertEqual(VF.validate(fmtN, 5, 'k').length, 0);
        T.assertEqual(VF.validate({ kind: 'number', min: 10 }, 5).length, 1, 'min must be enforced');
        T.assertEqual(VF.validate({ kind: 'number', max: 1 }, 5).length, 1, 'max must be enforced');
        T.assertEqual(VF.validate(fmtL, ['a']).length, 0);
        T.assertEqual(VF.validate(fmtL, 'a').length, 1, 'a bare string is not a list');
        T.assertEqual(VF.validate(fmtL, [1]).length, 1, 'list entries must be strings');
        T.assertEqual(VF.validate({ kind: 'json' }, { anything: [1, true] }).length, 0, 'json accepts any value');
      });

      s.test('VF-5 deleting a format releases its items rather than breaking them', function () {
        var p = vfProject();
        var id = App.store.addValueFormat({ name: 'Mode', kind: 'options', options: [{ value: 'enable_both', description: '' }] }).id;
        App.store.setItemFormats('android.tactical', ['mode'], id);
        App.store.setDecision('android.tactical', 'mode', { value: 'enable_both' });
        var rm = App.store.removeValueFormat(id);
        T.assertEqual(rm.ok, true);
        var p2 = App.store.getProject();
        T.assertEqual(item(p2, 'mode').format, undefined, 'the dangling ref must be cleared from the item');
        T.assertDeepEqual(item(p2, 'mode').decision, { value: 'enable_both' }, 'the decision itself must be untouched');
        T.assertEqual(fmtFor(p2, 'mode').kind, 'string', 'the item falls back to its inferred format');
      });

      s.test('VF-3 a dangling format ref degrades instead of breaking the project', function () {
        var p = vfProject();
        App.store.setItemFields('android.tactical', 'mode', { format: 'no-such-format' });
        var p2 = App.store.getProject();
        // Still loads...
        var res = App.projectIo.parseProject(App.projectIo.serializeProject(p2));
        T.assertEqual(res.ok, true, 'a dangling format ref must never stop a project opening');
        // ...and resolves to the inferred built-in, flagged so the UI can say so.
        var f = fmtFor(p2, 'mode');
        T.assertEqual(f.kind, 'string');
        T.assertEqual(f.danglingRef, 'no-such-format');
      });

      s.test('VF-3 the schema rejects a malformed format but accepts a well-formed one', function () {
        var p = vfProject();
        App.store.addValueFormat({ name: 'Mode', kind: 'options', options: [{ value: 'x', description: 'y' }] });
        var good = App.store.getProject();
        T.assertEqual(App.projectIo.validateSchema(good).filter(function (i) { return i.severity === 'error'; }).length, 0);
        var bad = JSON.parse(App.projectIo.serializeProject(good));
        bad.valueFormats[0].kind = 'nonsense';
        T.assert(App.projectIo.validateSchema(bad).some(function (i) { return /ValueFormat.kind/.test(i.message) && i.severity === 'error'; }));
        var bad2 = JSON.parse(App.projectIo.serializeProject(good));
        bad2.valueFormats[0].id = 'bool'; // collides with a built-in
        T.assert(App.projectIo.validateSchema(bad2).some(function (i) { return /collides with a built-in/.test(i.message); }));
      });

      s.test('VF-3 the built-in id list is the same in projectIo and App.valueFormats', function () {
        T.assertDeepEqual(App.projectIo.BUILTIN_FORMAT_IDS.slice().sort(),
          App.valueFormats.BUILTINS.map(function (b) { return b.id; }).sort(),
          'the duplicated vocabulary has drifted');
      });

      s.test('VF-4 the row expander offers the picker (value datasets only)', function () {
        var p = vfProject();
        var tac = App.ui.tables.renderTableHtml(p, 'android.tactical', { expanded: { mode: true } }, {});
        T.assert(/data-format-pick/.test(tac), 'no value-format picker in the tactical expander');
        T.assert(/data-format-manage/.test(tac), 'no route into the format manager');
        T.assert(/Automatic — Text \(from the capture\)/.test(tac), 'the automatic option should name the inferred format');
        // Packages decide an ACTION from a closed enum — a value format is meaningless there.
        var pkg = App.ui.tables.renderTableHtml(p, 'android.packages', { expanded: { 'com.a': true } }, {});
        T.assert(pkg.indexOf('data-format-pick') === -1, 'packages must not offer a value format');
      });

      s.test('VF-5 the manager modal lists formats and edits the selected one', function () {
        var p = vfProject();
        var id = App.store.addValueFormat({ name: '5G radio mode', kind: 'options',
          options: [{ value: 'enable_both', description: 'Both SIM slots active' }] }).id;
        var F = App.ui.views.formats;
        T.assertEqual(F.render(), '', 'closed by default');
        F.open(id);
        var html = F.render();
        T.assert(/data-fmt-modal/.test(html) && /data-fmt-close/.test(html), 'no modal/close');
        T.assert(new RegExp('data-fmt-select="' + id + '"').test(html), 'the format is not listed');
        T.assert(/class="fmt-opts"/.test(html), 'no allowed-values table');
        T.assert(html.indexOf('Both SIM slots active') !== -1, 'the option description must be editable');
        T.assert(/data-fmt-opt-add/.test(html) && /data-fmt-new-value/.test(html), 'no way to add another option');
        T.assert(/Used by <strong>0<\/strong> items/.test(html), 'usage count missing');
        F.close();
        T.assertEqual(F.render(), '', 'closed again');
      });

      s.test('VF-8 the device + group OVERRIDE editors use the same format-driven controls', function () {
        var p = vfProject();
        var D = App.ui.views.devices;
        D._dev.collapsed = {};
        var panels = D.renderPanels(App.store.getProject(), 'vf-m1', '');
        // A bool leaf must override via true/false, not a textarea — the two surfaces
        // must not disagree about what an editor for the same value looks like.
        T.assert(/data-ov[^>]*data-fmt-kind="bool"/.test(panels) || /data-fmt-kind="bool"[^>]*data-ov/.test(panels),
          'the device override editor should be format-driven');
        T.assert(/class="val-edit val-bool"/.test(panels), 'a bool override should be a true/false picker');
        // ...and a string list overrides one-per-line.
        T.assert(/class="val-edit val-list"/.test(panels), 'a list override should be a one-per-line box');
      });

      s.test('VF-7 an override that violates the format blocks readiness too', function () {
        var p = vfProject();
        var id = App.store.addValueFormat({ name: 'Mode', kind: 'options', options: [{ value: 'disable', description: '' }] }).id;
        App.store.setItemFormats('android.tactical', ['mode'], id);
        // Decide everything legally first, so only the override can break readiness.
        var cap = captured(App.store.getProject());
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: it.key === 'mode' ? 'disable' : (cap[it.key] ? cap[it.key].value : '') });
        });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        var ready1 = App.completeness.deviceReadiness(App.store.getProject(), 'vf-m1');
        T.assert(ready1.ready, 'baseline should be ready; blocked on ' + JSON.stringify(ready1.reasons));
        // Now override that item with a value outside its vocabulary.
        var ov = App.store.setDeviceOverride('vf-m1', 'android.tactical', 'mode', { value: 'not_allowed' });
        T.assertEqual(ov.ok, true, 'the adapter accepts any string, so the override is stored');
        var ready2 = App.completeness.deviceReadiness(App.store.getProject(), 'vf-m1');
        T.assertEqual(ready2.ready, false, 'an override outside the format must block readiness (OVR-3 + VF-7)');
      });

      s.test('VF-6 real Knox shapes all infer sensibly — no false blocking', function () {
        // The regression that matters: with formats switched on, a device whose every
        // decision is simply the captured value must still reach READY. If inference
        // were wrong anywhere (int/float, empty arrays, the injected imsSettings slots)
        // this fails and generation is blocked for no reason.
        var p = vfProject();
        var a = adapter(), cap = captured(p);
        p.items['android.tactical'].forEach(function (it) {
          var c = cap[it.key];
          App.store.setDecision('android.tactical', it.key, { value: c ? c.value : '' });
        });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        var p2 = App.store.getProject();
        var rdy = App.completeness.deviceReadiness(p2, p2.deviceConfigs[0].id);
        T.assert(rdy.ready, 'deciding every item as captured must reach ready; blocked on: ' + JSON.stringify(rdy.reasons));
      });
    });

    /* ===== SUITES: bulk apply & full-cell hit targets (BULK-1/2) ===== */
    T.suite('BULK-1 apply the selected control to everything SHOWN', function (s) {
      function bulkProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'BK', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages',
            'com.vendor.bluetooth\ncom.vendor.bluetooth.share\ncom.vendor.wifi\ncom.vendor.camera'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM', description: 'Radio off.' }).id;
        return { id: id, project: App.store.getProject() };
      }
      function refs(key) {
        return (App.store.getProject().items['android.packages'].filter(function (i) { return i.key === key; })[0] || {}).controlRefs || [];
      }

      s.test('the plan is exactly the rows the current search shows', function () {
        var w = bulkProject();
        var all = App.ui.model.applyAllShownPlan(w.project, 'android.packages', {}, w.id);
        T.assertEqual(all.items.length, 4, 'no search ⇒ every row');
        var bt = App.ui.model.applyAllShownPlan(w.project, 'android.packages', { search: 'bluetooth' }, w.id);
        T.assertDeepEqual(bt.items.map(function (i) { return i.key; }),
          ['com.vendor.bluetooth', 'com.vendor.bluetooth.share'], 'the search must define the set');
        T.assertEqual(bt.removing, false);
        T.assertEqual(bt.changing, 2, 'both still need the control');
      });

      s.test('it toggles: a second run over the same set removes the control', function () {
        var w = bulkProject();
        var ui = { search: 'bluetooth' };
        // Simulate the click's effect through the same plan the button uses.
        var p1 = App.ui.model.applyAllShownPlan(App.store.getProject(), 'android.packages', ui, w.id);
        p1.items.forEach(function (it) { App.store.setItemFields('android.packages', it.key, { controlRefs: (it.controlRefs || []).concat([w.id]) }); });
        T.assertDeepEqual(refs('com.vendor.bluetooth'), [w.id]);
        T.assertDeepEqual(refs('com.vendor.wifi'), [], 'a row outside the search must be untouched');
        var p2 = App.ui.model.applyAllShownPlan(App.store.getProject(), 'android.packages', ui, w.id);
        T.assertEqual(p2.removing, true, 'all shown already have it ⇒ the next run removes');
        T.assertEqual(p2.changing, 2);
      });

      s.test('the plan honours every filter, not just search', function () {
        var w = bulkProject();
        App.store.setItemFields('android.packages', 'com.vendor.wifi', { relevance: 'IRRELEVANT' });
        var p = App.store.getProject();
        var def = App.ui.model.applyAllShownPlan(p, 'android.packages', {}, w.id);
        T.assertEqual(def.items.length, 3, 'a parked item is hidden, so it must not be acted on');
        // REL-8: Include irrelevant ADDS the parked item, so the plan grows by exactly one.
        var parked = App.ui.model.applyAllShownPlan(p, 'android.packages', { includeRelevance: ['IRRELEVANT'] }, w.id);
        T.assertEqual(parked.items.length, 4, 'the shown set is now everything');
        T.assert(parked.items.some(function (i) { return i.key === 'com.vendor.wifi'; }), 'including the previously parked item');
        App.store.setDecision('android.packages', 'com.vendor.camera', { action: 'keep' });
        var inc = App.ui.model.applyAllShownPlan(App.store.getProject(), 'android.packages', { incompleteOnly: true }, w.id);
        T.assert(inc.items.every(function (i) { return i.key !== 'com.vendor.camera'; }), 'Incomplete-only must narrow it too');
      });

      s.test('BULK-3 the ✓ Apply heading label promises the same count the plan will act on', function () {
        var w = bulkProject();
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var ui = { applyMode: true, applyControlId: w.id, search: 'bluetooth' };
        var shown = App.ui.model.filterSortRows(w.project, 'android.packages', a, ui).length;
        var html = App.ui.tables.renderTableHtml(w.project, 'android.packages', ui, {});
        T.assertEqual(shown, 2);
        T.assert(/<th class="apply-col"[^>]*><button[^>]*data-apply-all="android.packages"/.test(html),
          'the bulk action must live on the tick column heading');
        T.assert(html.indexOf('>✓ Apply all 2</button>') !== -1,
          'the heading must name the shown count, got: ' + html.slice(html.indexOf('apply-col'), html.indexOf('apply-col') + 300));
      });

      s.test('BULK-3 when every shown row already has it, the heading offers removal', function () {
        var w = bulkProject();
        var ui = { applyMode: true, applyControlId: w.id, search: 'bluetooth' };
        App.ui.model.applyAllShownPlan(App.store.getProject(), 'android.packages', ui, w.id).items
          .forEach(function (it) { App.store.setItemFields('android.packages', it.key, { controlRefs: [w.id] }); });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', ui, {});
        T.assert(html.indexOf('>✕ Remove all 2</button>') !== -1, 'the heading must flip to Remove');
        T.assert(/class="apply-col-all danger"/.test(html), 'a removal is destructive — it must be marked');
      });

      s.test('BULK-3 the heading is ONE shared unit, so the in-place refresh cannot drift', function () {
        // A row tick suppresses the full re-render and repaints just this button, so the
        // button the table embeds and the button that refresh writes back must be the
        // same string — otherwise ticking rows by hand leaves the heading lying about
        // what the next click will do.
        var w = bulkProject();
        var ui = { applyMode: true, applyControlId: w.id, search: 'bluetooth' };
        var btn = App.ui.tables.applyHeadButton(w.project, 'android.packages', ui, 2);
        var html = App.ui.tables.renderTableHtml(w.project, 'android.packages', ui, {});
        T.assert(html.indexOf(btn) !== -1, 'the table must embed exactly what the refresh writes back');
      });

      s.test('with no control selected, or nothing shown, the heading is inert', function () {
        var w = bulkProject();
        var noCtl = App.ui.tables.renderTableHtml(w.project, 'android.packages', { applyMode: true }, {});
        T.assert(/data-apply-all="android.packages"[^>]*disabled/.test(noCtl), 'no control ⇒ nothing to apply');
        T.assert(noCtl.indexOf('>✓ Apply</button>') !== -1, 'with no control it is just the column label');
        var nothing = App.ui.tables.renderTableHtml(w.project, 'android.packages', { applyMode: true, applyControlId: w.id, search: 'zzz' }, {});
        T.assert(/data-apply-all="android.packages"[^>]*disabled/.test(nothing), 'nothing shown ⇒ nothing to apply to');
      });
    });

