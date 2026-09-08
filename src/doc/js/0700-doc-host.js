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

    /**
     * The host's log sink, or a no-op.
     *
     * Takes an ISSUE — {severity, message, category?, location?} — because that is
     * what the module already produces everywhere else, and a host that shows a
     * warning differently from an error needs the severity, not a sentence with the
     * word "warning" in it. A host that declares no sink simply loses the message,
     * which is why every call site can be a bare statement with no null check.
     */
    function log(issue) {
      if (_host && typeof _host.log === 'function') _host.log(issue);
    }

    /* -------------------------------------------------------------------------
     * The ephemeral description of ONE generation run: which subject it is about,
     * what the file will be called, and the answers to its /[Tag] placeholders.
     *
     * NOT persisted, and deliberately so — a tag value is typically today's date or
     * the name of the person issuing the document, and the point of a placeholder is
     * that the same design produces a different document each time. Everything about
     * what the report is MADE of lives in the project instead.
     *
     * It belongs to the module because the designer is what decides it. It used to
     * live in CH's Generate tab as a plain object the designer reached in and wrote
     * to — two views sharing one mutable bag with no owner, which is how a key nobody
     * declared ends up in the generator's options.
     * ---------------------------------------------------------------------- */
    var _session = { subjectId: null, filename: '', tags: {} };
    var SESSION_KEYS = Object.keys(_session);

    function sessionGet() { return _session; }

    /** Only declared keys, because a typo that silently sticks is worse than a throw. */
    function sessionSet(patch) {
      Object.keys(patch || {}).forEach(function (k) {
        if (SESSION_KEYS.indexOf(k) === -1) {
          throw new Error('docSession: unknown key "' + k + '" (expected one of ' + SESSION_KEYS.join(', ') + ')');
        }
        _session[k] = patch[k];
      });
      return _session;
    }

    /* What describes one RUN, as distinct from what is selected in the workspace.
     * Kept apart because the run half travels into the generator's options, and a
     * subject id in there would quietly outrank the device the caller asked for. */
    function sessionRun() { return { filename: _session.filename, tags: _session.tags }; }

    /** The subject the document is about: the host's, if the session's has gone. */
    function selectedSubjectId() {
      var h = _host;
      if (!h || !h.subject) return null;
      var list = h.subject.list() || [];
      if (_session.subjectId && list.some(function (c) { return c.id === _session.subjectId; })) return _session.subjectId;
      return list.length ? list[0].id : null;
    }

    /**
     * OPT-2: everything the generator is told about this document, in one object.
     *
     * Two halves, and the split is the whole point. What the report is MADE OF —
     * which sections, which groups, which columns, which of the filter's categories —
     * is stored WITH the project, because it is a decision about the report. The
     * filename and the tag answers are this run's, and are not stored at all.
     *
     * READ-ONLY: assembled fresh on every call. Writing to what it returns changes
     * nothing; the maps are written through App.docStore.setReportInclude and the run
     * fields through App.docSession.set.
     */
    function sessionOptions(state) {
      var st = state || (_host && _host.getState()) || {};
      var bag = st.report || {};
      var stored = bag.options || {};
      // A filter category that ships OFF says so itself, so the module never has to
      // hold an opinion about which of the host's categories is the awkward one.
      var rel = {};
      if (_host && _host.filter) {
        _host.filter.categories().forEach(function (c) { if (c.defaultOn === false) rel[c.key] = false; });
      }
      return Object.assign({}, sessionRun(), {
        sections: stored.sections || {},
        datasetSections: stored.datasetSections || {},
        columns: stored.columns || {},
        relevance: Object.assign(rel, stored.relevance || {}),
        // CLS-1: from the PROJECT, so it survives a reload and travels with the file.
        classification: bag.classification === true
      });
    }

    App.docHost = { set: set, get: get, validate: validate, sections: sections, log: log };
    App.docSession = { get: sessionGet, set: sessionSet, run: sessionRun, options: sessionOptions,
                       selectedSubjectId: selectedSubjectId, KEYS: SESSION_KEYS };
  }(App));
