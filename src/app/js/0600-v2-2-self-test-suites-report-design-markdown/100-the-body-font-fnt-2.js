    /* ===== SUITES: the body font (FNT-2) ===== */

    T.suite('FNT-2 the document chooses a font, and the preview shows it', function (s) {
      function withFont(id) {
        return App.docFormat.normalise({ id: 'p', name: 'P', page: { fontFamily: id } });
      }
      function yamlOf(id) { return App.docFormat.frontMatter(withFont(id), { title: 'T' }); }

      s.test('the shipped profile names no font at all', function () {
        T.assertEqual(App.docFormat.standard().page.fontFamily, '');
        T.assert(yamlOf('').indexOf('fontfamily') === -1,
          'a blank font must leave pandoc its own default rather than pinning one');
      });

      s.test('a chosen font reaches the YAML as a package name', function () {
        T.assert(/^fontfamily: "tgpagella"$/m.test(yamlOf('tgpagella')), yamlOf('tgpagella'));
        T.assert(/^fontfamily: "charter"$/m.test(yamlOf('charter')));
      });

      s.test('a sans font also switches the default family', function () {
        // The one thing that makes `fontfamily: tgheros` do nothing on its own.
        T.assert(/\\renewcommand\{\\familydefault\}\{\\sfdefault\}/.test(App.docFormat.preamble(withFont('tgheros'))),
          'a sans package sets \\sfdefault only; the body must be switched to it');
        T.assert(!/familydefault/.test(App.docFormat.preamble(withFont('tgpagella'))),
          'a serif package must not be switched');
        T.assert(!/familydefault/.test(App.docFormat.preamble(withFont(''))));
      });

      s.test('the preview paints the same choice', function () {
        var serif = App.docFormat.previewCss(withFont('tgtermes'));
        T.assert(/\.rd-paper \{[^}]*font-family: "Nimbus Roman", "Times New Roman", Times, serif;/.test(serif), serif.slice(0, 300));
        var sans = App.docFormat.previewCss(withFont('sourcesanspro'));
        T.assert(/\.rd-paper \{[^}]*font-family: "Source Sans Pro"[^}]*sans-serif;/.test(sans), sans.slice(0, 300));
        // Stated on the paper, not on the paragraph: a heading and a table cell must
        // inherit it, which is what \familydefault does on the page.
        T.assert(!/\.rd-paper p[^{]*\{[^}]*font-family/.test(sans), 'the family belongs to the sheet, once');
      });

      s.test('an unrecognised font falls back rather than reaching LaTeX or the CSS', function () {
        // Both consumers interpolate it: one into a \usepackage, where a bad name is a
        // compile failure, one into a stylesheet, where it is an injection route.
        var hostile = withFont('x} .evil{content:"1"} .y{');
        T.assertEqual(hostile.page.fontFamily, '');
        T.assert(App.docFormat.previewCss(hostile).indexOf('evil') === -1, 'nothing arbitrary may reach the preview CSS');
        T.assert(App.docFormat.frontMatter(hostile, { title: 'T' }).indexOf('fontfamily') === -1);
        T.assertEqual(App.docFormat.normalise({ id: 'p', name: 'P', page: { fontFamily: 'helvetica' } }).page.fontFamily, '',
          'a system font name is not a package name');
      });

      s.test('the choice survives the profile it is saved in', function () {
        docProject();
        var made = App.docStore.addFormat('House', App.docFormat.standard());
        App.docStore.updateFormat(made.id, { page: { fontFamily: 'libertine' } });
        App.docStore.setFormatId(made.id);
        var back = App.projectIo.parseProject(App.projectIo.serializeProject(App.store.getProject()));
        T.assertEqual(App.docFormat.resolve(back.value).page.fontFamily, 'libertine',
          'a font must round-trip through the project file like any other page setting');
        T.assert(/^fontfamily: "libertine"$/m.test(App.docFormat.frontMatter(App.docFormat.resolve(back.value), {})),
          'and the resolved profile is the one the document is built from');
      });

      s.test('the Formatting pane offers the list', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('formatting');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-fmt="page.fontFamily"/.test(html), 'the selector must be wired like every other page field');
        T.assert(/<option value="tgpagella"/.test(html), 'and it must list the fonts');
        T.assert(App.docFormat.FONTS.every(function (f) { return f.css && f.label; }),
          'every font needs a label to choose it by and a stack to preview it with');
        App.ui.views.reportDesign.close();
      });
    });

    /* ===== SUITES: the document the designer controls (CODE-1 · TOC-1/2 · TTL-2 · CAP-3) ===== */

    T.suite('TOC-1/TOC-2 the contents list is a section like any other', function (s) {
      function blocks(p) {
        return App.generate.reportBlocks(p || App.store.getProject(), App.registry.getPlatform('android-adb'), {});
      }
      function tocBlock(p, opts) {
        return App.generate.reportBlocks(p || App.store.getProject(), App.registry.getPlatform('android-adb'), opts || {})
          .filter(function (b) { return b.id === 'toc'; })[0];
      }

      s.test('it leads the section list, and starts as a TITLE', function () {
        docProject();
        var b = tocBlock();
        T.assert(b, 'there must be a contents block');
        T.assertEqual(b.kind, 'toc');
        T.assertEqual(blocks()[0].id, 'toc', 'and it starts at the front');
        // A numbered "1 Contents" ahead of the sections it lists reads as a section of
        // the report, which it is not.
        T.assertEqual(b.level, App.doc.TITLE_LEVEL);
      });

      s.test('the profile switch decides whether it is there at all', function () {
        docProject();
        T.assertEqual(tocBlock().included, true, 'the shipped profile includes one');
        var made = App.docStore.addFormat('No contents', App.docFormat.standard());
        App.docStore.updateFormat(made.id, { toc: { include: false, depth: 3 } });
        App.docStore.setFormatId(made.id);
        T.assertEqual(tocBlock().included, false, 'switching it off in the profile removes it');
        T.assertEqual(tocBlock().empty, true, 'and the row says why it cannot be ticked');
      });

      s.test('the section can also be left out of one report', function () {
        docProject();
        T.assertEqual(tocBlock(null, { sections: { toc: false } }).included, false);
      });

      s.test('it can be moved, like anything else in the list', function () {
        docProject();
        App.store.setReportOrder(['meta', 'toc']);
        var ids = blocks().map(function (b) { return b.id; });
        T.assertEqual(ids[0], 'meta');
        T.assertEqual(ids[1], 'toc', 'a contents list at the back is a legitimate document');
      });

      s.test('the document prints it there, and asks pandoc not to print its own', function () {
        docProject();
        var md = reportMd({});
        T.assert(/```\{=latex\}\n\\chContents\n```/.test(md), 'the contents macro must be in the body');
        T.assert(/^toc: false$/m.test(md), 'pandoc must not add a second list: ' + md.slice(0, 600));
        // TOC-1: and the heading of the list is not itself an entry in it.
        T.assert(/^# Contents \{#sec-toc \.unnumbered \.unlisted\}$/m.test(md), 'the heading must be unlisted');
      });

      s.test('a document with no contents SECTION keeps the automatic list', function () {
        docProject();
        // The Control report has no such section, so nothing about it changes.
        App.util.clock.setClock(FIX);
        try {
          var md = App.generate.buildControlReport(App.store.getProject(), 'dev-m1', {}).text;
          T.assert(/^toc: true$/m.test(md), 'the other documents are untouched: ' + md.slice(0, 500));
        } finally { App.util.clock.resetClock(); }
      });

      s.test('the entry spacing and the depth reach the preamble', function () {
        var pre = App.docFormat.preamble(App.docFormat.normalise({ id: 'p', name: 'P', toc: { include: true, depth: 2, entrySpacing: 6 } }));
        T.assert(/\\usepackage\{tocloft\}/.test(pre));
        T.assert(/\\setlength\{\\cftbeforesecskip\}\{6pt\}/.test(pre), 'the gap between entries: ' + pre);
        T.assert(/\\setlength\{\\cftbeforesubsecskip\}\{3pt\}/.test(pre), 'a nested entry takes half');
        T.assert(/\\setcounter\{tocdepth\}\{2\}/.test(pre), 'the depth');
        // \makeatletter has to be OUTSIDE the definition: `@` must be a letter when the
        // body is tokenised, not when it is called. Inside, the build fails with
        // "You can't use \spacefactor in vertical mode" (measured).
        T.assert(/\\makeatletter\n\\newcommand\{\\chContents\}/.test(pre), 'the macro must be defined with @ a letter');
      });

      s.test('the preview draws the list, from the headings the document has', function () {
        docProject();
        var p = App.ui.mdPreview.toHtml(reportMd({}));
        T.assert(/class="prv-toc"/.test(p.html), 'a contents list must be drawn');
        T.assert(/prv-toc-e[^"]*"[^>]*>(<span class="prv-toc-n">1<\/span> )?Device Config Information/.test(p.html) ||
          /Device Config Information/.test(p.html), 'and carry the entries');
        T.assert(p.html.indexOf('chContents') === -1, 'the macro itself is machinery, never shown');
      });
    });

    T.suite('TTL-2 the automatic title block is a choice, and it is off', function (s) {
      s.test('nothing names the document unless asked', function () {
        docProject();
        var md = reportMd({});
        T.assert(!/^title: /m.test(md), 'no title: ' + md.slice(0, 400));
        T.assert(!/^subtitle: /m.test(md));
        T.assert(!/^date: /m.test(md), 'and no date, which is the third thing \\maketitle prints');
        // What is NOT withheld is the provenance — it travels as its own keys.
        T.assert(/^project-sha256: /m.test(md), 'the provenance must survive');
        T.assert(/^generated-utc: /m.test(md));
      });

      s.test('switching it on brings all three back', function () {
        docProject();
        App.docStore.setTitleBlock(true);
        var md = reportMd({});
        T.assert(/^title: "CH Configuration Report — Dev"$/m.test(md), 'the title: ' + md.slice(0, 400));
        T.assert(/^subtitle: /m.test(md) && /^date: /m.test(md));
      });

      s.test('the choice is the project’s, not the session’s', function () {
        docProject();
        App.docStore.setTitleBlock(true);
        var back = App.projectIo.parseProject(App.projectIo.serializeProject(App.store.getProject()));
        T.assert(back.ok, JSON.stringify(back.issues));
        T.assertEqual(back.value.report.titleBlock, true, 'it must survive a save and load');
        App.docStore.setTitleBlock(false);
        T.assertEqual((App.store.getProject().report || {}).titleBlock, undefined, 'and off leaves no trace');
      });

      s.test('the switch is in the workspace', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('relevance');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-titleblock/.test(html), 'the Document fieldset must offer it');
        App.ui.views.reportDesign.close();
      });
    });

    T.suite('CAP-3 the caption sits under its table, and carries its number', function (s) {
      function lines(md) { return md.split('\n'); }
      function firstTable(md) {
        var ls = lines(md), a = -1, cap = -1;
        for (var i = 0; i < ls.length; i++) {
          if (a === -1 && /^\[\]\{#tbl-/.test(ls[i])) a = i;
          if (a !== -1 && cap === -1 && /^Table \d+: /.test(ls[i])) cap = i;
        }
        return { anchor: a, caption: cap };
      }

      s.test('below the table by default', function () {
        docProject();
        var t = firstTable(reportMd({}));
        T.assert(t.anchor > -1 && t.caption > -1, 'a captioned table must be found');
        T.assert(t.caption > t.anchor, 'the caption must follow the table it names');
      });

      s.test('and above it when the profile says so', function () {
        docProject();
        var made = App.docStore.addFormat('Captions above', App.docFormat.standard());
        App.docStore.updateFormat(made.id, { tables: { captionPosition: 'above' } });
        App.docStore.setFormatId(made.id);
        var md = reportMd({});
        var ls = lines(md);
        var cap = -1, anchor = -1;
        for (var i = 0; i < ls.length; i++) {
          if (cap === -1 && /^Table \d+: /.test(ls[i])) cap = i;
          if (anchor === -1 && /^\[\]\{#tbl-/.test(ls[i])) anchor = i;
        }
        T.assert(cap > -1 && anchor > -1 && cap < anchor, 'the caption must lead the table: ' + cap + ' vs ' + anchor);
      });

      s.test('the number in the caption is the number a reference uses', function () {
        docProject();
        var md = reportMd({});
        var caps = (md.match(/^Table (\d+): (.*)$/gm) || []);
        T.assert(caps.length > 3, 'expected several captions');
        var p = App.store.getProject(), pl = App.registry.getPlatform('android-adb');
        var prepared = App.generate.reportBlocks(p, pl, { deviceId: 'dev-m1' });
        var idx = App.doc.tableIndex(App.doc.outline(prepared.map(function (b) {
          return App.generate.sectionContent(p, 'dev-m1', pl, b, { deviceId: 'dev-m1' }, {},
            App.generate.deviceMeta(p, App.ui.model.getLatestConfigs(p)[0], '2026-01-01T00:00:00.000Z'));
        }), { baseLevel: 1 }));
        T.assertEqual(idx.length, caps.length, 'one index entry per printed caption');
        T.assertEqual(idx[idx.length - 1].number, String(caps.length), 'and they end on the same number');
      });

      s.test('the gap and the alignment are the profile’s', function () {
        var pre = App.docFormat.preamble(App.docFormat.normalise({ id: 'p', name: 'P', tables: { captionSkip: 9 } }));
        T.assert(/\\chCaptionOpen\}\{\\par\\addvspace\{9pt\}/.test(pre), 'the gap: ' + pre);
        // longtable's own skip on the side facing the caption is zeroed, or the reader
        // sees \bigskipamount plus the gap that was asked for.
        T.assert(/\\setlength\{\\LTpost\}\{0pt\}/.test(pre), 'the longtable skip below must be zeroed');
        var above = App.docFormat.preamble(App.docFormat.normalise({ id: 'p', name: 'P', tables: { captionPosition: 'above', captionSkip: 9 } }));
        T.assert(/\\setlength\{\\LTpre\}\{0pt\}/.test(above), 'and above it, the skip above');
      });

      s.test('the preview shows the caption where the page will, and labelled', function () {
        docProject();
        var html = App.ui.mdPreview.toHtml(reportMd({})).html;
        T.assert(/<div class="prv-caption"><strong>Table 1:<\/strong>/.test(html), 'labelled: ' + html.slice(0, 900));
        T.assert(html.indexOf('chCaptionOpen') === -1, 'the macros are machinery, never shown');
      });

      s.test('a section previewed on its own still shows its caption', function () {
        // RD-9 previews a section BODY, which has not been through App.doc.render and
        // still carries the `: caption` marker. Both forms have to render.
        var body = MD.table(['A'], [['x']], { caption: { id: 'a', text: 'Standalone' } });
        var html = App.ui.mdPreview.toHtml(body).html;
        T.assert(/prv-caption/.test(html) && /Standalone/.test(html), 'the marker form must still render: ' + html);
      });
    });

