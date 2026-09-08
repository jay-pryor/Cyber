  /* =============================================================================
   * MODULE: App.storage  — TF.2/TF.3: the shared vocabulary of the storage layer
   * PURPOSE: Status constants, the normalised error shape, and path helpers that the
   *          drivers and the folder store both speak. Kept in its own tiny module so
   *          neither driver has to depend on the other.
   * PURITY:  pure
   * DEPENDS: (none)
   * INVARIANTS:
   *   * NAME HAZARD: App.store is the in-memory PROJECT (the register, the devices,
   *     the decisions). App.storage.* is the FOLDER on disk. They are unrelated and
   *     conflating them will produce very confusing bugs.
   *   * A `name` is a POSIX-ish relative path ("Snapshots/2026-08-18T01-08-14-233Z.json").
   *     Drivers walk and create the intermediate directories themselves.
   *   * Every rejection out of a driver is a normalised {code, message, cause}, never
   *     a bare DOMException, so callers switch on code and not on browser wording.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var STATUS = {
      IDLE: 'idle',                        // no saved handle -> offer to connect
      READY: 'ready',                      // connected and writable
      NEEDS_PERMISSION: 'needs-permission',// handle survived the restart; the grant did not
      UNSUPPORTED: 'unsupported',          // no File System Access API in this browser
      ERROR: 'error'                       // stale handle, denied, or an IO failure
    };

    /* Error codes. The mapping from DOMException names is the single place browser
     * wording is interpreted (folder-storage-requirements.md 5.6). */
    var CODES = {
      ABORTED: 'aborted',                  // user cancelled a picker — NOT an error
      DENIED: 'denied',                    // permission refused or revoked
      NOT_FOUND: 'not-found',              // this FILE is absent — normal, and swallowable
      STALE: 'stale',                      // the ROOT HANDLE no longer resolves (D-065, §9.3)
      NO_FOLDER: 'no-folder',              // nothing is connected at all
      LOCKED: 'locked',                    // commonly the sync client holding the file
      QUOTA: 'quota',
      UNSUPPORTED: 'unsupported',
      IO: 'io'                             // anything else — reported verbatim
    };

    /* D-065: a NotFoundError means one of FOUR things, and collapsing them is what let a
     * dead folder handle masquerade as "no project here yet" and then fail on the first
     * write. The DOMException name only ever gets us as far as NOT_FOUND; deciding
     * between an absent file and a dead root needs a probe, which driverFsa does. */

    var NAME_BY_CODE = {
      AbortError: CODES.ABORTED,
      NotAllowedError: CODES.DENIED,
      SecurityError: CODES.DENIED,
      NotFoundError: CODES.NOT_FOUND,
      NoModificationAllowedError: CODES.LOCKED,
      InvalidStateError: CODES.LOCKED,
      QuotaExceededError: CODES.QUOTA
    };

    /**
     * D-067: is this ALREADY one of ours?
     *
     * The obvious test — `e.code` — is a trap, and it cost two rounds of misdiagnosis.
     * DOMException carries a LEGACY NUMERIC `code` (NotFoundError is 8), so `e.code` is
     * truthy for every error the filesystem throws. Guards written as
     * `e && e.code ? e : err(e, ctx)` therefore took the "already normalised" branch for
     * raw DOMExceptions and passed them straight through: no string code, no context, no
     * stale classification — just the browser's own wording, which is what the user saw.
     * Normalised errors are BRANDED instead, and nothing else in this file sets `storage`.
     */
    function isErr(e) { return !!(e && e.storage === true); }

    /**
     * Normalise anything thrown by the filesystem into a branded {code, message, cause}.
     * Idempotent: handing it one of ours returns it unchanged, so it is safe to call on
     * every catch path without first asking what kind of error arrived.
     * @param {*} e
     * @param {string} [context] prepended to the message so the Activity log says which op failed
     * @returns {{storage:true, code:string, message:string, cause:*}}
     */
    function err(e, context) {
      if (isErr(e)) return e;
      var name = (e && e.name) || '';
      var code = NAME_BY_CODE[name] || CODES.IO;
      var msg = (e && e.message) || String(e);
      return { storage: true, code: code, message: (context ? context + ': ' : '') + msg, cause: e };
    }

    /** Make a normalised error directly (no DOMException to translate). */
    function fail(code, message) { return { storage: true, code: code, message: message, cause: null }; }

    /** Strip a leading "./" or "/", collapse repeated slashes. */
    function normName(name) {
      return String(name === undefined || name === null ? '' : name)
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '')
        .replace(/\/+/g, '/');
    }

    /** Split a normalised name into non-empty segments. */
    function segments(name) {
      return normName(name).split('/').filter(function (s) { return s.length > 0; });
    }

    /** The directory portion of a name, normalised, '' for a root-level file. */
    function dirOf(name) {
      var segs = segments(name);
      segs.pop();
      return segs.join('/');
    }

    /**
     * True when `name` is an immediate FILE child of directory `dir`.
     * listDir() is a DIRECTORY listing, not a prefix match — see the driver contract.
     */
    function isChildOf(name, dir) {
      var n = normName(name), d = normName(dir);
      if (d && n.slice(0, d.length + 1) !== d + '/') return false;
      var rest = d ? n.slice(d.length + 1) : n;
      return rest.length > 0 && rest.indexOf('/') === -1;
    }

    App.storage = App.storage || {};
    App.storage.STATUS = STATUS;
    App.storage.CODES = CODES;
    App.storage.err = err;
    App.storage.fail = fail;
    App.storage.isErr = isErr;
    App.storage.normName = normName;
    App.storage.segments = segments;
    App.storage.dirOf = dirOf;
    App.storage.isChildOf = isChildOf;
  })(App);
