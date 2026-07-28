# CH Config Tool — Engineering Build Specification (v2.0)

**Audience:** an implementing software-engineer agent.
**Goal:** produce a single, self-contained `.html` file that runs the Cyber-Hardening (CH)
configuration-management tool described herein, with no further input than this document.

This spec is normative. Where it says **MUST**, the requirement is binding; **SHOULD** marks a
strong recommendation; **MAY** marks an option. Implement the architecture exactly as specified so
that the modularity guarantees hold; implement module *internals* using the contracts given.

IMPORTANT: Press Control + Shift + V to view this document in fully rendered markdown format.

---

### About this version

**v2.0 supersedes v1.0** (`Archive/android-ch-config-tool-build-spec-v1.0.md`, retained for the audit
trail). It is a **consolidation**, not a rewrite: the section numbering, requirement ids (DOD-n,
ASG-n, CTL-n, OVR-n, GEN-n, RV*-n, RG-n) and appendix letters are unchanged, because the shipped code
cites them at their call sites. What changed:

1. **The `android.settings` dataset is retired** (§21). Android has exactly **two** datasets —
   **Packages** and **Tactical**. Every clause that assumed three datasets, three capture files or
   three panels now reads *per dataset*.
2. The v1.1 (§18), v1.2 (§19) and v1.3 (§20) addenda, and the review amendments folded into them, are
   normative and shipped; they are stated here as the current requirement rather than as deltas.
3. `schemaVersion` is **3** throughout (§19.7). `controlRefs`, `controls`, `controlTypes`, `groups`,
   per-config `overrides` and `RegisterItem.relevance` are all part of the current model.

4. **v2.1 (§22)** adds *value formats* — a declared, enforceable shape for a decision
   value, with a reusable catalogue of named custom formats — and moves the bulk-edit
   controls into a sticky tools rail. Additive: no `schemaVersion` bump.

Read §21 first if you are migrating an implementation or a project file from v1.x.

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
18. v1.1 feature set — dark mode · bulk assignment · Control Manager · security relevance · UI reviews
19. v1.2 feature set — per-config decision overrides & device groups (schemaVersion 3)
20. Generation customisation (v1.3)
21. **v2.0 — retirement of the Settings dataset**
22. **v2.1 — value formats & the sticky tools rail**

---

## 1. Product summary & definition of done

The tool manages CH **decisions** for a fleet of device configurations and **generates** the files
that implement, verify, and report on those decisions. It is a **pure generator**: it ingests
captured config files, lets a user record decisions once and inherit them across devices, and emits
code/config/report files. It never contacts a device.

### 1.1 Definition of done (acceptance criteria)

The build is complete when all of the following hold, verified against the fixtures in Appendix D:

