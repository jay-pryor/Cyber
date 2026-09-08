  /* =============================================================================
   * MODULE: App.storage.driverFsa  — TF.3: real files in a real folder
   * PURPOSE: The File System Access API behind the driver contract. Deliberately the
   *          THINNEST module in the storage layer, because it is the only one that
   *          cannot be tested headlessly — showDirectoryPicker() has no picker for a
   *          test to click. Every decision worth making is made above this line.
   * PURITY:  impure (filesystem, IndexedDB, user gesture).
   * DEPENDS: App.storage, App.util.idbKv
   * INVARIANTS:
   *   * FSA is LOCAL I/O, not network. The no-fetch/no-XHR/no-CDN invariant is intact.
   *   * A directory handle survives a browser restart; ITS PERMISSION GRANT DOES NOT.
   *     init() therefore reports NEEDS_PERMISSION as a normal status, never an error —
   *     it is what every session after the first looks like.
   *   * requestPermission() is NEVER called from init(). It requires a user gesture and
   *     belongs in a click handler.
   *   * Writes are atomic: createWritable() stages to a swap file and commits on
   *     close(), so a crash mid-write leaves the previous contents intact.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var S = App.storage;
    var HANDLE_KEY = 'dirHandle';
    var PICKER_ID = 'ch-config-tool-project'; // the browser remembers the last dir per id

    function supported() {
      try { return typeof window.showDirectoryPicker === 'function'; } catch (e) { return false; }
    }

    function create() {
      var root = null;   // FileSystemDirectoryHandle
      var issue = null;  // the last normalised failure worth showing the user

      /**
       * D-065 (§9.3): does the connected folder still exist?
       * queryPermission() cannot answer this — it inspects the grant, not the disk, and
       * happily returns 'granted' for a folder that has been moved, renamed or re-synced
       * out from under us. Enumerating is the cheapest operation that must actually
       * resolve the handle.
       */
      function rootAlive() {
        if (!root) return Promise.resolve(false);
        var it;
        try { it = root.entries(); } catch (e) { return Promise.resolve(false); }
        return Promise.resolve(it.next()).then(function () { return true; }, function () { return false; });
      }

      var STALE_MSG = 'The connected folder could no longer be found. It may have been moved, ' +
                      'renamed, or re-synced. Choose it again to carry on.';

      /**
       * Decide what a NotFoundError actually meant. Resolves the ORIGINAL error when the
       * folder is fine (so the file really is absent), or a STALE error when it is not.
       */
      function classify(n) {
        return rootAlive().then(function (alive) {
          return alive ? n : S.fail(S.CODES.STALE, STALE_MSG);
        });
      }

      /** Wrap a driver op: NOT_FOUND is classified; `onAbsent` supplies the swallow value. */
      function absentOr(n, onAbsent) {
        if (n.code !== S.CODES.NOT_FOUND) throw n;
        return classify(n).then(function (c) {
          if (c.code === S.CODES.STALE) { issue = c; throw c; }
          return onAbsent;
        });
      }

      function queryPerm(h) {
        if (!h || typeof h.queryPermission !== 'function') return Promise.resolve('granted');
        return Promise.resolve(h.queryPermission({ mode: 'readwrite' }));
      }

      function statusFor(perm) {
        if (perm === 'granted') return S.STATUS.READY;
        if (perm === 'denied') return S.STATUS.ERROR;
        return S.STATUS.NEEDS_PERMISSION;
      }

      function init() {
        if (!supported()) return Promise.resolve(S.STATUS.UNSUPPORTED);
        issue = null;
        return App.util.idbKv.get(HANDLE_KEY).then(function (h) {
          if (!h) return S.STATUS.IDLE;
          root = h;
          return queryPerm(h).then(statusFor, function () { return S.STATUS.NEEDS_PERMISSION; });
        }).then(function (status) {
          // D-065: only a GRANTED handle can be probed — enumerating without permission
          // would throw for the wrong reason. An ungranted one is checked after reconnect.
          if (status !== S.STATUS.READY) return status;
          return rootAlive().then(function (alive) {
            if (alive) return status;
            issue = S.fail(S.CODES.STALE, STALE_MSG);
            return forget().then(function () { return S.STATUS.ERROR; }); // §9.3: discard it
          });
        });
      }

      function hasSavedHandle() {
        return App.util.idbKv.get(HANDLE_KEY).then(function (h) { return !!h; });
      }

      /** @returns {Promise<string|null>} the new status, or null if the user cancelled. */
      function pickFolder() {
        if (!supported()) return Promise.reject(S.fail(S.CODES.UNSUPPORTED, 'This browser has no File System Access API.'));
        return Promise.resolve()
          .then(function () {
            return window.showDirectoryPicker({ mode: 'readwrite', id: PICKER_ID, startIn: 'documents' });
          })
          .then(function (h) {
            root = h;
            return App.util.idbKv.set(HANDLE_KEY, h).then(function () { return S.STATUS.READY; });
          })
          .catch(function (e) {
            var n = S.err(e, 'Choose folder');
            if (n.code === S.CODES.ABORTED) return null; // cancelled is not an error
            throw n;
          });
      }

      /** Must be called from a user gesture. */
      function requestAccess() {
        if (!root) return Promise.resolve(S.STATUS.IDLE);
        if (typeof root.requestPermission !== 'function') return Promise.resolve(S.STATUS.READY);
        return Promise.resolve(root.requestPermission({ mode: 'readwrite' }))
          .then(statusFor)
          .catch(function (e) { throw S.err(e, 'Reconnect'); });
      }

      function forget() {
        root = null;
        return App.util.idbKv.del(HANDLE_KEY).then(function () { return S.STATUS.IDLE; });
      }

      /** Walk to the directory holding `name`, optionally creating it. */
      function dirFor(name, create_) {
        // NO_FOLDER, not NOT_FOUND: getText must never swallow this as "absent file".
        if (!root) return Promise.reject(S.fail(S.CODES.NO_FOLDER, 'No folder is connected.'));
        var segs = S.segments(name);
        segs.pop(); // drop the filename
        var p = Promise.resolve(root);
        segs.forEach(function (seg) {
          p = p.then(function (d) { return d.getDirectoryHandle(seg, { create: !!create_ }); });
        });
        return p;
      }

      function baseName(name) {
        var segs = S.segments(name);
        return segs[segs.length - 1];
      }

      function getText(name) {
        return dirFor(name, false)
          .then(function (d) { return d.getFileHandle(baseName(name), { create: false }); })
          .then(function (fh) { return fh.getFile(); })
          .then(function (f) { return f.text(); })
          .catch(function (e) {
            // An absent FILE resolves null; a dead ROOT must not (D-065).
            return absentOr(S.err(e, 'Read ' + name), null);
          });
      }

      function putText(name, text) {
        return dirFor(name, true)
          .then(function (d) { return d.getFileHandle(baseName(name), { create: true }); })
          .then(function (fh) { return fh.createWritable(); })
          .then(function (w) {
            // Staged to a swap file; close() is the atomic commit.
            return Promise.resolve(w.write(String(text))).then(function () { return w.close(); });
          })
          .catch(function (e) {
            var n = S.err(e, 'Write ' + name);
            // create:true means a NotFoundError here can only be a dead root — but
            // classify anyway rather than assume, and never swallow either way.
            if (n.code !== S.CODES.NOT_FOUND) throw n;
            return classify(n).then(function (c) { issue = (c.code === S.CODES.STALE) ? c : issue; throw c; });
          });
      }

      /** Immediate FILE children of `dir`, as full relative paths, sorted. */
      function listDir(dir) {
        if (!root) return Promise.reject(S.fail(S.CODES.NO_FOLDER, 'No folder is connected.'));
        var segs = S.segments(dir);
        var p = Promise.resolve(root);
        segs.forEach(function (seg) {
          p = p.then(function (d) { return d.getDirectoryHandle(seg, { create: false }); });
        });
        return p.then(function (d) {
          var out = [];
          var prefix = segs.length ? segs.join('/') + '/' : '';
          // Drive the async iterator by hand — the file is ES5 throughout, no for-await.
          var it = d.entries();
          function step() {
            return Promise.resolve(it.next()).then(function (r) {
              if (r.done) { out.sort(); return out; }
              var entryName = r.value[0], handle = r.value[1];
              if (handle && handle.kind === 'file') out.push(prefix + entryName);
              return step();
            });
          }
          return step();
        }).catch(function (e) {
          // A directory we never created yet lists as empty; a dead root does not.
          return absentOr(S.err(e, 'List ' + dir), []);
        });
      }

      function removeName(name) {
        return dirFor(name, false)
          .then(function (d) { return d.removeEntry(baseName(name)); })
          .then(function () { return undefined; })
          .catch(function (e) {
            // Already gone is fine (another user may have deleted it); a dead root is not.
            return absentOr(S.err(e, 'Delete ' + name), undefined);
          });
      }

      return {
        kind: 'fsa',
        get label() { return root ? root.name : ''; },
        init: init,
        rootAlive: rootAlive,
        lastIssue: function () { return issue; },
        hasSavedHandle: hasSavedHandle,
        pickFolder: pickFolder,
        requestAccess: requestAccess,
        forget: forget,
        getText: getText,
        putText: putText,
        listDir: listDir,
        removeName: removeName
      };
    }

    App.storage.driverFsa = { create: create, supported: supported, PICKER_ID: PICKER_ID };
  })(App);
