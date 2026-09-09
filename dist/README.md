# The document designer, as a folder you can copy

Everything in here is generated from the CH Config Tool's `src/` by
`python3 tools/build-dist.py`. **Copy this folder into another project and it works** —
there is no build step, no bundler, no package to install and no network call.

| File | What it is |
|---|---|
| `doc-designer.js` | The module: markdown writer, document outline, formatting profiles, the generator, and the full Report Design workspace. One file, ~11,600 lines, plain classic-script JavaScript. |
| `doc-designer.css` | The workspace's styles, extracted from the tool's stylesheet. Its first rules are design tokens, a reset and element defaults — delete them if your page already has its own. |
| `example.html` | A complete working host: a staff roster with no devices, controls or platforms anywhere in it. Open it in a browser. |

```html
<link rel="stylesheet" href="doc-designer.css">
<script src="doc-designer.js"></script>
```

That creates one global, `App`, and installs nothing. The module does not touch the
network, does not persist anything, and takes the time from you — so a document
generated twice from the same state is byte-for-byte the same document.

---

## Step by step

### 1. Say where your state lives

```js
var state = { report: {} };            // `report` is the module's; the rest is yours

App.docHost.set({
  getState: function () { return state; },
  commit:   function (mutator) { mutator(state); saveHoweverYouSave(); },
  clock:    { nowIso: function () { return new Date().toISOString(); } },
  sections: [ /* step 2 */ ]
});
```

Those four are required. `getState`/`commit` are the whole persistence story: the module
reads through the first and writes through the second, so your save, your undo and your
dirty-tracking keep working, and everything the designer produces travels inside your own
state under `report`.

### 2. Declare your sections

A section is a *provider* — it declares its data, not its rendering:

```js
{ id: 'people', label: 'People',
  keyColumn: { id: '_key', label: 'Name', w: 3, get: function (r) { return r.name; } },
  columns:   [{ id: 'role', label: 'Role', w: 3, get: function (r) { return r.role; } },
              { id: 'band', label: 'Band', w: 2, optional: true, get: function (r) { return r.band; } }],
  rows:      function () { return myRows; } }
```

The module builds the table, its caption, its column widths, its numbering and its
cross-references. Two things you can add: `groups: { field, options }` splits one section
into a table per group, and `render()` takes over completely for anything a table cannot
express. An `optional: true` column becomes a tick in the designer.

### 3. Add the optional members worth having

| Member | What it buys you |
|---|---|
| `subject` — `list()`, `ready(id)`, `meta(id)` | What a document is *about*: a subject picker in the designer, and a provenance section in the document. |
| `filter` — `categories()`, `categoryOf(row)` | An axis rows are included or excluded along, with counts shown before you generate. |
| `build(subjectId, opts)` | What the workspace previews and what its Generate button emits (step 4). |
| `linkTerms(blocks)` | Which words anywhere in the document become links to a section. |
| `log(issue)` | Where `{severity, message}` goes. Without it, messages are dropped rather than thrown. |

### 4. Generate a document

```js
var opts = App.docSession.options();          // what the designer chose, plus this run's filename/tags
var blocks = App.docGen.reportBlocks(host, opts).filter(function (b) { return b.included; });
var ctx = { subjectId: 'team' };
var meta = host.subject.meta('team');
var prepared = blocks.map(function (b) { return App.docGen.sectionContent(host, b, opts, ctx, meta); });

var doc = App.docGen.emitDocument(host, prepared, {
  title: 'Platform team roster', logicalName: 'roster.md', fallbackName: 'roster.md'
});
```

`doc` gives you `.text` (the markdown), `.blob` and `.name` (ready to download),
`.files[0].content`, and `.tags` — any `/[Placeholder]` still unanswered.

### 5. Mount the designer (optional)

```js
var RD = App.ui.views.reportDesign;
var rdHost = document.getElementById('rd-host');       // must survive repaints

RD.wire({ root: rdHost, refreshMain: paint, quietEdit: function (fn) { fn(); } });
function paint() { rdHost.innerHTML = RD.render(state); }

RD.open(); paint();
```

`wire()` once at startup; `render()` returns an HTML string. `quietEdit` is where an
application with undo wraps the write — pass `fn => fn()` if you have none.

### 6. Turn the markdown into a PDF (optional)

The output targets pandoc: a YAML header, a LaTeX preamble and grid tables. In the source
repo, `tools/build-pdf.sh` shows the exact pandoc + tectonic invocation.

---

## What it does not include

- **A store.** State is yours; the module only reads and writes through the host.
- **A clock.** You supply `nowIso()` — which is what lets a test freeze it and get
  byte-identical output.
- **Any network code.** There is none, by design, and none may be added.

## Rebuilding this folder

From the source repo:

```bash
python3 tools/build-dist.py          # rebuild doc-designer.js + doc-designer.css
node tools/run-module-selftests.js   # 143 tests, run against the bundle with no host present
node tools/check-dist-css.js         # every rule that styles the workspace is in the .css
node tools/check-dist-example.js     # example.html still works, loaded as a browser loads it
```
