  /* =============================================================================
   * MODULE: App.validation
   * PURPOSE: Cross-cutting structural checks beyond projectIo's schema validation
   *          (spec §7, §12): onboarding input validation and a whole-project pass.
   * PURITY:  pure
   * DEPENDS: App.registry (adapter validateDecision)
   * INVARIANTS: returns located Issues; never throws for expected conditions.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /**
     * Validate onboarding inputs before committing (spec §11.4, §12).
     * @param {{name:string, parsed:Object<string,ParseResult>}} input
     * @param {string[]} datasetIds
     * @returns {Issue[]}
     */
    function validateOnboarding(input, datasetIds) {
      var issues = [];
      if (!input.name || !input.name.trim()) {
        issues.push({ category: 'state', severity: 'error', message: 'Device name is required.', location: 'name', fix: 'Enter a device name.' });
      }
      datasetIds.forEach(function (dsId) {
        var pr = input.parsed && input.parsed[dsId];
        if (!pr) { issues.push({ category: 'parse', severity: 'error', message: 'Missing input for ' + dsId + '.', location: dsId, fix: 'Provide the capture file.' }); return; }
        (pr.errors || []).forEach(function (e) { issues.push({ category: 'parse', severity: 'error', message: e.message, location: dsId + (e.location ? ' / ' + e.location : ''), fix: e.fix }); });
      });
      return issues;
    }

    /**
     * Whole-project cross-cutting validation: per-item adapter decision validity.
     * @param {Project} project
     * @returns {Issue[]}
     */
    function validateProject(project) {
      var issues = [];
      var ids = App.registry.datasetIds(project.platformProfileId);
      ids.forEach(function (dsId) {
        var adapter = App.registry.getDataset(project.platformProfileId, dsId);
        if (!adapter) return;
        (project.items[dsId] || []).forEach(function (it) {
          (adapter.validateDecision(it) || []).forEach(function (i) {
            issues.push({ category: 'validation', severity: i.severity, message: i.message, location: dsId + ' / ' + it.key, fix: i.fix });
          });
        });
      });
      return issues;
    }

    App.validation = { validateOnboarding: validateOnboarding, validateProject: validateProject };
  })(App);
