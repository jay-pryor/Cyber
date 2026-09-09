  (function (App) {
    'use strict';
    var T = App.test, MD = App.md;

    /* Captions and their numbers, from a single table up to a whole document.
     *
     * The last test used to generate CH's report through App.store and App.generate,
     * which is why a suite about App.doc's numbering could only run inside CH. It
     * builds a document from a mock host instead — a grouped section, a plain one, the
     * provenance rows and a hand-authored annex, which between them produce every
     * shape of table the numbering has to keep in order. */

    var ROWS = [
      { key: 'alpha', note: 'first', decision: { band: 'hi' } },
      { key: 'bravo', note: 'second', decision: { band: 'lo' } },
      { key: 'charlie', note: 'third', decision: { band: 'hi' } }
    ];

    /** A host with four sections' worth of tables and nothing CH about it. */
    function mockHost() {
      var state = { report: { sections: [{ id: 'annex', title: 'Annex',
        parts: [{ id: 'p9', kind: 'table', header: ['A'], rows: [['x']] }] }] } };
      return {
        getState: function () { return state; },
        commit: function (m) { m(state); },
        clock: { nowIso: function () { return '2026-01-01T00:00:00.000Z'; } },
        subject: {
          list: function () { return [{ id: 's1', label: 'Subject One' }]; },
          ready: function () { return true; },
          meta: function () { return [{ id: 'who', label: 'Subject', value: 'Subject One', code: false }]; }
        },
        sections: [
          // Grouped: one section, two tables. A grouped section's tables used to be
          // counted twice, which put every later number out by the number of groups.
          { id: 'banded', label: 'Banded',
            keyColumn: { id: '_key', label: 'Item', w: 2, get: function (r) { return r.key; } },
            columns: [{ id: 'note', label: 'Note', w: 3, get: function (r) { return r.note; } }],
            groups: { field: 'band', options: [{ value: 'hi', label: 'High' }, { value: 'lo', label: 'Low' }] },
            rows: function () { return ROWS; } },
          { id: 'plain', label: 'Plain',
            keyColumn: { id: '_key', label: 'Item', w: 2, get: function (r) { return r.key; } },
            columns: [{ id: 'note', label: 'Note', w: 3, get: function (r) { return r.note; } }],
            rows: function () { return ROWS; } }
        ]
      };
    }

    /** The finished markdown of that host's document. */
    function documentMd() {
      var host = mockHost(), opts = { subjectId: 's1' };
      var blocks = App.docGen.reportBlocks(host, opts).filter(function (b) { return b.included; });
      var meta = host.subject.meta('s1');
      var prepared = blocks.map(function (b) {
        return App.docGen.sectionContent(host, b, opts, { subjectId: 's1' }, meta);
      });
      return App.docGen.emitDocument(host, prepared, { title: 'Captions', logicalName: 'captions.md' }).text;
    }

    /* ===== SUITES: automatic captions (CAP-1) ===== */

    T.suite('CAP-1 every table is captioned, and the numbers agree', function (s) {
      s.test('the caption text carries no number — LaTeX supplies that', function () {
        // Written here as well, the PDF read "Table 3: Table 3 — Ports".
        var md = MD.table(['A'], [['x']], { caption: { id: 't', text: 'Ports' } });
        T.assert(/\n: Ports$/.test(md), 'expected a bare caption, got: ' + md);
        T.assert(!/: Table \d/.test(md), 'the caption must not number itself');
      });

      s.test('the anchor precedes the table, as an empty span', function () {
        var md = MD.table(['A'], [['x']], { caption: { id: 't 1', text: 'Ports' } });
        T.assert(/^\[\]\{#tbl-t-1\}\n\n/.test(md), 'anchor missing or malformed: ' + md);
      });

      s.test('a hand-authored table with no caption takes its section heading', function () {
        var block = { id: 'sec1', kind: 'custom', title: 'Residual risks', label: 'Risks', parts: [{ id: 'p1', kind: 'table', header: ['A'], rows: [['x']] }] };
        T.assertEqual(App.doc.autoCaption(block, block.parts[0]), 'Residual risks');
        var idx = App.doc.tableIndex([block]);
        T.assertEqual(idx.length, 1);
        T.assertEqual(idx[0].caption, 'Residual risks');
        T.assertEqual(idx[0].number, '1');
      });

      s.test('a generated table is found by reading the body back', function () {
        var body = MD.table(['A'], [['x']], { caption: { id: 'ds-x', text: 'Packages' } });
        var found = App.doc.scanTables(body);
        T.assertEqual(found.length, 1);
        T.assertEqual(found[0].caption, 'Packages');
        T.assertEqual(found[0].anchor, 'tbl-ds-x');
      });

      s.test('generated and hand-authored tables share one numbering, in emitted order', function () {
        var blocks = [
          { id: 'a', kind: 'meta', label: 'Meta', body: MD.table(['A'], [['x']], { caption: { id: 'meta', text: 'Meta' } }) },
          { id: 'b', kind: 'dataset', label: 'Packages', body: '', children: [
            { id: 'g1', label: 'Kept', body: MD.table(['A'], [['x']], { caption: { id: 'ds-1', text: 'Packages — Kept' } }) }
          ] },
          { id: 'c', kind: 'custom', title: 'Annex', label: 'Annex', parts: [{ id: 'p9', kind: 'table', header: ['A'], rows: [['x']] }] }
        ];
        var idx = App.doc.tableIndex(blocks);
        T.assertDeepEqual(idx.map(function (t) { return t.number + ':' + t.caption; }),
          ['1:Meta', '2:Packages — Kept', '3:Annex']);
      });

      s.test('a cross-reference to a table names the number the page will print', function () {
        var blocks = [
          { id: 'a', kind: 'meta', label: 'Meta', body: MD.table(['A'], [['x']], { caption: { id: 'meta', text: 'Meta' } }) },
          { id: 'c', kind: 'custom', title: 'Annex', label: 'Annex', parts: [{ id: 'p9', kind: 'table', header: ['A'], rows: [['x']] }] }
        ];
        var idx = App.doc.tableIndex(blocks);
        var r = App.doc.refResolver(blocks, idx)('p9');
        T.assertEqual(r.label, 'Table 2: Annex');
        T.assertEqual(r.anchor, 'tbl-p9');
      });

      s.test('every table a whole document emits is captioned', function () {
        var md = documentMd();
        var anchors = (md.match(/^\[\]\{#tbl-[a-z0-9-]+\}$/gm) || []).length;
        // CAP-3: the caption is a numbered paragraph this file writes, not pandoc's
        // `: text` marker — which is what lets it sit below the table and carry the
        // same number the cross-references use.
        var captions = (md.match(/^Table \d+: \S/gm) || []).length;
        T.assert(anchors > 3, 'expected several captioned tables, got ' + anchors);
        T.assertEqual(captions, anchors, 'every anchor must have a caption and vice versa');
        T.assertEqual((md.match(/^: \S/gm) || []).length, 0, 'no unrewritten caption markers may survive');
        // The numbers run 1..n with no gaps and no repeats: a grouped dataset's tables
        // used to be counted twice, which put every later number out by three.
        var nums = (md.match(/^Table (\d+):/gm) || []).map(function (s) { return Number(/\d+/.exec(s)[0]); });
        T.assertDeepEqual(nums, nums.map(function (_, i) { return i + 1; }), 'table numbers must run in order: ' + nums.join(','));
        // Two tables answering to one anchor would make a reference ambiguous.
        var ids = (md.match(/#tbl-[a-z0-9-]+/g) || []);
        T.assertEqual(ids.length, new Set(ids).size, 'duplicate table anchor: ' + ids.join(', '));
      });

      s.test('the preview numbers the captions the same way', function () {
        var md = MD.join([
          MD.table(['A'], [['x']], { caption: { id: 'a', text: 'First' } }),
          MD.table(['A'], [['x']], { caption: { id: 'b', text: 'Second' } })
        ]);
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(/<strong>Table 1:<\/strong> First/.test(html), 'first caption: ' + html);
        T.assert(/<strong>Table 2:<\/strong> Second/.test(html), 'second caption');
      });
    });
  })(App);
