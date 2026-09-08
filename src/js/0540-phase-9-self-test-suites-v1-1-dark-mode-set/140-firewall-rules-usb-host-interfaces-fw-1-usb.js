    // ---- FW-1 / USB-1: firewall rules and USB host interfaces ------------------
    // Both are about the same thing: a tactical key set that does not wobble with what
    // a particular capture happened to contain.
    /* ===== SUITES: firewall rules & USB host interfaces (FW-1 · USB-1) ===== */
    T.suite('FW-1/USB-1 firewall rules and USB host interfaces', function (s) {
      var A = App.adapters.android;
      function rule(port) {
        return { addressType: 'IPV4', direction: 'ALL', ipAddress: '*', networkInterface: 'ALL_NETWORKS',
          packageName: '*', portLocation: 'ALL', portNumber: port || '*', protocol: 'ALL', ruleType: 'DENY' };
      }
      function doc(rules, usb) {
        var d = { enabled: true, firewallRules: rules || [] };
        if (usb) d.usbInterfaces = usb;
        return d;
      }
      function keysOf(d) { return A.tactical.parse(JSON.stringify(d)).keys; }
      var FULL_USB = { AUD: true, CDC: true, COM: false, HID: false, MAS: false, MIS: true, STI: true, VEN: true, WIR: true };

      s.test('however many rules there are, it is ONE key', function () {
        var none = keysOf(doc([])), two = keysOf(doc([rule('1'), rule('2')])), five = keysOf(doc([1, 2, 3, 4, 5].map(function (n) { return rule(String(n)); })));
        T.assertDeepEqual(two, none, 'two rules and none must produce the same register');
        T.assertDeepEqual(five, none, 'and so must five — the count is not part of the key');
        T.assert(none.indexOf('firewallRules') !== -1, 'the rule list itself is the item');
        T.assertEqual(none.filter(function (k) { return k.indexOf('firewallRules[') === 0; }).length, 0,
          'positional keys made the rule index its identity, which is what broke inserting a rule');
      });

      s.test('the whole list is the value, typed json even when empty', function () {
        var r = A.tactical.parse(JSON.stringify(doc([rule('80')])));
        var it = r.items.filter(function (x) { return x.key === 'firewallRules'; })[0];
        T.assertEqual(it.valueType, 'json');
        T.assertDeepEqual(it.defaultValue, [rule('80')]);
        var empty = A.tactical.parse(JSON.stringify(doc([]))).items.filter(function (x) { return x.key === 'firewallRules'; })[0];
        T.assertEqual(empty.valueType, 'json',
          'a device with no rules must edit the same shape as one with nine, or the editor changes under you');
      });

      s.test('any list of objects collapses the same way, nested ones included', function () {
        var leaves = A.flattenTactical({ net: { firewallRules: [rule('1')] }, radios: [{ mode: 'a' }, { mode: 'b' }] });
        var by = {}; leaves.forEach(function (l) { by[l.key] = l; });
        T.assertEqual(by['net.firewallRules'].type, 'json', 'the rule applies wherever the key sits');
        T.assertEqual(by['radios'].type, 'json', 'and to every other object list — the index is never an identity');
      });

      s.test('a rule list survives rebuild exactly, wholesale', function () {
        var d = doc([rule('1')]);
        var t = A.tactical.parse(JSON.stringify(d)).template;
        var want = [rule('80'), rule('443')];
        var out = A.rebuildTacticalDoc(t, [{ key: 'firewallRules', decision: { value: want }, controlRefs: [], status: 'decided' }]);
        T.assertDeepEqual(out.firewallRules, want, 'the decided list replaces the captured one, unedited');
        T.assertEqual(out.enabled, true, 'and nothing else moves');
      });

      s.test('a firewall value that is not a list is refused, not emitted', function () {
        var bad = A.tactical.validateDecision({ key: 'firewallRules', decision: { value: 'DENY' } });
        T.assertEqual(bad.length, 1);
        T.assert(/JSON array of rule objects/.test(bad[0].message),
          'a string here is not a small mistake — it is a firewall that does not load');
        T.assertEqual(A.tactical.validateDecision({ key: 'firewallRules', decision: { value: [] } }).length, 0, '[] means "no rules"');
        T.assertEqual(A.tactical.validateDecision({ key: 'net.firewallRules', decision: { value: 'x' } }).length, 1, 'nested too');
        T.assertEqual(A.tactical.validateDecision({ key: 'enabled', decision: { value: 'x' } }).length, 0, 'other keys are unaffected');
      });

      s.test('a decisions import with a DIFFERENT rule count is accepted for the same device', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', JSON.stringify(doc([rule('1'), rule('2')]))) } });
        var five = [1, 2, 3, 4, 5].map(function (n) { return rule(String(n)); });
        var parsed = A.tactical.parseAssignment(JSON.stringify(doc(five)));
        var res = App.store.applyDeviceAssignment('dev-m1', 'android.tactical', parsed);
        T.assert(res.ok, 'the exact-set rule must not trip on a rule count: ' + JSON.stringify(res.issues));
        var it = App.store.getProject().items['android.tactical'].filter(function (x) { return x.key === 'firewallRules'; })[0];
        T.assertDeepEqual(it.decision.value, five);
      });

      // ---- USB-1
      s.test('a usbInterfaces block is completed to every class, closed by default', function () {
        var r = A.tactical.parse(JSON.stringify(doc([], { AUD: true, HID: false })));
        var usb = r.items.filter(function (x) { return x.key.indexOf('usbInterfaces.') === 0; });
        T.assertEqual(usb.length, 9, 'the list is exhaustive — a half-written deny-list is silent in the dangerous direction');
        var by = {}; usb.forEach(function (x) { by[x.key.split('.').pop()] = x.defaultValue; });
        T.assertEqual(by.AUD, true, 'what the capture said is kept');
        T.assertEqual(by.COM, false, 'and what it omitted defaults to the closed position');
        T.assert(r.warnings.some(function (x) { return /usbInterfaces/.test(x.message); }), 'and it is said out loud');
      });

      s.test('a full block is left exactly as captured, with no warning', function () {
        var r = A.tactical.parse(JSON.stringify(doc([], FULL_USB)));
        var by = {}; r.items.forEach(function (x) { if (x.key.indexOf('usbInterfaces.') === 0) by[x.key.split('.').pop()] = x.defaultValue; });
        T.assertDeepEqual(by, FULL_USB);
        T.assert(!r.warnings.some(function (x) { return /usbInterfaces/.test(x.message); }), 'nothing to say when nothing was missing');
      });

      s.test('a document with no block gets none invented', function () {
        var r = A.tactical.parse(JSON.stringify(doc([])));
        T.assertEqual(r.keys.filter(function (k) { return k.indexOf('usbInterfaces') === 0; }).length, 0,
          'inventing a USB policy Knox never exported would be putting words in the device\'s mouth');
      });

      s.test('each interface is its own decision, written back individually', function () {
        var t = A.tactical.parse(JSON.stringify(doc([], FULL_USB))).template;
        var out = A.rebuildTacticalDoc(t, [{ key: 'usbInterfaces.COM', decision: { value: true }, controlRefs: [], status: 'decided' }]);
        T.assertEqual(out.usbInterfaces.COM, true);
        T.assertEqual(out.usbInterfaces.HID, false, 'the others are untouched');
      });

      // ---- migration of a project saved under the old flattening
      s.test('an older project collapses its positional keys and loses the dead register rows', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        var d = doc([rule('1'), rule('2')], FULL_USB);
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', JSON.stringify(d)) } });
        var proj = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        // Rewrite the snapshot + register the way the OLD flatten left them.
        var sn = proj.deviceConfigs[0].snapshots['android.tactical'];
        var legacy = [];
        d.firewallRules.forEach(function (r0, i) { Object.keys(r0).forEach(function (f) { legacy.push('firewallRules[' + i + '].' + f); }); });
        sn.keys = sn.keys.filter(function (k) { return k !== 'firewallRules'; }).concat(legacy).sort();
        proj.items['android.tactical'] = proj.items['android.tactical'].filter(function (it) { return it.key !== 'firewallRules'; })
          .concat(legacy.map(function (k) { return { key: k, decision: { value: 'DENY' }, controlRefs: [], status: 'decided' }; }));

        var res = App.projectIo.parseProject(JSON.stringify(proj));
        T.assert(res.ok, 'an older project must still open: ' + JSON.stringify(res.issues));
        var after = res.value.deviceConfigs[0].snapshots['android.tactical'].keys;
        T.assertEqual(after.filter(function (k) { return k.indexOf('firewallRules[') === 0; }).length, 0, 'positional keys go');
        T.assert(after.indexOf('firewallRules') !== -1, 'and the one that replaces them is there');
        var items = res.value.items['android.tactical'];
        T.assertEqual(items.filter(function (it) { return it.key.indexOf('firewallRules[') === 0; }).length, 0,
          'the dead rows would otherwise sit undecided for ever, inflating every count');
        T.assert(items.some(function (it) { return it.key === 'firewallRules'; }), 'the new item is seeded undecided');
        T.assert(res.issues.some(function (i) { return /no longer produced/.test(i.message); }), 'removals are never silent');
      });

      s.test('the rule list edits AS JSON — never as text that stringifies the rules away', function () {
        var pr = A.tactical.parse(JSON.stringify(doc([rule('1')])));
        var cap = A.tactical.capturedDefaults({ template: pr.template })['firewallRules'];
        T.assertEqual(cap.type, 'json');
        T.assertEqual(App.valueFormats.inferId('json', cap.value), 'json',
          'without this the captured type fell through to text, and committing the cell stored the rules as a STRING');
        var fmt = App.valueFormats.resolve(null, { key: 'firewallRules', decision: null, controlRefs: [] }, cap.type, cap.value);
        T.assertEqual(fmt.kind, 'json');
        var back = App.valueFormats.parseInput(fmt, App.valueFormats.display(fmt, cap.value));
        T.assert(back.ok && Array.isArray(back.value), 'and the round-trip must come back a list, not a string');
        T.assertDeepEqual(back.value, [rule('1')]);
      });

      s.test('the Help manual documents both rules', function () {
        var H = App.ui.views.help;
        H._help.section = 'onboard';
        var html = H.render(null);
        T.assert(/firewallRules/.test(html) && /number of rules in a capture therefore does not matter/.test(html));
        T.assert(/usbInterfaces/.test(html) && /exhaustive/.test(html));
        T.assert(/will not invent a USB policy/.test(html), 'and the boundary — what it does NOT do');
        H._help.section = H.SECTIONS[0].id;
      });

      s.test('the editor gives a rule list room to be read', function () {
        var fmt = { kind: 'json' };
        var html = App.ui.tables.renderValueEditor(fmt, 'data-x', [rule('1'), rule('2')]);
        T.assert(/class="val-edit val-json"/.test(html), 'JSON gets its own monospace editor');
        var rows = parseInt((/rows="(\d+)"/.exec(html) || [])[1], 10);
        T.assert(rows > 1, 'a nine-field rule object in a one-row box is not an editor (got ' + rows + ')');
      });
    });

    // ---- COL-2 · RPT-1 · PRO-3: column defaults, the report, the order editor ----
    /* ===== SUITES: column defaults · control coverage · order stability (COL-2 · RPT-1 · PRO-3) ===== */
    T.suite('COL-2/RPT-1/PRO-3 columns, control coverage and the order editor', function (s) {
      function base() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        App.store.setDecision('android.packages', 'com.b', { action: 'remove' });
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          App.store.setDecision('android.tactical', it.key, { value: true });
        });
        return App.store.getProject();
      }
      function fileNamed(files, name) { return files.filter(function (f) { return f.name === name; })[0]; }

      // ---- COL-2
      s.test('Diverges sits immediately before Status, not past it', function () {
        var cols = App.ui.tables.allColumns(App.registry.getDataset('android-adb', 'android.packages'))
          .map(function (c) { return c.key; });
        T.assertEqual(cols.indexOf('diverges') + 1, cols.indexOf('status'),
          'the divergence tick is an attribute of the decision — it belongs ahead of the verdict');
      });

      s.test('Security Relevance and Diverges start hidden, and only those two', function () {
        T.assertDeepEqual(Object.keys(App.ui.tables.DEFAULT_HIDDEN_COLS).sort(), ['diverges', 'relevance']);
        var fresh = App.ui.tables.defaultHiddenCols();
        fresh.status = true;
        T.assert(!App.ui.tables.DEFAULT_HIDDEN_COLS.status,
          'defaultHiddenCols must hand back a COPY — a tab hiding a column must not change every other tab');
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var shown = App.ui.tables.visibleColumns(a, { hiddenCols: App.ui.tables.defaultHiddenCols() })
          .map(function (c) { return c.key; });
        T.assertDeepEqual(shown, ['key', 'description', 'decision', 'controlRefs', 'appliesTo', 'status']);
      });

      s.test('a new data tab opens with them hidden, and the picker says so', function () {
        base();
        App.ui.app._state.ui = {};                       // as on a fresh load
        var ui = App.ui.app._state.ui['android.packages'] ||
          (function () { App.ui.app._renderShell(); return null; })();
        // uiFor is internal; reach it the way the app does — through a render.
        var live = App.ui.app._state.ui;
        T.assert(!live['android.packages'], 'nothing seeded until the tab is used');
        var seeded = { hiddenCols: App.ui.tables.defaultHiddenCols() };
        var html = App.ui.tables.renderToolbar('android.packages', seeded, 2, 2, [], null,
          App.registry.getDataset('android-adb', 'android.packages'));
        T.assert(/6 of 8 shown/.test(html), 'the count must show two columns are off by default');
        T.assert(/data-col-vis="relevance" data-ds="android.packages" aria-label/.test(html),
          'and the picker must render them UNticked, so turning them on is one click');
        T.assertEqual(ui, null);
      });

      s.test('the hidden columns are a VIEW — the values and the file are untouched', function () {
        var p = base();
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'HIGH', diverges: true });
        var before = App.projectIo.serializeProject(App.store.getProject());
        App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages',
          { hiddenCols: App.ui.tables.defaultHiddenCols() }, {});
        T.assertEqual(App.projectIo.serializeProject(App.store.getProject()), before,
          'hiding a column must never touch what it was showing');
        T.assertEqual(p.platformProfileId, 'android-adb');
      });

      // ---- RPT-1
      s.test('Control coverage lists controls only — never a "(no control)" dump', function () {
        base();
        var ctl = App.store.addControl({ title: 'Bluetooth off', type: 'ISM', description: 'd' });
        App.store.setItemFields('android.packages', 'com.b', { controlRefs: [ctl.id] });
        // COL-3: the Items column ships OFF — it is the widest cell in the table — so a
        // test about which items are listed asks for it.
        var html = fileNamed(App.generate.buildReport(App.store.getProject(), 'dev-m1',
          { columns: { control: { items: true } } }).files, 'report.md').content;
        T.assert(/Control coverage/.test(html), 'the section must still be there');
        T.assert(/Bluetooth off/.test(html), 'and still list the control that IS met');
        T.assert(html.indexOf('(no control)') === -1,
          'everything with no control is by definition what did not change — it buried the controls');
        // Scoped to the section: com.a is legitimately in the Packages table above it.
        var sec = html.slice(html.search(/^# \d+ Control coverage /m));
        sec = sec.slice(0, sec.search(/\n# /) === -1 ? sec.length : sec.search(/\n# /));
        T.assert(/com\.b/.test(sec), 'the controlled item is the evidence, so it must be listed');
        T.assert(sec.indexOf('com.a') === -1, 'the uncontrolled one must not appear in the coverage table');
      });

      s.test('with nothing controlled, the section says so rather than listing everything', function () {
        base();
        var html = fileNamed(App.generate.buildReport(App.store.getProject(), 'dev-m1').files, 'report.md').content;
        T.assert(/No decided item on this device references a control/.test(html));
        T.assert(html.indexOf('(no control)') === -1);
      });

      s.test('the standalone Control report keeps its explicit opt-in', function () {
        base();
        var off = fileNamed(App.generate.buildControlReport(App.store.getProject(), 'dev-m1').files, 'control-report.md').content;
        T.assert(off.indexOf('(no control)') === -1, 'off by default');
        var on = fileNamed(App.generate.buildControlReport(App.store.getProject(), 'dev-m1', { includeUncontrolled: true }).files, 'control-report.md').content;
        T.assert(/\(no control\)/.test(on), 'the deliberate opt-in still works — it is a different question');
      });

      // ---- PRO-3
      s.test('the Help manual documents all three', function () {
        var H = App.ui.views.help;
        H._help.section = 'tables';
        var t = H.render(null);
        T.assert(/start <em>hidden<\/em>/.test(t), 'the manual must say the two columns start off');
        T.assert(/immediately before <strong>Status<\/strong>/.test(t), 'and where Diverges now sits');
        H._help.section = 'generate';
        T.assert(/Control coverage lists controls only/.test(H.render(null)),
          'a section that quietly stopped listing things must say so');
        H._help.section = H.SECTIONS[0].id;
      });

      s.test('the running order is addressable, so a reorder can repaint just the list', function () {
        base();
        var V = App.ui.views.generate;
        V._gen.deviceId = 'dev-m1';
        V._gen.openOptions.procedure = true;
        var html = V.render(App.store.getProject());
        T.assert(/id="proc-order-host"/.test(html),
          'without its own host the only way to redraw the order is to redraw the page, which is what threw the view to the top');
        V._gen.openOptions.procedure = false;
      });
    });

    /* ===== SUITES: cell editing & manual device assignment (EDIT-1 · DEV-1) ===== */

    /**
     * Two devices whose captures genuinely differ, which is the case DEV-1 exists for:
     * Alpha reported com.a, Bravo reported com.b, both reported com.shared, and the
     * register also holds com.c from Alpha alone.
     */
    function devProject() {
      ensureA(); App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
        'android.packages': snapB('android.packages', 'com.a\ncom.c\ncom.shared'),
        'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
      App.store.onboardDevice({ name: 'Bravo', model: 'M2', snapshots: {
        'android.packages': snapB('android.packages', 'com.b\ncom.shared'),
        'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
      return App.store.getProject();
    }
    /** The keys the register currently says apply to a device. */
    function appliesKeys(dsId, deviceId) {
      var p = App.store.getProject();
      var dc = p.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      return App.registry.applicableKeys(p, dc, dsId).slice().sort();
    }
    function scopeOf(deviceId, dsId) {
      var dc = App.store.getProject().deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      return (dc.scope && dc.scope[dsId]) || null;
    }

    T.suite('EDIT-1 a cell opens the row for editing', function (s) {
      s.test('the text cells carry the handle the gesture matches — and the value cell does not', function () {
        devProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/<td class="ec" data-edit-col="description" data-key="com\.a"/.test(html),
          'without this the Description cell is text you can read and not reach');
        T.assert(/<td class="ec" data-edit-col="controlRefs"/.test(html), 'Control Refs must be reachable the same way');
        T.assert(/<td class="ec" data-edit-col="key"/.test(html), 'so must the key column (it opens the row)');
        // The value cell is ALREADY an editor; marking it would put a second, competing
        // title on it and clobber the invalid-decision tooltip.
        T.assert(html.indexOf('data-edit-col="decision"') === -1, 'the value cell must not be hijacked');
        T.assert(html.indexOf('data-edit-col="status"') === -1, 'nor the status badge, which is a toggle');
      });

      s.test('the gesture is discoverable — the cell says what it does', function () {
        devProject();
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/title="Ctrl\+click \(or double-click\) to edit the Description of this row"/.test(html),
          'a hidden gesture nobody is told about is not a feature');
      });

      s.test('each column knows which box to focus once the row is open', function () {
        ensureA();
        var pkgs = App.registry.getDataset('android-adb', 'android.packages');
        var cus = App.registry.getDataset('android-adb', 'android.custom');
        var T2 = App.ui.tables;
        T.assertEqual(T2.cellEditTarget(pkgs, 'description').sel, '[data-field-edit="description"]');
        T.assertEqual(T2.cellEditTarget(pkgs, 'controlRefs').sel, '[data-control-search]');
        T.assertEqual(T2.cellEditTarget(pkgs, 'decision'), null, 'the value cell edits itself');
        T.assertEqual(T2.cellEditTarget(pkgs, 'diverges'), null, 'so does a tick column');
        // A captured key is evidence: the row opens, but there is nothing to type over.
        T.assertEqual(T2.cellEditTarget(pkgs, 'key').sel, null);
        T.assertEqual(T2.cellEditTarget(cus, 'key').sel, '[data-rename-key]',
          'an authored action IS renameable, so its name cell focuses the rename box');
      });

      s.test('the hover affordance exists in the stylesheet', function () {
        if (!sheet()) return;   // no document (pure-node run)
        var rule = cssRule('table.data td.ec:hover');
        T.assert(/outline/.test(rule), 'a cell that opens on Ctrl+click needs to look different on hover');
      });

      s.test('the manual documents it', function () {
        var H2 = App.ui.views.help;
        H2._help.section = 'tables';
        T.assert(/Ctrl\+click a cell to edit what it shows/.test(H2.render(null)), 'undocumented gesture');
        H2._help.section = H2.SECTIONS[0].id;
      });
    });

