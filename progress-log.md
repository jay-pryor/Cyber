# CH Config Tool — Build Progress Log

Tracking implementation of the CH Config Tool per `android-ch-config-tool-build-spec-v1.0.md`.

Output artifact: `ch-config-tool.html` (single self-contained file).

Process per task (build phase): **build → review → devise tests → log defects in defect register → fix.**

---

## Phase status

| Phase | Title | Status | Accept test |
|-------|-------|--------|-------------|
| 0 | Skeleton & conventions | ✅ complete | page loads, harness runs, sha256/zip self-tests pass |
| 1 | Data model & project I/O | ✅ complete | round-trip lossless; malformed reports issues |
| 2 | Adapter framework & Android adapters | ✅ complete | parsers pass on fixtures; tactical round-trips |
| 3 | Read-only tables (data-driven) | ✅ complete | tables render; search/sort/filter; 1.5k rows |
| 4 | Onboarding & triage | ✅ complete | inherit/flag-new; re-onboard versioning |
| 5 | Decision editing & gating | ✅ complete | deciding flips ready; buttons gate |
| 6 | Device view | ✅ complete | per-device read-only panels |
| 7 | Generators | ✅ complete | valid zip; deterministic; Word HTML |
| 8 | Hardening & polish | ✅ complete | all DOD verified |

Legend: ⬜ not started · 🟡 in progress · ✅ complete · 🔴 blocked

**ALL 9 PHASES COMPLETE (0–8).** 123/123 embedded self-tests pass. Validated end-to-end against the
real reference captures. Remaining: two manual checks only — open `ch-config-tool.html` in Chrome/Edge/
Firefox (DOD-1), and open a generated `report.html` in Microsoft Word (DOD-8). Defect register: 8
defects found during review, all FIXED.

---

## Log

(entries appended chronologically below)

### 2026-06-30 — Phase 0: Skeleton & conventions — ✅ COMPLETE

**Built:**
- Single-file `ch-config-tool.html` scaffold: HTML head with file:// + determinism doc banner,
  inline CSS design system (custom properties, neutral high-contrast palette), `#root` mount.
- `App` namespace root; ordered `<script>` IIFE module pattern per spec §14 with a clearly-marked
  INSERT-POINT for future engine/adapter/UI modules before bootstrap.
- `App.types` — central JSDoc typedef vocabulary (Issue, ParseResult, RegisterItem, Snapshot,
  DeviceConfig, Project, DecisionField, ColumnDef, GeneratedFile, DeviceContext).
- `App.util.clock` — injectable UTC time source (nowIso/setClock/resetClock).
- `App.util.html` — esc/attr/el (all HTML output funnels through esc).
- `App.util.hash` — VENDORED pure-JS SHA-256 (UTF-8), required since crypto.subtle may be absent.
- `App.util.crc32` — VENDORED table-based CRC-32 for ZIP.
- `App.util.zip` — VENDORED store-only ZIP writer; fixed DOS date 0x0021 / time 0x0000 and fixed
  attribute fields for byte-determinism. Exposes zipBytes() (sync, testable) + zip() (Blob).
- `App.util.csv` — RFC-4180 CSV export.
- `App.util.dom` — mount/clear/on/download/readFileText (the only DOM/IO util).
- `App.test` — embedded harness (assert/assertEqual/assertDeepEqual/assertThrows/suite/test/run/
  runAndRender); runs only on `#selftest`.
- Phase-0 self-test suites for clock/html/hash/crc32/zip.

**Review & tests devised:**
- Built a headless Node runner (`scratchpad/run-selftests.js`) that strips HTML comments, extracts
  script blocks, shims browser globals, and runs `App.test.run()`.
- SHA-256 verified against FIPS 180-4 vectors (empty, "abc", 448-bit, 1000×'a') + UTF-8 'é' vs Node
  crypto. CRC-32 verified against the canonical 0xCBF43926 check value.
- ZIP: byte-equality across two builds, fixed DOS date/time bytes, PK signature, mime; plus an
  integration check writing out.zip and extracting it with system `unzip` (valid, 1980 date,
  subdir + content correct).

**Defects:** D-001 (wrong SHA-256 test vector for 'é' — fixture error, not code) — FIXED.

**Result:** 15/15 self-tests pass; ZIP validated by external unzip. Acceptance met.

**Note:** Headless eval is strong evidence of no load-time errors; a final manual open in
Chrome/Edge/Firefox is still recommended at Phase 8 (DOD-1).

### 2026-06-30 — Phase 1: Data model & project I/O — ✅ COMPLETE

