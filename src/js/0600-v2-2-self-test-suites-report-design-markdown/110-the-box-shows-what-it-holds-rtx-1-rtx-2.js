    /* ===== SUITES: the box shows what it holds (RTX-1 · RTX-2) ===== */

    T.suite('RTX-1 a text box renders what it holds', function (s) {
      var RT = App.ui.richText;
      function resolve(id) {
        return id === 'tbl1'
          ? { label: 'Table 4: Packages removed', numberLabel: 'Table 4', titleLabel: 'Packages removed', anchor: 'tbl-1' }
          : null;
      }
      function box(tokens) {
        var d = document.createElement('div');
        d.innerHTML = RT.toHtml(tokens, { resolveRef: resolve });
        return d;
      }
      function trip(tokens) { return RT.fromNode(box(tokens)); }

      s.test('emphasis, code and line breaks are shown as themselves', function () {
        T.assertEqual(RT.toHtml('a {{b}}B{{/b}} c'), 'a <strong>B</strong> c');
        T.assertEqual(RT.toHtml('{{i}}slanted{{/i}}'), '<em>slanted</em>');
        T.assertEqual(RT.toHtml('{{c}}com.a_b{{/c}}'), '<code>com.a_b</code>');
        T.assertEqual(RT.toHtml('one{{br}}two'), 'one<br>two');
        T.assertEqual(RT.toHtml('one\ntwo'), 'one<br>two', 'a typed newline is the same break');
      });

      s.test('a reference reads as the thing it points at', function () {
        // The whole point: `{{ref:ds:android.packages}}` in the middle of a sentence is
        // the one part of it you cannot check by looking at it.
        var html = RT.toHtml('See {{ref:tbl1}} for detail.', { resolveRef: resolve });
        T.assert(html.indexOf('Table 4: Packages removed') !== -1, 'the target\'s own label: ' + html);
        T.assert(html.indexOf('{{ref') === -1, 'and not the token');
        T.assert(/class="rd-chip"/.test(html) && /contenteditable="false"/.test(html),
          'a derived reading is one uneditable chip: ' + html);
        T.assert(RT.toHtml('{{refn:tbl1}}', { resolveRef: resolve }).indexOf('>Table 4<') !== -1, 'the number alone');
        T.assert(RT.toHtml('{{reft:tbl1}}', { resolveRef: resolve }).indexOf('>Packages removed<') !== -1, 'the title alone');
      });

      s.test('a reference over the author\'s own words stays editable', function () {
        var html = RT.toHtml('{{ref:tbl1}}the packages table{{/ref}}', { resolveRef: resolve });
        T.assert(/class="rd-reflink"/.test(html), 'marked, not replaced: ' + html);
        T.assert(html.indexOf('contenteditable="false"') === -1, 'the words are the author\'s to edit');
        T.assert(html.indexOf('the packages table') !== -1);
      });

      s.test('a reference to something that is gone says so', function () {
        var html = RT.toHtml('{{ref:vanished}}', { resolveRef: resolve });
        T.assert(/rd-broken/.test(html), 'a dangling link is a finding, so it is marked: ' + html);
        T.assert(html.indexOf('[missing reference]') !== -1);
      });

      s.test('everything data-derived is escaped', function () {
        // The box is live DOM. An unescaped captured string here would be an injection
        // route from a device into the tool's own page.
        var html = RT.toHtml('<img src=x onerror=alert(1)> & "q"');
        T.assert(html.indexOf('<img') === -1, 'no raw markup may reach the box: ' + html);
        T.assert(html.indexOf('&lt;img') !== -1 && html.indexOf('&amp;') !== -1);
      });

      s.test('the box reads back to the tokens it was built from', function () {
        ['plain text', 'a {{b}}B{{/b}} c', '{{b}}bold {{i}}both{{/i}}{{/b}}',
          'a {{c}}code_span{{/c}} b', 'line one\nline two', 'para one\n\npara two',
          'See {{ref:tbl1}} for detail.', 'See {{refn:tbl1}}.',
          'See {{ref:tbl1}}the packages table{{/ref}}.', 'See {{ref:gone}} nowhere.',
          'a {{zzz}} b', '5 < 6 & "x"'].forEach(function (t) {
          T.assertEqual(trip(t), t, 'round trip failed for ' + JSON.stringify(t));
        });
      });

      s.test('a box that cannot round-trip is normalised rather than corrupted', function () {
        // Both of these are what App.md.rich already does with the same input, so the
        // document is unchanged by the box tidying them up.
        T.assertEqual(trip('{{br}}'), '\n', 'a break is stored the one way the box writes it');
        T.assertEqual(trip('a {{b}}unclosed'), 'a {{b}}unclosed{{/b}}', 'an unclosed token is closed');
      });

      s.test('markup the box did not put there is read for its text and its breaks', function () {
        var d = document.createElement('div');
        d.innerHTML = '<div>one</div><div>two<span style="color:red">!</span></div>';
        T.assertEqual(RT.fromNode(d), 'one\ntwo!', 'a pasted block is a line break and nothing else');
        d.innerHTML = '<p>first</p>';
        T.assertEqual(RT.fromNode(d), 'first', 'and a block at the very start breaks nothing');
      });

      s.test('a toolbar button acts on the tokens, so a repaint cannot lose it', function () {
        T.assertDeepEqual(RT.applyToken('hello world', 0, 5, 'b'), { text: '{{b}}hello{{/b}} world', caret: 16 });
        T.assertDeepEqual(RT.applyToken('hello world', 5, 5, 'refn:tbl1'), { text: 'hello{{refn:tbl1}} world', caret: 18 });
        T.assertDeepEqual(RT.applyToken('hello world', 0, 5, 'ref:tbl1'),
          { text: '{{ref:tbl1}}hello{{/ref}} world', caret: 25 }, 'a selection becomes the link\'s words');
        T.assertDeepEqual(RT.applyToken('hello world', 5, 5, 'br'), { text: 'hello\n world', caret: 6 });
      });

      s.test('a DOM position maps to a token offset and back', function () {
        var d = box('a {{b}}bold{{/b}} z');
        document.body.appendChild(d);
        var strong = d.querySelector('strong');
        T.assertEqual(RT.offsetOf(d, strong.firstChild, 0), 7, 'inside the emphasis, past its opening token');
        T.assertEqual(RT.offsetOf(d, strong.firstChild, 4), 11);
        RT.placeCaret(d, 11, window);
        var sel = window.getSelection();
        T.assertEqual(sel.anchorNode.nodeValue, 'bold');
        T.assertEqual(sel.anchorOffset, 4, 'and the caret goes back to where the offset says');
        // A caret that lands INSIDE markup goes to the nearest place a caret can be.
        RT.placeCaret(d, 17, window);
        sel = window.getSelection();
        T.assertEqual(sel.anchorNode.nodeValue, ' z');
        T.assertEqual(sel.anchorOffset, 0);
        d.parentNode.removeChild(d);
      });

      s.test('the designer\'s boxes are all the same surface', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: 'a {{b}}word{{/b}}' });
        App.docStore.addPart(sec, 'table');
        App.docStore.setCell(sec, 'part2', 0, 0, 'in a cell');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select(sec);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/<div class="rd-rich [^"]*" contenteditable="true"[^>]*data-rd-text="part1"/.test(html),
          'the paragraph must be the rich surface: ' + (html.match(/data-rd-text="part1"[^>]*/) || ''));
        T.assert(/data-rd-cell="part2"[^>]*data-rd-row="0"/.test(html), 'and so must a cell');
        T.assert(html.indexOf('<strong>word</strong>') !== -1, 'the paragraph shows its emphasis');
        T.assert(html.indexOf('{{b}}') === -1, 'and never the raw token');
        // RTX-2: one toolbar, acting on whichever box was last written in.
        ['b', 'i', 'c', 'br'].forEach(function (t) {
          T.assert(html.indexOf('data-rd-wrap="' + t + '" data-rd-part="part2"') !== -1,
            'a table needs the toolbar too: ' + t);
        });
        T.assert(html.indexOf('data-rd-ref-open="part2"') !== -1, 'and the reference picker');
        App.ui.views.reportDesign.close();
      });

      s.test('a section introduction is the same surface', function () {
        docProject();
        App.docStore.setBlockIntro('ds:android.packages', 'See {{ref:control}} for coverage.');
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.select('ds:android.packages');
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/contenteditable="true"[^>]*data-rd-intro="ds:android.packages"/.test(html),
          'the introduction must be the rich surface');
        T.assert(html.indexOf('{{ref:') === -1, 'and must not show the token');
        App.ui.views.reportDesign.close();
      });
    });

    T.suite('RTX-2 a table cell takes the same formatting a paragraph does', function (s) {
      s.test('a cell renders its tokens into the document', function () {
        var ctx = { resolveRef: function () {
          return { label: 'Table 4: X', numberLabel: 'Table 4', titleLabel: 'X', anchor: 'tbl-1' }; } };
        var part = { id: 'p1', kind: 'table', header: ['{{b}}Setting{{/b}}', 'Notes'],
          rows: [['{{c}}io.x.y{{/c}}', 'See {{refn:t}} — {{i}}note{{/i}}']] };
        var md = App.doc.renderPart(part, ctx);
        T.assert(md.indexOf('**Setting**') !== -1, 'a heading takes emphasis: ' + md);
        T.assert(md.indexOf('`io.x.y`') !== -1, 'a cell takes a code span');
        T.assert(md.indexOf('[Table 4](#tbl-1)') !== -1, 'and a cross-reference');
        T.assert(md.indexOf('*note*') !== -1);
      });

      s.test('a line break in a cell is a HARD break, not a fold', function () {
        // Pandoc folds a grid cell's consecutive lines into one paragraph, so a break
        // without the trailing backslash does nothing at all on the page.
        var part = { id: 'p1', kind: 'table', header: ['A'], rows: [['one{{br}}two']] };
        var md = App.doc.renderPart(part, {});
        var cell = md.split('\n').filter(function (l) { return /^\|/.test(l); });
        T.assert(cell.some(function (l) { return /one\\\s*\|/.test(l); }),
          'the line must end with a backslash:\n' + md);
        T.assert(cell.some(function (l) { return /\btwo\b/.test(l); }), 'and the next line must follow');
      });

      s.test('a blank line in a cell is a paragraph in it', function () {
        var part = { id: 'p1', kind: 'table', header: ['A'], rows: [['one\n\ntwo']] };
        var md = App.doc.renderPart(part, {});
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/prv-cp/.test(html), 'the preview must read it back as two paragraphs: ' + html);
      });

      s.test('plain text in a cell is written exactly as it was', function () {
        // Nothing about the change may alter a table nobody has formatted — every
        // project written before this is full of them.
        var part = { id: 'p1', kind: 'table', header: ['Key'], rows: [['io.sdsasolutions.tacticalsettings']] };
        var md = App.doc.renderPart(part, {});
        T.assert(md.indexOf('`io.sdsasolutions.tacticalsettings`') !== -1,
          'a long identifier is still marked so it can wrap (BRK-1): ' + md);
        T.assertEqual(App.md.richCell('costs 50% & $x'), App.md.cell('costs 50% & $x'),
          'and ordinary text escapes exactly as it always did');
      });
    });

    /* ===== SUITES: what the report is made of, saved with it (OPT-2 · COL-3) ===== */

    T.suite('OPT-2 the report\'s composition travels with the project', function (s) {
      function stored() { return ((App.store.getProject().report || {}).options) || null; }
      function reopen() {
        // What an operator actually does: save, close, open. The options have to come
        // back out of the FILE, not out of a module variable that happened to survive.
        var text = App.projectIo.serializeProject(App.store.getProject());
        var r = App.projectIo.parseProject(text);
        T.assertEqual(r.ok, true, JSON.stringify(r.issues));
        App.store.init(r.value);
        return App.ui.views.generate.reportOptions(App.store.getProject());
      }

      s.test('a section switched off is in the file, and comes back out of it', function () {
        docProject();
        App.docStore.setReportInclude('sections', 'meta', null, false, true);
        T.assertDeepEqual(stored(), { sections: { meta: false } });
        T.assertEqual(reopen().sections.meta, false, 'the choice must survive the round trip');
      });

      s.test('groups, columns and relevance travel the same way', function () {
        docProject();
        App.docStore.setReportInclude('datasetSections', 'android.packages', 'keep', false, true);
        App.docStore.setReportInclude('columns', 'android.packages', 'rationale', true, false);
        App.docStore.setReportInclude('relevance', 'IRRELEVANT', null, true, false);
        var back = reopen();
        T.assertEqual(back.datasetSections['android.packages'].keep, false);
        T.assertEqual(back.columns['android.packages'].rationale, true);
        T.assertEqual(back.relevance.IRRELEVANT, true, 'including the parked items must stick');
      });

      s.test('only departures from the default are written', function () {
        docProject();
        T.assertEqual(stored(), null, 'an untouched project says nothing about its report');
        App.docStore.setReportInclude('sections', 'meta', null, true, true);
        T.assertEqual(stored(), null, 'switching something ON that is already on writes nothing');
        App.docStore.setReportInclude('columns', 'control', 'items', false, false);
        T.assertEqual(stored(), null, 'nor does switching OFF something that ships off');
        App.docStore.setReportInclude('columns', 'control', 'items', true, false);
        T.assertDeepEqual(stored(), { columns: { control: { items: true } } });
        App.docStore.setReportInclude('columns', 'control', 'items', false, false);
        T.assertEqual(stored(), null, 'and switching it back leaves no fingerprint (DOD-7)');
      });

      s.test('the choices reach the document the Generate button builds', function () {
        docProject();
        T.assert(reportMd({ sections: {} }).indexOf('{#sec-meta}') !== -1, 'the block is there to start with');
        App.docStore.setReportInclude('sections', 'meta', null, false, true);
        var md = App.generate.buildReport(App.store.getProject(), 'dev-m1',
          App.ui.views.generate.reportOptions(App.store.getProject()))
          .files.filter(function (f) { return f.name === 'report.md'; })[0].content;
        T.assert(md.indexOf('{#sec-meta}') === -1, 'and gone once it is switched off');
      });

      s.test('the per-run answers stay in the session', function () {
        docProject();
        var g = App.ui.views.generate._gen;
        g.report.filename = 'run-1';
        g.report.tags = { Date: '1 Jan' };
        T.assertEqual(stored(), null, 'a filename is an answer for this run, not a property of the report');
        var o = App.ui.views.generate.reportOptions(App.store.getProject());
        T.assertEqual(o.filename, 'run-1', 'and it still reaches the generator');
        g.report = { filename: '', tags: {} };
      });

      s.test('CLS-1 the classification banner is a property of the document, not of the run', function () {
        docProject();
        T.assertEqual(App.ui.views.generate.reportOptions(App.store.getProject()).classification, false,
          'off until it is asked for');
        App.docStore.setClassification(true);
        T.assertEqual(App.store.getProject().report.classification, true, 'it is written into the project');
        T.assertEqual(App.ui.views.generate.reportOptions(App.store.getProject()).classification, true,
          'and it still reaches the generator');
        var back = App.projectIo.parseProject(App.projectIo.serializeProject(App.store.getProject()));
        T.assert(back.ok, 'it must load: ' + JSON.stringify(back.issues || []));
        T.assertEqual(back.value.report.classification, true, 'it must survive a save and load');
        App.docStore.setClassification(false);
        T.assertEqual((App.store.getProject().report || {}).classification, undefined, 'and off leaves no trace');
        // The session block no longer carries it at all — that is what stops the two
        // disagreeing about whether the document is marked.
        T.assertEqual('classification' in App.ui.views.generate._gen.report, false);
      });

      s.test('an unknown map is refused rather than written', function () {
        docProject();
        T.assertEqual(App.docStore.setReportInclude('widths', 'x', null, false, true).ok, false);
        T.assertEqual(stored(), null);
      });

      s.test('a project carrying a nonsense option is reported, not silently loaded', function () {
        docProject();
        var p = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        p.report = p.report || {};
        p.report.options = { sections: { meta: 'no' } };
        var r = App.projectIo.parseProject(JSON.stringify(p));
        T.assertEqual(r.ok, false, 'a non-boolean include is not a shape this build writes');
        p.report.options = { nonsense: { a: true } };
        T.assertEqual(App.projectIo.parseProject(JSON.stringify(p)).ok, false, 'nor is an unknown map');
      });
    });

    T.suite('COL-3 an optional column carries its own default', function (s) {
      s.test('Rationale and Rollback ship off', function () {
        var pkgs = App.registry.getDataset('android-adb', 'android.packages');
        var custom = App.registry.getDataset('android-adb', 'android.custom');
        T.assertEqual(pkgs.reportColumns.filter(function (c) { return c.id === 'rationale'; })[0].defaultOff, true);
        T.assertEqual(custom.reportColumns.filter(function (c) { return c.id === 'rollback'; })[0].defaultOff, true);
        T.assertEqual(pkgs.reportColumns.filter(function (c) { return c.id === 'description'; })[0].defaultOff, undefined,
          'a column that ships on says nothing');
      });

      s.test('Type and Items ship off in Applicable Controls', function () {
        var by = {};
        App.generate.CONTROL_COLUMNS.forEach(function (c) { by[c.id] = c; });
        T.assertEqual(by.type.defaultOff, true);
        T.assertEqual(by.items.defaultOff, true);
        T.assertEqual(by.status.defaultOff, undefined);
        T.assertEqual(by.justification.defaultOff, undefined);
      });

      s.test('the predicate reads the declaration, and an explicit tick still wins', function () {
        var off = { id: 'x', optional: true, defaultOff: true }, on = { id: 'y', optional: true };
        T.assertEqual(App.report.columnOn(off, {}), false, 'a default-off column is off when nothing is said');
        T.assertEqual(App.report.columnOn(off, { x: true }), true, 'and on when it is');
        T.assertEqual(App.report.columnOn(on, {}), true);
        T.assertEqual(App.report.columnOn(on, { y: false }), false);
        T.assertEqual(App.report.columnOn({ id: 'z' }, { z: false }), true, 'a column that is not optional is not a choice');
      });

      s.test('the report and the designer\'s tick agree about what is showing', function () {
        docProject();
        var pl = App.registry.getPlatform('android-adb');
        var block = App.generate.reportBlocks(App.store.getProject(), pl, {})
          .filter(function (b) { return b.id === 'ds:android.packages'; })[0];
        var shown = App.generate.sectionColumns(App.store.getProject(), block, {}).all.map(function (c) { return c.label; });
        T.assert(shown.indexOf('Rationale') === -1, 'the designer must not offer a column the table will not have');
        T.assert(reportMd({}).indexOf('| Rationale ') === -1, 'and the table must not have it');
      });
    });

