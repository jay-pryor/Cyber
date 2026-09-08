  /* =============================================================================
   * FOLDER-STORAGE SELF-TEST SUITES (TF.1–TF.5)
   * Everything above the driver line, run against driverMemory in plain jsdom.
   * showDirectoryPicker() cannot be driven by any headless test — there is no picker
   * to click — which is precisely why the driver line sits where it does and why
   * driverFsa is kept thin enough that hand-verification is credible
   * (folder-storage-requirements.md 13.2).
   * These suites are ASYNC: they return promises, which the harness awaits.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var T = App.test;
    var S = App.storage;
    var F = App.storage.folder;

    /* ---- shared helpers ---- */

    /** Run fn under a controllable clock; always restores the real one. */
    function withClock(startIso, fn) {
      var t = Date.parse(startIso);
      App.util.clock.setClock(function () { return new Date(t); });
      var ctl = {
        advance: function (ms) { t += ms; },
        iso: function () { return new Date(t).toISOString(); }
      };
      var done = function () { App.util.clock.resetClock(); };
      var out;
      try { out = fn(ctl); } catch (e) { done(); throw e; }
      return Promise.resolve(out).then(
        function (v) { done(); return v; },
        function (e) { done(); throw e; }
      );
    }

    /** A folder store over a fresh in-memory driver. */
    function mk(seed) {
      var driver = App.storage.driverMemory.create(seed ? { files: seed } : null);
      var store = F.create({ driver: driver });
      store._setStatus(S.STATUS.READY);
      return { store: store, driver: driver, files: function () { return driver._files(); } };
    }

    /** Virtual timers, so the debounce is tested without waiting three real minutes. */
    function fakeTimers() {
      var q = [], nextId = 1, t = 0;
      return {
        now: function () { return t; },
        set: function (fn, ms) { var e = { id: nextId++, at: t + ms, fn: fn }; q.push(e); return e.id; },
        clear: function (id) { q = q.filter(function (e) { return e.id !== id; }); },
        advance: function (ms) {
          t += ms;
          var due = q.filter(function (e) { return e.at <= t; }).sort(function (a, b) { return a.at - b.at; });
          q = q.filter(function (e) { return e.at > t; });
          due.forEach(function (e) { e.fn(); });
        }
      };
    }

    function deferred() {
      var d = {};
      d.promise = new Promise(function (res, rej) { d.resolve = res; d.reject = rej; });
      return d;
    }

    /** Settle the microtask queue so a drain that is already running can finish. */
    function tick(n) {
      var p = Promise.resolve();
      for (var i = 0; i < (n || 6); i++) p = p.then(function () {});
      return p;
    }

    /* ===== SUITES: paths and the driver contract (TF.2) ===== */

    T.suite('TF.2 storage path helpers', function (t) {
      t.test('normName strips a leading ./ and collapses slashes', function () {
        T.assertEqual(S.normName('./Snapshots//a.json'), 'Snapshots/a.json');
        T.assertEqual(S.normName('/project.json'), 'project.json');
        T.assertEqual(S.normName('Outputs\\dev\\a.txt'), 'Outputs/dev/a.txt');
      });
      t.test('dirOf returns the containing directory', function () {
        T.assertEqual(S.dirOf('Snapshots/a.json'), 'Snapshots');
        T.assertEqual(S.dirOf('project.json'), '');
        T.assertEqual(S.dirOf('Outputs/d/c/x.sh'), 'Outputs/d/c');
      });
      t.test('isChildOf is a DIRECTORY test, not a prefix match', function () {
        T.assertEqual(S.isChildOf('Snapshots/a.json', 'Snapshots'), true);
        T.assertEqual(S.isChildOf('Snapshots/deep/a.json', 'Snapshots'), false, 'not an immediate child');
        T.assertEqual(S.isChildOf('project.json', ''), true);
        T.assertEqual(S.isChildOf('Snapshots/a.json', ''), false, 'root listing must not see snapshots');
      });
    });

    T.suite('TF.2 driverMemory honours the driver contract', function (t) {
      t.test('put then get round-trips; absent reads as null', function () {
        var d = App.storage.driverMemory.create();
        return d.putText('a/b.json', 'hello')
          .then(function () { return d.getText('a/b.json'); })
          .then(function (v) {
            T.assertEqual(v, 'hello');
            return d.getText('nope.json');
          })
          .then(function (v) { T.assertEqual(v, null); });
      });

      t.test('listDir lists immediate FILE children only, sorted', function () {
        var d = App.storage.driverMemory.create({ files: {
          'project.json': '{}', 'Snapshots/b.json': '1', 'Snapshots/a.json': '2',
          'Outputs/dev/impl/x.sh': '3'
        } });
        return d.listDir('Snapshots').then(function (n) {
          T.assertDeepEqual(n, ['Snapshots/a.json', 'Snapshots/b.json']);
          return d.listDir('');
        }).then(function (n) {
          T.assertDeepEqual(n, ['project.json'], 'the root listing must not descend');
        });
      });

      t.test('removeName on an absent file is not an error', function () {
        var d = App.storage.driverMemory.create();
        return d.removeName('gone.json').then(function () { T.assert(true); });
      });

      t.test('fault injection rejects the nominated op only', function () {
        var d = App.storage.driverMemory.create();
        d.setFault(function (op, name) {
          return (op === 'putText' && name === 'boom.json') ? S.fail(S.CODES.LOCKED, 'locked by sync') : null;
        });
        return d.putText('fine.json', 'x')
          .then(function () { return d.putText('boom.json', 'x'); })
          .then(function () { throw new Error('expected the write to reject'); },
            function (e) { T.assertEqual(e.code, S.CODES.LOCKED); });
      });
    });

    /* ===== SUITES: real DOMExceptions, not synthetic stand-ins (D-067) ===== */

    T.suite('D-067 a real DOMException is normalised, not waved through', function (t) {
      /** The actual object the File System Access API throws — not a hand-rolled stand-in. */
      function domEx(name, message) {
        return new window.DOMException(message || 'boom', name);
      }

      t.test('DOMException carries a truthy legacy numeric code — the trap itself', function () {
        var e = domEx('NotFoundError', 'A requested file or directory could not be found.');
        T.assertEqual(typeof e.code, 'number', 'legacy DOM code, NOT one of ours');
        T.assert(!!e.code, 'and it is TRUTHY — which is what defeated `e.code ? e : err(e)`');
        T.assertEqual(S.isErr(e), false, 'so identity must not be decided by .code');
      });

      t.test('err() converts it, brands it, and keeps the context', function () {
        var n = S.err(domEx('NotFoundError', 'gone'), 'Write project.json');
        T.assertEqual(S.isErr(n), true);
        T.assertEqual(n.code, S.CODES.NOT_FOUND, 'a STRING code, not 8');
        T.assertEqual(n.message, 'Write project.json: gone', 'the operation and file survive');
      });

      t.test('err() is idempotent, so every catch path can call it blind', function () {
        var once = S.err(domEx('NotAllowedError'), 'Reconnect');
        var twice = S.err(once, 'Something else');
        T.assertEqual(twice, once, 'the same object, not re-wrapped');
        T.assertEqual(twice.message.indexOf('Something else'), -1, 'and not re-prefixed');
      });

      t.test('every DOMException the spec names maps to a code we act on', function () {
        T.assertEqual(S.err(domEx('AbortError')).code, S.CODES.ABORTED);
        T.assertEqual(S.err(domEx('NotAllowedError')).code, S.CODES.DENIED);
        T.assertEqual(S.err(domEx('NotFoundError')).code, S.CODES.NOT_FOUND);
        T.assertEqual(S.err(domEx('NoModificationAllowedError')).code, S.CODES.LOCKED);
        T.assertEqual(S.err(domEx('QuotaExceededError')).code, S.CODES.QUOTA);
        T.assertEqual(S.err(domEx('SomethingUnheardOf')).code, S.CODES.IO, 'unknown reports verbatim');
      });

      t.test('a driver throwing a REAL DOMException still reaches the folder store as ours', function () {
        var m = mk();
        m.driver.setFault(function (op) {
          // Thrown exactly as the browser would, with no code of our own attached.
          return op === 'putText' ? domEx('NotFoundError', 'A requested file or directory could not be found.') : null;
        });
        return m.store.write('{"v":1}').then(
          function () { throw new Error('expected the write to reject'); },
          function (e) {
            T.assertEqual(S.isErr(e), true, 'normalised on the way out of the driver');
            T.assertEqual(e.code, S.CODES.NOT_FOUND);
            T.assert(e.message.indexOf('project.json') !== -1, 'and it says WHICH file');
          }
        );
      });

      t.test('the app tears down on a real DOMException-shaped stale failure', function () {
        var driver = App.storage.driverMemory.create();
        driver.setFault(function (op) {
          return op === 'putText' ? domEx('NotFoundError', 'A requested file or directory could not be found.') : null;
        });
        App.ui.folder._reset();
        return App.ui.folder.init({
          refresh: function () {}, adopt: function () {},
          currentText: function () { return '{"v":1}'; }
        }, driver).then(function () {
          return App.ui.folder.saveNow();
        }).then(function () {
          // A memory driver's root is always alive, so this classifies as a genuine
          // NOT_FOUND rather than STALE — the point is that it is OURS, with context,
          // instead of the browser's bare wording reaching the user.
          T.assertEqual(S.isErr(App.ui.folder._st.error), true);
          T.assert(App.ui.folder._st.error.message.indexOf('project.json') !== -1,
            'the drawer now says which file, not just that something was not found');
          App.ui.folder._reset();
        });
      });
    });

    /* ===== SUITES: the snapshot policy (TF.4 · requirements 7.1) ===== */

    T.suite('TF.4 snapshots are due on a 5-minute floor and pruned to 40', function (t) {
      t.test('stamps are filename-safe, sortable, and reversible', function () {
        var stamp = F.isoToStamp('2026-08-18T01:08:14.233Z');
        T.assertEqual(stamp, '2026-08-18T01-08-14-233Z');
        T.assertEqual(F.stampToIso(stamp), '2026-08-18T01:08:14.233Z');
        T.assert(/^[A-Za-z0-9T\-]+Z$/.test(stamp), 'no character a filesystem would object to');
        T.assert('2026-08-18T01-08-14-233Z' < '2026-08-18T01-09-00-000Z', 'sorts chronologically');
      });

      t.test('the first snapshot is always due; a second within 5 minutes is not', function () {
        return withClock('2026-08-18T00:00:00.000Z', function (clk) {
          var m = mk();
          return m.store.snapshotDue()
            .then(function (due) {
              T.assertEqual(due, true, 'nothing on disk yet');
              return m.store.takeSnapshot('v1');
            })
            .then(function () {
              clk.advance(4 * 60 * 1000);
              return m.store.snapshotDue();
            })
            .then(function (due) {
              T.assertEqual(due, false, '4 minutes is inside the floor');
              clk.advance(61 * 1000);
              return m.store.snapshotDue();
            })
            .then(function (due) { T.assertEqual(due, true, 'past 5 minutes'); });
        });
      });

      t.test('prune keeps exactly the newest 40', function () {
        return withClock('2026-08-18T00:00:00.000Z', function (clk) {
          var m = mk();
          var p = Promise.resolve();
          for (var i = 0; i < 45; i++) {
            p = p.then(function () {
              clk.advance(6 * 60 * 1000);
              return m.store.takeSnapshot('v');
            });
          }
          return p.then(function () { return m.store.snapshots(); })
            .then(function (names) {
              T.assertEqual(names.length, 40, 'pruned to SNAPSHOT_KEEP');
              T.assert(names[0] > names[names.length - 1], 'newest first');
            });
        });
      });

      t.test('snapshot filenames are deterministic under a fixed clock', function () {
        return withClock('2026-08-18T01:08:14.233Z', function () {
          var m = mk();
          return m.store.takeSnapshot('x').then(function (name) {
            T.assertEqual(name, 'Snapshots/2026-08-18T01-08-14-233Z.json');
          });
        });
      });
    });

    /* ===== SUITES: the canonical write (TF.4 · requirements 6.2, 7.1) ===== */

    T.suite('TF.4 the canonical write', function (t) {
      t.test('the first write creates project.json and takes no snapshot', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          var m = mk();
          return m.store.read()
            .then(function (text) {
              T.assertEqual(text, null, 'an empty folder holds no project');
              return m.store.write('{"a":1}');
            })
            .then(function (res) {
              T.assertEqual(res.written, true);
              T.assertEqual(res.snapshot, null, 'nothing to snapshot on a genesis write');
              T.assertEqual(m.files()['project.json'], '{"a":1}');
            });
        });
      });

      t.test('a byte-identical write is a no-op — no version worth recording', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          var m = mk();
          return m.store.read()
            .then(function () { return m.store.write('{"a":1}'); })
            .then(function () { return m.store.write('{"a":1}'); })
            .then(function (res) {
              T.assertEqual(res.written, false);
              T.assertEqual(res.diverged, false);
              return m.store.snapshots();
            })
            .then(function (n) { T.assertEqual(n.length, 0); });
        });
      });

      t.test('overwriting snapshots the previous contents once the floor has passed', function () {
        return withClock('2026-08-18T00:00:00.000Z', function (clk) {
          var m = mk();
          return m.store.read()
            .then(function () { return m.store.write('one'); })
            .then(function () { clk.advance(6 * 60 * 1000); return m.store.write('two'); })
            .then(function (res) {
              T.assert(res.snapshot, 'a snapshot was taken');
              T.assertEqual(m.files()[res.snapshot], 'one', 'the snapshot holds the PREVIOUS bytes');
              T.assertEqual(m.files()['project.json'], 'two');
              clk.advance(60 * 1000);
              return m.store.write('three');
            })
            .then(function (res) {
              T.assertEqual(res.written, true);
              T.assertEqual(res.snapshot, null, 'inside the 5-minute floor, no second snapshot');
            });
        });
      });
    });

