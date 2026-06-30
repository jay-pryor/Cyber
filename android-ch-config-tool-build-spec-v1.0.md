# CH Config Tool — Engineering Build Specification

**Audience:** an implementing software-engineer agent.
**Goal:** produce a single, self-contained `.html` file that runs the Cyber-Hardening (CH)
configuration-management tool described herein, with no further input than this document.

This spec is normative. Where it says **MUST**, the requirement is binding; **SHOULD** marks a
strong recommendation; **MAY** marks an option. Implement the architecture exactly as specified so
that the modularity guarantees hold; implement module *internals* using the contracts given.

IMPORTANT: Press Control + Shift + V to view this document in fully rendered markdown format.

---

## 0. Table of contents

1. Product summary & definition of done
2. Hard constraints and non-goals
3. Browser environment constraints (`file://`)
4. Architecture overview
5. Modularity model (the core requirement)
6. Data model & schemas
7. Module catalogue & public APIs
8. Key algorithms
9. Input formats & fixtures
10. Output generation
11. UI / UX specification
12. Error-handling specification
13. Coding & documentation standards
14. Single-file assembly & module pattern
15. Testing strategy
16. Build phases (the plan)
17. Appendices (schemas, Android adapters, vendored primitives, fixtures, glossary)

---

## 1. Product summary & definition of done

The tool manages CH **decisions** for a fleet of device configurations and **generates** the files
that implement, verify, and report on those decisions. It is a **pure generator**: it ingests
captured config files, lets a user record decisions once and inherit them across devices, and emits
code/config/report files. It never contacts a device.

### 1.1 Definition of done (acceptance criteria)

The build is complete when all of the following hold, verified against the fixtures in Appendix D:

- **DOD-1** A single `.html` file, opened directly from disk (`file://`) in current Chrome, Edge, and Firefox, runs fully with no console errors and no network requests.
- **DOD-2** A user can load a project file, view three data tables (packages, settings, tactical), search/sort/filter them, and save the project back — losslessly (load→save→load is identity).
- **DOD-3** A user can onboard a device by supplying three input files; the **Onboard** control is disabled until all three are present and parse without errors.
- **DOD-4** Onboarding creates a device configuration, embeds immutable hashed snapshots, inherits all keys already in the register, and appends only genuinely-new keys as `undecided`, ending with a triage summary.
- **DOD-5** Undecided items are visibly flagged; a user can record decisions through controls derived from each dataset's decision schema.
- **DOD-6** Implementation, Verification, and Reporting are **three independent commands**; each is enabled for a device only when every item applicable to that device is complete.
- **DOD-7** Each generator emits a single downloadable `.zip` containing its outputs plus a manifest; regenerating from the same project yields byte-identical outputs (deterministic).
- **DOD-8** The reporting output is a styled `.html` that opens in Microsoft Word as a formatted document (headings, tables, page breaks) suitable for Save-As `.docx`.
- **DOD-9** A device-configuration view shows, read-only, exactly the applicable decided items for one device, in three panels.
- **DOD-10** Malformed inputs and invalid operations produce clear, located, non-fatal error messages; the app never silently fails or silently drops data.
- **DOD-11** Adding a hypothetical fourth dataset or a second platform profile requires **no changes** to core, store, UI shell, diff, completeness, project I/O, or report shell — only a new adapter/profile (demonstrated by the self-test "portability" fixture).
- **DOD-12** Every module file-block carries a header comment; every public function carries JSDoc; the embedded self-test suite passes.

---

## 2. Hard constraints and non-goals

### 2.1 Constraints (MUST)

- **C-1 Single file.** All HTML, CSS, and JS in one `.html`. No external files, no CDN, no build step required to run.
- **C-2 No server, no network.** No `fetch`/`XMLHttpRequest` to any origin. No telemetry.
- **C-3 Plain load/download I/O.** Input via `<input type="file">`; output via `Blob` + object URL + `<a download>`. Do **not** use the File System Access API.
- **C-4 No browser storage as canonical state.** Do not depend on `localStorage`/`IndexedDB` for the source of truth. (A `localStorage` *draft autosave* is permitted as a non-canonical convenience only; see §6.6.)
- **C-5 Vanilla stack.** No framework (React/Vue/etc.). Plain JS (ES2019+), the DOM, and CSS. Vendored primitives (§17.C) are inlined verbatim and clearly fenced.
- **C-6 Deterministic output.** All emitted artifacts and serialized state MUST be byte-stable for identical inputs (stable ordering, fixed formatting, UTC ISO timestamps sourced from a single injectable clock). This explicitly includes the **internal** metadata of binary containers: ZIP entries MUST use a fixed DOS date/time and fixed attribute fields, never wall-clock (see §10.4 and §17.C.3).
- **C-7 Offline integrity.** Hashing and zipping MUST work on `file://` without Web Crypto (see §3).

### 2.2 Non-goals

- Applying changes to devices (the tool only generates the scripts that do).
- Live multi-user editing or merge (single-document, last-write-wins; reconcile via SharePoint version history).
- Authentication, encryption of the project file, or secrets storage (out of scope here).
- Internationalisation (English only).

---

## 3. Browser environment constraints (`file://`)

The app is opened by double-clicking a file. The implementer MUST account for these `file://`
realities or the app will fail when run as intended:

- **No cross-file ES module imports.** `import` from sibling files fails under `file://`. Therefore the app is one file using the IIFE-namespace pattern in §14 — **not** `type="module"` with imports.
- **`crypto.subtle` may be unavailable.** `file://` is not reliably a secure context, so `window.crypto.subtle` can be `undefined`. Hashing MUST use the vendored pure-JS SHA-256 (§17.C). `crypto.getRandomValues` for IDs is available and MAY be used; provide a `Math.random` fallback.
- **`fetch()` of local paths is blocked.** All input arrives through file pickers; never fetch.
- **Downloads work.** `URL.createObjectURL(blob)` + a programmatic `<a download>` click works under `file://`. Some browsers throttle *multiple* rapid downloads — therefore each generator produces exactly **one** `.zip` download (§10.4).
- **`localStorage` origin is unreliable** under `file://` (often the opaque/`null` origin, shared across local files). Honour C-4.
- **Clipboard API may require a gesture/secure context.** Any "copy" affordance MUST degrade gracefully (fallback to a selectable textarea).

Document these in a top-of-file comment so future maintainers don't reintroduce them.

---

## 4. Architecture overview

### 4.1 Layering and dependency rule

```
            ┌─────────────────────────────────────────────┐
   UI shell │ app, router/tabs, tables, device view,       │   (DOM, events)
            │ onboarding, generate panel, error surface     │
            └───────────────┬──────────────────────────────┘
                            │ calls (one direction only)
            ┌───────────────▼──────────────────────────────┐
   Engine   │ store · registry · diff · validation ·        │   (PURE: no DOM, no I/O)
            │ completeness · generate-orchestrator · report │
            └───────────────┬──────────────────────────────┘
                            │ uses
            ┌───────────────▼──────────────────────────────┐
   Adapters │ platform profiles + dataset adapters          │   (PURE)
            └───────────────┬──────────────────────────────┘
                            │ uses
            ┌───────────────▼──────────────────────────────┐
   Util/IO  │ hashing, crc32, zip, csv, dom helpers, clock  │
            └───────────────────────────────────────────────┘
```

**Dependency rule (MUST):** dependencies point downward only. The **engine and adapters contain no
DOM access and no direct I/O** — they are pure functions over plain data, returning plain data.
Only the UI shell and the thin IO helpers touch the DOM, `FileReader`, and downloads. This is what
makes the engine unit-testable in-file and headless-capable.

### 4.2 Data flow (onboarding → generate)

1. UI reads the three picked files to text (IO helper) → hands raw strings to the engine.
2. Engine calls the active platform's dataset adapters to **parse** → `ParseResult`s.
3. Engine **diffs** parsed keys against the register → triage; **mutates** the store (new device config + embedded hashed snapshots + appended undecided items) through a single transactional API.
4. Store emits a change event → UI re-renders tables/summary from store state.
5. User edits decisions → store mutations → completeness recomputed.
6. User invokes a generator → orchestrator gathers the device's applicable+complete items, calls adapter generators + platform preamble/postamble, assembles a manifest, zips, hands the blob to the IO helper to download.

---

## 5. Modularity model (the core requirement)

The single most important design goal: **the generic machinery must not know it is dealing with
Android, packages, settings, tactical JSON, ADB, or PowerShell.** All of that lives behind two
interfaces registered at startup. Porting to a new OS or a new input format means writing new
adapters — never editing core.

### 5.1 `DatasetAdapter`

Defines one *kind* of config data and everything format/platform-specific about it.

```js
/**
 * @typedef {Object} DatasetAdapter
 * @property {string}  id            Globally-unique, namespaced, e.g. 'android.packages'.
 * @property {string}  label         Human label for tabs/reports, e.g. 'Packages'.
 * @property {'text'|'json'} inputKind  How the capture file is read.
 * @property {string}  captureHint   One-line description of how to produce the input file.
 *
 * // ---- parsing ----
 * @property {(raw:string) => ParseResult} parse
 *           Pure. Normalises a raw capture into keyed items + issues (+ template for JSON).
 *
 * // ---- decisions ----
 * @property {DecisionField[]} decisionSchema   Drives the decision editor and validation.
 * @property {(item:RegisterItem) => Issue[]} validateDecision   [] when valid.
 * @property {(item:RegisterItem) => boolean} isComplete         True when decision is sufficient.
 *
 * // ---- table UI (data-driven; no hardcoded columns in the UI) ----
 * @property {ColumnDef[]} columns
 *
 * // ---- generation (pure; return file descriptors, do not write anything) ----
 * @property {(items:RegisterItem[], ctx:DeviceContext) => GeneratedFile[]} generateImplementation
 * @property {(items:RegisterItem[], ctx:DeviceContext) => GeneratedFile[]} generateVerification
 * @property {(items:RegisterItem[], ctx:DeviceContext) => string} renderReportSection  // HTML fragment
 *
 * // ---- optional: artifact rebuild from a retained template (e.g. tactical JSON) ----
 * @property {((template:any, items:RegisterItem[]) => GeneratedFile)} [rebuildArtifact]
 */
```

### 5.2 `PlatformProfile`

A target OS/transport, composed of dataset adapters plus the platform-level output conventions.

