# Document Designer Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the document designer and generator out of the CH Config Tool into a reusable module under `src/doc/`, driven by an explicit host contract, with CH as its first consumer.

**Architecture:** Three source trees — `src/base/` (shared pure utilities), `src/doc/` (the module), `src/app/` (CH). Two build targets from the same fragments. The host supplies one explicit object (state accessors, clock, optional subject/filter/log, and a list of section providers); the module owns document structure, presentation and the designer UI. The boundary is enforced by a static check in `tools/build.py`, not by convention.

**Tech Stack:** Plain ES5-style classic-script JavaScript in ordered IIFE fragments attaching to a global `App`. Python 3 build script (`tools/build.py`). Embedded self-test harness (`App.test`) run headlessly through jsdom via `tools/run-selftests.js`.

**Spec:** `docs/superpowers/specs/2026-09-08-document-designer-module-design.md`

## Global Constraints

- **One file, no imports.** Ordered classic `<script>` IIFEs attaching to a single global `App`. Never `type="module"`; no cross-file imports; no external URLs.
- **No network, ever.** No `fetch`/XHR, no telemetry, no CDN, no web fonts.
- **`crypto.subtle` may be undefined.** Hashing uses `App.util.hash` only — never Web Crypto.
- **Determinism.** Serialized state and emitted artifacts are byte-stable for identical input. Timestamps come only from `App.util.clock`; no `Date.now()`/`Math.random()` in engine paths.
- **500-line cap** on every source file, enforced by `tools/build.py`. Exemptions live in `src/line-cap-exemptions.txt` with a reason.
- **Fragment ordering:** a new fragment in a block goes **before** that block's last file, which carries the closing `})(App);`.
- **`ch-config-tool.html` is a build artifact.** Never edit it directly.
- **A suite lives in the tree whose code it drives.** A test touching `App.store`, `App.registry`, `App.generate`, `App.platforms`, `App.ui.*` or `App.providers` is host code and belongs under `src/app/`; only a test confined to `App.md`, `App.doc`, `App.docFormat`, `App.docGen`, `App.docHost`, `App.docStore`, `App.docProviders` or `App.util.*` may live under `src/doc/`. Getting this wrong fails the Task 3 boundary check rather than the suite, which is a confusing way to find out.
- **A file carries `.content`, not `.text`.** `buildReport(...).files` is `[{name, content}]`; `.name` on the result itself is the download filename.
- **Byte-neutrality (this plan's overriding acceptance criterion):** no task may change a single byte of generated document output. Task 1 installs the check that proves it.

**Commands used throughout:**

```bash
python3 tools/build.py           # assemble ch-config-tool.html
python3 tools/build.py --check   # verify built file + all build rules
python3 tools/gen-code-map.py    # refresh the code map in CLAUDE.md
node tools/run-selftests.js      # headless suite; must print "0 failed"
node tools/run-selftests.js ch-config-tool.html --filter GOLD-1   # one suite
                                 # NOTE: --filter needs the file path given
                                 # explicitly; the runner treats the first
                                 # non-"--" argument as the file to load.
```

**Baseline at plan time:** `1112/1112 pass (186 suites, 0 failed)`.

**Note on ordering:** the spec lists the tree split before the golden fixture. This plan reverses them. The fixture costs nothing to capture first and protects the tree split too, which is otherwise the one large change with no regression net of its own.

---

## File Structure

**Created:**
- `src/js/0600-.../175-golden-output-regression.js` — the byte-neutrality suite (Task 1)
- `src/build-doc.json` — the module build manifest (Task 2)
- `src/doc/js/0700-doc-host.js` — host contract validation + defaults (Task 9)
- `src/doc/js/0710-doc-providers.js` — provider normalisation, declarative table rendering (Tasks 5–6)
- `src/app/js/0800-providers-control.js` — CH control-coverage provider (Task 7)
- `src/app/js/0810-providers-guidelines.js` — CH guideline-deviations provider (Task 7)
- `src/doc/js/09xx-conformance-mock-host.js` — mock-host conformance suite (Task 12)

**Modified:**
- `tools/build.py` — multi-manifest support (Task 2), boundary check (Task 3)
- `src/build.json` — paths rewritten for the new trees (Task 4)
- `src/app/js/0350-generate/*` → split between `src/doc/` and `src/app/` (Task 7)
- `src/js/0240-adapters-android/*` — declare `keyColumn`, drop `renderReportSection` boilerplate (Tasks 5–6)
- `src/js/0550-doc-store/*`, `src/js/0560-doc-templates.js` — rewired to the host object (Task 9)
- `src/js/0590-ui-views-report-design/070-wire.js` — split into wiring helpers (Task 11)
- `src/line-cap-exemptions.txt` — drop the Report Design entry (Task 11)

---

## Phase 1 — Foundation (Tasks 1–4)

Mechanical and low-risk. Ends with the same application, a new structure, and a boundary a script enforces. **A natural review checkpoint.**

---

### Task 1: Golden-output regression harness

The safety net every later task depends on. Records a hash of the exact bytes the report generator produces for a fixed project under a fixed clock, so any accidental output change fails loudly.

**Files:**
- Create: `src/js/0510-phase-7-self-test-suites-report-generate-det/015-golden-output-regression.js`
- Modify: `src/build.json` (add the new fragment **before** the block's last entry)

**Status: DONE** — commit `92a604a`. Recorded hash
`0910017a18110c708a82fdf3ef76a5e1ed35798d22c333bb685bbeb2dac727f7`; suite at
1115/1115 across 187. Built in the 0510 block rather than 0600 so it can drive
`App.generate`, and reusing that block's existing `readyProject()` fixture.

**Interfaces:**
- Consumes: `App.store`, `App.generate.buildReport`, `App.util.hash.sha256Hex`, `App.util.clock.setClock/resetClock`, `App.registry`, `App.platforms.androidAdb`
- Produces: a suite named `GOLD-1 the generated document is byte-for-byte unchanged`. Later tasks must keep it green without editing the recorded hash.

- [ ] **Step 1: Write the failing test**

Create `src/js/0600-v2-2-self-test-suites-report-design-markdown/175-golden-output-regression.js`:

```javascript
  /* ===== SUITES: byte-neutrality of the extraction (GOLD-1) ===== */

  /* The whole module extraction is a pure refactor: the document a given project
   * produces must not change by one byte. This suite pins that down. It builds a
   * fixed project under a fixed clock, generates the report, and hashes the result.
   *
   * If this fails during the extraction, the step that broke it is wrong — the hash
   * is not to be "updated to match". It is only ever re-recorded for a deliberate,
   * separately-reviewed change to generated output. */
  T.suite('GOLD-1 the generated document is byte-for-byte unchanged', function (s) {

    function goldenProject() {
      if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb);
      App.store.init(App.store.empty('android-adb'));
      function snap(ds, raw) {
        var a = App.registry.getDataset('android-adb', ds), pr = a.parse(raw);
        var o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: ds,
                  sha256: App.util.hash.sha256Hex(raw), keys: pr.keys };
        if (pr.values) o.values = pr.values;
        if (pr.template !== undefined) o.template = pr.template;
        return o;
      }
      App.store.onboardDevice({ name: 'Gold', model: 'G1', firmware: 'F1', snapshots: {
        'android.packages': snap('android.packages', 'com.a\ncom.b'),
        'android.tactical': snap('android.tactical', '{"enabled":true,"count":3}')
      } });
      return App.store.getProject();
    }

    function goldenText() {
      App.util.clock.setClock(function () { return new Date('2026-02-02T02:02:02.000Z'); });
      try {
        var p = goldenProject();
        var dc = App.ui.model.getLatestConfigs(p)[0];
        var built = App.generate.buildReport(p, dc.id);
        // buildReport returns { files: [{name, text}] }; concatenate deterministically.
        return built.files.map(function (f) { return f.name + '\n' + f.text; }).join('\n---\n');
      } finally {
        App.util.clock.resetClock();
      }
    }

    s.test('the report generator is stable across two identical runs', function () {
      T.assertEqual(goldenText(), goldenText(), 'two runs of the same input differ');
    });

    s.test('the report generator still produces the recorded bytes', function () {
      // RECORD-ME: replace with the hash printed by step 2 of this task.
      var GOLDEN_SHA256 = 'RECORD-ME';
      var actual = App.util.hash.sha256Hex(goldenText());
      T.assertEqual(actual, GOLDEN_SHA256,
        'generated output changed. Do NOT update this hash to make the test pass — ' +
        'find the step that changed the bytes.');
    });
  });
```

Register it in `src/build.json`: find the `paths` array of the part beginning `js/0600-v2-2-self-test-suites-report-design-markdown/010-...` and insert `"js/0600-v2-2-self-test-suites-report-design-markdown/175-golden-output-regression.js"` **immediately before the final entry** in that array.

- [ ] **Step 2: Run it and record the real hash**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter GOLD-1
```

Expected: FAIL on the second test, with `actual: <64 hex chars>` and `expected: RECORD-ME`.

The first test (`stable across two identical runs`) **must already pass**. If it does not, generation is non-deterministic and that is a pre-existing defect — stop and report it rather than continuing.

Copy the 64-character `actual` value and replace the string `'RECORD-ME'` in the file with it.

- [ ] **Step 3: Verify it now passes**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter GOLD-1
```

Expected: PASS, 2 tests.

- [ ] **Step 4: Verify the whole suite is still green**

```bash
node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

- [ ] **Step 5: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "GOLD-1: pin the generated document's bytes before the extraction"
```

---

### Task 2: build.py learns about multiple manifests

`tools/build.py` currently hardcodes `src/build.json`. The module needs its own target built from a subset of the same fragments.

**Files:**
- Modify: `tools/build.py` (`MANIFEST` constant, `load_manifest`, `check_rules`, `main`)
- Create: `src/build-doc.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `python3 tools/build.py --manifest src/build-doc.json` builds the module bundle. Orphan detection unions the paths of **all** `src/build*.json` manifests, so a file listed only in the module manifest is not reported as an orphan of the CH manifest.

- [ ] **Step 1: Write the failing test**

There is no Python test framework in this repo, and adding one is out of scope. The test is an executable assertion on observable behaviour. Create `tools/test-build-rules.sh`:

```bash
#!/usr/bin/env bash
# Exercises tools/build.py's rule checks. Each case asserts an exit code.
set -u
cd "$(dirname "$0")/.."
fail=0

expect() { # expect <desc> <expected-exit> <cmd...>
  local desc="$1" want="$2"; shift 2
  "$@" >/dev/null 2>&1; local got=$?
  if [ "$got" != "$want" ]; then echo "FAIL: $desc (want exit $want, got $got)"; fail=1
  else echo "ok: $desc"; fi
}

expect "default manifest builds clean" 0 python3 tools/build.py --check
expect "module manifest builds clean" 0 python3 tools/build.py --check --manifest src/build-doc.json

# A file on disk listed in NEITHER manifest must be reported as an orphan.
tmp="src/js/9999-orphan-probe.js"
printf '/* probe */\n' > "$tmp"
expect "an unlisted file is an orphan" 1 python3 tools/build.py --check
rm -f "$tmp"
expect "removing it restores a clean build" 0 python3 tools/build.py --check

exit $fail
```

```bash
chmod +x tools/test-build-rules.sh
```

- [ ] **Step 2: Run it to verify it fails**

```bash
./tools/test-build-rules.sh
```

Expected: FAIL on `module manifest builds clean` — `--manifest` is not yet an option and `src/build-doc.json` does not exist.

- [ ] **Step 3: Implement multi-manifest support**

In `tools/build.py`, replace the `load_manifest` function and add manifest discovery:

```python
def load_manifest(path=None):
    target = Path(path) if path else MANIFEST
    if not target.is_absolute():
        target = ROOT / target
    if not target.exists():
        sys.exit(f"error: {target} not found")
    return json.loads(target.read_text(encoding="utf-8"))


def all_manifest_paths():
    """Every path referenced by ANY manifest, for orphan detection.

    A fragment under src/doc/ is listed in both the CH manifest and the module
    manifest; a fragment under src/app/ only in the CH one. Orphan detection asks
    'is this file built by anything?', so it must union across manifests or every
    module-only file would be reported as an orphan of the CH build.
    """
    seen = set()
    for m in sorted(SRC.glob("build*.json")):
        seen.update(manifest_paths(json.loads(m.read_text(encoding="utf-8"))))
    return seen
```

In `check_rules`, change the orphan comparison from `on_disk - listed` to use the union, and exclude every manifest file:

```python
    on_disk = {
        str(p.relative_to(SRC))
        for p in SRC.rglob("*")
        if p.is_file()
        and p.name != "line-cap-exemptions.txt"
        and not (p.parent == SRC and p.name.startswith("build") and p.suffix == ".json")
    }
    built_by_something = all_manifest_paths()
    for orphan in sorted(on_disk - built_by_something):
        problems.append(f"orphan: {orphan} is on disk but not in any build*.json — it will NOT be built")
```

In `main()`, add the flag and pass it through:

```python
    ap.add_argument("--manifest", default=None, help="manifest to build (default src/build.json)")
    args = ap.parse_args()

    manifest = load_manifest(args.manifest)
```

- [ ] **Step 4: Create the module manifest**

Create `src/build-doc.json`. At this task the trees have not moved yet, so it lists the module's current paths and emits a bare `.js` bundle:

```json
{
  "output": "doc-designer.js",
  "lineCap": 500,
  "parts": [
    { "type": "script", "open": "", "close": "", "gap": "\n",
      "paths": ["js/0010-app-namespace-root.js"] }
  ]
}
```

This is a deliberately minimal, valid manifest: it proves `--manifest` works and gives Task 4 something to grow. It is filled out with the real module file list in Task 4, once the files have moved.

Add `doc-designer.js` to `.gitignore` — it is a build artifact like `ch-config-tool.html`:

```bash
echo "doc-designer.js" >> .gitignore
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
python3 tools/build.py --manifest src/build-doc.json
./tools/test-build-rules.sh
```

Expected: all four cases `ok`.

```bash
node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: support multiple manifests, add the module target"
```

---

### Task 3: build.py enforces the module boundary

The check that makes the extraction durable: nothing under `src/doc/` may reference a name that `src/app/` owns.

**Files:**
- Modify: `tools/build.py` (new `check_boundary`, called from `check_rules`)
- Modify: `tools/test-build-rules.sh` (two new cases)

**Interfaces:**
- Consumes: `load_manifest`, `SRC` from Task 2.
- Produces: `check_boundary(...) -> list[str]`. A violation fails the build with the offending file, line number and name.

- [ ] **Step 1: Write the failing test**

Append to `tools/test-build-rules.sh`, before the final `exit $fail`:

```bash
# The module must not reach into the host application.
mkdir -p src/doc/js
probe="src/doc/js/9998-boundary-probe.js"
printf '(function (App) { var p = App.store.getProject(); }(App));\n' > "$probe"
expect "a src/doc file referencing App.store fails the build" 1 python3 tools/build.py --check
rm -f "$probe"
expect "removing the violation restores a clean build" 0 python3 tools/build.py --check
```

- [ ] **Step 2: Run it to verify it fails**

```bash
./tools/test-build-rules.sh
```

Expected: FAIL on `a src/doc file referencing App.store fails the build` — got exit 1 for the wrong reason (orphan), or exit 0. Either way the boundary is not being checked. Confirm by reading the message:

```bash
printf '(function (App) { var p = App.store.getProject(); }(App));\n' > src/doc/js/9998-boundary-probe.js
python3 tools/build.py --check; rm -f src/doc/js/9998-boundary-probe.js
```

Expected: the reported problem mentions `orphan`, not `boundary`.

- [ ] **Step 3: Implement the check**

Add to `tools/build.py`, above `check_rules`:

```python
import re

APP_TREE = "app/"
DOC_TREE = "doc/"

# `App.foo.bar = ` / `App.foo = ` — where a module publishes its exported surface.
_DEFINES = re.compile(r"^\s*App\.([A-Za-z0-9_.]+)\s*=", re.M)
_REFERENCES = re.compile(r"App\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)")


def _strip_comments(text):
    """Block and line comments removed, so a DEPENDS: banner is not a reference.

    Crude by design: it does not track string literals. A false positive here is a
    build failure with a named file and line, which is cheap to inspect; a false
    negative would let the boundary rot silently, which is not.
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"^\s*//.*$", "", text, flags=re.M)


def check_boundary():
    """No file under src/doc/ may reference a name that src/app/ defines.

    This is what keeps the module reusable. The dependency runs one way — the host
    hands the module an explicit contract object; the module never reaches back.
    """
    app_names = set()
    for path in sorted(SRC.glob(f"{APP_TREE}**/*.js")):
        for m in _DEFINES.finditer(_strip_comments(path.read_text(encoding="utf-8"))):
            app_names.add(m.group(1).split(".")[0])
    if not app_names:
        return []

    problems = []
    for path in sorted(SRC.glob(f"{DOC_TREE}**/*.js")):
        rel = path.relative_to(SRC)
        for n, line in enumerate(_strip_comments(path.read_text(encoding="utf-8")).splitlines(), 1):
            for m in _REFERENCES.finditer(line):
                root = m.group(1).split(".")[0]
                if root in app_names:
                    problems.append(
                        f"boundary: {rel}:{n} references App.{root}, which src/app/ owns. "
                        f"The module must receive this through its host contract instead."
                    )
    return problems
```

Call it from `check_rules`, next to the closure check:

```python
    problems.extend(check_closures(manifest))
    problems.extend(check_boundary())
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./tools/test-build-rules.sh
```

Expected: all six cases `ok`.

Note: with no `src/app/` tree yet, `check_boundary` finds no app-defined names and returns `[]`. The probe case passes because the probe file is also an orphan, which still fails the build. Task 4 makes the check load-bearing; re-run this script after it to confirm the message then names `boundary`.

```bash
node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: enforce the src/doc -> src/app boundary"
```

---

### Task 4: Move the files into base / doc / app

A pure move. No file contents change except the manifests. This is where the boundary check becomes load-bearing.

**Files:**
- Modify: every path in `src/build.json`; fill out `src/build-doc.json`
- Move: 144 `.js` files from `src/js/` into `src/base/js/`, `src/doc/js/`, `src/app/js/`

**Interfaces:**
- Consumes: `--manifest` (Task 2), `check_boundary` (Task 3).
- Produces: the three trees. Every later task addresses files by their new paths.

- [ ] **Step 1: Move the shared base**

```bash
mkdir -p src/base/js
git mv src/js/0040-util-html.js   src/base/js/0040-util-html.js
git mv src/js/0090-util-dom.js    src/base/js/0090-util-dom.js
git mv src/js/0100-util-stable.js src/base/js/0100-util-stable.js
git mv src/js/0180-test.js        src/base/js/0180-test.js
```

- [ ] **Step 2: Move the module**

```bash
mkdir -p src/doc/js
for d in 0170-md 0320-doc-format 0330-doc 0550-doc-store \
         0570-ui-md-preview 0590-ui-views-report-design \
         0600-v2-2-self-test-suites-report-design-markdown; do
  git mv "src/js/$d" "src/doc/js/$d"
done
git mv src/js/0340-report.js        src/doc/js/0340-report.js
git mv src/js/0560-doc-templates.js src/doc/js/0560-doc-templates.js
git mv src/js/0580-ui-rich-text.js  src/doc/js/0580-ui-rich-text.js
```

`src/js/0350-generate/` is NOT split here — it moves wholesale into `src/app/js/` with everything else in Step 3, and Task 7 splits it from there. Splitting a module before the trees exist would leave the repo in a state no manifest describes.

- [ ] **Step 3: Move the rest to app**

```bash
mkdir -p src/app/js
git mv src/js/* src/app/js/
rmdir src/js
```

- [ ] **Step 4: Rewrite the manifests**

Rewrite every `paths` entry in `src/build.json` to its new location. Do it mechanically rather than by hand:

```bash
python3 - <<'EOF'
import json, pathlib
src = pathlib.Path('src')
def locate(p):
    name = p.split('/', 1)[1]          # strip the leading "js/"
    for tree in ('base', 'doc', 'app'):
        if (src / tree / 'js' / name.split('/')[0]).exists():
            return f'{tree}/js/{name}'
    raise SystemExit(f'cannot locate {p}')
m = json.loads((src / 'build.json').read_text())
for part in m['parts']:
    if part['type'] == 'raw':
        continue
    part['paths'] = [locate(p) if p.startswith('js/') else p for p in part['paths']]
(src / 'build.json').write_text(json.dumps(m, indent=2) + '\n')
print('rewritten')
EOF
```

Then fill out `src/build-doc.json` with the module's own load order — base first, then doc, mirroring the corresponding entries from `src/build.json`:

```bash
python3 - <<'EOF'
import json, pathlib
src = pathlib.Path('src')
ch = json.loads((src / 'build.json').read_text())
parts = []
for part in ch['parts']:
    if part['type'] != 'script':
        continue
    keep = [p for p in part['paths'] if p.startswith(('base/js/', 'doc/js/'))]
    if not keep:
        continue
    if len(keep) != len(part['paths']):
        raise SystemExit(f'part mixes trees: {part["paths"][0]} — split it by hand')
    parts.append({**part, 'open': '', 'close': '', 'paths': keep})
doc = {'output': 'doc-designer.js', 'lineCap': 500, 'parts': parts}
(src / 'build-doc.json').write_text(json.dumps(doc, indent=2) + '\n')
print(f'{len(parts)} parts, {sum(len(p["paths"]) for p in parts)} files')
EOF
```

The root namespace fragment `0010-app-namespace-root.js` must be in the module bundle too — it is currently in `src/app/js/`. Move it to base and re-run both scripts above:

```bash
git mv src/app/js/0010-app-namespace-root.js src/base/js/0010-app-namespace-root.js
```

- [ ] **Step 5: Build and verify nothing changed**

```bash
python3 tools/build.py
python3 tools/build.py --manifest src/build-doc.json
./tools/test-build-rules.sh
node tools/run-selftests.js
```

Expected: both builds succeed; all six build-rule cases `ok`; `0 failed`, with the same totals as Task 1 (Tasks 2 and 3 added shell-level tests, not suites).

**GOLD-1 must be green.** It is the proof that moving 144 files changed no output.

- [ ] **Step 6: Confirm the boundary check is now load-bearing**

```bash
printf '(function (App) { var p = App.store.getProject(); }(App));\n' > src/doc/js/9998-boundary-probe.js
python3 tools/build.py --check 2>&1 | grep boundary
rm -f src/doc/js/9998-boundary-probe.js
```

Expected: a line naming `boundary:` and `App.store`. If only `orphan:` appears, `check_boundary` is not finding `src/app/`'s definitions — fix before continuing, because every later task relies on this.

The build will currently report boundary violations for real: `docStore` references `App.store`, and `mdPreview`/`richText`/`reportDesign` reference `App.ui.*`. **Record the full list** — it is the exact work of Tasks 7–10:

```bash
python3 tools/build.py --check 2>&1 | grep boundary: | tee /tmp/boundary-debt.txt | wc -l
```

To keep the build usable until then, add a temporary allowlist to `check_boundary` — a module-level constant listing the known-outstanding names, with a comment naming this plan:

```python
# Names src/doc/ still reaches for, each removed by a task in
# docs/superpowers/plans/2026-09-08-document-designer-module.md.
# This list only ever shrinks. Task 12 asserts it is empty.
BOUNDARY_DEBT = {"store", "ui", "registry", "generate", "completeness", "projectIo", "overrides"}
```

and skip those roots in the loop:

```python
                if root in app_names and root not in BOUNDARY_DEBT:
```

- [ ] **Step 7: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "Split src/ into base, doc and app trees"
```

---

## Phase 2 — The contract (Tasks 5–12)

Design-bearing work. Each task removes entries from `BOUNDARY_DEBT` and keeps GOLD-1 green.

---

### Task 5: Declare `keyColumn`; delete `firstHeaderRow`

Removes a regex that scrapes rendered markdown to recover a column label, and the latent bug that it returns `[]` for any provider whose output is not a pipe table.

**Files:**
- Modify: `src/app/js/0240-adapters-android/020-packages.js:120-128`, `:316-327`
- Modify: `src/app/js/0240-adapters-android/030-custom.js:141-151`
- Modify: `src/app/js/0350-generate/030-report-blocks.js:156-192`
- Test: `src/app/js/0510-phase-7-self-test-suites-report-generate-det/016-key-column.js` (new fragment, registered BEFORE the block's last file). Drives `App.registry`/`App.generate`, so it is host-tree.

**Interfaces:**
- Consumes: nothing new.
- Produces: every dataset adapter exposes `keyColumn: { id, label, w, get(row, ctx) }`. `sectionColumns` reads `adapter.keyColumn` and no longer probe-renders. `firstHeaderRow` is deleted.

- [ ] **Step 1: Write the failing test**

Create `src/app/js/0510-phase-7-self-test-suites-report-generate-det/016-key-column.js`. It sits in the same block as GOLD-1, so `readyProject()` and `ensureAndroid()` are already in scope:

```javascript
  /* ===== SUITES: the declared key column (KEY-1) ===== */

  T.suite('KEY-1 an adapter declares its key column rather than having it scraped', function (s) {
    function adapter(id) {
      if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb);
      return App.registry.getDataset('android-adb', id);
    }

    s.test('every dataset adapter declares a key column', function () {
      ['android.packages', 'android.tactical', 'android.custom'].forEach(function (id) {
        var k = adapter(id).keyColumn;
        T.assert(k && typeof k.get === 'function', id + ' has no keyColumn.get');
        T.assert(typeof k.label === 'string' && k.label.length, id + ' has no keyColumn.label');
      });
    });

    s.test('the declared label is the one the table actually prints', function () {
      // The scrape this replaces read the first pipe-table header cell. The declared
      // label must equal it exactly, or generated output would change.
      T.assertEqual(adapter('android.packages').keyColumn.label, 'Package');
      T.assertEqual(adapter('android.tactical').keyColumn.label, 'Path');
    });

    s.test('sectionColumns reports the declared label without rendering a probe', function () {
      var p = App.store.getProject() || App.store.empty('android-adb');
      var cols = App.generate.sectionColumns(p, { kind: 'dataset', dsId: 'android.packages' }, {});
      T.assertEqual(cols.fixed[0].id, '_key');
      T.assertEqual(cols.fixed[0].label, 'Package');
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter KEY-1
```

Expected: FAIL on `every dataset adapter declares a key column` — `keyColumn` is undefined.

- [ ] **Step 3: Declare the key columns**

In `src/app/js/0240-adapters-android/020-packages.js`, the packages adapter currently passes its key column inline at line 128. Lift it to a declared property:

```javascript
      keyColumn: { id: '_key', label: 'Package', w: 2, get: function (it) { return it.key; } },
      renderReportSection: function (items, ctx, opts) {
        return App.report.buildSection('Packages', this.keyColumn, this.reportColumns, items, opts || {}, ctx, this.reportGroups);
      },
```

In the same file, the tactical adapter at line 327:

```javascript
      keyColumn: { id: '_key', label: 'Path', w: 2, get: function (it) { return stripPolicyPrefix(it.key); } },
      renderReportSection: function (items, ctx, opts) {
        return App.report.buildSection('Tactical', this.keyColumn, this.reportColumns, items, opts || {}, ctx, null);
      },
```

In `src/app/js/0240-adapters-android/030-custom.js`, read the existing inline key column at line 151 and lift it the same way, preserving its `label`, `w` and `get` exactly.

- [ ] **Step 4: Read the declared label in sectionColumns**

In `src/app/js/0350-generate/030-report-blocks.js`, replace the `block.kind === 'dataset'` branch (lines 166-173):

```javascript
      if (block.kind === 'dataset') {
        var adapter = App.registry.getDataset(project.platformProfileId, block.dsId);
        if (!adapter) return null;
        // The key column is DECLARED. It used to be recovered by rendering an empty
        // section and regex-scraping its first pipe-table header row, which returned
        // nothing at all for an adapter whose section is not a pipe table.
        var key = adapter.keyColumn || { id: '_key', label: 'Key' };
        return pack([{ id: '_key', label: key.label }],
                    (adapter.reportColumns || []).filter(function (c) { return c.optional; }));
      }
```

Delete the now-unused `firstHeaderRow` function (lines 184-192).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
python3 tools/build.py && node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

**GOLD-1 must be green.** If it is not, a declared label differs from what the scrape produced — correct the label, not the hash.

- [ ] **Step 6: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "KEY-1: adapters declare their key column; drop the header-row scrape"
```

---

### Task 6: `render` becomes optional

All three adapters implement `renderReportSection` as a single pass-through to `App.report.buildSection`. With columns and key column declared, the module can do it.

**Files:**
- Create: `src/doc/js/0710-doc-providers.js`
- Modify: `src/build.json`, `src/build-doc.json` (register the new module file)
- Modify: `src/app/js/0240-adapters-android/020-packages.js`, `030-custom.js` (delete the boilerplate)
- Modify: `src/app/js/0350-generate/030-report-blocks.js:268-276`

**Interfaces:**
- Consumes: `adapter.keyColumn` (Task 5), `App.report.buildSection`.
- Produces: `App.docProviders.renderSection(provider, rows, ctx, opts) -> { body, children }` — calls `provider.render` when present, otherwise builds the table from `keyColumn` + `columns` + `groups`.

- [ ] **Step 1: Write the failing test**

Add a new suite to `src/doc/js/0600-.../175-golden-output-regression.js`:

```javascript
  /* ===== SUITES: declarative section rendering (PROV-1) ===== */

  T.suite('PROV-1 a provider that declares its columns needs no render function', function (s) {
    var provider = {
      id: 'demo', label: 'Demo',
      keyColumn: { id: '_key', label: 'Thing', w: 2, get: function (r) { return r.key; } },
      columns: [{ id: 'note', label: 'Note', get: function (r) { return r.note; } }],
      rows: function () { return [{ key: 'b', note: 'second' }, { key: 'a', note: 'first' }]; }
    };

    s.test('the module builds the table when render is absent', function () {
      var out = App.docProviders.renderSection(provider, provider.rows(), {}, {});
      T.assert(out && typeof out.body === 'string', 'no body produced');
      T.assert(out.body.indexOf('Thing') !== -1, 'the key column heading is missing');
      T.assert(out.body.indexOf('Note') !== -1, 'the declared column heading is missing');
    });

    s.test('rows are ordered by key, as buildSection has always ordered them', function () {
      var body = App.docProviders.renderSection(provider, provider.rows(), {}, {}).body;
      T.assert(body.indexOf('first') < body.indexOf('second'), 'rows are not sorted by key');
    });

    s.test('an explicit render function still wins', function () {
      var own = Object.assign({}, provider, {
        render: function () { return { body: 'HAND WRITTEN', children: [] }; }
      });
      T.assertEqual(App.docProviders.renderSection(own, [], {}, {}).body, 'HAND WRITTEN');
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter PROV-1
```

Expected: FAIL — `App.docProviders` is undefined.

- [ ] **Step 3: Implement the module**

Create `src/doc/js/0710-doc-providers.js`:

```javascript
  /* =============================================================================
   * MODULE: App.docProviders — the declarative half of the section contract
   * PURPOSE: Turn a section PROVIDER — a declaration of rows, a key column and
   *          columns — into rendered markdown, so a host that only wants a table
   *          does not have to write one. A provider may still supply its own
   *          render() for anything a table cannot express.
   * PURITY:  pure. No DOM, no I/O, no clock.
   * DEPENDS: App.report
   * INVARIANTS: renderSection is the ONLY path from a provider to markdown, so a
   *             declared section and a hand-rendered one cannot diverge in how they
   *             are captioned, styled or width-constrained.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /**
     * @param {Object} provider  a section provider (see the module contract)
     * @param {Array} rows       the rows this section is to show
     * @param {Object} ctx       the render context passed to every column getter
     * @param {Object} opts      caption/style/width options from the block
     * @returns {{body:string, children:Array}}
     */
    function renderSection(provider, rows, ctx, opts) {
      if (!provider) return { body: '', children: [] };
      if (typeof provider.render === 'function') {
        return provider.render(rows || [], ctx || {}, opts || {});
      }
      var key = provider.keyColumn || { id: '_key', label: 'Key', get: function (r) { return r.key; } };
      var out = App.report.buildSection(
        provider.label, key, provider.columns || [],
        rows || [], opts || {}, ctx || {}, provider.groups || null
      );
      // buildSection returns either a string or {body, children} depending on
      // whether the section is grouped. Normalise, so every caller sees one shape.
      return (typeof out === 'string') ? { body: out, children: [] }
                                       : { body: out.body || '', children: out.children || [] };
    }

    App.docProviders = { renderSection: renderSection };
  }(App));
```

Register it in both manifests as its own `script` part, placed **after** the `0340-report.js` part and **before** `0350-generate`:

```bash
python3 - <<'EOF'
import json, pathlib
new = {"type": "script", "open": "  <script>\n", "close": "  </script>\n", "gap": "\n",
       "paths": ["doc/js/0710-doc-providers.js"]}
for name, wrap in (('build.json', True), ('build-doc.json', False)):
    p = pathlib.Path('src') / name
    m = json.loads(p.read_text())
    part = dict(new) if wrap else {**new, 'open': '', 'close': ''}
    at = next(i for i, x in enumerate(m['parts'])
              if x.get('paths') and x['paths'][0].endswith('0340-report.js')) + 1
    m['parts'].insert(at, part)
    p.write_text(json.dumps(m, indent=2) + '\n')
    print(f'{name}: inserted at {at}')
EOF
```

- [ ] **Step 4: Route generation through it and delete the boilerplate**

In `src/app/js/0350-generate/030-report-blocks.js`, replace the final `else` branch of `sectionContent` (lines 267-277):

```javascript
      } else {
        var adapter = App.registry.getDataset(project.platformProfileId, b.dsId);
        var items = gatherKept(project, deviceId, b.dsId, keep);
        var r = App.docProviders.renderSection(adapter, items, ctx, Object.assign({
          columns: (opts.columns || {})[b.dsId], groups: (opts.datasetSections || {})[b.dsId] || {},
          tables: b.tables || null
        }, tblOpts));
        out = Object.assign({}, b, { body: r.body, children: r.children });
      }
```

Then delete `renderReportSection` from the packages and tactical adapters in `020-packages.js` and from the custom adapter in `030-custom.js`, and rename each adapter's `reportColumns` property to `columns`. Keep `reportGroups` as `groups`.

Update the one reader of the old name. In `src/app/js/0350-generate/030-report-blocks.js`,
`sectionColumns` still says `adapter.reportColumns` — change it to `adapter.columns`:

```javascript
        return pack([{ id: '_key', label: key.label }],
                    (adapter.columns || []).filter(function (c) { return c.optional; }));
```

If any adapter's `renderReportSection` does more than pass through to `buildSection`, keep it as `render` instead of deleting it, and note which in the commit message.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
python3 tools/build.py && node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

- [ ] **Step 6: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "PROV-1: a declared provider renders without a render function"
```

---

### Task 7: `control` and `guidelines` become host providers; `generate` splits

The largest task. Moves two CH concepts out of the module and splits `generate` along the seam identified in the spec.

**Files:**
- Create: `src/app/js/0800-providers-control.js`, `src/app/js/0810-providers-guidelines.js`
- Move: `src/app/js/0350-generate/` → the generic half to `src/doc/js/0350-doc-gen/`, the rest to `src/app/js/0350-generate/`
- Modify: both manifests

**Interfaces:**
- Consumes: `App.docProviders.renderSection` (Task 6).
- Produces: `App.providers.control` and `App.providers.guidelines`, each conforming to the provider contract with `rows(subjectId)`, `keyColumn`, `columns`, `available(subjectId)` and `render`. `App.docGen` holds `reportBlocks`, `sectionContent`, `sectionColumns`, `emitDocument`, `docFilename`, `findTags`, `applyTags`.

- [ ] **Step 1: Write the failing test**

Create `src/app/js/0510-phase-7-self-test-suites-report-generate-det/017-provider-extraction.js` (registered **before** the block's last entry). It drives `App.providers`/`App.store`, so it is host-tree:

```javascript
  /* ===== SUITES: control and guidelines as host providers (HOST-1) ===== */

  T.suite('HOST-1 control coverage and guideline deviations are host providers', function (s) {
    s.test('both are declared on the host, not the module', function () {
      T.assert(App.providers && App.providers.control, 'App.providers.control missing');
      T.assert(App.providers && App.providers.guidelines, 'App.providers.guidelines missing');
    });

    s.test('each conforms to the provider contract', function () {
      [App.providers.control, App.providers.guidelines].forEach(function (p) {
        T.assertEqual(typeof p.id, 'string');
        T.assertEqual(typeof p.label, 'string');
        T.assertEqual(typeof p.rows, 'function');
        T.assert(p.keyColumn && typeof p.keyColumn.get === 'function', p.id + ': no keyColumn');
      });
    });

    s.test('guidelines declares itself unavailable when nothing diverges', function () {
      if (!App.registry.hasPlatform('android-adb')) App.registry.registerPlatform(App.platforms.androidAdb);
      App.store.init(App.store.empty('android-adb'));
      T.assertEqual(App.providers.guidelines.available(null), false,
        'an empty project has no deviations, so the section is not a candidate');
    });

    s.test('the module no longer knows either concept', function () {
      var gen = String(App.docGen.sectionContent);
      T.assertEqual(gen.indexOf("'control'"), -1, 'docGen still branches on the control kind');
      T.assertEqual(gen.indexOf("'guidelines'"), -1, 'docGen still branches on the guidelines kind');
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter HOST-1
```

Expected: FAIL — `App.providers.control missing`.

- [ ] **Step 3: Split the generate module**

```bash
# 030-report-blocks.js is the generic half and moves to the module; the other three
# stay with CH where they already are.
mkdir -p src/doc/js/0350-doc-gen
git mv src/app/js/0350-generate/030-report-blocks.js src/doc/js/0350-doc-gen/030-report-blocks.js
```

Rename the module half's namespace from `App.generate` to `App.docGen` inside `030-report-blocks.js`, keeping `App.generate` in CH as a thin forwarding surface so existing call sites and suites keep working:

```javascript
    // CH's historical entry points. The document machinery now lives in App.docGen;
    // these forward, so the ~186 existing suites and the Generate tab are unaffected.
    App.generate = Object.assign(App.generate || {}, {
      reportBlocks: App.docGen.reportBlocks,
      sectionContent: App.docGen.sectionContent,
      sectionColumns: App.docGen.sectionColumns,
      docFilename: App.docGen.docFilename,
      findTags: App.docGen.findTags,
      applyTags: App.docGen.applyTags
    });
```

Place that forwarding block in `src/app/js/0350-generate/010-tool-version.js`, which loads after the module.

- [ ] **Step 4: Write the two providers**

Create `src/app/js/0800-providers-control.js`. Move the body of `buildControlSection` out of the module and wrap it:

```javascript
  /* =============================================================================
   * MODULE: App.providers.control — CH's control-coverage section, as a provider
   * PURPOSE: Control coverage is a CH concept, not a document-module one. It reaches
   *          the document the same way any host section does: through the provider
   *          contract. Moved out of App.generate's kind switch, unchanged in output.
   * PURITY:  pure.
   * DEPENDS: App.store, App.registry, App.projectIo, App.docProviders
   * ============================================================================= */
  (function (App) {
    'use strict';
    App.providers = App.providers || {};

    App.providers.control = {
      id: 'control',
      label: 'Control coverage',
      keyColumn: { id: 'control', label: 'Control', w: 2, get: function (r) { return r.title; } },
      columns: App.generate.CONTROL_COLUMNS,
      rows: function (subjectId) { return App.generate.controlRows(subjectId); },
      available: function () { return true; },
      // Control coverage groups items by control and sub-groups by dataset, which
      // buildSection's single grouping axis cannot express — so it keeps a render().
      render: function (rows, ctx, opts) {
        return { body: App.generate.buildControlSection(rows, ctx, opts), children: [] };
      }
    };
  }(App));
```

Create `src/app/js/0810-providers-guidelines.js` the same way, moving `hasGuidelineDeviations` and `guidelineChildren` behind `available()` and `render()`:

```javascript
  /* =============================================================================
   * MODULE: App.providers.guidelines — CH's "Deviations from Security Guidelines"
   * PURPOSE: A section that only exists when something actually diverges. That
   *          conditionality is now expressed through the contract's available(),
   *          rather than by the module knowing what a guideline deviation is.
   * PURITY:  pure.
   * DEPENDS: App.store, App.registry, App.docProviders
   * ============================================================================= */
  (function (App) {
    'use strict';
    App.providers = App.providers || {};

    App.providers.guidelines = {
      id: 'guidelines',
      label: 'Deviations from Security Guidelines',
      keyColumn: { id: 'item', label: 'Item', w: 2, get: function (r) { return r.key; } },
      columns: [
        { id: 'description', label: 'Description', get: function (r) { return r.description || ''; } },
        { id: 'narrative', label: 'How it departs, and why', get: function (r) { return r.narrative || ''; } }
      ],
      rows: function (subjectId) { return App.generate.guidelineRows(subjectId); },
      // GUIDE-1: a section that exists solely to say "nothing diverges" is noise.
      available: function (subjectId) { return App.generate.hasGuidelineDeviations2(subjectId); },
      render: function (rows, ctx, opts) {
        return { body: '', children: App.generate.guidelineChildren2(rows, ctx, opts) };
      }
    };
  }(App));
```

Add `controlRows`, `guidelineRows`, `hasGuidelineDeviations2` and `guidelineChildren2` to `src/app/js/0350-generate/020-child-caption.js` as thin adapters over the existing `hasGuidelineDeviations`, `guidelineChildren` and `buildControlSection`, reading `App.store.getProject()` and the current platform themselves. Keep the existing functions exactly as they are — these wrappers only change how they are *called*, never what they compute.

Register both new files in `src/build.json` (not `build-doc.json` — they are host code) after the `0350-generate` parts.

- [ ] **Step 5: Make the module dispatch through providers**

In `src/doc/js/0350-doc-gen/030-report-blocks.js`, delete the `b.kind === 'control'` and `b.kind === 'guidelines'` branches from `sectionContent` and the corresponding branches from `sectionColumns`. Both now fall through to the provider path from Task 6, looked up by `b.id` against the host's provider list.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
python3 tools/build.py && node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

Remove `"generate"`, `"projectIo"` and `"overrides"` from `BOUNDARY_DEBT` in `tools/build.py` and confirm:

```bash
python3 tools/build.py --check
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "HOST-1: control coverage and guideline deviations become host providers"
```

---

### Task 8: Generalise `subject` and `filter`

**Files:**
- Modify: `src/doc/js/0350-doc-gen/030-report-blocks.js`, `src/doc/js/0590-ui-views-report-design/030-meta-pane.js`, `050-pane-generate.js`
- Create: test fragment `src/doc/js/0600-.../177-subject-and-filter.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: the module reads `host.subject.list()`, `host.subject.ready(id)`, `host.subject.meta(id)` and `host.filter.categories()` / `host.filter.categoryOf(row)`. Where `host.subject` is absent, the picker and readiness gate are omitted rather than throwing. `App.docGen.relevanceCounts` becomes `App.docGen.filterCounts(host, rows) -> {categoryKey: count}`.

- [ ] **Step 1: Write the failing test**

Create `src/doc/js/0600-.../177-subject-and-filter.js` (registered **before** the block's last entry):

```javascript
  /* ===== SUITES: the subject and the filter are host-declared (SUBJ-1 · FILT-1) ===== */

  T.suite('SUBJ-1 a host with no subject still gets a document', function (s) {
    var bare = {
      getState: function () { return { order: [], sections: [] }; },
      commit: function (m) { m({ order: [], sections: [] }); },
      clock: App.util.clock,
      sections: []
    };

    s.test('blocks build with no subject declared', function () {
      var blocks = App.docGen.reportBlocks(bare, {});
      T.assert(Array.isArray(blocks), 'no blocks produced');
      T.assert(blocks.some(function (b) { return b.kind === 'toc'; }), 'the contents block is missing');
    });

    s.test('no subject means no metadata section', function () {
      var blocks = App.docGen.reportBlocks(bare, {});
      T.assertEqual(blocks.filter(function (b) { return b.kind === 'meta'; }).length, 0,
        'a metadata section was offered with nothing to describe');
    });
  });

  T.suite('FILT-1 the filter axis is declared by the host', function (s) {
    var host = {
      getState: function () { return { order: [], sections: [] }; },
      commit: function (m) { m({ order: [], sections: [] }); },
      clock: App.util.clock,
      sections: [],
      filter: {
        id: 'band', label: 'Band',
        categories: function () { return [{ key: 'hi', label: 'High', defaultOn: true },
                                          { key: 'lo', label: 'Low', defaultOn: false }]; },
        categoryOf: function (row) { return row.band; }
      }
    };

    s.test('counts are reported per declared category', function () {
      var rows = [{ band: 'hi' }, { band: 'hi' }, { band: 'lo' }];
      T.assertDeepEqual(App.docGen.filterCounts(host, rows), { hi: 2, lo: 1 });
    });

    s.test('a category with no default is on', function () {
      var cats = host.filter.categories();
      T.assertEqual(cats[0].defaultOn, true);
      T.assertEqual(cats[1].defaultOn, false);
    });

    s.test('a host with no filter reports no categories', function () {
      T.assertDeepEqual(App.docGen.filterCounts({ sections: [] }, [{}]), {});
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter SUBJ-1
```

Expected: FAIL — `App.docGen.reportBlocks` still expects `(project, platform, opts)`.

- [ ] **Step 3: Implement**

In `src/doc/js/0350-doc-gen/030-report-blocks.js`, change `reportBlocks(project, platform, opts)` to `reportBlocks(host, opts)`. Replace:

- `platform.datasets.forEach(...)` → `(host.sections || []).forEach(...)`, one block per provider, using `provider.id` as the block id and `provider.label` as its label, and calling `provider.available` where present to set `empty`.
- the hardcoded `meta` push → conditional on `host.subject && host.subject.meta`.
- `App.docFormat.resolve(project)` → `App.docFormat.resolve(host.getState())`.

Add `filterCounts`:

```javascript
    /**
     * How many rows fall into each of the host's declared filter categories.
     * Shared by the designer's toggles and the document's omission note, so the
     * count shown before generating is the count the document states afterwards.
     */
    function filterCounts(host, rows) {
      var f = host && host.filter;
      if (!f) return {};
      var out = {};
      f.categories().forEach(function (c) { out[c.key] = 0; });
      (rows || []).forEach(function (r) {
        var k = f.categoryOf(r);
        if (out[k] !== undefined) out[k] += 1;
      });
      return out;
    }
```

In the designer, replace `App.ui.tables.relevanceBadge(k)` in `030-meta-pane.js:263` with a plain escaped label span, and `App.completeness.deviceReady(project, selId)` in `050-pane-generate.js:22` and `:206` with `host.subject.ready(selId)`. Replace `App.ui.model.getLatestConfigs(project)` in `010-esc.js:71` with `host.subject.list()`.

CH supplies the host object in Task 9; until then, construct it inline at the designer's entry point from the existing globals so the suite stays green.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python3 tools/build.py && node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

Remove `"completeness"` from `BOUNDARY_DEBT`.

- [ ] **Step 5: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "SUBJ-1/FILT-1: the subject and the row filter are host-declared"
```

---

### Task 9: The host object; `docStore` and `docTemplates` rewired

The broadest mechanical change: 41 call sites. Sequenced after the boundary check so a missed one fails the build.

**Files:**
- Create: `src/doc/js/0700-doc-host.js`
- Modify: `src/doc/js/0550-doc-store/*.js` (40 `App.store._commit` sites, 1 `getProject`), `src/doc/js/0560-doc-templates.js` (2 sites)
- Modify: `src/app/js/0620-bootstrap.js` (CH constructs and registers the host)

**Interfaces:**
- Consumes: everything above.
- Produces: `App.docHost.set(host)` / `App.docHost.get()`; `App.docHost.validate(host) -> string[]`. `docStore` mutators call `App.docHost.get().commit(fn)` instead of `App.store._commit(fn)`.

- [ ] **Step 1: Write the failing test**

Create `src/doc/js/0600-.../178-host-object.js` (registered **before** the block's last entry):

```javascript
  /* ===== SUITES: the host contract (HOSTOBJ-1) ===== */

  T.suite('HOSTOBJ-1 the module is driven by an explicit host object', function (s) {
    function minimal() {
      var state = { order: [], sections: [] };
      return {
        getState: function () { return state; },
        commit: function (m) { m(state); },
        clock: App.util.clock,
        sections: []
      };
    }

    s.test('a minimal host validates', function () {
      T.assertDeepEqual(App.docHost.validate(minimal()), []);
    });

    s.test('a host missing a required member is named, not silently accepted', function () {
      var bad = minimal(); delete bad.commit;
      var errs = App.docHost.validate(bad);
      T.assertEqual(errs.length, 1);
      T.assert(errs[0].indexOf('commit') !== -1, 'the error does not name the missing member');
    });

    s.test('a mutation goes through the host commit, not through any store', function () {
      var host = minimal(), seen = 0;
      var wrapped = Object.assign({}, host, { commit: function (m) { seen += 1; host.commit(m); } });
      App.docHost.set(wrapped);
      App.docStore.addSection({ title: 'A section' });
      T.assertEqual(seen, 1, 'docStore did not route its write through host.commit');
    });

    s.test('CH installs a host at boot', function () {
      T.assert(App.docHost.get(), 'no host installed');
      T.assertDeepEqual(App.docHost.validate(App.docHost.get()), []);
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter HOSTOBJ-1
```

Expected: FAIL — `App.docHost` is undefined.

- [ ] **Step 3: Implement the host holder**

Create `src/doc/js/0700-doc-host.js`:

```javascript
  /* =============================================================================
   * MODULE: App.docHost — the contract between the module and its host application
   * PURPOSE: Hold the one object the host supplies, and say plainly when it is
   *          malformed. Everything the module needs from the outside world arrives
   *          here; nothing is ambient, so a test constructs a host inline rather
   *          than setting up and tearing down globals.
   * PURITY:  holds one reference. No DOM, no I/O, no clock of its own.
   * DEPENDS: nothing
   * INVARIANTS: the module NEVER persists anything itself. State is read through
   *             getState() and written through commit(), so the host keeps undo,
   *             dirty-tracking and autosave working.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var _host = null;

    /** @returns {string[]} one message per contract violation; empty means valid. */
    function validate(host) {
      var errs = [];
      if (!host || typeof host !== 'object') return ['host: not an object'];
      ['getState', 'commit'].forEach(function (k) {
        if (typeof host[k] !== 'function') errs.push('host.' + k + ' is required and must be a function');
      });
      if (!host.clock || typeof host.clock.nowIso !== 'function') {
        errs.push('host.clock is required and must expose nowIso()');
      }
      if (!Array.isArray(host.sections)) errs.push('host.sections is required and must be an array');
      if (host.subject) {
        ['list', 'ready', 'meta'].forEach(function (k) {
          if (typeof host.subject[k] !== 'function') errs.push('host.subject.' + k + ' must be a function');
        });
      }
      if (host.filter) {
        ['categories', 'categoryOf'].forEach(function (k) {
          if (typeof host.filter[k] !== 'function') errs.push('host.filter.' + k + ' must be a function');
        });
      }
      return errs;
    }

    function set(host) {
      var errs = validate(host);
      if (errs.length) throw new Error('invalid document host:\n  ' + errs.join('\n  '));
      _host = host;
      return _host;
    }

    function get() { return _host; }

    /** The log sink, or a no-op. Keeps every call site free of a null check. */
    function log(level, message) {
      if (_host && typeof _host.log === 'function') _host.log(level, message);
    }

    App.docHost = { set: set, get: get, validate: validate, log: log };
  }(App));
```

Register it in both manifests, immediately before the `0710-doc-providers.js` part.

- [ ] **Step 4: Rewire the 43 call sites**

```bash
grep -rn "App\.store\._commit\|App\.store\.getProject" src/doc/js/0550-doc-store/ src/doc/js/0560-doc-templates.js | wc -l
```

Expected: 43.

```bash
sed -i 's/App\.store\._commit(/App.docHost.get().commit(/g; s/App\.store\.getProject()/App.docHost.get().getState()/g' \
  src/doc/js/0550-doc-store/*.js src/doc/js/0560-doc-templates.js
grep -rn "App\.store" src/doc/js/0550-doc-store/ src/doc/js/0560-doc-templates.js
```

Expected: no output.

Replace the 9 `App.ui.activity.log(...)` calls in `src/doc/js/0590-ui-views-report-design/060-paginate.js` and `070-wire.js` with `App.docHost.log(...)`, preserving each call's arguments.

- [ ] **Step 5: CH installs the host at boot**

In `src/app/js/0620-bootstrap.js`, after the platform registration and before the UI mounts:

```javascript
    // The document module is given its host explicitly. Note commit(): routing the
    // designer's writes through App.store._commit is what keeps undo/redo, the dirty
    // flag and the folder autosave working, none of which the module knows about.
    App.docHost.set({
      getState: function () { return App.store.getProject(); },
      commit: function (mutator) { App.store._commit(mutator); },
      clock: App.util.clock,
      log: function (level, message) { App.ui.activity.log(level, message); },
      subject: {
        list: function () {
          return App.ui.model.getLatestConfigs(App.store.getProject()).map(function (c) {
            return { id: c.id, label: c.name, sublabel: c.model };
          });
        },
        ready: function (id) { return App.completeness.deviceReady(App.store.getProject(), id); },
        meta: function (id) { return App.generate.metaFields(App.store.getProject(), id); }
      },
      sections: App.generate.hostSections(),
      filter: {
        id: 'relevance', label: 'Security Relevance',
        categories: function () {
          return App.generate.relevanceKeys().map(function (k) {
            return { key: k, label: App.generate.relevanceLabel(k),
                     defaultOn: App.ui.views.generate.REPORT_RELEVANCE_DEFAULT[k] !== false };
          });
        },
        categoryOf: function (row) { return App.generate.relevanceKeyOf(row); }
      }
    });
```

Add `App.generate.hostSections()` to `src/app/js/0350-generate/010-tool-version.js`, returning the active platform's dataset adapters followed by `App.providers.control` and `App.providers.guidelines`. Export `relevanceKeyOf`, which is currently private.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
python3 tools/build.py && node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

Remove `"store"` and `"registry"` from `BOUNDARY_DEBT`; only `"ui"` should remain.

- [ ] **Step 7: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "HOSTOBJ-1: the module is driven by an explicit host object"
```

---

### Task 10: Invert the session state

`App.ui.views.generate._gen.report` is written directly by the designer. The designer takes ownership; CH's Generate tab reads from it.

**Files:**
- Modify: `src/doc/js/0590-ui-views-report-design/010-esc.js:66-73`
- Modify: `src/app/js/0400-ui-views-generate/*.js`

**Interfaces:**
- Consumes: `App.docHost` (Task 9).
- Produces: `App.docSession.get() -> { subjectId, filename, tags, classification }` and `App.docSession.set(patch)`, owned by the module. `App.ui.views.generate._gen.report` becomes a getter delegating to it.

- [ ] **Step 1: Write the failing test**

Add to `src/app/js/0510-phase-7-self-test-suites-report-generate-det/018-session.js` — it reads `App.ui.views.generate`, so it is host-tree:

```javascript
  T.suite('SESS-1 the designer owns the description of a run', function (s) {
    s.test('the session is readable from the module', function () {
      T.assert(App.docSession && typeof App.docSession.get === 'function', 'no App.docSession');
      T.assertEqual(typeof App.docSession.get(), 'object');
    });

    s.test('a patch is visible to the host, not copied into it', function () {
      App.docSession.set({ filename: 'run-a.md' });
      T.assertEqual(App.docSession.get().filename, 'run-a.md');
      T.assertEqual(App.ui.views.generate._gen.report.filename, 'run-a.md',
        'the Generate tab is not reading through to the module session');
    });

    s.test('setting an unknown key is refused rather than silently kept', function () {
      T.assertThrows(function () { App.docSession.set({ nonsense: 1 }); });
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter SESS-1
```

Expected: FAIL — `no App.docSession`.

- [ ] **Step 3: Implement**

Add to `src/doc/js/0700-doc-host.js`, inside the same IIFE:

```javascript
    /* The ephemeral description of ONE generation run: which subject, what the file
     * will be called, the tag values, the classification banner. Not persisted — it
     * belongs to the session, not to the project.
     *
     * It lives here rather than in the host because the designer is what decides it.
     * It used to live in CH's Generate tab and be written to directly by the designer,
     * which meant two views sharing one mutable bag with no owner. */
    var _session = { subjectId: null, filename: '', tags: {}, classification: '' };
    var _SESSION_KEYS = Object.keys(_session);

    function sessionGet() { return _session; }

    function sessionSet(patch) {
      Object.keys(patch || {}).forEach(function (k) {
        if (_SESSION_KEYS.indexOf(k) === -1) {
          throw new Error('docSession: unknown key ' + k + ' (expected one of ' + _SESSION_KEYS.join(', ') + ')');
        }
        _session[k] = patch[k];
      });
      return _session;
    }

    App.docSession = { get: sessionGet, set: sessionSet, KEYS: _SESSION_KEYS };
```

In `src/doc/js/0590-ui-views-report-design/010-esc.js`, replace `session()` and `selectedDeviceId()`:

```javascript
    function session() { return App.docSession.get(); }
    function selectedSubjectId() {
      var host = App.docHost.get();
      if (!host || !host.subject) return null;
      var list = host.subject.list(), want = App.docSession.get().subjectId;
      if (want && list.some(function (c) { return c.id === want; })) return want;
      return list.length ? list[0].id : null;
    }
```

In `src/app/js/0400-ui-views-generate/`, replace the `_gen.report` property with a getter:

```javascript
      // SESS-1: the designer owns this now. Kept as a property so the Generate tab's
      // existing reads are unchanged.
      Object.defineProperty(_gen, 'report', { get: function () { return App.docSession.get(); } });
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python3 tools/build.py && node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

Remove `"ui"` from `BOUNDARY_DEBT`. It should now be an empty set.

```bash
python3 tools/build.py --check
```

Expected: clean, with no boundary violations.

- [ ] **Step 5: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "SESS-1: the designer owns the session, the Generate tab reads it"
```

---

### Task 11: Split `070-wire.js`; drop the line-cap exemption

**Files:**
- Modify: `src/doc/js/0590-ui-views-report-design/070-wire.js` (680 lines → several fragments)
- Create: `src/doc/js/0590-ui-views-report-design/072-wire-sections.js`, `074-wire-tables.js`, `076-wire-formatting.js`
- Modify: `src/line-cap-exemptions.txt`, both manifests

**Interfaces:**
- Consumes: nothing new.
- Produces: `wire(ctx)` calls `wireSections(ctx, helpers)`, `wireTables(ctx, helpers)` and `wireFormatting(ctx, helpers)`. `helpers` carries the shared closures `P`, `PL`, `dirty`, `quietly`, `include`.

- [ ] **Step 1: Write the failing test**

The test is the build rule itself. Remove the exemption first:

```bash
sed -i '/0590-ui-views-report-design\/070-wire.js/d' src/line-cap-exemptions.txt
python3 tools/build.py --check
```

Expected: FAIL — `over the 500-line cap: doc/js/0590-ui-views-report-design/070-wire.js is 680 lines`.

- [ ] **Step 2: Extract the shared closures**

At the top of `wire(ctx)`, the helpers `P`, `PL`, `dirty`, `quietly` and `include` are used by every handler. Lift them into an object built once:

```javascript
    function wireHelpers(ctx) {
      var host = App.docHost.get();
      return {
        ctx: ctx,
        state: function () { return host.getState(); },
        dirty: dirty,
        quietly: quietly,
        include: include
      };
    }
```

- [ ] **Step 3: Move the handlers into three fragments**

Split the handler registrations by concern, cutting only at top-level `dom.on(...)` boundaries:

- `072-wire-sections.js` — section list, ordering, drag/drop, add/remove/rename, headings, intros, levels
- `074-wire-tables.js` — column widths, table styling, cell editing, row and column add/remove
- `076-wire-formatting.js` — formatting profiles, fonts, header/footer, page setup, templates

Each defines one function on the module's closure:

```javascript
    function wireSections(h) {
      var dom = App.util.dom, ctx = h.ctx;
      dom.on(ctx.root, 'click', '[data-rd-add-section]', function () { /* moved verbatim */ });
      // ... the rest of the section handlers, moved unchanged
    }
```

`070-wire.js` keeps only:

```javascript
    function wire(ctx) {
      _ctx = ctx;
      var h = wireHelpers(ctx);
      wireSections(h);
      wireTables(h);
      wireFormatting(h);
    }
```

Register the three new fragments in both manifests **before** `080-app-ui-app-ui.js`, which carries the closing `})(App);`.

- [ ] **Step 4: Verify**

```bash
python3 tools/build.py && node tools/run-selftests.js
```

Expected: `0 failed`. The assertion and suite totals must have GROWN since the previous task, never shrunk — a smaller total means a suite stopped registering rather than passing.

```bash
python3 tools/build.py --check
wc -l src/doc/js/0590-ui-views-report-design/*.js
```

Expected: clean; every file at or under 500 lines.

- [ ] **Step 5: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "Split the Report Design wire() into per-concern helpers; drop its exemption"
```

---

### Task 12: Mock-host conformance test

Proves the contract serves a host that is not CH. Without this, the contract has one implementation, which is indistinguishable from having none.

**Files:**
- Create: `src/doc/js/0600-.../179-conformance-mock-host.js`
- Modify: `tools/build.py` (assert `BOUNDARY_DEBT` is empty)
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the whole contract.
- Produces: a documented, executable example of a minimal host.

- [ ] **Step 1: Write the failing test**

Create `src/doc/js/0600-.../179-conformance-mock-host.js` (registered **before** the block's last entry):

```javascript
  /* ===== SUITES: a host that is not CH (CONF-1) ===== */

  /* The direct descendant of the DOD-11 mock-platform test. If this passes, the
   * contract is real: something with no devices, no controls, no platform and no
   * registry drives the document module end to end. */

  T.suite('CONF-1 a minimal foreign host generates a document', function (s) {

    function mockHost() {
      var state = { order: [], sections: [], levels: {}, names: {} };
      return {
        getState: function () { return state; },
        commit: function (m) { m(state); },
        clock: { nowIso: function () { return '2026-01-01T00:00:00.000Z'; } },
        subject: {
          list: function () { return [{ id: 'r1', label: 'Region One' }]; },
          ready: function () { return true; },
          meta: function () { return [{ id: 'region', label: 'Region', value: 'One' }]; }
        },
        sections: [{
          id: 'staff', label: 'Staff',
          keyColumn: { id: '_key', label: 'Name', w: 2, get: function (r) { return r.name; } },
          columns: [{ id: 'role', label: 'Role', get: function (r) { return r.role; } }],
          rows: function () { return [{ name: 'Ada', role: 'Lead' }, { name: 'Grace', role: 'Engineer' }]; }
        }],
        filter: {
          id: 'band', label: 'Band',
          categories: function () { return [{ key: 'all', label: 'All', defaultOn: true }]; },
          categoryOf: function () { return 'all'; }
        }
      };
    }

    s.test('the host validates against the contract', function () {
      T.assertDeepEqual(App.docHost.validate(mockHost()), []);
    });

    s.test('its sections become orderable blocks', function () {
      var blocks = App.docGen.reportBlocks(mockHost(), {});
      var ids = blocks.map(function (b) { return b.id; });
      T.assert(ids.indexOf('staff') !== -1, 'the host section is not a block: ' + ids.join(','));
      T.assert(ids.indexOf('toc') !== -1, 'the contents block is missing');
      T.assert(ids.indexOf('meta') !== -1, 'the metadata block is missing');
    });

    s.test('it generates a document containing its own data', function () {
      var host = mockHost();
      App.docHost.set(host);
      var out = App.docGen.emitDocument(host, 'r1', {});
      T.assert(out.indexOf('Ada') !== -1, 'a row is missing from the document');
      T.assert(out.indexOf('Grace') !== -1, 'a row is missing from the document');
      T.assert(out.indexOf('Role') !== -1, 'a declared column heading is missing');
      T.assert(out.indexOf('Region One') !== -1, 'the subject metadata is missing');
    });

    s.test('it needed no core edits — no CH name appears in the host', function () {
      var src = String(mockHost);
      ['App.store', 'App.registry', 'App.generate', 'App.completeness'].forEach(function (name) {
        T.assertEqual(src.indexOf(name), -1, 'the mock host reaches for ' + name);
      });
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 tools/build.py && node tools/run-selftests.js ch-config-tool.html --filter CONF-1
```

Expected: FAIL on whichever contract member is still CH-shaped. Fix the module — not the test — until it passes. This is the task where genuine contract gaps surface.

- [ ] **Step 3: Assert the boundary debt is gone**

In `tools/build.py`:

```python
BOUNDARY_DEBT = set()   # emptied by the module extraction; must stay empty.
```

and in `check_boundary`, before the scan:

```python
    if BOUNDARY_DEBT:
        problems.append(
            "boundary: BOUNDARY_DEBT is non-empty — the extraction is incomplete. "
            f"Still allowed: {sorted(BOUNDARY_DEBT)}"
        )
```

- [ ] **Step 4: Verify everything**

```bash
python3 tools/build.py
python3 tools/build.py --check
python3 tools/build.py --check --manifest src/build-doc.json
./tools/test-build-rules.sh
node tools/run-selftests.js
```

Expected: all clean; `0 failed`; GOLD-1 green with its **original** recorded hash — the single most important line of output in this plan.

- [ ] **Step 5: Document the contract**

Add a section to `README.md` headed `## Using the document module in another app`, containing the mock host from Step 1 as a worked example, and a table of the contract's members from the spec's section 4.

Add to `CLAUDE.md`, under the hard invariants:

```markdown
- **The document module is host-agnostic.** Nothing under `src/doc/` may reference a
  name defined under `src/app/`; `tools/build.py` fails the build if it does. The host
  hands the module one object (`App.docHost.set(...)`) and the module never reaches
  back. See `docs/superpowers/specs/2026-09-08-document-designer-module-design.md`.
```

- [ ] **Step 6: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "CONF-1: a foreign host drives the document module end to end"
```

---

### Task 13: Give the module its own tests

Discovered during Task 4: **none of the 64 v2.2 suites can move to the module.** Every
one of the 17 files references `App.store`/`App.registry`/`App.ui` — including the file
holding the pure MD-1 markdown assertions, because fragments share one IIFE and its
siblings build fixtures through CH's store. The module would otherwise ship with
CONF-1 as its only test, leaving its entire suite inside one particular host.

This task ports the genuinely pure suites into `src/doc/`, written against plain
fixtures rather than the store. It runs LAST, so the tests are written against the
finished host contract rather than a moving one.

**Files:**
- Create: `src/doc/js/0900-doc-suites/010-markdown-and-outline.js`, `020-formatting.js`,
  `030-tables-and-widths.js` (new block, its own IIFE, registered in both manifests)
- Modify: `src/app/js/0600-.../*` — remove the ported suites, leaving the CH-driven ones

**Interfaces:**
- Consumes: `App.md`, `App.doc`, `App.docFormat`, `App.docGen`, `App.docHost`, `App.test`.
- Produces: a doc-tree suite block that passes with `src/app/` absent.

- [ ] **Step 1: Identify what is genuinely portable**

```bash
python3 - <<'EOF'
import re, glob
def strip(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return re.sub(r'^\s*//.*$', '', s, flags=re.M)
APP = ('store', 'registry', 'platforms', 'generate', 'completeness', 'projectIo',
       'overrides', 'ui', 'validation', 'diff', 'valueFormats')
for f in sorted(glob.glob('src/app/js/0600-*/*.js')):
    for m in re.finditer(r"T\.suite\('([^']+)'", strip(open(f).read())):
        print(m.group(1))
EOF
```

Port a suite only if every assertion in it reaches `App.md`, `App.doc`, `App.docFormat`
or `App.docGen` alone. A suite needing a project builds one as a literal design bag via
a mock host, never through `App.store`.

- [ ] **Step 2: Write the new block, one suite at a time**

For each ported suite: copy it into the new block, replace any fixture built through
`App.store` with a literal, run, confirm it passes, and only then delete the original.
Never delete first — a suite that passed in the app tree and fails in the doc tree is
telling you it was never pure.

- [ ] **Step 3: Verify the module's suite stands alone**

```bash
node tools/run-selftests.js ch-config-tool.html --filter DOCSUITE
python3 tools/build.py --manifest src/build-doc.json
node -e "new (require('jsdom').JSDOM)('<script>'+require('fs').readFileSync('doc-designer.js','utf8')+'</script>',{runScripts:'dangerously'})"
```

Expected: the ported suites pass, and `doc-designer.js` evaluates with no `src/app/`
code present at all — the proof the module is genuinely standalone.

- [ ] **Step 4: Commit**

```bash
python3 tools/gen-code-map.py
git add -A
git commit -m "The module carries its own tests"
```

---

## Done when

- `python3 tools/build.py --check` and `--check --manifest src/build-doc.json` both clean
- `./tools/test-build-rules.sh` — all cases ok
- `node tools/run-selftests.js` — 0 failed, and no suite lost since the 186 at baseline
- GOLD-1 green on its originally recorded hash: **no generated byte changed**
- `BOUNDARY_DEBT` empty and asserted
- `src/line-cap-exemptions.txt` has one entry (`app/js/0460-ui-app/030-wire.js`), not two
- `doc-designer.js` evaluates standalone, with its own suites passing (Task 13)
