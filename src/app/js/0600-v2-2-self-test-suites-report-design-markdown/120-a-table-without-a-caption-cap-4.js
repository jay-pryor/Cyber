    /* ===== SUITES: a table without a caption (CAP-4) ===== */

    T.suite('CAP-4 a table can be left uncaptioned', function (s) {
      function captions(md) { return (md.match(/^Table [\d.]+: .*$/gm) || []); }

      s.test('a generated table drops its caption and its number', function () {
        docProject();
        var before = captions(reportMd({}));
        T.assert(before.length > 3, 'expected several captions to start with');
        App.docStore.setTableNoCaption('ds:android.packages', 'remove', true);
        var after = captions(reportMd({}));
        T.assertEqual(after.length, before.length - 1, 'exactly one caption must go');
        // D-019's rule, still holding: the numbers a reader counts have to be the numbers
        // a cross-reference names, so the remaining tables close the gap rather than
        // leaving a hole where the uncaptioned one was.
        T.assertDeepEqual(after.map(function (c) { return (/^Table (\d+):/.exec(c) || [])[1]; }),
          after.map(function (_, i) { return String(i + 1); }), 'the numbers must run 1..n with no gap');
      });

      s.test('the anchor goes with it, so nothing links to a table with no number', function () {
        docProject();
        App.docStore.setTableNoCaption('ds:android.packages', 'remove', true);
        var md = reportMd({});
        T.assert(md.indexOf('[]{#tbl-ds-android-packages-remove}') === -1,
          'an uncaptioned table must not carry a cross-reference target');
        T.assert(md.indexOf('[]{#tbl-ds-android-packages-disable}') !== -1,
          'while its captioned neighbours keep theirs');
      });

      s.test('the table itself is untouched', function () {
        docProject();
        App.docStore.setTableNoCaption('ds:android.packages', 'remove', true);
        var md = reportMd({});
        T.assert(/\| `com\.a`/.test(md) || md.indexOf('com.a') !== -1, 'the rows must still be there');
      });

      s.test('a hand-authored table takes the same option', function () {
        docProject();
        var sec = App.docStore.addSection('Layout').id;
        App.docStore.addPart(sec, 'table');
        var part = App.store.getProject().report.sections[0].parts[0];
        App.docStore.setCell(sec, part.id, 0, 0, 'Alpha');
        var withCap = reportMd({});
        T.assert(withCap.indexOf('[]{#tbl-' + part.id + '}') !== -1, 'captioned by default (CAP-1)');
        App.docStore.updatePart(sec, part.id, { noCaption: true });
        var without = reportMd({});
        T.assert(without.indexOf('[]{#tbl-' + part.id + '}') === -1, 'and uncaptioned when asked');
        T.assertEqual(captions(without).length, captions(withCap).length - 1, 'one fewer caption');
      });

      s.test('off is absence, so turning it on and off again leaves no trace', function () {
        docProject();
        // `report` alone, because a commit also stamps meta.modifiedUtc — which is a
        // record of when the file was written, not of what is in it.
        function report() { return JSON.stringify((App.store.getProject().report || {}).tables || null); }
        var clean = report();
        App.docStore.setTableNoCaption('ds:android.packages', 'remove', true);
        T.assert(report() !== clean, 'switching it on must change the file');
        App.docStore.setTableNoCaption('ds:android.packages', 'remove', false);
        T.assertEqual(report(), clean,
          'a switched-off option must serialise identically to one never touched (DOD-7)');
      });

      s.test('both editors offer it', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        App.ui.views.reportDesign.pane('section');
        var pl = App.registry.getPlatform('android-adb');
        var gen = App.ui.views.reportDesign.render(App.store.getProject(), pl);
        T.assert(/data-rd-tbl-nocap/.test(gen), 'the generated section needs the tick');
        var sec = App.docStore.addSection('Layout').id;
        App.docStore.addPart(sec, 'table');
        App.ui.views.reportDesign.select(sec);
        var hand = App.ui.views.reportDesign.render(App.store.getProject(), pl);
        T.assert(/data-rd-part-flag="noCaption"/.test(hand), 'and so does the hand-authored one');
      });
    });

    /* ===== SUITES: two sections retired, one Fonts table, a title of its own
                     (SEC-3 · NAM-3 · FNT-3 · TTL-3) ===== */

    T.suite('SEC-3 the report no longer describes its own composition', function (s) {
      function ids() {
        return App.generate.reportBlocks(App.store.getProject(), App.registry.getPlatform('android-adb'), {})
          .map(function (b) { return b.id; });
      }
      s.test('neither section is a candidate block any more', function () {
        docProject();
        var list = ids();
        T.assertEqual(list.indexOf('composition'), -1, 'About this report is gone: ' + list.join(','));
        T.assertEqual(list.indexOf('deviations'), -1, 'Deviations from default is gone: ' + list.join(','));
      });
      s.test('and neither reaches the document', function () {
        docProject();
        var md = reportMd({});
        T.assertEqual(md.indexOf('About this report'), -1, 'the heading must be gone');
        T.assertEqual(md.indexOf('Deviations from default'), -1, 'and so must the other');
        T.assertEqual(md.indexOf('| Section | Status |'), -1, 'and the composition table with them');
      });
      /* A project saved while those sections existed still names them in its
       * arrangement. An id in the order that no longer resolves has always been
       * ignored rather than honoured (applySectionOrder), which is exactly what makes
       * retiring a section safe for a file written before it was retired. */
      s.test('a project that still names them in its saved order opens and generates', function () {
        docProject();
        App.store.setReportOrder(['composition', 'deviations', 'meta']);
        var round = App.projectIo.parseProject(App.projectIo.serializeProject(App.store.getProject()));
        T.assert(round.ok, JSON.stringify(round.issues));
        var list = ids();
        T.assertEqual(list[0], 'meta', 'the stale ids rank ahead of nothing: ' + list.join(','));
        T.assert(reportMd({}).indexOf('{#sec-meta}') !== -1, 'and the document still builds');
      });
    });

    T.suite('NAM-3 heading, then name, whoever wrote the section', function (s) {
      function paneHtml(id) {
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(id);
        var html = App.ui.views.generate.render(App.store.getProject());
        App.ui.views.reportDesign.close();
        return html;
      }
      s.test('a generated section asks for the heading first', function () {
        docProject();
        var html = paneHtml('ds:android.packages');
        var head = html.indexOf('data-rd-sec-heading="ds:android.packages"');
        var name = html.indexOf('data-rd-sec-name="ds:android.packages"');
        T.assert(head !== -1 && name !== -1, 'both boxes must be there');
        T.assert(head < name, 'the heading box must come first');
      });
      s.test('a hand-authored section is in the same order, as it always was', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        var html = paneHtml(sec);
        var head = html.indexOf('data-rd-sec-title="' + sec + '"');
        var name = html.indexOf('data-rd-sec-name="' + sec + '"');
        T.assert(head !== -1 && name !== -1, 'both boxes must be there');
        T.assert(head < name, 'the heading box must come first');
      });
    });

    T.suite('FNT-3 every size in the document, in one table', function (s) {
      function fmtHtml() {
        docProject();
        // The built-in profile renders disabled, so the ticks and boxes are read off a
        // copy — which is the only thing that is editable anyway.
        App.docStore.addFormat('House', App.docFormat.standard());
        App.docStore.setFormatId('fmt1');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('formatting');
        var html = App.ui.views.generate.render(App.store.getProject());
        App.ui.views.reportDesign.close();
        return html;
      }
      s.test('the fieldset is Fonts, and it holds the four non-heading rows', function () {
        var html = fmtHtml();
        T.assert(/<strong>Fonts<\/strong>/.test(html), 'the fieldset must be named Fonts');
        T.assert(/<th>Regular<\/th>/.test(html), 'the document’s own size needs a row');
        T.assert(/<th>Table text<\/th>/.test(html) && /<th>Table headers<\/th>/.test(html), 'and both table sizes');
        // FNT-4: a caption is a kind of text like the other three, and was the only one
        // with no row — so its size could not be set at all.
        T.assert(/<th>Table captions<\/th>/.test(html), 'and the caption');
        ['page.fontSize', 'tables.fontSize', 'tables.headFontSize', 'tables.captionFontSize'].forEach(function (k) {
          T.assertEqual(html.split('data-rd-fmt="' + k + '"').length - 1, 1,
            k + ' must be editable in exactly one place');
        });
      });
      s.test('FNT-4: every text row can be set bold and italic', function () {
        var html = fmtHtml();
        function cellsOf(label) {
          var row = new RegExp('<tr><th>' + label + '</th>(.*?)</tr>').exec(html);
          T.assert(row, 'no ' + label + ' row: ' + html.slice(html.indexOf('<strong>Fonts'), 400));
          return row[1].split('</td>').filter(function (c) { return c.indexOf('<td>') !== -1; });
        }
        // Bold and italic used to be greyed out on all four rows, which said "body text
        // cannot be bold" — untrue of every one of them.
        [['Regular', 'page.fontSize', 'page.bold', 'page.italic'],
          ['Table text', 'tables.fontSize', 'tables.bold', 'tables.italic'],
          ['Table headers', 'tables.headFontSize', 'tables.headBold', 'tables.headItalic'],
          ['Table captions', 'tables.captionFontSize', 'tables.captionBold', 'tables.captionItalic']]
          .forEach(function (r) {
            var cells = cellsOf(r[0]);
            T.assertEqual(cells.length, 7, r[0] + ' must keep the full width of the table');
            T.assert(cells[0].indexOf('data-rd-fmt="' + r[1] + '"') !== -1, r[0] + '’s size must be the live cell');
            T.assert(cells[2].indexOf('data-rd-fmt-bool="' + r[2] + '"') !== -1, r[0] + ' bold must be editable: ' + cells[2]);
            T.assert(cells[3].indexOf('data-rd-fmt-bool="' + r[3] + '"') !== -1, r[0] + ' italic must be editable: ' + cells[3]);
            // What genuinely has no meaning for a run of body text is still greyed, so
            // the row keeps saying which settings belong to headings.
            [1, 4, 5, 6].forEach(function (i) {
              T.assert(/ disabled/.test(cells[i]), r[0] + ' cell ' + (i + 1) + ' must be greyed out: ' + cells[i]);
              T.assert(cells[i].indexOf('data-rd-fmt') === -1, 'and must write nothing: ' + cells[i]);
            });
          });
      });
      s.test('FNT-5: the table\'s first column has a row of its own', function () {
        var html = fmtHtml();
        T.assert(/<th>Table first column<\/th>/.test(html), 'the row must be in the Fonts table: ' +
          html.slice(html.indexOf('<strong>Fonts'), html.indexOf('<strong>Fonts') + 400));
        var row = /<tr><th>Table first column<\/th>(.*?)<\/tr>/.exec(html);
        var cells = row[1].split('</td>').filter(function (c) { return c.indexOf('<td>') !== -1; });
        T.assertEqual(cells.length, 7, 'it keeps the full width of the table');
        T.assert(cells[2].indexOf('data-rd-fmt-bool="tables.firstColBold"') !== -1, 'bold must be editable: ' + cells[2]);
        T.assert(cells[3].indexOf('data-rd-fmt-bool="tables.firstColItalic"') !== -1, 'italic must be editable: ' + cells[3]);
        // FNT-6: and a size, which it had none of. The emphasis travels as markdown on
        // the cell and markdown cannot carry a size; a LaTeX macro can.
        T.assert(cells[0].indexOf('data-rd-fmt="tables.firstColFontSize"') !== -1,
          'the size cell must be live: ' + cells[0]);
        T.assert(!/ disabled/.test(cells[0]), 'and not greyed: ' + cells[0]);
      });

      s.test('FNT-5: the Tables fieldset no longer offers a second first-column weight', function () {
        var html = fmtHtml();
        var tables = html.slice(html.indexOf('<strong>Tables</strong>'));
        T.assert(tables.indexOf('data-rd-fmt-bool="tables.firstColumn.bold"') === -1,
          'two switches saying "bold" is how a document ends up with two kinds of first column');
        T.assert(tables.indexOf('data-rd-fmt="tables.firstColumn.shade"') !== -1,
          'what opting in buys — the shade — stays here');
      });

      /* The Tables fieldset is the SHADE and nothing else now.
       *
       * Its Bold and Italic columns had been empty since FNT-4/FNT-5 moved both weights
       * to the Fonts table — two dead columns carrying a note about where the setting
       * really lives, in every profile anybody opens. */
      s.test('the Tables fieldset has no Bold or Italic column left', function () {
        var html = fmtHtml();
        var tables = html.slice(html.indexOf('<strong>Tables</strong>'));
        var head = /<thead><tr>(.*?)<\/tr><\/thead>/.exec(tables);
        T.assert(head, 'the styling table must still have a header: ' + tables.slice(0, 300));
        T.assertDeepEqual(head[1].split('</th>').filter(function (c) { return c.indexOf('<th>') !== -1; })
          .map(function (c) { return c.replace(/.*<th>/, ''); }), ['Part', 'Shade', '']);
        T.assert(tables.indexOf('set in <strong>Fonts</strong>, above') === -1,
          'and no column explaining why it is empty');
      });

      s.test('a heading row is still fully editable', function () {
        var html = fmtHtml();
        var row = /<tr><th>H1<\/th>(.*?)<\/tr>/.exec(html);
        T.assert(row, 'no H1 row');
        T.assert(row[1].indexOf('disabled') === -1, 'nothing on a heading row is greyed: ' + row[1]);
        T.assert(/data-rd-fmt-bool="levels\.1\.pageBreakBefore"/.test(row[1]), 'including its New page tick');
      });
    });

    T.suite('TTL-3 a title is styled as a title, not as an H1', function (s) {
      s.test('the profile carries a row for it, ahead of the headings', function () {
        var f = App.docFormat.standard();
        T.assertEqual(f.levels[0].level, DOC.TITLE_LEVEL, 'the title row leads the list');
        T.assertEqual(f.levels[1].level, 1);
        T.assertEqual(f.levels.length, 5);
      });
      /* The two modules cannot share the constant — App.docFormat loads before App.doc
       * (spec §14) — so this is the lock that keeps them agreeing. */
      s.test('the styling row and the outline level are the same number', function () {
        T.assertEqual(App.docFormat.standard().levels[0].level, App.doc.TITLE_LEVEL);
      });
      s.test('a profile written before the row existed inherits its own H1', function () {
        var f = App.docFormat.normalise({ id: 'old', name: 'Old', levels: [
          { level: 1, size: 33, leading: 40, bold: false, italic: true, spaceBefore: 7, spaceAfter: 3, pageBreakBefore: false }
        ] });
        T.assertEqual(f.levels[0].level, 0, 'the row is filled in');
        T.assertEqual(f.levels[0].size, 33, 'from the H1 it was being drawn as');
        T.assertEqual(f.levels[0].italic, true);
        T.assertEqual(f.levels[1].size, 33, 'and H1 itself is untouched');
      });
      s.test('it compiles to a macro the body switches on, not a second \\titleformat', function () {
        var pre = App.docFormat.preamble(App.docFormat.normalise({ id: 'p', name: 'P', levels: [
          { level: 0, size: 30, leading: 34, bold: true, italic: false, spaceBefore: 0, spaceAfter: 12, pageBreakBefore: true },
          { level: 1, size: 18, leading: 22, bold: true, italic: false, spaceBefore: 0, spaceAfter: 10, pageBreakBefore: false }
        ] }));
        T.assert(/\\newcommand\{\\chTitleStyle\}\{\\titleformat\{\\section\}\{[^}]*30pt/.test(pre),
          'the title macro must carry its own size: ' + (pre.match(/\\newcommand\{\\chTitleStyle\}.*/) || ''));
        T.assert(/\\newcommand\{\\chSectionStyle\}\{\\titleformat\{\\section\}\{[^}]*18pt/.test(pre),
          'and its counterpart H1’s: ' + (pre.match(/\\newcommand\{\\chSectionStyle\}.*/) || ''));
        T.assert(/\\newcommand\{\\chTitleStyle\}\{[^\n]*\\def\\sectionbreak\{\\clearpage\}/.test(pre),
          'a title that starts a page says so in the macro, not in \\sectionbreak');
        T.assert(/\\newcommand\{\\chSectionStyle\}\{[^\n]*\\def\\sectionbreak\{\}/.test(pre),
          'and the restore puts it back to what H1 asked for');
        // The title is not a sectioning command, so nothing may declare one for it.
        T.assert(pre.indexOf('\\titleformat{\\section0}') === -1 && !/\\section0break/.test(pre));
      });
      s.test('the preview draws it as a title, and never shows the machinery', function () {
        docProject();
        App.docStore.setBlockLevel('meta', DOC.TITLE_LEVEL);
        var p = App.ui.mdPreview.toHtml(reportMd({}));
        T.assert(/<h1 id="sec-meta" class="prv-h prv-title">/.test(p.html),
          'the title heading must wear prv-title: ' + (p.html.match(/<h1[^>]*>/g) || []).join(' '));
        T.assert(p.html.indexOf('chTitleStyle') === -1 && p.html.indexOf('chSectionStyle') === -1,
          'the macros are machinery, never shown');
        // Every other heading is unaffected.
        T.assert(/class="prv-h prv-h1"/.test(p.html), 'an ordinary H1 still reads as one');
      });
      s.test('its size reaches the preview stylesheet on its own rule', function () {
        var css = App.docFormat.previewCss(App.docFormat.normalise({ id: 'p', name: 'P', levels: [
          { level: 0, size: 30, leading: 34, bold: true, italic: false, spaceBefore: 0, spaceAfter: 12 },
          { level: 1, size: 18, leading: 22, bold: true, italic: false, spaceBefore: 0, spaceAfter: 10 }
        ] }));
        T.assert(/\.rd-paper \.prv-title \{[^}]*font-size: 40px/.test(css), 'the title rule: ' + css);
        T.assert(/\.rd-paper \.prv-h1 \{[^}]*font-size: 24px/.test(css), 'and H1 keeps its own');
        T.assert(css.indexOf('.prv-h0') === -1, 'there is no such thing as an H0');
      });
      s.test('the workspace offers the row, labelled as a title', function () {
        docProject();
        App.docStore.addFormat('House', App.docFormat.standard());
        App.docStore.setFormatId('fmt1');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('formatting');
        var html = App.ui.views.generate.render(App.store.getProject());
        App.ui.views.reportDesign.close();
        T.assert(/<tr><th>Title<\/th>/.test(html), 'the row must be named Title, not H0');
        T.assert(/data-rd-fmt="levels\.0\.size"/.test(html), 'and be editable');
      });
    });

