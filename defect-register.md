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
