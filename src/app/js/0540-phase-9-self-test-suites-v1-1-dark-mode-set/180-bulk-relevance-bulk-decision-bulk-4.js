    // ---- BULK-4: bulk Security Relevance + bulk decision ------------------------
    // Two more rail modes, sharing one tick column because they are the same gesture
    // over a different field. The decision mode is offered only where the adapter
    // declares an ENUM primary decision — discovered, never a dataset id.
    /* ===== SUITES: bulk relevance & bulk decision (BULK-4) ===== */
    T.suite('BULK-4 applying a relevance or a decision to many rows', function (s) {
      var TB = App.ui.tables;
      function bulk4() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'B4', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b\ncom.c'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.registry.getDataset('android-adb', 'android.packages');
      }
      function toolbar(ui, adapter) {
        return TB.renderToolbar('android.packages', ui, 3, 3, [], null, adapter, App.store.getProject());
      }
      function table(ui) {
        return TB.renderTableHtml(App.store.getProject(), 'android.packages', ui, {});
      }

      s.test('the enum decision field is discovered from the adapter, not named', function () {
        bulk4();
        var f = TB.enumDecisionField(App.registry.getDataset('android-adb', 'android.packages'));
        T.assertEqual(f && f.name, 'action');
        T.assertDeepEqual(f.options, ['keep', 'disable', 'remove']);
        T.assertEqual(TB.enumDecisionField(App.registry.getDataset('android-adb', 'android.tactical')), null,
          'a value-typed decision offers nothing a picker could bulk-apply');
      });

      s.test('both buttons appear on packages; only relevance where there is no enum', function () {
        var a = bulk4();
        var html = toolbar({}, a);
        T.assert(/data-relevance-toggle="android.packages"/.test(html), 'no Apply Security Relevance button');
        T.assert(/data-decision-toggle="android.packages"/.test(html), 'no Apply Decision button');
        T.assert(html.indexOf('Apply Security Relevance') !== -1 && html.indexOf('Apply Decision') !== -1, 'buttons must be labelled plainly');
        var tac = TB.renderToolbar('android.tactical', {}, 1, 1, [], null,
          App.registry.getDataset('android-adb', 'android.tactical'), App.store.getProject());
        T.assert(/data-relevance-toggle/.test(tac), 'relevance is a core column, so it applies everywhere');
        T.assertEqual(tac.indexOf('data-decision-toggle'), -1, 'Apply Decision must not be offered without an enum decision');
      });

      s.test('the spec describes both modes the same way', function () {
        var a = bulk4();
        var rel = TB.valueApplySpec(a, { relevanceMode: true, relevanceValue: 'HIGH' });
        T.assertEqual(rel.mode, 'relevance');
        T.assertDeepEqual(rel.options.map(function (o) { return o.value; }), App.projectIo.RELEVANCE_OPTIONS);
        T.assertEqual(rel.read({ relevance: 'HIGH' }), 'HIGH');
        T.assertEqual(rel.read({}), '', 'an unset field reads as empty, never undefined');
        var dec = TB.valueApplySpec(a, { decisionMode: true, decisionValue: 'disable' });
        T.assertEqual(dec.mode, 'decision');
        T.assertEqual(dec.field, 'action');
        T.assertDeepEqual(dec.options.map(function (o) { return o.value; }), ['keep', 'disable', 'remove']);
        T.assertEqual(dec.read({ decision: { action: 'keep' } }), 'keep');
        T.assertEqual(dec.read({ decision: null }), '');
        T.assertEqual(TB.valueApplySpec(a, {}), null, 'no mode armed ⇒ no spec');
        T.assertEqual(TB.valueApplySpec(App.registry.getDataset('android-adb', 'android.tactical'), { decisionMode: true }), null,
          'the decision mode cannot be armed where there is no enum');
      });

      s.test('the modes are mutually exclusive, and each says which to leave', function () {
        bulk4();
        T.assertEqual(TB.blockedBy({}, 'relevance'), null, 'nothing blocks it on a clean table');
        T.assertEqual(TB.blockedBy({ applyMode: true }, 'relevance'), 'Exit Apply Control Mode first');
        T.assertEqual(TB.blockedBy({ decisionMode: true }, 'relevance'), 'Exit Apply Decision Mode first');
        T.assertEqual(TB.blockedBy({ relevanceMode: true }, 'decision'), 'Exit Apply Security Relevance Mode first');
        T.assertEqual(TB.blockedBy({ deleteMode: true }, 'relevance'), 'Finish or cancel Delete Mode first');
        T.assertEqual(TB.blockedBy({ relevanceMode: true }, 'delete'), 'Exit Apply Security Relevance Mode first');
        // The pre-existing pairs must read exactly as they always did.
        T.assertEqual(TB.blockedBy({ assignMode: true }, 'apply'), 'Exit Assign to Device Mode first');
        T.assertEqual(TB.blockedBy({ applyMode: true }, 'delete'), 'Exit Apply Control Mode first');
        T.assertEqual(TB.blockedBy({ relevanceMode: true }, 'relevance'), null, 'a mode never blocks itself');
      });

      s.test('the rail offers a chip per value, and the tick column follows the picked one', function () {
        var a = bulk4();
        var off = toolbar({ relevanceMode: true }, a);
        T.assertEqual((off.match(/data-rail-value="/g) || []).length, App.projectIo.RELEVANCE_OPTIONS.length, 'one chip per value');
        T.assert(/data-rail-value="HIGH"[^>]*aria-pressed="false"/.test(off), 'nothing picked to begin with');
        var on = toolbar({ relevanceMode: true, relevanceValue: 'HIGH' }, a);
        T.assert(/class="val-chip active" data-rail-value="HIGH"/.test(on), 'the picked chip is marked');
        T.assert(/Unticking a row clears its relevance/.test(on), 'the rail must say that unticking clears');
      });

      s.test('the tick column is only there while a mode is armed, and reflects each row', function () {
        bulk4();
        T.assertEqual(table({}).indexOf('data-value-check'), -1, 'no column with no mode armed');
        App.store.setItemFields('android.packages', 'com.b', { relevance: 'HIGH' });
        var html = table({ relevanceMode: true, relevanceValue: 'HIGH' });
        T.assert(/<th class="val-col"/.test(html), 'the column header is missing');
        T.assertEqual((html.match(/data-value-check/g) || []).length, 3, 'one box per row');
        T.assert(/data-value-check data-key="com.b" checked/.test(html), 'a row already carrying the value must read ticked');
        T.assert(/data-value-check data-key="com.a"(?! checked)/.test(html), 'and one that does not, unticked');
        var noPick = table({ relevanceMode: true });
        T.assert(/data-value-check data-key="com.a" disabled/.test(noPick), 'boxes are dead until a value is picked');
      });

      s.test('the heading promises the count it will act on, and flips to Clear', function () {
        var a = bulk4();
        var p = App.store.getProject();
        T.assert(/✓ Set</.test(TB.valueHeadButton(p, 'android.packages', { relevanceMode: true }, 3, a)), 'no value ⇒ a plain "✓ Set"');
        T.assert(/disabled/.test(TB.valueHeadButton(p, 'android.packages', { relevanceMode: true }, 3, a)), 'and it is disabled');
        var some = TB.valueHeadButton(p, 'android.packages', { relevanceMode: true, relevanceValue: 'HIGH' }, 3, a);
        T.assert(/✓ Set all 3/.test(some), 'wrong label: ' + some);
        ['com.a', 'com.b', 'com.c'].forEach(function (k) { App.store.setItemFields('android.packages', k, { relevance: 'HIGH' }); });
        var all = TB.valueHeadButton(App.store.getProject(), 'android.packages', { relevanceMode: true, relevanceValue: 'HIGH' }, 3, a);
        T.assert(/✕ Clear all 3/.test(all), 'all rows already carrying it ⇒ the click clears: ' + all);
        T.assert(/danger/.test(all), 'and it is styled as destructive');
      });

      s.test('the plan is exactly the shown set, so every filter narrows it', function () {
        bulk4();
        var p = App.store.getProject();
        var spec = TB.valueApplySpec(App.registry.getDataset('android-adb', 'android.packages'), { relevanceMode: true, relevanceValue: 'HIGH' });
        var all = App.ui.model.valueAllShownPlan(p, 'android.packages', {}, spec.read, 'HIGH');
        T.assertEqual(all.items.length, 3);
        T.assertEqual(all.changing, 3);
        T.assertEqual(all.removing, false);
        var one = App.ui.model.valueAllShownPlan(p, 'android.packages', { search: 'com.b' }, spec.read, 'HIGH');
        T.assertDeepEqual(one.items.map(function (i) { return i.key; }), ['com.b'], 'the search must narrow the plan');
        T.assertEqual(App.ui.model.valueAllShownPlan(p, 'android.packages', {}, spec.read, null).items.length, 0,
          'no value picked ⇒ nothing to act on');
      });

      s.test('CTLSORT-1: the control list orders A→Z by default, or clusters by type', function () {
        bulk4();
        var TBt = App.ui.tables;
        App.store.addControl({ title: 'Zulu', type: 'AHG' });
        App.store.addControl({ title: 'Alpha', type: 'ISM' });
        App.store.addControl({ title: 'Bravo', type: 'AHG' });
        var all = App.store.getProject().controls;
        function titles(ui) { return TBt.railControls(all, ui).map(function (c) { return c.title; }); }
        T.assertEqual(TBt.railSortId({}), 'az', 'A→Z is the default');
        T.assertEqual(TBt.railSortId({ railSort: 'nonsense' }), 'az', 'an unknown order falls back rather than blanking the list');
        T.assertDeepEqual(titles({}), ['Alpha', 'Bravo', 'Zulu']);
        T.assertDeepEqual(titles({ railSort: 'type' }), ['Bravo', 'Zulu', 'Alpha'],
          'AHG before ISM, alphabetical inside each');
        var groups = TBt.railGroups(TBt.railControls(all, { railSort: 'type' }), { railSort: 'type' });
        T.assertDeepEqual(groups.map(function (g) { return g.label; }), ['AHG', 'ISM'], 'one labelled group per type');
        T.assertDeepEqual(groups[0].items.map(function (c) { return c.title; }), ['Bravo', 'Zulu']);
        var flat = TBt.railGroups(TBt.railControls(all, {}), {});
        T.assertEqual(flat.length, 1);
        T.assertEqual(flat[0].label, null, 'A→Z is one unlabelled run, not a group per letter');
        T.assertDeepEqual(TBt.railGroups([], {}), [], 'an empty list is no groups at all');
      });

      s.test('CTLSORT-1: the tag filter narrows the list, and composes with the text filter', function () {
        bulk4();
        var TBt = App.ui.tables;
        App.store.addControl({ title: 'Alpha', type: 'ISM', tags: ['essential-eight'] });
        App.store.addControl({ title: 'Bravo', type: 'AHG', tags: ['essential-eight', 'tactical'] });
        App.store.addControl({ title: 'Charlie', type: 'AHG', description: 'alpha-ish', tags: ['tactical'] });
        App.store.addControl({ title: 'Delta', type: 'ISM' });
        var all = App.store.getProject().controls;
        function titles(ui) { return TBt.railControls(all, ui).map(function (c) { return c.title; }); }
        T.assertDeepEqual(titles({ railTag: 'essential-eight' }), ['Alpha', 'Bravo']);
        T.assertDeepEqual(titles({ railTag: 'tactical' }), ['Bravo', 'Charlie'],
          'a control with two tags appears under either — as a filter, never twice in one list');
        T.assertDeepEqual(titles({ railTag: TBt.RAIL_TAG_NONE }), ['Delta'], 'the untagged option');
        T.assertDeepEqual(titles({ railTag: 'nope' }), [], 'an unknown tag matches nothing rather than everything');
        T.assertDeepEqual(titles({ railTag: 'tactical', search: 'alpha' }), ['Bravo', 'Charlie'],
          'the rail search box is railSearch, not search — an unrelated key must not filter');
        T.assertDeepEqual(titles({ railTag: 'tactical', railSearch: 'alpha' }), ['Charlie'],
          'text and tag filters AND together (Charlie matches on its description)');
        T.assertDeepEqual(titles({ railTag: 'essential-eight', railSort: 'type' }), ['Bravo', 'Alpha'],
          'the tag filter and the order compose');
      });

      s.test('CTLSORT-1: the rail renders both selectors, and the type headings', function () {
        var a = bulk4();
        App.store.addControl({ title: 'Alpha', type: 'ISM', tags: ['essential-eight'] });
        App.store.addControl({ title: 'Bravo', type: 'AHG' });
        var all = App.store.getProject().controls;
        var html = TB.renderToolbar('android.packages', { applyMode: true }, 3, 3, all, null, a, App.store.getProject());
        T.assert(/data-rail-sort="android.packages"/.test(html), 'no order selector');
        T.assert(/<option value="az" selected>A→Z<\/option>/.test(html), 'A→Z must be the selected default');
        T.assert(/<option value="type">By type<\/option>/.test(html), 'By type must be offered');
        T.assert(/data-rail-tag="android.packages"/.test(html), 'no tag filter');
        T.assert(/<option value="">any tag<\/option>/.test(html), 'the tag filter must default to "any tag"');
        T.assert(/>essential-eight<\/option>/.test(html), 'the project\'s tags must be offered');
        T.assert(/>\(untagged\)<\/option>/.test(html), 'and an untagged option');
        T.assertEqual(html.indexOf('ctl-group'), -1, 'A→Z shows no group headings');
        var byType = TB.renderToolbar('android.packages', { applyMode: true, railSort: 'type' }, 3, 3, all, null, a, App.store.getProject());
        T.assert(/<div class="ctl-group">AHG<\/div>/.test(byType) && /<div class="ctl-group">ISM<\/div>/.test(byType), 'type headings missing');
        T.assert(byType.indexOf('<div class="ctl-group">AHG</div>') < byType.indexOf('<div class="ctl-group">ISM</div>'), 'headings out of order');
        // A project with no tags at all gets no tag selector rather than an empty one.
        var untagged = TB.renderToolbar('android.packages', { applyMode: true }, 3, 3,
          [{ id: 'x', title: 'X', type: 'ISM', description: '' }], null, a, App.store.getProject());
        T.assertEqual(untagged.indexOf('data-rail-tag'), -1, 'no tags in the project ⇒ no tag filter');
        T.assert(/data-rail-sort/.test(untagged), 'but the order selector stays');
      });

      s.test('CTLSORT-1: an active tag filter is marked, and the count reflects it', function () {
        var a = bulk4();
        App.store.addControl({ title: 'Alpha', type: 'ISM', tags: ['e8'] });
        App.store.addControl({ title: 'Bravo', type: 'AHG' });
        var all = App.store.getProject().controls;
        var on = TB.renderToolbar('android.packages', { applyMode: true, railTag: 'e8' }, 3, 3, all, null, a, App.store.getProject());
        T.assert(/class="rail-select on" data-rail-tag/.test(on), 'an active tag filter must be visibly on');
        T.assert(/1 of 2 shown/.test(on), 'the count must follow the filter: ' + (on.match(/\d+ of \d+ shown/) || ''));
      });

      s.test('the decision column reads the enum through the same machinery', function () {
        bulk4();
        App.store.setDecision('android.packages', 'com.a', { action: 'disable' });
        var html = table({ decisionMode: true, decisionValue: 'disable' });
        T.assert(/data-value-check data-key="com.a" checked/.test(html), 'a row already decided that way must read ticked');
        T.assert(/data-value-check data-key="com.b"(?! checked)/.test(html), 'a differently-decided or undecided row must not');
        var plan = App.ui.model.valueAllShownPlan(App.store.getProject(), 'android.packages', {},
          TB.valueApplySpec(App.registry.getDataset('android-adb', 'android.packages'), { decisionMode: true, decisionValue: 'disable' }).read, 'disable');
        T.assertEqual(plan.changing, 2, 'two of the three still need it');
      });
    });

    /* ===== SUITES: a sort you can turn off (SORT-1) ===== */
    T.suite('SORT-1 a column heading cycles ascending, descending, off', function (s) {
      var TB = App.ui.tables, M = App.ui.model;
      /** Three packages whose REGISTER order is deliberately not their key order. */
      function reg() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'S1', model: 'M1', firmware: 'F', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b\ncom.c'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store._commit(function (p) { p.items['android.packages'].reverse(); });
        return App.registry.getDataset('android-adb', 'android.packages');
      }
      function keys(ui, a) {
        return M.filterSortRows(App.store.getProject(), 'android.packages', a, ui).map(function (r) { return r.item.key; });
      }

      s.test('the cycle is three states, and a different column restarts it', function () {
        T.assertDeepEqual(M.nextSort({ sortKey: 'key', sortDir: 'asc' }, 'key'), { sortKey: 'key', sortDir: 'desc' },
          'first click on the sorted column flips it');
        T.assertDeepEqual(M.nextSort({ sortKey: 'key', sortDir: 'desc' }, 'key'), { sortKey: M.SORT_NONE, sortDir: 'asc' },
          'the second click takes the rule away rather than flipping back');
        T.assertEqual(M.SORT_NONE, '', 'off is the empty key');
        T.assertDeepEqual(M.nextSort({ sortKey: M.SORT_NONE, sortDir: 'asc' }, 'key'), { sortKey: 'key', sortDir: 'asc' },
          'and a fourth click starts the cycle over');
        T.assertDeepEqual(M.nextSort({ sortKey: 'key', sortDir: 'desc' }, 'status'), { sortKey: 'status', sortDir: 'asc' },
          'the cycle belongs to the column: another heading starts at ascending');
        T.assertDeepEqual(M.nextSort({}, 'status'), { sortKey: 'status', sortDir: 'asc' },
          'an untouched table sorts by key, so any other heading is a fresh column');
        T.assertDeepEqual(M.nextSort({}, 'key'), { sortKey: 'key', sortDir: 'desc' },
          '…and the key heading is the one already in force');
      });

      s.test('off is register order, not another sort', function () {
        var a = reg();
        T.assertDeepEqual(keys({ sortKey: 'key', sortDir: 'asc' }, a), ['com.a', 'com.b', 'com.c']);
        T.assertDeepEqual(keys({ sortKey: 'key', sortDir: 'desc' }, a), ['com.c', 'com.b', 'com.a']);
        T.assertDeepEqual(keys({ sortKey: '' }, a), ['com.c', 'com.b', 'com.a'],
          'with no rule the rows keep the order the register holds them in');
        // The tiebreak on key is part of the RULE, so turning the rule off must take it
        // with it — otherwise "off" would quietly be one more sort by key.
        App.store.setItemFields('android.packages', 'com.b', { relevance: 'HIGH' });
        T.assertDeepEqual(keys({ sortKey: 'relevance', sortDir: 'asc' }, a), ['com.b', 'com.a', 'com.c'],
          'sorted, ties fall back to the key');
        T.assertDeepEqual(keys({ sortKey: '' }, a), ['com.c', 'com.b', 'com.a'], 'unsorted, they do not');
      });

      s.test('saying nothing still means sort by key, so no caller changes behaviour', function () {
        var a = reg();
        T.assertEqual(M.sortKeyOf({}), 'key');
        T.assertEqual(M.sortKeyOf(null), 'key');
        T.assertEqual(M.sortKeyOf({ sortKey: null }), 'key');
        T.assertEqual(M.sortKeyOf({ sortKey: '' }), '', 'an empty key is a decision, not an omission');
        T.assertDeepEqual(keys({}, a), ['com.a', 'com.b', 'com.c'], 'the historical default is untouched');
      });

      s.test('an unsorted table still searches and filters', function () {
        var a = reg();
        T.assertDeepEqual(keys({ sortKey: '', search: 'com.' }, a), ['com.c', 'com.b', 'com.a']);
        T.assertDeepEqual(keys({ sortKey: '', search: 'com.b' }, a), ['com.b'],
          'the search narrows an unsorted table the same way');
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'IRRELEVANT' });
        T.assertDeepEqual(keys({ sortKey: '' }, a), ['com.c', 'com.b'], 'parked rows are still parked');
      });

      s.test('no heading is marked while the sort is off', function () {
        reg();
        function html(ui) { return TB.renderTableHtml(App.store.getProject(), 'android.packages', ui, {}); }
        var asc = html({ sortKey: 'key', sortDir: 'asc' });
        T.assert(/data-col="key"[^>]*>[^<]*<span class="arrow">▲<\/span>/.test(asc), 'ascending must show ▲');
        T.assert(/<span class="arrow">▼<\/span>/.test(html({ sortKey: 'key', sortDir: 'desc' })), 'descending must show ▼');
        var off = html({ sortKey: '', sortDir: 'asc' });
        T.assertEqual(off.indexOf('class="arrow"'), -1, 'with no rule in force, nothing is marked as sorted');
        T.assert(off.indexOf('data-col="key"') !== -1, 'the headings themselves stay clickable');
      });

      s.test('the heading says what the next click will do', function () {
        reg();
        T.assert(/sort by this column, ascending/.test(TB.sortHint({ sortKey: 'key', sortDir: 'asc' }, 'status')),
          'an unsorted column promises ascending');
        T.assert(/sort by this column, descending/.test(TB.sortHint({ sortKey: 'key', sortDir: 'asc' }, 'key')),
          'an ascending column promises descending');
        T.assert(/register order/.test(TB.sortHint({ sortKey: 'key', sortDir: 'desc' }, 'key')),
          'a descending column must say the next click takes the rule away');
        var html = TB.renderTableHtml(App.store.getProject(), 'android.packages', { sortKey: 'key', sortDir: 'desc' }, {});
        T.assert(/<th data-col="key"[^>]*title="[^"]*register order/.test(html), 'the hint must reach the heading: ' + (html.match(/<th data-col="key"[^>]*/) || ''));
      });
    });

  })(App);
