# CH Config Tool — Defect Register

Defects found during per-phase review/testing, logged before fixing.

Status: OPEN · FIXED · WONTFIX · DEFERRED
Severity: blocker · major · minor · trivial

| ID | Phase | Severity | Status | Summary | Fix note |
|----|-------|----------|--------|---------|----------|
| D-001 | 0 | trivial | FIXED | UTF-8 SHA-256 self-test used a wrong expected vector (hash of "password", not 'é') | Corrected fixture to true digest of 'é'; impl verified against Node crypto |
| D-002 | 2 | major | FIXED | Tactical JSON with a non-object root (top-level array/scalar) produces an empty-path leaf, and rebuild then crashes in setAtPath (segs[-1]) | Reject non-object tactical root at parse with a located error |
| D-003 | 3 | trivial | FIXED | 1500-row render test counted 1501 `<tr` (header row also matched); test-assertion error, not a product bug | Count body rows via `<tr class` instead |
| D-004 | 4 | blocker | FIXED | `store.onboardDevice` called `_commit(...)` (the exported alias, undefined inside the IIFE) instead of the local `commit` — every onboard threw ReferenceError | Renamed call to `commit(...)` |
| D-005 | 2/4 | major | FIXED | Settings parser assumed tab-separated `ns<TAB>key<TAB>value`, but the real `settings list` capture is sectioned `<namespace>:` headers + `key=value` lines; all 806 real lines errored. Keys also contain `#` | Rewrote settings parser to the sectioned format; first `=` splits key/value; extended key charset to allow `#`; updated capture hints, instructions, fixtures, and tests |
| D-006 | 5 | trivial | FIXED | Settings editor test asserted `data-kind="enum-synth"`, but settings' `type` field is `decisionSchema` kind `enum` (enum-synth is only the tactical value-typed companion); test-assertion error, product correct | Assert the `type` enum select via its options instead |
| D-007 | 1/5 | major | FIXED | Embedded test suites called `registerPlatform` at module-LOAD time (not inside tests). The Phase-1 mock `selftest.platform` thus registered on every page load and, being first, became the ACTIVE platform — real app would boot to mock tabs + polluted platform dropdown | Made all test-suite platform registrations lazy (ensureST()/ensureAndroid() inside tests); only bootstrap registers android-adb in the real app |
| D-008 | 6 | minor | FIXED | Device view derived its panels from the ACTIVE platform's datasets, not the loaded project's platform; if they differ (active≠project) `getDataset` returns null and the view throws | Device view now derives datasets from `project.platformProfileId`; project-load also sets the active platform to match |
| D-015 | 9 (DEV-1/VF-2) | major | FIXED | An item assigned to a second device by hand read as **undecided** on the Devices tab while the data tab showed it decided — device readiness inferred the value format from that one device's capture, which does not contain a hand-assigned key | One fleet-merged captured-value map (`registry.capturedDefaults`), used by readiness and by every table |
| D-017 | 9 | major | FIXED | The **verification** script shipped the whole implementation half — `Apply-Package` with live `pm uninstall`/`disable-user`, and (newly, from the D-016 work) the reverse switches presented as an uncomment-me lever that did nothing. All inert, none of it obvious to a reader | Preamble/postamble assembled per command via `ctx.command`; a verify script now contains no mutating verb at all. Locked by VER-5 + an execution proof that device state is byte-identical after a verify run |
| D-016 | 9 | blocker | FIXED | One package that refuses to uninstall **terminates the whole implementation run** — remaining packages never applied. A native `pm` failure is escalated to a terminating error on hosts that do so (Windows PowerShell 5.1 via `2>&1`+`Stop`; 7.3+ via `$PSNativeCommandUseErrorActionPreference`), and nothing caught it | `Invoke-AdbPm` relaxes the preference around the native call, guards it with try/catch/finally, and grades a caught throw as a failure; the 7.3+ escalation is pinned off. Locked by the D-016 suite + an execution harness under real pwsh 7.4.6 |
| D-026 | 14 (BRK-1) | major | FIXED | A space-free run (`io.sdsasolutions.tacticalsettings`) could not wrap at all — no hyphenation point, and a zero-width space is not a break opportunity in XeTeX (measured). Unmarked it was also a HARD floor, so it forced its column wide and starved the columns that genuinely cannot wrap | A run of 18+ characters shaped like an identifier is emitted as a code span, which routes through the existing `\texttt` -> `\seqsplit` hook: breakable on the page, and soft rather than hard in the width model. Preview cells gained `overflow-wrap` |
| D-024 | 14 (AUTO-2) | major | FIXED | Column widths were proportional to source CHARACTERS but spent in POINTS. Next to a monospace key column the rate fell below what prose needs, so unbreakable words — headings especially — pushed past their column into the next one | Columns measured in ems from real Latin Modern metrics, against the page less pandoc's inter-column padding; hard floors, then soft floors, then appetite |
| D-025 | 14 (PRV-3) | minor | FIXED | Three preview infidelities: the outline rail printed the markdown escaping (`\&`); every firewall rule in a cell ran together into one paragraph; and an unstyled table header was painted with the app's own surface colour — near-black on a white page, and indistinguishable from a shaded one | `unescapeMd` for text destinations; `parseGrid` keeps interior blank lines and the renderer treats a cell as paragraphs; the page states its own table background and the profile is the only source of a shade |
| D-023 | 14 (NAM-1) | minor | FIXED | The per-section preview printed the section's LIST NAME as its heading; the whole-document preview printed the heading. Correct while the two were the same string, wrong the moment NAM-1 made them different | `sectionPreview` forced `title: block.label` into `headingFor`; the resolved block already carries the heading, so the override was the whole bug |
| D-021 | 14 (AUTO-1) | major | FIXED | Making the automatic width path wrap let it hard-break a token. A register key came out as `` `appInstall `` / `` Whitelist` `` — pandoc rejoins the halves with a SPACE through the package name and renders the surrounding `**` as literal asterisks | The width floor counts the whole space-free token, measured on the source with its markup, so the auto path can never cut one; `safeCut` also refuses to land inside a `**` marker |
| D-022 | 14 (AUTO-1) | major | FIXED | The Control coverage table was mashed — three columns crushed to a few characters, one taking the page — and its long cells ran off the right of the PDF. Two causes: widths proportional to source characters, and the pipe form, whose LaTeX `l` columns do not wrap at all | Automatic widths lay a too-wide table out (floors first, then slack by appetite); the grid form is chosen whenever a table is wider than the budget, not only when a cell holds a line break |
| D-019 | 14 (CAP-1) | minor | FIXED | A captioned table printed its number twice — `Table 3: Table 3 — Ports` — because App.doc wrote a number into the caption text that LaTeX also supplies from its own counter | Caption text is the text alone; App.doc keeps its counter only so a cross-reference can name the number the page prints, and both count captioned tables in emitted order |
| D-020 | 14 (TW-1) | major | FIXED | `gridTable` put alignment markers on EVERY border row. Pandoc 3.1.11 silently drops every body row of such a table — it compiles to a header and nothing else. The preview had the mirror bug: it recognised only `+-` borders, so an aligned grid table rendered as prose | Markers emitted on the header separator only; the preview's three border regexes widened to accept `+:` |
| D-018 | 9 (FIL-1/FIL-2/CMF-1) | major | FIXED | Every "(none assigned)" / "(not set)" column filter returned an EMPTY table. The sentinel behind those options was `U+0000`, and the HTML parser rewrites a NUL in an `<option value>` to `U+FFFD` — so the value read back off the select never equalled the one the predicate compares against | Sentinel moved to a private-use codepoint that round-trips; one shared `FILTER_NONE` constant replaces six literals plus a stray raw-NUL fallback. Locked by FIL-3, which asserts through the rendered DOM |

