    T.suite('T11 (v1.3) generation customisation', function (s) {
      var FIX = function () { return new Date('2026-01-01T00:00:00.000Z'); };
      function report(p, opts) {
        App.util.clock.setClock(FIX);
        // try/finally: a throw here used to leave the clock pinned for every later
        // suite, which turned one real failure into a dozen mystifying ones.
        try { return fileNamed(App.generate.buildReport(p, 'dev-m1', opts).files, 'report.md').content; }
        finally { App.util.clock.resetClock(); }
      }

      s.test('GEN-2/GEN-1: packages split into three tables; excluding a group drops it', function () {
        var p = readyProject(); // com.a keep, com.b disable
        var h = report(p, {});
        /* TBL-1: a group is a TABLE under the section now, not a numbered sub-section.
         *
         * What identifies it is its own caption anchor — which is what a cross-reference
         * points at — rather than a heading carrying the group's declared name. The
         * declared names ("Removed", "Disabled", "Kept") are not printed at all; a title
         * row above each table says whatever the operator wants it to say. */
        ['remove', 'disable', 'keep'].forEach(function (g) {
          T.assert(h.indexOf('[]{#tbl-ds-android-packages-' + g + '}') !== -1, 'no table for ' + g);
          T.assert(!new RegExp('^#+ .*\\{#sec-ds-android-packages-' + g + '\\}$', 'm').test(h),
            g + ' must not have a heading of its own');
        });
        T.assert(!/^#+ [\d.]* ?Removed/m.test(h), 'the group\'s declared name must not be printed as a heading');
        var h2 = report(p, { datasetSections: { 'android.packages': { keep: false } } });
        T.assert(h2.indexOf('[]{#tbl-ds-android-packages-keep}') === -1, 'Kept should be omitted');
        T.assert(h2.indexOf('[]{#tbl-ds-android-packages-disable}') !== -1, 'Disabled should be kept');
      });
      s.test('GEN-5: an enabled-but-empty group renders a single None. row', function () {
        var h = report(readyProject(), {}); // no remove-action packages
        T.assert(/\[\]\{#tbl-ds-android-packages-remove\}\n\n\| Package[\s\S]*?\n\| None\. \|/.test(h),
          'empty group should show None.: ' + h.slice(h.indexOf('tbl-ds-android-packages-remove'), 400));
      });
      s.test('GEN-3: an optional column follows its tick, in both directions', function () {
        var p = readyProject();
        // COL-3: Rationale ships OFF now — a working note, not something a signed report
        // leads with — so "absent" is the starting point and the tick adds it.
        T.assert(!/\| Rationale \|/.test(report(p, {})), 'rationale must be off until asked for');
        var on = report(p, { columns: { 'android.packages': { rationale: true } } });
        T.assert(/\| Rationale \|/.test(on), 'ticking it must bring the column back');
        // A column that ships ON still goes when it is unticked.
        T.assert(/\| Description \|/.test(report(p, {})), 'description ships on');
        T.assert(!/\| Description \|/.test(report(p, { columns: {
          'android.packages': { description: false }, 'android.tactical': { description: false }, 'android.custom': { description: false } } })),
          'and must go when unticked');
      });
      s.test('GEN-1/GEN-4: excluding a section removes it, and leaves the rest standing', function () {
        var h = report(readyProject(), { sections: { meta: false }, datasetSections: { 'android.tactical': { _all: false } } });
        T.assert(!/\{#sec-meta\}/.test(h), 'meta section should be omitted');
        T.assert(!/\{#sec-ds-android-tactical\}/.test(h), 'tactical section should be omitted');
        T.assert(/\{#sec-control\}/.test(h), 'the control coverage section is missing');
        T.assert(/\{#sec-ds-android-packages\}/.test(h), 'the packages section is missing');
      });
      s.test('GEN-6: the classification banner rides in the LaTeX page style', function () {
        var off = report(readyProject(), {});
        T.assert(off.indexOf('OFFICIAL: Sensitive') === -1, 'no banner unless asked for');
        var h = report(readyProject(), { classification: true });
        // In a PDF the banner belongs to every page, which is a page-style question,
        // not a "put a div at each end of the body" one as it was in Word HTML.
        T.assert(/\\fancyhead\[C\]\{\\textbf\{OFFICIAL: Sensitive\}\}/.test(h), 'no classification header: ' + (h.match(/fancyhead.*/) || ''));
        /* HDR-1: the banner takes the first FREE slot of each, preferring the centre.
         * The shipped profile puts the page number in the footer's centre, so the
         * banner lands to its left — which is what it has always done, but now because
         * the slot was taken rather than because of a rule about page numbers. */
        T.assert(/\\fancyfoot\[L\]\{\\textbf\{OFFICIAL: Sensitive\}\}/.test(h), 'no classification footer: ' + (h.match(/fancyfoot.*/) || ''));
        T.assert(/\\fancyfoot\[C\]\{\{\\thepage\}\}/.test(h), 'and the page number must keep its own slot');
      });
      s.test('GEN-7: control report lists applied controls + satisfying items; (no control) gated; command=control', function () {
        readyProject();
        var cid = App.store.addControl({ title: 'Debloat', type: 'AHG', description: 'strip bloat' }).id;
        App.store.addControl({ title: 'Unused', type: 'ISM' }); // defined but not applied
        App.store.setItemFields('android.packages', 'com.a', { controlRefs: [cid] });
        var p = App.store.getProject();
        App.util.clock.setClock(FIX);
        var f = App.generate.buildControlReport(p, 'dev-m1', {});
        App.util.clock.resetClock();
        T.assert(/^dev-m1-control-\d{8}T\d{6}Z\.md$/.test(f.name), 'bad download name: ' + f.name);
        var ch = fileNamed(f.files, 'control-report.md').content;
        T.assert(/^# \d+ Debloat \(AHG\)/m.test(ch) && ch.indexOf('strip bloat') !== -1, 'applied control/desc missing');
        T.assert(ch.indexOf('com.a') !== -1, 'satisfying item missing');
        T.assert(ch.indexOf('Unused') === -1, 'unreferenced control must not appear');
        T.assert(ch.indexOf('(no control)') === -1, '(no control) hidden by default');
        var ch2 = fileNamed(App.generate.buildControlReport(p, 'dev-m1', { includeUncontrolled: true }).files, 'control-report.md').content;
        T.assert(/\(no control\)/.test(ch2), '(no control) shown when included');
        T.assertEqual(f.files.length, 1, 'a document is one file — no manifest rides with it');
      });
      s.test('GEN-8: implementation dataset include + action subset', function () {
        var p = readyProject(); // com.a keep, com.b disable
        var noPkgs = App.generate.buildImplementation(p, 'dev-m1', { datasets: { 'android.packages': false } });
        var n1 = noPkgs.files.map(function (f) { return f.name; });
        T.assert(n1.indexOf('packages.impl.ps1') === -1 && n1.indexOf('tactical.json') !== -1, 'dataset include filter failed');
        var disableOnly = App.generate.buildImplementation(p, 'dev-m1', { actions: { 'android.packages': { keep: false, remove: false } } });
        var pkg = fileNamed(disableOnly.files, 'packages.impl.ps1').content;
        T.assert(/disable-user/.test(pkg) && pkg.indexOf('# keep com.a') === -1, 'action subset (disable-only) failed');
      });
      s.test('GEN-9: verification dataset include + results CSV + only-deviations', function () {
        var p = readyProject();
        var v = App.generate.buildVerification(p, 'dev-m1', { datasets: { 'android.tactical': false }, csvResults: true });
        var vn = v.files.map(function (f) { return f.name; });
        T.assert(vn.indexOf('verification-results.csv') !== -1 && vn.indexOf('tactical.verify.txt') === -1, 'CSV/dataset-include failed');
        var csv = fileNamed(v.files, 'verification-results.csv').content;
        T.assert(/^dataset,key,expected,actual,result/.test(csv), 'CSV header wrong');
        T.assert(/Packages,com\.a,keep,,/.test(csv), 'CSV expected/blank row wrong');
        var od = App.generate.buildVerification(p, 'dev-m1', { onlyDeviations: true });
        // No deviations → no per-item verify CALL lines (the Verify-Package helper def in
        // the preamble stays); check the item keys are gone.
        T.assert(fileNamed(od.files, 'packages.verify.ps1').content.indexOf("'com.a'") === -1, 'only-deviations should drop non-deviating items');
      });
      s.test('GEN-10: _gen has four independent blocks; the Control report command is present', function () {
        var g = App.ui.views.generate._gen;
        T.assert(g.report && g.control && g.implementation && g.verification, 'four blocks missing');
        // CLS-1: the classification banner left the session blocks entirely — one project
        // answer for every document that has a banner — so independence is asserted on
        // two fields these blocks still own.
        g.report.filename = 'x';
        T.assertEqual(g.control.includeUncontrolled, false, 'blocks not independent');
        g.report.filename = '';
        ['report', 'control', 'procedure'].forEach(function (k) {
          T.assertEqual('classification' in g[k], false, k + ' must not carry a per-run banner flag');
        });
        readyProject(); // fully decided
        T.assert(/data-generate-action="control"/.test(App.ui.views.generate.render(App.store.getProject())), 'Control report card missing');
      });
      s.test('GEN-11: report is byte-deterministic for a fixed clock + fixed options', function () {
        var p = readyProject();
        var o = { classification: true, sections: { deviations: false } };
        T.assertEqual(report(p, o), report(p, o), 'report not deterministic for fixed options');
      });
    });

    T.suite('review-9 apply-to toggle + AEST header + how-to-run', function (s) {
      s.test('#1 apply-to plan: add when some missing, remove when all have it', function () {
        var plan = App.ui.app.applyToTogglePlan;
        var items = [
          { key: 'a', decision: { action: 'remove' }, controlRefs: ['c1'] },
          { key: 'b', decision: { action: 'remove' }, controlRefs: [] },
          { key: 'c', decision: { action: 'keep' }, controlRefs: [] }
        ];
        var p1 = plan(items, 'action', 'remove', 'c1');
        T.assertEqual(p1.matching.length, 2, 'only remove-action items match');
        T.assertEqual(p1.removing, false, 'some are missing -> add, not remove');
        // now both remove-action items have c1 -> removing
        items[1].controlRefs = ['c1'];
        T.assertEqual(plan(items, 'action', 'remove', 'c1').removing, true, 'all have it -> remove');
        // no matching items -> not removing
        T.assertEqual(plan(items, 'action', 'disable', 'c1').removing, false);
      });
      s.test('#3 script header shows Generated (AEST) not UTC; util.clock.toAest is UTC+10', function () {
        T.assertEqual(App.util.clock.toAest('2026-06-30T00:00:00.000Z'), '2026-06-30 10:00:00 AEST');
        var pk = fileNamed(App.generate.buildImplementation(readyProject(), 'dev-m1').files, 'packages.impl.ps1').content;
        T.assert(/# Generated \(AEST\): \d{4}-\d\d-\d\d \d\d:\d\d:\d\d AEST/.test(pk), 'no AEST generated line');
        T.assert(pk.indexOf('# Generated (UTC)') === -1, 'UTC line should be gone');
      });
      s.test('#4 scripts carry a how-to-run header with the exact command; data files do not', function () {
        var r = App.generate.buildImplementation(readyProject(), 'dev-m1');
        var pk = fileNamed(r.files, 'packages.impl.ps1').content;
        T.assert(/HOW TO RUN THIS SCRIPT/.test(pk) && pk.indexOf('powershell -ExecutionPolicy Bypass -File .\\packages.impl.ps1') !== -1, 'how-to-run/command missing');
        T.assert(pk.indexOf('HOW TO RUN') < pk.indexOf('generated PowerShell'), 'how-to-run should be at the very top');
        T.assert(fileNamed(r.files, 'tactical.json').content.indexOf('HOW TO RUN') === -1, 'data files should not get a how-to-run header');
      });
      s.test('#4 .txt output references the .txt name + a rename note', function () {
        var pk = fileNamed(App.generate.buildImplementation(readyProject(), 'dev-m1', { scriptsAsTxt: true }).files, 'packages.impl.txt').content;
        T.assert(pk.indexOf('.\\packages.impl.txt') !== -1 && /rename it to \.ps1/.test(pk), 'txt run note wrong');
      });
    });

    T.suite('generate determinism (DOD-7)', function (s) {
      function bytesEqual(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
      s.test('identical project+device => byte-identical zip under fixed clock', function () {
        App.util.clock.setClock(function () { return new Date('2026-02-02T02:02:02.000Z'); });
        var p = readyProject();
        var r1 = App.generate.buildImplementation(p, 'dev-m1');
        var r2 = App.generate.buildImplementation(p, 'dev-m1');
        T.assertDeepEqual(r1.files, r2.files, 'generated files differ');
        T.assert(bytesEqual(App.util.zip.zipBytes(r1.files), App.util.zip.zipBytes(r2.files)), 'zip bytes differ');
        App.util.clock.resetClock();
      });
      s.test('report is deterministic under fixed clock', function () {
        App.util.clock.setClock(function () { return new Date('2026-02-02T02:02:02.000Z'); });
        var p = readyProject();
        var a = App.generate.buildReport(p, 'dev-m1').files;
        var b = App.generate.buildReport(p, 'dev-m1').files;
        T.assertDeepEqual(a, b);
        App.util.clock.resetClock();
      });
    });

    T.suite('review-10 (onboarded descriptions + .ps1 warning + control width)', function (s) {
      s.test('#3 onboarding may carry descriptions onto register items (no decision)', function () {
        // review-10 #3 originally rode in on the Settings "setting,description,value"
        // CSV. Settings was retired in v2.0, but the store-side path it introduced —
        // onboardDevice({descriptions}) — is generic, so it is covered directly here.
        ensureAndroid();
        App.store.init(App.store.empty('android-adb'));
        var raw = 'com.a\ncom.b';
        var pr = App.registry.getDataset('android-adb', 'android.packages').parse(raw);
        var snap = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: 'android.packages', sha256: App.util.hash.sha256Hex(raw), keys: pr.keys };
        var res = App.store.onboardDevice({ name: 'CsvDev', model: 'M1',
          snapshots: { 'android.packages': snap },
          descriptions: { 'android.packages': { 'com.a': 'Alpha bloatware', 'com.b': 'Beta bloatware' } } });
        T.assertEqual(res.ok, true);
        var items = App.store.getProject().items['android.packages'];
        var a = items.filter(function (i) { return i.key === 'com.a'; })[0];
        T.assertEqual(a.description, 'Alpha bloatware');
        T.assertEqual(a.decision, null, 'onboarding must not set a decision, only the description');
        T.assertEqual(items.filter(function (i) { return i.key === 'com.b'; })[0].description, 'Beta bloatware');
      });

      s.test('#1 Generate tab shows the HighCom .ps1-handling warning', function () {
        var html = App.ui.views.generate.render(readyProject());
        T.assert(/HighCom/.test(html) && /rename/i.test(html), 'HighCom .ps1 warning missing from Generate tab');
      });

      s.test('#2 Control Manager is no longer capped at 1100px (table can span full width)', function () {
        var html = App.ui.views.controls.render(readyProject());
        T.assert(html.indexOf('max-width:1100px') === -1, 'Control Manager still capped at max-width:1100px');
      });
    });

  })(App);
