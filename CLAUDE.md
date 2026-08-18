# CH Config Tool — working notes for Claude

Offline, single-file HTML app for Cyber-Hardening (CH) configuration management. It is a **pure
generator**: it ingests captured config files, records hardening decisions once and inherits them
across devices, and emits the scripts/config/reports implementing those decisions. **It never
contacts a device or the network.**

The deliverable is one file: **`ch-config-tool.html`**, opened by double-clicking (`file://`).

---

## Read this before opening `ch-config-tool.html`

**Do not read the whole file.** It is ~16,000 lines / ~1 MB — roughly **260k tokens**, and almost
none of it is relevant to any single task. The code map below exists so you don't have to.

The file is strictly banner-delimited: 33 modules, each a `<script>` IIFE attaching to a global
`App`, each opening with a `MODULE:` header comment. To work on one:

1. **Find it in the code map** below → note the line range.
2. **`Read` with `offset` and `limit`** for just that range.
3. **If the map looks stale** (it is regenerated, but the file changes often — see the concurrency
   note), locate the module directly: `grep -n "MODULE: App.store" ch-config-tool.html`. The grep
   anchor never drifts; line numbers do.

Two things worth knowing before you go looking:

- **~a third of the file is self-tests.** Eleven `<script>` blocks, indexed below down to the
  individual suite and its line. Skip them entirely unless the task is about a test.
- **The stylesheet is one block near the top**, and the embedded brand logo (a ~19 KB base64 PNG on
  a single line) is parked at the very end of it, just before `</style>`. Read past it — it is one
  line, it carries no information, and it costs ~5k tokens.

### Conventions that keep the map useful

Both of these are what make the file navigable without reading it. Preserve them.

- **A new module** gets its own `<script>` block opening with the standard
  `MODULE: / PURPOSE: / PURITY: / DEPENDS:` banner, inserted before the bootstrap marker.
- **A new test suite** goes under a `/* ===== SUITES: <feature> ===== */` section banner inside a
  test block — start a new banner for a new feature rather than appending to whatever is last. The
  big v1.1 block is a single closure with nine shared helpers (`ensureA`, `snapB`, `r12Project`,
  `H`, `applyRun`, `refCounts`, `sheet`, `cssRule`), so it is grouped by banner rather than split
  into separate `<script>` blocks — splitting it would break every suite that uses a helper
  declared in another fragment.
- **Embedded binary assets** go at the end of the stylesheet under the `EMBEDDED BINARY ASSETS`
  banner, never inline in the middle of readable CSS.

### Concurrency note

More than one Claude session is sometimes working in this repo at once. `ch-config-tool.html` can
change under you mid-task. Prefer `Edit` over `Write` on it (`Edit` fails loudly on a stale read;
`Write` silently clobbers), and re-`grep` for your anchor if an edit fails.

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

## Regenerating the code map

The map below is generated. **After any change to `ch-config-tool.html`, run:**

```bash
python3 tools/gen-code-map.py
```

A `PostToolUse` hook in `.claude/settings.json` runs this automatically after Claude edits the HTML,
and `.githooks/pre-commit` blocks a commit whose map is stale. Both call the same script; neither is
required for it to work. To verify without writing: `python3 tools/gen-code-map.py --check`.

Enable the git hook once per clone:

```bash
git config core.hooksPath .githooks
```

---

<!-- BEGIN GENERATED CODE MAP -->

_Generated by `tools/gen-code-map.py` from `ch-config-tool.html` (38,939 lines). Do not edit by hand — re-run the script._

**Stylesheet:** lines 43–1150 (1,107 lines). Embedded binary assets are parked at the end of it, immediately before `</style>`.

### Modules (48)

