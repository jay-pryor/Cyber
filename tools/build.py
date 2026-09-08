#!/usr/bin/env python3
"""Assemble ch-config-tool.html from src/.

The deliverable is still one file opened by double-clicking. This script is the only
thing that produces it: it concatenates the source files named in src/build.json, in
order, and writes the result. There is no bundler, no transpiler and no module
resolution — every fragment is already ordered classic-script JavaScript, so the build
is a concatenation and the load order stays visible in one readable manifest.

It also enforces the 500-line cap. A file over the cap fails the build unless it is
listed in src/line-cap-exemptions.txt with a reason, so a new oversized file is a
deliberate, reviewable act rather than something that happens by drift.

Usage:
    python3 tools/build.py             # write ch-config-tool.html
    python3 tools/build.py --check     # exit 1 if the built file is stale or a rule is broken
    python3 tools/build.py --stdout    # print the built file, touch nothing
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jsscan  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
MANIFEST = SRC / "build.json"
EXEMPTIONS = SRC / "line-cap-exemptions.txt"


def load_manifest():
    if not MANIFEST.exists():
        sys.exit(f"error: {MANIFEST} not found")
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


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
        if p.is_file() and p.name not in ("build.json", "line-cap-exemptions.txt")
    }
    for orphan in sorted(on_disk - listed):
        problems.append(f"orphan: {orphan} is on disk but not in build.json — it will NOT be built")

    for stale in sorted(set(exempt) - listed):
        problems.append(f"stale exemption: {stale} no longer exists — remove it from the allowlist")

    problems.extend(check_closures(manifest))

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
    args = ap.parse_args()

    manifest = load_manifest()
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
