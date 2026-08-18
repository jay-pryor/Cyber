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
| 14 | v2.2: Report Design — markdown documents | ✅ complete | levels + auto-numbering; authored sections; cross-refs; formatting profiles; templates; preview; one `.md` |
| 15 | v3.0: links, table wording, header/footer, generation | ✅ complete | references resolve to real PDF links; controls auto-link; per-table title rows and column headings; header/footer pane; `/[Tag]` placeholders; paged preview |
| 16 | v3.1: the box shows what it holds | ✅ complete | rich-text boxes with reference chips, in paragraphs and table cells; the report's composition saved with the project; optional captions; first-column styling visible and document-wide; a title row no longer shrinks its table |
| 17 | v3.2: folder storage (TF.1–TF.13) | 🟡 in progress | connect to a OneDrive folder; 60s idle / 180s capped canonical write; ~5s IndexedDB draft; rolling snapshots with 5-min floor and newest-40 retention; unpacked `Outputs/`; divergence refused not clobbered. **Awaits hand-verification in real Edge against a synced folder** — see `folder-storage-requirements.md` §13.2 |

Legend: ⬜ not started · 🟡 in progress · ✅ complete · 🔴 blocked

**v1.0 PHASES 0–8 COMPLETE** + **v1.1 PHASE 9 COMPLETE** + **v1.2 PHASE 10 COMPLETE** + **v1.3 PHASE 11
COMPLETE** + **v2.0 PHASE 12 COMPLETE** + **v2.1 PHASE 13 COMPLETE** + reviews 1–17 + report-gen.
**1017/1017 embedded self-tests pass** (the first 426 verified in real Chrome from `file://` with no
console errors; the 6 added for UNDO-1 and the 8 added for VER-1..VER-4 / IMPL-1..IMPL-4 are
headless-verified only and still want a Chrome run. SP-4's scroll round-trip passes only in a real
browser — jsdom implements no layout, so a headless run reads 439/440 with that one test failing).
Validated end-to-end against the real reference captures (incl. v1→v2→v3 migration,
per-config/group overrides, and the v1.x→v2.0 retired-dataset upgrade path). Remaining: one manual
check only — open `ch-config-tool.html` in Chrome/Edge/Firefox (DOD-1). **DOD-8 is now automated**:
`tools/build-pdf.sh` fetches pandoc + tectonic and builds a generated document, and the pages are
inspected (see the v3.0c log entry). Defect register: 9 defects found during review, all FIXED.

**Current normative documents:** `android-ch-config-tool-build-spec-v2.0.md` and
`android-ch-config-tool-task-breakdown-v2.0.md`. The v1.0 pair is superseded and lives in `Archive/`.

### 2026-08-18 — v3.6 the classification banner is a property of the document (CLS-1 · D-064) — ✅ COMPLETE

Reported as "the check state of the classification banner is not persistent in the save file". It
was session state, deliberately, and the deliberation was wrong: it sat beside the file name and the
`/[Tag]` values, which genuinely are answers for one run. How sensitive a report's contents are is
not. It meant re-ticking the box every time the tool was opened, and — the half that matters — a
document generated from a fresh session went out **unmarked**, which is the wrong failure direction
for a switch that says whether something is sensitive.

It lives in the project's `report` bag now, beside `titleBlock` and on the same presence rule: on is
written, off leaves no trace (DOD-7), and it survives a save and load.

**One answer, not three.** The report, the control report and the procedure each carried their own
session flag for the same banner. They read one project-level switch now, so three ticks that always
had to agree can no longer disagree — tick it anywhere and every copy of it shows ticked.

**Verified:** 1057/1057 self-tests (one new: the project write, the round trip, off leaving no
trace, and the session blocks no longer carrying the field at all), both live-DOM harnesses, and a
probe that ticks it on one card and finds it ticked on the others, in the generated report, in the
saved file and after a reload. The reference document still builds marked, and clean.

### 2026-08-17 — v3.5 a section left out of the contents was listed anyway (D-063) — ✅ COMPLETE

Reported as "the *leave this section out of the contents list* checkbox is not working for my Title
level title block". It was not working at any level; a Title block is simply where it cannot be
missed, because the thing being listed is the cover page.

The heading carried pandoc's `.unlisted` on its own. Pandoc reads `unlisted` **only** alongside
`unnumbered` — `pandoc -t latex` on `# X {.unlisted}` gives a plain `\section{X}`, and `\section`
writes itself into the `.toc` whatever class it was handed. The pair gives `\section*{X}` with no
`\addcontentsline`, which is the one thing that keeps it out.

The pair had been avoided on the reasoning that a section out of the contents "keeps its number".
True, and nothing to do with the class: `numbersections` is false for this whole document — the
numbering App.doc produces is not one LaTeX can express, so every number is already in the heading
*text*. `.unnumbered` takes nothing away here but the `\addcontentsline`.

Nobody noticed because the preview builds its own contents list from the outline and honoured the
flag correctly. The switch worked everywhere it was cheap to check and failed in the only medium
that ships.

**Verified:** 1056/1056 self-tests (one new for the Title level; the existing SEC-4 test had
asserted `.unlisted` *without* `.unnumbered` and so encoded the defect — it now asserts the pair,
and separately that the number still prints). On a built page: the reference document's Approval
section is `noToc` at a page-breaking level with a 70mm gap, and it still reads "6 Approval", still
starts its own page, still comes down its 70mm, still carries its `\label` — and is not in the
contents, where the cover page no longer appears either.

### 2026-08-17 — v3.4 empty space you can measure (SPC-1 · D-062) + the conversion command — ✅ COMPLETE

**The conversion command, in full, on the Generate pane.** It used to read `pandoc report.md -o
report.pdf`, which is not the command that builds this document: no engine, and no `--lua-filter`,
without which every table in the file comes out wrong. It now carries the real command, the
full-path form, why the filter is not optional, the three things that go wrong on Windows (both
binaries on `PATH`, tectonic's first run needing the network, Acrobat's file lock), and how to read
the log for an overfull box. The in-app manual's copy of the same command was wrong in the same way
and is fixed with it.

**D-062 — "line breaks only ever show up as one additional empty line".** True, and it is not the
break that is wrong. Written as `{{br}}` tokens they do stack — five measure four blank lines on a
built page — but what a person types is Enter, and every run of two or more newlines is one
paragraph break in markdown. LaTeX gives that one `\parskip`. Making it stack would mean a blank
line no longer means a paragraph break, which every prose box in the designer relies on, and it
would still be the wrong tool for a signature block. So: WONTFIX, answered by a unit.

**SPC-1 — space is asked for in millimetres.** Three places, one measurement:

- a **Space** part, placed and moved like any other part in a hand-written section, drawn in the
  editor at the size it will print;
- **extra row height** on a hand-written table — millimetres of empty space *under* a body row's
  content, so a cell reading "Signed:" keeps its label at the top and the room underneath. It
  travels as a `\rule[-h]{0pt}{0pt}` at the end of the row's first cell: a strut with depth and no
  height or width, on a line of its own so it costs the column nothing (the mechanism the shaded
  first column and the row anchor already use). **Which rows take it is ticked per row**: setting a
  height puts a tick against every row, all on, and unticking one is what gets stored (`tallRows`,
  a boolean per row, absent meaning all of them — so a table written before the ticks renders
  exactly as it did, and one fiddled with and put back serialises as one that never was). The list
  travels with the rows through add and delete, the way the widths travel with the columns;
- **space above a section's heading**, which is the one gap no part can make — every part a section
  has is already below its heading. Offered on generated sections too.

**The last one is where the work was.** A `\vspace*` written before a heading is contributed to the
page the heading is *leaving*: when the level starts a new page (`\sectionbreak` is `\clearpage`,
fired *by* the heading, after our glue) the gap was spent at the foot of the previous page and the
heading came out flush with the top margin — measured on a built page, which is the only reason it
was caught. This is D-038's trap from the other side. The way out is this file's standing division
of labour: the document calls `\chGapOne{70mm}` by name and **App.docFormat** decides what the name
means — a level that breaks clears the page itself and then eats the break titlesec is about to
fire (a one-shot `\gdef` that puts the real break straight back); a level that does not simply
leaves the glue. `\titlespacing`'s own beforeskip cannot be used for this: LaTeX discards vertical
glue at the top of a page, which is the only place it would ever matter. The gap is emitted
*between* the styling declarations and the heading, because `\chTitleStyle` sets `\sectionbreak`
and would otherwise overwrite the one-shot before titlesec ever called it.

Every millimetre figure is sanitised where a text box hands it over (`App.docStore.mmValue`),
checked again by the schema, and clamped and rounded once more on the way into LaTeX
(`App.md.mmLen`) — it lands inside a length, which is past the last of this file's escaping. Zero
is stored as absence throughout, so a gap set and cleared leaves the project as it found it (DOD-7).

**Verified:** 1055/1055 self-tests pass (16 new, one suite), both live-DOM harnesses (129 and 65),
and a live-DOM pass (31 checks) driving the real millimetre boxes and the real row ticks through the
real handlers. Built pages, not reasoned about: a signature page whose heading sits 70mm down its
own page, a 25mm gap under its paragraph, and an approval table whose two signing rows are 22mm
taller than their content with the content at the top — while its third row, "Prepared by /
signed electronically", is unticked and stays an ordinary single-line row. The reference document
(`tools/make-reference-doc.js`, which now composes that page) still builds with **no overfull box
over 1pt**.

### 2026-08-17 — v3.3 a sort you can turn off (SORT-1) — ✅ COMPLETE

**SORT-1 — a column heading cycles ascending, descending, off.** A two-state toggle can only ever
leave a table sorted by *something*: sort the packages by Action to gather the removals, and there
was then no way back to the order the register holds — only a different sort. The third click now
takes the rule away rather than picking another one.

Off is a real absence, not one more sort. `filterSortRows` skips the comparator entirely, so the
tiebreak on key goes with it — otherwise "off" would quietly be a sort by key wearing a different
name — and the rows come back in the order the register holds them, which is the order they were
captured in. The distinction between "nothing said" and "nothing sorted" is carried by
`App.ui.model.sortKeyOf`: an absent key still means the historical default (sort by key), an empty
key means no rule, so no existing caller changes behaviour. Worth knowing: a *saved* project stores
its items key-ordered (the canonical form, §8.6), so on a freshly loaded project "off" and "key
ascending" show the same order — the difference appears once a session has added items, which append.

The transition itself is `App.ui.model.nextSort`, pure and shared by the click handler and the
heading's tooltip, so what the heading promises is by construction what the click does. That
tooltip is the whole discoverability story for the third state: an arrow can say ascending or
descending, and nothing on screen could otherwise announce that clicking again clears the rule.
With no rule in force, no heading carries an arrow.

**Verified:** 1038/1038 self-tests pass (6 new, in one suite), plus a live-DOM pass driving real
clicks on a real heading through all four steps of the cycle — arrow, row order, tooltip and the
"another column restarts at ascending" rule at each one. The CSV export needed no change: it reads
the same `filterSortRows`, so an unsorted table exports unsorted.

### 2026-08-17 — v3.2 a break in a cell, and a first column with a size (D-061 · FNT-6) — ✅ COMPLETE

Four things from use, two of them the same defect seen from two sides.

**D-061 — a line break in a table cell, in both mediums.** Reported as "we still aren't getting line
breaks rendering properly in the preview" plus "backslashes showing up in empty boxes", and the two
are one fault. `cellHtml` folded a cell's lines with a space *before* the inline pass — correct about
pandoc folding a cell's lines into one paragraph (D-025), wrong in that a cell's hard break is a
trailing backslash and a newline (RTX-2/D-060), so folding first turned the pair into `\` + space,
which no rule recognises. The fold now happens after. The empty box was the same thing one layer
down: a trailing break lands on a non-breaking space (BR-1), and both `cells()` and `parseGrid`
stripped it as padding, leaving the break's backslash as the cell's last character with nothing to
break onto. Padding is spaces and tabs; U+00A0 is content — D-059's rule, applied in the cell path
it had not reached.

**And the PDF was wrong too, which the report did not say.** Building the page (the standing lesson
of D-010/D-016/D-046) showed the break failing there as well — but only through this repo's own
`pdfGenLuaConfig.lua`. Pandoc's writer wraps a multi-line cell in a `minipage`, where its `\\` is a
line break; the filter writes the cell inline instead, which is what lets a merged title row and a
row colour work at all, and in a longtable row a bare `\\` **ends the row**. Measured: a cell reading
`one\ two` put "one" in the cell, "two" in the first column of a new row, and shunted the rest of the
table a column to the left. The filter writes a cell's `LineBreak` as `\newline\strut` now — the
`p{}` cell's own break, which its paragraph join already used; the `\strut` is what makes two breaks
in a row legal instead of "there's no line here to end".

**FNT-6 — the table's first column takes a size of its own.** FNT-5 had given it a weight and a
slope and stated plainly that it could have no size, because its emphasis travels as markdown on the
cell and markdown cannot say "and set this column two points smaller". That was true of markdown and
not of the document: the shade has reached the first column through a raw-LaTeX span at the head of
each body cell since TBS-1, and a size travels the same way. `\chTblColFont` is defined by the
profile (empty when nothing is set, like the shading macros), emitted by `App.md` on every table's
first column whether or not the section opted into shading, stripped by the preview and stated there
as a stylesheet rule instead — and **paid for in the width model**, which is what D-027 was about:
`tableMetrics` now carries a `firstCol` ratio beside `head` and `body`.

**The Tables fieldset loses its Bold and Italic columns.** They had been empty since FNT-4 and FNT-5
moved both weights to the Fonts table, carrying a "set in Fonts, above" note — two dead columns
explaining themselves in every profile anybody opens. The sentence under the table says it once; the
fieldset is the shade and nothing else now.

**Verified:** 1032/1032 self-tests pass (11 new, in two suites). Built pages, not reasoned about:
a document with the first column at 7pt in a 10pt table renders at 7pt in both a shaded and an
unshaded table; a hand-authored table with a break in the middle of a cell, at the end of one, and
in a cell holding nothing else renders all three correctly and keeps every cell in its own column.
The reference document still builds with **no overfull box over 1pt**.

### 2026-08-17 — v3.1 the box shows what it holds (RTX-1/2 · OPT-2 · COL-3 · CAP-4 · FNT-5 · TBL-2 · BR-1) — ✅ COMPLETE

Nine things from the third round of use. Six were defects with a single cause each; three were the
features that make the designer usable rather than survivable.

**RTX-1 — a text box renders what it holds.** Every place the designer wrote prose was a `<textarea>`
holding the raw token markup, so a cross-reference to the packages register read
`{{ref:ds:android.packages}}` while you were writing the sentence around it — the one part of a
sentence you cannot check by reading it. The boxes are `contenteditable` now and show what the page
will: bold as bold, a code span as code, a break as a break, and a reference as **the name of what it
points at**, as an uneditable chip. A reference over the author's own words is underlined instead and
the words stay editable; one pointing at something that has gone is red, here as well as in the PDF.

The storage is unchanged — the `{{…}}` tokens are still the truth, and a project written by an older
build opens in this one untouched. The new `App.ui.richText` is a **lens** over them: `toHtml` one
way, `fromNode` the other, and one shared walk answering all three of "what tokens does this box
hold", "where in them is the caret" and "where in the box is a given offset". A toolbar button acts
on the token STRING rather than on the DOM, which is what lets a selection survive the workspace
repainting when the reference menu opens — a pair of numbers into a string does, a DOM range does not.

**RTX-2 — a table cell takes the same formatting.** A cell held the same token markup a paragraph did
and was the one place none of it worked: `MD.cell` escaped and marked long identifiers and did nothing
else. `App.md.richCell` is the same writer with two things changed — what escaping the literal text
takes, and what a line break is written as — so bold, code, breaks and cross-references all work in a
cell, and the toolbar above a table acts on whichever cell was last written in. A break inside a cell
now carries the trailing backslash it needs: without it pandoc folds a grid cell's consecutive lines
into one paragraph, so a line break typed into a cell had never done anything on the page.

**OPT-2 — the report's composition travels with the project.** Which sections are in, which groups of
a register, which optional columns each carries and which Security Relevance categories are reported
were session state, on the same footing as "make the scripts .txt". They are decisions about the
DOCUMENT: lost on reload, they had to be re-made on every run and never reached the operator on the
other end of the file. They live in `project.report.options` now, stored as DEVIATIONS from the
default so an untouched project carries none of it and a column switched on and off again leaves no
fingerprint (DOD-7). The file name, the `/[Tag]` values and the classification banner stay per-run,
deliberately — the point of a tag is that the same design produces a different document each time.

**COL-3 — an optional column carries its own default.** The include-map's "missing means included" is
not true of every column. Rationale and Rollback are working notes; Type in a coverage table is one
repeated word; Items is the widest cell in it. A column may now declare `defaultOff`, declared by the
adapter (DOD-11), and one predicate — `App.report.columnOn` — answers "is this column showing?" for
the section builder, the coverage builder and the designer's tick alike.

**CAP-4 — a table can be left uncaptioned.** For a table that names itself in its own title row, or
one that is really a layout. An uncaptioned table takes no number either, so the numbers a reader
counts stay the numbers a cross-reference names — D-019's rule, still holding. It cannot then be
cross-referenced, which is the trade and is said in the UI.

**FNT-5 / the first-column styling that appeared to do nothing.** Ticking "style the first column"
DID reach the .md, the PDF and the preview — verified by building pages. It was invisible: the shipped
shade was `#F2F2F2`, under 5% away from white, and the weight that went with it only reached the
sections that had opted in. The shade is `#E7E6E6` now, and the weight and slope moved to the Fonts
table as a document-wide row beside the header row's — the same move FNT-4 made, for the same reason.
A profile saved before this keeps the weight it asked for.

**TBL-2 — a title row no longer shrinks the table.** Pandoc reads a grid table's column fractions
against `max(line length, --columns)`, so a table drawn narrower than 72 characters lands on the page
at that fraction of it: three columns at 0.14/0.13/0.17, a table 43% of the width of the page with
every column squeezed to match. Adding a title row forces the grid form, so it was doing exactly that
to ordinary tables. Automatic grid widths are now drawn to the same source budget an explicit set is;
the ratios are untouched and only the `.md` gets wider. The preview had a matching bug — it read the
title's own border as the width row and lost the widths altogether.

