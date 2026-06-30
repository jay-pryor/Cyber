# CH Config Tool — Engineering Task Breakdown (v1.0)

**Companion to:** `android-ch-config-tool-build-spec-v1.0.md` (the *spec*). The spec is normative;
this document decomposes it into **discrete, independently-buildable tasks**. Every "§" reference
points into the spec.

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
- **A-4 No core branching on dataset ids.** No literal `'packages'`/`'settings'`/`'tactical'` outside the Android adapter/platform files (§5.3). Generic code iterates `registry.getActivePlatform().datasets` and reads each adapter's contract.
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

### T2.4 · `android.settings` adapter (parse + decision + columns + completeness)
- **Depends on:** T2.1
- **Spec:** §9 (settings), §6.4, Appendix B (settings)
- **Objective:** `parse`: TSV `namespace<TAB>key<TAB>value`; `namespace ∈ {system,secure,global}`; item key = `namespace/key`; **key segment must match `[A-Za-z0-9._:-]+`** (reject malformed keys at parse); **value is unrestricted**, stored verbatim as `captureValue`. Error on missing/extra fields, unknown namespace, malformed key, duplicate `namespace/key`. `decisionSchema = [{name:'value',kind:'string',required:true},{name:'type',kind:'enum',options:['string','int','float','bool'],required:true}]`. `columns` incl. captureValue. `isComplete`: value present + type ∈ options (and numeric types validate numeric). `validateDecision`: type/value mismatch → issue.
- **Self-tests to add:** D.2 valid across 3 namespaces incl. the adversarial value and an `=` value → correct items with `captureValue` verbatim; malformed (wrong field count; unknown `foo`; key with a space; duplicate) → precise errors.
- **Definition of done:** Parser matches §9; key charset enforced; values preserved byte-exact.

### T2.5 · `android.tactical` adapter (flatten/rebuild + decision + columns + completeness)
- **Depends on:** T2.1, T1.1
- **Spec:** §8.2, §9 (tactical), §6.4, Appendix B (tactical)
- **Objective:** `parse(raw) → ParseResult` with `template`: `JSON.parse` (error on invalid JSON; warn on empty object); **flatten** to one item per leaf (leaf = scalar or whole array); dotted paths with bracketed numeric indices (`radios[0].mode`); record JS type for the decision default; retain full doc as `ParseResult.template`. `decisionSchema = [{name:'value',kind:'value-typed',required:true}]`. `isComplete`: value present and type-consistent. **`rebuildArtifact(template, items) → GeneratedFile`**: deep-clone template, set each decided item's value at its path, serialize via `stableStringify` → `tactical.json`; **MUST preserve untouched keys/types/nesting/arrays**; **preserve booleans/numbers as JSON types, not strings** (type fidelity).
- **Self-tests to add:** D.3 valid (nested + array + boolean) flattens to expected paths/types; **round-trip**: `rebuild(template, itemsFromFlatten)` deep-equals the original template when no decisions change a value; changing one leaf updates only that path; invalid JSON → error.
- **Definition of done:** Flatten/rebuild round-trips; type fidelity holds; paths match §8.2.

### T2.6 · `android-adb` platform profile (assembly; generators stubbed)
- **Depends on:** T2.2, T2.3, T2.4, T2.5
- **Spec:** §5.2, Appendix B (profile)
- **Objective:** Assemble `PlatformProfile{id:'android-adb', label:'Android (ADB)', outputLanguage:'powershell', datasets:[packages,settings,tactical], captureInstructions, scriptPreamble, scriptPostamble}`. `scriptPreamble(ctx)`: PowerShell banner (tool/version/project/device/firmware/UTC), `Set-StrictMode`, ADB-presence check, single target-device guard, transcript start. `scriptPostamble(ctx)`: stop transcript. Register it in `bootstrap` (T-bootstrap is updated incrementally). Adapter generators remain stubs returning `[]`/`''` until Phase 7.
- **Self-tests to add:** profile registers; `getActivePlatform().datasets` lists the three; preamble/postamble are deterministic strings given a fixed `ctx`.
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

### T4.3 · Settings default-drift detection
- **Depends on:** T4.2
- **Spec:** §8.4
- **Objective:** On onboarding, for a settings key already in the register, compare new `captureValue` against prior devices' recorded capture values; if they differ emit an **info** issue (`"secure/foo default differs: 0 on Tab Active 5, 1 on S23"`). Never changes a decision (unified-decision assumption, §8.4).
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
- **Objective:** In the Generate tab, three buttons (Implementation/Verification/Reporting) each independently enabled **iff `deviceReady`**; disabled buttons show the reason ("3 settings undecided"). Buttons are stubbed (no output yet).
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

