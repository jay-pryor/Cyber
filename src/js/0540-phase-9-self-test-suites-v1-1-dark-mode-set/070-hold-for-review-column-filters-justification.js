    T.suite('BULK-2 the tick columns are full-cell hit targets', function (s) {
      function tickProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'TK', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.addControl({ title: 'C', type: 'ISM' }).id;
      }
      s.test('the apply checkbox is wrapped in a cell-filling label', function () {
        var id = tickProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { applyMode: true, applyControlId: id }, {});
        T.assert(/<td class="apply-cell"><label class="cell-check"><input type="checkbox" data-apply-check/.test(html),
          'the checkbox must sit inside a cell-filling <label> so a click anywhere in the cell hits it');
      });
      s.test('the delete checkbox gets the same treatment', function () {
        tickProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { deleteMode: true }, {});
        T.assert(/<td class="del-cell"><label class="cell-check"><input type="checkbox" data-delete-check/.test(html),
          'the delete column should be just as easy to hit');
      });
      s.test('the Control Manager per-device columns get it too', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'CM', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.addControl({ title: 'No BT', type: 'ISM' });
        var html = App.ui.views.controls.render(App.store.getProject());
        T.assert(/<td class="cm-dev-cell"><label class="cell-check"><input type="checkbox" data-ctl-device=/.test(html),
          'the per-device cells must be cell-filling labels like the data tables');
        T.assert(/aria-label="Apply No BT to CM"/.test(html), 'the input must keep its accessible name');
      });
      s.test('it stays a real checkbox (keyboard + screen reader), not a div', function () {
        var id = tickProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', { applyMode: true, applyControlId: id }, {});
        T.assert(/data-apply-check data-key="com.a"[^>]*aria-label=/.test(html), 'the input must keep its accessible name');
        T.assert(/type="checkbox"/.test(html), 'it must remain an <input type=checkbox>');
      });
    });

    /* ===== SUITES: hold-for-review · column filters · justification (HELD-1 · FIL-1 · JUS-1/2) ===== */
    T.suite('HELD-1 flag for review without losing the value', function (s) {
      function heldProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'HD', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.getProject();
      }
      function pkg() { return App.store.getProject().items['android.packages'][0]; }

      s.test('holding keeps the decision and reads as undecided', function () {
        heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        T.assertEqual(pkg().status, 'decided');
        T.assertEqual(App.store.setHeld('android.packages', 'com.a', true).ok, true);
        var it = pkg();
        T.assertDeepEqual(it.decision, { action: 'remove' }, 'THE POINT: the value survives');
        T.assertEqual(it.held, true);
        T.assertEqual(it.status, 'undecided', 'it must read as undecided');
      });

      s.test('a held item blocks device readiness until it is reviewed', function () {
        var p = heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        var cap = App.registry.getDataset('android-adb', 'android.tactical').capturedDefaults(p.deviceConfigs[0].snapshots['android.tactical']);
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: cap[it.key] ? cap[it.key].value : '' });
        });
        T.assertEqual(App.completeness.deviceReadiness(App.store.getProject(), 'hd-m1').ready, true, 'baseline ready');
        App.store.setHeld('android.packages', 'com.a', true);
        var r = App.completeness.deviceReadiness(App.store.getProject(), 'hd-m1');
        T.assertEqual(r.ready, false, 'a held item must block generation — that is what "review later" means');
        T.assertEqual(r.totalUndecided, 1);
        App.store.setHeld('android.packages', 'com.a', false);
        T.assertEqual(App.completeness.deviceReadiness(App.store.getProject(), 'hd-m1').ready, true, 'releasing restores readiness');
      });

      s.test('the badge flip holds rather than wipes, and flips back', function () {
        heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        var badge = { tagName: 'SPAN', parentNode: null, getAttribute: function (n) { return n === 'data-ds' ? 'android.packages' : n === 'data-key' ? 'com.a' : null; } };
        App.ui.app._toggleStatus(badge);
        T.assertDeepEqual(pkg().decision, { action: 'remove' }, 'flipping must not wipe the value');
        T.assertEqual(pkg().held, true);
        App.ui.app._toggleStatus(badge);   // flip back
        T.assertEqual(pkg().held, undefined, 'flipping back releases the hold');
        T.assertEqual(pkg().status, 'decided');
        T.assertDeepEqual(pkg().decision, { action: 'remove' }, 'and the value is still the same one');
      });

      s.test('the held state has its own badge, distinct from never-decided', function () {
        heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        App.store.setHeld('android.packages', 'com.a', true);
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/<span class="badge held flip"[^>]*>review<\/span>/.test(html),
          'a held item needs its own badge so you can tell it from one that was never answered');
      });

      s.test('editing the value releases the hold (editing IS reviewing)', function () {
        heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        App.store.setHeld('android.packages', 'com.a', true);
        App.store.setDecision('android.packages', 'com.a', { action: 'disable' });
        T.assertEqual(pkg().held, undefined, 'a fresh decision clears the review flag');
        T.assertEqual(pkg().status, 'decided');
      });

      s.test('the "clear" button still wipes — hold and clear are different things', function () {
        heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        App.store.setDecision('android.packages', 'com.a', null);
        T.assertEqual(pkg().decision, null, 'clear must still clear');
        T.assertEqual(pkg().held, undefined);
      });

      s.test('holding an item with no value is refused', function () {
        heldProject();
        var res = App.store.setHeld('android.packages', 'com.a', true);
        T.assertEqual(res.ok, false, 'there is nothing to review');
        T.assert(/Nothing to hold/.test(res.issues[0].message));
      });

      s.test('the flag round-trips and is schema-checked', function () {
        heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        App.store.setHeld('android.packages', 'com.a', true);
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assertEqual(back.ok, true, JSON.stringify(back.issues));
        T.assertEqual(back.value.items['android.packages'][0].held, true);
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'must round-trip byte-identically');
        var bad = JSON.parse(text); bad.items['android.packages'][0].held = false;
        T.assert(App.projectIo.validateSchema(bad).some(function (i) { return /held/.test(i.message) && i.severity === 'error'; }),
          'held:false is not canonical — omit it instead');
      });

      s.test('a held item is excluded from generation, like any incomplete item', function () {
        var p = heldProject();
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        var cap = App.registry.getDataset('android-adb', 'android.tactical').capturedDefaults(p.deviceConfigs[0].snapshots['android.tactical']);
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: cap[it.key] ? cap[it.key].value : '' });
        });
        var withIt = App.generate.buildImplementation(App.store.getProject(), 'hd-m1');
        T.assert(/Apply-Package 'com\.a' 'remove'/.test(withIt.files.filter(function (f) { return f.name === 'packages.impl.ps1'; })[0].content), 'baseline should emit the uninstall');
        App.store.setHeld('android.packages', 'com.a', true);
        var held = App.generate.buildImplementation(App.store.getProject(), 'hd-m1');
        T.assert(!/Apply-Package 'com\.a'/.test(held.files.filter(function (f) { return f.name === 'packages.impl.ps1'; })[0].content),
          'a held item must not be acted on until it has been reviewed');
      });
    });

    T.suite('FIL-1 per-column value filters', function (s) {
      function filProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.vendor.bluetooth\ncom.vendor.bluetooth.share\ncom.vendor.wifi\ncom.vendor.camera'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.onboardDevice({ name: 'Bravo', model: 'M2', snapshots: {
          'android.packages': snapB('android.packages', 'com.vendor.bluetooth\ncom.vendor.maps'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.setDecision('android.packages', 'com.vendor.bluetooth', { action: 'remove' });
        App.store.setDecision('android.packages', 'com.vendor.bluetooth.share', { action: 'remove' });
        App.store.setDecision('android.packages', 'com.vendor.wifi', { action: 'disable' });
        App.store.setDecision('android.packages', 'com.vendor.camera', { action: 'keep' });
        App.store.setItemFields('android.packages', 'com.vendor.bluetooth', { relevance: 'HIGH' });
        return App.store.getProject();
      }
      function adapter() { ensureA(); return App.registry.getDataset('android-adb', 'android.packages'); }
      function keys(ui) {
        return App.ui.model.filterSortRows(App.store.getProject(), 'android.packages', adapter(), ui)
          .map(function (r) { return r.item.key; });
      }

      s.test('the filterable columns are discovered from the adapter, not hardcoded', function () {
        var p = filProject();
        var cols = App.ui.model.filterableColumns(p, 'android.packages', adapter()).map(function (c) { return c.key; });
        T.assertDeepEqual(cols, ['decision', 'relevance', 'appliesTo', 'status'],
          'packages has an enum decision field; no controls exist yet, so no Control Refs filter');
        var tac = App.registry.getDataset('android-adb', 'android.tactical');
        var tcols = App.ui.model.filterableColumns(p, 'android.tactical', tac).map(function (c) { return c.key; });
        T.assert(tcols.indexOf('decision') === -1, 'tactical has no enum decision field, so no Action filter');
        T.assert(tcols.indexOf('relevance') !== -1 && tcols.indexOf('status') !== -1, 'the generic ones still apply');
      });

      s.test('filtering by Action shows only that action', function () {
        filProject();
        T.assertDeepEqual(keys({ colFilters: { decision: 'remove' } }),
          ['com.vendor.bluetooth', 'com.vendor.bluetooth.share']);
        T.assertDeepEqual(keys({ colFilters: { decision: 'keep' } }), ['com.vendor.camera']);
      });

      s.test('THE ASK: filter to removed, then search bluetooth on top of it', function () {
        filProject();
        T.assertDeepEqual(keys({ colFilters: { decision: 'remove' }, search: 'bluetooth' }),
          ['com.vendor.bluetooth', 'com.vendor.bluetooth.share'], 'filter + search must compose');
        // ...and the search alone would have caught a kept package too, proving the
        // filter is doing work rather than the search doing it all.
        T.assertDeepEqual(keys({ colFilters: { decision: 'disable' }, search: 'bluetooth' }), [],
          'no disabled package matches bluetooth');
      });

      s.test('filtering by Security Relevance, including "not set"', function () {
        filProject();
        T.assertDeepEqual(keys({ colFilters: { relevance: 'HIGH' } }), ['com.vendor.bluetooth']);
        var unset = keys({ colFilters: { relevance: App.ui.model.FILTER_NONE } });
        T.assert(unset.indexOf('com.vendor.bluetooth') === -1, 'the tagged item must be excluded');
        T.assert(unset.length === 4, 'the other four are untagged, got ' + unset.length);
      });

      s.test('filtering by Applies to narrows to one device\'s items', function () {
        filProject();
        T.assertDeepEqual(keys({ colFilters: { appliesTo: 'Bravo' } }).sort(),
          ['com.vendor.bluetooth', 'com.vendor.maps']);
      });

      s.test('filtering by Status covers decided, undecided and review', function () {
        filProject();
        T.assertDeepEqual(keys({ colFilters: { status: 'undecided' } }), ['com.vendor.maps']);
        T.assertEqual(keys({ colFilters: { status: 'decided' } }).length, 4);
        App.store.setHeld('android.packages', 'com.vendor.camera', true);
        T.assertDeepEqual(keys({ colFilters: { status: 'held' } }), ['com.vendor.camera'], 'held is its own status');
        T.assertEqual(keys({ colFilters: { status: 'decided' } }).length, 3, 'a held item is no longer decided');
      });

      s.test('several filters compose (AND), and no filter means no filtering', function () {
        filProject();
        T.assertDeepEqual(keys({ colFilters: { decision: 'remove', appliesTo: 'Bravo' } }), ['com.vendor.bluetooth']);
        T.assertEqual(keys({}).length, 5, 'an empty filter map must not filter');
        T.assertEqual(keys({ colFilters: {} }).length, 5);
      });

      s.test('the filters compose with the parked toggles too', function () {
        filProject();
        App.store.setItemFields('android.packages', 'com.vendor.wifi', { relevance: 'IRRELEVANT' });
        T.assertDeepEqual(keys({ colFilters: { decision: 'disable' } }), [], 'a parked item stays hidden by default');
        T.assertDeepEqual(keys({ colFilters: { decision: 'disable' }, includeRelevance: ['IRRELEVANT'] }), ['com.vendor.wifi'],
          'including it brings it back, and the column filter still applies to it');
      });

      s.test('the table renders a filter row with a select per filterable column', function () {
        var p = filProject();
        var html = App.ui.tables.renderTableHtml(p, 'android.packages', {}, {});
        T.assert(/<tr class="filter-row">/.test(html), 'no filter row');
        T.assert(/data-col-filter="android.packages" data-col="decision"/.test(html), 'no Action filter');
        T.assert(/data-col-filter="android.packages" data-col="relevance"/.test(html), 'no Relevance filter');
        T.assert(/data-col-filter="android.packages" data-col="appliesTo"/.test(html), 'no Applies-to filter');
        T.assert(/data-col-filter="android.packages" data-col="status"/.test(html), 'no Status filter');
        T.assert(/<option value="remove">remove<\/option>/.test(html), 'the Action options come from the schema');
        // An active filter is visibly marked and offers a clear.
        var on = App.ui.tables.renderTableHtml(p, 'android.packages', { colFilters: { decision: 'remove' } }, {});
        T.assert(/class="col-filter on"/.test(on), 'an active filter must be tinted');
        T.assert(/data-col-filter-clear="android.packages"/.test(on), 'no way to clear the filters');
      });

      s.test('the toolbar says when filters are narrowing the view', function () {
        var p = filProject();
        var a = adapter();
        var ui = { colFilters: { decision: 'remove' } };
        var shown = App.ui.model.filterSortRows(p, 'android.packages', a, ui).length;
        var tb = App.ui.tables.renderToolbar('android.packages', ui, 5, shown, p.controls);
        T.assert(/1 column filter active/.test(tb), 'the table must not just look mysteriously short');
      });

      s.test('bulk apply-to-all-shown honours the column filters', function () {
        var p = filProject();
        var id = App.store.addControl({ title: 'Debloat', type: 'AHG' }).id;
        // THE point of composing: filter to removed + search bluetooth, then tag them all.
        var plan = App.ui.model.applyAllShownPlan(App.store.getProject(), 'android.packages',
          { colFilters: { decision: 'remove' }, search: 'bluetooth' }, id);
        T.assertDeepEqual(plan.items.map(function (i) { return i.key; }),
          ['com.vendor.bluetooth', 'com.vendor.bluetooth.share']);
      });

      // ---- FIL-2: the Control Refs column gets a filter too ----------------------
      // "Show me every action assigned to this control" — reviewing a control's coverage
      // in the register itself, rather than counting rows in the Control Manager.
      function tagged() {
        filProject();
        var bt = App.store.addControl({ title: 'No Bluetooth', type: 'ISM' }).id;
        var db = App.store.addControl({ title: 'Debloat', type: 'AHG' }).id;
        App.store.setItemFields('android.packages', 'com.vendor.bluetooth', { controlRefs: [bt] });
        App.store.setItemFields('android.packages', 'com.vendor.bluetooth.share', { controlRefs: [bt, db] });
        App.store.setItemFields('android.packages', 'com.vendor.wifi', { controlRefs: [db] });
        return { bt: bt, db: db, project: App.store.getProject() };
      }

      s.test('FIL-2 Control Refs is filterable once the project has controls', function () {
        var w = tagged();
        var cols = App.ui.model.filterableColumns(w.project, 'android.packages', adapter());
        var f = cols.filter(function (c) { return c.key === 'controlRefs'; })[0];
        T.assert(!!f, 'no Control Refs filter');
        T.assertEqual(f.label, 'Control Refs', 'it must use the adapter\'s own column label');
        // Offered by TITLE (what the cell shows) but valued by ID (what the item stores),
        // sorted, with every control offered — not only the ones already used here.
        T.assertDeepEqual(f.options.map(function (o) { return o.label; }),
          ['Debloat', 'No Bluetooth', '(none assigned)']);
        T.assertEqual(f.options[1].value, w.bt, 'the option value must be the control id');
        // ...and tactical gets it too: this is dataset-agnostic, like every other filter.
        var tac = App.registry.getDataset('android-adb', 'android.tactical');
        T.assert(App.ui.model.filterableColumns(w.project, 'android.tactical', tac)
          .some(function (c) { return c.key === 'controlRefs'; }), 'tactical must offer it as well');
      });

      s.test('FIL-2 THE ASK: filtering by a control lists every action assigned to it', function () {
        var w = tagged();
        T.assertDeepEqual(keys({ colFilters: { controlRefs: w.bt } }),
          ['com.vendor.bluetooth', 'com.vendor.bluetooth.share']);
        T.assertDeepEqual(keys({ colFilters: { controlRefs: w.db } }),
          ['com.vendor.bluetooth.share', 'com.vendor.wifi'], 'an item with two controls answers to both');
        var none = keys({ colFilters: { controlRefs: App.ui.model.FILTER_NONE } });
        T.assertDeepEqual(none, ['com.vendor.camera', 'com.vendor.maps'], '"(none assigned)" is the gap list');
      });

      s.test('FIL-2 it composes with the other filters and the search', function () {
        var w = tagged();
        T.assertDeepEqual(keys({ colFilters: { controlRefs: w.bt, decision: 'remove' } }),
          ['com.vendor.bluetooth', 'com.vendor.bluetooth.share']);
        T.assertDeepEqual(keys({ colFilters: { controlRefs: w.db }, search: 'wifi' }), ['com.vendor.wifi']);
        T.assertDeepEqual(keys({ colFilters: { controlRefs: w.bt, appliesTo: 'Bravo' } }), ['com.vendor.bluetooth'],
          'Bravo does not hold bluetooth.share');
      });

      s.test('FIL-2 the filter row renders a Control Refs select under its own column', function () {
        var w = tagged();
        var html = App.ui.tables.renderTableHtml(w.project, 'android.packages', {}, {});
        T.assert(/data-col-filter="android.packages" data-col="controlRefs"/.test(html), 'no Control Refs filter');
        T.assert(html.indexOf('<option value="' + w.bt + '">No Bluetooth</option>') !== -1,
          'the options must read as control titles');
        var on = App.ui.tables.renderTableHtml(w.project, 'android.packages', { colFilters: { controlRefs: w.bt } }, {});
        T.assert(/class="col-filter on"/.test(on), 'an active filter must be tinted here too');
      });
    });