- **DOD-1** A single `.html` file, opened directly from disk (`file://`) in current Chrome, Edge, and Firefox, runs fully with no console errors and no network requests.
- **DOD-2** A user can load a project file, view **one data table per dataset** (Android: packages, tactical), search/sort/filter them, and save the project back — losslessly (load→save→load is identity).
- **DOD-3** A user can onboard a device by supplying **one input file per dataset** (Android: two); the **Onboard** control is disabled until every slot is present and parses without errors.
- **DOD-4** Onboarding creates a device configuration, embeds immutable hashed snapshots, inherits all keys already in the register, and appends only genuinely-new keys as `undecided`, ending with a triage summary.
- **DOD-5** Undecided items are visibly flagged; a user can record decisions through controls derived from each dataset's decision schema.
- **DOD-6** Implementation, Verification, and Reporting are **three independent commands**; each is enabled for a device only when every item applicable to that device is complete.
- **DOD-7** Each generator emits a single downloadable `.zip` containing its outputs plus a manifest; regenerating from the same project yields byte-identical outputs (deterministic).
- **DOD-8** The reporting output is a styled `.html` that opens in Microsoft Word as a formatted document (headings, tables, page breaks) suitable for Save-As `.docx`.
- **DOD-9** A device-configuration view shows, read-only, exactly the applicable decided items for one device, in **one panel per dataset**. (Amended by §19.5: the latest version's panels also carry the per-item override editor.)
- **DOD-10** Malformed inputs and invalid operations produce clear, located, non-fatal error messages; the app never silently fails or silently drops data.
- **DOD-11** Adding a further dataset or a second platform profile requires **no changes** to core, store, UI shell, diff, completeness, project I/O, or report shell — only a new adapter/profile (demonstrated by the self-test "portability" fixture). Symmetrically, **removing** a dataset must require no core edits either — §21 is the worked example.
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
Android, packages, tactical JSON, ADB, or PowerShell.** All of that lives behind two
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
no literal `'packages'`/`'tactical'` branching anywhere outside the Android adapter files. The one
sanctioned exception is the **retired-dataset table** in `projectIo` (§21.3), which names ids that are
*no longer* datasets precisely so that core never has to know what they once were.

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
  "schemaVersion": 3,
  "platformProfileId": "android-adb",
  "meta": { "createdUtc": "ISO", "modifiedUtc": "ISO", "appVersion": "2.0" },

  "controls":     [ Control, ... ],       // §18.3 CTL-1
  "controlTypes": [ "ISM", ... ],         // §18.5 RV3-5, optional
  "deviceConfigs": [ DeviceConfig, ... ],
  "groups":       [ DeviceGroup, ... ],   // §19.2.2

  // items grouped by dataset adapter id — one bucket per dataset of the active platform
  "items": {
    "android.packages": [ RegisterItem, ... ],
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
    "android.tactical": Snapshot
  },
  "overrides": { ... }                    // §19.2.1, value-only, per-version
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
  "values": { "com.x.y": "1" },    // optional per-key capture value (drift detection, §8.4)
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

Decision shapes per Android adapter:
- packages: `{ "action": "keep" | "disable" | "remove" }`
- tactical: `{ "value": true }` — the value alone; JSON-type fidelity is preserved by coercing to the
  captured leaf's type (§18.5 RV3-2), so there is no user-facing type control.

`RegisterItem` also carries the optional **`relevance`** field (§18.8): `''` or one of
`HIGH | MEDIUM | CONTEXT | REPORTING | IRRELEVANT`. `REPORTING` and `IRRELEVANT` are *parked* — hidden
from the default table view — and `ismRefs` is now **`controlRefs`** (§18.3 CTL-2).

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

### 8.4 Captured-default drift detection

This is a **generic, adapter-driven** check: it fires for any dataset whose `Snapshot` records
per-key capture `values` (§6.3). On onboarding a device whose snapshot contains a key already in the
register, compare the new capture value with previously recorded capture values from other devices'
snapshots. If they differ, emit an **info** issue ("`com.x.y` default differs: 0 on Tab Active 5, 1 on
S23"). This never changes a decision; it surfaces firmware drift.

> **Note (v2.0).** No adapter shipped with the Android profile currently emits `values` — the dataset
> that did (Settings) was retired (§21). The mechanism is retained because it is dataset-agnostic and
> costs nothing when no adapter opts in; the self-test covers it with a hand-built snapshot.

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
- **Tactical** (`json`): a JSON document; flatten per §8.2. Error on invalid JSON. Warn on empty object. **`imsSettings` completion (binding, §18.9 RV17-4):** a Knox export only carries the `imsSettings` block once it has been touched, so the block is **optional in the upload**. When it is absent the parser MUST add the default `[{enabled:false,simSlotId:0},{enabled:false,simSlotId:1}]` to the retained template and log a **warning** — never silently. When it is present it is used exactly as captured.

Each parser returns `ParseResult{items, warnings, errors, template?}`. Onboarding is blocked if any
input yields `errors`.

---

## 10. Output generation

Three independent commands. Each is pure up to the final `Blob`; the UI performs the download.

### 10.1 Implementation

For the chosen device, for each dataset, call `adapter.generateImplementation(applicableComplete,
ctx)`. Wrap each script with `platform.scriptPreamble/Postamble(ctx)`. Android specifics in
Appendix B (pm/tactical). Include a generated header comment noting the source project,
device, firmware, generation timestamp, and tool version.

### 10.2 Verification

As above with `generateVerification`. Android verify scripts read state back (`pm list packages`,
tactical read-back where exposed) and emit per-item PASS/FAIL/MISSING, or
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
- Tabs, in the order the operator works through them (§18.9 RV17-1): **Onboard**, one **data table tab per dataset** (from the active profile), **Devices**, **Control Manager**, **Generate**, **Help**. Onboard is always rendered; with no project loaded only Onboard and Help are offered. A persistent **Activity/Errors** drawer.

### 11.2 Data table tabs (one per dataset, data-driven)
- Columns from `adapter.columns` plus computed **Applies to** (device names whose snapshot has the key) and **Status**.
- Free-text search across key + description; column sort; "Incomplete only" toggle. Undecided rows visually flagged (e.g. left border + badge).
- Inline editing of decision (control rendered from `decisionSchema`: enum→`<select>`; value-typed→value input + type select; bool→toggle), description, ISM refs (tag input), rationale, rollback. Edits commit to the store on change; validation issues shown inline.
- Performant rendering for ~1–2k rows: render via `DocumentFragment`, debounce search (~150 ms), and SHOULD windowed-render if a dataset exceeds a configurable threshold (e.g. 1500 rows).

### 11.3 Devices tab
- List of device configs (name, model, firmware, version, applicable counts, ready/▢ undecided count). Superseded versions (§8.7) are shown grouped under their `baseId` and visibly flagged "superseded" (read-only history); the latest version is the active one.
- Selecting one opens the **device-configuration view**: **one panel per dataset** listing that device's applicable items (key, effective decision, status). Read-only with respect to the register and defaults; the latest version's panels additionally carry the per-item override editor (§19.5). Generation acts on the latest version only.

### 11.4 Onboard tab
- **One labelled file slot per dataset**, each showing parse status (✓ N items / ✗ error). The platform's `captureInstructions` shown as help.
- Name/model/firmware fields. **Onboard** button disabled until every slot parses without errors and a non-empty device name is given. A name+model matching an existing device is **allowed** — it is a re-onboard (§8.7); if so, the UI MUST indicate "this will re-onboard <name> (creates a new version / no-op if unchanged)" before commit. On click: run onboarding/re-onboarding, then show the triage summary (counts of new/existing per dataset, warnings, drift info, and which version was created or that it was an unchanged no-op) and switch focus to the first dataset filtered to "Incomplete only".

### 11.5 Generate tab
- Device selector. Four independent commands — **Implementation**, **Verification**, **Reporting**, **Control report** (§20.5) — each enabled iff `deviceReady`. Disabled buttons show why ("3 tactical undecided"). Clicking produces the single zip download and logs to the Activity drawer. Each command carries its own collapsible **Options** panel (§20.8); a global "Output scripts as `.txt`" checkbox spans Implementation and Verification (§18.5 RV3-1).

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
| parse | empty file, wrong file in slot, invalid JSON, malformed package token | error | blocks onboarding; shown on the slot |
| validation | duplicate key, unknown namespace, decision type mismatch, bad ISM ref format | error/warning | blocks commit (error) or annotates (warning) |
| state | no project loaded; empty/blank device name | error | blocks the action |
| state | re-onboard with **identical** snapshot hashes | info | no-op; logs "nothing to do" (§8.7) |
| state | re-onboard with **differing** snapshot hashes | info | creates a new device version, not an error (§8.7) |
| completeness | generate attempted with undecided applicable items | (prevented) | buttons disabled with reason |
| generation | tactical template missing, value un-serialisable at path | error | aborts that generation, reports which item |
| validation | a project file carrying a **retired** dataset (§21.3) | warning | the dataset is stripped on load, everything else is kept, and the drawer states exactly what went |

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
- **Fixtures:** Appendix D — valid + malformed inputs for each dataset, a two-device sample project, and the mock platform. Edge cases to cover: empty files, duplicate keys, invalid JSON, tactical with nested arrays, a tactical document with and without `imsSettings`, captured-default drift across two devices, generate-before-complete (blocked), re-onboarding the same device (identical hashes → no-op; differing hashes → new version supersedes prior), the adversarial value `a'b"c$(whoami)` d;e` round-tripping through the two-layer shell escaping (Appendix B), a **v1.x project carrying the retired dataset** loading cleanly with exactly one warning (§21.4), and `zip(files)` byte-equality across two calls.

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
contracts; implement `android.packages` and `android.tactical` (**parse +
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
top-level: `schemaVersion` (const **3**, §19.7), `platformProfileId` (string, must be a registered platform),
`meta` (object: `createdUtc`,`modifiedUtc` ISO date-time; `appVersion` string), `deviceConfigs`
(array of DeviceConfig), `items` (object whose keys are dataset ids of the active platform, values
arrays of RegisterItem). DeviceConfig requires `id`(slug, unique),`baseId`(slug),`version`(integer
≥1),`supersedesId`(slug|null),`name`,`model`,`firmware`,`onboardedUtc`,
`snapshots`(object keyed by dataset id → Snapshot), optional `overrides` (§19.2.1). Validation MUST check version integrity: per
`baseId`, versions are a contiguous `1..n` chain where each non-v1 config's `supersedesId` references
the immediately prior version's `id`, and exactly one config per `baseId` is the latest (unreferenced
by any `supersedesId`). Snapshot requires
`capturedUtc`,`sourceFilename`,`sha256`(hex 64),`keys`(string[] unique sorted); optional
`values`(object),`template`(any). RegisterItem requires `key`,`decision`(object|null),`controlRefs`
(string[]),`status`(enum), optional `description`,`rationale`,`rollback`,`relevance`. Reject unknown
top-level keys; report each violation as a located `Issue`. A dataset id in `items`/`snapshots` that
is not a dataset of the platform is an **error** — except for the ids listed in the retired-dataset
table (§21.3), which are stripped before validation with a warning. Implement `migrate(project)`
chaining v1→v2→v3 (§18.3 CTL-3, §19.7) so an old file reaches the current schema in one call.

### Appendix B — Android (ADB) platform & adapters (reference implementation)

`PlatformProfile{ id:'android-adb', label:'Android (ADB)', outputLanguage:'powershell' }`.
`scriptPreamble` emits a PowerShell header: tool/version/project/device/firmware/UTC banner,
`Set-StrictMode`, an ADB-presence check, a single target-device guard, and transcript start;
`scriptPostamble` stops the transcript. `captureInstructions` documents the captures and the
required normalised formats (§9). An optional `runInstructions(name)` hook supplies the per-file
how-to-run header (§19.13 RV9-4).

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
   `cmd package set-x ` + `shSingleQuote(v)`.
2. Pass that whole device-side string to `adb … shell` as a **single PowerShell argument** by
   wrapping it with `psSingleQuote(...)`, so PowerShell performs no further word-splitting or
   expansion. Never interpolate a raw value into a double-quoted PowerShell string.

This makes the two helpers total over arbitrary bytes: a value containing `'`, `"`, `$`, spaces,
tabs, `;`, `&&`, `$(...)`, or backticks is rendered as inert literal text on both sides. Keys and
package tokens are charset-restricted at parse (§9, below) so they need no escaping; **only values
do**. Self-tests MUST include the adversarial value `a'b"c$(whoami)` d;e` and assert the generated
line, when conceptually unwrapped one layer at a time, yields exactly that literal string.

> **v2.0 note.** `shSingleQuote` currently has no caller — the dataset that pushed free-text values
> through `adb shell` was Settings (§21), and Tactical is applied by JSON upload, not by shell. It is
> retained, exported and self-tested as the mandated POSIX layer of this contract, so the next dataset
> that emits a device-side value inherits the guarantee rather than reinventing it.

**`android.packages`** — inputKind `text`. parse per §9. decisionSchema:
`[{name:'action',kind:'enum',options:['keep','disable','remove'],required:true}]`. columns: key,
description, decision(action), appliesTo, ism, status. isComplete: action ∈ options.
generateImplementation: for `disable` → `adb -s $Serial shell pm disable-user --user 0 <pkg>`; for
`remove` → `adb -s $Serial shell pm uninstall --user 0 <pkg>`; `keep` → no-op (comment only). Guard
each with a presence check; idempotent. generateVerification: `pm list packages -d`/`-e` read-back,
compare, emit PASS/FAIL/MISSING. renderReportSection: a table of pkg/action/ism/rationale.
**Quoting:** package tokens are restricted to `[A-Za-z0-9._]`; reject anything else at parse to keep
shell generation injection-safe.

**`android.tactical`** — inputKind `json`, flatten per §8.2, retain template. decisionSchema:
`[{name:'value',kind:'value-typed',required:true}]` (editor adapts to the leaf's JS type;
default from the captured value; no user-facing type control — §18.5 RV3-2).
generateImplementation/rebuildArtifact: deep-clone the device's tactical template, apply decided
values at their paths (§8.2), serialize deterministically → **`tactical.json` only**.

**Apply model (binding, confirmed with the team).** The tactical configuration is applied by
**manually uploading** the emitted JSON into Knox tactical. There is **no** `adb`/PowerShell push
step and no `TODO(tactical-apply)` scaffold: the implementation output for this dataset is the
rebuilt document, in the same structure and formatting as the captured input (object shape, nesting,
arrays and JSON types all preserved by `rebuildTacticalDoc`).

Two structural rules the flattener/rebuilder MUST honour, because in both cases part of the array
element is *identity*, not a decision:
- **`policyList`** (§18.5 RV3-3): elements `{name, checked}` flatten to one leaf keyed by the policy
  **name**, valued by **checked**. Displayed without the `policyList.` prefix (§18.6 RV4-1).
- **`imsSettings`** (§18.9 RV17-4): elements `{enabled, simSlotId}` key by **slot**
  (`imsSettings.simSlot0.enabled`), so `simSlotId` never becomes a decision of its own.

generateVerification: read-back where exposed else mark EVIDENCED. renderReportSection:
path/value/control/rationale table. **Type fidelity:** preserve booleans/numbers as JSON types, not
strings.

> The Android specifics live entirely in this appendix's adapters. The rest of the app is platform-blind.

### Appendix C — Vendored primitives (inline, fenced with provenance)

The implementer MUST inline, with `BEGIN/END VENDORED` banners and source attribution:
1. **SHA-256** — a compact, dependency-free, public-domain/MIT JS implementation operating on UTF-8 strings/bytes (required because Web Crypto may be absent on `file://`).
2. **CRC-32** — standard table-based implementation (for ZIP entries).
3. **Store-only ZIP writer** — builds a valid ZIP using *stored* (no compression) entries: per-file local file header + data, followed by the central directory and end-of-central-directory record; CRC-32, compressed size = uncompressed size, sizes/offsets little-endian, UTF-8 filenames (set the language-encoding flag). Output a single `Blob` (`application/zip`). Keep entry order stable for determinism. **All DOS date/time fields MUST be the fixed constant `time=0x0000, date=0x0021` (1980-01-01), and all version/attribute fields fixed constants, per §10.4 — never wall-clock — so the writer is a pure function of its input and `zip(files)` is byte-reproducible.** (May instead inline a minimal MIT-licensed zip lib, provided it runs offline, store-only, and emits fixed timestamps; hand-rolled is preferred to minimise footprint.)

### Appendix D — Fixtures

Provide, as inline test data:
- **D.1 packages** — valid list (with a `package:` prefix and a duplicate to dedupe) + malformed (empty; a line with a space).
- **D.2 shell escaping** — the adversarial value `a'b"c$(whoami)` d;e` (single quote, double quote, command-substitution, backtick, space, `;`) driven through `psSingleQuote`/`shSingleQuote` and unwrapped one layer at a time, to exercise the two-layer contract (Appendix B).
- **D.3 tactical** — valid nested JSON incl. an array, a boolean, a `policyList` and an `imsSettings` block; the same document **without** `imsSettings` (completion path); + malformed (invalid JSON).
- **D.4 mock platform** — a trivial `PlatformProfile` with one text dataset (`mock.kv`, key=`k`, decision=`{value}`) used solely by the portability self-test to prove core needs no edits to host a new platform.
- **D.5 sample project** — two devices (Tab Active 5, S23) sharing most keys, with a handful of S23-only keys and one cross-device captured-default drift, to exercise inheritance, triage, drift, and readiness.
- **D.6 legacy project** — a schemaVersion-3 project that still carries the retired `android.settings` bucket, its snapshot and a device override, to exercise the §21.3 load path.

### Appendix E — Glossary

Register (the shared decision store), Decision vs Applicability (§5/§6), Snapshot, Dataset adapter,
Platform profile, Item, Complete/Ready, EVIDENCED (applied but not machine-verifiable), Drift
(changed default across firmware), Triage (the new/existing/not-applicable split), Control (a named
requirement an item satisfies — §18.3), Assignment (setting a device's decisions in bulk from files —
§18.2), Override / Deviation (a per-device or per-group exception to the baseline decision — §19),
Parked item (one tagged REPORTING or IRRELEVANT and hidden from the default view — §18.8),
Retired dataset (one removed from the product whose data is stripped from older project files on
load — §21).

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
  of the selected device, provide **one independent control per dataset**, each accepting one input
  file and applying it to that device's decisions for that dataset only. A dataset whose adapter has
  no `parseAssignment` simply offers no control (ASG-6).
- **ASG-2 (MUST — exact-set validation, before any mutation).** The set of keys present in the input
  file MUST be **exactly equal** to the set of keys *applicable* to that device for that dataset
  (*applicable* = union of that device's snapshot `keys` for the dataset, §6.5). If they differ, the
  operation is **REFUSED with no mutation**, and the UI lists the deltas: keys *missing* from the file
  (applicable but absent) and keys *extra* in the file (present but not applicable). No partial apply.
- **ASG-3 (MUST — format validation, before any mutation).** Each input is parsed and validated
  first; malformed input (bad header/JSON, invalid action, malformed/duplicate/charset-invalid keys)
  REFUSES the operation with **located** error issues (§12, DOD-10). Nothing fails silently.
- **ASG-4 — input formats:**
  - **Packages:** a **CSV** whose header row is exactly `package,action,description`, optionally
    followed by `rationale` and then `relevance` in that order (§18.8). Column 1 is the package name
    and MUST tolerate an optional leading `package:` prefix; column 2 is the action
    `keep|disable|remove`; column 3 is a free-text description (RFC-4180 quoting — may be quoted and
    contain commas). The decision is `{action}`; the item's `description` is set from column 3.
    Package tokens remain charset-restricted (§9 / Appendix B) — reject others.
  - **Tactical:** the §9 tactical JSON. Each decision is set to `{value}` from the corresponding
    flattened leaf (§8.2) — JSON types preserved. The `imsSettings` completion rule (§9) applies to
    this entry point exactly as it does to onboarding, since `parseAssignment` delegates to `parse`.
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
  type (carried as `data-vtype`).
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
  - The read-only dataset panels (one per dataset) MUST be individually **collapsible**
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
- **RV5-3 (WITHDRAWN in v2.0).** This clause required the Settings bulk-assignment input to also accept
  a `setting,description,value` CSV. It lapsed with the dataset (§21). The generic capability it
  introduced — a capture parser that may return `descriptions` alongside `keys`/`values`, carried onto
  register items by `store.onboardDevice({descriptions})` — is **retained** and remains available to
  any adapter.

### 18.8 Security Relevance & the decisions-import columns (reviews 12 & 14)

- **REL-1 `RegisterItem.relevance` (optional).** Every item MAY carry a `relevance` string: `''`
  (unset) or one of **`HIGH`**, **`MEDIUM`**, **`CONTEXT`**, **`REPORTING`**, **`IRRELEVANT`**. The
  vocabulary is a single exported constant (`App.projectIo.RELEVANCE_OPTIONS`) consumed by the UI
  picker, the CSV importer and store validation, so the three can never drift. Additive — no
  `schemaVersion` bump; an unknown value is a schema **error**.
- **REL-2 A column in every data table.** Each data table gains a **Security Relevance** column with an
  inline badge-select. Sorting on it sorts by **severity** (HIGH first), not alphabetically.
- **REL-3 Parked items.** `REPORTING` and `IRRELEVANT` mark an item as *parked*: **hidden from the
  default table view**, so the working view stays on items that still need a security decision. Two
  toolbar toggles reveal each category (tick both to see either); the default view MUST state what it
  is hiding. Parked-ness composes with search and "Incomplete only".
- **REL-4 Optional trailing CSV columns.** The decisions-import CSV (§18.2 ASG-4) accepts two further
  columns after its required ones — **`rationale`** then **`relevance`**, in that order, named exactly.
  Either may be omitted; a short row simply means "column absent" and an empty cell **clears** the
  value. Values are case-normalised (`medium` → `MEDIUM`); anything outside the vocabulary is a
  located error that refuses the whole import (atomic, §ASG-2/ASG-3).
- **REL-5 Per-device control satisfaction (review-12 #1).** `Control` gains
  `deviceStates: { <deviceBaseId>: 'satisfied' | 'unsatisfied' }`. A control starts **unsatisfied**
  when assigned; the operator marks it satisfied once content the configuration meets it. The state is
  per device and survives re-onboard versioning.
- **REL-6 Delete Mode + Undo/Redo (review-12 #2, review-13 #2/#3).** Each data table offers an armed
  **Delete Items** mode (tick rows → *Delete selected* / *Cancel*) which also removes any device or
  group override pointing at a deleted item; the capture snapshots are untouched, so re-onboarding the
  same file brings the item back. **Undo/Redo** steps through that table's Delete-Mode and
  Apply-Control-Mode actions; a whole Apply run counts as **one** action, and history is per dataset.

### 18.9 Review-15 → review-17 amendments (UI + tactical fidelity)

- **RV15-1 Starting column widths.** **Description** starts 3× the shared default (660px) in every
  data table, because descriptions are long prose. A width the operator has dragged always wins.
- **RV15-2 Help is a manual.** The Help tab is a sectioned manual (section strip + one readable column
  per section) covering Overview, Getting started, Onboarding, Data tables, Devices & groups, Controls,
  Generating output, Saving & recovery, and Reference (glossary, troubleshooting, developer notes). Its
  content MUST be generated from the **live** app where possible — dataset labels from the registry,
  capture instructions from the platform profile, the relevance vocabulary from `App.projectIo` — so
  the manual cannot drift from the code it documents. Help MUST render with no project loaded.
- **RV16-1 An empty text box is a real decision.** The "empty primary field ⇒ undecided" rule applies
  **only to `enum` primaries** (which have an explicit "—" option). For a **text** primary an empty box
  commits `{ value: '' }` — a genuine decision meaning "set this key to blank" — which round-trips
  through save/load and is emitted explicitly rather than skipped. Because an empty box no longer means
  undecided, a decided text cell MUST offer an explicit **clear** button to return the item to
  undecided. The rule lives in one testable function (`decisionFromRaw`), not in DOM-handling code.
- **RV17-1 Tab order.** As §11.1: **Onboard · <data tabs> · Devices · Control Manager · Generate ·
  Help**. Onboard is rendered unconditionally so the strip does not reshuffle when a project is created.
- **RV17-2 Clear beside the box.** The `clear` button shares one flex row with the value box, so an item
  stays one line tall.
- **RV17-3 The Status badge is a switch.** Clicking (or Enter/Space on) the badge flips the item:
  **decided → undecided** clears the decision; **undecided → decided** adopts whatever the row's value
  editor is *already showing* — for a text primary that is the **captured** value, so one click means
  "what the device has is my decision". For an enum primary with no selection the **first** schema
  option is used (packages: `keep`, the no-change action). The flip routes through `store.setDecision`,
  so it participates in validation, dirty-tracking and undo like any other edit.
- **RV17-4 `imsSettings` completion + `completeSnapshot`.** Per §9, the tactical parser completes a
  document that omits `imsSettings`. Completing the *file* is not enough: a device onboarded **before**
  the rule existed has a stored snapshot whose `keys` lack the slots, so the exact-key-set check
  (ASG-2) could never match. Adapters therefore MAY implement an optional hook
  **`completeSnapshot(snap) → string[]`** — "bring this stored snapshot up to the keys this dataset now
  guarantees", returning the keys it added. `projectIo`'s load-time self-heal calls it for every
  device-config snapshot whose adapter offers one, mirrors each added key into the register as an
  **undecided** item, and warns per dataset listing exactly what was added. The hook MUST be
  idempotent: a complete snapshot is a byte-for-byte no-op. Core stays dataset-agnostic (DOD-11).

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
  "android.packages": { "com.x.y": { "action": "remove" } },
  "android.tactical": { "policyList.Disable Bluetooth": { "value": true } }
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
    "android.packages": { "com.x.y": { "action": "disable" } }
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
  "datasetId": "android.tactical",
  "key":       "policyList.Disable Bluetooth",
  "displayKey":"Disable Bluetooth",       // via adapter.displayKey (§18.6 RV4-1)
  "source":    "device",                  // 'group' | 'device'
  "defaultValue": { "value": false },     // RegisterItem.decision (or null)
  "groupValue":   { "value": true },      // group-effective (== default when no group override)
  "deviceValue":  { "value": false }      // device-effective (== group when no device override)
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

## 19.9 Review-6 amendments (UI refinements)

Presentation-only refinements to the v1.1/v1.2 UI; no engine, schema, determinism, or portability
change.

- **RV6-1 Group members via a toggle dropdown.** In a Devices-tab group section (§19.4), member
  management MUST be a **toggle-able dropdown** (a `<select>`), not a checkbox grid: choosing a device
  **adds** it to the group; choosing a current member **removes** it (single-group move still applies).
  The current members MUST also be shown as text so membership is legible at a glance.
- **RV6-2 Group deviations modal — larger + clean value columns.** The group "Deviations" modal (§19.4 /
  OVR-6) MUST be **near-full-screen** (so overrides are not cramped). Each override row MUST show the
  **default value alone** in a *Default* column (e.g. `0`, not the raw decision object
  `{"value":"0","type":"string"}`) and the deviation value in a separate *Deviation setting* column
  (the schema-driven editor). Use the adapter's decision-display for the default value.
- **RV6-3 Searchable key picker when adding a deviation.** In the add-override form (§19.4), the setting/
  key picker MUST be **type-to-search** (e.g. an `<input list>` + `<datalist>`), because the applicable
  key list is long. The dataset selector and schema editor are unchanged.
- **RV6-4 Resizable Control Manager columns.** The Control Manager table (§18.6 RV4-4) MUST support
  **drag-to-resize column widths**, consistent with the data tables (§11.2 / review-2): per-column
  drag handles, `table-layout:fixed`, widths persisted in the view's UI state (never the project file).
- **RV6-5 Control-ref list on one line.** In the data-table Control Refs multi-select (§18.3 CTL-5 /
  review-5 #2), each control's name MUST render on a **single line** with the checkbox at the **left**
  (no two-line wrap when space allows).

## 19.10 Review-7 amendments (bulk control assignment + collapse-all)

- **RV7-1 Collapse-all in the device view.** The device-configuration view (§11.3/§19.5) MUST provide a
  **Collapse-all** control to the **right of the "Deviations first" checkbox** that collapses all
  dataset panels at once. It SHOULD toggle to **Expand-all** when every panel is already collapsed.
  UI-state only (`_dev.collapsed`).
- **RV7-2 Apply Control Mode (bulk control-ref assignment).** Each data-table tab (§11.2) MUST provide
  an **"Apply Control Mode"** toggle in the toolbar. When on:
  - a **searchable control picker** (type-to-search over the control catalogue) appears in the toolbar, and
  - a **checkbox column** appears at the right of every row.
  With a control selected, **ticking** a row's box **adds** that control to the item's `controlRefs`;
  **unticking removes** it. Each checkbox's state MUST always reflect whether the selected control is
  currently in that item's `controlRefs` (e.g. a ref set earlier via the row dropdown shows the box
  already ticked). Toggling the button **off** exits the mode — the picker and checkboxes disappear and
  the selection resets, but all `controlRefs` changes persist. The intent is fast bulk assignment across
  many items; the per-tick commit MUST NOT force a disruptive full re-render (keep scroll position).

## 19.11 Review-8 amendments (apply-mode + device-panel columns)

- **RV8-1 Control picker shows the name only.** In the Apply-Control-Mode control picker (§19.10 RV7-2),
  each option MUST show the control **title only** — no control **type** beneath/after it.
- **RV8-2 "Apply to <action>" bulk assignment (enum datasets only).** In Apply Control Mode, replace the
  "pick a control, then tick rows" hint with an **"Apply to" action dropdown** that is enabled **only
  when a control is selected**. Choosing an action applies the selected control to **every item whose
  decision has that action** (e.g. apply a debloat control to all `remove` packages). This applies only
  to datasets whose decision schema has an **enum** field (packages); tactical (no enum action)
  MUST NOT show it. Options come from the adapter's enum `decisionSchema` field (data-driven, not
  hard-coded). The bulk apply is one pass under the same no-full-re-render guard (RV7-2).
- **RV8-3 Device-panel Override + resizable panel columns.** In the device-configuration view (§19.5),
  **every** dataset panel MUST expose a working, visible **Override** editor, whatever its decision
  kind (enum select, free-text value editor, …). The panel tables MUST use fixed-layout columns that
  are **independently drag-resizable per dataset** (widths persisted in UI state), and long values MUST
  wrap, so a long value no longer squeezes the Override column out of view.

## 19.12 Report-generation refinements (report-gen notes; amends §10.3)

Formatting/content fixes for the Word-targeted report so it imports cleanly into Microsoft Word:

- **RG-1/RG-2 Descriptions in the report.** **Every** dataset's report section MUST include a
  **Description** column (the item's `description`).
- **RG-3 Compact rows.** Word wraps each cell in its "Normal" style (~8pt space-after, 1.08 line-height),
  inflating rows. The report CSS MUST zero paragraph/cell margins, pin `line-height` (~1.05) on
  `p`/`td`/`th`, and trim cell padding.
- **RG-4 Page box.** `body{margin}` does not set Word's page margins (Word adds it on top of its own
  1-inch margins). The CSS MUST set the page box explicitly (`@page{margin:1in}`) and `body{margin:0}`.
- **RG-5 Fonts.** Headings MUST be **Arial Bold** and body/cells **Arial**, declared **explicitly per
  element** (`h1`/`h2`/`body`/`p`/`td`/`th`) — Word reapplies its theme fonts otherwise.
- **RG-6 Fit-to-page tables + wrapping.** Tables MUST fit the page width (`width:100%` +
  `table-layout:fixed` + per-table `<colgroup>` widths) and **all cells MUST wrap** (`word-break`/
  `overflow-wrap`) so a long unbroken value no longer blows a table past the page width.

Determinism (DOD-7) is unchanged — these are static CSS/markup changes.

## 19.13 Review-9 amendments

- **RV9-1 Apply-to is a toggle.** The Apply-Control-Mode "Apply to <action>" (RV8-2) MUST toggle: if
  **every** item with the chosen action already has the selected control, clicking removes it from all of
  them; otherwise it adds the control to the ones still missing it.
- **RV9-2 Control-ref checkbox spacing.** The data-table Control Refs multi-select checkbox MUST render at
  its natural size (the generic `.detail-form input{width:100%}` rule was stretching it, pushing the
  control name off-screen).
- **RV9-3 Script timestamp in AEST.** The generated implementation/verification script header MUST show
  the generated time in **AEST** (UTC+10), not UTC. A pure `App.util.clock.toAest(iso)` provides the
  deterministic conversion (parses the ISO; no wall-clock), so determinism (DOD-7) is preserved.
- **RV9-4 How-to-run comment.** Each generated script MUST begin with a "how to run" comment: open a
  Command Prompt in the platform-tools folder (via the File Explorer address-bar `cmd` trick) and the
  **exact** command to run **this** file (`powershell -ExecutionPolicy Bypass -File .\<emitted-name>`).
  Provided by an optional `platform.runInstructions(name)` hook (Android only) so core stays generic;
  data files (e.g. `tactical.json`) get no header.
- **RV9-5 Name the save file.** "Save project" MUST open a small modal to enter the file name, with a
  Confirm action, before the download (`.json` appended if absent). Default `ch-project`.

Determinism (DOD-7): the AEST string and how-to-run header are pure functions of the (fixed-clock)
timestamp and the emitted filename, so byte-determinism holds.

---

# 20. Generation customisation (v1.3)

Each of the generators (§10) gains a **per-command configuration block** on the Generate tab so the
operator can shape the output without editing the project. This is a **presentation/output-shaping**
feature only: it changes *which* items/sections/columns an artifact contains and how it is framed, never
the underlying decisions.

**Design principles (binding).**
- **Session-only.** All customisation state lives in the Generate view's in-memory state
  (`App.ui.views.generate`). It is **never** written to the project file, never to `localStorage`, and
  resets on reload. No `schemaVersion` bump; Appendix A is unchanged.
- **Three (now four) separate blocks.** Implementation, Verification, Reporting, and the new Control
  report each own an **independent** options object. There is deliberately **no** shared/global profile.
  The one pre-existing global control — "Output scripts as `.txt`" (§11.5) — stays global (it already
  spans Implementation + Verification) and is unchanged.
- **Adapters stay core-blind and data-driven (DOD-11).** New behaviour is expressed through *declarative
  adapter metadata* + generic orchestrator logic. Adding a fourth dataset or a second platform still
  requires no core edits: a dataset that declares nothing new simply renders as a single, un-split,
  all-columns table and offers no action-subset filter.
- **Determinism preserved (DOD-7).** Options are pure inputs. Identical `project + device + options`
  MUST still yield byte-identical artifacts. Excluding a section/column/dataset naturally changes the
  emitted bytes (and therefore that file's manifest `sha256`) — that is expected and still deterministic.
  The manifest is **not** extended to record options (the report self-documents its own composition —
  §20.4); the determinism self-test fixes options alongside the clock.

## 20.1 Definition of done (acceptance criteria — additive)

- **GEN-1 Report section selection.** The Reporting block lets the operator include/exclude each report
  section: Device Config Information (the metadata block), each package action sub-table (Removed /
  Disabled / Kept), Tactical, Control coverage, and Deviations from default. Excluded sections
  do not appear in `report.html`.
- **GEN-2 Package report split.** The packages report renders as **three separate tables** — Removed,
  Disabled, Kept — instead of one mixed Action table, each independently toggleable (GEN-1).
- **GEN-3 Column selection.** For each report table the operator can drop optional columns (e.g.
  Rationale, Control, and the value/action column); the key/path column is always present.
- **GEN-4 Included-sections summary.** `report.html` opens with a small **"Sections included"** table
  listing every candidate section and whether it was Included or Omitted, so a reader can tell an
  intentionally-terse report from a truncated one.
- **GEN-5 Empty tables are explicit.** A section that is toggled **on** but has no rows renders the table
  with a single "None." row — never a bare/absent table (distinguishes "none in this class" from "class
  excluded").
- **GEN-6 Classification banner.** Reporting and the Control report each offer an "OFFICIAL: Sensitive"
  toggle that, when on, renders a prominent classification banner at the **top and bottom** of the
  document body.
- **GEN-7 Control report command.** A **fourth** generation command, **Control report**, is available on
  the Generate tab (device-selected, same `deviceReady` gating). It reports, for **every control applied
  to that device configuration**, which decided items/actions satisfy it — grouped by dataset — as its
  own standalone Word-targeted HTML document + manifest, zipped as `<device>-control-<UTCstamp>.zip`.
- **GEN-8 Implementation shaping.** The Implementation block lets the operator (a) include/exclude each
  dataset, and (b) for enum-decision datasets (packages) restrict output to a **subset of actions** (e.g.
  a remove-only or disable-only script). Excluded datasets/actions produce no commands for that class.
- **GEN-9 Verification shaping.** The Verification block lets the operator (a) include/exclude each
  dataset, (b) restrict to **only items that deviate from default** for that device, and (c) additionally
  emit a machine-readable **`verification-results.csv`** scaffold (`dataset,key,expected,actual,result`,
  expected pre-filled, actual/result blank).
- **GEN-10 Session-only, per-command, no persistence.** Customisation is four independent in-memory
  option objects; nothing is persisted and no schema changes (per the design principles above).
- **GEN-11 Determinism holds.** With options fixed, every command remains byte-deterministic (DOD-7).

## 20.2 Session config model (`App.ui.views.generate` state)

`_gen` is extended (all fields default to "everything included", so a fresh session reproduces today's
full output):

```js
var _gen = {
  deviceId: null,
  scriptsAsTxt: false,                 // EXISTING global (impl + verify)
  report: {
    sections: {                        // include flags; missing key ⇒ included
      meta: true,                      // Device Config Information (metadata + hashes)
      control: true,                   // Control coverage section
      deviations: true                 // Deviations from default section
      // dataset/sub-table flags are keyed below, data-driven
    },
    datasetSections: {                 // per datasetId. For grouped datasets (packages),
      // 'android.packages': { remove:true, disable:true, keep:true }   // one flag per group
      // 'android.tactical': { _all:true }                              // single-table datasets
    },
    columns: {                         // per datasetId → { columnId: bool }; missing ⇒ shown
      // 'android.packages': { action:true, control:true, rationale:true }
    },
    classification: false              // OFFICIAL: Sensitive banner
  },
  control: { classification: false, includeUncontrolled: false },
  implementation: {
    datasets: {},                      // datasetId → bool; missing ⇒ included
    actions: {}                        // datasetId → { actionValue: bool }; missing ⇒ included
  },
  verification: {
    datasets: {},                      // datasetId → bool; missing ⇒ included
    onlyDeviations: false,
    csvResults: false
  }
};
```

**Missing-key semantics (MUST).** Every include-map treats an absent key as `true`/included. This keeps
the state platform-agnostic (a newly-registered dataset is included by default) and keeps serialized
option objects small; the UI writes a key only when the operator unticks something.

## 20.3 Adapter additions (declarative report metadata)

Two new **optional** adapter fields make report shaping data-driven; the `renderReportSection` signature
gains a third argument. Adapters that omit the new fields keep today's behaviour.

- **`reportColumns: Array<{ id, label, optional:boolean }>`** — the table columns **after** the always-
  present key column, in order. Drives both the column-selection checkboxes (only `optional:true`
  entries are toggleable) and rendering. Android:
  - packages → `[{id:'action',label:'Action',optional:true},{id:'control',label:'Control',optional:true},{id:'rationale',label:'Rationale',optional:true}]`
  - tactical → `[{id:'description',…},{id:'value',…},{id:'control',…},{id:'rationale',…}]`
- **`reportGroups?: { field:string, options:Array<{ value, label }> }`** — declares that the section
  splits into sub-tables by a decision field. Packages only:
  `{ field:'action', options:[{value:'remove',label:'Removed'},{value:'disable',label:'Disabled'},{value:'keep',label:'Kept'}] }`.
  Tactical omits it → single un-split table.

**`renderReportSection(items, ctx, opts)`** — new `opts` shape
`{ columns:{id:bool}, groups:{value:bool} }` (either may be undefined → all included). The adapter MUST:
1. Build the visible column set from `reportColumns` filtered by `opts.columns` (absent ⇒ shown; the key
   column is never dropped).
2. If it declares `reportGroups`, emit **one `<h2>` sub-table per enabled group** (heading
   `"<Label> — <group.label>"`, e.g. `"Packages — Removed"`), skipping groups whose flag is `false`;
   otherwise emit the single table. An enabled table with no matching rows MUST render one
   `<tr><td colspan=…>None.</td></tr>` row (GEN-5).
3. Continue to route **all** dynamic text through `esc()` (§10.3).

A shared helper `App.report.renderTable(title, headerCells, rowsHtml)` SHOULD be added so the three
adapters and the control/coverage builders don't duplicate table markup or the empty-"None" rule.

## 20.4 Reporting generator (`buildReport(project, deviceId, opts)`)

`opts` is `_gen.report` (or an equivalent). Order of the emitted document:

1. **Title** (`h1`, always) + **classification banner** at top if `opts.classification`.
2. **Sections included** table (GEN-4) — always rendered; lists each candidate section
   (Device Config Information, Packages — Removed/Disabled/Kept, Tactical, Control coverage,
   Deviations) with `Included`/`Omitted`, computed from the resolved flags. Built from the same
   descriptor the UI uses, so UI and report never drift.
3. **Metadata block** (device/model/firmware/version/generated-UTC + project & snapshot SHA-256) — only
   if `opts.sections.meta`. Hashes remain inside this block (they are not separately toggleable).
4. **Per-dataset sections** — for each platform dataset, call
   `ds.renderReportSection(gather(...), ctx, { columns: opts.columns[ds.id], groups: opts.datasetSections[ds.id] })`.
   A grouped dataset with all groups off contributes nothing.
5. **Control coverage** if `opts.sections.control`; **Deviations from default** if
   `opts.sections.deviations`.
6. **Classification banner** at the bottom if `opts.classification`.

`App.report.wrapReport(title, meta, sections, wrapOpts)` gains a `wrapOpts.classification` string;
when set it injects a `<div class="classification">…</div>` banner immediately inside `<body>` and again
before `</body>`, plus a print/Word `@page`-friendly style. A `null`/absent metadata block (section 3
omitted) MUST be handled without emitting an empty table.

## 20.5 Control report generator (`buildControlReport(project, deviceId, opts)`)

A standalone document keyed on **controls**, complementary to the report's Control-coverage section:

- For the device, gather effective applicable+complete items across datasets (reusing `gather`, so it is
  override-blind). Group by each item's `controlRefs`.
- Emit **one section per control that is applied** (referenced by ≥1 such item), sorted by control label.
  Each control shows its title/type (and description if present) and a table of the satisfying items:
  `Dataset · Key · Decision` (the decision rendered via the adapter's existing decision-column getter, so
  the reader sees *which action/value* satisfies the control). Controls that are defined but unreferenced
  for this device are **not** listed (it is an "applied controls" report).
- Items whose `controlRefs` is empty are collected under **"(no control)"** and shown only if
  `opts.includeUncontrolled` (default off).
- Metadata block (device info) as in §20.4; classification banner per `opts.classification`.
- Output: `control-report.html` + `manifest.json`, zipped as `<device>-control-<UTCstamp>.zip`
  (`command: 'control'` in the manifest). Same `deviceReady` gating and determinism guarantees.

## 20.6 Implementation generator options (`buildImplementation(project, deviceId, opts)`)

Threaded through the shared `buildScripts` path (§10.1). Two generic, adapter-blind filters applied to
each dataset's `gather`-ed items **before** calling `ds.generateImplementation`:

- **Dataset include** — skip dataset `ds.id` entirely when `opts.datasets[ds.id] === false` (no script
  emitted for that class).
- **Action subset** — when `opts.actions[ds.id]` is present, drop items whose decision value for the
  adapter's **enum decision field** is unticked:
  `items.filter(it => it.decision && opts.actions[ds.id][it.decision[enumField]] !== false)`.
  The enum field is discovered from the adapter's `decisionSchema` (same data-driven route as RV8-2), so
  only packages exposes it; tactical has no enum field and is unaffected. Excluding `keep`
  merely drops the no-op comment lines; excluding `disable`/`remove` yields the useful single-action
  scripts.

The `manifest.decisions` block continues to record the **full** effective decision set for the device
(the manifest documents the device's state, not the filtered emission); the emitted script files reflect
the filters. This is intentional and noted in §20.9.

## 20.7 Verification generator options (`buildVerification(project, deviceId, opts)`)

Same `buildScripts` path, with:

- **Dataset include** — as §20.6.
- **Only deviations** — when `opts.onlyDeviations`, restrict each dataset's items to keys that appear in
  `App.overrides.deviceDeviations(project, deviceId)` for that dataset (a fast re-check of just the
  device/group divergences). With no deviations, the class emits an empty (header-only) verify script.
- **CSV results scaffold** — when `opts.csvResults`, additionally emit `verification-results.csv` with
  header `dataset,key,expected,actual,result` and one row per included item: `dataset` = dataset label,
  `key` = display key, `expected` = the adapter's decision-column display value (generic; no adapter
  change), `actual`/`result` blank for the operator/runner to fill. The CSV is a normal (non-script) file
  → not shell-wrapped, and its cells are RFC-4180 quoted via the existing CSV util. MISSING/EVIDENCED
  semantics are unchanged (no strictness mode in v1.3).

## 20.8 Generate tab UI (§11.5 amended)

The tab keeps the device selector, the ready/blocked line, and the global "scripts as `.txt`" checkbox.
Each command card gains a **collapsible "Options" panel** beneath its Generate button, driven by that
command's `_gen` block; a **fourth card, "Control report"**, is added after Reporting. All controls are
data-driven from the active platform's datasets/adapters (no hard-coded dataset ids):

- **Reporting options:** a "Device Config Information" checkbox; for each dataset either one checkbox per
  `reportGroups` option (Packages: Removed / Disabled / Kept) or a single dataset checkbox
  (Tactical); per-dataset **column** checkboxes from the adapter's `optional` `reportColumns`;
  "Control coverage" and "Deviations from default" checkboxes; and an "OFFICIAL: Sensitive header/footer"
  checkbox.
- **Control report options:** "OFFICIAL: Sensitive header/footer" and "Include items with no control".
- **Implementation options:** a per-dataset include checkbox; for enum datasets (packages) an action-
  subset checkbox group (Keep / Disable / Remove).
- **Verification options:** a per-dataset include checkbox; "Only items that deviate from default"; and
  "Also emit results CSV".

`doGenerate(cmdId)` passes the matching `_gen[block]` object as the `opts` argument to the resolved
`App.generate[cmd.build]`. Gating, the single-zip download, and Activity-drawer logging are unchanged.
Toggling any option only updates session state (+ re-render of the panel); it never touches the project
or dirty state.

## 20.9 Determinism, manifest & schema (unchanged surfaces)

- **Schema:** no change. `schemaVersion` stays at 3; Appendix A untouched. Options are not part of project
  state.
- **Manifest:** shape unchanged (§10.4). It records the device's full effective decisions and the actual
  output files with their `sha256`; it does **not** record the customisation options (the report's
  "Sections included" table self-documents composition; scripts self-evidently contain only what was
  emitted). The Control report adds `command: 'control'` as a new manifest command value.
- **Determinism self-test (§15):** extend the report/impl/verify determinism assertions to fix an
  `options` object alongside the injected clock; assert byte-equality across two runs of identical
  `(project, device, options)`, and add coverage that a **different** options object changes only the
  intended files. Mock-platform portability (DOD-11) MUST stay green with a dataset that declares neither
  `reportGroups` nor `reportColumns`.


---

# 21. v2.0 — retirement of the Settings dataset

This section is **normative** and is the only breaking change in v2.0.

## 21.1 Decision & rationale

The `android.settings` dataset — the register built from `adb shell settings list system|secure|global`
— is **retired**. Android now has exactly **two** datasets: **`android.packages`** and
**`android.tactical`**.

Rationale (product, not technical): every hardening change the fleet actually needs is expressible
through Packages and Tactical. The settings register contributed several hundred to a few thousand
mostly-cosmetic keys per device, each of which had to be individually decided before a device could
reach *ready* (§6.5) — an enormous decision burden for effectively no security benefit, which also
dominated the Deviations, report and verification surfaces.

## 21.2 What is removed (MUST)

- The `android.settings` **adapter** in its entirety: the sectioned `<namespace>:` + `key=value`
  parser, the `setting,description,value` assignment CSV, `decisionSchema`, columns, report section,
  `generateImplementation` (`settings put …`), `generateVerification` (`settings get …`), and
  `capturedDefaults`.
- Its entry in the `android-adb` profile's `datasets` array, and the `Settings (settings.txt)` step
  from `captureInstructions`.
- The `Verify-Setting` helper from the PowerShell `scriptPreamble` (no remaining caller).
- Every reference in the in-app Help manual, the Devices tab copy, and the Generate tab.
- The Settings-specific default column width (§18.9 RV15-1): all datasets now share the 240px key
  default.

**What is deliberately NOT removed:** `shSingleQuote` and the two-layer escaping contract (Appendix B)
— see the note there; and the §8.4 captured-default drift mechanism, which is adapter-driven and
costs nothing when unused.

## 21.3 Backwards compatibility — retired datasets (MUST)

Projects saved by v1.x carry `items['android.settings']`, an `android.settings` snapshot on every
device config, and possibly device/group overrides for it. Those ids are no longer datasets of the
platform, so the Appendix-A cross-check would classify them as *unknown dataset* — i.e. **every
existing project would fail to open**. That is unacceptable, and simply relaxing the unknown-dataset
error is also unacceptable (it would silently swallow a genuine typo).

The resolution is an explicit, named **retired-dataset table** in `projectIo`:

```js
var RETIRED_DATASETS = { 'android.settings': 'Settings' };   // id -> human label
```

- **RET-1 (MUST)** `parseProject` strips every retired id **before** `validateSchema` runs — from
  `items`, from each `DeviceConfig.snapshots`, from each `DeviceConfig.overrides`, and from each
  `DeviceGroup.overrides`.
- **RET-2 (MUST — never silent, §12/DOD-10)** Each retired dataset that was actually present produces
  exactly **one** `warning` Issue, located at the dataset id, stating how many register items and how
  many captured snapshots were dropped and that everything else was kept. It appears in the Activity
  drawer like any other load issue.
- **RET-3 (MUST)** Nothing else in the project is touched: devices, versions, controls, groups, the
  remaining registers, and all history survive. The load succeeds.
- **RET-4 (MUST)** A project with no retired data is a **byte-for-byte no-op** — no warning, and
  `serializeProject(parseProject(text).value) === text`.
- **RET-5 (MUST)** Re-saving after such a load makes the removal permanent, and the second load is
  silent (the operation is idempotent).
- **RET-6 (MUST)** A dataset id that is **unknown but not retired** (e.g. a typo, or a project from a
  different platform) remains a hard **error**. Retirement is an allow-list, not a relaxation.

## 21.4 Acceptance (additive to §1.1)

- **RET-A** Loading a v1.x project that carries the Settings register succeeds, drops exactly the
  Settings items/snapshots/overrides, keeps everything else, and logs one located warning.
- **RET-B** `App.registry.getDataset('android-adb','android.settings')` is `null`, the id is absent
  from `datasetIds`, and no `settings` adapter is exported.
- **RET-C** No generated artifact contains a `settings put`/`settings get` command; no emitted file is
  named `settings.impl.*` or `settings.verify.*`.
- **RET-D** No rendered surface of the app — every Help section, the Devices tab, the Generate tab —
  contains the word "Settings" as a dataset name. (Genuine device data may legitimately contain it:
  the Knox `policyList` includes a policy literally named *Disable Settings*. The check is on app
  chrome, not on data.)
- **RET-E** The portability self-test (DOD-11) still passes: removing a dataset required **no** edits
  to store, registry, diff, completeness, overrides, generate, or the report shell — only the adapter,
  the profile's `datasets` array, and the retired-dataset table.

## 21.5 Consequences for the operator

- The **Onboard** tab now has two file slots. `settings.txt` is no longer captured or uploaded.
- **Readiness** is far easier to reach: only packages and tactical items must be decided.
- The **Implementation** bundle contains `packages.impl.ps1` + `tactical.json`; **Verification**
  contains `packages.verify.ps1` (+ the tactical read-back where exposed). There is no settings script.
- Any hardening previously expressed as a settings value MUST be re-expressed as a package action or a
  tactical policy value, or documented as accepted risk outside the tool.

---

# 22. v2.1 — value formats & the sticky tools rail

Two additive features. Neither changes `schemaVersion` (both extend the project the way
`controlTypes` and `relevance` did) and neither requires a `DatasetAdapter` change, so
**DOD-11 still holds**.

## 22.1 Value formats (VF-1…VF-8)

### Problem

Every tactical decision was a free-text box, because the only type information available
was the captured leaf's JS type, used silently at commit time. On a real Knox capture that
means 134 identical textareas covering four genuinely different shapes — and nothing stops
an operator typing `enabl_both` into a key that accepts exactly three values.

### 22.1.1 The model

- **VF-1 (MUST)** A **value format** declares the shape a decision value may take. Five
  **built-in kinds** need no configuration: `bool`, `number`, `string` (text), `stringArray`
  (a list of strings) and `json` (the raw value, for anything the others cannot represent
  without changing its JSON type). `display(fmt, value)` and `parseInput(fmt, text)` MUST be
  exact inverses for every kind, so an editor round trip can never silently alter a value.
- **VF-2 (MUST — zero configuration by default)** An item with no declared format uses the
  format **inferred from its captured leaf**: `bool`→bool, `int`/`float`→number,
  an all-strings (or empty) array→stringArray, any other array or `null`→json, else text.
  The inference MUST consider the captured **value**, not only its type: a captured
  `[1,2,3]` edited as one-per-line text would come back `["1","2","3"]` and change the
  emitted JSON, so it stays `json`. On the reference capture this yields, with no operator
  action at all: **106 bool · 12 stringArray · 7 number · 9 text**.
- **VF-3 (MUST)** A project MAY carry a top-level **`valueFormats`** array of *named,
  reusable custom formats*; a `RegisterItem` MAY carry **`format`**, the id of a built-in or
  a custom format. Both are optional and additive (no schema bump). A custom format is
  `{ id (slug, unique, never a built-in id), name, kind ∈ options|number|string|stringArray,
  description?, options?, min?, max?, pattern? }`, where `options` is an ordered list of
  `{ value, description }`. **Option order is meaningful** (it is the order of the picker)
  and MUST NOT be sorted by canonical serialization; the `valueFormats` array itself sorts
  by `id`.
  A **dangling `format` ref MUST NOT block loading** — it degrades to the inferred built-in
  and is flagged so the UI can say so. Only the *type* of `format` is structural.
- **VF-4 (MUST)** The item's expander offers a **Value format** picker (Automatic + the
  built-ins + the project's formats) and a route into the manager. It appears **only** for
  datasets whose primary decision field is a value (`string`/`value-typed`); a packages
  action is already a closed enum, so a value format there is meaningless.
- **VF-5 (MUST)** A **manager** creates and edits custom formats: name, kind, description,
  and — for `options` — a table of allowed values each with a **description of what that
  option does**. It shows how many items use each format. `store.addValueFormat` /
  `updateValueFormat` / `removeValueFormat` are transactional; **remove strips the id from
  every item that referenced it** (those items fall back to their inferred format) and MUST
  NOT alter any decision.
- **VF-6 (SHOULD)** `store.setItemFormats(datasetId, keys, formatId)` applies one format to
  many items in a single transaction, so a shared vocabulary is assigned once. Formats being
  *named and reusable* is the point: the two per-SIM 5G mode keys share one definition
  rather than each carrying its own copy of the option list.

### 22.1.2 Enforcement (VF-7)

- **VF-7 (MUST)** A value that does not satisfy its format is an **error**: the item is not
  complete, so its device cannot reach *ready* and cannot generate. This is what makes a
  "required format" required. Enforcement lives in `App.completeness.itemComplete`, not in
  the adapter, because the format catalogue is project state and adapters are project-blind;
  `project`/`captured` are optional parameters so every pre-existing caller is unaffected.
- **VF-7a (MUST)** Enforcement applies to the **effective** decision (OVR-3), so a device or
  group **override** that violates the format blocks readiness exactly as a default would.
- **VF-7b (MUST)** It MUST NEVER block loading, parsing or saving — only readiness.
- **VF-7c (MUST)** A captured value outside a declared vocabulary MUST stay **visible and
  selected**, marked *(not an allowed value)*, rather than being snapped to a legal option.
  That mismatch is the finding, and hiding it would be worse than not enforcing at all.

### 22.1.3 Editors (VF-8)

- **VF-8 (MUST)** The rendered editor is chosen by the resolved format: `bool` → a
  true/false picker; `number` → a numeric box; `options` → a `<select>` whose entries read
  **`value — what it does`**; `stringArray` → a one-per-line box; `string`/`json` → a
  wrapping textarea. The control carries `data-fmt-kind` so the commit path reads it back
  through `parseInput` — the exact inverse of what rendered it.
- **VF-8a (MUST)** An empty box means what makes sense for its kind: **text** → `''` (a real
  blank value, preserving review-16 #1), **string list** → `[]` (a real empty list — most
  Knox whitelists are exactly this), **bool/number/options** → **undecided**.
- **VF-8b (MUST)** The **same** editor is used by the data table, the device-config override
  panels and the group-deviation editor. A boolean must not be a true/false picker in one
  place and a textarea in another. The override editors resolve their format from the
  **captured** leaf, not from the (usually empty) override value.

## 22.2 The sticky tools rail (SP-1…SP-3)

- **SP-1 (MUST)** The **mode** controls — Apply Control Mode, Delete Items, Undo/Redo — move
  out of the filter toolbar into a **tools rail** on the right of the table. The toolbar
  keeps only filters (search, Incomplete only, the parked-relevance toggles, the counts).
- **SP-2 (MUST)** The rail is **`position:sticky`** inside a flex wrapper around the table,
  so it stays in view as a long register scrolls: on a 438-row Packages table the control
  being assigned is reachable from the last row without scrolling back to the first. It is
  collapsible (UI state only, per dataset) and stacks above the table below ~1100px.
- **SP-3 (MUST)** The control picker is a scrollable **card list**, not an `<input list>` +
  `<datalist>`. Each card shows the control's **title, type and description**; the list is
  filterable across all three; clicking the selected card deselects it. A control with no
  description says so rather than rendering blank.
  > This **supersedes RV8-1** (§19.11), which required a name-only picker *because* a
  > `<datalist>` could not legibly show anything else. The description is precisely what
  > tells an operator what a control means while they are assigning it.
- **SP-3a (MUST)** The "Apply to `<action>`" bulk toggle (RV8-2/RV9-1) moves into the rail
  beneath the picker, since it acts on the selected control. It remains enum-only.
- **SP-4 (MUST — the layout sticky depends on).** `position:sticky` fails **silently** when
  the surrounding layout is wrong, so these four properties are binding, not incidental:
  1. `#app-root` has a **fixed** `height:100vh`. With `min-height` it grows with its content,
     the **body** scrolls, and `.main`'s `overflow:auto` never actually scrolls.
  2. `.main` keeps `overflow:auto` **and** `min-height:0` — a flex child will not shrink
     below its content height without it, so `.main` would overflow the shell and nothing
     would scroll.
  3. `.side-rail` is `position:sticky` with an inset (`top:0`) and `align-self:flex-start`;
     a stretched flex item fills the row and has no room to stick.
  4. Nothing between the rail and `.main` sets `overflow` — the **nearest overflow ancestor
     becomes the sticky scrollport even if it never scrolls**, which is precisely how this
     shipped broken once: `.main` was the sticky scrollport but the body did the scrolling,
     so the rail pinned itself to a viewport that never moved.
  Because none of this is visible to render-to-string tests, it MUST be covered by
  assertions over the stylesheet itself (§22.3 SP-B).
- **SP-5 (MUST)** With `.main` as the scroll region, replacing its `innerHTML` resets
  `scrollTop`. Everyday actions re-render (picking a control, ticking an Apply checkbox,
  editing a decision), so the main scroll offset and the rail's own list offsets MUST be
  captured before a render and restored after — otherwise every click jumps to row 1, which
  is the very problem the rail exists to solve. Scroll is preserved **within** a tab only:
  changing tab lands at the top of the new one.

## 22.4 Bulk assignment over the shown set, and holding a decision (v2.1.1)

### BULK-1 (MUST) — apply the selected control to everything currently shown
The rail carries a single **"Apply to all N shown"** button. *Shown* means exactly what the
table is displaying — whatever the search box and every filter (Incomplete only, the parked
toggles) have narrowed it to — so `search: bluetooth` followed by one click tags every
Bluetooth-related item. It toggles like RV9-1: when every shown row already carries the
control the button reads **"Remove from all N shown"** and the click takes it off.

This **supersedes RV8-2/RV9-1's "Apply to `<action>`" dropdown** (§19.11), which could only
slice by an enum decision field. That made it packages-only and unable to express the query
people actually have ("everything to do with Bluetooth"). The replacement is
**dataset-agnostic**, so Tactical gets it too.

The button's LABEL and the click's ACTION MUST come from **one** shared plan
(`App.ui.model.applyAllShownPlan`), so the count the button promises and the set it acts on
cannot drift. The whole run is one undo entry, and the Activity log records the count and
the search term in force.

### BULK-2 (MUST) — every checkbox in a table cell is a full-cell hit target
**Any** bare checkbox occupying a table cell MUST be wrapped in a cell-filling `<label>` so a
click anywhere in the cell toggles it; a ~16px target in a 74–110px cell is a precision task
repeated hundreds of times. This covers the data tables' **Apply** and **Delete** columns and
the Control Manager's **per-device** columns (`.cm-dev-cell`).

It MUST remain a real `<input type="checkbox">` with its `aria-label` — a click handler on the
`<td>` would lose keyboard and screen-reader access — and clicking the box itself MUST toggle
exactly once, not twice (a `<label>` wrapping its own input is a classic double-fire trap).

A checkbox that already sits inside a `<label>` **with visible text** (the Control Manager's
"Device columns" bar and its row-expander "Applies to" list, the Control Refs multi-select) is
already a large target and needs no change — the rule is about *bare* boxes in cells.

### HELD-1 (MUST) — flag for review without losing the answer
`RegisterItem` MAY carry **`held: true`** meaning *"this has a value, and I want to look at
it again"*. Its `decision` is untouched. The item is simply **not complete** (HELD-2), so it
reads as undecided, blocks device readiness, and is excluded from generation until released.
Additive and optional; `held` is only ever `true` when present (canonical form omits it).

- **HELD-2 (MUST)** `completeness.itemComplete` returns false for a held item before any
  other check. Readiness and generation therefore honour it automatically.
- **HELD-3 (MUST)** The **Status badge flip** holds rather than clears: clicking
  <em>decided</em> moves the item to held **with its value intact**, and clicking again
  releases it back to decided with the same value. Wiping a value remains the job of the
  cell's explicit **clear** button — the two actions are deliberately different.
- **HELD-4 (MUST)** Editing the value releases the hold, because editing *is* reviewing.
- **HELD-5 (SHOULD)** A held item gets its **own badge** ("review"), distinct from
  "undecided": being able to tell "answered, re-check me" from "never answered" at a glance
  is the reason the state exists. It appears in the data tables and the device panels.
- **HELD-6 (MUST)** Holding an item that has no value is refused — there is nothing to review.

## 22.5 Layout stability, column-wide assignment, control tags (v2.1.2)

### STAB-1 (MUST) — a tick must not change a row's height
Cells whose text GROWS as a side effect of ticking a box — the data tables' **Control Refs**
and **Applies to**, the Control Manager's **Applies to** and **Tags** — MUST render inside a
**fixed-height** clamp with the full value on the element's `title`.

The failure this prevents is subtle and was user-reported: ticking a checkbox adds a name to a
neighbouring cell, that cell wraps onto another line, the **row** grows, and every row below it
slides down — so the next box you meant to click has moved. `scrollTop` never changes, which is
why it presents as "it moves *slightly*" rather than as a scroll jump.

A height **range** (e.g. a 2-line clamp) is NOT sufficient: going from zero lines to one still
grows the row. The height is fixed at one line, and the clamp span is emitted **even when
empty**, so an empty cell is exactly as tall as a full one.

### STAB-2 (MUST) — anchor the scroll to what the user is touching
Restoring `scrollTop` across a re-render is not enough on its own, because content *above* the
viewport can legitimately change height. The renderer MUST also record the viewport offset of
the focused element (built from its own `data-*` attributes into a re-queryable selector) and,
after rendering, shift `scrollTop` by however much that element moved. The element under the
cursor then stays under the cursor whatever else reflows. Best-effort: anchoring must never
throw or block a render.

### TAG-3 (MUST) — a device column heading assigns the whole shown column
In the Control Manager, each per-device column's **heading is a button**: it assigns that device
to **every control currently shown** (search included), so onboarding a device and giving it a
searched-for set of controls is one click. When every shown control already has the device the
heading marks itself and the same click removes it from all of them. It keeps the review-12 #1
contract: assigning seeds `deviceStates[baseId] = 'unsatisfied'`, un-assigning drops it.

### TAG-1/TAG-2 (MUST) — custom tags on controls
A `Control` MAY carry **`tags: string[]`** — a free, multi-valued classification, distinct from
its single `type` (e.g. marking administrative controls that are tracked but never actioned
through the tool). A project MAY carry a top-level **`controlTags: string[]`** catalogue; the
picker offers the catalogue ∪ the tags in use, so a tag never silently vanishes. Additive: no
`schemaVersion` bump. An empty `tags` list is dropped so "no tags" has one canonical form, and
both arrays serialise sorted.

Tags are applied through a **sticky tools rail on the Control Manager**, mirroring the data
tabs' Apply Control Mode (SP-1…SP-3): an **Apply Tag Mode** toggle, a create-tag box, a
filterable picker showing each tag's usage count, a per-row **✓ Tag** tick column, and a
**Tag all N shown** button with the same toggle-to-untag semantics as BULK-1. The Control
Manager's search MUST match tags as well as title/type/description. Deleting a tag strips it
from every control and changes nothing else.

## 22.3 Acceptance (additive to §1.1)

- **VF-A** With no configuration, every leaf of the reference Knox capture resolves to a
  sensible editor, and deciding every item *as captured* still reaches **ready** — i.e.
  turning formats on introduces no false blocking.
- **VF-B** A named `options` format assigned to two keys renders a described dropdown on
  both, round-trips byte-identically, and rejects an out-of-vocabulary value by blocking
  completeness with a located reason.
- **VF-C** Deleting a format clears the ref from its items and changes no decision; a
  dangling ref still opens.
- **SP-A** Every mode control renders inside the rail and every filter outside it; the rail
  collapses; the picker shows title, type and description and filters on all three.
- **SP-B** The four SP-4 layout properties are asserted against the stylesheet, and the
  assertions must FAIL if any is reverted (verify by reverting one).
- **SP-C** In a real browser, with a register long enough to scroll, the rail's viewport
  offset is **constant** across scroll depths, and the scroll position survives selecting a
  control. This is a browser check — it cannot be established by reasoning about the CSS.
- **BULK-A** With a search active, the button names the shown count, acts on exactly that
  set, leaves every hidden row untouched, and flips to "Remove from all" on a second run.
- **BULK-B** In a real browser, for the data tables **and** the Control Manager's per-device
  columns, a click on cell *whitespace* toggles the tick, and a click on the box itself
  toggles it exactly once.
- **STAB-A** In a real browser, with the list scrolled, ticking a checkbox leaves the ticked
  cell at the **same viewport offset** — verified repeatedly, not once.
- **TAG-A** A device column heading assigns only the shown controls, toggles back off, and
  seeds/drops `deviceStates`. A tag can be created, applied to the shown set, searched for,
  round-tripped, and deleted without touching anything else about its controls.
- **HELD-A** Flipping a decided item retains its `decision` byte-for-byte, marks it held,
  drops the device out of ready, and excludes it from the generated script; flipping back
  restores the same value. Editing releases the hold; `clear` still clears.
