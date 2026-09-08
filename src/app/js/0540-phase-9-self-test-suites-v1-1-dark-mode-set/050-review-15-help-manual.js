    T.suite('review-15 Help manual', function (s) {
      var Hv = App.ui.views.help;
      s.test('every section renders content and marks itself current in the nav', function () {
        ensureA();
        Hv.SECTIONS.forEach(function (sec) {
          Hv._help.section = sec.id;
          var html = Hv.render(App.store.getProject());
          T.assert(html.length > 1500, 'section "' + sec.id + '" looks empty (' + html.length + ' chars)');
          T.assert(html.indexOf('data-help-sec="' + sec.id + '" aria-current="true"') !== -1, 'section "' + sec.id + '" is not marked current');
          T.assert(!/undefined|\[object Object\]/.test(html), 'section "' + sec.id + '" has placeholder text');
        });
        Hv._help.section = 'overview';
      });
      s.test('an unknown section falls back to Overview instead of blanking', function () {
        Hv._help.section = 'nope';
        var html = Hv.render(null);
        T.assert(/data-help-sec="overview" aria-current="true"/.test(html), 'unknown section must fall back');
        T.assert(/What this tool is/.test(html));
        Hv._help.section = 'overview';
      });
      s.test('it renders with no project loaded (Help is always reachable)', function () {
        Hv._help.section = 'start';
        T.assert(Hv.render(null).indexOf('Getting started') !== -1, 'Help must not need a project');
        Hv._help.section = 'overview';
      });
      s.test('the manual is generated from the live app, not hardcoded copy', function () {
        ensureA(); App.registry.setActivePlatform('android-adb');
        Hv._help.section = 'onboard';
        var onboard = Hv.render(null);
        var pf = App.registry.getActivePlatform();
        T.assert(onboard.indexOf(App.util.html.esc(pf.captureInstructions.slice(0, 40))) !== -1, 'capture instructions must come from the platform profile');
        Hv._help.section = 'tables';
        var tables = Hv.render(null);
        App.projectIo.RELEVANCE_OPTIONS.forEach(function (o) {
          T.assert(tables.indexOf(o) !== -1, 'relevance option "' + o + '" missing from the manual');
        });
        Hv._help.section = 'overview';
        T.assert(Hv.render(null).indexOf(App.util.html.esc(pf.datasets[0].label)) !== -1, 'dataset labels must come from the registry');
      });
      s.test('each feature area is documented somewhere in the manual', function () {
        var all = Hv.SECTIONS.map(function (sec) { Hv._help.section = sec.id; return Hv.render(null); }).join(' ');
        Hv._help.section = 'overview';
        ['Apply Control Mode', 'Delete Mode', 'Undo', 'Redo', 'Security Relevance', 'Device columns',
         'Satisfied', 'override', 'Verification', 'Control report', 'manifest', 'Draft autosave',
         'Export CSV', 'Triage', 'group',
         // v2.1
         'Value format', 'String list', 'Custom options', 'Tools',
         'Apply Tag Mode', 'column heading', 'Column filters', 'Justification'].forEach(function (topic) {
          T.assert(all.indexOf(topic) !== -1, 'the manual never mentions "' + topic + '"');
        });
      });
    });

    // review-16 #1: a value like 'bluetooth,wifi' could not be blanked — emptying the
    // box was read as "no decision", so the item went undecided and the editor
    // re-prefilled the captured value. An empty TEXT box is now a committed blank value.
    T.suite('review-16 #1 blanking a text value', function (s) {
      function r16() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'R16', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"note":"hi"}') } });
        return App.store.getProject();
      }
      var DFR = App.ui.app._decisionFromRaw;
      function adapter(dsId) { ensureA(); return App.registry.getDataset('android-adb', dsId); }

      function noteItem() {
        return App.store.getProject().items['android.tactical'].filter(function (i) { return i.key === 'note'; })[0];
      }

      s.test('an emptied tactical box commits a blank value, not undecided', function () {
        r16();
        var d = DFR(adapter('android.tactical'), { value: { v: '', kind: 'value-typed', vtype: 'string' } });
        T.assertDeepEqual(d, { value: '' }, 'an empty text box must be a blank value');
        var res = App.store.setDecision('android.tactical', 'note', d);
        T.assert(res.ok, 'a blank text value must be valid');
        var it = noteItem();
        T.assertEqual(it.decision.value, '');
        T.assertEqual(it.status, 'decided', 'a blank value is still a decision');
      });
      s.test('an empty package action still means undecided (enum keeps its "—")', function () {
        r16();
        T.assertEqual(DFR(adapter('android.packages'), { action: { v: '', kind: 'enum' } }), null);
        T.assertDeepEqual(DFR(adapter('android.packages'), { action: { v: 'keep', kind: 'enum' } }), { action: 'keep' });
      });
      s.test('the blank value survives a save/load round-trip', function () {
        r16();
        App.store.setDecision('android.tactical', 'note', { value: '' });
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, 'round-trip must parse');
        var note = back.value.items['android.tactical'].filter(function (i) { return i.key === 'note'; })[0];
        T.assertEqual(note.decision.value, '');
      });
      s.test('a blank value is emitted explicitly, not skipped', function () {
        r16();
        App.store.setDecision('android.tactical', 'note', { value: '' });
        var items = App.store.getProject().items['android.tactical'];
        var ctx = { device: { snapshots: App.store.getProject().deviceConfigs[0].snapshots } };
        var out = adapter('android.tactical').generateImplementation(items, ctx);
        var doc = JSON.parse(out[0].content);
        T.assert('note' in doc, 'the blanked key must still be emitted');
        T.assertEqual(doc.note, '', 'expected an explicit empty string, got: ' + JSON.stringify(doc.note));
      });
      s.test('decided text cells offer a clear button; undecided and enum cells do not', function () {
        r16();
        var undec = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', {}, {});
        T.assert(undec.indexOf('data-decision-clear') === -1, 'nothing to clear while undecided');
        App.store.setDecision('android.tactical', 'note', { value: '' });
        var dec = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', {}, {});
        T.assert(/data-decision-clear data-ds="android\.tactical" data-key="note"/.test(dec), 'a decided text cell needs a clear button');
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        var pkg = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(pkg.indexOf('data-decision-clear') === -1, 'enum cells clear via their "—" option');
      });
    });

    // ---- review-17: tab order · clear beside the box · clickable status badge ----
    T.suite('review-17 #1 tab order', function (s) {
      s.test('tabs read Onboard, the data tabs, Devices, Control Manager, Generate, Help', function () {
        ensureA(); App.registry.setActivePlatform('android-adb');
        App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Tabs', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var html = App.ui.app._renderShell();
        var order = [];
        var re = /data-tab="([^"]+)"/g, m;
        while ((m = re.exec(html)) !== null) order.push(m[1]);
        T.assertDeepEqual(order,
          ['onboard', 'android.packages', 'android.tactical', 'android.custom', 'devices', 'controls', 'generate', 'help']);
      });
      s.test('with no project only Onboard and Help are offered, Onboard first', function () {
        ensureA(); App.registry.setActivePlatform('android-adb');
        App.store.init(null);
        var html = App.ui.app._renderShell();
        var order = [];
        var re = /data-tab="([^"]+)"/g, m;
        while ((m = re.exec(html)) !== null) order.push(m[1]);
        T.assertDeepEqual(order, ['onboard', 'help']);
      });
    });

    T.suite('review-17 #2 clear button sits beside the value box', function (s) {
      s.test('a decided text cell wraps box + clear in one flex row', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'R17', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"note":"hi"}') } });
        App.store.setDecision('android.tactical', 'note', { value: 'x' });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', {}, {});
        T.assert(/<div class="dec-row"><textarea [^>]*class="val-edit"[^>]*>[^<]*<\/textarea><button [^>]*class="dec-clear"/.test(html),
          'the value box and the clear button must share one .dec-row');
      });
    });

    T.suite('review-17 #3 the status badge flips the item', function (s) {
      function r17() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'R17', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.getProject();
      }
      /**
       * A stand-in for the badge element and the row around it, so the flip rules are
       * testable without a live table: badge -> <tr> -> the row's td.dcell -> controls.
       * @param {{field:string,kind:string,value:*,vtype?:string}[]} [controls]
       */
      function fakeBadge(dsId, key, controls) {
        function control(c) {
          return {
            type: c.kind === 'bool' ? 'checkbox' : 'textarea',
            value: c.value, checked: !!c.value,
            getAttribute: function (n) {
              return n === 'data-field' ? c.field
                : n === 'data-kind' ? c.kind
                : n === 'data-vtype' ? (c.vtype || null) : null;
            }
          };
        }
        var cell = { tagName: 'TD', querySelectorAll: function () { return (controls || []).map(control); } };
        var row = { tagName: 'TR', parentNode: null, querySelector: function (sel) { return sel === 'td.dcell' ? cell : null; } };
        return { tagName: 'SPAN', parentNode: row, getAttribute: function (n) { return n === 'data-ds' ? dsId : n === 'data-key' ? key : null; } };
      }
      function tacItem(key) {
        return App.store.getProject().items['android.tactical'].filter(function (i) { return i.key === key; })[0];
      }
      s.test('both badge states are rendered as activatable toggles carrying ds+key', function () {
        var p = r17();
        var undec = App.ui.tables.renderTableHtml(p, 'android.tactical', {}, {});
        T.assert(/<span class="badge undecided flip" role="button" tabindex="0" data-status-toggle data-ds="android\.tactical" data-key="enabled"/.test(undec),
          'the undecided badge must be a toggle');
        App.store.setDecision('android.tactical', 'enabled', { value: true });
        var dec = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', {}, {});
        T.assert(/<span class="badge decided flip" role="button" tabindex="0" data-status-toggle data-ds="android\.tactical" data-key="enabled"/.test(dec),
          'the decided badge must be a toggle');
      });
      s.test('AMENDED by HELD-1 — flipping a decided item KEEPS its value', function () {
        r17();
        App.store.setDecision('android.tactical', 'enabled', { value: true });
        App.ui.app._toggleStatus(fakeBadge('android.tactical', 'enabled'));
        var it = tacItem('enabled');
        T.assertEqual(it.status, 'undecided', 'it must read as undecided');
        T.assertDeepEqual(it.decision, { value: true }, 'the recorded value must NOT be wiped');
        T.assertEqual(it.held, true, 'it is held for review');
      });
      s.test('an undecided item adopts the value its editor shows', function () {
        r17();
        App.ui.app._toggleStatus(fakeBadge('android.tactical', 'enabled', [
          { field: 'value', kind: 'value-typed', vtype: 'bool', value: true }
        ]));
        var it = tacItem('enabled');
        T.assertEqual(it.status, 'decided');
        T.assertEqual(it.decision.value, true);
      });
      s.test('an undecided PACKAGE with no selection adopts the first action (keep)', function () {
        r17();
        App.ui.app._toggleStatus(fakeBadge('android.packages', 'com.a', [
          { field: 'action', kind: 'enum', value: '' }
        ]));
        var it = App.store.getProject().items['android.packages'][0];
        T.assertEqual(it.status, 'decided');
        T.assertEqual(it.decision.action, 'keep');
      });
    });

    // review-17 #4: `imsSettings` is optional in the uploaded Knox JSON but must always
    // be decidable — the parser completes the document when the block is absent.
    T.suite('review-17 #4 imsSettings is optional on upload', function (s) {
      function tac() { ensureA(); return App.registry.getDataset('android-adb', 'android.tactical'); }
      var DEFAULT_KEYS = ['imsSettings.simSlot0.enabled', 'imsSettings.simSlot1.enabled'];

      s.test('a document WITHOUT imsSettings gets the default block, with a warning', function () {
        var r = tac().parse('{"enabled":true}');
        T.assertEqual(r.errors.length, 0);
        DEFAULT_KEYS.forEach(function (k) { T.assert(r.keys.indexOf(k) !== -1, 'missing key ' + k); });
        T.assertDeepEqual(r.template.imsSettings, [{ enabled: false, simSlotId: 0 }, { enabled: false, simSlotId: 1 }]);
        T.assert(r.warnings.some(function (w) { return /imsSettings was not in the uploaded document/.test(w.message); }),
          'the injection must be reported, never silent');
      });
      s.test('a document WITH imsSettings is used as captured, no warning', function () {
        var r = tac().parse('{"imsSettings":[{"enabled":true,"simSlotId":0},{"enabled":false,"simSlotId":1}]}');
        var items = {};
        r.items.forEach(function (i) { items[i.key] = i.defaultValue; });
        T.assertEqual(items['imsSettings.simSlot0.enabled'], true);
        T.assertEqual(items['imsSettings.simSlot1.enabled'], false);
        T.assert(!r.warnings.some(function (w) { return /imsSettings/.test(w.message); }), 'nothing to warn about');
      });
      s.test('simSlotId is identity, not a decision — it never becomes an item', function () {
        var r = tac().parse('{"enabled":true}');
        T.assert(!r.keys.some(function (k) { return /simSlotId/.test(k); }), 'simSlotId must not be decidable');
        T.assertEqual(r.keys.filter(function (k) { return k.indexOf('imsSettings') === 0; }).length, 2);
      });
      s.test('decisions rebuild into the original Knox shape', function () {
        var r = tac().parse('{"enabled":true}');
        var out = App.adapters.android.rebuildTacticalDoc(r.template, [
          { key: 'imsSettings.simSlot1.enabled', decision: { value: true }, controlRefs: [], status: 'decided' }
        ]);
        T.assertDeepEqual(out.imsSettings, [{ enabled: false, simSlotId: 0 }, { enabled: true, simSlotId: 1 }]);
      });
      s.test('rebuild re-creates the block on a template that predates it', function () {
        var out = App.adapters.android.rebuildTacticalDoc({ enabled: true }, [
          { key: 'imsSettings.simSlot1.enabled', decision: { value: true }, controlRefs: [], status: 'decided' },
          { key: 'imsSettings.simSlot0.enabled', decision: { value: false }, controlRefs: [], status: 'decided' }
        ]);
        T.assertDeepEqual(out.imsSettings, [{ enabled: false, simSlotId: 0 }, { enabled: true, simSlotId: 1 }]);
      });
      s.test('onboarding surfaces the two slots as undecided register items', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Ims', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var keys = App.store.getProject().items['android.tactical'].map(function (i) { return i.key; }).sort();
        T.assertDeepEqual(keys, ['enabled', 'imsSettings.simSlot0.enabled', 'imsSettings.simSlot1.enabled']);
      });
      s.test('the Devices-tab tactical import also completes the block', function () {
        var a = tac().parseAssignment('{"enabled":true}');
        T.assertEqual(a.errors.length, 0);
        var byKey = {};
        a.assignments.forEach(function (x) { byKey[x.key] = x.decision.value; });
        T.assertEqual(byKey['imsSettings.simSlot0.enabled'], false);
        T.assertEqual(byKey['imsSettings.simSlot1.enabled'], false);
      });
      /** Rewind a fresh project to the pre-review-17 shape: no imsSettings anywhere. */
      function oldProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Old', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var p = App.store.getProject();
        var snap = p.deviceConfigs[0].snapshots['android.tactical'];
        snap.keys = snap.keys.filter(function (k) { return k.indexOf('imsSettings') !== 0; });
        delete snap.template.imsSettings;
        p.items['android.tactical'] = p.items['android.tactical'].filter(function (i) { return i.key.indexOf('imsSettings') !== 0; });
        return App.projectIo.parseProject(App.projectIo.serializeProject(p));
      }
      s.test('a project saved BEFORE this change is completed on load', function () {
        var res = oldProject();
        T.assert(res.ok, 'an older project must still load');
        T.assert(res.issues.some(function (i) { return /imsSettings\.simSlot0\.enabled/.test(i.message); }),
          'the completion must be reported, never silent');
        var dsSnap = res.value.deviceConfigs[0].snapshots['android.tactical'];
        DEFAULT_KEYS.forEach(function (k) { T.assert(dsSnap.keys.indexOf(k) !== -1, 'snapshot key ' + k + ' not completed'); });
        T.assertDeepEqual(dsSnap.template.imsSettings, [{ enabled: false, simSlotId: 0 }, { enabled: false, simSlotId: 1 }]);
        T.assertDeepEqual(res.value.items['android.tactical'].map(function (i) { return i.key; }).sort(),
          ['enabled'].concat(DEFAULT_KEYS));
        T.assert(res.value.items['android.tactical'].every(function (i) { return i.key === 'enabled' || i.status === 'undecided'; }),
          'completed keys must arrive undecided');
      });
      s.test('the import that older projects rejected now matches exactly', function () {
        // The reported symptom: "2 key(s) in the file are not applicable to this device".
        var res = oldProject();
        App.store.init(res.value);
        var out = App.store.applyDeviceAssignment('old-m1', 'android.tactical', tac().parseAssignment('{"enabled":true}'));
        T.assert(out.ok, 'import should match after healing: ' + (out.issues || []).map(function (i) { return i.message; }).join(' | '));
      });
      s.test('completion is idempotent — an already-complete project gains nothing', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'New', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var text = App.projectIo.serializeProject(App.store.getProject());
        var res = App.projectIo.parseProject(text);
        T.assert(res.ok);
        T.assert(!res.issues.some(function (i) { return /imsSettings/.test(i.message); }), 'nothing to complete');
        T.assertEqual(App.projectIo.serializeProject(res.value), text, 'load must not change a complete project');
      });
      s.test('the emitted tactical.json always carries the block', function () {
        var r = tac().parse('{"enabled":true}');
        var art = tac().rebuildArtifact(r.template, []);
        T.assert(art.content.indexOf('"imsSettings"') !== -1, 'imsSettings missing from tactical.json');
        T.assert(art.content.indexOf('"simSlotId": 1') !== -1, 'the second SIM slot is missing');
      });
    });

