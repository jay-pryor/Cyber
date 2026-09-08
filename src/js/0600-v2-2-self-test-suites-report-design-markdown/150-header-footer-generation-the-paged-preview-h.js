    /* ===== SUITES: header & footer, generation, the paged preview (HDR-1 · GEN-TAB · PRV-4) ===== */

    T.suite('HDR-1 the header and footer are configured on their own', function (s) {
      function hf(patch) { return App.docFormat.normalise({ id: 'p', name: 'P', headerFooter: patch }); }

      s.test('six slots reach fancyhdr in their own positions', function () {
        var pre = App.docFormat.preamble(hf({
          header: { left: 'CH Report', centre: 'Draft', right: '' },
          footer: { left: '', centre: '', right: '#page' }
        }));
        T.assert(/\\fancyhead\[L\]\{CH Report\}/.test(pre), 'header left: ' + (pre.match(/fancyhead.*/g) || []));
        T.assert(/\\fancyhead\[C\]\{Draft\}/.test(pre), 'header centre');
        T.assert(/\\fancyfoot\[R\]\{\{\\thepage\}\}/.test(pre), 'footer right: ' + (pre.match(/fancyfoot.*/g) || []));
        T.assert(!/\\fancyhead\[R\]/.test(pre), 'an empty slot emits nothing');
      });

      s.test('#page and #pages are markers; the words page and pages are prose', function () {
        /* Found by the live-DOM pass, not reasoned about: the first cut reserved the bare
         * words, and a first-page header reading "Title page" came out as "Title 1". */
        var pre = App.docFormat.preamble(hf({ header: { left: 'Title page', centre: '', right: '' },
          footer: { left: '', centre: '', right: 'Page #page of #pages' } }));
        T.assert(/\\fancyhead\[L\]\{Title page\}/.test(pre), '"page" as prose must survive: ' + (pre.match(/fancyhead.*/g) || []));
        /* Braced: TeX eats the space after a control word, so `\thepage of` printed
         * "1of" — found in a built PDF, which is the only place it shows. */
        T.assert(/\\fancyfoot\[R\]\{Page \{\\thepage\} of \{\\pageref\{LastPage\}\}\}/.test(pre),
          'the markers must not, and must keep the space after them: ' + (pre.match(/fancyfoot.*/g) || []));
        T.assert(/\\usepackage\{lastpage\}/.test(pre), 'and lastpage is loaded because #pages asked for it');
        T.assert(App.docFormat.preamble(hf({ footer: { left: '', centre: '#page', right: '' } }))
          .indexOf('\\usepackage{lastpage}') === -1, 'but not when nothing asks');
      });

      s.test('D-048: the headrule reset is emitted once, because pandoc applies it', function () {
        /* Pandoc's `latex_macros` extension READS a `\renewcommand` in the input and
         * APPLIES it to everything after it. A second copy of
         * `\renewcommand{\headrulewidth}{0pt}` therefore reached the .tex as
         * `\renewcommand{0pt}{0pt}` — renewing something that is not a command — which
         * errors and took the whole first-page style down with it. Found by building the
         * PDF: page one was still wearing the running header.
         */
        var pre = App.docFormat.preamble(hf({ firstDifferent: true,
          firstHeader: { left: 'Title page', centre: '', right: '' } }));
        T.assertEqual((pre.match(/\\renewcommand\{\\headrulewidth\}/g) || []).length, 1,
          'exactly one, or pandoc rewrites the second: ' + (pre.match(/renewcommand\{.headrulewidth.*/g) || []));
      });

      s.test('D-055: a slot is escaped for LATEX, not for markdown', function () {
        /* Reported as a build failure: a header reading "<---- Security classification"
         * stopped XeTeX with "Undefined control sequence" at `\<`.
         *
         * `\<` is an ordinary markdown escape and not a command LaTeX has. Everything
         * else in a generated document is markdown and pandoc produces the LaTeX from
         * it; a header or footer is the one string that reaches the page through
         * `header-includes`, which pandoc passes through VERBATIM. So it needs the other
         * escaper — and the two overlap enough (`\%`, `\&`, `\#`, `\$`, `\_`) that using
         * the wrong one looks right until a character outside the overlap turns up.
         */
        var pre = App.docFormat.preamble(hf({
          header: { left: '<---- Security classification & 100% {safe}_x #1 ~ \\', centre: '', right: '' }
        }));
        T.assert(/\\fancyhead\[L\]\{\\textless\{\}---- Security classification \\& 100\\% \\\{safe\\\}\\_x \\#1 \\textasciitilde\{\} \\textbackslash\{\}\}/.test(pre),
          'every one of them, in the LaTeX spelling: ' + (pre.match(/fancyhead.*/g) || []));
        T.assert(pre.indexOf('\\<') === -1, 'and no markdown escape may survive into the preamble');
      });

      s.test('the escaper is one pass, or its own braces get escaped', function () {
        // Several replacements contain braces; a second pass over the output would turn
        // `\textbackslash{}` into `\textbackslash\{\}` and print it.
        T.assertEqual(MD.latex('\\'), '\\textbackslash{}');
        T.assertEqual(MD.latex('a<b>c|d^e~f'), 'a\\textless{}b\\textgreater{}c\\textbar{}d\\textasciicircum{}e\\textasciitilde{}f');
        T.assertEqual(MD.latex('{a}_b'), '\\{a\\}\\_b');
        T.assertEqual(MD.latex(''), '');
      });

      s.test('GEN-TAB: a placeholder in a slot is filled before the slot is escaped', function () {
        /* The document-wide pass escapes what it substitutes for MARKDOWN, which is
         * right for the body and would put `\<` in the preamble exactly as above. A slot
         * is filled on its raw text instead, so the value is escaped once, for LaTeX,
         * with the words around it. */
        docProject();
        var fid = App.docStore.addFormat('House', App.docFormat.standard()).id;
        App.docStore.setFormatId(fid);
        var f = JSON.parse(JSON.stringify(App.docFormat.resolve(App.store.getProject())));
        f.headerFooter.header.left = 'Issued /[Date]';
        App.docStore.updateFormat(fid, f);
        var md = reportMd({ tags: { Date: '30 June <2026>' } });
        T.assert(md.indexOf('\\fancyhead[L]{Issued 30 June \\textless{}2026\\textgreater{}}') !== -1,
          'the value must be escaped for LaTeX: ' + (md.match(/\\fancyhead\[L\].*/) || ''));
        T.assert(md.indexOf('/[Date]') === -1, 'and nothing may be left unfilled');
      });

      s.test('a different first page is a style of its own, issued on page one', function () {
        /* It redefined `plain`, on the assumption that page 1 is a plain page. It is
         * not — with the automatic title block off there is no \maketitle, so page 1 is
         * an ordinary fancy page and the first-page slots never appeared. Measured in a
         * built PDF, where page 1 carried the running header. */
        var off = App.docFormat.preamble(hf({}));
        T.assert(/\\fancypagestyle\{plain\}\{\\pagestyle\{fancy\}\}/.test(off),
          'without it, page one keeps the running set');
        T.assert(off.indexOf('chfirst') === -1, 'and no first-page style is defined');
        var on = App.docFormat.preamble(hf({ firstDifferent: true,
          firstHeader: { left: 'Title page', centre: '', right: '' } }));
        T.assert(/\\fancypagestyle\{chfirst\}\{\\fancyhf\{\}[^\n]*\\fancyhead\[L\]\{Title page\}/.test(on),
          'with it, page one gets a style of its own: ' + (on.match(/fancypagestyle.*/g) || ''));
        T.assert(/\\fancypagestyle\{plain\}\{\\pagestyle\{fancy\}\}/.test(on),
          'and a section that starts a page still keeps the RUNNING set');
      });

      s.test('and the document says so on its first page', function () {
        docProject();
        var fid = App.docStore.addFormat('House', App.docFormat.standard()).id;
        App.docStore.setFormatId(fid);
        var f = JSON.parse(JSON.stringify(App.docFormat.resolve(App.store.getProject())));
        f.headerFooter.firstDifferent = true;
        App.docStore.updateFormat(fid, f);
        var md = reportMd({});
        var body = md.slice(md.indexOf('\n---\n', 4));
        T.assert(body.indexOf('\\thispagestyle{chfirst}') !== -1,
          'nothing but the body can reach page one: ' + body.slice(0, 200));
        f.headerFooter.firstDifferent = false;
        App.docStore.updateFormat(fid, f);
        T.assert(reportMd({}).indexOf('thispagestyle') === -1, 'and it is absent when nothing asked');
      });

      s.test('the banner takes the first free slot, and never overwrites one', function () {
        // The shipped profile puts the page number in the footer's centre, so the banner
        // goes to its left — because the slot was taken, not because of a rule about
        // page numbers competing with banners.
        var std = App.docFormat.preamble(App.docFormat.standard(), { classification: 'OFFICIAL: Sensitive' });
        T.assert(/\\fancyhead\[C\]\{\\textbf\{OFFICIAL: Sensitive\}\}/.test(std), 'the free header centre');
        T.assert(/\\fancyfoot\[L\]\{\\textbf\{OFFICIAL: Sensitive\}\}/.test(std), 'and beside the page number');
        T.assert(/\\fancyfoot\[C\]\{\{\\thepage\}\}/.test(std), 'which keeps its own slot');
        var full = App.docFormat.preamble(hf({ footer: { left: 'a', centre: 'b', right: 'c' } }),
          { classification: 'OFFICIAL: Sensitive' });
        T.assert(!/\\fancyfoot\[[LCR]\]\{\\textbf/.test(full),
          'a line the operator has filled is left alone: ' + (full.match(/fancyfoot.*/g) || []));
      });

      s.test('an older profile\'s page-number position is read into the slots, once', function () {
        var old = App.docFormat.normalise({ id: 'p', name: 'P', page: { numberPosition: 'header-right' } });
        T.assertEqual(old.headerFooter.header.right, '#page', 'the old setting must land where it named');
        T.assertEqual(old.headerFooter.footer.centre, '', 'and the default must give way to it');
        T.assertEqual(old.page.numberPosition, undefined, 'the field itself does not survive as a second switch');
        var newer = App.docFormat.normalise({ id: 'p', name: 'P', page: { numberPosition: 'header-right' },
          headerFooter: { footer: { left: '', centre: '#page', right: '' } } });
        T.assertEqual(newer.headerFooter.header.right, '', 'a profile edited since is not overruled by the leftover');
        T.assertEqual(newer.headerFooter.footer.centre, '#page');
      });

      s.test('the preview and the preamble agree about where the banner lands', function () {
        var r = App.docFormat.headerFooter(App.docFormat.standard(), { classification: 'OFFICIAL: Sensitive' });
        T.assertEqual(r.banner.header, 'centre');
        T.assertEqual(r.banner.footer, 'left', 'the same slot the preamble writes it into');
        T.assertEqual(r.footer.centre, '#page', 'and the number is untouched');
      });
    });

    T.suite('GEN-TAB the document is named, and its placeholders filled in', function (s) {
      s.test('a tag is found wherever it is written', function () {
        docProject();
        App.docStore.setBlockHeading('ds:android.packages', 'Packages as at /[Date]');
        App.docStore.setBlockIntro('control', 'Signed off by /[Author].');
        App.docStore.setTableText('ds:android.packages', 'keep', 'title', 'Kept — /[Date]');
        var md = reportMd({});
        T.assertDeepEqual(App.generate.findTags(md), ['Date', 'Author'],
          'each distinct tag once, in the order it is first written');
      });

      s.test('a filled tag is replaced everywhere; an unfilled one is left standing', function () {
        docProject();
        App.docStore.setBlockHeading('ds:android.packages', 'Packages as at /[Date]');
        App.docStore.setBlockIntro('control', 'Signed off by /[Author].');
        var md = reportMd({ tags: { Date: '30 June 2026' } });
        T.assert(md.indexOf('Packages as at 30 June 2026') !== -1, 'the filled one is substituted');
        T.assertDeepEqual(App.generate.findTags(md), ['Author'],
          'and the unfilled one is still there to be seen — a silent gap reads as finished');
      });

      s.test('a tag value is escaped once, like anything else somebody typed', function () {
        T.assertEqual(App.generate.applyTags('at /\\[D\\] today', { D: '50% & up' }), 'at 50\\% \\& up today');
      });

      s.test('a tag body is narrow, so a captured value cannot be mistaken for one', function () {
        T.assertDeepEqual(App.generate.findTags('a /[Date] b /[not a tag: this] c'), ['Date']);
        T.assertDeepEqual(App.generate.findTags('/[' + new Array(60).join('x') + ']'), []);
      });

      s.test('the file takes the name given, and cannot carry a path', function () {
        T.assertEqual(App.generate.docFilename('CH Report M1'), 'CH Report M1.md');
        T.assertEqual(App.generate.docFilename('CH Report M1.md'), 'CH Report M1.md', 'the suffix is not doubled');
        T.assertEqual(App.generate.docFilename('../../etc/passwd'), 'etc-passwd.md');
        T.assertEqual(App.generate.docFilename('   '), '', 'blank falls back to the standard name');
        docProject();
        T.assert(/^dev-m1-reporting-/.test(App.generate.buildReport(App.store.getProject(), 'dev-m1', {}).name),
          'and that standard name is the device and the timestamp');
      });

      s.test('the pane lists what it found, and the footer no longer generates', function () {
        docProject();
        App.docStore.setBlockHeading('ds:android.packages', 'Packages as at /[Date]');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('generate');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-filename/.test(html), 'the filename box');
        T.assert(/data-rd-tag="Date"/.test(html), 'and a box per tag found');
        T.assert(/<strong>1<\/strong> placeholder still to fill in/.test(html), 'with the unfilled ones counted');
        var foot = html.slice(html.lastIndexOf('<div class="modal-foot">'));
        T.assert(!/data-generate-action/.test(foot), 'the workspace footer must not generate');
        App.ui.views.reportDesign.close();
      });
    });

    /* ===== SUITES: what the second round of use found (D-036..D-039) ===== */

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

    T.suite('D-044 centring one section does not centre the document', function (s) {
      function doc() {
        return DOC.render({ blocks: DOC.outline([
          { id: 't', kind: 'custom', title: 'Title page', label: 'T', level: DOC.TITLE_LEVEL,
            included: true, centre: true,
            parts: [{ id: 'p1', kind: 'para', text: 'Prepared for ACME', centre: true }] },
          { id: 'a', kind: 'dataset', title: 'Packages', label: 'Packages', level: 1, included: true,
            body: MD.para('Ordinary prose that must not be centred.') }
        ], {}) });
      }

      s.test('a centred part inside a centred section is not wrapped twice', function () {
        // Two nested `center` environments contribute their vertical space twice, which
        // on a title page is a gap nobody asked for.
        var md = doc();
        T.assertEqual((md.match(/\\begin\{center\}/g) || []).length, 1, 'one centring, not two: ' + md);
      });

      s.test('the preview closes the centring where the document does', function () {
        /* Reported as "centring my title page centres the whole document". The preview's
         * fenced-div walker was not depth-aware: it stopped at the first closing `:::`,
         * which left the outer close as a bare `:::` — and `/^:::/` read that as an
         * OPENING fence, so it swallowed the rest of the document into a centred div. */
        var p = App.ui.mdPreview.toHtml(doc());
        var after = p.html.slice(p.html.indexOf('Packages'));
        T.assert(!/prv-centre/.test(after), 'nothing after the centred section may be inside it: ' + after);
        T.assert(/prv-centre/.test(p.html.slice(0, p.html.indexOf('Packages'))), 'while the section itself is');
        T.assert(p.html.indexOf(':::') === -1, 'and no fence is ever shown as content');
      });

      s.test('a nested centring is still read as one block, not as two', function () {
        var html = App.ui.mdPreview.toHtml(
          '::: {.center}\n\n::: {.center}\n\ninner\n\n:::\n\nouter\n\n:::\n\nafter').html;
        T.assert(/after/.test(html) && !/prv-centre[\s\S]*after[\s\S]*<\/div>\s*$/.test(html.replace(/\n/g, '')),
          'the text after the block must be outside it: ' + html);
        T.assertEqual((html.match(/prv-centre/g) || []).length, 2, 'two divs, one inside the other');
      });

      s.test('so the document is still many blocks, which is what a page view needs', function () {
        // The leak folded everything into one enormous div, and a single block cannot be
        // broken between — which is why the paged preview stopped after two sheets.
        var html = App.ui.mdPreview.toHtml(doc()).html;
        T.assert((html.match(/^<(div|h1|h2|h3|p|hr)/gm) || []).length > 2,
          'the flow must have blocks to paginate: ' + html.slice(0, 200));
      });
    });

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

