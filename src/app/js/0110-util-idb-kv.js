  /* =============================================================================
   * MODULE: App.util.idbKv  — TF.1: a key/value shelf that survives a restart
   * PURPOSE: Promise-wrapped IndexedDB, used for exactly two things: the
   *          FileSystemDirectoryHandle (structured-cloneable, so it survives a browser
   *          restart) and the short-cycle crash draft. Nothing else belongs here.
   * PURITY:  impure (IndexedDB). No DOM.
   * DEPENDS: (none)
   * INVARIANTS:
   *   * NEVER canonical state. The folder is canonical; this is a handle shelf and
   *     crash insurance (folder-storage-requirements.md 2.1, 6.1).
   *   * The database name is NAMESPACED to this tool. Every file:// page shares one
   *     origin and therefore one IndexedDB, so an unnamespaced DB would collide with
   *     any other local tool. This does NOT make the data private — see the recorded
   *     risk in folder-storage-requirements.md 2.2.
   *   * Every call degrades rather than throws: with IndexedDB unavailable, get()
   *     resolves null and set()/del() resolve having done nothing.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var DB_NAME = 'ch-config-tool';   // namespaced — see INVARIANTS
    var STORE = 'kv';
    var VERSION = 1;

    function idb() {
      try { return window.indexedDB || null; } catch (e) { return null; }
    }

    /** @returns {boolean} true when IndexedDB can be reached at all. */
    function available() { return !!idb(); }

    function openDb() {
      var db = idb();
      if (!db) return Promise.reject(new Error('IndexedDB unavailable'));
      return new Promise(function (resolve, reject) {
        var req;
        try { req = db.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
        req.onblocked = function () { reject(new Error('IndexedDB blocked by another tab')); };
      });
    }

    /** Run one transaction; resolves with the request's result (undefined for writes). */
    function tx(mode, fn) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t, req;
          try {
            t = db.transaction(STORE, mode);
            req = fn(t.objectStore(STORE));
          } catch (e) { try { db.close(); } catch (e2) {} reject(e); return; }
          t.oncomplete = function () { db.close(); resolve(req ? req.result : undefined); };
          t.onerror = function () { db.close(); reject(t.error || new Error('IndexedDB transaction failed')); };
          t.onabort = function () { db.close(); reject(t.error || new Error('IndexedDB transaction aborted')); };
        });
      });
    }

    /** @returns {Promise<*>} the stored value, or null if absent/unavailable. */
    function get(key) {
      return tx('readonly', function (s) { return s.get(key); })
        .then(function (v) { return v === undefined ? null : v; })
        .catch(function () { return null; });
    }

    /** @returns {Promise<boolean>} true if it actually stored. */
    function set(key, value) {
      return tx('readwrite', function (s) { return s.put(value, key); })
        .then(function () { return true; })
        .catch(function () { return false; });
    }

    /** @returns {Promise<void>} */
    function del(key) {
      return tx('readwrite', function (s) { return s['delete'](key); })
        .then(function () { return undefined; })
        .catch(function () { return undefined; });
    }

    App.util = App.util || {};
    App.util.idbKv = { available: available, get: get, set: set, del: del, DB_NAME: DB_NAME };
  })(App);
