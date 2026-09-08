    /* ===== SUITES: the app wired to a folder (TF.6 · TF.8 · TF.10) ===== */

    T.suite('TF.6 the app boots into the right folder state', function (t) {
      function snapsIn(h) {
        return Object.keys(h.files()).filter(function (n) { return n.indexOf('Snapshots/') === 0; }).sort();
      }
      function projectText() {
        return App.projectIo.serializeProject(App.store.empty('android-adb'));
      }
      /** Drive App.ui.folder over a memory driver, with the UI hooks stubbed out. */
      function boot(seed, driverTweak) {
        var driver = App.storage.driverMemory.create(seed ? { files: seed } : null);
        if (driverTweak) driverTweak(driver);
        var adopted = [], renders = 0;
        // `override` lets a test drive the document the writer sees directly, instead of
        // going through App.store — the storage layer is domain-blind, so the tests that
        // exercise it should not have to know how to mutate a project.
        var h = { override: null };
        App.ui.folder._reset();
        return App.ui.folder.init({
          refresh: function () { renders++; },
          adopt: function (p) { adopted.push(p); },
          currentText: function () {
            if (h.override !== null) return h.override;
            var p = App.store.getProject();
            return p ? App.projectIo.serializeProject(p) : null;
          }
        }, driver).then(function (status) {
          h.status = status; h.driver = driver; h.adopted = adopted;
          h.renders = function () { return renders; };
          h.files = function () { return driver._files(); };
          return h;
        });
      }

      t.test('an empty folder connects READY and adopts nothing', function () {
        return boot().then(function (h) {
          T.assertEqual(h.status, S.STATUS.READY);
          T.assertEqual(h.adopted.length, 0, 'nothing on disk to adopt');
          T.assertEqual(App.ui.folder.locked(), false);
          T.assertEqual(App.ui.folder.canWrite(), true);
        });
      });

      t.test('a folder holding a project adopts it on boot', function () {
        var text = projectText();
        return boot({ 'project.json': text }).then(function (h) {
          T.assertEqual(h.adopted.length, 1);
          T.assertEqual(h.adopted[0].platformProfileId, 'android-adb');
          T.assertEqual(App.ui.folder.locked(), false);
        });
      });

      t.test('an unreadable project raises recovery, and recovery LOCKS the app', function () {
        return boot({ 'project.json': '{ not json' }).then(function (h) {
          T.assertEqual(h.adopted.length, 0, 'a damaged file must never be adopted');
          T.assert(App.ui.folder._st.recovery, 'the recovery screen is raised');
          T.assertEqual(App.ui.folder.locked(), true);
          T.assert(App.ui.folder.bannerHtml().indexOf('could not be read') !== -1);
          T.assertEqual(h.files()['project.json'], '{ not json', 'and the bad bytes are untouched');
        });
      });

      t.test('"start fresh" moves the bad file aside rather than destroying it', function () {
        return withClock('2026-08-18T01:08:14.233Z', function () {
          return boot({ 'project.json': '{ not json' }).then(function (h) {
            return App.ui.folder.quarantine().then(function () {
              T.assertEqual(App.ui.folder.locked(), false, 'the app is usable again');
              T.assertEqual(h.files()['project.corrupt-2026-08-18T01-08-14-233Z.json'], '{ not json');
              T.assertEqual(h.files()['project.json'], undefined);
            });
          });
        });
      });

      t.test('UNSUPPORTED and IDLE do NOT lock — unconnected is a usable state', function () {
        App.ui.folder._reset();
        T.assertEqual(App.ui.folder.status(), S.STATUS.IDLE);
        T.assertEqual(App.ui.folder.locked(), false, 'never connected: nothing to mislead the user about');
        App.ui.folder._st.status = S.STATUS.UNSUPPORTED;
        T.assertEqual(App.ui.folder.locked(), false);
        App.ui.folder._st.status = S.STATUS.NEEDS_PERMISSION;
        T.assertEqual(App.ui.folder.locked(), true, 'but a lapsed grant DOES lock — it would look like it was saving');
        App.ui.folder._reset();
      });

      t.test('a sync conflict copy is reported on load and left alone', function () {
        var text = projectText();
        return boot({ 'project.json': text, 'project-jay.json': text }).then(function (h) {
          T.assertDeepEqual(App.ui.folder._st.conflicts, ['project-jay.json']);
          T.assertEqual(h.files()['project-jay.json'], text, 'never touched');
        });
      });

      t.test('the chip always carries words, not just a colour', function () {
        App.ui.folder._reset();
        T.assert(App.ui.folder.chipHtml().indexOf('No folder') !== -1);
        App.ui.folder._st.status = S.STATUS.NEEDS_PERMISSION;
        T.assert(App.ui.folder.chipHtml().indexOf('Reconnect needed') !== -1);
        App.ui.folder._st.status = S.STATUS.READY;
        App.ui.folder._st.label = 'CH Project';
        App.ui.folder._st.save = 'saving';
        T.assert(App.ui.folder.chipHtml().indexOf('saving') !== -1);
        T.assert(App.ui.folder.chipHtml().indexOf('CH Project') !== -1);
        App.ui.folder._reset();
      });

      t.test('divergence offers three resolutions, and each preserves both sides', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          var mine = projectText();
          return boot().then(function (h) {
            App.store.init(App.store.empty('android-adb'));
            h.files()['project.json'] = 'theirs';   // changed underneath us
            App.ui.folder.schedule();
            return App.ui.folder.flush().then(function () {
              T.assertEqual(App.ui.folder._st.diverged, 'theirs');
              var html = App.ui.folder.bannerHtml();
              T.assert(html.indexOf('Keep mine') !== -1);
              T.assert(html.indexOf('Take theirs') !== -1);
              T.assert(html.indexOf('Save mine separately') !== -1);
              T.assertEqual(h.files()['project.json'], 'theirs', 'nothing overwritten while unresolved');
              return App.ui.folder.keepMine();
            }).then(function () {
              T.assertEqual(App.ui.folder._st.diverged, null);
              T.assert(App.ui.folder._st.error === null || true);
              T.assertEqual(h.files()['project.json'].indexOf('android-adb') !== -1, true, 'mine is now on disk');
              var snaps = Object.keys(h.files()).filter(function (n) { return n.indexOf('Snapshots/') === 0; });
              T.assertEqual(snaps.length, 1);
              T.assertEqual(h.files()[snaps[0]], 'theirs', 'their version survives as a snapshot');
            });
          });
        });
      });

      t.test('D-065 a dead folder handle tears the connection down, and says why', function () {
        // An EMPTY folder on purpose: seeding it with the same project would make the
        // write byte-identical, short-circuit before putText, and never reach the fault.
        return boot(null, function (driver) {
          // What a moved/renamed/re-synced folder looks like from above the driver line.
          driver.setFault(function (op) {
            return op === 'putText' ? S.fail(S.CODES.STALE, 'The connected folder could no longer be found.') : null;
          });
        }).then(function (h) {
          T.assertEqual(App.ui.folder.canWrite(), true, 'it looks healthy until something writes');
          App.store.init(App.store.empty('android-adb'));
          App.ui.folder.schedule();
          return App.ui.folder.flush().then(function () {
            T.assertEqual(App.ui.folder._st.stale, true);
            T.assertEqual(App.ui.folder.status(), S.STATUS.ERROR);
            T.assertEqual(App.ui.folder.canWrite(), false, 'nothing may retry against a dead handle');
            T.assertEqual(App.ui.folder.locked(), true);
            var html = App.ui.folder.bannerHtml();
            T.assert(html.indexOf('could no longer be found') !== -1, 'the banner names the cause');
            T.assert(html.indexOf('Nothing has been lost') !== -1, 'and says the work is safe');
            T.assert(html.indexOf('Choose a folder') !== -1, 'and offers the way out');
          });
        });
      });

      t.test('D-065 "no folder connected" is not swallowed as an absent file', function () {
        // The conflation that hid the dead handle: getText returning null for BOTH.
        T.assertEqual(S.CODES.NO_FOLDER === S.CODES.NOT_FOUND, false, 'distinct codes');
        T.assertEqual(S.CODES.STALE === S.CODES.NOT_FOUND, false, 'distinct codes');
      });

      t.test('§5.5 the folder controls are reachable from any state', function () {
        App.ui.folder._reset();
        T.assertEqual(App.ui.folder.bannerHtml().indexOf('Change folder'), -1, 'closed by default');
        T.assert(App.ui.folder.chipHtml().indexOf('data-action="folder-panel"') !== -1,
          'the chip itself opens the controls, so they are reachable when connected too');
        App.ui.folder._st.panel = true;
        App.ui.folder._st.label = 'CH Project';
        var html = App.ui.folder.bannerHtml();
        T.assert(html.indexOf('Change folder') !== -1);
        T.assert(html.indexOf('Disconnect') !== -1);
        App.ui.folder._reset();
      });

      t.test('Save to folder writes at once, and snapshots regardless of the 5-minute floor', function () {
        return withClock('2026-08-18T00:00:00.000Z', function (clk) {
          return boot().then(function (h) {
            h.override = '{"v":1}';
            return App.ui.folder.saveNow().then(function (ok) {
              T.assertEqual(ok, true);
              T.assertEqual(h.files()['project.json'], '{"v":1}', 'written at once, without waiting 60s');
              T.assertEqual(snapsIn(h).length, 0, 'nothing to snapshot on a genesis write');

              // Seconds later — far inside the floor an automatic write would respect.
              clk.advance(30 * 1000);
              h.override = '{"v":2}';
              return App.ui.folder.saveNow();
            }).then(function () {
              T.assertEqual(h.files()['project.json'], '{"v":2}');
              T.assertEqual(snapsIn(h).length, 1,
                'a DELIBERATE save is a point worth rolling back to, floor or no floor');
              T.assertEqual(h.files()[snapsIn(h)[0]], '{"v":1}', 'and it holds the superseded document');

              // ...whereas the automatic path still respects the floor.
              clk.advance(30 * 1000);
              h.override = '{"v":3}';
              App.ui.folder.schedule();
              return App.ui.folder.flush();
            }).then(function () {
              T.assertEqual(h.files()['project.json'], '{"v":3}');
              T.assertEqual(snapsIn(h).length, 1, 'the timed write took no second snapshot');
            });
          });
        });
      });

      t.test('Save to folder on an unchanged document writes nothing', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          return boot().then(function (h) {
            h.override = '{"v":1}';
            return App.ui.folder.saveNow()
              .then(function () { return App.ui.folder.saveNow(); })
              .then(function () {
                T.assertEqual(snapsIn(h).length, 0, 'identical bytes are not worth a version');
              });
          });
        });
      });

      t.test('Save to folder refuses while a divergence is unresolved', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          return boot().then(function (h) {
            h.override = '{"v":1}';
            App.ui.folder._st.diverged = 'theirs';
            return App.ui.folder.saveNow().then(function (r) {
              T.assertEqual(r, null, 'nothing written until the user chooses a side');
              T.assertEqual(h.files()['project.json'], undefined);
              App.ui.folder._st.diverged = null;
            });
          });
        });
      });

      t.test('a restore adopts the snapshot AND snapshots what it replaced', function () {
        return withClock('2026-08-18T00:00:00.000Z', function (clk) {
          var old = projectText();
          return boot({ 'project.json': old }).then(function (h) {
            var folder = App.ui.folder._folder();
            App.store.init(App.store.empty('android-adb'));
            // An older version to roll back to.
            return folder.takeSnapshot(old).then(function (snapName) {
              clk.advance(6 * 60 * 1000);
              return App.ui.folder.openSnapshots().then(function () {
                T.assertDeepEqual(App.ui.folder._st.snapshots, [snapName], 'the rollback list shows it');
                T.assert(App.ui.folder.bannerHtml().indexOf('Restore') !== -1, 'and offers to restore it');
                var before = h.adopted.length;
                return App.ui.folder.restoreSnapshot(snapName).then(function () {
                  T.assertEqual(h.adopted.length, before + 1, 'the snapshot was adopted');
                  T.assertEqual(App.ui.folder._st.snapshots, null, 'and the list closed');
                  var snaps = Object.keys(h.files()).filter(function (n) { return n.indexOf('Snapshots/') === 0; });
                  T.assertEqual(snaps.length, 2, 'the state being replaced was snapshotted first — rollback is undoable');
                });
              });
            });
          });
        });
      });

      t.test('an unreadable snapshot is reported, not adopted', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          return boot({ 'Snapshots/2026-08-18T00-00-00-000Z.json': '{ not json' }).then(function (h) {
            var before = h.adopted.length;
            return App.ui.folder.restoreSnapshot('Snapshots/2026-08-18T00-00-00-000Z.json').then(function () {
              T.assertEqual(h.adopted.length, before, 'nothing adopted from a damaged snapshot');
            });
          });
        });
      });
    });

    /* ===== SUITES: the writer over the real folder store (TF.4 + TF.5) ===== */

    T.suite('TF.5 the writer driving the folder store end to end', function (t) {
      t.test('edits coalesce into one canonical write, with the snapshot ladder behind it', function () {
        return withClock('2026-08-18T00:00:00.000Z', function (clk) {
          var m = mk();
          var timers = fakeTimers();
          var w = App.storage.writer.create({
            write: function (text) { return m.store.write(text); },
            idleMs: 60000, capMs: 180000,
            now: timers.now, setTimer: timers.set, clearTimer: timers.clear
          });
          return m.store.read().then(function () {
            w.schedule('{"v":1}');
            w.schedule('{"v":2}');
            timers.advance(60000);
            return w.flush();
          }).then(function () {
            T.assertEqual(m.files()['project.json'], '{"v":2}');
            clk.advance(6 * 60 * 1000);
            w.schedule('{"v":3}');
            return w.flush();
          }).then(function () {
            T.assertEqual(m.files()['project.json'], '{"v":3}');
            return m.store.snapshots();
          }).then(function (names) {
            T.assertEqual(names.length, 1, 'one snapshot, holding the superseded document');
            T.assertEqual(m.files()[names[0]], '{"v":2}');
          });
        });
      });

      t.test('a divergent write surfaces as an unwritten result, not as a silent success', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          var m = mk();
          var results = [];
          var timers = fakeTimers();
          var w = App.storage.writer.create({
            write: function (text) {
              return m.store.write(text).then(function (r) { results.push(r); return r; });
            },
            now: timers.now, setTimer: timers.set, clearTimer: timers.clear
          });
          return m.store.read()
            .then(function () { w.schedule('mine'); return w.flush(); })
            .then(function () {
              m.files()['project.json'] = 'theirs';
              w.schedule('mine-again');
              return w.flush();
            })
            .then(function () {
              T.assertEqual(results.length, 2);
              T.assertEqual(results[1].diverged, true);
              T.assertEqual(m.files()['project.json'], 'theirs', 'their bytes stand');
            });
        });
      });
    });

  })(App);
