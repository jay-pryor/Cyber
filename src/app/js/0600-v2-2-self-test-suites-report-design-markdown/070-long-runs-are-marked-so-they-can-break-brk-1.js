    T.suite('the workspace stops moving under you', function (s) {
      s.test('selecting a section leaves the pane where it was', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('preview');
        // The click handler, not the programmatic select() — "open this section" still
        // means open it, but clicking down the list while watching the preview does not.
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-select="ds:android.packages"/.test(html), 'the row is still clickable');
        T.assert(/Select this section/.test(html), 'and says what it will do');
        T.assertEqual(App.ui.views.reportDesign.pane(), 'preview');
        App.ui.views.reportDesign.close();
      });

      s.test('a width chip knows its neighbours, so Tab can walk them', function () {
        docProject();
        ['type', 'items'].forEach(function (c) { App.docStore.setReportInclude('columns', 'control', c, true, false); });
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('control');
        var html = App.ui.views.generate.render(App.store.getProject());
        var chips = (html.match(/data-rd-pct="b\|control\|6" data-rd-col="\d"/g) || []);
        T.assertEqual(chips.length, 6, 'every column has a chip, including the last: ' + chips.join(', '));
        // They share one target string, which is how the Tab handler finds the next one
        // after the repaint has thrown away the element it was editing.
        T.assertEqual(new Set(chips.map(function (c) { return /data-rd-pct="([^"]+)"/.exec(c)[1]; })).size, 1);
        App.ui.views.reportDesign.close();
      });
    });

    /* ===== SUITES: long runs are marked so they can break (BRK-1) ===== */

    T.suite('BRK-1 a run with no space in it is marked so it can wrap', function (s) {
      s.test('a long identifier in a cell becomes a code span', function () {
        var out = MD.cell('io.sdsasolutions.tacticalsettings');
        T.assertEqual(out, '`io.sdsasolutions.tacticalsettings`');
      });

      s.test('the text around it is still escaped exactly once', function () {
        var out = MD.cell('50% of io.sdsasolutions.tacticalsettings & more_x');
        T.assert(/^50\\% of `io\.sdsasolutions\.tacticalsettings` \\& more\\_x$/.test(out), 'got: ' + out);
      });

      s.test('ordinary prose is left alone', function () {
        T.assertEqual(MD.cell('Bluetooth is disabled by policy on this fleet.'),
          'Bluetooth is disabled by policy on this fleet.');
        // Long, but it has spaces, so it wraps by itself and needs no help.
        T.assert(MD.cell('a sentence of perfectly ordinary words that runs on').indexOf('`') === -1);
      });

      s.test('the rule is narrow: long AND identifier-shaped', function () {
        T.assertEqual(MD.isLongIdentifier('com.example.other_app'), true);
        T.assertEqual(MD.isLongIdentifier('appInstallWhitelistLong'), true, 'a camelCase hump counts');
        T.assertEqual(MD.isLongIdentifier('/var/log/something/deep'), true);
        T.assertEqual(MD.isLongIdentifier('com.a'), false, 'short is not a problem');
        T.assertEqual(MD.isLongIdentifier('ANTIDISESTABLISHMENTARIAN'), false, 'a long WORD is not an identifier');
      });

      s.test('a backtick inside the run cannot break out of the span', function () {
        var out = MD.cell('a`b.c_d`e/f.g_h.i.j.k.l');
        T.assert(out.indexOf('``') === 0, 'the fence must grow past the content: ' + out);
        T.assertEqual(App.ui.mdPreview._inline(out).replace(/<\/?code>/g, ''), 'a`b.c_d`e/f.g_h.i.j.k.l');
      });

      s.test('marking it stops it starving the columns that cannot break', function () {
        /* The other half of the problem. Unmarked, a long identifier is an unbreakable
         * word, so it is a HARD floor — and several of them together exceed the page,
         * at which point every floor is cut in proportion and the one column that
         * genuinely cannot wrap (a one-word heading) is cut with them. Marked, they are
         * soft: they are asked for after the hard floors are met, and give way first. */
        var a = 'io.sdsasolutions.tacticalsettings.and.more.segments.here';
        var b = 'com.samsung.android.app.telephonyui.esimclient.extra';
        function frac(w) { return w[0] / w.reduce(function (x, y) { return x + y; }, 0); }
        var unmarked = MD.autoWidths([['**Rationale**', 'B', 'C'], ['', a, b]], 3);
        var marked = MD.autoWidths([['**Rationale**', 'B', 'C'], ['', MD.cell(a), MD.cell(b)]], 3);
        T.assert(frac(marked) > frac(unmarked),
          'the heading should keep more of the page: ' + frac(marked).toFixed(3) + ' vs ' + frac(unmarked).toFixed(3));
        // "Rationale" bold is 4.79em of a 39em text block — a shade over 12%.
        T.assert(frac(marked) > 0.12, 'and enough of it to fit: ' + frac(marked).toFixed(3));
      });

      s.test('it reaches the document, and the profile can break it there', function () {
        docProject();
        App.store.addItem('android.custom', 'Whitelist');
        App.store.setDecision('android.custom', 'Whitelist', { action: 'Allow io.sdsasolutions.tacticalsettings only.' });
        var md = reportMd({});
        T.assert(md.indexOf('`io.sdsasolutions.tacticalsettings`') !== -1, 'the run must be marked in the document');
        // \texttt is what \seqsplit is hooked on — that pair is the whole mechanism.
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(/\\usepackage\{seqsplit\}/.test(pre) && /renewcommand\{\\texttt\}/.test(pre),
          'the preamble must still route \\texttt through \\seqsplit');
      });

      s.test('the preview lets a long run wrap too', function () {
        // A fixed-layout table with a colgroup does not wrap a long word by default; it
        // lets it run out of the cell, which is the same defect in the other medium.
        var css = document.head ? '' : '';
        var sheet = App.ui.tables ? '' : '';
        var style = Array.prototype.slice.call(document.querySelectorAll('style'))
          .map(function (e) { return e.textContent; }).join('\n');
        T.assert(/\.prv-table th, [^{]*\.prv-table td \{[^}]*overflow-wrap: anywhere/.test(style),
          'the preview cells must be allowed to break a long word');
      });
    });

    /* ===== SUITES: a table narrower than the page (TW-3) ===== */

    T.suite('TW-3 widths that do not fill the page make a narrower table', function (s) {
      s.test('three columns at 20% make a 60% table', function () {
        var md = MD.table(['A', 'B', 'C'], [['x', 'y', 'z']], { widths: [0.2, 0.2, 0.2] });
        T.assert(/\\setlength\{\\columnwidth\}\{0\.6000\\columnwidth\}/.test(md),
          'expected the table scaled to 60% of the text width:\n' + md);
        // The SHARES inside the table are still equal: the total decides how wide the
        // table is, the shares decide how it is divided.
        var f = borderFractions(md);
        T.assert(Math.abs(f[0] - f[1]) < 0.01 && Math.abs(f[1] - f[2]) < 0.01, 'equal shares: ' + f.join('/'));
      });

      s.test('widths that fill the page emit no narrowing at all', function () {
        var md = MD.table(['A', 'B'], [['x', 'y']], { widths: [0.5, 0.5] });
        T.assert(md.indexOf('columnwidth') === -1, 'a full-width table needs no group:\n' + md);
      });

      s.test('over 100% is capped rather than honoured', function () {
        // A table wider than the page is not a layout, it is an overflow.
        var md = MD.table(['A', 'B'], [['x', 'y']], { widths: [0.6, 0.5] });
        T.assert(md.indexOf('columnwidth') === -1, 'must not scale a table UP:\n' + md);
      });

      s.test('the narrowing and the shading share one group', function () {
        var st = App.docFormat.tableStyle(App.docFormat.standard(), { head: true });
        var md = MD.table(['A', 'B'], [['x', 'y']], { widths: [0.2, 0.2], style: st });
        T.assertEqual((md.match(/\\begingroup/g) || []).length, 1, 'one group, not two:\n' + md);
        T.assertEqual((md.match(/\\endgroup/g) || []).length, 1);
        T.assert(/\\begingroup\\setlength\{[^}]*\}\{[^}]*\}\\chTblHeadShade/.test(md), 'both commands in it: ' + md.split('\n')[2]);
      });

      s.test('a drag keeps the table the width it was', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.addColumn(sec, 'part1');
        [0, 1, 2].forEach(function (i) { App.docStore.setWidth(sec, 'part1', i, 0.2, true); });
        T.assertEqual(App.docStore.widthTotal(App.store.getProject().report.sections[0].parts[0].widths).total, 60);
        App.docStore.setWidth(sec, 'part1', 0, 0.3);      // dragged, not typed
        var w = App.store.getProject().report.sections[0].parts[0].widths;
        T.assert(Math.abs(w.reduce(function (a, x) { return a + x; }, 0) - 0.6) < 1e-6,
          'a drag must not change the table width: ' + JSON.stringify(w));
        T.assert(Math.abs(w[0] - 0.3) < 1e-6, 'and must land where it was dropped');
      });

      s.test('the preview draws a narrow table narrow, and centred', function () {
        var md = MD.table(['A', 'B', 'C'], [['x', 'y', 'z']], { widths: [0.2, 0.2, 0.2], caption: { id: 'n', text: 'N' } });
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/width:60%/.test(html), 'expected a 60% table: ' + (/(<div class="prv-tablewrap"[^>]*>)/.exec(html) || [])[1]);
        T.assert(/margin:8px auto/.test(html), 'and centred');
        T.assert(html.indexOf('Raw LaTeX') === -1, 'the narrowing group is machinery, not content');
      });
    });

    /* ===== SUITES: an unnumbered title level (TTL-1) ===== */

    T.suite('TTL-1 a title takes no number and gives none away', function (s) {
      function run(levels) {
        return DOC.outline(levels.map(function (lv, i) {
          return { id: 's' + i, kind: 'meta', label: 'S' + i, level: lv, included: true };
        }), {});
      }

      s.test('the first H1 after a title is still 1', function () {
        var r = run([DOC.TITLE_LEVEL, 1, 2, 1]);
        T.assertDeepEqual(r.map(function (x) { return x.number; }), ['', '1', '1.1', '2']);
      });

      s.test('a title prints a heading, at the top level, with no number', function () {
        var r = run([DOC.TITLE_LEVEL])[0];
        T.assertEqual(r.level, DOC.TITLE_LEVEL);
        var out = DOC.headingFor(Object.assign({}, r, { title: 'Executive summary' }));
        T.assert(/^# Executive summary \{#sec-s0\}$/m.test(out), 'the heading itself is unchanged: ' + out);
        // TTL-3: and it is wrapped in the pair that gives it its own styling.
        T.assert(/^```\{=latex\}\n\\chTitleStyle\n```/.test(out), 'no title styling before it: ' + out);
        T.assert(/```\{=latex\}\n\\chSectionStyle\n```$/.test(out), 'no restore after it: ' + out);
      });

      s.test('a title does not become the level an automatic section follows', function () {
        // Title, then an automatic section: it should be H1, not "a sibling of the title".
        var r = DOC.outline([
          { id: 't', kind: 'meta', label: 'T', level: DOC.TITLE_LEVEL, included: true },
          { id: 'a', kind: 'meta', label: 'A', level: null, included: true }
        ], {});
        T.assertEqual(r[1].level, 1);
        T.assertEqual(r[1].number, '1');
      });

      s.test('several titles do not accumulate anything', function () {
        var r = run([DOC.TITLE_LEVEL, DOC.TITLE_LEVEL, 1]);
        T.assertDeepEqual(r.map(function (x) { return x.number; }), ['', '', '1']);
      });

      s.test('a title is still a link target', function () {
        var r = run([DOC.TITLE_LEVEL, 1]);
        T.assert(DOC.refTargets(r, []).some(function (t) { return t.id === 's0'; }), 'a titled section must be linkable');
      });

      s.test('the level vocabulary carries it, and names it once', function () {
        T.assert(DOC.LEVELS.some(function (l) { return l.value === DOC.TITLE_LEVEL && l.label === 'T'; }), 'no T in the level list');
        T.assertEqual(DOC.levelLabel(DOC.TITLE_LEVEL), 'T');
        T.assertEqual(DOC.levelLabel(DOC.BODY_LEVEL), 'N');
        T.assertEqual(DOC.levelLabel(3), 'H3');
      });

      s.test('the store accepts it, and the picker offers it', function () {
        docProject();
        T.assertEqual(App.docStore.setBlockLevel('meta', DOC.TITLE_LEVEL).ok, true);
        T.assertEqual(App.store.getProject().report.levels.meta, DOC.TITLE_LEVEL);
        T.assertEqual(App.docStore.setBlockLevel('meta', 9).ok, false, 'and still refuses a level that is not one');
        App.ui.views.reportDesign.open();
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/<option value="0"[^>]*>T<\/option>/.test(html), 'the picker must offer T');
        App.ui.views.reportDesign.close();
      });

      s.test('an unnumbered title reaches the document that way', function () {
        docProject();
        App.docStore.setBlockLevel('meta', DOC.TITLE_LEVEL);
        var md = reportMd({});
        T.assert(/^# Device Config Information \{#sec-meta\}$/m.test(md), 'the title must carry no number: ' + md.slice(0, 200));
        T.assert(/^# 1 Packages \{#sec-ds-android-packages\}/m.test(md), 'and the next section must be 1');
      });
    });

    /* ===== SUITES: the profile reaches the preview (PRV-2 · CAP-2 · NAM-2) ===== */

    T.suite('PRV-2 the preview shows the formatting, not just the words', function (s) {
      s.test('the profile compiles to CSS with its own numbers in it', function () {
        var f = App.docFormat.normalise({ id: 'p', name: 'P',
          page: { paper: 'a5', marginLeft: '10mm', marginRight: '10mm', fontSize: '14pt', lineSpacing: 1.5 },
          levels: [{ level: 1, size: 30, leading: 34, bold: false, italic: true, spaceBefore: 6, spaceAfter: 4 }] });
        var css = App.docFormat.previewCss(f);
        T.assert(/\.rd-paper \{[^}]*font-size: 18\.67px/.test(css), 'the base font size must reach the page: ' + css.slice(0, 200));
        T.assert(/line-height: 1\.5/.test(css), 'and the line spacing');
        T.assert(/\.rd-paper \.prv-h1 \{[^}]*font-size: 40px/.test(css), 'and each heading level: ' + css);
        T.assert(/\.prv-h1 \{[^}]*font-style: italic/.test(css), 'including italics');
        // A5 less 20mm of margin is 128mm, which is 484px at 96dpi.
        T.assert(/width: 484px/.test(css), 'the page width must follow the paper and margins: ' + css.slice(0, 120));
      });

      s.test('the table styling reaches it as the profile\'s own colours', function () {
        var css = App.docFormat.previewCss(App.docFormat.standard());
        T.assert(/\.prv-shade-head thead th \{ background: #d9e2f3/.test(css), 'the header shade: ' + css);
        T.assert(css.indexOf('.prv-shade-col tbody td:first-child { background: ' +
          App.docFormat.STANDARD.tables.firstColumn.shade.toLowerCase()) !== -1, 'the first-column shade: ' + css);
      });

      s.test('CAP-2: the caption centring switch reaches both the preamble and the preview', function () {
        var plain = App.docFormat.normalise({ id: 'p', name: 'P' });
        // CAP-3: a caption is an ordinary paragraph now, so its alignment is the
        // paragraph's — \raggedright or \centering — rather than a captionsetup that
        // had to undo LaTeX's single-line special case.
        T.assert(/\\chCaptionOpen\}\{[^\n]*\\raggedright\}/.test(App.docFormat.preamble(plain)), 'left by default');
        T.assert(/\.prv-caption \{ text-align: left/.test(App.docFormat.previewCss(plain)));
        var centred = App.docFormat.normalise({ id: 'p', name: 'P', tables: { captionCentre: true } });
        T.assert(/\\chCaptionOpen\}\{[^\n]*\\centering\}/.test(App.docFormat.preamble(centred)), 'the LaTeX half');
        T.assert(/\.prv-caption \{ text-align: center/.test(App.docFormat.previewCss(centred)), 'the preview half');
      });

      s.test('nothing hostile survives into the stylesheet', function () {
        var css = App.docFormat.previewCss(App.docFormat.normalise({ id: 'p', name: 'P',
          page: { fontSize: '11pt; } body { display:none } .x {', marginLeft: 'red;}' },
          tables: { head: { shade: '#fff; } * { display:none' } } }));
        T.assert(css.indexOf('display:none') === -1, 'a size or colour box is not a stylesheet: ' + css.slice(0, 300));
      });

      s.test('every preview is wrapped in the page, and carries the stylesheet', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var section = App.ui.views.generate.render(App.store.getProject());
        T.assert(/<style>[\s\S]*\.rd-paper/.test(section), 'the section preview must carry the profile CSS');
        T.assert(/class="rd-paper/.test(section), 'and be drawn on the page');
        App.ui.views.reportDesign.pane('preview');
        var whole = App.ui.views.generate.render(App.store.getProject());
        T.assert(/<style>[\s\S]*\.rd-paper/.test(whole) && /class="rd-paper/.test(whole), 'and so must the whole-document preview');
        App.ui.views.reportDesign.pane('section');
        App.ui.views.reportDesign.close();
      });

      s.test('a formatting change is visible in the preview without generating', function () {
        docProject();
        App.docStore.addFormat('House', App.docFormat.standard());
        App.docStore.setFormatId('fmt1');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var before = App.ui.views.generate.render(App.store.getProject());
        var f = App.docFormat.list(App.store.getProject()).filter(function (x) { return x.id === 'fmt1'; })[0];
        // levels[0] is the TITLE row (TTL-3); levels[1] is H1.
        f.levels[1].size = 40;
        App.docStore.updateFormat('fmt1', f);
        var after = App.ui.views.generate.render(App.store.getProject());
        T.assert(before !== after, 'the preview must change when the profile does');
        T.assert(/\.prv-h1 \{[^}]*font-size: 53\.33px/.test(after), 'with the new size in it');
        App.ui.views.reportDesign.close();
      });
    });

