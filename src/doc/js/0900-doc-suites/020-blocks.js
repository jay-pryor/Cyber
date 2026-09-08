  (function (App) {
    'use strict';
    var T = App.test;

  /* ===== SUITES: the block helpers (BLK-1) ===== */

  /* Four helpers that decide how a block is ORDERED and how its table is WORDED.
   * Nothing in them knows what a device or a control is, so they belong to the module
   * — but they lived in CH's generate block, sharing its closure, which is why the
   * fragment above them could not simply be moved. */
  T.suite('BLK-1 ordering and wording are the module’s, not the host’s', function (s) {
    var B = App.docBlocks;

    s.test('a section order puts the named blocks first, in the order named', function () {
      var list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      T.assertDeepEqual(B.applySectionOrder(list, ['c', 'a']).map(function (x) { return x.id; }),
        ['c', 'a', 'b']);
    });

    s.test('an id nobody named keeps its original position, after those named', function () {
      var list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      T.assertDeepEqual(B.applySectionOrder(list, ['c']).map(function (x) { return x.id; }),
        ['c', 'a', 'b'], 'unnamed blocks must stay in declaration order');
    });

    s.test('an order naming a block that no longer exists is ignored, not fatal', function () {
      // Deleting a dataset must never invalidate an arrangement.
      var list = [{ id: 'a' }, { id: 'b' }];
      T.assertDeepEqual(B.applySectionOrder(list, ['gone', 'b']).map(function (x) { return x.id; }),
        ['b', 'a']);
      T.assertDeepEqual(B.applySectionOrder(list, null).map(function (x) { return x.id; }),
        ['a', 'b'], 'no order at all leaves the list alone');
    });

    s.test('table wording is read off the block, and absent wording is an empty object', function () {
      T.assertDeepEqual(B.tableWording({ tables: { _all: { title: 'T' } } }, '_all'), { title: 'T' });
      T.assertDeepEqual(B.tableWording({}, '_all'), {});
      T.assertDeepEqual(B.tableWording(null, '_all'), {});
    });

    s.test('a column keeps its declared heading until somebody rewords it', function () {
      T.assertDeepEqual(B.headingsFor(['field', 'value'], ['Field', 'Value'], {}), ['Field', 'Value']);
      T.assertDeepEqual(B.headingsFor(['field', 'value'], ['Field', 'Value'], { value: 'Setting' }),
        ['Field', 'Setting']);
      T.assertDeepEqual(B.headingsFor(['field'], ['Field'], { field: '   ' }), ['Field'],
        'whitespace is not a rewording');
    });

    s.test('a caption falls back to the title, then to the default', function () {
      T.assertEqual(B.withWording({}, { title: 'A title' }, 'dflt').captionText, 'A title');
      T.assertEqual(B.withWording({}, {}, 'dflt').captionText, 'dflt');
      T.assertEqual(B.withWording({}, { caption: 'Own' }, 'dflt').captionText, 'Own');
    });

    s.test('CAP-4: no caption means no caption line, so the table takes no number', function () {
      var out = B.withWording({ captionId: 'x' }, { noCaption: true }, 'dflt');
      T.assertEqual(out.captionId, '', 'the caption id must be cleared, not merely blanked');
    });
  });
  })(App);