**BR-1 — a line break renders wherever it is written.** D-037 dropped a TRAILING break because `\`
with nothing after it is a literal backslash to pandoc. Dropping it also threw away the blank line the
writer asked for, which is why a spacer at the foot of a title page did nothing. The break is kept and
given an empty line to land on — one non-breaking space, which pandoc writes as `~`. The preview had
to stop reading that line as blank: `String.trim()` strips U+00A0 and pandoc's blank-line rule does not.

**REF-2 in the preview.** The empty span that anchors each control-coverage row printed literally —
`[]{#ctl-ahg-001} AHG-001` — because nothing in the preview knew what it was. It renders as what it is
on the page: an anchor of no width.

**Verification:** 1017/1017 embedded self-tests pass (45 new across RTX-1, RTX-2, OPT-2, COL-3, CAP-4,
FNT-5, TBL-2 and BR-1). Both live-DOM passes pass (129 and 65), updated to drive the new surface.
Every claim about the page was checked by building one: `tools/build-pdf.sh`'s pipeline, with and
without the repo's Lua filter, and the pages read at 130–200 dpi rather than at 110, which is where
the "first column is not shaded" reading came from in the first place.

### 2026-08-12 — v3.0f the preamble gets its own escaper (D-055) — ✅ COMPLETE

A header reading `<---- Security classification` stopped the build with `Undefined control sequence`
at `\<`. Reproduced in four lines.

Every string in a generated document goes through `App.md.text`, which escapes for **markdown** —
correct, because everything in the document is markdown and pandoc produces the LaTeX from it. A
header or footer slot is the exception: it reaches the page through `header-includes`, which pandoc
passes to LaTeX **verbatim**. `\<`, `\>`, `\[`, `\|`, `\+` are ordinary markdown escapes and are
not commands LaTeX has; `\~`, `\^`, `\.`, `\=` are accents rather than characters. The two escapes
overlap enough — `\%`, `\&`, `\#`, `\$`, `\_` are right in both — that the wrong one looked right
until a character outside the overlap turned up.

`App.md.latex` is the other escaper: one pass from a table, because several of its replacements
carry braces of their own and a second pass would print `\textbackslash\{\}`. The slots and the
classification banner use it; those are the only two data-derived strings that reach the preamble,
which is now audited rather than assumed.

**GEN-TAB followed:** a placeholder in a slot is filled on the RAW slot text before the profile is
compiled, so its value is escaped once, for LaTeX, with the words around it. The document-wide pass
escapes for markdown and would have reintroduced the same fault through a tag value.

**Verified on a built page** with a deliberately hostile header —
`<---- Security classification & 100% {safe}_x #1 ~ \` — every character of which now prints as
itself. That string is in `tools/make-reference-doc.js`, so the build keeps proving it.
**972/972 embedded**, 129 + 64 live-DOM.

### 2026-08-12 — v3.0e both header rows carry the shade (D-053 · D-054) — ✅ COMPLETE

Making the title row a real merged header row (v3.0d) took the shading off the row beneath it.
`\chTblHeadShade` works by redefining `\toprule`, and pandoc emits exactly one of those, before the
FIRST header row — so the single `\rowcolor` it can carry went to the title and the column headings
came out white. `\rowcolor` cannot be reached for the second row at all: it has to sit at the start
of a row, and everything markdown can put there is inside a cell.

`\cellcolor` can be inside a cell, and — measured, because that was the whole question — it works
from inside the `minipage` pandoc wraps a header cell in. So the headings row is coloured cell by
cell, which is the mechanism the first column has used since TBS-1, and it is emitted only when a
title row has taken the row colour (a table without one is byte-identical to before).
`\chTblHeadRow` is the row-level equivalent for a writer that can reach a row start, and the Lua
filter emits it on every header row after the first.

**D-054, found while measuring the result:** the merged title row was about 4pt wider than the row
beneath it, because its `\multicolumn` width was written as "the whole table" and the columns do not
always add up to that — `fitscale` shrinks them when they would overflow, and the shares are rounded
besides. The filter now sums the covered columns' own shares and adds the furniture between them.
At 300dpi both rows span exactly 307..2172; before, 2181 against 2164.

**970/970 embedded**, 129 + 64 live-DOM, verified on the built page.

### 2026-08-12 — v3.0d the title row becomes a row (D-050 · D-051 · D-052) — ✅ COMPLETE

**D-050 — the title row is a real merged row now.** Third attempt, and the first two were a
paragraph dressed up as a row — which can never work, because a paragraph has to be given a width
and a table's is not known until it is typeset. Pandoc *does* support the real thing: a grid-table
row whose internal `|` are omitted is read as a spanning cell and written as `\multicolumn`
(checked with `-t native`, then on a built page). So the title is the first of two header rows. It
merges, it takes the header shading, the preview reads it back as the same row, and every macro the
previous two attempts needed is gone from the preamble.

**D-051 — two page breaks, and a blank page between them.** A section whose LEVEL already starts a
page (the shipped profile does at H1) and which also had "Start this section on a new page" ticked
got both. The per-level break is titlesec's `\sectionbreak` and App.doc cannot see it, so
`App.docFormat.levelBreaks` states it as data: App.doc suppresses the redundant break, and the
designer greys the switch out and says which level is already doing it.

**D-052 — the paged preview ignored per-level breaks**, for the same reason: there is no `\newpage`
in the markdown to find. The profile's answer is handed to the preview, which marks those headings
and breaks on them.

**968/968 embedded**, 129 + 64 live-DOM, all three verified on built pages.

**`pdfGenLuaConfig.lua` was patched to match, at the user's request.** It rendered a spanning cell by
padding the columns it covers with empty ones — the right number of `&`, and every vertical rule
still drawn straight through the merged cell — so the title row came out crammed into the first
column with the grid showing across it. `row_latex` now emits a `\multicolumn` for a cell whose
`col_span` is greater than one, sized to the columns it swallows plus the furniture between them
(two `\tabcolsep` and one `\arrayrulewidth` per join covered, the same accounting `textwidth()`
already does for the table). Verified on a built page: the row merges, spans the full table and
takes the header shade, and the tables with no title row are byte-identical to before.

### 2026-08-12 — v3.0c the PDF gets built (D-046 · D-047 · D-048) — ✅ COMPLETE

**DOD-8 is no longer a manual check.** This environment turned out to have a network. pandoc 3.1.11
and tectonic 0.15 are two downloadable binaries, and the user's own `pdfGenLuaConfig.lua` runs
against them — so the reference document now gets built and looked at. Three defects fell out of the
first build, two of which no amount of reading the LaTeX would have found:

* **D-046 — the table title row.** Reported wrong twice and reasoned about twice. A shaded band has
  to be given a width; a longtable's width is decided from its content when it is typeset, and is
  routinely narrower than the text block. The band was therefore wider than its table, and wider by
  a *different* amount for each of a grouped register's three tables. Nothing in the preamble can
  know that number. It is a centred line in the header row's type now, sitting directly on the
  table — a line has no width to get wrong — and the preview draws the same line instead of the
  spanning row it was drawing, which the page cannot produce.
* **D-047 — "Page 1of 7".** TeX eats the space after a control word. Proven in isolation: two
  `\fancyfoot`s in one document, `Page \thepage of 7` and `Page {\thepage} of 7`, render "1of" and
  "1 of". The slot macros are braced now.
* **D-048 — "different first page" did nothing.** Page one is not a `plain` page (with the title
  block off there is no `\maketitle`), so redefining `plain` never reached it; it has a style of its
  own now, which the document body asks for by name. And pandoc's `latex_macros` extension *applies*
  a `\renewcommand` it reads, so the second `\renewcommand{\headrulewidth}{0pt}` arrived as
  `\renewcommand{0pt}{0pt}` and errored, taking the page style with it. Emitted once now.

**Confirmed on the built page:** a centred title page that is centred and not justified, with no
blank page in front of it; `/[Date]` substituted throughout; line breaks with no stray backslash;
the first-page header and the running header each on the right pages; "Page 2 of 7"; 32 real `/Link`
annotations with every `\label` resolving, control mentions included. **968/968 embedded**, 129 + 64 live-DOM.

**Also found by measuring (D-049):** the width model was charging a column for a control link's
SOURCE — 23 characters written, seven printed — and a row anchor was widening its own column, which
re-proportions the page for a `\hypertarget` that is zero-width. Both corrected; the Control
coverage table's worst overfull box fell from 10.2pt to 6.0pt.

**Known residue:** ~3.2pt of overfull box on the Control coverage header row without the Lua filter,
and ~6pt with it. Isolated to the header row of a six-column table (the filter roughly doubles it
through its own `\tabcolsep`/`\arrayrulewidth` arithmetic), and confirmed NOT to be the row
anchors — stripping them changes nothing. Pre-existing, and left alone rather than tuned against a
filter the tool does not ship.

**New tooling:** `tools/build-pdf.sh` (fetches the two binaries, generates, converts, renders the
pages, reports overfull boxes) and `tools/make-reference-doc.js` (the document it converts).

### 2026-08-12 — v3.0b two symptoms, one walker (D-044 · D-045) — ✅ COMPLETE

**D-044 — centring one section centred the document, and stopped the page view.** Two reports that
read as unrelated and were the same defect. `App.md.centred` reaches the preview as pandoc's fenced
div, and the walker that reads those was not depth-aware. A centred paragraph inside a centred
section — a title page with both ticks — emits nested `center` environments; the walker closed the
outer div on the inner fence, and the outer closing `:::` was then matched by `/^:::/` as an
*opening* fence, which swallowed every remaining line of the document into a centred block.

That is also why the paged preview stopped after two sheets: the paginator places top-level blocks,
and everything after the title page had become one of them. The pagination code was right the whole
time — it was being handed a single block. Fixed by counting depth, treating an unmatched close as
the machinery it is, and no longer centring a part that is already inside a centred section (nested
`center` environments also contribute their vertical space twice).

**D-045 — the title row as a big grey box, detached from its table.** Also two faults in one
construct. A longtable contributes `\LTpre` — about 12pt — above itself, and that glue was the gap
between the band and the table it names; it is cancelled now by exactly itself, for exactly the
table that follows, so nothing else's spacing moves. And the closing macro carried a second
`\strut`: the paragraph inside the minipage has already ended by then, so it began a *second line*,
and a one-line title came out in a box two lines tall.

**Verified:** a 300-row table now spans 8 sheets in the page view with every row placed, each part
repeating its header, and no sheet holding more than a page. **965/965 embedded** (166 suites), 129
+ 64 live-DOM.

### 2026-08-12 — v3.0a the second look at v3.0 (D-036 … D-043) — ✅ COMPLETE

Nine things found by using v3.0 properly. Eight are defects; two of them are older defects that
v3.0 made reachable.

**Cross-references cut in half (D-036).** A control link in a table cell printed as
`[AHG-002](#ctl-ahg- 002)` and arrived in the PDF as text. Reproduced before touching anything,
which is what found the condition: it needs HAND-SET column widths. The automatic width path has
refused to cut an unbreakable run since D-021; the explicit path had no floor at all and wrapped to
whatever was dragged. Pandoc rejoins a cell's lines with a space, so a cut anywhere inside a link
puts one in the destination. `gridTable` now applies the same floor to both paths — scaling the
table up uniformly, so the dragged fractions survive and only the width of the `.md` changes. The
same floor closes D-021 in the explicit path, where a package name could have been cut identically.

**A centred title, justified, with a blank page in front of it (D-038).** Wrapping a heading in a
`center` environment does neither thing it looks like: titlesec sets the heading's text in a box
`\centering` does not reach, and the environment's glue is contributed before `\sectionbreak` fires
— so a level asking for a page break got the glue on a page of its own. Centring is now `\centering`
inside the `\titleformat`, as a per-level macro pair, which is the shape TTL-3 already used.
**Found while fixing it (D-039):** a hand-authored section's centring reached the per-section
preview and never reached the document — and a title page is always hand-authored.

**The rest.** A trailing `{{br}}` printed a literal backslash, because at the end of a block there
is no next line for a hard break to start (D-037). The link menu offered every section and no
generated table, because it outlined the unfilled blocks and a generated table exists only inside
the markdown its register produced (D-040). Pressing a formatting or Link button dropped the
selection, twice over — the button took focus, and opening the menu repainted the box away (D-041).
In page view the navigator jumped nowhere, because `offsetTop` is relative to the sheet (D-042), and
a table stopped at the page edge with the rest of its rows absent from the preview — it now splits
across sheets and repeats its header, as a longtable does (D-043). Placeholders now substitute in
the per-section previews as well as the whole-document one. The table title row is measured against
`\columnwidth` rather than `\linewidth`, so a narrowed table's title matches its table.

**Tests:** **960/960 embedded** (165 suites), **129** live-DOM in `live-dom-report-design.js`,
**64** in `live-dom-report-output.js`. The pagination tests supply jsdom with a synthetic layout —
every row 20px — because where a page ends is a measurement and jsdom makes none; they assert that
no sheet holds more than a page, that every row of a long table survives the split, and that each
continued part repeats its header.

**Still unbuilt:** DOD-8, as before. The title-row band (`lrbox`/`minipage`/`\colorbox`) and the new
`\titleformat` centring macros are asserted as shape only.

### 2026-08-12 — v3.0 references that work, a document that names itself (REF-1/2 · FNT-4 · CTR-1 · TBL-1 · SEC-4 · HDR-1 · GEN-TAB · PRV-4) — ✅ COMPLETE

Nine pieces of work, all in the Report Design half of the tool. Two of them are defect fixes that
turned out to need the feature rebuilt around them.

**REF-1 — cross-references reach the PDF as links.** The reported symptom was a reference printing
as `{{ref:ds:android.packages}}` on the page. The cause was one character: the token pattern's id
charset had no `.`, so the id of every *register* section never matched and was escaped through as
literal text (D-030). Fixing that alone would have left the feature thin, so the mechanism was
rebuilt around it:

* **three readings per reference** — `{{ref:}}` full ("Table 4: Packages removed"), `{{refn:}}`
  number ("Table 4"), `{{reft:}}` title — chosen per insertion, all derived at render time, so a
  renumber or a rename moves what every existing reference *says* without touching any of them;
* **a wrapped form**, `{{ref:ID}}…{{/ref}}` — select text before pressing the button and those
  words become the link, which is what someone who highlighted them meant;
* **paragraphs are targets**, each emitting a `[]{#par-…}` anchor, because "see section 4" is often
  more precision than the writer has and less than the reader wants;
* **generated sections can link too.** An introduction was rendered by the generator with
  `MD.rich(intro, {})` — before the outline exists, so with no resolver to hand (D-031). It is
  rendered by `App.doc` now, with the ctx a hand-authored paragraph gets, and the introduction
  toolbar gained the Link and line-break buttons in the same change.

**REF-2 — every mention of a control links itself.** Write `AHG-001` in a paragraph, a rationale or
a justification and it becomes a link to that control's row in Control coverage; the row carries an
anchor, threaded through a new `rowAnchors` option on `App.md.table` that costs the column no width
and cannot be broken. Nothing is linked when the coverage section is switched off — a link to a
section the document does not carry is a link to nowhere, and pandoc does not warn.

**FNT-4 — every kind of text has a size, a weight and a slope.** A **Table captions** row joins the
Fonts table, and bold/italic are live on all four non-heading rows rather than greyed out. The
header row's weight moved out of the per-section "style the header row" opt-in — two switches
saying "bold" about different sets of tables is how a document ends up with two kinds of header —
so it reaches every table through `\chTblHeadFont`, and opting a section in now buys the shading.
An older profile's `tables.head.bold` is read into the new field once, on load.

**CTR-1 — centring a section centres its heading.** The switch is what someone composing a title
page ticks; getting a centred body under a flush-left title was not a formatting choice anybody
made (D-032). Found while fixing it: the preview threw away the outline of any centred block, so a
centred section vanished from the rail and the contents list (D-033), and a paragraph anchor was
being attached to the next table instead (D-034).

**TBL-1 — the "Removed"/"Tactical" subtitles are gone.** A grouped register produced a numbered
sub-section per group, printing the group's declared name as a heading *and* again as a "— Removed"
caption suffix. Both are gone; the groups are now tables under the one heading. In their place each
table names itself, per table: a **title row** above the column headings (a full-width band in the
header row's own type — markdown has no column spans, so it takes the same
paragraph-between-macros shape the caption does), a **caption** that follows the title row unless
given one of its own, and a **heading per column**, because the same column carries different
content in each.

**SEC-4 — two more per-section switches**: start on a new page (distinct from the per-*level* rule,
which is house style), and leave out of the contents list while keeping the heading, the number and
the anchor — so a cross-reference to a title block still reads correctly.

**HDR-1 — a Header & Footer pane.** Header and footer configured independently, three slots each,
`#page`/`#pages` markers, and an optional different first page. The OFFICIAL: Sensitive banner
moved here and now takes the first *free* slot of each rather than being pushed sideways by a rule
about page numbers. `page.numberPosition` is gone as a setting — five fixed answers competing with
six slots for the same three positions — and is migrated into the slots on load.

**GEN-TAB — a Generate pane.** The document is named, and every `/[Tag]` written anywhere in it —
heading, introduction, paragraph, table cell, title row, column heading, header slot — is listed
with a box beside it and substituted everywhere on generation. Found and replaced on the *finished*
markdown, which is the only place all of them have arrived. An unfilled tag prints as it stands; a
silent gap reads as complete and is not. The footer's Generate button is gone.

**PRV-4 — a page view in the preview.** A toggle that lays the document out as sheets sized from
the profile, breaking where the document asks and where the content runs out of page, with the
running header and footer drawn in the margins. Off, it is the continuous view it has always been.

**Tests:** **950/950 embedded** (163 suites; +51), plus **122** live-DOM assertions in
`tools/live-dom-report-design.js` and **64** in `tools/live-dom-report-output.js`. Nine new suites
lock the above. D-035 — a first-page header reading "Title page" printing as "Title 1", because the
slot markers were the bare words — was found by the live-DOM pass and not by any render-only test,
which is the third time that has been true in this file.

**Still wanting a real run:** DOD-8. No pandoc or TeX in this environment, so the emitted LaTeX for
the title-row band (`lrbox`/`minipage`/`\colorbox`), the `\AtBeginDocument` body emphasis and the
`fancyhdr` first-page style are asserted as *shape* only. Everything they rely on is a kernel
construct or already proven elsewhere in the file, but the page has not been built.

### 2026-08-11 — v2.9 two sections retired, one Fonts table, a title of its own (SEC-3 · NAM-3 · FNT-3 · TTL-3) — ✅ COMPLETE

**SEC-3 — "About this report" and "Deviations from default" are gone**, on request, as sections and
as machinery: the two blocks, `compositionBody`, `reportSectionDescriptor`, `buildDeviationsSection`
and the descriptor threaded through `sectionContent` are all deleted rather than left switched off.
An id in a saved arrangement that no longer resolves has always been ignored rather than honoured,
so a project written before this still opens, still generates, and simply has two fewer sections.

**What went with them, deliberately named here rather than discovered later.** The RPT-2 relevance
note — *"items marked REPORT, IRRELEVANT were left out: 2 applicable items are not shown below"* —
was the last paragraph of the composition section and had no other home. The filter still applies
and the Report Design workspace still counts what it will drop **before** you generate; what the
finished document no longer does is announce it. Restoring it is `relevanceNote` plus one call.

**NAM-3 — heading, then name, on every section.** A generated section asked for the name first and
the heading second; a hand-authored one has always done the opposite. They are the same two
questions and are now in the same order, which is the order the page puts them in.

**FNT-3 — every size in the document, in one table.** The Formatting pane's **Headings** fieldset is
**Fonts**, and it carries the document's own size (was under Page) and the two table sizes (were
under Tables) as three more rows beside the heading levels. Those three are a size and nothing
else, so the rest of each row is a disabled control rather than a gap — the column still lines up
and the row says plainly that leading, bold, spacing and New page belong to headings.

**TTL-3 — a title is styled as a title.** The `T` level printed at H1's styling because both emit a
`#`, and titlesec styles the COMMAND: a second `\titleformat{\section}` in the preamble would simply
win for both. So the title's row compiles to a MACRO instead — `\chTitleStyle` before the heading,
`\chSectionStyle` after it — and `App.doc` emits the pair around a title only. Deliberately **not**
a `\begingroup`: `\section` leaves the indent suppression for the paragraph after it in `\everypar`,
which is a local assignment, so closing a group straight after the heading would indent the first
paragraph under a title where the same paragraph under an H1 is not indented. The shipped row is a
copy of H1, so no existing document moves until it is edited, and a profile written before the row
existed inherits its own H1 by `normalise`'s positional fallback — which is exactly what that
profile was already producing. The preview follows: `.prv-title` instead of `.prv-h1`, from the same
row.

**Verification.** 15 new self-tests (SEC-3 · NAM-3 · FNT-3 · TTL-3) → **896/896 pass**, 154 suites,
headless. Both live-DOM passes green (85 and 64) after updating the two assertions that drove the
retired sections. **Not built to PDF** — pandoc/tectonic are not installed in this environment, so
`\chTitleStyle` is reasoned from titlesec's behaviour and locked by the preamble tests, not read
back off a page.

### 2026-08-11 — v2.8 six things the PDF got wrong (CODE-1 · TOC-1/2 · TTL-2 · CAP-3) — ✅ COMPLETE

**A toolchain, first.** Every one of these was a question about what the PDF actually does, and the
answers had been reasoned about rather than measured. pandoc 3.1.11 and tectonic 0.15 are installed
in this environment now, so each fix below was **built and read back off the page** — including the
three options that were tried and rejected.

**CODE-1 — a shaded box behind a code span.** The preview shaded them; the page did not.
`\colorbox` is the obvious answer and it is wrong: it typesets in an unbreakable hbox, and a
64-character SHA-256 inside one runs **49pt past the right margin** — exactly the defect BRK-1 fixed
by routing `\texttt` through `\seqsplit`. soul's `\hl` breaks only at spaces, which an identifier has
none of (**37pt** over); `\hl` around `\seqsplit` is a hard error. All three measured. So the choice
is made per span by the only thing able to judge it — the typesetter, which knows the run's width.
Fits, box it; does not, leave it breakable and unshaded, because a background painted across a line
break reads worse than none.

The measurement is against **`\linewidth`, not `\columnwidth`**, and the difference is the whole
thing: inside a table cell `\columnwidth` is still the page's column, so the first version boxed
`imsSettings.simSlot0.enabled` in a narrow first column and ran it 38pt out of the cell. Caught by
the build, not by a test.

**TOC-1 — the contents list is a section.** `toc: true` prints it immediately after `\maketitle`
with LaTeX's own heading: the one part of the document the section order could not reach.
`\@starttoc{toc}` prints the entries and nothing else, so the heading above them is ours — ordered,
levelled, renamed and numbered by the same machinery as everything else, and defaulting to **T**
because "1 Contents" ahead of the sections it lists reads as a section of the report. Its own
heading is emitted `.unnumbered .unlisted` so the list does not contain itself. The other two
documents have no such section and keep the automatic list, so nothing about them changes.

**TOC-2 — the gaps in it.** `tocloft`, and `\setstretch{1}` inside the list: a contents list is not
prose, and at 1.15 the stretch compounds with the class's own 1em inter-entry skip, which is what
made a seven-section report take most of a page to list. 2pt by default, and a box to change it.

**TTL-2 — no automatic title block.** There is no markdown that suppresses `\maketitle`; the only
way not to get it is not to name the metadata, so the switch withholds `title`/`subtitle`/`date`.
Off by default, stored in the project rather than the session — someone composing their own title
page should not have to switch it off every time the app opens. The provenance is not withheld with
it: tool, device, version, generated-at and the project hash still travel as their own YAML keys and
still print in Device Config Information.

**CAP-3 — the caption, and a counting bug behind it.** Pandoc's caption syntax puts the text
*inside the longtable's first head* — `\caption{...}\tabularnewline` before `\toprule`, read
straight out of its LaTeX — so it printed above the table whichever side the markdown put it on, and
no `\captionsetup` moves it. Two ways of moving it were built and rejected: `\AtBeginEnvironment`
fires before longtable resets `\caption`, and patching `\LT@makecaption` works but double-steps the
counter (Table 2, Table 4) and leaves the emptied caption row's space behind.

So a caption stops being a pandoc caption. It is an ordinary paragraph that **App.doc numbers**,
exactly as it numbers headings — which is also the answer to "why two counters?": there is now one,
and the number in the caption is by construction the number a cross-reference to it prints.

Making ours the only counter exposed a real defect: `tableIndex` descended into a grouped dataset's
`children` *and* read the same children back as flattened blocks, numbering a three-group Packages
report 1,2,3,4,5,3,4,5 — so **every table cross-reference after a grouped dataset named a number the
page did not print**. Invisible while LaTeX did the printing. Fixed, with a test that the numbers run
1..n.

**Verification.** 22 new self-tests → **885/885 pass**, 150 suites; live-DOM **85/85**; end-to-end
**62/62**. Four PDFs built and read: the default (captions below, shading on, no title block),
captions above, the title block on, and shading off with a hand-authored title page as the first
section — **zero overfull boxes** in all four.

### 2026-08-11 — v2.7 the document chooses its font (FNT-2) — ✅ COMPLETE

**Asked:** what font the Report Design preview uses, and whether the font could be set in the YAML at
the top of the generated `.md`. The answer to the first was *nothing chose it* — `.rd-paper` set no
family at all, so the preview inherited the app's UI sans (`--font`) while the PDF came out in
LaTeX's default serif. The preview was faithful about sizes, widths and shading and silently wrong
about the one thing being looked at.

**A package name, not a font name.** Pandoc has two knobs and they are not interchangeable.
`mainfont:` takes a font installed on the machine building the PDF and works only on XeTeX/LuaTeX —
a document carrying one substitutes or fails anywhere that font is missing, and this `.md` is meant
to travel. `fontfamily:` names a package from the TeX distribution itself, which every engine loads
and tectonic fetches on demand. So the file carries its own font, and the selector is a **fixed list
of ten** rather than a text box: the value is interpolated into a `\usepackage`, where a name that is
not a package is a hard compile failure with an unhelpful error.

Seven serif — Latin Modern (the default, which names nothing at all), TeX Gyre Termes, Pagella,
Schola and Bonum, Charter, Linux Libertine — and three sans: TeX Gyre Heros, Adventor, Source Sans
Pro.

**The sans trap.** `fontfamily: tgheros` on its own does nothing visible: a sans package sets
`\sfdefault` and stops, so the body stays in the roman default and only the (unused) sans family
changes. The three sans rows carry `sans: true` and the preamble adds
`\renewcommand{\familydefault}{\sfdefault}` — which lands *after* the template's `\usepackage`,
because `header-includes` is read late.

**One validation point.** The value reaches a LaTeX preamble AND a stylesheet, which are two
different ways for an unchecked string to do damage. `normalise` reduces it to one of the fixed rows
once — the same fail-safe rule `paper` and `normaliseShade` already follow — so neither consumer
guards it and the preview CSS is safe to interpolate by construction.

**The preview follows.** `.rd-paper` states the family and everything on the sheet inherits it, as
`\familydefault` does on the page. It is a screen face standing in for a metal one and is meant to
be; what it gets right is the shape class — serif against sans, wide against narrow — which is the
question a preview is being asked.

**Verification.** 7 new self-tests → **863/863 pass**, 146 suites; live-DOM **72/72** (8 new, folded
into `tools/live-dom-report-design.js`): picking a font from the real `<select>` on a duplicated
profile, then confirming the paper *and a heading inside it* **compute** to the chosen family — the
half of this a render-only test cannot see — and that the generated `.md` names the package and
carries the `\familydefault` switch. End-to-end 60/60. **Not built to PDF** — no pandoc or tectonic
in this environment — so the ten package names are checked against the distribution by inspection,
not by a compile.

### 2026-08-11 — v2.6 a Description column, and a numbered introduction — ✅ COMPLETE

**CCOL-3 — the control's description in the coverage table.** The table named a control and asserted
a status against it, and a reader who did not already know the control had to go and look it up —
which for an external reader means they cannot. On by default, like the other optional columns, and
an undescribed control reads *"No description recorded."* rather than leaving a blank cell, on the
same rule as the justification: an empty cell reads as an oversight either way, and this way it says
which.

**SEC-2 — a numbered introduction.** The wording ("optionally be numbered or not") had two readings
that meant different builds, so it was asked rather than guessed. The answer: the introduction takes
the **first of its section's child numbers**, and the groups shift down to make room —
*5 Packages*, *5.1* the introduction, *5.2 Packages — Removed*. Per section, not document-wide.

It takes a number without becoming a BLOCK, because it is not one: it has no heading, so it emits no
anchor, so it is not something a cross-reference could point at. `App.doc.outline` bumps a child-level
counter for it and records the number on the parent; `render` prefixes it to the text. The number is
escaped on the way out, because `4.1` in column 1 is an ordered-list marker in markdown.

**One thing that had to change to make it possible:** the introduction was being baked into the
section's `body` by `sectionContent`. Numbering is App.doc's job, and inside a body string there is
nothing to put a number in front of — so it travels as its own field now, which is the tidier shape
anyway. A title section never numbers its introduction: a title is deliberately outside the counter
machinery, and giving its introduction a number would be inventing one from counters it does not
touch.

**A wrinkle worth recording.** The generator outlines blocks that have been through
`sectionContent`, so they carry the rendered `introBody`; the designer outlines the RAW blocks, which
carry the unrendered `intro`. Taking only the first meant the preview numbered nothing while the
document numbered correctly — the two disagreeing about the same section. `outline` reads either.

**Verification.** 13 new self-tests → **856/856 pass**, 145 suites; live-DOM 64/64; end-to-end 60/60.
Built for real: *3 Packages* with *3.1* the introduction and *3.2 Removed* under it, and a six-column
Control coverage table carrying the description — zero overfull boxes.

### 2026-08-11 — v2.5a the table font size skipped the package names, in the preview — ✅ COMPLETE

**Reported:** the table text size did not appear to apply to the package names, "because they are
that different type of text".

**Measured first, and the PDF was already right.** Pulling the font spans out of the built PDF: a
package name in a 9pt table body comes out at `LMMono9-Regular` **8.97pt** — the same size as the
`LMRoman9-Regular` prose beside it. `\texttt` changes the FAMILY and keeps the size, so the row-font
machinery reaches an identifier like anything else. Monospace at a given size simply reads larger
than a serif at the same size, which is a fact about the typeface, not a bug.

**The preview was wrong, and it was the thing being looked at.** The app's own styling pins a code
span to `font-size: 12px` — right for a themed panel, wrong for a page. So every package name stayed
at one size while the prose around it followed the profile, which is exactly what "the size is not
applying to the package names" looks like. `.rd-paper code` now inherits, so a code span takes the
size of whatever it sits in: the table body, the header row, or the document.

**Found while checking it:** the preview also drew captions at 0.92× the document size, a number
invented when the page-shaped preview was first built. The caption is emitted before the table's
first rule, so the row-font machinery has not started when it is set — measured at 10.91pt in an 11pt
document beside a 9pt table. The preview matches that now.

**Verification.** 2 new self-tests → **843/843 pass**, 143 suites; live-DOM 64/64; end-to-end 60/60;
the reference PDF still builds with zero overfull boxes.

### 2026-08-11 — v2.5 quality of life: three font sizes, a workspace that stays put — ✅ COMPLETE

**Four asks, all landed.**

- **FNT-1 — separate font sizes for document text, table text and table headers.** The two table
  sizes are new; blank means the document size, so an untouched profile emits no font machinery at
  all. Getting a per-ROW size into a pandoc longtable took a measurement: `\global\fontsize` is an
  error (it uses `\afterassignment`), so the size cannot be flipped between rows directly. What CAN
  be flipped is which macro a name points at — `\chRowFont` is applied by every cell (pandoc writes
  `\raggedright` into every column spec, so redefining it reaches every cell of every table), and
  `\toprule`/`\midrule`, the rules either side of a header row, flip which size it names. Done in
  the preamble rather than per table, so no flag has to be threaded through three modules.
- **The pane stops moving.** Clicking a section on the left no longer jumps the right-hand side to
  the Section pane. That jump made the Preview useless for the thing it is best at — clicking down
  the list and watching the document — because every trip cost two clicks to get back.
- **Tab between the width boxes.** Tab commits and opens the next column's box, Shift+Tab the
  previous. The repaint has already rebuilt the chips by then, so the next one is found by its target
  and column rather than held onto across the rebuild.
- **OPT-1 — columns and groups moved to a ☰ menu on the section row.** They were in the Section pane,
  which meant changing what a register carries cost a trip away from whatever was on the right — and
  the pane worth being on while doing it is the Preview, exactly the one you had to leave.

**A defect the font work exposed (D-027), and it was the interesting part.** With the header at 12pt
the headings overflowed again, and only some of them. Two causes:

1. The width model measured every table at the document size. A header a point larger needs a ninth
   more room than it was given. `App.docFormat.tableMetrics` now hands App.md the page in ems and each
   table size relative to the document's, threaded through `tableOpts`/`renderPart` — passed rather
   than read, because App.md has no business knowing which profile is in force.
2. The other one had been there all along. **Past pandoc's `--columns` default of 72, a pipe table's
   widths stop being LaTeX's business and become pandoc's — and it reads them off the SEPARATOR row,
   so `| --- | --- |` gives every column an equal share whatever is in it.** Seven equal columns, each
   too narrow for its own heading. Measured on 3.1.11: an 83-character pipe table comes out as seven
   `\real{0.1429}` columns. The grid form now takes over at 72 rather than at the page budget, so
   those widths are ours to decide.

**Verification.** 15 new self-tests → **841/841 pass**, 143 suites; live-DOM 64/64; end-to-end 60/60.
Built for real with three sizes in force (11pt text, 9pt table body, 12pt table headers): the PDF has
**zero overfull boxes** — including the four 0.1111pt longtable rounding artifacts that had been
there since v2.2, which were pandoc's equal-width pipe tables all along.

### 2026-08-11 — v2.4e long identifiers are marked so they can wrap (BRK-1) — ✅ COMPLETE

**Reported:** "those unbreakable words are a problem, they still aren't wrapping, can we make them
just regular text so they can wrap?"

**They cannot wrap as regular text, and that was worth establishing before choosing a fix.** A run
with no space in it — `io.sdsasolutions.tacticalsettings` — has no hyphenation point a typesetter can
use; `\raggedright` puts a word that does not fit on the line anyway, out past the column edge; and a
zero-width space is **not** a break opportunity in XeTeX, which was measured rather than assumed (a
`\parbox` with one and one without overflow identically). Every way to break such a run has to be
asked for in the markup.

**So the only question was which mark**, and one already in the file works: a code span reaches LaTeX
as `\texttt`, and the formatting profile has routed every `\texttt` through `\seqsplit` since v2.2.
A run of 18 characters or more that is *shaped* like an identifier (a `. _ - /` or a camelCase hump)
is now emitted from `App.md.cell` as a code span. It is markdown-native, it needs no second escaping
path — a code span is verbatim, so nothing inside it can be mis-escaped, which matters in a file
whose defect history is mostly escaping — and the width model already knows a code span can break.

That last part is the half of the fix that is easy to miss. Unmarked, such a run is a HARD floor: the
column has to be wide enough to hold it whole. Several of them together exceed the page, every floor
is then cut in proportion, and the one column that genuinely cannot wrap — a one-word heading — is
cut along with them. Marked, they are soft: asked for after the hard floors are met, and the first to
give way. So marking them fixed both the wrapping and the starvation it was causing elsewhere.

The cost is that such a run is set in monospace. For a package name, a path or a settings key that is
the right typography anyway, and it is what the register's key column has always done. Ordinary prose
is untouched — it wraps at its spaces and needs no help.

**Also fixed:** the preview had the same defect in the other medium. A fixed-layout table with a
colgroup does not wrap a long word by default, it lets it run out of the cell, so the editor and
preview tables now carry `overflow-wrap: anywhere`.

**Verification.** 8 new self-tests → **826/826 pass**, 140 suites; live-DOM 64/64; end-to-end 56/56.
Rebuilt for real: the whitelist entries in the Value column now break across lines instead of forcing
the column wide, and the only overfull boxes left are the four 0.1111pt longtable rounding artifacts.

### 2026-08-11 — v2.4d the width model learns typography; three preview fidelity fixes — ✅ COMPLETE

**Reported:** escapes showing in the preview's heading rail (`\&` for `&`); firewall rules running
together instead of one per line; the preview's header shading dark even with no shade set; and text
wrapping "a bit off — it goes into the next column a bit before wrapping around".

**AUTO-2: the columns are measured in ems now, not in characters.** The wrapping report was the
interesting one. A column got a share of the page proportional to its CHARACTER count and then spent
that share in POINTS — and a character is not a fixed number of points. `i` is a third of `m`; a
monospace package name costs more than prose; bold costs 15% more again. In a register table (one
`\texttt` key column beside four of prose) the rate that fell out was well under what prose needed,
so everything was squeezed. Prose absorbed it by wrapping; a single unbreakable word could not, and
pushed into the next column. That was the symptom exactly.

The em figures are **measured**, not guessed — `\savebox`/`\the\wd` over representative strings in
Latin Modern at 11pt. The first cut of the model had bold at 1.06 and monospace at 0.6 and made the
overflow *worse*; the measurement says 1.15 and 0.53. The budget is the page in ems less the
inter-column padding pandoc writes the fractions against (`\columnwidth - 2(n-1)\tabcolsep`), which
is not the columns' to share.

Three claims are settled in order of how badly they fail: **hard floors** (a word with nothing to
break it — met first, always), **soft floors** (an identifier `\seqsplit` can break on the page but
which should not be minced six characters to a line), then **appetite**. Two earlier attempts are
recorded in the code because both were wrong in instructive ways: excluding code spans from the
floor entirely starved the key column to 7% and stacked it into unreadable chunks, and taking the
larger of the source and page floors per column let the SOURCE floor set the page FRACTION — which
is what had been squeezing the prose headings all along. The resolution is that ems decide the
proportions and the whole table is scaled up uniformly until the widest source floor fits, so both
hold at once and neither distorts the other.

**Result, measured on the real document:** every genuine overfull box is gone — the only ones left
are the four 0.1111pt longtable rounding artifacts that have been there since v2.2. The widest line
of the generated `.md` went from 365 characters (the naive scale) to 196.

**Three preview fidelity fixes:**
- **The outline rail** showed the markdown escaping (`Firmware \& build`). It is written as text and
  HTML-escaped there, never parsed as markdown, so the escaping has to come off first —
  `mdPreview.unescapeMd`.
- **Firewall rules ran together.** A grid cell is a run of PARAGRAPHS: pandoc folds consecutive lines
  into one and a blank line starts a new one. `parseGrid` was dropping every blank line as padding
  (only the trailing ones are), and the renderer emitted the lines verbatim, so the whole cell
  collapsed into a blob. Both halves are read back the way the page reads them now.
- **The header shading was dark with no shade set.** The preview page inherited the app's own table
  styling, whose `--c-surface-alt` is a near-black in dark mode — painting a black header onto a
  white sheet, and showing an *unstyled* header as though it had been given a shade. The page now
  states its own table background, and the profile's shade rule is emitted after it. The static
  stand-in colours are gone: the profile is the single authority, so no shade means no shade.

**Verification.** 13 new self-tests → **818/818 pass**, 139 suites; live-DOM 64/64; end-to-end 56/56.

### 2026-08-11 — v2.4c titles, headings, narrow tables, and a preview that shows the formatting — ✅ COMPLETE

**Six asks, all landed.**

- **CAP-2 — centre the table caption on its own.** A caption shorter than its table is centred by
  LaTeX anyway; one that wraps is justified, so two captions in one document looked differently
  aligned for no reason the reader can see. A profile switch now emits `caption` +
  `\captionsetup{justification=centering,singlelinecheck=false}` — the second half is the one that
  matters, and was measured rather than assumed.
- **NAM-2 — a generated section's heading is editable.** Once NAM-1 made the name and the heading
  two different strings, a generated section had a name box and nowhere to say what the heading
  should read. `report.headings` holds the override, keyed by block id, with the platform's own
  wording carried on the block as `defaultTitle` so the pane can offer it as the placeholder. Custom
  sections are deliberately excluded: they already own their heading, and two boxes for one string is
  how the two end up disagreeing.
- **The Section preview was showing the NAME.** It forced `title: block.label` into `headingFor`,
  which was right when those were the same string and wrong the moment they were not. The whole
  document preview was already correct, which is what made it a puzzle worth stating: `resolved`
  already carries the heading, so the override was the entire bug.
- **TW-3 — widths that do not fill the page.** Three columns at 20% now make a table 60% of the text
  width, centred, rather than three equal columns stretched across it. Markdown cannot express that —
  pandoc reads a column's width as its share of the border row, so the shares always sum to the whole
  line — but what they are measured *against* can be changed: `\setlength{\columnwidth}{0.6\columnwidth}`
  around one table scales every `\real{}` in its column spec together. The model is now simply
  "a percentage is a share of the page, and the shares need not fill it": **dragging** moves a
  boundary and keeps the table the width it was, **typing** sets one column and is therefore what
  changes the total. Over 100% is still the red flag; under 100% stopped being a warning and became
  the feature. Both editors are drawn to scale, so an under-filled set visibly under-fills.
- **CCOL-2 — the control type is a column.** It used to ride along in brackets after the title, which
  made the first column two facts wide and left the type unsortable, unhideable and unwidenable. On
  by default, so nothing is lost from an existing report by the change.
- **TTL-1 — a title level.** `T` prints a top-level heading, takes no number, and — the part that was
  actually asked for — does not touch the counters, so the first `H1` after a title is still 1. It is
  outside the numbering machinery rather than a special case inside it: not numbered, not counted, and
  not the "last heading" the automatic rule reads.
- **PRV-2 — the previews show the formatting.** Everything a profile decides reached the PDF through
  the YAML block and the LaTeX preamble, which the preview ignored — so it answered "what does this
  document say" and never "what does it look like". `App.docFormat.previewCss` compiles the same
  profile a second time, into CSS for a page-shaped box: paper width and margins, base size and line
  spacing, each level's size, weight, style and spacing, the table shading colours, the caption
  alignment. Both the whole-document preview and every per-section preview are drawn on it. The page
  stays white in dark mode on purpose — a shade colour judged against a dark background is being
  judged against the wrong thing. Every interpolated value is sanitised (sizes through a numeric
  parse, colours through `normaliseShade`); a stylesheet built from text boxes is an injection route
  otherwise, and there is a test that says so.

**Verification.** 27 new self-tests → **805/805 pass**, 137 suites; live-DOM 64/64; the end-to-end
pass extended to **56 checks**. Built for real: the title section prints unnumbered with `1` on the
section after it, the reworded heading reaches both the body and the composition table, a wrapped
caption centres, and a 20/20/20 table comes out 60% of the page and centred with its shading intact.

### 2026-08-11 — v2.4b the mashed control-coverage table, and widths everywhere — ✅ COMPLETE

**Reported:** the Control coverage table in the preview had its first columns crushed to the left,
its last crushed to the right, and the Items column taking the whole width — while the register
tables looked fine. Plus five asks: column selection for Control coverage, manual widths on the
*generated* tables, a preview for custom sections, widths typed by value, and a flag when the typed
totals do not add up.

**The mashed table had two causes, both real.**

- **AUTO-1.** Automatic widths were "each column as wide as its widest line", and pandoc reads those
  source widths as PROPORTIONS. One column listing every package satisfying a control therefore
  claimed almost the whole page. Automatic now means: a table that fits is left exactly as it was
  (byte for byte — most tables), and one that does not is laid out — every column first takes the
  width it cannot go below, its longest unbreakable word, and only the slack above that is shared out
  in proportion to appetite. A heading also gets a safety margin, because a one-word heading is the
  one thing that cannot absorb being squeezed and it was visibly overflowing in the PDF.
- **The form was wrong as well.** A pipe table becomes a LaTeX `tabular` of `l` columns, which do not
  wrap — the long justification was running off the page, not just looking wrong on screen. The
  deciding question is no longer "does a cell contain a line break" but "will this fit on a line": a
  table wider than the budget takes the grid form so its content can wrap at all.

**Also built:**
- **CCOL-1.** `App.generate.CONTROL_COLUMNS` declares Status / Items / Justification as optional, in
  the same shape a dataset adapter declares its report columns — so the Section pane's existing
  column ticks covered it with no second mechanism. `sectionColumns()` reports the columns ANY
  generated section will have, which is also what the width strip is drawn from.
- **TW-2.** Widths on generated tables, stored per block id in `report.tableWidths`. A generated
  section has no editable table in the pane, so it gets a labelled **strip** that stands in for one —
  same grips, same chips, same two docStore calls, so the two editors cannot drift. A grouped
  register wears one set across all its groups, which is right: same columns, different rows.
- **RD-9.** Custom sections preview like generated ones, through the real `renderParts` with the real
  table index, reference resolver and style resolver — so a cross-reference reads its true number and
  a styled table shows its styling.
- **Typed widths, and the red flag.** Double-click a percentage and type one. The two gestures are
  deliberately different and the manual says so: **dragging** moves a boundary (fixed total, the
  others give way); **typing** sets one column and leaves the rest alone. That is what lets a 60% and
  a 50% column coexist — flagged in red, stating that the table will be scaled down to fit so no
  column ends up the width that was typed. Under 100% is noted more quietly. Widths are therefore
  relative SHARES, not a partition, and `App.md.widthsFor` normalises on the way out; the schema's
  sum-to-1 rule was dropped in favour of "each share is a share" (0 < w ≤ 1).

**Defect introduced and caught in the same session (D-021).** Making the auto path wrap meant it
could hard-break a token, and the register tables are full of code spans: `` `appInstallWhitelist` ``
came out cut in half, which pandoc rejoins with a SPACE through the middle of the package name and
leaves the emphasis markers around it as literal asterisks. Visible in the PDF, invisible in the
suite. The floor now counts the whole token — measured on the source, markup and all — so the auto
path can never cut one; `safeCut` additionally refuses to land between the two asterisks of `**`.

**Verification.** 26 new self-tests → **778/778 pass**, 133 suites; live-DOM 64/64; the end-to-end
pass extended to **48 checks** (the Control coverage ticks, the width strip, an over-committed set
being flagged and clearing again, the custom-section preview). Rebuilt for real: the control-coverage
table now honours the 30/20/22/28 it was given, every register heading renders in full, and the
overfull-box warnings fell from 20 to 12.

### 2026-08-11 — v2.4 table widths, styling, captions, section names, readable values, exceptions — ✅ COMPLETE

**Asked for:** seven things, all landed —

1. **HUM-1** — a captured value printed as a reading rather than as JSON in the documents.
2. **EXC-1** — a third control state, *Satisfied with Exception*, reached by clicking again.
3. **SEC-1** — a custom text box between a generated section's heading and its table.
4. **CAP-1** — automatic table captions.
5. **TBS-1** — a styled header row / first column, the look set in Formatting, the opt-in per table.
6. **NAM-1** — a section NAME distinct from its heading, defaulting to the heading.
7. **TW-1** — draggable per-column widths in the Report Designer, carried into the PDF.

**Built:**
- **`App.md.human` / `humanInline` (HUM-1).** One reading of any JSON value: `[]` → `(none)`, a
  string list one entry per line, a record list numbered with its fields spelled out. Entries are
  separated by a BLANK line, not a newline, because a grid-table cell folds consecutive lines into
  one paragraph — only a blank line survives to the page as a break. Used by the Tactical report
  column and the deviations table. The `tactical.json` a device consumes and the verification script
  keep the canonical form: a reading is not reversible, and those are read by machines.
- **`CONTROL_STATES` becomes three (EXC-1).** `unsatisfied → satisfied → exception → unsatisfied`,
  cycled by one button that always names where the next click lands. An exception is a *decided*
  state — it does not count towards "controls still unsatisfied" — and is flagged like a bare
  Satisfied when no justification is recorded, more loudly, since the departure is the thing a reader
  needs told. The vocabulary, its labels and the cycle live in `App.projectIo`, so the report, the
  Devices tab and the Control Manager cannot drift.
- **`report.names` / `report.intros` / `report.tableStyles` (NAM-1 · SEC-1 · TBS-1).** All three keyed
  by BLOCK ID, so one shape covers a generated section and a hand-authored one with no per-kind
  special case. `reportBlocks` now sets `title` (the heading) on every block and `label` (the name)
  — `App.doc.headingFor` and `refResolver` already preferred `title`, so a named section still prints
  its heading and the composition table still names sections the way a reader can find them.
- **CAP-1, and a defect it turned up.** LaTeX numbers a captioned table itself, so the caption text
  must not carry a number of its own — the old `Table 3 — Ports` came out as **"Table 3: Table 3 —
  Ports"** in the PDF (D-019). Captions are now the text alone; `App.doc.tableIndex` keeps its own
  counter purely so a cross-reference can *name* the number the page will print, and the two agree
  because every table is captioned and both count in emitted order. Generated tables are found by
  reading their body back (`scanTables`) — they are opaque markdown by the time the index runs.
- **TW-1.** `App.md.gridTable` takes `opts.widths` (fractions), converts them to field widths against
  the identity pandoc actually uses, and hard-wraps cell content to fit. `table()` routes to the grid
  form whenever widths are set, because a pipe table carries no widths at all. `docStore.setWidth`
  renormalises the others so one drag moves one boundary; `addColumn`/`removeColumn` keep the array
  in step with `align`. The editor table is drawn at the formatting profile's *text width*, so what
  is dragged is the shape the page gets. **schemaVersion 4** with an identity `migrateV3toV4`.
- **TBS-1's shading, and why it is raw LaTeX.** Bold and italic are markdown. Shading is not
  expressible in markdown at all, so it travels the way the page break and the centring already do —
  as `{=latex}` fences pandoc passes through. The header row works by locally redefining `\toprule`
  (what pandoc emits immediately before every longtable's header) inside a `\begingroup`; the first
  column by a `\cellcolor` span at the head of each body cell, on its own source line so it costs the
  column no width. `colortbl`, not `\usepackage[table]{xcolor}` — pandoc's template has already
  loaded xcolor, and a second load with an option is an Option clash.

**Flagged, then measured rather than assumed.** The brief warned that grid-table width emission has
varied across pandoc releases. Verified against the version in use before any of this was written:
pandoc **3.1.11** reads column *i* as `(dashes_i + 1) / lineLength` and emits it as
`\real{0.5865}` in the longtable column spec. Both shading mechanisms were verified the same way,
end to end to a rendered PDF, before being relied on — a fenced div and a cell attribute were tried
first and both are silently dropped by the LaTeX writer.

**Defect found by doing it (D-020).** `gridTable` put alignment markers on *every* border, not just
the header separator. Pandoc 3.1.11 responds by **silently dropping every body row** — the table
compiles to a header and nothing else. Latent since v2.2 (it needed a table that was both aligned and
in grid form); TW-1 made every width-bearing table exactly that, so it surfaced immediately. Found by
looking at the PDF, not by reading the markdown. The preview had the mirror-image bug: it only
recognised `+-` borders, so every aligned grid table was rendered as prose.

**Verification.** 68 new self-tests → **752/752 pass**, 129 suites; the live-DOM pass still 64/64;
plus a new end-to-end pass that drives the real workspace, generates the document and asserts on it
(38 checks). The pipeline was run for real: a document with a 60/20/20 table, a shaded header row and
first column, an introduction, a renamed section, a firewall rule list and a control marked
*Satisfied with Exception* builds to a 44KB PDF via `pandoc 3.1.11 --pdf-engine=tectonic`, exit 0 —
and the LaTeX carries `\real{0.5981}` / `\real{0.1963}` / `\real{0.1963}`, which is the drag.

**Known and left alone:** the register tables' automatic column widths are proportional to source
*characters*, which under-serves a narrow column — "Control" can overflow its heading in the PDF.
Pre-existing, and out of scope here: those columns are adapter-declared and have no home for a width
setting yet. Per-dataset widths would be the fix.

### 2026-08-10 — v2.3 Report Design follow-ups (RD-8 · META-1 · GUIDE-1) — ✅ COMPLETE

**Asked for:** a preview of each generated section on its own tab, the ability to centre those too,
include/exclude switches for the rows of Device Config Information (with "Generated (UTC)" removed
outright), and a new generated section listing the items flagged as departing from the security
guidelines, grouped by register, skipping registers with none.

**Built:**
- **RD-8 per-section preview.** `buildReport`'s per-block dispatch was extracted into
  `App.generate.sectionContent`, so the Section pane and the finished document render a block through
  the *same* call and cannot drift. Centring is a per-block flag (`report.centred`) applied to the
  body, not the heading — a centred heading is a formatting-profile decision.
- **META-1.** `metaFields()` gives every provenance row a stable id (one per snapshot, discovered from
  the device, so a new dataset gains a row with no core edit). `Generated (UTC)` is gone; the exact
  instant remains machine-readable as `generated-utc` in the YAML. Row choices live in the PROJECT
  (`report.meta`), not the session, because "this house's reports don't carry hashes" is a decision
  that belongs with the heading levels — and a report template that didn't carry it would be half a
  template. Both new maps store only the non-default value, so a toggle flipped and flipped back
  leaves no fingerprint (DOD-7).
- **GUIDE-1 Deviations from Security Guidelines.** One numbered sub-section per register, each listing
  item, description and narrative; a flag with no narrative reads *"Flagged, no narrative recorded."*
  rather than showing an empty cell. The section's existence depends on the device AND the relevance
  filter, so `reportBlocks` now takes `opts.deviceId`.

**Judgement call worth recording:** an empty section is not an *omission*. `reportSectionDescriptor`
skips blocks marked `empty`, so a document with nothing flagged does not list "Deviations from
Security Guidelines — Omitted" in its composition table. Reporting it would invite the reader to
wonder what had been hidden, when the answer is that the section never applied.

**Scope boundary deliberately crossed:** the DIV-1 suite asserted the divergence narrative reached no
generated output. That was the right call when the flag had no reader; the whole point of GUIDE-1 is
that it now has one. The test was rewritten to assert the narrative reaches the REPORT and still
never reaches a generated SCRIPT — a narrative is prose for a person, not an instruction for a device.

**Verification.** 15 new self-tests → **683/683 pass**, 123 suites, plus the live-DOM pass extended to
**64 checks** (flagging an item makes the section appear; its preview shows the item, the narrative
and only the registers that have one; centring and a metadata row both round-trip through the real
handlers). The pipeline was re-run for real: a document with a centred guidelines section and two
switched-off metadata rows builds to a 43KB PDF via `pandoc --pdf-engine=tectonic`, exit 0, with only
the three 0.1111pt longtable rounding artifacts.

### 2026-08-10 — v2.2 Report Design: the documents become composed markdown — ✅ COMPLETE

**Asked for:** heading levels with automatic sub-heading nesting and auto-numbering; hand-authored
sections with rich text, fill-in tables, rules and page breaks in any order; a formatting panel with
saveable profiles; saveable section and report templates; isolated import/export for all three with
per-case conflict resolution; cross-references that survive reordering and renaming; a navigable
preview; and markdown output rather than HTML, LaTeX-safe, as a bare `.md`.

**Decisions taken with the user before building:**
- **Escape on the way out, never at input.** The captured registers are full of characters that are
  load-bearing in LaTeX (`wifi_sleep_policy`, `$HOME`, `50%`, `a & b`). Stripping them at input would
  mean the register no longer matches the device and the implementation script would name a package
  that does not exist. So the bytes are kept intact and escaped in the writer. Identifier columns are
  emitted as code spans instead, which are verbatim and reach LaTeX as `\texttt{}`.
- **All three documents** (Reporting, Control report, Procedure) become markdown; the two script
  bundles keep their zip and their manifest.
- **No `manifest.json` for documents.** The provenance it carried is written into the document's own
  YAML metadata block, where a reader of the finished PDF can see it.

**Built — seven new modules:**
- **`App.md`** (MD-1) — the single escaping choke point, the markdown counterpart of
  `App.util.html.esc`. Pipe *and* grid tables (the grid form is the only one that can hold a
  multi-line cell), YAML front matter, and a small `{{…}}` token markup for rich text that is
  extracted before escaping, so a token can never be forged by typed text and unbalanced emphasis is
  closed at the paragraph boundary rather than bolding the rest of the document.
- **`App.doc`** (DOC-1..4) — five levels (H1–H4 + normal text), automatic level resolution, counter-
  stack numbering, stable ID-derived anchors, cross-reference resolution, and the renderer for an
  authored section's parts.
- **`App.docFormat`** (FMT-1..4) — named profiles compiled to a pandoc YAML block plus a `titlesec`/
  `fancyhdr` preamble. Ships a `Standard` baseline that cannot be edited, only duplicated.
- **`App.docStore`** (DS-1..6) — every designer write, with **derived** ids (`sec3`, `part7`) rather
  than random ones, so the same edits produce the same project bytes and a cross-reference is
  portable between two operators' copies.
- **`App.docTemplates`** (TPL-1..4) — isolated export/import. Conflicts are detected on **name**, not
  id (ids are per-project and would collide meaninglessly); replacing keeps the **existing** id so
  `report.formatId` cannot be silently repointed; and a conflict with no answer defaults to keeping
  the operator's copy.
- **`App.ui.mdPreview`** (PRV-1) — a narrow renderer for the dialect `App.md` emits. Escapes before it
  emits, so a captured device string can never reach the tool's own DOM as markup.
- **`App.ui.views.reportDesign`** (RD-1..7) — the workspace: ordered section list with level pickers,
  the section editor, relevance, formatting, templates with the conflict dialog, and the preview.

`App.report` was rewritten from the Word-targeted HTML shell to markdown section builders. The
adapters needed **zero** changes: `renderReportSection` still delegates to `App.report.buildSection`
with its declared columns, which now returns `{body, children}` — a grouped dataset's groups become
numbered sub-sections, which is what earns each of them an anchor to link to (DOD-11 intact).

**Defects found and fixed during the build:**
- **Load order.** `App.md` was appended before the bootstrap marker per the file convention, but
  `App.report`/`App.generate` bind it at load time, so it was `undefined`. Moved `App.md` into the
  util group and `App.doc`/`App.docFormat` immediately before `App.report`, per the spec §14 order.
- **Child headings polluted the automatic level rule.** "Auto" means *sibling of the last heading*,
  and a grouped dataset's group was setting that — so `Tactical` rendered as `3.4`, a child of
  `Packages`. A child now advances the counters and the depth but is not the "last heading".
- **Double wiring.** `App.ui.views.reportDesign.wire()` was called from the Generate view *and* by the
  shell's view loop, so one click on **+ Add section** created two sections. Caught only by the
  live-DOM pass, not by the render-only tests. The shell's loop is the single registration point.
- **A literal `</script>` inside a test string** silently ended its script block and unregistered
  eight suites. Written with an escaped slash now.
- **Pretty-printed decision objects** in the deviations table forced every cell multi-line and turned
  the table into a grid table; they render as `action=disable` on one line.

**Three more defects found by actually running the pipeline** (pandoc 3.1.11 + tectonic 0.17.0),
none of which any amount of reading would have caught:
- **`::: {.center}` centred nothing.** Pandoc's LaTeX writer drops a fenced div and emits the
  contents unchanged; the `data-latex` attribute is a convention of the *pandoc-latex-environment*
  filter, not native pandoc. Centring now travels as raw `{=latex}` fences around the block, which
  produce a real `\begin{center}` while leaving the markdown between them still markdown.
- **A table's `{#id}` came out as literal text** — `\caption{Table 1 --- Residual risk \{\#tbl-part3\}}`.
  Pandoc does not read an identifier on a table caption. The anchor is now an empty span *before* the
  table, which becomes `\phantomsection\label{...}` and is reachable by `\hyperref`.
- **Code spans were escaped**, so `{{c}}code_span{{/c}}` set as `code\_span` with a visible
  backslash. A code span is now taken whole and emitted verbatim through `App.md.code`.
- **64-character hashes ran 146pt past the right margin** — `\texttt` will not break an unbreakable
  word. The preamble now routes `\texttt` through `seqsplit`, which offers a breakpoint between
  every character that TeX uses only when it must. Overfull boxes went from 14 to 3, and the three
  that remain are 0.1111pt (0.004mm) `longtable` column-rounding artifacts.

**Verification.** 75 new self-tests → **668/668 pass**, headless (jsdom), 120 suites. The pipeline was
run for real: a document exercising every part kind converts with
`pandoc report.md --pdf-engine=tectonic -o report.pdf` to a 41KB PDF, exit 0, with the centring,
cross-references, table anchor, escaping and formatting profile all correct in the LaTeX. Plus a **48-check
live-DOM pass** driving the real wiring: mounting the app, opening the workspace, pinning a level,
adding a section, typing prose, wrapping a selection in bold, filling a table, adding rows/columns
and alignment, reordering parts, inserting a cross-reference, duplicating and editing a formatting
profile, saving a report template, rendering the preview, and clicking Generate — confirming one
`.md` download named `dev-m1-reporting-<stamp>.md`, with the bold, the escaped percent, the resolved
cross-reference, the centred table, the rule and the profile's margin all present in the file.
Determinism (DOD-7) is covered for a designed document, and a design round-trips byte-identically
through save/load. Remaining: DOD-1 (three browsers) and the pandoc run (DOD-8) are manual.

**Not done:** the designer's edits do not join the per-dataset undo history — that history is keyed by
dataset and snapshots register items, which a document section is not. Destructive actions (delete a
section, apply a report template) confirm first instead.

### 2026-08-10 — Ordering and narrowing the control picker (CTLSORT-1) — ✅ COMPLETE

Apply Control Mode's card list gained an **order** selector and a **tag filter**, above the text
filter it already had.

**A→Z was already the default,** which is worth recording because the request was for "default,
alphabetical, or by tag" and the first two would have been the same button twice — the rail (and the
Control Manager) have always sorted by title. So the second order is **By type**: sort by control
type first, title within it, with a sticky heading per group so the cluster you are scrolling stays
named. That is the useful thing a second order can do here — work through one framework's controls
at a time.

**Tag is a filter, not an ordering,** and that is a design decision rather than a shortcut: a control
can carry several tags, so grouping by tag would render the same card once per tag, in a picker whose
whole job is "choose one". As a filter the same information narrows the list and duplicates nothing.
It offers each tag in the project plus **(untagged)**, reusing FIL-3's private-use sentinel so an
empty value can still mean *any tag*, and it is left out entirely when nothing is tagged — an
always-empty dropdown is worse than no dropdown.

All three narrowing controls compose, none of them writes to the project, and none of them clears the
selected control — changing how the list is arranged is not a statement about what you are applying.

**Verification.** 4 new self-tests → **593/593 pass**, headless. Plus a 23-check live-DOM pass:
default A→Z, By type clustering with headings in order, each tag filtering correctly, a two-tag
control appearing under either and never twice, (untagged), tag composing with the text box, the
count following the filter, the picked control surviving a re-order, and nothing leaking into the
serialised project.

### 2026-08-10 — Two more things you can set on a hundred rows at once (BULK-4) — ✅ COMPLETE

The rail could bulk-attach a control and bulk-assign a device. It could not bulk-set the two fields
people actually spend the day typing into: **Security Relevance** and the **decision** itself. Both
now have a button, and both work exactly like the two that were already there — arm the mode, pick a
value, tick the rows, or click the column heading to do the whole shown set.

**They share one tick column, because they are one gesture.** Relevance and decision differ only in
the field being written, so rather than two near-identical columns there is a single
`valueApplySpec(adapter, ui)` — value list, field, and a `read(item)` that returns a row's current
value — feeding one column, one heading, one plan helper (`valueAllShownPlan`, the third sibling of
`applyAllShownPlan`/`assignAllShownPlan`) and one pair of handlers.

**Apply Decision is offered where the adapter says it can be.** It needs an `enum` primary decision
field, discovered from `decisionSchema` — so it appears on Packages (keep/disable/remove) and not on
Tactical, whose decision is a typed value with nothing a picker could apply. That is the requested
"for the packages table" without a dataset id anywhere in the UI (DOD-11).

**Unticking clears.** Not a no-op: it sets relevance back to unset, or the decision back to
undecided. A mis-tick is undone by the same gesture that made it, which matters more here than for a
control ref because these are the fields you sweep across hundreds of rows.

**Two decisions worth recording.** First, a value tick goes through the ordinary re-render rather
than the quiet in-place patch the control and device ticks use — it changes the row's badge, its
Status *and* its undecided styling, and three surgical patches are three chances to drift from the
renderer; STAB-2's anchor correction keeps the row under the pointer anyway. Second, writing a
decision *merges* onto whatever the item already carries, so an adapter that grows a second
decision field later will not silently lose it the first time someone bulk-sets the enum one.

**The modes became declarative.** Three mutually-exclusive modes wired pairwise was already the
messiest thing in `renderToolbar`; five would have been nine "which message does this button show"
branches. They are now `PICK_MODES` + `blockedBy(ui, id)`, generating both the buttons and the
"Exit X first" messages — and the existing three messages come out byte-identical, which is what
the tests pin.

**Verification.** 9 new self-tests → **589/589 pass**, headless, 110 suites. Plus a 35-check
live-DOM pass driving the real wiring: both buttons present on Packages and only relevance on
Tactical, chips generated from the vocabulary and from the adapter enum, ticking writing and
unticking clearing, the heading flipping Set→Clear and acting on exactly the shown set, one Undo
taking back a whole three-row run, rows going decided and back to undecided, and every mode
disabling the others with the right message.

### 2026-08-10 — The parked view stops hiding work, and stops isolating it (REL-8) — ✅ COMPLETE

Two corrections to the relevance view, both following from the previous entry: once `REPORT` became
the tag that says *"carry this into the report"*, it stopped making sense as a reason to hide the item
from the table.

**`REPORT` is no longer parked.** `RELEVANCE_PARKED` is now `['IRRELEVANT']` and the "Report only"
toggle is gone. Tagging an item `REPORT` is a statement about the *report*, not about whether the
person making decisions should be able to see it — and the old behaviour meant an item you had
deliberately looked at and classified was harder to find than one you had never opened.

**The remaining toggle includes rather than isolates.** It used to be an "only" filter: ticking
Irrelevant showed *nothing but* irrelevant items. That answers a question nobody was asking — the
point of the toggle is "let me also see the ones I parked", and reviewing them against the rest of the
table is the entire reason to look. So `ui.onlyRelevance` became `ui.includeRelevance`: the parked
categories switched **on**, with an item hidden iff its category is parked and not in that list.
Renamed rather than reinterpreted, because the semantics genuinely inverted and the old name would
have lied. The button reads **Include irrelevant**, and the note beside it now says either which
categories are hidden or that every item is in view.

The toolbar builds one toggle per `RELEVANCE_PARKED` entry rather than listing them, so the controls
follow the vocabulary and cannot drift from the filter — today that yields exactly one button.

One line fell out on its own: `addItem` used to stand the relevance view down after creating a row, or
the new (untagged) item would vanish into a parked-only view the instant it existed. An additive
toggle cannot hide an untagged row, so the reset is gone.

**Verification.** The five affected assertions were rewritten to the new semantics rather than
deleted, including the composition cases (search, Incomplete only, column filters, the bulk-apply
"everything shown" plan) — **580/580 pass**, headless. Plus a 16-check live-DOM pass on a real data
table: a REPORT row visible by default and an IRRELEVANT one not, exactly one Include toggle with no
Report button and no `data-only-rel` left anywhere, ticking it taking the table from three rows to
four (rather than to one), the chip and note following, unticking restoring, and search still
narrowing an included parked row.

### 2026-08-10 — What the report is about, and in what order (REL-7 · RPT-2/3/4) — ✅ COMPLETE

**The problem:** the report reported on everything. An item left exactly as captured, satisfying no
control, still took a row — so the document said, at length, that keeping Android installed
corresponds to no control. Of course it doesn't. The tempting filter is "has a control ref", and it
is the wrong one: it hides the single row worth reading, an item that *was* changed with nothing
stated behind it. What makes "keep Android installed" boring is that it is a no-op, not that it is
uncontrolled — and the register already had a field for exactly this judgement.

**REL-7 — `REPORTING` becomes `REPORT`.** The category never meant "this is a reporting activity"; it
means *"not a hardening decision, but carry it into the report anyway"*. The vocabulary is closed, so
the rename went in the way `CONTEXT` → `LOW` did: a load-time translation in
`RELEVANCE_RENAMES`, not a new option. An older project or CSV still opens and imports, is
translated, and says so with a warning; `REPORTING` is no longer settable. No `schemaVersion` bump —
only a value's spelling changed. (The spec's §18.8 had never recorded the `CONTEXT` → `LOW` rename
either; both are now stated there.)

