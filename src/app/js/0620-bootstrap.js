  /* =============================================================================
   * MODULE: App.bootstrap  — LAST. Registers platforms and mounts the UI.
   * PURPOSE: Wire everything together at startup (spec §14). During Phase 0 it only
   *          renders self-tests on #selftest and a placeholder otherwise.
   * PURITY:  UI/IO
   * DEPENDS: (eventually) App.registry, App.platforms.*, App.ui.app
   * ============================================================================= */
  (function (App) {
    'use strict';

    /** Global error boundary: surface unexpected errors in the drawer, never blank-fail (§12.1). */
    function installErrorBoundary() {
      function report(msg) {
        if (App.ui && App.ui.activity) App.ui.activity.log({ severity: 'error', message: 'Unexpected error: ' + msg });
      }
      window.addEventListener('error', function (e) { report((e && e.message) || 'script error'); });
      window.addEventListener('unhandledrejection', function (e) { report((e && e.reason && (e.reason.message || e.reason)) || 'promise rejection'); });
    }

    /**
     * The document module is given its host EXPLICITLY (design D-host).
     *
     * Everything the designer and the generator need from CH arrives through this one
     * object: where state is read and written, what the time is, what sections are on
     * offer, what the document is about and how its rows are filtered. Nothing is
     * ambient any more, which is what lets the module be lifted into another app —
     * and what lets a test drive it with a host built inline.
     *
     * commit() matters most: routing the designer's writes through App.store._commit
     * is what keeps undo/redo, the dirty flag and the folder autosave working, none of
     * which the module knows about.
     */
    function installDocHost() {
      var G = App.generate;
      function P() { return App.store.getProject(); }
      App.docHost.set({
        getState: P,
        commit: function (mutator) { App.store._commit(mutator); },
        clock: App.util.clock,
        log: function (level, message) { App.ui.activity.log(level, message); },
        subject: {
          list: function () {
            return App.ui.model.getLatestConfigs(P()).map(function (c) {
              return { id: c.id, label: c.name, sublabel: c.model, config: c };
            });
          },
          ready: function (id) { return App.completeness.deviceReady(P(), id); },
          meta: function (id, generatedUtc) {
            var dc = (P().deviceConfigs || []).filter(function (c) { return c.id === id; })[0];
            return dc ? G.metaFields(P(), dc, generatedUtc || App.util.clock.nowIso()) : [];
          },
          /* The render context every column getter is handed. It is the HOST's shape
           * — CH's getters read ctx.project and ctx.device — so the module asks for
           * one rather than assembling it out of parts it would have to understand. */
          context: function (id, generatedUtc) {
            var p = P();
            return { device: (p.deviceConfigs || []).filter(function (c) { return c.id === id; })[0] || null,
                     project: p, toolVersion: App.ui.app.TOOL_VERSION,
                     generatedUtc: generatedUtc || App.util.clock.nowIso(), command: 'reporting' };
          },
          chosenMeta: function (id, generatedUtc) {
            var dc = (P().deviceConfigs || []).filter(function (c) { return c.id === id; })[0];
            return dc ? G.deviceMeta(P(), dc, generatedUtc || App.util.clock.nowIso()) : null;
          },
          metaLabel: 'Device Config Information'
        },
        /* Bound per RUN, not registered once: each provider closes over the device and
         * the filter it is describing, so the module never has to carry them. Called
         * with no run, the same providers come back unbound — their declarations are
         * all the designer needs to draw a section it is not yet generating. */
        sections: function (run) {
          var p = P(); if (!p) return [];
          return G.hostSections(p, run && run.subjectId,
            App.registry.getPlatform(p.platformProfileId),
            G.relevanceFilter(run && run.categories ? { relevance: run.categories } : null));
        },
        /* What the workspace previews and what its Generate button emits. The module
         * assembles the blocks; only the host knows how to package them into a file. */
        build: function (subjectId, opts) { return G.buildReport(P(), subjectId, opts); },
        // REF-2: which words in a table become links, and where they land. CH links
        // every mention of a control to its coverage row.
        linkTerms: function (blocks) { return G.controlLinkTerms(P(), blocks); },
        filter: {
          id: 'relevance', label: 'Security Relevance',
          categories: function () {
            return G.relevanceKeys().map(function (k) {
              return { key: k, label: G.relevanceLabel(k),
                       defaultOn: App.ui.views.generate.REPORT_RELEVANCE_DEFAULT[k] !== false };
            });
          },
          categoryOf: function (row) { return G.relevanceKeyOf(row); }
        }
      });
    }

    function boot() {
      var root = document.getElementById('root');
      var isSelfTest = window.location.hash.replace('#', '') === 'selftest';

      // Register platform profiles (spec §14: register, then mount). Adding a new
      // platform means ONE more registerPlatform call here — zero core edits (DOD-11).
      if (App.platforms && App.platforms.androidAdb && !App.registry.hasPlatform('android-adb')) {
        App.registry.registerPlatform(App.platforms.androidAdb);
      }

      installDocHost();

      if (isSelfTest) {
        App.test.runAndRender(root);
        return;
      }

      installErrorBoundary();

      // Phase 0 placeholder UI; replaced by App.ui.app.mount in later phases.
      if (App.ui && App.ui.app && typeof App.ui.app.mount === 'function') {
        App.ui.app.mount(root);
      } else {
        root.innerHTML =
          '<div style="padding:24px">' +
          '<h1>CH Config Tool</h1>' +
          '<p>Skeleton loaded. Append <code>#selftest</code> to the URL to run the embedded test suite.</p>' +
          '</div>';
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })(App);
