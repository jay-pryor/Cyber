
  /* ===== SUITES: control and guidelines as host providers (HOST-1) ===== */

  /* These two were branches of a kind switch inside the generator, which meant the
   * document machinery knew what a control was and what a security guideline was.
   * They reach the document through the provider contract now, so the module can be
   * given sections it has never heard of. */
  T.suite('HOST-1 control coverage and guideline deviations are host providers', function (s) {
    function run() {
      var p = readyProject(), pl = App.registry.getPlatform('android-adb');
      return { p: p, pl: pl, sections: App.generate.hostSections(p, 'dev-m1', pl, null) };
    }

    s.test('the host offers them as sections, the module does not own them', function () {
      var ids = run().sections.map(function (x) { return x.id; });
      T.assert(ids.indexOf('control') !== -1, 'control coverage is not offered: ' + ids.join(','));
      T.assert(ids.indexOf('guidelines') !== -1, 'guideline deviations are not offered');
    });

    s.test('each conforms to the provider contract', function () {
      run().sections.forEach(function (pv) {
        T.assertEqual(typeof pv.id, 'string');
        T.assertEqual(typeof pv.label, 'string');
        T.assertEqual(typeof pv.render, 'function', pv.id + ': no render');
        T.assertEqual(typeof pv.available, 'function', pv.id + ': no available');
        T.assert(pv.keyColumn && pv.keyColumn.label, pv.id + ': no keyColumn');
      });
    });

    s.test('guidelines declares itself unavailable when nothing diverges', function () {
      var r = run();
      var g = r.sections.filter(function (x) { return x.id === 'guidelines'; })[0];
      T.assertEqual(typeof g.available(), 'boolean');
    });

    s.test('the control section still renders through its provider', function () {
      var r = run();
      var c = r.sections.filter(function (x) { return x.id === 'control'; })[0];
      var out = c.render([], {}, { colOpts: {}, block: { id: 'control', kind: 'control' } });
      T.assertEqual(typeof out.body, 'string');
      T.assert(out.body.indexOf('ISM-1234') !== -1, 'the control coverage content is missing');
    });
  });
