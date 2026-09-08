# Cyber — CH Config Tool

A single-file, offline HTML application for **Cyber-Hardening (CH) configuration management** of a
fleet of device configurations. It is a **pure generator**: it ingests captured config files, lets a
user record hardening decisions once and inherit them across devices, and emits the scripts/config/
reports that implement, verify, and document those decisions. **It never contacts a device or the
network.**

Built to `android-ch-config-tool-build-spec-v2.0.md` (normative). The deliverable is the single file
**`ch-config-tool.html`** — open it by double-clicking (works from `file://`).

## Quick start

1. Open `ch-config-tool.html` in Chrome, Edge, or Firefox.
2. **Onboard** a device by supplying its two capture files (see formats below).
3. Record decisions in the data tabs (Packages / Tactical). Undecided items are flagged. Each value
   gets the editor its **value format** implies — true/false, a number box, a one-per-line list, or a
   dropdown of allowed options; define your own named formats from any row's **Value format** picker.
   To decide many rows at once, use the **Tools** panel: **Apply Control Mode**, **Apply Security
   Relevance** and **Apply Decision** all work the same way — pick a value, then tick rows, or click
   the tick column's heading to set it on *every row the table is showing*. Unticking clears the
   field again, and one **Undo** takes back a whole run.
4. Record anything the captures cannot hold — a Knox tactical passcode, a sealed SIM tray, a
   procedural step — on the **Custom Security Actions** tab. You write those rows yourself; they
   apply to every device and carry the same controls, rationale, rollback and reporting as the rest.
   Each one also takes a **Procedure**: the steps someone follows to carry it out.
5. Editing prose is a **Ctrl+click** (or double-click) on the cell showing it: the row opens with
   that field focused and selected, so a Description is edited where you are reading it rather than
   via the **▸** button at the far left of the row.
6. Applicability follows the captures — a package applies to the devices that reported it, a custom
   action to every device. Where what you know differs from what a capture happened to contain, use
   **Assign to Device** in the Tools panel: pick a device, tick which rows apply to it. The capture
   itself is never edited; the adjustment is recorded separately, saved, and undoable.
7. Keep what you learn about a device on its **Notes** page (Devices → **Notes**, beside **View**) —
   rich text for the quirks, gotchas and reminders that are not a decision on any one item. Notes are
   per device, so re-capturing keeps them.
8. Got it wrong? **↶ Undo** in the data tab's toolbar steps back through *every* change made in that
   table — a decision, a rationale, a rename, a delete, a bulk apply — up to 20 steps, one click per
   action however many rows that action touched. It is per table and per session: nothing is written
   to the project file, so save often as well.
9. **Save project** — the downloaded JSON is the single source of truth (keep it in SharePoint). Or
   **connect a folder** (below) and it saves itself.
10. When a device is fully decided, use the **Generate** tab. Implementation and Verification produce
   `.zip` bundles; Reporting, Control and **Procedure** produce a single `.md` each, composed in the
   **Report Design** workspace and converted to PDF with `pandoc report.md -o report.pdf`.

## Input capture formats

Captured externally (the tool never runs `adb`); the Onboard tab shows these too.

- **Packages** (`packages.txt`, text): `adb shell pm list packages` — one `package:<name>` per line.
- **Tactical** (policy `.json`): the Knox tactical configuration exported as a JSON object.
  - `firewallRules` is **one register item holding the whole rule list**, so the number of rules in a
    capture never changes the key set (zero rules and nine rules are the same single row). Its value
    is edited as JSON and written back verbatim. Projects saved before this are converted on load.
  - `usbInterfaces` is an **exhaustive** list: wherever the block appears, any of the nine host
    interface classes it omits is added as `false`. A capture with no block at all is left alone.
- **Custom Security Actions**: nothing to capture. These rows are authored in the tool and apply to
  every device in the project.

