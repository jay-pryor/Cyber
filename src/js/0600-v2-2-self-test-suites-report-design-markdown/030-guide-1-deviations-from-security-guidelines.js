    T.suite('GUIDE-1 Deviations from Security Guidelines', function (s) {
      function diverging() {
        docProject();
        App.store.setItemFields('android.packages', 'com.a',
          { diverges: true, description: 'Vendor launcher', divergenceNarrative: 'ASD says remove; kept for 50% of users.' });
        return App.store.getProject();
      }
      s.test('with nothing flagged the section does not exist at all', function () {
        docProject();
        var b = App.generate.reportBlocks(App.store.getProject(), App.registry.getPlatform('android-adb'), {})
          .filter(function (x) { return x.id === 'guidelines'; })[0];
        T.assert(!!b, 'it stays a candidate so the designer can show why it is empty');
        T.assertEqual(b.included, false, 'but it is not included');
        T.assertEqual(b.empty, true);
        T.assert(reportMd().indexOf('Deviations from Security Guidelines') === -1, 'and never reaches the document');
      });
      s.test('one flagged item brings the section in, with description and narrative', function () {
        diverging();
        var md = reportMd();
        T.assert(/^# \d+ Deviations from Security Guidelines \{#sec-guidelines\}$/m.test(md),
          'no section heading: ' + (md.match(/^#+ .*Guidelines.*$/m) || ''));
        T.assert(/\|\s*Item\s*\|\s*Description\s*\|\s*How it departs, and why\s*\|/.test(md), 'wrong columns');
        T.assert(/`com\.a`/.test(md) && /Vendor launcher/.test(md), 'the item and its description');
        T.assert(/ASD says remove; kept for 50\\% of users\./.test(md), 'the narrative, escaped');
      });
      s.test('it is grouped by register, and an empty register is left out', function () {
        diverging();
        var md = reportMd();
        var sec = md.slice(md.search(/^# \d+ Deviations from Security Guidelines/m));
        sec = sec.slice(0, sec.search(/\n# /) === -1 ? sec.length : sec.search(/\n# /));
        // TBL-1: one table per register, each with its own caption anchor, and no
        // sub-heading carrying the register's name — the same change that removed the
        // "Removed"/"Kept" sub-headings from a grouped register.
        T.assert(sec.indexOf('[]{#tbl-guidelines-android-packages}') !== -1,
          'Packages must be its own table: ' + sec.slice(0, 200));
        T.assert(!/^#+ /m.test(sec.slice(sec.indexOf('\n'))), 'and must carry no sub-heading: ' + sec.slice(0, 200));
        T.assert(sec.indexOf('Tactical') === -1, 'a register with nothing flagged must not appear');
        T.assert(sec.indexOf('Custom Security Actions') === -1);
      });
      s.test('a flag with no narrative says so rather than showing a blank cell', function () {
        docProject();
        App.store.setItemFields('android.packages', 'com.a', { diverges: true });
        var md = reportMd();
        T.assert(/\*Flagged, no narrative recorded\.\*/.test(md), 'an unexplained flag must be visible as one');
        T.assert(/\*No description recorded\.\*/.test(md));
      });
      s.test('the relevance filter narrows it like every other section', function () {
        diverging();
        App.store.setItemFields('android.packages', 'com.a', { relevance: 'IRRELEVANT' });
        T.assert(reportMd({ relevance: { IRRELEVANT: false } }).indexOf('Deviations from Security Guidelines') === -1,
          'filtering out the only flagged item empties the section');
      });
    });

    T.suite('RD-8 centring and the per-section preview', function (s) {
      s.test('any section can be centred, generated ones included', function () {
        docProject();
        App.docStore.setBlockCentre('meta', true);
        var md = reportMd();
        var sec = md.slice(md.indexOf('{#sec-meta}'));
        T.assert(/\\begin\{center\}/.test(sec.slice(0, 200)), 'the body must open a center environment');
        T.assert(/\\end\{center\}/.test(sec), 'and close it');
      });
      s.test('centring is stored as absence when off, so it is byte-stable', function () {
        docProject();
        App.docStore.setBlockCentre('meta', true);
        T.assertEqual(App.store.getProject().report.centred.meta, true);
        App.docStore.setBlockCentre('meta', false);
        T.assert(!App.store.getProject().report, 'un-centring must leave no trace');
      });
      s.test('a grouped section centres each of its groups', function () {
        docProject();
        App.docStore.setBlockCentre('ds:android.packages', true);
        var md = reportMd();
        T.assert((md.match(/\\begin\{center\}/g) || []).length >= 3, 'each group body should be centred');
      });
      s.test('the Section pane previews the selected generated section', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/class="rd-preview-doc rd-secprev"/.test(html), 'no preview pane for the section');
        T.assert(/<table class="prv-table">/.test(html), 'the section should render as a real table');
        T.assert(/data-rd-centre="ds:android\.packages"/.test(html), 'and offer the centre toggle');
        App.ui.views.reportDesign.select('meta');
        var meta = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-meta="projectHash"/.test(meta), 'the metadata block offers its row picker');
        T.assert(meta.indexOf('data-rd-meta="generatedUtc"') === -1, 'and no UTC row to pick');
        App.ui.views.reportDesign.close();
      });
      s.test('the preview of a section matches that section in the document', function () {
        docProject();
        App.store.setDecision('android.packages', 'com.b', { action: 'remove' });
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var html = App.ui.views.generate.render(App.store.getProject());
        // Same source of truth: sectionContent feeds both, so a value shown in the tab
        // is a value the document will carry.
        T.assert(/com\.b/.test(html), 'the preview shows the decided item');
        T.assert(reportMd().indexOf('com.b') !== -1);
        App.ui.views.reportDesign.close();
      });
    });

    T.suite('PRV-1 the preview renders the document that will be generated', function (s) {
      s.test('the outline mirrors the headings, with their numbers and anchors', function () {
        docProject();
        var p = App.ui.mdPreview.toHtml(reportMd());
        // TOC-1: the contents list leads, as a TITLE — no number of its own, and it
        // gives none away, so the section after it is still 1.
        T.assertEqual(p.outline[0].title, 'Contents');
        T.assertEqual(p.outline[0].number, '');
        var first = p.outline[1];
        T.assertEqual(first.number, '1');
        T.assertEqual(first.title, 'Device Config Information');
        T.assertEqual(first.anchor, 'sec-meta');
        // TBL-1: a grouped register no longer contributes sub-headings — its groups are
        // tables under the section. Every heading the document does print is listed.
        T.assertDeepEqual(p.outline.map(function (o) { return o.title; }),
          (reportMd().match(/^#+ .*$/gm) || []).map(function (h) {
            return App.ui.mdPreview.unescapeMd(h.replace(/^#+\s+/, '').replace(/\s*\{#.*$/, '').replace(/^[\d.]+\s+/, ''));
          }),
          'the rail must list exactly the headings the document prints');
      });
      s.test('escaped characters render as themselves, not as backslashes', function () {
        var html = App.ui.mdPreview.toHtml('50\\% of a\\_b \\& more').html;
        T.assert(/50% of a_b &amp; more/.test(html), 'escapes must be read back: ' + html);
      });
      s.test('a code span is verbatim and HTML-safe', function () {
        var html = App.ui.mdPreview.toHtml('a `com.x_y` b').html;
        T.assert(/<code>com\.x_y<\/code>/.test(html));
      });
      s.test('emphasis, links and hard breaks survive the round trip', function () {
        var html = App.ui.mdPreview.toHtml('**b** *i* [Section 2](#sec-meta)').html;
        T.assert(/<strong>b<\/strong>/.test(html) && /<em>i<\/em>/.test(html));
        T.assert(/<a href="#sec-meta" data-prv-jump="sec-meta">Section 2<\/a>/.test(html));
        T.assert(/<br>/.test(App.ui.mdPreview.toHtml('a\\\nb').html), 'a hard break must render');
      });
      s.test('an escaped asterisk cannot start emphasis in the preview either', function () {
        var html = App.ui.mdPreview.toHtml('50\\% not \\*bold\\* here').html;
        T.assert(html.indexOf('<strong>') === -1 && html.indexOf('<em>') === -1, 'escaped markers must stay literal: ' + html);
      });
      s.test('tables, rules and page breaks all render', function () {
        var html = App.ui.mdPreview.toHtml('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n* * *\n\n```{=latex}\n\\newpage\n```').html;
        T.assert(/<table class="prv-table">/.test(html) && /<td>1<\/td>/.test(html));
        T.assert(/<hr class="prv-rule">/.test(html));
        T.assert(/prv-pagebreak/.test(html) && /Page break/.test(html));
      });
      s.test('the YAML metadata block is stripped, never shown as body text', function () {
        var out = App.ui.mdPreview.toHtml('---\ntitle: "T"\n---\n\n# 1 X {#sec-x}\n');
        T.assert(out.html.indexOf('title:') === -1, 'the metadata block is not body content');
        T.assertEqual(out.outline.length, 1);
      });
      s.test('the workspace preview is built from the real generator', function () {
        docProject();
        var p = App.ui.views.reportDesign.buildPreview(App.store.getProject());
        T.assert(p.outline.length > 3, 'the preview must have the document in it');
        T.assert(/Control coverage/.test(p.html));
      });
    });

    T.suite('RD-2 the section editor exposes every part control', function (s) {
      s.test('a custom section opens with its parts, toolbar and escape hint', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: 'costs 50%' });
        App.docStore.addPart(sec, 'table');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-sec-title="sec1"/.test(html), 'the heading box');
        T.assert(/data-rd-text="part1"/.test(html), 'the paragraph box');
        ['b', 'i', 'c', 'br'].forEach(function (t) {
          T.assert(html.indexOf('data-rd-wrap="' + t + '"') !== -1, 'missing rich-text control: ' + t);
        });
        T.assert(/data-rd-ref-open="part1"/.test(html), 'the cross-reference picker');
        T.assert(/Escaped for LaTeX:/.test(html) && /<code>%<\/code>/.test(html), 'the author must see what will be escaped');
        T.assert(/data-rd-cell="part2"/.test(html), 'the table cell editors');
        T.assert(/data-rd-addrow="part2"/.test(html) && /data-rd-addcol="part2"/.test(html));
        T.assert(/data-rd-align="part2"/.test(html), 'per-column alignment');
        ['para', 'table', 'rule', 'pagebreak'].forEach(function (k) {
          T.assert(html.indexOf('data-rd-addpart="' + k + '"') !== -1, 'missing add control: ' + k);
        });
        T.assert(/data-rd-save-template="sec1"/.test(html), 'saving a section as a template');
        App.ui.views.reportDesign.close();
      });
      s.test('the formatting and templates panes are reachable and populated', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('formatting');
        var f = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-fmt-active/.test(f) && /data-rd-fmt-edit/.test(f), 'profile pickers');
        T.assert(/data-rd-fmt="page.marginTop"/.test(f), 'margins');
        T.assert(/data-rd-fmt-bool="headings.numbered"/.test(f), 'numbering switch');
        T.assert(/data-rd-fmt="levels.0.size"/.test(f), 'per-level sizes');
        T.assert(/Standard<\/strong> profile ships with the tool/.test(f), 'the baseline must explain itself');
        App.ui.views.reportDesign.pane('templates');
        var t = App.ui.views.generate.render(App.store.getProject());
        ['sections', 'formats', 'reports'].forEach(function (k) {
          T.assert(t.indexOf('data-rd-import="' + k + '"') !== -1, 'missing import for ' + k);
        });
        T.assert(/data-rd-rpt-save/.test(t), 'saving the whole design');
        App.ui.views.reportDesign.pane('section');
        App.ui.views.reportDesign.close();
      });
    });

    /* ===== SUITES: table column widths (TW-1) ===== */

    /** The fractions PANDOC will read out of a grid table's border row.
     *  Measured against pandoc 3.1.11: column i is (dashes_i + 1) / lineLength. */
    function borderFractions(md) {
      var line = md.split('\n').filter(function (l) { return /^\+[-=:+]+\+$/.test(l); })[0];
      if (!line) return null;
      return line.slice(1, -1).split('+').map(function (s) { return (s.length + 1) / line.length; });
    }
    /** Every row of a grid table must be exactly as wide as its border. */
    function gridAligned(md) {
      var cur = null, ok = true, grids = 0;
      md.split('\n').forEach(function (l) {
        if (/^\+[-=:+]+\+$/.test(l)) { if (cur === null) { grids++; cur = l.length; } else if (l.length !== cur) ok = false; }
        else if (/^\|/.test(l)) { if (cur !== null && l.length !== cur) ok = false; }
        else cur = null;
      });
      return grids > 0 && ok;
    }