<!-- Add rows above. Detailed notes below per defect. -->

---

## Detail notes

### D-001 — wrong SHA-256 test vector for 'é'
- **Found:** Phase 0 self-test run. `util.hash` UTF-8 multibyte test failed.
- **Diagnosis:** The implementation output `4a99557e...` which Node's `crypto` confirms is the
  true SHA-256 of `'é'`. The fixture's expected value `8c6976e5...` was incorrect (it is in fact
  the SHA-256 of the string `"password"`). So the *test data* was defective, not the SHA-256 code.
- **Impact:** None on product; false-failing test only.
- **Fix:** Replace the expected vector with the verified digest of `'é'`.

### D-002 — tactical non-object root crashes rebuild
- **Found:** Phase 2 adversarial review of `flattenTactical`/`rebuildTacticalDoc`.
- **Failure scenario:** `tactical.parse('[1,2,3]')` (or `'"x"'`, `'5'`) yields a leaf with `key:''`.
  At generation, `rebuildTacticalDoc` calls `setAtPath(doc, parsePath('')=[] , value)`, which
  dereferences `segs[segs.length-1] === segs[-1] === undefined` → `segKey(undefined)` throws.
- **Impact:** A pathological capture file would crash generation instead of producing a located
  parse error — violates DOD-10 (never silently fail / always located errors).
- **Fix:** In `tactical.parse`, after JSON.parse, require the root to be a plain object; otherwise
  return a located parse error. Add a self-test.

### D-005 — settings parser incompatible with real capture format
- **Found:** User supplied real reference captures (`Reference Input Files/`). Running the actual
  `settings.txt` through the parser produced 806 errors.
- **Reality vs spec:** Spec §9 specified TAB-separated `namespace<TAB>key<TAB>value`. The real
  `adb shell settings list <ns>` capture is **sectioned**: a `<namespace>:` header line (`system:`,
  `secure:`, `global:`) begins a block, followed by `key=value` lines. Real keys also contain `#`
  (e.g. `add_info_com_samsung_android_app_routines#dashboard`); values contain spaces, `;`, `=`,
  `:`, `%`, `/`, etc.
- **Verification of the other two formats:** `packages.txt` parsed clean (438 items) and the tactical
  `policy-config…json` parsed clean (232 leaves, round-trip identical) with NO changes — only
  settings needed work.