> **Settings was retired in v2.0.** Every hardening change the fleet needs is expressed through
> Packages and Tactical, so the `settings list` register (thousands of mostly cosmetic keys) was
> removed. Projects saved by v1.x still open: the Settings items, snapshots and overrides are
> dropped on load and the Activity drawer says exactly what went. Save the project to make the
> removal permanent.

## Project folder (optional)

Connect the tool to a folder — in practice a OneDrive/SharePoint-synced one — and it loads and saves
itself there. Edge/Chromium only, and entirely optional: **Save project** works exactly as before,
and not connecting locks nothing.

```
<project folder>/
  ch-config-tool.html              the tool
  project.json                     written 60s after your last change, and at least every 3 minutes
  Snapshots/                       previous versions: ≤ 1 per 5 minutes, newest 40 (~3.5h of rollback)
  Outputs/<device>/<command>/      generated scripts and reports, unpacked
  project.corrupt-<stamp>.json     a project that could not be read, moved aside — never overwritten
```

- **Save to folder** in the top bar writes immediately and restarts the timer, and snapshots even
  when one is not due — a save you chose is a point worth rolling back to. The folder **chip**
  beside the project name is a button: click it for the folder's name, **Change folder** and
  **Disconnect**, from any state.
- **Reconnecting is normal.** Browsers remember the folder but drop write permission on restart, so
  every session after the first starts with a one-click **Reconnect**. Until then the app is
  read-only — the one moment you might otherwise think your edits were being saved.
- **The cadence is deliberately slow.** OneDrive records a version per change and prunes the oldest
  at its limit; a save-every-keystroke design would burn hundreds of meaningless versions in an
  afternoon. Use **Roll back** in the top bar for the last few hours, OneDrive's own history beyond.
- **It refuses to clobber.** If `project.json` changed since the tool last wrote it, the write is
  refused and you choose: keep yours, take theirs, or save yours separately. All three snapshot the
  side being replaced first. A OneDrive conflict copy (`project-yourname.json`) is reported and left
  alone.
- **A folder that moves is handled.** If OneDrive moves, renames or re-syncs the folder, the tool
  says so and asks you to pick it again rather than failing quietly. Nothing is lost — the work
  stays open and **Save project** still downloads it.
- **Offline works.** Set the folder to *Always keep on this device* in OneDrive, or Files On-Demand
  can leave snapshots and outputs unreadable while you are off the network.

Full specification: `folder-storage-requirements.md`.

## Outputs

The two **script** commands produce **one deterministic `.zip`** (plus a `manifest.json` with per-file
SHA-256 and the decision snapshot used) — or, with a folder connected, the same files written
unpacked into `Outputs/`, since the throttling that made a single zip necessary applies only to
downloads. The three **document** commands produce **one deterministic
`.md`**, with no zip and no manifest — the provenance the manifest carried (tool and version, device,
generated-at, project SHA-256) is written into the document's own YAML metadata block, where a reader
of the finished PDF can see it.

- **Packages → a PowerShell** script that drives `adb` on a Windows host (run it there).
- **Tactical → `tactical.json`** in the captured format — **upload directly to Knox tactical** (no
  script, no extra steps).
- **Custom Security Actions → `custom-actions.txt`**, a runbook (step, rationale, rollback, controls)
  performed by hand, plus `custom-actions.verify.txt` to evidence it. Neither is a script — the tool
  cannot know how to perform an action it did not define. Nothing is emitted if there are none.
- **Reporting → `report.md`**, composed in the full-screen **Report Design** workspace (below).
- **Control report → `control-report.md`**: each control and the items that satisfy it.
- **Procedure → `procedure.md`**: the work in the order it is carried out. Each Custom Security
  Action is a step (with its Procedure, rationale and rollback); *Configure Packages* and *Configure
  Tactical Settings* are one step each. The order is set by dragging the steps on the Generate tab
  and is saved **in the project**, so it travels with the file.

### Report Design

