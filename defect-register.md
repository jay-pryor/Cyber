# CH Config Tool — Defect Register

Defects found during per-phase review/testing, logged before fixing.

Status: OPEN · FIXED · WONTFIX · DEFERRED
Severity: blocker · major · minor · trivial

| ID | Phase | Severity | Status | Summary | Fix note |
|----|-------|----------|--------|---------|----------|
| D-001 | 0 | trivial | FIXED | UTF-8 SHA-256 self-test used a wrong expected vector (hash of "password", not 'é') | Corrected fixture to true digest of 'é'; impl verified against Node crypto |
| D-002 | 2 | major | FIXED | Tactical JSON with a non-object root (top-level array/scalar) produces an empty-path leaf, and rebuild then crashes in setAtPath (segs[-1]) | Reject non-object tactical root at parse with a located error |
| D-003 | 3 | trivial | FIXED | 1500-row render test counted 1501 `<tr` (header row also matched); test-assertion error, not a product bug | Count body rows via `<tr class` instead |
| D-004 | 4 | blocker | FIXED | `store.onboardDevice` called `_commit(...)` (the exported alias, undefined inside the IIFE) instead of the local `commit` — every onboard threw ReferenceError | Renamed call to `commit(...)` |
| D-005 | 2/4 | major | FIXED | Settings parser assumed tab-separated `ns<TAB>key<TAB>value`, but the real `settings list` capture is sectioned `<namespace>:` headers + `key=value` lines; all 806 real lines errored. Keys also contain `#` | Rewrote settings parser to the sectioned format; first `=` splits key/value; extended key charset to allow `#`; updated capture hints, instructions, fixtures, and tests |
| D-006 | 5 | trivial | FIXED | Settings editor test asserted `data-kind="enum-synth"`, but settings' `type` field is `decisionSchema` kind `enum` (enum-synth is only the tactical value-typed companion); test-assertion error, product correct | Assert the `type` enum select via its options instead |
| D-007 | 1/5 | major | FIXED | Embedded test suites called `registerPlatform` at module-LOAD time (not inside tests). The Phase-1 mock `selftest.platform` thus registered on every page load and, being first, became the ACTIVE platform — real app would boot to mock tabs + polluted platform dropdown | Made all test-suite platform registrations lazy (ensureST()/ensureAndroid() inside tests); only bootstrap registers android-adb in the real app |
| D-008 | 6 | minor | FIXED | Device view derived its panels from the ACTIVE platform's datasets, not the loaded project's platform; if they differ (active≠project) `getDataset` returns null and the view throws | Device view now derives datasets from `project.platformProfileId`; project-load also sets the active platform to match |
| D-015 | 9 (DEV-1/VF-2) | major | FIXED | An item assigned to a second device by hand read as **undecided** on the Devices tab while the data tab showed it decided — device readiness inferred the value format from that one device's capture, which does not contain a hand-assigned key | One fleet-merged captured-value map (`registry.capturedDefaults`), used by readiness and by every table |
| D-017 | 9 | major | FIXED | The **verification** script shipped the whole implementation half — `Apply-Package` with live `pm uninstall`/`disable-user`, and (newly, from the D-016 work) the reverse switches presented as an uncomment-me lever that did nothing. All inert, none of it obvious to a reader | Preamble/postamble assembled per command via `ctx.command`; a verify script now contains no mutating verb at all. Locked by VER-5 + an execution proof that device state is byte-identical after a verify run |
| D-016 | 9 | blocker | FIXED | One package that refuses to uninstall **terminates the whole implementation run** — remaining packages never applied. A native `pm` failure is escalated to a terminating error on hosts that do so (Windows PowerShell 5.1 via `2>&1`+`Stop`; 7.3+ via `$PSNativeCommandUseErrorActionPreference`), and nothing caught it | `Invoke-AdbPm` relaxes the preference around the native call, guards it with try/catch/finally, and grades a caught throw as a failure; the 7.3+ escalation is pinned off. Locked by the D-016 suite + an execution harness under real pwsh 7.4.6 |
| D-028 | 14 (FNT-1/PRV-2) | minor | FIXED | The table font size appeared not to apply to package names. The PDF was correct (measured: 8.97pt mono beside 8.97pt prose); the PREVIEW pinned every code span to 12px, so identifiers stayed one size while the prose followed the profile. The preview also drew captions at an invented 0.92x | `.rd-paper code` inherits its size, as `\texttt` does on the page; the caption follows the document size, which is what it is actually set at |
| D-027 | 14 (FNT-1) | major | FIXED | Past pandoc's `--columns` default of 72 a pipe table's widths are read off the SEPARATOR row, so `\| --- \| --- \|` gives every column an equal share whatever is in it — seven equal columns each too narrow for its own heading. Separately, the width model measured every table at the document size, so a header set larger overflowed by the ratio it was enlarged by | The grid form takes over at 72 columns rather than at the page budget, so the widths are ours; and `App.docFormat.tableMetrics` hands App.md the page in ems plus each table font size relative to the document's |
| D-026 | 14 (BRK-1) | major | FIXED | A space-free run (`io.sdsasolutions.tacticalsettings`) could not wrap at all — no hyphenation point, and a zero-width space is not a break opportunity in XeTeX (measured). Unmarked it was also a HARD floor, so it forced its column wide and starved the columns that genuinely cannot wrap | A run of 18+ characters shaped like an identifier is emitted as a code span, which routes through the existing `\texttt` -> `\seqsplit` hook: breakable on the page, and soft rather than hard in the width model. Preview cells gained `overflow-wrap` |
| D-024 | 14 (AUTO-2) | major | FIXED | Column widths were proportional to source CHARACTERS but spent in POINTS. Next to a monospace key column the rate fell below what prose needs, so unbreakable words — headings especially — pushed past their column into the next one | Columns measured in ems from real Latin Modern metrics, against the page less pandoc's inter-column padding; hard floors, then soft floors, then appetite |
| D-025 | 14 (PRV-3) | minor | FIXED | Three preview infidelities: the outline rail printed the markdown escaping (`\&`); every firewall rule in a cell ran together into one paragraph; and an unstyled table header was painted with the app's own surface colour — near-black on a white page, and indistinguishable from a shaded one | `unescapeMd` for text destinations; `parseGrid` keeps interior blank lines and the renderer treats a cell as paragraphs; the page states its own table background and the profile is the only source of a shade |
| D-023 | 14 (NAM-1) | minor | FIXED | The per-section preview printed the section's LIST NAME as its heading; the whole-document preview printed the heading. Correct while the two were the same string, wrong the moment NAM-1 made them different | `sectionPreview` forced `title: block.label` into `headingFor`; the resolved block already carries the heading, so the override was the whole bug |
| D-021 | 14 (AUTO-1) | major | FIXED | Making the automatic width path wrap let it hard-break a token. A register key came out as `` `appInstall `` / `` Whitelist` `` — pandoc rejoins the halves with a SPACE through the package name and renders the surrounding `**` as literal asterisks | The width floor counts the whole space-free token, measured on the source with its markup, so the auto path can never cut one; `safeCut` also refuses to land inside a `**` marker |
| D-022 | 14 (AUTO-1) | major | FIXED | The Control coverage table was mashed — three columns crushed to a few characters, one taking the page — and its long cells ran off the right of the PDF. Two causes: widths proportional to source characters, and the pipe form, whose LaTeX `l` columns do not wrap at all | Automatic widths lay a too-wide table out (floors first, then slack by appetite); the grid form is chosen whenever a table is wider than the budget, not only when a cell holds a line break |
| D-019 | 14 (CAP-1) | minor | FIXED | A captioned table printed its number twice — `Table 3: Table 3 — Ports` — because App.doc wrote a number into the caption text that LaTeX also supplies from its own counter | Caption text is the text alone; App.doc keeps its counter only so a cross-reference can name the number the page prints, and both count captioned tables in emitted order |
| D-020 | 14 (TW-1) | major | FIXED | `gridTable` put alignment markers on EVERY border row. Pandoc 3.1.11 silently drops every body row of such a table — it compiles to a header and nothing else. The preview had the mirror bug: it recognised only `+-` borders, so an aligned grid table rendered as prose | Markers emitted on the header separator only; the preview's three border regexes widened to accept `+:` |
| D-029 | 14 (CAP-3) | major | FIXED | `tableIndex` counted a grouped dataset's tables TWICE — it descended into the parent's `children` and also read the same children back as the blocks `outline` had flattened them into. A three-group Packages report numbered its tables 1,2,3,4,5,3,4,5,9,10, so every table cross-reference after a grouped dataset named a number the page did not print. Invisible while LaTeX printed the captions from its own counter; the moment CAP-3 made ours the printed number, it would have printed the wrong one | A parent whose children are already in the list is not descended into (`parentId` marks them). Locked by a test that the numbers in the emitted captions run 1..n with no gaps or repeats |
| D-030 | 15 (REF-1) | major | FIXED | Every cross-reference to a REGISTER section printed in the PDF as the literal token `{{ref:ds:android.packages}}`. The token pattern's id charset was `[A-Za-z0-9:_-]` — no dot — so `ds:android.packages` never matched, fell through to the escaper with the surrounding prose, and was emitted verbatim. References to hand-authored sections (`sec1`) worked, which is what made it read as intermittent | `.` added to the id charset. Locked by REF-1, which asserts a dotted id resolves to a link and that no `{{` survives into a document |
| D-031 | 15 (REF-1) | major | FIXED | A cross-reference inserted in a generated section's **introduction** could never resolve. `sectionContent` rendered it with `MD.rich(b.intro, {})` — no resolver — because the generator fills a section's body before the outline exists. So the one editor that could produce a link had nowhere for it to point | The introduction stays as token text and is rendered by `App.doc.render`, which holds the resolver and the table index. The Link and line-break buttons were added to the introduction toolbar in the same change; one without the other is a button that produces "[missing reference]" |
| D-032 | 15 (CTR-1) | minor | FIXED | "Centre this section's content" left the HEADING left-aligned, so a title page composed as a centred `T` section had a centred body under a flush-left title | `headingFor` wraps the heading in the centre environment; the title's two styling macros stay outside it, since a `\titleformat` made inside a group is undone at `\end{center}` |
| D-033 | 15 (CTR-1) | minor | FIXED | Found while fixing D-032: the preview dropped the outline of any centred block, so a centred section vanished from the navigation rail and the contents list while still printing on the page | The nested render's outline is merged into the parent's |
| D-034 | 15 (REF-1) | minor | FIXED | Found while fixing D-032: a `[]{#id}` anchor line before a PARAGRAPH was held and then attached to whatever table came next, so the preview's links landed somewhere the PDF's do not | The anchor is consumed by the paragraph it precedes |
| D-035 | 15 (HDR-1) | minor | FIXED | Found by the live-DOM pass, not by reasoning: the header/footer slots first reserved the bare words `page` and `pages`, so a first-page header reading "Title page" came out as "Title 1" | The markers carry a `#` (`#page`, `#pages`), which is not prose. Substituted before escaping, in one place, for both the preamble and the preview |
| D-036 | 15 (REF-2) | major | FIXED | A control link in a table cell printed as `[AHG-002](#ctl-ahg- 002)` and was not a link in the PDF. A HAND-SET column width had no unbreakable-run floor at all, so the wrap cut straight through the link — and pandoc rejoins a cell's lines with a space, putting one inside the destination. D-021's fix had only ever covered the automatic path | `gridTable` now applies the same source floor to explicit widths, scaling the whole table up uniformly so the dragged fractions are preserved; `safeCut` additionally refuses to land inside a link. The same floor stops a code span being cut, which was D-021 latent in the explicit path |
| D-037 | 15 (REF-1) | minor | FIXED | A paragraph ending in a line break printed a literal `\` in the PDF. `{{br}}` becomes pandoc's trailing-backslash hard break, and at the end of a block there is no next line for it to start, so pandoc reads the lone `\` as an escaped backslash | Trailing breaks are dropped; breaks in the middle, consecutive ones included, are untouched — `\` on a line of its own is a hard break with no content, which is how a blank line inside a paragraph is written |
| D-038 | 15 (CTR-1) | major | FIXED | A centred title came out JUSTIFIED across the full measure, with an entirely blank page in front of it. Wrapping the heading in a `center` environment does neither thing it looks like it does: titlesec sets a heading's text in a box `\centering` does not reach, and the environment contributes its `\topsep` glue before `\sectionbreak` fires — so a level asking for a page break got the glue on a page of its own and `\clearpage` then ended it | Centring is a `\titleformat` with `\centering` in its format argument, emitted as a per-level macro pair either side of the heading (the shape TTL-3 already used for the title's styling). No environment, so no stray glue and no box in the way |
| D-039 | 15 (CTR-1) | major | FIXED | A HAND-AUTHORED section's "centre this section's content" reached the per-section preview and never reached the document. A generated section is centred where its body is built; a custom section's body is built by `App.doc.render`, which was not centring it — and a title page, the commonest thing anybody centres, is always hand-authored | `render` centres a custom section's body when the block asks for it |
| D-040 | 15 (REF-1) | major | FIXED | The link menu offered every section and no generated table. `App.doc.tableIndex` reads tables back out of the markdown their register produced, and the menu was outlining the UNFILLED blocks — which have no bodies, so only hand-authored tables were found | `filledView` runs the same `sectionContent` pass `buildReport` does before outlining, so the menu offers exactly what the document will contain. The per-section previews use it too, so a reference to a register table resolves there as well |
| D-041 | 15 (REF-1) | minor | FIXED | Pressing a formatting or Link button dropped the selection in the paragraph box, so the text had to be highlighted again with the menu already open. Two causes: the button took focus on `mousedown`, and opening the menu repaints the workspace, destroying the textarea the selection belonged to | `mousedown` is prevented on all of them, and the selection is recorded by the box's SELECTOR (which survives a repaint) and restored afterwards |
| D-042 | 15 (PRV-4) | major | FIXED | In page view the navigator links jumped nowhere. `offsetTop` is relative to the nearest positioned ancestor, which in page view is the SHEET rather than the scrolling article | Measured with `getBoundingClientRect` against the scroll container, which is correct in both views |
| D-043 | 15 (PRV-4) | major | FIXED | In page view a table stopped at the bottom of its sheet and the rest of its rows were simply absent from the preview — blocks were moved whole into a fixed-height, clipped sheet | A table is split across sheets as a longtable is, repeating its header on each part. Found while fixing it: with no room left the splitter still forced one row onto a full page, so the sheet overflowed |
| D-044 | 15 (CTR-1) | blocker | FIXED | Centring one section centred the whole document in the preview, and the paged view stopped after two sheets. The fenced-div walker was not depth-aware: a centred paragraph inside a centred section emits nested `center` environments, the walker closed on the first one, and the outer close was left as a bare `:::` — which `/^:::/` read as an OPENING fence and used to swallow the rest of the document. With everything folded into one block there was nothing left for the paginator to break between | The walker counts depth; a closing fence with nothing open is machinery and is dropped, never read as an opener. A part inside an already-centred section is no longer wrapped a second time, so the nesting mostly stops arising |
| D-045 | 15 (TBL-1) | major | FIXED | The table title row printed as a big grey box detached from its table. Two faults in one construct: a longtable contributes `\LTpre` (~12pt) above itself, which stood between the band and the table; and the closing macro carried a second `\strut`, which — the paragraph inside the minipage having already ended — began a SECOND line, so a one-line title came out in a two-line box | `\vskip-\LTpre` cancels exactly the glue the following longtable adds; the trailing `\strut` is gone. The band is measured against `\columnwidth` so a narrowed table's title matches its table |
| D-046 | 15 (TBL-1) | major | FIXED | The table title row still looked wrong in the PDF after D-045. Built the page and saw it: a shaded band has to be given a width, a table's final width is decided when it is typeset, and the two are routinely different — the band was wider than its table and wider by a different amount for each of a section's three tables | The title is a centred line in the header row's own type, sitting directly on the table. A line has no width to get wrong. The preview draws the same line rather than a spanning row it cannot produce (D-025's rule) |
| D-047 | 15 (HDR-1) | minor | FIXED | A footer reading `Page #page of #pages` printed "Page 1of 7" — TeX consumes the space after a control word, so `\thepage of` loses it. Proven directly: `Page \thepage of 7` renders "Page 1of 7", `Page {\thepage} of 7` renders "Page 1 of 7" | The slot macros are emitted braced; a `}` is not a control word, so the space after it survives |
| D-048 | 15 (HDR-1) | major | FIXED | "Different first page" did nothing — page one kept the running header. Two causes: page one is an ordinary `fancy` page (with the automatic title block off there is no `\maketitle`, so it is not `plain`, which is what the first attempt redefined); and pandoc's `latex_macros` extension APPLIES a `\renewcommand` it reads, so a second `\renewcommand{\headrulewidth}{0pt}` reached the .tex as `\renewcommand{0pt}{0pt}` and errored, taking the page style with it | The first page is a style of its own (`chfirst`), and `App.doc` emits `\thispagestyle{chfirst}` as the document's first block — the only thing that can reach page one. The headrule reset is emitted once |
| D-049 | 15 (REF-2) | minor | FIXED | The width model measured a control link by its SOURCE — `[AHG-001](#ctl-ahg-001)` is 23 characters written and seven printed — so every table carrying a mention had its proportions shifted by three times what the link costs. Separately, a row anchor was widening its own column, and pandoc reads a column's share of the page off the border row, so the page was re-proportioned to make room for a `\hypertarget` that is zero-width | Ems are measured on the printed form; the anchor's claim is met by scaling the whole table uniformly, as `layout` already did for source floors. Source width is still counted in full, which is what stops a link being cut (D-036). Measured: the Control coverage table's overfull box fell from 10.2pt to 6.0pt with the user's Lua filter |
| D-050 | 15 (TBL-1) | major | FIXED | The table title row was centred text above the table, not a merged row — the third attempt at it, and the first two were paragraphs dressed up as rows. A paragraph has to be given a width and a table's is not known until it is typeset | Pandoc DOES support a spanning cell: a grid-table row whose internal `\|` are omitted is read as one and written as `\multicolumn` (verified through `-t native` and a built page). The title is the first of two header rows now, so it is a real merged row, it takes the header shading, and nothing in the preamble has to know about it — all the macros are gone |
| D-051 | 15 (SEC-4) | major | FIXED | A section whose LEVEL already starts a page (the shipped profile does at H1) and which also had "Start this section on a new page" ticked emitted two breaks, and therefore a blank page between them. The per-level break reaches the page as titlesec's `\sectionbreak`, which App.doc cannot see | `App.docFormat.levelBreaks` states which levels break; App.doc suppresses the section's own break for those, and the designer greys the switch out and says which level is doing it |
| D-052 | 15 (PRV-4) | major | FIXED | The paged preview never broke at a per-level page break, so a document whose H1s each start a page showed as one continuous run of sheets. There is no `\newpage` in the markdown to find — the break is titlesec's | The profile's level breaks are handed to the preview, which marks those headings and paginates on them |
| D-053 | 15 (TBL-1) | major | FIXED | Once the title row became a real merged header row, the header row below it lost its shading. `\chTblHeadShade` works by redefining `\toprule`, which pandoc emits ONCE before the FIRST header row — so the one `\rowcolor` it can carry went to the title and left the column headings white | `\cellcolor` can be inside a cell and — measured — works from inside the minipage pandoc wraps a header cell in, so the headings row is coloured cell by cell (the mechanism the first column has used since TBS-1). `\chTblHeadRow` is the row-level equivalent for a writer that can reach a row start, and the Lua filter emits it. Only emitted when a title row has taken the row colour, so a table without one is byte-identical to before |
| D-054 | 15 (TBL-1) | minor | FIXED | The merged title row was about 4pt wider than the header row under it, so with both shaded the two bands did not line up. Its `\multicolumn` width was written as "the whole table", and the columns do not always add up to that — `fitscale` shrinks them when they would overflow, and the shares are rounded to four places besides | The Lua filter sums the covered columns' own shares and adds the furniture between them (two `\tabcolsep` and one `\arrayrulewidth` per join swallowed). Measured at 300dpi: both rows now span exactly 307..2172 |
| D-055 | 15 (HDR-1) | blocker | FIXED | A header reading `<---- Security classification` stopped the build: `Undefined control sequence` at `\<`. Header and footer slots were escaped with `App.md.text`, which escapes for MARKDOWN — but a slot reaches the page through `header-includes`, which pandoc passes to LaTeX VERBATIM. `\<`, `\>`, `\[`, `\|`, `\+` are ordinary markdown and are not commands LaTeX has; `\~`, `\^`, `\.`, `\=` are accents rather than characters. The two escapes overlap enough (`\%`, `\&`, `\#`, `\$`, `\_`) that the wrong one looked right until a character outside the overlap turned up | `App.md.latex` — a LaTeX escaper, one pass from a table because several replacements carry braces of their own. Used by the slots and by the classification banner, which are the only two data-derived strings that reach the preamble (audited). A placeholder in a slot is now filled on the RAW text before the profile is compiled, so its value is escaped once, for LaTeX, with the words around it — the document-wide pass would have escaped it for markdown and reintroduced the same fault |
| D-056 | 16 (TBL-2) | major | FIXED | Adding a title row to a table shrank it to under half the page and re-proportioned its columns. Pandoc reads a grid table's column fractions against **max(line length, `--columns`)**, not against the line, so a table drawn narrower than 72 characters lands on the page at that fraction of it — measured: a 32-character table came out as `\real{0.1389}` + `\real{0.1250}` + `\real{0.1667}`. A title row forces the grid form, which is what exposed it; the same fault was in every small grid table | Automatic grid widths are scaled to the same source budget an explicit set already uses, uniformly, so the ratios are untouched and only the `.md` gets wider. The preview had a matching bug — `parseGrid` filtered borders with `split('+').length > 2`, which the title's own join-less border satisfies, so it read that as the width row, got one segment and returned null: every table with a title row lost its widths on screen while keeping them on the page |
| D-057 | 16 (FNT-5/TBS-1) | minor | FIXED | "Style the first column" appeared to do nothing. It did reach the `.md`, the PDF and the preview — verified by building pages — but the shipped shade was `#F2F2F2`, under 5% away from white and invisible on paper at any sensible zoom, and the weight that went with it only reached the sections that had opted in. The Formatting pane is disabled for the built-in profile, so neither could be changed without duplicating it first | The shipped shade is `#E7E6E6`; the weight and slope moved to the Fonts table as a document-wide row beside the header row's, which is where FNT-4 had already put the header's for the same reason. A profile saved before this keeps the weight it asked for. **Lesson:** the report was "it does not work" and the code was right — what was wrong was that the result could not be seen. Two of the three readings that led here were mine, taken from 110dpi renders where a 5% grey is a rounding error |
| D-058 | 16 (REF-2/PRV-1) | minor | FIXED | The preview printed `[]{#ctl-ahg-001} AHG-001` in every row of the control-coverage table. The empty span is pandoc's anchor syntax — `\hypertarget`, zero width on the page — and the preview's inline pass had no rule for one, so it fell through to literal text. It is only ever seen inside a table CELL, where it is one line of several and never reaches the block walker that already consumes a standalone one | Rendered as what it is on the page: a zero-width `<span id>`, so the link still lands and the reader sees the control alone |
| D-059 | 16 (BR-1/D-037) | minor | FIXED | A line break at the END of a paragraph did nothing, so a spacer at the foot of a title page produced no space. D-037 had dropped trailing breaks because `\` with nothing after it is a literal backslash to pandoc — correct about the backslash, wrong about the remedy: it threw away the blank line the writer had asked for | The break is kept and given an empty line to land on: one non-breaking space, which pandoc writes as `~`. The preview then had to stop reading that line as blank — `String.trim()` strips U+00A0 and pandoc's blank-line rule is spaces and tabs — or the same literal backslash came back in the preview alone |
| D-060 | 16 (RTX-2) | minor | FIXED | A line break typed into a hand-authored table cell never appeared on the page. A grid cell's consecutive lines are folded into one paragraph by pandoc, so a break needs the same trailing backslash a paragraph's does, and `MD.cell` — which was all a cell went through — emits a bare separator | `App.md.richCell` writes a cell's break as `\` + the cell separator, the same hard break a paragraph gets. It is the same writer as a paragraph's, differing only in the escaping and the separator |
| D-061 | 16 (RTX-2/BR-1) | major | FIXED | A line break typed into a table cell drew no break in the preview and printed a literal `\`; a cell holding nothing but a break showed a lone backslash in an otherwise empty box. Found while fixing it, by building the page: the break did not work in the PDF either — through the repo's own Lua filter it ENDED THE ROW, so the rest of the table shifted one column left | The preview folds a cell's lines AFTER the inline pass, not before it, so the `\`+newline pair still exists when the break rule looks for it; the cell splitter stops treating U+00A0 as padding (D-059's rule, in the cell path). The filter writes a cell's `LineBreak` as `\newline\strut`, which is a `p{}` cell's own break — pandoc's `\\` is only legal inside the minipage the filter deliberately does not emit |
| D-064 | 17 (CLS-1) | minor | FIXED | The classification banner's tick was not saved: it lived in the per-run session block with the file name and the `/[Tag]` values, so it had to be re-ticked every time the tool was opened — and a document generated from a fresh session went out **unmarked**, which is the wrong way round for a switch that says how sensitive the contents are | Moved into the project's `report` bag beside `titleBlock`, on the same presence rule (off leaves no trace). One answer for all three documents that carry a banner — the report, the control report and the procedure — rather than three ticks that always had to agree |
| D-063 | 17 (SEC-4) | major | FIXED | "Leave this section out of the contents list" did nothing in the PDF — reported against a Title-level title block, true of every level. The heading carried pandoc's `.unlisted` alone, and pandoc only reads `unlisted` alongside `unnumbered`: measured on 3.1.11, `# X {.unlisted}` comes out as a plain `\section{X}`, which lists itself whatever the class said. The tool's own preview builds its contents list from the outline and honoured the flag, so the switch looked like it worked everywhere except the one place it matters | The pair, `.unnumbered .unlisted`. "Unnumbered" costs nothing here: `numbersections` is false for the whole document because App.doc writes every number into the heading TEXT, so the class changes only `\section` to `\section*` — which is what suppresses the `\addcontentsline`. Verified on a built page: the heading still reads "6 Approval", still starts its own page, still comes down its 70mm, still carries its `\label` for cross-references, and is not in the contents |
| D-062 | 17 (SPC-1) | minor | WONTFIX | "Line breaks are only ever showing up as one additional empty line" in the PDF. Correct, and not fixable where it was reported: pressing Enter repeatedly in a prose box leaves several newlines, and *every* run of two or more is one paragraph break in markdown — which the typesetter gives one fixed gap, whatever `\parskip` says. (Breaks written as `{{br}}` tokens do stack — five of them measure four blank lines on a built page — but a text box has no way to type one.) | Not made to stack: a blank line is a paragraph break and changing that would change every paragraph in the document. Answered instead by **SPC-1**, which makes empty space a measurement — a Space part, extra row height on a table, and space above a section's heading, all in millimetres |
| D-018 | 9 (FIL-1/FIL-2/CMF-1) | major | FIXED | Every "(none assigned)" / "(not set)" column filter returned an EMPTY table. The sentinel behind those options was `U+0000`, and the HTML parser rewrites a NUL in an `<option value>` to `U+FFFD` — so the value read back off the select never equalled the one the predicate compares against | Sentinel moved to a private-use codepoint that round-trips; one shared `FILTER_NONE` constant replaces six literals plus a stray raw-NUL fallback. Locked by FIL-3, which asserts through the rendered DOM |