```js
/**
 * @typedef {Object} PlatformProfile
 * @property {string} id               e.g. 'android-adb'.
 * @property {string} label            e.g. 'Android (ADB)'.
 * @property {string} outputLanguage   e.g. 'powershell' (informational + comment headers).
 * @property {DatasetAdapter[]} datasets
 * @property {string} captureInstructions   Markdown/plain text shown in the onboarding help.
 * @property {(ctx:DeviceContext) => string} scriptPreamble    Header for impl & verify scripts.
 * @property {(ctx:DeviceContext) => string} scriptPostamble
 */
```

### 5.3 Registry

```js
App.registry.registerPlatform(profile);     // called once per profile at startup
App.registry.listPlatforms();                // → PlatformProfile[]
App.registry.getActivePlatform();            // → PlatformProfile
App.registry.setActivePlatform(id);          // switches UI + engine target
App.registry.getDataset(platformId, dsId);   // → DatasetAdapter
```

The UI builds its tabs, table columns, decision editors, and device-view panels **by iterating the
active platform's `datasets`** and reading each adapter's `columns`/`decisionSchema`. There MUST be
no literal `'packages'`/`'settings'`/`'tactical'` branching anywhere outside the Android adapter
files.

### 5.4 Porting guarantee (how a new OS is added)

To support, say, **Windows registry hardening** or a different Android transport, an implementer:

1. Writes new `DatasetAdapter`s (parse, decisionSchema, columns, generators, report section).
2. Bundles them into a new `PlatformProfile` with its own preamble/postamble and `outputLanguage`.
3. Calls `App.registry.registerPlatform(...)`.

No change to: store, registry, diff, validation, completeness, generate-orchestrator, project I/O,
report shell, error subsystem, or the UI shell. This is asserted by self-test **DOD-11** using a
trivial "mock" platform fixture (Appendix D.4). Treat any need to edit core to add a platform as a
design defect.

---

## 6. Data model & schemas

### 6.1 Project file (canonical state)

One JSON document. Authoritative; lives in SharePoint. Full JSON Schema in Appendix A.

```jsonc
{
  "schemaVersion": 1,
  "platformProfileId": "android-adb",
  "meta": { "createdUtc": "ISO", "modifiedUtc": "ISO", "appVersion": "1.0" },

  "deviceConfigs": [ DeviceConfig, ... ],

  // items grouped by dataset adapter id
  "items": {
    "android.packages": [ RegisterItem, ... ],
    "android.settings": [ RegisterItem, ... ],
    "android.tactical": [ RegisterItem, ... ]
  }
}
```

### 6.2 `DeviceConfig`

```jsonc
{
  "id": "tab-active-5-v2",         // slug, unique per version
  "baseId": "tab-active-5",        // stable identity shared by all versions of one physical device
  "version": 2,                    // integer ≥ 1, monotonically increasing per baseId
  "supersedesId": "tab-active-5",  // id of the prior version this one replaces; null for v1
  "name": "Tab Active 5",
  "model": "SM-X306B",
  "firmware": "X306B...",
  "onboardedUtc": "ISO",
  "snapshots": {
    "android.packages": Snapshot,
    "android.settings": Snapshot,
    "android.tactical": Snapshot
  }
}
```

**Versioning (re-onboard).** A physical device is identified by `baseId` (a slug derived from its
name/model). The **latest** version for a given `baseId` is the one with the highest `version` and
`supersedesId` not referenced by any other config; only the latest is "active" for generation and
the device-configuration view. Superseded versions are retained read-only as history (flagged
"superseded" in the Devices tab). See §8.7 for the re-onboard algorithm and §12.2 for the trigger.

### 6.3 `Snapshot` (immutable, hashed)

```jsonc
{
  "capturedUtc": "ISO",
  "sourceFilename": "pm_list.txt",
  "sha256": "hex",                 // hash of the raw uploaded bytes
  "keys": ["com.x.y", ...],        // sorted; the applicability set
  "values": { "secure/foo": "1" }, // optional per-key capture value (settings drift)
  "template": { ... }              // optional retained source structure (tactical JSON only)
}
```

### 6.4 `RegisterItem`

```jsonc
{
  "key": "secure/location_mode",   // stable identity, unique within its dataset
  "description": "…",              // human-authored, inherited across devices
  "decision": { ... },             // shape defined by the adapter's decisionSchema; null = undecided
  "ismRefs": ["ISM-1234"],
  "rationale": "…",
  "rollback": "…",
  "status": "undecided"            // 'undecided' | 'decided'  (derived, see §6.5)
}
```

Decision shapes per Android adapter (examples):
- packages: `{ "action": "keep" | "disable" | "remove" }`
- settings: `{ "value": "0", "type": "int" }`
- tactical: `{ "value": true, "type": "bool" }`

### 6.5 Status & completeness

- `status` is **derived** by the adapter's `isComplete(item)`; persist it for convenience but recompute on load (never trust a stale stored flag).
- **Item complete** ⇔ `adapter.isComplete(item)` is true. Default rule: a non-null decision whose required `decisionSchema` fields are present and valid. ISM ref / rationale are **encouraged but not blocking by default**; expose a single config flag `REQUIRE_ISM_REF` (default `false`) that, when true, folds "≥1 ISM ref" into completeness. (Implement the flag so the team can tighten traceability without code surgery.)
- **Device ready-to-generate** ⇔ every item *applicable* to that device is complete. *Applicable* ⇔ item.key ∈ the union of that device's snapshot `keys` for that dataset.

### 6.6 Persistence rules

- Canonical state is the downloaded project file. The UI MUST warn (via `beforeunload`) when there are unsaved changes.
- A `localStorage` **draft autosave** MAY be written on a debounce purely as crash insurance; on load, if a draft newer than the opened file exists, offer to restore it. This is never the source of truth and MUST be clearly labelled in the UI when used. (Respect C-4: degrade silently if `localStorage` is unavailable.)
- Serialization MUST be deterministic: keys sorted, arrays sorted by stable key, 2-space indent, `\n` line endings, timestamps from the injected clock.

---

## 7. Module catalogue & public APIs

Each row is one logical module (one `<script>` IIFE, §14). "Pure" modules MUST NOT touch the DOM or
perform I/O. All public functions are documented per §13.

| Namespace | Responsibility | Key public API (abridged) | Pure |
|-----------|----------------|---------------------------|------|
| `App.util.clock` | Single time source (injectable for tests/determinism) | `nowIso()`, `setClock(fn)` | yes |
| `App.util.hash` | SHA-256 (vendored) | `sha256Hex(str) → string` | yes |
| `App.util.crc32` | CRC-32 (vendored, for zip) | `crc32(bytes) → number` | yes |
| `App.util.zip` | Store-only ZIP writer | `zip(files:{name,content}[]) → Blob` | yes |
| `App.util.csv` | CSV export of a table | `toCsv(rows, columns) → string` | yes |
| `App.util.html` | HTML escaping & small builders | `esc(s)`, `attr(s)`, `el(tag, attrs, kids)` | yes |
| `App.util.dom` | DOM helpers (UI only) | `mount`, `clear`, `on`, `download(blob,name)` | no |
| `App.registry` | Platform/adapter registration | see §5.3 | yes |
| `App.store` | In-memory project + mutations + events | see §7.1 | yes* |
| `App.projectIo` | (De)serialize + schema-validate + migrate | `parseProject(text)→Result`, `serializeProject(p)→string` | yes |
| `App.diff` | Triage snapshot vs register | `triage(parsedKeys, registerKeys) → {newKeys, existingKeys}` | yes |
| `App.validation` | Cross-cutting structural checks | `validateProject(p) → Issue[]`, `validateOnboarding(...)→Issue[]` | yes |
| `App.completeness` | Completeness & readiness | `itemComplete(...)`, `deviceReady(project, deviceId) → boolean` | yes |
| `App.generate` | Orchestrate adapter generation + manifest + zip | `buildImplementation(project, deviceId) → {blob,name,issues}` (+ `buildVerification`, `buildReport`) | yes** |
| `App.report` | Platform-agnostic Word-HTML shell | `wrapReport(title, meta, sectionsHtml[]) → string` | yes |
| `App.ui.*` | Views & controllers | mount/render functions | no |

\* `App.store` holds mutable state but exposes mutations as pure transformations + an event emitter; it performs no I/O.
\** `App.generate` returns a `Blob` via the pure zip util; the *download* is done by the UI through `App.util.dom`.

### 7.1 `App.store` API (representative)

```js
App.store.init(project);                         // load a parsed project (or empty())
App.store.empty(platformProfileId);              // → blank project
App.store.getProject();                          // → deep-readonly snapshot
App.store.onChange(handler);                     // subscribe; returns unsubscribe

// Mutations (each returns {ok, issues}; each is a single transaction; each bumps modifiedUtc)
App.store.onboardDevice({name, model, firmware, snapshots, parsed});  // adds device + new items
App.store.setDecision(datasetId, key, decisionPatch);
App.store.setItemFields(datasetId, key, {description?, ismRefs?, rationale?, rollback?});
App.store.removeDevice(deviceId);                // removes device + snapshots; NEVER deletes items (§8.5)
App.store.pruneOrphanedItems();                  // ONLY item-deletion path; explicit+confirmed (§8.5)
App.store.reonboardDevice({baseDeviceId, name, model, firmware, snapshots, parsed});  // → new version (§7/§12.2)

// Queries (selectors; pure, memoise if needed)
App.store.applicableItems(deviceId, datasetId);  // → RegisterItem[]
App.store.undecidedCount(deviceId?);             // overall or per device
```

Mutations MUST validate via the relevant adapter/validation before committing and surface issues
rather than throwing. Never mutate the project object in place from outside the store.

---

## 8. Key algorithms

### 8.1 Triage (diff)

```
triage(parsedKeys: Set, registerKeys: Set):
    newKeys      = parsedKeys − registerKeys      // → appended as undecided items
    existingKeys = parsedKeys ∩ registerKeys      // → inherited silently
    # registerKeys − parsedKeys are simply not applicable to this device; do nothing
```
Onboarding appends `newKeys` as `RegisterItem{decision:null, status:'undecided'}`, carrying the
adapter's default fields. Operates per dataset.

### 8.2 Tactical flatten / rebuild

- **Flatten** (parse): walk the JSON; emit one item per *leaf*. Leaf = a value that is a scalar, or an array (treated whole). Path uses dotted notation; numeric array indices in brackets, e.g. `radios[0].mode`. Record the value's JS type for the decision default. Retain the entire parsed document as `snapshot.template`.
- **Rebuild** (generate): deep-clone the device's `template`; for each decided tactical item applicable to the device, set the value at its path; serialize with stable key order. The rebuild MUST preserve untouched keys, types, nesting, and arrays. Emit as the tactical apply artifact. (Schema stability across firmware is the known risk — see §16 phase notes.)

### 8.3 Completeness & readiness — see §6.5.

