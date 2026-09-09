    T.suite('NAM-2/CCOL-2 a generated section names its heading; a control names its type', function (s) {
      function blockOf(id) {
        return App.generate.reportBlocks(App.store.getProject(), App.registry.getPlatform('android-adb'), {})
          .filter(function (b) { return b.id === id; })[0];
      }

      s.test('a generated section carries the platform wording until it is reworded', function () {
        docProject();
        var b = blockOf('guidelines');
        T.assertEqual(b.title, 'Deviations from Security Guidelines');
        T.assertEqual(b.defaultTitle, 'Deviations from Security Guidelines');
        T.assertEqual(App.docStore.setBlockHeading('guidelines', 'Departures from ASD guidance').ok, true);
        b = blockOf('guidelines');
        T.assertEqual(b.title, 'Departures from ASD guidance', 'the heading must change');
        T.assertEqual(b.defaultTitle, 'Deviations from Security Guidelines', 'the standard wording is still known');
        T.assertEqual(b.label, 'Departures from ASD guidance', 'and with no name, the name follows the heading');
      });

      s.test('a name and a heading are independent', function () {
        docProject();
        App.docStore.setBlockHeading('control', 'Control coverage on this device');
        App.docStore.setBlockName('control', 'Coverage');
        var b = blockOf('control');
        T.assertEqual(b.label, 'Coverage', 'the list shows the name');
        T.assertEqual(b.title, 'Control coverage on this device', 'the document prints the heading');
        var md = reportMd({});
        T.assert(md.indexOf('Control coverage on this device {#sec-control}') !== -1, 'the reworded heading must reach the document');
        T.assert(md.indexOf('Coverage {#') === -1, 'the shorthand must not');
      });

      s.test('a blank heading returns the standard wording, leaving no trace', function () {
        docProject();
        App.docStore.setBlockHeading('control', 'Something else');
        App.docStore.setBlockHeading('control', '  ');
        T.assertEqual((App.store.getProject().report || {}).headings, undefined);
        T.assertEqual(blockOf('control').title, 'Control coverage');
      });

      s.test('the Section pane offers a heading box, with the standard wording as its placeholder', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('control');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-sec-heading="control"/.test(html), 'no heading box');
        T.assert(/placeholder="Control coverage"/.test(html), 'the standard wording must be offered');
        // A hand-authored section already owns its heading; a second box for the same
        // thing is how the two end up disagreeing.
        var sec = App.docStore.addSection('Annex').id;
        App.ui.views.reportDesign.select(sec);
        var custom = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-sec-title="/.test(custom) && !/data-rd-sec-heading="/.test(custom),
          'a custom section keeps one heading box, not two');
        App.ui.views.reportDesign.close();
      });

      s.test('the section preview shows the HEADING, not the list name', function () {
        docProject();
        App.docStore.setBlockName('ds:android.packages', 'Pkgs');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var html = App.ui.views.generate.render(App.store.getProject());
        var prev = html.slice(html.indexOf('rd-secprev'));
        T.assert(/Packages/.test(prev), 'the preview must show the heading: ' + prev.slice(0, 300));
        T.assert(prev.indexOf('>Pkgs<') === -1, 'and not the section list\'s shorthand');
        App.ui.views.reportDesign.close();
      });

      s.test('the control type is a column, not brackets after the title', function () {
        docProject();
        var base = App.store.getProject().deviceConfigs[0].baseId;
        var c = App.store.addControl({ title: 'ISM-1234 Bluetooth', type: 'ISM', description: '', assignedDeviceIds: [base] });
        App.store.setItemFields('android.packages', 'com.b', { controlRefs: [c.id] });
        var md = reportMd({ columns: { control: { type: true } } });
        var section = md.slice(md.indexOf('{#sec-control}'), md.indexOf('{#sec-deviations}'));
        T.assert(section.indexOf('ISM-1234 Bluetooth (ISM)') === -1, 'the type must not ride along in the title');
        T.assert(/\|\s*Type\s*\|/.test(section), 'it must have its own column:\n' + section);
        T.assert(/\|\s*ISM\s*\|/.test(section), 'carrying the type');
      });

      s.test('and it can be switched off like any other column', function () {
        docProject();
        var base = App.store.getProject().deviceConfigs[0].baseId;
        var c = App.store.addControl({ title: 'ISM-1234 Bluetooth', type: 'ISM', description: '', assignedDeviceIds: [base] });
        App.store.setItemFields('android.packages', 'com.b', { controlRefs: [c.id] });
        var md = reportMd({ columns: { control: { type: false } } });
        var section = md.slice(md.indexOf('{#sec-control}'), md.indexOf('{#sec-deviations}'));
        T.assert(!/\|\s*Type\s*\|/.test(section), 'the column must be gone:\n' + section);
        T.assert(/ISM-1234 Bluetooth/.test(section), 'while the control stays');
      });
    });

    /* ===== SUITES: section names and introductions (NAM-1 · SEC-1) ===== */

    T.suite('NAM-1/SEC-1 a section names itself, and introduces itself', function (s) {
      function blocks() {
        var pl = App.registry.getPlatform('android-adb');
        return App.generate.reportBlocks(App.store.getProject(), pl, {});
      }
      function block(id) { return blocks().filter(function (b) { return b.id === id; })[0]; }

      s.test('with no name, the name IS the heading', function () {
        docProject();
        var b = block('ds:android.packages');
        T.assertEqual(b.label, 'Packages');
        T.assertEqual(b.title, 'Packages');
        T.assertEqual(b.name, '');
      });

      s.test('a name changes the LIST, never the heading', function () {
        docProject();
        T.assertEqual(App.docStore.setBlockName('ds:android.tactical', 'Knox').ok, true);
        var b = block('ds:android.tactical');
        T.assertEqual(b.label, 'Knox', 'the list shows the name');
        T.assertEqual(b.title, 'Tactical', 'the document still prints the heading');
        var md = reportMd({});
        T.assert(/# \d+ Tactical \{#sec-ds-android-tactical\}/.test(md), 'the heading must be unchanged: ' + md.slice(0, 200));
        T.assert(md.indexOf('Knox') === -1, 'the shorthand must not reach the document');
      });

      s.test('a blank name is stored as absence', function () {
        docProject();
        App.docStore.setBlockName('ds:android.tactical', 'Knox');
        App.docStore.setBlockName('ds:android.tactical', '   ');
        T.assertEqual((App.store.getProject().report || {}).names, undefined);
        T.assertEqual(block('ds:android.tactical').label, 'Tactical');
      });

      s.test('an introduction sits between the heading and the table', function () {
        docProject();
        T.assertEqual(App.docStore.setBlockIntro('ds:android.packages', 'Reviewed line by line.').ok, true);
        var md = reportMd({});
        var i = md.indexOf('Packages {#sec-ds-android-packages}');
        var lead = md.indexOf('Reviewed line by line.');
        var table = md.indexOf('[]{#tbl-ds-android-packages');
        T.assert(i !== -1 && lead > i, 'the introduction must follow the heading');
        T.assert(table === -1 || lead < table, 'and precede the table');
      });

      s.test('an introduction is rich text, escaped on the way out', function () {
        docProject();
        App.docStore.setBlockIntro('ds:android.packages', '{{b}}50%{{/b}} of the baseline');
        var md = reportMd({});
        T.assert(md.indexOf('**50\\%** of the baseline') !== -1, 'expected bold + escaped percent: ' + md.slice(md.indexOf('50'), md.indexOf('50') + 60));
      });

      s.test('a grouped register is introduced once, not once per group', function () {
        docProject();
        App.docStore.setBlockIntro('ds:android.packages', 'Introduced once.');
        var md = reportMd({});
        T.assertEqual((md.match(/Introduced once\./g) || []).length, 1);
      });

      s.test('a custom section takes both, and its heading stays its own field', function () {
        docProject();
        var sec = App.docStore.addSection('A very long heading nobody wants in a list').id;
        App.docStore.setBlockName(sec, 'Annex A');
        T.assertEqual(block(sec).label, 'Annex A');
        T.assertEqual(block(sec).title, 'A very long heading nobody wants in a list');
      });

      s.test('deleting a section takes its name and introduction with it', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.setBlockName(sec, 'A');
        App.docStore.setBlockIntro(sec, 'Text.');
        App.docStore.setBlockTableStyle(sec, 'head', true);
        App.docStore.removeSection(sec);
        var bag = App.store.getProject().report || {};
        T.assertEqual(bag.names, undefined);
        T.assertEqual(bag.intros, undefined);
        T.assertEqual(bag.tableStyles, undefined);
      });

      s.test('a report template carries the names, introductions and table styling', function () {
        docProject();
        App.docStore.setBlockName('ds:android.packages', 'Pkgs');
        App.docStore.setBlockIntro('ds:android.packages', 'Lead.');
        App.docStore.setBlockTableStyle('ds:android.packages', 'head', true);
        App.docStore.saveReportTemplate('House');
        App.docStore.setBlockName('ds:android.packages', '');
        App.docStore.setBlockIntro('ds:android.packages', '');
        App.docStore.setBlockTableStyle('ds:android.packages', 'head', false);
        App.docStore.useReportTemplate('rpt1');
        var bag = App.store.getProject().report;
        T.assertEqual(bag.names['ds:android.packages'], 'Pkgs');
        T.assertEqual(bag.intros['ds:android.packages'], 'Lead.');
        T.assertEqual(bag.tableStyles['ds:android.packages'].head, true);
      });

      s.test('the Section pane offers a name box and an introduction box', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-sec-name="ds:android.packages"/.test(html), 'no name box');
        T.assert(/data-rd-intro="ds:android.packages"/.test(html), 'no introduction box');
        // RTX-1: one toolbar serves every prose box, so the button is `data-rd-wrap`
        // with the block it belongs to rather than a second, introduction-only control.
        T.assert(/data-rd-wrap="b" data-rd-block="ds:android.packages"/.test(html),
          'no rich-text control on the introduction');
        App.ui.views.reportDesign.close();
      });
    });

