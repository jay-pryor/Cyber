    /* ===== SUITES: the concurrent-write guard (TF.4 · requirements 10) ===== */

    T.suite('TF.4 the guard refuses to clobber', function (t) {
      t.test('a change underneath us is reported, and nothing is written', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          var m = mk();
          return m.store.read()
            .then(function () { return m.store.write('mine-1'); })
            .then(function () {
              m.files()['project.json'] = 'theirs'; // another machine, via the sync client
              return m.store.write('mine-2');
            })
            .then(function (res) {
              T.assertEqual(res.written, false);
              T.assertEqual(res.diverged, true);
              T.assertEqual(res.onDisk, 'theirs');
              T.assertEqual(m.files()['project.json'], 'theirs', 'their bytes are intact');
            });
        });
      });

      t.test('a project.json we have never read is treated as divergent, not as ours', function () {
        var m = mk({ 'project.json': 'someone-elses' });
        return m.store.write('mine').then(function (res) {
          T.assertEqual(res.diverged, true, 'no baseline means no licence to overwrite');
          T.assertEqual(m.files()['project.json'], 'someone-elses');
        });
      });

      t.test('"keep mine" snapshots their version first, then overwrites', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          var m = mk();
          return m.store.read()
            .then(function () { return m.store.write('mine-1'); })
            .then(function () {
              m.files()['project.json'] = 'theirs';
              return m.store.forceWrite('mine-2');
            })
            .then(function (res) {
              T.assertEqual(res.written, true);
              T.assertEqual(m.files()[res.snapshot], 'theirs', 'their version survives as a snapshot');
              T.assertEqual(m.files()['project.json'], 'mine-2');
              return m.store.write('mine-3'); // baseline re-adopted, so this proceeds
            })
            .then(function (res) { T.assertEqual(res.written, true); });
        });
      });

      t.test('"take theirs" snapshots my unsaved state before handing theirs back', function () {
        return withClock('2026-08-18T00:00:00.000Z', function () {
          var m = mk({ 'project.json': 'theirs' });
          return m.store.adoptDisk('my-unsaved-work').then(function (res) {
            T.assertEqual(res.text, 'theirs');
            T.assertEqual(m.files()[res.snapshot], 'my-unsaved-work', 'my work is not lost');
            return m.store.write('built-on-theirs');
          }).then(function (res) {
            T.assertEqual(res.written, true, 'adopting theirs re-establishes the baseline');
          });
        });
      });

      t.test('a sync conflict copy is reported, and left completely alone', function () {
        var m = mk({
          'project.json': '{}',
          'project-jay.json': '{}',                          // OneDrive conflict copy
          'project.corrupt-2026-08-18T00-00-00-000Z.json': '{}',
          'Snapshots/2026-08-18T00-00-00-000Z.json': '{}'
        });
        return m.store.conflictCopies().then(function (n) {
          T.assertDeepEqual(n, ['project-jay.json']);
          T.assertEqual(m.files()['project-jay.json'], '{}', 'never touched');
        });
      });
    });

    /* ===== SUITES: quarantine and outputs (TF.4 · requirements 8, 9) ===== */

    T.suite('TF.4 quarantine preserves the bytes a human could repair', function (t) {
      t.test('the bad file is copied aside, then removed — never overwritten', function () {
        return withClock('2026-08-18T01:08:14.233Z', function () {
          var m = mk({ 'project.json': '{ not json' });
          return m.store.quarantine().then(function (name) {
            T.assertEqual(name, 'project.corrupt-2026-08-18T01-08-14-233Z.json');
            T.assertEqual(m.files()[name], '{ not json', 'the unreadable bytes survive');
            T.assertEqual(m.files()['project.json'], undefined, 'and the bad file is out of the way');
          });
        });
      });

      t.test('the copy is written BEFORE the delete, so a failure cannot lose it', function () {
        var m = mk({ 'project.json': 'precious' });
        m.driver.setFault(function (op) {
          return op === 'putText' ? S.fail(S.CODES.LOCKED, 'locked') : null;
        });
        return m.store.quarantine().then(
          function () { throw new Error('expected quarantine to reject'); },
          function (e) {
            T.assertEqual(e.code, S.CODES.LOCKED);
            T.assertEqual(m.files()['project.json'], 'precious', 'still there — the delete never ran');
          }
        );
      });

      t.test('nothing to quarantine resolves null', function () {
        var m = mk();
        return m.store.quarantine().then(function (n) { T.assertEqual(n, null); });
      });
    });

    T.suite('TF.10 generated artifacts land unpacked under Outputs/', function (t) {
      t.test('each file keeps the logical path the zip entry used', function () {
        var m = mk();
        var files = [
          { name: 'implementation.sh', content: '#!/bin/sh\n' },
          { name: 'tactical.json', content: '{}' },
          { name: 'manifest.json', content: '{"a":1}' }
        ];
        return m.store.writeOutputs('pixel-1', 'implementation', files).then(function (paths) {
          T.assertDeepEqual(paths, [
            'Outputs/pixel-1/implementation/implementation.sh',
            'Outputs/pixel-1/implementation/tactical.json',
            'Outputs/pixel-1/implementation/manifest.json'
          ]);
          T.assertEqual(m.files()['Outputs/pixel-1/implementation/tactical.json'], '{}');
        });
      });

      t.test('a second run overwrites in place rather than accumulating', function () {
        var m = mk();
        var one = [{ name: 'a.sh', content: 'first' }];
        var two = [{ name: 'a.sh', content: 'second' }];
        return m.store.writeOutputs('d', 'verification', one)
          .then(function () { return m.store.writeOutputs('d', 'verification', two); })
          .then(function () { return m.driver.listDir('Outputs/d/verification'); })
          .then(function (names) {
            T.assertEqual(names.length, 1);
            T.assertEqual(m.files()['Outputs/d/verification/a.sh'], 'second');
          });
      });
    });

    /* ===== SUITES: the debounced writer (TF.5 · requirements 6.2) ===== */

    T.suite('TF.5 the writer coalesces, caps, and never spins', function (t) {
      function harness(writeImpl) {
        var timers = fakeTimers();
        var writes = [];
        var states = [];
        var w = App.storage.writer.create({
          write: writeImpl || function (text) { writes.push(text); return Promise.resolve(); },
          idleMs: 60000, capMs: 180000,
          now: timers.now, setTimer: timers.set, clearTimer: timers.clear,
          onState: function (s) { states.push(s); }
        });
        return { w: w, timers: timers, writes: writes, states: states };
      }

      t.test('a burst of edits collapses to ONE write of the latest document', function () {
        var h = harness();
        h.w.schedule('a'); h.w.schedule('b'); h.w.schedule('c'); h.w.schedule('d');
        T.assertEqual(h.writes.length, 0, 'nothing written while the burst is still arriving');
        h.timers.advance(60000);
        return tick().then(function () {
          T.assertDeepEqual(h.writes, ['d'], 'only the latest survives — no queue of stale versions');
          T.assertEqual(h.w.state(), 'saved');
        });
      });

      t.test('the idle timer restarts on every edit', function () {
        var h = harness();
        h.w.schedule('a');
        h.timers.advance(50000); h.w.schedule('b');
        h.timers.advance(50000);
        return tick().then(function () {
          T.assertEqual(h.writes.length, 0, '100s elapsed but never 60s idle');
          h.timers.advance(10000);
          return tick();
        }).then(function () {
          T.assertDeepEqual(h.writes, ['b']);
        });
      });

      t.test('the 180s cap writes even when the idle timer never expires', function () {
        var h = harness();
        h.w.schedule('v0');
        // Edit every 30s: the idle timer is pushed out each time and never expires.
        for (var i = 1; i <= 5; i++) { h.timers.advance(30000); h.w.schedule('v' + i); }
        return tick().then(function () {
          T.assertEqual(h.writes.length, 0, 'at 150s a pure idle debounce would still be waiting');
          h.timers.advance(30000); // t = 180s — the cap
          return tick();
        }).then(function () {
          T.assertDeepEqual(h.writes, ['v5'], 'the cap forced the write, with the latest document');
        });
      });

      t.test('flush() resolves only after an edit that arrived MID-WRITE is written', function () {
        var gate = deferred();
        var h = harness(function (text) {
          h.writes.push(text);
          return h.writes.length === 1 ? gate.promise : Promise.resolve();
        });
        h.w.schedule('first');
        var flushed = false;
        var p = h.w.flush().then(function () { flushed = true; });
        return tick().then(function () {
          T.assertDeepEqual(h.writes, ['first']);
          T.assertEqual(h.w.inFlight(), true);
          h.w.schedule('second');       // lands while the first write is still in flight
          gate.resolve();
          return p;
        }).then(function () {
          T.assertEqual(flushed, true);
          T.assertDeepEqual(h.writes, ['first', 'second'], 'the same drain picked it up');
          T.assertEqual(h.w.pending(), false);
          T.assertEqual(h.w.inFlight(), false);
        });
      });

      t.test('a failure reports error, drops the pending doc, and does NOT loop hot', function () {
        var attempts = 0;
        var h = harness(function (text) {
          attempts++;
          h.writes.push(text);
          return attempts === 1 ? Promise.reject(new Error('disk full')) : Promise.resolve();
        });
        h.w.schedule('a');
        h.timers.advance(60000);
        return tick().then(function () {
          T.assertEqual(h.w.state(), 'error');
          T.assertEqual(h.w.pending(), false, 'pending cleared — nothing to retry against');
          T.assertEqual(attempts, 1);
          h.timers.advance(600000);   // ten minutes of nothing happening
          return tick();
        }).then(function () {
          T.assertEqual(attempts, 1, 'no retry spin');
          h.w.schedule('b');          // the NEXT edit is what retries
          h.timers.advance(60000);
          return tick();
        }).then(function () {
          T.assertEqual(attempts, 2);
          T.assertEqual(h.w.state(), 'saved');
        });
      });

      t.test('flush() with nothing pending resolves without writing', function () {
        var h = harness();
        return h.w.flush().then(function () {
          T.assertEqual(h.writes.length, 0);
        });
      });

      t.test('the reported states are the ones the chrome shows', function () {
        var h = harness();
        h.w.schedule('a');
        h.timers.advance(60000);
        return tick().then(function () {
          T.assertDeepEqual(h.states, ['dirty', 'saving', 'saved']);
        });
      });
    });

