  /* =============================================================================
   * MODULE: App.platforms.androidAdb
   * PURPOSE: Assemble the Android (ADB) PlatformProfile from its dataset adapters
   *          plus platform-level output conventions (spec Appendix B). This is the
   *          ONLY place that knows the script language is PowerShell.
   * PURITY:  pure
   * DEPENDS: App.adapters.android
   * INVARIANTS: preamble/postamble are deterministic functions of ctx.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var A = App.adapters.android;

