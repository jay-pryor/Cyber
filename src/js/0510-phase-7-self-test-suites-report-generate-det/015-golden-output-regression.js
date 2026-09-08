
  /* ===== SUITES: byte-neutrality of the module extraction (GOLD-1) ===== */

  /* Extracting the document designer and generator into a reusable module is a PURE
   * refactor: the document a given project produces must not change by one byte. This
   * suite pins that down. It generates the report from the block's ready project under
   * a fixed clock and hashes the result.
   *
   * If this fails during the extraction, the step that broke it is wrong. The hash is
   * NOT to be "updated to make it pass" — it is only ever re-recorded for a deliberate,
   * separately-reviewed change to generated output.
   *
   * Plan: docs/superpowers/plans/2026-09-08-document-designer-module.md
   */
  T.suite('GOLD-1 the generated document is byte-for-byte unchanged', function (s) {

    /** Every generated file, flattened to one string, under a pinned clock. */
    function goldenText() {
      App.util.clock.setClock(function () { return new Date('2026-02-02T02:02:02.000Z'); });
      try {
        var built = App.generate.buildReport(readyProject(), 'dev-m1');
        // `name` is the download filename, which docFilename builds and which this
        // refactor moves — so it is pinned here too, not just the document body.
        return [built.name].concat((built.files || []).map(function (f) {
          return f.name + '\n' + f.content;
        })).join('\n---\n');
      } finally {
        App.util.clock.resetClock();
      }
    }

    /* A golden over an empty string would hash stably while testing nothing at all,
     * so the fixture is checked for substance before the hash is trusted. */
    s.test('the fixture actually produces a document', function () {
      var built = App.generate.buildReport(readyProject(), 'dev-m1');
      T.assert(built.files && built.files.length,
        'buildReport returned no files: ' + JSON.stringify(built.issues || built));
      T.assertEqual(built.files[0].name, 'report.md');
      T.assert(typeof built.files[0].content === 'string', 'a file carries .content, not .text');
      T.assert(goldenText().length > 500,
        'the golden text is suspiciously short (' + goldenText().length + ' chars)');
    });

    s.test('generation is deterministic, so a hash means something', function () {
      T.assertEqual(goldenText(), goldenText(), 'two runs over identical input differ');
    });

    s.test('the document still hashes to the recorded value', function () {
      var GOLDEN_SHA256 = '0910017a18110c708a82fdf3ef76a5e1ed35798d22c333bb685bbeb2dac727f7';
      T.assertEqual(App.util.hash.sha256Hex(goldenText()), GOLDEN_SHA256,
        'generated output changed. Do NOT update this hash to make the test pass — ' +
        'find the step that changed the bytes.');
    });
  });
