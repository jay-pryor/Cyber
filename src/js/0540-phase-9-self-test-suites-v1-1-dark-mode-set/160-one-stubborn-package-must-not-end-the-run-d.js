    /* ===== SUITES: one stubborn package must not end the run (D-016) ===== */

    // The preamble is the artifact under test here: these assert the SHAPE of the emitted
    // PowerShell, because the failure they lock is a PowerShell evaluation-order trap that
    // no amount of generating-and-inspecting-decisions would reveal.
    function preamble() {
      ensureA();
      return App.platforms.androidAdb.scriptPreamble({
        device: { name: 'd', model: 'm', firmware: 'f' },
        toolVersion: 'v', generatedUtc: '2026-01-01T00:00:00.000Z'
      });
    }
    /** The body of Invoke-AdbPm, which is where the trap lives. */
    function invokeAdbPmBody() {
      var ps = preamble();
      var start = ps.indexOf('function Invoke-AdbPm');
      T.assert(start !== -1, 'Invoke-AdbPm must exist');
      var rest = ps.slice(start);
      return rest.slice(0, rest.indexOf('\n}\n') + 2);
    }

    T.suite('D-016 a package that refuses to uninstall must not kill the run', function (s) {
      s.test('the stderr redirect is not left under a Stop preference', function () {
        var body = invokeAdbPmBody();
        T.assert(/2>&1/.test(body), 'the premise: stderr is still captured for grading');
        var relax = body.indexOf("$ErrorActionPreference = 'Continue'");
        var redirect = body.indexOf('2>&1');
        T.assert(relax !== -1, 'the preference must be relaxed around the native call');
        T.assert(relax < redirect,
          'relaxing it AFTER the redirect is no use — the throw happens on the redirect line');
      });

      s.test('the preference is restored, so nothing else runs relaxed', function () {
        var body = invokeAdbPmBody();
        T.assert(/\$prevEap = \$ErrorActionPreference/.test(body), 'the previous value must be captured');
        T.assert(/finally \{[\s\S]*\$ErrorActionPreference = \$prevEap/.test(body),
          'restore belongs in finally — a throw must not leave the run relaxed');
      });

      s.test('a throw is caught and graded as a failure, not propagated', function () {
        var body = invokeAdbPmBody();
        T.assert(/try \{/.test(body) && /\} catch \{/.test(body), 'the native call must be guarded');
        T.assert(/catch \{[\s\S]*\$text = \$_\.Exception\.Message/.test(body),
          'the caught message must become the recorded reason');
        T.assert(/catch \{[\s\S]*\$code = 1/.test(body), 'a caught throw must not grade as exit 0');
      });

      s.test('the grading still happens after the guard, on every path', function () {
        var body = invokeAdbPmBody();
        var ok = body.indexOf('$ok = ($code -eq 0)');
        T.assert(ok !== -1 && ok > body.indexOf('} finally {'),
          'Ok must be computed outside the try, so a caught failure is graded too');
        T.assert(/return \[PSCustomObject\]@\{ Ok = \$ok/.test(body), 'the caller still gets Ok/Text/Code');
      });

      s.test('PowerShell 7.3+ native-exit escalation is disabled too', function () {
        T.assert(/\$PSNativeCommandUseErrorActionPreference = \$false/.test(preamble()),
          'on 7.3+ a non-zero pm exit would otherwise terminate the run');
      });

      s.test('an uninstall that fails still reaches the summary as FAILED', function () {
        // The failure path has to end somewhere a human reads. Assert the chain exists:
        // Apply-Package records every item, and the summary grades from a re-read.
        var ps = preamble();
        T.assert(/\$script:ImplResults\.Add/.test(ps), 'every applied item is recorded');
        T.assert(/else \{ \$r\.Verdict = 'FAILED' \}/.test(ps), 'and one that did not reach its state is FAILED');
        T.assert(/\$script:RunExit = 1/.test(ps), 'a FAILED item must fail the run');
      });
    });

    /* ===== SUITES: uninstall falls back to disable · reverse switches (PARTIAL-1 · REV-1) ===== */

    T.suite('PARTIAL-1 a refused uninstall falls back to disable, and says so', function (s) {
      s.test('the fallback runs disable-user after a failed uninstall', function () {
        var ps = preamble();
        var i = ps.indexOf("$r = Invoke-AdbPm @('pm','uninstall'");
        T.assert(i !== -1, 'the uninstall call must still be there');
        var after = ps.slice(i, i + 1400);
        T.assert(/if \(-not \$r\.Ok\) \{/.test(after), 'the fallback hangs off the failed uninstall');
        T.assert(/\$r2 = Invoke-AdbPm @\('pm','disable-user','--user','0',\$pkg\)/.test(after),
          'a refused uninstall must attempt a disable');
      });

      s.test('a successful fallback is PARTIAL, never a success', function () {
        var ps = preamble();
        T.assert(/if \(\$r2\.Ok\) \{[\s\S]{0,120}\$status = 'PARTIAL'/.test(ps),
          'the disable succeeding is what makes it PARTIAL');
        T.assert(/\$r\.Status -eq 'PARTIAL' -and \$r\.After -eq 'disabled'\) \{ \$r\.Verdict = 'PARTIAL' \}/.test(ps),
          'PARTIAL is graded from the DEVICE state, not from the command returning');
        T.assert(!/'PARTIAL'[\s\S]{0,200}Verdict = 'APPLIED'/.test(ps), 'a PARTIAL must never grade as APPLIED');
      });

      s.test('PARTIAL fails the run, so it cannot be read as done', function () {
        var ps = preamble();
        var blk = ps.slice(ps.indexOf('--- PARTIAL ('));
        T.assert(blk.indexOf('$script:RunExit = 1') !== -1 && blk.indexOf('$script:RunExit = 1') < blk.indexOf('--- FAILURES'),
          'the PARTIAL block must set the non-zero exit');
        T.assert(/\$short = \$failed\.Count \+ \$partial\.Count/.test(ps),
          'the RESULT line must count partials as not-met');
      });

      s.test('the reason survives to the summary — both errors are kept', function () {
        var ps = preamble();
        T.assert(/\$err = \$err \+ ' \| disable fallback also failed: ' \+ \$r2\.Text/.test(ps),
          'if the disable fails too, both reasons are recorded');
        T.assert(/uninstall refused: \{0\}/.test(ps), 'and the uninstall refusal is printed against the item');
      });

      s.test('the emitted header documents PARTIAL rather than leaving it a surprise', function () {
        ensureA();
        var out = App.registry.getDataset('android-adb', 'android.packages')
          .generateImplementation([], { device: { name: 'd' } })[0].content;
        T.assert(/PARTIAL/.test(out), 'the artifact must describe its own verdict classes (D-013)');
        T.assert(/1 = at least one FAILED or PARTIAL/.test(out), 'including what fails the run');
      });
    });

    T.suite('REV-1 the reverse switches turn the script into a restore', function (s) {
      s.test('both switches are defined OFF, then offered as a commented line', function () {
        var ps = preamble();
        ['RestoreRemoved', 'RestoreDisabled'].forEach(function (v) {
          var off = ps.indexOf('$' + v + '  = $false') !== -1 || ps.indexOf('$' + v + ' = $false') !== -1;
          T.assert(off, v + ' must be defined $false — StrictMode throws on an undefined read');
          var on = new RegExp('^# \\$' + v + ' + ?= \\$true', 'm');
          T.assert(on.test(ps), v + ' must have a commented $true line to uncomment');
          T.assert(ps.indexOf('$' + v) < ps.indexOf('# $' + v),
            'the $false default must come FIRST, or uncommenting would be overwritten by it');
        });
      });

      s.test('a remove is retargeted to keep, and only when the switch is on', function () {
        var ps = preamble();
        T.assert(/if \(\$RestoreRemoved  -and \$action -eq 'remove'\)  \{ return 'keep' \}/.test(ps));
        T.assert(/if \(\$RestoreDisabled -and \$action -eq 'disable'\) \{ return 'keep' \}/.test(ps));
        T.assert(/function Get-EffectiveAction\(\$action\) \{[\s\S]{0,300}return \$action/.test(ps),
          'with both switches off the action passes through untouched');
      });

      s.test('the decision is carried through untouched alongside the target', function () {
        var ps = preamble();
        T.assert(/\$target = Get-EffectiveAction \$action/.test(ps), 'the target is derived per item');
        T.assert(/Package = \$pkg; Decided = \$action; Target = \$target;/.test(ps),
          'the recorded row keeps the DECISION as well as the target');
        T.assert(/Test-DecisionMet \$r\.After \$r\.Target/.test(ps),
          'grading uses the target, or a successful restore would read as one long failure');
      });

      s.test('a restore run is impossible to mistake for a hardening run', function () {
        var ps = preamble();
        T.assert(/THIS RUN UNDOES HARDENING, IT DOES NOT APPLY IT/.test(ps), 'banner at the top of the run');
        T.assert(/RESTORE MODE WAS ON - THIS RUN UNDID HARDENING DECISIONS/.test(ps), 'and again in the summary');
        T.assert(/\$shown = \$\(if \(\$target -ne \$action\) \{ \$action \+ '->' \+ \$target \}/.test(ps),
          'each line shows the retarget, e.g. remove->keep');
        T.assert(/verification will FAIL these by design/.test(ps),
          'the operator is told the register is unchanged');
      });

      s.test('the banner is inside the transcript, not just on screen', function () {
        var ps = preamble();
        T.assert(ps.indexOf('Start-Transcript') < ps.indexOf('*** RESTORE MODE - THIS RUN UNDOES'),
          'a restore has to be evidenced in the log file, so the banner follows Start-Transcript');
      });
    });

    /* ===== SUITES: a verification script carries no apply machinery (VER-5) ===== */

    function verifyScript() {
      ensureA();
      App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'V', model: 'M1', firmware: 'F', snapshots: {
        'android.packages': snapB('android.packages', 'com.a\ncom.b\ncom.c') } });
      App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
      App.store.setDecision('android.packages', 'com.b', { action: 'disable' });
      App.store.setDecision('android.packages', 'com.c', { action: 'keep' });
      var r = App.generate.buildVerification(App.store.getProject(), App.store.getProject().deviceConfigs[0].id);
      return r.files.filter(function (f) { return f.name === 'packages.verify.ps1'; })[0].content;
    }

    T.suite('VER-5 the verification script contains nothing that could change a device', function (s) {
      s.test('no pm verb that mutates appears anywhere in the file', function () {
        var ps = verifyScript();
        // Not "is never called" — not present. A reviewer must not have to trace call sites
        // to satisfy themselves that a read-only artifact is read-only.
        ["'pm','uninstall'", "'pm','disable-user'", "'pm','enable'", "'pm','install-existing'"].forEach(function (frag) {
          T.assert(ps.indexOf(frag) === -1, 'verification still contains a mutating call: ' + frag);
        });
      });

      s.test('the apply machinery is gone, not merely uncalled', function () {
        var ps = verifyScript();
        ['function Apply-Package', 'function Invoke-AdbPm', 'function Get-EffectiveAction',
          'function Test-DecisionMet', 'function Write-ImplementationSummary'].forEach(function (fn) {
          T.assert(ps.indexOf(fn) === -1, 'verification still defines ' + fn);
        });
        T.assert(ps.indexOf('$script:ImplResults') === -1, 'and it must not declare the apply result list');
      });

      s.test('the reverse switches do not appear as an inert lever', function () {
        var ps = verifyScript();
        T.assert(ps.indexOf('RestoreRemoved') === -1 && ps.indexOf('RestoreDisabled') === -1,
          'a switch that looks live and does nothing is worse than no switch');
        T.assert(ps.indexOf('REVERSE (ROLLBACK) SWITCHES') === -1, 'and neither should its banner');
      });

      s.test('what it does need is all still there', function () {
        var ps = verifyScript();
        ['function Get-PackageSet', 'function Initialize-PackageInventory', 'function Get-PackageState',
          'function Verify-Package', 'function Write-VerificationSummary', 'Start-Transcript'].forEach(function (fn) {
          T.assert(ps.indexOf(fn) !== -1, 'verification lost something it needs: ' + fn);
        });
        T.assertEqual((ps.match(/^Verify-Package '/gm) || []).length, 3, 'one call per decided item');
        T.assert(/exit \$script:RunExit/.test(ps), 'still exits on its verdict');
      });

      s.test('the implementation script keeps its half and drops the verify half', function () {
        ensureA();
        verifyScript();
        var impl = App.generate.buildImplementation(App.store.getProject(), App.store.getProject().deviceConfigs[0].id)
          .files.filter(function (f) { return f.name === 'packages.impl.ps1'; })[0].content;
        T.assert(impl.indexOf('function Apply-Package') !== -1, 'implementation must keep the apply path');
        T.assert(impl.indexOf('RestoreRemoved') !== -1, 'and the reverse switches, which are its own');
        T.assert(impl.indexOf('function Verify-Package') === -1, 'but not the verification half');
        T.assert(impl.indexOf('$script:VerifyResults') === -1, 'nor its result list');
      });

      s.test('a platform that ignores ctx.command still works (DOD-11)', function () {
        // The command is additive context; a profile is free to disregard it.
        var ps = App.platforms.androidAdb.scriptPreamble({
          device: { name: 'd', model: 'm', firmware: 'f' }, toolVersion: 'v',
          generatedUtc: '2026-01-01T00:00:00.000Z'
        });
        T.assert(ps.indexOf('function Apply-Package') !== -1,
          'no command supplied falls back to the superset, never to a silently stripped script');
      });
    });

    /* ===== SUITES: the "(none)" filters survive the DOM (FIL-3) ===== */

    // These go through the RENDERED HTML rather than calling the predicate with a value
    // handed to it in JS. The FIL-1 suite did the latter and passed throughout, because the
    // defect was entirely in the round trip: the sentinel written into an <option value>
    // came back different, so every "(none)" filter emptied the table.
    function fil3Project() {
      ensureA(); App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'Alpha', model: 'M1', snapshots: {
        'android.tactical': snapB('android.tactical', '{"wifiOn":true,"btOn":true,"nfcOn":false}') } });
      var c = App.store.addControl({ title: 'Wireless lockdown', type: 'ISM' });
      App.store.getProject().items['android.tactical'].forEach(function (it) {
        App.store.setDecision('android.tactical', it.key, { value: false });
      });
      // Exactly one item carries a control; the other two are the ones a "(none)" filter
      // has to find.
      App.store.setItemFields('android.tactical', 'wifiOn', { controlRefs: [c.id] });
      return { project: App.store.getProject(), controlId: c.id };
    }
    function fil3Select(html, colKey) {
      var host = document.createElement('div');
      host.innerHTML = html;                       // the real HTML parser, the real bug
      var sels = host.querySelectorAll('select.col-filter');
      for (var i = 0; i < sels.length; i++) {
        if (sels[i].getAttribute('data-col') === colKey) return sels[i];
      }
      return null;
    }

    T.suite('FIL-3 a "(none)" filter still means none after a trip through the DOM', function (s) {
      s.test('the sentinel is not a character the HTML parser rewrites', function () {
        var n = App.ui.model.FILTER_NONE;
        T.assert(typeof n === 'string' && n.length > 0, 'there must be a sentinel');
        for (var i = 0; i < n.length; i++) {
          var cp = n.charCodeAt(i);
          T.assert(cp !== 0, 'U+0000 is rewritten to U+FFFD on parse — it cannot be the sentinel');
          T.assert(cp !== 0xFFFD, 'U+FFFD is what a mangled sentinel becomes; using it hides the bug');
        }
      });

      s.test('the option value read back off the select equals FILTER_NONE', function () {
        var p = fil3Project().project;
        var sel = fil3Select(App.ui.tables.renderTableHtml(p, 'android.tactical', {}), 'controlRefs');
        T.assert(sel, 'the Control Refs filter must be rendered once a control exists');
        var opts = sel.querySelectorAll('option'), found = null;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].textContent.indexOf('(none assigned)') !== -1) found = opts[i];
        }
        T.assert(found, 'the "(none assigned)" option must exist');
        T.assertEqual(found.value, App.ui.model.FILTER_NONE,
          'what the DOM gives back must be what the predicate compares against');
      });

      s.test('selecting it actually returns the unassigned items', function () {
        var f = fil3Project();
        var adapter = App.registry.getDataset('android-adb', 'android.tactical');
        var sel = fil3Select(App.ui.tables.renderTableHtml(f.project, 'android.tactical', {}), 'controlRefs');
        var opts = sel.querySelectorAll('option');
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].textContent.indexOf('(none assigned)') !== -1) sel.selectedIndex = i;
        }
        // Exactly what the change handler does with the selected value.
        var ui = { colFilters: { controlRefs: sel.value } };
        var got = App.ui.model.filterSortRows(App.store.getProject(), 'android.tactical', adapter, ui)
          .map(function (r) { return r.item.key; });
        // The adapter seeds imsSettings defaults, so the register holds more than the three
        // keys this fixture creates. Assert the PROPERTY rather than a brittle exact list.
        T.assert(got.length > 0, 'this returned [] before the fix — that is the whole defect');
        T.assert(got.indexOf('btOn') !== -1 && got.indexOf('nfcOn') !== -1, 'unassigned items must be shown');
        T.assertEqual(got.indexOf('wifiOn'), -1, 'the item that DOES carry a control must be filtered out');
      });

      s.test('and picking a real control still narrows to that control', function () {
        var f = fil3Project();
        var adapter = App.registry.getDataset('android-adb', 'android.tactical');
        var sel = fil3Select(App.ui.tables.renderTableHtml(f.project, 'android.tactical', {}), 'controlRefs');
        var opts = sel.querySelectorAll('option'), idx = -1;
        for (var i = 0; i < opts.length; i++) { if (opts[i].value === f.controlId) idx = i; }
        T.assert(idx !== -1, 'the control must be offered by id');
        sel.selectedIndex = idx;
        var got = App.ui.model.filterSortRows(App.store.getProject(), 'android.tactical', adapter,
          { colFilters: { controlRefs: sel.value } }).map(function (r) { return r.item.key; });
        T.assertDeepEqual(got, ['wifiOn'], 'the assigned side must not regress while fixing the none side');
      });

      s.test('the same holds for the "(not set)" Security Relevance filter', function () {
        var p = fil3Project().project;
        App.store.setItemFields('android.tactical', 'wifiOn', { relevance: 'HIGH' });
        var adapter = App.registry.getDataset('android-adb', 'android.tactical');
        var sel = fil3Select(App.ui.tables.renderTableHtml(App.store.getProject(), 'android.tactical', {}), 'relevance');
        var opts = sel.querySelectorAll('option');
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].textContent.indexOf('(not set)') !== -1) sel.selectedIndex = i;
        }
        var got = App.ui.model.filterSortRows(App.store.getProject(), 'android.tactical', adapter,
          { colFilters: { relevance: sel.value } }).map(function (r) { return r.item.key; });
        T.assert(got.length > 0, 'every "(none)"-shaped filter shares the sentinel, so this broke too');
        T.assertEqual(got.indexOf('wifiOn'), -1, 'the one item with a relevance set must be filtered out');
        T.assert(got.indexOf('btOn') !== -1, 'and the ones without must remain');
      });

      s.test('no NUL-based sentinel is left anywhere in the app', function () {
        // Cheap guard against the pattern coming back in another filter.
        var src = document.documentElement.innerHTML;
        T.assert(src.indexOf(String.fromCharCode(0)) === -1, 'a raw NUL is back in the source');
      });
    });

    // ---- REL-7 · RPT-2 · RPT-3 · RPT-4 -----------------------------------------
    // "REPORTING" became "REPORT"; the report learned to filter on Security Relevance
    // and to be re-ordered; and the Reporting command's options became a full-screen
    // workspace instead of a dropdown.
    /* ===== SUITES: report scope, section order & the options workspace (REL-7 · RPT-2/3/4) ===== */

    /**
     * A device whose packages are decided and spread across the relevance categories,
     * so the only thing that can shorten its report is the filter under test.
     */
    function rptProject() {
      ensureA(); App.store.init(App.store.empty('android-adb'));
      App.store.onboardDevice({ name: 'RPT', model: 'M1', firmware: 'F', snapshots: {
        'android.packages': snapB('android.packages', 'com.high\ncom.rep\ncom.irr\ncom.plain'),
        'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
      ['com.high', 'com.rep', 'com.irr', 'com.plain'].forEach(function (k) {
        App.store.setDecision('android.packages', k, { action: 'keep' });
        App.store.setItemFields('android.packages', k, { description: 'why ' + k });
      });
      App.store.setItemFields('android.packages', 'com.high', { relevance: 'HIGH' });
      App.store.setItemFields('android.packages', 'com.rep', { relevance: 'REPORT' });
      App.store.setItemFields('android.packages', 'com.irr', { relevance: 'IRRELEVANT' });
      return 'rpt-m1';
    }
    var RPT_FIX = function () { return new Date('2026-01-01T00:00:00.000Z'); };
    function rptHtml(devId, opts) {
      App.util.clock.setClock(RPT_FIX);
      var f = App.generate.buildReport(App.store.getProject(), devId, opts);
      App.util.clock.resetClock();
      return f.files.filter(function (x) { return x.name === 'report.md'; })[0].content;
    }