**RPT-2 — Security Relevance is the report's scope control.** `buildReport` takes
`opts.relevance`, an include-map over the vocabulary plus `_unset` for a blank column, with the
usual "missing key ⇒ included" rule. An *absent* map means no filtering at all, so a caller that
asks for a report without options still gets everything — the filter is the operator's choice, never
something the engine applies behind them. It narrows the dataset sections **and** Control coverage:
it is the scope of the document, not of one table. `IRRELEVANT` is off by default in the UI.

A filtered report has to own up to it, on the same principle as the "Sections included" table: a
*Security Relevance filter* note names the categories carried, names the ones dropped, and states how
many applicable items that cost. `App.generate.relevanceCounts()` feeds both that note and the panel,
so the number shown before generating is the number the document states afterwards.

**RPT-3 — the sections re-order, and it sticks.** `App.generate.reportBlocks()` is now the one
ordered list the "Sections included" table, the emitted body and the UI are all built from, each
block carrying a stable id (`meta`, `ds:<datasetId>`, `control`, `deviations`) derived from the
platform — so a new dataset is orderable with no core edit (DOD-11). A grouped dataset stays one
block: the adapter renders its own groups, so those are inclusion toggles inside the row rather than
separately orderable sections. The order lives in the project as `report.order`, for the reason
`procedure.order` does — an arrangement is a decision, and re-making it every session would make the
feature not worth using. Unlisted ids append rather than vanish; stale ids are ignored, so deleting a
dataset cannot invalidate an arrangement.