- **Fix:**
  1. Rewrote `android.settings.parse` to the sectioned format: track current namespace from
     `^(system|secure|global)\s*:\s*$` headers; for `key=value` lines split on the FIRST `=`
     (value verbatim, may contain `=`/spaces/specials); error on a kv line before any section, a
     line that is neither header nor `key=value`, a malformed key, or a duplicate.
  2. Extended `SETTINGS_KEY_RE` to `[A-Za-z0-9._:#-]+` (adds `#`). `#` stays shell-safe as a
     mid-token character, so the "keys need no escaping, only values do" model still holds.
  3. Updated `captureHint`, platform `captureInstructions`, all settings fixtures, and the Phase-2/4
     tests to the new format; added tests for `#` keys, first-`=` split, spaced values,
     before-section error, and blank-line tolerance.
- **Validated end-to-end:** all three real files parse with 0 errors; onboarding a device from them
  succeeds; the resulting project passes schema validation with a stable serialize round-trip;
  generation of a `#` key + spaced + adversarial `a'b; rm -rf /` value is injection-safe.

### D-007 — test scaffolding registered a platform at load (active-platform leak)
- **Found:** Phase-5 mount smoke test reported `activeTab=selftest.a` — the wrong platform.
- **Root cause:** several embedded test-suite IIFEs called `App.registry.registerPlatform(...)` in
  the IIFE BODY (executed at page load), not inside test functions. The Phase-1 mock
  `selftest.platform` therefore registered on every load and, being the FIRST registration, became
  the active platform (`registerPlatform` makes the first one active). The real app would boot
  showing mock `selftest.a/b/c` tabs and list the mock in the platform dropdown.
- **Fix:** wrapped every test-suite platform registration in lazy `ensureST()` / `ensureAndroid()`
  helpers invoked INSIDE test bodies (via the sample/snap/deviceProject builders). Now nothing
  registers at load except the real `android-adb` in bootstrap. Verified by a boot simulation:
  registered=[android-adb], active=android-adb, activeTab=onboard.
- **Lesson:** embedded self-tests must be side-effect-free at module-load; only `suite()` registration
  may run at load.

### D-010 — verification helper polluted its own return value (state became `System.Object[]`)
- **Found:** running the generated `packages.verify.ps1` end-to-end under PowerShell 7.4.6 against
  a mock `adb`. The FIRST item printed `actual=System.Object[]` instead of a state name; every
  later item was correct.
- **Root cause:** `Get-PackageState` called `Initialize-PackageInventory`, which writes two
  progress lines with `Write-Output`. In PowerShell a nested function's success-stream output is
  collected by its caller, so `Get-PackageState` returned an array of
  `[<progress line>, <progress line>, 'absent']` rather than `'absent'`. Only the first call was
  affected because the initialiser is a no-op thereafter. It still *graded* correctly by pure
  accident: `$state -eq 'enabled'` against an array performs element filtering, not comparison, and
  the empty/non-empty result happened to steer each branch the right way.
- **Fix:** `Verify-Package` now calls `Initialize-PackageInventory` itself — its own output stream
  is consumed by nobody, so the progress lines flow to the transcript as intended.
  `Get-PackageState` became a pure lookup that throws if the inventory is not yet built.
  Locked by self-test VER-3, which asserts the call site by line-anchored match (the guard's throw
  message names the function inside a string and must not count as a call).
- **Lesson:** a generated-script change is not verified by generating it. This was invisible to the
  embedded suite — which only ever inspected the emitted text — and only surfaced by executing the
  artifact against a mock device. Emitters need an execution test, not just a string test.

### D-011 — `""` inside a JS double-quoted preamble line terminated the string
- **Found:** immediately after editing the preamble — the suite went from 431 pass to 108 pass /
  324 fail with `jsdomError: Uncaught [SyntaxError: Unexpected string]`.
- **Root cause:** a PowerShell line needing an escaped quote was written as a JS double-quoted
  string containing `""`, which closed the JS string early.
- **Fix:** rewrote the line to use a PowerShell double-quoted string with `$action` interpolation,
  inside a JS single-quoted string. **Lesson:** the preamble is PowerShell nested in JavaScript
  nested in HTML; pick the JS quote style that does not collide with the PowerShell quoting on
  that line, and run the suite after every preamble edit — a syntax error there takes out the
  whole app, not just the generator.

### D-012 — implementation script reported success after a totally failed run
- **Found:** running the generated `packages.impl.ps1` against a mock `adb` in which every command
  fails. Output was two lines of error text; **exit code 0**.
- **Root cause:** no failure detection at all. `$ErrorActionPreference = "Stop"` governs cmdlet
  errors and does **not** trap a native command's non-zero exit, so every failed `pm` call was
  ignored. Compounding it, adb does not reliably propagate the remote exit code on older hosts, so
  even an explicit `$LASTEXITCODE` check alone would have missed failures that only announce
  themselves as `Failure [...]` on stdout.
- **Impact:** on a real hardening run, "it completed" and "it did nothing" were indistinguishable.
  Nothing downstream would have caught it either — the report describes decisions, not outcomes.
- **Fix:** `Invoke-AdbPm` checks exit code **and** output text; results are graded against a
  post-run state re-read, so a command that prints `Success` and changes nothing is still FAILED;
  the run exits 1 if any item failed. Locked by IMPL-3.
- **Lesson:** in generated PowerShell, native-command success must be asserted explicitly. Assume
  neither the exit code nor `$ErrorActionPreference` will do it for you.

