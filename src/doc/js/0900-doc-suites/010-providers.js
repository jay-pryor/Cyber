  /* =============================================================================
   * SUITES: the document module's own tests
   * PURPOSE: Everything here runs with NO host application present. These are the
   *          suites that ship inside doc-designer.js, so the module can be trusted
   *          by a host that is not the CH Config Tool.
   * INVARIANTS: nothing in this block may reference a name src/app/ owns — the
   *             build enforces it. A fixture is a literal, never a project built
   *             through somebody's store.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var T = App.test;

    /* ===== SUITES: declarative section rendering (PROV-1) ===== */

    /* A provider that declares its rows, its key column and its columns should not
     * also have to write the code that turns them into a table. All three CH adapters
     * implemented renderReportSection as a single pass-through to App.report
     * .buildSection with their own declared columns — boilerplate the module can do
     * once, and one more thing for a new host to get wrong. */
    T.suite('PROV-1 a provider that declares its columns needs no render function', function (s) {
      var provider = {
        id: 'demo', label: 'Demo',
        keyColumn: { id: '_key', label: 'Thing', w: 2, get: function (r) { return r.key; } },
        columns: [{ id: 'note', label: 'Note', w: 3, get: function (r) { return r.note; } }],
        rows: function () { return [{ key: 'b', note: 'second' }, { key: 'a', note: 'first' }]; }
      };

      s.test('the module builds the table when render is absent', function () {
        var out = App.docProviders.renderSection(provider, provider.rows(), {}, {});
        T.assert(out && typeof out.body === 'string', 'no body produced');
        T.assert(out.body.indexOf('Thing') !== -1, 'the key column heading is missing');
        T.assert(out.body.indexOf('Note') !== -1, 'the declared column heading is missing');
        T.assert(out.body.indexOf('first') !== -1, 'a row is missing');
      });

      s.test('rows come out in the order buildSection has always put them in', function () {
        var body = App.docProviders.renderSection(provider, provider.rows(), {}, {}).body;
        T.assert(body.indexOf('first') < body.indexOf('second'), 'rows are not sorted by key');
      });

      s.test('an explicit render function still wins', function () {
        var own = Object.assign({}, provider, {
          render: function () { return { body: 'HAND WRITTEN', children: [] }; }
        });
        T.assertEqual(App.docProviders.renderSection(own, [], {}, {}).body, 'HAND WRITTEN');
      });

      s.test('every result has the same shape, grouped or not', function () {
        var out = App.docProviders.renderSection(provider, provider.rows(), {}, {});
        T.assert(Array.isArray(out.children), 'children must always be an array');
        var none = App.docProviders.renderSection(null, [], {}, {});
        T.assertEqual(none.body, '', 'a missing provider must not throw');
      });
    });
  })(App);