### 8.4 Settings default-drift detection

On onboarding a device whose settings snapshot contains a key already in the register, compare the
new `captureValue` with previously recorded capture values from other devices' snapshots. If they
differ, emit an **info** issue ("`secure/foo` default differs: 0 on Tab Active 5, 1 on S23"). This
never changes a decision; it surfaces firmware drift.

**Unified-decision assumption (v1, binding).** A RegisterItem holds exactly **one** decision shared
across *every* device whose snapshot contains that key — there is no per-device decision override in
v1. Drift is informational only. (A future per-device override is explicitly out of scope; do not
build register or generation structures that assume one decision-per-device.)

### 8.5 Item retention

The register is **append-only by default and grows monotonically.** Items are **never auto-deleted**
by any mutation: `store.onboardDevice` only adds, and `store.removeDevice` removes the device config
(and its snapshots) but **leaves every RegisterItem intact** — other devices, including superseded
versions (§7), may rely on them, and the decision history is meant to be durable.

The **only** path that deletes items is an explicit, separate maintenance command,
`store.pruneOrphanedItems()`:
- **Orphan definition:** a RegisterItem whose `key` is not present in *any* snapshot `keys` array of
  *any* remaining DeviceConfig (all versions) for that dataset — i.e. applicable to zero devices.
- **Guarded:** the UI MUST require an explicit confirmation showing the exact count and list of keys
  to be removed before committing; it is never automatic and never runs during onboarding/removal.
- **Logged:** the action appends a summary to the Activity drawer (how many per dataset, which keys).
- **No silent archive in v1:** pruned items are dropped, not stashed. Recovery is via SharePoint
  version history of the project file (§2.2). Document this at the call site.

### 8.6 Deterministic serialization

A single `stableStringify` used for the project file, manifests, and the tactical artifact: object
keys sorted ascending, arrays of items sorted by `key`, 2-space indent, `\n` newlines, no trailing
whitespace. All hashing is computed over these canonical strings (or raw uploaded bytes for
snapshots).

### 8.7 Re-onboard versioning

Onboarding resolves identity by `baseId` (slug of name+model). Behaviour:

```
onboard(parsed, snapshots, name, model, firmware):
    baseId   = slug(name, model)
    existing = latest DeviceConfig with this baseId   // may be none
    if existing is none:
        → create v1: {id: baseId, baseId, version:1, supersedesId:null, …}; triage as §8.1
    else:
        if every dataset's new snapshot.sha256 == existing snapshot.sha256:
            → NO-OP. Emit state info "Re-onboard of <name>: identical snapshots, nothing to do."
              Do not create a version, do not mutate the store.
        else:
            → create a NEW version (do NOT mutate `existing`):
                version      = existing.version + 1
                id           = baseId + '-v' + version      // unique slug
                supersedesId = existing.id
              Embed the new hashed snapshots; run triage (§8.1) of the new snapshot keys against the
              register and append only genuinely-new keys as undecided. `existing` is retained,
              read-only, flagged "superseded".
```

Rationale: a device whose firmware/config drifted gets a fresh, independently-hashed configuration
without destroying the prior record (audit trail), and without touching shared register decisions
(decisions remain unified across all configs — see §6.5 / the unified-decision assumption in §8.4).
Generation, readiness, and the device view operate on the **latest** version only; superseded
versions are visible but inert. Implemented by `store.reonboardDevice` / `store.onboardDevice`
sharing one code path keyed on the identity check above.

---

## 9. Input formats & fixtures

Canonical formats the parsers expect (the capture process, external to this tool, must produce
them). Parsers MUST be tolerant where safe and explicit where not. Full samples in Appendix D.

- **Packages** (`text`): one package per line. Tolerate a leading `package:` and trailing `=path`/installer fields (strip them). Ignore blank lines and `#` comments. Dedupe (warn on duplicates), sort. Error if the file is empty or no line yields a plausible package token.
- **Settings** (`text`): tab-separated `namespace<TAB>key<TAB>value`, one per line; `namespace ∈ {system,secure,global}`. Key = `namespace/key`. The **key segment** (after the namespace) MUST match `[A-Za-z0-9._:-]+`; reject anything else at parse (this keeps the key shell-safe so only the *value* ever needs escaping). The **value** is unrestricted (it may contain spaces, tabs, quotes, `'`, `"`, `$`, `<`, `=`, etc.); store it verbatim as `captureValue` and escape it only at generation time per Appendix B's escaping rule. Error on: missing/extra fields, unknown namespace, malformed key, duplicate `namespace/key`.
- **Tactical** (`json`): a JSON document; flatten per §8.2. Error on invalid JSON. Warn on empty object.

Each parser returns `ParseResult{items, warnings, errors, template?}`. Onboarding is blocked if any
input yields `errors`.

---

## 10. Output generation

Three independent commands. Each is pure up to the final `Blob`; the UI performs the download.

### 10.1 Implementation

For the chosen device, for each dataset, call `adapter.generateImplementation(applicableComplete,
ctx)`. Wrap each script with `platform.scriptPreamble/Postamble(ctx)`. Android specifics in
Appendix B (pm/settings/tactical). Include a generated header comment noting the source project,
device, firmware, generation timestamp, and tool version.

### 10.2 Verification

As above with `generateVerification`. Android verify scripts read state back (`settings get`,
`pm list packages`, tactical read-back where exposed) and emit per-item PASS/FAIL/MISSING, or
EVIDENCED where a value cannot be read back. Specify exit/report semantics in the script header.

### 10.3 Reporting (Word-targeted HTML)

`App.report.wrapReport(title, meta, sections)` produces a complete, self-contained styled HTML
document (inline `<style>`), with: a title block, a metadata table (project, device, firmware,
date, hashes), then one section per dataset from `adapter.renderReportSection(...)`, then an ISM
coverage section (every item grouped by ISM ref, sub-grouped by dataset). Use CSS that Word honours:
real `<table>` with borders, heading styles, and page breaks via `div { page-break-before: always }`
/ `<br style="page-break-before:always">`. The file MUST open in Word as a formatted document.
**All dynamic text MUST pass through `esc()`** to prevent a stray value from corrupting markup.

### 10.4 Bundling & manifest

Each command assembles its `GeneratedFile[]` plus a `manifest.json` (tool version, project hash,
device, firmware, generation UTC, list of outputs with per-file sha256, and the decision snapshot
used) into **one store-only ZIP** (§17.C) and triggers a single download named
`<device>-<command>-<UTCstamp>.zip`. Determinism: identical project + device ⇒ identical zip bytes
(fixed timestamps from the injected clock during tests; in production the manifest timestamp is the
only varying field and is excluded from the determinism self-test).

**ZIP byte-determinism (MUST).** A store-only ZIP still carries per-entry DOS modification
date/time fields in both the local file header and the central directory. These MUST NOT be sourced
from wall-clock — doing so would break DOD-7. The implementer MUST write a **fixed constant** for
every entry:
- DOS time = `0x0000`, DOS date = `0x0021` (i.e. 1980-01-01 00:00:00, the minimum legal DOS value).
- "Version made by"/"version needed", general-purpose bit flag (UTF-8 language-encoding flag set),
  internal/external file attributes, and disk numbers MUST all be fixed constants.
- Entry order MUST be stable (the order in which `GeneratedFile[]` is assembled).
With these fixed, a given `files:{name,content}[]` array always serializes to identical bytes. The
determinism self-test (§15) asserts `zip(files)` byte-equals a second `zip(files)` of the same input.

---

## 11. UI / UX specification

Clean, dependency-free, professional. One page, tabbed. Plain semantic HTML + a small inline CSS
design system (CSS custom properties for colour/spacing/typography; a neutral, high-contrast,
print-friendly palette). No icon fonts/CDNs; use Unicode glyphs or inline SVG sparingly.

### 11.1 Global chrome
- Top bar: project name, dirty-state indicator, **Load project**, **Save project**, **Export CSVs**, active platform selector, **Self-tests** (dev) link.
- Left or top tabs: one **data table tab per dataset** (from the active profile), a **Devices** tab, an **Onboard** tab, a **Generate** tab. A persistent **Activity/Errors** drawer.

### 11.2 Data table tabs (one per dataset, data-driven)
- Columns from `adapter.columns` plus computed **Applies to** (device names whose snapshot has the key) and **Status**.
- Free-text search across key + description; column sort; "Incomplete only" toggle. Undecided rows visually flagged (e.g. left border + badge).
- Inline editing of decision (control rendered from `decisionSchema`: enum→`<select>`; value-typed→value input + type select; bool→toggle), description, ISM refs (tag input), rationale, rollback. Edits commit to the store on change; validation issues shown inline.
- Performant rendering for ~1–2k rows: render via `DocumentFragment`, debounce search (~150 ms), and SHOULD windowed-render if a dataset exceeds a configurable threshold (e.g. 1500 rows).

### 11.3 Devices tab
- List of device configs (name, model, firmware, version, applicable counts, ready/▢ undecided count). Superseded versions (§8.7) are shown grouped under their `baseId` and visibly flagged "superseded" (read-only history); the latest version is the active one.
- Selecting one opens the **device-configuration view**: three **read-only** panels (one per dataset) listing that device's applicable decided items (key, decision, ISM refs). Read-only in v1. Generation acts on the latest version only.

### 11.4 Onboard tab
- Three labelled file slots (per dataset), each showing parse status (✓ N items / ✗ error). The platform's `captureInstructions` shown as help.
- Name/model/firmware fields. **Onboard** button disabled until all three slots parse without errors and a non-empty device name is given. A name+model matching an existing device is **allowed** — it is a re-onboard (§8.7); if so, the UI MUST indicate "this will re-onboard <name> (creates a new version / no-op if unchanged)" before commit. On click: run onboarding/re-onboarding, then show the triage summary (counts of new/existing per dataset, warnings, drift info, and which version was created or that it was an unchanged no-op) and switch focus to the first dataset filtered to "Incomplete only".

### 11.5 Generate tab
- Device selector. Three buttons — **Implementation**, **Verification**, **Reporting** — each independently enabled iff `deviceReady`. Disabled buttons show why ("3 settings undecided"). Clicking produces the single zip download and logs to the Activity drawer.

### 11.6 Activity / Errors drawer
- Append-only, timestamped log of parse results, validations, and generations; errors/warnings styled distinctly; clearable. Nothing fails silently (§12).

### 11.7 Accessibility (SHOULD)
- Semantic landmarks, labelled controls, visible focus, keyboard-operable tabs/tables, colour not the sole signal (pair with text/badges), sufficient contrast.

---

## 12. Error-handling specification

