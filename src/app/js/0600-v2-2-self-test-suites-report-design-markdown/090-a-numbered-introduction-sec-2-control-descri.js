    /* ===== SUITES: a numbered introduction (SEC-2) · control description (CCOL-3) ===== */

    T.suite('SEC-2 an introduction can take a number of its own', function (s) {
      // TBL-1 removed the group sub-sections these tests used to count against: an
      // introduction takes the section's first CHILD number, and a grouped register no
      // longer has any children in the outline to shift. What is still worth locking is
      // that the number it takes is the right one, and that it is taken only when there
      // is an introduction and it asked for one.
      s.test('it takes the FIRST of its section\'s child numbers', function () {
        var r = DOC.outline([
          { id: 'p', kind: 'dataset', label: 'Packages', level: 1, included: true,
            introBody: 'Reviewed.', introNumbered: true,
            children: [{ id: 'rm', label: 'Removed' }, { id: 'dis', label: 'Disabled' }] },
          { id: 'q', kind: 'dataset', label: 'Tactical', level: 1, included: true }
        ], {});
        T.assertEqual(r[0].number, '1');
        T.assertEqual(r[0].introNumber, '1.1', 'the introduction goes first');
        T.assertEqual(r[1].number, '2', 'and the section after it is unaffected');
      });

      s.test('unnumbered, it consumes nothing', function () {
        var r = DOC.outline([
          { id: 'p', kind: 'dataset', label: 'Packages', level: 1, included: true,
            introBody: 'Reviewed.', children: [{ id: 'rm', label: 'Removed' }] },
          { id: 'q', kind: 'dataset', label: 'Tactical', level: 1, included: true }
        ], {});
        T.assertEqual(r[0].introNumber, undefined);
        T.assertEqual(r[1].number, '2');
      });

      s.test('an empty introduction consumes nothing either', function () {
        var r = DOC.outline([
          { id: 'p', kind: 'dataset', label: 'P', level: 1, included: true,
            introBody: '   ', introNumbered: true, children: [{ id: 'g', label: 'G' }] },
          { id: 'q', kind: 'dataset', label: 'Q', level: 1, included: true }
        ], {});
        T.assertEqual(r[0].introNumber, undefined);
        T.assertEqual(r[1].number, '2');
      });

      s.test('a section with no groups still numbers its introduction', function () {
        var r = DOC.outline([
          { id: 'a', kind: 'dataset', label: 'Tactical', level: 1, included: true, introBody: 'X.', introNumbered: true },
          { id: 'b', kind: 'dataset', label: 'Next', level: 1, included: true }
        ], {});
        T.assertEqual(r[0].introNumber, '1.1');
        T.assertEqual(r[1].number, '2', 'and the section after it is unaffected');
      });

      s.test('the number is escaped, because 4.1 in column 1 is a list marker', function () {
        var md = DOC.render({ blocks: DOC.outline([
          { id: 'p', kind: 'dataset', label: 'Packages', level: 1, included: true,
            introBody: 'Reviewed.', introNumbered: true, body: 'TABLE' }
        ], {}) });
        T.assert(/^1\\\.1 Reviewed\.$/m.test(md), 'expected an escaped number: ' + JSON.stringify(md));
        // And it must come between the heading and the body, which is the whole point.
        T.assert(md.indexOf('1\\.1 Reviewed.') < md.indexOf('TABLE'), 'the introduction precedes the table');
      });

      s.test('a title section never numbers its introduction', function () {
        // A title is outside the counter machinery; giving its introduction a number
        // would be inventing one from counters it deliberately does not touch.
        var r = DOC.outline([{ id: 't', kind: 'custom', label: 'T', title: 'Foreword',
          level: DOC.TITLE_LEVEL, included: true, introBody: 'X.', introNumbered: true }], {});
        T.assertEqual(r[0].introNumber, undefined);
      });

      s.test('it reaches the document', function () {
        docProject();
        App.docStore.setBlockIntro('ds:android.packages', 'Reviewed against the baseline.');
        var plain = reportMd({});
        T.assert(plain.indexOf('Reviewed against the baseline.') !== -1, 'the introduction must be in the document');
        T.assert(!/^\d+\\\.1 Reviewed/m.test(plain), 'unnumbered, it carries no number');
        App.docStore.setBlockIntroNumbered('ds:android.packages', true);
        T.assert(/^\d+\\\.1 Reviewed against the baseline\.$/m.test(reportMd({})), 'numbered, it takes x.1');
      });

      s.test('off is the absent state, and it travels in a report template', function () {
        docProject();
        App.docStore.setBlockIntro('ds:android.packages', 'X.');
        App.docStore.setBlockIntroNumbered('ds:android.packages', true);
        T.assertEqual(App.store.getProject().report.introNumbered['ds:android.packages'], true);
        var ser = App.projectIo.serializeProject(App.store.getProject());
        T.assertEqual(App.projectIo.parseProject(ser).ok, true, 'the schema must accept it');
        App.docStore.saveReportTemplate('House');
        App.docStore.setBlockIntroNumbered('ds:android.packages', false);
        T.assertEqual((App.store.getProject().report || {}).introNumbered, undefined, 'off leaves no trace');
        App.docStore.useReportTemplate('rpt1');
        T.assertEqual(App.store.getProject().report.introNumbered['ds:android.packages'], true, 'and a template carries it');
      });

      s.test('the Section pane offers the switch, and the preview honours it', function () {
        docProject();
        App.docStore.setBlockIntro('ds:android.packages', 'Reviewed against the baseline.');
        App.docStore.setBlockIntroNumbered('ds:android.packages', true);
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-intro-num="ds:android.packages"[^>]*checked/.test(html), 'the switch, ticked');
        var prev = html.slice(html.indexOf('rd-secprev'));
        T.assert(/\d+\.1 Reviewed against the baseline\./.test(prev), 'the preview must show the number: ' + prev.slice(0, 400));
        App.ui.views.reportDesign.close();
      });
    });

    T.suite('CCOL-3 the control coverage table can carry the description', function (s) {
      function withControl(desc) {
        docProject();
        var base = App.store.getProject().deviceConfigs[0].baseId;
        var c = App.store.addControl({ title: 'ISM-1 BT', type: 'ISM', description: desc, assignedDeviceIds: [base] });
        App.store.setItemFields('android.packages', 'com.b', { controlRefs: [c.id] });
        return c;
      }
      function section(md) { return md.slice(md.indexOf('{#sec-control}'), md.indexOf('{#sec-deviations}')); }

      s.test('the description is a column, on by default', function () {
        withControl('Bluetooth must be off unless an exception is recorded.');
        var shown = App.ui.mdPreview.toHtml(section(reportMd({}))).html;
        T.assert(/<th>Description<\/th>/.test(shown), 'the column: ' + shown.slice(0, 300));
        T.assert(/Bluetooth\s+must\s+be\s+off/.test(shown), 'carrying what the control says');
      });

      s.test('a control with no description says so rather than leaving a gap', function () {
        withControl('');
        var shown = App.ui.mdPreview.toHtml(section(reportMd({}))).html;
        T.assert(/No\s+description\s+recorded\./.test(shown), 'an empty cell reads as an oversight either way');
      });

      s.test('and it switches off like any other column', function () {
        withControl('Bluetooth must be off.');
        var shown = App.ui.mdPreview.toHtml(section(reportMd({ columns: { control: { description: false } } }))).html;
        T.assert(!/<th>Description<\/th>/.test(shown), 'the column must be gone');
        T.assert(/ISM-1 BT/.test(shown), 'while the control stays');
      });

      s.test('it is offered in the section row menu with the rest', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign._rd.optMenu = 'control';
        var html = App.ui.views.generate.render(App.store.getProject());
        App.ui.views.reportDesign._rd.optMenu = null;
        T.assert(/data-rd-dsmap="columns" data-rd-ds="control" data-rd-key="description"/.test(html), 'no description tick');
        App.ui.views.reportDesign.close();
      });
    });

    /* ===== SUITES: values a person reads (HUM-1) ===== */

    T.suite('HUM-1 a captured value is printed as a reading, not as JSON', function (s) {
      s.test('scalars read as themselves', function () {
        T.assertEqual(MD.human(true), 'true');
        T.assertEqual(MD.human(0), '0');
        T.assertEqual(MD.human('a value'), 'a value');
        T.assertEqual(MD.human(null), '');
        T.assertEqual(MD.human(undefined), '');
      });

      s.test('an empty list says so instead of showing brackets', function () {
        T.assertEqual(MD.human([]), '(none)');
        T.assertEqual(MD.human({}), '(none)');
      });

      s.test('a list of strings is a list, one entry per line', function () {
        // A blank line, not a newline: a grid cell folds consecutive lines into ONE
        // paragraph, so only a blank line survives to the page as a break.
        T.assertEqual(MD.human(['a', 'b']), 'a\n\nb');
        T.assert(MD.human(['a', 'b']).indexOf('"') === -1, 'no JSON quoting');
      });

      s.test('a list of records is numbered, one record per line', function () {
        var rules = [
          { ruleType: 'DENY', direction: 'IN', portNumber: '443' },
          { ruleType: 'ALLOW', direction: 'OUT', portNumber: '80' }
        ];
        T.assertEqual(MD.human(rules),
          '1. direction: IN; portNumber: 443; ruleType: DENY\n\n2. direction: OUT; portNumber: 80; ruleType: ALLOW');
      });

      s.test('an object reads as its fields, and the order is deterministic', function () {
        T.assertEqual(MD.human({ b: 2, a: 1 }), 'a: 1\n\nb: 2');
        T.assertEqual(MD.human({ a: 1, b: 2 }), MD.human({ b: 2, a: 1 }));
      });

      s.test('a nested value stays on one line inside its entry', function () {
        T.assertEqual(MD.humanInline({ ports: [80, 443], on: true }), 'on: true; ports: 80, 443');
      });

      s.test('the report prints the reading; the artifact keeps the canonical form', function () {
        ensureA();
        App.store.init(App.store.empty('android-adb'));
        var raw = '{"firewallRules":[{"ruleType":"DENY","portNumber":"443"}],"batteryWhitelist":["com.a"]}';
        App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
          'android.packages': snap('android.packages', 'com.a'),
          'android.tactical': snap('android.tactical', raw) } });
        App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
        var cap = App.registry.getDataset('android-adb', 'android.tactical')
          .capturedDefaults(App.store.getProject().deviceConfigs[0].snapshots['android.tactical']);
        App.store.getProject().items['android.tactical'].forEach(function (it) {
          var c = cap[it.key];
          App.store.setDecision('android.tactical', it.key, { value: c ? c.value : '', type: c ? c.type : 'string' });
        });
        var md = reportMd({ columns: { 'android.tactical': { value: true } } });
        var shownH = App.ui.mdPreview.toHtml(md).html;
        T.assert(/1\.\s+portNumber:\s+443;\s+ruleType:\s+DENY/.test(shownH),
          'the rule should read as a record: ' + md.slice(md.indexOf('firewall'), md.indexOf('firewall') + 300));
        T.assert(md.indexOf('"ruleType"') === -1, 'no JSON quoting should reach the report');
        // The tactical.json a device consumes is untouched — it is not prose.
        var impl = App.generate.buildImplementation(App.store.getProject(), 'dev-m1');
        var json = (impl.files || []).filter(function (f) { return /tactical\.json$/.test(f.name); })[0];
        T.assert(json && json.content.indexOf('"ruleType": "DENY"') !== -1, 'the artifact must stay canonical JSON');
      });

      s.test('the deviations table keeps a decision on one line', function () {
        var one = MD.humanInline({ action: 'disable', note: 'x' });
        T.assertEqual(one, 'action: disable; note: x');
        T.assert(one.indexOf('\n') === -1, 'a deviations cell must not force a grid table');
      });
    });

    /* ===== SUITES: satisfied with exception (EXC-1) ===== */

    T.suite('EXC-1 a control can be satisfied with an exception', function (s) {
      function withControl(state) {
        docProject();
        var base = App.store.getProject().deviceConfigs[0].baseId;
        var c = App.store.addControl({ title: 'ISM-1 BT', type: 'ISM', description: '', assignedDeviceIds: [base] });
        App.store.setItemFields('android.packages', 'com.b', { controlRefs: [c.id] });
        if (state) App.store.setControlDeviceState(c.id, base, state);
        return { id: c.id, base: base };
      }

      s.test('the three states cycle, and wrap', function () {
        var N = App.projectIo.nextControlState;
        T.assertEqual(N('unsatisfied'), 'satisfied');
        T.assertEqual(N('satisfied'), 'exception');
        T.assertEqual(N('exception'), 'unsatisfied');
        T.assertEqual(N(undefined), 'satisfied', 'an unknown state starts the cycle');
      });

      s.test('the vocabulary is one list, and it reads in English', function () {
        T.assertDeepEqual(App.projectIo.CONTROL_STATES, ['unsatisfied', 'satisfied', 'exception']);
        T.assertEqual(App.projectIo.controlStateLabel('exception'), 'Satisfied with Exception');
        T.assertEqual(App.projectIo.controlStateLabel('nonsense'), 'Unsatisfied', 'unknown must fail safe');
      });

      s.test('an exception is a DECIDED state', function () {
        T.assertEqual(App.projectIo.controlStateDecided('exception'), true);
        T.assertEqual(App.projectIo.controlStateDecided('satisfied'), true);
        T.assertEqual(App.projectIo.controlStateDecided('unsatisfied'), false);
      });

      s.test('the store accepts it, and it survives the project file', function () {
        var c = withControl('exception');
        T.assertEqual(App.store.controlDeviceState(App.store.getProject().controls[0], c.base), 'exception');
        var ser = App.projectIo.serializeProject(App.store.getProject());
        var r = App.projectIo.parseProject(ser);
        T.assertEqual(r.ok, true, JSON.stringify(r.issues));
        T.assertEqual(r.value.controls[0].deviceStates[c.base], 'exception');
      });

      s.test('an unknown state on disk is refused, and reads as unsatisfied', function () {
        var c = withControl('satisfied');
        var p = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        p.controls[0].deviceStates[c.base] = 'maybe';
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /deviceStates/.test(i.location || ''); }), 'schema must reject it');
        T.assertEqual(App.store.controlDeviceState(p.controls[0], c.base), 'unsatisfied', 'and the reader must fail safe');
      });

      s.test('an exception does not count as still-unsatisfied', function () {
        var c = withControl('exception');
        T.assertEqual(App.ui.views.devices.unsatisfiedControls(App.store.getProject(), c.base).length, 0);
        App.store.setControlDeviceState(c.id, c.base, 'unsatisfied');
        T.assertEqual(App.ui.views.devices.unsatisfiedControls(App.store.getProject(), c.base).length, 1);
      });

      s.test('the report names it, and flags a missing justification', function () {
        var c = withControl('exception');
        var md = reportMd({});
        T.assert(/Satisfied\s+with\s+Exception/.test(App.ui.mdPreview.toHtml(md).html), 'the state must reach the report');
        T.assert(/No\s+justification\s+recorded/.test(App.ui.mdPreview.toHtml(md).html),
          'an unexplained exception is the worst kind to leave blank');
        App.store.setControlDeviceJustification(c.id, c.base, 'Disabled in firmware instead.');
        T.assert(/Disabled\s+in\s+firmware\s+instead\./.test(App.ui.mdPreview.toHtml(reportMd({})).html),
          'the justification must be carried');
      });

      s.test('the control report names it too', function () {
        withControl('exception');
        App.util.clock.setClock(FIX);
        try {
          var md = App.generate.buildControlReport(App.store.getProject(), 'dev-m1', {}).text;
          T.assert(/Satisfied\s+with\s+Exception/.test(App.ui.mdPreview.toHtml(md).html), 'the control report must agree with the report');
        } finally { App.util.clock.resetClock(); }
      });

      s.test('the modal offers ONE button that steps to the next state', function () {
        var c = withControl('satisfied');
        var html = App.ui.views.devices.renderControlModal(App.store.getProject(), 'dev-m1', c.id);
        T.assert(/data-control-state-toggle="[^"]+" data-state="exception"/.test(html),
          'from Satisfied, one more click must reach the exception: ' + html.slice(0, 400));
        T.assert(/badge satisfied/.test(html), 'and the badge shows where it is now');
        App.store.setControlDeviceState(c.id, c.base, 'exception');
        var h2 = App.ui.views.devices.renderControlModal(App.store.getProject(), 'dev-m1', c.id);
        T.assert(/data-state="unsatisfied"/.test(h2), 'and the click after that returns to the start');
        T.assert(/badge exception/.test(h2), 'the exception has its own badge');
        T.assert(/no justification is recorded/.test(h2), 'an unexplained exception must be called out in the editor');
      });
    });

