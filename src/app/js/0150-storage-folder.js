  /* =============================================================================
   * MODULE: App.storage.folder  — TF.4: the layout, the snapshot policy, the guard
   * PURPOSE: Everything the storage layer decides, sitting above a driver that only
   *          moves named text. Owns the on-disk layout, the snapshot-before-write
   *          policy, pruning, quarantine, the concurrent-write guard, and the
   *          Outputs tree. Domain-blind: it moves one opaque text document and knows
   *          nothing about projects, devices or decisions.
   * PURITY:  impure (drives a driver). No DOM.
   * DEPENDS: App.storage, App.util.hash, App.util.clock
   * INVARIANTS:
   *   * NAME HAZARD: this is NOT App.store. See App.storage's banner.
   *   * Timestamps come from App.util.clock ONLY, so snapshot filenames are
   *     deterministic under an injected clock. Date is used solely to DIFFERENCE two
   *     ISO strings that the clock supplied; it is never a source of time.
   *   * Stamps are ISO with [:.] -> '-', which is both filename-safe and
   *     lexicographically sortable, so listing newest-first is sort().reverse() with
   *     no parsing.
   *   * write() NEVER overwrites a file that changed underneath us. It reports
   *     divergence and leaves both sides intact (requirements 10.1).
   *   * quarantine() RENAMES by copy-then-delete, and only deletes once the copy has
   *     been written. Starting fresh must never be the same act as destroying the
   *     only copy a human could repair.
   *   * Nothing outside the paths below is ever read, written or deleted.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var S = App.storage;

    var STATE_FILE = 'project.json';
    var SNAP_DIR = 'Snapshots';
    var OUT_DIR = 'Outputs';
    var CORRUPT_PREFIX = 'project.corrupt-';

    var SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000; // requirements 7.1
    var SNAPSHOT_KEEP = 40;

    /** ISO -> filename-safe, sortable stamp. */
    function isoToStamp(iso) { return String(iso).replace(/[:.]/g, '-'); }

    /** The inverse, for differencing only. Returns null for an unrecognised name. */
    function stampToIso(stamp) {
      var m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(String(stamp));
      return m ? m[1] + 'T' + m[2] + ':' + m[3] + ':' + m[4] + '.' + m[5] + 'Z' : null;
    }

    /** Snapshot filename -> its stamp, or null if the name is not one of ours. */
    function stampOf(name) {
      var m = /(?:^|\/)([0-9T:\-]+Z)\.json$/.exec(String(name));
      return m ? m[1] : null;
    }

    /**
     * @param {{driver:Object, clock?:Object}} opts
     * @returns {Object}
     */
    function create(opts) {
      var driver = opts.driver;
      var clock = opts.clock || App.util.clock;
      var status = S.STATUS.IDLE;
      // The hash of the bytes we last wrote or last read. The divergence guard's
      // whole basis: if what is on disk no longer hashes to this, someone else
      // changed it and we must not write over them.
      var lastKnownHash = null;

      function sha(text) { return App.util.hash.sha256Hex(String(text)); }
      function now() { return clock.nowIso(); }
      function msBetween(isoLater, isoEarlier) {
        var a = Date.parse(isoLater), b = Date.parse(isoEarlier);
        return (isNaN(a) || isNaN(b)) ? Infinity : (a - b);
      }

      function setStatus(s) { status = s; return s; }
      function getStatus() { return status; }
      function canWrite() { return status === S.STATUS.READY; }
      function label() { return driver.label; }

      function init() { return driver.init().then(setStatus); }

      function connect() {
        return driver.pickFolder().then(function (s) {
          if (s === null) return status;    // cancelled — unchanged, and not an error
          lastKnownHash = null;             // a different folder: no baseline yet
          return setStatus(s);
        });
      }

      function reconnect() { return driver.requestAccess().then(setStatus); }

      function disconnect() {
        lastKnownHash = null;
        return driver.forget().then(setStatus);
      }

      /**
       * D-065 (§9.3): the folder is gone. Discard the dead handle so nothing retries
       * against it, but hold ERROR rather than dropping to IDLE — IDLE would render the
       * ordinary "connect a folder" invitation and quietly lose the explanation.
       */
      function markStale() {
        lastKnownHash = null;
        return Promise.resolve(driver.forget ? driver.forget() : null)
          .then(function () { return setStatus(S.STATUS.ERROR); }, function () { return setStatus(S.STATUS.ERROR); });
      }

      /**
       * Read the canonical document and adopt it as the divergence baseline.
       * @returns {Promise<string|null>} null when the folder holds no project yet.
       */
      function read() {
        return driver.getText(STATE_FILE).then(function (text) {
          lastKnownHash = (text === null) ? null : sha(text);
          return text;
        });
      }

      /** Snapshot names, newest first. */
      function snapshots() {
        return driver.listDir(SNAP_DIR).then(function (names) {
          return names.filter(function (n) { return stampOf(n); }).sort().reverse();
        });
      }

      function readSnapshot(name) { return driver.getText(name); }

      /** Write `text` to Snapshots/<stamp>.json and prune to the newest SNAPSHOT_KEEP. */
      function takeSnapshot(text) {
        var name = SNAP_DIR + '/' + isoToStamp(now()) + '.json';
        return driver.putText(name, text).then(prune).then(function () { return name; });
      }

      function prune() {
        return snapshots().then(function (names) {
          var doomed = names.slice(SNAPSHOT_KEEP);
          var p = Promise.resolve();
          doomed.forEach(function (n) { p = p.then(function () { return driver.removeName(n); }); });
          return p;
        });
      }

      /** True when the newest snapshot is old enough that another one is warranted. */
      function snapshotDue() {
        return snapshots().then(function (names) {
          if (!names.length) return true;
          var iso = stampToIso(stampOf(names[0]));
          if (!iso) return true;
          return msBetween(now(), iso) >= SNAPSHOT_MIN_INTERVAL_MS;
        });
      }

      /**
       * The canonical write. Refuses rather than clobbers.
       * @param {string} text
       * @param {{forceSnapshot?:boolean}} [opts] forceSnapshot bypasses the 5-minute floor,
       *        for a DELIBERATE save — that is a point the user thinks is significant, so
       *        it should be in the rollback list whether or not a timer agrees.
       * @returns {Promise<{written:boolean, diverged:boolean, snapshot:string|null, onDisk:string|null}>}
       */
      function write(text, opts) {
        var force = !!(opts && opts.forceSnapshot);
        return driver.getText(STATE_FILE).then(function (current) {
          if (current !== null && (lastKnownHash === null || sha(current) !== lastKnownHash)) {
            // Changed underneath us — another machine, another tab, or a synced edit.
            return { written: false, diverged: true, snapshot: null, onDisk: current };
          }
          if (current === text) {
            // Byte-identical: nothing to do, and nothing worth a version.
            return { written: false, diverged: false, snapshot: null, onDisk: current };
          }
          var pre = (current === null) ? Promise.resolve(null)
            : force ? takeSnapshot(current)
            : snapshotDue().then(function (due) { return due ? takeSnapshot(current) : null; });
          return pre.then(function (snapName) {
            return driver.putText(STATE_FILE, text).then(function () {
              lastKnownHash = sha(text);
              return { written: true, diverged: false, snapshot: snapName, onDisk: null };
            });
          });
        });
      }

      /**
       * "Keep mine" (requirements 10.2): snapshot whatever is on disk, then overwrite.
       * @returns {Promise<{written:boolean, snapshot:string|null}>}
       */
      function forceWrite(text) {
        return driver.getText(STATE_FILE).then(function (current) {
          var pre = (current === null || current === text) ? Promise.resolve(null) : takeSnapshot(current);
          return pre.then(function (snapName) {
            return driver.putText(STATE_FILE, text).then(function () {
              lastKnownHash = sha(text);
              return { written: true, snapshot: snapName };
            });
          });
        });
      }

      /**
       * "Take theirs" (requirements 10.2): snapshot my unsaved state so it is not lost,
       * then hand back what is on disk and adopt it as the baseline.
       * @param {string|null} myText the state being abandoned; snapshotted first
       */
      function adoptDisk(myText) {
        var pre = myText ? takeSnapshot(myText) : Promise.resolve(null);
        return pre.then(function (snapName) {
          return read().then(function (text) { return { text: text, snapshot: snapName }; });
        });
      }

      /**
       * Move an unreadable project.json aside. Copy first, delete only once the copy
       * exists — see INVARIANTS.
       * @returns {Promise<string|null>} the quarantine filename, or null if there was nothing to move.
       */
      function quarantine() {
        return driver.getText(STATE_FILE).then(function (current) {
          if (current === null) return null;
          var name = CORRUPT_PREFIX + isoToStamp(now()) + '.json';
          return driver.putText(name, current)
            .then(function () { return driver.removeName(STATE_FILE); })
            .then(function () { lastKnownHash = null; return name; });
        });
      }

      /**
       * Write generated artifacts UNPACKED (requirements 9.1). Sequential on purpose:
       * a burst of parallel writes is exactly what makes a sync client complain.
       * @param {string} deviceId
       * @param {string} command
       * @param {Array<{name:string,content:string}>} files
       * @returns {Promise<string[]>} the paths written
       */
      function writeOutputs(deviceId, command, files) {
        var base = OUT_DIR + '/' + deviceId + '/' + command + '/';
        var written = [];
        var p = Promise.resolve();
        (files || []).forEach(function (f) {
          p = p.then(function () {
            var path = base + S.normName(f.name);
            return driver.putText(path, f.content).then(function () { written.push(path); });
          });
        });
        return p.then(function () { return written; });
      }

      /**
       * Root .json files that are not ours — typically a OneDrive conflict copy
       * ("project-jay.json"). Reported, never touched (requirements 10.3, 3.3).
       */
      function conflictCopies() {
        return driver.listDir('').then(function (names) {
          return names.filter(function (n) {
            return /\.json$/i.test(n) && n !== STATE_FILE && n.indexOf(CORRUPT_PREFIX) !== 0;
          }).sort();
        });
      }

      return {
        STATE_FILE: STATE_FILE, SNAP_DIR: SNAP_DIR, OUT_DIR: OUT_DIR,
        CORRUPT_PREFIX: CORRUPT_PREFIX, SNAPSHOT_KEEP: SNAPSHOT_KEEP,
        SNAPSHOT_MIN_INTERVAL_MS: SNAPSHOT_MIN_INTERVAL_MS,
        driver: driver,
        status: getStatus, canWrite: canWrite, label: label,
        init: init, connect: connect, reconnect: reconnect, disconnect: disconnect,
        markStale: markStale,
        read: read, write: write, forceWrite: forceWrite, adoptDisk: adoptDisk,
        snapshots: snapshots, readSnapshot: readSnapshot, takeSnapshot: takeSnapshot,
        snapshotDue: snapshotDue, prune: prune,
        quarantine: quarantine, writeOutputs: writeOutputs, conflictCopies: conflictCopies,
        // test-only reach-ins
        _baseline: function () { return lastKnownHash; },
        _setStatus: setStatus
      };
    }

    App.storage.folder = {
      create: create, isoToStamp: isoToStamp, stampToIso: stampToIso, stampOf: stampOf
    };
  })(App);