### 12.1 Result pattern
Engine functions return values or `{ ok:boolean, value?, issues:Issue[] }`; they do **not** throw for
expected conditions. Reserve exceptions for programmer errors (caught at the UI boundary and logged
to the drawer with a generic "unexpected error" plus the message — never a blank failure).

`Issue` shape per §5/Appendix A: `{category, severity, message, location?, fix?}`.

### 12.2 Categories & handling

| Category | Examples | Severity | Effect |
|----------|----------|----------|--------|
| parse | empty file, wrong file in slot, invalid JSON, settings line malformed | error | blocks onboarding; shown on the slot |
| validation | duplicate key, unknown namespace, decision type mismatch, bad ISM ref format | error/warning | blocks commit (error) or annotates (warning) |
| state | no project loaded; empty/blank device name | error | blocks the action |
| state | re-onboard with **identical** snapshot hashes | info | no-op; logs "nothing to do" (§8.7) |
| state | re-onboard with **differing** snapshot hashes | info | creates a new device version, not an error (§8.7) |
| completeness | generate attempted with undecided applicable items | (prevented) | buttons disabled with reason |
| generation | tactical template missing, value un-serialisable at path | error | aborts that generation, reports which item |

Every blocking error states **what**, **where**, and a **suggested fix**. A clean run still emits a
positive confirmation (e.g. "Onboarded S23: 9 new, 371 inherited, 0 errors").

---

## 13. Coding & documentation standards

The user requires comprehensively commented code. These are binding.

### 13.1 File / module header (every `<script>` module)
```js
/* =============================================================================
 * MODULE: App.<namespace>
 * PURPOSE: <one-paragraph what & why>
 * PURITY:  <pure | UI/DOM | IO>  — state the constraint explicitly.
 * DEPENDS: <list of App.* namespaces it uses>
 * INVARIANTS: <key guarantees this module upholds>
 * ============================================================================= */
```

### 13.2 Function documentation
Every public function (and any non-trivial private one) carries JSDoc: summary, `@param` with
types, `@returns`, `@throws` (if any), and a short `@example` for engine functions. Use the typedefs
from §5/§6 as the type vocabulary (declare them once in a `types` module).

### 13.3 Inline comments
Comment the **why**, not the **what**. Document each non-obvious decision, every invariant relied
upon, and every `file://`/Word/determinism workaround at its site. Mark vendored code with clear
`BEGIN/END VENDORED` banners and provenance. No commented-out dead code.

### 13.4 Conventions
- Naming: `camelCase` functions/vars, `PascalCase` typedefs, `SCREAMING_SNAKE` consts. Adapter ids namespaced (`android.packages`).
- Immutability: treat project state as immutable outside the store; mutations return new objects.
- Output safety: **all** user/data-derived text written into HTML goes through `esc()`; all text written into generated scripts is escaped/quoted per the target language by the adapter.
- Determinism: no `Date.now()`/`Math.random()` in engine paths except via `App.util.clock` and an injectable id generator.
- Size: keep functions focused; prefer many small pure functions. No module may reach into another's internals — only its published API.

---

## 14. Single-file assembly & module pattern

Because cross-file ES imports fail under `file://`, the app is one HTML file containing ordered
classic `<script>` blocks, each an IIFE that attaches to a single global namespace object. No
bundler required; the "modules" are conceptual and physically separated by banners.

```html
<script>
/* App namespace root */ var App = window.App || {};
</script>

<script>
/* MODULE: App.util.html ... */
(function (App) {
  'use strict';
  function esc(s) { /* ... */ }
  App.util = App.util || {};
  App.util.html = { esc, /* ... */ };
})(App);
</script>

<!-- ...further modules in dependency order... -->

<script>
/* MODULE: App.bootstrap — register platforms, mount UI -- LAST */
(function (App) {
  'use strict';
  App.registry.registerPlatform(App.platforms.androidAdb);
  App.ui.app.mount(document.getElementById('root'));
})(App);
</script>
```

**Load order (MUST)**: `types` → `util.*` → `registry` → `projectIo` → `store` → `diff` →
`validation` → `completeness` → `report` → `generate` → `adapters (android.*)` → `platform
(android-adb)` → `ui.*` → `bootstrap`. Adapters depend only on `util`/`types`. If a future build
step is adopted, each module maps 1:1 to a source file and is concatenated in this order — keep the
boundaries clean to preserve that seam.

---

## 15. Testing strategy

No external test runner is available, so embed one.

- **`App.test` harness:** tiny `assert`, `assertEqual` (deep), `assertDeepEqual`, and a `suite/test` registrar. A `#selftest` URL hash (or a dev-panel button) runs all suites and renders pass/fail with diffs. MUST NOT run in normal use.
- **Coverage targets:** every pure engine function and every adapter `parse`/`generate*`/`isComplete`. Include determinism tests (serialize×2 equal; zip×2 equal under fixed clock), round-trip tests (project load→save→load identity), and the **portability test** (register the mock platform from Appendix D.4 and assert tables/onboarding/generation work with zero core edits — guards DOD-11).
- **Fixtures:** Appendix D — valid + malformed inputs for each dataset, a two-device sample project, and the mock platform. Edge cases to cover: empty files, duplicate keys, unknown namespace, invalid JSON, tactical with nested arrays, a value containing tabs/quotes/`<`/`=`, a package named like a setting, default drift across two devices, generate-before-complete (blocked), re-onboarding the same device (identical hashes → no-op; differing hashes → new version supersedes prior), the adversarial settings value `a'b"c$(whoami)` d;e` round-tripping through the two-layer shell escaping (Appendix B), and `zip(files)` byte-equality across two calls.

---

## 16. Build phases (the plan)

Each phase is independently demonstrable and ends with the listed acceptance test. Implement in
order; do not start a phase before its predecessor's acceptance passes.

**Phase 0 — Skeleton & conventions.** HTML scaffold; `App` namespace; module load order; `types`;
`util.clock/html/dom/csv`; vendored `hash`, `crc32`, `zip` (Appendix C); `App.test` harness; doc
standards in place. *Accept:* page loads with no errors; self-test harness runs an example passing
suite; `sha256Hex` and `zip` self-tests pass on `file://`.

**Phase 1 — Data model & project I/O.** Typedefs; `projectIo.parse/serialize` with schema validation
(Appendix A) + `migrate(v→v)`; `store` with `empty/init/getProject/onChange` and `stableStringify`;
CSV export. *Accept:* load/save round-trips the Appendix D sample losslessly; malformed project
reports located issues.

**Phase 2 — Adapter framework & Android adapters.** `registry`; `DatasetAdapter`/`PlatformProfile`
contracts; implement `android.packages`, `android.settings`, `android.tactical` (**parse +
decisionSchema + columns + isComplete + validateDecision** first); assemble + register the
`android-adb` profile (generators stubbed). *Accept:* parser unit tests pass on valid + malformed
fixtures producing correct items/warnings/errors; tactical flatten/rebuild round-trips.

**Phase 3 — Read-only tables (data-driven).** Tabs/columns generated from the active profile; render
a loaded project; search/sort/incomplete-filter; HTML-escaped cells; performance pass. *Accept:*
tables render the sample; search/sort/filter correct; 1.5k-row fixture renders responsively.

**Phase 4 — Onboarding & triage.** File slots + `FileReader`; gated Onboard; `diff.triage`; snapshot
embedding + hashing; `store.onboardDevice`; append undecided; triage summary; drift info;
validation surfacing; re-onboard versioning (§8.7). *Accept:* onboarding device #2 inherits common
keys and flags only new ones; invalid inputs reported; re-onboarding the same device with identical
hashes is a logged no-op, and with differing hashes creates a new version (`-v2`) that supersedes
the prior (prior retained read-only) while leaving register decisions untouched.

**Phase 5 — Decision editing & gating.** `decisionSchema`-driven editors; commit to store;
`completeness`/`deviceReady`; incomplete flags; generate-gating wired (buttons stubbed). *Accept:*
deciding all applicable items flips a device to ready; generate buttons enable/disable with correct
reasons.

**Phase 6 — Device view.** Read-only per-device panels from `applicableItems`. *Accept:* panels show
exactly the applicable decided items per dataset.

**Phase 7 — Generators.** Implement `generate.buildImplementation`, then `buildVerification`
(independent), then `buildReport` (Word-HTML shell + adapter sections + ISM coverage); manifests +
hashes + store-only zip + single download. *Accept:* each command emits a valid zip; outputs
deterministic under fixed clock; report opens in Word as a formatted document (manual check noted in
README comment).

**Phase 8 — Hardening & polish.** Complete error surface; accessibility pass; `beforeunload` dirty
guard; optional `localStorage` draft; in-app help (capture instructions, "how state/saving works");
full self-test suite incl. portability test; final pass against the §1.1 checklist. *Accept:* all
DOD items verified.

---

## 17. Appendices

### Appendix A — Project JSON Schema (authoritative)

Provide a JSON-Schema-style definition the implementer encodes in `projectIo` validation. Required
top-level: `schemaVersion` (const 1), `platformProfileId` (string, must be a registered platform),
`meta` (object: `createdUtc`,`modifiedUtc` ISO date-time; `appVersion` string), `deviceConfigs`
(array of DeviceConfig), `items` (object whose keys are dataset ids of the active platform, values
arrays of RegisterItem). DeviceConfig requires `id`(slug, unique),`baseId`(slug),`version`(integer
≥1),`supersedesId`(slug|null),`name`,`model`,`firmware`,`onboardedUtc`,
`snapshots`(object keyed by dataset id → Snapshot). Validation MUST check version integrity: per
`baseId`, versions are a contiguous `1..n` chain where each non-v1 config's `supersedesId` references
the immediately prior version's `id`, and exactly one config per `baseId` is the latest (unreferenced
by any `supersedesId`). Snapshot requires
`capturedUtc`,`sourceFilename`,`sha256`(hex 64),`keys`(string[] unique sorted); optional
`values`(object),`template`(any). RegisterItem requires `key`,`decision`(object|null),`ismRefs`
(string[]),`status`(enum), optional `description`,`rationale`,`rollback`. Reject unknown top-level
keys; report each violation as a located `Issue`. Implement `migrate(project)` switching on
`schemaVersion` for forward compatibility (currently identity for v1).

### Appendix B — Android (ADB) platform & adapters (reference implementation)

`PlatformProfile{ id:'android-adb', label:'Android (ADB)', outputLanguage:'powershell' }`.
`scriptPreamble` emits a PowerShell header: tool/version/project/device/firmware/UTC banner,
`Set-StrictMode`, an ADB-presence check, a single target-device guard, and transcript start;
`scriptPostamble` stops the transcript. `captureInstructions` documents the three captures and the
required normalised formats (§9).