**RPT-4 — the Reporting options became a workspace.** A full-screen modal instead of the card
dropdown, because the section list is now draggable, because inclusion and ordering are one list and
have to be seen together, and because this panel is meant to grow. Left: the ordered section list —
drag or ▲/▼, a tick to include, each row holding its own group and column ticks, and numbering that
counts only what is in. Right: a stack of panes declared as a list (`SIDE_PANES`), so a later
addition is one entry — Security Relevance with live per-category counts, and Document. Footer:
sections included, items dropped, readiness, plus Reset order and Generate. Every control the inline
panel had is still there. A change inside repaints only the workspace and keeps its scroll position
(PRO-3's reasoning) — the page behind it hasn't changed.

**Verification.** 23 new self-tests → **580/580 pass**, headless (jsdom), 109 suites. Plus a 29-check
live-DOM pass driving the real wiring: opening the workspace, moving a section and confirming both
the DOM re-ordered *and* the project recorded it, Reset order clearing the key, the relevance ticks
changing the footer's omission count, the all-groups tick on a grouped dataset, and generating from
the footer button. The eight assertions that pinned the old vocabulary were updated rather than
deleted, and the near-miss case they guarded (`REPORT` was junk) now guards `REPORTABLE`.

**Not done, deliberately:** `buildControlReport` does not take the relevance filter. It could in
three lines, but nothing in the UI would set it, and dead options are worse than absent ones. The
control-coverage section *inside* the Reporting document does honour the filter, which is the
coherent scope.

### 2026-08-05 — One captured-value map for the whole fleet (D-015) — ✅ COMPLETE

**Reported:** Tactical decisions made against one device were assigned to a second device by hand
(DEV-1); the Devices tab then called those items undecided, and the device not ready, while the
Tactical tab showed the same items decided.

**The decision was never in doubt — the *value format* was.** VF-2 infers an item's format from its
captured leaf type, and there were two implementations of "the captured values for this dataset":
`ui.tables.buildCapturedMap` merged every latest device's capture, so the data tab saw `wifiOn` as a
`bool` and validated the boolean happily; `completeness.deviceReadiness` read only *that device's*
snapshot. A hand-assigned key is by definition absent from it, so there was no captured type,
`inferId(undefined)` fell back to `string`, and `validate` rejected a perfectly good `true` with
"Value must be text." Incomplete item, un-ready device. It bit the non-text values — booleans,
numbers, lists, i.e. most of a Knox capture — which is why it read as arbitrary.

**Fix:** one implementation, `App.registry.capturedDefaults(project, dsId, preferDeviceId)`, beside
the applicability choke point it belongs with. It merges the fleet's latest captures with the named
device's own capture first: where a device did report a key its own evidence stays the authority on
that key's type, and the rest of the fleet only fills the gaps. Readiness, `buildCapturedMap` and the
Devices-tab format resolver all delegate to it, so the two tabs can no longer reach different
verdicts from different evidence. `registry.latestConfigs` came along as the shared version filter.

**Verification.** 6 new self-tests (D-015) → **529/529 pass**, headless (jsdom). The readiness
assertion was run against the pre-fix code and fails there, so it locks the defect rather than
describing it. Also checked end to end: the assigned key is written into the second device's
generated `tactical.json`, not merely counted in its badge.

**Note:** `store.recomputeStatus` still computes `item.status` without the format fold, so a stored
*invalid* value shows `decided` in the data tab while readiness (correctly) refuses it. Separate,
pre-existing, and untouched here.

### 2026-08-05 — Editing where you are reading, and applicability you can correct (EDIT-1 · DEV-1) — ✅ COMPLETE

**EDIT-1 — a cell is the way into editing what it shows.** The prose a row carries (Description,
Control Refs, the name of an authored action) was displayed in the table and edited in the row
expander, and the only way in was the `▸` button at the far left of a table that can be 2000px wide.
Nothing about a cell of text said it was editable at all. Now **Ctrl+click** (the gesture asked for)
or **double-click** on a text cell opens that row with the matching field focused *and selected*, so
you land in the box you were reading and can type straight over it. A plain click is deliberately
untouched — selecting text still works, which matters when you are reading 400 rows.

Which cell opens what is decided in one place (`tables.cellEditTarget`), not per column at the call
site: Description → its textarea, Control Refs → the checklist's filter box, an authored action's
name → the rename box. Cells that are *already* an editor (the value cell, the Status badge, the
Relevance dropdown, the tick columns) are never hijacked — Ctrl+click on the value cell just puts
the caret in it. A captured key opens the row and focuses nothing, because the key is evidence and
there is nothing there to type over. The affordance is a hover outline rather than a permanent
marker: nearly every text cell has it, so a badge on all of them would be noise.

**DEV-1 — assigning register items to a device by hand.** Applicability was evidence and only
evidence: a Packages/Tactical item applies to the devices whose capture contained the key, and a
Custom Security Action applies to every device. That is right for what a capture *proves* and wrong
for what an operator *knows* — a package can be worth deciding on a device that never reported it,
and a hand-written action is not always wanted on every device in the fleet. There was no way to say
either without editing the capture, which would have destroyed the evidence to record an opinion.

So a DeviceConfig may now carry a **`scope`** adjustment per dataset — `{add, remove}` — folded in at
`App.registry.applicableKeys`, the one choke point every consumer of "does this apply?" already goes
through. Readiness, generation, overrides, the tables, the filters and the report all followed with
no further edits; that is the payoff of the CUS-1 refactor that made the choke point exist. The
snapshot is never touched.

The UI is the **third bulk mode**, deliberately identical in shape to Apply Control Mode — pick a
device in the tools rail, tick which rows apply to it — because there should be one gesture to learn,
not two. Its column heading is the bulk action (`✓ Assign all N` / `✕ Remove all N`), planned by the
same helper that labels it, as BULK-1/BULK-3. The three modes are mutually exclusive and each says
which one to leave. A device with no capture for the register is listed but not selectable, with the
reason on its card: a tick that could change nothing downstream is not offered.

Three decisions worth recording:

- **Canonical or absent.** An adjustment that merely restates the capture is not recorded, so a
  tick-then-untick is byte-identical to never having ticked (DOD-7). Sorted lists, empties dropped.
- **Un-assigning does not delete work.** The override prune deliberately judges against *capture ∪
  add* and not minus `remove`, so taking an item off a device leaves its recorded device override
  dormant rather than destroying it on the next load. A mis-click must not be able to eat a decision.
- **Undo is universal here too.** `datasetSnapshot` carries the scopes, consecutive ticks fold into
  one entry keyed by device (the run-folding was generalised from control-only to a `runKey`), and a
  bulk heading click is one entry.

**Verification.** 30 new self-tests (EDIT-1, DEV-1) → **523/523 pass**, headless (jsdom). Plus a
25-check live-DOM pass driving the real mounted app: Ctrl+click focusing the right box and the edit
reaching the register, double-click, plain-click doing nothing, the tick column's state, the
in-place `Applies to` repaint, the heading flipping to its removing form, the bulk run, and three
Undo steps unwinding to a project with no `scope` at all. No console errors. Two STAB-1 assertions
were relaxed from `<td>` to `<td[^>]*>`: the Control Refs cell now carries EDIT-1's attributes, and
the test's subject is the clamp inside it.

**Not done, and deliberately:** the Devices tab does not yet *list* a device's manual adjustments
(the data tabs' `Applies to` column and the mode are the surface), and the adjustments are not
called out in the generated report.

### 2026-08-04 — Firewall rules stop counting, and four smaller corrections (FW-1 · USB-1 · COL-2 · RPT-1 · PRO-3) — ✅ COMPLETE

**FW-1 — a firewall rule list is one decision, not one per rule per field.** The tactical flattener
walked an array of objects positionally, so two firewall rules became eighteen register keys —
`firewallRules[0].addressType`, `firewallRules[0].direction`, … Three things were wrong with that,
and the reported symptom (the rule count mattering) was the least of them:

- the element's **index became its identity**, so inserting a rule at the top silently renamed every
  rule after it, carrying the old decisions onto the wrong rules;
- the **key set depended on the rule count**, so two devices captured with different rule counts had
  different applicable keys and a decisions import between them was refused;
- **no single field of a rule is a decision anyone makes.** You decide the rule *set*.

So any array containing objects is now ONE leaf holding the whole list, typed `json` — and
`firewallRules` is typed `json` even when empty, so a device with no rules edits the same shape as
one with nine. Rebuild writes the list back wholesale, so the emitted Knox document is byte-identical
to what was decided. `validateDecision` refuses a non-array on that key: a string there is not a
small mistake, it is a firewall that does not load.

Two follow-ons the change exposed. `App.valueFormats.inferId` had no case for a captured type of
`json`, so it fell through to `string` — the cell would have offered a text box and stored the rule
list back as a *string*, from an editor that looked fine. And the JSON editor was a one-row textarea;
a nine-field rule object needs room, so it is now sized to its value and monospaced, like a string
list.

**Migration.** `completeSnapshot` grew a second direction. It used to only ADD keys a capture
predates (`imsSettings`); its rule is now simply *the stored key list is what the parser produces
from the retained template*, which adds and removes in one pass. It may return `{added, removed}` as
well as the old plain array. A removed key that survives in no snapshot takes its register item with
it — those rows are unreachable (not applicable anywhere, never generated, impossible to re-create)
and would otherwise sit undecided for ever inflating every count. Loudly, with the keys named in the
Activity drawer. Verified against the real reference capture: 0, 2 and 5 rules produce identical key
sets, and a project rewritten to look like an old one migrates with 18 dead rows removed and the one
new row seeded.

**USB-1 — `usbInterfaces` is exhaustive.** Wherever the block appears, any of the nine host interface
classes it omits is added as `false`: "absent" and "listed as false" are the same posture and must
not be two different registers, and a half-written deny-list is silent in the dangerous direction. A
document with **no** block is left alone — inventing a USB policy Knox never exported would be
putting words in the device's mouth. (Say if that should also be filled in; it is a one-line change,
but it is not mine to assume.)

**COL-2 — column defaults.** Security Relevance and Diverges from Guidelines now start hidden: both
are occasional, and shown by default they cost two columns of width on every row for a value that is
usually empty. One tick in the Columns bar brings either back, and the picker reads "6 of 8 shown" so
the choice is visible rather than a mystery. Diverges also moved to sit immediately BEFORE Status —
it is an attribute of the decision, and Status is the verdict, which reads last.

**RPT-1 — Control coverage lists controls only.** The section carried a `(no control)` row gathering
every decided item that referenced nothing, which is by definition everything that did not change —
it buried the controls the section exists to evidence. Gone. The standalone Control report keeps its
explicit *Include items with no control* opt-in, which is off by default and is a different question.

**PRO-3 — the running order stopped throwing the page to the top.** Reordering went through the
ordinary store-change re-render, which rebuilds the page and puts the scroll offset back. Fine for a
table cell, wrong for an editor near the bottom of a long tab: every drop bounced the view to the
top, so re-sequencing twenty steps meant scrolling back down twenty times. The list is now its own
host and repaints in place (same reasoning as STAB-3), for drag, ▲/▼, the include ticks and the step
notes alike.

**Verification.** 23 new self-tests across two suites (FW-1/USB-1, COL-2/RPT-1/PRO-3) → **493/493**,
headless. Plus a 17-check live-DOM pass in jsdom: a data tab opening without the two columns and
bringing them back on a tick, the firewall row rendering as a single JSON-edited row with all nine
USB rows beside it, and a reorder proven to leave `#main`, the card and the list host as the *same
DOM nodes* — which is what "the page does not move" actually means. Two existing tests were updated
rather than weakened: the tactical flatten test now asserts the collapse it used to assert the
absence of, and the column-order assertion follows COL-2.

### 2026-08-04 — Knowledge, procedure and the order of the work (NOTE-1 · PRO-1/PRO-2 · CMF-1 · REL-1) — ✅ COMPLETE

Five requests from the same session, four of them additive and one a rename.

**NOTE-1 — General Platform Notes.** Everything in the tool was structured: a key, a value, a
control, a status. That is right for the decisions and wrong for what surrounds them — "this
firmware silently re-enables the package on reboot", "seal the tray before setting the passcode",
"ask the vendor about X next time". None of it fitted anywhere, so it lived in a notebook and left
with whoever wrote it.

- A **Notes** button beside **View** on every row of the Devices tab opens a full page: the device's
  facts at the top (model, firmware, version, onboarded, group, assigned controls, decided counts),
  then an open rich-text box — bold, italics, underline, bulleted and numbered lists, headings.
- Stored per device **baseId**, like a control's satisfaction state, so re-onboarding keeps them.
  New top-level `deviceNotes` key; optional and additive, so no schemaVersion bump (as `controlTags`).
- Rich text means storing HTML, so it is sanitised on the way in **and on the way out** — a project
  file can be hand-edited between the two. `scrubNotes` parses through `DOMParser` (an inert
  document, so an `<img onerror>` never starts a load), keeps an allowlist of structural tags,
  unwraps anything else so the words survive, and strips **every** attribute.
- Saves on a 700ms pause and again on blur, through `quietEdit` — a full re-render would replace the
  element being typed into and take the caret with it.

**PRO-1 — a Procedure box per manual action.** Custom Security Actions now carry `procedure`, an
ordinary optional prose field, edited in the row's ▸ panel and carried into the runbook (indented
under its action) and the report. It appears only for datasets declaring `hasProcedure` — a package
removal's procedure *is* the generated adb line, and an empty box inviting someone to re-describe it
would be noise.