### D-013 — implementation script claimed idempotency it did not have
- **Found:** reading the emitted artifact alongside the preamble.
- **Root cause:** the emitted header stated `# Idempotent: each action guards on current package
  state.` while every guard called `Test-PackagePresent`, a placeholder that returned `$true`
  unconditionally. The claim was printed into an artifact operators read as evidence of behaviour.
- **Fix:** the placeholder is deleted. `Apply-Package` reads real device state, so an item already
  in its decided state issues no command — idempotency is now a genuine skip. Proven by re-running
  the script against a stateful mock: changes attempted fell 7 → 3. Locked by IMPL-1, which fails
  if either the stub or the old header line returns.
- **Lesson:** a generated artifact must not assert a property the generator has not implemented.
  A stub is acceptable; a stub plus a claim is a false record.

### D-014 — implementation could not converge a device (`keep` was one-directional)
- **Found:** tracing what the new verification would do with a `keep` item found disabled — it
  reports FAIL, and nothing in the tool could fix it.
- **Root cause:** `keep` emitted a comment only, and no `pm enable` / `install-existing` existed
  anywhere in the codebase. Implementation could strip a device but never restore it, so any
  divergence from a `keep` decision was permanent as far as the tool was concerned.
- **Fix (approved behaviour change; spec §10.1 and Appendix B updated):** a disabled `keep` package
  is re-enabled; one uninstalled for user 0 is restored with `pm install-existing` and then enabled,
  because install-existing can return it disabled. A `keep` package absent from the firmware build
  cannot be restored and is reported MISSING with that reason. Locked by IMPL-2.
- **Note:** the converse — a device found *more* restricted than decided — is deliberately NOT
  acted on. It is reported as REVIEW, since restoring it would exceed the decision the reviewer made.

### D-015 — a hand-assigned item lost its decision status on the device it was assigned to
- **Found:** user report. A set of Tactical decisions made against one device was assigned to a
  second device by hand (DEV-1); the Devices tab then listed those items as undecided — and the
  device as not ready — while the Tactical tab showed the very same items decided.
- **Root cause:** the decision itself was never in doubt. What differed was the **value format**.
  VF-2 infers an item's format from the *captured leaf type*, and there were two independent
  implementations of "the captured values for this dataset":
  - `ui.tables.buildCapturedMap` merged the captures of every latest device — so the data tab saw
    `wifiOn` as `bool` and the boolean decision validated.
  - `completeness.deviceReadiness` read **only that device's own snapshot**. A hand-assigned key is
    by definition absent from it, so there was no captured type, `inferId(undefined)` fell back to
    `string`, and `validate` rejected a perfectly good `true` with "Value must be text." The item
    was therefore incomplete, and the device not ready.

  It bit exactly the non-text values — booleans, numbers, lists — which is most of a Knox capture.
  A hand-assigned *text* item behaved fine, which is why it read as arbitrary.
- **Fix:** one implementation, `App.registry.capturedDefaults(project, dsId, preferDeviceId)`,
  living beside the applicability choke point it belongs with. It merges the fleet's latest
  captures, putting the named device's own capture first — where a device did report a key, its own
  evidence remains the authority on that key's type; the rest of the fleet only fills the gaps.
  `deviceReadiness`, `ui.tables.buildCapturedMap` and the Devices-tab format resolver all delegate
  to it, so the two tabs can no longer reach different verdicts from different evidence.
- **Verified:** locked by the D-015 suite (6 tests), including the readiness assertion that fails
  against the pre-fix code, and an end-to-end check that the assigned key is actually written into
  the second device's generated `tactical.json` — the artifact, not just the badge.
- **Lesson:** a register item is fleet-wide, so anything derived from it must be too. The duplicate
  merge was the defect; the second copy was written for the table long before DEV-1 made it possible
  for an item to apply to a device that never captured it.

### D-016 — a single un-uninstallable package ended the whole run
- **Found:** user report, running a real `packages.impl.ps1` against a device. The run proceeded
  correctly until it reached a package `pm uninstall` refused, then stopped dead on that line.
  Every package after it was never applied, no summary printed, and the transcript ended mid-run.
- **Root cause:** `Invoke-AdbPm` runs `pm` as a native command and grades the result itself. That
  grading is only reachable if the native call returns. Under a host that escalates a native
  failure to a **terminating** error, and with no `try`/`catch` anywhere in the emitted script, the
  call threw instead — so the `$ok` computation that exists precisely to turn a failed `pm` into a
  recorded FAILED row was unreachable on exactly the failures it was written for.
- **Which hosts escalate — measured, not assumed:**
  - **Windows PowerShell 5.1** folds each redirected (`2>&1`) stderr line from a native command into
    an ErrorRecord, which `$ErrorActionPreference = "Stop"` makes terminating (`NativeCommandError`).
    This is the likely environment for the report: the script's own `runInstructions` tells the
    operator to launch it with `powershell -ExecutionPolicy Bypass -File`, which is 5.1 on Windows.
    **Not verified directly** — 5.1 is Windows-only and the dev box is Linux.
  - **PowerShell 7.3+** does *not* do the 5.1 stderr-folding, but has a separate escalation:
    `$PSNativeCommandUseErrorActionPreference`. With it on, a non-zero native exit throws
    `ProgramExitedWithNonZeroCode`.
  - **PowerShell 7.4.6 defaults do neither** — confirmed by running the pre-fix script end to end
    against a mock adb: it completed and graded correctly. An initial attempt to reproduce on 7.4.6
    defaults therefore failed, and the first written diagnosis (that `2>&1` + `Stop` is terminating
    in PowerShell generally) was **wrong as stated** — it is 5.1-specific.
