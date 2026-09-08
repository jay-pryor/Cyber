  (function (App) {
    'use strict';
    var T = App.test, MD = App.md, DOC = App.doc;

    function ensureA() { if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb); }
    function snap(ds, raw) {
      ensureA();
      var a = App.registry.getDataset('android-adb', ds), pr = a.parse(raw);
      var o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: ds, sha256: App.util.hash.sha256Hex(raw), keys: pr.keys };
      if (pr.values) o.values = pr.values;
      if (pr.template !== undefined) o.template = pr.template;
      return o;
    }
    /** A ready device, so the document generators actually run. */
    function docProject() {
      ensureA();
      App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
        'android.packages': snap('android.packages', 'com.a\ncom.b'),
        'android.tactical': snap('android.tactical', '{"enabled":true,"count":3}') } });
      App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
      App.store.setDecision('android.packages', 'com.b', { action: 'disable' });
      App.store.setDecision('android.tactical', 'enabled', { value: true, type: 'bool' });
      App.store.setDecision('android.tactical', 'count', { value: 5, type: 'int' });
      return App.store.getProject();
    }
    var FIX = function () { return new Date('2026-01-01T00:00:00.000Z'); };
    function reportMd(opts) {
      App.util.clock.setClock(FIX);
      try { return App.generate.buildReport(App.store.getProject(), 'dev-m1', opts || {}).text; }
      finally { App.util.clock.resetClock(); }
    }
    /** Blocks -> outline, with no project involved (pure level/numbering checks). */
    function outline(blocks, opts) { return DOC.outline(blocks, opts || {}); }
    function blk(id, label, level, kind) {
      return { id: id, label: label, level: level === undefined ? null : level, kind: kind || 'meta', included: true };
    }
    function nums(res) { return res.map(function (r) { return r.number + ':' + (r.level === DOC.BODY_LEVEL ? 'N' : 'H' + r.level); }); }

    /* ===== SUITES: LaTeX-safe markdown (MD-1) ===== */
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

    /* ===== SUITES: heading levels, numbering and cross-references (DOC-1..DOC-4) ===== */
    T.suite('DOC-1/DOC-2 heading levels resolve and number themselves', function (s) {
      s.test('an explicit level always wins', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 3)], { clampSkips: false });
        T.assertDeepEqual(nums(r), ['1:H1', '1.0.1:H3'], 'without clamping a skip numbers as LaTeX would');
        T.assertEqual(r[1].skipped, true, 'and the skip is reported rather than hidden');
      });
      s.test('a skipped level is pulled up by default, and says so', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 3)]);
        T.assertDeepEqual(nums(r), ['1:H1', '1.1:H2'], 'clamping makes an orphan H3 an H2');
        T.assertEqual(r[1].skipped, true);
      });
      s.test('auto makes a section a sibling of the last heading', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 2), blk('c', 'C')]);
        T.assertDeepEqual(nums(r), ['1:H1', '1.1:H2', '1.2:H2'], 'auto should follow the H2, not restart');
      });
      s.test('the counters nest and reset exactly as an outline should', function () {
        var r = outline([blk('a', 'A', 1), blk('b', 'B', 2), blk('c', 'C', 2), blk('d', 'D', 3), blk('e', 'E', 1)]);
        T.assertDeepEqual(nums(r), ['1:H1', '1.1:H2', '1.2:H2', '1.2.1:H3', '2:H1']);
      });
      s.test('a custom section with no heading becomes body text and is not numbered', function () {
        var r = outline([blk('a', 'A', 1), { id: 'c', kind: 'custom', title: '', label: '', included: true, level: null }]);
        T.assertEqual(r[1].level, DOC.BODY_LEVEL);
        T.assertEqual(r[1].number, '', 'body text carries no number');
        T.assertEqual(DOC.headingFor(r[1]), '', 'and emits no heading line');
      });
      s.test('body text does not drag the sections after it down a level', function () {
        var r = outline([blk('a', 'A', 1), blk('t', 'T', 2),
          { id: 'c', kind: 'custom', title: '', label: '', included: true, level: null }, blk('d', 'D')]);
        T.assertEqual(r[3].level, 2, 'the section after a paragraph is still a sibling of the last HEADING');
      });
      s.test('TBL-1: a grouped dataset\'s groups take no heading and no number', function () {
        var r = outline([
          blk('p', 'Packages', null, 'dataset'),
          blk('t', 'Tactical', null, 'dataset')
        ].map(function (b, i) {
          return i === 0 ? Object.assign(b, { children: [{ id: 'keep', label: 'Kept', body: '' }] }) : b;
        }));
        // A group used to be placed here as a sub-section, which printed its declared
        // name ("Kept") as a numbered heading. It is a table under the section now, so
        // the outline holds the two datasets and nothing else — and the second dataset
        // is still 2, which is what the old test was really guarding.
        T.assertDeepEqual(nums(r), ['1:H1', '2:H1'], 'a group must not consume a number');
        T.assertEqual(r.length, 2, 'and must not appear in the outline at all');
      });
      s.test('numbering can be switched off entirely', function () {
        var r = outline([blk('a', 'A', 1)], { numbered: false });
        T.assertEqual(r[0].number, '');
        T.assertEqual(DOC.headingFor(r[0]), '# A {#sec-a}', 'the heading survives; only the number goes');
      });
      s.test('an excluded block is absent from the outline and from the numbering', function () {
        var r = outline([blk('a', 'A', 1), Object.assign(blk('b', 'B', 1), { included: false }), blk('c', 'C', 1)]);
        T.assertDeepEqual(r.map(function (x) { return x.id + x.number; }), ['a1', 'c2'], 'the numbers must close up');
      });
    });

    T.suite('DOC-3 a cross-reference survives renaming and reordering', function (s) {
      function refDoc(order) {
        var blocks = order.map(function (id) { return blk(id, id.toUpperCase(), 1); });
        var res = outline(blocks);
        return { res: res, resolve: DOC.refResolver(res, []) };
      }
      s.test('a reference names the number and the title, both derived at render time', function () {
        var d = refDoc(['intro', 'scope']);
        T.assertDeepEqual(d.resolve('scope'), {
          anchor: 'sec-scope', label: 'Section 2 — SCOPE',
          // REF-1: the number alone and the title alone, so the designer can insert
          // "see Section 2" or "see SCOPE" without either becoming a literal string.
          numberLabel: 'Section 2', titleLabel: 'SCOPE'
        });
      });
      s.test('reordering changes the NUMBER the reference reads, not the reference', function () {
        T.assertEqual(refDoc(['intro', 'scope']).resolve('scope').label, 'Section 2 — SCOPE');
        T.assertEqual(refDoc(['scope', 'intro']).resolve('scope').label, 'Section 1 — SCOPE',
          'the same stored id must now read as section 1');
      });
      s.test('renaming changes the TITLE it reads, and the anchor never moves', function () {
        var res = outline([Object.assign(blk('scope', 'Old name', 1), { title: 'Old name' })]);
        var a = DOC.refResolver(res, [])('scope');
        var res2 = outline([Object.assign(blk('scope', 'New name', 1), { title: 'New name' })]);
        var b = DOC.refResolver(res2, [])('scope');
        T.assertEqual(a.anchor, b.anchor, 'the anchor is derived from the id, so a rename cannot break the link');
        T.assert(/New name/.test(b.label), 'but the visible text follows the new title');
      });
      s.test('a dangling reference is stated in the document, never silently dropped', function () {
        T.assertEqual(MD.rich('see {{ref:gone}}', { resolveRef: function () { return null; } }),
          'see **\\[missing reference\\]**');
      });
      s.test('body text is not a link target — there is nothing to point at', function () {
        var res = outline([{ id: 'c', kind: 'custom', title: '', label: '', included: true, level: null }]);
        T.assertEqual(DOC.refResolver(res, [])('c'), null);
        T.assertEqual(DOC.refTargets(res, []).length, 0);
      });
      s.test('tables are numbered document-wide and are addressable', function () {
        var res = outline([
          { id: 's1', kind: 'custom', title: 'One', label: 'One', included: true, level: 1,
            parts: [{ id: 'p1', kind: 'table', caption: 'First', header: ['A'], rows: [['x']] }] },
          { id: 's2', kind: 'custom', title: 'Two', label: 'Two', included: true, level: 1,
            parts: [{ id: 'p2', kind: 'table', caption: 'Second', header: ['A'], rows: [['y']] }] }
        ]);
        var tables = DOC.tableIndex(res);
        T.assertDeepEqual(tables.map(function (t) { return t.number + ':' + t.caption; }), ['1:First', '2:Second']);
        // REF-1: a colon, because that is what the CAPTION prints ("Table 2: Second") —
        // a reference that reads differently from the thing it names is one the reader
        // has to translate.
        T.assertEqual(DOC.refResolver(res, tables)('p2').label, 'Table 2: Second');
        T.assertEqual(DOC.refResolver(res, tables)('p2').numberLabel, 'Table 2');
      });
    });

    T.suite('DOC-4 a hand-authored section renders its parts in order', function (s) {
      var ctx = { resolveRef: function () { return null; }, tables: [] };
      s.test('a paragraph, a rule and a page break', function () {
        T.assertEqual(DOC.renderPart({ kind: 'para', text: 'Hello 50%' }, ctx), 'Hello 50\\%');
        T.assertEqual(DOC.renderPart({ kind: 'rule' }, ctx), '* * *');
        T.assert(/\\newpage/.test(DOC.renderPart({ kind: 'pagebreak' }, ctx)), 'a page break must reach LaTeX');
      });
      s.test('centring survives to LaTeX as a real center environment', function () {
        // Verified against pandoc 3.1.11: a fenced div is DROPPED by the LaTeX writer,
        // so the centring has to travel as raw LaTeX around the block.
        var out = DOC.renderPart({ kind: 'para', text: 'mid', centre: true }, ctx);
        T.assert(/^```\{=latex\}\n\\begin\{center\}\n```/.test(out), 'no opening center: ' + out);
        T.assert(/```\{=latex\}\n\\end\{center\}\n```$/.test(out), 'no closing center: ' + out);
        T.assert(out.indexOf('\nmid\n') !== -1, 'the content must stay markdown between the fences');
      });
      s.test('a table escapes its cells and pads a ragged row rather than losing it', function () {
        var out = DOC.renderPart({ kind: 'table', id: 't', header: ['A', 'B'], rows: [['50%'], ['x', 'y']] }, ctx);
        T.assert(/\| 50\\% \|  \|/.test(out), 'a short row must be padded, not dropped: ' + out);
        T.assert(/\| x \| y \|/.test(out));
      });
      s.test('a captioned table carries its number, and its anchor precedes it', function () {
        var tables = [{ id: 't', number: '3', caption: 'Ports', anchor: 'tbl-t' }];
        var out = DOC.renderPart({ kind: 'table', id: 't', caption: 'Ports', header: ['A'], rows: [['x']] },
          { resolveRef: function () { return null; }, tables: tables });
        // Verified against pandoc 3.1.11: `{#id}` on a caption is NOT read as an
        // identifier — it came out as literal text. An empty span before the table
        // becomes \\phantomsection\\label{...}, which \\hyperref can reach.
        T.assert(/^\[\]\{#tbl-t\}\n\n/.test(out), 'anchor must precede the table: ' + out);
        // CAP-1: the caption is the TEXT only. LaTeX prints "Table 3: " in front of it
        // from its own counter — a number written here as well came out as
        // "Table 3: Table 3 — Ports" in the PDF (measured, pandoc 3.1.11 + tectonic).
        T.assert(/\n: Ports$/.test(out), 'caption missing, or carrying a number LaTeX also supplies: ' + out);
      });
      s.test('parts come out in their stored order', function () {
        var md = DOC.renderParts([
          { id: '1', kind: 'para', text: 'first' },
          { id: '2', kind: 'rule' },
          { id: '3', kind: 'para', text: 'second' }
        ], ctx);
        // REF-1: each paragraph carries an anchor of its own, so a reference can name
        // a paragraph rather than only the section it sits in.
        T.assertEqual(md, '[]{#par-1}\n\nfirst\n\n* * *\n\n[]{#par-3}\n\nsecond');
      });
      s.test('a paragraph with no id gets no anchor — there is nothing to address', function () {
        T.assertEqual(DOC.renderPart({ kind: 'para', text: 'x' }, ctx), 'x');
      });
    });

    /* ===== SUITES: formatting profiles (FMT-1..FMT-4) ===== */
    T.suite('FMT formatting profiles reach pandoc as YAML + a LaTeX preamble', function (s) {
      s.test('the built-in Standard profile is always present and always resolves', function () {
        docProject();
        var l = App.docFormat.list(App.store.getProject());
        T.assertEqual(l[0].id, 'standard');
        T.assertEqual(App.docFormat.resolve(App.store.getProject()).id, 'standard');
        // A project pointing at a profile that has been deleted must still generate.
        App.store.getProject().report = { formatId: 'nope' };
        T.assertEqual(App.docFormat.resolve(App.store.getProject()).id, 'standard', 'a missing profile falls back');
      });
      s.test('Standard cannot be edited in place — it is duplicated first', function () {
        docProject();
        var r = App.docStore.updateFormat('standard', { name: 'Hacked' });
        T.assertEqual(r.ok, false, 'the shipped baseline must stay a known-good baseline');
        var id = App.docStore.addFormat('Mine').id;
        T.assertEqual(App.docStore.updateFormat(id, { page: { paper: 'letter' } }).ok, true);
        T.assertEqual(App.docFormat.list(App.store.getProject()).filter(function (f) { return f.id === id; })[0].page.paper, 'letter');
      });
      s.test('a partial profile is filled from the baseline rather than rejected', function () {
        var f = App.docFormat.normalise({ id: 'x', name: 'X', page: { paper: 'letter' } });
        T.assertEqual(f.page.paper, 'letter');
        T.assertEqual(f.page.marginTop, '25mm', 'the rest comes from Standard');
        T.assertEqual(f.levels.length, 5, 'the title level plus H1-H4');
        T.assertEqual(f.levels[0].level, 0, 'and the title comes first');
      });
      s.test('the front matter carries geometry, paper, contents and the preamble', function () {
        var y = App.docFormat.frontMatter(App.docFormat.standard(), { title: 'T' });
        T.assert(/^---\n/.test(y) && /\n---$/.test(y), 'must be a YAML block');
        T.assert(/\ntitle: "T"/.test(y));
        T.assert(/\n  - "left=25mm"/.test(y));
        T.assert(/\ntoc: true/.test(y) && /\ntoc-depth: 3/.test(y));
        T.assert(/\\titleformat\{\\section\}/.test(y), 'heading styling missing');
        T.assert(/\nnumbersections: false/.test(y), 'App.doc numbers the sections, so LaTeX must not');
      });
      s.test('a title containing a quote or a backslash does not break the YAML', function () {
        var y = App.docFormat.frontMatter(App.docFormat.standard(), { title: 'A "q" \\ b' });
        T.assert(/\ntitle: "A \\"q\\" \\\\ b"/.test(y), 'YAML scalar not escaped: ' + (y.match(/title:.*/) || ''));
      });
      s.test('page numbers can be moved or switched off', function () {
        var off = App.docFormat.preamble(App.docFormat.normalise({ id: 'x', name: 'X', page: { numberPosition: 'none' } }));
        T.assert(off.indexOf('\\thepage') === -1, 'no page number command when switched off');
        var right = App.docFormat.preamble(App.docFormat.normalise({ id: 'x', name: 'X', page: { numberPosition: 'footer-right' } }));
        T.assert(/\\fancyfoot\[R\]\{\{\\thepage\}\}/.test(right), (right.match(/fancyfoot.*/g) || []).join(' '));
      });
      s.test('long identifiers are made breakable, or they run off the page', function () {
        // Verified with pandoc 3.1.11 + tectonic 0.17: without this, a 64-char SHA-256
        // in the provenance block sets 146pt past the right margin.
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\usepackage\{seqsplit\}/.test(pre), 'seqsplit missing');
        // CODE-1 put a shaded box around a code span that fits, so the seqsplit route
        // is now the ELSE of a width test rather than the whole definition — but a long
        // identifier must still reach it, which is what this has always been about.
        T.assert(/\\chOriginalTexttt\{\\seqsplit\{#1\}\}/.test(pre), 'texttt is not routed through seqsplit');
        var unshaded = App.docFormat.preamble(App.docFormat.normalise({ id: 'p', name: 'P', page: { codeShade: '' } }));
        T.assert(/\\renewcommand\{\\texttt\}\[1\]\{\\chOriginalTexttt\{\\seqsplit\{#1\}\}\}/.test(unshaded),
          'with no shading it is the whole definition again');
      });

      s.test('a per-level page break becomes a titlesec sectionbreak', function () {
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\newcommand\{\\sectionbreak\}\{\\clearpage\}/.test(pre), 'H1 starts a new page in the baseline');
        T.assert(pre.indexOf('\\subsectionbreak') === -1, 'H2 does not');
      });
    });