**PRO-2 — the Procedure report.** The other four outputs are organised by structure: by dataset, by
control, by deviation. None answers the question someone standing in front of a device has, which is
*what do I do first*. This one is organised by sequence:

- A step is either a whole captured register (**Configure Packages**) or a single manual action —
  and which one is decided by the **adapter** (`procedureStepPerItem`, `procedureStepLabel`,
  `procedureStepIntent`), never by core. 400 packages as 400 steps would bury the six manual actions
  that need their own place.
- The order is set on the Generate tab by **dragging** a step or using ▲/▼, and is saved **in the
  project** (`procedure.order`) rather than in session state — re-sequencing twenty steps every
  session would make the feature not worth using. Steps can be unticked out of a given report, and
  a register step takes a note of its own.
- Ordering is **self-healing by construction**: the saved order is a *ranking*, not the list. A
  deleted action ranks nothing; a new one falls to the end. So deleting an action can never
  invalidate the project and no pruning pass is needed on load.

**CMF-1 — Control Manager filters.** A filter row under the headings for **Type**, **Tags** and
**Applies to**, the same shape and the same classes as the data tabs' FIL-1 row. `(untagged)` and
`(unassigned)` are real answers. They compose with each other and with the search box, and because
they run inside `shownControls` everything acting on "what is shown" — the device column headings,
**Tag all N shown** — honours them for free. Matched on the **baseId** a control stores, not the
device name the cell renders, so renaming a device cannot orphan a filter.