- **Impact:** blocker. The hardening run was **partial and silent about it**: the packages after the
  stubborn one were left untouched with no record that they had been skipped. Worse than D-012's
  false all-clear, because the operator sees an error and may reasonably read it as "that one
  package failed" rather than "the run stopped".
- **Relationship to D-012:** this is D-012's fix biting back. D-012 added the stderr capture to make
  native failures visible; the redirect it introduced is what made a subset of them fatal. The two
  requirements — *see* the failure and *survive* it — needed the preference handled as well.
- **Fix:** `Invoke-AdbPm` now saves `$ErrorActionPreference`, sets it to `Continue` for the duration
  of the native call, wraps the call in `try`/`catch`, and restores in `finally` so a throw cannot
  leave the rest of the run relaxed. A caught throw records `Code = 1` and the exception message as
  the reason, so it grades as a failure like any other. `$PSNativeCommandUseErrorActionPreference =
  $false` is set in the preamble, since PowerShell 7.3+ can independently escalate a native non-zero
  exit to terminating. `$ok` is computed after the guard, so caught and returned failures grade
  identically.
- **Locked by:** the D-016 suite (6 tests), asserting the emitted PowerShell's shape — notably that
  the relaxation precedes the redirect and that the restore is in `finally`. Four of the six fail
  against the pre-fix preamble.
- **Verified by execution**, under real PowerShell 7.4.6 against a mock `adb` (fixture: 7 packages
  covering keep/disable/remove, one package whose uninstall is refused, one whose uninstall *and*
  disable are both refused, and a package sorted last to prove the run continued):
  - pre-fix + escalation forced on → **dies before any summary**, the last package never reached
    and left untouched. The reported failure, reproduced.
  - fixed + the same escalation forced on before the preamble → completes, last package removed,
    the refused one graded PARTIAL. The preamble's pin wins over a hostile environment.
  - the guarded `Invoke-AdbPm` probed directly under forced escalation → returns `Ok=False`,
    `Code=1`, the correct reason text; the next call still runs; `$ErrorActionPreference` is back to
    `Stop` afterwards. So the `try`/`catch` holds even if the pin is defeated.
- **Fixed alongside, at user request:** a refused uninstall now falls back to `pm disable-user` and
  is recorded **PARTIAL** — counted separately, printed with both the uninstall refusal and the
  disable outcome, and it still exits 1. It is deliberately *not* a success: the register says
  remove and the package is not removed, and reporting it as met would be the D-013 failure mode.
  Also added: `$RestoreRemoved` / `$RestoreDisabled` reverse switches (see PARTIAL-1 / REV-1).
- **Lesson:** D-010's lesson again, one level up — a generated-script change is not verified by
  generating it. Every emitted-PowerShell defect so far (D-010, D-012, D-013, D-016) was invisible
  to a suite that only inspects the emitted text, and surfaced only on execution. The suite can lock
  a fix's *shape* once known, but it cannot find the next one of these. An execution harness against
  a mock `adb` — which found D-010 and D-012 — is the control that matters, and it needs a
  failing-`pm` fixture, not just a wrong-state one.

### D-017 — the verification script carried the whole implementation half
- **Found:** user report, reading the generated `packages.verify.ps1` and asking why a read-only
  script contained `pm uninstall`, `pm disable-user` and `pm enable`.
- **Diagnosis:** it was genuinely inert. `scriptPreamble` was shared by both commands and had no
  idea which one it was wrapping, so every script got every function. `Apply-Package` was *defined*
  in the verify file but had zero call sites; the two summaries each self-suppressed on an empty
  result list. Proven by execution: running the pre-fix verify script against a mock device left the
  state SHA-256 byte-identical and issued no mutating command.
- **Why it was still a defect:** the artifact could not be assessed by reading it. A reviewer had to
  trace call sites to establish that a script named "verification" could not change a device — and
  the user, reasonably, did not assume it. A security artifact should make that property structural,
  not something you verify by argument. Related in spirit to D-013: an artifact must not carry
  something that misrepresents what it does.
- **Aggravated by the D-016 work (self-inflicted):** the REVERSE (ROLLBACK) SWITCHES block was added
  to the shared preamble, so it also appeared in verification scripts — offering
  `# $RestoreRemoved = $true   # <-- UNCOMMENT THIS LINE` in a script where uncommenting it does
  precisely nothing. A lever that looks live and is inert is worse than no lever, and worse than the
  dead code it sat next to.
- **Fix:** `ctxFor` now carries `command`, and `scriptPreamble`/`scriptPostamble` assemble per
  command from five segments — `head`, `switches` (impl), `common`, `verifyHalf`, `implHalf`, plus a
  `tail` whose restore banner is impl-only. The postamble calls only that command's summary instead
  of calling both and relying on self-suppression. An absent `ctx.command` falls back to the
  implementation superset, so a profile that ignores the new field is never silently stripped
  (DOD-11 holds; asserted).
