  /* =============================================================================
   * MODULE: App.docHost — the contract between the module and its host application
   * PURPOSE: Hold the one object the host supplies, and say plainly when it is
   *          malformed. Everything the module needs from the outside world arrives
   *          here; nothing is ambient, so a test constructs a host inline rather
   *          than setting up and tearing down globals.
   * PURITY:  holds one reference. No DOM, no I/O, no clock of its own.
   * DEPENDS: nothing
   * INVARIANTS: the module NEVER persists anything itself. State is read through
   *             getState() and written through commit(), so the host keeps undo,
   *             dirty-tracking and autosave working.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var _host = null;

    /**
     * @returns {string[]} one message per contract violation; empty means valid.
     *
     * Only four members are REQUIRED, because only four have no sensible default:
     * where state is read, where it is written, what the time is, and what sections
     * the host offers. `subject`, `filter` and `log` are each optional and each
     * degrade to something coherent — no subject picker, no filter axis, no log.
     */
    function validate(host) {
      var errs = [];
      if (!host || typeof host !== 'object') return ['host: not an object'];
      ['getState', 'commit'].forEach(function (k) {
        if (typeof host[k] !== 'function') errs.push('host.' + k + ' is required and must be a function');
      });
      if (!host.clock || typeof host.clock.nowIso !== 'function') {
        errs.push('host.clock is required and must expose nowIso()');
      }
      // A host whose section list depends on what is loaded declares a FUNCTION; a
      // host whose sections never change may hand over the array itself.
      if (!Array.isArray(host.sections) && typeof host.sections !== 'function') {
        errs.push('host.sections is required and must be an array or a function returning one');
      }
      if (host.subject) {
        ['list', 'ready', 'meta'].forEach(function (k) {
          if (typeof host.subject[k] !== 'function') errs.push('host.subject.' + k + ' must be a function');
        });
      }
      if (host.filter) {
        ['categories', 'categoryOf'].forEach(function (k) {
          if (typeof host.filter[k] !== 'function') errs.push('host.filter.' + k + ' must be a function');
        });
      }
      return errs;
    }

    function set(host) {
      var errs = validate(host);
      if (errs.length) throw new Error('invalid document host:\n  ' + errs.join('\n  '));
      _host = host;
      return _host;
    }

    function get() { return _host; }

    /**
     * The host's sections for one run.
     *
     * `run` is `{subjectId, categories}` — which subject the document is about and
     * which of the filter's categories it carries. A provider closes over that run,
     * so the module never carries it (design D12). Called with NO run, the host
     * returns the same providers unbound: their declarations — id, label, key
     * column, columns — are all the designer needs to draw a section it is not yet
     * generating.
     */
    function sections(run) {
      var h = _host;
      if (!h) return [];
      var s = h.sections;
      return (typeof s === 'function' ? s(run || null) : s) || [];
    }

    /** The log sink, or a no-op. Keeps every call site free of a null check. */
    function log(level, message) {
      if (_host && typeof _host.log === 'function') _host.log(level, message);
    }

    App.docHost = { set: set, get: get, validate: validate, sections: sections, log: log };
  }(App));
