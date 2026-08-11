# CH Config Tool — Engineering Task Breakdown (v2.0)

**Companion to:** `android-ch-config-tool-build-spec-v2.0.md` (the *spec*). The spec is normative;
this document decomposes it into **discrete, independently-buildable tasks**. Every "§" reference
points into the spec.

**v2.0 supersedes v1.0** (`Archive/android-ch-config-tool-task-breakdown-v1.0.md`, kept for the audit
trail). Task ids are unchanged so that the progress log and commit history stay resolvable. What
changed: **T2.4 (the `android.settings` adapter) and T-RV5.3 (the settings assignment CSV) are
withdrawn**, every task that assumed three datasets now reads *per dataset*, and a new **Phase 12**
records the retirement itself (§21). Withdrawn tasks are retained as tombstones rather than deleted,
so a reader tracing a task id from an older log finds out what happened to it.

**Phase 13** adds the v2.1 features (§22): value formats and the sticky tools rail. It supersedes
**T-RV8.1** (the name-only control picker).

**How to use this document (read first).** Each task below is written so that an implementing agent
can take **just that one task block**, read the referenced spec sections and the already-built
modules, and complete the task **in a single pass** with no further planning. Tasks are listed in
**strict dependency order**; do not start a task until every task in its `Depends on` list is merged
and its self-tests pass. A task is *done* only when (a) its Definition-of-Done bullets all hold,
(b) the self-tests it adds pass via `#selftest`, and (c) it introduced **no console errors** and
**no network calls** when the file is opened from `file://`.

---

## A. Global rules every task MUST honour

These are restated here so each task is self-contained; they bind in *all* tasks.

- **A-1 Single file.** Everything lands in one `index.html` (working name). New "modules" are added as ordered classic `<script>` IIFE blocks attaching to the `App` global, in the load order of §14. No bundler, no external files, no CDN, no `type="module"`.
- **A-2 Purity boundary.** `App.util.{clock,hash,crc32,zip,csv,html}`, `App.registry`, `App.store`, `App.projectIo`, `App.diff`, `App.validation`, `App.completeness`, `App.generate`, `App.report`, and all adapters/platforms are **pure**: no DOM, no `FileReader`, no downloads, no `Date.now()`/`Math.random()`. Only `App.util.dom` and `App.ui.*` touch the DOM/IO. A task that needs "now" or randomness uses `App.util.clock` and the injected id generator.
- **A-3 Determinism.** All serialized state and emitted artifacts are byte-stable for identical inputs (§6.6, §8.6, §10.4). Use `stableStringify`; fix ZIP DOS timestamps to `time=0x0000,date=0x0021` (§10.4/§17.C.3).
- **A-4 No core branching on dataset ids.** No literal `'packages'`/`'tactical'` outside the Android adapter/platform files (§5.3). Generic code iterates `registry.getActivePlatform().datasets` and reads each adapter's contract. The single sanctioned exception is the retired-dataset table in `projectIo` (§21.3), which names ids that are no longer datasets.
- **A-5 Result pattern.** Engine functions return values or `{ok, value?, issues:Issue[]}`; they do not throw for expected conditions (§12.1). `Issue = {category, severity, message, location?, fix?}`.
- **A-6 Output safety.** All data-derived text written to HTML passes through `App.util.html.esc`; all data-derived text written into generated scripts passes through the target-language quoting helpers (§13.4, Appendix B escaping contract).
- **A-7 Documentation.** Every `<script>` module carries the §13.1 header banner; every public function carries JSDoc (§13.2); vendored code is fenced `BEGIN/END VENDORED` with provenance; comment the *why* (§13.3). No commented-out dead code.
- **A-8 Tests co-located.** Each task that adds engine/adapter logic also registers `App.test` suites covering it; the suite is part of the task's deliverable, not a follow-up.
- **A-9 Load-order discipline.** When adding a module, insert its `<script>` at the correct position per §14 (`types → util.* → registry → projectIo → store → diff → validation → completeness → report → generate → adapters → platform → ui.* → bootstrap`). A module may only use namespaces that load before it.

**Task block format.** Each task has: *ID · Title*, **Depends on**, **Spec**, **Objective**,
**Build** (concrete requirements + signatures), **Self-tests to add**, **Definition of done**.

---

## Phase 0 — Skeleton & conventions

> Exit gate (spec Phase 0): page loads with no errors; the self-test harness runs an example passing suite; `sha256Hex` and `zip` self-tests pass on `file://`.

### T0.1 · HTML scaffold, `App` root, load-order skeleton, file:// caveat banner
- **Depends on:** —
- **Spec:** §3, §4, §11 (chrome only), §13.1, §14
- **Objective:** Create `index.html` with the document skeleton, the `App` namespace root, an ordered set of **empty placeholder `<script>` banners** in the §14 load order (so later tasks drop code into a known slot), a `<div id="root">`, and a **top-of-file comment** documenting every `file://` constraint from §3 (no ES imports, `crypto.subtle` may be undefined, no `fetch`, single-zip download throttling, unreliable `localStorage` origin, clipboard gesture). Inline CSS design-system scaffold (CSS custom properties for colour/spacing/typography per §11) — variables only, no components yet.
- **Build:** `var App = window.App || {};` root block first. Provide the empty banners: `types`, `util.clock`, `util.html`, `util.dom`, `util.csv`, `util.hash`, `util.crc32`, `util.zip`, `registry`, `projectIo`, `store`, `diff`, `validation`, `completeness`, `report`, `generate`, `adapters.android`, `platform.androidAdb`, `ui.app`, `test`, `bootstrap`. Bootstrap is last and currently mounts nothing.
- **Self-tests to add:** none yet (harness arrives in T0.10) — but ensure the page opens clean.
- **Definition of done:** Opening `index.html` from disk shows an empty shell, **zero console errors, zero network requests** (DOD-1 partial). The §3 banner is present and complete.

### T0.2 · `types` module (typedef vocabulary)
- **Depends on:** T0.1
- **Spec:** §5.1, §5.2, §6.2–§6.4, §12.1
- **Objective:** Declare, in one `types` module, the JSDoc `@typedef`s used everywhere: `DatasetAdapter`, `PlatformProfile`, `DecisionField`, `ColumnDef`, `ParseResult`, `RegisterItem`, `DeviceConfig`, `Snapshot`, `GeneratedFile`, `DeviceContext`, `Issue`. Include the §6.2 versioning fields (`baseId`, `version`, `supersedesId`).
- **Build:** No runtime code beyond an empty IIFE; this is the shared type contract referenced by `@param`/`@returns` in later modules. Match field names/types to the spec exactly.
- **Definition of done:** Every typedef in §5/§6 exists with accurate fields; later modules reference these names.

### T0.3 · `App.util.clock`
- **Depends on:** T0.1
- **Spec:** §7 (clock row), A-2, §13.4
- **Objective:** Single injectable time source.
- **Build:** `nowIso() → string` returns a UTC ISO-8601 string from an internal clock fn; `setClock(fn)` replaces it (tests/determinism). Default clock uses `new Date()` **only inside this module** (the one sanctioned place). No other module may call `Date` directly.
- **Self-tests to add:** `setClock(()=>'2020-01-01T00:00:00.000Z')` ⇒ `nowIso()` returns it; restore after.
- **Definition of done:** Determinism hook works; signature matches §7.

### T0.4 · `App.util.html` (escaping + builders)
- **Depends on:** T0.1
- **Spec:** §7 (html row), §10.3, §13.4
- **Objective:** `esc(s)` (HTML-escape `& < > " '`), `attr(s)` (attribute-safe), `el(tag, attrs, kids) → string` minimal builder.
- **Self-tests to add:** `esc('<a href="x">&\'')` ⇒ fully escaped; `el('td',{class:'x'},[esc('a&b')])` round-trips safely.
- **Definition of done:** All five HTML metacharacters escaped; used by every later HTML emitter.

