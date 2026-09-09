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