**REL-1 — Security Relevance "Context" becomes "Low".** The vocabulary is closed, so this could not
be a simple edit: every project already saved carries the old word, and an unknown value is a hard
schema error — every existing project would have refused to open. So it is a load-time
**translation** (`renameLegacyRelevance`, run beside `dropRetiredDatasets` and before the schema
check), reported as a warning rather than done silently, and applied to CSV decision imports too. The
badge keeps its blue; `rel-context` became `rel-low`; the severity sort is unchanged in meaning.

**Verification.** 30 new self-tests across four suites (REL-1, NOTE-1, PRO-1/PRO-2, CMF-1) →
**470/470**, headless. Plus a 23-check live-DOM pass in jsdom driving the real wiring: mounting the
app, opening the Notes page, typing into the contenteditable and confirming it saved sanitised
*without* re-rendering under the caret, filtering the Control Manager and clearing it, moving a
procedure step and confirming the new order reached the project file, and typing a Procedure into a
Custom Security Action's expander.

One existing test needed amending, not weakening: the v2.0 guard asserting the manual never says
"Settings" now also excludes the literal "Tactical Settings" (the PRO-2 step label), the same way it
already excluded the `imsSettings` tactical leaf. Neither is the retired Settings *dataset*, which is
what that guard is about.

**Still manual:** open the file in Chrome/Edge/Firefox (DOD-1) and a generated `report.html` in Word
(DOD-8) — and, new here, confirm the rich-text toolbar in a real browser: `document.execCommand` is
the only way to drive a contenteditable offline, and jsdom does not implement it (the click path is
proven not to throw, but the formatting itself is unproven headlessly).

### 2026-08-03 — Implementation scripts converge and grade themselves (IMPL-1..IMPL-4) — ✅ COMPLETE

**Problem (found reviewing the impl side after the verification work).** Three faults, one of them
severe:

1. **A totally failed run exited 0.** Proven by running the generated `packages.impl.ps1` against a
   mock `adb` where every command fails: two lines of noise scrolled past and the script reported
   success. `$ErrorActionPreference = "Stop"` does **not** trap native-command exit codes — that is
   a PowerShell rule, it governs cmdlet errors only. On a real hardening run "it completed" and "it
   did nothing" were indistinguishable.
2. **The script asserted a property it did not have.** Its header read `# Idempotent: each action
   guards on current package state.` while `Test-PackagePresent` returned `$true` unconditionally.
3. **`keep` could not converge.** It emitted a comment only, and no `pm enable` existed anywhere in
   the codebase, so implementation was one-directional — it could strip a device, never restore it.

**Built.**
- **Real state read.** `Apply-Package` reuses the inventory built for verification. Idempotency is
  now an actual skip (item already in its decided state ⇒ **no device command**), not a fake guard.
  `Test-PackagePresent` is deleted, and the false header claim with it.
- **`keep` converges** (approved behaviour change, spec §10.1 + Appendix B updated): disabled ⇒
  `pm enable --user 0`; uninstalled-for-user ⇒ `pm install-existing --user 0` then enable, since
  install-existing can restore a package disabled. Absent from the build ⇒ cannot be restored,
  reported MISSING so the operator is told.
- **Failures are detected**, by exit code *and* output text — adb does not reliably propagate the
  remote code on older hosts, so `Failure|Error|Exception|not installed|denied` in the output counts
  as failure too.
- **Verdicts describe the device, not the command.** The inventory is refreshed after the run and
  every item graded APPLIED / ALREADY / FAILED / MISSING / REVIEW. This is what catches a pm command
  that prints `Success` and changes nothing.
- **REVIEW** is a deliberate non-action: a device found *more* restricted than decided (a `disable`
  item already uninstalled) is reported, not "fixed", because restoring it would exceed the decision.
- **Summary matches the verification layout** exactly — counts, `N1` percentages, `--- FAILURES /
  MISSING / NEEDS REVIEW ---` detail blocks with reasons, `RESULT:` line. Plus `Changes attempted`.
  **Exit 0** = every decision met; **1** = at least one FAILED.

**Verification.** Built a **stateful** mock `adb` (real state file, genuinely mutated by
enable/disable-user/uninstall/install-existing) and ran the generated script under PowerShell 7.4.6
over a 12-item fixture covering every action × state, including a `.protected` package that rejects
writes and a `.silent` one that reports `Success` and changes nothing. All 12 verdicts correct:
4 APPLIED / 3 ALREADY / 3 FAILED / 1 MISSING / 1 REVIEW, exit 1. The silent no-op was correctly
graded FAILED — **only** the post-run re-read catches that class.
- **Idempotency proven by re-run:** changes attempted fell 7 → 3 (only the genuinely-failing
  packages retried), 7 ALREADY, 0 APPLIED, exit still 1.
- **Cross-checked against verification** on the same device and decisions: impl 7 ALREADY = ver
  7 PASS; impl 3 FAILED + 1 REVIEW = ver 4 FAIL; MISSING 1 = MISSING 1. The two commands agree, and
  the REVIEW/FAIL split is intended — verification grades strictly against the decision, while
  implementation declines to act beyond it.

**Result:** 4 new self-tests (IMPL-1..IMPL-4), VER-4 rewritten, and 6 assertions across the
injection-safety, T10.4 override and HELD-1 suites updated to the new emitted form (`Apply-Package
'<pkg>' '<action>'`) — the pm commands live in the preamble helper now, so those tests had to move
to the call site. **440/440**, headless. Item 5 from the review (tactical `template || {}` emitting
`{}` when a snapshot is missing) was explicitly deferred by the user and is NOT addressed.

### 2026-08-03 — Package verification actually verifies (VER-1..VER-4) — ✅ COMPLETE

**Problem.** `Verify-Package` in the Android preamble was a stub — `Write-Output "CHECK package
$pkg expect $action"`. It never called adb, never compared anything, and never emitted a verdict.
`packages.verify.ps1` was therefore a checklist, not a verification, and spec §10.2 / Appendix B
(`pm list packages -d`/`-e` read-back → PASS/FAIL/MISSING) was unimplemented. Consequence:
**S-2 of `validation-testing-plan.md` was unsatisfiable by running the bundle** — Phase 2 would
have fallen back entirely to the CSV scaffold plus Analyst C's manual spot-check.

**Built.**
- **Real read-back.** The device is queried **once, lazily**, on the first `Verify-Package` call:
  three `pm list packages` reads (`--user 0`, `-d --user 0`, `-u --user 0`) build a hashtable
  inventory; every item is then an O(1) lookup. An implementation script makes no `Verify-Package`
  call, so it never pays the cost. Four device states are distinguished: `enabled`, `disabled`,
  `uninstalled-for-user`, `absent`.
- **Verdicts.** All 12 (action × state) combinations are graded. Notably `remove` +
  `uninstalled-for-user` is a **PASS** — that is exactly what `pm uninstall --user 0` leaves behind
  on a system package — and `absent` for `keep`/`disable` is **MISSING**, not FAIL.
- **Summary.** End-of-run tally: count and percentage for PASS / FAIL / MISSING, then every
  difference listed with expected, actual, and a **reason** (over-applied, under-applied, reverted
  by reboot/OTA/MDM, not in this build), including the remediating adb command where one exists.
- **Exit semantics** (spec §10.2, previously unspecified): `0` = no FAIL, `1` = at least one FAIL.
  MISSING does not fail the run. Documented in the emitted script header.
- **False-all-clear guard.** If adb answers but `pm` lists zero packages (locked / unauthorised
  device), the script **throws** rather than scoring every `remove` as PASS.

**Defects found in review (both FIXED before ship):**
- **D-010 stream pollution.** `Get-PackageState` called `Initialize-PackageInventory`, whose
  `Write-Output` progress lines joined its success stream — the first item's state came back as
  `System.Object[]`, not a string. It graded correctly only by accident (`-eq` against an array
  filters rather than compares). Fixed: `Verify-Package` initialises; `Get-PackageState` is a pure
  lookup that throws if used uninitialised. Locked by VER-3.
- **D-011.** A `""` sequence inside a JS double-quoted preamble line terminated the string early —
  caught immediately by the suite (324 failures), fixed before any further work.

**Verification.** Rebuilt the headless Node/jsdom runner (`scratchpad/run-selftests.js`, lost with
an old scratchpad). Beyond the embedded suite, the **generated script was executed for real** under
PowerShell 7.4.6 against a mock `adb` serving a fixture that covers all 12 combinations:
all 12 verdicts correct, summary counts 4 PASS / 6 FAIL / 2 MISSING with correct percentages,
exit 1. Also confirmed: all-correct fixture → exit 0; implementation script under the shared
postamble → no summary, exit 0; empty inventory → guard throws, exit 1.

**Result:** 4 new self-tests (VER-1..VER-4) → **436/436**, headless. `Test-PackagePresent` is
**still a v1 placeholder** returning `$true` — deliberately out of scope here, since changing it
alters implementation-script behaviour. It is the obvious next candidate now the inventory exists.

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

### 2026-07-29 — CUS-1…CUS-4: Custom Security Actions, a register you write rather than capture — ✅ COMPLETE

**The ask.** A tab after Packages and Tactical for the security actions that fit in neither —
implementing a Knox tactical passcode was the example given. Name it, describe it, write the action
as free text, keep rationale and rollback in the row's dropdown, keep every universal aspect
(Control Refs, Applies To, Status, Diverges from Guidelines, …), work it into report generation,
and give it exactly the same tools panel as the Packages page.

**The one genuinely new idea: applicability without a snapshot.** Everywhere in this tool,
"applicable to this device" has meant `key ∈ dc.snapshots[dsId].keys`. A custom action has no
capture and therefore no snapshot, so that question needed a different — but equally definite —
answer: an action you wrote by hand applies to **every** device in the project. The temptation was
to synthesise a fake snapshot per device and keep the existing code untouched; that was rejected.
It would have meant fabricating evidence (a `sha256` of nothing), and a maintenance invariant that
breaks silently — Delete-Mode's undo restores the items array but could not restore the snapshots,
so an undone deletion would leave rows that exist in the register and are applicable to nobody,
i.e. invisible in every report. Instead the rule itself was named: `App.registry.applicableKeys` /
`applicableKeySet` / `deviceHasDataset`, one place, asked by all nine consumers (Applies-to,
readiness, generation, overrides, `selfHealV3` pruning, the device panels, the store's applicable
set, the group union, the filter vocabularies). A null-check repeated at eight call sites is a rule
that will be forgotten at the ninth.

**What the tab is.** `android.custom`, registered after the two captured datasets, declaring
`virtual: true` (no Onboard slot, no snapshot), `userCreatable: true` (an add bar above the table)
and `noValueFormats: true` (the Action box stays a plain textbox — this dataset exists for what
nobody could enumerate in advance, so offering to constrain it to "Boolean" would defeat it).
Everything else came for free from the data-driven core, which is the point: the columns, the
filters, the column picker, the tools rail, Apply Control Mode, Delete Mode, Undo/Redo, CSV export,
the device panels, the per-device override editor, Control coverage and the control report all
reached the new dataset with **no edit of their own**. That is DOD-11, re-proved.

**Decisions worth recording:**
- **The name is the key.** It identifies the row in the overrides, the manifest and the report,
  exactly as a package name does — so renaming is a real operation, not a field edit.
  `store.renameItem` moves the item *and* every device and group override keyed by the old name;
  without that the rename orphans them and the next load prunes them as "not applicable", taking a
  real per-device decision with it. A captured row gets **no** rename box at all rather than a
  disabled one — its key is evidence, not something locked for now.
