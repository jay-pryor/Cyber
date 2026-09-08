  /* =============================================================================
   * MODULE: App.ui.activity
   * PURPOSE: The append-only Activity/Errors drawer log (spec §11.6). Nothing in
   *          the app fails silently — parse/validation/generation results land here.
   * PURITY:  holds a log array + emitter; no DOM (rendering is App.ui.app's job).
   * DEPENDS: App.util.clock
   * INVARIANTS: append-only until explicitly cleared; entries carry a timestamp.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var _entries = [];
    var _handlers = [];
    function emit() { _handlers.forEach(function (h) { try { h(_entries.slice()); } catch (e) {} }); }

    /**
     * Append a log entry.
     * @param {{severity:'error'|'warning'|'info'|'success', message:string, location?:string}} entry
     */
    function log(entry) {
      _entries.push({ ts: App.util.clock.nowIso(), severity: entry.severity || 'info', message: entry.message, location: entry.location });
      emit();
    }
    /** Append many Issues at once (parse/validation results). */
    function logIssues(issues, prefix) {
      (issues || []).forEach(function (i) {
        log({ severity: i.severity, message: (prefix ? prefix + ': ' : '') + i.message + (i.location ? ' [' + i.location + ']' : '') + (i.fix ? ' — ' + i.fix : '') });
      });
    }
    function list() { return _entries.slice(); }
    function clear() { _entries = []; emit(); }
    function onChange(h) { _handlers.push(h); return function () { var i = _handlers.indexOf(h); if (i >= 0) _handlers.splice(i, 1); }; }

    App.ui = App.ui || {};
    App.ui.activity = { log: log, logIssues: logIssues, list: list, clear: clear, onChange: onChange };
  })(App);