The Reporting document is composed, not fixed. The workspace holds the ordered section list on the
left and five panes on the right.

- **Order and heading levels.** Drag sections (order is saved in the project). Each carries a level —
  `T` for a title, `H1`–`H4`, `N` for normal text, or **Auto**, which makes it a sibling of the last
  heading above it. Sections are auto-numbered from the level sequence (`1`, `1.1`, `1.2.1`),
  counting only what is included. A level with no level above it is pulled up one and says so.
  `T` prints a top-level heading that takes no number **and gives none away** — a document opening
  with a title or an executive summary still has `1` on the first `H1` after it.
- **Names, headings and introductions.** A section's **heading** is what the document prints; its
  **name** is what the section list calls it. Leave the name blank and they are the same. The name is
  for a heading that is long, or that changes with how the report is being used. A **generated**
  section has a heading box too, so the wording a register section prints is yours to set (blank =
  the standard wording). Every generated section also takes an **introduction** — your own prose
  between the heading and the table, written once for the section rather than once per group.
  **Number it** gives that introduction the first of its section's numbers, with the groups shifting
  down to make room — *5 Packages*, then *5.1* the introduction, then *5.2 Packages — Removed*.
- **Your own sections.** A heading plus an ordered stack of paragraphs, fill-in tables, horizontal
  lines and page breaks, in any arrangement. Leave the heading blank and the section becomes body
  text at the level above it. Bold/italic/code/line-break buttons insert markers rather than raw
  markdown, so nothing you type can collide with the escaping.
- **Columns and groups.** The **☰** button on each section row says which columns its table carries
  — the registers, and **Control coverage** too (Type, Description, Status, Items and Justification
  are each optional) — and for a register that splits by action, which groups. They are on the row rather than
  in a pane so they can be changed with the Preview open. The first column is the key and is always
  there. A control's **type** is its own column rather than brackets after the title.
- **Selecting a section does not change which pane is showing**, so you can click down the list and
  watch the Preview without two clicks back each time.
- **Column widths.** On a table you wrote, drag the right-hand edge of a column heading. On a
  generated section, the **Column widths** strip stands in for the table and drags the same way.
  Or double-click a percentage and type one (minimum 5%); **Tab** moves to the next column's box and
  **Shift+Tab** to the previous.
  **Dragging** moves a boundary — the others give way and the table stays the width it was.
  **Typing** sets one column and leaves the rest alone, which is what changes the total.
  A percentage is a share of **the page's text width, and the shares need not fill it**: three
  columns at 20% each make a table 60% of the page, centred. Over 100% is flagged in red — the table
  still renders, capped at full width with the columns scaled to fit, so no column ends up the width
  you typed. Widths are saved **in the project** and reach the PDF as real column widths; **Reset
  widths** returns the table to automatic. Both editors are drawn to scale at the page's text width,
  so the drag is honest.
- **Automatic widths** are not "all columns equal". A table that fits is left as its content sizes
  it; one that does not is laid out, with the columns measured in **typeset width** rather than in
  characters — an `i` is a third the width of an `m`, a monospace package name costs more than prose,
  and bold costs more again (the em figures are measured out of Latin Modern, not guessed). Three
  claims are settled in order: a word with nothing to break it, then an identifier that *can* be
  broken but should not be minced, then columns that would simply rather be wider and will wrap if
  they are not. It is a rule of thumb; set the widths yourself when a table has to be exact.
- **Long runs with no space in them** — a package name, a path, a settings key — cannot be broken by
  a typesetter unless asked: there is no hyphenation point in `io.sdsasolutions.tacticalsettings`,
  and a word that does not fit runs past its column into the next one. A run of 18+ characters shaped
  like an identifier is therefore written into the document as a **code span**, which is what makes
  it breakable and stops it demanding a column wide enough to hold it whole. It is set in monospace
  as a result — the right typography for an identifier, and what the key column already does.
  Ordinary prose is untouched; it wraps at its spaces.