### T7.2 · Adapter `generateImplementation` (all three Android adapters)
- **Depends on:** T2.2, T2.3, T2.4, T2.5
- **Spec:** §10.1, Appendix B, A-6
- **Objective:** Implement the three generators returning `GeneratedFile[]` (pure):
  - **packages:** `disable` → `pm disable-user --user 0 <pkg>`; `remove` → `pm uninstall --user 0 <pkg>`; `keep` → comment-only no-op. Idempotent, each guarded by a presence check. Tokens are charset-safe (parse-enforced).
  - **settings:** `settings put <ns> <key> <value>` with the value emitted via the **two-layer rule** (`psSingleQuote(... shSingleQuote(value) ...)`); bool normalised to `0`/`1`; numeric validated then quoted.
  - **tactical:** call `rebuildArtifact` → `tactical.json`, **plus** a push-step scaffold containing the stable, greppable `# TODO(tactical-apply): …` block (accepted v1 limitation — does **not** gate readiness/DOD).
- **Self-tests to add:** the adversarial settings value generates an inert literal line; `keep` emits no action; tactical emits deterministic `tactical.json` + the exact TODO marker.
- **Definition of done:** Scripts injection-safe, idempotent, deterministic.

### T7.3 · `App.generate.buildImplementation` (orchestrator + manifest + zip + download)
- **Depends on:** T7.2, T0.9, T0.7, T1.1, T5.1
- **Spec:** §4.2(6), §10.1, §10.4, DOD-7
- **Objective:** `buildImplementation(project, deviceId) → {blob, name, issues}`: gather the device's applicable+complete items per dataset (latest version), call each `adapter.generateImplementation(ctx)`, wrap each script with `scriptPreamble/Postamble`, build `manifest.json` (tool version, project hash, device, firmware, generation UTC from clock, outputs with per-file `sha256`, decision snapshot used), `zip(...)` → one blob, name `<device>-<command>-<UTCstamp>.zip`. UI does the `download`. Aborts a generation with a located issue on failure (§12.2 generation row).
- **Self-tests to add:** under a fixed clock, two builds of the same project+device produce **byte-identical** zips except the manifest timestamp field (excluded from the determinism assert); manifest hashes match file contents.
- **Definition of done:** DOD-7 (determinism) holds; single zip; gated by readiness.

### T7.4 · Verification path (adapter `generateVerification` + `buildVerification`)
- **Depends on:** T7.3
- **Spec:** §10.2, Appendix B
- **Objective:** Adapter `generateVerification`: packages `pm list packages -d/-e` read-back → PASS/FAIL/MISSING; settings `settings get <ns> <key>` read-back compare (normalise bool/int); tactical read-back where exposed else **EVIDENCED**. Header documents exit/report semantics. `generate.buildVerification` mirrors T7.3 (independent command).
- **Self-tests to add:** verification scripts deterministic; settings compare normalises `true`≡`1`.
- **Definition of done:** Independent command; deterministic; DOD-6.

### T7.5 · Reporting path (adapter `renderReportSection` + `buildReport` + ISM coverage)
- **Depends on:** T7.3, T7.1
- **Spec:** §10.3, §10.4, DOD-8
- **Objective:** Each adapter `renderReportSection(items, ctx) → HTML fragment` (packages: pkg/action/ism/rationale table; settings: ns/key/value/ism; tactical: path/value/ism). `generate.buildReport` assembles `wrapReport(...)` + ISM-coverage section (items grouped by ISM ref, sub-grouped by dataset), wraps into a single `.html` file + manifest, zips, one download.
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
- **Objective:** Inline all fixtures D.1–D.5 incl. the **mock platform** (D.4: one text dataset `mock.kv`). The **portability test** registers the mock platform and asserts tables/onboarding/decision-editing/generation work with **zero core edits** (DOD-11). Add determinism tests (serialize×2, zip×2 under fixed clock), round-trip tests, and all §15 edge cases (empty files, duplicate keys, unknown namespace, invalid JSON, nested-array tactical, the adversarial settings value through two-layer escaping, package-named-like-a-setting, cross-device drift, generate-before-complete blocked, re-onboard identical→no-op / differing→new version).
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
               ├─ T2.4 settings ─┤─ T2.6 android-adb profile
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
    - **settings:** reuse `settings.parse(raw)`; map each parsed key → `{key, decision:{value: capturedValue, type:'string'}}`.
      Surface the parser's own errors/warnings.
    - **tactical:** reuse `tactical.parse(raw)`; map each flattened leaf → `{key, decision:{value, type}}`
      preserving JSON types (§8.2). Surface invalid-JSON / non-object-root errors.
  - Keep `parse` (onboarding) untouched. `parseAssignment` is additive.
- **Self-tests to add:** packages CSV — valid (with/without `package:`, a quoted description containing
  a comma) → correct assignments; bad header / invalid action / dup / illegal token → located errors.
  Settings/tactical assignment parse map to `{value,type}` correctly; invalid inputs error.
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
