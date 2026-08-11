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
- **One `.zip` per generator.** Browsers throttle rapid multiple downloads.
- **`localStorage` is never canonical state** — origin is unreliable under `file://`; it is only an
  optional, clearly-labelled draft autosave.
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
| The planned config-store work | `config-store-requirements.md` | Forward-looking; not yet implemented. |
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

_Generated by `tools/gen-code-map.py` from `ch-config-tool.html` (29,138 lines). Do not edit by hand — re-run the script._

**Stylesheet:** lines 43–1000 (957 lines). Embedded binary assets are parked at the end of it, immediately before `</style>`.

### Modules (40)

| Lines | Module | Purpose |
|---|---|---|
| `1016–1130` | **App.types** | Central home for the JSDoc typedefs used as the shared type vocabulary across modules (spec §5/§6/§13.2). No runtime behaviour — typedefs are documen… |
| `1132–1190` | **App.util.clock** | Single, injectable time source so all timestamps are deterministic and testable (spec §13.4, C-6). Engine code MUST source time here. |
| `1192–1255` | **App.util.html** | HTML escaping and tiny string builders. ALL data-derived text written into HTML (tables, reports, generated docs) MUST pass through esc() to prevent… |
| `1257–1381` | **App.util.hash — VENDORED SHA-256** | Pure-JS SHA-256 over UTF-8 strings/bytes. REQUIRED because window.crypto.subtle may be undefined on file:// (spec §3, C-7). |
| `1383–1426` | **App.util.crc32 — VENDORED CRC-32** | Standard table-based CRC-32 used by the ZIP writer (spec §17.C.2). |
| `1428–1544` | **App.util.zip — VENDORED store-only ZIP writer** | Build a valid store-only (no compression) ZIP as a Blob, on file:// without any library (spec §17.C.3, §10.4). |
| `1546–1614` | **App.util.csv** | Deterministic CSV export of a table (spec §7, §11.1 Export CSVs). |
| `1616–1691` | **App.util.dom** | Thin DOM helpers + the download primitive. This is the ONLY util that touches the DOM / FileReader / downloads (spec §4.1, §7). |
| `1693–1752` | **App.util.stable** | Deterministic JSON serialization (spec §8.6). The single canonical stringifier used for the project file, manifests, and tactical artifact. |
| `1754–2672` | **App.md — MD-1: LaTeX-safe markdown primitives** | The single choke point through which every data-derived string passes on its way into a generated document, exactly as App.util.html.esc is for the H… |
| `2673–2787` | **App.test — embedded test harness** | Tiny in-file test runner (spec §15). assert/assertEqual(deep)/ assertDeepEqual + suite/test registrar. Runs only on #selftest or via a dev button; MU… |
| `2888–3116` | **App.registry** | Platform/adapter registration (spec §5.3). The generic machinery discovers datasets/columns/decision-schemas by iterating the active platform — it ne… |
| `3118–4352` | **App.projectIo** | (De)serialize, schema-validate (Appendix A), and migrate the project file (spec §6.1, §7, §17.A). Canonical (de)serialization is the basis of DOD-2 (… |
| `4354–5764` | **App.store** | In-memory project + mutations + change events (spec §7.1). Holds the single mutable copy of canonical state; exposes deep-readonly snapshots and an e… |
| `6146–6998` | **App.adapters.android** | The Android (ADB) dataset adapters (spec Appendix B) + the two-layer shell-escaping helpers + tactical path/flatten/rebuild utilities. ALL Android/fo… |
| `7000–7521` | **App.platforms.androidAdb** | Assemble the Android (ADB) PlatformProfile from its dataset adapters plus platform-level output conventions (spec Appendix B). This is the ONLY place… |
| `7668–7697` | **App.diff** | Triage a snapshot's keys against the register (spec §8.1): split into new (append as undecided) and existing (inherited). Keys present in the registe… |
| `7699–7752` | **App.validation** | Cross-cutting structural checks beyond projectIo's schema validation (spec §7, §12): onboarding input validation and a whole-project pass. |
| `7754–7865` | **App.completeness** | Item completeness & device readiness (spec §6.5, §8.3). Wraps the adapter's isComplete with the optional REQUIRE_CONTROL_REF policy fold, and compute… |
| `7867–8144` | **App.valueFormats — v2.1 (VF-1…VF-8)** | Declare and enforce the SHAPE a decision value must take, so a free-text box stops being the answer to every question. Four built-in kinds (bool / nu… |
| `8146–8281` | **App.overrides** | The single choke point (spec §19.2.3, OVR-3) that resolves the default → group → device decision chain for an (item, device) pair, classifies value d… |
| `8283–8720` | **App.docFormat — FMT-1..FMT-4: named formatting profiles** | Everything about how the finished document PRESENTS itself — heading styling per level, page size and margins, page numbers, table of contents — as a… |
| `8721–9100` | **App.doc — DOC-1..DOC-4: the document outline, numbering and renderer** | Turn an ordered list of report BLOCKS into a numbered, cross-referenced markdown document. Owns four things the generators must not each re-invent: h… |
| `9101–9242` | **App.report** | Platform-agnostic MARKDOWN section builders (spec §10.3, DOD-8). Turns an adapter's DECLARED report columns into a markdown table, and the device met… |
| `9244–10334` | **App.generate** | Orchestrate the three INDEPENDENT generators (spec §7, §10): gather a device's applicable+complete items per dataset, call adapter generators + platf… |
| `10336–10654` | **App.ui.model** | PURE view-model helpers shared by the UI views: latest-version resolution, applicability map, and search/sort/filter of table rows. Kept pure so the… |
| `10656–10692` | **App.ui.activity** | The append-only Activity/Errors drawer log (spec §11.6). Nothing in the app fails silently — parse/validation/generation results land here. |
| `10694–11996` | **App.ui.tables** | Render a data-driven data-table tab to an HTML string (spec §11.2). Columns come from adapter.columns plus computed "Applies to"/"Status". NO hardcod… |
| `11998–12172` | **App.ui.views.onboard** | The Onboard tab (spec §11.4): one data-driven file slot per active-platform dataset), name/model/firmware fields, a gated Onboard button, capture hel… |
| `12174–12551` | **App.ui.views.generate** | The Generate tab (spec §11.5): device selector + three INDEPENDENT commands (Implementation/Verification/Reporting), each enabled iff the device is r… |
| `12553–13544` | **App.ui.views.devices** | The Devices tab (spec §11.3, DOD-9). Lists device configs grouped by baseId (latest = active; older = superseded read-only history), and a read-only… |
| `13546–14247` | **App.ui.views.controls** | The Control Manager tab (spec §18.3 CTL-1/CTL-4): view/add/edit/remove controls (title, type, description, assigned device configs). Decision assignm… |
| `14249–14387` | **App.ui.views.formats — VF-5 "Value formats" manager** | Create and edit the project's NAMED, REUSABLE value formats: a left list of formats, a right editor for the selected one, and — for the `options` kin… |
| `14389–15105` | **App.ui.views.help** | In-app manual (spec §11, Phase 8; rewritten review-15). One section per area of the app, reached from a section strip so no single page is a wall of… |
| `15109–16875` | **App.ui.app** | The UI shell + controller (spec §11.1). Builds the top bar, the data-driven tab nav (one tab per active-platform dataset + Devices/ Onboard/Generate)… |
| `23867–24668` | **App.docStore — DS-1..DS-6: the Report Design mutators** | Every write the Report Design workspace makes to the project — heading levels, custom sections and their parts, formatting profiles, section template… |
| `24670–24927` | **App.docTemplates — TPL-1..TPL-4: templates in and out, on their own** | Export and import section templates, formatting profiles and whole report templates as standalone files, independently of the project. Owns the merge… |
| `24929–25285` | **App.ui.mdPreview — PRV-1: markdown -> HTML for the live preview** | Render the EXACT markdown the Generate button downloads into browsable HTML, plus the outline needed to navigate it. Not a general markdown implement… |
| `25287–26826` | **App.ui.views.reportDesign — RD-1..RD-7: the Report Design workspace** | The full-screen workspace that decides what the document contains, in what order, at what heading level, with what hand-authored sections, under whic… |
| `29080–29135` | **App.bootstrap — LAST. Registers platforms and mounts the UI.** | Wire everything together at startup (spec §14). During Phase 0 it only renders self-tests on #selftest and a placeholder otherwise. |

### Exported surface

- **`App.util.clock`** — `nowIso`, `setClock`, `resetClock`, `toAest`
- **`App.util.html`** — `esc`, `attr`, `el`
- **`App.util.hash`** — `sha256Hex`, `sha256Bytes`, `utf8Bytes`
- **`App.util.crc32`** — `crc32`
- **`App.util.zip`** — `zip`, `zipBytes`
- **`App.util.csv`** — `toCsv`, `parseCsv`
- **`App.util.dom`** — `mount`, `clear`, `on`, `download`, `readFileText`
- **`App.util.stable`** — `stableStringify`
- **`App.md`** — `text`, `code`, `cell`, `CELL_BREAK`, `heading`, `para`, `rule`, `pageBreak`, `centred`, `table`, `pipeTable`, `gridTable`, `widthsFor`, `autoWidths`, `wrapLine`, `WIDTH_BUDGET`, `HEAD_SHADE_OPEN`, `HEAD_SHADE_CLOSE`, `COL_SHADE`, `human`, `humanInline`, `HUMAN_EMPTY`, `rich`, `plain`, `TOKEN`, `join`, `yaml`, `anchor`, `hostileChars`
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
- **`App.docFormat`** — `STANDARD`, `standard`, `normalise`, `list`, `resolve`, `validate`, `preamble`, `frontMatter`, `tablePreamble`, `tableStyle`, `normaliseShade`, `previewCss`, `textWidthMm`, `textWidthPx`, `PAPERS`, `NUMBER_POSITIONS`, `LATEX_LEVELS`
- **`App.doc`** — `LEVELS`, `BODY_LEVEL`, `TITLE_LEVEL`, `levelLabel`, `outline`, `refResolver`, `refTargets`, `tableIndex`, `scanTables`, `autoCaption`, `renderPart`, `renderParts`, `headingFor`, `render`
- **`App.report`** — `renderTable`, `buildSection`, `metaTable`, `tableOpts`
- **`App.generate`** — `buildImplementation`, `buildVerification`, `buildReport`, `buildControlReport`, `_gather`, `buildProcedure`, `procedureSteps`, `reportBlocks`, `reportSectionDescriptor`, `sectionColumns`, `CONTROL_COLUMNS`, `relevanceCounts`, `relevanceKeys`, `relevanceLabel`, `REL_UNSET`, `emitDocument`, `compositionBody`, `metaFields`, `deviceMeta`, `guidelineChildren`, `hasGuidelineDeviations`, `sectionContent`
- **`App.ui.model`** — `getLatestConfigs`, `isLatest`, `deviceAppliesSet`, `assignAllShownPlan`, `valueAllShownPlan`, `computeAppliesTo`, `countIncomplete`, `filterSortRows`, `relevanceViewFilter`, `applyAllShownPlan`, `filterableColumns`, `colFilterPredicate`, `FILTER_NONE`
- **`App.ui.activity`** — `log`, `logIssues`, `list`, `clear`, `onChange`
- **`App.ui.tables`** — `renderToolbar`, `renderTableHtml`, `buildCapturedMap`, `renderAddBar`, `applyHeadButton`, `assignHeadButton`, `valueApplySpec`, `valueHeadButton`, `enumDecisionField`, `PICK_MODES`, `blockedBy`, `railControls`, `railGroups`, `railSortId`, `RAIL_SORTS`, `RAIL_TAG_NONE`, `cellEditTarget`, `cellEditHint`, `renderValueEditor`, `relevanceBadge`, `relevanceClass`, `allColumns`, `visibleColumns`, `lockedColumnKey`, `DEFAULT_HIDDEN_COLS`, `defaultHiddenCols`, `detailRowHtml`, `divergesHint`, `undoTitle`, `redoTitle`, `UNDO_OFF_TITLE`, `REDO_OFF_TITLE`
- **`App.ui.views.onboard`** — `render`, `wire`
- **`App.ui.views.generate`** — `render`, `wire`, `_gen`, `openReportOptions`, `closeReportOptions`, `reportOptionsOpen`, `_reportModal`
- **`App.ui.views.formats`** — `render`, `open`, `close`, `isOpen`, `_fm`, `current`
- **`App.ui.views.help`** — `render`, `wire`, `SECTIONS`, `_help`
- **`App.ui.app`** — `mount`, `TOOL_VERSION`, `_state`, `nextTheme`, `toAest`, `applyToTogglePlan`, `_decisionFromRaw`, `_renderShell`, `_toggleStatus`, `_quietEdit`, `_hideColumn`, `_captureScroll`, `_restoreScroll`, `_history`, `pushUndo`, `withUndo`, `noteApplyTick`, `closeRun`, `noteDeviceTick`, `unnoteTickRun`, `reset`, `limit`, `info`, `undo`, `redo`
- **`App.docStore`** — `nextId`, `blankPart`, `setBlockLevel`, `setBlockCentre`, `setMetaField`, `setBlockName`, `setBlockHeading`, `setBlockIntro`, `setBlockTableStyle`, `addSection`, `updateSection`, `removeSection`, `addPart`, `updatePart`, `removePart`, `movePart`, `setCell`, `addRow`, `removeRow`, `addColumn`, `removeColumn`, `setAlign`, `setWidth`, `clearWidths`, `renormalise`, `setBlockWidth`, `clearBlockWidths`, `applyWidth`, `evenWidths`, `widthTotal`, `MIN_WIDTH`, `addFormat`, `updateFormat`, `removeFormat`, `setFormatId`, `saveSectionTemplate`, `removeSectionTemplate`, `useSectionTemplate`, `saveReportTemplate`, `removeReportTemplate`, `useReportTemplate`
- **`App.docTemplates`** — `KINDS`, `FORMAT_VERSION`, `exportFile`, `parseImport`, `plan`, `apply`, `_norm`
- **`App.ui.views.reportDesign`** — `render`, `wire`, `refresh`, `open`, `close`, `isOpen`, `select`, `pane`, `buildPreview`, `PANES`, `_rd`

### Self-test blocks (12 blocks, 139 suites)

Tests are roughly a third of the file. Skip them unless the task is about a test.

**PHASE-0 SELF-TEST SUITES (vendored primitives + util)** — lines `2790–2886`

- `2795` util.clock
- `2803` util.html
- `2818` util.hash (SHA-256)
- `2846` util.crc32
- `2856` util.zip (determinism)

**PHASE-1 SELF-TEST SUITES (stable, registry, projectIo, store)** — lines `5767–6144`

- `5836` util.stable.stableStringify
- `5854` projectIo schema validation
- `5923` projectIo round-trip & determinism (DOD-2/DOD-7)
- `5975` T10.1 schema v3 (groups, overrides, migrate, prune)
- `6034` T10.2 App.overrides resolver
- `6110` store basics

**PHASE-2 SELF-TEST SUITES (Android adapters)** — lines `7524–7666`

- `7530` android.packages parse
- `7547` android.tactical flatten/rebuild
- `7602` decisionSchema / isComplete / validateDecision
- `7614` two-layer shell escaping (injection-safety, Appendix B)
- `7646` platform registration (android-adb)

**PHASE-3 SELF-TEST SUITES (ui.model + ui.tables render)** — lines `16878–16986`

- `16916` ui.model
- `16951` ui.tables render

**PHASE-4 SELF-TEST SUITES (diff · validation · store onboarding)** — lines `16989–17131`

- `17010` diff.triage
- `17019` validation.validateOnboarding
- `17031` store.onboardDevice (fresh + inheritance)
- `17075` store re-onboard versioning (§8.7)
- `17113` store.applicableItems / undecidedCount

**PHASE-5 SELF-TEST SUITES (completeness · store decisions · editors · gating)** — lines `17134–17282`

- `17164` completeness
- `17190` store.setDecision / setItemFields
- `17232` ui.tables decision editors (data-driven)
- `17265` ui.views.generate gating

**PHASE-6 SELF-TEST SUITES (devices view)** — lines `17285–17407`

- `17311` ui.views.devices list
- `17332` ui.views.devices detail (DOD-9)
- `17365` review-5 #1 device panels collapsible + per-control view

**PHASE-7 SELF-TEST SUITES (report · generate · determinism)** — lines `17410–17869`

- `17437` report markdown builders (v2.2)
- `17468` generate.buildImplementation
- `17507` generate.buildVerification & buildReport
- `17624` report-gen: descriptions + page setup + LaTeX safety (v2.2)
- `17674` T11 (v1.3) generation customisation
- `17779` review-9 apply-to toggle + AEST header + how-to-run
- `17815` generate determinism (DOD-7)
- `17836` review-10 (onboarded descriptions + .ps1 warning + control width)

**REVIEW-3 SELF-TEST SUITES** — lines `17872–17987`

- `17889` review-3 #1 generate scripts as .txt
- `17904` review-3 #3 / review-4 #1 policyList (prefixed internal key, stripped for display)
- `17953` review-3 #5a/#5b control types + import
- `17974` review-3 #6 device-detail search

**PHASE-8 SELF-TEST SUITES (DOD-11 portability + DOD checklist)** — lines `17990–18100`

- `18042` DOD-11 portability (mock platform, zero core edits)
- `18081` DOD checklist (programmatic items)

**PHASE-9 SELF-TEST SUITES (v1.1: dark mode · set-from-files · controls)** — lines `18103–23862`

- _v1.1 core (T9.x) — dark mode · set-from-files · control CRUD_
  - `18109` T9.1 dark mode (UI-only, determinism-safe)
  - `18134` T9.2 adapter parseAssignment
  - `18155` T9.3 store.applyDeviceAssignment (exact-set + atomic)
  - `18198` T9.6 store control CRUD
- _v1.2 overrides & device groups (T10.x)_
  - `18225` T10.3 store override + group mutators
  - `18292` T10.4 effective completeness, generation & manifest
  - `18337` T10.6 device-config override UI (divergence + editing)
  - `18389` T10.5 device groups UI (sections + deviations modal)
  - `18446` T10.7/T10.8 report deviations + determinism (overrides/groups)
- _review rounds 2-4, 7-8 — UI refinements + control refs in tables/report_
  - `18499` review-2: AEST banner time + resizable/wrapping value columns
  - `18521` review-7 collapse-all + Apply Control Mode
  - `18576` review-8 name-only picker + Apply-to action + resizable panels
  - `18639` T9.8/T9.9 control refs in tables & report
  - `18673` review-4 #2/#3/#4 UI: incomplete default + control layout/description
- _review rounds 12-13 — satisfaction · delete mode · relevance · undo/redo_
  - `18756` review-12 #1 per-device control satisfaction state
  - `18831` review-12 #2 Delete Mode + Undo
  - `18913` review-12 #3 Security Relevance column
  - `18965` review-12 #4 rationale + relevance columns in the decisions import
  - `19029` review-13 #1 delete selection tint
  - `19039` review-13 #2/#3 apply runs undo as one action, plus redo
  - `19108` UNDO-1 universal undo
  - `19216` review-13 #4 Control Manager per-device checkbox columns
- _review rounds 14-17 — relevance options · column widths · manual · editors_
  - `19294` review-14 REPORT + IRRELEVANT relevance options
  - `19402` review-15 starting column widths
  - `19433` review-15 Help manual
  - `19489` review-16 #1 blanking a text value
  - `19552` review-17 #1 tab order
  - `19577` review-17 #2 clear button sits beside the value box
  - `19590` review-17 #3 the status badge flips the item
  - `19663` review-17 #4 imsSettings is optional on upload
- _v2.1 value formats (VF-1…VF-8)_
  - `19775` VF value formats — inference, editors, enforcement
- _bulk apply & full-cell hit targets (BULK-1/2)_
  - `20031` BULK-1 apply the selected control to everything SHOWN
  - `20129` BULK-2 the tick columns are full-cell hit targets
- _hold-for-review · column filters · justification (HELD-1 · FIL-1 · JUS-1/2)_
  - `20169` HELD-1 flag for review without losing the value
  - `20282` FIL-1 per-column value filters
  - `20464` JUS-1/JUS-2 control satisfaction + justification
- _layout stability on tick (STAB-1 · STAB-3)_
  - `20606` STAB-1 a tick never changes a row height
  - `20671` STAB-3 a tick in the Control Manager does not move the page
- _control tags & column-wide device assign (TAG-1/2/3)_
  - `20699` TAG-3 the device column heading assigns the whole shown column
  - `20764` TAG-1/TAG-2 custom tags on controls
- _the sticky tools rail (SP-4 · SP)_
  - `20892` SP-4 the rail is actually sticky (CSS invariants)
  - `21007` SP sticky tools rail
- _v2.0 — retirement of the Settings dataset_
  - `21096` v2.0 Settings retirement (legacy projects still load)
- _columns & device read-across (CMD-1 · COL-1)_
  - `21230` CMD-1 the Applies-to device names read across, not down
  - `21284` COL-1 every column is hidable except the key column
- _divergence from guidelines (DIV-1/DIV-2)_
  - `21399` DIV-1/DIV-2 diverges from guidelines + the narrative behind it
- _custom security actions (CUS-1/CUS-2)_
  - `21570` CUS-1/CUS-2 Custom Security Actions
- _security relevance renamed (REL-1)_
  - `21848` REL-1 Security Relevance 
- _general platform notes (NOTE-1)_
  - `21916` NOTE-1 General Platform Notes
- _procedures & the Procedure report (PRO-1 · PRO-2)_
  - `22015` PRO-1/PRO-2 Procedures and the Procedure report
- _Control Manager column filters (CMF-1)_
  - `22180` CMF-1 Control Manager column filters
- _firewall rules & USB host interfaces (FW-1 · USB-1)_
  - `22286` FW-1/USB-1 firewall rules and USB host interfaces
- _column defaults · control coverage · order stability (COL-2 · RPT-1 · PRO-3)_
  - `22451` COL-2/RPT-1/PRO-3 columns, control coverage and the order editor
- _cell editing & manual device assignment (EDIT-1 · DEV-1)_
  - `22599` EDIT-1 a cell opens the row for editing
  - `22649` DEV-1 assigning register items to a device by hand
- _one captured-value map for the whole fleet (D-015)_
  - `22954` D-015 an assigned item keeps its decision on the new device
- _one stubborn package must not end the run (D-016)_
  - `23040` D-016 a package that refuses to uninstall must not kill the run
- _uninstall falls back to disable · reverse switches (PARTIAL-1 · REV-1)_
  - `23091` PARTIAL-1 a refused uninstall falls back to disable, and says so
  - `23136` REV-1 the reverse switches turn the script into a restore
- _a verification script carries no apply machinery (VER-5)_
  - `23197` VER-5 the verification script contains nothing that could change a device
- _the "(none)" filters survive the DOM (FIL-3)_
  - `23284` FIL-3 a 
- _report scope, section order & the options workspace (REL-7 · RPT-2/3/4)_
  - `23407` REL-7 
  - `23443` RPT-2 the report carries only the relevance categories you ask for
  - `23496` RPT-3 the report sections can be re-ordered, and it sticks
  - `23570` RPT-4 / RD-1 the Report Design workspace
- _bulk relevance & bulk decision (BULK-4)_
  - `23652` BULK-4 applying a relevance or a decision to many rows

**v2.2 SELF-TEST SUITES (Report Design: markdown · outline · templates)** — lines `26829–29078`

- _LaTeX-safe markdown (MD-1)_
  - `26870` MD-1 nothing hostile to LaTeX leaves the writer unescaped
- _heading levels, numbering and cross-references (DOC-1..DOC-4)_
  - `26933` DOC-1/DOC-2 heading levels resolve and number themselves
  - `26986` DOC-3 a cross-reference survives renaming and reordering
  - `27031` DOC-4 a hand-authored section renders its parts in order
- _formatting profiles (FMT-1..FMT-4)_
  - `27075` FMT formatting profiles reach pandoc as YAML + a LaTeX preamble
- _the designer's project writes (DS-1..DS-6)_
  - `27135` DS the Report Design mutators write deterministic, canonical state
- _templates in and out (TPL-1..TPL-4)_
  - `27227` TPL importing templates adds; it never deletes
- _the document the designer produces (RD-1..RD-7 · PRV-1)_
  - `27329` RD a designed document generates as one .md
- _metadata rows, guideline deviations, centring, section preview_
  - `27409` META-1 the provenance block is a chooseable list
  - `27458` GUIDE-1 Deviations from Security Guidelines
  - `27508` RD-8 centring and the per-section preview
  - `27558` PRV-1 the preview renders the document that will be generated
  - `27605` RD-2 the section editor exposes every part control
- _table column widths (TW-1)_
  - `27672` TW-1 a dragged column width reaches the PDF
- _automatic widths and the form a table takes (AUTO-1)_
  - `27882` AUTO-1 a table that will not fit is laid out, not left to collapse
- _header + first-column styling (TBS-1)_
  - `27940` TBS-1 a styled header row and first column
- _generated-section columns and widths (CCOL-1 · TW-2 · RD-9)_
  - `28068` CCOL-1/TW-2 a generated section chooses its columns and their widths
  - `28172` TW-1 typing a width, and being told when it does not add up
  - `28261` RD-9 a hand-authored section previews like a generated one
- _the width model measures ems (AUTO-2)_
  - `28307` AUTO-2 columns are measured in ems, not in characters
- _what the preview shows (PRV-3)_
  - `28373` PRV-3 the preview reads the document back the way the page will
- _a table narrower than the page (TW-3)_
  - `28432` TW-3 widths that do not fill the page make a narrower table
- _an unnumbered title level (TTL-1)_
  - `28487` TTL-1 a title takes no number and gives none away
- _the profile reaches the preview (PRV-2 · CAP-2 · NAM-2)_
  - `28555` PRV-2 the preview shows the formatting, not just the words
  - `28626` NAM-2/CCOL-2 a generated section names its heading; a control names its type
- _automatic captions (CAP-1)_
  - `28719` CAP-1 every table is captioned, and the numbers agree
- _section names and introductions (NAM-1 · SEC-1)_
  - `28798` NAM-1/SEC-1 a section names itself, and introduces itself
- _values a person reads (HUM-1)_
  - `28916` HUM-1 a captured value is printed as a reading, not as JSON
- _satisfied with exception (EXC-1)_
  - `28989` EXC-1 a control can be satisfied with an exception

<!-- END GENERATED CODE MAP -->
