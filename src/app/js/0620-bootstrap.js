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

    function boot() {
      var root = document.getElementById('root');
      var isSelfTest = window.location.hash.replace('#', '') === 'selftest';

      // Register platform profiles (spec §14: register, then mount). Adding a new
      // platform means ONE more registerPlatform call here — zero core edits (DOD-11).
      if (App.platforms && App.platforms.androidAdb && !App.registry.hasPlatform('android-adb')) {
        App.registry.registerPlatform(App.platforms.androidAdb);
      }

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