### T0.5 · `App.util.dom` (the only generic DOM/IO helper)
- **Depends on:** T0.1
- **Spec:** §7 (dom row), §3 (download under file://), A-2
- **Objective:** `mount(parent, node)`, `clear(node)`, `on(node, evt, fn)`, and `download(blob, name)` (object-URL + programmatic `<a download>` click + revoke). This is **UI/IO** (impure) — the only generic module allowed to touch the DOM.
- **Self-tests to add:** DOM-touching, so guard behind a flag or test against a detached node; at minimum unit-test that `download` builds a valid object URL and revokes it (mockable).
- **Definition of done:** `download` works under `file://`; no other generic module performs downloads.

### T0.6 · `App.util.csv`
- **Depends on:** T0.4
- **Spec:** §7 (csv row), §11.1 (Export CSVs)
- **Objective:** `toCsv(rows, columns) → string` — RFC-4180 quoting (wrap fields containing `, " \n` in quotes, double internal quotes), `\n` line endings, header row from `columns`, deterministic column order.
- **Self-tests to add:** a row with a comma, a quote, and a newline serializes/parses-back correctly; column order stable.
- **Definition of done:** Deterministic, correctly quoted CSV.

### T0.7 · VENDORED `App.util.hash` — SHA-256
- **Depends on:** T0.1
- **Spec:** §3, §17.C.1, §13.3
- **Objective:** Pure-JS SHA-256 over UTF-8 strings/bytes (Web Crypto may be absent on `file://`).
- **Build:** Inline a compact public-domain/MIT implementation, fenced `BEGIN/END VENDORED` with source attribution. Expose `sha256Hex(strOrBytes) → string` (64-char lowercase hex). Must accept both a JS string (UTF-8 encoded internally) and a `Uint8Array` (raw uploaded bytes — needed for snapshot hashing of raw files).
- **Self-tests to add:** known vectors — `sha256Hex('') === 'e3b0c442...855'`, `sha256Hex('abc') === 'ba7816bf...ad15'`; bytes vs string of same content agree.
- **Definition of done:** Vectors pass on `file://` with no Web Crypto.

### T0.8 · VENDORED `App.util.crc32`
- **Depends on:** T0.1
- **Spec:** §17.C.2
- **Objective:** Standard table-based CRC-32 for ZIP entries. `crc32(bytes:Uint8Array) → number` (unsigned 32-bit).
- **Self-tests to add:** `crc32(utf8('123456789')) === 0xCBF43926`.
- **Definition of done:** Known vector passes.

### T0.9 · VENDORED `App.util.zip` — store-only, fixed-timestamp ZIP writer
- **Depends on:** T0.8
- **Spec:** §10.4, §17.C.3, A-3
- **Objective:** `zip(files:{name,content}[]) → Blob` (`application/zip`), stored (no compression), **byte-deterministic**.
- **Build:** Per-entry local file header + data, then central directory, then EOCD. CRC-32 from T0.8; compressed size = uncompressed size; little-endian sizes/offsets; UTF-8 filenames with the language-encoding (bit 11) flag set. **All DOS date/time fields fixed at `time=0x0000, date=0x0021`; version-made-by/needed, internal/external attributes, disk numbers all fixed constants.** Entry order = input order. `content` may be a string (UTF-8 encoded) or `Uint8Array`.
- **Self-tests to add:** `zip(files)` byte-equals a second `zip(files)` of the same input (compare via `Blob`→`ArrayBuffer`); the blob unzips in a real tool (manual note); a single-entry archive has the expected fixed timestamp bytes at the known offset.
- **Definition of done:** Deterministic across two calls; valid archive; honours A-3.

### T0.10 · `App.test` harness + `#selftest` runner
- **Depends on:** T0.3 (for clock control), T0.4
- **Spec:** §15, §11.1 (Self-tests dev link)
- **Objective:** Tiny in-file test framework: `assert`, `assertEqual`, `assertDeepEqual`, `suite(name, fn)`, `test(name, fn)`. A `#selftest` URL hash (or dev-panel button) runs **all** registered suites and renders pass/fail with deep-diffs. **MUST NOT run during normal use.**
- **Build:** Collect suites in a registry; the runner mounts a results panel into `#root` (or an overlay) only when the hash/flag is present. Show counts + per-failure diff.
- **Self-tests to add:** one example passing suite and one deliberately-failing-then-fixed example to prove diff rendering; wire the T0.3/T0.7/T0.8/T0.9 self-tests into suites.
- **Definition of done:** `index.html#selftest` runs all Phase-0 suites green; normal load runs none.

---

## Phase 1 — Data model & project I/O

> Exit gate: load/save round-trips the Appendix D sample losslessly (DOD-2); a malformed project reports located issues (DOD-10).

### T1.1 · `stableStringify`
- **Depends on:** T0.10
- **Spec:** §6.6, §8.6
- **Objective:** Canonical serializer used for the project file, manifests, and the tactical artifact.
- **Build:** Object keys sorted ascending; arrays of register items sorted by `key`; 2-space indent; `\n` newlines; no trailing whitespace; stable handling of `null`/booleans/numbers (no `NaN`/`Infinity`). Place in `store` (or a small `util` shared by store/projectIo/generate). Define where both projectIo and generate can use it without a cycle.
- **Self-tests to add:** two objects with differently-ordered keys serialize identically; arrays of items reorder by `key`; output ends without trailing whitespace and uses `\n`.
- **Definition of done:** Byte-identical output for semantically-identical inputs.

### T1.2 · `App.projectIo.parseProject` + schema validation + `migrate`
- **Depends on:** T1.1, T0.2
- **Spec:** §6.1, §17.A (Appendix A), §12
- **Objective:** `parseProject(text) → {ok, value?:Project, issues:Issue[]}`. Validates against Appendix A: required top-level keys, `schemaVersion===1`, `platformProfileId` a string, `meta` shape, `deviceConfigs[]`, `items` keyed by dataset id. **Reject unknown top-level keys.** Enforce DeviceConfig requirements **including version integrity** (per `baseId`: contiguous `1..n` chain, each non-v1 `supersedesId` references the prior version's `id`, exactly one latest per `baseId`). Snapshot requirements (`sha256` hex-64, `keys` unique+sorted). RegisterItem requirements. Each violation is a located `Issue`. `migrate(project)` switches on `schemaVersion` (identity for v1).
- **Self-tests to add:** valid sample (D.5) parses; each malformed case (missing key, unknown top-level key, bad version chain, non-hex sha256, unsorted keys) yields a precise located issue.
- **Definition of done:** Accepts D.5; rejects each malformation with a `{message, location, fix}` issue.

### T1.3 · `App.projectIo.serializeProject`
- **Depends on:** T1.2, T1.1
- **Spec:** §6.6, §8.6
- **Objective:** `serializeProject(project) → string` via `stableStringify`, timestamps already set by the store/clock.
- **Self-tests to add:** **round-trip identity**: `parse(serialize(parse(text).value)) ` deep-equals the first parse (load→save→load identity, DOD-2).
- **Definition of done:** Lossless, deterministic round-trip on D.5.

### T1.4 · `App.store` core (state, events, selectors)
- **Depends on:** T1.2
- **Spec:** §7.1, §6.5, A-2
- **Objective:** `init(project)`, `empty(platformProfileId) → Project`, `getProject() → deep-readonly snapshot`, `onChange(handler) → unsubscribe`. Hold mutable state internally; expose only deep-readonly views (freeze or structural copy). Implement read selectors `applicableItems(deviceId, datasetId)` and `undecidedCount(deviceId?)`. (Mutations that add data arrive in later phases.) `empty` produces a schema-valid blank project with `meta.createdUtc/modifiedUtc` from `clock`.
- **Self-tests to add:** `empty()` validates against projectIo; `onChange` fires on a no-op test mutation hook; `getProject()` returned object is not mutable from outside (attempting to mutate throws or is ignored).
- **Definition of done:** State is read-only outside the store; events work; selectors return correct sets against D.5.

### T1.5 · CSV export wiring (engine side)
- **Depends on:** T0.6, T1.4
- **Spec:** §11.1, §11.2
- **Objective:** A pure helper that, given a dataset's items + `adapter.columns`, builds the row matrix for `toCsv`. (The button is wired in Phase 3.)
- **Self-tests to add:** rows match column order; values escaped by csv util.
- **Definition of done:** Produces deterministic CSV rows for a dataset.

---

## Phase 2 — Adapter framework & Android adapters

> Exit gate: parser unit tests pass on valid + malformed fixtures producing correct items/warnings/errors; tactical flatten/rebuild round-trips.

### T2.1 · `App.registry`
- **Depends on:** T1.4
- **Spec:** §5.3, §5.4, A-4
- **Objective:** `registerPlatform(profile)`, `listPlatforms()`, `getActivePlatform()`, `setActivePlatform(id)`, `getDataset(platformId, dsId)`. On register, **validate the profile shape** (id/label/datasets present; each dataset has the required `DatasetAdapter` members) and reject malformed adapters with an `Issue`. `setActivePlatform` updates engine + (later) notifies UI.
- **Self-tests to add:** register a stub profile; `getDataset` resolves; registering a profile missing `parse` is rejected.
- **Definition of done:** Registration + lookup + active-platform switching work; no dataset-id literals leak into generic code.

### T2.2 · Shell-safe escaping helpers (Android)
- **Depends on:** T2.1
- **Spec:** Appendix B "Shell-safe value emission", §13.4, A-6
- **Objective:** In the Android adapter file, define `psSingleQuote(s)` and `shSingleQuote(s)` exactly per Appendix B, with JSDoc. These are the **only** sanctioned way to emit a data-derived value into generated PowerShell/ADB.
- **Build:** `psSingleQuote(s) = "'" + s.replace(/'/g,"''") + "'"`; `shSingleQuote(s) = "'" + s.replace(/'/g,"'\\''") + "'"`.
- **Self-tests to add:** the adversarial value `` a'b"c$(whoami)` d;e `` ⇒ both helpers produce inert literals; conceptually unwrapping one layer at a time yields exactly the original string; values with only `'`, only `"`, only `$`, spaces, `;`, backticks all round-trip.
- **Definition of done:** Injection-safety contract proven by self-tests (this is the highest-risk area — be exhaustive).

### T2.3 · `android.packages` adapter (parse + decision + columns + completeness)
- **Depends on:** T2.1
- **Spec:** §9 (packages), §6.4, Appendix B (packages), §6.5
- **Objective:** Implement the contract **except generators** (stubbed). `parse(raw) → ParseResult`: one package per line; strip leading `package:` and trailing `=path`/installer; ignore blank lines + `#` comments; dedupe (warn on dups); sort; **error** if empty or no plausible token. **Charset: package tokens restricted to `[A-Za-z0-9._]`; reject others at parse** (injection-safety). `decisionSchema = [{name:'action',kind:'enum',options:['keep','disable','remove'],required:true}]`. `columns`: key, description, decision(action), appliesTo, ism, status. `isComplete`: `action ∈ options`. `validateDecision`: returns issues when action invalid.
- **Self-tests to add:** D.1 valid (with `package:` prefix + a duplicate) → deduped/sorted items + dup warning; malformed (empty; line with a space) → errors; a token with an illegal char rejected.
- **Definition of done:** Parser matches §9; charset enforced; completeness correct.

### T2.4 · `android.settings` adapter — **WITHDRAWN in v2.0**

- **Status:** built in v1.0, **removed** in v2.0 (spec §21). The Settings dataset is retired; Android
  has two datasets, T2.3 (packages) and T2.5 (tactical).
- **Why it is kept here:** the id is referenced by the v1.x progress log and commit history. See
  **T12.1** for the removal task and **T12.2** for the backwards-compatibility path that lets projects
  built under this task still open.

### T2.5 · `android.tactical` adapter (flatten/rebuild + decision + columns + completeness)
- **Depends on:** T2.1, T1.1
- **Spec:** §8.2, §9 (tactical), §6.4, Appendix B (tactical)
- **Objective:** `parse(raw) → ParseResult` with `template`: `JSON.parse` (error on invalid JSON; warn on empty object); **flatten** to one item per leaf (leaf = scalar or whole array); dotted paths with bracketed numeric indices (`radios[0].mode`); record JS type for the decision default; retain full doc as `ParseResult.template`. `decisionSchema = [{name:'value',kind:'value-typed',required:true}]`. `isComplete`: value present and type-consistent. **`rebuildArtifact(template, items) → GeneratedFile`**: deep-clone template, set each decided item's value at its path, serialize via `stableStringify` → `tactical.json`; **MUST preserve untouched keys/types/nesting/arrays**; **preserve booleans/numbers as JSON types, not strings** (type fidelity).
- **Self-tests to add:** D.3 valid (nested + array + boolean) flattens to expected paths/types; **round-trip**: `rebuild(template, itemsFromFlatten)` deep-equals the original template when no decisions change a value; changing one leaf updates only that path; invalid JSON → error.
- **Definition of done:** Flatten/rebuild round-trips; type fidelity holds; paths match §8.2.

### T2.6 · `android-adb` platform profile (assembly; generators stubbed)
- **Depends on:** T2.2, T2.3, T2.4, T2.5
- **Spec:** §5.2, Appendix B (profile)
- **Objective:** Assemble `PlatformProfile{id:'android-adb', label:'Android (ADB)', outputLanguage:'powershell', datasets:[packages,tactical], captureInstructions, scriptPreamble, scriptPostamble}`. `scriptPreamble(ctx)`: PowerShell banner (tool/version/project/device/firmware/UTC), `Set-StrictMode`, ADB-presence check, single target-device guard, transcript start. `scriptPostamble(ctx)`: stop transcript. Register it in `bootstrap` (T-bootstrap is updated incrementally). Adapter generators remain stubs returning `[]`/`''` until Phase 7.
- **Self-tests to add:** profile registers; `getActivePlatform().datasets` lists exactly its datasets, in order; preamble/postamble are deterministic strings given a fixed `ctx`.
- **Definition of done:** Active profile resolves; UI can iterate datasets (used in Phase 3).

### T2.7 · `App.diff.triage`
- **Depends on:** T1.4
- **Spec:** §8.1
- **Objective:** `triage(parsedKeys:Set, registerKeys:Set) → {newKeys, existingKeys}`. `newKeys = parsed − register`; `existingKeys = parsed ∩ register`; `register − parsed` ignored. Pure; operates per dataset.
- **Self-tests to add:** overlapping/disjoint sets produce correct partitions; order-independent.
- **Definition of done:** Matches §8.1 exactly.

---

## Phase 3 — Read-only tables (data-driven)

> Exit gate: tables render the sample; search/sort/filter correct; 1.5k-row fixture renders responsively (DOD-2 partial).

### T3.1 · UI shell + global chrome + tab router
- **Depends on:** T2.6, T0.5
- **Spec:** §11.1, §11.2 (structure), §4.1 (UI layer)
- **Objective:** `App.ui.app.mount(root)`: top bar (project name, dirty indicator, Load/Save/Export CSVs buttons [wired later], platform selector from `registry.listPlatforms()`, Self-tests dev link), tab strip built by **iterating `getActivePlatform().datasets`** (one tab per dataset) plus Devices/Onboard/Generate tabs and an Activity/Errors drawer. No dataset-id literals (A-4). Re-render on `store.onChange` and on `setActivePlatform`.
- **Self-tests to add:** mounting against a detached root builds the expected tab count from a stub profile (DOM test guarded).
- **Definition of done:** Tabs/controls derive entirely from the active profile; switching platform rebuilds tabs.

### T3.2 · Data-table rendering (columns from adapter + computed cells)
- **Depends on:** T3.1
- **Spec:** §11.2, §6.5, A-6
- **Objective:** For the active dataset tab, render a table whose columns come from `adapter.columns` plus computed **Applies to** (device names whose snapshot keys include the item key — across latest versions) and **Status** (from `adapter.isComplete`). All cells through `esc`. Undecided rows visually flagged (left border + badge). Render via `DocumentFragment`.
- **Self-tests to add:** given D.5, the packages tab shows correct Applies-to and Status per item; a value with `<`/`&` renders escaped.
- **Definition of done:** Columns/flags data-driven; no XSS; renders D.5.

### T3.3 · Search, sort, incomplete-filter, performance
- **Depends on:** T3.2
- **Spec:** §11.2 (performance)
- **Objective:** Free-text search across key+description (debounce ~150 ms); column sort; "Incomplete only" toggle. **Windowed render** when a dataset exceeds a configurable threshold (default 1500 rows). All deterministic and `esc`-safe.
- **Self-tests to add:** filter logic (pure predicate) unit-tested: search term matches key/description; incomplete filter uses `isComplete`; sort comparator stable.
- **Definition of done:** Search/sort/filter correct; a 1.5k-row fixture renders responsively (manual note in README).

### T3.4 · Load / Save / Export-CSV buttons wired
- **Depends on:** T3.1, T1.2, T1.3, T1.5, T0.5
- **Spec:** §11.1, DOD-2
- **Objective:** Load button → `<input type=file>` → text → `projectIo.parseProject` → `store.init` (surface issues to drawer on failure). Save → `serializeProject` → `download`. Export CSVs → one CSV per dataset (or a zip) via `util.csv` + `download`. Dirty indicator reflects unsaved changes.
- **Self-tests to add:** load→save→load identity through the store (engine-level, reuse T1.3).
- **Definition of done:** Round-trip works end-to-end in the UI; DOD-2 met.

---

## Phase 4 — Onboarding & triage

> Exit gate: onboarding device #2 inherits common keys and flags only new ones; invalid inputs reported; re-onboard versioning works (DOD-3, DOD-4).

### T4.1 · `App.validation` (cross-cutting structural checks)
- **Depends on:** T2.6
- **Spec:** §7 (validation row), §12.2
- **Objective:** `validateProject(p) → Issue[]` (structural invariants beyond projectIo, e.g. items reference valid dataset ids; version-chain integrity cross-check) and `validateOnboarding({name, model, parsed, snapshots, project}) → Issue[]` (blank name; per-dataset `errors` present blocks onboarding; etc.).
- **Self-tests to add:** blank name → error; a parsed input carrying errors → blocks; clean inputs → `[]`.
- **Definition of done:** Returns precise located issues; never throws.

### T4.2 · `store.onboardDevice` / `reonboardDevice` (snapshots, hashing, versioning, triage append)
- **Depends on:** T4.1, T2.7, T0.7, §8.7 logic
- **Spec:** §6.2, §6.3, §8.1, §8.7, §7.1, §12.2, DOD-4
- **Objective:** One transactional code path, keyed on identity (`baseId = slug(name, model)`):
  - **New device:** create `v1` (`id=baseId`, `version:1`, `supersedesId:null`); embed immutable `Snapshot`s (hash **raw uploaded bytes** with `sha256Hex`, sorted `keys`, optional `values`/`template`); for each dataset, `triage` new vs register and append `newKeys` as `RegisterItem{decision:null, status:'undecided'}` with adapter default fields; inherit existing silently.
  - **Re-onboard, identical hashes (all datasets):** **no-op**, emit state-info "nothing to do"; do not mutate.
  - **Re-onboard, differing hashes:** create a **new version** (`version+1`, `id=baseId-v{n}`, `supersedesId=existing.id`); embed new snapshots; triage+append; retain prior read-only.
  - Each mutation validates first, returns `{ok, issues}`, bumps `meta.modifiedUtc` from `clock`, emits `onChange`. Never mutate project in place from outside.
- **Self-tests to add:** D.5 scenario — onboard Tab Active 5 then S23: S23 inherits shared keys, appends only S23-only keys as undecided, ends with a triage summary; re-onboard Tab Active 5 with identical files → no-op; with one changed file → `tab-active-5-v2` supersedes `tab-active-5`, register decisions untouched; snapshot `sha256` equals hash of raw bytes.
- **Definition of done:** DOD-4 satisfied; versioning per §8.7; register grows monotonically.

### T4.3 · Captured-default drift detection
- **Depends on:** T4.2
- **Spec:** §8.4
- **Objective:** On onboarding, for a key already in the register **in any dataset whose snapshot records per-key `values`**, compare the new capture value against prior devices' recorded capture values; if they differ emit an **info** issue (`"secure/foo default differs: 0 on Tab Active 5, 1 on S23"`). Never changes a decision (unified-decision assumption, §8.4).
- **Self-tests to add:** D.5's cross-device drift pair emits exactly one info issue with both values; identical values emit none.
- **Definition of done:** Drift surfaced as info only.

### T4.4 · Onboard tab UI
- **Depends on:** T4.2, T4.3, T0.5, T3.1
- **Spec:** §11.4, §12.2, DOD-3
- **Objective:** Three labelled file slots (per dataset) each showing parse status (✓ N items / ✗ error on the slot); `captureInstructions` help; name/model/firmware fields. **Onboard disabled until all three parse without errors and name is non-empty.** A name+model matching an existing device shows the re-onboard notice ("creates a new version / no-op if unchanged"). On commit: run onboarding, show triage summary (new/existing per dataset, warnings, drift, version created or no-op), switch to the first dataset filtered to "Incomplete only". Everything logged to the Activity drawer; nothing fails silently.
- **Self-tests to add:** gating predicate (all-three-parse ∧ name) unit-tested; triage-summary builder pure-tested.
- **Definition of done:** DOD-3 met; re-onboard UX present; drawer logs outcomes.

---

## Phase 5 — Decision editing & gating

> Exit gate: deciding all applicable items flips a device to ready; generate buttons enable/disable with correct reasons (DOD-5, DOD-6 gating).

### T5.1 · `App.completeness`
- **Depends on:** T2.6
- **Spec:** §6.5, §7 (completeness row), DOD-6
- **Objective:** `itemComplete(adapter, item) → boolean` (delegates to `adapter.isComplete`, plus the `REQUIRE_ISM_REF` flag — default `false` — folding "≥1 ISM ref" into completeness when true); `deviceReady(project, deviceId) → boolean` (every item **applicable** to that device — key ∈ union of that device's snapshot `keys` per dataset — is complete). Operates on the **latest** version of a device.
- **Self-tests to add:** a device with one undecided applicable item → not ready; deciding it → ready; `REQUIRE_ISM_REF=true` makes a decided-but-no-ISM item incomplete.
- **Definition of done:** Readiness matches §6.5; flag works without code surgery.

### T5.2 · `store.setDecision` + `store.setItemFields`
- **Depends on:** T5.1, T4.2
- **Spec:** §7.1, §6.4, §12.2
- **Objective:** `setDecision(datasetId, key, decisionPatch)` and `setItemFields(datasetId, key, {description?, ismRefs?, rationale?, rollback?})` — each validates via `adapter.validateDecision`/validation, returns `{ok, issues}`, bumps `modifiedUtc`, emits change. Recompute `status` from `isComplete` on every change (never trust stored flag). Decisions are **unified** across all devices sharing the key (§8.4).
- **Self-tests to add:** valid decision commits + status flips to decided; type-mismatched decision rejected with an issue; ISM-ref format validation.
- **Definition of done:** Mutations are transactional, validated, deterministic.

### T5.3 · Inline decision editors (schema-driven)
- **Depends on:** T5.2, T3.2
- **Spec:** §11.2, A-4
- **Objective:** Render decision controls **from `decisionSchema`**: `enum → <select>`; value-typed → value input + type select; bool → toggle. Plus editors for description, ISM refs (tag input), rationale, rollback. Commit on change to the store; show validation issues inline. No hardcoded per-dataset controls.
- **Self-tests to add:** control-builder pure function maps each `DecisionField.kind` to the right control descriptor.
- **Definition of done:** Editors generated from schema; edits persist; DOD-5 met.

### T5.4 · Generate-gating wiring
- **Depends on:** T5.1, T3.1
- **Spec:** §11.5, §12.2 (completeness row), DOD-6
- **Objective:** In the Generate tab, each command button (Implementation/Verification/Reporting/Control report) independently enabled **iff `deviceReady`**; disabled buttons show the reason ("3 settings undecided"). Buttons are stubbed (no output yet).
- **Self-tests to add:** reason-string builder counts undecided applicable items per dataset.
- **Definition of done:** Buttons gate correctly with accurate reasons.

---

## Phase 6 — Device view

> Exit gate: panels show exactly the applicable decided items per dataset (DOD-9).

### T6.1 · Device-configuration view + Devices tab
- **Depends on:** T5.1, T3.1
- **Spec:** §11.3, §6.5, §8.7, DOD-9
- **Objective:** Devices tab lists configs (name, model, firmware, **version**, applicable counts, ready/undecided count); superseded versions grouped under `baseId` and flagged "superseded" (read-only); latest is active. Selecting a device opens three **read-only** panels (one per dataset) listing that device's **applicable decided** items (key, decision, ISM refs) via `store.applicableItems`. Read-only in v1.
- **Self-tests to add:** `applicableItems` returns exactly the decided applicable set for a D.5 device; superseded vs latest correctly identified.
- **Definition of done:** DOD-9 met; superseded history visible but inert.

---

## Phase 7 — Generators

> Exit gate: each command emits a valid zip; outputs deterministic under fixed clock; report opens in Word as a formatted document (DOD-6, DOD-7, DOD-8).

### T7.1 · `App.report.wrapReport` (Word-targeted HTML shell)
- **Depends on:** T2.6
- **Spec:** §10.3, DOD-8, A-6
- **Objective:** `wrapReport(title, meta, sectionsHtml[]) → string`: complete self-contained HTML with inline `<style>` Word honours — title block, metadata table (project, device, firmware, date, hashes), the section fragments, then an ISM-coverage section. Real `<table>` borders, heading styles, page breaks (`div{page-break-before:always}` / `<br style="page-break-before:always">`). **All dynamic text through `esc`.**
- **Self-tests to add:** output is well-formed, contains the page-break CSS, and escapes a `<script>`-laden value in meta.
- **Definition of done:** Self-contained styled HTML; opens in Word (manual note in README).

### T7.2 · Adapter `generateImplementation` (both Android adapters)
- **Depends on:** T2.2, T2.3, T2.5
- **Spec:** §10.1, Appendix B, A-6
- **Objective:** Implement the generators returning `GeneratedFile[]` (pure):
  - **packages:** `disable` → `pm disable-user --user 0 <pkg>`; `remove` → `pm uninstall --user 0 <pkg>`; `keep` → comment-only no-op. Idempotent, each guarded by a presence check. Tokens are charset-safe (parse-enforced) and emitted via `psSingleQuote`.
  - **tactical:** call `rebuildArtifact` → **`tactical.json` only**. The apply model is a manual Knox upload (spec Appendix B), so there is **no** push script and no `TODO(tactical-apply)` scaffold. The rebuilt document must match the captured input in structure, ordering and JSON types.
- **Self-tests to add:** an adversarial package token generates a single inert PS-quoted literal; `keep` emits no action; tactical emits a deterministic `tactical.json` that deep-equals the capture when nothing was changed, and carries the completed `imsSettings` block (§18.9 RV17-4).
- **Definition of done:** Scripts injection-safe, idempotent, deterministic; no shell step for tactical.

### T7.3 · `App.generate.buildImplementation` (orchestrator + manifest + zip + download)
- **Depends on:** T7.2, T0.9, T0.7, T1.1, T5.1
- **Spec:** §4.2(6), §10.1, §10.4, DOD-7
- **Objective:** `buildImplementation(project, deviceId) → {blob, name, issues}`: gather the device's applicable+complete items per dataset (latest version), call each `adapter.generateImplementation(ctx)`, wrap each script with `scriptPreamble/Postamble`, build `manifest.json` (tool version, project hash, device, firmware, generation UTC from clock, outputs with per-file `sha256`, decision snapshot used), `zip(...)` → one blob, name `<device>-<command>-<UTCstamp>.zip`. UI does the `download`. Aborts a generation with a located issue on failure (§12.2 generation row).
- **Self-tests to add:** under a fixed clock, two builds of the same project+device produce **byte-identical** zips except the manifest timestamp field (excluded from the determinism assert); manifest hashes match file contents.
- **Definition of done:** DOD-7 (determinism) holds; single zip; gated by readiness.

### T7.4 · Verification path (adapter `generateVerification` + `buildVerification`)
- **Depends on:** T7.3
- **Spec:** §10.2, Appendix B
- **Objective:** Adapter `generateVerification`: packages `pm list packages -d/-e` read-back → PASS/FAIL/MISSING; tactical read-back where exposed else **EVIDENCED**. Header documents exit/report semantics. `generate.buildVerification` mirrors T7.3 (independent command).
- **Self-tests to add:** verification scripts deterministic and wrapped with the platform preamble.
- **Definition of done:** Independent command; deterministic; DOD-6.

### T7.5 · Reporting path (adapter `renderReportSection` + `buildReport` + ISM coverage)
- **Depends on:** T7.3, T7.1
- **Spec:** §10.3, §10.4, DOD-8
- **Objective:** Each adapter `renderReportSection(items, ctx, opts) → HTML fragment` (packages: pkg/description/action/control/rationale; tactical: path/description/value/control/rationale). `generate.buildReport` assembles `wrapReport(...)` + the Control-coverage section (items grouped by control, sub-grouped by dataset), wraps into a single `.html` file + manifest, zips, one download.
- **Self-tests to add:** report contains one section per dataset + ISM grouping; deterministic; all values escaped.
- **Definition of done:** DOD-8; independent command; deterministic.

---

## Phase 8 — Hardening & polish

> Exit gate: all DOD items (§1.1) verified; full self-test suite incl. portability test passes.

### T8.1 · Complete error surface / Activity drawer
- **Depends on:** Phase 7
- **Spec:** §11.6, §12, DOD-10
- **Objective:** Append-only timestamped Activity/Errors drawer; parse/validation/generation results logged; errors/warnings styled distinctly; clearable. UI-boundary `try/catch` converts unexpected exceptions to a logged "unexpected error" + message (never a blank failure). Every blocking error states **what/where/fix**; clean runs emit positive confirmations.
- **Definition of done:** DOD-10 met; nothing fails silently.

### T8.2 · Accessibility pass
- **Depends on:** Phase 6
- **Spec:** §11.7
- **Objective:** Semantic landmarks, labelled controls, visible focus, keyboard-operable tabs/tables, colour never the sole signal (pair with text/badges), sufficient contrast.
- **Definition of done:** Keyboard-navigable; non-colour status cues present.

### T8.3 · `beforeunload` dirty guard
- **Depends on:** T3.4
- **Spec:** §6.6, §11.1
- **Objective:** Warn on unload when there are unsaved changes; clear the guard after a successful Save. Must not fire during `#selftest`.
- **Definition of done:** Dirty state guarded; no false positives on clean state.

### T8.4 · Optional `localStorage` draft autosave
- **Depends on:** T3.4
- **Spec:** §6.6, C-4, §3
- **Objective:** Debounced draft autosave as crash insurance only; on load, if a draft newer than the opened file exists, offer to restore; clearly label when used; **degrade silently** if `localStorage` unavailable. Never the source of truth.
- **Definition of done:** Honours C-4; non-canonical; labelled.

### T8.5 · In-app help
- **Depends on:** Phase 6
- **Spec:** §11.4, §16 Phase 8
- **Objective:** Capture instructions (from `captureInstructions`) and a "how state/saving works" explainer surfaced in-app.
- **Definition of done:** Help reachable; explains save model.

### T8.6 · `store.pruneOrphanedItems` + maintenance UI
- **Depends on:** T4.2
- **Spec:** §8.5, §7.1
- **Objective:** The **only** item-deletion path: remove items whose key is in no snapshot of any remaining DeviceConfig (all versions) for that dataset. Explicit, confirmed (shows count + key list), logged to the drawer; no silent archive in v1. Never automatic.
- **Self-tests to add:** after removing the only device referencing a key, the item persists until prune; prune removes exactly the orphans and logs them.
- **Definition of done:** Append-only invariant + single guarded deletion path proven.

### T8.7 · Portability self-test + full fixtures + complete suite
- **Depends on:** all prior
- **Spec:** §5.4, §15, Appendix D, DOD-11
- **Objective:** Inline all fixtures D.1–D.6 incl. the **mock platform** (D.4: one text dataset `mock.kv`) and the **legacy project** carrying a retired dataset (D.6, §21.3). The **portability test** registers the mock platform and asserts tables/onboarding/decision-editing/generation work with **zero core edits** (DOD-11). Add determinism tests (serialize×2, zip×2 under fixed clock), round-trip tests, and all §15 edge cases (empty files, duplicate keys, unknown namespace, invalid JSON, nested-array tactical, the adversarial settings value through two-layer escaping, package-named-like-a-setting, cross-device drift, generate-before-complete blocked, re-onboard identical→no-op / differing→new version).
- **Definition of done:** DOD-11 + DOD-12 met; full suite green at `#selftest`.

### T8.8 · Final DOD checklist pass
- **Depends on:** T8.7
- **Spec:** §1.1 (DOD-1…DOD-12)
- **Objective:** Walk every DOD item against the fixtures; fix gaps; record the manual checks (Word open, multi-browser `file://` load) in a README comment.
- **Definition of done:** All twelve DOD criteria verified; no console errors, no network in any browser tested.

---

## B. Dependency quick-map (build order at a glance)

```
T0.1 ─┬─ T0.2 types
      ├─ T0.3 clock ─ T0.10 test harness ─┐
      ├─ T0.4 html ──────────────────────┤
      ├─ T0.5 dom                         │
      ├─ T0.6 csv                         │
      ├─ T0.7 hash ──────────────┐        │
      ├─ T0.8 crc32 ─ T0.9 zip ──┤        │
      └───────────────────────────┴────────┘
T1.1 stableStringify ─ T1.2 projectIo.parse ─ T1.3 serialize ─ T1.4 store ─ T1.5 csv-rows
T2.1 registry ─┬─ T2.2 escaping
               ├─ T2.3 packages ─┐
                                 ├─ T2.6 android-adb profile
               ├─ T2.5 tactical ─┘
               └─ T2.7 diff.triage
T3.1 ui shell ─ T3.2 tables ─ T3.3 search/sort ─ T3.4 load/save/csv
T4.1 validation ─ T4.2 onboard/reonboard ─ T4.3 drift ─ T4.4 onboard UI
T5.1 completeness ─ T5.2 setDecision/setItemFields ─ T5.3 editors ─ T5.4 gating
T6.1 device view
T7.1 report shell ─ T7.2 adapter impl ─ T7.3 buildImplementation ─ T7.4 verification ─ T7.5 reporting
T8.1 errors ─ T8.2 a11y ─ T8.3 beforeunload ─ T8.4 draft ─ T8.5 help ─ T8.6 prune ─ T8.7 portability+fixtures ─ T8.8 DOD
```

Each task is self-contained: read its block + the cited spec sections + the modules it depends on,
then build and self-test it in one pass.

---

## Phase 9 — v1.1 enhancements (dark mode · set-from-files · Control Manager)

> Companion spec: **§18** (added v1.1). These tasks build on the completed v1.0 (Phases 0–8) in the
> single file **`ch-config-tool.html`**. All global rules **A-1…A-9** still bind. Three independent
> tracks: **9.1** (dark mode, standalone), **9.2–9.4** (bulk assignment), **9.5–9.9** (Control
> Manager + schemaVersion 2). Build a track end-to-end before the next; 9.5 must land before 9.6–9.9.
>
> Exit gate: dark mode toggles the whole UI without touching any generated artifact; bulk-assignment
> validates exact key-set equality and refuses with deltas otherwise; Control Manager CRUD works,
> control refs are multi-select over the catalogue, the v1→v2 migration is lossless, and the full
> self-test suite (incl. the DOD-11 portability test) stays green.

### Track A — Dark mode

#### T9.1 · Dark-mode theme + toggle
- **Depends on:** Phase 8 (UI shell)
- **Spec:** §18.1 (DM-1…DM-4), §11.1, §11.7, C-4, C-6
- **Objective:** A top-bar toggle that switches the whole UI between light/dark via CSS variables only.
- **Build:**
  - Add a `[data-theme="dark"]` block in the inline `<style>` that overrides **only** the `:root`
    palette custom properties (`--c-bg`, `--c-surface`, `--c-border`, `--c-text`, `--c-accent`, badge
    colours, etc.) with a high-contrast dark palette. No component rules change (DM-1).
  - Toggle button in the top bar (e.g. `data-action="toggle-theme"`, `aria-pressed`). Clicking flips
    `document.documentElement.setAttribute('data-theme', …)` between `light`/`dark` and updates the
    label/icon.
  - First load: if no stored preference, read `window.matchMedia('(prefers-color-scheme: dark)')`
    (guarded). Persist explicit choice under a `localStorage` key (e.g. `ch-config-theme`), all access
    `try/catch`-guarded; degrade silently (C-4, DM-2). Reuse the existing draft-storage guard pattern.
  - **Do not** read the theme anywhere in `App.generate`/`App.report` or serialization (DM-3); it is a
    DOM concern only. Put a tiny pure helper `nextTheme(cur) → 'light'|'dark'` so it is unit-testable.
- **Self-tests to add:** `nextTheme('light')==='dark'`, `nextTheme('dark')==='light'`; assert a report
  built under each theme is byte-identical (theme cannot leak into output — reuse the determinism harness).
- **Definition of done:** Whole UI restyles via the data-theme attribute; preference persists and
  degrades silently; generated artifacts and self-tests are unaffected; toggle is keyboard-operable
  with `aria-pressed`.

### Track B — Set decisions from existing files (bulk assignment)

#### T9.2 · Adapter `parseAssignment` + `assignmentHint` (per-dataset assignment parsers)
- **Depends on:** T2.3, T2.4, T2.5 (the three Android adapters)
- **Spec:** §18.2 (ASG-4, ASG-6), §5.1, §9, Appendix B, A-4, A-6
- **Objective:** Teach each Android adapter to parse its bulk-assignment file into per-key decisions,
  keeping all format knowledge in the adapter (no core branching).
- **Build:** On each adapter add:
  - `assignmentHint: string` — one-line format description shown in the UI.
  - `parseAssignment(raw) → {assignments:[{key, decision, fields?}], warnings, errors}`:
    - **packages:** parse a **CSV** with an exact header `package,action,description` (RFC-4180:
      handle quoted fields/embedded commas/escaped quotes). Tolerate an optional leading `package:` on
      column 1; enforce the package charset (Appendix B). `action ∈ {keep,disable,remove}`. Emit
      `{key: pkg, decision:{action}, fields:{description: col3}}`. Errors: wrong/missing header,
      malformed CSV, invalid action, illegal package token, duplicate package.
      Surface the parser's own errors/warnings.
    - **tactical:** reuse `tactical.parse(raw)`; map each flattened leaf → `{key, decision:{value, type}}`
      preserving JSON types (§8.2). Surface invalid-JSON / non-object-root errors.
  - Keep `parse` (onboarding) untouched. `parseAssignment` is additive.
- **Self-tests to add:** packages CSV — valid (with/without `package:`, a quoted description containing
  a comma) → correct assignments; bad header / invalid action / dup / illegal token → located errors.
  the tactical assignment parse maps leaves to `{value}` correctly; invalid inputs error.
- **Definition of done:** Each adapter parses its assignment file to per-key decisions; format errors
  are located; no dataset-id logic leaks into core.

#### T9.3 · `store.applyDeviceAssignment` + exact-set validator (engine)
- **Depends on:** T9.2, T5.2 (`setDecision`/`setItemFields`), T6.1 (`applicableItems`)
- **Spec:** §18.2 (ASG-2, ASG-3, ASG-5, ASG-7), §6.5, §8.4, §7.1, §12, A-3
- **Objective:** A pure, transactional engine path that validates exact key-set equality, then applies
  an assignment to a device's applicable keys in one commit.
- **Build:** `App.store.applyDeviceAssignment(deviceId, datasetId, parsed) → {ok, issues}` where
  `parsed` is a `parseAssignment` result:
  1. Resolve the device (MUST be a **latest** config) and dataset; error if unknown.
  2. If `parsed.errors.length` → refuse (return them; no mutation) (ASG-3).
  3. Compute `applicable = applicableItems(deviceId, datasetId)` keys. Compute
     `missing = applicable − assignmentKeys`, `extra = assignmentKeys − applicable`. If either is
     non-empty → **refuse** with located issues enumerating each delta (ASG-2). No partial apply.
  4. Validate every assignment decision via `adapter.validateDecision`; any error → refuse (ASG-3).
  5. **One transaction** (single `commit`): for each assignment set `item.decision` and merge
     `fields` (e.g. `description`); recompute status; bump `modifiedUtc`; emit once.
  6. Return `{ok:true, issues:[success summary]}`.
  - Document the **unified-decision consequence** (ASG-7) at the call site: this updates shared
    decisions for the device's applicable keys.
- **Self-tests to add:** exact-match set → applies all decisions + descriptions, device flips ready;
  file missing a key → refused with a `missing` delta and **no mutation**; file with an extra key →
  refused with an `extra` delta; an invalid action in the parsed set → refused; success is a single
  `onChange` emission (transactional).
- **Definition of done:** Validation precedes mutation; deltas are precise; apply is atomic and
  deterministic; honours §8.4.

#### T9.4 · Devices-view "Set from files" UI (three controls)
- **Depends on:** T9.3, T6.1 (device view)
- **Spec:** §18.2 (ASG-1, ASG-8), §11.3, §12, DOD-10
- **Objective:** From the device-configuration view, expose three independent file controls (one per
  dataset) that run the assignment workflow, with inline format help and delta/error surfacing.
- **Build:** In the device detail view add a clearly-labelled "Set decisions from files" section with
  one file input per dataset, each showing the adapter's `assignmentHint` (the **packages CSV format
  MUST be explained** here, ASG-8). On file select: read text → `adapter.parseAssignment` →
  `store.applyDeviceAssignment`. On refusal, render the deltas/errors inline and log them to the
  Activity drawer; on success log the summary and re-render the (read-only) panels. The panels stay
  read-only (ASG-8). Show a short note about the unified-decision consequence (ASG-7).
- **Self-tests to add:** the delta/summary text builders are pure-tested; a render test that the
  section shows three inputs and the packages format help.
- **Definition of done:** All three workflows run from the Devices menu; refusals show located
  deltas/errors; nothing fails silently; success updates decisions and readiness.

### Track C — Control Manager & control references (schemaVersion 2)

#### T9.5 · Data model v2 — `controls` entity, `controlRefs`, schema + `migrate(v1→v2)`
- **Depends on:** T1.2 (projectIo), T0.2 (types)
- **Spec:** §18.3 (CTL-1, CTL-2, CTL-3), §17.A, §6.1, §6.4
- **Objective:** Introduce the `Control` entity and `controlRefs`, bump `schemaVersion` to 2, and add a
  lossless forward migration.
- **Build:**
  - `types`: add `@typedef Control {id,title,type,description,assignedDeviceIds}`; change `RegisterItem.ismRefs` → `controlRefs:string[]`.
  - `projectIo`: `SCHEMA_VERSION = 2`. Validate top-level `controls` (array of well-formed Control;
    unique ids; `type` a non-empty string; `assignedDeviceIds` reference existing device baseIds —
    warn on dangling). Validate `controlRefs` reference existing control ids — **dangling = error**
    (or auto-prune on load with a logged warning; pick auto-prune + warning for resilience).
  - `migrate(project)`: `case 1:` build `controls` by find-or-creating one per distinct legacy
    `ismRefs` string (match by title; infer `type` ISM/AHG/Custom by prefix; empty desc/assignments),
    rewrite each item's refs to `controlRefs` of those ids, set `schemaVersion=2`. `case 2:` identity.
    Unknown → located issue.
- **Self-tests to add:** a v1 fixture with `ismRefs:['ISM-1','AHG-2','foo']` migrates to 3 controls
  (types ISM/AHG/Custom) and `controlRefs` of their ids; round-trip identity at v2; dangling
  `controlRefs` flagged/pruned; unknown schemaVersion rejected.
- **Definition of done:** v1 projects load via lossless migration; v2 schema validated incl. ref
  integrity; round-trip stable (DOD-2/DOD-7 preserved).

#### T9.6 · `store` control CRUD + ref integrity
- **Depends on:** T9.5, T5.2
- **Spec:** §18.3 (CTL-6), §7.1
- **Objective:** Transactional CRUD for controls and `controlRefs` plumbing.
- **Build:** `addControl({title,type,description,assignedDeviceIds}) → {ok,issues,id}` (slug/unique id,
  from injected id generator/clock — no `Math.random` in engine, A-2); `updateControl(id, patch)`;
  `removeControl(id)` MUST strip `id` from every item's `controlRefs` and log how many were affected.
  `setItemFields` accepts `controlRefs` (replace the old `ismRefs` handling). All bump `modifiedUtc`
  and emit. `recomputeStatus` and `completeness` reference `controlRefs`.
- **Self-tests to add:** add→update→remove lifecycle; `removeControl` clears refs from items that used
  it; `setItemFields({controlRefs})` persists.
- **Definition of done:** CRUD transactional; no orphaned refs after remove; deterministic.

#### T9.7 · Control Manager tab UI
- **Depends on:** T9.6, T3.1 (shell/tab router)
- **Spec:** §18.3 (CTL-1, CTL-4), §11
- **Objective:** A new "Control Manager" tab to view/add/edit/remove controls.
- **Build:** Register an `App.ui.views.controls` view (render + wire, like the other views) and add a
  "Control Manager" tab. List controls (title, type, description, assigned-device count). Add/edit form
  with: title input, type `<select>` seeded `['ISM','AHG','Custom']`, description textarea, and a
  multi-select of device configurations (by name → baseId). Remove button with confirmation. All edits
  go through `store` CRUD; all text `esc`-ed (A-6).
- **Self-tests to add:** render shows existing controls + the seeded type options; pure helpers
  (e.g. device-name↔baseId mapping) unit-tested.
- **Definition of done:** Catalogue viewable and editable; assignments persist; data-driven, escaped.

#### T9.8 · Control-refs multi-select in the data tabs
- **Depends on:** T9.6, T5.3 (inline editors)
- **Spec:** §18.3 (CTL-5), §11.2, A-6
- **Objective:** Replace the free-text "ISM Refs" column/editor with a "Control Refs" multi-select over
  the control catalogue.
- **Build:** Rename the column header and the data field everywhere (`ismRefs`→`controlRefs`). In the
  row editor, replace the text input with a **multi-select search**: filter the control catalogue by
  title/type, select one or more; persist the chosen control **ids** via `setItemFields({controlRefs})`.
  The column cell renders the referenced controls' **titles** (resolved from the catalogue), comma-sep.
  No free-text entry. Keep it data-driven (the column is still produced generically; only the editor
  control changes).
- **Self-tests to add:** the column renders control titles for given ref ids; selecting/deselecting
  updates `controlRefs`; an unknown id resolves gracefully (shows nothing / logs).
- **Definition of done:** Control Refs are catalogue-backed multi-select; titles display in the table;
  edits persist; no open-ended text box remains.

#### T9.9 · Report "Control coverage" + flag rename + suite
- **Depends on:** T9.6, T7.5 (report), T8.7 (portability suite)
- **Spec:** §18.3 (CTL-7, CTL-8, CTL-9), §10.3, §6.5, §15, DOD-11
- **Objective:** Finish the control-ref rollout across reporting/completeness and re-prove portability.
- **Build:** Rename the report "ISM coverage" section to **"Control coverage"** grouped by control
  (`title` + `type`), sub-grouped by dataset; items with no `controlRefs` under "(no control)".
  Update the per-dataset report sections' "ISM" column to "Control" (showing titles). Rename the
  completeness flag `REQUIRE_ISM_REF` → `REQUIRE_CONTROL_REF` (same semantics). Re-run/extend the
  DOD-11 portability test to confirm the mock platform still works with the v2 model (its items use
  `controlRefs`).
- **Self-tests to add:** report contains "Control coverage" grouped by control title/type; flag rename
  folds ≥1 control ref into completeness; portability test green on v2.
- **Definition of done:** Reporting and completeness use controls; DOD-11/DOD-12 still pass; full suite
  green at `#selftest`.

### Phase 9 dependency map

```
T9.1 dark mode (standalone)

T9.2 parseAssignment ─ T9.3 applyDeviceAssignment ─ T9.4 set-from-files UI

T9.5 data model v2 (controls + controlRefs + migrate) ─┬─ T9.6 control CRUD ─┬─ T9.7 Control Manager tab
                                                        │                    ├─ T9.8 control-refs multi-select
                                                        └────────────────────┴─ T9.9 report/flag/suite
```

> Note (working filename): v1.0 task blocks say `index.html`; the delivered artifact is
> `ch-config-tool.html`. Phase 9 tasks land in that same single file per A-1/A-9 load order.

## Review-4 follow-ups (UI/UX + tactical keys)

Small post-Phase-9 changes from `Review Notes/review-4_notes`; spec §18.6. All land in the single
`ch-config-tool.html` file. Process per item: build → review → tests → run → revise.

#### T-RV4.1 · Strip the `policyList.` prefix from tactical policy names (display only)
- **Spec:** §18.6 RV4-1 (display refinement of RV3-3)
- **Objective:** Show tactical `policyList` policies by their name alone (no `policyList.` segment),
  WITHOUT changing the stored/routed key.
- **Build:** Keep `flattenTactical`/`rebuildTacticalDoc` exactly as RV3-3 (key = `…policyList.<name>`,
  rebuild routes by name off that prefix). Add a module helper `stripPolicyPrefix(key)`
  (`policyList.X`→`X`, nested `foo.policyList.X`→`foo.X`, idempotent otherwise) and expose it as
  `tactical.displayKey`. Apply it at every key-display site: the tactical "Path" column `get`, the
  device-view panels (the panel render already resolves the dataset adapter), the report's per-dataset
  section, and the report's Control-coverage list.
- **Rationale (over baking bare names into the key):** the prefix is the stable internal identity;
  stripping only for display avoids (a) collisions when a sibling scalar/object key shares a policy
  name, and (b) breaking already-saved (review-3) projects, with no migration required.
- **Self-tests to add:** flatten still keys by `policyList.<name>`; `stripPolicyPrefix`/`displayKey`
  strip the prefix (incl. nested) and leave non-policy keys untouched; the Path column renders the bare
  name; rebuild round-trips + targeted flip via the prefixed key; a sibling key sharing a policy name
  is NOT misrouted. Validated on the real capture (100 policies, byte-identical round-trip).
- **Definition of done:** policies DISPLAY without the prefix everywhere; stored keys unchanged;
  round-trip identity + DOD-7 determinism hold; review-3 saves still route.

#### T-RV4.2 · Incomplete-only filter defaults OFF
- **Spec:** §18.6 RV4-2
- **Objective:** Stop the data tables landing with "Incomplete only" pre-ticked (esp. post-onboard).
- **Build:** Default per-dataset UI state already carries `incompleteOnly:false`; remove the post-
  onboard `openDatasetIncomplete` call (which forced it on) in favour of `switchTab`, and drop the now-
  unused `openDatasetIncomplete` from the controller context.
- **Self-tests to add:** the toolbar renders the checkbox unticked for default UI state and ticked when
  `incompleteOnly:true`.
- **Definition of done:** fresh/onboarded tabs show the full list; the toggle still works per dataset.

#### T-RV4.3 · Control Manager tools beside the title
- **Spec:** §18.6 RV4-3
- **Objective:** Put "Add type" + "Import controls (CSV)" to the right of the "Control Manager" title.
- **Build:** Wrap the title and the `.ctl-tools` block in a `.ctl-header` flex row
  (`justify-content:space-between; flex-wrap:wrap`); render the tools before the add form/list.
- **Self-tests to add:** the title starts the header and the tools render inside it, before the add
  form and the control list.
- **Definition of done:** tools sit to the right of the title (wrapping under on narrow widths).

#### T-RV4.4 · Control Manager as a searchable table with per-row dropdown
- **Spec:** §18.6 RV4-4
- **Objective:** Replace the stacked control "cards" with a searchable table whose rows have a dropdown
  expander; move Remove into the dropdown; keep the description wide + wrapping.
- **Build (`App.ui.views.controls`):**
  - Module UI state `_cm = {search:'', expanded:{}}`. `renderTable(project)` builds a `table.data.ctl-table`
    with columns `[expander] · Title · Type · Applies to · Description`. Title is an inline `<input
    data-ctl-field="title">`, Type an inline `<select data-ctl-field="type">`, Applies-to shows the
    assigned device names, Description is a wrapping read-only `.ctl-desc-cell`. The per-row expander
    `[data-ctl-expand]` opens a `detail-row` with the editable `.ctl-desc` `<textarea>`, the
    `deviceCheckboxes` multi-select, and the **Remove** button (`[data-ctl-remove]`).
  - `render` keeps the header tools (RV4-3) + add form, then a search toolbar (`[data-ctl-search]`)
    OUTSIDE a `#ctl-table-host` wrapper, then `renderTable`. Wire `input[data-ctl-search]` (debounced)
    and `click[data-ctl-expand]` to re-render ONLY `#ctl-table-host` (box keeps focus). Existing
    `[data-ctl-field]`/`[data-ctl-device]`/`[data-ctl-remove]` handlers are unchanged.
- **Self-tests to add:** controls render as `table.data.ctl-table` with a `[data-ctl-search]` box and a
  wrapping `.ctl-desc-cell`; the Remove button and the editable description textarea appear only inside
  the expanded `detail-row` (never inline); search filters by title/type/description with a correct
  "N of M shown" count.
- **Definition of done:** Control Manager is a searchable table; Remove lives in the per-row dropdown;
  the description wraps; edits/removes still persist via `updateControl`/`removeControl`.

## Review-5 follow-ups (per-control device view + multi-select)

Post-review-4 changes from `Review Notes/review-5_notes`; spec §18.7. All land in the single
`ch-config-tool.html` file. Process per item: build → review → tests → run → revise.

#### T-RV5.1 · Collapsible device panels + per-control view (modal)
- **Spec:** §18.7 RV5-1, §11.3, DOD-9, CTL-1
- **Objective:** In the device-configuration view: make the three dataset panels collapsible, drop the
  Control Refs column from those panels, add a "Controls applying to this device" section, and a modal
  that shows exactly the actions satisfying a chosen control on that device.
- **Build (`App.ui.views.devices`):**
  - Track `_dev.collapsed = {}` (per-dataset) and `_dev.openControlId`. Reset both on device view/back.
  - `renderPanels`: each panel header is a `[data-panel-toggle="<dsId>"]` button (`aria-expanded`); a
    `.panel.collapsed` class hides note/table via CSS. The panel table is **Key/Decision only** (no
    Control Refs column). Panel toggle re-renders only `#dev-panels`.
  - `renderDeviceControls(project, deviceId)`: lists controls whose `assignedDeviceIds` includes the
    device's `baseId`; each is a `[data-control-open]` button with title/type and the item count from
    `countControlItems`.
  - `renderControlModal(project, deviceId, controlId)`: a `.modal-overlay`/`.modal` (role=dialog) with a
    `[data-control-modal-close]` × button; three `.panel` lists, one per dataset, of items applicable to
    the device AND referencing the control (key/decision/status). Backdrop click closes
    (`[data-control-modal]` where `e.target===el`).
  - `renderDetail` appends the controls section and (when `_dev.openControlId`) the modal.
- **Self-tests to add:** panels render with collapse toggles + default expanded + no Control Refs column;
  assigned controls list as openable with correct counts; empty-controls note; modal lists only
  device-applicable referencing items (excludes non-referencing) across three dataset panels with a close
  button.
- **Definition of done:** panels collapse; Control Refs column gone from the device view only; per-control
  modal shows exactly the applicable referencing items per dataset; panels stay read-only (DOD-9).

#### T-RV5.2 · Control Refs = removable, searchable checkbox multi-select
- **Spec:** §18.7 RV5-2, §11.2, CTL-5, A-6
- **Objective:** Replace the native `<select multiple>` control-refs editor (no remove, modifier-clicks
  to add) with a searchable **checkbox list** allowing add/remove of any number of controls.
- **Build (`App.ui.tables`):** `controlSelect` renders `.control-multiselect` = a `[data-control-search]`
  filter input + a `.ctl-opts` list of `[data-control-ref-toggle]` checkboxes (`data-control-id`,
  `checked` when referenced) + a selected count. New `change` handler on `[data-control-ref-toggle]`
  reads the item's `controlRefs`, toggles the one id, and persists via `setItemFields({controlRefs})`.
  An `input` handler on `[data-control-search]` filters the visible options in place (no store
  round-trip). Remove the obsolete `data-field-edit="controlRefs"` branch. The column still renders titles.
- **Self-tests to add:** the editor is no longer a `<select multiple>`; it renders a `data-control-multiselect`
  container, a search box, checkbox toggles, and the referenced control renders `checked`.
- **Definition of done:** multiple controls can be selected; any one can be removed; titles display in the
  column; no free-text box remains.

#### T-RV5.3 · Settings assignment CSV — **WITHDRAWN in v2.0**

- **Status:** built in v1.1, **removed** in v2.0 with its dataset (spec §21, §18.7 RV5-3).
- **What survived:** the generic capability this task introduced — a capture parser that may return
  `descriptions` alongside `keys`/`values`, carried onto register items by
  `store.onboardDevice({descriptions})` — is retained and available to any adapter. Its coverage moved
  into the review-10 suite, which now exercises the store path directly rather than through a
  Settings-shaped CSV.

## Phase 10 — Per-config decision overrides (v1.2, schemaVersion 3)

> Companion spec: **§19** (added v1.2). Builds on the completed v1.0/v1.1 (Phases 0–9 + review
> follow-ups) in the single `ch-config-tool.html` per A-1/A-9 load order. Core principle: *decide once,
> inherit everywhere* is preserved — the register default still drives every device; an override is an
> opt-in, value-only exception resolved through **one** choke point (`App.overrides`). No
> `DatasetAdapter` may be edited (DOD-11). Build order: T10.1 → T10.2 → (T10.3, T10.4) → (T10.5, T10.6,
> T10.7) → T10.8.

### T10.1 · Schema v3 — `groups`, `DeviceConfig.overrides`, migration, validation, serialize
- **Depends on:** Phase 9 (schemaVersion 2 baseline)
- **Spec:** §19.2, §19.7, §17.A, §8.6
- **Objective:** Raise the project schema to 3, add the `groups` top-level array and per-config
  `overrides`, and keep load/serialize canonical and self-healing.
- **Build (`App.projectIo`):**
  - `SCHEMA_VERSION = 3` (update the comment). `migrate`: add `case 2: return migrateV2toV3(project)`;
    `case 3: return project`. `migrateV2toV3(v2)` clones, sets `schemaVersion=3`, adds top-level
    `groups: []` if absent and `overrides: {}` on every `deviceConfig` if absent; identity otherwise.
  - `TOP_KEYS`: insert `'groups'` immediately after `'deviceConfigs'`.
  - Validation: `groups` must be an array; per `DeviceGroup` validate slug `id` (unique), string
    `name`, `deviceBaseIds` (array of **existing** baseIds, **no baseId in two groups**), and an
    `overrides` map (registered dataset ids; keys in the member devices' applicable **union**; values
    pass the adapter `validateDecision`). Validate each `DeviceConfig.overrides` against **that
    version's** snapshot keys + adapter validity. Dangling/non-applicable/invalid overrides and
    unknown-baseId memberships are **auto-pruned with a logged warning** (mirror the CTL-2 controlRefs
    pruning path), never a hard error.
  - `serializeProject`: sort `groups` by `id`, each `deviceBaseIds` ascending; `overrides` maps emit
    via `stableStringify` (sorted keys); drop empty `overrides`/dataset buckets so output stays
    canonical.
- **Self-tests to add:** v2→v3 migrate adds `groups`/`overrides` and is lossless; load→save→load
  identity for a project carrying a group + device + group overrides; a non-applicable device override
  and a baseId-in-two-groups membership are pruned with warnings; serialized bytes are stable across two
  serializations.
- **Definition of done:** v2 projects open as v3; v3 round-trips byte-identically; invalid overrides
  self-heal with warnings.

### T10.2 · `App.overrides` — the resolver (new pure module)
- **Depends on:** T10.1
- **Spec:** §19.2.3, §19.6, OVR-1/OVR-3/OVR-8
- **Objective:** One pure module that resolves the default→group→device chain and computes divergence;
  the **only** override-aware logic outside the store mutators and UI.
- **Build (`App.overrides`, pure; DEPENDS `App.registry`, `App.util.stable`):** insert a new
  `<script>` IIFE in load order **after `App.completeness`, before `App.generate`**.
  - `groupForDevice(project, deviceId)` → the `DeviceGroup` whose `deviceBaseIds` includes the device's
    `baseId`, else `null`.
  - `effectiveDecision(project, datasetId, item, deviceId)` → `{decision, source}` per the §19.2
    precedence (device latest-config override → group override → `item.decision`). Only the **latest**
    config's overrides count for a device.
  - `effectiveItem(...)` → shallow clone of `item` with `decision` replaced by the effective value
    (adapters stay override-blind).
  - `classify(...)` → `'default'|'group'|'device'` by **value comparison** using
    `stableStringify` (§19.2.3 rules), robust to redundant overrides.
  - `deviceDeviations(project, deviceId)` / `groupDeviations(project, groupId)` → `Deviation[]`
    (§19.6 shape, using `adapter.displayKey` for `displayKey`), sorted by `(datasetId, key)`.
- **Self-tests to add:** precedence (device beats group beats default); `source` correctness;
  `classify` value-based (a device override equal to the group value classifies as `group`/`default`,
  not `device`); `effectiveItem.decision` equals the resolved value; deviations list contents + order.
- **Definition of done:** resolver returns correct effective values + sources for all three layers; all
  classification edge cases pass.

### T10.3 · Store mutators + re-onboard carry-forward
- **Depends on:** T10.2
- **Spec:** §19.3, §19.2.1 (carry-forward), §8.7, OVR-2/OVR-8
- **Objective:** Transactional, validated override + group editing, and override survival across
  re-onboard.
- **Build (`App.store`):**
  - `setDeviceOverride(deviceId, datasetId, key, decision)`: reject if `deviceId` is not the latest
    version of its baseId; validate dataset, applicability (snapshot membership), and
    `adapter.validateDecision`. **No-op clear (OVR-8):** if `stableStringify(decision)` equals the
    value inherited without this device override (group-or-default), call the clear path instead.
    Persist into the latest config `overrides[datasetId][key]`; normalize empty maps away.
  - `clearDeviceOverride(deviceId, datasetId, key)`.
  - `setGroupOverride(groupId, datasetId, key, decision)` / `clearGroupOverride(...)`: validate group,
    applicability against the member-device applicable union, validity; no-op clears vs the **default**.
  - `addGroup({name, deviceBaseIds})` (slug id, unique; **move** baseIds out of any prior group),
    `updateGroup(id, {name?, deviceBaseIds?})` (re-apply single-group rule), `removeGroup(id)`.
  - In `onboardDevice` (the shared re-onboard path): when creating a new version, copy the prior latest
    config's `overrides`, pruning keys absent from the new snapshot for each dataset; log pruned keys as
    info. New configs initialise `overrides: {}`.
  - Export all new mutators on the `store` public object.
- **Self-tests to add:** device override on a non-applicable key is rejected; an invalid value is
  rejected; a no-op set clears; group override applied/cleared; `addGroup` moves a baseId out of its
  old group; re-onboard carries forward applicable overrides and prunes departed keys.
- **Definition of done:** all mutators validate + behave per spec; overrides survive re-onboard;
  serialized state stays canonical.

### T10.4 · Effective completeness, generate & manifest
- **Depends on:** T10.2
- **Spec:** §19.2 (OVR-3), §6.5, §10.1–§10.4
- **Objective:** Route readiness, generation and the manifest through effective decisions without
  touching adapters.
- **Build:**
  - `App.completeness`: `deviceReadiness` evaluates each applicable item via
    `App.overrides.effectiveItem` before `itemComplete` (so a device/group override can satisfy
    completeness even when the default is undecided). `recomputeStatus` and the global
    `RegisterItem.status` stay **default-only** (data tabs unchanged).
  - `App.generate` `gather(project, deviceId, dsId)`: build from **applicable** items, map each through
    `effectiveItem`, then **filter by effective completeness** (replacing the `it.status === 'decided'`
    test), then sort by key. Adapters/`buildScripts`/`buildControlSection`/`renderReportSection` need no
    change (they read `item.decision` = effective).
  - `buildManifest`: each `decisions[dsId]` entry gains `source` (from `effectiveDecision`); `decision`
    is the effective value.
- **Self-tests to add:** a device with a default-undecided item but a valid device override is **ready**
  and generates that item; a group override flows into the generated script/data + manifest with
  `source:'group'`; manifest decisions reflect effective values; the mock-platform portability self-test
  (DOD-11) still passes.
- **Definition of done:** readiness/generation/report/manifest all reflect overrides; no adapter edited;
  portability suite green.

### T10.5 · Devices tab — device-group sections, management & group deviations editor
- **Depends on:** T10.3
- **Spec:** §19.4, OVR-6, §11.3
- **Objective:** Restructure the Devices tab into device-group sections with management and a group
  override view/editor.
- **Build (`App.ui` devices view):** in `renderList`, wrap the existing per-`baseId` version stacks in
  **device-group** sections ordered by `name`, plus a trailing **"Ungrouped"** section. Each group
  header: name, member count, **rename**, **delete**, an **add/remove members** multi-select over device
  baseIds by name (reuse the Control-Manager device multi-select pattern), and a **"Deviations (N)"**
  button (N = group override count). A top-of-tab **"Add group"** control calls `addGroup`. The
  "Deviations" button opens a modal (× + backdrop close, like the per-control modal): per dataset, list
  current group overrides (displayKey · default → group · edit/remove) plus an **"Add override"** row
  (dataset select + searchable key select over the member applicable union + the schema-driven decision
  control) wired to `setGroupOverride`/`clearGroupOverride`. Per-row counts/readiness use effective
  completeness (T10.4).
- **Self-tests to add (DOM-light where feasible):** groups render as sections with an Ungrouped bucket;
  the deviations button count matches override count; adding/removing a group override updates the list;
  member multi-select moves a baseId between groups.
- **Definition of done:** groups are creatable/editable/removable from the tab; group overrides are
  viewable and editable; layout keeps version stacks intact.

### T10.6 · Device-config view — override editing, divergence highlighting, legend, pin toggle
- **Depends on:** T10.3
- **Spec:** §19.5, OVR-4/OVR-5/OVR-8, DOD-9 amendment, §11.7
- **Objective:** Make the latest device view the place to set device overrides and to see divergence.
- **Build (`App.ui` device detail / `renderPanels` / `renderDetail`):**
  - Panels (latest version) list **applicable** items showing the **effective** decision
    (`effectiveItem`); each row gets a class from `App.overrides.classify`:
    `dev-diverge-group` (yellow) / `dev-diverge-device` (orange) / none, plus a text/`title` marker so
    colour is not the sole signal. Add the CSS for both classes (light + dark themes).
  - Per-row **Inherit / Override** affordance: *Override* reveals the adapter's schema-driven decision
    control (reuse `App.ui.tables.renderDecisionControl` or an equivalent) seeded with the effective
    value, persisting via `store.setDeviceOverride`; a **"Revert to inherited"** action calls
    `clearDeviceOverride`. Superseded versions stay fully read-only.
  - A **"Deviations first"** toggle (OVR-5, UI-state only on `_dev`) re-sorts rows: device-orange, then
    group-yellow, then the rest, each band alphabetical; OFF = alphabetical (current behaviour).
  - A **legend** to the right of the device title in `renderDetail` head: yellow "Group override",
    orange "Device override".
  - Device-detail search (RV3-7) operates on the effective decision text.
- **Self-tests to add:** a group-overridden item renders `dev-diverge-group`; a device-overridden item
  renders `dev-diverge-device`; a device override equal to the group value renders as group (not device);
  setting an override equal to inherited clears it; "Deviations first" ordering.
- **Definition of done:** overrides are editable on the latest device view; highlighting + legend + pin
  toggle behave per spec; superseded versions stay read-only.

### T10.7 · Report — "Deviations from default" section + manifest source
- **Depends on:** T10.4
- **Spec:** §19.6, §10.3, OVR-7
- **Objective:** Surface per-device divergences in the generated report.
- **Build (`App.generate.buildReport`):** add a **"Deviations from default"** section built from
  `App.overrides.deviceDeviations(project, deviceId)` — a table of `displayKey · dataset · source ·
  default → group → device`; name the device's group in the header when present; render a
  "No deviations from default" note when empty. Existing per-dataset + Control-coverage sections already
  reflect overrides via the effective `gather` (T10.4); the manifest `source` field lands in T10.4.
- **Self-tests to add:** the report HTML contains the deviations section with the expected rows for a
  device carrying group + device overrides; an override-free device shows the empty note; report bytes
  are deterministic for a fixed clock.
- **Definition of done:** report shows accurate, deterministic deviations; no regression to existing
  sections.

### T10.8 · v1.2 acceptance suite & DOD pass
- **Depends on:** T10.4, T10.5, T10.6, T10.7
- **Spec:** §19.1 (OVR-1…OVR-9), DOD-2/DOD-7/DOD-11
- **Objective:** Lock the feature behind self-tests and confirm invariants.
- **Build:** an end-to-end suite: default→group→device precedence; value-only (a non-applicable override
  is impossible to set and is pruned on load); overrides rescue completeness/readiness; generation +
  manifest + report reflect effective values and sources; highlighting/legend/pin (DOM-light);
  round-trip identity + byte-determinism with overrides/groups; mock-platform portability still green.
- **Definition of done:** all OVR-1…OVR-9 covered green; no adapter edited; existing Phase 0–9 suites
  remain green.

## Review-6 follow-ups (UI refinements)

Presentation-only changes from `Review Notes/review-6_notes`; spec §19.9. All land in the single
`ch-config-tool.html` file. No engine/schema/determinism change.

#### T-RV6.1 · Group members via a toggle dropdown
- **Spec:** §19.9 RV6-1, §19.4
- **Build (`App.ui.views.devices`):** replace `memberCheckboxes` with `memberSelect(g)` — a
  `[data-group-member-select]` `<select>` (placeholder + one `<option value="baseId">` per device, a
  member marked `✓ … — remove`, a non-member `… — add`). Show current member names as text
  (`.grp-member-names`). Wire `change` → toggle the baseId in `group.deviceBaseIds` via
  `store.updateGroup`, then `refreshMain` (the select resets). Remove the old `[data-group-member]`
  checkbox handler.
- **Self-tests:** the group section renders `data-group-member-select` with member/add-remove option
  labels and the member-names text (no member checkboxes).

#### T-RV6.2 · Bigger group-deviations modal + clean value columns
- **Spec:** §19.9 RV6-2, §19.4
- **Build:** give the group modal `<div class="modal modal-wide">` (`.modal.modal-wide{max-width:96vw;
  width:96vw;max-height:92vh}`). In `renderGroupModal`, the override rows become `Key · Default ·
  Deviation setting · (remove)`; the Default cell shows the plain value via the adapter's decision
  display (`decisionGet(adapter)({decision: default})`), not the decision JSON.
- **Self-tests:** the modal has `modal modal-wide`, `Default`/`Deviation setting` headers, a plain
  default value (e.g. `keep`) and no raw decision JSON.

#### T-RV6.3 · Searchable key picker in the add-deviation form
- **Spec:** §19.9 RV6-3, §19.4
- **Build:** replace the add-override key `<select>` with `<input class="gov-add-key" data-gov-add-key
  list="gov-add-keylist">` + a `<datalist id="gov-add-keylist">` of `<option value="storedKey">
  displayKey</option>` (applicable union, not-yet-overridden). The change/Set handlers read the input
  value (unchanged logic).
- **Self-tests:** the add form renders the searchable input + datalist (with the full key list).

## Review-9 follow-ups

Changes from `Review Notes/review-9_Notes`; spec §19.13. All land in `ch-config-tool.html`.

#### T-RV9.1 · Apply-to is a toggle
- **Build:** extract `App.ui.app.applyToTogglePlan(items, field, action, controlId)` → `{matching,
  removing}` (removing when all matching items already have the control); the `[data-apply-to]` handler
  removes from all when `removing`, else adds to the ones missing it. Log which happened.
- **Self-tests:** plan returns removing=false when some missing, true when all have it, false when no items match.

#### T-RV9.2 · Control-ref checkbox spacing
- **Build:** `.control-multiselect .ctl-opt input[type="checkbox"]{width:auto;padding:0}` to override the
  `.detail-form input{width:100%}` stretch.

#### T-RV9.3 · Script header timestamp in AEST
- **Build:** add pure `App.util.clock.toAest(iso)`; the PowerShell preamble prints `Generated (AEST):`;
  the UI `toAest` delegates to it.
- **Self-tests:** toAest UTC→UTC+10; the script header shows AEST and no `Generated (UTC)`.

#### T-RV9.4 · How-to-run comment
- **Build:** optional `platform.runInstructions(name)` (androidAdb) returns the how-to-run block +
  `powershell -ExecutionPolicy Bypass -File .\<name>`; `buildScripts` prepends it to each script file
  (using the emitted name; a `.txt` note when renamed). Data files get none.
- **Self-tests:** the header + exact command are present at the top; tactical.json has none; `.txt` output
  references `.txt` + the rename note.

#### T-RV9.5 · Name the save file
- **Build:** `saveProject(name)` appends `.json` if absent; the Save button opens a `_state.saveModal`
  modal (name input + Confirm/Cancel/×/Enter) that downloads with the entered name.

#### T-RV6.4 · Resizable Control Manager columns
- **Spec:** §19.9 RV6-4, §18.6 RV4-4
- **Build (`App.ui.views.controls`):** add `_cm.colWidths`; render `table.data.ctl-table.resizable`
  with data-driven `<th data-cm-col style="width:Npx">` + `.col-resize` handles
  (`data-cm-col-resize`). Add a `mousedown[data-cm-col-resize]` handler in `wire` that live-resizes the
  `<th>` and persists to `_cm.colWidths`. Drop the fixed `max-width` on the applies/description cells.
- **Self-tests:** the table is `data ctl-table resizable` with resize handles, per-column width styles,
  and a stored width override applied.

#### T-RV6.5 · Control-ref labels on one line
- **Spec:** §19.9 RV6-5, §18.3 CTL-5
- **Build:** `.control-multiselect .ctl-opt{white-space:nowrap}` + checkbox `flex:0 0 auto` (left) +
  span `white-space:nowrap`; widen the box and allow horizontal scroll for very long names.
- **Self-tests:** covered by the existing CTL-5 render test (checkbox list unchanged structurally).

## Review-7 follow-ups (bulk control assignment + collapse-all)

Changes from `Review Notes/review-7_notes`; spec §19.10. All land in the single `ch-config-tool.html`.

#### T-RV7.1 · Collapse-all button in the device view
- **Spec:** §19.10 RV7-1, §19.5
- **Build (`App.ui.views.devices`):** in `renderDetail`, compute `allCollapsed` over `datasets(project)`
  against `_dev.collapsed`; render a `[data-dev-collapse-all]` button (label `Collapse all` / `Expand
  all`) to the right of the Deviations-first `pin` in `.dev-detail-tools`. Wire `click` → set/clear
  `_dev.collapsed[dsId]` for all datasets, then `refreshMain` (so the label flips).
- **Self-tests:** the detail view renders `data-dev-collapse-all` reading `Collapse all` when expanded
  and `Expand all` when all three panels are collapsed.

#### T-RV7.2 · Apply Control Mode (bulk control-ref assignment)
- **Spec:** §19.10 RV7-2, §11.2, §18.3 CTL-5
- **Build:**
  - Per-dataset UI state gains `applyMode` + `applyControlId`. `renderToolbar(dsId, ui, total, shown,
    controls)` renders an `[data-apply-toggle]` button and, when `applyMode`, a searchable control
    picker (`<input data-apply-control list>` + `<datalist>` of control titles, or a "no controls" note).
  - `renderTableHtml` appends an `apply-col` header and a per-row `[data-apply-check]` checkbox when
    `ui.applyMode`; the box is `checked` iff `applyControlId ∈ item.controlRefs`, and `disabled` when no
    control is selected. `colspan` accounts for the extra column.
  - Wire (`App.ui.app`): `click[data-apply-toggle]` flips `ui.applyMode` (clears `applyControlId` on
    exit) → `renderMain`; `change[data-apply-control]` resolves the typed title → control id →
    `renderTableHost`; `change[data-apply-check]` adds/removes `applyControlId` in the item's
    `controlRefs` via `store.setItemFields`, wrapped in a `_suppressRender` guard so the store change
    does **not** trigger the full `render()` (fast bulk assignment; scroll preserved). The store
    `onChange` handler honours `_suppressRender`.
- **Self-tests:** toolbar shows the toggle (+ picker/datalist + selected title when on, hidden when off);
  the table gains the apply column with per-row checkboxes reflecting membership (checked for an item
  that already has the control), disabled when no control is picked, and absent when the mode is off.

## Review-8 follow-ups (apply-mode + device-panel columns)

Changes from `Review Notes/review-8_notes`; spec §19.11. All land in the single `ch-config-tool.html`.

#### T-RV8.1 · Control picker: name only
- **Spec:** §19.11 RV8-1, §19.10 RV7-2
- **Build (`App.ui.tables.renderToolbar`):** the apply-mode datalist option becomes
  `<option value="title"></option>` (drop the `type` text).
- **Self-tests:** the option renders name-only; the type does not appear.

#### T-RV8.2 · "Apply to <action>" bulk assignment (packages only)
- **Spec:** §19.11 RV8-2, §11.2
- **Build:** in `renderToolbar`, resolve the dataset adapter from the loaded project and its **enum**
  `decisionSchema` field; only then render a `[data-apply-to]` `<select>` (placeholder + the enum
  options) `disabled` unless `ui.applyControlId`. Remove the old hint text. Wire
  `change[data-apply-to]` in `App.ui.app`: for the selected control + action, add the control to the
  `controlRefs` of every item whose `decision[field] === action` (skip those that already have it),
  under the `_suppressRender` guard, then `renderMain` + log a summary. Tactical has no enum
  field → no control rendered.
- **Self-tests:** packages shows an enabled/disabled `data-apply-to` with the action options and no old
  hint; tactical has none.

#### T-RV8.3 · Device-panel Override + resizable panel columns
- **Spec:** §19.11 RV8-3, §19.5
- **Build (`App.ui.views.devices`):** `_dev.panelColWidths` (keyed by dataset). `renderPanels` builds
  each latest-version panel as `table.dev-panel-table` (fixed layout) with data-driven `<th data-dev-col
  style="width:Npx">` + `.col-resize` handles (`data-dev-col-resize="<dsId>|<col>"`) for Key/Effective/
  Override; CSS wraps long cell text. Add a `mousedown[data-dev-col-resize]` handler in `wire` that
  live-resizes the `<th>` and persists to `_dev.panelColWidths[dsId][col]`. Every dataset's Override editor
  (a string textarea) was already produced by `renderOverrideControl`; fixed widths keep it visible.
- **Self-tests:** panels are `dev-panel-table` with per-dataset resize handles (incl. the Override column);
  every dataset exposes an editable override control; stored widths apply independently per
  dataset.

## Phase 11 — Generation customisation (v1.3)

Per-command output shaping (spec §20). **Session-only** (Generate-view state; no persistence, no
`schemaVersion` bump), **four independent option blocks** (Implementation / Verification / Reporting /
new Control report). Adapters stay core-blind (DOD-11): new behaviour rides on declarative adapter
metadata + generic orchestrator filters. All lands in the single `ch-config-tool.html`. Everything below
defaults to "include all", so a fresh session reproduces today's full output byte-for-byte.

### T11.1 · Report table helper + declarative adapter metadata
- **Depends on:** T7.5 (existing `renderReportSection`)
- **Spec:** §20.3, GEN-2/GEN-3/GEN-5
- **Objective:** Make report rendering column- and group-aware without hard-coding datasets.
- **Build:**
  - Add `App.report.renderTable(title, headerCells, rowsHtml)` — a shared table builder that emits the
    `<h2>` + `<table>` markup and the single `None.` empty-row (GEN-5); route all text through `esc()`.
  - Add optional adapter fields: `reportColumns` (packages/tactical — `{id,label,optional}` for
    the post-key columns) and `reportGroups` (packages only — `{field:'action', options:[Removed/
    Disabled/Kept]}`) per §20.3.
  - Rewrite each `renderReportSection(items, ctx, opts)` to accept `opts = {columns, groups}`: build the
    visible column set from `reportColumns` ∩ `opts.columns` (key column always shown); for packages,
    emit one sub-table per **enabled** group (`"Packages — Removed"`, …), each with the `None.` rule;
    tactical emits its single table honouring column toggles.
- **Self-tests:** packages renders three sub-tables split by action with correct rows; an enabled-but-
  empty group shows exactly one `None.` row; dropping the `rationale`/`control`/`value` column removes
  that `<th>` and cells; an adapter with neither field (mock) renders one all-columns table (portability).

### T11.2 · `buildReport` options + included-sections table + classification
- **Depends on:** T11.1
- **Spec:** §20.4, GEN-1/GEN-3/GEN-4/GEN-6
- **Objective:** Thread report options through the orchestrator and self-document composition.
- **Build (`App.generate.buildReport(project, deviceId, opts)`):**
  - Resolve `opts = _gen.report`-shaped (undefined ⇒ include all). Gate the metadata block on
    `opts.sections.meta`, Control-coverage on `opts.sections.control`, Deviations on
    `opts.sections.deviations`; pass `{columns: opts.columns[ds.id], groups: opts.datasetSections[ds.id]}`
    into each `renderReportSection`.
  - Prepend a **"Sections included"** table (always rendered) listing every candidate section with
    `Included`/`Omitted`, built from a shared descriptor (also consumed by the UI in T11.7).
  - Extend `App.report.wrapReport(title, meta, sections, wrapOpts)` with `wrapOpts.classification`:
    inject a `<div class="classification">` banner top and bottom of `<body>` + Word-safe `@page` style.
    Handle an omitted metadata block cleanly (no empty table).
- **Self-tests:** excluding Tactical/Deviations/meta removes exactly those sections; the sections-included
  table reflects the flags; classification banner appears top & bottom only when set; report bytes are
  deterministic for a fixed clock + fixed options, and differ only in the intended files when options
  change.

### T11.3 · `buildControlReport` (new command)
- **Depends on:** T11.1, T7.5 (`buildControlSection` for reference), T10.4 (effective `gather`)
- **Spec:** §20.5, GEN-7
- **Objective:** A standalone control-keyed report for a device.
- **Build (`App.generate.buildControlReport(project, deviceId, opts)`):** group effective applicable+
  complete items by `controlRefs`; emit one section per **applied** control (sorted by label) with its
  title/type/description and a `Dataset · Key · Decision` table (decision via the adapter's decision-
  column getter); collect empty-`controlRefs` items under "(no control)", shown only if
  `opts.includeUncontrolled`; metadata block + classification per §20.4/§20.5. Zip `control-report.html`
  + `manifest.json` as `<device>-control-<stamp>.zip` with `command:'control'`. Register in `App.generate`.
- **Self-tests:** every applied control appears with its satisfying items and shown decisions; an
  unreferenced defined control is absent; "(no control)" hidden by default and shown when toggled;
  byte-deterministic for fixed clock + options; gated by `deviceReady`.

### T11.4 · Implementation shaping (dataset include + action subset)
- **Depends on:** T7.3 (`buildScripts`)
- **Spec:** §20.6, GEN-8
- **Objective:** Emit only chosen datasets/actions.
- **Build (`buildScripts`):** before `ds.generateImplementation`, apply two generic filters from `opts`:
  skip a dataset when `opts.datasets[ds.id] === false`; when `opts.actions[ds.id]` is present, discover
  the adapter's **enum** `decisionSchema` field (as RV8-2) and drop items whose
  `decision[enumField]` is unticked. `manifest.decisions` still records the full effective set (§20.9).
- **Self-tests:** unticking a dataset omits its script; a remove-only filter yields a packages script with
  only `uninstall` guards (no disable/keep); tactical (no enum) ignores the action filter;
  determinism holds for fixed options.

### T11.5 · Verification shaping (dataset include + only-deviations + results CSV)
- **Depends on:** T7.4 (`buildVerification`), T10.4 (`App.overrides.deviceDeviations`)
- **Spec:** §20.7, GEN-9
- **Objective:** Narrow verification scope and add a results scaffold.
- **Build (`buildScripts`):** dataset include as T11.4; when `opts.onlyDeviations`, restrict each
  dataset's items to keys in `deviceDeviations(...)` for that dataset; when `opts.csvResults`, append a
  non-script `verification-results.csv` (`dataset,key,expected,actual,result`; expected = adapter
  decision-column display; actual/result blank; RFC-4180 quoted via `App.util.csv`). MISSING/EVIDENCED
  unchanged.
- **Self-tests:** dataset toggle omits its verify script; only-deviations restricts to deviating keys (and
  emits header-only when none); the CSV has the header + one row per included item with expected filled
  and actual/result blank; determinism holds.

### T11.6 · Generate-view session state (`_gen` blocks)
- **Depends on:** —
- **Spec:** §20.2, GEN-10
- **Objective:** Hold the four independent option objects in memory.
- **Build (`App.ui.views.generate`):** extend `_gen` with `report`, `control`, `implementation`,
  `verification` blocks per §20.2 (include-maps default to "included" on missing key). Keep the existing
  global `scriptsAsTxt`. Add `'control'` to `COMMANDS` (`build:'buildControlReport'`). `doGenerate` passes
  `_gen[block]` as `opts` to the resolved builder. No project/dirty-state writes.
- **Self-tests:** default `_gen` reproduces full output (all blocks include-all); each block is
  independent (mutating one leaves the others unchanged); the Control-report command dispatches to
  `buildControlReport`.

### T11.7 · Generate-tab options UI (four collapsible panels)
- **Depends on:** T11.1, T11.6
- **Spec:** §20.8, §11.5, GEN-1/GEN-3/GEN-6/GEN-7/GEN-8/GEN-9
- **Objective:** Render the per-command option panels, fully data-driven.
- **Build (`App.ui.views.generate`):** under each command button render a collapsible **Options** panel;
  add a fourth **Control report** card after Reporting. Reporting panel: Device Config Information
  checkbox; per-dataset group checkboxes (from `reportGroups`) or a single dataset checkbox; per-dataset
  optional-column checkboxes (from `reportColumns`); Control-coverage + Deviations checkboxes;
  classification checkbox. Control panel: classification + include-no-control. Implementation panel:
  per-dataset include + (enum datasets) action-subset checkboxes. Verification panel: per-dataset include
  + only-deviations + results-CSV. All wired to `_gen` with re-render only; no hard-coded dataset ids.
- **Self-tests (DOM-light):** the Reporting panel renders one checkbox per package action group + the
  optional-column toggles for the active platform; a mock platform with no `reportGroups`/`reportColumns`
  renders a single dataset checkbox and no column toggles; toggling a box updates `_gen` and re-renders
  without touching the project.

### T11.8 · v1.3 acceptance suite & DOD pass
- **Depends on:** T11.1–T11.7
- **Spec:** §20.1 (GEN-1…GEN-11), DOD-7/DOD-11
- **Objective:** Lock the feature behind self-tests and confirm invariants.
- **Build:** end-to-end suite covering all GEN criteria: section/column/group selection; included-sections
  table; empty-`None` rule; classification banner; the four independent blocks; implementation action
  subset; verification only-deviations + CSV; control report composition; **byte-determinism** for fixed
  clock+options across all four commands and "options change only intended files"; **portability** with a
  mock dataset declaring neither new adapter field.
- **Definition of done:** GEN-1…GEN-11 green; no core/store/schema edits beyond the declared adapter
  metadata + orchestrator threading; existing Phase 0–10 + review suites remain green.

### Phase 11 dependency map
- **T11.1** (helper + adapter metadata) → **T11.2** (report opts), **T11.3** (control report).
- **T7.3/T7.4** → **T11.4/T11.5** (impl/verify shaping). **T10.4** → **T11.3/T11.5**.
- **T11.6** (state) → **T11.7** (UI). **T11.1–T11.7** → **T11.8** (acceptance).

---

## Phase 12 — v2.0: retire the Settings dataset

> **Spec:** §21 (RET-1…RET-6, RET-A…RET-E).
> Exit gate: `android.settings` is absent from the product; every v1.x project still opens with a
> single located warning and everything else intact; the full self-test suite is green; the real
> reference captures still onboard, generate and round-trip byte-identically.

This phase is the worked counter-example to DOD-11: just as *adding* a dataset must need no core
edits, **removing** one must not either. Everything below touches the adapter file, the platform
profile, one new table in `projectIo`, and copy — nothing in store, registry, diff, completeness,
overrides, generate or the report shell.

### T12.1 · Remove the `android.settings` adapter and its platform wiring
- **Depends on:** T2.6, T7.2, T7.4
- **Spec:** §21.2
- **Objective:** Delete the dataset from the product without disturbing the two that remain.
- **Build:**
  - Delete the `settings` adapter object and its private helpers (`SETTINGS_NAMESPACES`,
    `SETTINGS_KEY_RE`, `SETTINGS_NS_HEADER_RE`, `isSettingsCsvHeader`, `settingsCsvHeader`,
    `parseSettingsCsvAssignment`, `normalizeSettingValue`) from `App.adapters.android`, and drop
    `settings` / `normalizeSettingValue` from that module's exports.
  - `App.platforms.androidAdb`: `datasets: [A.packages, A.tactical]`; rewrite `captureInstructions`
    to the two captures; drop the now-callerless `Verify-Setting` helper from `scriptPreamble`.
  - **Keep** `psSingleQuote` **and** `shSingleQuote` (Appendix B is a standing contract — the note
    there explains why the POSIX layer is retained with no current caller) and the §8.4 drift
    mechanism (adapter-driven, inert when unused).
  - Remove the Settings-only default column width so all datasets share the 240px key default;
    `colDefaultWidth(key, dsId)` keeps its `dsId` parameter for the next dataset that needs one.
- **Self-tests to add:** `registry.getDataset('android-adb','android.settings')` is `null`; the id is
  absent from `datasetIds`; `App.adapters.android.settings` is falsy; the profile lists exactly
  `['android.packages','android.tactical']`; `captureInstructions` and `scriptPreamble` contain no
  Settings reference (RET-B, RET-C).
- **Definition of done:** No `settings put`/`settings get` can be emitted; no `settings.impl.*` /
  `settings.verify.*` file name is reachable; the remaining adapters are untouched.

### T12.2 · Retired-dataset load path in `projectIo` (backwards compatibility)
- **Depends on:** T12.1, T1.2
- **Spec:** §21.3 (RET-1…RET-6), §12.2, DOD-10
- **Objective:** Let every project saved by v1.x still open, losing only the retired dataset, and
  saying so out loud.
- **Build:**
  - Add `var RETIRED_DATASETS = { 'android.settings': 'Settings' };` (id → human label) and
    `dropRetiredDatasets(p) → Issue[]`, exported for tests.
  - `dropRetiredDatasets` strips each retired id from `items`, every `DeviceConfig.snapshots`, every
    `DeviceConfig.overrides` and every `DeviceGroup.overrides`, returning **one** `warning` per
    retired dataset that was actually present, located at the dataset id, naming how many register
    items and how many captured snapshots were dropped.
  - Call it in `parseProject` **between** `migrate` and `validateSchema` — before, and the ids fail
    the Appendix-A cross-check; after, and validation has already rejected the file. Concatenate its
    warnings onto the returned issues on both the ok and the error path.
  - Do **not** relax the unknown-dataset error: retirement is an allow-list (RET-6).
- **Self-tests to add:** a v1.x project carrying the Settings register, an `android.settings` snapshot,
  a device override and a group override loads `ok`, drops exactly those, keeps devices/controls/
  groups/other registers, and yields exactly one located warning naming the counts; a clean project is
  a byte-for-byte no-op with no warning; re-saving makes the removal permanent and the second load is
  silent; an **unknown** (not retired) dataset id is still a hard error (RET-A, RET-4, RET-5, RET-6).
- **Definition of done:** No existing project file is bricked; nothing is dropped silently.

### T12.3 · Copy, Help manual and UI surfaces
- **Depends on:** T12.1
- **Spec:** §21.2, §21.4 RET-D, §18.9 RV15-2
- **Objective:** Remove every user-visible trace of the dataset.
- **Build:** update the Help manual (Onboarding, Data tables, Devices & groups, Generating output,
  Reference/glossary), the Devices tab copy (control-satisfaction blurb, device search placeholder,
  the decisions-import note, now "the Packages CSV"), and the Generate tab. Reword the module and
  inline comments that assumed three datasets/panels/slots so the code reads *per dataset*.
- **Self-tests to add:** iterate **every** Help section and assert none renders the word "Settings"
  (masking `imsSettings` first) — a coverage check, not a spot check (RET-D).
- **Definition of done:** No app chrome names Settings as a dataset. Note that genuine *device data*
  may still contain the word — the Knox `policyList` has a policy literally named *Disable Settings* —
  so the assertion is on chrome, never on data.

### T12.4 · Re-target the inherited test suites
- **Depends on:** T12.1, T12.2
- **Spec:** §15
- **Objective:** Keep the behaviour Settings happened to be the vehicle for, without keeping Settings.
- **Build:** Settings was the only shipped dataset with a **free-text primary**, so several suites used
  it to exercise generic behaviour. Re-target those at **tactical** (also a text primary) rather than
  deleting them: RV16-1 blank-value commits, RV17-2 the clear button's flex row, RV17-3 the badge flip
  adopting the shown value, the full-width wrapping value box, per-dataset panel overrides and column
  widths, the Security Relevance column, and the relevance-import round trip. Delete only what was
  genuinely format-specific (the sectioned `key=value` parser suite, the `setting,description,value`
  CSV). Rebuild the §8.4 drift test on a hand-built snapshot carrying `values` (T4.3). Fix the fixture
  counts that move when a dataset leaves (undecided totals, dataset-reason counts, panel counts,
  emitted-file lists, report colgroup counts).
- **Definition of done:** Suite count and coverage do not regress; no test asserts on a dataset that
  no longer exists.

### T12.5 · v2.0 acceptance
- **Depends on:** T12.1–T12.4
- **Spec:** §21.4 (RET-A…RET-E), DOD-1…DOD-12
- **Objective:** Prove the retirement end-to-end.
- **Build:** run the full embedded suite headlessly; then re-run the **real-data** check against
  `Reference Input Files/` — onboard `packages.txt` + the Knox `policy-config-*.json`, decide every
  item, and assert: both parse with 0 errors, the device reaches *ready*, Implementation emits
  `packages.impl.ps1` + `tactical.json` + `manifest.json` (no settings file, no `settings put`),
  Verification emits `packages.verify.ps1`, the report contains no Settings section, the rebuilt
  tactical document still matches the capture, and `serialize(parse(serialize(p))) === serialize(p)`.
- **Definition of done:** All DOD items still hold; RET-A…RET-E green; the portability self-test
  (DOD-11) unchanged — no core edits were needed to remove a dataset.

### Phase 12 dependency map
- **T12.1** (remove adapter + wiring) → **T12.2** (compat load path), **T12.3** (copy), **T12.4** (tests).
- **T12.1–T12.4** → **T12.5** (acceptance).

---

## Phase 13 — v2.1: value formats & the sticky tools rail

> **Spec:** §22 (VF-1…VF-8, SP-1…SP-3, VF-A…VF-C, SP-A).
> Exit gate: the full suite is green; the reference capture still reaches *ready* with no
> configuration; a project carrying custom formats round-trips byte-identically.

### T13.1 · `App.valueFormats` (new pure module)
- **Depends on:** T1.1, T2.5
- **Spec:** §22.1.1 (VF-1, VF-2)
- **Objective:** One pure module owning what a value may be, so no other module has to.
- **Build:** the five built-ins; `inferId(capturedType, capturedValue)`;
  `resolve(project, item, capturedType, capturedValue)` (explicit format → custom → inferred,
  never throwing, flagging a dangling ref); `validate(fmt, value)`; `display`/`parseInput`
  (exact inverses); `list(project)`; `usageCount`; `optionDescription`.
  **Watch the two traps:** the tactical flattener reports numbers as `int`/`float`, not
  `number`; and an array that is not all-strings must infer `json`, or a text editor will
  turn `[1,2]` into `["1","2"]` and change what gets uploaded.
- **Self-tests:** every kind round-trips through display→parseInput; the empty-box rule per
  kind; each shape of the reference capture infers correctly.
- **Definition of done:** pure, no store access, no DOM; callers pass the project in.

### T13.2 · Schema + store CRUD
- **Depends on:** T13.1
- **Spec:** §22.1.1 (VF-3, VF-5, VF-6)
- **Objective:** Persist the catalogue and the per-item reference.
- **Build:** add `valueFormats` to `TOP_KEYS` and validate it (slug id unique and not
  colliding with a built-in, name, kind, options with unique non-empty values, optional
  min/max/pattern); validate `RegisterItem.format` as a **string only** — existence is
  deliberately NOT checked, because a dangling ref must degrade, not refuse to open. Sort
  `valueFormats` by id in `serializeProject` and **never sort options** (their order is the
  picker's). Add `addValueFormat`/`updateValueFormat`/`removeValueFormat`/`setItemFormats`,
  and accept `format` in `setItemFields`. Duplicate the built-in id list in `projectIo`
  (it loads before `App.valueFormats`) and assert the two copies match in a self-test.
- **Self-tests:** round-trip with formats; malformed format rejected; built-in id collision
  rejected; remove clears refs without touching decisions; dangling ref still loads.

### T13.3 · Enforcement in completeness
- **Depends on:** T13.1, T13.2
- **Spec:** §22.1.2 (VF-7)
- **Objective:** Make "required format" actually required.
- **Build:** `itemComplete(adapter, item, project, captured)` — the last two OPTIONAL so
  every existing caller is unchanged — folding in `formatIssues(...)`. Export `formatIssues`
  so the table can show *why*. `deviceReadiness` computes each dataset's captured map once
  and passes it, and evaluates the **effective** item, so an override that violates a format
  blocks readiness too.
- **Self-tests:** an out-of-vocabulary value is complete per the adapter but not per
  completeness, blocks readiness, and reports a located reason; a bad override does the same.

### T13.4 · Format-driven editors
- **Depends on:** T13.3
- **Spec:** §22.1.3 (VF-8)
- **Objective:** The right control for the shape, everywhere.
- **Build:** `renderValueEditor(fmt, attrs, value)` in `App.ui.tables` (exported), emitting
  `data-fmt-kind`; route the data table's `string`/`value-typed` branches, the device-panel
  override editor and the group-deviation editor through it. Read back via `parseInput` in
  `decisionFromRaw`, `toggleStatus`, and both override commit paths. The override editors
  must resolve their format from the **captured** leaf — the override value is normally
  empty and would infer "text" for everything.
- **Self-tests:** each kind renders its control; an options select carries each option's
  description; an off-vocabulary captured value stays visible and marked; the override
  panels render the same controls as the table.

### T13.5 · Picker + manager UI
- **Depends on:** T13.2
- **Spec:** §22.1.1 (VF-4, VF-5)
- **Objective:** Somewhere to say what a value may be.
- **Build:** the expander's Value format picker (value datasets only) with a live hint and a
  "Manage…" button; `App.ui.views.formats` — a modal with a format list, an editor, and for
  `options` a table of allowed values each with a description, plus add/remove. Every write
  goes through a store mutator so it dirty-tracks like any other edit.
- **Self-tests:** the picker renders for tactical and NOT for packages; the modal lists
  formats, shows the options table with descriptions and a usage count, and closes.

### T13.6 · The sticky tools rail
- **Depends on:** T3.1
- **Spec:** §22.2 (SP-1…SP-3)
- **Objective:** Stop the operator scrolling to the top to change the control they are assigning.
- **Build:** wrap the table and a new `<aside class="side-rail">` in a flex `.table-wrap`;
  move Apply Control Mode, Delete Items and Undo/Redo into it, leaving only filters in the
  toolbar; make it `position:sticky` with `align-self:flex-start` (sticky does not work in a
  flex row without it) and collapsible per dataset. Replace the datalist picker with a
  filterable card list showing title, type and description; move "Apply to `<action>`"
  beneath it. Stack the rail above the table under ~1100px.
- **Self-tests:** mode controls render inside the rail and filters outside it; collapse
  renders only the toggle; cards carry title/type/description; the filter matches all three;
  Apply-to stays enum-only and sits in the rail.
- **Note:** this SUPERSEDES **T-RV8.1** (name-only picker) — record it, do not silently drop it.

### T13.7 · v2.1 acceptance
- **Depends on:** T13.1–T13.6
- **Spec:** §22.3
- **Objective:** Prove no regression and no false blocking.
- **Build:** full suite headless; then the real-data check — the reference capture must still
  parse with 0 errors, reach *ready* when every item is decided as captured (VF-A), generate
  the same artifacts, and round-trip byte-identically; plus a custom `options` format applied
  to both 5G keys rendering described dropdowns and rejecting a bad value (VF-B).
- **Definition of done:** VF-A…VF-C and SP-A green; DOD-1…DOD-12 unaffected.

### Phase 13 dependency map
- **T13.1** → **T13.2** → **T13.3** → **T13.4**; **T13.2** → **T13.5**; **T13.6** independent.
- **T13.1–T13.6** → **T13.7** (acceptance).

### T13.8 · Make the rail actually stick (SP-4, SP-5)
- **Depends on:** T13.6
- **Spec:** §22.2 (SP-4, SP-5), §22.3 (SP-B, SP-C)
- **Objective:** The rail rendered correctly but scrolled away with the page. Fix the layout
  it depends on, and make the failure impossible to reintroduce silently.
- **Build:**
  - `#app-root`: `min-height:100vh` → **`height:100vh`**; `.main`: add **`min-height:0`**.
    Together these make `.main` the real scroll region. Previously `#app-root` grew with its
    content so the body scrolled while `.main`'s `overflow:auto` never did — and an
    overflow ancestor becomes the sticky scrollport *even when it never scrolls*, so the
    rail was pinned to something stationary.
  - `.side-rail`: `top:0` (measured from `.main`'s scrollport) and a `max-height` that
    leaves room for the chrome and the Activity drawer; it scrolls internally if cramped.
  - **Scroll preservation:** snapshot `#main.scrollTop` plus the rail's `.ctl-cards` (and the
    format manager's lists) before a render and restore after, or every re-render jumps to
    row 1. Preserve **within a tab only** — a tab change should land at the top.
- **Self-tests:** four assertions over the inline stylesheet covering the SP-4 properties
  (fixed height, `min-height:0` + `overflow:auto`, sticky + `align-self:flex-start` + inset,
  no overflow on `.table-wrap`). **Verify each fails when its property is reverted** — a
  guard that cannot fail is not a guard.
- **Out-of-band check (SP-C):** drive a real browser (a headless Chrome script is enough)
  over a 400-row table: assert the rail's viewport offset is identical at several scroll
  depths and that selecting a control does not move the table. None of this is observable
  from render-to-string tests, which is why the bug shipped.
- **Definition of done:** rail pinned at a constant offset at any scroll depth; scroll kept
  across re-renders; suite green in-browser with no console errors.

### T13.9 · Bulk-over-shown, bigger hit targets, hold-for-review (BULK-1/2, HELD-1)
- **Depends on:** T13.6
- **Spec:** §22.4, §22.3 (BULK-A/B, HELD-A)
- **Objective:** Three usability changes from review, one of which is a data-model addition.
- **Build:**
  - **BULK-1.** Replace the "Apply to `<action>`" dropdown with an **Apply to all N shown**
    button. Put the plan in `App.ui.model.applyAllShownPlan(project, dsId, ui, controlId)` —
    it reuses `filterSortRows`, so "shown" is *by construction* the same set the table
    renders — and have BOTH the button label and the click handler consume it, or the count
    promised and the set acted on will drift. Toggle semantics per RV9-1. One undo entry per
    run; log the count and the active search. Drop the enum-only restriction: the new button
    is dataset-agnostic. Record RV8-2/RV9-1 as **superseded**.
  - **BULK-2.** Wrap the apply/delete checkboxes in `<label class="cell-check">` filling the
    cell (`td{padding:0}`), keeping the real `<input>` and its `aria-label`. Do **not** put a
    click handler on the `<td>` — that loses keyboard/AT access. Verify in a browser that a
    click on the box itself toggles once, not twice.
  - **HELD-1.** Add optional `RegisterItem.held`, a `store.setHeld` mutator, the
    `completeness.itemComplete` short-circuit, schema validation (`true` only), a third
    badge, and the amended badge-flip. `setDecision` clears `held` (editing is reviewing);
    refuse to hold an item with no decision.
- **Self-tests:** the plan honours search AND every filter and leaves hidden rows alone; the
  label matches the plan; the button is inert with no control or nothing shown; both tick
  columns are cell-filling labels and stay real checkboxes; holding retains the decision,
  reads undecided, blocks readiness, excludes the item from generation, round-trips, and
  rejects `held:false`; flipping back restores the value; editing releases; clear still clears.
- **Out-of-band:** drive a browser for BULK-B (cell-whitespace click, no double-toggle) and
  to confirm the end-to-end search→apply flow.

### T13.10 · Layout stability, column-wide assignment, control tags (STAB-1/2, TAG-1/2/3)
- **Depends on:** T13.9
- **Spec:** §22.5, §22.3 (STAB-A, TAG-A)
- **Objective:** Three review items; the first is a bug whose cause is not where it looks.
- **Build:**
  - **STAB-1.** The reported symptom is "checking a box moves my scroll slightly". `scrollTop`
    is in fact untouched — the ROW GROWS. Ticking adds a name to a neighbouring cell, it wraps,
    the row gets taller, everything below slides. Clamp those cells (`Control Refs`,
    `Applies to`, `Tags`) to a **fixed** height with the value on `title`. A 1–2 line *range* is
    not enough: 0→1 line still grows. Emit the clamp span even when empty. **Verify in a
    browser by measuring the ticked cell's viewport offset before and after** — this cannot be
    seen from rendered HTML.
  - **STAB-2.** Add scroll anchoring to `restoreScroll`: record the focused element's viewport
    offset via a selector built from its `data-*` attributes, and correct `scrollTop` by however
    much it moved. Catches any future height change, wherever it comes from.
  - **TAG-3.** Make each per-device column heading a button over `shownControls(project)` —
    the same "shown means shown" guarantee as BULK-1, shared by the heading's state and its
    action. Add `store.setControlsDevice(ids, baseId, on)`, keeping the review-12 #1
    `deviceStates` contract.
  - **TAG-1/2.** Add `Control.tags` + top-level `controlTags`, `store.setControlTag`,
    `addControlTag`/`removeControlTag`/`knownControlTags`, a Tags column, and a **Control
    Manager tools rail** mirroring SP-1…SP-3. Make the CM search match tags. Put the create-tag
    box ABOVE the picker — with a long tag list the rail scrolls, and the one control you cannot
    reach by scrolling is the one that creates the first tag.
- **Watch:** the CM search re-renders only the table host. The rail's bulk button names the
  shown count, so it MUST be re-rendered with it or the button will promise a number it does not
  act on (found in browser testing, not by the suite).
- **Self-tests:** clamped cells incl. the empty case and the fixed-height CSS; the heading is a
  button, acts on the shown set only, toggles, and marks itself; tags create/apply/multi/dedupe/
  canonical-empty/round-trip/schema/delete; search matches tags; the rail renders picker, tick
  column, bulk button and create box; the bulk label flips to untag.

### T13.11 · Column filters + justified control satisfaction (FIL-1, JUS-1/2/3)
- **Depends on:** T13.9, T13.10
- **Spec:** §22.6, §22.3 (FIL-A, JUS-A)
- **Objective:** Filter tables by column value; make control satisfaction a justified decision.
- **Build:**
  - **FIL-1.** Add `filterableColumns(project, dsId, adapter)` and `colFilterPredicate(adapter, ui)`
    to `App.ui.model`, and apply the predicate inside `filterSortRows` **before** the search so
    the search narrows what the filters left. Discover the columns from the adapter — the enum
    decision field, the relevance vocabulary, the devices holding items, and status (including
    HELD-1's `review`). Render a `filter-row` under the headings; tint active filters; add a
    toolbar count + clear. Everything downstream (BULK-1, CSV) inherits the filters for free
    because they share `filterSortRows`.
  - **JUS-1/2.** Add `Control.deviceJustifications` + `store.setControlDeviceJustification` /
    `controlDeviceJustification`. **Move** the state toggle off the list row into
    `renderControlModal`, next to a justification textarea, under the item lists. Flush a pending
    justification edit before committing the state — clicking the button blurs the textarea.
  - **JUS-3.** Add Status + Justification columns to the report's Control-coverage section and a
    status/justification block per control in the control report. Print "No justification
    recorded" for a satisfied control that has none — a blank cell reads as clean.
- **Self-tests:** filterable columns are adapter-derived (tactical gets no Action filter); each
  filter type incl. "(not set)" and `review`; filters compose with search, each other and the
  parked toggles; the filter row renders and marks active filters; the toolbar announces them;
  the bulk plan honours them. Justification round-trips, clears canonically, is refused for an
  unassigned device, is schema-checked; the modal carries toggle + box + evidence while the list
  row carries neither toggle; unjustified-satisfied is flagged in modal, list and report; both
  reports carry the text.
- **Out-of-band:** browser-verify the filter→search flow end to end, and that typing a
  justification then clicking Mark satisfied persists BOTH (the blur/commit race).

### T13.12 · Universal undo in the data tabs (UNDO-1/2/3)
- **Depends on:** T13.11
- **Spec:** §22.9, §22.3 (UNDO-A, UNDO-B, UNDO-C)
- **Objective:** Make the Undo button cover every change a data tab can make, not just the two bulk
  modes it shipped attached to.
- **Build:**
  - **UNDO-1.** Add `withUndo(dsId, label, fn)` beside the existing `pushUndo`/`stepHistory`
    machinery: it closes any open apply run, snapshots the dataset, runs `fn`, and owns the
    bookkeeping. Route **every** mutating data-tab handler through it — decision commit and clear,
    the Status badge (adopt / hold / release), relevance, diverges, field edits, the rationale
    preset, control-ref ticks, value-format pick, rename, add, delete, bulk apply. Make it the
    only route, so forgetting to be undoable requires bypassing the wrapper rather than omitting
    a line.
  - **UNDO-2.** Nothing extra: the snapshot is whole-dataset, so a many-row action is already one
    entry. Keep review-13 #2's tick-folding, and let `withUndo`'s `closeRun()` end an open run when
    any other edit intervenes.
  - **UNDO-3.** Compare the dataset before/after and drop the entry — restoring the redo branch —
    when nothing changed. Keep the 20-entry cap and the per-dataset, per-session scope. Re-word
    `UNDO_OFF_TITLE`, the toolbar comment, the Help manual entry and the Help troubleshooting entry
    so none of them claims the old narrower scope.
  - **Wiring trap:** the handlers that deliberately re-render only the table (STAB-3 keeps the
    element under the pointer still) do **not** rebuild the toolbar the button lives in, so each
    MUST call `refreshUndoButton(dsId)` explicitly — decision commit/clear, the Status badge and
    the Diverges tick. Without it Undo works but the button stays grey.
- **Self-tests:** an ordinary decision is undoable; a mixed sequence steps back newest-first, one
  click per edit, to an empty stack; a many-row action costs one entry and restores every row; a
  no-op pushes nothing and preserves the redo branch; an ordinary edit closes an open apply run;
  the cap holds and datasets are independent; the greyed-out tooltip no longer names the bulk modes.
- **Out-of-band:** drive the real DOM (not just the wrapper) for each handler — decision select,
  `✓ Apply all N`, the expander's rationale box, the Status badge both ways, relevance, the Diverges
  tick, a Delete-Mode run and a Custom Security Action add — confirming both the state revert and
  the button/tooltip state. Then re-run in a real browser for the scroll-dependent suites.