**Shell-safe value emission (MUST — injection-safety contract).** Generated PowerShell drives the
device through `adb -s $Serial shell …`, so every emitted value crosses **two** parsers: the
host **PowerShell** parser and the on-device **POSIX shell** (`/system/bin/sh`). Adapters MUST quote
through both layers using these two pure helpers (define once in the Android adapter file, document
with JSDoc, cover with self-tests):

```js
// PowerShell single-quoted literal: wrap in ' … ', double every embedded single quote.
function psSingleQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

// POSIX-shell single-quoted literal: wrap in ' … ', replace every embedded ' with '\'' .
function shSingleQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
```

Emission rule for any data-derived value `v` sent to the device shell:
1. Build the **device-side command string** with the value POSIX-quoted, e.g.
   `settings put secure foo ` + `shSingleQuote(v)`.
2. Pass that whole device-side string to `adb … shell` as a **single PowerShell argument** by
   wrapping it with `psSingleQuote(...)`, so PowerShell performs no further word-splitting or
   expansion. Never interpolate a raw value into a double-quoted PowerShell string.

This makes the two helpers total over arbitrary bytes: a value containing `'`, `"`, `$`, spaces,
tabs, `;`, `&&`, `$(...)`, or backticks is rendered as inert literal text on both sides. Keys and
package tokens are charset-restricted at parse (§9, below) so they need no escaping; **only values
do**. Self-tests MUST include the adversarial value `a'b"c$(whoami)` d;e` and assert the generated
line, when conceptually unwrapped one layer at a time, yields exactly that literal string.

**`android.packages`** — inputKind `text`. parse per §9. decisionSchema:
`[{name:'action',kind:'enum',options:['keep','disable','remove'],required:true}]`. columns: key,
description, decision(action), appliesTo, ism, status. isComplete: action ∈ options.
generateImplementation: for `disable` → `adb -s $Serial shell pm disable-user --user 0 <pkg>`; for
`remove` → `adb -s $Serial shell pm uninstall --user 0 <pkg>`; `keep` → no-op (comment only). Guard
each with a presence check; idempotent. generateVerification: `pm list packages -d`/`-e` read-back,
compare, emit PASS/FAIL/MISSING. renderReportSection: a table of pkg/action/ism/rationale.
**Quoting:** package tokens are restricted to `[A-Za-z0-9._]`; reject anything else at parse to keep
shell generation injection-safe.

**`android.settings`** — inputKind `text`, parse per §9, key `namespace/key`, store `captureValue`.
decisionSchema: `[{name:'value',kind:'string',required:true},{name:'type',kind:'enum',options:
['string','int','float','bool'],required:true}]`. generateImplementation: `adb -s $Serial shell
settings put <namespace> <key> <value>` where `<value>` is emitted through the two-layer
shell-safe rule above (`psSingleQuote(... + shSingleQuote(value))`); `bool` is normalised to `0`/`1`
and `int`/`float` validated numeric before quoting, but **all** values are still quoted (a numeric
value is just a quoted literal the device accepts). generateVerification: `settings get <namespace>
<key>` read-back and compare, normalising bool/int (`true`≡`1`, `false`≡`0`; trim whitespace).
Reject keys/namespaces outside the allowed charset/set at parse (§9); never rely on the value being
"clean" — always escape.

**`android.tactical`** — inputKind `json`, flatten per §8.2, retain template. decisionSchema:
`[{name:'value',kind:'value-typed',required:true}]` (editor adapts to the leaf's JS type;
default from the captured value). generateImplementation/rebuildArtifact: deep-clone the device's
tactical template, apply decided values at their paths (§8.2), serialize deterministically →
`tactical.json` plus a PowerShell push step. **Accepted v1 limitation (binding):** the on-device
apply mechanism is device-specific and is intentionally left as a single, clearly-marked
`# TODO(tactical-apply): …` block in the generated script for v1. This is *not* a defect and does
**not** gate completeness, readiness, or any DOD item: the tactical generator is considered complete
for v1 when it (a) deterministically rebuilds and emits a correct `tactical.json` artifact, and
(b) emits the push-step scaffold with the TODO marker and a comment explaining what a maintainer
must fill in. The TODO marker text MUST be stable (so determinism holds) and MUST be greppable.
generateVerification: read-back where exposed else mark EVIDENCED. renderReportSection:
path/value/ism table. **Type fidelity:** preserve booleans/numbers as JSON types, not strings.

> The Android specifics live entirely in this appendix's adapters. The rest of the app is platform-blind.

### Appendix C — Vendored primitives (inline, fenced with provenance)

The implementer MUST inline, with `BEGIN/END VENDORED` banners and source attribution:
1. **SHA-256** — a compact, dependency-free, public-domain/MIT JS implementation operating on UTF-8 strings/bytes (required because Web Crypto may be absent on `file://`).
2. **CRC-32** — standard table-based implementation (for ZIP entries).
3. **Store-only ZIP writer** — builds a valid ZIP using *stored* (no compression) entries: per-file local file header + data, followed by the central directory and end-of-central-directory record; CRC-32, compressed size = uncompressed size, sizes/offsets little-endian, UTF-8 filenames (set the language-encoding flag). Output a single `Blob` (`application/zip`). Keep entry order stable for determinism. **All DOS date/time fields MUST be the fixed constant `time=0x0000, date=0x0021` (1980-01-01), and all version/attribute fields fixed constants, per §10.4 — never wall-clock — so the writer is a pure function of its input and `zip(files)` is byte-reproducible.** (May instead inline a minimal MIT-licensed zip lib, provided it runs offline, store-only, and emits fixed timestamps; hand-rolled is preferred to minimise footprint.)

### Appendix D — Fixtures

