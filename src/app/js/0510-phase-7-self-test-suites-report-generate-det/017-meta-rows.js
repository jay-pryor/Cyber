
  /* ===== SUITES: the metadata rows are handed in (META-2) ===== */

  /* sectionContent used to build the provenance table by calling deviceMeta(project,
   * dc, generatedUtc) itself — reaching into the project for a CH shape from inside
   * the code that is to become module code. The rows are passed in now, so the module
   * prints whatever its host says the document's provenance is. */
  T.suite('META-2 the provenance rows are supplied, not derived', function (s) {
    function metaBlock(p, rows) {
      var pl = App.registry.getPlatform('android-adb');
      var block = App.generate.reportBlocks(p, pl, { deviceId: 'dev-m1' })
        .filter(function (b) { return b.kind === 'meta'; })[0];
      return App.generate.sectionContent(p, 'dev-m1', pl, block, { deviceId: 'dev-m1' }, {}, rows);
    }

    s.test('the rows handed in are the rows printed', function () {
      var out = metaBlock(readyProject(), [{ id: 'x', label: 'Commissioned by', value: 'Someone' }]);
      T.assert(out.body.indexOf('Commissioned by') !== -1, 'the supplied label is missing');
      T.assert(out.body.indexOf('Someone') !== -1, 'the supplied value is missing');
    });

    s.test('nothing about the device is consulted for them', function () {
      var out = metaBlock(readyProject(), [{ id: 'x', label: 'Only', value: 'This' }]);
      T.assertEqual(out.body.indexOf('Gold'), -1, 'the device name leaked into a supplied table');
    });

    s.test('no rows means no table rather than a thrown error', function () {
      T.assertEqual(typeof metaBlock(readyProject(), []).body, 'string');
    });
  });
