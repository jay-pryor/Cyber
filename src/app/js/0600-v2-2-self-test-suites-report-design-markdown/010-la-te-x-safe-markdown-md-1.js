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

