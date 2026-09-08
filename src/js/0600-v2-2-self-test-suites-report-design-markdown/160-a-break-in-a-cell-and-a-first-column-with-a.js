    T.suite('PRV-4 the preview can be laid out as pages', function (s) {
      s.test('off, it is the continuous sheet it has always been', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('preview');
        App.ui.views.reportDesign._rd.pages = false;
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-pageview/.test(html), 'the toggle must be offered');
        T.assert(html.indexOf('data-prv-pages') === -1, 'and off means no sheets');
        App.ui.views.reportDesign.close();
      });

      s.test('on, the page metrics come from the profile rather than from a guess', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('preview');
        App.ui.views.reportDesign._rd.pages = true;
        var html = App.ui.views.generate.render(App.store.getProject());
        var m = App.docFormat.pageMetrics(App.docFormat.standard());
        T.assert(new RegExp('data-prv-ph="' + m.height + '"').test(html), 'the sheet height: ' + m.height);
        T.assert(new RegExp('data-prv-mt="' + m.top + '"').test(html), 'and the top margin the header sits in');
        App.ui.views.reportDesign._rd.pages = false;
        App.ui.views.reportDesign.close();
      });

      s.test('A4 at 25mm margins is the sheet the profile describes', function () {
        var m = App.docFormat.pageMetrics(App.docFormat.standard());
        T.assertEqual(m.width, 794, '210mm at 96dpi');
        T.assertEqual(m.height, 1123, '297mm at 96dpi');
        T.assertEqual(m.left, 94, '25mm at 96dpi');
        var a5 = App.docFormat.pageMetrics(App.docFormat.normalise({ id: 'p', name: 'P', page: { paper: 'a5' } }));
        T.assert(a5.height < m.height, 'and a smaller paper is a smaller sheet');
      });
    });

    /* ===== SUITES: a break in a cell, and a first column with a size (D-061 · FNT-6) ===== */

    T.suite('D-061 a line break in a table cell reaches the preview', function (s) {
      var PV = App.ui.mdPreview;
      // A cell's lines are separated by CELL_BREAK until gridTable draws them; what the
      // preview reads back is the drawn form, so that is what these hand over.
      function cell(tokens) { return MD.richCell(tokens).split(MD.CELL_BREAK).join('\n'); }
      s.test('a break in a cell draws one, and shows no backslash', function () {
        // A cell's hard break is a trailing backslash and a newline, exactly as a
        // paragraph's is (RTX-2/D-060). Folding the cell's lines with a space BEFORE the
        // inline pass left `\ `, which no rule recognises: the break vanished and the
        // backslash printed.
        var html = PV._cellHtml(cell('one{{br}}two'));
        T.assert(html.indexOf('<br>') !== -1, 'the break must be drawn: ' + html);
        T.assert(html.indexOf('\\') === -1, 'and no backslash shown: ' + html);
        T.assertEqual(html.replace(/<[^>]*>/g, ''), 'onetwo', 'with nothing else added');
      });

      s.test('a cell holding nothing but a break holds no backslash', function () {
        // Reported as "backslashes showing up in empty boxes": a spacer typed into an
        // otherwise empty cell came out as a lone `\` on the page's own preview.
        var html = PV._cellHtml(cell('{{br}}'));
        T.assert(html.indexOf('\\') === -1, 'an empty box must stay empty: ' + JSON.stringify(html));
      });

      s.test('through a whole table, as the document carries it', function () {
        var md = MD.gridTable(['A', 'B'], [[MD.richCell('one{{br}}two'), MD.richCell('x')]], {});
        var html = PV.toHtml(md).html;
        T.assert(html.indexOf('<br>') !== -1, 'the break survives the table walker: ' + html);
        T.assert(html.indexOf('\\') === -1, 'and nothing of how it is written is shown: ' + html);
      });

      s.test('and the empty box survives the table walker too', function () {
        /* The second half of the same defect, and the one the report named. A cell whose
         * last line is BR-1's non-breaking spacer had it read as padding — `String.trim()`
         * strips U+00A0 — so the line was dropped and the break's backslash was left with
         * nothing to break onto. */
        var md = MD.gridTable(['A', 'B'], [[MD.richCell('{{br}}'), MD.richCell('x')]], {});
        var html = PV.toHtml(md).html;
        T.assert(html.indexOf('\\') === -1, 'no backslash may reach the reader: ' + html);
        T.assert(/<td><br><\/td>/.test(html), 'the break is drawn, and the box is otherwise empty: ' + html);
      });

      s.test('a WRAPPED line is still one line, which is what pandoc does with it', function () {
        // Only a break is a break. Consecutive lines with no backslash are one paragraph
        // on the page, so they are one paragraph here — that is what D-025 settled, and
        // the fix must not undo it.
        T.assertEqual(PV._cellHtml('one\ntwo'), 'one two');
        T.assertEqual(PV._cellHtml('one\n\ntwo'), '<div class="prv-cp">one</div><div class="prv-cp">two</div>',
          'while a blank line is still two paragraphs');
      });

      s.test('a row anchor still costs the row nothing', function () {
        // The anchor sits on a line of its own so it takes no width; the newline after it
        // is part of that machinery and is consumed with it, or every anchored row would
        // start with a space the page does not have.
        T.assertEqual(PV._cellHtml('[]{#ctl-ahg-001}\nAHG-001').replace(/<[^>]*>/g, ''), 'AHG-001');
      });
    });

    T.suite('FNT-6 the table\'s first column takes a size of its own', function (s) {
      function withCol(size) {
        return App.docFormat.normalise({ id: 'p', name: 'P', tables: { firstColFontSize: size } });
      }
      var H = ['Key', 'Value'], R = [['one', 'two'], ['three', 'four']];

      s.test('blank is the shipped profile, and the macro is defined either way', function () {
        T.assertEqual(App.docFormat.standard().tables.firstColFontSize, '');
        // Defined whatever the profile says, on the rule the shading macros follow: a
        // document naming a macro the preamble does not define is a compile error.
        T.assert(/\\newcommand\{\\chTblColFont\}\{\}/.test(App.docFormat.preamble(App.docFormat.standard())),
          'an empty macro when nothing is set');
        T.assertEqual(App.docFormat.tableStyle(App.docFormat.standard(), {}), null,
          'and nothing is handed to the table writer');
      });

      s.test('a size reaches the preamble as a macro of its own', function () {
        var pre = App.docFormat.preamble(withCol('8'));
        T.assert(/\\newcommand\{\\chTblColFont\}\{\\fontsize\{8pt\}\{9\.6pt\}\\selectfont\}/.test(pre),
          'the size and its leading: ' + pre);
      });

      s.test('and reaches every table, opted in or not, as a span on each body cell', function () {
        var st = App.docFormat.tableStyle(withCol('8'), {});
        T.assertEqual(st.firstColumn.fontSize, 8, 'the style carries it as a flag');
        var md = MD.table(H, R, { style: st });
        T.assert(md.indexOf('`\\chTblColFont`{=latex}') !== -1, 'the span must be emitted: ' + md);
        T.assertEqual(md.split('\\chTblColFont').length - 1, R.length, 'once per BODY row, and no more');
        T.assert(md.indexOf('+=') !== -1, 'and it forces the grid form, which is the only one that can carry it');
      });

      s.test('beside a shade, both spans travel together', function () {
        var f = withCol('8');
        var md = MD.table(H, R, { style: App.docFormat.tableStyle(f, { firstColumn: true }) });
        T.assert(/`\\chTblColShade`\{=latex\}`\\chTblColFont`\{=latex\}/.test(md),
          'the shade first, then the size: ' + md);
      });

      s.test('the preview shows the size and not the span that carries it', function () {
        var md = MD.table(H, R, { style: App.docFormat.tableStyle(withCol('8'), {}) });
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(html.indexOf('chTblColFont') === -1, 'the raw span is machinery: ' + html);
        T.assert(/<td>one<\/td>/.test(html), 'and the cell is its content alone: ' + html);
        var css = App.docFormat.previewCss(withCol('8'));
        T.assert(/\.prv-table tbody td:first-child \{ font-size: 10\.67px/.test(css), 'the size is on the paper: ' + css);
        T.assert(App.docFormat.previewCss(App.docFormat.standard()).indexOf('td:first-child { font-size') === -1,
          'and a profile that sets none has the stylesheet it always had');
      });

      s.test('the width model is charged for it, which is what D-027 was about', function () {
        // A column set larger needs more room by exactly the ratio it was enlarged by.
        // Measured against the same table with no first-column size at all.
        var rows = [['Key', 'Value'], [new Array(60).join('word '), new Array(60).join('word ')]];
        var plain = MD.autoWidths(rows, 2, { pageEm: 36 });
        var big = MD.autoWidths(rows, 2, { pageEm: 36, firstCol: 2 });
        T.assert(big[0] / big[1] > plain[0] / plain[1],
          'a first column set larger must claim more of the page: ' + big.join('/') + ' vs ' + plain.join('/'));
        var small = MD.autoWidths(rows, 2, { pageEm: 36, firstCol: 0.5 });
        T.assert(small[0] / small[1] < plain[0] / plain[1], 'and one set smaller, less: ' + small.join('/'));
      });

      s.test('blank means the table body\'s size, in the model as in the macro', function () {
        var m = App.docFormat.tableMetrics(App.docFormat.normalise({ id: 'p', name: 'P', tables: { fontSize: '8' } }));
        T.assertEqual(m.firstCol, m.body, 'unset, it follows the body');
        var set = App.docFormat.tableMetrics(App.docFormat.normalise({ id: 'p', name: 'P',
          tables: { fontSize: '8', firstColFontSize: '11' } }));
        T.assertEqual(set.firstCol, 1, 'set, it is its own size against the document\'s');
      });

      s.test('a profile saved before this opens unchanged', function () {
        var old = App.docFormat.normalise({ id: 'p', name: 'P', tables: { firstColBold: true } });
        T.assertEqual(old.tables.firstColFontSize, '');
        T.assertEqual(old.tables.firstColBold, true, 'and keeps what it did ask for');
      });
    });

