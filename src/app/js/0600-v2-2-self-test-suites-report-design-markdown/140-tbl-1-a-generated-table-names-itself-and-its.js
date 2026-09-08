    T.suite('TBL-1 a generated table names itself, and its groups take no heading', function (s) {
      s.test('a group is a table under the section, not a numbered sub-section', function () {
        docProject();
        var md = reportMd({});
        ['remove', 'disable', 'keep'].forEach(function (g) {
          T.assert(md.indexOf('[]{#tbl-ds-android-packages-' + g + '}') !== -1, 'no table for ' + g);
        });
        T.assert(!/^#+ .*\{#sec-ds-android-packages-(remove|disable|keep)\}/m.test(md),
          'a group must have no heading of its own');
        T.assert(!/^#+ [\d.]* ?(Removed|Disabled|Kept)\b/m.test(md),
          'and its declared name must not be printed as one');
      });

      s.test('the caption no longer carries the group name either', function () {
        docProject();
        var md = reportMd({});
        T.assert(md.indexOf('Packages — Removed') === -1, 'the "— Removed" suffix is gone: ' +
          (md.match(/Table \d+:.*/g) || []).join(' | '));
      });

      s.test('a title row is emitted above the table, and names the caption', function () {
        docProject();
        App.docStore.setTableText('ds:android.packages', 'remove', 'title', 'Packages removed from the build');
        var md = reportMd({});
        var at = md.indexOf('[]{#tbl-ds-android-packages-remove}');
        var block = md.slice(at, at + 700);
        var lines = block.split('\n').filter(function (l) { return /^[+|]/.test(l); });
        /* A REAL merged header row: pandoc reads a grid row whose internal `|` are
         * omitted as a spanning cell and writes it as `\multicolumn` (verified on
         * 3.1.11). So the title is the first of two header rows, above the `=`
         * separator — not a paragraph balanced on top of the table, which is what it
         * was for two rounds and could never be the right width. */
        T.assertEqual(lines[0].split('+').length, 3, 'the first border must have no internal join: ' + lines[0]);
        T.assertEqual(lines[1].split('|').length, 3, 'and the title row must have no internal bar: ' + lines[1]);
        T.assert(lines[1].indexOf('Packages removed from the build') !== -1, 'no title text');
        T.assert(lines[2].split('+').length > 2, 'the column border comes next: ' + lines[2]);
        T.assert(/^\+:?=/.test(lines[4]), 'and both rows are above the header separator: ' + lines[4]);
        // With the group names gone, three tables in one section would otherwise share a
        // caption. The title row is the operator's name for THIS table, so it is the one.
        T.assert(/Table \d+: Packages removed from the build/.test(md), 'the caption must follow the title row');
      });

      /* TBL-2: adding a title row must not re-proportion the table.
       *
       * A grid table's fractions are read against max(line length, --columns), so a
       * table drawn narrower than 72 characters lands on the page at that fraction of
       * it — three columns at 0.14/0.13/0.17 rather than at their share of the text
       * block. A title row forces the grid form, so it was turning an ordinary table
       * into a squeezed one 43% of the width of the page. */
      s.test('a title row does not shrink the table it names', function () {
        var H = ['Package', 'Action', 'Rationale'], R = [['`com.a`', 'remove', 'because']];
        function fracs(md) {
          var border = md.split('\n').filter(function (l) { return /^\+/.test(l) && l.split('+').length > 3; })[0];
          return App.ui.mdPreview.gridWidths(border);
        }
        var titled = MD.table(H, R, { titleRow: 'Packages removed' });
        var f = fracs(titled);
        var sum = f.reduce(function (a, w) { return a + w; }, 0);
        T.assert(sum > 0.97, 'the columns must add up to the page, not to a fraction of it: ' + sum);
        var line = titled.split('\n').filter(function (l) { return /^\+/.test(l); })[0].length;
        T.assert(line > 72, 'and the source must be wider than pandoc\'s --columns, or the ' +
          'fractions are measured against that instead: ' + line);
        // The preview reads the same border, so it has to find it past the title's own.
        var cols = App.ui.mdPreview.toHtml(titled).html;
        T.assert(/<colgroup>/.test(cols), 'the preview must keep the widths too: ' + cols.slice(0, 200));
      });

      s.test('a table that needs no title row is still left to LaTeX', function () {
        // Small and single-line: the pipe form, where LaTeX sizes each column to its
        // content. Widening THAT would make every small table fill the page.
        var pipe = MD.table(['A', 'B'], [['x', 'y']], {});
        T.assert(/^\|/.test(pipe), 'a small table stays a pipe table: ' + pipe);
      });

      s.test('a caption of its own overrides the title row', function () {
        docProject();
        App.docStore.setTableText('ds:android.packages', 'remove', 'title', 'Removed');
        App.docStore.setTableText('ds:android.packages', 'remove', 'caption', 'Packages uninstalled for user 0');
        T.assert(/Table \d+: Packages uninstalled for user 0/.test(reportMd({})), 'the explicit caption wins');
      });

      s.test('a column heading is reworded per table, not per section', function () {
        docProject();
        App.docStore.setTableColumnLabel('ds:android.packages', 'remove', '_key', 'Package removed');
        var md = reportMd({});
        var rm = md.slice(md.indexOf('[]{#tbl-ds-android-packages-remove}'));
        rm = rm.slice(0, rm.indexOf('[]{#tbl-ds-android-packages-disable}'));
        T.assert(/\| Package removed \|/.test(rm), 'the reworded heading must be on the table it was set on: ' + rm.slice(0, 200));
        var kp = md.slice(md.indexOf('[]{#tbl-ds-android-packages-keep}'));
        T.assert(/\| Package \|/.test(kp) && kp.indexOf('Package removed') === -1,
          'and the next table keeps the adapter\'s own: ' + kp.slice(0, 200));
      });

      s.test('the wording is stored as absence when blank, and travels in a template', function () {
        docProject();
        App.docStore.setTableText('ds:android.packages', 'remove', 'title', 'X');
        var ser = App.projectIo.serializeProject(App.store.getProject());
        T.assert(ser.indexOf('"tables"') !== -1, 'it must persist');
        T.assertEqual(App.projectIo.parseProject(ser).ok, true, 'and the schema must accept it');
        T.assertEqual(App.projectIo.serializeProject(App.projectIo.parseProject(ser).value), ser, 'round-trip');
        App.docStore.saveReportTemplate('House');
        App.docStore.setTableText('ds:android.packages', 'remove', 'title', '');
        T.assertEqual((App.store.getProject().report || {}).tables, undefined, 'blank leaves no trace');
        App.docStore.useReportTemplate('rpt1');
        T.assertEqual(App.store.getProject().report.tables['ds:android.packages'].remove.title, 'X',
          'and a template carries it');
      });

      s.test('the preview reads the merged row back out of the grid', function () {
        var md = MD.table(['A', 'B'], [['x', 'y']], { titleRow: 'Packages removed', caption: { id: 't', text: 'Cap' } });
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/<tr class="prv-tbltitle"><th colspan="2">Packages removed<\/th><\/tr>/.test(html),
          'the spanning row: ' + html);
        // Every row above the `=` separator is a header row; reading only the last left
        // the title standing in as the header and the headings as a body row.
        T.assert(/<th>A<\/th><th>B<\/th>/.test(html), 'and the column headings are still the header: ' + html);
        T.assert(!/<td>A<\/td>/.test(html), 'not a body row');
      });

      s.test('D-050: the title needs no LaTeX of its own, because it is a row', function () {
        /* Reported as "a big grey box", then as still detached, then as "just centred
         * text above the table, not an additional merged table row". Each attempt was a
         * PARAGRAPH dressed up as a row, and a paragraph has to be given a width — which
         * a table's is not, until it is typeset.
         *
         * Pandoc can express the real thing: a grid-table row whose internal `|` are
         * omitted is a spanning cell, and it writes it as `\multicolumn` (verified on
         * 3.1.11 through `-t native` and through a built page). So there is nothing left
         * for the preamble to do — no macros, no box, no glue to cancel — and nothing
         * left to get the width of wrong.
         */
        var pre = App.docFormat.preamble(App.docFormat.standard());
        T.assert(pre.indexOf('chTblTitle') === -1, 'no title machinery survives in the preamble: ' +
          (pre.match(/.*chTblTitle.*/) || ''));
        var md = MD.table(['A', 'B', 'C'].map(MD.cell), [['x', 'y', 'z'].map(MD.cell)],
          { titleRow: MD.text('Packages removed') });
        T.assert(md.indexOf('```{=latex}') === -1, 'and none in the document: ' + md);
        T.assert(/^\+-+\+$/m.test(md.split('\n')[0]), 'the table simply opens with a spanning border: ' + md);
      });

    });

    T.suite('SEC-4 a section can start a page, or stay out of the contents', function (s) {
      s.test('a page break is emitted before the heading, not inside the body', function () {
        docProject();
        // H2, because the shipped profile already starts a page at H1 — see the next test.
        App.docStore.setBlockLevel('control', 2);
        App.docStore.setBlockFlag('pageBreak', 'control', true);
        var md = reportMd({});
        T.assert(/\\newpage\n```\n\n## [\d.]+ Control coverage/.test(md),
          'the break must precede the heading: ' + (md.match(/[\s\S]{80}## [\d.]+ Control coverage/) || ''));
        App.docStore.setBlockFlag('pageBreak', 'control', false);
        T.assert(!/\\newpage\n```\n\n## [\d.]+ Control coverage/.test(reportMd({})), 'and off leaves none');
      });

      s.test('a level that already starts a page does not get a second break', function () {
        /* The profile's per-LEVEL page break reaches the page as titlesec's
         * `\sectionbreak`, which this module cannot see. Emitting a `\newpage` as well
         * gave two breaks and therefore a BLANK PAGE between them — the same fault
         * D-038 was about, from the other direction. The shipped profile starts a page
         * at H1, so an H1 section asking for one again is asking for what it has. */
        docProject();
        App.docStore.setBlockLevel('control', 1);
        App.docStore.setBlockFlag('pageBreak', 'control', true);
        var md = reportMd({});
        T.assert(!/\\newpage\n```\n\n# \d+ Control coverage/.test(md),
          'no second break: ' + (md.match(/[\s\S]{80}# \d+ Control coverage/) || ''));
        T.assertEqual(App.docFormat.levelBreaks(App.docFormat.standard())[1], true,
          'and the level is what is doing it');
        T.assertEqual(App.docFormat.levelBreaks(App.docFormat.standard())[2], undefined,
          'while H2 is not');
      });

      s.test('a section left out of the contents keeps its heading and its number', function () {
        docProject();
        App.docStore.setBlockFlag('noToc', 'meta', true);
        var md = reportMd({});
        /* D-063: the PAIR. `.unlisted` alone is not read by pandoc — it comes out as a
         * plain `\section`, which lists itself — so this test used to assert exactly the
         * thing that did not work. What the switch actually has to preserve is the
         * NUMBER, and that is asserted on the printed heading rather than on the class:
         * this document's numbers are written into the heading text, so `.unnumbered`
         * costs nothing but the `\addcontentsline`. */
        T.assert(/^# \d+ Device Config Information \{#sec-meta \.unnumbered \.unlisted\}$/m.test(md),
          'the pair, still numbered, still anchored: ' + (md.match(/^# .*Device Config.*$/m) || ''));
        T.assert(/^numbersections: false$/m.test(md),
          'which is only true while LaTeX is not numbering anything itself');
        var listed = md.match(/^# .*Control coverage.*$/m)[0];
        T.assertEqual(listed.indexOf('.unlisted'), -1, 'a section that IS listed carries neither class');
        T.assertEqual(listed.indexOf('.unnumbered'), -1);
      });

      s.test('D-063 a Title-level block obeys it too, and pandoc is given the pair it reads', function () {
        /* The report was "the checkbox does nothing for my Title block", and it was doing
         * nothing for every block — the preview builds its own contents list and honoured
         * it, so only the PDF ever showed the fault. Locked at the class level here and on
         * a built page in the reference document. */
        docProject();
        var t = App.docStore.addSection('Cover page').id;
        App.docStore.setBlockLevel(t, DOC.TITLE_LEVEL);
        App.docStore.setBlockFlag('noToc', t, true);
        App.store.setReportOrder([t, 'toc', 'meta']);
        var md = reportMd({});
        T.assert(/^# Cover page \{#sec-\S+ \.unnumbered \.unlisted\}$/m.test(md),
          'a title takes the pair like any other block: ' + (md.match(/^# Cover page.*$/m) || ''));
        // TTL-1 still holds: a title carries no number, and gives none away.
        T.assert(/^# 1 Device Config Information/m.test(md), 'the block after it is still number 1');
        // And the styling macros still surround it, so it is still a TITLE on the page.
        T.assert(md.indexOf('\\chTitleStyle') < md.indexOf('# Cover page'), 'styled as a title');
      });

      s.test('the preview\'s contents list agrees about which are listed', function () {
        docProject();
        App.docStore.setBlockFlag('noToc', 'meta', true);
        var p = App.ui.mdPreview.toHtml(reportMd({}));
        var toc = p.html.slice(p.html.indexOf('prv-toc'));
        toc = toc.slice(0, toc.indexOf('</div></div>') + 12);
        T.assert(toc.indexOf('Device Config Information') === -1, 'the unlisted section must not be listed');
        T.assert(toc.indexOf('Control coverage') !== -1, 'while the rest still are');
        T.assert(p.outline.some(function (o) { return o.title === 'Device Config Information'; }),
          'but the navigation rail still reaches it — it is in the document');
      });

      s.test('both are stored as absence, and travel in a report template', function () {
        docProject();
        App.docStore.setBlockFlag('pageBreak', 'control', true);
        App.docStore.setBlockFlag('noToc', 'meta', true);
        var ser = App.projectIo.serializeProject(App.store.getProject());
        T.assertEqual(App.projectIo.parseProject(ser).ok, true, 'the schema must accept them');
        App.docStore.saveReportTemplate('House');
        App.docStore.setBlockFlag('pageBreak', 'control', false);
        App.docStore.setBlockFlag('noToc', 'meta', false);
        T.assertEqual((App.store.getProject().report || {}).pageBreak, undefined, 'off leaves no trace');
        T.assertEqual((App.store.getProject().report || {}).noToc, undefined);
        App.docStore.useReportTemplate('rpt1');
        T.assertEqual(App.store.getProject().report.pageBreak.control, true, 'and a template carries them');
        T.assertEqual(App.store.getProject().report.noToc.meta, true);
      });
    });

