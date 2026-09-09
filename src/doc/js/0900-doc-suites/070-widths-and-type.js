  (function (App) {
    'use strict';
    var T = App.test, MD = App.md;

    /* How wide a table's columns come out, and how big its type is. Both are decided
     * from the formatting profile and the text itself, so both are testable with no
     * project, no host and no DOM. */

    /** Every grid rule and row in a grid table is the same width, or the PDF breaks. */
    function gridAligned(md) {
      var cur = null, ok = true, grids = 0;
      md.split('\n').forEach(function (l) {
        if (/^\+[-=:+]+\+$/.test(l)) { if (cur === null) { grids++; cur = l.length; } else if (l.length !== cur) ok = false; }
        else if (/^\|/.test(l)) { if (cur !== null && l.length !== cur) ok = false; }
        else cur = null;
      });
      return grids > 0 && ok;
    }

    /* ===== SUITES: automatic widths (AUTO-1 · AUTO-2 · D-036) ===== */

    T.suite('AUTO-1 a table that will not fit is laid out, not left to collapse', function (s) {
      s.test('a table that fits keeps its natural widths, byte for byte', function () {
        var md = MD.table(['A', 'B'], [['one', 'two']], {});
        T.assertEqual(md, MD.pipeTable(['A', 'B'], [['one', 'two']], {}));
        T.assertDeepEqual(MD.autoWidths([['A', 'B'], ['one', 'two']], 2), [3, 3]);
      });

      s.test('one long column no longer takes the whole table', function () {
        // The control-coverage shape: three short columns beside one that lists
        // everything satisfying a control. Proportional-to-characters gave the long one
        // ~90% and mashed the rest into the margins.
        var long = new Array(30).join('package ');
        var w = MD.autoWidths([['Control', 'Status', 'Items', 'Justification'],
          ['ISM-1 Bluetooth', 'Satisfied', long, 'Disabled in firmware.']], 4);
        var total = w.reduce(function (a, x) { return a + x; }, 0);
        T.assert(w[2] / total < 0.7, 'the long column should not take the page: ' + (w[2] / total).toFixed(2));
        T.assert(w[0] / total > 0.08, 'nor should the short ones vanish: ' + (w[0] / total).toFixed(2));
      });

      s.test('a heading is never squeezed below itself', function () {
        var long = new Array(60).join('x ');
        var w = MD.autoWidths([['Rationale', 'V'], ['', long]], 2);
        T.assert(w[0] >= 'Rationale'.length, 'the heading must fit its own column: ' + w[0]);
      });

      s.test('an unbreakable token is never cut in half by the automatic layout', function () {
        // A cut fence stops being a fence: pandoc rejoins the halves with a SPACE, so
        // the package name comes out wrong and the emphasis around it comes out literal.
        var key = '**`com.samsung.android.app.telephonyui.esimclient`**';
        var md = MD.table(['Package', 'Note'], [[key, new Array(40).join('word ')]], {});
        var lines = md.split('\n').filter(function (l) { return /^\|/.test(l); });
        T.assert(lines.some(function (l) { return l.indexOf(key) !== -1; }),
          'the key must survive whole:\n' + md);
      });

      s.test('a table too wide to fit becomes a GRID table so its cells can wrap', function () {
        // A pipe table is a LaTeX `tabular` of `l` columns, which do not wrap — long
        // prose in one runs off the page. Line breaks are not the only reason to switch.
        var md = MD.table(['Control', 'Justification'],
          [['ISM-1', 'Bluetooth is disabled by policy and the three Bluetooth packages are removed; there is no operational need on this fleet.']], {});
        T.assert(/^\+/.test(md), 'expected the grid form, got: ' + md.split('\n')[0]);
        T.assert(gridAligned(md), 'and it must still line up:\n' + md);
      });

      s.test('a short table is still a pipe table', function () {
        T.assert(/^\|/.test(MD.table(['Section', 'Status'], [['Packages', 'Included']], {})));
      });

      s.test('the pipe form is abandoned at pandoc\'s --columns limit, not at the page', function () {
        /* Measured on 3.1.11: up to 72 columns pandoc leaves a pipe table's widths to
         * LaTeX, which sizes them to their content. Past it, it invents them from the
         * SEPARATOR row — and `| --- | --- |` means an equal share for every column
         * whatever is in it. Seven equal columns, each too narrow for its own heading,
         * is worse than anything this module would compute, so the grid form takes over
         * there rather than at the page budget. */
        var head = ['Action Name', 'Description', 'Action', 'Procedure', 'Control', 'Rationale', 'Rollback'];
        var wide = MD.table(head, [['None.', '', '', '', '', '', '']], {});
        T.assert(/^\+/.test(wide), 'a table past 72 columns must take the grid form:\n' + wide.split('\n')[0]);
        var narrow = MD.table(['A', 'B'], [['one', 'two']], {});
        T.assert(/^\|/.test(narrow), 'and one under it must not');
      });

      s.test('the wrapper never leaves a lone asterisk on a line', function () {
        var lines = MD.wrapLine('**aaaaaaaaaaaaaaa**', 8);
        lines.forEach(function (l) {
          T.assert(!/(^|[^*])\*($|[^*])/.test(l), 'a split emphasis marker: ' + JSON.stringify(lines));
        });
      });
    });

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

    T.suite('D-036 a hand-set width still holds what cannot be broken', function (s) {
      s.test('a cross-reference is never cut through its own destination', function () {
        /* Reported: control links printing as `[AHG-002](#ctl-ahg- 002)`. Pandoc rejoins
         * a cell's lines with a SPACE, so a break anywhere inside a link puts one in the
         * destination — and a destination with a space in it is not a link at all. The
         * automatic width path has honoured unbreakable runs since D-021; the EXPLICIT
         * path had no floor and wrapped to whatever was dragged. */
        var cell = MD.autoLink(MD.cell('Removed to satisfy AHG-002 and ISM-1416 together.'),
          [{ text: 'AHG-002', anchor: 'ctl-ahg-002' }, { text: 'ISM-1416', anchor: 'ctl-ism-1416' }]);
        var md = MD.table(['Package', 'Rationale'].map(MD.cell), [[MD.code('com.a'), cell]],
          { widths: [0.5, 0.5] });
        T.assert(md.indexOf('[AHG-002](#ctl-ahg-002)') !== -1, 'the link must survive whole: ' + md);
        T.assert(md.indexOf('[ISM-1416](#ctl-ism-1416)') !== -1, 'both of them');
        T.assert(!/\(#[A-Za-z0-9-]*\s*\|/.test(md), 'no destination may run into a border: ' + md);
      });

      s.test('the fractions the operator dragged are preserved exactly', function () {
        // Only the RATIOS reach the PDF, so the answer to "it does not fit" is to draw
        // the .md wider, not to cut the token or to change the width that was asked for.
        function fracs(md) {
          var sep = md.split('\n').filter(function (l) { return /^\+/.test(l); })[0];
          var total = sep.length;
          return sep.slice(1, -1).split('+').map(function (seg) {
            return Math.round((seg.length + 1) / total * 100) / 100;
          });
        }
        var narrow = MD.table(['A', 'B'].map(MD.cell), [['x', 'y'].map(MD.cell)], { widths: [0.75, 0.25] });
        var long = MD.table(['A', 'B'].map(MD.cell), [[MD.cell('x'),
          '[a-very-long-control-title](#ctl-a-very-long-control-title)']], { widths: [0.75, 0.25] });
        // Within a character's worth of rounding — a field width is a whole number of
        // characters, so the fractions can only ever be that close to the ones asked for.
        var a = fracs(narrow), b = fracs(long);
        a.forEach(function (f, i) {
          T.assert(Math.abs(f - b[i]) <= 0.02, 'share ' + i + ' moved to make room: ' + f + ' -> ' + b[i]);
        });
        T.assert(long.split('\n')[0].length > narrow.split('\n')[0].length, 'the table is drawn wider instead');
      });

      s.test('a code span is not cut in half either', function () {
        // Same defect, same fix — D-021 in the path that had no floor.
        var md = MD.table(['Key', 'Note'].map(MD.cell),
          [[MD.code('io.sdsasolutions.tacticalsettings'), MD.cell('x')]], { widths: [0.2, 0.8] });
        T.assert(md.indexOf('`io.sdsasolutions.tacticalsettings`') !== -1, 'the fence must stay whole: ' + md);
      });

      s.test('a link is measured by what it prints, not by what it is written as', function () {
        /* `[AHG-001](#ctl-ahg-001)` is 23 characters of source and seven of page.
         * Charging the column for the source moved the proportions of every table
         * carrying a control mention — the D-024 lesson, in a new place: the model
         * converts between two currencies, and the destination is not set on the page.
         * The SOURCE width is a separate question and is still counted in full, which is
         * what stops the link being cut in half (above). */
        var plain = MD.table(['A', 'B'].map(MD.cell), [[MD.cell('AHG-001'), MD.cell('x')]], {});
        var linked = MD.table(['A', 'B'].map(MD.cell),
          [['[AHG-001](#ctl-ahg-001)', MD.cell('x')]], {});
        function fracs(md) {
          var sep = md.split('\n').filter(function (l) { return /^[|+]/.test(l); })[1] || '';
          return sep.length;
        }
        // Neither table is wide enough to need laying out, so both take their natural
        // widths — and a linked cell must be as wide as the word it prints, not wider.
        T.assertEqual(fracs(linked), fracs(plain),
          'the destination must not be charged to the column:\n' + linked + '\n' + plain);
      });

      s.test('and safeCut refuses to land inside a link even so', function () {
        var s1 = 'see [AHG-001](#ctl-ahg-001) now';
        for (var at = 5; at < 26; at++) {
          var cut = MD._safeCut(s1, at);
          T.assert(!(cut > 4 && cut < 27), 'a cut at ' + at + ' landed inside the link at ' + cut);
        }
      });
    });

    /* ===== SUITES: type sizes and what the preview shows (FNT-4 · FNT-6 · PRV-3) ===== */

    T.suite('FNT-4 every kind of text has a size, a weight and a slope', function (s) {
      s.test('a caption has a size of its own, and blank is the document\'s', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P', tables: { captionFontSize: '8', captionBold: true, captionItalic: true } });
        var pre = App.docFormat.preamble(f);
        T.assert(/\\chCaptionOpen\}\{[^\n]*\\fontsize\{8pt\}\{9\.6pt\}\\selectfont\\bfseries\\itshape/.test(pre),
          'the caption macro must carry all three: ' + (pre.match(/chCaptionOpen.*/) || ''));
        var plain = App.docFormat.preamble(App.docFormat.standard());
        T.assert(!/\\chCaptionOpen\}\{[^\n]*\\fontsize/.test(plain), 'and blank names no size at all');
      });

      s.test('the body\'s weight reaches the document, and a table states its own', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P', page: { bold: true }, tables: { headBold: false } });
        var pre = App.docFormat.preamble(f);
        T.assert(/\\AtBeginDocument\{\\bfseries\\upshape\}/.test(pre), 'the prose goes bold: ' + pre);
        // …and the table row fonts must say plainly that they are not, or they would
        // inherit it. This is why the machinery is emitted even with no size set.
        T.assert(/\\chTblBodyFont\}\{[^\n]*\\mdseries\\upshape\}/.test(pre),
          'a table must not inherit the body\'s weight: ' + (pre.match(/chTblBodyFont.*/) || ''));
      });

      s.test('the header row\'s weight reaches every table, not only the styled ones', function () {
        /* It used to be markdown emphasis written by tableStyle(), so it reached exactly
         * the sections that had ticked "style the header row" — and there was a second
         * bold switch in the Fonts table saying the same word about a different set of
         * tables. One switch now, and it is type. */
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\chTblHeadFont\}\{[^\n]*\\bfseries/.test(pre), 'the shipped profile sets a bold header');
        var style = App.docFormat.tableStyle(App.docFormat.standard(), { head: true });
        T.assertDeepEqual(Object.keys(style.head), ['shade'], 'opting in buys the shade and nothing else');
        T.assert(!/\*\*A\*\*/.test(MD.table(['A'], [['x']], { style: style })), 'so no emphasis is written into the table');
      });

      s.test('the preview says the same thing as the preamble', function () {
        var css = App.docFormat.previewCss(App.docFormat.normalise({ id: 'p', name: 'P',
          page: { italic: true }, tables: { headBold: false, captionBold: true } }));
        T.assert(/\.rd-paper p, \.rd-paper li \{[^}]*font-style: italic/.test(css), 'the body: ' + css);
        T.assert(/\.rd-paper \.prv-table th[^{]*\{[^}]*font-weight: 400/.test(css), 'an unbolded header');
        T.assert(/\.rd-paper \.prv-caption \{[^}]*font-weight: 700/.test(css), 'a bold caption');
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

    T.suite('PRV-3 the preview reads the document back the way the page will', function (s) {
      s.test('the outline rail is plain text, with the escaping undone', function () {
        // It is written into the rail as text and HTML-escaped there, never parsed as
        // markdown — so a section called "Firmware & build" was listed as "Firmware \&".
        var o = App.ui.mdPreview.toHtml('# 1 Firmware \\& build 50\\% {#sec-x}\n').outline;
        T.assertEqual(o[0].title, 'Firmware & build 50%');
        T.assertEqual(o[0].number, '1');
      });

      s.test('unescapeMd undoes the writer, including code spans and emphasis', function () {
        var U = App.ui.mdPreview.unescapeMd;
        T.assertEqual(U('a\\_b \\$HOME \\{x\\}'), 'a_b $HOME {x}');
        T.assertEqual(U('**bold** and `code`'), 'bold and code');
      });

      s.test('each firewall rule is its own line in a cell', function () {
        var rules = [{ ruleType: 'DENY', portNumber: '443' }, { ruleType: 'ALLOW', portNumber: '80' }];
        var md = MD.table(['Path', 'Value'], [[MD.code('firewallRules'), MD.cell(MD.human(rules))]], {});
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assertEqual((html.match(/class="prv-cp"/g) || []).length, 2, 'one block per rule: ' + html);
        T.assert(/1\. portNumber: 443; ruleType: DENY<\/div>/.test(html), 'and the rules must not run together');
      });

      s.test('a wrapped sentence is still one sentence', function () {
        // Consecutive lines in a cell are ONE paragraph on the page; only a blank line
        // starts a new one. Both halves of that have to be read back the same way.
        var md = MD.table(['A'], [['a very long\nsentence wrapped']], {});
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/a very long sentence wrapped/.test(html), 'wrapped lines must rejoin with a space: ' + html);
        T.assert(html.indexOf('prv-cp') === -1, 'and stay one block');
      });

      s.test('an interior blank line in a cell is not mistaken for padding', function () {
        var grid = MD.gridTable(['A', 'B'], [['one' + MD.CELL_BREAK + MD.CELL_BREAK + 'two', 'x']], {});
        var html = App.ui.mdPreview.toHtml(grid).html;
        T.assert(/>one<\/div>/.test(html) && /<div class="prv-cp">two</.test(html), 'both paragraphs must survive: ' + html);
      });

      s.test('an unstyled table is not painted with the app\'s own colours', function () {
        // `--c-surface-alt` is a near-black in dark mode, and the page is white. It also
        // showed an unstyled header as though it had been given a shade.
        var css = App.docFormat.previewCss(App.docFormat.standard());
        T.assert(/\.rd-paper \.prv-table th[^{]*\{[^}]*background: transparent/.test(css),
          'the page must state its own table background: ' + css);
        var idx = css.indexOf('background: transparent');
        T.assert(css.indexOf('prv-shade-head thead th { background:') > idx,
          'and the shade rule must come after it, or it would be overridden');
      });

      s.test('no shade in the profile means no shade in the preview', function () {
        var none = App.docFormat.normalise({ id: 'p', name: 'P', tables: { head: { shade: '' }, firstColumn: { shade: '' } } });
        var css = App.docFormat.previewCss(none);
        T.assert(!/prv-shade-head thead th/.test(css), 'an unshaded profile must paint nothing: ' + css);
        // FNT-4: the header row's weight is no longer tied to opting in, so it is stated
        // on every table header rather than on the shaded ones.
        T.assert(/\.rd-paper \.prv-table th[^{]*\{[^}]*font-weight/.test(css), 'while its weight still applies to every table');
      });
    });

  })(App);
