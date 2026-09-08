# CH Config Tool — working notes for Claude

Offline, single-file HTML app for Cyber-Hardening (CH) configuration management. It is a **pure
generator**: it ingests captured config files, records hardening decisions once and inherits them
across devices, and emits the scripts/config/reports implementing those decisions. **It never
contacts a device or the network.**

The deliverable is one file: **`ch-config-tool.html`**, opened by double-clicking (`file://`).
It is BUILT from `src/` — see below.

---

## The source tree, and the file it builds

**`ch-config-tool.html` is a build artifact — never edit it.** A `PreToolUse` hook refuses the
edit, and the next build would overwrite it regardless. The sources live in `src/` (~150 files),
and the build is:

```bash
python3 tools/build.py
```

That concatenates the files named in `src/build.json`, in order, into the one deliverable. There
is no bundler and no transpiler: every fragment is already ordered classic-script JavaScript, so
the build is a concatenation and the load order (spec §14) stays visible in one readable manifest.

To work on something:

1. **Find it in the code map** below → it names the source file, or the directory of fragments.
2. **Read that file.** It is at most 500 lines, so read it whole. There is no longer any reason to
   open the built file — and the map, not a line range, is what you navigate by.
3. **Edit, then build.** A `PostToolUse` hook rebuilds and refreshes the map after any edit under
   `src/`; run `python3 tools/build.py` yourself if you changed things another way.

### The 500-line rule

No source file exceeds 500 lines. `tools/build.py` enforces it and fails the build on a violation,
so the rule does not erode quietly. Files are packed to ~380 lines, leaving headroom to grow.

Exactly two files are exempt, each listed with its reason in `src/line-cap-exemptions.txt`: both
are a single `wire()` function longer than the cap, which no file boundary can cut. Split the
function into per-concern wiring helpers when you next work in that view, then delete its line
from the allowlist. Adding a NEW entry is a deliberate, reviewable act — if a new file will not
fit under the cap, that usually means it is doing two things.

### Splitting a module across files

A module too big for one file becomes a directory of **fragments** — `src/js/0220-store/010-….js`,
`020-….js`, … — concatenated inside ONE `<script>` IIFE. They share a closure, which is why a
fragment is not standalone-valid JavaScript: helpers declared in `010-` are in scope in `030-`.
Cut only at a top-level statement boundary. `tools/split-source.py` does this mechanically if a
layout ever needs redrawing wholesale; day to day you just add a file and list it.

**A new fragment goes BEFORE the block's last one**, because the last fragment carries the closing
`})(App);`. List it after the final entry in `build.json` and the code lands outside the closure,
where the module's helpers are not in scope — it then fails in the console at load, NOT in the
self-test suite, so the suite still reports all green. `tools/build.py` refuses the build in that
case and names the file; heed it rather than working around it.

### Conventions that keep the map useful

- **A new module** gets its own file AND its own `script` entry in `src/build.json`, placed before
  the bootstrap entry. It opens with the standard `MODULE: / PURPOSE: / PURITY: / DEPENDS:` banner.
  A file that is not named in `build.json` is not built — the build reports it as an orphan and
  fails, so it cannot go unnoticed.
- **A new test suite** goes under a `/* ===== SUITES: <feature> ===== */` section banner, in a
  fragment under the relevant test block's directory. Start a new banner for a new feature rather
  than appending to whatever is last. The big v1.1 block shares nine helpers (`ensureA`, `snapB`,
  `r12Project`, `H`, `applyRun`, `refCounts`, `sheet`, `cssRule`) declared in its first fragment
  and used throughout — that shared closure is exactly why these are fragments and not modules.
- **Embedded binary assets** live alone in `src/style/040-assets.css`, never inline in readable CSS.

### Concurrency note

More than one Claude session is sometimes working in this repo at once. Prefer `Edit` over `Write`
(`Edit` fails loudly on a stale read; `Write` silently clobbers). The split helps here: two
sessions working on different modules now touch different files, where before they contended for
one. `ch-config-tool.html` changing under you is normal — it means another session rebuilt it.

---

## Hard invariants — do not regress these

These come from the spec (§3, §6, §8.6, §10.4) and are the source of most historical defects.

- **One file, no imports.** Ordered classic `<script>` IIFEs attaching to a single global `App`.
  Never `type="module"`; no cross-file imports; no external URLs of any kind.
- **No network. Ever.** No `fetch`/XHR (blocked on `file://` anyway), no telemetry, no CDN, no web
  fonts. All input arrives via `<input type="file">`; all assets are inlined as data-URIs.
- **`crypto.subtle` may be undefined** on `file://` (not a secure context). Hashing uses the
  vendored pure-JS SHA-256 in `App.util.hash` — never Web Crypto.
- **Determinism.** Serialized state and emitted artifacts are byte-stable for identical input.
  Timestamps come only from `App.util.clock` (injectable); no `Date.now()`/`Math.random()` in engine
  paths. ZIP entries use a fixed DOS date (1980-01-01) and fixed attribute fields.
- **One `.zip` per generator** *for the download path*. Browsers throttle rapid multiple downloads.
  A folder write is not a download, so when a folder is connected the same `files[]` are written
  unpacked to `Outputs/<device>/<command>/` instead (`folder-storage-requirements.md` §9).
- **Browser storage is never canonical state** — origin is unreliable and shared under `file://`.
  Canonical state is the downloaded project file, or `project.json` in a connected folder.
  `App.util.idbKv` holds exactly two things: the directory handle, and a clearly-labelled ~5s draft
  autosave that is crash insurance only. The IndexedDB *fallback driver* in
  `Reference Files/local-folder-storage.md` is deliberately **not** implemented — it would make
  IndexedDB canonical.
- **The File System Access API is local I/O, not network.** It does not weaken the no-network rule.
  `showDirectoryPicker()` works on `file://`; `requestPermission()` needs a user gesture and must
  never be called on load. A directory handle survives a browser restart but **its permission grant
  does not** — `NEEDS_PERMISSION` is a normal status, not an error.
- **Recorded risk (accepted by the user, 2026-08-18):** every `file://` page shares one origin and
  therefore one IndexedDB, so any other local HTML file can read the stored directory handle *with
  its granted read-write access to the project folder*. Mitigated only by namespacing the DB name.
  See `folder-storage-requirements.md` §2.2.
- **Dependencies point downward only:** UI shell → engine (pure) → adapters (pure) → util/IO. Engine
  and adapters touch no DOM and do no I/O.
- **Load order (spec §14):** types → util.\* → registry → projectIo → store → diff → validation →
  completeness → report → generate → adapters → platform → ui.\* → bootstrap. New modules go before
  the bootstrap marker.
- **DOD-11: a new dataset or platform needs no core edits** — adapter/profile only. If a change
  requires touching generic machinery to add a dataset, it is the wrong change.

Verify with the embedded suite: open `ch-config-tool.html#selftest` (must be all green), or run it
headlessly — see `progress-log.md`.

---

## Which document to read for what

Everything here is large. Read the *section*, not the file — all four big docs have a heading index
you can `grep -n "^## "` first.