**Built:**
- `App.util.stable.stableStringify` — canonical JSON (sorted object keys, **array order preserved**
  for tactical-template fidelity, undefined dropped, 2-space/\n). Single source for project/manifest/
  tactical serialization.
- `App.registry` — registerPlatform/listPlatforms/has/get/getActivePlatform/setActivePlatform/
  getDataset/datasetIds/_reset. First-registered becomes active.
- `App.projectIo` — parseProject (never throws; returns located Issues), serializeProject (canonical:
  devices by baseId+version, items by key, ismRefs sorted, snapshot keys sorted), migrate (v1
  identity), and full Appendix-A `validateSchema` incl. per-baseId version-integrity (contiguous
  1..n, supersedes-chain, single latest).
- `App.store` — empty/init/getProject(deep clone)/onChange/isDirty/markSaved/recomputeStatus +
  internal transactional `_commit` (bumps modifiedUtc from injected clock, recomputes status, emits).

**Review & tests devised:** 23 new self-tests covering stableStringify semantics, every schema
rejection path (bad JSON, unknown top key, bad version, unregistered platform, unknown dataset id,
bad sha, unsorted keys, dup key, broken/valid version chains), round-trip identity
`serialize(parse(serialize(P)))===serialize(P)`, order-independence (shuffled input → same bytes),
migrate identity, and store deep-clone isolation / event subscribe-unsubscribe / commit timestamp.

**Defects:** none found (edge cases covered: template array-order fidelity, status-recompute vs
losslessness, nested-key tolerance per Appendix A which only mandates top-level rejection).

**Result:** 38/38 self-tests pass (15 Phase 0 + 23 Phase 1). Acceptance met.

### 2026-06-30 — Phase 2: Adapter framework & Android adapters — ✅ COMPLETE

**Built:**
- `App.adapters.android`: two-layer shell-escaping helpers `psSingleQuote`/`shSingleQuote`;
  tactical path helpers (`parsePath`/`setAtPath`); `flattenTactical` (objects recurse, scalar-only
  arrays are whole leaves, arrays-of-objects recurse with `[i]`, JSON types preserved);
  `rebuildTacticalDoc` (deep-clone template + apply decided values at paths). Three adapters
  (packages/settings/tactical), each with id/label/inputKind/captureHint/parse/decisionSchema/
  validateDecision/isComplete/columns + generators (implemented early w/ correct escaping) +
  renderReportSection. Stable greppable `# TODO(tactical-apply):` marker.
- `App.platforms.androidAdb`: profile assembling the three datasets + PowerShell preamble (StrictMode,
  adb-presence check, single-device guard, transcript) / postamble / captureInstructions.
- Bootstrap now registers `android-adb` (one call; zero core edits — DOD-11 seam).

**Review & tests devised:** 23 new self-tests — packages parse (prefix/=path strip, dedupe, sort,
empty, malformed-token), settings parse (3 namespaces, verbatim value incl. the adversarial
`a'b"c$(whoami)\` d;e` and an `=` value, unknown ns, malformed key, wrong field count, dup),
tactical flatten/rebuild round-trip + partial + type fidelity, decisionSchema/isComplete/
validateDecision per dataset, **two-layer escaping round-trip** of the adversarial value (unwrap PS
then POSIX → recover literal), and platform registration.

**Defects:** D-002 (tactical non-object root crashed rebuild) — FIXED + regression test added.

**Decisions documented:** settings value absorbs post-2nd-tab remainder (tolerates tabs-in-value,
so "extra fields" is unreachable by design); `-f`-style package lines are out of scope per the
documented capture format; package presence-guard is a v1 placeholder function.

**Result:** 61/61 self-tests pass. Acceptance met (parsers pass on valid+malformed fixtures;
tactical flatten/rebuild round-trips).

### 2026-06-30 — Phase 3: Read-only data-driven tables — ✅ COMPLETE

**Built:**
- CSS design system extended: topbar, data-driven tab nav (with per-dataset incomplete count
  badges), sortable sticky table, decided/undecided/superseded badges, Activity drawer.
- `App.ui.model` (pure): getLatestConfigs (excludes superseded), computeAppliesTo (key→device
  names), countIncomplete, filterSortRows (search/sort/incomplete + stable key tiebreak).
- `App.ui.activity`: append-only timestamped drawer log + logIssues + emitter (nothing fails
  silently).
- `App.ui.tables`: data-driven render — columns from `adapter.columns` + computed Applies-to/Status;
  every cell escaped; undecided rows flagged; toolbar separated from #table-host so the search input
  keeps focus on keystroke.
