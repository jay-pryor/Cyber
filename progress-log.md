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
| 9 | v1.1: dark mode · set-from-files · Control Manager | ✅ complete | theme UI-only; exact-set assign; controls + schema v2 |
| 10 | v1.2: per-config decision overrides (schemaVersion 3) | ✅ complete | default→group→device resolver; groups; override UI; report deviations |
| 11 | v1.3: generation customisation | ✅ complete | per-command options; report section/column/group + classification; Control report; impl/verify shaping |

Legend: ⬜ not started · 🟡 in progress · ✅ complete · 🔴 blocked

**v1.0 PHASES 0–8 COMPLETE** + **v1.1 PHASE 9 COMPLETE** + **v1.2 PHASE 10 COMPLETE** + **v1.3 PHASE 11
COMPLETE** + **v2.0 PHASE 12 COMPLETE** + **v2.1 PHASE 13 COMPLETE** + reviews 1–17 + report-gen.
**314/314 embedded self-tests pass.** Validated end-to-end against the real reference captures (incl. v1→v2→v3 migration,
per-config/group overrides, and the v1.x→v2.0 retired-dataset upgrade path). Remaining: two manual
checks only — open `ch-config-tool.html` in Chrome/Edge/Firefox (DOD-1), and open a generated
`report.html` in Microsoft Word (DOD-8). Defect register: 9 defects found during review, all FIXED.

**Current normative documents:** `android-ch-config-tool-build-spec-v2.0.md` and
`android-ch-config-tool-task-breakdown-v2.0.md`. The v1.0 pair is superseded and lives in `Archive/`.

### 2026-06-30 — Phase 9 (v1.1): dark mode · set-from-files · Control Manager — ✅ COMPLETE

Built per spec §18 / task breakdown Phase 9.

**Track A — Dark mode (T9.1):** status-tint backgrounds refactored into CSS variables, then a
`:root[data-theme="dark"]` palette override; top-bar toggle (`aria-pressed`), preference persisted in
localStorage (guarded) with `prefers-color-scheme` default. UI-only — verified the report is
byte-identical regardless of theme (DM-3). Pure `nextTheme` helper unit-tested.

**Track B — Set decisions from files (T9.2–T9.4):** adapter `parseAssignment` + `assignmentHint`
(packages = RFC-4180 CSV `package,action,description` tolerant of `package:`; settings/tactical reuse
their parsers); `store.applyDeviceAssignment` does exact key-set equality validation (refuses with
missing/extra deltas, no mutation), validates decisions, applies atomically; Devices-view UI with
three file controls + inline format help + delta/error surfacing. Honours the unified-decision
consequence (§8.4 / ASG-7).

**Track C — Control Manager + controlRefs (T9.5–T9.9):** **schemaVersion → 2** with a lossless
`migrate(v1→v2)` (legacy `ismRefs` strings become find-or-created controls; refs become control ids).
Top-level `controls` entity (id/title/type/description/assignedDeviceIds-by-baseId); `controls`
validation + dangling-ref warnings. `store.addControl/updateControl/removeControl` (remove strips
refs from items). New **Control Manager** tab (add/edit/remove + per-device assignment). Data tabs:
"ISM Refs" → "Control Refs" (titles in the column; **multi-select over the catalogue** in the
expander, no free text). Report "ISM coverage" → **"Control coverage"** grouped by control title/type;
adapter report sections show control titles. `REQUIRE_ISM_REF` → `REQUIRE_CONTROL_REF`.

**Review & tests:** 14 new self-tests (theme; CSV/settings/tactical assignment parse; apply exact-set
+ refusal deltas + atomicity; control CRUD + ref cleanup; control-refs column titles + multi-select;
Control-coverage report; v1→v2 migration). Updated v1.0 fixtures to schemaVersion 2.

**Defects:** none in the product — the only test breakages were expected schema-v2 fixture updates
(3 Phase-1 + 1 Phase-7 assertions), corrected. Verified: v1 files migrate on load (2 controls from
2 legacy refs); real-data generation stays byte-deterministic; clean boot with all 5 views.

**Result:** 136/136 self-tests pass.

### 2026-06-30 — Review-2 changes (UI/UX) — ✅ COMPLETE

Actioned the four review-2 notes:
1. **Draft-banner time in AEST.** Added `toAest(iso)` (UTC+10, display-only); the restore banner and
   the restore log line now show e.g. `2026-06-30 10:00:00 AEST`. Canonical timestamps stay UTC
   (determinism unaffected).
2. **Removed the settings value-type dropdown.** `android.settings.decisionSchema` is now just
   `[{value, string}]`; the value is applied **verbatim** (quoted at generation) — no per-type
   normalisation. (The dropdown was the value type, not the namespace; dropping it is safe because
   captured Android values are already in device form.) Old project files with a vestigial `type` key
   still load and generate correctly.
3. **Full-width wrapping value box.** The settings (and tactical) value editors are now full-width
   `textarea.val-edit` controls that wrap long values (`white-space:pre-wrap; overflow-wrap:anywhere`).
4. **Manually resizable columns (all 3 tables).** Tables use `table-layout:fixed` with per-column
   widths + a drag handle on each header (min width 60px); widths persist per dataset in UI state.
   A drag guard prevents the resize from triggering a column sort.

**Tests:** 3 new self-tests (toAest; settings value-box has no type select + is a val-edit textarea;
columns have resize handles + width styles + stored-width override). Updated the settings
validate/render tests for the type-field removal and the textarea change.

**Defects:** none in the product (only expected test-fixture updates from the settings/value-box
changes). 139/139 self-tests pass; clean boot; real-data generation still byte-deterministic.

**Follow-ups (same review round):**
- **Drawer timestamps → AEST.** Activity/Errors drawer entries now show the time via `toAest` (was UTC).
- **Brand logo, top-left.** `Media/black_background_HighCom_logo.png` (507×143) embedded as a base64
  data-URI in a `.brand-logo` CSS rule (preserves the single-file guarantee C-1) and placed first in
  the top bar (other items flow right). Modest 6px corner rounding — sized to the logo aspect (≈99×28)
  so corners round the black box without clipping the logo text. File grew ~18KB → ~315KB.
- 139/139 self-tests still pass.

### 2026-06-30 — Review-3 changes — ✅ COMPLETE

Actioned the seven review-3 notes (spec §18.5):
1. **Generate as .txt.** Generate tab checkbox to emit script files as `.txt` instead of `.ps1`;
   wrapping is decided on the original extension first so the preamble is preserved; data files
   (tactical.json) unchanged; manifest reflects the names. Threaded via an `opts.scriptsAsTxt` arg.
2. **No tactical type control.** Tactical decision is now `{value}` only; the value is coerced to the
   captured leaf's JS type (carried in `data-vtype`) so JSON-type fidelity holds without a type select.
   Settings already had its type removed (review-2).
3. **policyList parsing (binding).** A tactical `policyList` of `{name, checked}` objects flattens to
   one leaf per policy keyed by name, valued by checked (`policyList.Disable Bluetooth = false`).
   Rebuild sets `checked` by name (order/other fields preserved). Verified on the real policy JSON:
   100 policies, no index-style keys, round-trips identically.
4. **Rationale preset button** — fills the rationale with `"Not required for device use-case."`.
5a. **Add control types manually** — optional `project.controlTypes`; `store.addControlType` +
   `knownControlTypes()` (seed ∪ controlTypes ∪ in-use); Control Manager input + button.
5b. **Import controls CSV** — header must be exactly `title,type,description` (else refused with a
   located error); `store.importControls` adds all in one transaction and auto-registers unknown types.
   Promoted the RFC-4180 parser to `App.util.csv.parseCsv` (shared by packages-CSV + control import).