<!-- Add rows above. Detailed notes below per defect. -->

---

## Detail notes

### D-064 — the classification banner was a per-run answer
- **Found:** user report — "the check state of the classification banner is not persistent in the
  save file."
- **It was session state on purpose, and the purpose was wrong.** It sat with the file name and the
  `/[Tag]` values, which genuinely are answers for one run (the point of a tag is that the same
  design issues a different document each time). The banner is not one of those: how sensitive a
  report's contents are is a property of the report, and a house that marks one marks all of them.
  So the switch was work with no decision in it — and worse, it defaulted OFF, so a document
  generated in a fresh session went out unmarked.
- **One answer, not three.** The report, the control report and the procedure each had their own
  session flag for the same banner. They are one project-level switch now (`report.classification`),
  read by whichever document is being built, so three ticks that always had to agree cannot
  disagree.
- **Locked by:** a CLS-1 test (project write, save/load round trip, off leaves no trace, and the
  session blocks no longer carry the field at all), the live-DOM pass, and a probe that ticks it in
  one place and finds every other copy of it ticked.

### D-063 — a section left out of the contents was listed anyway
- **Found:** user report — "the leave this section out of the contents list checkbox is not working
  for my Title level title block."
- **Not level-specific.** It had never worked at any level. The Title block is simply where it is
  impossible to miss: a cover page listed in its own contents.
