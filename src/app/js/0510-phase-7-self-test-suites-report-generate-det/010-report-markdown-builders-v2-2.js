  (function (App) {
    'use strict';
    var T = App.test;
    function ensureAndroid() { if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb); }
    function snap(dsId, raw) {
      ensureAndroid();
      var a = App.registry.getDataset('android-adb', dsId), pr = a.parse(raw);
      var s = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: dsId, sha256: App.util.hash.sha256Hex(raw), keys: pr.keys };
      if (pr.values) s.values = pr.values; if (pr.template !== undefined) s.template = pr.template; return s;
    }
    /** A fully-decided (ready) single-device project. */
    function readyProject() {
      ensureAndroid();
      App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
        'android.packages': snap('android.packages', 'com.a\ncom.b'),
        'android.tactical': snap('android.tactical', '{"enabled":true,"count":3}') } });
      App.store.setDecision('android.packages', 'com.a', { action: 'keep' });
      App.store.setDecision('android.packages', 'com.b', { action: 'disable' });
      App.store.setItemFields('android.packages', 'com.a', { controlRefs: ['ISM-1234'] });
      App.store.setDecision('android.tactical', 'enabled', { value: true, type: 'bool' });
      App.store.setDecision('android.tactical', 'count', { value: 5, type: 'int' });
      return App.store.getProject();
    }
    function fileNamed(files, name) { return files.filter(function (f) { return f.name === name; })[0]; }

    T.suite('report markdown builders (v2.2)', function (s) {
      s.test('metaTable is a markdown table; values are code spans', function () {
        var md = App.report.metaTable([{ label: 'Device', value: 'Dev', code: false }, { label: 'Hash', value: 'ab_cd' }]);
        T.assert(/^\| Field \| Value \|/.test(md), 'no markdown header row: ' + md.split('\n')[0]);
        T.assert(/\| Device \| Dev \|/.test(md), 'plain value should not be a code span');
        T.assert(/\| Hash \| `ab_cd` \|/.test(md), 'an identifier should be a code span (verbatim, no escaping needed)');
      });
      s.test('renderTable escapes every cell exactly once', function () {
        var md = App.report.renderTable(['A', 'B'], [['50% & rising', 'a_b']]);
        T.assert(/50\\% \\& rising/.test(md), 'hostile characters must be escaped: ' + md);
        T.assert(/a\\_b/.test(md), 'underscore must be escaped in a prose cell');
        T.assert(!/\\\\%/.test(md), 'must not be double-escaped');
      });
      s.test('an empty table states None. rather than showing a bare header (GEN-5)', function () {
        var md = App.report.renderTable(['A', 'B'], []);
        T.assert(/\| None\. \|/.test(md), 'empty table should carry the None. row: ' + md);
      });
      s.test('markdown carries no HTML — a hostile value cannot become markup', function () {
        // The closing tag is written with an escaped slash: an unescaped one inside a
        // <script> block ends the block, whatever the surrounding JS says.
        var md = App.report.metaTable([{ label: 'x', value: '<script>alert(1)<\/script>' }]);
        // A code span is verbatim by definition, so the angle brackets are still THERE
        // in the markdown — that is correct, and pandoc renders them as literal text.
        // What must never happen is the preview treating them as live markup.
        T.assert(/`<script>alert\(1\)<\/script>`/.test(md), 'it should sit inside a code span: ' + md);
        var html = App.ui.mdPreview.toHtml(md).html;
        T.assert(html.indexOf('<script>') === -1, 'the preview must escape it, never mount it');
        T.assert(/&lt;script&gt;/.test(html), 'it should render as visible text: ' + html.slice(0, 200));
      });
    });

    T.suite('generate.buildImplementation', function (s) {
      s.test('emits wrapped scripts + unwrapped tactical.json + manifest', function () {
        var p = readyProject();
        var r = App.generate.buildImplementation(p, 'dev-m1');
        T.assert(r.blob && r.blob.type === 'application/zip');
        T.assert(/^dev-m1-implementation-\d{8}T\d{6}Z\.zip$/.test(r.name), 'bad zip name: ' + r.name);
        var names = r.files.map(function (f) { return f.name; });
        ['packages.impl.ps1', 'tactical.json', 'manifest.json'].forEach(function (n) {
          T.assert(names.indexOf(n) !== -1, 'missing ' + n);
        });
        // Tactical is a Knox JSON upload — there must be NO tactical script.
        T.assert(names.indexOf('tactical.impl.ps1') === -1, 'tactical must not emit a script');
      });
      s.test('script files are wrapped with the platform preamble; data files are not', function () {
        var r = App.generate.buildImplementation(readyProject(), 'dev-m1');
        T.assert(/Set-StrictMode/.test(fileNamed(r.files, 'packages.impl.ps1').content), 'preamble missing');
        T.assert(/pm disable-user/.test(fileNamed(r.files, 'packages.impl.ps1').content), 'disable cmd missing');
        var tj = fileNamed(r.files, 'tactical.json').content;
        T.assert(tj.indexOf('Set-StrictMode') === -1, 'tactical.json should NOT be wrapped');
        // imsSettings comes from the template the parser completed (review-17 #4): it is
        // emitted even when nobody has decided it, at its default (both slots disabled).
        T.assertDeepEqual(JSON.parse(tj), {
          enabled: true, count: 5,
          imsSettings: [{ enabled: false, simSlotId: 0 }, { enabled: false, simSlotId: 1 }]
        }, 'tactical.json wrong (count decided to 5)');
      });
      s.test('only decided applicable items appear; manifest records hashes + decisions', function () {
        var r = App.generate.buildImplementation(readyProject(), 'dev-m1');
        var man = JSON.parse(fileNamed(r.files, 'manifest.json').content);
        T.assertEqual(man.command, 'implementation');
        T.assert(/^[0-9a-f]{64}$/.test(man.projectSha256));
        // 2 outputs: packages.impl.ps1, tactical.json (manifest excludes itself).
        T.assert(man.outputs.length === 2 && man.outputs.every(function (o) { return /^[0-9a-f]{64}$/.test(o.sha256); }));
        T.assert(man.outputs.some(function (o) { return o.name === 'tactical.json'; }));
        T.assertEqual(man.decisions['android.packages'].length, 2);
        T.assertEqual(man.device.id, 'dev-m1');
      });
    });

    T.suite('generate.buildVerification & buildReport', function (s) {
      // VER-1: the packages verify script must read device state back and grade it —
      // it was previously a stub that only echoed the expectation, so a run could not
      // satisfy validation-testing-plan.md S-2 (spec §10.2, Appendix B).
      s.test('VER-1: packages verification reads state back and grades it (no echo stub)', function () {
        var ps = fileNamed(App.generate.buildVerification(readyProject(), 'dev-m1').files, 'packages.verify.ps1').content;
        T.assert(ps.indexOf('Write-Output "CHECK package') === -1, 'the echo-only stub is back');
        T.assert(/pm list packages/.test(ps), 'no pm read-back');
        // The three inventory reads the verdicts are derived from.
        ['--user\',\'0', '-d\',\'--user', '-u\',\'--user'].forEach(function (frag) {
          T.assert(ps.indexOf(frag) !== -1, 'missing inventory read: ' + frag);
        });
        T.assert(/uninstalled-for-user/.test(ps), 'uninstalled-for-user state not distinguished');
        // A false all-clear (adb answers, pm lists nothing) must be fatal, not a pass.
        T.assert(/PkgInstalled\.Count -eq 0/.test(ps) && /throw/.test(ps), 'no empty-inventory guard');
      });
      s.test('VER-2: verification emits a summary with counts, percentages and reasons', function () {
        var ps = fileNamed(App.generate.buildVerification(readyProject(), 'dev-m1').files, 'packages.verify.ps1').content;
        T.assert(/function Write-VerificationSummary/.test(ps), 'no summary function');
        T.assert(/VERIFICATION SUMMARY/.test(ps) && /As expected \(PASS\)/.test(ps), 'summary header/labels missing');
        T.assert(/\{1:N1\}%/.test(ps), 'percentages not formatted');
        T.assert(/--- DIFFERENCES/.test(ps) && /\$r\.Reason/.test(ps), 'differences are not called out with reasons');
        T.assert(/EXIT CODE: 0 = no FAIL/.test(ps), 'exit semantics undocumented (spec §10.2)');
        // Postamble prints THIS command's summary and exits on its verdict (VER-5).
        T.assert(/Write-VerificationSummary\nStop-Transcript/.test(ps), 'summary not invoked before Stop-Transcript');
        T.assert(/exit \$script:RunExit/.test(ps), 'exit code not driven by the verdicts');
      });
      s.test('VER-3: Get-PackageState stays pure so the state is a string, not an object array', function () {
        var ps = fileNamed(App.generate.buildVerification(readyProject(), 'dev-m1').files, 'packages.verify.ps1').content;
        // Initialize-PackageInventory writes progress lines. Called from inside
        // Get-PackageState those join its success stream and the returned state becomes
        // System.Object[], mis-reporting the first item. It must be called by
        // Verify-Package, whose own output nothing consumes.
        // Match a bare CALL on its own line — the guard's throw message names the
        // function inside a string and must not count as one.
        var CALL = /^\s*Initialize-PackageInventory\b/m;
        var body = ps.slice(ps.indexOf('function Get-PackageState'), ps.indexOf('function Verify-Package'));
        T.assert(!CALL.test(body), 'Get-PackageState must not initialise (stream pollution)');
        T.assert(/Package inventory not initialised/.test(body), 'Get-PackageState must fail loudly if used uninitialised');
        var vp = ps.slice(ps.indexOf('function Verify-Package'));
        T.assert(CALL.test(vp), 'Verify-Package must initialise the inventory');
      });
      s.test('VER-4: each command carries and runs only its own summary', function () {
        var impl = fileNamed(App.generate.buildImplementation(readyProject(), 'dev-m1').files, 'packages.impl.ps1').content;
        var ver = fileNamed(App.generate.buildVerification(readyProject(), 'dev-m1').files, 'packages.verify.ps1').content;
        [impl, ver].forEach(function (ps) { T.assert(/\$script:RunExit = 0/.test(ps), 'exit seed missing'); });
        // VER-5: it is no longer a matter of the other summary self-suppressing — the other
        // command's reporting code is not in the file at all.
        T.assert(/function Write-ImplementationSummary/.test(impl) && !/function Write-VerificationSummary/.test(impl),
          'implementation must carry only its own summary');
        T.assert(/function Write-VerificationSummary/.test(ver) && !/function Write-ImplementationSummary/.test(ver),
          'verification must carry only its own summary');
        T.assert(impl.indexOf("Verify-Package '") === -1, 'implementation must emit no verify calls');
        T.assert(ver.indexOf("Apply-Package '") === -1, 'verification must emit no apply calls');
      });
      // IMPL-1..IMPL-4: the implementation script used to guard on a stub that always
      // returned $true, ignore every adb failure, and exit 0 even when nothing applied.
      s.test('IMPL-1: implementation reads state back and has no placeholder guard', function () {
        var ps = fileNamed(App.generate.buildImplementation(readyProject(), 'dev-m1').files, 'packages.impl.ps1').content;
        T.assert(ps.indexOf('Test-PackagePresent') === -1, 'the always-true presence guard is back');
        T.assert(!/# Idempotent: each action guards on current package state\./.test(ps), 'stale idempotency claim');
        T.assert(/function Apply-Package/.test(ps) && /Initialize-PackageInventory/.test(ps), 'no real state read');
        // Idempotency is now a real skip, not a fake guard.
        T.assert(/\$status = 'SKIP'/.test(ps), 'no already-in-state skip path');
      });
      s.test('IMPL-2: a keep decision restores a package that is not active', function () {
        var ps = fileNamed(App.generate.buildImplementation(readyProject(), 'dev-m1').files, 'packages.impl.ps1').content;
        T.assert(/'pm','enable','--user','0',\$pkg/.test(ps), 'disabled keep item is not re-enabled');
        T.assert(/'pm','install-existing','--user','0',\$pkg/.test(ps), 'uninstalled keep item is not restored');
        // Not on the build => cannot be restored; the operator has to be told.
        T.assert(/cannot be restored/.test(ps), 'an unrestorable keep item is not reported');
      });
      s.test('IMPL-3: adb failures are detected, not assumed from the exit code', function () {
        var ps = fileNamed(App.generate.buildImplementation(readyProject(), 'dev-m1').files, 'packages.impl.ps1').content;
        // PowerShell never throws on a native non-zero exit, and adb does not reliably
        // propagate the remote code — so the output text is checked too.
        T.assert(/\$code = \$LASTEXITCODE/.test(ps), 'exit code not captured');
        T.assert(/notmatch '\(\?i\)failure\|error\|exception/.test(ps), 'failure text not checked');
        T.assert(/exit \$script:RunExit/.test(ps) && /\$script:RunExit = 1/.test(ps), 'failures do not drive the exit code');
      });
      s.test('IMPL-4: the summary mirrors the verification format and grades the device', function () {
        var ps = fileNamed(App.generate.buildImplementation(readyProject(), 'dev-m1').files, 'packages.impl.ps1').content;
        T.assert(/IMPLEMENTATION SUMMARY/.test(ps) && /=============/.test(ps), 'no summary block');
        // Same shape as VERIFICATION SUMMARY: counts, N1 percentages, reasons, RESULT.
        ['Packages processed', 'Changes attempted', 'Applied      \\(APPLIED\\)', 'Already set  \\(ALREADY\\)',
         'Failed       \\(FAILED\\)', 'Not on build \\(MISSING\\)', 'Needs review \\(REVIEW\\)'].forEach(function (lbl) {
          T.assert(new RegExp(lbl).test(ps), 'summary line missing: ' + lbl);
        });
        T.assert(/\{1:N1\}%/.test(ps), 'percentages not formatted like the verification summary');
        T.assert(/--- FAILURES/.test(ps) && /--- MISSING/.test(ps) && /--- NEEDS REVIEW/.test(ps), 'detail sections missing');
        T.assert(/reason  :/.test(ps), 'failures are not explained');
        // Verdicts come from a re-read, so they describe the device, not the command.
        T.assert(/Re-reading package state to confirm the end result/.test(ps), 'no post-run re-read');
        T.assert(/\$script:PkgInstalled = \$null/.test(ps), 'inventory not refreshed before grading');
      });
      s.test('verification emits wrapped verify scripts + manifest', function () {
        var r = App.generate.buildVerification(readyProject(), 'dev-m1');
        var names = r.files.map(function (f) { return f.name; });
        T.assert(names.indexOf('packages.verify.ps1') !== -1 && names.indexOf('manifest.json') !== -1);
        T.assert(/Set-StrictMode/.test(fileNamed(r.files, 'packages.verify.ps1').content));
      });
      s.test('report emits ONE markdown file — no zip, no manifest (v2.2)', function () {
        var r = App.generate.buildReport(readyProject(), 'dev-m1');
        T.assert(/^dev-m1-reporting-\d{8}T\d{6}Z\.md$/.test(r.name), 'bad download name: ' + r.name);
        T.assertEqual(r.files.length, 1, 'a document is one file, not a bundle');
        T.assertEqual(r.files[0].name, 'report.md');
        T.assert(fileNamed(r.files, 'manifest.json') == null, 'the manifest is retired for documents');
        var md = r.files[0].content;
        // The provenance the manifest carried now travels in the document itself.
        T.assert(/^---\n/.test(md), 'no YAML metadata block');
        T.assert(/\nproject-sha256: "[0-9a-f]{64}"/.test(md), 'project hash missing from the metadata');
        T.assert(/\ntool: "CH Config Tool/.test(md), 'tool/version missing from the metadata');
        T.assert(/^# \d+ Control coverage \{#sec-control\}$/m.test(md), 'Control coverage heading missing');
        T.assert(md.indexOf('ISM-1234') !== -1, 'Control coverage content missing');
      });
    });

    T.suite('report-gen: descriptions + page setup + LaTeX safety (v2.2)', function (s) {
      function withDesc() {
        var p = readyProject();
        App.store.setItemFields('android.packages', 'com.a', { description: 'Alpha bloatware' });
        App.store.setItemFields('android.tactical', 'enabled', { description: 'Master enable' });
        return App.store.getProject();
      }
      function reportMd(p, opts) {
        App.util.clock.setClock(function () { return new Date('2026-01-01T00:00:00.000Z'); });
        var h = fileNamed(App.generate.buildReport(p, 'dev-m1', opts).files, 'report.md').content;
        App.util.clock.resetClock();
        return h;
      }
      // COL-3: Rationale ships OFF, so a test about what a Rationale cell contains has
      // to ask for the column the way an operator would.
      var WITH_RATIONALE = { columns: { 'android.packages': { rationale: true } } };
      s.test('#1/#2 packages/tactical sections have a Description column with the text', function () {
        var md = reportMd(withDesc());
        T.assert(/\| Package \| Description \| Action \|/.test(md), 'packages Description column missing');
        T.assert(/\| Path \| Description \| Value \|/.test(md), 'tactical Description column missing');
        T.assert(md.indexOf('Alpha bloatware') !== -1 && md.indexOf('Master enable') !== -1, 'description text not in the report');
      });
      s.test('the page setup reaches pandoc as YAML + a LaTeX preamble', function () {
        var md = reportMd(readyProject());
        T.assert(/\npapersize: "a4"/.test(md), 'paper size missing');
        T.assert(/\nfontsize: "11pt"/.test(md), 'font size missing');
        T.assert(/\n  - "top=25mm"/.test(md), 'geometry margins missing');
        T.assert(/\\usepackage\{titlesec\}/.test(md), 'no titlesec preamble for heading styling');
        T.assert(/\\fancyfoot\[C\]\{\{\\thepage\}\}/.test(md), 'page numbers not configured');
        // App.doc writes the numbers, so LaTeX must not add a second set.
        T.assert(/\nnumbersections: false/.test(md), 'pandoc must not double-number the sections');
      });
      s.test('no character hostile to LaTeX escapes the writer unescaped', function () {
        var p = readyProject();
        App.store.setItemFields('android.packages', 'com.a', { rationale: 'costs 50% & needs $HOME plus a_b {x} #1 ~y ^z' });
        var body = reportMd(App.store.getProject(), WITH_RATIONALE).split('\n---\n').slice(1).join('\n---\n');
        // Every one of these is load-bearing in LaTeX; an unescaped one is a compile
        // error or a silently truncated line, not a cosmetic bug.
        ['%', '&', '$', '_', '{', '}', '#', '~', '^'].forEach(function (ch) {
          var re = new RegExp('(^|[^\\\\])\\' + ch.replace(/[$^{}]/g, '\\$&'), 'm');
          var bare = body.split('`').filter(function (_, i) { return i % 2 === 0; }).join('');  // ignore code spans
          T.assert(bare.indexOf(ch) === -1 || bare.indexOf('\\' + ch) !== -1,
            'hostile character ' + ch + ' appears unescaped outside a code span');
        });
        // The cell WRAPS, so the escaped run is spread over several source lines. The
        // preview reassembles a cell column-aware, which is what makes it the right
        // thing to assert a whole phrase against.
        var shownB = App.ui.mdPreview.toHtml(body).html;
        T.assert(/50%\s+&amp;\s+needs\s+\$HOME\s+plus\s+a_b\s+\{x\}\s+#1\s+~y\s+\^z/.test(shownB),
          'rationale not escaped as expected: ' + shownB.slice(shownB.indexOf('50%'), shownB.indexOf('50%') + 120));
      });
    });

