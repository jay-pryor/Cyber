  (function (App) {
    'use strict';
    var T = App.test;

  /* ===== SUITES: the host contract (HOSTOBJ-1) ===== */

  /* The module used to reach for App.store, App.util.clock and App.ui.activity by
   * name, which is another way of saying it could only ever run inside CH. Everything
   * it needs from the outside world now arrives through one object it is handed. */
  T.suite('HOSTOBJ-1 the module is driven by an explicit host object', function (s) {
    function minimal() {
      var state = { report: {} };
      return {
        getState: function () { return state; },
        commit: function (m) { m(state); },
        // Its own clock, not the app's: a host supplies the time, and a test that
        // borrowed CH's would be proving less than it looks like it is proving.
        clock: { nowIso: function () { return '2026-01-01T00:00:00.000Z'; } },
        sections: []
      };
    }
    /** Run body with `host` installed, and put the real one back whatever happens. */
    function withHost(host, body) {
      var was = App.docHost.get();
      App.docHost.set(host);
      try { return body(); } finally { if (was) App.docHost.set(was); }
    }

    s.test('a minimal host validates', function () {
      T.assertDeepEqual(App.docHost.validate(minimal()), []);
    });

    s.test('a malformed host is refused, and says which member is wrong', function () {
      var bad = minimal(); bad.clock = {};
      T.assertThrows(function () { App.docHost.set(bad); }, /host\.clock/);
      T.assert(App.docHost.get(), 'a refused host must not replace the one already installed');
    });

    s.test('an optional member is optional, but not half-declared', function () {
      var half = minimal();
      half.filter = { categories: function () { return []; } };      // no categoryOf
      var errs = App.docHost.validate(half);
      T.assertEqual(errs.length, 1);
      T.assert(errs[0].indexOf('categoryOf') !== -1, errs[0]);
    });

    s.test('a mutation goes through the host commit, not through any store', function () {
      var host = minimal(), seen = 0;
      var wrapped = Object.assign({}, host, { commit: function (m) { seen += 1; host.commit(m); } });
      withHost(wrapped, function () { App.docStore.addSection({ title: 'A section' }); });
      T.assertEqual(seen, 1, 'docStore did not route its write through host.commit');
      T.assertEqual((host.getState().report.sections || []).length, 1, 'the section did not land in the host state');
    });

    s.test('state is READ through the host too', function () {
      var host = minimal(), reads = 0;
      var wrapped = Object.assign({}, host, { getState: function () { reads += 1; return host.getState(); } });
      withHost(wrapped, function () { App.docStore.setReportOrder(['a', 'b']); });
      T.assert(reads > 0, 'docStore read the project from somewhere other than the host');
      T.assertDeepEqual(host.getState().report.order, ['a', 'b']);
    });

    s.test('a host with no log sink loses the message rather than throwing', function () {
      withHost(minimal(), function () {
        App.docHost.log({ severity: 'error', message: 'nobody is listening' });
      });
    });

    s.test('a host IS installed, and it validates', function () {
      T.assert(App.docHost.get(), 'no host installed at boot');
      T.assertDeepEqual(App.docHost.validate(App.docHost.get()), []);
    });
  });
  })(App);