Provide, as inline test data:
- **D.1 packages** — valid list (with a `package:` prefix and a duplicate to dedupe) + malformed (empty; a line with a space).
- **D.2 settings** — valid TSV across all three namespaces, including the adversarial value `a'b"c$(whoami)` d;e` (single quote, double quote, command-substitution, backtick, space, `;`) plus one value with `=`, to exercise the two-layer escaping (Appendix B) + malformed (wrong field count; unknown namespace `foo`; malformed key with a space; duplicate key).
- **D.3 tactical** — valid nested JSON incl. an array and a boolean + malformed (invalid JSON).
- **D.4 mock platform** — a trivial `PlatformProfile` with one text dataset (`mock.kv`, key=`k`, decision=`{value}`) used solely by the portability self-test to prove core needs no edits to host a new platform.
- **D.5 sample project** — two devices (Tab Active 5, S23) sharing most keys, with a handful of S23-only keys and one cross-device settings default-drift, to exercise inheritance, triage, drift, and readiness.

### Appendix E — Glossary

Register (the shared decision store), Decision vs Applicability (§5/§6), Snapshot, Dataset adapter,
Platform profile, Item, Complete/Ready, EVIDENCED (applied but not machine-verifiable), Drift
(changed default across firmware), Triage (the new/existing/not-applicable split), Control (a named
requirement an item satisfies — §18.3), Assignment (setting a device's decisions in bulk from files —
§18.2).

---

# 18. v1.1 feature set (addendum to the v1.0 spec)

This section is **normative** and extends the v1.0 spec. It adds three features requested in review:
a dark-mode UI theme (§18.1), a bulk "set decisions from existing files" workflow (§18.2), and a
**Control Manager** with first-class control references (§18.3). It also raises the project
`schemaVersion` to **2** (§18.3) with a forward migration.

All **hard constraints (§2.1)**, the **modularity model (§5)**, the **purity boundary (§4.1)**, and
**determinism (§6 C-6, §8.6, §10.4)** continue to bind. New format/dataset-specific behaviour MUST
live behind the adapter/platform interfaces (§5) — no new dataset-id branching in core (§5.3).

### 18.1 Dark-mode theme (UI only)

- **DM-1 (MUST)** A theme toggle in the top bar (§11.1) switches the **entire app UI** between a
  light and a dark palette. Implementation MUST be driven by the existing CSS custom properties: a
  `[data-theme="dark"]` selector on the root element re-defines the palette variables only — no
  per-component restyle, no second stylesheet.
- **DM-2 (SHOULD)** On first load the theme follows the OS preference (`prefers-color-scheme`). The
  user's explicit choice persists across loads in `localStorage` (non-canonical; honour **C-4** —
  wrap all access and degrade silently if unavailable).
- **DM-3 (MUST)** The theme is **UI-only**. It MUST NOT affect any generated artifact (report HTML,
  scripts, manifests, zips) or any serialized state — determinism (**C-6**, **DOD-7**) is unchanged.
  The report's own inline `<style>` (§10.3) is independent of the app theme.
- **DM-4 (SHOULD)** The dark palette MUST keep sufficient contrast (§11.7); the toggle is a labelled
  control exposing pressed state (`aria-pressed`). Colour is never the sole status signal (§11.7).

### 18.2 Set decisions from existing files (bulk assignment)

A workflow, **distinct from onboarding**, to set a device configuration's decisions in bulk from an
uploaded set of files. Onboarding (§8.1, §11.4) is unchanged: it still only embeds snapshots and
appends genuinely-new keys as `undecided`. This workflow operates **after** a device exists.

- **ASG-1 (MUST)** From the device-configuration view (§11.3, Devices tab), for the **latest** version
  of the selected device, provide **three independent controls — one per dataset** (packages,
  settings, tactical) — each accepting one input file and applying it to that device's decisions for
  that dataset only.
- **ASG-2 (MUST — exact-set validation, before any mutation).** The set of keys present in the input
  file MUST be **exactly equal** to the set of keys *applicable* to that device for that dataset
  (*applicable* = union of that device's snapshot `keys` for the dataset, §6.5). If they differ, the
  operation is **REFUSED with no mutation**, and the UI lists the deltas: keys *missing* from the file
  (applicable but absent) and keys *extra* in the file (present but not applicable). No partial apply.
- **ASG-3 (MUST — format validation, before any mutation).** Each input is parsed and validated
  first; malformed input (bad header/JSON, invalid action, malformed/duplicate/charset-invalid keys)
  REFUSES the operation with **located** error issues (§12, DOD-10). Nothing fails silently.
- **ASG-4 — input formats:**
  - **Settings:** the §9 settings capture format (sectioned `<namespace>:` + `key=value`). Each
    decision is set to `{value: <file value, verbatim>, type: 'string'}`. (All values are quoted at
    generation regardless of type; the operator MAY refine a value's type later in the Settings tab.)
  - **Tactical:** the §9 tactical JSON. Each decision is set to `{value, type}` from the corresponding
    flattened leaf (§8.2) — JSON types preserved.
  - **Packages:** a **CSV** whose header row is exactly `package,action,description`. Column 1 is the
    package name and MUST tolerate an optional leading `package:` prefix; column 2 is the action
    `keep|disable|remove`; column 3 is a free-text description (RFC-4180 quoting — may be quoted and
    contain commas). The decision is `{action}`; the item's `description` is set from column 3.
    Package tokens remain charset-restricted (§9 / Appendix B) — reject others.
- **ASG-5 (MUST)** On success, update — in **one transaction** — the register decisions for exactly
  the device's applicable keys (and, for packages, the item descriptions), recompute completeness
  (§6.5), bump `meta.modifiedUtc`, emit a change, and log a summary to the Activity drawer.
- **ASG-6 (MUST — data-driven, A-4 / §5.3).** Format knowledge stays in the adapter. Each
  `DatasetAdapter` MAY implement:
  - `assignmentHint: string` — a one-line description of the accepted file format (shown in the UI).
  - `parseAssignment(raw) → {assignments:[{key, decision, fields?}], warnings:Issue[], errors:Issue[]}`
    — parse the assignment file into per-key decisions (`fields` carries non-decision item fields such
    as `{description}` for packages). The **generic** engine performs the §ASG-2 exact-set validation
    and the transactional apply; it never branches on dataset id.
  - An adapter without `parseAssignment` simply offers no bulk-assignment control for its dataset.
- **ASG-7 — unified-decision consequence (binding).** Per the v1 unified-decision assumption (§8.4),
  a key carries **one** decision shared by every device that has it. Applying from a device's files
  therefore updates the **shared** decisions for that device's applicable keys, which may also apply
  to other devices. This is intended; §ASG-2 guarantees the affected set is exactly the device's
  applicable keys. The UI SHOULD note this where the workflow is invoked. (A future per-device
  override remains out of scope, §8.4.)
- **ASG-8 (MUST)** The device-configuration panels remain read-only displays (§11.3, DOD-9); the
  assignment controls are a separate, clearly-labelled affordance with their input-format help shown
  inline (the packages CSV format MUST be explained there).

### 18.3 Control Manager & control references (schemaVersion 2)

Replaces free-text `ismRefs` with first-class **controls** managed in a dedicated tab, and bumps the
project schema to **version 2**.

- **CTL-1 — `Control` entity.** A new top-level project array `controls: [Control, …]` where
  ```jsonc
  Control = {
    "id":   "slug",                 // stable, unique within the project
    "title":"Disable Bluetooth",    // human label, shown everywhere a ref is displayed
    "type": "ISM",                  // seeded options: "ISM" | "AHG" | "Custom" (extensible list)
    "description":"…",
    "assignedDeviceIds":["tab-active-5"]   // device baseIds this control applies to (stable identity)
  }
  ```
  The **type** option list is a seeded constant (`['ISM','AHG','Custom']`) so the team can extend it
  without touching control logic. `assignedDeviceIds` reference device `baseId`s (so an assignment
  survives re-onboard versioning, §8.7); the UI displays them by device name.
- **CTL-2 — `RegisterItem.controlRefs`.** Rename `ismRefs` → **`controlRefs`**: an array of `Control`
  `id`s (no longer free text). All references MUST point to an existing control; a dangling ref is a
  validation error (Appendix A), auto-pruned on load with a logged warning.
- **CTL-3 — `schemaVersion: 2` + migration.** Bump the project `schemaVersion` to `2`. `projectIo.migrate`
  MUST convert v1 → v2 **losslessly**: create `controls: []` if absent; for each item's legacy
  `ismRefs` string, *find-or-create* a control (match by title; `type` inferred — prefix `ISM`→`ISM`,
  `AHG`→`AHG`, else `Custom`; empty description; empty `assignedDeviceIds`) and replace the item's
  refs with `controlRefs` of those control ids. `migrate(v2)` is identity. Reject unknown
  `schemaVersion` with a located issue (§17.A).
- **CTL-4 — Control Manager tab.** A new tab lists every control (title, type, description, assigned
  device count) and supports **add / edit / remove**. Editing exposes title, a type `<select>` seeded
  per CTL-1, description, and a multi-select of device configurations (by name). Its purpose is to
  view and manage the control catalogue; it does **not** assign decisions.
- **CTL-5 — Control refs in the data tabs.** Decision↔control assignment stays in the data-table tabs
  (§11.2). The former "ISM Refs" column **and** editor are renamed **"Control Refs"**. The editor is
  no longer a free-text box: it is a **multi-select search** over the control catalogue (search by
  title/type, select one or more); the column renders the **titles** of the referenced controls.
- **CTL-6 — store CRUD.** `store.addControl`, `updateControl`, `removeControl` (transactional, §7.1).
  `removeControl` MUST strip the removed id from every item's `controlRefs` and log the change.
  `setItemFields` accepts `controlRefs` (replacing the old `ismRefs`).
- **CTL-7 — Report.** The "ISM coverage" section (§10.3) becomes **"Control coverage"**: items grouped
  by control (shown as `title` + `type`), sub-grouped by dataset. Items referencing no control fall
  under a "(no control)" group.
- **CTL-8 — Completeness flag.** Rename the `REQUIRE_ISM_REF` flag (§6.5) to **`REQUIRE_CONTROL_REF`**
  (semantics unchanged: when `true`, completeness also requires ≥1 control ref). Keep it a single
  config switch (no code surgery to toggle).
- **CTL-9 (MUST — portability/DOD-11).** None of the above may require edits to the generic store/
  registry/diff/completeness/generate/report internals beyond the documented `controls`/`controlRefs`
  data-model additions; per-platform behaviour is untouched. The portability self-test (§15, DOD-11)
  MUST still pass with the mock platform.

### 18.4 Amendments to v1.0 clauses (quick index)

- §6.1 project file: add top-level `controls` array; `schemaVersion` const becomes `2`.
- §6.4 RegisterItem: `ismRefs` → `controlRefs` (array of control ids).
- §6.5: `REQUIRE_ISM_REF` → `REQUIRE_CONTROL_REF`.
- §7.1 store API: add `addControl/updateControl/removeControl`, `applyDeviceAssignment`; `setItemFields`
  takes `controlRefs`.
- §10.3 report: "ISM coverage" → "Control coverage".
- §11.1: add the dark-mode toggle. §11.2: rename ISM Refs → Control Refs (multi-select search).
  §11.3: add the three "set from files" controls. Add a **Control Manager** tab.
- §17.A schema: validate `controls`, `controlRefs` reference integrity, `schemaVersion === 2`.
- §5.1 DatasetAdapter: add optional `assignmentHint` and `parseAssignment` members.

### 18.5 Review-3 amendments (v1.1)

- **RV3-1 Generate as .txt.** The Generate tab MUST offer a checkbox to emit script files with a
  `.txt` extension instead of the platform `scriptExtension` (e.g. `.ps1`). Wrapping (preamble/
  postamble) is decided on the ORIGINAL extension first so the script body is unchanged; only the
  filename changes. Data files (e.g. `tactical.json`) are unaffected. The manifest reflects the
  emitted names. Determinism (DOD-7) holds for a given option value.
- **RV3-2 No tactical type control.** The tactical decision is `{value}` only — no user-facing value-
  type control. JSON-type fidelity is preserved by coercing the edited value to the CAPTURED leaf's JS
  type (carried as `data-vtype`). (Settings likewise carries no type — §review-2.)
- **RV3-3 `policyList` semantics (binding).** A tactical array named `policyList` whose elements are
  `{name, checked}` objects MUST flatten to one leaf per policy keyed by the policy **name** and
  valued by **checked**, NOT to `policyList[i].checked`/`[i].name`. Rebuild MUST set the matching
  policy's `checked` by name, preserving array order and any other fields. Round-trip identity holds.
  (The `policyList.` prefix is the STORED key; **RV4-1** strips it for display only — e.g. the user
  sees `Disable Bluetooth`, the stored/routed key stays `policyList.Disable Bluetooth`.)
- **RV3-4 Rationale preset.** The item detail editor MUST provide a button beside the rationale field
  that fills it with exactly `"Not required for device use-case."`.
- **RV3-5 Control types (`controlTypes`).** The Control Manager MUST allow adding control types
  manually. The project MAY carry an optional top-level `controlTypes: string[]`. The set of selectable
  types = seed `['ISM','AHG','Custom']` ∪ `controlTypes` ∪ types in use. (Optional/additive — no schema
  version bump.)
- **RV3-6 Import controls CSV.** The Control Manager MUST import controls from a CSV whose header is
  exactly `title,type,description`; otherwise it REFUSES with a located error. Unknown types are
  auto-registered (RV3-5).
- **RV3-7 Device-detail search.** The device-configuration view MUST provide a search box that filters
  the three read-only panels (by key / decision / control titles / description). Read-only (DOD-9)
  is unchanged.

### 18.6 Review-4 amendments (v1.1)

- **RV4-1 `policyList` names display without the prefix.** Tactical `policyList` policies (RV3-3) MUST
  be shown by the policy **name alone** — the `policyList.` (or nested `…policyList.`) segment is
  stripped for **display** (e.g. `Disable Bluetooth`, not `policyList.Disable Bluetooth`). The
  STORED/routed item key KEEPS the `policyList.` segment (it is the stable internal identity), so
  `flattenTactical`/`rebuildTacticalDoc` are unchanged from RV3-3 and already-saved projects keep
  routing. Stripping is purely cosmetic, via `tactical.displayKey(key)` (= module helper
  `stripPolicyPrefix`), applied at every key-display site: the tactical data-table "Path" column, the
  device-view panels, the report's per-dataset section, and the report's Control-coverage list. This
  avoids both collisions with sibling keys of the same name and any need to migrate persisted keys.
  Round-trip identity and byte-determinism (DOD-7) are unchanged.
- **RV4-2 Incomplete-only defaults OFF.** The data-table "Incomplete only" filter MUST default to
  **unticked**, including immediately after onboarding (which now focuses the first dataset WITHOUT
  forcing the filter on). Users may still toggle it on per dataset; the toggle state persists in UI
  state only (never in the project file).
- **RV4-3 Control Manager tools placement.** The "Add type" and "Import controls (CSV)" tools MUST sit
  to the **right of the "Control Manager" title** (a header row), not stacked beneath it.
- **RV4-4 Control Manager as a searchable table.** The Control Manager MUST present controls as a
  **table** (not stacked cards), mirroring the data tables (§11.2):
  - One **row per control** with Title and Type editable inline and an **Applies-to** and a
    **Description** column; the Description column MUST be wide enough and **wrap** long text.
  - A **per-row expander/dropdown** (like the data tables) that reveals the editable, full-width
    **wrapping description** `textarea`, the device-assignment multi-select, and the **Remove** button —
    i.e. the Remove action lives **inside the dropdown**, not on the row.
  - A **search/filter** box (filtering by title/type/description) consistent with the other tables; it
    re-renders only the table body so the box keeps focus, and shows an "N of M shown" count.

### 18.7 Review-5 amendments (v1.1)

- **RV5-1 Per-control device view (device-configuration view).** In the Devices-tab device-configuration
  view (§11.3):
  - The three read-only dataset panels (packages/settings/tactical) MUST be individually **collapsible**
    (a header toggle per panel; default expanded). Toggling re-renders only the panels.
  - The **"Control Refs" column MUST be removed from these panels** (in this view only) — the
    item↔control linkage is surfaced by the new control section below instead. The data-table tabs
    (§11.2) keep their Control Refs column.
  - A new **"Controls applying to this device"** section MUST list every control whose
    `assignedDeviceIds` includes the device's `baseId` (CTL-1). Each control is a clickable item showing
    its title, type, and the count of applicable-and-referencing items.
  - Clicking a control MUST open a **modal/pop-up** (closable via an **×** button in the corner and via a
    backdrop click) that lists, per dataset, exactly the items **applicable to this device AND referencing
    that control** (key, decision, status). Intent: show precisely what is done to satisfy a specific
    control for a specific device configuration. The device-configuration panels remain read-only (DOD-9).
- **RV5-2 Control Refs = removable multi-select.** In the data-table tabs (§11.2 / CTL-5), the Control
  Refs editor MUST allow selecting **multiple** controls and **removing** any of them independently. The
  native `<select multiple>` (which required modifier-clicks to add and gave no obvious remove) is
  replaced by a **searchable checkbox list** over the control catalogue: each control is a checkbox
  (checked = referenced); ticking/unticking adds/removes that one ref. The column still renders the
  referenced controls' titles.
- **RV5-3 Settings bulk-assignment also accepts a CSV.** The "set decisions from files" settings input
  (§18.2 / ASG-4) MUST **also** accept a CSV whose header row is exactly `setting,description,value`:
  column 1 is the stored setting key (`<namespace>/<key>`, e.g. `secure/location_mode`), column 2 a
  free-text description (set on the item), column 3 the value (applied verbatim, `type:'string'`). The
  format is detected by the header; any other input is parsed as the existing §9 sectioned capture
  format. Malformed keys / duplicates REFUSE with located issues; the §ASG-2 exact-set validation and
  transactional apply are unchanged.

---

# 19. v1.2 feature set — per-config decision overrides (schemaVersion 3)

Adds the ability for individual device configurations to **diverge from the fleet baseline** on a
per-item basis, with an optional intermediate **device-group** layer, while preserving the v1.0 core
value of *decide once, inherit everywhere* (§1, spec line 41–42). A baseline decision in the register
remains the default for every device; an override is an **opt-in exception**. Overrides are
**value-only** — they change the *decision value* for an item, never whether the item is *applicable*
(applicability stays defined solely by snapshot keys, §6.5). It raises the project `schemaVersion` to
**3** (§19.7) with a forward migration.

All v1.0/v1.1 invariants — single file (§14), `file://` (§3), purity/layering (§4.1), determinism
(§2 C-6, §8.6, §10.4), and **portability (DOD-11)** — continue to bind. The override mechanism is
**generic**: it lives entirely in the store, a new `App.overrides` resolver, completeness, generate,
report and UI — it MUST NOT require edits to any `DatasetAdapter`. The portability self-test (§15)
MUST still pass unchanged with the mock platform.

