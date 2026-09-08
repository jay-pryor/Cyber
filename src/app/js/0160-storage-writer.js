  /* =============================================================================
   * MODULE: App.storage.writer  — TF.5: the 60s idle / 180s capped debounce
   * PURPOSE: The save POLICY, kept out of the folder store so both stay trivially
   *          testable. Coalesces a burst of edits into one write, guarantees only one
   *          write is ever in flight, and never spins on failure.
   * PURITY:  impure (timers) but every dependency is injectable.
   * DEPENDS: App.util.clock (default time source only)
   * INVARIANTS:
   *   * COALESCING. `pending` holds only the LATEST document. There is no queue of
   *     stale versions to work through.
   *   * ONE WRITE AT A TIME, and the drain LOOPS rather than recursing on the stack:
   *     an edit arriving DURING a write is picked up by the same drain. flush()
   *     therefore resolves only when nothing is pending AND nothing is in flight.
   *   * NO RETRY SPIN. A failed write clears `pending` and reports 'error'. The next
   *     edit retries; a failure never loops hot.
   *   * The idle delay is not the whole policy: without the CAP, continuous editing
   *     that never pauses for `idleMs` would never write at all. See requirements 6.2.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var IDLE_MS = 60 * 1000;   // write 60s after the last change...
    var CAP_MS = 180 * 1000;   // ...but never let more than 3 minutes pass unwritten

    /**
     * @param {{write:function(string):Promise, idleMs?:number, capMs?:number,
     *          onState?:function(string,*), now?:function():number,
     *          setTimer?:function, clearTimer?:function}} opts
     */
    function create(opts) {
      var doWrite = opts.write;
      var idleMs = opts.idleMs === undefined ? IDLE_MS : opts.idleMs;
      var capMs = opts.capMs === undefined ? CAP_MS : opts.capMs;
      var onState = opts.onState || function () {};
      var now = opts.now || function () { return Date.parse(App.util.clock.nowIso()); };
      var setTimer = opts.setTimer || function (fn, ms) { return window.setTimeout(fn, ms); };
      var clearTimer = opts.clearTimer || function (t) { window.clearTimeout(t); };

      var pending = null;      // the LATEST document awaiting a write, or null
      var firstPendingAt = null; // when the current unwritten run began (for the cap)
      var inFlight = false;
      var current = Promise.resolve(); // tail of the drain chain, for flush()
      var timer = null;
      var state = 'saved';

      function setState(s, err) { state = s; onState(s, err); }

      function disarm() { if (timer !== null) { clearTimer(timer); timer = null; } }

      function arm() {
        disarm();
        var t = now();
        var dueAt = Math.min(t + idleMs, firstPendingAt + capMs);
        timer = setTimer(function () { timer = null; drain(); }, Math.max(0, dueAt - t));
      }

      /** Record a new document. Coalesces; only the latest survives. */
      function schedule(text) {
        pending = String(text);
        if (firstPendingAt === null) firstPendingAt = now();
        if (state !== 'saving') setState('dirty');
        arm();
      }

      function drain() {
        if (inFlight) return current;
        if (pending === null) return Promise.resolve();
        disarm();
        inFlight = true;
        setState('saving');
        var text = pending;
        pending = null;
        current = Promise.resolve()
          .then(function () { return doWrite(text); })
          .then(function () {
            inFlight = false;
            if (pending !== null) return drain(); // an edit landed mid-write — same drain
            firstPendingAt = null;
            setState('saved');
          }, function (err) {
            // No retry spin: drop the pending doc and wait for the next edit.
            inFlight = false;
            pending = null;
            firstPendingAt = null;
            setState('error', err);
          });
        return current;
      }

      /** Resolves only once nothing is pending and nothing is in flight. */
      function flush() {
        disarm();
        return drain().then(function () {
          if (pending !== null || inFlight) return flush();
          return undefined;
        });
      }

      return {
        schedule: schedule,
        flush: flush,
        drain: drain,
        state: function () { return state; },
        pending: function () { return pending !== null; },
        inFlight: function () { return inFlight; },
        armed: function () { return timer !== null; },
        cancel: function () { disarm(); pending = null; firstPendingAt = null; }
      };
    }

    App.storage.writer = { create: create, IDLE_MS: IDLE_MS, CAP_MS: CAP_MS };
  })(App);
