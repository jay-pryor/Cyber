# Extracting the document designer and generator as a reusable module

**Date:** 2026-09-08
**Status:** Design approved; implementation plan not yet written
**Scope:** Extract the document design + generation stack out of the CH Config Tool
into a reusable module with a defined contract for how a host application supplies
its information.

---

## 1. Motivation

The CH Config Tool contains a complete document designer and generator: heading
levels and auto-numbering, cross-references, formatting profiles, hand-authored
sections, table styling and column widths, templates, a rich-text editor and a
paginated live preview. None of that is specific to cyber-hardening, but all of it
is currently reachable only from inside CH.

The goal is to lift the designer and the generator out **as a single unit**, and to
define one contract describing how a host application feeds its own information in.
The nature of future host applications is deliberately unknown, so the contract is
designed to be broad, and CH becomes its first consumer rather than its only one.

---

## 2. What the code actually looks like today

An analysis of real code-level dependencies (comments stripped, so documentation
references to other modules are excluded) established the following.

### 2.1 The rendering engine is already clean

| Module | Code lines | Depends on |
|---|---|---|
| `App.md` | 826 | nothing |
| `App.docFormat` | 808 | `App.md` |
| `App.doc` | 409 | `App.md` |
| `App.report` | 138 | `App.md` |

A strict DAG rooted at `App.md`, with **no browser globals** — no `document`,
`window`, `Date.now`, `Math.random`, `fetch`. The engine already runs outside a
browser, which the existing headless self-test runner confirms.

The engine also carries **no domain concepts**. The only block kinds it knows are
`custom`, `para`, `table`, `toc`, `rule`, `pagebreak` and `space`. Nothing about
devices, controls or platforms reaches it.

Three apparent upward references from `doc`, `docFormat` and `report` into
`App.generate` were checked and are **all inside comments**. There is no cycle.

### 2.2 A host extension point already exists, for one section kind out of five

`sectionContent()` (`src/js/0350-generate/030-report-blocks.js:227`) dispatches on
block kind:

| Kind | Content produced by |
|---|---|
| `toc` | the module (a LaTeX macro) |
| `custom` | the module (hand-authored parts) |
| `dataset` | **the host, via `adapter.renderReportSection(items, ctx, opts)`** |
| `meta` | hardcoded CH |
| `control` | hardcoded CH |
| `guidelines` | hardcoded CH |

The `dataset` branch is already a working plugin seam, and it is already proven: the
DOD-11 self-test registers a mock platform with its own dataset and generates a
report with zero core edits.

**The extraction is therefore not the invention of a contract. It is the completion
of one that already exists and stops one section-kind short.**

### 2.3 The designer's coupling is thinner than its size suggests

The Report Design workspace is 2,714 lines but makes only **22 references** to host
modules, and never touches the store directly except through `getProject()`:

| Reference | Count | Nature |
|---|---|---|
| `ui.activity.log` | 9 | a logging sink |
| `registry.getPlatform` / `getDataset` | 5 | already threaded down as a parameter |
| `ui.views.generate._gen` etc. | 4 | shared mutable session state — the only real tangle |
| `completeness.deviceReady` | 2 | a readiness predicate |
| `ui.model.getLatestConfigs` | 1 | the candidate subject list |
| `ui.tables.relevanceBadge` | 1 | a cosmetic chip renderer |

Its own module banner records the property that makes extraction viable:

> everything shown is derived from `App.generate.reportBlocks` and `App.doc.outline`
> — the same two calls the generator itself makes — so the panel cannot describe a
> document the generator would not produce.

The designer is already written against the block contract rather than against CH.

---

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Consumers are offline single-file apps**, as CH is: classic `<script>` IIFEs attaching to a namespace, working on `file://`, no bundler, no imports. | Cheapest possible packaging — the existing build already emits exactly this — and it preserves every current invariant. |
| D2 | **A document is about zero or one host-supplied "subject."** | Covers CH's per-device model exactly, and stays honest for a host with no such concept: it supplies none and the affordances disappear. |
| D3 | **One host-declared categorical row filter**, not N axes and not an opaque predicate. | Direct generalisation of Security Relevance. Preserves live counts and the "excluded items are counted and named" rule, which is what stops a filtered report reading as a complete one. Multiple axes are deferred until a host needs them. |
| D4 | **The module ships `toc`, `custom` and a generic metadata section.** Control coverage and guideline deviations move out to CH as host providers. | Provenance is universal to generated documents and is already bound to the injectable clock and the determinism story. Controls and guideline deviations are CH concepts and do not belong in a general module. |
| D5 | **Same repository, split source trees**; CH is consumer #1 from day one. | The contract gets designed against a real consumer instead of a hypothetical one, the suites keep running together, and there is no sync problem. A repo split is deferred until a second consumer has earned it. |
| D6 | **The host owns all state; the module persists nothing.** | Forced by existing behaviour: CH's undo/redo and its debounced folder autosave both key off `store` mutations. A module holding its own design state would silently break both. |
| D7 | **The contract is an explicit host object**, not a global registry. | `App.registry` needed a `_reset()` escape hatch purely so tests could clear ambient state. A module given its host explicitly needs no such hatch, and its contract becomes a value constructible inline in a test. |

