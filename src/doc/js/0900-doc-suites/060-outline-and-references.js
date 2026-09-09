  (function (App) {
    'use strict';
    var T = App.test, MD = App.md, DOC = App.doc;

    /* Heading levels, numbering, cross-references and centring — App.doc's whole job,
     * exercised on literal block lists. A block is a plain object here, which is what
     * it is in the generator too; nothing in this file knows where blocks come from. */

    /** Blocks -> outline, with no project involved (pure level/numbering checks). */
    function outline(blocks, opts) { return DOC.outline(blocks, opts || {}); }
    function blk(id, label, level, kind) {
      return { id: id, label: label, level: level === undefined ? null : level, kind: kind || 'meta', included: true };
    }
    function nums(res) { return res.map(function (r) { return r.number + ':' + (r.level === DOC.BODY_LEVEL ? 'N' : 'H' + r.level); }); }

    /* ===== SUITES: heading levels, numbering and hand-authored parts (DOC-1..DOC-4) ===== */

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

    /* ===== SUITES: references and centring (REF-1 · CTR-1 · D-044) ===== */

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

  })(App);
