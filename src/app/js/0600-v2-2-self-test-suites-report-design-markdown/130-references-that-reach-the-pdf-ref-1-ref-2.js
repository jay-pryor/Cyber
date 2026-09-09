    /* ===== SUITES: references that reach the PDF (REF-1 · REF-2) ===== */

    T.suite('REF-2 every mention of a control links to its coverage row', function (s) {
      var terms = [{ text: 'AHG-001', anchor: 'ctl-a' }, { text: 'ISM-1416', anchor: 'ctl-b' },
        { text: 'ISM-141', anchor: 'ctl-c' }];

      s.test('a mention in prose becomes a link', function () {
        T.assertEqual(MD.rich('Met by AHG-001.', { linkTerms: terms }), 'Met by [AHG-001](#ctl-a).');
      });

      s.test('the longest match wins, and a mention mid-word is not one', function () {
        T.assertEqual(MD.autoLink('ISM-1416', terms), '[ISM-1416](#ctl-b)',
          'ISM-141 must not eat the start of ISM-1416');
        T.assertEqual(MD.autoLink('AHG-0011 and xAHG-001', terms), 'AHG-0011 and xAHG-001',
          'neither leading nor trailing word characters may be linked over');
      });

      s.test('a term already inside a link is left alone', function () {
        T.assertEqual(MD.autoLink('[AHG-001](#ctl-a)', terms), '[AHG-001](#ctl-a)');
      });

      s.test('a code span is verbatim, so a mention inside one is not linked', function () {
        T.assertEqual(MD.rich('{{c}}AHG-001{{/c}}', { linkTerms: terms }), '`AHG-001`');
      });

      s.test('the coverage table anchors each row, and does not link a row to itself', function () {
        docProject();
        App.store.addControl({ title: 'AHG-001', type: 'ASD', description: 'Remove vendor bloat.' });
        var ctl = App.store.getProject().controls[0].id;
        App.store.setItemFields('android.packages', 'com.a',
          { controlRefs: [ctl], rationale: 'Satisfies AHG-001 in full.' });
        var md = reportMd({});
        T.assert(md.indexOf('[]{#' + App.generate.controlAnchor(ctl) + '}') !== -1,
          'the coverage row must carry the anchor every mention points at');
        T.assert(new RegExp('\\[AHG-001\\]\\(#' + App.generate.controlAnchor(ctl) + '\\)').test(md),
          'and the mention in the Rationale column must link to it');
        // The row's own first cell names the control; a link from there to here is noise.
        var row = md.slice(md.indexOf('[]{#' + App.generate.controlAnchor(ctl) + '}'));
        row = row.slice(0, row.indexOf('\n+'));
        T.assert(row.indexOf('](#' + App.generate.controlAnchor(ctl) + ')') === -1,
          'a row must not link to itself: ' + row);
      });

      s.test('with the coverage section switched off, nothing is linked', function () {
        // A link to a section that was not emitted is a link to nowhere, and pandoc will
        // not warn about it — so the honest answer is plain text.
        docProject();
        App.store.addControl({ title: 'AHG-001', type: 'ASD', description: 'x' });
        var blocks = [{ id: 'control', kind: 'control', included: false }];
        T.assertDeepEqual(App.generate.controlLinkTerms(App.store.getProject(), blocks), []);
        T.assertEqual(App.generate.controlLinkTerms(App.store.getProject(),
          [{ id: 'control', kind: 'control', included: true }]).length, 1);
      });

      s.test('the preview shows the control, not the span that anchors it', function () {
        // The anchor is machinery: it prints nothing on the page, so it must print
        // nothing here either — while still being somewhere a link can land.
        var cell = App.ui.mdPreview._cellHtml('[]{#ctl-ahg-001}\nAHG-001');
        T.assert(cell.indexOf('[]{#') === -1, 'the raw span must not be shown: ' + cell);
        T.assert(/id="ctl-ahg-001"/.test(cell), 'the id must survive so the link lands: ' + cell);
        T.assertEqual(cell.replace(/<[^>]*>/g, ''), 'AHG-001',
          'nothing but the control is left once the markup is stripped');
      });

      s.test('a mention still reaches the row the preview anchored', function () {
        docProject();
        App.store.addControl({ title: 'AHG-001', type: 'ASD', description: 'Remove vendor bloat.' });
        var ctl = App.store.getProject().controls[0].id;
        App.store.setItemFields('android.packages', 'com.a',
          { controlRefs: [ctl], rationale: 'Satisfies AHG-001 in full.' });
        var html = App.ui.mdPreview.toHtml(reportMd({})).html;
        T.assert(html.indexOf('[]{#') === -1, 'no raw anchor span may reach the reader');
        T.assert(html.indexOf('id="' + App.generate.controlAnchor(ctl) + '"') !== -1,
          'the coverage row must still carry the id');
        T.assert(html.indexOf('data-prv-jump="' + App.generate.controlAnchor(ctl) + '"') !== -1,
          'and the mention must still be a jump to it');
      });

      s.test('a row anchor costs the column no width and is never broken', function () {
        var wide = MD.table(['A', 'B'], [['x', 'y']], { rowAnchors: ['[]{#ctl-a-very-long-control-id}'] });
        T.assert(/^\+/.test(wide), 'an anchored table takes the grid form — a pipe cell has no line of its own');
        T.assert(wide.indexOf('[]{#ctl-a-very-long-control-id}') !== -1, 'the span must survive whole');
        var lines = wide.split('\n').filter(function (l) { return /^[+|]/.test(l); });
        var w = lines[0].length;
        T.assert(lines.every(function (l) { return l.length === w; }), 'a broken span would misalign the grid:\n' + wide);
      });
    });

    /* ===== SUITES: type, centring, table wording and placement (FNT-4 · CTR-1 · TBL-1 · SEC-4) ===== */