| Task | Read | Notes |
|---|---|---|
| Change behaviour / settle "should it do X?" | `android-ch-config-tool-build-spec-v2.0.md` §0 is a TOC | **Normative.** 174 KB — never read whole. §7 is the module catalogue, §6 the data model, §17 appendices. |
| Understand what a phase/task was meant to deliver | `android-ch-config-tool-task-breakdown-v2.0.md` | Per-phase task list behind the spec. §A holds the global rules every task honours. |
| Find out what was already built and why | `progress-log.md` | Phase status table at the top; the chronological log starts at `## Log`. |
| Check a known defect before "fixing" it | `defect-register.md` | Small (7 KB). Read it whole. |
| Manual/hardware validation | `validation-testing-plan.md` | Not needed for code changes. |
| The folder-storage build (connect to a OneDrive folder, autosave, snapshots, Outputs/) | `folder-storage-requirements.md` | **The one being built.** Single-user, single-project, rollback-oriented. §1.4 records the decisions; §14 is the task list. |
| The larger multi-user config store | `config-store-requirements.md` | Forward-looking, **not** being built. Content-addressed and immutable — incompatible with `folder-storage-requirements.md`; see its §1.3. |
| User-facing behaviour summary | `README.md` | Quick start, input formats, outputs, DOD checklist. Small — read it whole. |

`Archive/` holds superseded v1.0 documents, kept only for the audit trail. Do not consult them for
current behaviour.

---

## Building, and regenerating the code map

**After any change under `src/`, run both:**

```bash
python3 tools/build.py        # assemble ch-config-tool.html from src/
python3 tools/gen-code-map.py # refresh the map below
```

A `PostToolUse` hook in `.claude/settings.json` runs both automatically after Claude edits anything
under `src/`, and `.githooks/pre-commit` rebuilds and re-maps a commit that needs it. Neither is
required for the tools to work. To verify without writing: `python3 tools/build.py --check` and
`python3 tools/gen-code-map.py --check`.

`tools/build.py --check` is also the guard that a source file has not drifted over the cap, and
that every file on disk is actually wired into `src/build.json`.

Enable the git hook once per clone:

```bash
git config core.hooksPath .githooks
```

---

<!-- BEGIN GENERATED CODE MAP -->

_Generated by `tools/gen-code-map.py` from `src/` (158 source files). Do not edit by hand — re-run the script._

**Stylesheet:** `src/style/` (4 files). The embedded brand logo is parked alone in `src/style/040-assets.css` — a single ~19 KB base64 line, never worth opening.

### Modules (50)