- **Captions and table styling.** Every table is captioned and numbered — a hand-written one with no
  caption of its own takes the section's heading, and the numbering is the one the PDF prints, so a
  link that says "Table 4" is right. A table can also wear a styled **header row** and **first
  column**: what *styled* looks like (bold, italic, shade) is set once under **Formatting**, and
  which tables wear it is ticked per table. **Centre the table caption** is there too — a caption
  shorter than its table is centred by the typesetter anyway, one that wraps is not, and the switch
  centres both.
- **Cross-references** store only the target's internal id, so reordering changes the number the link
  reads and renaming changes its title — the link itself never breaks. A deleted target renders as a
  visible **[missing reference]**.
- **Per-section preview.** Selecting any section — generated or hand-written — shows that section
  alone, rendered for the selected device from the same code the document is built from, numbered and
  captioned as it will be. Any section can also be centred on the page.
- **Device Config Information** rows are individually switchable: platform, device, model, firmware,
  version, generated time, the project hash and one row per capture hash. (There is no "Generated
  (UTC)" row — it duplicated the AEST one; the exact instant is still in the document's metadata.)
- **Deviations from Security Guidelines** lists every item flagged as departing from the guidelines,
  grouped by register, with its description and narrative. A register with nothing flagged is left
  out; if nothing anywhere is flagged the section does not exist — not even as an "Omitted" row,
  because nobody chose to leave it out.
- **Formatting profiles** — paper, margins, page numbers, per-level heading styling, contents depth,
  three font sizes (document text, table text, table headers), caption centring, and the header-row /
  first-column table styling. Saved with the project.
  The built-in **Standard** profile cannot be edited; duplicate it, so every project keeps a
  known-good baseline.
- **Templates** — a single section, a formatting profile, or a whole report design. All three export
  and import on their own. **An import never deletes anything**: non-colliding names are added, and a
  name collision is resolved case by case (with *Keep all mine* / *Replace all*). Silence keeps yours.
- **Preview** — the document rendered from the same markdown Generate downloads, with a clickable
  outline, drawn as a **page** that carries the formatting profile: paper width and margins, base
  font size and line spacing, each heading level's size and weight, the table shading colours and the
  caption alignment. Change any of them and the preview follows without generating anything. It is an
  approximation — a browser is not a typesetter — but it is faithful about the content, the order and
  the proportions.

Anything excluded is named and counted in the document itself, so a shorter report never reads as a
complete one.

### Control satisfaction

Each control carries its own state **per device**, set in the control's pop-up on the Devices tab
beside the evidence for it. The button cycles: **Unsatisfied → Satisfied → Satisfied with Exception →
Unsatisfied**, and always says where the next click lands.

*Satisfied with Exception* is for a control met in substance but not in the form the guideline
states — the package cannot be uninstalled on this build, so it is disabled instead. It counts as
**decided**, so it does not sit in the "still unsatisfied" count; the departure is the report's
business, and the report carries it. A control marked satisfied — with or without an exception —
and no justification is flagged everywhere, including in the report, which prints *No justification
recorded* rather than leaving the cell blank.

### How captured values are printed

In the **documents**, a list or a record value is printed as a reading rather than as JSON: an empty
list says *(none)*, a string list gets one entry per line, and a record list (a firewall rule set) is
numbered with its fields spelled out. The `tactical.json` a device consumes and the verification
script still carry the exact canonical JSON — they are read by machines.

### LaTeX safety

Verified end to end with **pandoc 3.1.11 + tectonic 0.17.0** — the generated document builds to a PDF
with no errors and no visible overfull boxes:

```bash
pandoc report.md --pdf-engine=tectonic -o report.pdf
```

No flags, no filters and no template are needed: paper, margins, fonts, page numbers, contents and
the per-level heading styling all travel in the document's own YAML metadata block. Tectonic fetches
the TeX packages it needs on first run and caches them, so the **first** build needs network access
and takes a minute or so; later builds are offline and quick.

Characters that are load-bearing in LaTeX — `\ { } $ & # ^ _ ~ %` —
are escaped on the way into the file, and register keys (package names, settings paths) are emitted
as code spans, which are verbatim. Nothing is altered in the project: a package really named
`com.samsung.android.app_x` is stored that way, because the implementation script has to name the
package the device actually has. The escaping happens only in the generated document.

## Self-tests

Append **`#selftest`** to the URL (e.g. `ch-config-tool.html#selftest`) to run the embedded test
suite in-page. It must show all green. The harness is also runnable headlessly (see
`progress-log.md`).

## Definition-of-Done checklist (spec §1.1)

| DOD | What | Status |
|-----|------|--------|
| DOD-1 | Single `.html`, runs from `file://` with no console errors / no network | ✅ no network/external refs; **verified in headless Chrome from `file://` — full suite green, zero console errors**; manual pass in Edge/Firefox still advised |
| DOD-2 | Load → the data tables → search/sort/filter → save losslessly | ✅ engine round-trip tested; tables data-driven |
| DOD-3 | Onboard via the capture files; Onboard disabled until all parse | ✅ |
| DOD-4 | Onboarding embeds hashed snapshots, inherits keys, appends new undecided, triage summary | ✅ |
| DOD-5 | Undecided flagged; decisions via decisionSchema controls | ✅ |
| DOD-6 | Implementation/Verification/Reporting independent, gated on completeness | ✅ |
| DOD-7 | One artifact per generator (`.zip` for scripts, `.md` for documents); byte-deterministic | ✅ tested (incl. real data) |
| DOD-8 | The report converts to a formatted PDF | ✅ pandoc-targeted markdown + YAML/LaTeX preamble; **verified end to end** with pandoc 3.1.11 + tectonic, including dragged column widths and table shading |
| DOD-9 | Device view: read-only applicable decided items, one panel per dataset | ✅ |
| DOD-10 | Malformed inputs → located, non-fatal errors; never silent | ✅ |
| DOD-11 | A new dataset/platform needs **no core edits** (adapter/profile only) | ✅ portability self-test (mock platform) |
| DOD-12 | Module headers + JSDoc; embedded self-tests pass | ✅ 752/752 |

**Manual check remaining:** DOD-1 — open the file in all three browsers and confirm a clean console.
Everything else is covered by the embedded self-tests, the headless passes and a real pandoc build.

## Project files

- `ch-config-tool.html` — the application (the only runtime artifact).
- `android-ch-config-tool-build-spec-v2.0.md` — the normative build spec (current).
- `android-ch-config-tool-task-breakdown-v2.0.md` — the phase/task breakdown behind the spec.
- `Archive/` — the superseded v1.0 spec and task breakdown, kept for the audit trail.
- `progress-log.md` — per-phase build log (what was built, tests, results).
- `src/` + `tools/build.py` — the tool's source files and the build that assembles them into
  `ch-config-tool.html`. Edit `src/`, never the built file; run `python3 tools/build.py`.
- `validation-testing-plan.md` — manual plan to validate a full CH config onto real hardware, and to
  compare it against an independently hand-hardened device.
- `defect-register.md` — defects found during review and their fixes.
- `Reference Input Files/` — real sample captures used to validate the parsers/generators.
- `CLAUDE.md` — orientation for AI coding assistants: the hard invariants, which document to read
  for what, and a generated map of every module and self-test suite in `ch-config-tool.html` with
  its line range, so the 1 MB file never has to be read whole.
- `tools/gen-code-map.py` — regenerates that map. Run it after editing `ch-config-tool.html`
  (`--check` verifies without writing). A `PostToolUse` hook in `.claude/settings.json` and
  `.githooks/pre-commit` both call it; enable the latter once per clone with
  `git config core.hooksPath .githooks`.