---

## 4. The contract

### 4.1 The host object

The host constructs one object and passes it in. Nothing is ambient.

```js
{
  // --- state: required ---
  // The module owns the SHAPE of the design bag; the host owns where it lives
  // and persists it verbatim, without interpreting it.
  getState()             -> designBag
  commit(mutator)        -> void

  // --- determinism: required ---
  clock                  -> { nowIso }

  // --- optional ---
  log?(level, message)   -> void

  subject?: {
    list()               -> [{ id, label, sublabel? }]
    ready(id)            -> boolean | { ready, reason }
    meta(id)             -> [{ id, label, value }]
  }

  sections: [ provider ]          // see 4.2

  filter?: {
    id, label,
    categories()         -> [{ key, label, defaultOn }]
    categoryOf(row)      -> key
  }
}
```

**No migration is required.** CH's existing `project.report` bag *is* the design
bag, in full: `order`, `levels`, `names`, `headings`, `intros`, `introNumbered`,
`tableStyles`, `tableWidths`, `centred`, `tables`, `pageBreak`, `noToc`, `space`,
`sections`, and — confirmed at `0320-doc-format/020-normalise.js:103` — the
formatting profiles too (`formats`, `formatId`), along with `sectionTemplates` and
`reportTemplates`. It stays at the same path with the same keys. No project-file schema
change, no `SCHEMA_VERSION` bump, and existing CH project files keep loading
untouched.

**`commit(mutator)` is the entire persistence story.** CH passes
`function (m) { App.store._commit(m); }` and inherits undo, dirty-tracking and folder
autosave for free, because that is exactly what `_commit` already triggers.

**Optional members degrade visibly, not silently.** Omitting `subject` removes the
subject picker and the readiness gate rather than throwing; likewise `filter` and
`log`. A host supplying `getState`, `commit`, `clock` and an empty `sections` array
gets a working designer for hand-authored documents.

### 4.2 The section provider

```js
{
  id, label,                            // stable id; default heading text
  rows(subjectId)        -> [row]
  keyColumn              -> { id, label, w?, get(row, ctx) }
  columns                -> [{ id, label, optional?, defaultOn?, get(row, ctx) }]
  groups?                -> { field, options: [{ value, label }] }
  available?(subjectId)  -> boolean
  render?(rows, ctx, opts) -> { body, children }
}
```

Three deliberate changes from today's adapter interface:

**`render` becomes optional.** All three CH adapters currently implement
`renderReportSection` identically — `020-packages.js:128` is a single pass-through
call to `App.report.buildSection` with the adapter's own declared columns. With
`keyColumn` and `columns` declared, the module builds the table itself. A provider
writes `render` only when it needs something a table cannot express.

**`keyColumn` removes a hack and a latent bug.** `sectionColumns` currently recovers
the key column's label by rendering an *empty* section and regex-scraping the first
`|` header row out of the resulting markdown (`firstHeaderRow`,
`030-report-blocks.js:185`). That silently returns `[]` for any provider whose output
does not begin with a pipe table. Declaring the key column deletes both.

**`available()` generalises the `guidelines` special case.** `reportBlocks` currently
calls `hasGuidelineDeviations()` inline to decide whether that block is a candidate
at all, on the principle that a section existing solely to say "nothing diverges" is
noise. The principle is kept; the CH-specific predicate behind it moves to the host.

The `body` a provider returns is **opaque markdown** — the module never parses it,
only places it. This is already true today via the block's `body` field.

CH ends up with five providers: its three dataset adapters (largely already written),
plus `control` and `guidelines` moving out of the module into host code.

---

## 5. Structure

### 5.1 Source trees

```
src/base/   util.html, util.dom, util.stable, test           (4 files)
src/doc/    md, docFormat, doc, report, docGen, docStore,
            docTemplates, mdPreview, richText, reportDesign   (~29 files
                                              + the ~17 test files of the v2.2 block)
src/app/    everything else — CH                              (~94 files)
```