| Source | Module | Purpose |
|---|---|---|
| `src/app/js/0020-types.js` | **App.types** | Central home for the JSDoc typedefs used as the shared type vocabulary across modules (spec §5/§6/§13.2). No runtime behaviour — typedefs are documen… |
| `src/app/js/0030-util-clock.js` | **App.util.clock** | Single, injectable time source so all timestamps are deterministic and testable (spec §13.4, C-6). Engine code MUST source time here. |
| `src/base/js/0040-util-html.js` | **App.util.html** | HTML escaping and tiny string builders. ALL data-derived text written into HTML (tables, reports, generated docs) MUST pass through esc() to prevent… |
| `src/app/js/0050-util-hash.js` | **App.util.hash — VENDORED SHA-256** | Pure-JS SHA-256 over UTF-8 strings/bytes. REQUIRED because window.crypto.subtle may be undefined on file:// (spec §3, C-7). |
| `src/app/js/0060-util-crc32.js` | **App.util.crc32 — VENDORED CRC-32** | Standard table-based CRC-32 used by the ZIP writer (spec §17.C.2). |
| `src/app/js/0070-util-zip.js` | **App.util.zip — VENDORED store-only ZIP writer** | Build a valid store-only (no compression) ZIP as a Blob, on file:// without any library (spec §17.C.3, §10.4). |
| `src/app/js/0080-util-csv.js` | **App.util.csv** | Deterministic CSV export of a table (spec §7, §11.1 Export CSVs). |
| `src/base/js/0090-util-dom.js` | **App.util.dom** | Thin DOM helpers + the download primitive. This is the ONLY util that touches the DOM / FileReader / downloads (spec §4.1, §7). |
| `src/base/js/0100-util-stable.js` | **App.util.stable** | Deterministic JSON serialization (spec §8.6). The single canonical stringifier used for the project file, manifests, and tactical artifact. |
| `src/app/js/0110-util-idb-kv.js` | **App.util.idbKv — TF.1: a key/value shelf that survives a restart** | Promise-wrapped IndexedDB, used for exactly two things: the FileSystemDirectoryHandle (structured-cloneable, so it survives a browser restart) and th… |
| `src/app/js/0120-storage.js` | **App.storage — TF.2/TF.3: the shared vocabulary of the storage layer** | Status constants, the normalised error shape, and path helpers that the drivers and the folder store both speak. Kept in its own tiny module so neith… |
| `src/app/js/0130-storage-driver-memory.js` | **App.storage.driverMemory — TF.2: the reason any of this is testable** | A Map pretending to be a folder. Implements the driver contract exactly, including fault injection, so every policy above the driver line — snapshot… |
| `src/app/js/0140-storage-driver-fsa.js` | **App.storage.driverFsa — TF.3: real files in a real folder** | The File System Access API behind the driver contract. Deliberately the THINNEST module in the storage layer, because it is the only one that cannot… |
| `src/app/js/0150-storage-folder.js` | **App.storage.folder — TF.4: the layout, the snapshot policy, the guard** | Everything the storage layer decides, sitting above a driver that only moves named text. Owns the on-disk layout, the snapshot-before-write policy, p… |
| `src/app/js/0160-storage-writer.js` | **App.storage.writer — TF.5: the 60s idle / 180s capped debounce** | The save POLICY, kept out of the folder store so both stay trivially testable. Coalesces a burst of edits into one write, guarantees only one write i… |
| `src/doc/js/0170-md/` (4 files) | **App.md — MD-1: LaTeX-safe markdown primitives** | The single choke point through which every data-derived string passes on its way into a generated document, exactly as App.util.html.esc is for the H… |
| `src/base/js/0180-test.js` | **App.test — embedded test harness** | Tiny in-file test runner (spec §15). assert/assertEqual(deep)/ assertDeepEqual + suite/test registrar. Runs only on #selftest or via a dev button; MU… |
| `src/app/js/0200-registry.js` | **App.registry** | Platform/adapter registration (spec §5.3). The generic machinery discovers datasets/columns/decision-schemas by iterating the active platform — it ne… |
| `src/app/js/0210-project-io/` (5 files) | **App.projectIo** | (De)serialize, schema-validate (Appendix A), and migrate the project file (spec §6.1, §7, §17.A). Canonical (de)serialization is the basis of DOD-2 (… |
| `src/app/js/0220-store/` (4 files) | **App.store** | In-memory project + mutations + change events (spec §7.1). Holds the single mutable copy of canonical state; exposes deep-readonly snapshots and an e… |
| `src/app/js/0240-adapters-android/` (3 files) | **App.adapters.android** | The Android (ADB) dataset adapters (spec Appendix B) + the two-layer shell-escaping helpers + tactical path/flatten/rebuild utilities. ALL Android/fo… |
| `src/app/js/0250-platforms-android-adb/` (3 files) | **App.platforms.androidAdb** | Assemble the Android (ADB) PlatformProfile from its dataset adapters plus platform-level output conventions (spec Appendix B). This is the ONLY place… |
| `src/app/js/0270-diff.js` | **App.diff** | Triage a snapshot's keys against the register (spec §8.1): split into new (append as undecided) and existing (inherited). Keys present in the registe… |
| `src/app/js/0280-validation.js` | **App.validation** | Cross-cutting structural checks beyond projectIo's schema validation (spec §7, §12): onboarding input validation and a whole-project pass. |
| `src/app/js/0290-completeness.js` | **App.completeness** | Item completeness & device readiness (spec §6.5, §8.3). Wraps the adapter's isComplete with the optional REQUIRE_CONTROL_REF policy fold, and compute… |
| `src/app/js/0300-value-formats.js` | **App.valueFormats — v2.1 (VF-1…VF-8)** | Declare and enforce the SHAPE a decision value must take, so a free-text box stops being the answer to every question. Four built-in kinds (bool / nu… |
| `src/app/js/0310-overrides.js` | **App.overrides** | The single choke point (spec §19.2.3, OVR-3) that resolves the default → group → device decision chain for an (item, device) pair, classifies value d… |
| `src/doc/js/0320-doc-format/` (4 files) | **App.docFormat — FMT-1..FMT-4: named formatting profiles** | Everything about how the finished document PRESENTS itself — heading styling per level, page size and margins, page numbers, table of contents — as a… |
| `src/doc/js/0330-doc/` (2 files) | **App.doc — DOC-1..DOC-4: the document outline, numbering and renderer** | Turn an ordered list of report BLOCKS into a numbered, cross-referenced markdown document. Owns four things the generators must not each re-invent: h… |
| `src/doc/js/0340-report.js` | **App.report** | Platform-agnostic MARKDOWN section builders (spec §10.3, DOD-8). Turns an adapter's DECLARED report columns into a markdown table, and the device met… |
| `src/doc/js/0710-doc-providers.js` | **App.docProviders — the declarative half of the section contract** | Turn a section PROVIDER — a declaration of rows, a key column and columns — into rendered markdown, so a host that only wants a table does not have t… |
| `src/doc/js/0720-doc-blocks.js` | **App.docBlocks — how a block is ordered, and how its table is worded** | Four helpers that decide the ORDER blocks are emitted in and the WORDING a generated table carries — its column headings, its title row and its capti… |
| `src/app/js/0350-generate/` (4 files) | **App.generate** | Orchestrate the three INDEPENDENT generators (spec §7, §10): gather a device's applicable+complete items per dataset, call adapter generators + platf… |
| `src/app/js/0360-ui-model.js` | **App.ui.model** | PURE view-model helpers shared by the UI views: latest-version resolution, applicability map, and search/sort/filter of table rows. Kept pure so the… |
| `src/app/js/0370-ui-activity.js` | **App.ui.activity** | The append-only Activity/Errors drawer log (spec §11.6). Nothing in the app fails silently — parse/validation/generation results land here. |
| `src/app/js/0380-ui-tables/` (4 files) | **App.ui.tables** | Render a data-driven data-table tab to an HTML string (spec §11.2). Columns come from adapter.columns plus computed "Applies to"/"Status". NO hardcod… |
| `src/app/js/0390-ui-views-onboard.js` | **App.ui.views.onboard** | The Onboard tab (spec §11.4): one data-driven file slot per active-platform dataset), name/model/firmware fields, a gated Onboard button, capture hel… |
| `src/app/js/0400-ui-views-generate/` (2 files) | **App.ui.views.generate** | The Generate tab (spec §11.5): device selector + three INDEPENDENT commands (Implementation/Verification/Reporting), each enabled iff the device is r… |
| `src/app/js/0410-ui-views-devices/` (3 files) | **App.ui.views.devices** | The Devices tab (spec §11.3, DOD-9). Lists device configs grouped by baseId (latest = active; older = superseded read-only history), and a read-only… |
| `src/app/js/0420-ui-views-controls/` (2 files) | **App.ui.views.controls** | The Control Manager tab (spec §18.3 CTL-1/CTL-4): view/add/edit/remove controls (title, type, description, assigned device configs). Decision assignm… |
| `src/app/js/0430-ui-views-formats.js` | **App.ui.views.formats — VF-5 "Value formats" manager** | Create and edit the project's NAMED, REUSABLE value formats: a left list of formats, a right editor for the selected one, and — for the `options` kin… |
| `src/app/js/0440-ui-views-help/` (3 files) | **App.ui.views.help** | In-app manual (spec §11, Phase 8; rewritten review-15). One section per area of the app, reached from a section strip so no single page is a wall of… |
| `src/app/js/0450-ui-folder/` (2 files) | **App.ui.folder — TF.6/TF.8/TF.9/TF.11: the folder, as the app sees it** | The single seam between the storage layer and the rest of the UI. Owns the folder store and the writer, the connect/reconnect/recovery/divergence scr… |
| `src/app/js/0460-ui-app/` (5 files) | **App.ui.app** | The UI shell + controller (spec §11.1). Builds the top bar, the data-driven tab nav (one tab per active-platform dataset + Devices/ Onboard/Generate)… |
| `src/doc/js/0550-doc-store/` (4 files) | **App.docStore — DS-1..DS-6: the Report Design mutators** | Every write the Report Design workspace makes to the project — heading levels, custom sections and their parts, formatting profiles, section template… |
| `src/doc/js/0560-doc-templates.js` | **App.docTemplates — TPL-1..TPL-4: templates in and out, on their own** | Export and import section templates, formatting profiles and whole report templates as standalone files, independently of the project. Owns the merge… |
| `src/doc/js/0570-ui-md-preview/` (2 files) | **App.ui.mdPreview — PRV-1: markdown -> HTML for the live preview** | Render the EXACT markdown the Generate button downloads into browsable HTML, plus the outline needed to navigate it. Not a general markdown implement… |
| `src/doc/js/0580-ui-rich-text.js` | **App.ui.richText — RTX-1: the box shows what it holds** | Turn the {{...}} token markup App.md.rich reads into HTML a contenteditable box can be edited in, and turn the edited box back into tokens. Bold read… |
| `src/doc/js/0590-ui-views-report-design/` (8 files) | **App.ui.views.reportDesign — RD-1..RD-7: the Report Design workspace** | The full-screen workspace that decides what the document contains, in what order, at what heading level, with what hand-authored sections, under whic… |
| `src/app/js/0620-bootstrap.js` | **App.bootstrap — LAST. Registers platforms and mounts the UI.** | Wire everything together at startup (spec §14). During Phase 0 it only renders self-tests on #selftest and a placeholder otherwise. |

### Exported surface

- **`App.util.clock`** — `nowIso`, `setClock`, `resetClock`, `toAest`
- **`App.util.html`** — `esc`, `attr`, `el`
- **`App.util.hash`** — `sha256Hex`, `sha256Bytes`, `utf8Bytes`
- **`App.util.crc32`** — `crc32`
- **`App.util.zip`** — `zip`, `zipBytes`
- **`App.util.csv`** — `toCsv`, `parseCsv`
- **`App.util.dom`** — `mount`, `clear`, `on`, `download`, `readFileText`
- **`App.util.stable`** — `stableStringify`
- **`App.util.idbKv`** — `available`, `get`, `set`, `del`, `DB_NAME`
- **`App.storage.driverMemory`** — `create`
- **`App.storage.driverFsa`** — `create`, `supported`, `PICKER_ID`
- **`App.storage.folder`** — `create`, `isoToStamp`, `stampToIso`, `stampOf`
- **`App.storage.writer`** — `create`, `IDLE_MS`, `CAP_MS`
- **`App.md`** — `text`, `latex`, `code`, `cell`, `CELL_BREAK`, `isLongIdentifier`, `IDENT_MIN`, `heading`, `para`, `rule`, `pageBreak`, `rawLatex`, `centred`, `vspace`, `rowStrut`, `mmLen`, `MAX_MM`, `table`, `pipeTable`, `gridTable`, `widthsFor`, `autoWidths`, `wrapLine`, `WIDTH_BUDGET`, `HEAD_SHADE_OPEN`, `HEAD_SHADE_CLOSE`, `COL_SHADE`, `HEAD_CELL_SHADE`, `human`, `humanInline`, `HUMAN_EMPTY`, `rich`, `richCell`, `cellText`, `plain`, `TOKEN`, `REF_TAG`, `_safeCut`, `autoLink`, `join`, `yaml`, `anchor`, `hostileChars`
- **`App.test`** — `suite`, `run`, `runAndRender`, `assert`, `assertEqual`, `assertDeepEqual`, `assertThrows`, `deepEqual`
- **`App.registry`** — `registerPlatform`, `listPlatforms`, `hasPlatform`, `getPlatform`, `getActivePlatform`, `setActivePlatform`, `getDataset`, `datasetIds`, `_reset`, `isVirtualDataset`, `deviceHasDataset`, `applicableKeys`, `applicableKeySet`, `baseApplicableKeys`, `deviceScope`, `latestConfigs`, `capturedDefaults`
- **`App.projectIo`** — `parseProject`, `serializeProject`, `migrate`, `validateSchema`, `SCHEMA_VERSION`, `RETIRED_DATASETS`, `dropRetiredDatasets`, `BUILTIN_FORMAT_IDS`, `CUSTOM_FORMAT_KINDS`, `RELEVANCE_OPTIONS`, `CONTROL_STATES`, `RELEVANCE_PARKED`, `CONTROL_STATE_LABELS`, `controlStateLabel`, `controlStateDecided`, `nextControlState`, `RELEVANCE_RENAMES`, `renameLegacyRelevance`
- **`App.store`** — `empty`, `init`, `getProject`, `onChange`, `isDirty`, `markSaved`, `markDirty`, `recomputeStatus`, `onboardDevice`, `reonboardDevice`, `setDecision`, `setItemFields`, `applyDeviceAssignment`, `setItemDevice`, `setItemsDevice`, `addItem`, `renameItem`, `removeItems`, `datasetSnapshot`, `restoreDatasetSnapshot`, `setHeld`, `addControl`, `updateControl`, `removeControl`, `knownControlTags`, `addControlTag`, `removeControlTag`, `setControlTag`, `setControlsDevice`, `addValueFormat`, `updateValueFormat`, `removeValueFormat`, `setItemFormats`, `setDeviceNotes`, `deviceNotes`, `setProcedureOrder`, `setProcedureNote`, `procedureNote`, `setReportOrder`, `setControlDeviceState`, `controlDeviceState`, `setControlDeviceJustification`, `controlDeviceJustification`, `addControlType`, `knownControlTypes`, `importControls`, `setDeviceOverride`, `clearDeviceOverride`, `setGroupOverride`, `clearGroupOverride`, `addGroup`, `updateGroup`, `removeGroup`, `applicableItems`, `undecidedCount`, `slugify`, `getLatestConfigs`, `_commit`
- **`App.adapters.android`** — `packages`, `tactical`, `custom`, `psSingleQuote`, `shSingleQuote`, `parsePath`, `setAtPath`, `flattenTactical`, `rebuildTacticalDoc`, `stripPolicyPrefix`, `ensureImsSettings`, `imsDefaultBlock`
- **`App.platforms.androidAdb`** — `id`, `label`, `outputLanguage`, `scriptExtension`, `datasets`, `captureInstructions`, `scriptPreamble`, `scriptPostamble`, `runInstructions`
- **`App.diff`** — `triage`
- **`App.validation`** — `validateOnboarding`, `validateProject`
- **`App.valueFormats`** — `BUILTINS`, `CUSTOM_KINDS`, `inferId`, `resolve`, `validate`, `display`, `parseInput`, `list`, `usageCount`, `optionDescription`, `findCustom`
- **`App.overrides`** — `groupForDevice`, `effectiveDecision`, `effectiveItem`, `classify`, `deviceDeviations`, `groupDeviations`
- **`App.docFormat`** — `STANDARD`, `standard`, `normalise`, `list`, `resolve`, `validate`, `preamble`, `frontMatter`, `tablePreamble`, `tableStyle`, `normaliseShade`, `previewCss`, `textWidthMm`, `textWidthPx`, `mmPx`, `tableMetrics`, `pageMetrics`, `levelBreaks`, `PAPERS`, `NUMBER_POSITIONS`, `LATEX_LEVELS`, `HF_SETS`, `HF_SLOTS`, `HF_MACROS`, `slotParts`, `headerFooter`, `FONTS`, `font`
- **`App.doc`** — `LEVELS`, `BODY_LEVEL`, `TITLE_LEVEL`, `levelLabel`, `outline`, `refResolver`, `refTargets`, `tableIndex`, `scanTables`, `autoCaption`, `renderPart`, `renderParts`, `headingFor`, `gapFor`, `render`
- **`App.docProviders`** — `renderSection`
- **`App.docBlocks`** — `applySectionOrder`, `tableWording`, `headingsFor`, `withWording`
- **`App.generate`** — `buildImplementation`, `buildVerification`, `buildReport`, `buildControlReport`, `_gather`, `buildProcedure`, `procedureSteps`, `reportBlocks`, `sectionColumns`, `CONTROL_COLUMNS`, `controlLinkTerms`, `controlAnchor`, `relevanceCounts`, `relevanceKeys`, `relevanceLabel`, `REL_UNSET`, `emitDocument`, `findTags`, `applyTags`, `docFilename`, `TAG_RE`, `metaFields`, `deviceMeta`, `guidelineChildren`, `hasGuidelineDeviations`, `sectionContent`
- **`App.ui.model`** — `getLatestConfigs`, `isLatest`, `deviceAppliesSet`, `assignAllShownPlan`, `valueAllShownPlan`, `computeAppliesTo`, `countIncomplete`, `filterSortRows`, `relevanceViewFilter`, `applyAllShownPlan`, `filterableColumns`, `colFilterPredicate`, `FILTER_NONE`, `sortKeyOf`, `nextSort`, `SORT_NONE`
- **`App.ui.activity`** — `log`, `logIssues`, `list`, `clear`, `onChange`
- **`App.ui.tables`** — `renderToolbar`, `renderTableHtml`, `buildCapturedMap`, `sortHint`, `renderAddBar`, `applyHeadButton`, `assignHeadButton`, `valueApplySpec`, `valueHeadButton`, `enumDecisionField`, `PICK_MODES`, `blockedBy`, `railControls`, `railGroups`, `railSortId`, `RAIL_SORTS`, `RAIL_TAG_NONE`, `cellEditTarget`, `cellEditHint`, `renderValueEditor`, `relevanceBadge`, `relevanceClass`, `allColumns`, `visibleColumns`, `lockedColumnKey`, `DEFAULT_HIDDEN_COLS`, `defaultHiddenCols`, `detailRowHtml`, `divergesHint`, `undoTitle`, `redoTitle`, `UNDO_OFF_TITLE`, `REDO_OFF_TITLE`
- **`App.ui.views.onboard`** — `render`, `wire`
- **`App.ui.views.generate`** — `render`, `wire`, `_gen`, `reportOptions`, `REPORT_RELEVANCE_DEFAULT`, `openReportOptions`, `closeReportOptions`, `reportOptionsOpen`, `_reportModal`
- **`App.ui.views.formats`** — `render`, `open`, `close`, `isOpen`, `_fm`, `current`
- **`App.ui.views.help`** — `render`, `wire`, `SECTIONS`, `_help`
- **`App.ui.folder`** — `init`, `wire`, `schedule`, `flush`, `saveNow`, `connect`, `reconnect`, `disconnect`, `keepMine`, `takeTheirs`, `quarantine`, `openSnapshots`, `closeSnapshots`, `restoreSnapshot`, `writeOutputs`, `load`, `canWrite`, `locked`, `status`, `chipHtml`, `bannerHtml`, `_st`, `_folder`, `_reset`
- **`App.ui.app`** — `mount`, `TOOL_VERSION`, `_state`, `nextTheme`, `toAest`, `applyToTogglePlan`, `_decisionFromRaw`, `_renderShell`, `_toggleStatus`, `_quietEdit`, `_hideColumn`, `_captureScroll`, `_restoreScroll`, `_history`, `pushUndo`, `withUndo`, `noteApplyTick`, `closeRun`, `noteDeviceTick`, `unnoteTickRun`, `reset`, `limit`, `info`, `undo`, `redo`
- **`App.docStore`** — `nextId`, `blankPart`, `setBlockLevel`, `setBlockCentre`, `setMetaField`, `setBlockFlag`, `setBlockSpace`, `mmValue`, `DEFAULT_SPACE_MM`, `MAX_SPACE_MM`, `setTitleBlock`, `setClassification`, `setBlockName`, `setBlockHeading`, `setBlockIntro`, `setBlockIntroNumbered`, `setBlockTableStyle`, `setTableText`, `setTableColumnLabel`, `ONE_TABLE`, `setTableNoCaption`, `setReportInclude`, `INCLUDE_MAPS`, `addSection`, `updateSection`, `removeSection`, `addPart`, `updatePart`, `removePart`, `movePart`, `setCell`, `addRow`, `removeRow`, `setRowTall`, `rowTall`, `addColumn`, `removeColumn`, `setAlign`, `setWidth`, `clearWidths`, `renormalise`, `setBlockWidth`, `clearBlockWidths`, `applyWidth`, `evenWidths`, `widthTotal`, `MIN_WIDTH`, `addFormat`, `updateFormat`, `removeFormat`, `setFormatId`, `saveSectionTemplate`, `removeSectionTemplate`, `useSectionTemplate`, `saveReportTemplate`, `removeReportTemplate`, `useReportTemplate`
- **`App.docTemplates`** — `KINDS`, `FORMAT_VERSION`, `exportFile`, `parseImport`, `plan`, `apply`, `_norm`
- **`App.ui.richText`** — `toHtml`, `fromNode`, `selectionIn`, `offsetOf`, `placeCaret`, `applyToken`, `CHIP`, `REFLINK`
- **`App.ui.views.reportDesign`** — `render`, `wire`, `refresh`, `open`, `close`, `isOpen`, `select`, `pane`, `buildPreview`, `PANES`, `_rd`

### Self-test blocks (15 blocks, 191 suites)

Tests are roughly a third of the code. Skip them unless the task is about a test.

**PHASE-0 SELF-TEST SUITES (vendored primitives + util)** — `src/app/js/0190-phase-0-self-test-suites-vendored-primitives.js`

- `line 5` util.clock
- `line 13` util.html
- `line 28` util.hash (SHA-256)
- `line 56` util.crc32
- `line 66` util.zip (determinism)

**PHASE-1 SELF-TEST SUITES (stable, registry, projectIo, store)** — `src/app/js/0230-phase-1-self-test-suites-stable-registry-pro.js`

- `line 69` util.stable.stableStringify
- `line 87` projectIo schema validation
- `line 156` projectIo round-trip & determinism (DOD-2/DOD-7)
- `line 208` T10.1 schema v3 (groups, overrides, migrate, prune)
- `line 267` T10.2 App.overrides resolver
- `line 343` store basics

**PHASE-2 SELF-TEST SUITES (Android adapters)** — `src/app/js/0260-phase-2-self-test-suites-android-adapters.js`

- `line 6` android.packages parse
- `line 23` android.tactical flatten/rebuild
- `line 78` decisionSchema / isComplete / validateDecision
- `line 90` two-layer shell escaping (injection-safety, Appendix B)
- `line 122` platform registration (android-adb)

**PHASE-3 SELF-TEST SUITES (ui.model + ui.tables render)** — `src/app/js/0470-phase-3-self-test-suites-ui-model-ui-tables.js`

- `line 38` ui.model
- `line 73` ui.tables render

**PHASE-4 SELF-TEST SUITES (diff · validation · store onboarding)** — `src/app/js/0480-phase-4-self-test-suites-diff-validation-sto.js`

- `line 21` diff.triage
- `line 30` validation.validateOnboarding
- `line 42` store.onboardDevice (fresh + inheritance)
- `line 86` store re-onboard versioning (§8.7)
- `line 124` store.applicableItems / undecidedCount

**PHASE-5 SELF-TEST SUITES (completeness · store decisions · editors · gating)** — `src/app/js/0490-phase-5-self-test-suites-completeness-store.js`

- `line 30` completeness
- `line 56` store.setDecision / setItemFields
- `line 98` ui.tables decision editors (data-driven)
- `line 131` ui.views.generate gating

**PHASE-6 SELF-TEST SUITES (devices view)** — `src/app/js/0500-phase-6-self-test-suites-devices-view.js`

- `line 26` ui.views.devices list
- `line 47` ui.views.devices detail (DOD-9)
- `line 80` review-5 #1 device panels collapsible + per-control view

**PHASE-7 SELF-TEST SUITES (report · generate · determinism)** — `src/app/js/0510-phase-7-self-test-suites-report-generate-det/` (5 files)

- `010-report-markdown-builders-v2-2.js:27` report markdown builders (v2.2)
- `010-report-markdown-builders-v2-2.js:58` generate.buildImplementation
- `010-report-markdown-builders-v2-2.js:97` generate.buildVerification & buildReport
- `010-report-markdown-builders-v2-2.js:214` report-gen: descriptions + page setup + LaTeX safety (v2.2)
- _byte-neutrality of the module extraction (GOLD-1)_
  - `015-golden-output-regression.js:15` GOLD-1 the generated document is byte-for-byte unchanged
- _the declared key column (KEY-1)_
  - `016-key-column.js:11` KEY-1 an adapter declares its key column rather than having it scraped
- _the metadata rows are handed in (META-2)_
  - `017-meta-rows.js:8` META-2 the provenance rows are supplied, not derived
  - `020-t11-v1-3-generation-customisation.js:1` T11 (v1.3) generation customisation
  - `020-t11-v1-3-generation-customisation.js:132` review-9 apply-to toggle + AEST header + how-to-run
  - `020-t11-v1-3-generation-customisation.js:168` generate determinism (DOD-7)
  - `020-t11-v1-3-generation-customisation.js:189` review-10 (onboarded descriptions + .ps1 warning + control width)

**REVIEW-3 SELF-TEST SUITES** — `src/app/js/0520-review-3-self-test-suites.js`

- `line 17` review-3 #1 generate scripts as .txt
- `line 32` review-3 #3 / review-4 #1 policyList (prefixed internal key, stripped for display)
- `line 81` review-3 #5a/#5b control types + import
- `line 102` review-3 #6 device-detail search

**PHASE-8 SELF-TEST SUITES (DOD-11 portability + DOD checklist)** — `src/app/js/0530-phase-8-self-test-suites-dod-11-portability.js`

- `line 52` DOD-11 portability (mock platform, zero core edits)
- `line 91` DOD checklist (programmatic items)

**PHASE-9 SELF-TEST SUITES (v1.1: dark mode · set-from-files · controls)** — `src/app/js/0540-phase-9-self-test-suites-v1-1-dark-mode-set/` (18 files)

- _v1.1 core (T9.x) — dark mode · set-from-files · control CRUD_
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:6` T9.1 dark mode (UI-only, determinism-safe)
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:31` T9.2 adapter parseAssignment
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:52` T9.3 store.applyDeviceAssignment (exact-set + atomic)
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:95` T9.6 store control CRUD
- _v1.2 overrides & device groups (T10.x)_
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:122` T10.3 store override + group mutators
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:189` T10.4 effective completeness, generation & manifest
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:234` T10.6 device-config override UI (divergence + editing)
  - `010-v1-1-core-t9-x-dark-mode-set-from-files-cont.js:286` T10.5 device groups UI (sections + deviations modal)
  - `020-review-rounds-2-4-7-8-ui-refinements-control.js:1` T10.7/T10.8 report deviations + determinism (overrides/groups)
- _review rounds 2-4, 7-8 — UI refinements + control refs in tables/report_
  - `020-review-rounds-2-4-7-8-ui-refinements-control.js:51` review-2: AEST banner time + resizable/wrapping value columns
  - `020-review-rounds-2-4-7-8-ui-refinements-control.js:73` review-7 collapse-all + Apply Control Mode
  - `020-review-rounds-2-4-7-8-ui-refinements-control.js:128` review-8 name-only picker + Apply-to action + resizable panels
  - `020-review-rounds-2-4-7-8-ui-refinements-control.js:191` T9.8/T9.9 control refs in tables & report
  - `020-review-rounds-2-4-7-8-ui-refinements-control.js:227` review-4 #2/#3/#4 UI: incomplete default + control layout/description
- _review rounds 12-13 — satisfaction · delete mode · relevance · undo/redo_
  - `030-review-rounds-12-13-satisfaction-delete-mode.js:2` review-12 #1 per-device control satisfaction state
  - `030-review-rounds-12-13-satisfaction-delete-mode.js:77` review-12 #2 Delete Mode + Undo
  - `030-review-rounds-12-13-satisfaction-delete-mode.js:159` review-12 #3 Security Relevance column
  - `030-review-rounds-12-13-satisfaction-delete-mode.js:211` review-12 #4 rationale + relevance columns in the decisions import
  - `030-review-rounds-12-13-satisfaction-delete-mode.js:275` review-13 #1 delete selection tint
  - `030-review-rounds-12-13-satisfaction-delete-mode.js:285` review-13 #2/#3 apply runs undo as one action, plus redo
  - `040-undo-1-universal-undo.js:6` UNDO-1 universal undo
  - `040-undo-1-universal-undo.js:114` review-13 #4 Control Manager per-device checkbox columns
- _review rounds 14-17 — relevance options · column widths · manual · editors_
  - `040-undo-1-universal-undo.js:192` review-14 REPORT + IRRELEVANT relevance options
  - `040-undo-1-universal-undo.js:300` review-15 starting column widths
  - `050-review-15-help-manual.js:1` review-15 Help manual
  - `050-review-15-help-manual.js:57` review-16 #1 blanking a text value
  - `050-review-15-help-manual.js:120` review-17 #1 tab order
  - `050-review-15-help-manual.js:145` review-17 #2 clear button sits beside the value box
  - `050-review-15-help-manual.js:158` review-17 #3 the status badge flips the item
  - `050-review-15-help-manual.js:231` review-17 #4 imsSettings is optional on upload
- _v2.1 value formats (VF-1…VF-8)_
  - `060-v2-1-value-formats-vf-1-vf-8.js:6` VF value formats — inference, editors, enforcement
- _bulk apply & full-cell hit targets (BULK-1/2)_
  - `060-v2-1-value-formats-vf-1-vf-8.js:262` BULK-1 apply the selected control to everything SHOWN
  - `070-hold-for-review-column-filters-justification.js:1` BULK-2 the tick columns are full-cell hit targets
- _hold-for-review · column filters · justification (HELD-1 · FIL-1 · JUS-1/2)_
  - `070-hold-for-review-column-filters-justification.js:41` HELD-1 flag for review without losing the value
  - `070-hold-for-review-column-filters-justification.js:154` FIL-1 per-column value filters
  - `080-jus-1-jus-2-control-satisfaction-justificati.js:1` JUS-1/JUS-2 control satisfaction + justification
- _layout stability on tick (STAB-1 · STAB-3)_
  - `080-jus-1-jus-2-control-satisfaction-justificati.js:151` STAB-1 a tick never changes a row height
  - `080-jus-1-jus-2-control-satisfaction-justificati.js:216` STAB-3 a tick in the Control Manager does not move the page
- _control tags & column-wide device assign (TAG-1/2/3)_
  - `080-jus-1-jus-2-control-satisfaction-justificati.js:244` TAG-3 the device column heading assigns the whole shown column
  - `090-tag-1-tag-2-custom-tags-on-controls.js:1` TAG-1/TAG-2 custom tags on controls
- _the sticky tools rail (SP-4 · SP)_
  - `090-tag-1-tag-2-custom-tags-on-controls.js:129` SP-4 the rail is actually sticky (CSS invariants)
  - `090-tag-1-tag-2-custom-tags-on-controls.js:244` SP sticky tools rail
- _v2.0 — retirement of the Settings dataset_
  - `100-v2-0-retirement-of-the-settings-dataset.js:2` v2.0 Settings retirement (legacy projects still load)
- _columns & device read-across (CMD-1 · COL-1)_
  - `100-v2-0-retirement-of-the-settings-dataset.js:136` CMD-1 the Applies-to device names read across, not down
  - `100-v2-0-retirement-of-the-settings-dataset.js:190` COL-1 every column is hidable except the key column
- _divergence from guidelines (DIV-1/DIV-2)_
  - `110-divergence-from-guidelines-div-1-div-2.js:2` DIV-1/DIV-2 diverges from guidelines + the narrative behind it
- _custom security actions (CUS-1/CUS-2)_
  - `120-custom-security-actions-cus-1-cus-2.js:8` CUS-1/CUS-2 Custom Security Actions
- _security relevance renamed (REL-1)_
  - `120-custom-security-actions-cus-1-cus-2.js:286` REL-1 Security Relevance 
- _general platform notes (NOTE-1)_
  - `130-general-platform-notes-note-1.js:3` NOTE-1 General Platform Notes
- _procedures & the Procedure report (PRO-1 · PRO-2)_
  - `130-general-platform-notes-note-1.js:102` PRO-1/PRO-2 Procedures and the Procedure report
- _Control Manager column filters (CMF-1)_
  - `130-general-platform-notes-note-1.js:267` CMF-1 Control Manager column filters
- _firewall rules & USB host interfaces (FW-1 · USB-1)_
  - `140-firewall-rules-usb-host-interfaces-fw-1-usb.js:5` FW-1/USB-1 firewall rules and USB host interfaces
- _column defaults · control coverage · order stability (COL-2 · RPT-1 · PRO-3)_
  - `140-firewall-rules-usb-host-interfaces-fw-1-usb.js:170` COL-2/RPT-1/PRO-3 columns, control coverage and the order editor
- _cell editing & manual device assignment (EDIT-1 · DEV-1)_
  - `140-firewall-rules-usb-host-interfaces-fw-1-usb.js:321` EDIT-1 a cell opens the row for editing
  - `150-dev-1-assigning-register-items-to-a-device-b.js:1` DEV-1 assigning register items to a device by hand
- _one captured-value map for the whole fleet (D-015)_
  - `150-dev-1-assigning-register-items-to-a-device-b.js:306` D-015 an assigned item keeps its decision on the new device
- _one stubborn package must not end the run (D-016)_
  - `160-one-stubborn-package-must-not-end-the-run-d.js:22` D-016 a package that refuses to uninstall must not kill the run
- _uninstall falls back to disable · reverse switches (PARTIAL-1 · REV-1)_
  - `160-one-stubborn-package-must-not-end-the-run-d.js:73` PARTIAL-1 a refused uninstall falls back to disable, and says so
  - `160-one-stubborn-package-must-not-end-the-run-d.js:118` REV-1 the reverse switches turn the script into a restore
- _a verification script carries no apply machinery (VER-5)_
  - `160-one-stubborn-package-must-not-end-the-run-d.js:179` VER-5 the verification script contains nothing that could change a device
- _the "(none)" filters survive the DOM (FIL-3)_
  - `160-one-stubborn-package-must-not-end-the-run-d.js:266` FIL-3 a 
- _report scope, section order & the options workspace (REL-7 · RPT-2/3/4)_
  - `170-rel-7.js:16` REL-7 
  - `170-rel-7.js:52` RPT-2 the report carries only the relevance categories you ask for
  - `170-rel-7.js:101` RPT-3 the report sections can be re-ordered, and it sticks
  - `170-rel-7.js:170` RPT-4 / RD-1 the Report Design workspace
- _bulk relevance & bulk decision (BULK-4)_
  - `180-bulk-relevance-bulk-decision-bulk-4.js:6` BULK-4 applying a relevance or a decision to many rows
- _a sort you can turn off (SORT-1)_
  - `180-bulk-relevance-bulk-decision-bulk-4.js:216` SORT-1 a column heading cycles ascending, descending, off

**v2.2 SELF-TEST SUITES (Report Design: markdown · outline · templates)** — `src/doc/js/0900-doc-suites/010-providers.js`

- _declarative section rendering (PROV-1)_
  - `line 21` PROV-1 a provider that declares its columns needs no render function

**(unlabelled suites at line 33456)** — `src/doc/js/0900-doc-suites/020-blocks.js`

- _the block helpers (BLK-1)_
  - `line 11` BLK-1 ordering and wording are the module’s, not the host’s

**(unlabelled suites at line 33519)** — `src/app/js/0600-v2-2-self-test-suites-report-design-markdown/` (17 files)

- _LaTeX-safe markdown (MD-1)_
  - `010-la-te-x-safe-markdown-md-1.js:41` MD-1 nothing hostile to LaTeX leaves the writer unescaped
- _heading levels, numbering and cross-references (DOC-1..DOC-4)_
  - `010-la-te-x-safe-markdown-md-1.js:104` DOC-1/DOC-2 heading levels resolve and number themselves
  - `010-la-te-x-safe-markdown-md-1.js:159` DOC-3 a cross-reference survives renaming and reordering
  - `010-la-te-x-safe-markdown-md-1.js:213` DOC-4 a hand-authored section renders its parts in order
- _formatting profiles (FMT-1..FMT-4)_
  - `010-la-te-x-safe-markdown-md-1.js:262` FMT formatting profiles reach pandoc as YAML + a LaTeX preamble
- _the designer's project writes (DS-1..DS-6)_
  - `020-the-designer-s-project-writes-ds-1-ds-6.js:2` DS the Report Design mutators write deterministic, canonical state
- _templates in and out (TPL-1..TPL-4)_
  - `020-the-designer-s-project-writes-ds-1-ds-6.js:94` TPL importing templates adds; it never deletes
- _the document the designer produces (RD-1..RD-7 · PRV-1)_
  - `020-the-designer-s-project-writes-ds-1-ds-6.js:196` RD a designed document generates as one .md
- _metadata rows, guideline deviations, centring, section preview_
  - `020-the-designer-s-project-writes-ds-1-ds-6.js:279` META-1 the provenance block is a chooseable list
  - `030-guide-1-deviations-from-security-guidelines.js:1` GUIDE-1 Deviations from Security Guidelines
  - `030-guide-1-deviations-from-security-guidelines.js:55` RD-8 centring and the per-section preview
  - `030-guide-1-deviations-from-security-guidelines.js:105` PRV-1 the preview renders the document that will be generated
  - `030-guide-1-deviations-from-security-guidelines.js:162` RD-2 the section editor exposes every part control
- _table column widths (TW-1)_
  - `040-tw-1-a-dragged-column-width-reaches-the-pdf.js:1` TW-1 a dragged column width reaches the PDF
- _automatic widths and the form a table takes (AUTO-1)_
  - `040-tw-1-a-dragged-column-width-reaches-the-pdf.js:211` AUTO-1 a table that will not fit is laid out, not left to collapse
- _header + first-column styling (TBS-1)_
  - `050-header-first-column-styling-tbs-1.js:3` TBS-1 a styled header row and first column
- _generated-section columns and widths (CCOL-1 · TW-2 · RD-9)_
  - `050-header-first-column-styling-tbs-1.js:230` CCOL-1/TW-2 a generated section chooses its columns and their widths
  - `060-tw-1-typing-a-width-and-being-told-when-it-d.js:1` TW-1 typing a width, and being told when it does not add up
  - `060-tw-1-typing-a-width-and-being-told-when-it-d.js:90` RD-9 a hand-authored section previews like a generated one
- _the width model measures ems (AUTO-2)_
  - `060-tw-1-typing-a-width-and-being-told-when-it-d.js:136` AUTO-2 columns are measured in ems, not in characters
- _quality of life (FNT-1 · OPT-1 · pane stickiness · tab)_
  - `060-tw-1-typing-a-width-and-being-told-when-it-d.js:202` FNT-1 three font sizes: text, table body, table header
  - `060-tw-1-typing-a-width-and-being-told-when-it-d.js:323` OPT-1 columns and groups live on the section row
  - `070-long-runs-are-marked-so-they-can-break-brk-1.js:1` the workspace stops moving under you
- _long runs are marked so they can break (BRK-1)_
  - `070-long-runs-are-marked-so-they-can-break-brk-1.js:32` BRK-1 a run with no space in it is marked so it can wrap
- _what the preview shows (PRV-3)_
  - `070-long-runs-are-marked-so-they-can-break-brk-1.js:107` PRV-3 the preview reads the document back the way the page will
- _a table narrower than the page (TW-3)_
  - `070-long-runs-are-marked-so-they-can-break-brk-1.js:168` TW-3 widths that do not fill the page make a narrower table
- _an unnumbered title level (TTL-1)_
  - `070-long-runs-are-marked-so-they-can-break-brk-1.js:223` TTL-1 a title takes no number and gives none away
- _the profile reaches the preview (PRV-2 · CAP-2 · NAM-2)_
  - `070-long-runs-are-marked-so-they-can-break-brk-1.js:294` PRV-2 the preview shows the formatting, not just the words
  - `080-nam-2-ccol-2-a-generated-section-names-its-h.js:1` NAM-2/CCOL-2 a generated section names its heading; a control names its type
- _automatic captions (CAP-1)_
  - `080-nam-2-ccol-2-a-generated-section-names-its-h.js:94` CAP-1 every table is captioned, and the numbers agree
- _section names and introductions (NAM-1 · SEC-1)_
  - `080-nam-2-ccol-2-a-generated-section-names-its-h.js:181` NAM-1/SEC-1 a section names itself, and introduces itself
- _a numbered introduction (SEC-2) · control description (CCOL-3)_
  - `090-a-numbered-introduction-sec-2-control-descri.js:3` SEC-2 an introduction can take a number of its own
  - `090-a-numbered-introduction-sec-2-control-descri.js:106` CCOL-3 the control coverage table can carry the description
- _values a person reads (HUM-1)_
  - `090-a-numbered-introduction-sec-2-control-descri.js:149` HUM-1 a captured value is printed as a reading, not as JSON
- _satisfied with exception (EXC-1)_
  - `090-a-numbered-introduction-sec-2-control-descri.js:222` EXC-1 a control can be satisfied with an exception
- _the body font (FNT-2)_
  - `100-the-body-font-fnt-2.js:3` FNT-2 the document chooses a font, and the preview shows it
- _the document the designer controls (CODE-1 · TOC-1/2 · TTL-2 · CAP-3)_
  - `100-the-body-font-fnt-2.js:77` CODE-1 a code span is shaded, and a long one still wraps
  - `100-the-body-font-fnt-2.js:116` TOC-1/TOC-2 the contents list is a section like any other
  - `100-the-body-font-fnt-2.js:200` TTL-2 the automatic title block is a choice, and it is off
  - `100-the-body-font-fnt-2.js:240` CAP-3 the caption sits under its table, and carries its number
- _the box shows what it holds (RTX-1 · RTX-2)_
  - `110-the-box-shows-what-it-holds-rtx-1-rtx-2.js:3` RTX-1 a text box renders what it holds
  - `110-the-box-shows-what-it-holds-rtx-1-rtx-2.js:146` RTX-2 a table cell takes the same formatting a paragraph does
- _what the report is made of, saved with it (OPT-2 · COL-3)_
  - `110-the-box-shows-what-it-holds-rtx-1-rtx-2.js:191` OPT-2 the report\
  - `110-the-box-shows-what-it-holds-rtx-1-rtx-2.js:291` COL-3 an optional column carries its own default
- _a table without a caption (CAP-4)_
  - `120-a-table-without-a-caption-cap-4.js:3` CAP-4 a table can be left uncaptioned
  - `120-a-table-without-a-caption-cap-4.js:83` SEC-3 the report no longer describes its own composition
  - `120-a-table-without-a-caption-cap-4.js:116` NAM-3 heading, then name, whoever wrote the section
  - `120-a-table-without-a-caption-cap-4.js:143` FNT-3 every size in the document, in one table
  - `120-a-table-without-a-caption-cap-4.js:246` TTL-3 a title is styled as a title, not as an H1
- _references that reach the PDF (REF-1 · REF-2)_
  - `130-references-that-reach-the-pdf-ref-1-ref-2.js:3` REF-1 a cross-reference reaches the document as a link
  - `130-references-that-reach-the-pdf-ref-1-ref-2.js:94` REF-2 every mention of a control links to its coverage row
- _type, centring, table wording and placement (FNT-4 · CTR-1 · TBL-1 · SEC-4)_
  - `130-references-that-reach-the-pdf-ref-1-ref-2.js:182` FNT-4 every kind of text has a size, a weight and a slope
  - `130-references-that-reach-the-pdf-ref-1-ref-2.js:223` CTR-1 centring a section centres its heading too
  - `140-tbl-1-a-generated-table-names-itself-and-its.js:1` TBL-1 a generated table names itself, and its groups take no heading
  - `140-tbl-1-a-generated-table-names-itself-and-its.js:143` SEC-4 a section can start a page, or stay out of the contents
- _header & footer, generation, the paged preview (HDR-1 · GEN-TAB · PRV-4)_
  - `150-header-footer-generation-the-paged-preview-h.js:3` HDR-1 the header and footer are configured on their own
  - `150-header-footer-generation-the-paged-preview-h.js:157` GEN-TAB the document is named, and its placeholders filled in
- _what the second round of use found (D-036..D-039)_
  - `150-header-footer-generation-the-paged-preview-h.js:214` D-036 a hand-set width still holds what cannot be broken
  - `150-header-footer-generation-the-paged-preview-h.js:288` D-044 centring one section does not centre the document
  - `150-header-footer-generation-the-paged-preview-h.js:335` BR-1 a line break renders wherever it is written (D-037)
  - `160-a-break-in-a-cell-and-a-first-column-with-a.js:1` PRV-4 the preview can be laid out as pages
- _a break in a cell, and a first column with a size (D-061 · FNT-6)_
  - `160-a-break-in-a-cell-and-a-first-column-with-a.js:38` D-061 a line break in a table cell reaches the preview
  - `160-a-break-in-a-cell-and-a-first-column-with-a.js:96` FNT-6 the table\
- _whitespace as a measurement (SPC-1)_
  - `170-whitespace-as-a-measurement-spc-1.js:2` SPC-1 empty space is asked for in millimetres

**(unlabelled suites at line 38683)** — `src/app/js/0610-suites-paths-and-the-driver-contract-tf-2/` (3 files)

- _paths and the driver contract (TF.2)_
  - `010-t.js:74` TF.2 storage path helpers
  - `010-t.js:93` TF.2 driverMemory honours the driver contract
- _real DOMExceptions, not synthetic stand-ins (D-067)_
  - `010-t.js:137` D-067 a real DOMException is normalised, not waved through
- _the snapshot policy (TF.4 · requirements 7.1)_
  - `010-t.js:214` TF.4 snapshots are due on a 5-minute floor and pruned to 40
- _the canonical write (TF.4 · requirements 6.2, 7.1)_
  - `010-t.js:274` TF.4 the canonical write
- _the concurrent-write guard (TF.4 · requirements 10)_
  - `020-the-concurrent-write-guard-tf-4-requirements.js:3` TF.4 the guard refuses to clobber
- _quarantine and outputs (TF.4 · requirements 8, 9)_
  - `020-the-concurrent-write-guard-tf-4-requirements.js:78` TF.4 quarantine preserves the bytes a human could repair
  - `020-the-concurrent-write-guard-tf-4-requirements.js:110` TF.10 generated artifacts land unpacked under Outputs/
- _the debounced writer (TF.5 · requirements 6.2)_
  - `020-the-concurrent-write-guard-tf-4-requirements.js:144` TF.5 the writer coalesces, caps, and never spins
- _the app wired to a folder (TF.6 · TF.8 · TF.10)_
  - `030-the-app-wired-to-a-folder-tf-6-tf-8-tf-10.js:3` TF.6 the app boots into the right folder state
- _the writer over the real folder store (TF.4 + TF.5)_
  - `030-the-app-wired-to-a-folder-tf-6-tf-8-tf-10.js:277` TF.5 the writer driving the folder store end to end

<!-- END GENERATED CODE MAP -->
