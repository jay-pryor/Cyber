  /* =============================================================================
   * MODULE: App.test  — embedded test harness
   * PURPOSE: Tiny in-file test runner (spec §15). assert/assertEqual(deep)/
   *          assertDeepEqual + suite/test registrar. Runs only on #selftest or via
   *          a dev button; MUST NOT run in normal use.
   * PURITY:  harness is pure; rendering touches the DOM only when explicitly run.
   * DEPENDS: App.util.html (esc)
   * INVARIANTS:
   *   * registering a suite never executes it; run() executes all.
   *   * run() RESOLVES A PROMISE. A test fn may return a thenable (the folder-storage
   *     suites are promise-based end to end); one that returns anything else is
   *     treated as having passed the moment it returns, so the 170-odd synchronous
   *     suites needed no edit when this went async.
   *   * Tests run STRICTLY SEQUENTIALLY, and concurrent run() calls are serialised
   *     against each other (_running). Suites share global App state — App.store.init,
   *     the active platform, the injected clock — so any interleaving is a flake
   *     factory. Under #selftest in jsdom there ARE two callers (boot below, and
   *     tools/run-selftests.js), which is exactly the case this guards.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var _suites = []; // {name, tests:[{name, fn}]}
    var _running = null; // tail of the serialised run chain (see INVARIANTS)

    /** Register a suite of tests. */
    function suite(name, registerFn) {
      var tests = [];
      registerFn({
        test: function (tname, fn) { tests.push({ name: tname, fn: fn }); }
      });
      _suites.push({ name: name, tests: tests });
    }

    function deepEqual(a, b) {
      if (a === b) return true;
      if (typeof a !== typeof b) return false;
      if (a == null || b == null) return a === b;
      if (typeof a !== 'object') return a === b;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      ka.sort(); kb.sort();
      for (var i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return false;
        if (!deepEqual(a[ka[i]], b[kb[i]])) return false;
      }
      return true;
    }

    function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }
    function assertEqual(actual, expected, msg) {
      if (actual !== expected) throw new Error((msg || 'assertEqual failed') + '\n  actual:   ' + repr(actual) + '\n  expected: ' + repr(expected));
    }
    function assertDeepEqual(actual, expected, msg) {
      if (!deepEqual(actual, expected)) throw new Error((msg || 'assertDeepEqual failed') + '\n  actual:   ' + repr(actual) + '\n  expected: ' + repr(expected));
    }
    function assertThrows(fn, msg) {
      var threw = false;
      try { fn(); } catch (e) { threw = true; }
      if (!threw) throw new Error(msg || 'expected function to throw');
    }
    function repr(v) {
      try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); }
    }

    function errText(e) { return (e && e.message) || String(e); }

    /**
     * Run all registered suites, sequentially, awaiting any test that returns a
     * thenable. Serialised against any run already in flight.
     * @returns {Promise<{suites:Object[], passed:number, failed:number}>}
     */
    function run() {
      _running = (_running || Promise.resolve()).then(runOnce);
      return _running;
    }

    function runOnce() {
      var results = [];
      var passed = 0, failed = 0;
      // One promise chain, appended to per test, so tests never overlap.
      var chain = Promise.resolve();
      _suites.forEach(function (su) {
        var suiteRes = { name: su.name, tests: [] };
        results.push(suiteRes);
        su.tests.forEach(function (tc) {
          chain = chain.then(function () {
            function pass() { suiteRes.tests.push({ name: tc.name, ok: true }); passed++; }
            function fail(e) { suiteRes.tests.push({ name: tc.name, ok: false, error: errText(e) }); failed++; }
            var out;
            try { out = tc.fn(); } catch (e) { fail(e); return; }
            // Anything that is not a thenable has already finished, synchronously.
            if (!out || typeof out.then !== 'function') { pass(); return; }
            return out.then(pass, fail);
          });
        });
      });
      return chain.then(function () {
        return { suites: results, passed: passed, failed: failed };
      });
    }

    /**
     * Run all suites and render the results into a fresh DOM panel.
     * @returns {Promise<{suites:Object[], passed:number, failed:number}>}
     */
    function runAndRender(rootEl) {
      rootEl.innerHTML = '<div id="selftest-root"><h2>Self-tests</h2><div class="st-summary">running…</div></div>';
      return run().then(function (res) { return render(rootEl, res); });
    }

    function render(rootEl, res) {
      var esc = App.util.html.esc;
      var html = '<div id="selftest-root">';
      html += '<h2>Self-tests</h2>';
      html += '<div class="st-summary ' + (res.failed ? 'st-fail' : 'st-pass') + '">' +
              esc(res.passed + ' passed, ' + res.failed + ' failed') + '</div>';
      for (var s = 0; s < res.suites.length; s++) {
        var su = res.suites[s];
        html += '<div class="st-suite"><h3>' + esc(su.name) + '</h3>';
        for (var t = 0; t < su.tests.length; t++) {
          var tc = su.tests[t];
          if (tc.ok) {
            html += '<div class="st-test st-pass">PASS  ' + esc(tc.name) + '</div>';
          } else {
            html += '<div class="st-test st-fail">FAIL  ' + esc(tc.name) + '</div>';
            html += '<div class="st-diff">' + esc(tc.error) + '</div>';
          }
        }
        html += '</div>';
      }
      html += '</div>';
      rootEl.innerHTML = html;
      return res;
    }

    App.test = {
      suite: suite, run: run, runAndRender: runAndRender,
      assert: assert, assertEqual: assertEqual, assertDeepEqual: assertDeepEqual,
      assertThrows: assertThrows, deepEqual: deepEqual
    };
  })(App);
