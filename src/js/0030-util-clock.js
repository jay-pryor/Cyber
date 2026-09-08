  /* =============================================================================
   * MODULE: App.util.clock
   * PURPOSE: Single, injectable time source so all timestamps are deterministic
   *          and testable (spec §13.4, C-6). Engine code MUST source time here.
   * PURITY:  pure (the injected fn is the only side-channel; default reads Date)
   * DEPENDS: (none)
   * INVARIANTS: nowIso() always returns a UTC ISO-8601 string with millisecond
   *             precision and trailing 'Z'.
   * ============================================================================= */
  (function (App) {
    'use strict';

    // Default clock reads the real wall clock; tests/determinism override via setClock.
    var _clock = function () { return new Date(); };

    /**
     * Current time as a UTC ISO-8601 string.
     * @returns {string} e.g. '2026-06-30T12:00:00.000Z'
     * @example App.util.clock.setClock(() => new Date('1980-01-01Z')); App.util.clock.nowIso();
     */
    function nowIso() {
      return new Date(_clock().getTime()).toISOString();
    }

    /**
     * Replace the time source. Pass a function returning a Date.
     * @param {() => Date} fn
     * @returns {void}
     */
    function setClock(fn) {
      if (typeof fn !== 'function') throw new TypeError('setClock requires a function');
      _clock = fn;
    }

    /**
     * Restore the default wall-clock source.
     * @returns {void}
     */
    function resetClock() { _clock = function () { return new Date(); }; }

    App.util = App.util || {};
    /**
     * Format a UTC ISO timestamp as AEST (UTC+10, no DST) — pure, deterministic.
     * Parses the given ISO (not the wall clock), so it is safe in generated artifacts.
     * @param {string} iso @returns {string} e.g. "2026-07-01 11:00:00 AEST"
     */
    function toAest(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      var t = new Date(d.getTime() + 10 * 3600 * 1000); // UTC+10 = AEST
      var p = function (n) { return ('0' + n).slice(-2); };
      return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()) + ' ' +
        p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds()) + ' AEST';
    }

    App.util.clock = { nowIso: nowIso, setClock: setClock, resetClock: resetClock, toAest: toAest };
  })(App);
