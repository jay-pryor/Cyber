    /* ===== SUITES: whitespace as a measurement (SPC-1) ===== */
    T.suite('SPC-1 empty space is asked for in millimetres', function (s) {
      var DS = App.docStore, PV = App.ui.mdPreview;
      /** A hand-authored section to hang parts off. */
      function sec1() {
        docProject();
        var id = DS.addSection('Approval').id;
        App.store.setReportOrder([id]);
        return id;
      }
      function parts(id) {
        return App.store.getProject().report.sections.filter(function (x) { return x.id === id; })[0].parts || [];
      }

      s.test('a length is sanitised on the way into LaTeX, never interpolated raw', function () {
        T.assertEqual(MD.mmLen(20), '20mm');
        T.assertEqual(MD.mmLen('20'), '20mm', 'a text box hands over a string');
        T.assertEqual(MD.mmLen(12.345), '12.35mm', 'rounded to a hundredth of a millimetre');
        T.assertEqual(MD.mmLen(0), '', 'zero is no measurement');
        T.assertEqual(MD.mmLen(-5), '', 'and neither is a negative one');
        T.assertEqual(MD.mmLen('40mm}\\newpage{'), '', 'anything that is not a number is nothing');
        T.assertEqual(MD.mmLen(9999), MD.MAX_MM + 'mm', 'clamped rather than honoured');
        T.assertEqual(MD.vspace(0), '', 'no length, no block');
        T.assertEqual(MD.vspace(20), '```{=latex}\n\\vspace*{20mm}\n```',
          'starred, or it is discarded at the top of a page');
        T.assertEqual(MD.rowStrut(0), '');
        T.assertEqual(MD.rowStrut(18), '`\\rule[-18mm]{0pt}{0pt}`{=latex}',
          'depth and no height: the content stays at the top of the cell');
      });

      s.test('a Space part renders its gap, and nothing when it has none', function () {
        var id = sec1();
        DS.addPart(id, 'space');
        var p = parts(id)[0];
        T.assertEqual(p.kind, 'space');
        T.assertEqual(p.height, DS.DEFAULT_SPACE_MM, 'a new gap starts at something you can see');
        T.assertEqual(DOC.renderPart(p, {}), '```{=latex}\n\\vspace*{' + DS.DEFAULT_SPACE_MM + 'mm}\n```');
        DS.updatePart(id, p.id, { height: 40 });
        T.assertEqual(DOC.renderPart(parts(id)[0], {}), '```{=latex}\n\\vspace*{40mm}\n```');
        DS.updatePart(id, p.id, { height: '' });
        T.assertEqual(parts(id)[0].height, undefined, 'cleared is absent, not zero');
        T.assertEqual(DOC.renderPart(parts(id)[0], {}), '', 'and a gap of nothing emits nothing');
      });

      s.test('a table row takes extra height, on its first cell and on no other', function () {
        var id = sec1();
        DS.addPart(id, 'table');
        var t = parts(id)[0];
        DS.updatePart(id, t.id, { rowHeight: 22, header: ['Role', 'Signature'], rows: [['Approver', '']] });
        var md = DOC.renderPart(parts(id)[0], {});
        T.assert(/^\+-/.test(md), 'a strut needs a line of its own, so the table must be a grid table');
        T.assertEqual((md.match(/\\rule\[-22mm\]/g) || []).length, 1, 'one strut per row, in column 1: ' + md);
        var lines = md.split('\n').filter(function (l) { return l.indexOf('\\rule') !== -1; });
        T.assert(/^\|\s*`\\rule\[-22mm\]\{0pt\}\{0pt\}`\{=latex\}\s+\|\s+\|$/.test(lines[0]),
          'the strut sits alone on its own line, so it costs the column no width: ' + lines[0]);
        var body = md.split('\n');
        T.assert(body.indexOf(body.filter(function (l) { return /Approver/.test(l); })[0]) <
          body.indexOf(lines[0]), 'and AFTER the content, or it would push the text down the box');
      });

      s.test('the extra height goes to the rows that were ticked, and to no others', function () {
        var id = sec1();
        DS.addPart(id, 'table');
        var t = parts(id)[0];
        DS.updatePart(id, t.id, { rowHeight: 22, header: ['Role', 'Signature'],
          rows: [['Approver', ''], ['Reviewer', ''], ['Witness', '']] });
        function struts() {
          return DOC.renderPart(parts(id)[0], {}).split('\n')
            .map(function (l, i) { return l.indexOf('\\rule[-22mm]') !== -1 ? i : -1; })
            .filter(function (i) { return i !== -1; }).length;
        }
        T.assertEqual(struts(), 3, 'no ticks recorded means every row, as it always has');
        T.assertEqual(parts(id)[0].tallRows, undefined, 'and nothing is stored to say so');
        DS.setRowTall(id, t.id, 1, false);
        T.assertDeepEqual(parts(id)[0].tallRows, [true, false, true], 'the deviation is what is stored');
        T.assertEqual(struts(), 2, 'the unticked row takes no strut');
        var md = DOC.renderPart(parts(id)[0], {});
        T.assert(/\|\s*Reviewer\s*\|/.test(md), 'and it is still a row: ' + md);
        DS.setRowTall(id, t.id, 1, true);
        T.assertEqual(parts(id)[0].tallRows, undefined, 'all back on ⇒ the list goes away again (DOD-7)');
        // Every row unticked is a real state: the height stays, waiting to be given back.
        [0, 1, 2].forEach(function (i) { DS.setRowTall(id, t.id, i, false); });
        T.assertEqual(struts(), 0);
        T.assertEqual(parts(id)[0].rowHeight, 22, 'the measurement is not thrown away with the ticks');
        T.assert(App.docStore.rowTall(parts(id)[0], 0) === false);
      });

      s.test('the ticks travel with the rows, as the widths travel with the columns', function () {
        var id = sec1();
        DS.addPart(id, 'table');
        var t = parts(id)[0];
        DS.updatePart(id, t.id, { rowHeight: 20, header: ['A'], rows: [['one'], ['two'], ['three']] });
        DS.setRowTall(id, t.id, 0, false);
        T.assertDeepEqual(parts(id)[0].tallRows, [false, true, true]);
        DS.addRow(id, t.id, 1);
        T.assertDeepEqual(parts(id)[0].tallRows, [false, true, true, true], 'a new row is tall, and lands where it was inserted');
        DS.removeRow(id, t.id, 0);
        T.assertDeepEqual(parts(id)[0].tallRows, [true, true, true], 'the deleted row takes its tick with it');
        T.assertEqual(parts(id)[0].rows.length, 3, 'one entry per row, always');
      });

      s.test('a list that does not match the rows is a load error, and all-true is absence', function () {
        function tbl(extra) {
          var p = App.store.empty('android-adb');
          p.report = { sections: [{ id: 'sec1', title: 'X', parts: [Object.assign({ id: 'p1', kind: 'table',
            header: ['A'], rows: [['one'], ['two']], rowHeight: 20 }, extra)] }] };
          return App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; });
        }
        T.assertDeepEqual(tbl({}), [], 'no list at all is the ordinary case');
        T.assertDeepEqual(tbl({ tallRows: [true, false] }), [], 'one boolean per row is fine');
        T.assertEqual(tbl({ tallRows: [true] }).length, 1, 'one short cannot be applied to anything');
        T.assertEqual(tbl({ tallRows: [true, true] }).length, 1, 'all-true is written as absence, so it is not a file this build makes');
        T.assertEqual(tbl({ tallRows: ['yes', 'no'] }).length, 1, 'and it is booleans, not strings');
      });

      s.test('a table written before the ticks still makes every row taller', function () {
        // The whole point of "absent means all": a project saved when rowHeight was a
        // property of the TABLE must render exactly as it did.
        var md = MD.table(['A', 'B'].map(MD.cell),
          [[MD.cell('one'), MD.cell('')], [MD.cell('two'), MD.cell('')]], { rowHeight: 15 });
        T.assertEqual((md.match(/\\rule\[-15mm\]/g) || []).length, 2);
        var some = MD.table(['A', 'B'].map(MD.cell),
          [[MD.cell('one'), MD.cell('')], [MD.cell('two'), MD.cell('')]], { rowHeight: 15, tallRows: [false, true] });
        T.assertEqual((some.match(/\\rule\[-15mm\]/g) || []).length, 1);
        var wrong = MD.table(['A', 'B'].map(MD.cell),
          [[MD.cell('one'), MD.cell('')], [MD.cell('two'), MD.cell('')]], { rowHeight: 15, tallRows: [false] });
        T.assertEqual((wrong.match(/\\rule\[-15mm\]/g) || []).length, 2,
          'a list of the wrong length is ignored, not half-applied');
        var none = MD.table(['A', 'B'].map(MD.cell),
          [[MD.cell('one'), MD.cell('x')], [MD.cell('two'), MD.cell('y')]], { rowHeight: 15, tallRows: [false, false] });
        T.assertEqual(none.indexOf('\\rule'), -1, 'nothing ticked, nothing emitted');
        T.assert(/^\| A \| B \|/.test(none), 'and with no strut to carry, the pipe form is available again: ' + none);
      });

      s.test('the space above a section is a macro the profile defines, not a bare skip', function () {
        // The trap: a `\vspace*` written before a heading whose LEVEL starts a new page is
        // spent on the page being left. So it is named, and App.docFormat decides whether
        // the name has to clear the page first.
        var b = { id: 'x', kind: 'custom', title: 'Approval', label: 'Approval', level: 1,
          anchor: 'sec-x', number: '6', spaceBefore: 70 };
        T.assertEqual(DOC.gapFor(b), '```{=latex}\n\\chGapOne{70mm}\n```');
        T.assertEqual(DOC.gapFor(Object.assign({}, b, { level: 2 })), '```{=latex}\n\\chGapTwo{70mm}\n```');
        T.assertEqual(DOC.gapFor(Object.assign({}, b, { level: App.doc.TITLE_LEVEL })), '```{=latex}\n\\chGapTitle{70mm}\n```');
        T.assertEqual(DOC.gapFor(Object.assign({}, b, { spaceBefore: 0 })), '', 'no gap, no call');
        // No heading means no break hook to work through, so it is an ordinary skip.
        T.assertEqual(DOC.gapFor(Object.assign({}, b, { level: App.doc.BODY_LEVEL })),
          '```{=latex}\n\\vspace*{70mm}\n```');
        T.assertEqual(DOC.gapFor(Object.assign({}, b, { title: '', label: '' })),
          '```{=latex}\n\\vspace*{70mm}\n```');
      });

      s.test('the gap sits between the styling and the heading, never before it', function () {
        // \chTitleStyle sets \sectionbreak. A gap emitted ahead of it would have its
        // one-shot overwritten before titlesec ever called it.
        var b = { id: 'x', kind: 'custom', title: 'Cover', label: 'Cover', level: App.doc.TITLE_LEVEL,
          anchor: 'sec-x', spaceBefore: 70 };
        var h = DOC.headingFor(b, DOC.gapFor(b));
        T.assert(h.indexOf('\\chTitleStyle') < h.indexOf('\\chGapTitle'), 'the styling opens first: ' + h);
        T.assert(h.indexOf('\\chGapTitle') < h.indexOf('# Cover'), 'then the gap, then the heading');
        var c = Object.assign({}, b, { level: 2, centre: true });
        var hc = DOC.headingFor(c, DOC.gapFor(c));
        T.assert(hc.indexOf('\\chCentreTwo') < hc.indexOf('\\chGapTwo'), 'same order for a centred heading: ' + hc);
        T.assert(hc.indexOf('\\chGapTwo') < hc.indexOf('## Cover'));
        T.assertEqual(DOC.headingFor(b, ''), DOC.headingFor(b), 'no gap leaves the heading exactly as it was');
      });

      s.test('the profile clears the page for a level that breaks, and not otherwise', function () {
        var pre = App.docFormat.preamble(App.docFormat.standard());
        // The shipped baseline breaks at H1 and at the title, and at nothing else.
        T.assert(/\\newcommand\{\\chGapOne\}\[1\]\{\\clearpage\\vspace\*\{#1\}\\gdef\\sectionbreak\{\\gdef\\sectionbreak\{\\clearpage\}\}\}/.test(pre),
          'a breaking level must clear the page itself and eat the break titlesec is about to fire: ' +
          (pre.match(/\\newcommand\{\\chGapOne\}.*/) || ''));
        T.assert(/\\newcommand\{\\chGapTwo\}\[1\]\{\\vspace\*\{#1\}\}/.test(pre),
          'a level that does not break just leaves the glue');
        ['Title', 'One', 'Two', 'Three', 'Four'].forEach(function (w) {
          T.assert(pre.indexOf('\\newcommand{\\chGap' + w + '}') !== -1, 'no gap macro for ' + w);
        });
        var flat = App.docFormat.preamble(App.docFormat.normalise(
          Object.assign(JSON.parse(JSON.stringify(App.docFormat.standard())), { id: 'f', name: 'F',
            levels: App.docFormat.standard().levels.map(function (l) {
              return Object.assign({}, l, { pageBreakBefore: false });
            }) })));
        T.assert(/\\newcommand\{\\chGapOne\}\[1\]\{\\vspace\*\{#1\}\}/.test(flat),
          'turn the level break off and the gap stops clearing the page');
      });

      s.test('a designed document carries all three, in the right places', function () {
        var id = sec1();
        DS.setBlockSpace(id, 60);
        DS.addPart(id, 'space');
        DS.updatePart(id, parts(id)[0].id, { height: 25 });
        DS.addPart(id, 'table');
        DS.updatePart(id, parts(id)[1].id, { rowHeight: 18, header: ['Role', 'Signature'], rows: [['Approver', '']] });
        var md = reportMd({ sections: { control: false, guidelines: false, meta: false } });
        T.assert(/\\chGap(Title|One|Two|Three|Four)\{60mm\}/.test(md), 'the section gap is missing: ' + md.slice(0, 400));
        T.assert(md.indexOf('\\vspace*{25mm}') !== -1, 'the Space part is missing');
        T.assert(md.indexOf('\\rule[-18mm]{0pt}{0pt}') !== -1, 'the row strut is missing');
        T.assert(md.indexOf('\\chGap') < md.indexOf('# '), 'the gap must come before the heading it lifts');
      });

      s.test('the preview draws the gaps at their size, not as raw LaTeX', function () {
        var h = PV.toHtml('```{=latex}\n\\vspace*{20mm}\n```\n\nAfter.').html;
        T.assert(/<div class="prv-space" style="height:(\d+)px"><\/div>/.test(h), 'a gap must be drawn: ' + h);
        T.assertEqual(Number(/height:(\d+)px/.exec(h)[1]), App.docFormat.mmPx(20));
        T.assertEqual(h.indexOf('Raw LaTeX'), -1, 'never announced as machinery');
        var g = PV.toHtml('```{=latex}\n\\chGapOne{60mm}\n```\n\n# Approval').html;
        T.assert(/height:' + '/.test(g) === false && /prv-space/.test(g), 'the named form too: ' + g);
        T.assertEqual(Number(/height:(\d+)px/.exec(g)[1]), App.docFormat.mmPx(60));
        // A page break is still a page break, and still says so.
        T.assert(/prv-pagebreak/.test(PV.toHtml('```{=latex}\n\\newpage\n```').html));
      });

      s.test('the preview shows a sized row as a sized row, and hides the strut', function () {
        var md = MD.table(['Role', 'Signature'].map(MD.cell), [[MD.cell('Approver'), MD.cell('')]],
          { rowHeight: 22 });
        var h = PV.toHtml(md).html;
        T.assertEqual(h.indexOf('\\rule'), -1, 'the strut is machinery and must not print: ' + h);
        T.assert(/<div class="prv-strut" style="height:(\d+)px"><\/div>/.test(h), 'the height must reach the row: ' + h);
        T.assertEqual(Number(/prv-strut" style="height:(\d+)px/.exec(h)[1]), App.docFormat.mmPx(22));
        T.assert(/<tr style="vertical-align:top">/.test(h), 'and the cells sit at the top of it, as they do on the page');
        T.assert(/Approver/.test(h), 'the content is still there');
      });

      s.test('the preview sizes only the rows that were ticked', function () {
        var md = MD.table(['Role', 'Signature'].map(MD.cell),
          [[MD.cell('Approver'), MD.cell('')], [MD.cell('Reviewer'), MD.cell('')]],
          { rowHeight: 22, tallRows: [true, false] });
        var h = PV.toHtml(md).html;
        T.assertEqual((h.match(/prv-strut/g) || []).length, 1, 'one strut, for one ticked row: ' + h);
        var rows = h.split('<tr').slice(2);   // past the header row
        T.assert(/Approver/.test(rows[0]) && /prv-strut/.test(rows[0]), 'the ticked row is the tall one');
        T.assert(/Reviewer/.test(rows[1]) && rows[1].indexOf('prv-strut') === -1, 'and the other is untouched');
        T.assertEqual(h.indexOf('\\rule'), -1, 'still no machinery on the page');
      });

      s.test('a measurement that was set and cleared leaves no trace in the file', function () {
        var id = sec1();
        // The `report` block only: the file's own modifiedUtc moves with every commit,
        // which is not what this is about.
        function rpt() { return JSON.parse(App.projectIo.serializeProject(App.store.getProject())).report; }
        var clean = rpt();
        DS.setBlockSpace(id, 60);
        T.assertEqual(rpt().space[id], 60, 'it is written');
        DS.setBlockSpace(id, 0);
        T.assertDeepEqual(rpt(), clean, 'and taken away whole (DOD-7)');
        DS.addPart(id, 'space');
        var pid = parts(id)[0].id;
        DS.updatePart(id, pid, { height: 12.3456 });
        var round = App.projectIo.parseProject(App.projectIo.serializeProject(App.store.getProject()));
        T.assert(round.ok, 'it must load: ' + JSON.stringify(round.issues || []));
        T.assertEqual(round.value.report.sections[0].parts[0].height, 12.35, 'rounded on the way out, and it loads');
      });

      s.test('a length outside the schema is a load error, not a LaTeX one', function () {
        var p = App.store.empty('android-adb');
        p.report = { sections: [{ id: 'sec1', title: 'X', parts: [{ id: 'p1', kind: 'space', height: 9000 }] }] };
        var bad = App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; });
        T.assertEqual(bad.length, 1, 'a gap the width of a building must not reach the writer');
        p.report.sections[0].parts[0].height = '40mm';
        T.assertEqual(App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; }).length, 1,
          'and neither must a string');
        p.report.sections[0].parts[0].height = 40;
        T.assertDeepEqual(App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; }), []);
        p.report.space = { sec1: 0 };
        T.assertEqual(App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; }).length, 1,
          'zero is absence, so a stored zero is a file this build could not have written');
      });

      s.test('a project written before this loads, and reads as no space at all', function () {
        var p = App.store.empty('android-adb');
        p.report = { sections: [{ id: 'sec1', title: 'X', parts: [{ id: 'p1', kind: 'para', text: 'hi' }] }] };
        T.assertDeepEqual(App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; }), []);
        T.assertEqual(DOC.gapFor({ id: 'sec1', title: 'X', label: 'X', level: 1 }), '',
          'a block with no spaceBefore asks for nothing');
      });
    });

  })(App);