Of 144 JavaScript source files today, roughly a third move.

A three-way split rather than two: the module needs four small pure utilities, and a
module that asks its host to supply string-escaping is a badly drawn module.

`build.json` grows two targets — `doc-designer.js` (base + doc) and
`ch-config-tool.html` (base + doc + app). The module bundle is a shorter
concatenation of the same fragments; there is no second build system.

### 5.2 How `generate` splits

- **To the module (`docGen`):** `reportBlocks`, `sectionContent`, `sectionColumns`,
  `emitDocument`, `docFilename`, tag substitution, outline/render orchestration.
- **Stays in CH:** control coverage, guideline deviations, `_gather`, the
  implementation and verification script builders, the ZIP manifest. These re-enter
  the module through the provider interface.

### 5.3 The boundary is enforced by the build

`build.py` gains one check: **no file under `src/doc/` may reference an `App.*` name
defined in `src/app/`.** It already parses every source file for the 500-line cap and
the orphan check, so this is the same machinery.

This check is what makes the extraction durable. The DOD-11 rule held for precisely
this reason: a rule a script enforces outlives one written in a document.

### 5.4 Session state is inverted

`App.ui.views.generate._gen.report` — selected device, filename, tags, classification
— currently lives in CH's Generate tab and is written to directly by the designer,
which is the one genuine tangle found. In the module the **designer owns** that
ephemeral state and CH's Generate tab reads it from the module. The component that
decides what a run produces should own the description of that run.

---

## 6. Verification

**The acceptance criterion is byte-neutrality.** Every step is a pure refactor: no
generated document may change by a single byte. A golden fixture — a project file and
its generated `.md` — is captured before any code moves, and asserted byte-identical
after each step. DOD-7 already requires determinism, so this is cheap, and it is the
strongest available regression test for a move of this size. A changed byte means the
step is wrong.

**Two safety nets, in order of strength:**

1. All 186 existing suites stay green throughout — roughly 64 of them move into the
   module's own tree and the rest stay with CH, but the total must never drop and no
   suite may be skipped. This is the main reason CH was chosen as consumer #1.
2. A **mock-host conformance test** — a host object with two providers, no subject
   and no filter, generating a document end to end. This is the direct descendant of
   the DOD-11 mock platform, and it is what proves the contract serves something that
   is not CH. Without it the contract would have exactly one implementation, which is
   indistinguishable from having no contract.

---

## 7. Order of work

Each step must leave the suites green and the golden output byte-identical.

1. Split into `base` / `doc` / `app`; add both build targets and the boundary check.
   No behaviour change.
2. Capture the golden fixture.
3. Declare `keyColumn`; delete `firstHeaderRow`.
4. Make `render` optional; drop the three adapters' pass-through boilerplate.
5. Move `meta`, `control` and `guidelines` out to providers.
6. Generalise `subject` and `filter`.
7. Introduce the host object; rewire `docStore` and `docTemplates`' 41 call sites.
8. Invert the session state.
9. Add the mock-host conformance test.

---

## 8. Scope

### In scope

- Everything in sections 4 through 7.
- **Splitting `src/js/0590-ui-views-report-design/070-wire.js`** (680 lines) into
  per-concern wiring helpers, and deleting its line from
  `src/line-cap-exemptions.txt`. That file asks for exactly this "when next working in
  that view", and a reusable module must not ship carrying the host codebase's
  line-cap debt — doing so would make a temporary allowance permanent.

### Out of scope

- `src/js/0460-ui-app/030-wire.js` (751 lines, the other exemption). It stays in CH
  and is untouched by this work.
- Any change to generated output. See section 6.
- The implementation and verification script generators, the ZIP writer, and the
  folder-storage layer.

### Deferred, deliberately

- **Multiple filter axes** (D3) — until a host needs them.
- **ESM packaging** (D1) — the fragments remain the source of truth, so a second
  build target can be added later without disturbing the first.
- **A separate repository** (D5) — until a second consumer exists to design against.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Step 7 touches 41 call sites plus the designer's reads. Mechanical, but a slip would be quiet rather than loud. | Sequence it *after* the boundary check exists, so a stray `App.store` reference under `src/doc/` fails the build rather than working by accident. |
| The contract is designed against one real consumer and may not fit the second. | The mock-host conformance test forces a second implementation immediately. `render` remains as an escape hatch for anything the declarative path cannot express. |
| Byte-neutrality is a strict criterion and may flag intentional improvements. | Steps 3 and 4 remove a hack and boilerplate but must not change output. If either does, that is a genuine behaviour change and gets recorded as a defect rather than absorbed silently. |
