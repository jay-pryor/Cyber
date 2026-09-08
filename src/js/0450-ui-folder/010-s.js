  /* =============================================================================
   * MODULE: App.ui.folder  — TF.6/TF.8/TF.9/TF.11: the folder, as the app sees it
   * PURPOSE: The single seam between the storage layer and the rest of the UI. Owns
   *          the folder store and the writer, the connect/reconnect/recovery/divergence
   *          screens, the status chip and the rollback list. Everything project-aware
   *          lives here so App.storage.* stays domain-blind.
   * PURITY:  impure (drives storage; renders HTML strings). Handlers are delegated.
   * DEPENDS: App.storage.*, App.projectIo, App.store, App.registry, App.ui.activity
   * INVARIANTS:
   *   * UNCONNECTED IS A FULLY USABLE STATE (requirements 5.3). The tool worked
   *     standalone long before it could reach a folder and still keeps manual
   *     save/load, so IDLE and UNSUPPORTED gate nothing.
   *   * NEEDS_PERMISSION and ERROR *do* gate, because those are the states where the
   *     user would otherwise reasonably believe their edits were being saved. There
   *     must never be a window in which an edit is accepted and silently lost.
   *   * requestPermission() only ever runs inside a click handler — never on load.
   *   * A divergent write is surfaced, never retried and never forced. The three
   *     resolutions each preserve both sides (requirements 10.2).
   * ============================================================================= */
  (function (App) {
    'use strict';

    var S = App.storage;
    var esc = App.util.html.esc;

    var _folder = null;   // App.storage.folder
    var _writer = null;   // App.storage.writer
    var _hooks = null;    // {refresh, adopt, currentText}

    var st = {
      status: S.STATUS.IDLE,
      save: 'saved',            // 'dirty' | 'saving' | 'saved' | 'error'
      label: '',
      error: null,              // last normalised storage error
      diverged: null,           // the on-disk text we refused to clobber
      recovery: null,           // {issues} when project.json would not parse
      snapshots: null,          // non-null while the rollback list is open
      conflicts: [],            // suspected OneDrive conflict copies
      panel: false,             // §5.5: the folder controls, reachable at any time
      stale: false              // D-065: the folder itself could not be found
    };
    var _forceSnapshot = false; // set for the next write by a DELIBERATE save

    function log(severity, message) {
      if (App.ui && App.ui.activity) App.ui.activity.log({ severity: severity, message: message });
    }
    function refresh() { if (_hooks && _hooks.refresh) _hooks.refresh(); }

    /**
     * The single place a storage failure becomes app state. D-065: a STALE error is not
     * a passing IO hiccup — the folder is gone, so the connection is torn down here
     * rather than left looking healthy while every subsequent write fails the same way.
     */
    function note(e) {
      var err = S.err(e, 'Folder');
      st.error = err;
      // The code is appended because the browser's own wording is frequently the least
      // useful part of a storage failure — D-067 was two rounds of guessing at exactly
      // this message with no way to tell which of four conditions produced it.
      log('error', err.message + ' [' + err.code + ']');
      if (err.code === S.CODES.STALE || err.code === S.CODES.NO_FOLDER) {
        st.stale = true;
        st.status = S.STATUS.ERROR;
        st.diverged = null;
        st.snapshots = null;
        if (_folder) return _folder.markStale().then(refresh, refresh);
      }
      refresh();
      return Promise.resolve();
    }

    /* ---- lifecycle ---------------------------------------------------------- */

    /**
     * @param {{refresh:function, adopt:function(Object), currentText:function():?string}} hooks
     * @param {Object} [driverOverride] test seam — inject driverMemory
     */
    function init(hooks, driverOverride) {
      _hooks = hooks;
      var driver = driverOverride || (App.storage.driverFsa.supported() ? App.storage.driverFsa.create() : null);
      if (!driver) {
        // No File System Access API. Nothing to offer, so the chip carries it alone —
        // and the shell MUST be re-rendered, or it keeps the "Connect a folder" banner
        // painted before init ran, whose button could only do nothing.
        st.status = S.STATUS.UNSUPPORTED;
        refresh();
        return Promise.resolve(st.status);
      }
      _folder = App.storage.folder.create({ driver: driver });
      _writer = App.storage.writer.create({
        write: writeNow,
        onState: function (s, err) {
          st.save = s;
          // A failed write goes through note(), so a dead folder tears the connection
          // down here too rather than only when something else happens to notice.
          if (s === 'error' && err) { note(err); return; }
          refresh();
        }
      });
      return _folder.init()
        .then(function (status) {
          st.status = status;
          st.label = _folder.label();
          // D-065: init discards a dead handle itself and reports ERROR; pick up the
          // reason so the banner explains WHY rather than just saying something failed.
          var issue = driver.lastIssue && driver.lastIssue();
          if (status === S.STATUS.ERROR && issue) { st.error = issue; st.stale = issue.code === S.CODES.STALE; log('error', issue.message); }
          return (status === S.STATUS.READY) ? load() : null;
        })
        .then(function () { refresh(); return st.status; })
        .catch(function (e) { st.status = S.STATUS.ERROR; return note(e).then(function () { return st.status; }); });
    }

    /** Read project.json and adopt it, or raise the recovery screen. */
    function load() {
      return _folder.read().then(function (text) {
        if (text === null) {
          // A folder with no project yet. If we are already holding one, it becomes
          // the folder's project on the next write; otherwise there is nothing to do.
          log('info', 'Connected to "' + _folder.label() + '" — no project in this folder yet.');
          return null;
        }
        var res = App.projectIo.parseProject(text);
        if (!res.ok) {
          st.recovery = { issues: res.issues };
          log('error', 'project.json could not be read (' + res.issues.length + ' issue(s)) — see the recovery banner.');
          return _folder.snapshots().then(function (names) { st.snapshots = names.slice(0, 10); return null; });
        }
        st.recovery = null;
        adopt(res.value);
        log('success', 'Loaded project from "' + _folder.label() + '": ' + res.value.deviceConfigs.length + ' device(s).');
        return checkConflicts();
      });
    }

    function checkConflicts() {
      return _folder.conflictCopies().then(function (names) {
        st.conflicts = names;
        if (names.length) {
          log('warning', 'Suspected sync conflict cop' + (names.length === 1 ? 'y' : 'ies') +
            ' in the folder: ' + names.join(', ') + '. Left untouched.');
        }
      }, function () { /* listing failure is not worth blocking the load */ });
    }

    function adopt(project) { if (_hooks && _hooks.adopt) _hooks.adopt(project); }

    /* ---- writing ------------------------------------------------------------ */

    function writeNow(text) {
      var force = _forceSnapshot;
      _forceSnapshot = false;
      return _folder.write(text, { forceSnapshot: force }).then(function (res) {
        if (res.diverged) {
          st.diverged = res.onDisk;
          log('warning', 'project.json changed in the folder since this tool last wrote it — nothing was overwritten.');
          refresh();
        } else if (res.snapshot) {
          log('info', 'Snapshot taken: ' + res.snapshot);
        }
        return res;
      });
    }

    /** Called from store.onChange. Coalesced by the writer. */
    function schedule() {
      if (!_writer || !canWrite() || st.diverged) return;
      var text = _hooks && _hooks.currentText ? _hooks.currentText() : null;
      if (text !== null && text !== undefined) _writer.schedule(text);
    }

    /** Resolves once nothing is pending and nothing is in flight. */
    function flush() { return _writer ? _writer.flush() : Promise.resolve(); }

    /**
     * "Save to folder": write immediately and restart the clock. flush() already
     * disarms the pending timer and clears the cap window on success, so this is a
     * deliberate save AND a reset. It also snapshots regardless of the 5-minute floor —
     * the rollback list should hold the points the user marked, not the points a timer
     * happened to choose.
     */
    function saveNow() {
      if (!_writer || !canWrite()) return Promise.resolve(null);
      var text = _hooks && _hooks.currentText ? _hooks.currentText() : null;
      if (text === null || text === undefined) return Promise.resolve(null);
      if (st.diverged) { log('warning', 'Resolve the folder divergence first — nothing was written.'); return Promise.resolve(null); }
      _forceSnapshot = true;
      _writer.schedule(text);
      return flush().then(function () {
        _forceSnapshot = false;
        if (st.save === 'error') return null;
        log('success', 'Saved to ' + (st.label || 'the folder') + '.');
        refresh();
        return true;
      });
    }

    function canWrite() { return !!_folder && _folder.status() === S.STATUS.READY; }

    /**
     * The read-only gate. IDLE/UNSUPPORTED deliberately do NOT lock — see INVARIANTS.
     */
    function locked() {
      return st.status === S.STATUS.NEEDS_PERMISSION || st.status === S.STATUS.ERROR || !!st.recovery;
    }

    /* ---- user actions ------------------------------------------------------- */

    function connect() {
      if (!_folder) return Promise.resolve();
      return _folder.connect()
        .then(function (status) {
          st.status = status; st.label = _folder.label();
          st.error = null; st.stale = false; st.panel = false;
          if (status !== S.STATUS.READY) return null;
          return load().then(function () {
            // A project already open when the folder was chosen becomes its project.
            if (App.store.getProject()) schedule();
          });
        })
        .then(refresh)
        .catch(note);
    }

    function reconnect() {
      if (!_folder) return Promise.resolve();
      return _folder.reconnect()
        .then(function (status) {
          st.status = status;
          if (status !== S.STATUS.READY) return null;
          st.error = null;
          log('success', 'Reconnected to "' + _folder.label() + '".');
          return load();
        })
        .then(refresh)
        .catch(note);
    }

    function disconnect() {
      if (!_folder) return Promise.resolve();
      return flush()
        .then(function () { return _folder.disconnect(); })
        .then(function (status) {
          st.status = status; st.label = ''; st.diverged = null; st.recovery = null;
          log('info', 'Disconnected from the folder. Manual Save still works.');
        })
        .then(refresh)
        .catch(note);
    }

    /** Divergence, "keep mine": snapshot theirs, then overwrite. */
    function keepMine() {
      var text = _hooks.currentText();
      return _folder.forceWrite(text).then(function (res) {
        st.diverged = null;
        log('success', 'Kept this session\'s project. Their version was snapshotted first' +
          (res.snapshot ? ' (' + res.snapshot + ').' : '.'));
        refresh();
      }).catch(note);
    }

    /** Divergence, "take theirs": snapshot mine, then reload from disk. */
    function takeTheirs() {
      var mine = _hooks.currentText();
      return _folder.adoptDisk(mine).then(function (res) {
        st.diverged = null;
        if (res.text !== null) {
          var parsed = App.projectIo.parseProject(res.text);
          if (parsed.ok) adopt(parsed.value);
          else { st.recovery = { issues: parsed.issues }; }
        }
        log('success', 'Took the folder\'s version. This session\'s work was snapshotted first' +
          (res.snapshot ? ' (' + res.snapshot + ').' : '.'));
        refresh();
      }).catch(note);
    }

    /** Recovery, "start fresh": move the unreadable file aside; never overwrite it. */
    function quarantine() {
      return _folder.quarantine().then(function (name) {
        st.recovery = null;
        log('warning', 'Moved the unreadable project aside as ' + name + '. It is still there to repair.');
        refresh();
      }).catch(note);
    }

    function openSnapshots() {
      return _folder.snapshots().then(function (names) { st.snapshots = names; refresh(); }).catch(note);
    }
    function closeSnapshots() { st.snapshots = null; refresh(); }

    /**
     * Restore a snapshot. The CURRENT state is snapshotted first, so a rollback is
     * itself undoable (requirements 7.2).
     */
    function restoreSnapshot(name) {
      return _folder.readSnapshot(name).then(function (text) {
        if (text === null) { log('error', 'Snapshot ' + name + ' could not be read.'); return; }
        var res = App.projectIo.parseProject(text);
        if (!res.ok) { App.ui.activity.logIssues(res.issues, 'Snapshot restore failed'); return; }
        var mine = _hooks.currentText();
        var pre = mine ? _folder.takeSnapshot(mine) : Promise.resolve(null);
        return pre.then(function () {
          adopt(res.value);
          st.snapshots = null;
          st.recovery = null;
          log('success', 'Restored ' + name + '. The state it replaced was snapshotted first.');
          schedule();
          refresh();
        });
      }).catch(note);
    }

    /** Write generated artifacts into the folder, unpacked. */
    function writeOutputs(deviceId, command, files) {
      if (!canWrite()) return Promise.resolve(null);
      return _folder.writeOutputs(deviceId, command, files);
    }

    /* ---- rendering ---------------------------------------------------------- */

    var SAVE_LABEL = { dirty: 'unwritten', saving: 'saving…', saved: 'saved to folder', error: 'save failed' };

    /** The always-visible status chip (requirements 6.5). */
    function chipHtml() {
      var cls, text, title;
      if (st.status === S.STATUS.UNSUPPORTED) {
        cls = 'off'; text = 'No folder support'; title = 'This browser has no File System Access API. Use Save project.';
      } else if (st.status === S.STATUS.IDLE) {
        cls = 'off'; text = 'No folder'; title = 'Not connected to a folder. Manual Save still works.';
      } else if (st.status === S.STATUS.NEEDS_PERMISSION) {
        cls = 'warn'; text = 'Reconnect needed'; title = 'The folder is remembered but permission lapsed.';
      } else if (st.status === S.STATUS.ERROR) {
        cls = 'bad'; text = 'Folder error'; title = st.error ? st.error.message : 'The folder could not be reached.';
      } else {
        cls = st.save === 'error' ? 'bad' : (st.save === 'saved' ? 'good' : 'warn');
        text = esc(st.label) + ' — ' + SAVE_LABEL[st.save];
        title = 'Connected. Written 60s after the last change, and at least every 3 minutes.';
      }
      // A button, not a span: the chip is the always-present way into the folder
      // controls (§5.5), which is what makes "change folder" reachable from any state.
      return '<button type="button" class="folder-chip ' + cls + '" data-action="folder-panel"' +
        ' title="' + esc(title + ' — click for folder options') + '">' + esc(text) + '</button>';
    }

    function banner(kind, cls, body) {
      return '<div class="folder-banner ' + cls + '" role="region" aria-label="' + esc(kind) + '">' + body + '</div>';
    }