- `App.ui.app`: full shell/controller — top bar (Load/Save/Export CSV/platform selector/Self-tests),
  data-driven tabs, main view, drawer; project Load (FileReader→parseProject→store.init, errors to
  drawer), Save (serializeProject→download, marks saved), CSV export; debounced search,
  click-to-sort, incomplete toggle, tab switch; re-renders on store/activity change.

**Review & tests devised:** 10 new self-tests (ui.model latest/appliesTo/count/search/filter/sort;
ui.tables row rendering, undecided flag, **HTML-escaping of a `<script>` payload**, 1500-row render).
Plus a headless `mount()` smoke test confirming the full controller path runs without throwing.

**Defects:** D-003 (1500-row test counted the header `<tr>`; test-assertion error) — FIXED.

**Limitation noted:** end-to-end DOM interactivity (focus retention, real file picker, sort clicks)
is exercised via render-to-string + mount smoke test headlessly; a manual browser pass is scheduled
for Phase 8 (DOD-1).

**Result:** 71/71 self-tests pass. Acceptance met.

### 2026-06-30 — Phase 4: Onboarding & triage — ✅ COMPLETE

**Built:**
- `App.diff.triage` (pure): new/existing split; register-only keys ignored; order preserved + dedupe.
- `App.validation`: `validateOnboarding` (name + per-slot parse errors as located issues),
  `validateProject` (per-item adapter decision validity).
- `App.store` mutations: `onboardDevice`/`reonboardDevice` (ONE shared code path, spec §8.7) keyed on
  `baseId = slug(name+model)` and snapshot-hash identity → no-op when identical, else v1 or a new
  superseding version; per-dataset triage; settings default-drift detection (§8.4, info only);
  append-only (never deletes items). Plus `applicableItems`, `undecidedCount`, `slugify`,
  `getLatestConfigs`.
- `App.ui.views.onboard`: three data-driven file slots with live parse status (✓N / ✗error), capture
  instructions, name/model/firmware fields, re-onboard note, gated Onboard button; on commit logs the
  triage summary + drift to the drawer and switches focus to the first dataset filtered Incomplete-only.
- View infrastructure in `App.ui.app`: a controller `ctx` (refresh/refreshMain/switchTab/
  openDatasetIncomplete) handed once to each view's `wire(ctx)`; view tabs render with or without a
  loaded project (onboarding from scratch auto-creates an empty project).

**Review & tests devised:** 13 new self-tests — triage; validateOnboarding; fresh onboard (v1, all
undecided); device #2 inheritance (flags only new); default-drift info; **identical re-onboard
no-op (byte-identical serialized state before/after)**; **differing re-onboard → v2 supersedes v1,
decision on a shared key preserved, append-only**; reonboard alias; applicableItems/undecidedCount.
Plus headless mount smoke test (onboard renders 3 slots, button gated, default tab = onboard).

**Defects:** D-004 (blocker — `onboardDevice` called the exported alias `_commit` instead of the
local `commit`; every onboard threw) — caught by tests, FIXED.

**Result:** 84/84 self-tests pass. Acceptance met.

### 2026-06-30 — Input-format reconciliation against real reference captures

User supplied real device captures in `Reference Input Files/` (`packages.txt`, `settings.txt`,
`policy-config-…json`) and asked to make parsing compatible.

**Findings (ran the real files through the live adapters):**
- `packages.txt` → 438 items, 0 errors. **No change needed** (matches the `package:` one-per-line format).
- `policy-config…json` (tactical) → 232 leaves, 0 errors, round-trips identically. **No change needed**
  (object-root JSON; flatten handles nested objects, scalar arrays, and arrays-of-objects).
- `settings.txt` → **806 errors**. Real format is sectioned `<namespace>:` headers + `key=value`
  lines (output of `adb shell settings list`), NOT the spec's tab-separated `ns<TAB>key<TAB>value`.

**Changes (see defect D-005):** rewrote `android.settings.parse` to the sectioned `key=value` format
(first `=` splits; value verbatim); extended the key charset to allow `#` (Samsung `add_info_*`
keys); updated `captureHint`, platform `captureInstructions`, all settings fixtures, and Phase-2/4
tests; added targeted tests (`#` keys, first-`=` split, spaced values, pre-section error, blank-line
tolerance).

**Validation:** all three real files parse with 0 errors; a full onboard from them creates the
device + register (438/803/232 items), the project passes schema validation, serialize round-trips
stably, and generation of `#`-keys / spaced / adversarial values is injection-safe (two-layer
escaping verified). Self-tests: **86/86 pass**.

**Note:** Generators/report (Phase 7) and the device view (Phase 6) read items format-agnostically
(by key/decision), so no further follow-on changes are required from this format change.