- **Effect:** `packages.verify.ps1` fell from 455 to 199 lines and contains no `pm` verb that can
  change anything; `packages.impl.ps1` fell from 467 to 396, having shed `Verify-Package` and
  `Write-VerificationSummary`.
- **Locked by:** VER-5 (6 tests) asserting the mutating verbs, the apply functions and the switches
  are *absent* rather than uncalled, that each script keeps what it needs, and the DOD-11 fallback.
  VER-4 and the VER-2 postamble assertion were rewritten — they encoded the old
  both-summaries-self-suppress design, which no longer exists.
- **Verified by execution:** the slimmed verify script run against a mock device — state SHA-256
  unchanged, three genuine FAILs, exit 1, and zero occurrences of `IMPLEMENTATION SUMMARY`. The full
  implementation harness (D-016 reproduction, PARTIAL fallback, reverse switches) still passes
  unchanged after the split.
- **Lesson:** "it is never called" is an argument about behaviour; "it is not in the file" is a
  property of the artifact. For anything an operator will read as evidence, prefer the second.

### D-026 — a run with no space in it could not wrap, in either medium
- **Found:** user report, after D-024 — "those unbreakable words are a problem, they still aren't
  wrapping, can we make them just regular text so they can wrap?"
- **Established first, because the answer decided the fix:** they cannot wrap as regular text. TeX
  hyphenates letter sequences and `io.sdsasolutions.tacticalsettings` is not one; `\raggedright` puts
  a word that does not fit on the line regardless, past the column edge; and a zero-width space is
  **not** a break opportunity in XeTeX — measured with a `\parbox` with one and one without, which
  overflow identically. Every mechanism that breaks such a run has to be asked for in the markup.
- **Two symptoms, one cause.** The visible one was the run overflowing. The second was that an
  unmarked run is an unbreakable word and therefore a HARD floor — its column must be wide enough to
  hold it whole. Several together exceed the page, every floor is then cut in proportion, and the one
  column that genuinely cannot wrap (a one-word heading) is cut with them. So the marking fixed the
  starvation as well as the wrapping.
- **Fix:** a space-free run of 18 characters or more, shaped like an identifier (a `. _ - /` or a
  camelCase hump), is emitted from `App.md.cell` as a code span — which reaches LaTeX as `\texttt`
  and so through the `\seqsplit` hook the profile has installed since v2.2. Chosen over a raw
  `\seqsplit{}` span specifically because a code span is verbatim and needs no second escaping path;
  this file's defect history is mostly escaping, and adding a LaTeX-only escaper for a cosmetic gain
  was the wrong trade. The cost is monospace, which for an identifier is correct typography.
- **The same defect in the browser:** a fixed-layout table with a colgroup does not wrap a long word,
  it lets it leave the cell. Preview and editor cells gained `overflow-wrap: anywhere`.
- **Locked by:** BRK-1 (8 tests), including that the surrounding text is still escaped exactly once,
  that ordinary prose is untouched, that a backtick inside the run cannot break out of the span, and
  that marking a run measurably returns page width to a column that cannot break.

### D-024 — unbreakable words overflowed into the next column
- **Found:** user report — "the text wrapping is a bit off, it goes into the next column a bit before
  wrapping around". Confirmed in the TeX log: `Overfull \hbox (4.59pt too wide)` on the bold heading
  `Description`, in the register tables.
- **Root cause:** a column was allocated a share of the page proportional to its CHARACTER count and
  then spent that share in POINTS. A character is not a fixed number of points — `i` is a third the
  width of `m`, `\texttt` is 0.53em flat, bold is 15% more than regular. A register table puts one
  monospace key column beside four of prose, which drags the points-per-character rate down for
  everyone; prose absorbs that by wrapping, and a single unbreakable word cannot.
- **Measured, not assumed:** `\savebox`/`\the\wd` over representative strings in Latin Modern at
  11pt. Bold `Description` is 63.36pt where the column had 57.9pt. The first attempt at the model
  guessed bold at 1.06 and monospace at 0.6 and made the overflow *worse* (7.8pt) — which is what
  prompted measuring rather than tuning.
- **Two wrong turns worth recording**, both left as comments where they were made:
  1. Excluding code spans from the floor (they can `\seqsplit` on the page) starved the key column
     to 7% and stacked identifiers six characters to a line.
  2. Taking the larger of the source floor and the page floor per column let the SOURCE floor decide
     the page FRACTION — giving the key column a third of the page, which was the original squeeze.
- **Fix:** ems decide the proportions; three tiers of claim (hard floor, soft floor, appetite) are
  settled in order; and the whole table is scaled up uniformly until the widest source floor fits, so
  the source and page floors both hold without either distorting the other. Locked by AUTO-2.
- **Result:** every genuine overfull box in the reference document is gone; only the four 0.1111pt
  longtable rounding artifacts remain. The widest `.md` line fell from 365 characters to 196.
- **Lesson:** when a model converts between two currencies, the exchange rate is a measurement, not a
  constant to be tuned until the symptom goes away.