| Lines | Module | Purpose |
|---|---|---|
| `1166–1280` | **App.types** | Central home for the JSDoc typedefs used as the shared type vocabulary across modules (spec §5/§6/§13.2). No runtime behaviour — typedefs are documen… |
| `1282–1340` | **App.util.clock** | Single, injectable time source so all timestamps are deterministic and testable (spec §13.4, C-6). Engine code MUST source time here. |
| `1342–1405` | **App.util.html** | HTML escaping and tiny string builders. ALL data-derived text written into HTML (tables, reports, generated docs) MUST pass through esc() to prevent… |
| `1407–1531` | **App.util.hash — VENDORED SHA-256** | Pure-JS SHA-256 over UTF-8 strings/bytes. REQUIRED because window.crypto.subtle may be undefined on file:// (spec §3, C-7). |
| `1533–1576` | **App.util.crc32 — VENDORED CRC-32** | Standard table-based CRC-32 used by the ZIP writer (spec §17.C.2). |
| `1578–1694` | **App.util.zip — VENDORED store-only ZIP writer** | Build a valid store-only (no compression) ZIP as a Blob, on file:// without any library (spec §17.C.3, §10.4). |
| `1696–1764` | **App.util.csv** | Deterministic CSV export of a table (spec §7, §11.1 Export CSVs). |
| `1766–1841` | **App.util.dom** | Thin DOM helpers + the download primitive. This is the ONLY util that touches the DOM / FileReader / downloads (spec §4.1, §7). |
| `1843–1902` | **App.util.stable** | Deterministic JSON serialization (spec §8.6). The single canonical stringifier used for the project file, manifests, and tactical artifact. |
| `1904–1992` | **App.util.idbKv — TF.1: a key/value shelf that survives a restart** | Promise-wrapped IndexedDB, used for exactly two things: the FileSystemDirectoryHandle (structured-cloneable, so it survives a browser restart) and th… |
| `1994–2101` | **App.storage — TF.2/TF.3: the shared vocabulary of the storage layer** | Status constants, the normalised error shape, and path helpers that the drivers and the folder store both speak. Kept in its own tiny module so neith… |
| `2103–2189` | **App.storage.driverMemory — TF.2: the reason any of this is testable** | A Map pretending to be a folder. Implements the driver contract exactly, including fault injection, so every policy above the driver line — snapshot… |
| `2191–2377` | **App.storage.driverFsa — TF.3: real files in a real folder** | The File System Access API behind the driver contract. Deliberately the THINNEST module in the storage layer, because it is the only one that cannot… |
| `2379–2642` | **App.storage.folder — TF.4: the layout, the snapshot policy, the guard** | Everything the storage layer decides, sitting above a driver that only moves named text. Owns the on-disk layout, the snapshot-before-write policy, p… |
| `2644–2757` | **App.storage.writer — TF.5: the 60s idle / 180s capped debounce** | The save POLICY, kept out of the folder store so both stay trivially testable. Coalesces a burst of edits into one write, guarantees only one write i… |
| `2759–4239` | **App.md — MD-1: LaTeX-safe markdown primitives** | The single choke point through which every data-derived string passes on its way into a generated document, exactly as App.util.html.esc is for the H… |
| `4240–4384` | **App.test — embedded test harness** | Tiny in-file test runner (spec §15). assert/assertEqual(deep)/ assertDeepEqual + suite/test registrar. Runs only on #selftest or via a dev button; MU… |
| `4485–4713` | **App.registry** | Platform/adapter registration (spec §5.3). The generic machinery discovers datasets/columns/decision-schemas by iterating the active platform — it ne… |
| `4715–6113` | **App.projectIo** | (De)serialize, schema-validate (Appendix A), and migrate the project file (spec §6.1, §7, §17.A). Canonical (de)serialization is the basis of DOD-2 (… |
| `6115–7525` | **App.store** | In-memory project + mutations + change events (spec §7.1). Holds the single mutable copy of canonical state; exposes deep-readonly snapshots and an e… |
| `7907–8759` | **App.adapters.android** | The Android (ADB) dataset adapters (spec Appendix B) + the two-layer shell-escaping helpers + tactical path/flatten/rebuild utilities. ALL Android/fo… |
| `8761–9282` | **App.platforms.androidAdb** | Assemble the Android (ADB) PlatformProfile from its dataset adapters plus platform-level output conventions (spec Appendix B). This is the ONLY place… |
| `9429–9458` | **App.diff** | Triage a snapshot's keys against the register (spec §8.1): split into new (append as undecided) and existing (inherited). Keys present in the registe… |
| `9460–9513` | **App.validation** | Cross-cutting structural checks beyond projectIo's schema validation (spec §7, §12): onboarding input validation and a whole-project pass. |
| `9515–9626` | **App.completeness** | Item completeness & device readiness (spec §6.5, §8.3). Wraps the adapter's isComplete with the optional REQUIRE_CONTROL_REF policy fold, and compute… |
| `9628–9905` | **App.valueFormats — v2.1 (VF-1…VF-8)** | Declare and enforce the SHAPE a decision value must take, so a free-text box stops being the answer to every question. Four built-in kinds (bool / nu… |
| `9907–10042` | **App.overrides** | The single choke point (spec §19.2.3, OVR-3) that resolves the default → group → device decision chain for an (item, device) pair, classifies value d… |
| `10044–11355` | **App.docFormat — FMT-1..FMT-4: named formatting profiles** | Everything about how the finished document PRESENTS itself — heading styling per level, page size and margins, page numbers, table of contents — as a… |
| `11356–12052` | **App.doc — DOC-1..DOC-4: the document outline, numbering and renderer** | Turn an ordered list of report BLOCKS into a numbered, cross-referenced markdown document. Owns four things the generators must not each re-invent: h… |
| `12053–12279` | **App.report** | Platform-agnostic MARKDOWN section builders (spec §10.3, DOD-8). Turns an adapter's DECLARED report columns into a markdown table, and the device met… |
| `12281–13561` | **App.generate** | Orchestrate the three INDEPENDENT generators (spec §7, §10): gather a device's applicable+complete items per dataset, call adapter generators + platf… |
| `13563–13930` | **App.ui.model** | PURE view-model helpers shared by the UI views: latest-version resolution, applicability map, and search/sort/filter of table rows. Kept pure so the… |
| `13932–13968` | **App.ui.activity** | The append-only Activity/Errors drawer log (spec §11.6). Nothing in the app fails silently — parse/validation/generation results land here. |
| `13970–15292` | **App.ui.tables** | Render a data-driven data-table tab to an HTML string (spec §11.2). Columns come from adapter.columns plus computed "Applies to"/"Status". NO hardcod… |
| `15294–15468` | **App.ui.views.onboard** | The Onboard tab (spec §11.4): one data-driven file slot per active-platform dataset), name/model/firmware fields, a gated Onboard button, capture hel… |
| `15470–15937` | **App.ui.views.generate** | The Generate tab (spec §11.5): device selector + three INDEPENDENT commands (Implementation/Verification/Reporting), each enabled iff the device is r… |
| `15939–16930` | **App.ui.views.devices** | The Devices tab (spec §11.3, DOD-9). Lists device configs grouped by baseId (latest = active; older = superseded read-only history), and a read-only… |
| `16932–17633` | **App.ui.views.controls** | The Control Manager tab (spec §18.3 CTL-1/CTL-4): view/add/edit/remove controls (title, type, description, assigned device configs). Decision assignm… |
| `17635–17773` | **App.ui.views.formats — VF-5 "Value formats" manager** | Create and edit the project's NAMED, REUSABLE value formats: a left list of formats, a right editor for the selected one, and — for the `options` kin… |
| `17775–18621` | **App.ui.views.help** | In-app manual (spec §11, Phase 8; rewritten review-15). One section per area of the app, reached from a section strip so no single page is a wall of… |
| `18625–19028` | **App.ui.folder — TF.6/TF.8/TF.9/TF.11: the folder, as the app sees it** | The single seam between the storage layer and the rest of the UI. Owns the folder store and the writer, the connect/reconnect/recovery/divergence scr… |
| `19030–20842` | **App.ui.app** | The UI shell + controller (spec §11.1). Builds the top bar, the data-driven tab nav (one tab per active-platform dataset + Devices/ Onboard/Generate)… |
| `27970–29094` | **App.docStore — DS-1..DS-6: the Report Design mutators** | Every write the Report Design workspace makes to the project — heading levels, custom sections and their parts, formatting profiles, section template… |
| `29096–29353` | **App.docTemplates — TPL-1..TPL-4: templates in and out, on their own** | Export and import section templates, formatting profiles and whole report templates as standalone files, independently of the project. Owns the merge… |
| `29355–29957` | **App.ui.mdPreview — PRV-1: markdown -> HTML for the live preview** | Render the EXACT markdown the Generate button downloads into browsable HTML, plus the outline needed to navigate it. Not a general markdown implement… |
| `29959–30263` | **App.ui.richText — RTX-1: the box shows what it holds** | Turn the {{...}} token markup App.md.rich reads into HTML a contenteditable box can be edited in, and turn the edited box back into tokens. Bold read… |
| `30265–32980` | **App.ui.views.reportDesign — RD-1..RD-7: the Report Design workspace** | The full-screen workspace that decides what the document contains, in what order, at what heading level, with what hand-authored sections, under whic… |
| `38881–38936` | **App.bootstrap — LAST. Registers platforms and mounts the UI.** | Wire everything together at startup (spec §14). During Phase 0 it only renders self-tests on #selftest and a placeholder otherwise. |

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
- **`App.generate`** — `buildImplementation`, `buildVerification`, `buildReport`, `buildControlReport`, `_gather`, `buildProcedure`, `procedureSteps`, `reportBlocks`, `sectionColumns`, `CONTROL_COLUMNS`, `controlLinkTerms`, `controlAnchor`, `relevanceCounts`, `relevanceKeys`, `relevanceLabel`, `REL_UNSET`, `emitDocument`, `findTags`, `applyTags`, `docFilename`, `TAG_RE`, `metaFields`, `deviceMeta`, `guidelineChildren`, `hasGuidelineDeviations`, `sectionContent`
- **`App.ui.model`** — `getLatestConfigs`, `isLatest`, `deviceAppliesSet`, `assignAllShownPlan`, `valueAllShownPlan`, `computeAppliesTo`, `countIncomplete`, `filterSortRows`, `relevanceViewFilter`, `applyAllShownPlan`, `filterableColumns`, `colFilterPredicate`, `FILTER_NONE`, `sortKeyOf`, `nextSort`, `SORT_NONE`
- **`App.ui.activity`** — `log`, `logIssues`, `list`, `clear`, `onChange`
- **`App.ui.tables`** — `renderToolbar`, `renderTableHtml`, `buildCapturedMap`, `sortHint`, `renderAddBar`, `applyHeadButton`, `assignHeadButton`, `valueApplySpec`, `valueHeadButton`, `enumDecisionField`, `PICK_MODES`, `blockedBy`, `railControls`, `railGroups`, `railSortId`, `RAIL_SORTS`, `RAIL_TAG_NONE`, `cellEditTarget`, `cellEditHint`, `renderValueEditor`, `relevanceBadge`, `relevanceClass`, `allColumns`, `visibleColumns`, `lockedColumnKey`, `DEFAULT_HIDDEN_COLS`, `defaultHiddenCols`, `detailRowHtml`, `divergesHint`, `undoTitle`, `redoTitle`, `UNDO_OFF_TITLE`, `REDO_OFF_TITLE`
- **`App.ui.views.onboard`** — `render`, `wire`
- **`App.ui.views.generate`** — `render`, `wire`, `_gen`, `reportOptions`, `REPORT_RELEVANCE_DEFAULT`, `openReportOptions`, `closeReportOptions`, `reportOptionsOpen`, `_reportModal`
- **`App.ui.views.formats`** — `render`, `open`, `close`, `isOpen`, `_fm`, `current`
- **`App.ui.views.help`** — `render`, `wire`, `SECTIONS`, `_help`
- **`App.ui.folder`** — `init`, `wire`, `schedule`, `flush`, `connect`, `reconnect`, `disconnect`, `keepMine`, `takeTheirs`, `quarantine`, `openSnapshots`, `closeSnapshots`, `restoreSnapshot`, `writeOutputs`, `load`, `canWrite`, `locked`, `status`, `chipHtml`, `bannerHtml`, `_st`, `_folder`, `_reset`
- **`App.ui.app`** — `mount`, `TOOL_VERSION`, `_state`, `nextTheme`, `toAest`, `applyToTogglePlan`, `_decisionFromRaw`, `_renderShell`, `_toggleStatus`, `_quietEdit`, `_hideColumn`, `_captureScroll`, `_restoreScroll`, `_history`, `pushUndo`, `withUndo`, `noteApplyTick`, `closeRun`, `noteDeviceTick`, `unnoteTickRun`, `reset`, `limit`, `info`, `undo`, `redo`
- **`App.docStore`** — `nextId`, `blankPart`, `setBlockLevel`, `setBlockCentre`, `setMetaField`, `setBlockFlag`, `setBlockSpace`, `mmValue`, `DEFAULT_SPACE_MM`, `MAX_SPACE_MM`, `setTitleBlock`, `setClassification`, `setBlockName`, `setBlockHeading`, `setBlockIntro`, `setBlockIntroNumbered`, `setBlockTableStyle`, `setTableText`, `setTableColumnLabel`, `ONE_TABLE`, `setTableNoCaption`, `setReportInclude`, `INCLUDE_MAPS`, `addSection`, `updateSection`, `removeSection`, `addPart`, `updatePart`, `removePart`, `movePart`, `setCell`, `addRow`, `removeRow`, `setRowTall`, `rowTall`, `addColumn`, `removeColumn`, `setAlign`, `setWidth`, `clearWidths`, `renormalise`, `setBlockWidth`, `clearBlockWidths`, `applyWidth`, `evenWidths`, `widthTotal`, `MIN_WIDTH`, `addFormat`, `updateFormat`, `removeFormat`, `setFormatId`, `saveSectionTemplate`, `removeSectionTemplate`, `useSectionTemplate`, `saveReportTemplate`, `removeReportTemplate`, `useReportTemplate`
- **`App.docTemplates`** — `KINDS`, `FORMAT_VERSION`, `exportFile`, `parseImport`, `plan`, `apply`, `_norm`
- **`App.ui.richText`** — `toHtml`, `fromNode`, `selectionIn`, `offsetOf`, `placeCaret`, `applyToken`, `CHIP`, `REFLINK`
- **`App.ui.views.reportDesign`** — `render`, `wire`, `refresh`, `open`, `close`, `isOpen`, `select`, `pane`, `buildPreview`, `PANES`, `_rd`

### Self-test blocks (13 blocks, 185 suites)

Tests are roughly a third of the file. Skip them unless the task is about a test.

**PHASE-0 SELF-TEST SUITES (vendored primitives + util)** — lines `4387–4483`

- `4392` util.clock
- `4400` util.html
- `4415` util.hash (SHA-256)
- `4443` util.crc32
- `4453` util.zip (determinism)

**PHASE-1 SELF-TEST SUITES (stable, registry, projectIo, store)** — lines `7528–7905`

- `7597` util.stable.stableStringify
- `7615` projectIo schema validation
- `7684` projectIo round-trip & determinism (DOD-2/DOD-7)
- `7736` T10.1 schema v3 (groups, overrides, migrate, prune)
- `7795` T10.2 App.overrides resolver
- `7871` store basics

**PHASE-2 SELF-TEST SUITES (Android adapters)** — lines `9285–9427`

- `9291` android.packages parse
- `9308` android.tactical flatten/rebuild
- `9363` decisionSchema / isComplete / validateDecision
- `9375` two-layer shell escaping (injection-safety, Appendix B)
- `9407` platform registration (android-adb)

**PHASE-3 SELF-TEST SUITES (ui.model + ui.tables render)** — lines `20845–20953`

- `20883` ui.model
- `20918` ui.tables render

**PHASE-4 SELF-TEST SUITES (diff · validation · store onboarding)** — lines `20956–21098`

- `20977` diff.triage
- `20986` validation.validateOnboarding
- `20998` store.onboardDevice (fresh + inheritance)
- `21042` store re-onboard versioning (§8.7)
- `21080` store.applicableItems / undecidedCount

**PHASE-5 SELF-TEST SUITES (completeness · store decisions · editors · gating)** — lines `21101–21249`

- `21131` completeness
- `21157` store.setDecision / setItemFields
- `21199` ui.tables decision editors (data-driven)
- `21232` ui.views.generate gating

**PHASE-6 SELF-TEST SUITES (devices view)** — lines `21252–21374`

- `21278` ui.views.devices list
- `21299` ui.views.devices detail (DOD-9)
- `21332` review-5 #1 device panels collapsible + per-control view

**PHASE-7 SELF-TEST SUITES (report · generate · determinism)** — lines `21377–21865`

- `21404` report markdown builders (v2.2)
- `21435` generate.buildImplementation
- `21474` generate.buildVerification & buildReport
- `21591` report-gen: descriptions + page setup + LaTeX safety (v2.2)
- `21644` T11 (v1.3) generation customisation
- `21775` review-9 apply-to toggle + AEST header + how-to-run
- `21811` generate determinism (DOD-7)
- `21832` review-10 (onboarded descriptions + .ps1 warning + control width)

**REVIEW-3 SELF-TEST SUITES** — lines `21868–21983`

- `21885` review-3 #1 generate scripts as .txt
- `21900` review-3 #3 / review-4 #1 policyList (prefixed internal key, stripped for display)
- `21949` review-3 #5a/#5b control types + import
- `21970` review-3 #6 device-detail search

**PHASE-8 SELF-TEST SUITES (DOD-11 portability + DOD checklist)** — lines `21986–22096`

- `22038` DOD-11 portability (mock platform, zero core edits)
- `22077` DOD checklist (programmatic items)

**PHASE-9 SELF-TEST SUITES (v1.1: dark mode · set-from-files · controls)** — lines `22099–27965`

- _v1.1 core (T9.x) — dark mode · set-from-files · control CRUD_
  - `22105` T9.1 dark mode (UI-only, determinism-safe)
  - `22130` T9.2 adapter parseAssignment
  - `22151` T9.3 store.applyDeviceAssignment (exact-set + atomic)
  - `22194` T9.6 store control CRUD
- _v1.2 overrides & device groups (T10.x)_
  - `22221` T10.3 store override + group mutators
  - `22288` T10.4 effective completeness, generation & manifest
  - `22333` T10.6 device-config override UI (divergence + editing)
  - `22385` T10.5 device groups UI (sections + deviations modal)
  - `22442` T10.7/T10.8 report deviations + determinism (overrides/groups)
- _review rounds 2-4, 7-8 — UI refinements + control refs in tables/report_
  - `22492` review-2: AEST banner time + resizable/wrapping value columns
  - `22514` review-7 collapse-all + Apply Control Mode
  - `22569` review-8 name-only picker + Apply-to action + resizable panels
  - `22632` T9.8/T9.9 control refs in tables & report
  - `22668` review-4 #2/#3/#4 UI: incomplete default + control layout/description
- _review rounds 12-13 — satisfaction · delete mode · relevance · undo/redo_
  - `22751` review-12 #1 per-device control satisfaction state
  - `22826` review-12 #2 Delete Mode + Undo
  - `22908` review-12 #3 Security Relevance column
  - `22960` review-12 #4 rationale + relevance columns in the decisions import
  - `23024` review-13 #1 delete selection tint
  - `23034` review-13 #2/#3 apply runs undo as one action, plus redo
  - `23103` UNDO-1 universal undo
  - `23211` review-13 #4 Control Manager per-device checkbox columns
- _review rounds 14-17 — relevance options · column widths · manual · editors_
  - `23289` review-14 REPORT + IRRELEVANT relevance options
  - `23397` review-15 starting column widths
  - `23430` review-15 Help manual
  - `23486` review-16 #1 blanking a text value
  - `23549` review-17 #1 tab order
  - `23574` review-17 #2 clear button sits beside the value box
  - `23587` review-17 #3 the status badge flips the item
  - `23660` review-17 #4 imsSettings is optional on upload
- _v2.1 value formats (VF-1…VF-8)_
  - `23772` VF value formats — inference, editors, enforcement
- _bulk apply & full-cell hit targets (BULK-1/2)_
  - `24028` BULK-1 apply the selected control to everything SHOWN
  - `24126` BULK-2 the tick columns are full-cell hit targets
- _hold-for-review · column filters · justification (HELD-1 · FIL-1 · JUS-1/2)_
  - `24166` HELD-1 flag for review without losing the value
  - `24279` FIL-1 per-column value filters
  - `24461` JUS-1/JUS-2 control satisfaction + justification
- _layout stability on tick (STAB-1 · STAB-3)_
  - `24611` STAB-1 a tick never changes a row height
  - `24676` STAB-3 a tick in the Control Manager does not move the page
- _control tags & column-wide device assign (TAG-1/2/3)_
  - `24704` TAG-3 the device column heading assigns the whole shown column
  - `24769` TAG-1/TAG-2 custom tags on controls
- _the sticky tools rail (SP-4 · SP)_
  - `24897` SP-4 the rail is actually sticky (CSS invariants)
  - `25012` SP sticky tools rail
- _v2.0 — retirement of the Settings dataset_
  - `25101` v2.0 Settings retirement (legacy projects still load)
- _columns & device read-across (CMD-1 · COL-1)_
  - `25235` CMD-1 the Applies-to device names read across, not down
  - `25289` COL-1 every column is hidable except the key column
- _divergence from guidelines (DIV-1/DIV-2)_
  - `25404` DIV-1/DIV-2 diverges from guidelines + the narrative behind it
- _custom security actions (CUS-1/CUS-2)_
  - `25575` CUS-1/CUS-2 Custom Security Actions
- _security relevance renamed (REL-1)_
  - `25853` REL-1 Security Relevance 
- _general platform notes (NOTE-1)_
  - `25921` NOTE-1 General Platform Notes
- _procedures & the Procedure report (PRO-1 · PRO-2)_
  - `26020` PRO-1/PRO-2 Procedures and the Procedure report
- _Control Manager column filters (CMF-1)_
  - `26185` CMF-1 Control Manager column filters
- _firewall rules & USB host interfaces (FW-1 · USB-1)_
  - `26291` FW-1/USB-1 firewall rules and USB host interfaces
- _column defaults · control coverage · order stability (COL-2 · RPT-1 · PRO-3)_
  - `26456` COL-2/RPT-1/PRO-3 columns, control coverage and the order editor
- _cell editing & manual device assignment (EDIT-1 · DEV-1)_
  - `26607` EDIT-1 a cell opens the row for editing
  - `26657` DEV-1 assigning register items to a device by hand
- _one captured-value map for the whole fleet (D-015)_
  - `26962` D-015 an assigned item keeps its decision on the new device
- _one stubborn package must not end the run (D-016)_
  - `27048` D-016 a package that refuses to uninstall must not kill the run
- _uninstall falls back to disable · reverse switches (PARTIAL-1 · REV-1)_
  - `27099` PARTIAL-1 a refused uninstall falls back to disable, and says so
  - `27144` REV-1 the reverse switches turn the script into a restore
- _a verification script carries no apply machinery (VER-5)_
  - `27205` VER-5 the verification script contains nothing that could change a device
- _the "(none)" filters survive the DOM (FIL-3)_
  - `27292` FIL-3 a 
- _report scope, section order & the options workspace (REL-7 · RPT-2/3/4)_
  - `27417` REL-7 
  - `27453` RPT-2 the report carries only the relevance categories you ask for
  - `27502` RPT-3 the report sections can be re-ordered, and it sticks
  - `27571` RPT-4 / RD-1 the Report Design workspace
- _bulk relevance & bulk decision (BULK-4)_
  - `27667` BULK-4 applying a relevance or a decision to many rows
- _a sort you can turn off (SORT-1)_
  - `27877` SORT-1 a column heading cycles ascending, descending, off

**v2.2 SELF-TEST SUITES (Report Design: markdown · outline · templates)** — lines `32983–38144`

- _LaTeX-safe markdown (MD-1)_
  - `33024` MD-1 nothing hostile to LaTeX leaves the writer unescaped
- _heading levels, numbering and cross-references (DOC-1..DOC-4)_
  - `33087` DOC-1/DOC-2 heading levels resolve and number themselves
  - `33142` DOC-3 a cross-reference survives renaming and reordering
  - `33196` DOC-4 a hand-authored section renders its parts in order
- _formatting profiles (FMT-1..FMT-4)_
  - `33245` FMT formatting profiles reach pandoc as YAML + a LaTeX preamble
- _the designer's project writes (DS-1..DS-6)_
  - `33311` DS the Report Design mutators write deterministic, canonical state
- _templates in and out (TPL-1..TPL-4)_
  - `33403` TPL importing templates adds; it never deletes
- _the document the designer produces (RD-1..RD-7 · PRV-1)_
  - `33505` RD a designed document generates as one .md
- _metadata rows, guideline deviations, centring, section preview_
  - `33588` META-1 the provenance block is a chooseable list
  - `33637` GUIDE-1 Deviations from Security Guidelines
  - `33691` RD-8 centring and the per-section preview
  - `33741` PRV-1 the preview renders the document that will be generated
  - `33798` RD-2 the section editor exposes every part control
- _table column widths (TW-1)_
  - `33865` TW-1 a dragged column width reaches the PDF
- _automatic widths and the form a table takes (AUTO-1)_
  - `34075` AUTO-1 a table that will not fit is laid out, not left to collapse
- _header + first-column styling (TBS-1)_
  - `34147` TBS-1 a styled header row and first column
- _generated-section columns and widths (CCOL-1 · TW-2 · RD-9)_
  - `34374` CCOL-1/TW-2 a generated section chooses its columns and their widths
  - `34493` TW-1 typing a width, and being told when it does not add up
  - `34582` RD-9 a hand-authored section previews like a generated one
- _the width model measures ems (AUTO-2)_
  - `34628` AUTO-2 columns are measured in ems, not in characters
- _quality of life (FNT-1 · OPT-1 · pane stickiness · tab)_
  - `34694` FNT-1 three font sizes: text, table body, table header
  - `34815` OPT-1 columns and groups live on the section row
  - `34859` the workspace stops moving under you
- _long runs are marked so they can break (BRK-1)_
  - `34890` BRK-1 a run with no space in it is marked so it can wrap
- _what the preview shows (PRV-3)_
  - `34965` PRV-3 the preview reads the document back the way the page will
- _a table narrower than the page (TW-3)_
  - `35026` TW-3 widths that do not fill the page make a narrower table
- _an unnumbered title level (TTL-1)_
  - `35081` TTL-1 a title takes no number and gives none away
- _the profile reaches the preview (PRV-2 · CAP-2 · NAM-2)_
  - `35152` PRV-2 the preview shows the formatting, not just the words
  - `35224` NAM-2/CCOL-2 a generated section names its heading; a control names its type
- _automatic captions (CAP-1)_
  - `35317` CAP-1 every table is captioned, and the numbers agree
- _section names and introductions (NAM-1 · SEC-1)_
  - `35404` NAM-1/SEC-1 a section names itself, and introduces itself
- _a numbered introduction (SEC-2) · control description (CCOL-3)_
  - `35517` SEC-2 an introduction can take a number of its own
  - `35620` CCOL-3 the control coverage table can carry the description
- _values a person reads (HUM-1)_
  - `35663` HUM-1 a captured value is printed as a reading, not as JSON
- _satisfied with exception (EXC-1)_
  - `35736` EXC-1 a control can be satisfied with an exception
- _the body font (FNT-2)_
  - `35826` FNT-2 the document chooses a font, and the preview shows it
- _the document the designer controls (CODE-1 · TOC-1/2 · TTL-2 · CAP-3)_
  - `35900` CODE-1 a code span is shaded, and a long one still wraps
  - `35939` TOC-1/TOC-2 the contents list is a section like any other
  - `36023` TTL-2 the automatic title block is a choice, and it is off
  - `36063` CAP-3 the caption sits under its table, and carries its number
- _the box shows what it holds (RTX-1 · RTX-2)_
  - `36138` RTX-1 a text box renders what it holds
  - `36281` RTX-2 a table cell takes the same formatting a paragraph does
- _what the report is made of, saved with it (OPT-2 · COL-3)_
  - `36326` OPT-2 the report\
  - `36426` COL-3 an optional column carries its own default
- _a table without a caption (CAP-4)_
  - `36467` CAP-4 a table can be left uncaptioned
  - `36547` SEC-3 the report no longer describes its own composition
  - `36580` NAM-3 heading, then name, whoever wrote the section
  - `36607` FNT-3 every size in the document, in one table
  - `36710` TTL-3 a title is styled as a title, not as an H1
- _references that reach the PDF (REF-1 · REF-2)_
  - `36782` REF-1 a cross-reference reaches the document as a link
  - `36873` REF-2 every mention of a control links to its coverage row
- _type, centring, table wording and placement (FNT-4 · CTR-1 · TBL-1 · SEC-4)_
  - `36961` FNT-4 every kind of text has a size, a weight and a slope
  - `37002` CTR-1 centring a section centres its heading too
  - `37083` TBL-1 a generated table names itself, and its groups take no heading
  - `37225` SEC-4 a section can start a page, or stay out of the contents
- _header & footer, generation, the paged preview (HDR-1 · GEN-TAB · PRV-4)_
  - `37325` HDR-1 the header and footer are configured on their own
  - `37479` GEN-TAB the document is named, and its placeholders filled in
- _what the second round of use found (D-036..D-039)_
  - `37536` D-036 a hand-set width still holds what cannot be broken
  - `37610` D-044 centring one section does not centre the document
  - `37657` BR-1 a line break renders wherever it is written (D-037)
  - `37695` PRV-4 the preview can be laid out as pages
- _a break in a cell, and a first column with a size (D-061 · FNT-6)_
  - `37732` D-061 a line break in a table cell reaches the preview
  - `37790` FNT-6 the table\
- _whitespace as a measurement (SPC-1)_
  - `37867` SPC-1 empty space is asked for in millimetres

**(unlabelled suites at line 38146)** — lines `38146–38879`

- _paths and the driver contract (TF.2)_
  - `38220` TF.2 storage path helpers
  - `38239` TF.2 driverMemory honours the driver contract
- _the snapshot policy (TF.4 · requirements 7.1)_
  - `38283` TF.4 snapshots are due on a 5-minute floor and pruned to 40
- _the canonical write (TF.4 · requirements 6.2, 7.1)_
  - `38343` TF.4 the canonical write
- _the concurrent-write guard (TF.4 · requirements 10)_
  - `38398` TF.4 the guard refuses to clobber
- _quarantine and outputs (TF.4 · requirements 8, 9)_
  - `38473` TF.4 quarantine preserves the bytes a human could repair
  - `38505` TF.10 generated artifacts land unpacked under Outputs/
- _the debounced writer (TF.5 · requirements 6.2)_
  - `38539` TF.5 the writer coalesces, caps, and never spins
- _the app wired to a folder (TF.6 · TF.8 · TF.10)_
  - `38660` TF.6 the app boots into the right folder state
- _the writer over the real folder store (TF.4 + TF.5)_
  - `38821` TF.5 the writer driving the folder store end to end

<!-- END GENERATED CODE MAP -->
