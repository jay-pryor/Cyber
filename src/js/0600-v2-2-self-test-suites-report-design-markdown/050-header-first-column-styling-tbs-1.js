    /* ===== SUITES: header + first-column styling (TBS-1) ===== */

    T.suite('TBS-1 a styled header row and first column', function (s) {
      var H = ['A', 'B'], R = [['one', 'two'], ['three', 'four']];
      function styled(flags) { return App.docFormat.tableStyle(App.docFormat.standard(), flags); }

      s.test('nothing is styled unless the table asks', function () {
        T.assertEqual(App.docFormat.tableStyle(App.docFormat.standard(), null), null);
        T.assertEqual(App.docFormat.tableStyle(App.docFormat.standard(), { head: false, firstColumn: false }), null);
        var md = MD.table(H, R, {});
        T.assert(md.indexOf('chTblHeadShade') === -1 && md.indexOf('chTblColShade') === -1, 'unasked-for styling leaked in');
      });

      s.test('opting a header row in buys the shading group, and nothing else', function () {
        var md = MD.table(H, R, { style: styled({ head: true }) });
        T.assert(md.indexOf(MD.HEAD_SHADE_OPEN) === 0, 'the shading group must open before the table');
        T.assert(md.indexOf(MD.HEAD_SHADE_CLOSE) > 0, 'and close after it');
        // FNT-4: the weight used to be markdown emphasis written here, which reached only
        // the sections that had opted in. It is a document-wide type setting now
        // (tables.headBold -> \chTblHeadFont), so the markdown carries no emphasis at all.
        T.assert(!/\*\*A\*\*/.test(md), 'the header weight is type, not markdown: ' + md);
        T.assert(!/\*\*one\*\*/.test(md), 'a body cell must not be emphasised by a header style');
      });

      s.test('the first column carries the shade span, and only the body cells do', function () {
        var md = MD.table(H, R, { style: styled({ firstColumn: true }) });
        T.assertEqual((md.match(/chTblColShade/g) || []).length, 2, 'one span per BODY row, not the header');
        // FNT-5: opting in buys the SHADE. The weight is a document-wide setting now
        // (tables.firstColBold), so an opt-in on its own emphasises nothing.
        T.assert(!/\*\*one\*\*/.test(md), 'the first column\'s weight is type, not an opt-in: ' + md);
      });

      s.test('FNT-5: the first column\'s weight reaches every table, opted in or not', function () {
        var bold = App.docFormat.normalise(Object.assign(App.docFormat.standard(), { id: 'p', builtin: false }));
        bold.tables.firstColBold = true;
        var plain = App.docFormat.tableStyle(bold, { head: false, firstColumn: false });
        T.assertDeepEqual(plain, { firstColumn: { bold: true } }, 'no opt-in, and still the weight');
        var md = MD.table(H, R, { style: plain });
        T.assert(/\*\*one\*\*/.test(md) && !/\*\*two\*\*/.test(md), 'only column 0 is emphasised: ' + md);
        T.assert(md.indexOf('chTblColShade') === -1, 'and no shade came with it');
        var shaded = App.docFormat.tableStyle(bold, { firstColumn: true });
        T.assertEqual(shaded.firstColumn.shade, bold.tables.firstColumn.shade, 'opting in adds the shade');
        T.assertEqual(shaded.firstColumn.bold, true, 'and keeps the weight');
      });

      s.test('FNT-5: the shipped shade is one a reader can see', function () {
        // #F2F2F2 measured under 5% away from white — on paper, nothing at all, which is
        // why styling the first column read as doing nothing.
        var shade = App.docFormat.standard().tables.firstColumn.shade.toLowerCase();
        var grey = parseInt(shade.slice(1, 3), 16);
        T.assert(grey <= 0xEC, 'the first-column shade must be visible against white: ' + shade);
      });

      s.test('a shaded first column forces the grid form and stays aligned', function () {
        var md = MD.table(H, R, { style: styled({ firstColumn: true }) });
        T.assert(/^\+/.test(md), 'a pipe table cannot carry a prefix on its own line');
        T.assert(gridAligned(md), 'the prefix must not push a row past its border:\n' + md);
      });

      s.test('the shade span costs the column no width', function () {
        // It sits on its own line inside the cell — pandoc folds a cell's consecutive
        // lines into one paragraph — so the fractions are the ones that were asked for.
        var a = borderFractions(MD.table(H, R, { widths: [0.7, 0.3] }));
        var b = borderFractions(MD.table(H, R, { widths: [0.7, 0.3], style: styled({ firstColumn: true }) }));
        T.assert(Math.abs(a[0] - b[0]) < 0.001, 'shading changed the width: ' + a[0] + ' vs ' + b[0]);
      });

      s.test('a narrow shaded column is widened to hold the span rather than break it', function () {
        var md = MD.table(['A', 'B'], [['x', 'y']], { widths: [0.05, 0.95], style: styled({ firstColumn: true }) });
        T.assert(gridAligned(md), 'a broken raw-LaTeX span would misalign the grid:\n' + md);
        T.assert(md.indexOf(MD.COL_SHADE) !== -1, 'the span must survive whole');
      });

      s.test('D-053: both header rows are shaded, not just the title', function () {
        /* `\chTblHeadShade` works by redefining `\toprule`, which pandoc emits ONCE,
         * before the first header row — so with a title row above the column headings
         * the colour reached the title and left the headings white. `\rowcolor` cannot
         * be reached for the second row: it has to sit at the start of the row, and
         * everything markdown can put there is inside a cell.
         *
         * `\cellcolor` CAN be inside a cell, and works from inside the minipage pandoc
         * wraps a header cell in — measured, because that was the whole question. So the
         * headings row is coloured cell by cell, the same mechanism the first column has
         * used since TBS-1. `\chTblHeadRow` is the row-level equivalent for a writer that
         * can reach a row start (a filter that assembles the table itself).
         */
        var shaded = App.docFormat.tableStyle(App.docFormat.standard(), { head: true });
        var withTitle = MD.table(['A', 'B'].map(MD.cell), [['x', 'y'].map(MD.cell)],
          { titleRow: MD.text('Title'), style: shaded });
        T.assertEqual((withTitle.match(/chTblHeadCell/g) || []).length, 2,
          'one per heading cell when a title row has taken the row colour: ' + withTitle);
        var noTitle = MD.table(['A', 'B'].map(MD.cell), [['x', 'y'].map(MD.cell)], { style: shaded });
        T.assert(noTitle.indexOf('chTblHeadCell') === -1,
          'and none without one — the row colour reaches the headings as it always has');
        var unshaded = MD.table(['A', 'B'].map(MD.cell), [['x', 'y'].map(MD.cell)],
          { titleRow: MD.text('Title') });
        T.assert(unshaded.indexOf('chTblHeadCell') === -1, 'nor when nothing is shaded');

        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\newcommand\{\\chTblHeadCell\}\{\\cellcolor\{chTblHeadColour\}\}/.test(pre), 'the cell macro');
        T.assert(/\\newcommand\{\\chTblHeadRow\}\{\}/.test(pre), 'the row macro, empty until asked for');
        T.assert(/chTblHeadShade[^\n]*renewcommand\{\\chTblHeadRow\}/.test(pre),
          'and opting in is what turns it on: ' + (pre.match(/.*chTblHeadShade\}\{.*/) || ''));
      });

      s.test('the shade span costs the header column no width, and is not shown', function () {
        var shaded = App.docFormat.tableStyle(App.docFormat.standard(), { head: true });
        var a = MD.table(['Package', 'Action'].map(MD.cell), [['x', 'y'].map(MD.cell)],
          { titleRow: MD.text('T'), widths: [0.5, 0.5] });
        var b = MD.table(['Package', 'Action'].map(MD.cell), [['x', 'y'].map(MD.cell)],
          { titleRow: MD.text('T'), widths: [0.5, 0.5], style: shaded });
        function border(md) { return md.split('\n').filter(function (l) { return /^\+/.test(l); })[1]; }
        T.assertEqual(border(b).length, border(a).length,
          'the span sits on its own line, so it costs no width:\n' + b);
        var html = App.ui.mdPreview.toHtml(b).html;
        T.assert(html.indexOf('chTblHeadCell') === -1, 'and it is machinery, never shown: ' + html);
        T.assert(/<th>Package<\/th>/.test(html), 'the heading reads as itself');
      });

      s.test('the profile defines the macros the fences call', function () {
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\usepackage\{colortbl\}/.test(pre), 'colortbl is what draws a table colour');
        T.assert(/\\newcommand\{\\chTblHeadShade\}/.test(pre), 'the header macro must exist');
        T.assert(/\\newcommand\{\\chTblColShade\}/.test(pre), 'the first-column macro must exist');
        T.assert(/\\definecolor\{chTblHeadColour\}\{HTML\}\{D9E2F3\}/.test(pre), 'the baseline colour: ' + pre);
        // xcolor is already loaded by pandoc's template, so a second load with an
        // option is an Option clash — a hard failure, measured on 3.1.11 + tectonic.
        T.assert(pre.indexOf('\\usepackage[table]{xcolor}') === -1, 'must not re-load xcolor with an option');
      });

      s.test('a profile with no shade colour still defines the macros, as no-ops', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { shade: '' }, firstColumn: { shade: '' } } });
        var pre = App.docFormat.preamble(f);
        T.assert(/\\newcommand\{\\chTblHeadShade\}\{\}/.test(pre), 'an undefined macro would be a compile error');
        T.assert(/\\newcommand\{\\chTblColShade\}\{\}/.test(pre));
        T.assert(pre.indexOf('definecolor{chTblHeadColour}') === -1, 'no colour, no definition');
      });

      s.test('a malformed shade is dropped rather than handed to LaTeX', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { shade: 'rgb(1,2,3)' } } });
        T.assertEqual(f.tables.head.shade, '');
        T.assertEqual(App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { shade: 'AABBCC' } } }).tables.head.shade, '#aabbcc');
      });

      s.test('a table style merges field by field rather than wholesale', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { shade: '#123456' } } });
        T.assertEqual(f.tables.head.shade, '#123456', 'the pinned field wins');
        T.assertEqual(f.tables.firstColumn.shade, App.docFormat.STANDARD.tables.firstColumn.shade.toLowerCase(),
          'the unpinned field keeps the baseline');
      });

      s.test('FNT-5: a profile written before the split keeps the first-column weight it had', function () {
        // `tables.firstColumn.bold` reached only the sections that had opted in. It is a
        // document-wide setting now, and a saved profile that asked for bold must still
        // get bold rather than silently losing it — the same rule FNT-4 used.
        var old = App.docFormat.normalise({ id: 'p', name: 'P', tables: { firstColumn: { bold: true, italic: true } } });
        T.assertEqual(old.tables.firstColBold, true, 'the old field is read where the new one is silent');
        T.assertEqual(old.tables.firstColItalic, true);
        T.assertEqual(old.tables.firstColumn.bold, undefined, 'and it does not survive as a second switch');
        var newer = App.docFormat.normalise({ id: 'p', name: 'P', tables: { firstColumn: { bold: true }, firstColBold: false } });
        T.assertEqual(newer.tables.firstColBold, false, 'a profile edited since is not overruled by the leftover');
      });

      s.test('FNT-4: a profile written before the split keeps the header weight it had', function () {
        // `tables.head.bold` was the only way a header row could be bold. A saved profile
        // that switched it OFF must still produce a plain header, not inherit the new
        // document-wide default of bold.
        var off = App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { bold: false } } });
        T.assertEqual(off.tables.headBold, false, 'the old field is read where the new one is silent');
        T.assertEqual(off.tables.head.bold, undefined, 'and it does not survive as a second switch');
        var newer = App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { bold: false }, headBold: true } });
        T.assertEqual(newer.tables.headBold, true, 'a profile edited since is not overruled by the leftover');
      });

      s.test('a part records its own opt-in, and only when true', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.updatePart(sec, 'part1', { styleHead: true, styleFirstColumn: false });
        var ser = App.projectIo.serializeProject(App.store.getProject());
        T.assert(ser.indexOf('"styleHead": true') !== -1, 'the opt-in must persist');
        T.assert(ser.indexOf('styleFirstColumn') === -1, 'off is the ABSENT state');
        T.assertEqual(App.projectIo.serializeProject(App.projectIo.parseProject(ser).value), ser);
      });

      s.test('a generated section records its opt-in against the block id', function () {
        docProject();
        T.assertEqual(App.docStore.setBlockTableStyle('ds:android.packages', 'head', true).ok, true);
        T.assertEqual(App.store.getProject().report.tableStyles['ds:android.packages'].head, true);
        // The FENCE, not the macro name: the macro is DEFINED in every document's
        // preamble, so searching for the name alone would pass whatever was switched on.
        var md = reportMd({});
        T.assert(md.indexOf(MD.HEAD_SHADE_OPEN) !== -1, 'the section did not carry its styling into the document');
        App.docStore.setBlockTableStyle('ds:android.packages', 'head', false);
        T.assertEqual((App.store.getProject().report || {}).tableStyles, undefined, 'switching the last one off leaves nothing behind');
        T.assert(reportMd({}).indexOf(MD.HEAD_SHADE_OPEN) === -1, 'and the document loses it too');
      });

      s.test('the preview marks the styled parts without repainting the profile colour', function () {
        var md = MD.table(H, R, { style: styled({ head: true, firstColumn: true }), caption: { id: 'x', text: 'Cap' } });
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/prv-shade-head/.test(html), 'the shaded header should be flagged');
        T.assert(/prv-shade-col/.test(html), 'the shaded first column should be flagged');
        T.assert(html.indexOf('chTblColShade') === -1, 'the raw span must not be shown as content');
        T.assert(html.indexOf('Raw LaTeX') === -1, 'the shading fences are machinery, not content');
      });

      s.test('the Formatting pane edits the look, and the Section pane the opt-in', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('formatting');
        var f = App.ui.views.generate.render(App.store.getProject());
        // FNT-4: header weight is in the Fonts table with every other type setting; what
        // the Tables fieldset still owns is the two shades.
        T.assert(/data-rd-fmt-bool="tables.headBold"/.test(f), 'header bold, in the Fonts table');
        T.assert(!/data-rd-fmt-bool="tables.head.bold"/.test(f), 'and not a second time under Tables');
        T.assert(/data-rd-fmt="tables.firstColumn.shade"/.test(f), 'first-column shade');
        T.assert(/data-rd-fmt-clear="tables.head.shade"/.test(f), 'a colour picker has no "none" of its own');
        App.ui.views.reportDesign.pane('section');
        App.ui.views.reportDesign.select('ds:android.packages');
        var sec = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-tstyle="head" data-rd-block="ds:android.packages"/.test(sec), 'the per-section opt-in');
        T.assert(/data-rd-tstyle="firstColumn"/.test(sec));
        App.ui.views.reportDesign.close();
      });
    });

    /* ===== SUITES: generated-section columns and widths (CCOL-1 · TW-2 · RD-9) ===== */

    T.suite('CCOL-1/TW-2 a generated section chooses its columns and their widths', function (s) {
      function pl() { return App.registry.getPlatform('android-adb'); }
      function blockOf(id, opts) {
        return App.generate.reportBlocks(App.store.getProject(), pl(), opts || {})
          .filter(function (b) { return b.id === id; })[0];
      }

      s.test('Control coverage declares its columns, key column excluded', function () {
        docProject();
        var cols = App.generate.sectionColumns(App.store.getProject(), blockOf('control'), {});
        T.assertDeepEqual(cols.optional.map(function (c) { return c.id; }), ['type', 'description', 'status', 'items', 'justification']);
        // COL-3: `all` is what the table will ACTUALLY have, and two of the five ship
        // off — Type is one repeated word in most projects, and Items is the widest cell
        // in the table.
        T.assertDeepEqual(cols.all.map(function (c) { return c.label; }),
          ['Control', 'Description', 'Status', 'Justification']);
        T.assertDeepEqual(App.generate.sectionColumns(App.store.getProject(), blockOf('control'),
          { columns: { control: { type: true, items: true } } }).all.map(function (c) { return c.label; }),
          ['Control', 'Type', 'Description', 'Status', 'Items (by dataset)', 'Justification'],
          'and ticking them brings them back');
      });

      s.test('switching one off drops it from the table, and from the column list', function () {
        docProject();
        var base = App.store.getProject().deviceConfigs[0].baseId;
        var c = App.store.addControl({ title: 'ISM-1 BT', type: 'ISM', description: '', assignedDeviceIds: [base] });
        App.store.setItemFields('android.packages', 'com.b', { controlRefs: [c.id] });
        var full = reportMd({});
        T.assert(/Justification/.test(full), 'present by default');
        var opts = { columns: { control: { justification: false, type: true, items: true } } };
        var cut = reportMd(opts);
        // Sliced on the ANCHORS: "Deviations from default" is also a row in the
        // composition table, which comes first, so a plain indexOf finds the wrong one.
        var section = cut.slice(cut.indexOf('{#sec-control}'), cut.indexOf('{#sec-deviations}'));
        T.assert(section.indexOf('Justification') === -1, 'the column must be gone from the section:\n' + section);
        T.assert(/ISM-1 BT/.test(section), 'while the rest of the table stays');
        T.assertDeepEqual(App.generate.sectionColumns(App.store.getProject(), blockOf('control'), opts).all.map(function (x) { return x.id; }),
          ['control', 'type', 'description', 'status', 'items']);
      });

      s.test('every generated section reports the columns it will have', function () {
        docProject();
        [['meta', 2], ['control', 1], ['guidelines', 3], ['ds:android.packages', 1]].forEach(function (pair) {
          var cols = App.generate.sectionColumns(App.store.getProject(), blockOf(pair[0]), {});
          T.assert(cols && cols.all.length >= pair[1], pair[0] + ' should declare at least ' + pair[1] + ' columns');
        });
        // A register's key column is read back from the adapter's own section, so a new
        // dataset needs no entry anywhere here (DOD-11).
        var pk = App.generate.sectionColumns(App.store.getProject(), blockOf('ds:android.packages'), {});
        T.assertEqual(pk.all[0].label, 'Package');
        T.assertEqual(App.generate.sectionColumns(App.store.getProject(), { kind: 'custom' }, {}), null);
      });

      s.test('a width set on a generated section reaches its table', function () {
        docProject();
        var base = App.store.getProject().deviceConfigs[0].baseId;
        var c = App.store.addControl({ title: 'ISM-1 BT', type: 'ISM', description: '', assignedDeviceIds: [base] });
        App.store.setItemFields('android.packages', 'com.b', { controlRefs: [c.id] });
        T.assertEqual(App.docStore.setBlockWidth('control', 6, 0, 0.40, true).ok, true);
        [1, 2, 3, 4, 5].forEach(function (i) { App.docStore.setBlockWidth('control', 6, i, 0.12, true); });
        // COL-3: six columns means the two that ship off are asked for.
        var md = reportMd({ columns: { control: { type: true, items: true } } });
        var section = md.slice(md.indexOf('{#sec-control}'));
        var f = borderFractions(section);
        T.assert(f && f.length === 6, 'expected a six-column grid: ' + section.slice(0, 300));
        T.assert(Math.abs(f[0] - 0.4) < 0.02, 'the set width must reach the table, got ' + f[0].toFixed(3));
      });

      s.test('a grouped register wears the same widths on every group', function () {
        docProject();
        App.docStore.setBlockWidth('ds:android.packages', 2, 0, 0.7, true);
        App.docStore.setBlockWidth('ds:android.packages', 2, 1, 0.3, true);
        var md = reportMd({});
        var borders = md.split('\n').filter(function (l) { return /^\+[-=:+]+\+$/.test(l) && l.split('+').length === 4; });
        T.assert(borders.length >= 2, 'expected several two-column group tables');
        var widths = borders.map(function (l) { return l.length; });
        T.assertEqual(new Set(widths).size, 1, 'the groups are the same columns and must be the same widths');
      });

      s.test('widths for the wrong number of columns are ignored, not applied', function () {
        docProject();
        App.docStore.setBlockWidth('control', 9, 0, 0.5, true);   // nine columns; there are six
        var md = reportMd({});
        T.assert(md.indexOf('Control coverage') !== -1, 'the document must still generate');
      });

      s.test('the widths survive the project file and clear back to absent', function () {
        docProject();
        App.docStore.setBlockWidth('control', 4, 0, 0.4, true);
        var s1 = App.projectIo.serializeProject(App.store.getProject());
        var r = App.projectIo.parseProject(s1);
        T.assertEqual(r.ok, true, JSON.stringify(r.issues));
        T.assertEqual(App.projectIo.serializeProject(r.value), s1, 'serialize is not idempotent');
        T.assert(Math.abs(r.value.report.tableWidths.control[0] - 0.4) < 0.001);
        App.docStore.clearBlockWidths('control');
        T.assertEqual((App.store.getProject().report || {}).tableWidths, undefined, 'auto is the absent state');
      });

      s.test('the Section pane offers the ticks, the strip and the grips', function () {
        docProject();
        // COL-3: the strip has a slot per column the table will have, so the two that
        // ship off are switched on to get the six this is written against.
        ['type', 'items'].forEach(function (c) { App.docStore.setReportInclude('columns', 'control', c, true, false); });
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('control');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-optmenu="control"/.test(html), 'no options button on the row');
        App.ui.views.reportDesign._rd.optMenu = 'control';
        var withMenu = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-dsmap="columns" data-rd-ds="control" data-rd-key="justification"/.test(withMenu), 'no column tick');
        App.ui.views.reportDesign._rd.optMenu = null;
        T.assert(/rd-widthbar/.test(html), 'no width strip');
        T.assertEqual((html.match(/data-rd-colresize\b/g) || []).length, 5, 'a six-column strip has five edges');
        T.assert(/data-rd-pct="b\|control\|6" data-rd-col="0"/.test(html), 'no typed-width chip');
        T.assert(/data-rd-block-autowidth="control"/.test(html), 'no reset');
        App.ui.views.reportDesign.close();
      });
    });