- **The cause, measured rather than reasoned.** `pandoc -t latex` on `# X {.unlisted}` gives
  `\section{X}` — pandoc reads `unlisted` only in company with `unnumbered`, and a plain `\section`
  writes itself into the `.toc` whatever class it was given. The pair `{.unnumbered .unlisted}`
  gives `\section*{X}` with no `\addcontentsline`, which is the one thing that keeps it out.
- **Why the pair had been avoided,** and why that reasoning was wrong: the original comment said a
  section out of the contents "keeps its NUMBER, because it is still part of the sequence a reader
  is counting". True, and irrelevant to the class — `numbersections` is false for this whole
  document, because the numbering App.doc produces is not one LaTeX can express, so every number is
  already written into the heading *text*. `.unnumbered` therefore takes nothing away.
- **Why nobody noticed.** The preview builds its own contents list from the outline (TOC-1), and it
  honoured the flag correctly. So the switch worked everywhere it could be checked cheaply and
  failed in the only medium that ships.
- **Locked by:** the corrected SEC-4 test — which had asserted `.unlisted` *without* `.unnumbered`,
  and so encoded the defect — plus a new D-063 test for the Title level, and the reference document,
  whose Approval section is now `noToc` at a page-breaking level with a 70mm gap and a number.
- **Lesson:** a test written from the same misreading as the code confirms the misreading. What
  settles a question about pandoc is running pandoc — four lines and a second, and it was never run.

