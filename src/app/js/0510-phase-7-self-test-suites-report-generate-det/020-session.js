
  /* ===== SUITES: the designer owns the description of a run (SESS-1) ===== */

  /* The filename, the tag answers and the selected subject used to live in CH's
   * Generate tab as a plain object the designer reached in and wrote to — two views
   * sharing one mutable bag with no owner. The module owns it; CH reads it. */
  T.suite('SESS-1 the designer owns the description of a run', function (s) {
    function reset() { App.docSession.set({ subjectId: null, filename: '', tags: {} }); }

    s.test('the session is readable from the module', function () {
      T.assert(App.docSession && typeof App.docSession.get === 'function', 'no App.docSession');
      T.assertEqual(typeof App.docSession.get(), 'object');
    });

    s.test('a patch is visible to the host, not copied into it', function () {
      reset();
      App.docSession.set({ filename: 'run-a.md' });
      T.assertEqual(App.docSession.get().filename, 'run-a.md');
      T.assertEqual(App.ui.views.generate._gen.report.filename, 'run-a.md',
        'the Generate tab is not reading through to the module session');
      reset();
    });

    s.test('the Generate tab writes through to it too', function () {
      reset();
      App.ui.views.generate._gen.deviceId = 'dev-whatever';
      T.assertEqual(App.docSession.get().subjectId, 'dev-whatever',
        'the device picker wrote somewhere the module cannot see');
      reset();
    });

    s.test('setting an unknown key is refused rather than silently kept', function () {
      T.assertThrows(function () { App.docSession.set({ nonsense: 1 }); }, /nonsense/);
      T.assertEqual('nonsense' in App.docSession.get(), false);
    });

    /* The run half and the selection half are deliberately separate: a subject id in
     * the generator's options would outrank the device the caller actually passed. */
    s.test('the run half carries no subject id', function () {
      reset();
      App.docSession.set({ subjectId: 'dev-m1', filename: 'x.md' });
      T.assertDeepEqual(Object.keys(App.docSession.run()).sort(), ['filename', 'tags']);
      T.assertEqual(App.docSession.options().subjectId, undefined,
        'a subject id in the options would outrank the device buildReport was given');
      reset();
    });

    s.test('a selection that no longer exists falls back to the first subject', function () {
      readyProject();
      App.docSession.set({ subjectId: 'dev-gone' });
      var first = App.docHost.get().subject.list()[0];
      T.assertEqual(App.docSession.selectedSubjectId(), first && first.id);
      reset();
    });

    s.test('the options are the project half plus the run half, and nothing else', function () {
      readyProject(); reset();
      var keys = Object.keys(App.docSession.options()).sort();
      T.assertDeepEqual(keys,
        ['classification', 'columns', 'datasetSections', 'filename', 'relevance', 'sections', 'tags']);
      T.assertEqual(App.docSession.options().relevance.IRRELEVANT, false,
        'the category that ships off must still ship off');
    });
  });
