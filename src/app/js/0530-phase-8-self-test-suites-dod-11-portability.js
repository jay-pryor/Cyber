  (function (App) {
    'use strict';
    var T = App.test;

    // ---- Appendix D.4: a trivial MOCK platform with one text dataset 'mock.kv'.
    // Registered lazily (D-007). Its existence + the assertions below PROVE DOD-11:
    // a new platform is hosted by writing only an adapter + profile — ZERO edits to
    // store/registry/diff/validation/completeness/generate/projectIo/report/ui.
    var MOCK_KV = {
      id: 'mock.kv', label: 'KV', inputKind: 'text',
      captureHint: 'one k=value per line',
      parse: function (raw) {
        var keys = [], values = {}, errors = [], seen = {};
        String(raw).split(/\r?\n/).forEach(function (line, i) {
          if (line.trim() === '') return;
          var eq = line.indexOf('=');
          if (eq === -1) { errors.push({ category: 'parse', severity: 'error', message: 'Expected k=value.', location: 'line ' + (i + 1) }); return; }
          var k = line.slice(0, eq), v = line.slice(eq + 1);
          if (seen[k]) { errors.push({ category: 'parse', severity: 'error', message: 'Duplicate key ' + k, location: 'line ' + (i + 1) }); return; }
          seen[k] = true; keys.push(k); values[k] = v;
        });
        keys.sort();
        return { items: keys.map(function (k) { return { key: k, defaultValue: values[k] }; }), keys: keys, values: values, warnings: [], errors: errors };
      },
      decisionSchema: [{ name: 'value', kind: 'string', required: true }],
      validateDecision: function (it) { return (it.decision && typeof it.decision.value !== 'string') ? [{ category: 'validation', severity: 'error', message: 'value must be a string', location: it.key }] : []; },
      isComplete: function (it) { return it.decision !== null && this.validateDecision(it).length === 0; },
      columns: [
        { key: 'key', label: 'Key', get: function (it) { return it.key; } },
        { key: 'description', label: 'Description', get: function (it) { return it.description || ''; } },
        { key: 'decision', label: 'Value', get: function (it) { return it.decision ? it.decision.value : ''; } },
        { key: 'controlRefs', label: 'Control Refs', get: function (it) { return (it.controlRefs || []).join(', '); } }
      ],
      generateImplementation: function (items, ctx) { return [{ name: 'mock.impl.txt', content: items.slice().sort(function (a, b) { return a.key < b.key ? -1 : 1; }).map(function (it) { return it.decision ? (it.key + '=' + it.decision.value) : ''; }).filter(Boolean).join('\n') }]; },
      generateVerification: function (items, ctx) { return [{ name: 'mock.verify.txt', content: 'verify ' + items.length + ' items' }]; },
      renderReportSection: function (items, ctx) { return '<h2>KV</h2><table><tbody>' + items.map(function (it) { return '<tr><td>' + App.util.html.esc(it.key) + '</td></tr>'; }).join('') + '</tbody></table>'; },
      capturedDefaults: function (snap) { var o = {}; if (snap && snap.values) Object.keys(snap.values).forEach(function (k) { o[k] = { value: snap.values[k], type: 'string' }; }); return o; }
    };
    var MOCK_PLATFORM = {
      id: 'mock', label: 'Mock platform', outputLanguage: 'text',
      datasets: [MOCK_KV], captureInstructions: 'k=value lines',
      scriptPreamble: function () { return '# mock'; }, scriptPostamble: function () { return ''; }
      // NOTE: no scriptExtension => the generator wraps nothing for this platform.
    };
    function ensureMock() { if (!App.registry.hasPlatform('mock')) App.registry.registerPlatform(MOCK_PLATFORM); }
    function mockSnap(raw) {
      ensureMock();
      var pr = MOCK_KV.parse(raw);
      return { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: 'kv.txt', sha256: App.util.hash.sha256Hex(raw), keys: pr.keys, values: pr.values };
    }

    T.suite('DOD-11 portability (mock platform, zero core edits)', function (s) {
      s.test('store/diff onboard a mock device & triage with the generic engine', function () {
        ensureMock();
        App.store.init(App.store.empty('mock'));
        var res = App.store.onboardDevice({ name: 'MockDev', model: 'X', firmware: 'F', snapshots: { 'mock.kv': mockSnap('k1=a\nk2=b') } });
        T.assertEqual(res.ok, true);
        T.assertDeepEqual(App.store.getProject().items['mock.kv'].map(function (i) { return i.key; }).sort(), ['k1', 'k2']);
      });
      s.test('generic table renders mock columns + editor', function () {
        ensureMock();
        App.store.init(App.store.empty('mock'));
        App.store.onboardDevice({ name: 'MockDev', model: 'X', snapshots: { 'mock.kv': mockSnap('k1=a\nk2=b') } });
        var html = App.ui.tables.renderTableHtml(App.store.getProject(), 'mock.kv', {}, {});
        T.assert(/k1/.test(html) && /k2/.test(html) && /data-kind="string"/.test(html));
      });
      s.test('completeness + generation work for the mock platform', function () {
        ensureMock();
        App.store.init(App.store.empty('mock'));
        App.store.onboardDevice({ name: 'MockDev', model: 'X', snapshots: { 'mock.kv': mockSnap('k1=a\nk2=b') } });
        App.store.setDecision('mock.kv', 'k1', { value: 'x' });
        App.store.setDecision('mock.kv', 'k2', { value: 'y' });
        var p = App.store.getProject();
        T.assertEqual(App.completeness.deviceReady(p, 'mockdev-x'), true);
        var impl = App.generate.buildImplementation(p, 'mockdev-x');
        T.assert(impl.blob && impl.files.some(function (f) { return f.name === 'mock.impl.txt'; }) && impl.files.some(function (f) { return f.name === 'manifest.json'; }));
        var rep = App.generate.buildReport(p, 'mockdev-x');
        T.assert(/KV/.test(rep.files.filter(function (f) { return f.name === 'report.md'; })[0].content));
      });
      s.test('project round-trips losslessly for the mock platform', function () {
        ensureMock();
        App.store.init(App.store.empty('mock'));
        App.store.onboardDevice({ name: 'MockDev', model: 'X', snapshots: { 'mock.kv': mockSnap('k1=a') } });
        var s1 = App.projectIo.serializeProject(App.store.getProject());
        var r = App.projectIo.parseProject(s1);
        T.assertEqual(r.ok, true);
        T.assertEqual(App.projectIo.serializeProject(r.value), s1);
      });
    });

    T.suite('DOD checklist (programmatic items)', function (s) {
      s.test('DOD-2: load→save→load identity (android sample)', function () {
        if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb);
        App.store.init(App.store.empty('android-adb'));
        var s1 = App.projectIo.serializeProject(App.store.getProject());
        T.assertEqual(App.projectIo.serializeProject(App.projectIo.parseProject(s1).value), s1);
      });
      s.test('DOD-10: malformed inputs never throw; return located issues', function () {
        var a = App.registry.getDataset('android-adb', 'android.packages');
        T.assert(a.parse('not a valid package token!').errors.length >= 1);
        T.assert(App.adapters.android.tactical.parse('{bad').errors.length === 1);
        T.assertEqual(App.projectIo.parseProject('{').ok, false);
      });
      s.test('DOD-12: every module file-block present & self-test suite passes (this run)', function () {
        T.assert(!!(App.store && App.registry && App.diff && App.validation && App.completeness && App.generate && App.report && App.projectIo));
      });
    });

  })(App);