> **Terminology note (naming collision).** The v1.0 Devices tab already "groups" the *version stack*
> of one physical device by `baseId` (§6.2, §11.3). The new entity in this section is a **Device
> Group**: a named set of *distinct devices* that share an override profile. Wherever ambiguous, this
> section says **device group** for the new entity and **version stack** for the per-`baseId`
> grouping. They are orthogonal and both render in the Devices tab (§19.4).

## 19.1 Definition of done (acceptance criteria — additive)

- **OVR-1 (MUST)** Three resolution layers, lowest to highest precedence: **default** (the register
  `RegisterItem.decision`) → **group** (a device group's override) → **device** (a device config's
  override). The *effective* decision for an (item, device) pair is the highest-precedence layer that
  supplies a value (§19.2).
- **OVR-2 (MUST)** Overrides are **value-only**. An override may only target an item that is
  *applicable* to the device/group (its key ∈ the relevant snapshot key set, §6.5). An override never
  adds or removes applicability. An override value MUST satisfy the dataset adapter's
  `decisionSchema`/`validateDecision`; an invalid or non-applicable override is a load-time validation
  error, auto-pruned with a logged warning (§19.7).
- **OVR-3 (MUST)** Every consumer of a decision — completeness/readiness (§6.5), generators (§10.1–
  §10.2), report (§10.3), device-view panels (§11.3), and the manifest (§10.4) — MUST read the
  **effective** decision via the single resolver (§19.2). No override logic may exist outside the
  resolver, the store mutators, and the UI that calls them.
- **OVR-4 (MUST)** A device config view highlights divergence: an item whose effective value differs
  from the default **because of a group override** is shown **group-coloured (yellow)**; an item whose
  effective value differs from the group-or-default value **because of this device's own override** is
  shown **device-coloured (orange)**; otherwise it renders normally. A **legend** sits to the right of
  the device-config title (§19.5). Colour is never the sole signal (§11.7): each diverging row also
  carries a text/`title` marker.
- **OVR-5 (MUST)** The device-config panels gain a **"Deviations first"** toggle that pins diverging
  rows (device-orange first, then group-yellow) to the top; default OFF = the existing alphabetical
  order (§19.5). The toggle is UI-state only (never persisted to the project file).
- **OVR-6 (MUST)** A device group exposes a **"Deviations (N)"** control in the Devices tab that opens
  a view of every group-level override (its divergences from default) and is also the **editor** for
  group overrides — add / edit / remove (§19.4).
- **OVR-7 (MUST)** The generated report (§10.3) gains a per-device **"Deviations from default"**
  section listing each item whose effective decision differs from the default, with the default value,
  the group value (if any), the device value, and the resolved **source** (§19.6). The manifest
  (§10.4) records the effective decision and its source per item.
- **OVR-8 (MUST)** Setting an override equal to the value it would otherwise inherit **clears** it
  instead of persisting a no-op (§19.3). Divergence highlighting (OVR-4) is computed by **value
  comparison**, not mere presence, so a redundant stored override never mis-colours a row.
- **OVR-9 (MUST)** `schemaVersion` becomes **3**; `projectIo.migrate` converts v2 → v3 losslessly
  (§19.7). Determinism (DOD-7) and load→save→load identity (DOD-2) hold for projects with overrides
  and groups.

## 19.2 Data model

### 19.2.1 `DeviceConfig.overrides` (per-version, value-only)

`DeviceConfig` (§6.2) gains an `overrides` member: a map keyed by dataset id, then by item key, to a
decision value of the shape the adapter's `decisionSchema` defines (§6.4):

```jsonc
// DeviceConfig (additive)
"overrides": {
  "android.settings": { "secure/location_mode": { "value": "0" } },
  "android.packages": { "com.x.y": { "action": "remove" } }
}
```

- Overrides live on the **device config (version)** object, co-located with that version's snapshots.
  Every key in an override map MUST be in that version's snapshot `keys` for the same dataset
  (applicability, OVR-2).
- Only the **latest** version (§6.2) is editable/active; superseded versions retain their overrides
  read-only as history.
- **Re-onboard carry-forward (amends §8.7).** When `onboardDevice`/`reonboardDevice` creates a new
  version, it MUST copy the prior latest version's `overrides`, **pruning** any key no longer present
  in the new version's snapshot for that dataset (the key left the device). Pruned overrides are
  logged as info. New versions start from the carried-forward set; no override is invented.

### 19.2.2 `DeviceGroup` (top-level `groups`)

A new top-level project array `groups: [DeviceGroup, …]`:

```jsonc
DeviceGroup = {
  "id":   "slug",                          // stable, unique within the project
  "name": "Rugged tablets",                // human label
  "deviceBaseIds": ["tab-active-5"],       // device baseIds (stable identity, survive re-onboard §8.7)
  "overrides": {                           // same shape as DeviceConfig.overrides, value-only
    "android.settings": { "secure/location_mode": { "value": "2" } }
  }
}
```

- `deviceBaseIds` reference device **`baseId`s** (like `Control.assignedDeviceIds`, CTL-1), so group
  membership survives re-onboard versioning.
- **A `baseId` belongs to at most one group** (the default→group→device chain assumes a single group
  per device). Membership in two groups is a validation error (§19.7); `updateGroup`/`addGroup` MUST
  *move* a baseId rather than duplicate it.
- A group override key MUST be in the **union** of the applicable keys of its member devices' latest
  snapshots for that dataset; otherwise it is pruned on load with a warning (OVR-2).

### 19.2.3 The resolver — `App.overrides` (new pure module)

A new pure module is the **single choke point** for override resolution (OVR-3). Depends on
`App.registry` and `App.util.stable` only.

```text
App.overrides = {
  // The group whose deviceBaseIds includes this device's baseId, or null.
  groupForDevice(project, deviceId) -> DeviceGroup|null,

  // Effective decision + provenance for one (item, device).
  effectiveDecision(project, datasetId, item, deviceId)
     -> { decision: Decision|null, source: 'default'|'group'|'device' },

  // The item cloned with its decision replaced by the effective one (adapters stay override-blind).
  effectiveItem(project, datasetId, item, deviceId) -> RegisterItem,

  // Value-based divergence class for highlighting (OVR-4/OVR-8).
  classify(project, datasetId, item, deviceId) -> 'default'|'group'|'device',

  // All items whose effective value diverges from default, for a device or a group.
  deviceDeviations(project, deviceId) -> Deviation[],   // see §19.6
  groupDeviations(project, groupId)   -> Deviation[]
}
```

**Resolution (precedence).** For `(datasetId, item, deviceId)`:
1. `dV = item.decision` (default).
2. `gV = group override[datasetId][item.key]` if the device's group has one, else `dV`.
3. `eV = device latest-config override[datasetId][item.key]` if present, else `gV`.
`effectiveDecision` returns `eV` with `source = 'device'` if a device override exists, else `'group'`
if a group override exists, else `'default'`.