6. **Device-detail search** — a search box filters the three read-only panels (key/decision/control
   titles/description); re-renders only `#dev-panels` so the box keeps focus.

**Tests:** +6 self-tests (txt rename keeps preamble; policyList flatten/rebuild; addControlType/dup;
importControls + auto-type; device-panel search filter). Updated settings/tactical/devices-note tests
for the type-removal and note-text changes.

**Defects:** none in the product (only expected test-fixture updates). **145/145 self-tests pass**;
clean boot (5 views, types seeded ISM/AHG/Custom); real-data generation byte-deterministic with the
new policyList parsing.

### 2026-06-30 — Review-4 changes — ✅ COMPLETE

Actioned the four review-4 notes (spec §18.6 / task breakdown T-RV4.1–T-RV4.4):
1. **policyList names display without the prefix (RV4-1).** Policies now DISPLAY by name alone (e.g.
   `Disable Bluetooth`) while the STORED/routed key keeps the `policyList.` segment. Added
   `stripPolicyPrefix(key)` (exposed as `tactical.displayKey`) and applied it at every key-display
   site: the tactical "Path" column, the device-view panels, and both report sections (per-dataset +
   Control coverage). `flattenTactical`/`rebuildTacticalDoc` are unchanged from review-3, so there are
   no key collisions and already-saved projects keep routing (no migration). **Reworked from a first
   cut** that baked the bare name into the key — a high-effort workflow review flagged that as causing
   (a) misrouting when a sibling key shares a policy name and (b) broken routing for review-3 saves;
   the display-only strip resolves both. Verified on the real capture: 100 policies, every display key
   prefix-free, **byte-identical round-trip**, targeted flip touches only the one policy, and a
   sibling/`policy` name collision is no longer misrouted (regression test added).
2. **Incomplete-only defaults OFF (RV4-2).** Post-onboard now calls `switchTab` instead of the old
   `openDatasetIncomplete` (which force-ticked the filter); removed that now-dead ctx method. Default
   per-dataset UI state was already `incompleteOnly:false`, so tables land showing the full list.
3. **Control Manager tools beside the title (RV4-3).** The "Add type" + "Import controls (CSV)" tools
   render in a new `.ctl-header` flex row to the **right** of the "Control Manager" title (wrapping
   under on narrow widths), no longer stacked beneath it.
4. **Wider, wrapping control description (RV4-4).** The control-list description editor is now a
   full-width `.ctl-desc` `<textarea>` (`white-space:pre-wrap; overflow-wrap:anywhere; resize:vertical`)
   on its own row, replacing the cramped single-line `<input>`. The existing `[data-ctl-field]` change
   handler reads `el.value` unchanged, so edits still persist via `updateControl`.

