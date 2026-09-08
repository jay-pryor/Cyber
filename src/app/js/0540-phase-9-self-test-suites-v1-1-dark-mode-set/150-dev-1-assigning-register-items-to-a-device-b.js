    T.suite('DEV-1 assigning register items to a device by hand', function (s) {
      // ---- the fold itself
      s.test('the capture decides applicability until something says otherwise', function () {
        devProject();
        T.assertDeepEqual(appliesKeys('android.packages', 'alpha-m1'), ['com.a', 'com.c', 'com.shared']);
        T.assertDeepEqual(appliesKeys('android.packages', 'bravo-m2'), ['com.b', 'com.shared']);
      });

      s.test('assigning an item to a device that never reported it makes it apply there', function () {
        devProject();
        var r = App.store.setItemDevice('android.packages', 'com.a', 'bravo-m2', true);
        T.assertEqual(r.ok, true, JSON.stringify(r.issues));
        T.assertEqual(r.changed, 1);
        T.assertDeepEqual(appliesKeys('android.packages', 'bravo-m2'), ['com.a', 'com.b', 'com.shared']);
        T.assertDeepEqual(scopeOf('bravo-m2', 'android.packages'), { add: ['com.a'] });
        // The evidence is untouched — that is the whole point of layering.
        var dc = App.store.getProject().deviceConfigs.filter(function (c) { return c.id === 'bravo-m2'; })[0];
        T.assertDeepEqual(dc.snapshots['android.packages'].keys, ['com.b', 'com.shared'],
          'the capture must never be edited to record an opinion');
      });

      s.test('un-assigning an item the device DID report takes it off', function () {
        devProject();
        App.store.setItemDevice('android.packages', 'com.shared', 'alpha-m1', false);
        T.assertDeepEqual(appliesKeys('android.packages', 'alpha-m1'), ['com.a', 'com.c']);
        T.assertDeepEqual(scopeOf('alpha-m1', 'android.packages'), { remove: ['com.shared'] });
      });

      s.test('putting it back leaves NOTHING behind (canonical, DOD-7)', function () {
        // The clock is frozen for the comparison: every commit stamps meta.modifiedUtc, and
        // the claim under test is about the SCOPE leaving no trace, not about time standing
        // still. Without this the test passes or fails on whether two commits landed in the
        // same millisecond.
        App.util.clock.setClock(function () { return new Date('1980-01-01T00:00:00.000Z'); });
        try {
          devProject();   // rebuilt under the frozen clock, so the baseline is stamped the same
          var before = App.projectIo.serializeProject(App.store.getProject());
          App.store.setItemDevice('android.packages', 'com.shared', 'alpha-m1', false);
          App.store.setItemDevice('android.packages', 'com.shared', 'alpha-m1', true);
          T.assertEqual(scopeOf('alpha-m1', 'android.packages'), null, 'a no-op adjustment must not be recorded');
          T.assertEqual(App.projectIo.serializeProject(App.store.getProject()), before,
            'tick-then-untick must be byte-identical to never having ticked');
        } finally { App.util.clock.resetClock(); }
      });

      s.test('an assignment that only restates the capture changes nothing', function () {
        devProject();
        var r = App.store.setItemDevice('android.packages', 'com.a', 'alpha-m1', true);
        T.assertEqual(r.changed, 0, 'it already applies — there is nothing to record');
        T.assertEqual(scopeOf('alpha-m1', 'android.packages'), null);
      });

      s.test('a device with no capture for the register is refused, with the reason', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a') } });
        var r = App.store.setItemDevice('android.tactical', 'anything', 'alpha-m1', true);
        T.assertEqual(r.ok, false);
        T.assert(/has no Tactical capture/.test(r.issues[0].message), r.issues[0].message);
      });

      s.test('an unknown key is skipped rather than invented', function () {
        devProject();
        var r = App.store.setItemsDevice('android.packages', ['com.a', 'com.nope'], 'bravo-m2', true);
        T.assertEqual(r.changed, 1);
        T.assert(r.issues.some(function (i) { return i.severity === 'warning'; }), 'the skip must be said out loud');
        T.assertDeepEqual(scopeOf('bravo-m2', 'android.packages'), { add: ['com.a'] });
      });

      s.test('only the latest version of a device can be assigned to', function () {
        devProject();
        // A genuinely different capture, or the re-onboard is a no-op and nothing is superseded.
        App.store.reonboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.c\ncom.shared\ncom.d'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var r = App.store.setItemDevice('android.packages', 'com.b', 'alpha-m1', true);
        T.assertEqual(r.ok, false, 'a superseded config is history, not a target');
      });

      // ---- it reaches everything applicability reaches
      s.test('the assignment carries into readiness and generation, not just the table', function () {
        devProject();
        var p = App.store.getProject();
        p.items['android.packages'].forEach(function (it) {
          App.store.setDecision('android.packages', it.key, { action: 'remove' });
        });
        App.store.setDecision('android.tactical', App.store.getProject().items['android.tactical'][0].key, { value: true });
        var before = App.store.applicableItems('bravo-m2', 'android.packages').map(function (it) { return it.key; }).sort();
        T.assertDeepEqual(before, ['com.b', 'com.shared']);
        App.store.setItemDevice('android.packages', 'com.a', 'bravo-m2', true);
        T.assertDeepEqual(App.store.applicableItems('bravo-m2', 'android.packages').map(function (it) { return it.key; }).sort(),
          ['com.a', 'com.b', 'com.shared'], 'store.applicableItems reads the same fold');
        var files = App.generate.buildImplementation(App.store.getProject(), 'bravo-m2').files;
        var script = files.filter(function (f) { return /packages/.test(f.name); })[0].content;
        T.assert(script.indexOf('com.a') !== -1, 'an assigned item must actually be generated for the device');
      });

      s.test('un-assigning removes it from that device\'s generated output', function () {
        devProject();
        App.store.getProject().items['android.packages'].forEach(function (it) {
          App.store.setDecision('android.packages', it.key, { action: 'remove' });
        });
        App.store.setItemDevice('android.packages', 'com.shared', 'alpha-m1', false);
        var files = App.generate.buildImplementation(App.store.getProject(), 'alpha-m1').files;
        var script = files.filter(function (f) { return /packages/.test(f.name); })[0].content;
        T.assert(script.indexOf('com.shared') === -1, 'it no longer applies, so it must not be acted on');
      });

      // ---- the project file
      s.test('scope round-trips and is canonical (sorted, empties absent)', function () {
        devProject();
        App.store.setItemsDevice('android.packages', ['com.c', 'com.a'], 'bravo-m2', true);
        var text = App.projectIo.serializeProject(App.store.getProject());
        T.assert(text.indexOf('"scope"') !== -1, 'the adjustment has to be saved, or it is a session-only illusion');
        T.assert(/"add": \[\s*"com\.a",\s*"com\.c"\s*\]/.test(text), 'the list must be sorted for byte-stability');
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, JSON.stringify(back.issues));
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'round-trip must be byte-stable');
      });

      s.test('a stale assignment is pruned on load rather than refusing the file', function () {
        devProject();
        App.store.setItemDevice('android.packages', 'com.a', 'bravo-m2', true);
        var obj = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        obj.items['android.packages'] = obj.items['android.packages'].filter(function (it) { return it.key !== 'com.a'; });
        var back = App.projectIo.parseProject(JSON.stringify(obj));
        T.assert(back.ok, 'a dangling adjustment is not a corrupt file');
        var dc = back.value.deviceConfigs.filter(function (c) { return c.id === 'bravo-m2'; })[0];
        T.assert(!dc.scope, 'the adjustment pointed at nothing and must be gone');
        T.assert(back.issues.some(function (i) { return /no longer in the register/.test(i.message); }), 'silently is not good enough');
      });

      s.test('un-assigning an item does NOT delete the device override recorded for it', function () {
        devProject();
        App.store.setDecision('android.packages', 'com.shared', { action: 'keep' });
        T.assertEqual(App.store.setDeviceOverride('alpha-m1', 'android.packages', 'com.shared', { action: 'remove' }).ok, true);
        App.store.setItemDevice('android.packages', 'com.shared', 'alpha-m1', false);
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, JSON.stringify(back.issues));
        var dc = back.value.deviceConfigs.filter(function (c) { return c.id === 'alpha-m1'; })[0];
        T.assertDeepEqual(dc.overrides['android.packages']['com.shared'], { action: 'remove' },
          'un-assigning is a statement about what applies, not an instruction to discard work');
      });

      // ---- it moves with the item
      s.test('deleting an item takes its assignments with it', function () {
        devProject();
        App.store.setItemDevice('android.packages', 'com.a', 'bravo-m2', true);
        App.store.removeItems('android.packages', ['com.a']);
        T.assertEqual(scopeOf('bravo-m2', 'android.packages'), null, 'an adjustment naming a deleted item is dangling');
      });

      s.test('renaming an authored action carries its assignments', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.addItem('android.custom', 'Seal the SIM tray');
        App.store.setItemDevice('android.custom', 'Seal the SIM tray', 'alpha-m1', false);
        App.store.renameItem('android.custom', 'Seal the SIM tray', 'Seal the tray');
        T.assertDeepEqual(scopeOf('alpha-m1', 'android.custom'), { remove: ['Seal the tray'] },
          'a rename must not silently re-assign the action to a device it was taken off');
      });

      s.test('a custom action can be taken off one device (the virtual-dataset case)', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        ['Alpha', 'Bravo'].forEach(function (n, i) {
          App.store.onboardDevice({ name: n, model: 'M' + (i + 1), snapshots: {
            'android.packages': snapB('android.packages', 'com.a'),
            'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        });
        App.store.addItem('android.custom', 'Seal the SIM tray');
        T.assertDeepEqual(appliesKeys('android.custom', 'bravo-m2'), ['Seal the SIM tray'], 'virtual ⇒ every device');
        App.store.setItemDevice('android.custom', 'Seal the SIM tray', 'bravo-m2', false);
        T.assertDeepEqual(appliesKeys('android.custom', 'bravo-m2'), [], 'an authored action can be irrelevant to one device');
        T.assertDeepEqual(appliesKeys('android.custom', 'alpha-m1'), ['Seal the SIM tray'], 'and untouched on the others');
      });

      // ---- undo
      s.test('a dataset snapshot carries the assignments, so Undo puts them back', function () {
        devProject();
        var snap = App.store.datasetSnapshot('android.packages');
        App.store.setItemDevice('android.packages', 'com.a', 'bravo-m2', true);
        T.assertDeepEqual(scopeOf('bravo-m2', 'android.packages'), { add: ['com.a'] });
        App.store.restoreDatasetSnapshot(snap);
        T.assertEqual(scopeOf('bravo-m2', 'android.packages'), null, 'an undo that leaves the assignment behind is not an undo');
      });

      s.test('a run of device ticks folds into ONE undo entry', function () {
        devProject();
        var H2 = App.ui.app._history;
        H2.reset();
        H2.noteDeviceTick('android.packages', 'bravo-m2', 'Bravo');
        H2.noteDeviceTick('android.packages', 'bravo-m2', 'Bravo');
        T.assertEqual(H2.info('android.packages').label, 'device assignment of 2 items to "Bravo"');
        // A different device is a different action.
        H2.noteDeviceTick('android.packages', 'alpha-m1', 'Alpha');
        T.assertEqual(H2.info('android.packages').label, 'device assignment of 1 item to "Alpha"');
        H2.reset();
      });

      s.test('a refused tick takes back only itself, not the run it was folded into', function () {
        devProject();
        var H2 = App.ui.app._history;
        H2.reset();
        H2.noteDeviceTick('android.packages', 'bravo-m2', 'Bravo');
        H2.noteDeviceTick('android.packages', 'bravo-m2', 'Bravo');
        H2.unnoteTickRun();
        T.assertEqual(H2.info('android.packages').label, 'device assignment of 1 item to "Bravo"',
          'dropping the whole entry would discard somebody else\'s successful ticks');
        H2.unnoteTickRun();
        T.assertEqual(H2.info('android.packages').canUndo, false, 'the last one out takes the entry with it');
        H2.reset();
      });

      // ---- the UI
      s.test('the mode renders a tick column whose heading is the bulk action', function () {
        devProject();
        var ui = { assignMode: true, assignDeviceId: 'bravo-m2' };
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', ui, {});
        T.assert(/<th class="dev-col"/.test(html), 'no device column');
        T.assert(/data-assign-all="android\.packages"/.test(html), 'the heading must BE the bulk action, as ✓ Apply is');
        T.assert(/✓ Assign all 4/.test(html), 'the heading must name the count it will act on');
        T.assert(/data-device-check data-key="com\.b"[^>]*checked/.test(html), 'a captured row must read as applying');
        T.assert(/data-device-check data-key="com\.a"(?![^>]*checked)/.test(html), 'and one it never reported must not');
      });

      s.test('when every shown row already applies, the heading REMOVES instead', function () {
        devProject();
        var ui = { assignMode: true, assignDeviceId: 'alpha-m1', search: 'com.shared' };
        var plan = App.ui.model.assignAllShownPlan(App.store.getProject(), 'android.packages', ui, 'alpha-m1');
        T.assertEqual(plan.removing, true);
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', ui, {});
        T.assert(/✕ Remove all 1/.test(html), 'the same click has to be able to take it back off');
      });

      s.test('a device that does not carry the register cannot be ticked into', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.onboardDevice({ name: 'Bravo', model: 'M2', snapshots: {
          'android.packages': snapB('android.packages', 'com.b') } });
        var ui = { assignMode: true, assignDeviceId: 'bravo-m2' };
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', ui, {});
        T.assert(/data-device-check[^>]*disabled/.test(html), 'a tick that could change nothing must not be offered');
        var rail = App.ui.tables.renderToolbar('android.tactical', ui, 1, 1, [], null,
          App.registry.getDataset('android-adb', 'android.tactical'), App.store.getProject());
        T.assert(/data-rail-device="bravo-m2"[^>]*disabled/.test(rail), 'and the card must say why rather than vanish');
        T.assert(/no capture/.test(rail), 'the reason belongs on the card');
      });

      s.test('the three bulk modes are mutually exclusive in the toolbar', function () {
        devProject();
        var ds = App.registry.getDataset('android-adb', 'android.packages'), p = App.store.getProject();
        var on = App.ui.tables.renderToolbar('android.packages', { assignMode: true }, 3, 3, [], null, ds, p);
        T.assert(/data-apply-toggle="android\.packages"[^>]*disabled/.test(on), 'Apply Control must be locked out');
        T.assert(/data-delete-toggle="android\.packages"[^>]*disabled/.test(on), 'so must Delete Items');
        var off = App.ui.tables.renderToolbar('android.packages', { applyMode: true }, 3, 3, [], null, ds, p);
        T.assert(/data-assign-toggle="android\.packages"[^>]*disabled/.test(off), 'and the new mode in the other direction');
      });

      s.test('the Applies-to cells are addressable, so a tick can repaint just them', function () {
        devProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/data-applies-cell="com\.a"/.test(html),
          'without a handle the only way to refresh the column is a full re-render, which is what STAB-3 forbids');
      });

      s.test('the manual documents the mode and what it does not destroy', function () {
        var H2 = App.ui.views.help;
        H2._help.section = 'tables';
        var t = H2.render(null);
        T.assert(/Assign to Device/.test(t), 'undocumented mode');
        T.assert(/does <em>not<\/em> delete any device override/.test(t), 'the non-destructive promise must be written down');
        H2._help.section = H2.SECTIONS[0].id;
      });
    });

    /* ===== SUITES: one captured-value map for the whole fleet (D-015) ===== */

    /**
     * Alpha captured a boolean leaf that Bravo's capture does not contain — the exact
     * shape of D-015. Assigning that item to Bravo by hand (DEV-1) used to leave Bravo
     * with no captured TYPE for the key, so the inferred value format fell back to
     * `text`, a true/false decision failed validation, and the Devices tab called the
     * item undecided while the data tab (which merges the fleet's captures) showed it
     * decided. Both now resolve the format from the same merged map.
     */
    function fleetProject() {
      ensureA(); App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
        'android.tactical': snapB('android.tactical', '{"policyList":{"deviceSettings":{"wifiOn":true}}}') } });
      App.store.onboardDevice({ name: 'Bravo', model: 'M2', snapshots: {
        'android.tactical': snapB('android.tactical', '{"policyList":{"deviceSettings":{"label":"b"}}}') } });
      // Decide everything, so anything left undecided below is the defect and not a gap.
      App.store.getProject().items['android.tactical'].forEach(function (it) {
        var v = /wifiOn/.test(it.key) ? true : /enabled$/.test(it.key) ? false : 'x';
        App.store.setDecision('android.tactical', it.key, { value: v });
      });
      return App.store.getProject();
    }
    var WIFI = 'policyList.deviceSettings.wifiOn';

    T.suite('D-015 an assigned item keeps its decision on the new device', function (s) {
      s.test('the fleet-merged map supplies the captured type a device never reported', function () {
        var p = fleetProject();
        var own = App.registry.getDataset('android-adb', 'android.tactical')
          .capturedDefaults(p.deviceConfigs[1].snapshots['android.tactical']);
        T.assertEqual(own[WIFI], undefined, 'Bravo genuinely never captured it — that is the premise');
        var merged = App.registry.capturedDefaults(p, 'android.tactical', 'bravo-m2');
        T.assertEqual(merged[WIFI].type, 'bool', 'Alpha captured it, and the key is fleet-wide');
      });

      s.test('a device that DID capture the key is still the authority on its type', function () {
        var p = fleetProject();
        var m = App.registry.capturedDefaults(p, 'android.tactical', 'alpha-m1');
        T.assertEqual(m[WIFI].value, true);
        T.assertEqual(m['policyList.deviceSettings.label'].value, 'b', 'and the fleet fills the gaps');
      });

      s.test('assigning the item by hand leaves the second device READY', function () {
        fleetProject();
        var r = App.store.setItemDevice('android.tactical', WIFI, 'bravo-m2', true);
        T.assertEqual(r.ok, true, JSON.stringify(r.issues));
        var p = App.store.getProject();
        T.assert(App.registry.applicableKeySet(p, p.deviceConfigs[1], 'android.tactical')[WIFI],
          'the assignment must have taken');
        var rd = App.completeness.deviceReadiness(p, 'bravo-m2');
        T.assertEqual(rd.totalUndecided, 0, 'a decided boolean must not read as undecided on the device it was assigned to');
        T.assertEqual(rd.ready, true);
      });

      s.test('the two tabs cannot disagree — one map answers both', function () {
        fleetProject();
        App.store.setItemDevice('android.tactical', WIFI, 'bravo-m2', true);
        var p = App.store.getProject();
        var ad = App.registry.getDataset('android-adb', 'android.tactical');
        var item = p.items['android.tactical'].filter(function (it) { return it.key === WIFI; })[0];
        T.assertEqual(item.status, 'decided', 'what the Tactical tab shows');
        T.assertDeepEqual(App.completeness.formatIssues(ad, item, p, App.ui.tables.buildCapturedMap(p, 'android.tactical')), []);
        T.assertDeepEqual(App.completeness.formatIssues(ad, item, p, App.registry.capturedDefaults(p, 'android.tactical', 'bravo-m2')), [],
          'the Devices tab has to reach the same verdict from the same evidence');
      });

      s.test('and the decision reaches the artifact, not just the badge', function () {
        fleetProject();
        App.store.setItemDevice('android.tactical', WIFI, 'bravo-m2', true);
        var files = App.generate.buildImplementation(App.store.getProject(), 'bravo-m2');
        var json = (files.files || files).filter(function (f) { return /tactical\.json$/.test(f.name); })[0];
        T.assert(!!json, 'no tactical artifact');
        T.assertEqual(JSON.parse(json.content).policyList.deviceSettings.wifiOn, true,
          'a key assigned by hand must be written into the device it was assigned to');
      });

      s.test('a superseded config still resolves against its own capture', function () {
        fleetProject();
        // Re-onboard Bravo with a different capture; the OLD version must not silently
        // start reading the new one's evidence just because it is no longer latest.
        App.store.onboardDevice({ name: 'Bravo', model: 'M2', snapshots: {
          'android.tactical': snapB('android.tactical', '{"policyList":{"deviceSettings":{"label":"b2"}}}') } });
        var p = App.store.getProject();
        T.assert(p.deviceConfigs.some(function (c) { return c.supersedesId === 'bravo-m2'; }),
          'the premise: bravo-m2 is now the superseded version');
        var m = App.registry.capturedDefaults(p, 'android.tactical', 'bravo-m2');
        T.assertEqual(m['policyList.deviceSettings.label'].value, 'b', 'the old version keeps its own captured value');
      });
    });

