#!/usr/bin/env python3
"""Assemble the deliverables from src/.

The deliverable is still one file opened by double-clicking. This script is the only
thing that produces it: it concatenates the source files named in src/build.json, in
order, and writes the result. There is no bundler, no transpiler and no module
resolution — every fragment is already ordered classic-script JavaScript, so the build
is a concatenation and the load order stays visible in one readable manifest.

It also enforces the 500-line cap. A file over the cap fails the build unless it is
listed in src/line-cap-exemptions.txt with a reason, so a new oversized file is a
deliberate, reviewable act rather than something that happens by drift.

There is more than one target. src/build.json builds the application; other
src/build*.json manifests build a subset from the same fragments — the document
module has its own. Orphan detection unions across every manifest, so a file
built by one target is not reported as an orphan of another.

Usage:
    python3 tools/build.py                          # write ch-config-tool.html
    python3 tools/build.py --check                  # exit 1 if stale or a rule is broken
    python3 tools/build.py --stdout                 # print the built file, touch nothing
    python3 tools/build.py --manifest src/build-doc.json    # build another target
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jsscan  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
MANIFEST = SRC / "build.json"
EXEMPTIONS = SRC / "line-cap-exemptions.txt"

APP_TREE = "app"
DOC_TREE = "doc"

# `App.foo = ` / `App.foo.bar = ` — where a module publishes its exported surface.
_DEFINES = re.compile(r"^\s*App\.([A-Za-z0-9_.]+)\s*=", re.M)
_REFERENCES = re.compile(r"App\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)")

# Names src/doc/ is still allowed to reach for, each removed by a task in
# docs/superpowers/plans/2026-09-08-document-designer-module.md.
# This set only ever shrinks. The final task asserts it is empty.
BOUNDARY_DEBT = set()


def load_manifest(path=None):
    target = Path(path) if path else MANIFEST
    if not target.is_absolute():
        target = ROOT / target
    if not target.exists():
        sys.exit(f"error: {target} not found")
    return json.loads(target.read_text(encoding="utf-8"))


def all_manifest_paths():
    """Every source path referenced by ANY manifest, for orphan detection.

    A fragment of the document module is named by both the application manifest and
    the module's own; a fragment of the application only by the first. Orphan
    detection asks "is this file built by anything?", so it has to union across
    manifests — asking one at a time would report every module-only file as an
    orphan of the application build.
    """
    seen = set()
    for m in sorted(SRC.glob("build*.json")):
        seen.update(manifest_paths(json.loads(m.read_text(encoding="utf-8"))))
    return seen


def is_manifest(path):
    return path.parent == SRC and path.name.startswith("build") and path.suffix == ".json"


def load_exemptions():
    """path -> reason, for files deliberately allowed over the cap."""
    out = {}
    if not EXEMPTIONS.exists():
        return out
    for n, line in enumerate(EXEMPTIONS.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        path, _, reason = line.partition(" ")
        reason = reason.strip()
        if not reason:
            sys.exit(f"error: {EXEMPTIONS}:{n}: '{path}' has no reason — every exemption needs one")
        out[path] = reason
    return out


def manifest_paths(manifest):
    """Every source path the manifest references, in build order."""
    paths = []
    for part in manifest["parts"]:
        if part["type"] == "raw":
            paths.append(part["path"])
        else:
            paths.extend(part["paths"])
    return paths


def check_closures(manifest):
    """Every fragment of a block must stay INSIDE that block's IIFE.

    The last fragment of a wrapped block carries the closing `})(App);`. Append a new
    fragment after it and the code lands outside the closure, where the module's
    helpers are not in scope — which fails at runtime, not in the suite, and so is
    easy to miss. Catch it here instead: once the wrapper opens, no fragment boundary
    may return to depth zero until the block ends.
    """
    problems = []
    for part in manifest["parts"]:
        if part["type"] != "script":
            continue
        body, bounds = [], []
        for path in part["paths"]:
            target = SRC / path
            if not target.exists():
                break
            body.extend(target.read_text(encoding="utf-8").splitlines())
            bounds.append((len(body), path))
        else:
            depths, _ = jsscan.scan(body + [""])
            if depths[-1] != 0:
                problems.append(
                    f"unbalanced block: {part['paths'][0]} … leaves depth {depths[-1]} "
                    f"— a bracket is unclosed across this block's fragments"
                )
                continue
            if len(bounds) > 1 and depths[bounds[0][0]] > 0:
                for at, path in bounds[:-1]:
                    if depths[at] == 0:
                        problems.append(
                            f"outside the closure: everything after {path} sits OUTSIDE "
                            "its block's IIFE. A new fragment goes BEFORE the last one, "
                            "which carries the closing `})(App);`."
                        )
                        break
    return problems


def _strip_comments(text):
    """Block and line comments removed, so a DEPENDS: banner is not a reference.

    Crude by design: it does not track string literals. A false positive here is a
    build failure naming a file and a line, which costs a moment to inspect; a false
    negative would let the boundary rot silently, which costs the module.
    """
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"^\s*//.*$", "", text, flags=re.M)


def check_boundary():
    """No file under src/doc/ may reference a name that src/app/ defines.

    This is what keeps the document module reusable. The dependency runs one way:
    the application hands the module an explicit host object, and the module never
    reaches back. Enforced here rather than by convention, because a rule a script
    enforces outlives one written in a document.
    """
    problems = []
    if BOUNDARY_DEBT:
        problems.append(
            "boundary: BOUNDARY_DEBT is non-empty — the extraction is incomplete. "
            f"Still allowed: {sorted(BOUNDARY_DEBT)}"
        )

    app_names = set()
    for path in sorted((SRC / APP_TREE).rglob("*.js")) if (SRC / APP_TREE).is_dir() else []:
        for m in _DEFINES.finditer(_strip_comments(path.read_text(encoding="utf-8"))):
            app_names.add(m.group(1).split(".")[0])
    if not app_names:
        return problems

    for path in sorted((SRC / DOC_TREE).rglob("*.js")) if (SRC / DOC_TREE).is_dir() else []:
        rel = path.relative_to(SRC)
        for n, line in enumerate(_strip_comments(path.read_text(encoding="utf-8")).splitlines(), 1):
            for m in _REFERENCES.finditer(line):
                root = m.group(1).split(".")[0]
                if root in app_names and root not in BOUNDARY_DEBT:
                    problems.append(
                        f"boundary: {rel}:{n} references App.{root}, which src/app/ owns. "
                        "The module must receive this through its host contract instead."
                    )
    return problems


def check_rules(manifest, paths):
    """Cap enforcement + orphan detection. Returns a list of problems."""
    cap = manifest.get("lineCap", 500)
    exempt = load_exemptions()
    problems = []

    listed = set(paths)
    for path in paths:
        target = SRC / path
        if not target.exists():
            problems.append(f"missing: {path} is in build.json but not on disk")
            continue
        count = len(target.read_text(encoding="utf-8").splitlines())
        if count > cap and path not in exempt:
            problems.append(
                f"over the {cap}-line cap: {path} is {count} lines. Split it, or add it "
                f"to src/line-cap-exemptions.txt with a reason."
            )

    on_disk = {
        str(p.relative_to(SRC))
        for p in SRC.rglob("*")
        if p.is_file() and p.name != "line-cap-exemptions.txt" and not is_manifest(p)
    }
    built_by_something = all_manifest_paths()
    for orphan in sorted(on_disk - built_by_something):
        problems.append(f"orphan: {orphan} is on disk but not in any build*.json — it will NOT be built")

    for stale in sorted(set(exempt) - built_by_something):
        problems.append(f"stale exemption: {stale} no longer exists — remove it from the allowlist")

    problems.extend(check_closures(manifest))
    problems.extend(check_boundary())

    return problems


def assemble(manifest):
    chunks = []
    for part in manifest["parts"]:
        if part["type"] == "raw":
            chunks.append((SRC / part["path"]).read_text(encoding="utf-8"))
        elif part["type"] == "files":
            for path in part["paths"]:
                chunks.append((SRC / path).read_text(encoding="utf-8"))
        elif part["type"] == "script":
            chunks.append(part["open"])
            for path in part["paths"]:
                chunks.append((SRC / path).read_text(encoding="utf-8"))
            chunks.append(part["close"])
            chunks.append(part["gap"])
        else:
            sys.exit(f"error: unknown part type {part['type']!r} in build.json")
    return "".join(chunks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify only; write nothing")
    ap.add_argument("--stdout", action="store_true", help="print the built file")
    ap.add_argument("--manifest", default=None, help="manifest to build (default src/build.json)")
    args = ap.parse_args()

    manifest = load_manifest(args.manifest)
    paths = manifest_paths(manifest)

    problems = check_rules(manifest, paths)
    if problems:
        for problem in problems:
            print(f"build: {problem}", file=sys.stderr)
        sys.exit(1)

    built = assemble(manifest)
    output = ROOT / manifest["output"]

    if args.stdout:
        sys.stdout.write(built)
        return

    if args.check:
        current = output.read_text(encoding="utf-8") if output.exists() else None
        if current != built:
            print(
                f"build: {manifest['output']} is stale — run python3 tools/build.py",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"build: {manifest['output']} is up to date ({len(paths)} source files)")
        return

    output.write_text(built, encoding="utf-8")
    lines = built.count("\n")
    print(f"build: wrote {manifest['output']} — {len(paths)} source files, {lines:,} lines")


if __name__ == "__main__":
    main()