**Tests:** +6 self-tests (displayKey/stripPolicyPrefix incl. nested + non-policy untouched; Path
column shows bare name; rebuild round-trip + flip via prefixed key; sibling-name collision NOT
misrouted; toolbar Incomplete-only default unticked + reflects state; control tools render in-header
before the add form/list; description is a wrapping ctl-desc textarea, not an input). The ctl-desc
textarea gets a sacrificial leading `\n` so a description's own leading newline survives re-render
(review finding #3).

**Review:** a high-effort workflow code-review (15 agents) ran on the diff. Its findings drove the
RV4-1 rework from bake-the-bare-name-in to display-only stripping, which resolves the two confirmed
correctness findings (sibling-key collision; broken routing for review-3 saves), the duplicate-walker
cleanup (policyLookup removed), and the dotted-name `parsePath` fallthrough — plus the textarea
leading-newline fix. The other multiline value/rationale textareas share the same latent newline
class but are pre-existing (review-2/Phase-5), out of the review-4 diff, and left unchanged.

A second (focused) verification pass confirmed all six original findings RESOLVED and flagged two
LOW display-only items: (a) the tactical `verify.txt` evidence file still printed the raw
`policyList.` prefix — **fixed** (now uses `stripPolicyPrefix`, consistent with the report); (b)
`stripPolicyPrefix` would also strip a hypothetical non-policy object field literally named
`policyList` — display-only ambiguity with **no routing impact** (rebuild still falls through to
`setAtPath`), real-world impossible for Knox captures, accepted as-is.

**Defects:** none remaining in the product. **151/151 self-tests pass**; real-data tactical round-trip
stays byte-identical and review-3-saved projects keep routing.

### 2026-06-30 — Review-5 changes — ✅ COMPLETE

Actioned the three review-5 notes (spec §18.7 / task breakdown T-RV5.1–T-RV5.3):
1. **Per-control device view (RV5-1).** In the device-configuration view the three dataset panels are
   now **collapsible** (per-panel header toggle, default expanded; toggling re-renders only `#dev-panels`)
   and the **"Control Refs" column is removed from those panels** (data-table tabs keep theirs). Added a
   **"Controls applying to this device"** section listing controls whose `assignedDeviceIds` includes the
   device `baseId`, each a clickable button (title/type + applicable-and-referencing item count). Clicking
   opens a **modal** (× close button + backdrop-click close) with three lists — one per dataset — of the
   items applicable to that device AND referencing that control (key/decision/status), i.e. exactly the
   actions taken to satisfy that control on that device. Panels stay read-only (DOD-9). New
   `renderDeviceControls`/`renderControlModal`/`countControlItems` + modal/collapse CSS.
2. **Control Refs removable multi-select (RV5-2).** Replaced the native `<select multiple>` control-refs
   editor (which needed modifier-clicks to add and offered no obvious remove — the user's complaint that
   you "can only add a single ref / can't remove it") with a **searchable checkbox list**: each control is
   a checkbox (checked = referenced), so any number can be added and any one removed independently. A
   filter box narrows the visible options in place (no store round-trip). New `[data-control-ref-toggle]`
   change handler toggles a single id via `setItemFields({controlRefs})`; obsolete `data-field-edit=
   "controlRefs"`/`selectedOptions` path removed. The column still renders control titles.
3. **Settings CSV assignment (RV5-3).** `android.settings.parseAssignment` now also accepts a CSV with
   header exactly `setting,description,value` (column 1 = stored `<namespace>/<key>`, column 2 = a
   description set on the item, column 3 = the value, verbatim/string). Detected by the header; any other
   input still parses as the §9 sectioned capture format. Malformed/duplicate keys refuse with located
   issues; the generic exact-set + atomic `applyDeviceAssignment` is unchanged.

**Tests:** +7 self-tests (settings CSV parse incl. quoted-comma field + malformed-key refusal + no
false detection on capture format; CSV applies end-to-end via the store; device panels collapsible + no
Control Refs column; assigned controls listed/clickable with counts; empty-controls note; per-control
modal lists only device-applicable referencing items across three dataset panels). Updated the T9.8
control-refs test for the checkbox editor.

**Review:** real-data integration (438 packages / 803 settings / 132 tactical from the reference
captures) confirmed: a full 803-row `setting,description,value` CSV parses (0 errors) and applies in one
transaction (value + description + decided status); device panels show 3 collapse toggles with the
Control Refs column gone; a control assigned to the device lists as openable with `countControlItems`=5
(4 packages + 1 setting); the modal renders three dataset lists, includes referenced items, and excludes
non-referencing applicable items.

**Defects:** none found in the product (only the one expected T9.8 test update for the editor change).
**158/158 self-tests pass**; clean engine load; real-data settings CSV + per-control views verified.

### 2026-06-30 — Review-4 #4 (full) + control-ref label tweak — ✅ COMPLETE

Two follow-ups before Phase 10:
1. **Control Manager as a searchable table (review-4 #4, fully implemented).** The original
   review-4 #4 asked for a *table* with a *per-row dropdown*, *Remove in the dropdown*, and a
   *search/filter* — but §18.6 RV4-4 / T-RV4.4 had captured only the description-wrapping part, so
   only that shipped. Now the Control Manager is a `table.data.ctl-table`: Title/Type inline, a
   wrapping Description column, a per-row expander (dropdown) holding the editable wrapping description,
   the device-assignment multi-select, and the **Remove** button; plus a search box (title/type/
   description) that re-renders only the table host. Spec §18.6 RV4-4 and task T-RV4.4 rewritten to the
   full requirement.
2. **Control-ref label.** The data-tab control-ref checkbox list shows the control **title only**
   (e.g. `AHG-000`), dropping the `(TYPE)` suffix.

**Tests:** +1 net (review-4 #4 table structure + search; updated the prior RV4-4/T9.8 assertions).
**159/159 self-tests pass.**

### 2026-06-30 — Phase 10 (v1.2): per-config decision overrides (schemaVersion 3) — ✅ COMPLETE

Built per spec §19 / task breakdown Phase 10 (T10.1–T10.8). *Decide once, inherit everywhere* is
preserved — the register default still drives every device; an override is a value-only, opt-in
exception resolved through one choke point.

- **T10.1 schema v3.** `schemaVersion → 3`; top-level `groups` + per-config `overrides` (value-only).
  Chained `migrate` (v1→v2→v3); group/override structural validation; **load-time self-heal**
  (prune dangling group memberships + non-applicable/invalid overrides, with warnings, never a hard
  error); canonical serialize (sort groups/deviceBaseIds, drop empty override maps). `store.empty`
  seeds `groups`.
- **T10.2 `App.overrides`** (new pure module, after completeness / before generate): `groupForDevice`,
  `effectiveDecision`, `effectiveItem`, value-based `classify` (so a redundant override never
  mis-colours), `deviceDeviations`, `groupDeviations`.
- **T10.3 store mutators.** `setDeviceOverride`/`clearDeviceOverride` (no-op-clears vs the inherited
  group-or-default value), `setGroupOverride`/`clearGroupOverride` (no-op vs default),
  `addGroup`/`updateGroup`/`removeGroup` (single-group **move** rule). Re-onboard **carries overrides
  forward**, pruning departed keys (logged).
- **T10.4 effective everywhere.** `completeness.deviceReadiness` evaluates the effective decision (so an
  override can rescue readiness even when the default is undecided); `generate.gather` yields effective
  items; the manifest records the effective decision + its **source** per item. No adapter edited.
- **T10.5 Devices tab groups.** `renderList` groups version-stacks into DeviceGroup sections (+
  Ungrouped); per-group rename / delete / member multi-select / **Deviations (N)** button; an **Add
  group** control; a group-deviations modal (× + backdrop close) to view/edit/remove group overrides
  and add new ones (dataset + key select + schema editor).
- **T10.6 device-config view.** Latest version lists **applicable** items with their **effective**
  decision, a divergence class (group=yellow / device=orange) + text marker, an inline schema-driven
  override editor (writes via `setDeviceOverride`, no-op-clears) with **Revert**, a **Deviations-first**
  pin toggle, and a legend by the title. Superseded versions stay read-only. (DOD-9 amended per §19.5.)
- **T10.7 report.** A per-device **"Deviations from default"** section (`displayKey · dataset · source ·
  default → group → device`), naming the device's group; existing sections + manifest already reflect
  effective values via T10.4.
- **T10.8 acceptance.** End-to-end suites for precedence, override-rescued readiness/generation,
  manifest sources, report deviations, and round-trip + byte-determinism with overrides/groups; the
  **DOD-11 portability** test still passes on v3 (no adapter edits).

**Tests:** +27 Phase-10 self-tests (T10.1 migrate/round-trip/prune; T10.2 resolver; T10.3 mutators;
T10.4 effective completeness/generation/manifest; T10.5 group sections + modal; T10.6 divergence UI;
T10.7/T10.8 report deviations + determinism). Updated the v1.0 fixtures to schemaVersion 3 and the
DOD-9 / review-5 device-panel tests to the amended §19.5 semantics.

**Review:** real-data integration (438 packages / 803 settings / 132 tactical) confirmed: a group
override and a device override resolve with the correct effective values + sources, rescue readiness,
flow into the generated script and the manifest (`source: group` / `source: device`), surface in the
report's Deviations section (group named), and the project round-trips byte-identically with the
generated zip deterministic.

**Defects:** none in the product. **190/190 self-tests pass.**

### 2026-07-01 — Review-6 changes (UI refinements) — ✅ COMPLETE

Actioned the five review-6 notes (spec §19.9 / task breakdown T-RV6.1–T-RV6.5) — presentation only,
no engine/schema/determinism change:
1. **Group members via a toggle dropdown (RV6-1).** The group section's member checkboxes are now a
   toggle `<select>` (pick a device to add; pick a current member — shown `✓ … — remove` — to remove).
   Current members are also listed as text. `store.updateGroup` still enforces single-group membership.
2. **Bigger group modal + clean value columns (RV6-2).** The group "Deviations" modal is now
   near-full-screen (`modal-wide`, 96vw/92vh). Each override row shows the **Default** value alone
   (e.g. `0` / `keep`) via the adapter's decision display — not the raw `{"value":"0","type":"string"}`
   — in a *Default* column, with the deviation editor in a separate *Deviation setting* column.
3. **Searchable key picker (RV6-3).** The add-override key `<select>` became an `<input list>` +
   `<datalist>`, so the (long) applicable-key list is type-to-search.
4. **Resizable Control Manager columns (RV6-4).** The Control Manager table gained drag-to-resize
   column handles (`table-layout:fixed`, per-column widths persisted in `_cm.colWidths`), consistent
   with the data tables.
5. **Control-ref labels on one line (RV6-5).** The data-tab Control Refs multi-select keeps each control
   name on a single line with the checkbox at the left (nowrap + wider box).

**Tests:** updated the T10.5 group tests (member dropdown, wide modal, clean Default column, searchable
key input) and the review-4 #4 Control Manager test (resizable headers + stored-width). **190/190
self-tests pass.**

**Review:** real-data render smoke checks (438/803/132) confirm the member dropdown + member-names text,
the `modal-wide` group modal with a JSON-free Default column, and the searchable key input backed by an
810-option datalist. Phase-10 engine behaviour (effective resolution, generation, manifest, report,
round-trip determinism) re-verified unchanged.

**Defects:** none in the product (only the expected T10.5 / review-4 #4 test updates).

### 2026-07-01 — Review-7 changes (bulk control assignment + collapse-all) — ✅ COMPLETE

Actioned the two review-7 notes (spec §19.10 / task breakdown T-RV7.1–T-RV7.2):
1. **Collapse-all in the device view (RV7-1).** A **Collapse all** / **Expand all** button sits to the
   right of the "Deviations first" checkbox; it collapses (or, when all are collapsed, expands) all three
   dataset panels at once via `_dev.collapsed`.
2. **Apply Control Mode (RV7-2).** Each data-table tab has an **"Apply Control Mode"** toggle. When on, a
   **searchable control picker** (input + datalist) appears in the toolbar and a **checkbox column**
   appears on the right of every row. With a control selected, ticking a row adds it to that item's
   `controlRefs`, unticking removes it, and each box always reflects current membership (a ref set via
   the row dropdown shows already-ticked). Exiting the mode hides the picker + checkboxes (changes
   persist). Per-tick commits run under a `_suppressRender` guard so bulk assignment stays fast and
   scroll-stable (the store `onChange` skips the full re-render for those clicks). Built for fast
   assignment of one control across many items without opening each row's dropdown.

**Tests:** +5 self-tests (collapse-all button + label flip; apply toolbar toggle/picker/datalist; apply
column + per-row checkboxes reflecting membership; disabled without a selection; absent when off).
**195/195 self-tests pass.**

**Review:** real-data render smoke checks (438 packages) confirm the apply column renders one checkbox
per row with exactly the assigned control pre-ticked, toggling adds/removes the ref correctly, and the
device view's collapse-all label flips with state.

**Defects:** none.

### 2026-07-01 — Review-8 changes (apply-mode + device-panel columns) — ✅ COMPLETE

Actioned the three review-8 notes (spec §19.11 / task breakdown T-RV8.1–T-RV8.3):
1. **Control picker: name only (RV8-1).** The Apply-Control-Mode picker datalist now shows the control
   **title only** — the type text under the name is gone.
2. **"Apply to <action>" bulk assignment (RV8-2).** Replaced the "pick a control, then tick rows" hint
   with an **"Apply to" action dropdown** (enabled only when a control is selected). Picking an action
   assigns the selected control to **every item with that decision action** — e.g. a debloat control to
   all `remove` packages. Data-driven off the adapter's **enum** decision field, so it appears only for
   packages (settings/tactical have no action). One pass under the `_suppressRender` guard + an Activity
   summary.
3. **Settings override + resizable panel columns (RV8-3).** The settings device-panel Override editor was
   already rendered but long settings values in an auto-layout table squeezed the Override column out of
   view. The three device panels now use **fixed-layout, independently drag-resizable columns per
   dataset** (widths in `_dev.panelColWidths`) with wrapping cells, so the settings Override is clearly
   visible and usable (and each panel sizes independently).

**Tests:** +4 self-tests (name-only options; Apply-to present/enabled for packages with action options +
absent for settings/tactical; panels resizable per dataset + settings has an editable string override +
independent stored widths). Updated the review-5 panel-header test for the new resizable headers.
**199/199 self-tests pass.**

**Review:** real-data smoke check (438 packages / 803 settings): the name-only picker, the Apply-to
action assigning a control to exactly the 50 `remove`-action packages (and only those), and the settings
panel exposing an editable, resizable Override column all verified.

**Defects:** none (only the expected review-5 panel-header test update).

### 2026-07-01 — Report-gen changes (Word report formatting) — ✅ COMPLETE

Actioned the six `report-gen_notes` items (spec §19.12 RG-1…RG-6) so the generated report imports
cleanly into Microsoft Word:
1/2. **Descriptions in the report (RG-1/RG-2).** Added a **Description** column to the packages,
   settings AND tactical report sections (the item `description`).
3. **Compact rows (RG-3).** Report CSS now zeroes `p`/`td`/`th` margins, pins `line-height:1.05`, and
   trims cell padding to `2pt 4pt` (Word no longer inflates every row).
4. **Page box (RG-4).** Added `@page{margin:1in}` and `body{margin:0}` (was `body{margin:24pt}`, which
   Word added on top of its own 1-inch margins → the document sat too far right).
5. **Fonts (RG-5).** Body/cells are **Arial**, headings **Arial Bold**, declared explicitly per element
   (h1/h2/body/p/td/th) — replaced Calibri.
6. **Fit-to-page + wrapping (RG-6).** Tables are `width:100%` + `table-layout:fixed` with per-table
   `<colgroup>` widths and `word-break`/`overflow-wrap` on every cell, so the settings table no longer
   blows out to ~2.5x page width and all cells wrap.

**Tests:** +3 self-tests (Description columns + text; @page/margin/Arial/line-height/padding CSS; fixed
`width:100%`+`table-layout:fixed`+colgroups). **202/202 self-tests pass.**

**Review:** real-data report generated from the reference captures (438/803/132) — @page 1in, Arial
(bold headings), fixed-width tables with 5 colgroups, Description columns populated, no Calibri.
Determinism (DOD-7) unaffected (static CSS/markup).

**Defects:** none.

### 2026-07-01 — Phase 11 (v1.3): generation customisation — ✅ COMPLETE

Built per spec §20 / task breakdown Phase 11 (T11.1–T11.8). Per-command **session-only** output
shaping (four independent in-memory option blocks; no persistence, no `schemaVersion` bump; adapters
stay core-blind via declarative metadata). Everything defaults to "include all" so a fresh session
reproduces the full output.

- **T11.1 report helpers + adapter metadata.** `App.report.renderTable`/`buildSection` (colgroup widths,
  the GEN-5 `None.` empty-row rule). Adapters gained `reportColumns` (incl. Description — folds in the
  report-gen change) and `reportGroups` (packages → Removed/Disabled/Kept). The three
  `renderReportSection(items, ctx, opts)` are now column- and group-aware.
- **T11.2 `buildReport(project, deviceId, opts)`.** Include/exclude each section (meta, per-dataset /
  per-group, Control coverage, Deviations) + drop optional columns; a "Sections included" table
  self-documents composition (GEN-4). `wrapReport(title, sections, {classification})` injects an
  "OFFICIAL: Sensitive" banner top & bottom (GEN-6); meta is now a toggleable section fragment.
- **T11.3 `buildControlReport`** (new 4th command). One section per **applied** control
  (Dataset · Key · Decision), "(no control)" gated by `includeUncontrolled`; zips
  `control-report.html` + manifest as `<device>-control-<stamp>.zip` (`command:'control'`).
- **T11.4 implementation shaping.** `buildScripts` skips unticked datasets and, for enum datasets
  (packages), filters to a chosen **action subset** (e.g. remove-only) — data-driven off the enum
  decision field. Manifest still records the full effective decisions.
- **T11.5 verification shaping.** Dataset include; **only-deviations** (via
  `App.overrides.deviceDeviations`); optional **`verification-results.csv`**
  (`dataset,key,expected,actual,result`, expected pre-filled).
- **T11.6/T11.7 Generate view.** `_gen` gains four option blocks + the `control` command; `doGenerate`
  passes `_gen[block]` (impl/verify also carry the global `scriptsAsTxt`). Each command card gets a
  collapsible, fully data-driven **Options** panel wired to `_gen` (session-only; never touches the
  project or dirty state).

**Tests:** +13 self-tests (GEN-1…GEN-11: section/column/group selection, sections-included, None rule,
classification banner, control report, impl action subset, verify only-deviations + CSV, four
independent blocks, determinism) + updated the `wrapReport` tests for the new signature.
**213/213 self-tests pass.**

**Review:** real-data run (438/803/132) — report with excluded sections + dropped columns + package
group split + classification banner (×2); control report (correct name + applied-control section +
`command:'control'`); remove-only implementation script; verification results CSV with tactical
excluded; byte-deterministic report for fixed clock + options. DOD-11 portability green (mock adapter
declares neither new field → renders one plain table).

**Defects:** none in the product (two test-assertion fixes only: the preamble's `Verify-Package` helper
def, and an undefined test helper).

### 2026-07-01 — Review-9 changes — ✅ COMPLETE

Actioned the five review-9 notes (spec §19.13 / task breakdown T-RV9.1–T-RV9.5):
1. **Apply-to toggle (RV9-1).** The Apply-Control-Mode "Apply to <action>" now **toggles**: if every item
   with the chosen action already has the control it is removed from all of them; otherwise it is added to
   the ones missing it. Logic extracted to the testable pure `App.ui.app.applyToTogglePlan`.
2. **Control-ref checkbox spacing (RV9-2).** The `.detail-form input{width:100%}` rule was stretching the
   control-ref checkboxes, pushing the name off-screen — fixed with `width:auto;padding:0` on the checkbox.
3. **Script timestamp in AEST (RV9-3).** The generated PowerShell header now shows `Generated (AEST):`
   (UTC+10) via a new pure `App.util.clock.toAest`; the UI `toAest` delegates to it. Deterministic.
4. **How-to-run comment (RV9-4).** Each generated script begins with a how-to-run block (open Command
   Prompt in the platform-tools folder via the address-bar `cmd` trick) + the exact
   `powershell -ExecutionPolicy Bypass -File .\<name>` command for that file, via a new
   `platform.runInstructions(name)` hook (Android only, core stays generic); data files get none.
5. **Name the save file (RV9-5).** "Save project" opens a small modal to enter the file name (Confirm /
   Cancel / × / Enter) before downloading; `.json` appended if absent.

**Tests:** +4 self-tests (apply-to plan toggle; toAest + AEST header/no-UTC; how-to-run header + exact
command + data-files-exempt; .txt run note). **217/217 self-tests pass.**

**Review:** real-data run (438 packages) — apply-to adds to all 30 remove-action packages, tops up the
one removed, then toggles all off; the script header shows AEST + the how-to-run command. Determinism
(DOD-7) holds (AEST + how-to-run are pure functions of the fixed timestamp/filename).

**Defects:** none.

### 2026-07-26 — Review-12 changes (control satisfaction · Delete Mode + Undo · Security Relevance) — ✅ COMPLETE

Actioned the four review-12 notes:

1. **Per-device control satisfaction (RV12-1).** Controls now carry `deviceStates`
   (`{deviceBaseId: 'satisfied'|'unsatisfied'}`), keyed by **baseId** so the state survives
   re-onboarding. A control assigned to a device starts **Unsatisfied**; the Devices detail view shows
   the badge plus a Mark satisfied / Mark unsatisfied toggle beside each assigned control, and the
   Devices **list** flags any active device with outstanding controls (`⚠ n controls unsatisfied`,
   tooltip lists them). Assignment changes keep the map in step (new device ⇒ seeded unsatisfied;
   un-assigned device ⇒ state dropped). Schema-validated; round-trip stable.
2. **Delete Mode + Undo (RV12-2).** `Delete Items` mirrors Apply Control Mode: click to arm (a 🗑 Delete
   column appears with per-row checkboxes and ticked rows tint), click **Delete selected (n)** to action
   it, or **Cancel** to leave without deleting. The two modes are mutually exclusive (each disables the
   other's button). `store.removeItems` is the ONE explicit exception to the append-only item rule
   (§8.5) and prunes any device/group override pointing at a deleted key; capture snapshots are left
   untouched, so re-onboarding the same file restores the item. **Undo** (per dataset, session-only,
   depth 20) reverses the last Delete-Mode or Apply-Control-Mode change via a pre-change
   `store.datasetSnapshot` / `restoreDatasetSnapshot`; the button is greyed out until such a change is
   made and the stack is cleared whenever a project is loaded or a draft restored (a snapshot must
   never be replayed into a different project).
3. **Security Relevance column (RV12-3).** A new optional item field `relevance` — `HIGH` / `MEDIUM` /
   `CONTEXT`, or empty. Added once in `ui.tables` (core, not per-adapter) so all three tables get it;
   the cell is a `<select>` wearing the badge skin (red / orange / blue via a new `--c-info` pair), so
   it reads as a badge and stays editable in place. Sorting is by **severity**, not alphabetical.
   Clearing drops the key so serialization stays canonical; the value is also exported in the CSV.
4. **Rationale + Relevance import columns (RV12-4).** The packages (`package,action,description`) and
   settings (`setting,description,value`) decision CSVs now accept two optional trailing columns,
   `rationale` then `relevance`, validated by a shared `checkAssignHeader`. Rationale fills the item's
   Rationale box; relevance is case-normalised and validated against the closed vocabulary — an
   invalid value refuses the whole import (atomic, ASG-5), and a blank cell clears the field. The
   settings CSV keeps working as an onboard capture format.

**Tests:** +26 self-tests across four `review-12` suites (control state seeding/toggle/pruning + list
indicator + round-trip; Delete-Mode toolbar/column/exclusivity, removeItems override pruning, undo of
both delete and control-apply, greyed-out Undo; relevance rendering/badge classes/validation/severity
sort; CSV 3-/4-/5-column parsing, bad header + bad relevance refusal, and both adapters applying the
extra columns). **248/248 self-tests pass** (was 222/222 before the change).

**Defects:** none.

### 2026-07-27 — Review-13 changes (delete tint · grouped undo + redo · device columns) — ✅ COMPLETE

Actioned the four review-13 notes:

1. **Delete tint on every row (RV13-1).** `tr.del-marked` was declared *before*
   `tbody tr:nth-child(even)` and had equal specificity, so the even-row stripe won and only the odd
   (unshaded) rows turned red. The rule now sits after the stripe and names both parities explicitly.
2. **An Apply run is ONE undo action (RV13-2).** Ticking three rows is one user action in three
   clicks, so consecutive ticks of the *same* control now fold into a single undo entry (its snapshot
   is the state before the first tick, its label counts the run: "application of control X to 3
   items"). One Undo reverses the whole run. A run is closed by anything that ends it: leaving/
   entering Apply Control Mode, changing the selected control, an apply-to-action command, a
   deletion, an undo/redo, a tab switch, or loading a project.
3. **Redo (RV13-3).** Undo and redo are now two stacks per dataset moved through one reversible
   `stepHistory` step (the current state is swapped onto the opposite stack), so redo re-applies a
   whole undone run. Any new action drops the redo branch (standard undo model). Both buttons are
   greyed out when their stack is empty, with tooltips naming the exact action; tooltip text lives in
   `App.ui.tables` so the toolbar render and the in-place re-sync cannot drift.
4. **Per-device checkbox columns in Control Manager (RV13-4).** A "Device columns:" picker sits above
   the table (one checkbox per onboarded device + All / None + a count). Every ticked device gets its
   own column, and each cell is an assignment checkbox for that control × device — one click to apply
   or remove, instead of opening the row dropdown. Columns default to all devices, are drag-resizable
   like the rest, and the expanded detail row's colspan follows the shown columns. The cells reuse the
   existing assignment handler, so ticking one also seeds that control's per-device **Unsatisfied**
   state (review-12 #1) and updates the "Applies to" cell.

**Tests:** +11 self-tests across three `review-13` suites (both parities marked in delete mode; run
folding, run-closing rules, whole-run undo, redo round-trip, redo-branch invalidation, per-dataset
isolation, both button states; Control Manager picker/columns/cell state/filtering/colspan/resize).
**259/259 self-tests pass.**

**Defects:** RV13-1 (delete tint hidden behind the even-row stripe) — FIXED.

### 2026-07-27 — Review-14 changes (REPORTING + IRRELEVANT relevance, parked views) — ✅ COMPLETE

Actioned the two review-14 notes:

1. **Two more Security Relevance options (RV14-1).** The vocabulary is now
   `HIGH, MEDIUM, CONTEXT, REPORTING, IRRELEVANT` — **REPORTING purple** (new `--c-purple` /
   `--c-purple-bg` pair, light + dark) and **IRRELEVANT grey** (the muted/alt greys). Because the
   vocabulary is a single shared constant (`App.projectIo.RELEVANCE_OPTIONS`), the cell picker, store
   validation, schema validation and both decision-CSV importers picked the new values up with no
   further change; severity sort ranks them after CONTEXT and before unset. Hint text updated in the
   packages/settings `assignmentHint`, the Devices import panel and in-app Help.
2. **Parked out of the default view (RV14-2).** `REPORTING` and `IRRELEVANT` are declared "parked"
   (`RELEVANCE_PARKED`): `App.ui.model.filterSortRows` hides those items from all three data tables so
   the working view stays on items that still need a security decision. Two toolbar toggles —
   *Reporting only* and *Irrelevant only* — invert that: ticking one lists ONLY that category, ticking
   both lists either. The toggles wear their category's colour when active and the toolbar states
   which view is in force ("Reporting & Irrelevant items are hidden." / "Showing only REPORTING
   items."). The view composes with search, Incomplete-only, sort, the two bulk modes and CSV export
   (which follows what is shown).

**Scope note:** this is a *display* filter only. Parked items still count toward the tab's undecided
badge, `completeness`/`deviceReadiness` and generation — changing those would alter generation gating,
which was not part of the request.

**Tests:** +9 self-tests in a `review-14` suite (both options accepted + schema-valid + pickable;
purple/grey badge classes; hidden by default; each toggle and the union; composition with search /
Incomplete-only; toolbar toggle states + note; severity sort placement; both importers accepting the
new values while still rejecting near-misses; a settings import applying them end to end and landing
parked). **268/268 self-tests pass.**

**Defects:** none.

### 2026-07-27 — Review-15 changes (column widths + Help rewritten as a manual) — ✅ COMPLETE

Actioned the two review-15 notes:

1. **Wider starting columns (RV15-1).** `colDefaultWidth` now takes the dataset id: **Description**
   starts at 660px (3× the old 220) in all three tables, and the **Settings** key column starts at
   360px (1.5× the shared 240). Packages/Tactical keys are unchanged, and a width the user has dragged
   still wins over the default.
2. **Help rewritten from scratch (RV15-2).** The old four-heading page is replaced by a sectioned
   manual with a section strip (pill buttons, current section marked with `aria-current`) and one
   readable column per section: **Overview** (what the tool is, the five ideas, what each tab is for),
   **Getting started**, **Onboarding** (what is recorded, capture formats, re-capture/versioning,
   triage), **Data tables** (columns, editing, finding, the bulk tools, CSV export), **Devices &
   groups** (badges, effective-decision precedence, overrides, per-device control satisfaction,
   groups, bulk decision import incl. the optional CSV columns), **Controls**, **Generating output**
   (the four commands, readiness gating, per-command options, running the output, the manifest),
   **Saving & recovery**, and **Reference** (glossary, a symptom→cause troubleshooting table, good
   habits, developer notes). Language is deliberately plain; every screen concept is named the way the
   UI names it.

   Content is generated from the LIVE app where possible — dataset labels from the registry, capture
   instructions from the platform profile, the relevance vocabulary from `App.projectIo` — so the
   manual cannot drift from the code it documents. Section state is UI-only; Help still renders with
   no project loaded.

**Tests:** +8 self-tests (Description 3× in all three tables, Settings key 1.5×, stored widths still
win; every Help section renders + marks itself current + has no placeholder text, unknown section
falls back to Overview, renders with no project, content is sourced from the registry/vocabularies,
and a coverage check that every feature area is documented somewhere). **276/276 self-tests pass.**

**Defects:** none.

### 2026-07-27 — Review-16 changes (blanking a text value) — ✅ COMPLETE

Actioned the one review-16 note.

**Defect (RV16-1, reported by the user).** A settings value could not be set to blank. Clearing the
box — e.g. emptying a comma-separated list like `bluetooth,wifi` — appeared to do nothing: the item
silently reverted to *undecided* and the editor re-prefilled the captured value, so the change looked
like it had been ignored.

**Cause.** `commitDecisionFromCell` applied one rule to every dataset: *empty primary field ⇒ clear
the decision*. That is right for **Packages**, whose primary field is an enum with an explicit "—"
option, but wrong for **Settings** and **Tactical**, whose primary field is a free-text box where ""
is a legitimate value. The commit was therefore read as "undecided", and because an undecided text
cell prefills from the capture, the old value reappeared.

**Fix.**
1. The empty-clears rule is now scoped to `kind === 'enum'` primaries only. For text primaries an
   empty box commits `{ value: '' }` — a real decision. The item stays *decided*, round-trips through
   save/load, and generates `settings put <ns> <key> ''` (quoted through both PowerShell and POSIX
   sh, as every other value is).
2. Because an empty box no longer means "undecided", text-valued cells gained an explicit **clear**
   button (rendered only when the item is decided) that returns the item to undecided. Enum cells are
   unchanged and keep clearing via "—".
3. The decision-assembly logic was split out of `commitDecisionFromCell` into `decisionFromRaw`
   (exported as `App.ui.app._decisionFromRaw`) so the rule is testable without synthesising DOM.
4. The Help manual now states the rule in the *Action / Value* column description and under
   *Editing an item*.

The group- and device-override editors already treated `''` as a valid string value, so they needed
no change and now agree with the main tables.

**Hardware note for validation:** `settings get` on a key explicitly set to empty is expected to print
an empty line, but some Android builds report `null` for an empty value. Worth confirming on the
target device when running the verification script.

**Tests:** +6 self-tests in a `review-16 #1` suite (an emptied settings box commits a blank value and
stays decided; the same for a tactical leaf; an empty package action still means undecided; the blank
value survives a save/load round-trip; generation emits an explicit empty-string put rather than
skipping the line; decided text cells offer the clear button while undecided and enum cells do not).
**282/282 self-tests pass.**

**Defects:** 1 found (RV16-1, user-reported), FIXED.

---

### 2026-07-28 — Review-17 changes (tab order · clear beside the box · badge flip · imsSettings) — ✅ COMPLETE

Actioned all four review-17 notes.

**#1 — Tab order.** The strip now reads **Onboard · Packages · Settings · Tactical · Devices ·
Control Manager · Generate · Help**. It previously ran data tabs first and put Onboard between
Devices and Generate, which did not match the workflow — or the Help manual, whose "the tabs, in the
order you normally use them" table already listed this order. Onboard is now rendered unconditionally
(it was already the only tab shown with no project), so the strip does not reshuffle when a project
is created; the remaining tabs simply appear.

**#2 — Clear button beside the value box.** The `clear` button on decided Settings/Tactical cells was
`display:block; margin-left:auto`, so it dropped onto its own line under the box and doubled every
row's height. The box and the button now share one `.dec-row` flex row (`val-edit` takes `flex:1`, the
button `flex:0 0 auto`), so each item is one line.

**#3 — The Status badge is a switch.** Clicking (or Enter/Space on) the badge flips the item:
- **decided → undecided** clears the decision — identical to the `clear` button.
- **undecided → decided** adopts what the row's value editor is *already showing*. On Settings and
  Tactical that box is prefilled with the **captured** value, so one click means "what the device has
  is my decision" — the common case when working down a long register. On Packages the enum has no
  selection to adopt, so the **first** schema option is used: `keep`, the no-change action.

The badge carries `role="button"`/`tabindex="0"` and a title explaining which way it will go. The flip
routes through `App.store.setDecision`, so it participates in validation, dirty-tracking and undo like
any other edit, and clicking again reverses it.

**#4 — `imsSettings` is optional on upload (user-reported gap).** A Knox tactical export only carries
`imsSettings` once it has been touched — the reference capture does not have it — so the per-SIM IMS
toggle was simply absent from the register and from the emitted `tactical.json`. Three changes, all
inside the tactical adapter (no core edits):

1. **Parser completes the document.** If the uploaded JSON has no `imsSettings` key at all, the
   default block `[{enabled:false,simSlotId:0},{enabled:false,simSlotId:1}]` is added to the retained
   template and a **warning** is logged to the Activity drawer — the injection is never silent. A
   document that already carries the key is left exactly as captured, whatever its shape. Because
   `parseAssignment` delegates to `parse`, this covers **both** entry points the note asked for:
   onboarding and the Devices-tab "set decisions from files" import.
2. **Flattener keys by SLOT, not array index** — `imsSettings.simSlot0.enabled` — so `simSlotId` is
   treated as the slot's *identity* and never becomes a decision of its own. This mirrors the existing
   `policyList` special-case (review-3 #3), where `name` is identity and `checked` is the setting.
   Without it the naive walk would have produced four items, two of them meaningless (`simSlotId = 0`)
   that would nonetheless have blocked device readiness.
3. **Rebuild mirrors both rules** and re-creates the block (sorted by slot) on a template that predates
   it, so projects saved before this change still emit a correct `tactical.json`.

**Follow-up (RV17-4b, reported by the user against the first cut).** Completing the *file* was not
enough. A device onboarded **before** the change has a stored snapshot whose `keys` do not list the
two slots, so the Devices-tab tactical import failed ASG-2 exact-key-set equality:

> File keys must exactly match this device's applicable Tactical keys (no more, no less).
> 2 key(s) in the file are not applicable to this device: imsSettings.simSlot0.enabled, …

The parser was completing the uploaded JSON while the device's applicable set stayed short, so the two
sides could never agree. Fixed by completing **stored snapshots on load**, via a generic hook rather
than an imsSettings special-case in core:

- New optional adapter hook **`completeSnapshot(snap)`** — "bring this stored snapshot up to the keys
  this dataset now guarantees" — returning the keys it added. Implemented on `android.tactical`
  (ensure `template.imsSettings`, add any missing slot keys to `snap.keys`); idempotent, so a
  complete snapshot is untouched.
- `projectIo.selfHealV3` (which already runs on every load, including draft restore) now calls the
  hook for every device-config snapshot whose adapter offers it, mirrors each added key into the
  register as an **undecided** item, and warns per dataset listing exactly what was added. Core stays
  dataset-agnostic, so DOD-11 holds.

Loading an existing project therefore heals it in place: the slots appear in the Tactical tab as
undecided, the device lists them as applicable, and the import that was rejected now matches. Loading
an already-complete project is a byte-for-byte no-op (asserted).

**Fixture impact.** Every tactical onboard now yields two more register items, so the shared test
fixtures that decide "everything" gained the two slots and three count assertions moved (4 → 6
undecided; the `tactical.json` deep-equal now includes the block, which is emitted from the template
even when undecided).

**Real-data check.** The reference capture `policy-config-01042026_101449.json` parses with 0 errors
into **134 leaves** (2 of them the injected slots), 26 top-level keys become 27, and after deciding
`simSlot1.enabled = true` the rebuilt document is **identical to the input in every other respect**,
with the block in the exact Knox shape (`enabled` / `simSlotId` per entry).

**Help manual updated** for all four: the Status column and *Editing an item* describe the badge flip
and which value it adopts; the *Action / Value* column now says the clear button is *beside* the box;
and the onboarding section gains a note that `imsSettings` is optional in the upload, what the default
is, and that the same rule applies to the Devices-tab import.

**Tests:** +15 self-tests across four `review-17` suites (tab order with and without a project; the
clear button and value box share one flex row; both badge states render as toggles carrying ds+key;
decided flips to cleared; undecided adopts the shown value; a package with no selection adopts `keep`;
imsSettings injected when absent with a warning; used as captured when present; `simSlotId` never
decidable; decisions rebuild into the Knox shape; rebuild re-creates the block on an older template;
onboarding surfaces both slots; the Devices-tab import completes the block; the emitted JSON always
carries it; a project saved before the change is completed on load; the import that older projects
rejected now matches; completion is idempotent). **300/300 self-tests pass.**

**Defects:** 2 found (RV17-4 user-reported missing setting; RV17-4b user-reported — older snapshots
made the completed import unmatchable), both FIXED.

---

### 2026-07-28 — Phase 13 (v2.1): value formats + the sticky tools rail — ✅ COMPLETE

Three requests, built per the new spec §22 / task breakdown Phase 13.

#### 1. Value formats (VF-1…VF-8)

**Problem.** Every tactical decision was a free-text box, because the only type information
available was the captured leaf's JS type, applied silently at commit. On the real Knox capture
that is 134 identical textareas covering four genuinely different shapes — and nothing stopped
someone typing `enabl_both` into a key that accepts exactly three values.

**Model.** A new pure module `App.valueFormats` owns what a value may be. Five **built-in kinds**
need no configuration (`bool`, `number`, `string`, `stringArray`, `json`), and a project may define
**named, reusable custom formats** — most importantly `options`, a closed set of allowed strings
each carrying **a description of what it does**. It is a catalogue plus a per-item reference, exactly
like `controls`/`controlRefs`, so the two per-SIM 5G keys share one definition instead of each
carrying its own copy of the option list. Additive: top-level `valueFormats`, optional
`RegisterItem.format`, **no schemaVersion bump**.

**Nothing to configure by default.** An item with no declared format uses the format inferred from
its captured leaf. Over the reference capture that resolves, with zero operator action, to
**106 bool · 12 string list · 7 number · 9 text** — every one of the 134 leaves gets the right
editor immediately.

Two traps found and closed while building this:
- The tactical flattener reports numbers as `int`/`float`, **not** `number`, so the first cut left
  all 7 numeric leaves as text. Inference now maps both.
- A captured array that is **not** all strings (e.g. `[1,2,3]`) must not get the one-per-line text
  editor: committing would return `["1","2","3"]` and change the emitted `tactical.json`. Those
  leaves infer the new `json` kind instead, which preserves type fidelity. Inference therefore
  considers the captured **value**, not just its type.

**Enforcement.** A value outside its format is an **error**: the item is not complete, so the device
cannot reach *ready*. That lives in `App.completeness.itemComplete` rather than the adapter, because
the catalogue is project state and adapters are project-blind — `project`/`captured` are optional
parameters, so every pre-existing caller is untouched. It evaluates the **effective** decision, so a
device or group override that violates a format blocks readiness too. It never blocks loading,
parsing or saving. A captured value outside a declared vocabulary stays **visible and selected**,
marked *(not an allowed value)* — that mismatch is the finding, and hiding it would be worse than
not enforcing at all.

**Editors.** `renderValueEditor` picks the control from the resolved format: true/false picker,
numeric box, `value — what it does` dropdown, one-per-line list box, or a textarea. It carries
`data-fmt-kind` so the commit path reads back through `parseInput`, the exact inverse of what
rendered it — `display`/`parseInput` are asserted inverses for every kind. The empty box keeps its
per-kind meaning: `''` for text (review-16 #1 preserved), `[]` for a list, undecided for
bool/number/options. The **same** editor is used by the data table, the device-panel override editor
and the group-deviation editor; a first cut had the override editors inferring "text" for everything
because they resolved from the (empty) override value rather than the capture.

**UI.** A **Value format** picker in the row expander (only for datasets whose primary decision is a
value — a packages action is already a closed enum) and a **Value formats** manager modal: format
list, editor, and for `options` a table of allowed values each with its description, plus add/remove
and a usage count. Deleting a format clears the ref from its items and changes no decision.

#### 2. The sticky tools rail (SP-1, SP-2)

Apply Control Mode, Delete Items and Undo/Redo moved out of the filter toolbar into a **tools rail**
pinned to the right of the table (`position:sticky` inside a flex wrapper; `align-self:flex-start`
is what makes sticky work in a flex row). It stays in view as a long register scrolls, so on the
438-row Packages table the control being assigned is reachable from the last row without scrolling
back to the first. Collapsible per dataset, and it stacks above the table below ~1100px. The toolbar
now holds only filters.

#### 3. A bigger control picker that shows descriptions (SP-3)

The old picker was an `<input list>` + `<datalist>`, which can only ever render the value — the
control's description had nowhere to go. It is now a scrollable **card list**: title, type and
description per card, filterable across all three, click-to-toggle selection, and an explicit "No
description — add one in Control Manager" where one is missing. "Apply to `<action>`" moved into the
rail beneath it (still enum-only).

This **supersedes RV8-1** (§19.11), which required a name-only picker *because* the datalist could
not legibly show anything else. Recorded as superseded in both the spec and the task breakdown
rather than silently dropped; the old self-test is retained, inverted, and says why.

**Tests:** +24 self-tests across two new suites (`VF value formats`, `SP sticky tools rail`) —
inference per shape incl. the int/float and non-string-array traps; display/parseInput inverses;
the per-kind empty-box rule; a named options format reusable across keys and byte-identical through
save/load; the described dropdown; enforcement blocking completeness and readiness with a located
reason, for defaults and for overrides; an off-vocabulary value staying visible; format deletion
releasing items without touching decisions; a dangling ref still loading; schema rejection of a
malformed format and of a built-in id collision; the duplicated built-in id list in `projectIo`
matching `App.valueFormats`; the picker appearing for tactical and not packages; the manager modal;
override editors matching the table; mode controls in the rail and filters out of it; collapse;
card title/type/description; the three-way filter; and the regression that matters —
**deciding every item as captured still reaches ready**, i.e. formats introduce no false blocking.
**314/314 self-tests pass** (76 suites), no load-time errors.

**Real-data check.** The reference capture still parses with 0 errors (438 packages, 134 tactical
leaves), reaches *ready*, emits `packages.impl.ps1` + `tactical.json` + `manifest.json`, and
round-trips byte-identically. A `5G radio mode` options format defined with three described values
and applied to both `nr5gModeStateSimSlot0/1` renders the described dropdown with the captured
`enable_both` pre-selected, rejects `not_a_real_mode` with *"Value must be one of: enable_both,
enable_sa, disable."*, and survives save/load with its option descriptions intact.

**Defects:** 2 found during build (numeric leaves inferring as text; override editors inferring from
the empty override value instead of the capture), both FIXED before commit.

---

### 2026-07-28 — Phase 12 (v2.0): retirement of the Settings dataset — ✅ COMPLETE

**Decision (user, product).** The Settings register is retired. Every hardening change the fleet needs
is expressible through **Packages** and **Tactical**, so `android.settings` — several hundred to a few
thousand mostly-cosmetic keys per device, every one of which had to be individually decided before a
device could reach *ready* — was pure decision burden for effectively no security benefit. Android now
has **two** datasets.

Built per the new build spec §21 / task breakdown Phase 12.

**T12.1 — the adapter and its wiring are gone.** Deleted the `settings` adapter in full (the sectioned
`<namespace>:` + `key=value` parser, the `setting,description,value` assignment CSV and its helpers,
`decisionSchema`, columns, report section, `settings put`/`settings get` generators,
`capturedDefaults`, `normalizeSettingValue`) and dropped it from the module's exports and from the
`android-adb` profile's `datasets`. Rewrote `captureInstructions` to two captures and removed the
now-callerless `Verify-Setting` helper from the PowerShell preamble. Removed the Settings-only 360px
key-column default, so every dataset shares the 240px default; `colDefaultWidth(key, dsId)` keeps its
`dsId` parameter for the next dataset that wants one.

Deliberately **kept**: `psSingleQuote`/`shSingleQuote` and the Appendix-B two-layer escaping contract
(the POSIX layer now has no caller, but it is the mandated primitive for the next dataset that emits a
device-side value, and it stays exported and self-tested); and the §8.4 captured-default drift check,
which is adapter-driven and inert when no adapter emits `values`. Both carry a comment saying why.

**T12.2 — v1.x projects still open (the part that actually mattered).** Existing project files carry
`items['android.settings']`, an `android.settings` snapshot on every device config, and possibly
device/group overrides. Those ids are no longer datasets of the platform, so the Appendix-A
cross-check would have called them *unknown dataset* — **every existing project would have failed to
load**. Relaxing that error was not acceptable either: it would silently swallow a genuine typo.

Resolved with an explicit, named allow-list in `projectIo`:

    var RETIRED_DATASETS = { 'android.settings': 'Settings' };

`dropRetiredDatasets(p)` strips each retired id from `items`, every `DeviceConfig.snapshots`, every
`DeviceConfig.overrides` and every `DeviceGroup.overrides`, and returns **one** located `warning`
naming how many register items and how many captured snapshots went. It runs in `parseProject`
*between* `migrate` and `validateSchema` — earlier and the ids fail the cross-check, later and
validation has already rejected the file. An unknown-but-not-retired id is still a hard error.

**T12.3 — copy.** Help manual (Onboarding, Data tables, Devices & groups, Generating output,
Reference/glossary), the Devices tab (control-satisfaction blurb, device search placeholder, the
decisions-import note — now "the Packages CSV"), the Generate tab, and every module/inline comment
that assumed three datasets, three panels or three file slots.

**T12.4 — re-targeted the inherited suites.** Settings was the only shipped dataset with a **free-text
primary**, so a number of suites used it to exercise generic behaviour. Those were re-pointed at
**tactical** (also a text primary) rather than deleted: RV16-1 blank-value commits, RV17-2 the clear
button's flex row, RV17-3 the badge flip adopting the shown value, the full-width wrapping value box,
per-dataset panel overrides and column widths, the Security Relevance column, and the relevance-import
round trip. Only genuinely format-specific tests were removed (the sectioned parser suite, the
`setting,description,value` CSV). The §8.4 drift test was rebuilt on a hand-built snapshot carrying
`values`, so the mechanism keeps its coverage now that no shipped adapter feeds it. Fixture counts
that move when a dataset leaves were corrected (undecided totals 6→5, dataset reasons 3→2, device
panels 3→2, emitted-file lists, report colgroup counts).

**Documents.** `android-ch-config-tool-build-spec-v1.0.md` and
`android-ch-config-tool-task-breakdown-v1.0.md` moved to `Archive/`; **v2.0** editions written. They
are consolidations, not rewrites — section numbers, requirement ids (DOD-n, ASG-n, CTL-n, OVR-n,
GEN-n, RV*-n, RG-n) and appendix letters are unchanged, because the code cites them at its call sites.
The v1.1/v1.2/v1.3 addenda are now stated as the current requirement rather than as deltas; new §18.8
(Security Relevance, parked items, per-device control satisfaction, Delete Mode + undo) and §18.9
(reviews 15–17) capture what had only ever lived in this log; §21 is the retirement itself
(RET-1…RET-6, RET-A…RET-E). Withdrawn tasks (T2.4, T-RV5.3) are kept as **tombstones** rather than
deleted, so a task id from an older log still resolves. `README.md` and `validation-testing-plan.md`
updated — the validation plan keeps a full `settings list` capture on both devices as **evidence**
(it is how the collateral-change sweep and the arm comparison detect *unintended* change), explicitly
not as a tool input.

**Tests:** +8 self-tests in a new `v2.0 Settings retirement` suite (the dataset is absent from the
registry, the platform and the adapter exports; a v1.x project carrying the Settings register,
snapshot, device override and group override still loads, drops exactly those, and logs exactly one
located warning naming the counts; everything else in that project survives; a clean project is a
byte-for-byte no-op with no warning; re-saving makes the removal permanent and the second load is
silent; an unknown-but-not-retired dataset id is still a hard error; and a coverage check that walks
**every** Help section plus `captureInstructions` and the script preamble asserting none names
Settings). **290/290 self-tests pass** (74 suites), no load-time errors.

**Real-data check.** The reference captures still work end to end: `packages.txt` → 438 keys and
`policy-config-01042026_101449.json` → 134 leaves, both with **0 errors**; the device reaches *ready*;
Implementation emits `packages.impl.ps1` + `tactical.json` + `manifest.json` (no settings file, and no
`settings put` anywhere in the output); Verification emits `packages.verify.ps1`; the rebuilt tactical
document still matches the capture (26 top-level keys → 27, the extra being the injected
`imsSettings`); and the project round-trips **byte-identically**.

> One deliberate non-finding: the generated report still contains the string "Disable Settings". That
> is a genuine Knox `policyList` **policy name** in the real device data, not a reference to the
> retired dataset. The Help/chrome coverage test masks `imsSettings` and asserts on app chrome only,
> never on device data.

**Defects:** none.

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