### D-025 — three things the preview showed that the page does not
- **Found:** user report, all three in one pass.
- **The outline rail printed the escaping** (`Firmware \& build`). It is written into the rail as
  text and HTML-escaped there, never parsed as markdown, so the markdown escaping had nothing to
  undo it. Fixed with `mdPreview.unescapeMd`, used for text destinations only — the heading itself
  still goes through `inline()`.
- **Every firewall rule in a cell ran together.** A grid-table cell is a run of PARAGRAPHS: pandoc
  folds consecutive lines into one and a blank line starts a new one. `parseGrid` dropped every blank
  line as padding (only the trailing ones are padding) and the renderer emitted the lines verbatim,
  so the separation HUM-1 had deliberately encoded was thrown away twice over. The PDF was correct
  throughout; only the preview was wrong.
- **An unstyled header was painted dark.** The page inherited `.rd-preview-doc .prv-table th`, whose
  `--c-surface-alt` is a near-black in dark mode — a black header on a white sheet, and an unstyled
  table that looked shaded. The page now states its own table background and the profile's shade rule
  follows it; the static stand-in colours are gone, so no shade in the profile means no shade in the
  preview.
- **Locked by:** PRV-3 (7 tests), including one that asserts the shade rule is emitted *after* the
  background reset — order is load-bearing at equal specificity.

