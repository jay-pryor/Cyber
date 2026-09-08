    /* ===== SUITES: references that reach the PDF (REF-1 · REF-2) ===== */

    T.suite('REF-1 a cross-reference reaches the document as a link', function (s) {
      function sectionAt(id, title, number) {
        return { id: id, kind: 'dataset', label: title, title: title, level: 1, included: true,
          number: number, anchor: MD.anchor('sec-' + id) };
      }
      function resolverFor(blocks) { return DOC.refResolver(blocks, []); }

      s.test('an id with a DOT in it is a token, not literal text', function () {
        /* The reported defect, exactly. `ds:android.packages` is the id of every register
         * section, and the token pattern's id charset had no `.` — so the most likely
         * reference a designer could insert never matched, fell through to the escaper
         * with the rest of the prose, and printed in the PDF as `{{ref:ds:android.packages}}`.
         * A reference to a hand-authored section (`sec1`) worked, which is what made it
         * read as "references are broken sometimes". */
        var res = resolverFor([sectionAt('ds:android.packages', 'Packages', '3')]);
        var md = MD.rich('see {{ref:ds:android.packages}}', { resolveRef: res });
        T.assertEqual(md, 'see [Section 3 — Packages](#sec-ds-android-packages)');
        T.assert(md.indexOf('{{') === -1, 'no token may survive into the document');
      });

      s.test('three readings, all derived at render time', function () {
        var res = resolverFor([sectionAt('s', 'Packages', '3')]);
        T.assertEqual(MD.rich('{{ref:s}}', { resolveRef: res }), '[Section 3 — Packages](#sec-s)');
        T.assertEqual(MD.rich('{{refn:s}}', { resolveRef: res }), '[Section 3](#sec-s)');
        T.assertEqual(MD.rich('{{reft:s}}', { resolveRef: res }), '[Packages](#sec-s)');
      });

      s.test('a renumber changes every reading of every reference to it', function () {
        var before = resolverFor([sectionAt('s', 'Packages', '3')]);
        var after = resolverFor([sectionAt('s', 'Packages', '7')]);
        T.assertEqual(MD.rich('{{refn:s}}', { resolveRef: before }), '[Section 3](#sec-s)');
        T.assertEqual(MD.rich('{{refn:s}}', { resolveRef: after }), '[Section 7](#sec-s)',
          'the stored token is unchanged; only what it reads as moved');
      });

      s.test('a table reference names the number the caption prints', function () {
        var tables = [{ id: 'p1', number: '4', caption: 'Packages removed', anchor: 'tbl-p1' }];
        var res = DOC.refResolver([], tables);
        T.assertEqual(MD.rich('{{ref:p1}}', { resolveRef: res }), '[Table 4: Packages removed](#tbl-p1)');
        T.assertEqual(MD.rich('{{refn:p1}}', { resolveRef: res }), '[Table 4](#tbl-p1)');
      });

      s.test('a selection becomes the link text, and is not eaten', function () {
        var res = resolverFor([sectionAt('s', 'Packages', '3')]);
        T.assertEqual(MD.rich('as {{ref:s}}the package list{{/ref}} shows', { resolveRef: res }),
          'as [the package list](#sec-s) shows');
      });

      s.test('an unresolvable reference is stated, and keeps the words around it', function () {
        var none = function () { return null; };
        T.assertEqual(MD.rich('see {{ref:gone}}', { resolveRef: none }), 'see **\\[missing reference\\]**');
        T.assertEqual(MD.rich('see {{ref:gone}}that{{/ref}} there', { resolveRef: none }),
          'see that **\\[missing reference\\]** there', 'the author\'s words are not thrown away with the link');
      });

      s.test('a PARAGRAPH is a link target, and carries an anchor to land on', function () {
        var blocks = [{ id: 'c', kind: 'custom', title: 'Annex', label: 'Annex', included: true, level: 1,
          number: '2', anchor: 'sec-c',
          parts: [{ id: 'part7', kind: 'para', text: 'The baseline was applied in full.' }] }];
        var t = DOC.refTargets(blocks, []).filter(function (x) { return x.kind === 'paragraph'; })[0];
        T.assert(!!t, 'a paragraph must be offered as a target');
        T.assertEqual(t.id, 'part7');
        T.assert(/The baseline was applied/.test(t.label), 'named by its opening words: ' + t.label);
        var md = DOC.renderParts(blocks[0].parts, { resolveRef: function () { return null; }, tables: [] });
        T.assert(md.indexOf('[]{#par-part7}') === 0, 'and the paragraph emits the anchor it is addressed by: ' + md);
      });

      s.test('an introduction resolves its references, which is what generated sections lacked', function () {
        /* The introduction used to be rendered by the GENERATOR, before the outline
         * existed, with `MD.rich(intro, {})` — no resolver, so every reference in one
         * resolved to nothing. It is rendered by App.doc now, with the same ctx a
         * hand-authored paragraph gets. */
        var blocks = DOC.outline([
          { id: 'a', kind: 'dataset', label: 'Packages', title: 'Packages', level: 1, included: true,
            intro: 'Compare with {{refn:b}}.' },
          { id: 'b', kind: 'dataset', label: 'Tactical', title: 'Tactical', level: 1, included: true }
        ], {});
        var md = DOC.render({ blocks: blocks });
        T.assert(/\[Section 2\]\(#sec-b\)/.test(md), 'the introduction\'s reference must resolve: ' + md);
        T.assert(md.indexOf('missing reference') === -1, 'and must not read as dangling');
      });

      s.test('the preview lands a paragraph anchor on the paragraph, not on the next table', function () {
        // It used to hold the anchor and give it to whatever table came next, so the
        // preview's links went somewhere the PDF's do not.
        var html = App.ui.mdPreview.toHtml('[]{#par-part7}\n\nSome prose.\n\n| A |\n| --- |\n| x |\n\n: Cap').html;
        T.assert(/<p id="par-part7">Some prose\.<\/p>/.test(html), 'the paragraph must carry it: ' + html);
        T.assert(!/prv-tablewrap" id="par-part7"/.test(html), 'and the table must not');
      });
    });

    T.suite('REF-2 every mention of a control links to its coverage row', function (s) {
      var terms = [{ text: 'AHG-001', anchor: 'ctl-a' }, { text: 'ISM-1416', anchor: 'ctl-b' },
        { text: 'ISM-141', anchor: 'ctl-c' }];

      s.test('a mention in prose becomes a link', function () {
        T.assertEqual(MD.rich('Met by AHG-001.', { linkTerms: terms }), 'Met by [AHG-001](#ctl-a).');
      });

      s.test('the longest match wins, and a mention mid-word is not one', function () {
        T.assertEqual(MD.autoLink('ISM-1416', terms), '[ISM-1416](#ctl-b)',
          'ISM-141 must not eat the start of ISM-1416');
        T.assertEqual(MD.autoLink('AHG-0011 and xAHG-001', terms), 'AHG-0011 and xAHG-001',
          'neither leading nor trailing word characters may be linked over');
      });

      s.test('a term already inside a link is left alone', function () {
        T.assertEqual(MD.autoLink('[AHG-001](#ctl-a)', terms), '[AHG-001](#ctl-a)');
      });

      s.test('a code span is verbatim, so a mention inside one is not linked', function () {
        T.assertEqual(MD.rich('{{c}}AHG-001{{/c}}', { linkTerms: terms }), '`AHG-001`');
      });

      s.test('the coverage table anchors each row, and does not link a row to itself', function () {
        docProject();
        App.store.addControl({ title: 'AHG-001', type: 'ASD', description: 'Remove vendor bloat.' });
        var ctl = App.store.getProject().controls[0].id;
        App.store.setItemFields('android.packages', 'com.a',
          { controlRefs: [ctl], rationale: 'Satisfies AHG-001 in full.' });
        var md = reportMd({});
        T.assert(md.indexOf('[]{#' + App.generate.controlAnchor(ctl) + '}') !== -1,
          'the coverage row must carry the anchor every mention points at');
        T.assert(new RegExp('\\[AHG-001\\]\\(#' + App.generate.controlAnchor(ctl) + '\\)').test(md),
          'and the mention in the Rationale column must link to it');
        // The row's own first cell names the control; a link from there to here is noise.
        var row = md.slice(md.indexOf('[]{#' + App.generate.controlAnchor(ctl) + '}'));
        row = row.slice(0, row.indexOf('\n+'));
        T.assert(row.indexOf('](#' + App.generate.controlAnchor(ctl) + ')') === -1,
          'a row must not link to itself: ' + row);
      });

      s.test('with the coverage section switched off, nothing is linked', function () {
        // A link to a section that was not emitted is a link to nowhere, and pandoc will
        // not warn about it — so the honest answer is plain text.
        docProject();
        App.store.addControl({ title: 'AHG-001', type: 'ASD', description: 'x' });
        var blocks = [{ id: 'control', kind: 'control', included: false }];
        T.assertDeepEqual(App.generate.controlLinkTerms(App.store.getProject(), blocks), []);
        T.assertEqual(App.generate.controlLinkTerms(App.store.getProject(),
          [{ id: 'control', kind: 'control', included: true }]).length, 1);
      });

      s.test('the preview shows the control, not the span that anchors it', function () {
        // The anchor is machinery: it prints nothing on the page, so it must print
        // nothing here either — while still being somewhere a link can land.
        var cell = App.ui.mdPreview._cellHtml('[]{#ctl-ahg-001}\nAHG-001');
        T.assert(cell.indexOf('[]{#') === -1, 'the raw span must not be shown: ' + cell);
        T.assert(/id="ctl-ahg-001"/.test(cell), 'the id must survive so the link lands: ' + cell);
        T.assertEqual(cell.replace(/<[^>]*>/g, ''), 'AHG-001',
          'nothing but the control is left once the markup is stripped');
      });

      s.test('a mention still reaches the row the preview anchored', function () {
        docProject();
        App.store.addControl({ title: 'AHG-001', type: 'ASD', description: 'Remove vendor bloat.' });
        var ctl = App.store.getProject().controls[0].id;
        App.store.setItemFields('android.packages', 'com.a',
          { controlRefs: [ctl], rationale: 'Satisfies AHG-001 in full.' });
        var html = App.ui.mdPreview.toHtml(reportMd({})).html;
        T.assert(html.indexOf('[]{#') === -1, 'no raw anchor span may reach the reader');
        T.assert(html.indexOf('id="' + App.generate.controlAnchor(ctl) + '"') !== -1,
          'the coverage row must still carry the id');
        T.assert(html.indexOf('data-prv-jump="' + App.generate.controlAnchor(ctl) + '"') !== -1,
          'and the mention must still be a jump to it');
      });

      s.test('a row anchor costs the column no width and is never broken', function () {
        var wide = MD.table(['A', 'B'], [['x', 'y']], { rowAnchors: ['[]{#ctl-a-very-long-control-id}'] });
        T.assert(/^\+/.test(wide), 'an anchored table takes the grid form — a pipe cell has no line of its own');
        T.assert(wide.indexOf('[]{#ctl-a-very-long-control-id}') !== -1, 'the span must survive whole');
        var lines = wide.split('\n').filter(function (l) { return /^[+|]/.test(l); });
        var w = lines[0].length;
        T.assert(lines.every(function (l) { return l.length === w; }), 'a broken span would misalign the grid:\n' + wide);
      });
    });

    /* ===== SUITES: type, centring, table wording and placement (FNT-4 · CTR-1 · TBL-1 · SEC-4) ===== */

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

    T.suite('CTR-1 centring a section centres its heading too', function (s) {
      s.test('the heading is centred by its own titleformat, not by a center environment', function () {
        /* The environment was the obvious way and it was wrong twice: titlesec sets a
         * heading's text in a box `\centering` does not reach (so the title came out
         * JUSTIFIED across the measure), and the environment's glue fires before
         * `\sectionbreak` (so a level that starts a page got a blank one first). */
        var b = { id: 'a', kind: 'custom', title: 'Title page', label: 'Title page', level: 1, number: '1',
          anchor: 'sec-a', centre: true };
        var h = DOC.headingFor(b);
        T.assert(h.indexOf('\\begin{center}') === -1, 'no center environment may wrap a heading: ' + h);
        T.assert(h.indexOf('\\chCentreOne') < h.indexOf('# 1 Title page {#sec-a}'), 'the centred face opens first');
        T.assert(h.indexOf('# 1 Title page {#sec-a}') < h.indexOf('\\chPlainOne'), 'and is put back after');
      });

      s.test('every level has a centred face, and App.doc names the same ones', function () {
        // The two lists have to agree; this is what says they do.
        var pre = App.docFormat.preamble(App.docFormat.standard());
        ['One', 'Two', 'Three', 'Four'].forEach(function (w) {
          T.assert(pre.indexOf('\\newcommand{\\chCentre' + w + '}') !== -1, 'no centred face for ' + w);
          T.assert(pre.indexOf('\\newcommand{\\chPlain' + w + '}') !== -1, 'no plain face for ' + w);
        });
        T.assert(/\\newcommand\{\\chCentreOne\}\{\\titleformat\{\\section\}\{[^}]*\}?[^\n]*\\centering\}/.test(pre),
          'the centring must be in the FORMAT argument, where titlesec expects alignment: ' +
          (pre.match(/\\newcommand\{\\chCentreOne\}.*/) || ''));
        for (var lv = 1; lv <= 4; lv++) {
          var h = DOC.headingFor({ id: 'x', title: 'T', label: 'T', level: lv, anchor: 'sec-x', centre: true });
          T.assert(/\\chCentre(One|Two|Three|Four)/.test(h), 'level ' + lv + ' must name a macro the profile defines: ' + h);
        }
      });

      s.test('a TITLE has a centred face of its own', function () {
        var h = DOC.headingFor({ id: 'a', kind: 'custom', title: 'Foreword', label: 'Foreword',
          level: DOC.TITLE_LEVEL, anchor: 'sec-a', centre: true });
        T.assert(h.indexOf('\\chTitleStyleCentred') !== -1, 'the centred title face: ' + h);
        T.assert(h.indexOf('\\chSectionStyle') > h.indexOf('# Foreword'), 'and the restore comes after the heading');
        var plain = DOC.headingFor({ id: 'a', kind: 'custom', title: 'Foreword', label: 'Foreword',
          level: DOC.TITLE_LEVEL, anchor: 'sec-a' });
        T.assert(/\\chTitleStyle\b/.test(plain) && plain.indexOf('Centred') === -1, 'and an uncentred title is unchanged');
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(pre.indexOf('\\newcommand{\\chTitleStyleCentred}') !== -1, 'the profile must define it');
      });

      s.test('a hand-authored section\'s body is centred in the DOCUMENT, not only the preview', function () {
        // A generated section is centred where its body is built (sectionContent); a
        // custom section's body is built by render(), and nothing was centring it — so
        // the switch worked in the per-section preview and did nothing in the .md.
        var md = DOC.render({ blocks: DOC.outline([
          { id: 'c', kind: 'custom', title: 'Title page', label: 'Title page', level: DOC.TITLE_LEVEL,
            included: true, centre: true, parts: [{ id: 'p1', kind: 'para', text: 'Prepared for ACME' }] }
        ], {}) });
        T.assert(/\\begin\{center\}/.test(md) && /\\end\{center\}/.test(md),
          'the body must be centred on the page: ' + md);
        T.assert(md.indexOf('Prepared for ACME') > md.indexOf('\\begin{center}'), 'and the prose inside it');
        var off = DOC.render({ blocks: DOC.outline([
          { id: 'c', kind: 'custom', title: 'T', label: 'T', level: 1, included: true,
            parts: [{ id: 'p1', kind: 'para', text: 'x' }] }
        ], {}) });
        T.assert(off.indexOf('\\begin{center}') === -1, 'and an uncentred section is untouched');
      });

      s.test('a centred heading no longer drags a blank page in front of it', function () {
        // The `center` environment contributed its glue BEFORE \sectionbreak fired, so a
        // level asking for a page break got the glue on a page of its own.
        var h = DOC.headingFor({ id: 'a', title: 'T', label: 'T', level: DOC.TITLE_LEVEL,
          anchor: 'sec-a', centre: true });
        T.assert(h.indexOf('center') === -1, 'nothing may sit between the declaration and the heading: ' + h);
      });

      s.test('the preview keeps a centred heading in the outline', function () {
        // The nested render's outline was thrown away, so a centred section vanished
        // from the navigation rail and from the contents list while still printing.
        var md = DOC.render({ blocks: DOC.outline([
          { id: 'a', kind: 'custom', title: 'Title page', label: 'Title page', level: 1, included: true, centre: true }
        ], {}) });
        var p = App.ui.mdPreview.toHtml(md);
        T.assertEqual(p.outline.length, 1, 'the heading must still be listed');
        T.assertEqual(p.outline[0].title, 'Title page');
        T.assert(/prv-centre/.test(p.html), 'and it is still drawn centred');
      });
    });

