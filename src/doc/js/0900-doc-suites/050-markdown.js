  (function (App) {
    'use strict';
    var T = App.test, MD = App.md;

    /* The markdown writer, on its own. Nothing here builds a document: these are the
     * primitives every generated section passes through on its way to the .md, and
     * they are the module's whether a host exists or not. */

    /* ===== SUITES: LaTeX-safe markdown (MD-1) · code spans (CODE-1) ===== */

    T.suite('MD-1 nothing hostile to LaTeX leaves the writer unescaped', function (s) {
      s.test('every character the pipeline chokes on is backslash-escaped', function () {
        // The set is not arbitrary: each one is load-bearing in LaTeX. % comments out
        // the rest of the line, & separates columns, $ opens math, _ and ^ are
        // sub/superscript, # is a macro parameter, ~ is a non-breaking space, {} group.
        T.assertEqual(MD.text('\\ { } $ & # ^ _ ~ %'), '\\\\ \\{ \\} \\$ \\& \\# \\^ \\_ \\~ \\%');
      });
      s.test('markdown structure characters are neutralised too', function () {
        T.assertEqual(MD.text('*a* `b` [c] |d| <e>'), '\\*a\\* \\`b\\` \\[c\\] \\|d\\| \\<e\\>');
      });
      s.test('column-1 constructs cannot start a list, a quote or a setext heading', function () {
        T.assertEqual(MD.text('- one\n1. two\n= three'), '\\- one\n1\\. two\n\\= three');
      });
      s.test('an identifier becomes a code span, verbatim and unescaped', function () {
        // Escaping a package name would put visible backslashes in the PDF; a code span
        // is literal by definition and reaches LaTeX as \texttt{}.
        T.assertEqual(MD.code('com.samsung.android.app_x'), '`com.samsung.android.app_x`');
        T.assertEqual(MD.code('a`b'), '``a`b``', 'the fence must outgrow the backticks inside it');
        T.assertEqual(MD.code('`x`'), '`` `x` ``', 'content starting/ending with a backtick needs padding');
        T.assertEqual(MD.code(''), '', 'an empty code span would render as two stray backticks');
      });
      s.test('escaping is idempotent per call, never doubled by accident', function () {
        var once = MD.text('50%');
        T.assertEqual(once, '50\\%');
        T.assert(App.report.renderTable(['A'], [['50%']]).indexOf('50\\\\%') === -1, 'renderTable must escape exactly once');
      });
      s.test('a multi-line cell forces a grid table, which is the only one that can hold it', function () {
        var pipe = MD.table([MD.cell('A')], [[MD.cell('one line')]]);
        T.assert(/^\| A \|/.test(pipe), 'single-line content should stay a pipe table');
        var grid = MD.table([MD.cell('A')], [[MD.cell('two\nlines')]]);
        T.assert(/^\+-/.test(grid), 'multi-line content needs a grid table: ' + grid);
        T.assert(/\| two/.test(grid) && /\| lines/.test(grid), 'both lines must survive');
      });
      s.test('rich text: the toolbar tokens become emphasis, and stay balanced', function () {
        T.assertEqual(MD.rich('a {{b}}B{{/b}} c'), 'a **B** c');
        T.assertEqual(MD.rich('{{b}}bold {{i}}both{{/i}}{{/b}}'), '**bold *both***');
        // A half-deleted token must not bold the rest of the document.
        T.assertEqual(MD.rich('a {{b}}B c'), 'a **B c**', 'an unclosed open must be closed at the paragraph end');
        T.assertEqual(MD.rich('a {{/b}}B c'), 'a B c', 'an unmatched close must be dropped');
      });
      s.test('rich text: a code span is verbatim, never escaped', function () {
        // Escaping inside backticks put a visible backslash in the PDF
        // (\\texttt{code\\textbackslash{}\\_span}) — confirmed against pandoc 3.1.11.
        T.assertEqual(MD.rich('a {{c}}code_span{{/c}} b'), 'a `code_span` b');
        T.assertEqual(MD.rich('{{c}}50% & $x{{/c}}'), '`50% & $x`');
        T.assertEqual(MD.rich('{{c}}a`b{{/c}}'), '``a`b``', 'the fence still outgrows inner backticks');
        T.assertEqual(MD.rich('{{c}}unclosed'), '`unclosed`', 'an unclosed code span still closes');
      });
      s.test('rich text: an unknown token is literal text, not a token', function () {
        T.assertEqual(MD.rich('{{zzz}}'), '\\{\\{zzz\\}\\}');
      });
      s.test('rich text: line breaks and paragraphs', function () {
        T.assertEqual(MD.rich('a\nb'), 'a\\\nb', 'a single newline is a hard break');
        T.assertEqual(MD.rich('a\n\nb'), 'a\n\nb', 'a blank line stays a paragraph split');
        T.assertEqual(MD.rich('a{{br}}b'), 'a\\\nb');
      });
      s.test('hostileChars reports what the author will see escaped, ignoring tokens', function () {
        T.assertDeepEqual(MD.hostileChars('a_b {{b}}c{{/b}} 50%'), ['_', '%']);
        T.assertDeepEqual(MD.hostileChars('nothing here'), []);
      });
    });

    T.suite('CODE-1 a code span is shaded, and a long one still wraps', function (s) {
      s.test('the shipped profile shades, and says so in one colour', function () {
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\definecolor\{chCodeShade\}\{HTML\}\{F2F2F2\}/.test(pre), 'the colour: ' + pre.slice(0, 400));
        T.assert(/\\colorbox\{chCodeShade\}/.test(pre), 'and a box that uses it');
      });

      s.test('the box is chosen by MEASURING, against the line and not the page', function () {
        // \colorbox is an unbreakable hbox: measured, a 64-character SHA-256 inside one
        // runs 49pt past the margin — the exact defect BRK-1 fixed. So a run that does
        // not fit takes the seqsplit route instead, and the width it is compared
        // against is \linewidth: inside a table cell \columnwidth is still the PAGE's
        // column, and measuring against it ran an identifier 38pt out of its cell.
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\settowidth\{\\chCodeWidth\}/.test(pre), 'it must measure');
        T.assert(/\\ifdim\\chCodeWidth>0\.95\\linewidth/.test(pre), 'against the line: ' + pre);
        T.assert(pre.indexOf('\\columnwidth') === -1 || !/chCodeWidth>[^\n]*columnwidth/.test(pre),
          'never against the page column');
        T.assert(/\\chOriginalTexttt\{\\seqsplit\{#1\}\}/.test(pre), 'and the long run must still be breakable');
      });

      s.test('no shade means no shade, on the page and in the preview', function () {
        var none = App.docFormat.normalise({ id: 'p', name: 'P', page: { codeShade: '' } });
        var pre = App.docFormat.preamble(none);
        T.assert(pre.indexOf('chCodeShade') === -1, 'nothing to define');
        T.assert(/\\renewcommand\{\\texttt\}\[1\]\{\\chOriginalTexttt\{\\seqsplit\{#1\}\}\}/.test(pre),
          'and \\texttt is the plain breakable form again');
        T.assert(/\.rd-paper code \{ background: transparent/.test(App.docFormat.previewCss(none)));
        T.assert(/\.rd-paper code \{ background: #f2f2f2/.test(App.docFormat.previewCss(App.docFormat.standard())),
          'the preview wears the profile’s colour');
      });

      s.test('a malformed colour is dropped, not passed to LaTeX', function () {
        var bad = App.docFormat.normalise({ id: 'p', name: 'P', page: { codeShade: 'red; } * { display:none' } });
        T.assertEqual(bad.page.codeShade, '');
        T.assert(App.docFormat.previewCss(bad).indexOf('display:none') === -1);
      });
    });

    /* ===== SUITES: line breaks and the rich-text box (BR-1 · RTX-2 · D-061) ===== */

    T.suite('BR-1 a line break renders wherever it is written (D-037)', function (s) {
      var NB = String.fromCharCode(0xA0);
      s.test('a trailing break lands on a line of its own', function () {
        // `\` at the end of a block is not a hard break to pandoc — there is no next
        // line for it to start — so it printed a literal backslash in the PDF (D-037).
        // The break is kept and given an empty line to start, rather than thrown away.
        T.assertEqual(MD.rich('Signed{{br}}'), 'Signed\\\n' + NB);
        T.assertEqual(MD.rich('Signed{{br}}{{br}}{{br}}'), 'Signed\\\n\\\n\\\n' + NB,
          'however many of them there are');
      });
      s.test('no lone backslash is left at the end of a paragraph', function () {
        ['Signed{{br}}', 'Signed{{br}}{{br}}', '{{br}}', '{{b}}Signed{{/b}}{{br}}'].forEach(function (src) {
          T.assert(!/\\$/.test(MD.rich(src)), 'trailing backslash in ' + JSON.stringify(MD.rich(src)));
        });
      });
      s.test('a break with nothing either side is still a break', function () {
        T.assertEqual(MD.rich('{{br}}'), '\\\n' + NB);
        T.assertEqual(MD.rich('{{br}}after'), '\\\nafter', 'and one with nothing before it');
      });
      s.test('emphasis closes before the trailing break, not after it', function () {
        T.assertEqual(MD.rich('{{b}}Signed{{/b}}{{br}}'), '**Signed**\\\n' + NB);
        T.assertEqual(MD.rich('{{b}}Signed{{br}}'), '**Signed**\\\n' + NB, 'an unclosed one too');
      });
      s.test('a break in the middle is untouched, consecutive ones included', function () {
        T.assertEqual(MD.rich('a{{br}}b'), 'a\\\nb');
        // `\` on a line of its own IS a hard break with no content, which is how a blank
        // line inside a paragraph is written — that one must survive.
        T.assertEqual(MD.rich('a{{br}}{{br}}b'), 'a\\\n\\\nb');
      });
      s.test('the preview reads it back the same way', function () {
        var html = App.ui.mdPreview.toHtml(MD.rich('Signed{{br}}')).html;
        T.assert(html.indexOf('\\') === -1, 'no backslash may be shown to the reader: ' + html);
        T.assert(html.indexOf('<br>') !== -1, 'and the trailing break draws one: ' + html);
        T.assert(App.ui.mdPreview.toHtml(MD.rich('a{{br}}b')).html.indexOf('<br>') !== -1,
          'while a real break still draws one');
      });
    });

    T.suite('RTX-2 a table cell takes the same formatting a paragraph does', function (s) {
      s.test('a cell renders its tokens into the document', function () {
        var ctx = { resolveRef: function () {
          return { label: 'Table 4: X', numberLabel: 'Table 4', titleLabel: 'X', anchor: 'tbl-1' }; } };
        var part = { id: 'p1', kind: 'table', header: ['{{b}}Setting{{/b}}', 'Notes'],
          rows: [['{{c}}io.x.y{{/c}}', 'See {{refn:t}} — {{i}}note{{/i}}']] };
        var md = App.doc.renderPart(part, ctx);
        T.assert(md.indexOf('**Setting**') !== -1, 'a heading takes emphasis: ' + md);
        T.assert(md.indexOf('`io.x.y`') !== -1, 'a cell takes a code span');
        T.assert(md.indexOf('[Table 4](#tbl-1)') !== -1, 'and a cross-reference');
        T.assert(md.indexOf('*note*') !== -1);
      });

      s.test('a line break in a cell is a HARD break, not a fold', function () {
        // Pandoc folds a grid cell's consecutive lines into one paragraph, so a break
        // without the trailing backslash does nothing at all on the page.
        var part = { id: 'p1', kind: 'table', header: ['A'], rows: [['one{{br}}two']] };
        var md = App.doc.renderPart(part, {});
        var cell = md.split('\n').filter(function (l) { return /^\|/.test(l); });
        T.assert(cell.some(function (l) { return /one\\\s*\|/.test(l); }),
          'the line must end with a backslash:\n' + md);
        T.assert(cell.some(function (l) { return /\btwo\b/.test(l); }), 'and the next line must follow');
      });

      s.test('a blank line in a cell is a paragraph in it', function () {
        var part = { id: 'p1', kind: 'table', header: ['A'], rows: [['one\n\ntwo']] };
        var md = App.doc.renderPart(part, {});
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/prv-cp/.test(html), 'the preview must read it back as two paragraphs: ' + html);
      });

      s.test('plain text in a cell is written exactly as it was', function () {
        // Nothing about the change may alter a table nobody has formatted — every
        // project written before this is full of them.
        var part = { id: 'p1', kind: 'table', header: ['Key'], rows: [['io.sdsasolutions.tacticalsettings']] };
        var md = App.doc.renderPart(part, {});
        T.assert(md.indexOf('`io.sdsasolutions.tacticalsettings`') !== -1,
          'a long identifier is still marked so it can wrap (BRK-1): ' + md);
        T.assertEqual(App.md.richCell('costs 50% & $x'), App.md.cell('costs 50% & $x'),
          'and ordinary text escapes exactly as it always did');
      });
    });

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

  })(App);
