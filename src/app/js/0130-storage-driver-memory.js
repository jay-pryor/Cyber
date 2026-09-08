  /* =============================================================================
   * MODULE: App.storage.driverMemory  — TF.2: the reason any of this is testable
   * PURPOSE: A Map pretending to be a folder. Implements the driver contract exactly,
   *          including fault injection, so every policy above the driver line —
   *          snapshot rotation, prune, debounce coalescing, quarantine, the divergence
   *          guard — is exercised headlessly in jsdom with no picker to click.
   * PURITY:  impure (holds state) but in-process only. No DOM, no filesystem.
   * DEPENDS: App.storage (STATUS, err helpers, path helpers)
   * INVARIANTS:
   *   * Behaviourally identical to driverFsa for every operation the folder store uses.
   *     Where the two could drift, the contract is defined here and driverFsa follows.
   *   * listDir(dir) is a DIRECTORY listing: immediate FILE children of `dir`, as full
   *     relative paths, sorted. NOT a prefix match — a prefix match would make
   *     listDir('') return the snapshots too, and the two drivers would disagree.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var S = App.storage;

    /**
     * @param {{files?:Object}} [seed] optional initial contents, name -> text
     * @returns {Object} a driver
     */
    function create(seed) {
      var files = {};
      var fault = null;
      if (seed && seed.files) {
        Object.keys(seed.files).forEach(function (k) { files[S.normName(k)] = String(seed.files[k]); });
      }

      /** Inject failures: fn(op, name) returns an Error/normalised error, or null. */
      function setFault(fn) { fault = fn || null; }

      function guard(op, name) {
        if (!fault) return null;
        var e = fault(op, name);
        // Context carries the PATH as well as the operation, exactly as driverFsa does —
        // a double that reports less than the real thing lets D-067-shaped bugs hide.
        return e ? Promise.reject(S.err(e, op + ' ' + S.normName(name))) : null;
      }

      function getText(name) {
        var g = guard('getText', name); if (g) return g;
        var n = S.normName(name);
        return Promise.resolve(Object.prototype.hasOwnProperty.call(files, n) ? files[n] : null);
      }

      function putText(name, text) {
        var g = guard('putText', name); if (g) return g;
        files[S.normName(name)] = String(text);
        return Promise.resolve();
      }

      function listDir(dir) {
        var g = guard('listDir', dir); if (g) return g;
        var out = Object.keys(files).filter(function (n) { return S.isChildOf(n, dir); });
        out.sort();
        return Promise.resolve(out);
      }

      function removeName(name) {
        var g = guard('removeName', name); if (g) return g;
        delete files[S.normName(name)];
        return Promise.resolve(); // absent is not an error
      }

      return {
        kind: 'memory',
        get label() { return 'in memory'; },
        init: function () { return Promise.resolve(S.STATUS.READY); },
        hasSavedHandle: function () { return Promise.resolve(true); },
        pickFolder: function () { return Promise.resolve(S.STATUS.READY); },
        requestAccess: function () { return Promise.resolve(S.STATUS.READY); },
        forget: function () { files = {}; return Promise.resolve(S.STATUS.IDLE); },
        getText: getText,
        putText: putText,
        listDir: listDir,
        removeName: removeName,
        // test-only reach-ins
        setFault: setFault,
        _files: function () { return files; }
      };
    }

    App.storage.driverMemory = { create: create };
  })(App);