### 2026-06-30 — Phase 5: Decision editing & gating — ✅ COMPLETE

**Built:**
- `App.completeness` (pure): `itemComplete` (adapter.isComplete + REQUIRE_ISM_REF fold), `deviceReadiness`
  (per-dataset undecided reasons), `deviceReady`. `REQUIRE_ISM_REF` config flag (default false).
- `store.recomputeStatus` now folds in `completeness.itemComplete` so the ISM policy affects status.
- `store.setDecision` (stores value even if invalid → never silent-drops; returns issues; completeness
  gates readiness) and `store.setItemFields` (description/ismRefs/rationale/rollback).
- Adapters gained `capturedDefaults(snap)` (settings: values→{value,type:'string'}; tactical: flatten
  template) to prefill editors.
- `App.ui.tables` rewritten for inline, **decisionSchema-driven** editors: enum→`<select>`,
  string→input, value-typed→value input + type select, bool→checkbox; plus a per-row expander with
  description/ISM/rationale/rollback editors and inline validation issues; invalid decision cells flagged.
- `App.ui.app` edit wiring: decision change → gather cell controls + coerce (value-typed by type) →
  `setDecision`; field edits → `setItemFields`; expander toggle; transient `_editIssues` surfaced inline.
- `App.ui.views.generate`: device selector + three independent commands gated by `deviceReady`,
  disabled buttons showing the reason ("N settings undecided, …"); calls `App.generate` if present
  (Phase 7) else logs intent.

**Review & tests devised:** 16 new self-tests — completeness (incl. REQUIRE_ISM_REF fold and
readiness flip), setDecision valid/invalid/clear/unknown, setItemFields, data-driven editor rendering
per dataset (+ capture prefill, expander, invalid-cell flag), generate gating (disabled+reason vs
enabled+ready). Plus a real-app boot simulation.

**Defects:** D-006 (trivial test-assertion error re: settings type-field kind) — FIXED.
**D-007 (major)** — embedded test suites registered a mock platform at module-LOAD, making it the
active platform in the real app; surfaced by the mount smoke test. Made all test registrations lazy;
verified real-app boot now registers only android-adb (active), tab=onboard. — FIXED.

**Result:** 101/101 self-tests pass. Acceptance met (deciding all applicable items flips the device
to ready; generate buttons enable/disable with correct reasons).

### 2026-06-30 — Phase 6: Device view — ✅ COMPLETE