- **An empty Action is not a decision.** A blank Tactical value is a real value to push ("set this
  key to blank", review-16 #1); there is no step in "do nothing", so a blank action keeps the row
  undecided with a located reason. The value is still stored (DOD-10) — it just does not count.
- **The add bar is above the table, not in the rail.** The ask was for the tools panel to be
  *exactly* the same as Packages, and it is; creating a row is something you do to this table, not
  a mode you enter, so it does not belong in the bulk-edit surface.
- **What is generated is a runbook, not a script.** `custom-actions.txt` (name, description, the
  step, rationale, rollback, controls, any divergence) and `custom-actions.verify.txt`
  (`EVIDENCED` per action). Neither carries the platform `scriptExtension`, so neither is wrapped
  in the ADB preamble — the tool cannot know how to perform an action it did not define, and
  pretending otherwise is worse than saying so.
- **With no custom actions, neither file is emitted.** Packages and Tactical always emit theirs
  because a device always has packages and a tactical document; an empty runbook in the ZIP reads
  as a step someone forgot to write rather than a step that does not exist.
- **Rollback is a report column here and nowhere else.** A manual action is the one kind whose undo
  nobody can reconstruct from the tool.
- **One label everywhere.** The tab, the Generate section tick, the report `<h2>` and the readiness
  message all read *Custom Security Actions* — a tick named one thing producing a heading named
  another is a mismatch you meet exactly when deciding whether to include the section.

**Compatibility.** A project saved before the tab existed has no `items["android.custom"]`. Reads
tolerated that; the mutation paths did not, so the tab would have appeared and then refused the
first edit made in it. `selfHealV3` now seeds an empty register for every dataset the platform
declares — the same pre-seeding `store.empty()` already does, not a warning-worthy repair. Onboard
excludes virtual datasets from the identity check and the override carry-forward, so a re-capture
of identical files is still a no-op and a genuine re-capture keeps custom overrides.

**Verification.** 17 new self-tests (CUS-1/CUS-2 suite) → **426/426 pass**, headlessly and in-page.
Covered: registration order and virtuality; no Onboard slot; add/trim/duplicate/blank refusals; a
captured dataset refusing hand-added items; applies-to across two devices; blank action ≠ decided;
an undecided action blocking generation; the rail being the same control set as Packages plus the
add bar; every universal column and the rationale/rollback/control-ref boxes in the expander; no
format picker; no rename box on a captured row; rename carrying decision + device + group
overrides; unwrapped runbook and verify note; no file when there is nothing to do; the report
section, its droppable columns, its omittable section, Control coverage, the control report and the
manifest decision snapshot; a byte-stable round-trip with a device override; the re-onboard no-op
and carry-forward; and an older project opening and being immediately editable. Also a new Help
section ("Custom actions") with the same worked example.

**Defects:** none found.

---

### 2026-07-29 — CMD-1 + COL-1 + DIV-1/2/3: readable device names, hidable columns, recorded divergence — ✅ COMPLETE

Three asks from use, in the order they were reported.

**CMD-1 — the Control Manager's "Applies to" names read one character per row.** `.detail-form`
sets `input { width: 100% }` for its text boxes, and that also matched the device **checkboxes** in
the row expander. A checkbox stretched to 100% of its own inline-flex label leaves the label's text
no width at all, so the name wrapped at every character: `TA5` came out as a three-row column of
letters. Precisely the failure the control multiselect had already been fixed for (review-9 #2), in
a place nobody re-checked. The options now carry a real class (`.ctl-dev-opt`) with the box pinned
to its natural size and the name on one line, flowing across and wrapping — the layout has to live
in the stylesheet, because an inline style on the *label* cannot beat a rule that targets the
*input*. Measured in a real browser: the `TA5` option is now **41 × 21px** with its text 22 × 17px,
i.e. one line.

**COL-1 — every column is hidable except the key.** A **Columns** bar above each data table: one
tick per column plus All / None. Unticking removes the column from the **heading, the filter row
and every cell** — the three used to be built by three different bits of code appending in the same
order, which is why they were merged into one visible-column list that all three now walk. The one
column not offered is the dataset's **first** (Package on Packages, Path on Tactical): it is the
row's identity and what the generated output acts on, so it appears as a "always shown" chip rather
than a box you may not untick. It is read off `adapter.columns[0]`, so a new dataset locks its own
key column with no core edit, and an explicit `hiddenCols.key` is refused rather than obeyed.

Hiding a column also **clears that column's filter**: FIL-1's whole promise is that the table is
never mysteriously short, and a filter whose dropdown has just been hidden is exactly that. The
choice is per dataset, session-only, and never written to the project — but **Export CSV follows
it**, because that export already promises the same columns, filters and order as the table.
Ticking a box does *not* rebuild the bar (that would take focus off the box you just clicked, and
hiding three columns is three clicks in a row): only the table and the bar's count repaint.

**DIV-1/2/3 — divergence from the guidelines is recorded, not implied.** A new core column,
**Diverges from Guidelines**, on every dataset (it is a property of a decision, not of a dataset —
the same reason Security Relevance lives there). Ticking it makes a **Divergence Narrative** box
appear in that row's expander, prompting for the three things that matter: how it departs, *which*
guideline it departs from, and why. The box exists **only** while the flag is set; an absent box is
what "does not diverge" looks like.

A flag with nothing behind it is a gap, not a record, so the cell is tinted and its hover says so —
the same treatment JUS-3 gives a control satisfied without a justification. A ticked cell's hover
carries the narrative, so the reasoning is readable without opening the row. **Unticking does not
delete what was written**: losing a paragraph to a mis-click is far worse than carrying a few unused
characters, and re-ticking brings it straight back; emptying the box is the erasure. On disk,
`diverges` is only ever `true` when present (no `false`, as with HELD-1's `held`), `divergenceNarrative`
is an ordinary optional string, and a `false` is refused on load.

The tick is a **quiet edit** (STAB-3): it repaints exactly the cell's hover/tint and the one open
detail row, addressed by a new `data-detail-key`. Re-rendering the table would have replaced the
checkbox under the pointer. Verified in a real browser: ticking a box in an expanded row moves the
row **0px** and the narrative box appears.

**Scope, as asked:** divergence is recorded and shown, and goes into **no** generated artefact yet —
not the report, not the control report, not the CSV. A self-test asserts that boundary by putting a
marker string in a narrative and proving it appears in none of the four generators, so "not yet" is
enforced rather than remembered. The Help manual documents the boundary explicitly.

**Help:** the Columns table gains the new column, a *Recording a divergence* section explains the
three-part narrative and the keep-on-untick rule, *Finding things* documents the column picker
(including why the key column cannot be hidden and that hiding clears the filter), the glossary
gains **Divergence**, and *If something looks wrong* gains "a column vanished".

**Tests:** +23 across three new suites (`CMD-1`, `COL-1`, `DIV-1/DIV-2`) — the classed label and the
two CSS rules that make it read horizontally, including an assertion on the `width:100%` rule that
*caused* the bug so the override cannot be tidied away; the locked key column of both datasets;
every other column hidable; hide-the-key refused; a hidden column leaving header, filter row and
cells together with a header/cell count check; the expander's colspan following the visible set; the
picker's boxes, chip, All/None and count; hiding clearing the filter; visibility never reaching the
project file; the Diverges column on both datasets; the tick reflecting the item; the
missing-narrative flag appearing and clearing; the narrative box existing only when flagged;
unticking keeping the text and emptying unsetting it; the canonical no-`false` form; a
byte-identical round-trip; `diverges:false` and a non-string narrative refused; an older project
loading untouched; `detailRowHtml` addressing one row; nothing leaking into generation; and the Help
coverage. **409/409 pass**, headless Chrome from `file://`, no console errors.

**Verified in a real browser** (CDP, three devices incl. `TA5` and a long name): the expander's
device names read across; unticking **Security Relevance** removes its heading, its cells and its
active `HIGH` filter in one go and the count reads *7 of 8 shown*; **None** leaves exactly `Path` on
Tactical and **All** restores all eight; ticking Diverges on an expanded row produces the narrative
box, tints the cell, stores `diverges: true` and moves the row 0px.

**Defects:** none found in this change.

---

### 2026-08-03 — UNDO-1/2/3: the Undo button becomes what its label already claimed — ✅ COMPLETE

**Reported:** *"I want an undo button that undoes whatever the last action was in any of the table
tabs. We currently have one only for the apply control and delete modes. If I set a decision to
remove on the Packages tab, I want to press undo and have it revert."*

**The problem was scope, not the mechanism.** Undo shipped attached to Delete Mode and Apply Control
Mode and never grew past them, so the button sat in every data tab's toolbar wearing a general label
over a specialist tool. The commonest edit in the whole tool — set a package to `remove`, change
your mind — had nothing to press, while a bulk apply did. Nobody can be expected to carry a mental
list of which edits are recoverable, and the one time it matters is the one time they will be wrong
about it.

**Built:**
- **`withUndo(dsId, label, fn)`** — one wrapper that owns the pre-change snapshot, and the *only*
  route a mutating handler takes. Making it structural was the point: the way to write a new handler
  that forgets to be undoable is now to write one that does not go through the wrapper at all,
  rather than one that forgot a `pushUndo` line.
- **Every data-tab mutation now runs inside it** — a decision, a return to undecided, a Status flip
  in either direction (adopt / hold / release), Security Relevance, Diverges, the divergence
  narrative, Description, Rationale, Rollback, a control-ref tick, the per-item value format, a
  rename, an add, a delete run, a per-row control tick and a bulk apply-to-all-shown.
- **One action is one click, whatever it touched.** The snapshot is of the whole dataset, so
  "however many rows" costs the wrapper nothing to support: applying a control to ten shown rows is
  one entry and one Undo restores all ten, and so is a Delete-Mode run over ten ticked rows.
  Consecutive Apply-Control-Mode ticks of the same control still fold into one entry (review-13 #2),
  and that run is now closed by any other edit as well.
- **No-ops never reach the stack.** The wrapper compares the dataset before and after and discards
  its own entry if they are byte-identical — a rejected rename, a re-picked enum, a blur that
  re-committed the value already in force. An Undo click that visibly does nothing is worse than a
  greyed-out button. Discarding also puts back the redo branch `pushUndo` had cleared, since a no-op
  is not a new action and must not strand a redo.
- **Quiet-edit paths re-sync the button by hand.** Ticking Diverges, clearing a decision, flipping
  Status and committing a cell all deliberately re-render only the table (STAB-3 keeps the element
  under the pointer still), and the toolbar the Undo button lives in is *not* inside that region —
  so each of those calls `refreshUndoButton` explicitly. This is exactly the bug that would have
  shipped as "Undo works but the button stays grey until you touch something else".
- **Wording** — the greyed-out tooltip no longer claims Undo is only for the two bulk modes, the
  Help manual entry lists what is covered and states the 20-step cap and the per-table scope, and
  the troubleshooting entry now says plainly that Control Manager / Devices / Onboard are *not*
  covered rather than leaving that to be discovered.

**Cost, measured rather than assumed:** two dataset clones and two stringifies per edit — ~6ms on
top of an ~8ms store commit for a **1500-package** dataset, and ~6MB for a full 20-deep history.
Both sit well inside what a click absorbs, which is why the no-op check runs unconditionally.

**Tests:** 6 new self-tests (`UNDO-1 universal undo`) covering an ordinary decision, a mixed
sequence stepping back newest-first one click at a time, a many-row action costing one entry, a
no-op pushing nothing and preserving the redo branch, an ordinary edit closing an open apply run,
and the 20-entry cap plus per-dataset isolation. All 6 pass, taking the suite to **432**; a headless
run reads **431/432** because SP-4's scroll round-trip needs real layout, which jsdom does not
implement — that one is unrelated to this change and passes in Chrome.

**Verified by driving the real DOM** (not just the wrapper): decision select → Undo reverts;
`✓ Apply all 3` → one Undo clears all three and the button greys out; rationale box in the expander
→ Undo reverts; Status badge both directions; Security Relevance; the Diverges checkbox (the quiet
path); a two-row Delete-Mode run restored by one click; and adding then undoing a Custom Security
Action. Tooltips read back correctly throughout (*Undo the decision change on "com.a"*).

**Not in scope:** Control Manager, Devices and Onboard keep no history — the buttons live in the
data tabs' toolbars and their snapshots are dataset-scoped. Said so in Help rather than implying
otherwise.

**Defects:** none found in this change.

---

### 2026-07-28 — FIL-2 + REV-2 + CTLM-1: filter by control, and two read-first fixes — ✅ COMPLETE

Three more reported from use.

**FIL-2 — filter the register by Control Refs.** The column filters (FIL-1) now cover **Control
Refs**, so "show me every action assigned to this control" is answered in the register itself
rather than by counting rows in the Control Manager — which is how a control's coverage actually
gets reviewed, next to the decisions that implement it. The options list the project's controls by
**title** (what the cell renders) but carry the control **id** as the value (what the item stores),
so renaming a control cannot orphan the filter. Every control is offered, not just the ones already
used in that dataset — "nothing here is assigned to it" is a useful answer — and **(none assigned)**
gives the gap list. Dataset-agnostic like the rest, and it composes with search, Action, Applies to,
Status and the parked toggles.

**CTLM-1 — the control modal's Packages panel was hidden behind Tactical.** The two panels sit in
a grid, and a grid item's `min-width` is `auto`, i.e. its **min-content** width — a package key is
one long unbreakable token, so the track could not shrink and the panel ran out under its
neighbour, hiding the list the modal exists to show. `min-width: 0` on the panels lets the track
shrink; the table is `table-layout: fixed` with wrapping cells so a long key wraps rather than
overflowing. The lists are now **Key and Decision only**: Status was redundant here anyway, since
an undecided item shows an empty Decision.

**REV-2 — the justification no longer sits beside the control button.** It is free prose in a flex
row, so the button lost width in proportion to how much had been written: no two rows lined up, and
the target got smaller the more you justified. The row keeps the state badge and the
**no justification** flag (a warning about something *missing*, not content), and the freed space
goes **back to the button** rather than being reserved — a fixed-width holder would have made every
button equal by making them all narrower, which is the opposite of the ask. The text is one click
away, with the evidence, where JUS-2 puts it.

**Tests:** +6 (the Control Refs filter's vocabulary/id-valued options, the filter itself including
`(none assigned)`, composition with the other filters and the search, the rendered select; the
modal's two-column list with no status badges; and the summary row proving the justification text
is absent from the row and still present in the modal). **386/386 pass**, headless Chrome from
`file://`, no console errors.

**Verified in a real browser** against the reference captures: filtering Packages by *No Bluetooth*
narrows 438 → the 3 bluetooth packages; the modal's Packages table now ends inside its own panel
(743px vs the panel's 744px right edge) instead of running under Tactical; and the control rows
carry no justification text, with the button ~100px wider than the peek used to leave it.

**Defects:** 3, all user-reported, all FIXED.

---

### 2026-07-28 — BULK-3 + SP-7: the tick column heading IS the bulk apply; a re-render keeps both scroll offsets — ✅ COMPLETE

Two more reported from use, both in Packages → Apply Control Mode.

**BULK-3 — the bulk apply moved onto the ✓ Apply column heading.** The tools rail carried an
**Apply to all N shown** button; the column it filled sat on the other side of the table. Clicking
the **heading of the tick column itself** now does that job: it reads **✓ Apply all N** (or
**✕ Remove all N**, in the danger style, when every shown row already carries the control — the
RV9-1 toggle is unchanged), and one click acts on exactly what the table is showing. Nothing about
the *plan* changed: the heading and the click handler both call `applyAllShownPlan`, so the count
promised and the set acted on still cannot drift.

Moving it into the table fixed a staleness bug on the way. The toolbar is deliberately **not**
re-rendered while you type in the search box (that would steal focus), so the old rail button went
on offering "Apply to all 438 shown" after a search had narrowed the table to three. The heading is
part of the table, so it is re-rendered with the rows it counts. The rail keeps the explanation — a
clickable column heading is not self-evident — but carries **no number**, so there is nothing left
to go stale. The heading is emitted by one shared `applyHeadButton`, because a row tick suppresses
the full re-render to keep the page still: the tick handler repaints just that one `<th>`, so
ticking three rows by hand flips the heading to **✕ Remove all 3** instead of leaving it promising
an Apply that would in fact remove. The `apply-col` column is widened to 132px to hold the label.

**SP-7 — a re-render put the view back vertically only.** SP-6 made `.main` scroll **sideways** as
well as down, and the columns you reach by scrolling right are the ones you act on: Status, and the
tick column itself. `captureScroll`/`restoreScroll` only ever knew about `scrollTop`, so every edit
that goes through the store — changing a package action from `keep` to `remove`, flipping a status
badge, setting relevance — snapped the view back to the left-hand edge: you scroll right to set an
action, and setting it throws the column away. Both offsets are now captured and restored, and the
STAB-2 anchor correction applies on both axes. The offset is also written *after* a forced measure,
since after a full `render()` `#main` is a brand-new element whose content has not been laid out.

**Tests:** +3 and 4 amended (the heading label/count and its Remove flip, the shared-unit invariant
that stops the in-place refresh drifting, the rail no longer duplicating the button, and a **real
DOM** SP-7 round-trip: scroll a live scrollport both ways, replace the element as `render()` does,
restore, assert both offsets — the same reason the SP-4 suite asserts CSS invariants, since no
render-to-string test can see a layout behaviour). **380/380 pass** (86 suites), headless Chrome
from `file://`, no console errors.

**Verified in a real browser** against the reference captures (438 packages, tools rail open):
clicking the heading tags all 438 / all 3 under a `bluetooth` search and flips to Remove; Undo
takes one click to reverse the whole run; and scroll position (top **and** left) is held exactly
across decision edits, status flips, relevance edits and row ticks.

**Defects:** 2, both user-reported, both FIXED.

---

### 2026-07-28 — REV-1 + SP-6 + STAB-3 + TAG-4: four user-reported UI defects — ✅ COMPLETE

Four things reported from use, all in the Devices → Controls list and the Control Manager.

**REV-1 — one button too many.** The per-device control row carried both the control button and
a **Review…** button beside it, going to exactly the same place. The control button was always
the larger, more obvious target and it reads better ("click the control to open the control"), so
**Review…** is gone. JUS-2's contract is untouched — the state toggle and the justification box
still live in the pop-up, and the row still shows the badge and the one-line justification peek.
The JUS-2 test now asserts the row routes into the modal *via the control button* and that the
second button is not there to come back.

**SP-6 — the rail stuck to the right of the *table*, not the right of the *screen*.** With a few
device columns the Control Manager table is wider than the viewport, so `.main` scrolls sideways
— and the rail went with it. `position:sticky` was never the problem; its **containing block**
was. A block-level flex container is only ever as wide as *its* containing block, so the wide
table overflowed `.table-wrap` and the rail sat outside it — and sticky cannot move a box beyond
its containing block, which left `right:` nothing to bite on. Sizing `.table-wrap` to
`width: max-content` makes it span the whole scrollable width (both tables are `table-layout:
fixed` with explicit column widths, so that width is the sum of the columns, not a text-driven
blow-out), `min-width: 100%` keeps it full-width when the table is narrower than the screen, and
`right: var(--sp-4)` — `.main`'s own padding — pins the rail so it lines up exactly with where it
comes to rest at the end of the scroll, rather than stepping sideways at the end of the range.
Pinned in the SP-4 CSS-invariant suite alongside the other four properties this behaviour rests
on, for the same reason: sticky fails **silently**.

**STAB-3 — the page still moved when ticking a Control Manager checkbox.** STAB-1/2 fixed the
*content* (rows no longer change height, and the anchor corrects for what does), but the
Control Manager's two checkbox handlers still went through `store.onChange`, which re-renders the
**whole shell and tab**. Scroll offsets are put back afterwards — but only after the browser has
already painted the rebuilt page from the top, and the checkbox the pointer was over is by then a
different element. The data tabs already had the answer (`_suppressRender`, used by Apply Control
Mode); it is now a first-class `ctx.quietEdit` on the shared controller context, and the device
and tag handlers use it and repaint only what their tick changed:

- the row's **Tags** and **Applies to** cells (rows carry a `data-ctl-row` handle for this),
- the mirrored device box in the row's dropdown, so both views of one assignment agree,
- the device **column heading** (its assign/remove state reads off the shown set),
- and the rail, whose tag counts and *Tag all N shown* button read the whole table.

Verified headlessly by ticking through a mounted app and checking **node identity**: the `<tr>`
before the tick is the same object after it, so there is nothing for the page to move. The
unsaved marker, which is part of the shell we decline to re-render, is nudged by hand — the draft
autosave was never affected (it runs outside the render branch).

**TAG-4 — the tag badges were clipped along the bottom.** A badge is an `inline-block` carrying
1px of padding *and* a 1px border, so it stands ~4px taller than the text line the shared
`.cell-clamp` height (`1.45em`) was sized for; `overflow:hidden` then cut its bottom border off.
The Tags cell gets its own clamp height, still **fixed** so STAB-1 holds — the row height stays
independent of how many tags a control carries — just tall enough to hold a whole badge.

**Tests:** +5 (Tags-clamp height with the badge arithmetic spelled out, the `data-ctl-row` handle
the surgical repaint addresses rows by, the `quietEdit` hook, and two SP-6 CSS invariants), plus
the amended JUS-2 assertion. **377/377 pass** (86 suites), headless with no console errors.

**Defects:** 4, all user-reported, all FIXED.

---

### 2026-07-28 — FIL-1 + JUS-1/2/3: column filters, justified control satisfaction — ✅ COMPLETE

**FIL-1 — per-column value filters that compose.** Each data table now carries a filter row
directly under the headings: one dropdown per filterable column, sitting under the column it
filters. Which columns get one is **discovered from the adapter** rather than hardcoded — the
enum decision field (packages' Action) supplies its own options, Security Relevance comes from
the shared vocabulary, Applies-to from the devices actually holding items in that dataset, and
Status covers decided / undecided / review. Tactical, having no enum decision field, correctly
gets no Action filter.

The important property is composition. Filters AND with each other, with the free-text search,
with Incomplete-only and with the parked toggles — so the asked-for case, *packages being removed
whose name contains bluetooth*, is Action = `remove` plus a search, not a special case. Because
they all run through the same `filterSortRows`, everything that acts on "what is shown" inherits
them for free: **Apply to all N shown** and **Export CSV** both narrow with the table. An active
filter is tinted and the toolbar says how many are on with a clear button — a table that is
mysteriously short is worse than no filter at all. Filter state is UI-only, never saved.

**JUS-1/2 — control satisfaction is now a justified decision.** The **Mark satisfied** button has
moved off the summary row and into the control's pop-up, beneath the list of items that satisfy
it, alongside a new **Justification** textbox. That placement is the point: you mark a control
satisfied having just looked at what satisfies it, and you record why in the same moment. The
summary row keeps the state badge (plus a one-line preview of the justification) and offers
**Review…** to open the pop-up.

Stored as `Control.deviceJustifications[baseId]` — per control *per device*, keyed by base id so
it survives re-onboarding exactly as the state does. Blank clears it and the empty map is dropped,
so "no justification" has one canonical form. Additive; no `schemaVersion` bump.

One race worth recording: clicking **Mark satisfied** blurs the textarea, so the state commit and
the justification commit were competing for the same transaction. The handler now flushes the
pending justification first. Browser-verified — typing a justification then immediately clicking
the button persists both.

**JUS-3 — it reaches the report, or it is not traceable.** Control coverage gains **Status** and
**Justification** columns; the control report prints the per-device status and justification under
each control heading. A control marked satisfied with **no** justification is flagged in the
pop-up, on the list row, and in the report — which prints *No justification recorded* rather than
an empty cell that reads as clean.

**Tests:** +19 across two new suites (FIL-1: adapter-derived filterable columns, each filter type
including "(not set)" and `review`, the filter+search composition the request named, composition
with the parked toggles, the rendered filter row and its active marking, the toolbar count, and
the bulk plan honouring filters. JUS: round-trip, canonical clearing, refusal for an unassigned
device, schema rejection, the modal carrying toggle + box + evidence while the list row carries
neither toggle, the unjustified flag in all three places, and both reports carrying the text).
**372/372 pass** (85 suites), headless and in Chrome, no console errors.

**Browser-verified:** 6 rows → Action=`remove` → 3 rows → + search `bluetooth` → the same 3, with
the toolbar reading *1 column filter active*; and the modal round trip above.

**Defects:** 1 found during build (the justification/state commit race), FIXED.

---

### 2026-07-28 — STAB-1/2 + TAG-1/2/3: layout stability, column-wide assign, control tags — ✅ COMPLETE

**STAB-1 — "checking a box moves my scroll slightly" (user-reported).** The cause was not the
scroll. `scrollTop` never moved; the **row grew**. Ticking a device adds its name to the
neighbouring *Applies to* cell, that cell wraps onto another line, the row gets taller, and every
row below slides down — so the next box you meant to click has moved. Measured in a browser:
a reference row went 754 → 762 → 797px over two ticks while `scrollTop` stayed at exactly 900.

Fixed by clamping the cells that grow on a tick — *Control Refs* and *Applies to* in the data
tables, *Applies to* and *Tags* in the Control Manager — to a **fixed** height with the full text
on the `title`. Two things had to be got right, both found by measuring rather than reasoning:
a height *range* is not enough (a 2-line clamp still grows on the 0→1 line transition), and the
clamp span must be emitted **even when empty** so an empty cell is exactly as tall as a full one.

> Also fixed en route: the first attempt at this CSS left a stray `*/`, which silently killed the
> rule — the class was on the element and no style applied. Caught by reading the *computed*
> style in a browser rather than trusting the source.

**STAB-2 — scroll anchoring.** Restoring `scrollTop` is not enough on its own, because content
*above* the viewport can legitimately change height. The renderer now also records the focused
element's viewport offset (via a selector rebuilt from its own `data-*` attributes) and corrects
`scrollTop` by however much it moved. Whatever else reflows, the thing under the cursor stays
under the cursor. Browser-measured: **0px drift on four consecutive ticks**, where it was 8–43px.

**TAG-3 — a device column heading assigns the whole shown column.** Each per-device heading in
the Control Manager is now a button: it assigns that device to **every control currently shown**,
so onboarding a device and giving it a searched-for set of controls is one click. Verified:
search `bluetooth` → click *S23* → exactly the two Bluetooth controls got it, the other three
untouched; the heading then marks itself green and the same click removes it from all of them.
The review-12 #1 contract holds on the bulk path — assigning seeds `unsatisfied`, un-assigning
drops it.

**TAG-1/TAG-2 — custom tags on controls.** A control's `type` is one classification; `tags` is a
free, multi-valued one, for whatever cuts across the catalogue — the administrative controls you
track but never action through this tool being the case that prompted it. Additive:
`Control.tags` plus a top-level `controlTags` catalogue, no `schemaVersion` bump; an empty list
is dropped so "no tags" has one canonical form.

Applied through a **sticky tools rail on the Control Manager**, deliberately the same affordance
as the data tabs' Apply Control Mode: an Apply Tag Mode toggle, a create-tag box, a filterable
picker showing each tag's usage count, a per-row ✓ Tag column, and **Tag all N shown** with the
same toggle-to-untag semantics as BULK-1. The Control Manager search now matches tags too, so you
can narrow to a tag and then bulk-act on it. Rail verified pinned at a constant 119px offset.

Two details worth recording:
- The create-tag box sits **above** the picker. With a long tag list the rail scrolls, and the
  one control you cannot reach by scrolling is the one that creates your first tag.
- The CM search re-renders only the table host, so the rail's bulk button kept a stale count —
  it read *"Tag all 5 shown"* while one row was shown. It acted correctly (it recomputes), but a
  button that promises a number it will not act on is a bug. The rail is now re-rendered with the
  table. **Found in browser testing; the suite could not see it.**

**Tests:** +17 across three new suites (STAB-1 clamped cells incl. the empty case and a check
that the CSS pins a *fixed* height; TAG-3 heading-is-a-button, shown-set-only, toggle, marks
itself, deviceStates contract; TAG-1/2 create/apply/multi/dedupe/canonical-empty/round-trip/
schema-rejection/delete, search-matches-tags, rail composition, bulk label flips).
**353/353 pass** (83 suites), headless and in Chrome, no console errors.

**Defects:** 3 found (STAB-1 user-reported; the stray `*/` that voided the fix; the stale rail
count), all FIXED.

---

### 2026-07-28 — BULK-1/2 + HELD-1: bulk-over-shown, bigger hit targets, hold-for-review — ✅ COMPLETE

Three review items, one of which turned out to be a data-model change.

**BULK-1 — "Apply to all N shown" replaces the action dropdown.** The old *Apply to
`<action>`* select could only slice by an enum decision field, which made it packages-only and
unable to express the query people actually have: *everything to do with Bluetooth*. It is now
a single button that applies the selected control to **exactly the rows the table is
currently showing** — search `bluetooth`, click once. Every filter counts, not just the search
box (Incomplete only and the parked toggles narrow it too), and it toggles: when all shown rows
already carry the control the button reads **Remove from all N shown**.

The label and the click share one plan (`App.ui.model.applyAllShownPlan`, built on the same
`filterSortRows` the table renders from), so the count the button promises and the set it acts
on cannot drift apart. One undo entry per run; the Activity log names the count and the search
term. Dropping the enum requirement means **Tactical gets it too**. RV8-2/RV9-1 recorded as
superseded rather than quietly removed.

**BULK-2 — the tick columns are full-cell targets.** A ~16px checkbox inside a 74px cell is a
precision task you repeat hundreds of times. The Apply and Delete boxes — and, on review, the
**Control Manager's per-device columns** (110×40px cells with a 16px box sitting 48px in) — are
now wrapped in a cell-filling `<label>`, so a click anywhere in the cell registers. Deliberately
a `<label>` and not a click handler on the `<td>`: it stays a real `<input type="checkbox">`
with its `aria-label`, so keyboard and screen-reader access are unchanged. Verified in a browser
for both surfaces that clicking the box *itself* still toggles exactly once — a label wrapping
its own input is a classic double-toggle trap.

The Control Manager's other two checkbox groups (the "Device columns" bar and the row-expander
"Applies to" list) were left alone: both already sit inside labels **with the device name as
visible text**, so they are large targets already. The rule is about bare boxes in cells.

**HELD-1 — flag for review without losing the answer.** Previously the only way to make an item
undecided was to clear its decision, which threw the answer away; you could not say *"this is my
choice, but check it again"*. `RegisterItem` now takes an optional **`held`** flag: the decision
is left completely untouched, the item simply stops counting as complete. So it reads as
outstanding, blocks device readiness, and is excluded from the generated script — which is the
whole point of "review later" — while the value you chose is still sitting there when you return.

- The **badge flip** now holds rather than wipes; clicking again accepts the same value back.
- Editing the value releases the hold, because editing *is* reviewing.
- **`clear` still clears.** Hold and clear are deliberately different actions.
- A held item gets its **own badge** (`review`, blue) in the data tables and device panels:
  being able to tell "answered, re-check me" from "never answered" at a glance is the reason
  the state exists. Holding an item with no value is refused — there is nothing to review.

**Tests:** +17 across three new suites (BULK-1 plan/label/filters/toggle/inert states; BULK-2
markup and accessibility; HELD-1 retention, readiness, generation exclusion, badge, round-trip,
schema rejection of `held:false`, flip-back, edit-releases, clear-still-clears). **335/335 pass**
(80 suites), headless and in Chrome, no console errors.

**Browser-verified end to end** (these are behaviours render-to-string tests cannot see):
search `bluetooth` → button reads *Apply to all 3 shown* → click → exactly the three Bluetooth
packages tagged, wifi/camera/maps untouched → button becomes *Remove from all 3 shown*; a click
30px left of a checkbox toggles it; a decided item flipped to review keeps
`{"action":"remove"}` with the badge reading `review`.

**Defects:** none.

---

### 2026-07-28 — SP-4/SP-5: the tools rail did not actually stick — ✅ FIXED

**Defect (user-reported).** The rail rendered exactly as intended but scrolled off the top with the
table, so its whole purpose — reaching the control picker from row 400 — did not work.

**Cause.** Not the rail. `#app-root` was `min-height:100vh`, so it grew with its content, the **body**
did the scrolling, and `.main`'s `overflow:auto` never actually scrolled. That combination is the
classic silent killer of `position:sticky`: **the nearest overflow ancestor becomes the sticky
scrollport even when it never scrolls**, so the rail was faithfully pinning itself to a viewport that
never moved. The CSS was, in isolation, correct.

**Fix.** Make the shell what its own CSS always intended: `#app-root { height:100vh }` (fixed, not
min-) and `.main { min-height:0 }` — a flex child will not shrink below its content height without
that, so `.main` would otherwise overflow the shell and still not scroll. `.main` is now the scroll
region. Bonus: the top bar, tab strip and Activity drawer stay put too.

**Consequential fix (SP-5).** With `.main` scrolling, replacing its `innerHTML` resets `scrollTop`,
and picking a control re-renders — so the first cut jumped to row 1 on every click, which would have
been *worse* than the original bug. Scroll offsets for `#main` and the rail's own card list are now
captured before a render and restored after, **within a tab only** (changing tab lands at the top).

**Why no test caught it.** Every existing assertion is over rendered HTML strings, and the HTML was
right. Sticky is a *layout* behaviour, invisible to render-to-string testing. Two things were added:
- **SP-B — 4 assertions over the stylesheet itself** (`#app-root` fixed height; `.main`
  `min-height:0` + `overflow:auto`; `.side-rail` sticky + `align-self:flex-start` + inset;
  `.table-wrap` free of `overflow`), each carrying the reason it exists. Each was **verified to fail
  when its property is reverted** — a guard that cannot fail is not a guard.
- **SP-C — a real-browser check.** Headless Chrome over a 400-row table: the rail's viewport offset
  is **119px at scroll depths 2 000 / 6 000 / 12 000 / 19 000** (constant = genuinely pinned), and
  selecting a control leaves the table at 4 000. Also confirmed the whole suite runs in-browser from
  `file://` with **no console errors** — which is **DOD-1**, previously a standing manual check.

Rail `max-height` tightened to `calc(100vh - 200px)` so it cannot exceed the visible main area while
the Activity drawer is open; it scrolls internally if the viewport is short.

**Tests:** +4 (318/318, 77 suites), plus the two out-of-band browser scripts.

**Defects:** 1 found (user-reported, SP-4), FIXED.

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

---

### 2026-08-18 — Phase 17 (v3.2): folder storage — 🟡 IN PROGRESS (TF.1–TF.12 built; hand-verification outstanding)

Specified in `folder-storage-requirements.md`. Single-user, single-project, rollback-oriented. The
larger content-addressed store in `config-store-requirements.md` is explicitly **not** being built
and is incompatible with this one — see its §1.3.

**Harness change (prerequisite).** `App.test.run()` now resolves a promise and awaits any test that
returns a thenable; it was strictly synchronous and every storage test is async. The 170-odd
existing suites needed no edit — a test returning a non-thenable is treated as finished the moment
it returns. Concurrent `run()` calls are serialised, because under `#selftest` in jsdom there are
two callers (bootstrap and `tools/run-selftests.js`) and the suites share global `App` state.
`tools/run-selftests.js` updated to await.

**Built:**
- `App.util.idbKv` (TF.1) — namespaced IndexedDB k/v; holds the directory handle and the draft only.
- `App.storage` (TF.2/3) — STATUS/CODES vocabulary, normalised `{code,message,cause}` errors, path
  helpers. `listDir` is a *directory* listing, not a prefix match, so the two drivers cannot drift.
- `App.storage.driverMemory` (TF.2) — the reason any of this is testable, with fault injection.
- `App.storage.driverFsa` (TF.3) — File System Access API, kept deliberately thin because it is the
  only module that cannot be tested headlessly.
- `App.storage.folder` (TF.4) — layout, snapshot policy (5-min floor, newest 40), prune, quarantine
  by copy-then-delete, the divergence guard, unpacked `Outputs/`, conflict-copy detection.
- `App.storage.writer` (TF.5) — 60s idle / 180s cap, coalescing, single looping drain, no retry spin.
- `App.ui.folder` (TF.6/8/9/11) — the single seam to the UI: connect/reconnect/recovery/divergence
  screens, status chip, rollback list, read-only gate.
- `App.ui.app` wiring (TF.6/7/8) — chip and banners in the shell, `folder-locked` gate, flush on
  `visibilitychange` + `beforeunload`, draft moved from `localStorage` to IndexedDB at ~5s.
- `App.ui.views.generate` (TF.10) — artifacts written unpacked to `Outputs/<device>/<command>/` when
  connected, zip download when not; the Activity log always says which.
- Help gained a **Project folder** section (TF.12); `CLAUDE.md` invariants amended for browser
  storage, FSA-is-not-network, and the recorded shared-origin risk.

**Decisions worth remembering:**
- Unconnected is a fully usable state. The reference design says gate until writable; here that
  would be a regression, since the tool has always worked standalone and keeps manual save/load.
  `NEEDS_PERMISSION`/`ERROR`/recovery *do* gate — those are the states where the user would
  otherwise believe edits were being saved.
- The 180s cap is not decoration: with a pure 60s idle debounce, editing that never pauses a full
  minute would never write at all.
- The slow cadence exists to keep SharePoint version history meaningful. It records a version per
  change and prunes the oldest at its limit; a half-second autosave would burn hundreds of
  meaningless versions in an afternoon.

**Defects found during the build:** one — with no File System Access API, `init()` returned early
without a re-render, leaving the shell showing the "Connect a folder" banner painted before init
ran, whose button could only do nothing. Fixed by refreshing before the early return; caught by a
jsdom mount check rather than by the suite, since `#selftest` returns before `mount()`.

**Result:** 1100/1100 embedded self-tests pass (10 new suites, ~45 new tests, all above the driver
line against `driverMemory`). The app mounts clean in jsdom with no console errors.

**Outstanding — TF.13 hand-verification.** `showDirectoryPicker()` cannot be driven headlessly, so
`driverFsa` is unverified. Per `folder-storage-requirements.md` §13.2, check by hand in real Edge
against a OneDrive-synced folder: genesis into an empty folder; reconnect after a full browser
restart takes exactly one click; a stale handle (folder renamed underneath) degrades correctly;
SharePoint records a version per canonical write and the swap file does not persist; an offline
dehydrated snapshot read produces the specific message rather than a generic error. Two-machine
concurrency is out of scope by decision — the divergence guard is written to fail safe, not proven
by test.