**Classification (value comparison, OVR-8).** Using `stableStringify` equality:
```
if stable(eV) !== stable(gV) -> 'device'   // orange
if stable(gV) !== stable(dV) -> 'group'    // yellow
otherwise                     -> 'default'
```
`classify` is value-based so a redundant override (one equal to what it would inherit) never
mis-colours; combined with the edit-time no-op clearing (OVR-8), redundant overrides should not occur
in practice, but the classifier is robust if one does.

## 19.3 Override editing (store mutators)

The decision **defaults** are still edited in the data-table tabs (§11.2) and via "set from files"
(§18.2) exactly as today — **those write the register default, not overrides** (unchanged
semantics; backward-compatible). Overrides are edited only through the new mutators below and the UI
in §19.4–§19.5.

New `App.store` mutators (transactional, validated, returning the §12.1 `Result` shape; each emits an
Activity-drawer entry and triggers a single change event):

- `setDeviceOverride(deviceId, datasetId, key, decision)` — `deviceId` MUST be the latest version of
  its baseId (reject otherwise, like §18.2). Validates: dataset exists; `key` is applicable to the
  device (snapshot membership, OVR-2); `decision` passes the adapter's `validateDecision`. **No-op
  normalization (OVR-8):** if `decision` equals the value the item would inherit without this device
  override (the group-or-default value, by `stableStringify`), the override is **cleared** instead of
  stored. Persists into the latest config's `overrides[datasetId][key]`.
- `clearDeviceOverride(deviceId, datasetId, key)` — removes the entry (and prunes now-empty maps).
- `setGroupOverride(groupId, datasetId, key, decision)` — validates: group exists; `key` is in the
  union of member devices' applicable keys; `decision` valid. No-op normalization vs the **default**
  value clears it. Persists into `groups[…].overrides`.
- `clearGroupOverride(groupId, datasetId, key)`.
- `addGroup({name, deviceBaseIds})` → `{ok, id}` — derives a slug id (unique); each baseId must exist
  and is **moved** out of any other group it was in.
- `updateGroup(id, patch)` — patch may set `name` and/or `deviceBaseIds` (re-applying the
  at-most-one-group rule). Membership changes never touch override values.
- `removeGroup(id)` — drops the group; its member devices fall back to default (their own device
  overrides are untouched). Logs the change.

Empty override maps MUST be normalized away on write (no empty `{}` dataset buckets persisted) so
serialization stays canonical (§8.6).

## 19.4 Device groups & the Devices tab (§11.3 amended)

The Devices tab (`renderList`, §11.3) is restructured to a **two-level** layout:

- **Top level: device groups.** One section per `DeviceGroup`, ordered by `name`, followed by a
  final **"Ungrouped"** pseudo-section for devices whose `baseId` is in no group. Each group section
  header shows the group `name`, member count, group-management controls (**rename**, **delete**, and
  an **add/remove members** multi-select over device `baseId`s by name — mirroring the Control
  Manager device multi-select, CTL-4), and a **"Deviations (N)"** button (OVR-6) where N = the count
  of group overrides.
- **Add group.** A control at the top of the tab creates a new empty group (`addGroup`).
- **Within a group section: the existing version stacks** (§11.3) render unchanged for each member
  device (latest active; superseded read-only). The per-row counts/badges are unchanged except that
  decided/undecided counts and readiness now use **effective** completeness (§19.2 via §6.5).

**Group deviations view/editor (OVR-6).** The "Deviations (N)" button opens a modal (closable via ×
and backdrop click, consistent with the per-control modal, RV5-1) that, per dataset, lists the
group's current overrides — each row showing the key (via `adapter.displayKey`), the **default**
value, the **group** value, and **edit/remove** controls — plus an **"Add override"** affordance: a
dataset selector, a searchable key select over the union of member devices' applicable keys, and the
schema-driven decision editor (reuse the data-table decision control, §19.5). Edits call
`setGroupOverride`/`clearGroupOverride`.

## 19.5 Device-config view: divergence display (§11.3 / DOD-9 amended)

**DOD-9 amendment.** The device-configuration view stays read-only with respect to the **register and
defaults**, but the **latest** version's panels gain a per-item **override editor** (the only writable
surface here). Superseded versions remain fully read-only.

In `renderPanels` (§11.3) the three panels now, for the latest version:

- Render the **effective** decision (via `App.overrides.effectiveItem`) for each *applicable* item —
  note the panels now list applicable items (not only globally-decided ones) so an override can be set
  on any applicable key; an item with no effective decision shows an "undecided" marker.
- Apply a CSS class per row from `App.overrides.classify`: `dev-diverge-group` (yellow) for `'group'`
  and `dev-diverge-device` (orange) for `'device'`; none for `'default'`. Each diverging row also
  carries a `title`/text marker (e.g. "group override" / "device override") so colour is not the sole
  signal (OVR-4, §11.7).
- Provide a per-row **override control**: an **Inherit / Override** affordance; choosing *Override*
  reveals the adapter's schema-driven decision editor (the same control component as §11.2, seeded
  with the current effective value) writing via `store.setDeviceOverride`; a **"Revert to inherited"**
  action calls `clearDeviceOverride`. Setting a value equal to the inherited one is normalized to a
  clear (OVR-8).
- A panel-level (or view-level) **"Deviations first"** toggle (OVR-5) re-sorts rows: when ON, device
  (orange) rows first, then group (yellow) rows, then the remainder — each band alphabetical by key;
  when OFF (default), pure alphabetical (current behaviour). UI-state only.

**Legend (OVR-4).** A small legend sits to the **right of the device-config title** (`renderDetail`,
§11.3 head) with two swatches: **yellow = "Group override"**, **orange = "Device override"**.

The existing device-detail search (RV3-7), collapsible panels and per-control modal (RV5-1) continue
to work; search/filter operate on the effective decision text.

## 19.6 Reporting & deviation surfacing (§10.3 amended)

A `Deviation` record (used by the resolver and report):

```jsonc
Deviation = {
  "datasetId": "android.settings",
  "key":       "secure/location_mode",
  "displayKey":"secure/location_mode",   // via adapter.displayKey
  "source":    "device",                  // 'group' | 'device'
  "defaultValue": { "value": "1" },       // RegisterItem.decision (or null)
  "groupValue":   { "value": "2" },       // group-effective (== default when no group override)
  "deviceValue":  { "value": "0" }        // device-effective (== group when no device override)
}
```

- **In-app.** The device view highlights + legend (§19.5) and the group "Deviations (N)" modal
  (§19.4) are the interactive deviation surfaces.
- **Generated report (§10.3).** `buildReport` gains a **"Deviations from default"** section for the
  device, built from `App.overrides.deviceDeviations(project, deviceId)`: a table of
  `displayKey · dataset · source · default → group → device`. When the device is in a group, the
  section header names the group. If there are no deviations, render a "No deviations from default"
  note. The existing per-dataset sections and Control coverage (CTL-7) already consume `gather`, which
  now yields **effective** items (§19.2), so they reflect overrides automatically.
- **Manifest (§10.4).** Per decided item, the manifest's `decisions[dsId]` entries gain a `source`
  field (`'default'|'group'|'device'`); the `decision` value recorded is the **effective** one. The
  manifest stays deterministic (stable key order, injected clock).

## 19.7 Schema, migration & determinism (§6.1, §8.6, §17.A amended)

- **`schemaVersion: 3`.** `App.projectIo.SCHEMA_VERSION = 3`. `migrate` adds `case 2: return
  migrateV2toV3(project)` and `case 3: return project` (identity). `migrateV2toV3` losslessly: sets
  top-level `groups: []` if absent; sets `overrides: {}` on every `DeviceConfig` if absent; otherwise
  identity. Reject unknown `schemaVersion` with a located issue (§17.A).
- **Top-level key order (§8.6).** Add `groups` to `TOP_KEYS` (after `deviceConfigs`, before `items`,
  matching the load/serialize ordering). `serializeProject` MUST sort `groups` by `id`,
  `DeviceGroup.deviceBaseIds` ascending, and emit all `overrides` maps with sorted keys (handled by
  `stableStringify`). DeviceConfig serialization includes `overrides` in canonical key order.
- **Validation (Appendix A, §17.A).** Validate: `groups` is an array; each `DeviceGroup` has a slug
  `id` (unique), a string `name`, a `deviceBaseIds` array of existing baseIds with **no baseId in two
  groups**, and an `overrides` map whose dataset ids are registered, whose keys are within the member
  devices' applicable union, and whose values pass `validateDecision`. Validate each
  `DeviceConfig.overrides` likewise against that **version's** snapshot keys. Dangling /
  non-applicable / invalid overrides and unknown-baseId memberships are **auto-pruned on load with a
  logged warning** (consistent with CTL-2 ref pruning), never a hard failure.
- **Determinism / identity.** A project carrying groups and overrides MUST satisfy load→save→load
  identity (DOD-2) and byte-stable serialization (DOD-7). No-op overrides are never persisted (OVR-8),
  so equivalent states serialize identically.

## 19.8 Amendments to earlier clauses (quick index)

- **§6.1** project file: add top-level `groups` array; `schemaVersion` const becomes **3**.
- **§6.2** `DeviceConfig`: add `overrides` map (value-only, per-version). §8.7 re-onboard carries
  overrides forward, pruning non-applicable keys.
- **§6.5** completeness/readiness now evaluate the **effective** decision (`App.overrides`); the
  register's global `RegisterItem.status` continues to reflect the **default** only (data tabs
  unchanged). A device may be ready via overrides even where a default is undecided; overrides are
  always valid, so they can only **add** completeness, never remove it.
- **§7.1** store API: add `setDeviceOverride`, `clearDeviceOverride`, `setGroupOverride`,
  `clearGroupOverride`, `addGroup`, `updateGroup`, `removeGroup`.
- **§8.7** re-onboard: copy + prune `overrides` into the new version.
- **§10.3** report: add per-device "Deviations from default" section; existing sections consume
  effective items. **§10.4** manifest: add `source`, record effective decisions.
- **§11.1/§11.3** Devices tab: device-group sections with management + "Deviations (N)"; device view
  gains override editing (latest only), divergence highlighting, legend, and "Deviations first" toggle.
- **§17.A** schema: validate `groups`, `DeviceConfig.overrides`, group/device override applicability +
  validity, single-group membership; `schemaVersion === 3`.
- **New module** `App.overrides` (pure) added to the §7 module catalogue and §14 load order
  (after `App.completeness`/before `App.generate`, since both depend on it).
- **DOD-11 (portability).** No `DatasetAdapter` edits are required; the mock-platform portability
  self-test (§15) MUST still pass.
