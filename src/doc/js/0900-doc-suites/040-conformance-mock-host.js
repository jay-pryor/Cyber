  (function (App) {
    'use strict';
    var T = App.test;

    /* ===== SUITES: a host that is not CH (CONF-1) ===== */

    /* The direct descendant of the DOD-11 mock-platform test, one level up: that one
     * proved a new DATASET needs no core edits, this one proves a new APPLICATION
     * needs none either. If it passes, the contract is real — something with no
     * devices, no controls, no platform and no registry drives the document module
     * from an empty state to a finished .md.
     *
     * The fixture is deliberately nothing like CH. A roster of people in regions has
     * no readiness to compute, no capture to hash and no register to inherit from, so
     * anything in the module still shaped like a device config shows up here as a
     * missing member rather than as a subtly wrong document. */
    T.suite('CONF-1 a minimal foreign host generates a document', function (s) {

      function mockHost() {
        var state = { report: {} };
        var host = {
          getState: function () { return state; },
          commit: function (m) { m(state); },
          clock: { nowIso: function () { return '2026-01-01T00:00:00.000Z'; } },
          subject: {
            metaLabel: 'About this region',
            list: function () { return [{ id: 'r1', label: 'Region One' }, { id: 'r2', label: 'Region Two' }]; },
            ready: function (id) { return id === 'r1'; },
            meta: function (id) {
              return [{ id: 'region', label: 'Region', value: id === 'r1' ? 'Region One' : 'Region Two', code: false }];
            }
          },
          // Declared as a FUNCTION of the run, which is the half of the contract a
          // static array never exercises: these rows exist for r1 and not for r2.
          sections: function (run) {
            var subject = run && run.subjectId;
            return [{
              id: 'staff', label: 'Staff',
              keyColumn: { id: '_key', label: 'Name', w: 2, get: function (r) { return r.name; } },
              columns: [
                { id: 'role', label: 'Role', w: 3, get: function (r) { return r.role; } },
                { id: 'band', label: 'Band', w: 2, optional: true, get: function (r) { return r.band; } }
              ],
              rows: function () { return subject === 'r1' ? ROWS : []; }
            }];
          },
          filter: {
            id: 'band', label: 'Band',
            categories: function () {
              return [{ key: 'hi', label: 'High', defaultOn: true }, { key: 'lo', label: 'Low', defaultOn: false }];
            },
            categoryOf: function (row) { return row.band; }
          },
          build: function (subjectId, opts) { return buildDoc(host, subjectId, opts); }
        };
        return host;
      }

      var ROWS = [{ name: 'Ada', role: 'Lead', band: 'hi' }, { name: 'Grace', role: 'Engineer', band: 'lo' }];

      /** What a host's build() does: blocks in, content filled in, one document out. */
      function buildDoc(host, subjectId, opts) {
        var o = Object.assign({ subjectId: subjectId }, opts || {});
        var blocks = App.docGen.reportBlocks(host, o).filter(function (b) { return b.included; });
        var ctx = { subjectId: subjectId, generatedUtc: host.clock.nowIso() };
        var meta = host.subject.meta(subjectId);
        var prepared = blocks.map(function (b) { return App.docGen.sectionContent(host, b, o, ctx, meta); });
        return App.docGen.emitDocument(host, prepared, {
          title: 'Roster', subtitle: 'Region One', date: '2026-01-01',
          filename: o.filename, tags: o.tags,
          logicalName: 'roster.md', fallbackName: 'roster-r1.md'
        });
      }

      function withHost(host, body) {
        var was = App.docHost.get();
        App.docHost.set(host);
        try { return body(); } finally { if (was) App.docHost.set(was); }
      }

      s.test('the host validates against the contract', function () {
        T.assertDeepEqual(App.docHost.validate(mockHost()), []);
      });

      s.test('its sections become orderable blocks, beside the module\'s own', function () {
        var blocks = App.docGen.reportBlocks(mockHost(), {});
        var ids = blocks.map(function (b) { return b.id; });
        T.assert(ids.indexOf('staff') !== -1, 'the host section is not a block: ' + ids.join(','));
        T.assert(ids.indexOf('toc') !== -1, 'the contents block is missing');
        T.assert(ids.indexOf('meta') !== -1, 'the metadata block is missing');
        // META-2: the host names its own provenance section; it is not called "Device".
        T.assertEqual(blocks.filter(function (b) { return b.id === 'meta'; })[0].label, 'About this region');
      });

      s.test('the declared columns are the columns the designer would offer', function () {
        var host = mockHost();
        var block = App.docGen.reportBlocks(host, {}).filter(function (b) { return b.id === 'staff'; })[0];
        var cols = App.docGen.sectionColumns(host, block, {});
        T.assertDeepEqual(cols.fixed.map(function (c) { return c.label; }), ['Name', 'Role']);
        T.assertDeepEqual(cols.optional.map(function (c) { return c.label; }), ['Band']);
      });

      s.test('rows are counted by the host\'s own filter axis', function () {
        T.assertDeepEqual(App.docGen.filterCounts(mockHost(), ROWS), { hi: 1, lo: 1 });
      });

      s.test('it generates a document containing its own data', function () {
        var host = mockHost();
        var out = withHost(host, function () { return host.build('r1', {}); });
        T.assert(out && typeof out.text === 'string', 'no document produced');
        T.assert(out.text.indexOf('Ada') !== -1, 'a row is missing from the document');
        T.assert(out.text.indexOf('Grace') !== -1, 'a row is missing from the document');
        T.assert(out.text.indexOf('Role') !== -1, 'a declared column heading is missing');
        T.assert(out.text.indexOf('Region One') !== -1, 'the subject metadata is missing');
        T.assertEqual(out.files[0].name, 'roster.md');
        T.assertEqual(out.files[0].content, out.text);
        T.assertEqual(out.name, 'roster-r1.md', 'an unnamed run falls back to the host\'s name');
      });

      s.test('the same host and state produce the same bytes (DOD-7)', function () {
        var host = mockHost();
        var a = withHost(host, function () { return host.build('r1', {}); });
        var b = withHost(host, function () { return host.build('r1', {}); });
        T.assertEqual(a.text, b.text, 'two runs of one design differ');
      });

      s.test('a placeholder is filled in, and an unfilled one is reported', function () {
        var host = mockHost();
        withHost(host, function () {
          App.docStore.addSection('Issued /[Date]');
          var open = host.build('r1', {});
          T.assert(open.tags.indexOf('Date') !== -1, 'the unfilled tag was not reported: ' + open.tags.join(','));
          var filled = host.build('r1', { tags: { Date: '9 September 2026' }, filename: 'roster-2026.md' });
          T.assert(filled.text.indexOf('9 September 2026') !== -1, 'the tag was not filled in');
          T.assertDeepEqual(filled.tags, [], 'a filled tag is still reported as open');
          T.assertEqual(filled.name, 'roster-2026.md', 'the run\'s filename was not used');
        });
      });

      s.test('it needed no core edits — no CH name appears in the host', function () {
        var src = String(mockHost) + String(buildDoc);
        // Assembled rather than written out, because the build's boundary check reads
        // this file too and cannot tell a name in a string from a name being used.
        ['store', 'registry', 'generate', 'completeness', 'providers', 'overrides',
         'projectIo', 'ui'].forEach(function (n) {
          var name = 'App.' + n;
          T.assertEqual(src.indexOf(name), -1, 'the mock host reaches for ' + name);
        });
      });
    });
  })(App);