### D-062 — repeated line breaks make one blank line, and always will
- **Found:** user report — "it seems in the final PDF that line breaks are only ever showing up as
  one additional empty line."
- **Measured, both halves.** Written as `{{br}}` tokens, breaks *do* stack: five of them measure
  four blank lines on a built page (pandoc 3.1.11 + tectonic, checked directly rather than
  reasoned about). What does not stack is what a person can actually type — pressing Enter in a
  prose box leaves newlines, and `App.md.rich` splits on `/\n{2,}/`, so two newlines and six are
  the same paragraph break. LaTeX then gives that break one `\parskip`, whatever was asked for.
- **Not fixed, deliberately.** Making a run of blank lines stack would mean a blank line no longer
  reliably means a paragraph break, which is the one structural rule every prose box in the
  designer relies on. And it would still be the wrong tool: "about this much space" is not what a
  signature block needs.
- **Answered by SPC-1 instead** — space asked for in millimetres, in the three places it is wanted:
  a **Space** part between blocks, **extra row height** on a hand-written table (depth under each
  row's content, so a label stays at the top of the box), and **space above a section's heading**,
  which is the one gap no part can make.
- **Lesson:** the report was a measurement question wearing a formatting question's clothes. The
  fix for "I cannot get enough space" is a unit, not more of the same construct.

### D-061 — a line break in a table cell, in both mediums
- **Found:** user report — "we still aren't getting line breaks rendering properly in the preview,
  I'm sure they work in the PDF. I'm also getting backslashes showing up in empty boxes."
- **The preview, which is what was reported.** `cellHtml` folded a cell's lines into one with a
  space *before* the inline pass, because pandoc folds a cell's consecutive lines into one
  paragraph and the preview has to agree (D-025). But a cell's hard break is a trailing backslash
  and a newline (RTX-2/D-060) — fold first and the pair becomes `\` followed by a space, which no
  rule recognises. The break vanished and the backslash printed. The fold now happens *after* the
  inline pass, on the lines it did not claim.
- **The empty box, which is the same defect one layer down.** A trailing break lands on a
  non-breaking space (BR-1), and both `cells()` and `parseGrid` stripped it as padding — `\s` and
  `String.trim()` both take U+00A0, and pandoc's blank-line rule is spaces and tabs. With the
  spacer line dropped, the break's own backslash was the cell's last character with nothing to
  break onto: a lone `\` in an otherwise empty box. This is D-059 exactly, in the cell path its fix
  did not cover.
- **Found while verifying it, and worse:** the break did not work in the PDF either. Pandoc's own
  writer wraps a multi-line cell in a `minipage`, where its `\\` is a line break — but this repo's
  `pdfGenLuaConfig.lua` writes the cell inline instead (which is what lets a merged cell and a row
  colour work at all), and in a longtable row a bare `\\` **ends the row**. Measured on a built
  page: a cell reading `one\ two` put "one" in the cell, "two" in the first column of a *new* row,
  and shunted the rest of the table one column to the left. The filter now writes a `LineBreak`
  inside a cell as `\newline\strut` — the `p{}` cell's own break, which is what its paragraph join
  already used. The `\strut` is what makes two breaks in a row (a deliberately blank line, which is
  what a spacer at the foot of a cell is) legal rather than "there's no line here to end".
- **Locked by:** the D-061 suite (6 tests) for the preview halves, and a built page for the filter —
  the reference document still builds with no overfull box over 1pt.
- **Lesson:** the report was about the preview and the preview was the smaller half. Both the tool
  and the filter had made the same assumption about what a cell's line break is written as, and
  neither had ever been asked the question by a page.

### D-030 — a reference to a register section printed as its own token
- **Found:** user report — "putting a reference in just prints something like this on the same page
  in the PDF: `{{ref:ds:android.packages}}`".
- **Root cause:** one character. `App.md.TOKEN` matched `ref:[A-Za-z0-9:_-]+`, and a register
  section's block id is `ds:android.packages`. With no `.` in the class the token never matched, so
  it was never recognised as a token at all — it went through `text()` with the surrounding prose,
  where `{` and `}` are escaped to literal braces, and printed exactly as typed.
- **Why it read as intermittent:** every OTHER id in the document — `sec1`, `part3`, `control`,
  `guidelines`, `meta`, `toc` — is dot-free and worked. Only the register sections failed, and they
  are the ones most worth linking to.
- **Fixed alongside (the rest of REF-1), because the mechanism needed more than the character:**
  three readings per reference (`{{ref:}}` full / `{{refn:}}` number / `{{reft:}}` title), a
  wrapped form `{{ref:ID}}…{{/ref}}` that links a selection, paragraph-level anchors so a reference
  can name a paragraph rather than only its section, and the same Link button on a generated
  section's introduction (see D-031).
- **Verified:** the link reaches the `.md` as `[Section 3 — Packages](#sec-ds-android-packages)`
  beside a `{#sec-ds-android-packages}` heading attribute — pandoc's `\hyperlink`/`\hypertarget`
  pair, which is a live internal link in the PDF. Locked by the REF-1 suite.
- **Lesson:** the id charset and the ids themselves were written at different times by different
  features, and nothing asserted they agreed. A pattern that enumerates what an identifier may
  contain wants a test against a real identifier, not a plausible one.

### D-046/D-047/D-048 — what building the PDF found in ten minutes
- **Context:** the title row had been reported wrong twice, and both attempts at it were reasoned
  from the LaTeX rather than from a page, because this environment had no TeX. It turned out to
  have a network: pandoc 3.1.11 and tectonic 0.15 install as two binaries, and the user's own
  `pdfGenLuaConfig.lua` filter runs against them. Three defects fell out of the first build, two of
  which no amount of reading would have found.
- **D-046 — the title row.** A shaded band must be given a width. A longtable's final width is
  decided from its content when it is typeset, and is routinely narrower than the text block — so
  the band was wider than its table, and wider by a *different* amount for each of the three tables
  in a grouped register. Nothing in the preamble can know that number; it does not exist until the
  table has been laid out. A centred line has no width to get wrong, so that is what it is now.
  The preview was drawing a spanning `<tr>`, which is prettier and is not what the page does —
  D-025's rule — so it draws the same line.
- **D-047 — "Page 1of 7".** TeX consumes the space after a control word. Proven in isolation rather
  than assumed: one `\fancyfoot` with `Page \thepage of 7` and one with `Page {\thepage} of 7`, in
  the same document, render "Page 1of 7" and "Page 1 of 7".
- **D-048 — the different first page did nothing.** Two causes at once. Page one is not a `plain`
  page: with the automatic title block off there is no `\maketitle`, so nothing puts it on `plain`,
  and redefining `plain` (the first design) never reached it. And pandoc's `latex_macros` extension
  *applies* a `\renewcommand` it reads in the input — so the first
  `\renewcommand{\headrulewidth}{0pt}` defined `\headrulewidth` as the literal `0pt`, and the second
  copy of that same line arrived in the .tex as `\renewcommand{0pt}{0pt}`, which errors and took the
  whole page style down with it. The reset is emitted once, and page one gets a style of its own
  that the document body asks for by name.
- **Lesson:** the file has said since D-010 that an emitted artifact is not verified by inspecting
  the emitter's output, and this is the fourth time. The difference here is that the tooling was
  assumed to be unavailable and was not; ten minutes of checking would have paid for itself three
  reports ago.

### D-044 — one centred section centred the document, and stopped the page view
- **Found:** user report, two symptoms that read as unrelated — "if I center my custom title page, it
  centers everything in the whole document", and "the Pages preview stops as soon as there is a
  table that goes over the end of a page, I only see two pages".
- **One cause.** `App.md.centred` emits a pair of raw-LaTeX fences, which the preview folds back
  into pandoc's fenced-div form (`::: {.center}` … `:::`) so that one walker can handle them. That
  walker was not depth-aware. A paragraph centred inside a section that is itself centred emits
  nested `center` environments — which is exactly what a title page built with both ticks produces —
  so the walker closed the outer div on the INNER `:::`, and the outer `:::` was left standing as a
  line of its own. `/^:::/` matched it as an OPENING fence, and it consumed every remaining line in
  the document.
- **Why that stopped the paged preview too:** everything after the title page was inside one
  enormous `<div>`, and the paginator places top-level blocks. One block is one thing to place, and
  there is nothing to break between — so the document ended after the sheet that block started on.
- **Fix:** the walker counts depth, only `::: {` opens, and a closing fence with nothing open is
  dropped as the machinery it is. Separately, a part inside an already-centred section is no longer
  centred again — nested `center` environments contribute their vertical space twice, which on a
  title page is a visible gap.
- **Locked by:** D-044 (4 tests), including one that renders a nested pair directly and one that
  asserts the document is still many blocks — which is the property the page view depends on.
- **Lesson:** the two symptoms looked like a preview bug and a pagination bug. The pagination code
  was correct throughout; it was being handed one block. When a feature that walks a structure
  starts producing nested structures, the walker is the thing to re-read.

### D-036 — a hand-set column width cut a cross-reference through its own destination
- **Found:** user report — control links printing as `[AHG-002](#ctl-ahg- 002)` in the preview, and
  arriving in the PDF as text rather than as links.
- **Reproduced before changing anything**, which is what identified the condition: it needs
  hand-set column widths. With automatic widths the same table is fine, because the automatic path
  has honoured unbreakable runs since D-021 — `layout`'s `toChars` never returns a column narrower
  than its longest space-free token, and a link is one such token.
- **Root cause:** the EXPLICIT path (TW-2) has no floor at all. `widthsFor` converts the dragged
  fractions to character widths and `gridTable` wraps every cell to them unconditionally, so a
  column narrower than `[AHG-002](#ctl-ahg-002)` cut it wherever the arithmetic landed. Pandoc then
  rejoins a cell's lines with a SPACE, which puts one inside the destination — and a destination
  with a space in it is not a link, so the brackets print literally.
- **The same defect was latent for code spans.** A package name in a narrow key column would have
  been cut the same way, which is D-021 exactly, in the path its fix did not cover.
- **Fix:** one rule for both paths. `gridTable` scales the whole table up until every column can
  hold its longest atomic run — uniformly, so the fractions the operator dragged are preserved to
  within a character's rounding, and only the width of the `.md` changes. `safeCut` additionally
  refuses to land inside a link, which is belt and braces once the floor holds.
- **Locked by:** D-036 (4 tests), including one that walks every cut position through a link and
  one that asserts the dragged shares do not move when the table is widened.
- **Lesson:** a fix that says "a column is never narrower than something that cannot be broken"
  needs to be a property of the TABLE WRITER, not of one of the two things that computes widths.

### D-038 — a centred title was justified, and dragged a blank page with it
- **Found:** user report describing a custom title-block section: "the title appears to be spread
  across the entire line, not just centred but justified. It also added an entirely new, blank page
  before this section" — with the per-section page break switched off.
- **Root cause, both symptoms, one construct.** CTR-1 centred a heading by wrapping it in a `center`
  environment, and that does neither thing it appears to:
  - titlesec typesets a heading's text in a box of its own, and `\centering` set outside that box
    does not reach inside it. The paragraph inside the box is justified to the full measure, which
    is what "spread across the entire line" is.
  - `\begin{center}` contributes its `\topsep` glue at the point it is read, which is BEFORE
    `\section` runs and therefore before `\sectionbreak` fires. The shipped profile's Title level
    asks for a page break, so the glue landed on a page and `\clearpage` immediately ended it — a
    blank page, from a switch the operator never touched.
- **Fix:** `\centering` goes in the `\titleformat` FORMAT argument, where titlesec expects
  alignment, emitted as a per-level macro pair either side of the heading — the same shape TTL-3
  already used to give a title its own styling. No environment, so no stray glue and no box in the
  way. A title has its own `\chTitleStyleCentred`.
- **Found while fixing it (D-039):** a hand-authored section's centring never reached the document
  at all. It was applied where a GENERATED section's body is built, and a custom section's body is
  built somewhere else — so the switch worked in the per-section preview and nowhere else. A title
  page is always hand-authored, so this was the case that mattered.
- **Lesson:** the first version of CTR-1 was tested by asserting the markdown contained a `center`
  environment. It did. What no test asked was whether that environment does what centring means,
  which is a question only the page can answer.

### D-035 — a reserved word that is also an ordinary word
- **Found:** by the live-DOM pass, while checking that a different first-page header worked. The
  header was set to "Title page" and the sheet drew "Title 1".
- **Root cause:** the header/footer slots reserved the bare words `page` and `pages`, substituted
  per word. "Title page" is a perfectly ordinary thing to write in a header, and the substitution
  had no way to know it was not a request for the page number.
- **Fix:** the markers are `#page` and `#pages`, which are not prose. Because `#` is one of the
  characters the markdown escaper neutralises, the substitution had to move to BEFORE escaping —
  `slotParts` splits a slot into literal runs and markers, and is the single place both the LaTeX
  preamble and the preview read.
- **Lesson:** this is the third defect in this file found by driving the real UI rather than by
  reading the emitter's output (D-010, D-016, D-018 are the others). A render-only test would have
  asserted the substitution worked, because it does — the defect is that it works on text that did
  not ask for it.

### D-001 — wrong SHA-256 test vector for 'é'
- **Found:** Phase 0 self-test run. `util.hash` UTF-8 multibyte test failed.
- **Diagnosis:** The implementation output `4a99557e...` which Node's `crypto` confirms is the
  true SHA-256 of `'é'`. The fixture's expected value `8c6976e5...` was incorrect (it is in fact
  the SHA-256 of the string `"password"`). So the *test data* was defective, not the SHA-256 code.
- **Impact:** None on product; false-failing test only.
- **Fix:** Replace the expected vector with the verified digest of `'é'`.

### D-002 — tactical non-object root crashes rebuild
- **Found:** Phase 2 adversarial review of `flattenTactical`/`rebuildTacticalDoc`.
- **Failure scenario:** `tactical.parse('[1,2,3]')` (or `'"x"'`, `'5'`) yields a leaf with `key:''`.
  At generation, `rebuildTacticalDoc` calls `setAtPath(doc, parsePath('')=[] , value)`, which
  dereferences `segs[segs.length-1] === segs[-1] === undefined` → `segKey(undefined)` throws.
- **Impact:** A pathological capture file would crash generation instead of producing a located
  parse error — violates DOD-10 (never silently fail / always located errors).
- **Fix:** In `tactical.parse`, after JSON.parse, require the root to be a plain object; otherwise
  return a located parse error. Add a self-test.

### D-005 — settings parser incompatible with real capture format
- **Found:** User supplied real reference captures (`Reference Input Files/`). Running the actual
  `settings.txt` through the parser produced 806 errors.
- **Reality vs spec:** Spec §9 specified TAB-separated `namespace<TAB>key<TAB>value`. The real
  `adb shell settings list <ns>` capture is **sectioned**: a `<namespace>:` header line (`system:`,
  `secure:`, `global:`) begins a block, followed by `key=value` lines. Real keys also contain `#`
  (e.g. `add_info_com_samsung_android_app_routines#dashboard`); values contain spaces, `;`, `=`,
  `:`, `%`, `/`, etc.
- **Verification of the other two formats:** `packages.txt` parsed clean (438 items) and the tactical
  `policy-config…json` parsed clean (232 leaves, round-trip identical) with NO changes — only
  settings needed work.
- **Fix:**
  1. Rewrote `android.settings.parse` to the sectioned format: track current namespace from
     `^(system|secure|global)\s*:\s*$` headers; for `key=value` lines split on the FIRST `=`
     (value verbatim, may contain `=`/spaces/specials); error on a kv line before any section, a
     line that is neither header nor `key=value`, a malformed key, or a duplicate.
  2. Extended `SETTINGS_KEY_RE` to `[A-Za-z0-9._:#-]+` (adds `#`). `#` stays shell-safe as a
     mid-token character, so the "keys need no escaping, only values do" model still holds.
  3. Updated `captureHint`, platform `captureInstructions`, all settings fixtures, and the Phase-2/4
     tests to the new format; added tests for `#` keys, first-`=` split, spaced values,
     before-section error, and blank-line tolerance.
- **Validated end-to-end:** all three real files parse with 0 errors; onboarding a device from them
  succeeds; the resulting project passes schema validation with a stable serialize round-trip;
  generation of a `#` key + spaced + adversarial `a'b; rm -rf /` value is injection-safe.

### D-007 — test scaffolding registered a platform at load (active-platform leak)
- **Found:** Phase-5 mount smoke test reported `activeTab=selftest.a` — the wrong platform.
- **Root cause:** several embedded test-suite IIFEs called `App.registry.registerPlatform(...)` in
  the IIFE BODY (executed at page load), not inside test functions. The Phase-1 mock
  `selftest.platform` therefore registered on every load and, being the FIRST registration, became
  the active platform (`registerPlatform` makes the first one active). The real app would boot
  showing mock `selftest.a/b/c` tabs and list the mock in the platform dropdown.
- **Fix:** wrapped every test-suite platform registration in lazy `ensureST()` / `ensureAndroid()`
  helpers invoked INSIDE test bodies (via the sample/snap/deviceProject builders). Now nothing
  registers at load except the real `android-adb` in bootstrap. Verified by a boot simulation:
  registered=[android-adb], active=android-adb, activeTab=onboard.
- **Lesson:** embedded self-tests must be side-effect-free at module-load; only `suite()` registration
  may run at load.

### D-010 — verification helper polluted its own return value (state became `System.Object[]`)
- **Found:** running the generated `packages.verify.ps1` end-to-end under PowerShell 7.4.6 against
  a mock `adb`. The FIRST item printed `actual=System.Object[]` instead of a state name; every
  later item was correct.
- **Root cause:** `Get-PackageState` called `Initialize-PackageInventory`, which writes two
  progress lines with `Write-Output`. In PowerShell a nested function's success-stream output is
  collected by its caller, so `Get-PackageState` returned an array of
  `[<progress line>, <progress line>, 'absent']` rather than `'absent'`. Only the first call was
  affected because the initialiser is a no-op thereafter. It still *graded* correctly by pure
  accident: `$state -eq 'enabled'` against an array performs element filtering, not comparison, and
  the empty/non-empty result happened to steer each branch the right way.
- **Fix:** `Verify-Package` now calls `Initialize-PackageInventory` itself — its own output stream
  is consumed by nobody, so the progress lines flow to the transcript as intended.
  `Get-PackageState` became a pure lookup that throws if the inventory is not yet built.
  Locked by self-test VER-3, which asserts the call site by line-anchored match (the guard's throw
  message names the function inside a string and must not count as a call).
- **Lesson:** a generated-script change is not verified by generating it. This was invisible to the
  embedded suite — which only ever inspected the emitted text — and only surfaced by executing the
  artifact against a mock device. Emitters need an execution test, not just a string test.

### D-011 — `""` inside a JS double-quoted preamble line terminated the string
- **Found:** immediately after editing the preamble — the suite went from 431 pass to 108 pass /
  324 fail with `jsdomError: Uncaught [SyntaxError: Unexpected string]`.
- **Root cause:** a PowerShell line needing an escaped quote was written as a JS double-quoted
  string containing `""`, which closed the JS string early.
- **Fix:** rewrote the line to use a PowerShell double-quoted string with `$action` interpolation,
  inside a JS single-quoted string. **Lesson:** the preamble is PowerShell nested in JavaScript
  nested in HTML; pick the JS quote style that does not collide with the PowerShell quoting on
  that line, and run the suite after every preamble edit — a syntax error there takes out the
  whole app, not just the generator.

### D-012 — implementation script reported success after a totally failed run
- **Found:** running the generated `packages.impl.ps1` against a mock `adb` in which every command
  fails. Output was two lines of error text; **exit code 0**.
- **Root cause:** no failure detection at all. `$ErrorActionPreference = "Stop"` governs cmdlet
  errors and does **not** trap a native command's non-zero exit, so every failed `pm` call was
  ignored. Compounding it, adb does not reliably propagate the remote exit code on older hosts, so
  even an explicit `$LASTEXITCODE` check alone would have missed failures that only announce
  themselves as `Failure [...]` on stdout.
- **Impact:** on a real hardening run, "it completed" and "it did nothing" were indistinguishable.
  Nothing downstream would have caught it either — the report describes decisions, not outcomes.
- **Fix:** `Invoke-AdbPm` checks exit code **and** output text; results are graded against a
  post-run state re-read, so a command that prints `Success` and changes nothing is still FAILED;
  the run exits 1 if any item failed. Locked by IMPL-3.
- **Lesson:** in generated PowerShell, native-command success must be asserted explicitly. Assume
  neither the exit code nor `$ErrorActionPreference` will do it for you.

### D-013 — implementation script claimed idempotency it did not have
- **Found:** reading the emitted artifact alongside the preamble.
- **Root cause:** the emitted header stated `# Idempotent: each action guards on current package
  state.` while every guard called `Test-PackagePresent`, a placeholder that returned `$true`
  unconditionally. The claim was printed into an artifact operators read as evidence of behaviour.
- **Fix:** the placeholder is deleted. `Apply-Package` reads real device state, so an item already
  in its decided state issues no command — idempotency is now a genuine skip. Proven by re-running
  the script against a stateful mock: changes attempted fell 7 → 3. Locked by IMPL-1, which fails
  if either the stub or the old header line returns.
- **Lesson:** a generated artifact must not assert a property the generator has not implemented.
  A stub is acceptable; a stub plus a claim is a false record.

### D-014 — implementation could not converge a device (`keep` was one-directional)
- **Found:** tracing what the new verification would do with a `keep` item found disabled — it
  reports FAIL, and nothing in the tool could fix it.
- **Root cause:** `keep` emitted a comment only, and no `pm enable` / `install-existing` existed
  anywhere in the codebase. Implementation could strip a device but never restore it, so any
  divergence from a `keep` decision was permanent as far as the tool was concerned.
- **Fix (approved behaviour change; spec §10.1 and Appendix B updated):** a disabled `keep` package
  is re-enabled; one uninstalled for user 0 is restored with `pm install-existing` and then enabled,
  because install-existing can return it disabled. A `keep` package absent from the firmware build
  cannot be restored and is reported MISSING with that reason. Locked by IMPL-2.
- **Note:** the converse — a device found *more* restricted than decided — is deliberately NOT
  acted on. It is reported as REVIEW, since restoring it would exceed the decision the reviewer made.

### D-015 — a hand-assigned item lost its decision status on the device it was assigned to
- **Found:** user report. A set of Tactical decisions made against one device was assigned to a
  second device by hand (DEV-1); the Devices tab then listed those items as undecided — and the
  device as not ready — while the Tactical tab showed the very same items decided.
- **Root cause:** the decision itself was never in doubt. What differed was the **value format**.
  VF-2 infers an item's format from the *captured leaf type*, and there were two independent
  implementations of "the captured values for this dataset":
  - `ui.tables.buildCapturedMap` merged the captures of every latest device — so the data tab saw
    `wifiOn` as `bool` and the boolean decision validated.
  - `completeness.deviceReadiness` read **only that device's own snapshot**. A hand-assigned key is
    by definition absent from it, so there was no captured type, `inferId(undefined)` fell back to
    `string`, and `validate` rejected a perfectly good `true` with "Value must be text." The item
    was therefore incomplete, and the device not ready.

  It bit exactly the non-text values — booleans, numbers, lists — which is most of a Knox capture.
  A hand-assigned *text* item behaved fine, which is why it read as arbitrary.
- **Fix:** one implementation, `App.registry.capturedDefaults(project, dsId, preferDeviceId)`,
  living beside the applicability choke point it belongs with. It merges the fleet's latest
  captures, putting the named device's own capture first — where a device did report a key, its own
  evidence remains the authority on that key's type; the rest of the fleet only fills the gaps.
  `deviceReadiness`, `ui.tables.buildCapturedMap` and the Devices-tab format resolver all delegate
  to it, so the two tabs can no longer reach different verdicts from different evidence.
- **Verified:** locked by the D-015 suite (6 tests), including the readiness assertion that fails
  against the pre-fix code, and an end-to-end check that the assigned key is actually written into
  the second device's generated `tactical.json` — the artifact, not just the badge.
- **Lesson:** a register item is fleet-wide, so anything derived from it must be too. The duplicate
  merge was the defect; the second copy was written for the table long before DEV-1 made it possible
  for an item to apply to a device that never captured it.

### D-016 — a single un-uninstallable package ended the whole run
- **Found:** user report, running a real `packages.impl.ps1` against a device. The run proceeded
  correctly until it reached a package `pm uninstall` refused, then stopped dead on that line.
  Every package after it was never applied, no summary printed, and the transcript ended mid-run.
- **Root cause:** `Invoke-AdbPm` runs `pm` as a native command and grades the result itself. That
  grading is only reachable if the native call returns. Under a host that escalates a native
  failure to a **terminating** error, and with no `try`/`catch` anywhere in the emitted script, the
  call threw instead — so the `$ok` computation that exists precisely to turn a failed `pm` into a
  recorded FAILED row was unreachable on exactly the failures it was written for.
- **Which hosts escalate — measured, not assumed:**
  - **Windows PowerShell 5.1** folds each redirected (`2>&1`) stderr line from a native command into
    an ErrorRecord, which `$ErrorActionPreference = "Stop"` makes terminating (`NativeCommandError`).
    This is the likely environment for the report: the script's own `runInstructions` tells the
    operator to launch it with `powershell -ExecutionPolicy Bypass -File`, which is 5.1 on Windows.
    **Not verified directly** — 5.1 is Windows-only and the dev box is Linux.
  - **PowerShell 7.3+** does *not* do the 5.1 stderr-folding, but has a separate escalation:
    `$PSNativeCommandUseErrorActionPreference`. With it on, a non-zero native exit throws
    `ProgramExitedWithNonZeroCode`.
  - **PowerShell 7.4.6 defaults do neither** — confirmed by running the pre-fix script end to end
    against a mock adb: it completed and graded correctly. An initial attempt to reproduce on 7.4.6
    defaults therefore failed, and the first written diagnosis (that `2>&1` + `Stop` is terminating
    in PowerShell generally) was **wrong as stated** — it is 5.1-specific.
- **Impact:** blocker. The hardening run was **partial and silent about it**: the packages after the
  stubborn one were left untouched with no record that they had been skipped. Worse than D-012's
  false all-clear, because the operator sees an error and may reasonably read it as "that one
  package failed" rather than "the run stopped".
- **Relationship to D-012:** this is D-012's fix biting back. D-012 added the stderr capture to make
  native failures visible; the redirect it introduced is what made a subset of them fatal. The two
  requirements — *see* the failure and *survive* it — needed the preference handled as well.
- **Fix:** `Invoke-AdbPm` now saves `$ErrorActionPreference`, sets it to `Continue` for the duration
  of the native call, wraps the call in `try`/`catch`, and restores in `finally` so a throw cannot
  leave the rest of the run relaxed. A caught throw records `Code = 1` and the exception message as
  the reason, so it grades as a failure like any other. `$PSNativeCommandUseErrorActionPreference =
  $false` is set in the preamble, since PowerShell 7.3+ can independently escalate a native non-zero
  exit to terminating. `$ok` is computed after the guard, so caught and returned failures grade
  identically.
- **Locked by:** the D-016 suite (6 tests), asserting the emitted PowerShell's shape — notably that
  the relaxation precedes the redirect and that the restore is in `finally`. Four of the six fail
  against the pre-fix preamble.
- **Verified by execution**, under real PowerShell 7.4.6 against a mock `adb` (fixture: 7 packages
  covering keep/disable/remove, one package whose uninstall is refused, one whose uninstall *and*
  disable are both refused, and a package sorted last to prove the run continued):
  - pre-fix + escalation forced on → **dies before any summary**, the last package never reached
    and left untouched. The reported failure, reproduced.
  - fixed + the same escalation forced on before the preamble → completes, last package removed,
    the refused one graded PARTIAL. The preamble's pin wins over a hostile environment.
  - the guarded `Invoke-AdbPm` probed directly under forced escalation → returns `Ok=False`,
    `Code=1`, the correct reason text; the next call still runs; `$ErrorActionPreference` is back to
    `Stop` afterwards. So the `try`/`catch` holds even if the pin is defeated.
- **Fixed alongside, at user request:** a refused uninstall now falls back to `pm disable-user` and
  is recorded **PARTIAL** — counted separately, printed with both the uninstall refusal and the
  disable outcome, and it still exits 1. It is deliberately *not* a success: the register says
  remove and the package is not removed, and reporting it as met would be the D-013 failure mode.
  Also added: `$RestoreRemoved` / `$RestoreDisabled` reverse switches (see PARTIAL-1 / REV-1).
- **Lesson:** D-010's lesson again, one level up — a generated-script change is not verified by
  generating it. Every emitted-PowerShell defect so far (D-010, D-012, D-013, D-016) was invisible
  to a suite that only inspects the emitted text, and surfaced only on execution. The suite can lock
  a fix's *shape* once known, but it cannot find the next one of these. An execution harness against
  a mock `adb` — which found D-010 and D-012 — is the control that matters, and it needs a
  failing-`pm` fixture, not just a wrong-state one.

### D-017 — the verification script carried the whole implementation half
- **Found:** user report, reading the generated `packages.verify.ps1` and asking why a read-only
  script contained `pm uninstall`, `pm disable-user` and `pm enable`.
- **Diagnosis:** it was genuinely inert. `scriptPreamble` was shared by both commands and had no
  idea which one it was wrapping, so every script got every function. `Apply-Package` was *defined*
  in the verify file but had zero call sites; the two summaries each self-suppressed on an empty
  result list. Proven by execution: running the pre-fix verify script against a mock device left the
  state SHA-256 byte-identical and issued no mutating command.
- **Why it was still a defect:** the artifact could not be assessed by reading it. A reviewer had to
  trace call sites to establish that a script named "verification" could not change a device — and
  the user, reasonably, did not assume it. A security artifact should make that property structural,
  not something you verify by argument. Related in spirit to D-013: an artifact must not carry
  something that misrepresents what it does.
- **Aggravated by the D-016 work (self-inflicted):** the REVERSE (ROLLBACK) SWITCHES block was added
  to the shared preamble, so it also appeared in verification scripts — offering
  `# $RestoreRemoved = $true   # <-- UNCOMMENT THIS LINE` in a script where uncommenting it does
  precisely nothing. A lever that looks live and is inert is worse than no lever, and worse than the
  dead code it sat next to.
- **Fix:** `ctxFor` now carries `command`, and `scriptPreamble`/`scriptPostamble` assemble per
  command from five segments — `head`, `switches` (impl), `common`, `verifyHalf`, `implHalf`, plus a
  `tail` whose restore banner is impl-only. The postamble calls only that command's summary instead
  of calling both and relying on self-suppression. An absent `ctx.command` falls back to the
  implementation superset, so a profile that ignores the new field is never silently stripped
  (DOD-11 holds; asserted).
- **Effect:** `packages.verify.ps1` fell from 455 to 199 lines and contains no `pm` verb that can
  change anything; `packages.impl.ps1` fell from 467 to 396, having shed `Verify-Package` and
  `Write-VerificationSummary`.
- **Locked by:** VER-5 (6 tests) asserting the mutating verbs, the apply functions and the switches
  are *absent* rather than uncalled, that each script keeps what it needs, and the DOD-11 fallback.
  VER-4 and the VER-2 postamble assertion were rewritten — they encoded the old
  both-summaries-self-suppress design, which no longer exists.
- **Verified by execution:** the slimmed verify script run against a mock device — state SHA-256
  unchanged, three genuine FAILs, exit 1, and zero occurrences of `IMPLEMENTATION SUMMARY`. The full
  implementation harness (D-016 reproduction, PARTIAL fallback, reverse switches) still passes
  unchanged after the split.
- **Lesson:** "it is never called" is an argument about behaviour; "it is not in the file" is a
  property of the artifact. For anything an operator will read as evidence, prefer the second.

### D-028 — the table font size appeared to skip the package names
- **Found:** user report, straight after FNT-1 shipped.
- **Measured before changing anything, and the PDF was already right.** The font spans pulled out of
  the built PDF show a package name in a 9pt table body at `LMMono9-Regular` **8.97pt** — the same
  size as the `LMRoman9-Regular` prose beside it. `\texttt` changes the family and keeps the size, so
  the row-font machinery reaches an identifier like anything else. Monospace reads larger than a
  serif at the same nominal size; that is the typeface, not a defect.
- **The preview was the thing being looked at, and it was wrong.** `.rd-preview-doc code` carries
  `font-size: 12px` — correct for a themed panel, wrong for a page. Every code span therefore stayed
  at 12px while everything around it followed the profile, which is precisely what "the size is not
  applying to the package names" looks like.
- **Fix:** `.rd-paper code` inherits, so a code span takes the size of its container — the table
  body, the header row, or the document — which is what `\texttt` does on the page.
- **Found while checking it:** the preview drew captions at 0.92x the document size, a number
  invented when the page-shaped preview was first built. A caption is emitted before the table's
  first rule, so the row-font machinery has not started when it is set: measured at 10.91pt in an
  11pt document beside a 9pt table. Corrected to the document size.
- **Lesson:** the report said "the size is not applying" and the size was applying. Measuring the
  artifact first is what turned a font-mechanism hunt into a two-line stylesheet fix.

### D-027 — pandoc gave a wide pipe table seven equal columns
- **Found:** adding per-table font sizes (FNT-1). With the header row at 12pt some headings
  overflowed again — but only in some tables, which is what made it worth chasing rather than
  tuning.
- **Two causes, one symptom.**
  1. The width model measured every table at the document size. A header a point larger needs a
     ninth more room than it was allocated, so it overflowed by exactly the ratio it was enlarged by.
  2. The table that overflowed worst had never been the model's to size at all. **Past pandoc's
     `--columns` default of 72, a pipe table's widths stop being LaTeX's business and become
     pandoc's, and it derives them from the SEPARATOR row** — `| --- | --- |` means an equal share
     for every column regardless of content. A seven-column register table therefore came out as
     seven `\real{0.1429}` columns, each too narrow for its own heading. Measured on 3.1.11 with an
     83-character pipe table, not inferred.
- **Why it had been invisible:** the same tables had been producing the 0.1111pt "Overfull \hbox in
  alignment" warnings since v2.2, which had been written off as longtable rounding. They were the
  equal-width pipe tables all along.
- **Fix:** the grid form now takes over at 72 source columns rather than at the page budget, so a
  table pandoc would re-width is one this module has already sized; and `App.docFormat.tableMetrics`
  hands App.md the page in ems and each table font size relative to the document's, threaded through
  `tableOpts`/`renderPart` — passed rather than read, since App.md has no business knowing which
  profile is in force.
- **Result:** the reference document now builds with **zero** overfull boxes, the 0.1111pt ones
  included.
- **Locked by:** AUTO-1 ("the pipe form is abandoned at pandoc's --columns limit, not at the page")
  and FNT-1 ("a bigger header font is paid for in the width model").
- **Lesson:** a warning dismissed as noise for three months was a real defect the whole time. It was
  only worth re-reading once something else made the same tables fail differently.

### D-026 — a run with no space in it could not wrap, in either medium
- **Found:** user report, after D-024 — "those unbreakable words are a problem, they still aren't
  wrapping, can we make them just regular text so they can wrap?"
- **Established first, because the answer decided the fix:** they cannot wrap as regular text. TeX
  hyphenates letter sequences and `io.sdsasolutions.tacticalsettings` is not one; `\raggedright` puts
  a word that does not fit on the line regardless, past the column edge; and a zero-width space is
  **not** a break opportunity in XeTeX — measured with a `\parbox` with one and one without, which
  overflow identically. Every mechanism that breaks such a run has to be asked for in the markup.
- **Two symptoms, one cause.** The visible one was the run overflowing. The second was that an
  unmarked run is an unbreakable word and therefore a HARD floor — its column must be wide enough to
  hold it whole. Several together exceed the page, every floor is then cut in proportion, and the one
  column that genuinely cannot wrap (a one-word heading) is cut with them. So the marking fixed the
  starvation as well as the wrapping.
- **Fix:** a space-free run of 18 characters or more, shaped like an identifier (a `. _ - /` or a
  camelCase hump), is emitted from `App.md.cell` as a code span — which reaches LaTeX as `\texttt`
  and so through the `\seqsplit` hook the profile has installed since v2.2. Chosen over a raw
  `\seqsplit{}` span specifically because a code span is verbatim and needs no second escaping path;
  this file's defect history is mostly escaping, and adding a LaTeX-only escaper for a cosmetic gain
  was the wrong trade. The cost is monospace, which for an identifier is correct typography.
- **The same defect in the browser:** a fixed-layout table with a colgroup does not wrap a long word,
  it lets it leave the cell. Preview and editor cells gained `overflow-wrap: anywhere`.
- **Locked by:** BRK-1 (8 tests), including that the surrounding text is still escaped exactly once,
  that ordinary prose is untouched, that a backtick inside the run cannot break out of the span, and
  that marking a run measurably returns page width to a column that cannot break.

### D-024 — unbreakable words overflowed into the next column
- **Found:** user report — "the text wrapping is a bit off, it goes into the next column a bit before
  wrapping around". Confirmed in the TeX log: `Overfull \hbox (4.59pt too wide)` on the bold heading
  `Description`, in the register tables.
- **Root cause:** a column was allocated a share of the page proportional to its CHARACTER count and
  then spent that share in POINTS. A character is not a fixed number of points — `i` is a third the
  width of `m`, `\texttt` is 0.53em flat, bold is 15% more than regular. A register table puts one
  monospace key column beside four of prose, which drags the points-per-character rate down for
  everyone; prose absorbs that by wrapping, and a single unbreakable word cannot.
- **Measured, not assumed:** `\savebox`/`\the\wd` over representative strings in Latin Modern at
  11pt. Bold `Description` is 63.36pt where the column had 57.9pt. The first attempt at the model
  guessed bold at 1.06 and monospace at 0.6 and made the overflow *worse* (7.8pt) — which is what
  prompted measuring rather than tuning.
- **Two wrong turns worth recording**, both left as comments where they were made:
  1. Excluding code spans from the floor (they can `\seqsplit` on the page) starved the key column
     to 7% and stacked identifiers six characters to a line.
  2. Taking the larger of the source floor and the page floor per column let the SOURCE floor decide
     the page FRACTION — giving the key column a third of the page, which was the original squeeze.
- **Fix:** ems decide the proportions; three tiers of claim (hard floor, soft floor, appetite) are
  settled in order; and the whole table is scaled up uniformly until the widest source floor fits, so
  the source and page floors both hold without either distorting the other. Locked by AUTO-2.
- **Result:** every genuine overfull box in the reference document is gone; only the four 0.1111pt
  longtable rounding artifacts remain. The widest `.md` line fell from 365 characters to 196.
- **Lesson:** when a model converts between two currencies, the exchange rate is a measurement, not a
  constant to be tuned until the symptom goes away.

### D-025 — three things the preview showed that the page does not
- **Found:** user report, all three in one pass.
- **The outline rail printed the escaping** (`Firmware \& build`). It is written into the rail as
  text and HTML-escaped there, never parsed as markdown, so the markdown escaping had nothing to
  undo it. Fixed with `mdPreview.unescapeMd`, used for text destinations only — the heading itself
  still goes through `inline()`.
- **Every firewall rule in a cell ran together.** A grid-table cell is a run of PARAGRAPHS: pandoc
  folds consecutive lines into one and a blank line starts a new one. `parseGrid` dropped every blank
  line as padding (only the trailing ones are padding) and the renderer emitted the lines verbatim,
  so the separation HUM-1 had deliberately encoded was thrown away twice over. The PDF was correct
  throughout; only the preview was wrong.
- **An unstyled header was painted dark.** The page inherited `.rd-preview-doc .prv-table th`, whose
  `--c-surface-alt` is a near-black in dark mode — a black header on a white sheet, and an unstyled
  table that looked shaded. The page now states its own table background and the profile's shade rule
  follows it; the static stand-in colours are gone, so no shade in the profile means no shade in the
  preview.
- **Locked by:** PRV-3 (7 tests), including one that asserts the shade rule is emitted *after* the
  background reset — order is load-bearing at equal specificity.

### D-023 — the section preview showed the name where the page shows the heading
- **Found:** user report. Setting a section NAME (for the designer's list) changed what the Section
  pane's preview printed as the heading; the full-document preview kept printing the heading.
- **Root cause:** `sectionPreview` built its heading with
  `headingFor(Object.assign({}, resolved, { title: block.label }))`. That override predates NAM-1,
  when a block's label WAS its heading and the assignment was a no-op. NAM-1 made `label` the name
  and `title` the heading, and the line quietly started substituting one for the other.
- **Impact:** a preview of a page, showing a string that will not be on the page. Contained to the
  Section pane — `App.doc.render` never used that path — which is why the two previews disagreed.
- **Fix:** the override is gone; `resolved` already carries the heading. Locked by NAM-2/CCOL-2
  ("the section preview shows the HEADING, not the list name").
- **Lesson:** an assignment that is a no-op today is a silent assumption about tomorrow. When a field
  splits in two, the no-ops are where the old meaning is still written down.

### D-021 — the automatic wrap cut a register key in half
- **Found:** reading the rendered PDF after AUTO-1 made the automatic width path wrap. The Tactical
  table's first row read `**appInstallWhitelist` with literal asterisks, in two pieces.
- **Root cause:** the width floor was computed from the longest *plain* word, discounting code spans
  on the reasoning that `\seqsplit` breaks a `\texttt` on the page anyway. True of the page, false
  of the source: the break happens in the MARKDOWN, and half a fence is not a fence. Pandoc rejoins a
  cell's lines with a space, so `` `appInstall `` + `` Whitelist` `` becomes one code span with a
  space through the middle of the package name, and the `**` around it no longer parses as emphasis.
- **Impact:** every register table, on the first build after the change. A wrong package name in a
  hardening report is exactly the class of error D-013 is about — an artifact that misrepresents.
- **Fix:** the floor is the whole space-free token, markup included, so a column is never narrower
  than something that cannot be broken; the budget grows to hold the floors rather than the floors
  being cut to fit it. `safeCut` additionally refuses to land between the two asterisks of `**`,
  which would leave a lone `*` on each line. Locked by AUTO-1 ("an unbreakable token is never cut in
  half", "the wrapper never leaves a lone asterisk on a line").
- **Lesson:** the seqsplit hook made the identifier breakable in the OUTPUT, and it was tempting to
  spend that in the SOURCE. Two different documents, two different sets of rules.

### D-022 — the Control coverage table was mashed, and overflowed the page
- **Found:** user report against the preview — first columns crushed left, last crushed right, the
  Items column taking the whole table, while the register tables looked right.
- **Two causes, both real:**
  1. Automatic widths were "each column as wide as its widest line", and pandoc reads those source
     widths as PROPORTIONS. The Items cell lists every package satisfying a control, so it claimed
     nearly the whole width and left the other three a few characters each. The register tables
     escaped it only because their long column happened to be near the middle of the range.
  2. The table was in the PIPE form, which becomes a LaTeX `tabular` of `l` columns. Those do not
     wrap, so the long justification ran off the right of the page in the PDF as well — the preview
     was showing a real defect, not a preview defect.
- **Fix:** automatic now lays a too-wide table out — floors first (longest unbreakable word, plus a
  safety margin on the heading, which is the one thing that cannot absorb being squeezed), then the
  slack shared by appetite. A table that fits is untouched, byte for byte. And the grid form is now
  chosen whenever a table is wider than the budget, not only when a cell holds a line break, so its
  cells can wrap at all. Locked by AUTO-1 (7 tests).
- **Also, at the same request:** widths can now be set by hand on generated tables (TW-2), which is
  the reliable answer when a table has to be exact — the automatic rule is a rule of thumb and is
  documented as one.

### D-019 — a captioned table printed its number twice
- **Found:** rendering a generated document to PDF while building CAP-1, before adding automatic
  captions to anything else.
- **Root cause:** pandoc's LaTeX writer emits a caption as `\caption{...}`, and LaTeX's longtable
  prefixes it with `Table N: ` from its own counter. `App.doc.renderPart` had also been writing
  `Table ' + meta.number + ' — ' + caption` into the caption text, on the same reasoning that governs
  section numbering here (App.doc writes the numbers so a cross-reference can name one that exists).
  For *sections* that is right — `numbersections` is off, so LaTeX writes none. For *tables* it is
  not: there is no equivalent switch in play and LaTeX numbers them regardless.
- **Impact:** cosmetic but embarrassing in a signed report, and present in every captioned table since
  v2.2. Invisible to the suite, which asserted the markdown contained `: Table 3 — Ports` — which it
  did, correctly, for the design as written.
- **Fix:** the caption is the text alone. `App.doc.tableIndex` keeps numbering, but only to build the
  LABEL a cross-reference shows; the two agree because every table is now captioned (CAP-1) and both
  count them in emitted order. An uncaptioned table is therefore not allowed: one would advance
  LaTeX's counter without advancing ours and every later reference would be off by one.
- **Lesson:** the same one as D-010/D-016 in a new medium — an emitted artifact is not verified by
  inspecting the emitter's output. This needed a rendered page.

### D-020 — an aligned grid table lost every one of its body rows
- **Found:** looking at the first PDF built from a table with dragged column widths (TW-1). The table
  rendered as a shaded header row with nothing underneath it.
- **Root cause:** `gridTable`'s border writer was `if (ch === '=' || align[i])`, so a column with an
  alignment put its `:` marker on the `-` borders as well as on the `+===+` header separator.
  Pandoc 3.1.11 accepts alignment markers **only** on the header separator; a `-` border carrying one
  makes it stop reading the block as a table's body. It does not warn — it drops the rows.
- **Measured, not assumed:** two identical two-row grid tables through `pandoc -t native`, one with
  colons on every border and one with colons on the header separator alone. The first yields zero
  body cells, the second yields them all.
- **Latency:** present since v2.2, but unreachable in practice — it needed a table that was both
  aligned *and* in grid form, and grid form was only chosen when a cell was multi-line. TW-1 routes
  every width-bearing table to the grid form, so every such table hit it at once.
- **The mirror image, in the preview:** `App.ui.mdPreview` matched a grid table with `/^\+[-=+]/`,
  which an aligned border (`+:---`) does not satisfy. So an aligned grid table was shown as prose —
  the preview and the PDF were wrong about the same table in two different directions.
- **Fix:** markers on the header separator only; the preview's three border patterns widened to
  accept `+:`. Locked by TW-1 ("alignment markers stay on the header separator alone", "an ALIGNED
  grid table is still read as a table by the preview") and by the end-to-end grid-alignment check.
- **Lesson:** D-010's again. The markdown looked right, the self-tests passed on it, and the table was
  empty. What found it was rendering the page and looking at it.

### D-018 — every "(none)" column filter returned an empty table
- **Found:** user report. Filtering Tactical by Control Refs -> "(none assigned)" to find actions
  with no control mapped returned nothing, on a register known to contain plenty.
- **Root cause:** the sentinel carried by every "(none)" / "(not set)" option was `U+0000`.
  It was chosen to be impossible to collide with a real control id, relevance option or decision
  value — which it is. But it also has to survive being written into an `<option value="...">` and
  read back off the DOM, and it does not: **the HTML tokenizer rewrites `U+0000` to
  `U+FFFD`**. So the option carried the replacement character, the change handler stored
  that in `ui.colFilters`, and `colFilterPredicate` compared it against the NUL sentinel, failed,
  and fell through to the "must equal this control id" branch — which no row satisfies. Every row
  was rejected.
- **Measured, not assumed:** a jsdom probe wrote each candidate sentinel into an `<option value>`
  and read it back. `U+0000` became `U+FFFD` (broken); a private-use codepoint
  (U+E000), U+0001 and a plain ASCII token all round-tripped unchanged.
- **Scope:** all three "(none)"-shaped filters — Action "(not set)", Security Relevance "(not set)",
  Control Refs "(none assigned)" — in every data table, plus the Control Manager's copy (CMF-1),
  whose fallback held a **raw NUL byte** in the source.
- **Fix:** one `FILTER_NONE` constant in `App.ui.model`, built as `String.fromCharCode(0xE000)` so
  the character never appears literally in the file, replacing six literals and the raw-NUL
  fallback. A private-use codepoint keeps the original impossible-to-collide property (no real
  identifier contains one) while being parse-stable.
- **Why the suite missed it:** FIL-1 and CMF-1 tested the predicate by handing it
  `App.ui.model.FILTER_NONE` directly in JavaScript. Both sides of that comparison were the same
  constant, so it could never fail. The defect lived entirely in the layer the tests skipped — the
  round trip through rendered HTML.
- **Locked by:** FIL-3 (6 tests) which renders the real table HTML, parses it with the real HTML
  parser, reads the option value off the `<select>`, and feeds *that* to `filterSortRows` — plus a
  guard that the sentinel contains neither a NUL nor a replacement character, and one that no raw
  NUL is left in the source. Four of the six fail against the pre-fix sentinel.
- **Lesson:** the same shape as D-010 and D-016. A test that constructs the input it is about to
  assert on cannot find an encoding bug; the input has to come from where the real input comes from.
  Three defects now have had "the test never crossed the boundary the bug lives on" as their cause.
