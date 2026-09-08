  /* =============================================================================
   * MODULE: App.providers — CH's own document sections, as contract providers
   * PURPOSE: Control coverage and "Deviations from Security Guidelines" are CH
   *          concepts, not document-module ones. They used to be two branches of a
   *          kind switch inside the generator; they reach the document the same way
   *          any host section does now — through the provider contract.
   * PURITY:  pure. Each provider is bound to one generation run.
   * DEPENDS: App.generate (buildControlSection, guidelineChildren,
   *          hasGuidelineDeviations), App.registry
   * INVARIANTS: the wrapped builders are UNCHANGED. Wrapping rather than rewriting
   *             them is what keeps the extraction byte-for-byte neutral.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* A provider bound to one run. The module calls render(rows, ctx, opts) and never
     * learns what a control is; the run's project/device/platform/filter travel in the
     * closure rather than through the contract, which is why hostSections() is called
     * per generation rather than once at startup. */
    function control(project, deviceId, platform, keep) {
      return {
        id: 'control',
        label: 'Control coverage',
        keyColumn: { id: 'control', label: 'Control' },
        columns: App.generate.CONTROL_COLUMNS,
        available: function () { return true; },
        // Control coverage groups by control and sub-groups by dataset, which
        // buildSection's single grouping axis cannot express — so it keeps a render().
        render: function (rows, ctx, opts) {
          return {
            body: App.generate.buildControlSection(
              project, deviceId, platform, keep, opts, opts.colOpts, opts.block),
            children: []
          };
        }
      };
    }

    function guidelines(project, deviceId, platform, keep) {
      return {
        id: 'guidelines',
        label: 'Deviations from Security Guidelines',
        keyColumn: { id: 'item', label: 'Item' },
        columns: [
          { id: 'description', label: 'Description' },
          { id: 'narrative', label: 'How it departs, and why' }
        ],
        // GUIDE-1: a section that exists solely to say "nothing diverges" is noise, so
        // it is not even a candidate unless something does. The module asks; only the
        // host can answer.
        available: function () {
          return App.generate.hasGuidelineDeviations(project, deviceId, platform, keep);
        },
        render: function (rows, ctx, opts) {
          return {
            body: '',
            children: App.generate.guidelineChildren(project, deviceId, platform, keep, opts, opts.block)
          };
        }
      };
    }

    App.providers = { control: control, guidelines: guidelines };
  }(App));