**Built:**
- `App.ui.views.devices` with two modes:
  - **List** — device configs grouped by `baseId`, latest first; each row shows model/firmware/
    version, per-dataset `decided/applicable` counts, a ready badge or undecided count, and a View
    button. Older versions are flagged `superseded` (read-only history); note states the latest is
    active for generation.
  - **Detail (DOD-9)** — three read-only panels (one per dataset) listing EXACTLY the device's
    applicable ∩ decided items (key / decision via the adapter's display column / ISM refs), each
    with a "N decided of M applicable" note; superseded versions show a read-only banner; Back button.
- CSS for the device list/panels.

**Review & tests devised:** 6 new self-tests — list (names, ids, `Packages 1/2` counts, versions),
superseded grouping+flag, detail shows exactly applicable∩decided (com.a shown; undecided com.b and
non-applicable com.c both excluded), decision-value display, superseded banner, missing-id fallback.

**Defects:** D-008 (minor) — device view derived datasets from the ACTIVE platform, not the loaded
project's platform; threw when they differ. Fixed: view derives datasets from `project.platformProfileId`,
and project-load now sets the active platform to match. Caught by the Phase-6 tests.

**Result:** 107/107 self-tests pass; clean boot simulation (only android-adb registered/active; all
three views present). Acceptance met (panels show exactly the applicable decided items per dataset).

### 2026-06-30 — Phase 7: Generators — ✅ COMPLETE

**Built:**
- `App.report.wrapReport(title, meta, sections)` — self-contained Word-targeted HTML (inline CSS Word
  honours: real bordered tables, heading styles, `page-break-before:always` between sections). All
  dynamic text escaped (DOD-8).
- `App.generate` — three INDEPENDENT commands:
  - `buildImplementation` / `buildVerification`: per dataset, gather applicable+complete items →
    adapter generator → wrap script files (per `platform.scriptExtension='.ps1'`) with preamble/
    postamble, leave data files (tactical.json) unwrapped → manifest → ONE store-only zip.
  - `buildReport`: dataset report sections + an ISM-coverage section (items grouped by ISM ref,
    sub-grouped by dataset) → Word-HTML → zip.
  - Each manifest records tool/version, command, generatedUtc, projectSha256, per-output sha256, the
    device record, and the decision snapshot used. Zip name `<device>-<command>-<UTCstamp>.zip`.
- Generate tab (built Phase 5) now drives real downloads via `App.generate`.

**Review & tests devised:** 11 new self-tests — report shell structure/escaping/page-breaks; impl
emits wrapped scripts + unwrapped tactical.json + manifest (with the correct rebuilt value); only
decided applicable items appear; manifest hashes + decisions; verification scripts; report includes
ISM coverage; and **determinism (DOD-7): byte-identical zip across two builds under a fixed clock**
for both scripts and report.

**Real-data integration (external):** generated all three zips from the actual reference captures
(438/803/232 items, deviceReady after auto-deciding), wrote them to disk, and unzipped with the
system `unzip`: valid structure, PowerShell preamble banner, **valid `tactical.json` (26 keys)**,
manifest with 438 package decisions; the real spaced value `Galaxy Tab Active5 5G` is correctly
two-layer escaped; the tactical `# TODO(tactical-apply)` marker is present; report.html is well-formed
(DOCTYPE, balanced tables, 4 sections). All three commands **byte-identical across two builds**.

**Defects:** none found.

**Result:** 116/116 self-tests pass. Acceptance met (valid zips; deterministic under fixed clock;
Word-HTML report — final visual Word open is a manual check noted for Phase 8 / README).

### 2026-06-30 — Tactical apply model corrected (Knox JSON upload)

**Clarification from user:** the tactical config is applied by **manually uploading the emitted JSON
to Knox tactical** — there is NO adb/PowerShell push step and no extra work beyond producing the JSON.

**Change:**
- `android.tactical.generateImplementation` now emits ONLY `tactical.json` (the rebuilt config), in the
  SAME format/structure as the captured input (rebuildTacticalDoc preserves object shape, nesting,
  arrays, and JSON types). Removed the `tactical.impl.ps1` push scaffold and the `# TODO(tactical-apply)`
  marker entirely.
- `generateVerification` for tactical now emits a non-script `tactical.verify.txt` (EVIDENCED note:
  applied via Knox upload; confirm in the Knox console) — not adb-wrapped.
- Updated capture hint and the Phase-2/Phase-7 tests accordingly.

**Validated:** real-data Implementation.zip = {packages.impl.ps1, settings.impl.ps1, tactical.json,
manifest.json}; the emitted `tactical.json` has the identical 26 top-level keys / nesting / types as
the input reference and is byte-deterministic. 116/116 self-tests pass.

**Note:** this removes the only spec-sanctioned v1 TODO; tactical is now fully realised (no stub).

### 2026-06-30 — Phase 8: Hardening & polish — ✅ COMPLETE

**Built:**
- **DOD-11 portability self-test** — an Appendix-D.4 mock platform (`mock.kv`) registered lazily, then
  driven through onboard/triage, the generic table+editor, completeness, generation (impl + report),
  and a lossless round-trip — all with **zero core edits**. Proves the modularity guarantee.
- **DOD checklist self-tests** — DOD-2 identity, DOD-10 never-throw/located issues, DOD-12 module presence.
- **`beforeunload` dirty guard** (§6.6) — warns before leaving with unsaved changes.
- **Global error boundary** — `window.onerror`/`unhandledrejection` surface to the Activity drawer
  (never blank-fail, §12.1).
- **localStorage draft autosave** (§6.6, C-4) — debounced write on change, all access try/catch-guarded
  (degrades silently); a clearly-labelled non-canonical restore banner offers Restore/Discard on load;
  Save clears the draft; restored drafts are marked dirty. Round-trip verified headlessly.
- **In-app Help view + tab** — how state/saving works, capture formats, output/determinism notes.
- **Accessibility pass** — semantic landmarks (`header`/`nav`/`main`), `role="tablist"`/`tab` +
  `aria-selected`, `aria-label`s on controls, `:focus-visible` outline, colour never the sole signal
  (text badges everywhere).

**Review & verification:**
- 7 new self-tests → **123/123 pass**.
- Constraint audit: no `fetch`/XHR/WebSocket/beacon, no `crypto.subtle`, no File System Access API, no
  external `<script src>`/CDN — all confirmed (the only `fetch`/`crypto.subtle` strings are in comments).
- Real-data integration re-run: all three commands byte-deterministic from the reference captures.
- README updated with the DOD-1…DOD-12 checklist and the two remaining MANUAL checks (DOD-1 open in
  three browsers; DOD-8 open report.html in Word).

**Defects:** none found in Phase 8.

**Result:** 123/123 self-tests pass; all programmatic DOD items verified. Build complete pending the
two documented manual checks.
