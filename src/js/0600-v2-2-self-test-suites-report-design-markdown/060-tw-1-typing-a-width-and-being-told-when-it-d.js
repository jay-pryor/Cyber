    T.suite('TW-1 typing a width, and being told when it does not add up', function (s) {
      function table3() {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.addColumn(sec, 'part1');
        return sec;
      }
      function widths() { return App.store.getProject().report.sections[0].parts[0].widths; }

      s.test('a DRAG moves one boundary and preserves the total', function () {
        var sec = table3();
        App.docStore.setWidth(sec, 'part1', 0, 0.6);
        var w = widths();
        T.assert(Math.abs(w.reduce(function (a, x) { return a + x; }, 0) - 1) < 1e-6, 'total must be unchanged: ' + JSON.stringify(w));
        T.assert(Math.abs(w[0] - 0.6) < 1e-6, 'the dragged column takes what it was given');
        T.assert(Math.abs(w[1] - w[2]) < 1e-6, 'the others keep their proportions');
      });

      s.test('TYPING sets one column and leaves the others where they were', function () {
        var sec = table3();
        var before = widths ? null : null;
        App.docStore.setWidth(sec, 'part1', 0, 0.6, true);
        var w = widths();
        T.assert(Math.abs(w[0] - 0.6) < 1e-6, 'the typed column takes exactly what was typed: ' + w[0]);
        T.assert(Math.abs(w[1] - 1 / 3) < 1e-6, 'and nothing else moves: ' + JSON.stringify(w));
      });

      s.test('typing 60 and 50 is allowed, and is over-committed', function () {
        var sec = table3();
        App.docStore.setWidth(sec, 'part1', 0, 0.6, true);
        App.docStore.setWidth(sec, 'part1', 1, 0.5, true);
        var t = App.docStore.widthTotal(widths());
        T.assert(t.over, 'expected an over-commitment, got ' + t.total + '%');
        T.assertEqual(Math.round(t.total), 143);
      });

      s.test('an over-committed table still renders — scaled to fit', function () {
        var f = borderFractions(MD.table(['A', 'B'], [['x', 'y']], { widths: [0.6, 0.5] }));
        T.assert(Math.abs(f[0] / (f[0] + f[1]) - 6 / 11) < 0.03,
          'the shares must be honoured in proportion, got ' + f.map(function (x) { return x.toFixed(3); }).join('/'));
      });

      s.test('a column can never be typed below the minimum, or above the whole table', function () {
        var sec = table3();
        App.docStore.setWidth(sec, 'part1', 0, 0.001, true);
        T.assert(Math.abs(widths()[0] - App.docStore.MIN_WIDTH) < 1e-9, 'floored at 5%: ' + widths()[0]);
        App.docStore.setWidth(sec, 'part1', 0, 4, true);
        T.assertEqual(widths()[0], 1, 'a share cannot be more than the whole table');
      });

      s.test('the total is judged in one place, with a little tolerance', function () {
        T.assertEqual(App.docStore.widthTotal([0.6, 0.2, 0.2]).ok, true);
        T.assertEqual(App.docStore.widthTotal([0.6, 0.5]).over, true);
        T.assertEqual(App.docStore.widthTotal([0.3, 0.3]).under, true);
        // Pixels divided by pixels never land on exactly 1; flagging 99.9% would make
        // the warning mean nothing.
        T.assertEqual(App.docStore.widthTotal([0.333, 0.333, 0.333]).ok, true);
      });

      s.test('the editor says which way it does not add up', function () {
        var sec = table3();
        App.docStore.setWidth(sec, 'part1', 0, 0.6, true);
        App.docStore.setWidth(sec, 'part1', 1, 0.5, true);
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var over = App.ui.views.generate.render(App.store.getProject());
        T.assert(/rd-wflag/.test(over), 'an over-commitment must be flagged');
        T.assert(/more than the page has/.test(over), 'and must say what will happen instead');
        App.docStore.setWidth(sec, 'part1', 1, 0.1, true);
        App.docStore.setWidth(sec, 'part1', 2, 0.1, true);
        var under = App.ui.views.generate.render(App.store.getProject());
        T.assert(!/rd-wflag/.test(under), 'under-committed is not an error');
        // TW-3: under 100% is not a shortfall, it is how a table narrower than the page
        // is asked for — so it is stated as an outcome rather than as a warning.
        T.assert(/rd-wnote/.test(under) && /of the page width, centred/.test(under), 'but it is still said');
        App.ui.views.reportDesign.close();
      });

      s.test('a percentage chip carries its target, so one handler serves both editors', function () {
        var sec = table3();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-pct="p\|sec1\|part1" data-rd-col="1"/.test(html), 'no typed-width chip on a custom table');
        App.ui.views.reportDesign.close();
      });
    });

    T.suite('RD-9 a hand-authored section previews like a generated one', function (s) {
      s.test('the section pane renders its parts, numbered and captioned', function () {
        docProject();
        var sec = App.docStore.addSection('Residual risks').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: 'One risk remains.' });
        App.docStore.addPart(sec, 'table');
        App.docStore.setCell(sec, 'part2', 0, 0, 'Bluetooth');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/rd-secprev/.test(html), 'a custom section must preview too');
        T.assert(/One risk remains\./.test(html), 'its prose');
        T.assert(/Bluetooth/.test(html), 'its table');
        T.assert(/Table \d+:/.test(html), 'captioned and numbered as it will be');
        App.ui.views.reportDesign.close();
      });

      s.test('the preview shows the styling and the widths the table will have', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.updatePart(sec, 'part1', { styleHead: true });
        App.docStore.setWidth(sec, 'part1', 0, 0.75);
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/prv-shade-head/.test(html), 'the preview must show the header styling');
        T.assert(/<col style="width:7\d(\.\d)?%">/.test(html), 'and the widths: ' + (html.match(/<col style="width:[^"]+">/g) || []).join(','));
        App.ui.views.reportDesign.close();
      });

      s.test('an empty section says so rather than failing', function () {
        docProject();
        var sec = App.docStore.addSection('Empty').id;
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/Nothing in this section yet/.test(html), 'expected the empty note');
        T.assert(!/Preview failed/.test(html), 'and no thrown error');
        App.ui.views.reportDesign.close();
      });
    });

    /* ===== SUITES: the width model measures ems (AUTO-2) ===== */

    T.suite('AUTO-2 columns are measured in ems, not in characters', function (s) {
      // The em widths were measured out of Latin Modern at 11pt with \savebox/\the\wd,
      // which is why these can be asserted at all rather than eyeballed.
      s.test('a character is not a fixed width', function () {
        // Long enough to exceed the page, or nothing has to be decided and each column
        // simply takes its content — which is the right answer when it fits.
        var run = function (c) { return new Array(41).join(c); };
        var w = MD.autoWidths([['A', 'B'], [run('i'), run('m')]], 2);
        T.assert(w[1] > w[0] * 2, 'forty m must want far more room than forty i: ' + w.join('/'));
        T.assertDeepEqual(MD.autoWidths([['A', 'B'], ['iiii', 'mmmm']], 2), [4, 4], 'and a table that fits is untouched');
      });

      s.test('a bold heading is charged for being bold', function () {
        // The first cut of this model had bold at 1.06 and put "Description" 8pt past
        // its column; the measurement says 1.15 across the lowercase alphabet.
        var plain = MD.autoWidths([['Description', 'x'], ['a', new Array(200).join('word ')]], 2);
        var bold = MD.autoWidths([['**Description**', 'x'], ['a', new Array(200).join('word ')]], 2);
        T.assert(bold[0] > plain[0], 'bold must claim more than regular: ' + bold[0] + ' vs ' + plain[0]);
      });

      s.test('a heading is never short-changed by a monospace neighbour', function () {
        // The register shape: one column of `\texttt` identifiers beside four of prose.
        // Charging the page for an identifier that \seqsplit can break is what starved
        // the prose headings.
        var w = MD.autoWidths([
          ['**Path**', '**Description**', '**Value**', '**Control**', '**Rationale**'],
          ['`com.samsung.android.app.telephonyui`', '', new Array(40).join('word '), '', '']
        ], 5);
        var total = w.reduce(function (a, x) { return a + x; }, 0);
        // "Description" bold is 5.76em of a 36.8em text block: a shade under 16%.
        T.assert(w[1] / total > 0.15, 'the Description column should get its heading: ' + (w[1] / total).toFixed(3));
        T.assert(w[4] / total > 0.12, 'and so should Rationale: ' + (w[4] / total).toFixed(3));
      });

      s.test('an identifier is not minced just because it CAN be broken', function () {
        // \seqsplit means a code span is breakable on the page, so it is not a floor —
        // but six characters to a line is not a layout either, so it is asked for after
        // the hard floors and before anyone who merely wants to be wider.
        var w = MD.autoWidths([
          ['**Path**', '**Value**'],
          ['`com.samsung.android.app.telephonyui.esimclient`', new Array(60).join('word ')]
        ], 2);
        var total = w[0] + w[1];
        T.assert(w[0] / total > 0.2, 'the key column must stay readable: ' + (w[0] / total).toFixed(3));
      });

      s.test('the source is scaled up rather than letting a token set the proportions', function () {
        // Both floors have to hold: the source one includes code spans (a cut fence
        // corrupts), the page one does not. Taking the larger per column would let the
        // source floor decide the FRACTION, which is the bug this replaced.
        var w = MD.autoWidths([
          ['**Path**', '**Description**'],
          ['`com.samsung.android.app.telephonyui.esimclient`', new Array(40).join('word ')]
        ], 2);
        T.assert(w[0] >= '`com.samsung.android.app.telephonyui.esimclient`'.length,
          'the source column must still hold the whole token: ' + w[0]);
      });

      s.test('a table that fits is left exactly as its content sizes it', function () {
        T.assertDeepEqual(MD.autoWidths([['A', 'B'], ['one', 'two']], 2), [3, 3]);
        T.assertEqual(MD.table(['A', 'B'], [['one', 'two']], {}), MD.pipeTable(['A', 'B'], [['one', 'two']], {}));
      });
    });

    /* ===== SUITES: quality of life (FNT-1 · OPT-1 · pane stickiness · tab) ===== */

    T.suite('FNT-1 three font sizes: text, table body, table header', function (s) {
      function withSizes(body, head) {
        return App.docFormat.normalise({ id: 'p', name: 'P', tables: { fontSize: body, headFontSize: head } });
      }

      s.test('blank means the document size', function () {
        var f = App.docFormat.standard();
        T.assertEqual(f.tables.fontSize, '');
        T.assertEqual(f.tables.headFontSize, '');
        T.assertEqual(f.tables.captionFontSize, '');
        // The row-font machinery IS emitted by the shipped profile, because FNT-4 gives
        // the header row its weight through \chTblHeadFont rather than through markdown
        // emphasis on the sections that opted in. Both macros still name the DOCUMENT
        // size, so the sizes cost nothing until one is set.
        var pre = App.docFormat.preamble(f);
        T.assert(/\\newcommand\{\\chTblBodyFont\}\{\\fontsize\{11pt\}/.test(pre), 'the body font must be the document size: ' + pre);
        T.assert(/\\newcommand\{\\chTblHeadFont\}\{\\fontsize\{11pt\}[^}]*\}?\\selectfont\\bfseries\\upshape\}/.test(pre),
          'and the header must be the document size, in bold: ' + pre);
      });

      s.test('FNT-4: a profile with nothing to say about type emits no font machinery', function () {
        var plain = App.docFormat.normalise({ id: 'p', name: 'P', tables: { headBold: false } });
        T.assert(App.docFormat.preamble(plain).indexOf('chRowFont') === -1,
          'nothing sized, nothing emphasised — nothing to emit');
      });

      s.test('the two table sizes reach the preamble', function () {
        var pre = App.docFormat.preamble(withSizes('8', '13'));
        T.assert(/\\newcommand\{\\chTblBodyFont\}\{\\fontsize\{8pt\}\{9\.6pt\}/.test(pre), 'the body size: ' + pre);
        T.assert(/\\newcommand\{\\chTblHeadFont\}\{\\fontsize\{13pt\}\{15\.6pt\}/.test(pre), 'the header size');
      });

      s.test('the size travels as a MACRO, because a font size cannot be made global', function () {
        // `\global\fontsize` is an error — it uses \afterassignment. What can be flipped
        // between rows is which macro \chRowFont names, and every cell applies it because
        // pandoc writes \raggedright into every column spec.
        var pre = App.docFormat.preamble(withSizes('8', '13'));
        T.assert(pre.indexOf('\\global\\fontsize') === -1, 'never a global \\fontsize');
        T.assert(/renewcommand\{\\raggedright\}\{\\chBaseRaggedright\\chRowFont\}/.test(pre), 'every cell applies it');
        T.assert(/renewcommand\{\\toprule\}[\s\S]*chTblHeadFont/.test(pre), 'the header rule selects the header size');
        T.assert(/renewcommand\{\\midrule\}[\s\S]*chTblBodyFont/.test(pre), 'and the mid rule the body size');
      });

      s.test('the font macros do not collide with the shading macro', function () {
        // The shading macro re-lets its own saved \toprule per table. Sharing a name with
        // the font one would capture a macro whose body names it — a loop that never ends.
        var pre = App.docFormat.preamble(App.docFormat.normalise({ id: 'p', name: 'P',
          tables: { fontSize: '8', head: { shade: '#d9e2f3' } } }));
        T.assert(/\\chTblHeadShade\}\{\\let\\chOldToprule/.test(pre), 'the shading macro keeps its name');
        T.assert(/\\let\\chBaseToprule\\toprule/.test(pre), 'and the font one has its own');
      });

      s.test('one size set is enough to switch the machinery on', function () {
        T.assert(App.docFormat.preamble(withSizes('9', '')).indexOf('chRowFont') !== -1, 'body only');
        T.assert(App.docFormat.preamble(withSizes('', '12')).indexOf('chRowFont') !== -1, 'header only');
        // The one that is blank falls back to the document size rather than to nothing.
        T.assert(/chTblBodyFont\}\{\\fontsize\{11pt\}/.test(App.docFormat.preamble(withSizes('', '12'))), 'blank = document size');
      });

      s.test('all three sizes reach the preview', function () {
        var css = App.docFormat.previewCss(App.docFormat.normalise({ id: 'p', name: 'P',
          page: { fontSize: '11pt' }, tables: { fontSize: '8', headFontSize: '13' } }));
        T.assert(/\.rd-paper \{[^}]*font-size: 14\.67px/.test(css), 'the document size');
        T.assert(/\.rd-paper \.prv-table \{ font-size: 10\.67px/.test(css), 'the table body size');
        // TBL-1: the title row is a `<th>` in the header, so it takes this rule too.
        T.assert(/\.rd-paper \.prv-table th \{ font-size: 17\.33px/.test(css), 'the table header size: ' + css);
      });

      s.test('a code span takes the size of whatever it sits in', function () {
        /* On the page a code span is `\texttt`, which changes the FAMILY and keeps the
         * size — measured: a package name in a 9pt table body comes out at 8.97pt, the
         * same as the prose beside it. The preview pinned every code span to 12px, so a
         * table size appeared to skip the identifiers, which is exactly what it looked
         * like. */
        var css = App.docFormat.previewCss(App.docFormat.standard());
        T.assert(/\.rd-paper code \{[^}]*font-size: inherit/.test(css), 'a code span must inherit its size: ' + css);
      });

      s.test('the caption takes the DOCUMENT size, not the table\'s', function () {
        // It is emitted before the table's first rule, so the row-font machinery has not
        // started when it is set. Measured: 10.91pt in an 11pt document beside a 9pt table.
        var css = App.docFormat.previewCss(App.docFormat.normalise({ id: 'p', name: 'P',
          page: { fontSize: '11pt' }, tables: { fontSize: '8' } }));
        T.assert(/\.rd-paper \.prv-caption \{[^}]*font-size: 14\.67px/.test(css), 'the caption follows the document: ' + css);
      });

      s.test('a bigger header font is paid for in the width model', function () {
        // Otherwise a header set one point larger overflows by exactly the ratio it was
        // enlarged by, which is what happened the first time these sizes were emitted.
        var head = ['**Description**', 'V'], rows = [['', new Array(80).join('word ')]];
        var same = MD.autoWidths([head].concat(rows), 2, { pageEm: 41, head: 1, body: 1 });
        var bigger = MD.autoWidths([head].concat(rows), 2, { pageEm: 41, head: 1.5, body: 1 });
        T.assert(bigger[0] / (bigger[0] + bigger[1]) > same[0] / (same[0] + same[1]),
          'a larger header must claim more of the page: ' + bigger.join('/') + ' vs ' + same.join('/'));
      });

      s.test('the metrics reach App.md from the profile, not from a guess', function () {
        var m = App.docFormat.tableMetrics(App.docFormat.normalise({ id: 'p', name: 'P',
          page: { fontSize: '11pt', paper: 'a4', marginLeft: '25mm', marginRight: '25mm' },
          tables: { fontSize: '9', headFontSize: '12' } }));
        T.assert(Math.abs(m.pageEm - 41.2) < 0.2, 'the page in ems: ' + m.pageEm);
        T.assert(Math.abs(m.head - 12 / 11) < 1e-6 && Math.abs(m.body - 9 / 11) < 1e-6, 'the two ratios');
        // Unset, everything is the document size and the model behaves as it did before.
        var plain = App.docFormat.tableMetrics(App.docFormat.standard());
        T.assertEqual(plain.head, 1);
        T.assertEqual(plain.body, 1);
      });

      s.test('the Formatting pane offers all three', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('formatting');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-fmt="page.fontSize"/.test(html), 'the document size');
        T.assert(/data-rd-fmt="tables.fontSize"/.test(html), 'the table body size');
        T.assert(/data-rd-fmt="tables.headFontSize"/.test(html), 'the table header size');
        App.ui.views.reportDesign.pane('section');
        App.ui.views.reportDesign.close();
      });
    });

    T.suite('OPT-1 columns and groups live on the section row', function (s) {
      function open(id) {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign._rd.optMenu = id;
        var html = App.ui.views.generate.render(App.store.getProject());
        App.ui.views.reportDesign._rd.optMenu = null;
        App.ui.views.reportDesign.close();
        return html;
      }

      s.test('a section with something to choose gets a menu button', function () {
        docProject();
        App.ui.views.reportDesign.open();
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-optmenu="ds:android.packages"/.test(html), 'a grouped register');
        T.assert(/data-rd-optmenu="control"/.test(html), 'and Control coverage');
        // Nothing to choose, no button: an empty menu is worse than no menu.
        T.assert(!/data-rd-optmenu="composition"/.test(html), 'a section with no options must not offer one');
        App.ui.views.reportDesign.close();
      });

      s.test('the menu carries the groups and the columns', function () {
        var html = open('ds:android.packages');
        T.assert(/rd-optmenu/.test(html), 'the menu must render when open');
        ['remove', 'disable', 'keep'].forEach(function (g) {
          T.assert(html.indexOf('data-rd-dsmap="datasetSections" data-rd-ds="android.packages" data-rd-key="' + g + '"') !== -1, 'group ' + g);
        });
        T.assert(/data-rd-dsmap="columns" data-rd-ds="android.packages" data-rd-key="rationale"/.test(html), 'and the optional columns');
      });

      s.test('they are no longer duplicated in the Section pane', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var pane = App.ui.views.generate.render(App.store.getProject());
        // The width strip stays — it is drawn against whatever the ticks leave on.
        T.assert(/rd-widthbar/.test(pane), 'the width strip belongs to the pane');
        T.assert(!/<strong>Groups<\/strong>/.test(pane), 'the group ticks moved out');
        T.assert(!/<strong>Columns<\/strong>/.test(pane), 'and so did the column ticks');
        App.ui.views.reportDesign.close();
      });
    });

