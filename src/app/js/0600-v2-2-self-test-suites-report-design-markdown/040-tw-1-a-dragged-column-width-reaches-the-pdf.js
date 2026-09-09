    T.suite('TW-1 a dragged column width reaches the PDF', function (s) {
      var HEAD = ['A', 'B', 'C'], ROWS = [['one', 'two', 'three']];

      s.test('fractions produce proportional dash counts', function () {
        var md = MD.table(HEAD, ROWS, { widths: [0.6, 0.2, 0.2] });
        var f = borderFractions(md);
        T.assert(f && f.length === 3, 'expected a three-column grid border: ' + md);
        // Within a character's worth of rounding of what was asked for.
        T.assert(Math.abs(f[0] - 0.6) < 0.02, 'column 1 should be ~60%, got ' + f[0].toFixed(3));
        T.assert(Math.abs(f[1] - 0.2) < 0.02, 'column 2 should be ~20%, got ' + f[1].toFixed(3));
        T.assert(Math.abs(f[2] - 0.2) < 0.02, 'column 3 should be ~20%, got ' + f[2].toFixed(3));
        // The whole point: 60/20/20 in, a THREE-times-wider first column out.
        T.assert(f[0] / f[1] > 2.5 && f[0] / f[1] < 3.5, 'ratio should be about 3:1, got ' + (f[0] / f[1]).toFixed(2));
      });

      s.test('a different set of fractions moves the border, not just the data', function () {
        var wide = borderFractions(MD.table(HEAD, ROWS, { widths: [0.6, 0.2, 0.2] }));
        var even = borderFractions(MD.table(HEAD, ROWS, { widths: [1 / 3, 1 / 3, 1 / 3] }));
        T.assert(wide[0] > even[0] + 0.2, 'a 60% column must be visibly wider than a 33% one');
      });

      s.test('content wraps into its column rather than overflowing it', function () {
        var long = 'The Bluetooth stack package cannot be uninstalled on this firmware build, so it is disabled for user 0 instead.';
        var md = MD.table(HEAD, [[MD.cell(long), 'x', 'y']], { widths: [0.6, 0.2, 0.2] });
        T.assert(gridAligned(md), 'every row must line up with the border:\n' + md);
        var f = borderFractions(md);
        T.assert(Math.abs(f[0] - 0.6) < 0.02, 'long content must not widen the column: ' + f[0].toFixed(3));
        T.assert(md.split('\n').filter(function (l) { return /^\|/.test(l); }).length >= 3, 'the long cell should wrap over several lines');
        // Wrapped, not truncated — every word of the original survives.
        var flat = md.split('\n').filter(function (l) { return /^\|/.test(l); }).slice(1)   // drop the header row
          .map(function (l) { return l.slice(1, -1).split('|')[0]; }).join(' ').replace(/\s+/g, ' ').trim();
        T.assertEqual(flat, long);
      });

      s.test('an unbreakable run is hard-broken rather than allowed to overflow', function () {
        var runOn = new Array(60).join('x');
        var lines = MD.wrapLine(runOn, 10);
        T.assert(lines.every(function (l) { return l.length <= 10; }), 'a hard break must respect the width: ' + JSON.stringify(lines));
        T.assertEqual(lines.join(''), runOn);
      });

      s.test('a wrap never splits a backslash escape in two', function () {
        // `\_` is one unit after MD.text; broken apart, the `_` would be free to start
        // emphasis on the next line and eat the rest of the cell.
        var lines = MD.wrapLine(MD.text('aaaaaaaa_bbbbbbbb'), 9);
        lines.forEach(function (l) {
          var trail = /(\\+)$/.exec(l);
          T.assert(!trail || trail[1].length % 2 === 0, 'a line ended mid-escape: ' + JSON.stringify(lines));
        });
      });

      s.test('a table with widths is NEVER emitted as a pipe table', function () {
        // Single-line content everywhere — the one case that would otherwise choose the
        // pipe form, which carries no widths at all.
        var md = MD.table(HEAD, ROWS, { widths: [0.5, 0.25, 0.25] });
        T.assert(/^\+/.test(md), 'must open with a grid border, got: ' + md.split('\n')[0]);
        T.assert(md.indexOf('| --- |') === -1, 'a pipe separator means the widths were lost');
      });

      s.test('no widths keeps the old behaviour exactly', function () {
        T.assertEqual(MD.table(HEAD, ROWS, {}), MD.pipeTable(HEAD, ROWS, {}));
      });

      s.test('alignment markers stay on the header separator alone', function () {
        // pandoc 3.1.11 silently DROPS every body row when a `-` border carries a `:`.
        var md = MD.table(HEAD, ROWS, { widths: [0.6, 0.2, 0.2], align: ['l', 'c', 'r'] });
        md.split('\n').forEach(function (l) {
          if (/^\+-/.test(l) || /^\+:-/.test(l)) T.assert(l.indexOf(':') === -1, 'a dash border must carry no alignment marker: ' + l);
        });
        T.assert(md.split('\n').some(function (l) { return /^\+:=+/.test(l); }), 'the header separator must carry the alignment');
      });

      s.test('setWidth stores fractions that sum to 1, and renormalises the rest', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.addColumn(sec, 'part1');                       // 3 columns
        T.assertEqual(App.docStore.setWidth(sec, 'part1', 0, 0.6).ok, true);
        var w = App.store.getProject().report.sections[0].parts[0].widths;
        T.assertEqual(w.length, 3);
        T.assert(Math.abs(w[0] - 0.6) < 1e-6, 'the dragged column takes what it was given: ' + w[0]);
        T.assert(Math.abs(w[0] + w[1] + w[2] - 1) < 1e-6, 'widths must sum to 1: ' + JSON.stringify(w));
        T.assert(Math.abs(w[1] - w[2]) < 1e-6, 'the others keep their relative proportions');
      });

      s.test('a column cannot be dragged to nothing, or to the whole table', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.setWidth(sec, 'part1', 0, 0);
        var w = App.store.getProject().report.sections[0].parts[0].widths;
        T.assert(w[0] >= 0.049 && w[1] >= 0.049, 'no column may be squeezed to zero: ' + JSON.stringify(w));
        App.docStore.setWidth(sec, 'part1', 0, 5);
        w = App.store.getProject().report.sections[0].parts[0].widths;
        T.assert(w[1] >= 0.049, 'nor may one take the whole table: ' + JSON.stringify(w));
      });

      s.test('add/remove column keeps the widths one-per-column', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.setWidth(sec, 'part1', 0, 0.7);
        App.docStore.addColumn(sec, 'part1');
        var t = App.store.getProject().report.sections[0].parts[0];
        T.assertEqual(t.widths.length, t.header.length);
        T.assert(Math.abs(t.widths.reduce(function (a, x) { return a + x; }, 0) - 1) < 1e-6, 'still sums to 1 after add');
        App.docStore.removeColumn(sec, 'part1', 1);
        t = App.store.getProject().report.sections[0].parts[0];
        T.assertEqual(t.widths.length, t.header.length);
        T.assert(Math.abs(t.widths.reduce(function (a, x) { return a + x; }, 0) - 1) < 1e-6, 'still sums to 1 after remove');
      });

      s.test('a table with no widths gains none from add/remove column', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.addColumn(sec, 'part1');
        App.docStore.removeColumn(sec, 'part1', 0);
        T.assertEqual(App.store.getProject().report.sections[0].parts[0].widths, undefined);
      });

      s.test('widths round-trip through the project file, and clear back to absent', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.addColumn(sec, 'part1');
        App.docStore.setWidth(sec, 'part1', 0, 0.6);
        App.docStore.setWidth(sec, 'part1', 1, 0.2);
        var s1 = App.projectIo.serializeProject(App.store.getProject());
        var r = App.projectIo.parseProject(s1);
        T.assertEqual(r.ok, true, 'reparse failed: ' + JSON.stringify(r.issues));
        T.assertEqual(App.projectIo.serializeProject(r.value), s1, 'serialize is not idempotent');
        var w = r.value.report.sections[0].parts[0].widths;
        T.assert(Math.abs(w[0] - 0.6) < 0.001 && Math.abs(w[1] - 0.2) < 0.001, 'widths lost in the round trip: ' + JSON.stringify(w));
        App.docStore.clearWidths(sec, 'part1');
        T.assert(App.projectIo.serializeProject(App.store.getProject()).indexOf('"widths"') === -1,
          'auto is the ABSENT state — a cleared table must leave no fingerprint');
      });

      s.test('a legacy project with no widths still loads and renders as it did', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        var before = App.doc.renderPart(App.store.getProject().report.sections[0].parts[0], { tables: [] });
        // A v3 file is what an earlier build wrote: no widths anywhere, older version.
        var legacy = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        legacy.schemaVersion = 3;
        var r = App.projectIo.parseProject(JSON.stringify(legacy));
        T.assertEqual(r.ok, true, 'a v3 project must still open: ' + JSON.stringify(r.issues));
        T.assertEqual(r.value.schemaVersion, App.projectIo.SCHEMA_VERSION, 'it should have been migrated');
        var part = r.value.report.sections[0].parts[0];
        T.assertEqual(part.widths, undefined, 'migration must not invent widths');
        T.assertEqual(App.doc.renderPart(part, { tables: [] }), before, 'the rendering must be unchanged');
      });

      s.test('a widths array that does not match the columns is rejected', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        var p = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        p.report.sections[0].parts[0].widths = [0.5, 0.3, 0.2];      // 3 widths, 2 columns
        var issues = App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; });
        T.assert(issues.some(function (i) { return /widths/.test(i.message); }), 'expected a widths error, got ' + JSON.stringify(issues));
        // A total ABOVE 100% is deliberately legal — typing 60% and 50% is a thing the
        // designer can do, and is told about in red rather than refused (TW-1). What is
        // not legal is a share that is not a share.
        p.report.sections[0].parts[0].widths = [0.9, 0.9];           // 180% — over-committed, but usable
        T.assertEqual(App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; }).length, 0);
        p.report.sections[0].parts[0].widths = [1.4, 0.2];
        issues = App.projectIo.validateSchema(p).filter(function (i) { return i.severity === 'error'; });
        T.assert(issues.some(function (i) { return /no more than 1/.test(i.message); }), 'a column wider than the table, got ' + JSON.stringify(issues));
      });

      s.test('the editor offers a grip on every column but the last, and a reset', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-colresize data-rd-wt="p\|sec1\|part1" data-rd-col="0"/.test(html), 'no grip on column 1');
        // The last column has no edge of its own — dragging it would have to move the
        // table's right-hand boundary, which is the page's, not the table's.
        T.assertEqual((html.match(/data-rd-colresize\b/g) || []).length, 1, 'a two-column table has exactly one draggable edge');
        T.assert(/data-rd-autowidth="part1"/.test(html), 'no Reset widths button');
        T.assert(/rd-table-fixed/.test(html), 'the editor table must be fixed-layout for a colgroup to bind');
        App.ui.views.reportDesign.close();
      });

      s.test('the preview reads the widths back out of the markdown', function () {
        var md = MD.table(HEAD, ROWS, { widths: [0.6, 0.2, 0.2], caption: { id: 'x', text: 'Cap' } });
        var html = App.ui.mdPreview.toHtml(md).html;
        var cols = (html.match(/<col style="width:([\d.]+)%">/g) || []).map(function (x) { return Number(/([\d.]+)/.exec(x)[1]); });
        T.assertEqual(cols.length, 3);
        T.assert(Math.abs(cols[0] - 60) < 2, 'preview column 1 should be ~60%, got ' + cols[0]);
        T.assert(Math.abs(cols[1] - 20) < 2, 'preview column 2 should be ~20%, got ' + cols[1]);
      });

      s.test('an ALIGNED grid table is still read as a table by the preview', function () {
        // It was not: the preview only recognised `+-`, so every aligned grid table was
        // shown as prose. Same source shape that broke pandoc, found the same way.
        var md = MD.table(HEAD, ROWS, { widths: [0.5, 0.25, 0.25], align: ['l', 'c', 'r'] });
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/<table/.test(html), 'expected a table, got: ' + html.slice(0, 160));
        T.assert(/<td>one<\/td>/.test(html), 'the body row must survive');
      });
    });

