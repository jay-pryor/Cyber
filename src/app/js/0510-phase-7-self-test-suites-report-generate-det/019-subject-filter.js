
  /* ===== SUITES: the subject and the row filter are host-declared (SUBJ-1 · FILT-1) ===== */

  /* The generator used to know that a document is about a DEVICE and that its rows are
   * filtered by SECURITY RELEVANCE. Both are now declarations a host makes, and a host
   * that makes neither still gets a document — which is the whole test. */
  T.suite('SUBJ-1 a host with no subject still gets a document', function (s) {
    function bare(extra) {
      var state = { report: {} };
      return Object.assign({
        getState: function () { return state; },
        commit: function (m) { m(state); },
        clock: App.util.clock,
        sections: []
      }, extra || {});
    }

    s.test('a minimal host validates', function () {
      T.assertDeepEqual(App.docHost.validate(bare()), []);
    });

    s.test('a host missing a required member is named, not silently accepted', function () {
      var bad = bare(); delete bad.commit;
      var errs = App.docHost.validate(bad);
      T.assertEqual(errs.length, 1);
      T.assert(errs[0].indexOf('commit') !== -1, 'the error does not name the missing member: ' + errs[0]);
    });

    s.test('blocks build with no subject declared', function () {
      var blocks = App.generate.hostBlocks(bare(), {});
      T.assert(Array.isArray(blocks), 'no blocks produced');
      T.assert(blocks.some(function (b) { return b.kind === 'toc'; }), 'the contents block is missing');
    });

    s.test('no subject means no metadata section', function () {
      T.assertEqual(App.generate.hostBlocks(bare(), {}).filter(function (b) { return b.kind === 'meta'; }).length, 0,
        'a metadata section was offered with nothing to describe');
    });

    s.test('a subject brings the metadata section back, under the name the host gives it', function () {
      var h = bare({ subject: { list: function () { return []; }, ready: function () { return true; },
                                meta: function () { return []; }, metaLabel: 'About this policy' } });
      var meta = App.generate.hostBlocks(h, {}).filter(function (b) { return b.kind === 'meta'; })[0];
      T.assert(meta, 'the metadata section is missing');
      T.assertEqual(meta.label, 'About this policy');
    });

    s.test('a section the host declares becomes an orderable block, with no edit here', function () {
      var h = bare({ sections: [{ id: 'risks', kind: 'risks', label: 'Risks',
                                  keyColumn: { id: 'risk', label: 'Risk' }, columns: [] }] });
      var b = App.generate.hostBlocks(h, {}).filter(function (x) { return x.id === 'risks'; })[0];
      T.assert(b, 'the declared section produced no block');
      T.assertEqual(b.label, 'Risks');
      T.assertEqual(b.included, true, 'a section nobody switched off is on');
      T.assertEqual(b.empty, undefined, 'a section that never has nothing to say gets no empty flag');
      T.assertEqual(App.generate.hostColumns(h, b, {}).all[0].label, 'Risk');
    });

    s.test('a section that declares itself unavailable is a candidate no longer', function () {
      var open = false;
      var h = bare({ sections: [{ id: 'risks', label: 'Risks', keyColumn: { id: 'r', label: 'R' }, columns: [],
                                  available: function () { return open; } }] });
      var off = App.generate.hostBlocks(h, {}).filter(function (x) { return x.id === 'risks'; })[0];
      T.assertEqual(off.included, false);
      T.assertEqual(off.empty, true);
      open = true;
      T.assertEqual(App.generate.hostBlocks(h, {}).filter(function (x) { return x.id === 'risks'; })[0].included, true);
    });
  });

  T.suite('FILT-1 the filter axis is declared by the host', function (s) {
    var host = {
      getState: function () { return { report: {} }; },
      commit: function (m) { m({}); },
      clock: App.util.clock,
      sections: [],
      filter: {
        id: 'band', label: 'Band',
        categories: function () {
          return [{ key: 'hi', label: 'High', defaultOn: true },
                  { key: 'lo', label: 'Low', defaultOn: false }];
        },
        categoryOf: function (row) { return row.band; }
      }
    };

    s.test('counts are reported per declared category', function () {
      var rows = [{ band: 'hi' }, { band: 'hi' }, { band: 'lo' }];
      T.assertDeepEqual(App.generate.filterCounts(host, rows), { hi: 2, lo: 1 });
    });

    s.test('a row in no declared category is counted in none of them', function () {
      T.assertDeepEqual(App.generate.filterCounts(host, [{ band: 'hi' }, { band: 'nonsense' }]),
        { hi: 1, lo: 0 });
    });

    s.test('a category with no default is on', function () {
      var cats = host.filter.categories();
      T.assertEqual(cats[0].defaultOn, true);
      T.assertEqual(cats[1].defaultOn, false);
    });

    s.test('a host with no filter reports no categories', function () {
      T.assertDeepEqual(App.generate.filterCounts({ sections: [] }, [{}]), {});
    });

    /* CH's own axis, reached the same way: the designer no longer knows the word
     * "relevance", only that its host declares categories and sorts rows into them. */
    s.test('CH declares Security Relevance as its axis', function () {
      var f = App.docHost.get().filter;
      T.assertEqual(f.id, 'relevance');
      var keys = f.categories().map(function (c) { return c.key; });
      T.assertDeepEqual(keys, App.generate.relevanceKeys());
      T.assertEqual(f.categoryOf({ relevance: 'HIGH' }), 'HIGH');
      T.assertEqual(f.categoryOf({}), App.generate.REL_UNSET, 'an unset row still lands somewhere');
    });
  });