### D-023 — the section preview showed the name where the page shows the heading
- **Found:** user report. Setting a section NAME (for the designer's list) changed what the Section
  pane's preview printed as the heading; the full-document preview kept printing the heading.
- **Root cause:** `sectionPreview` built its heading with
  `headingFor(Object.assign({}, resolved, { title: block.label }))`. That override predates NAM-1,
  when a block's label WAS its heading and the assignment was a no-op. NAM-1 made `label` the name
  and `title` the heading, and the line quietly started substituting one for the other.
- **Impact:** a preview of a page, showing a string that will not be on the page. Contained to the
  Section pane — `App.doc.render` never used that path — which is why the two previews disagreed.
- **Fix:** the override is gone; `resolved` already carries the heading. Locked by NAM-2/CCOL-2
  ("the section preview shows the HEADING, not the list name").
- **Lesson:** an assignment that is a no-op today is a silent assumption about tomorrow. When a field
  splits in two, the no-ops are where the old meaning is still written down.

### D-021 — the automatic wrap cut a register key in half
- **Found:** reading the rendered PDF after AUTO-1 made the automatic width path wrap. The Tactical
  table's first row read `**appInstallWhitelist` with literal asterisks, in two pieces.
- **Root cause:** the width floor was computed from the longest *plain* word, discounting code spans
  on the reasoning that `\seqsplit` breaks a `\texttt` on the page anyway. True of the page, false
  of the source: the break happens in the MARKDOWN, and half a fence is not a fence. Pandoc rejoins a
  cell's lines with a space, so `` `appInstall `` + `` Whitelist` `` becomes one code span with a
  space through the middle of the package name, and the `**` around it no longer parses as emphasis.
- **Impact:** every register table, on the first build after the change. A wrong package name in a
  hardening report is exactly the class of error D-013 is about — an artifact that misrepresents.
- **Fix:** the floor is the whole space-free token, markup included, so a column is never narrower
  than something that cannot be broken; the budget grows to hold the floors rather than the floors
  being cut to fit it. `safeCut` additionally refuses to land between the two asterisks of `**`,
  which would leave a lone `*` on each line. Locked by AUTO-1 ("an unbreakable token is never cut in
  half", "the wrapper never leaves a lone asterisk on a line").
- **Lesson:** the seqsplit hook made the identifier breakable in the OUTPUT, and it was tempting to
  spend that in the SOURCE. Two different documents, two different sets of rules.

### D-022 — the Control coverage table was mashed, and overflowed the page
- **Found:** user report against the preview — first columns crushed left, last crushed right, the
  Items column taking the whole table, while the register tables looked right.
- **Two causes, both real:**
  1. Automatic widths were "each column as wide as its widest line", and pandoc reads those source
     widths as PROPORTIONS. The Items cell lists every package satisfying a control, so it claimed
     nearly the whole width and left the other three a few characters each. The register tables
     escaped it only because their long column happened to be near the middle of the range.
  2. The table was in the PIPE form, which becomes a LaTeX `tabular` of `l` columns. Those do not
     wrap, so the long justification ran off the right of the page in the PDF as well — the preview
     was showing a real defect, not a preview defect.
- **Fix:** automatic now lays a too-wide table out — floors first (longest unbreakable word, plus a
  safety margin on the heading, which is the one thing that cannot absorb being squeezed), then the
  slack shared by appetite. A table that fits is untouched, byte for byte. And the grid form is now
  chosen whenever a table is wider than the budget, not only when a cell holds a line break, so its
  cells can wrap at all. Locked by AUTO-1 (7 tests).
- **Also, at the same request:** widths can now be set by hand on generated tables (TW-2), which is
  the reliable answer when a table has to be exact — the automatic rule is a rule of thumb and is
  documented as one.

### D-019 — a captioned table printed its number twice
- **Found:** rendering a generated document to PDF while building CAP-1, before adding automatic
  captions to anything else.
- **Root cause:** pandoc's LaTeX writer emits a caption as `\caption{...}`, and LaTeX's longtable
  prefixes it with `Table N: ` from its own counter. `App.doc.renderPart` had also been writing
  `Table ' + meta.number + ' — ' + caption` into the caption text, on the same reasoning that governs
  section numbering here (App.doc writes the numbers so a cross-reference can name one that exists).
  For *sections* that is right — `numbersections` is off, so LaTeX writes none. For *tables* it is
  not: there is no equivalent switch in play and LaTeX numbers them regardless.
- **Impact:** cosmetic but embarrassing in a signed report, and present in every captioned table since
  v2.2. Invisible to the suite, which asserted the markdown contained `: Table 3 — Ports` — which it
  did, correctly, for the design as written.
- **Fix:** the caption is the text alone. `App.doc.tableIndex` keeps numbering, but only to build the
  LABEL a cross-reference shows; the two agree because every table is now captioned (CAP-1) and both
  count them in emitted order. An uncaptioned table is therefore not allowed: one would advance
  LaTeX's counter without advancing ours and every later reference would be off by one.
- **Lesson:** the same one as D-010/D-016 in a new medium — an emitted artifact is not verified by
  inspecting the emitter's output. This needed a rendered page.

### D-020 — an aligned grid table lost every one of its body rows
- **Found:** looking at the first PDF built from a table with dragged column widths (TW-1). The table
  rendered as a shaded header row with nothing underneath it.
- **Root cause:** `gridTable`'s border writer was `if (ch === '=' || align[i])`, so a column with an
  alignment put its `:` marker on the `-` borders as well as on the `+===+` header separator.
  Pandoc 3.1.11 accepts alignment markers **only** on the header separator; a `-` border carrying one
  makes it stop reading the block as a table's body. It does not warn — it drops the rows.
- **Measured, not assumed:** two identical two-row grid tables through `pandoc -t native`, one with
  colons on every border and one with colons on the header separator alone. The first yields zero
  body cells, the second yields them all.
- **Latency:** present since v2.2, but unreachable in practice — it needed a table that was both
  aligned *and* in grid form, and grid form was only chosen when a cell was multi-line. TW-1 routes
  every width-bearing table to the grid form, so every such table hit it at once.
- **The mirror image, in the preview:** `App.ui.mdPreview` matched a grid table with `/^\+[-=+]/`,
  which an aligned border (`+:---`) does not satisfy. So an aligned grid table was shown as prose —
  the preview and the PDF were wrong about the same table in two different directions.
- **Fix:** markers on the header separator only; the preview's three border patterns widened to
  accept `+:`. Locked by TW-1 ("alignment markers stay on the header separator alone", "an ALIGNED
  grid table is still read as a table by the preview") and by the end-to-end grid-alignment check.
- **Lesson:** D-010's again. The markdown looked right, the self-tests passed on it, and the table was
  empty. What found it was rendering the page and looking at it.

### D-018 — every "(none)" column filter returned an empty table
- **Found:** user report. Filtering Tactical by Control Refs -> "(none assigned)" to find actions
  with no control mapped returned nothing, on a register known to contain plenty.
- **Root cause:** the sentinel carried by every "(none)" / "(not set)" option was `U+0000`.
  It was chosen to be impossible to collide with a real control id, relevance option or decision
  value — which it is. But it also has to survive being written into an `<option value="...">` and
  read back off the DOM, and it does not: **the HTML tokenizer rewrites `U+0000` to
  `U+FFFD`**. So the option carried the replacement character, the change handler stored
  that in `ui.colFilters`, and `colFilterPredicate` compared it against the NUL sentinel, failed,
  and fell through to the "must equal this control id" branch — which no row satisfies. Every row
  was rejected.
- **Measured, not assumed:** a jsdom probe wrote each candidate sentinel into an `<option value>`
  and read it back. `U+0000` became `U+FFFD` (broken); a private-use codepoint
  (U+E000), U+0001 and a plain ASCII token all round-tripped unchanged.
- **Scope:** all three "(none)"-shaped filters — Action "(not set)", Security Relevance "(not set)",
  Control Refs "(none assigned)" — in every data table, plus the Control Manager's copy (CMF-1),
  whose fallback held a **raw NUL byte** in the source.
- **Fix:** one `FILTER_NONE` constant in `App.ui.model`, built as `String.fromCharCode(0xE000)` so
  the character never appears literally in the file, replacing six literals and the raw-NUL
  fallback. A private-use codepoint keeps the original impossible-to-collide property (no real
  identifier contains one) while being parse-stable.
- **Why the suite missed it:** FIL-1 and CMF-1 tested the predicate by handing it
  `App.ui.model.FILTER_NONE` directly in JavaScript. Both sides of that comparison were the same
  constant, so it could never fail. The defect lived entirely in the layer the tests skipped — the
  round trip through rendered HTML.
- **Locked by:** FIL-3 (6 tests) which renders the real table HTML, parses it with the real HTML
  parser, reads the option value off the `<select>`, and feeds *that* to `filterSortRows` — plus a
  guard that the sentinel contains neither a NUL nor a replacement character, and one that no raw
  NUL is left in the source. Four of the six fail against the pre-fix sentinel.
- **Lesson:** the same shape as D-010 and D-016. A test that constructs the input it is about to
  assert on cannot find an encoding bug; the input has to come from where the real input comes from.
  Three defects now have had "the test never crossed the boundary the bug lives on" as their cause.
