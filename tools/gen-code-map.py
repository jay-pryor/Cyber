#!/usr/bin/env python3
"""Regenerate the code map in CLAUDE.md from the built tool + src/.

The tool is assembled from ~150 source files under src/. CLAUDE.md carries a map so a
session can find the ONE file it needs to open: every module, the source file (or
directory) it lives in, its purpose and its exported surface.

Content is read from the built ch-config-tool.html — that is where the banners and
export literals are already parsed correctly — and every line is then mapped back to
the source file it came from by replaying src/build.json.

Usage:
    python3 tools/gen-code-map.py            # rewrite the map in CLAUDE.md
    python3 tools/gen-code-map.py --check    # exit 1 if the map is stale (CI/pre-commit)
    python3 tools/gen-code-map.py --stdout   # print the map, touch nothing

The map is written between the BEGIN/END marker comments in CLAUDE.md. Everything
outside those markers is hand-written and is never touched.
"""

import argparse
import bisect
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "ch-config-tool.html"
TARGET = ROOT / "CLAUDE.md"
SRC = ROOT / "src"
MANIFEST = SRC / "build.json"

BEGIN = "<!-- BEGIN GENERATED CODE MAP -->"
END = "<!-- END GENERATED CODE MAP -->"

RE_SCRIPT_OPEN = re.compile(r"^\s*<script>\s*$")
RE_SCRIPT_CLOSE = re.compile(r"^\s*</script>\s*$")
RE_MODULE = re.compile(r"\*\s*MODULE:\s*(\S+)(.*)$")
RE_FIELD = re.compile(r"\*\s*(PURPOSE|PURITY|DEPENDS):\s*(.*)$")
RE_CONT = re.compile(r"^\s*\*\s{2,}(\S.*)$")
RE_BANNER = re.compile(r"<!--\s*=+\s*(.*?)\s*=+\s*-->")
RE_SUITE = re.compile(r"""\bT\.suite\(\s*['"](.+?)['"]""")
RE_SUITE_BANNER = re.compile(r"/\*\s*=+\s*SUITES:\s*(.*?)\s*=+\s*\*/")
RE_EXPORT_OPEN = re.compile(r"^\s{2,}(App\.[A-Za-z0-9_.]+)\s*=\s*\{\s*$")
RE_EXPORT_INLINE = re.compile(r"^\s{2,}(App\.[A-Za-z0-9_.]+)\s*=\s*\{(.+)\};\s*$")
RE_STYLE_OPEN = re.compile(r"^\s*<style>\s*$")
RE_STYLE_CLOSE = re.compile(r"^\s*</style>\s*$")


def read_lines():
    if not SOURCE.exists():
        sys.exit(f"error: {SOURCE} not found")
    return SOURCE.read_text(encoding="utf-8").split("\n")


def source_spans():
    """Replay the build to learn which source file every built line came from.

    Returns a list of (first_line, last_line, path), 1-indexed and in file order —
    the bridge that lets a map built from the assembled file point at src/.
    """
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    spans, line = [], 1

    def take(path):
        nonlocal line
        n = len((SRC / path).read_text(encoding="utf-8").splitlines())
        spans.append((line, line + n - 1, path))
        line += n

    for part in manifest["parts"]:
        if part["type"] == "raw":
            take(part["path"])
        elif part["type"] == "files":
            for path in part["paths"]:
                take(path)
        elif part["type"] == "script":
            line += 1                      # the <script> tag
            for path in part["paths"]:
                take(path)
            line += 1                      # the </script> tag
            line += part["gap"].count("\n")
    return spans


def path_at(spans, target):
    """The source path containing built-file line `target`, and the line within it."""
    i = bisect.bisect_right([s[0] for s in spans], target) - 1
    if i < 0:
        return None, 0
    first, last, path = spans[i]
    if target > last:
        return None, 0
    return path, target - first + 1


def paths_for(spans, start, end):
    """Every source path overlapping the built-file range [start, end]."""
    return [p for first, last, p in spans if first <= end and last >= start]


def describe(paths):
    """Render a module's source location: one file, or a directory and its count."""
    if not paths:
        return "—"
    if len(paths) == 1:
        return f"`src/{paths[0]}`"
    parents = {p.rsplit("/", 1)[0] for p in paths if "/" in p}
    if len(parents) == 1:
        return f"`src/{parents.pop()}/` ({len(paths)} files)"
    return ", ".join(f"`src/{p}`" for p in paths)


def script_blocks(lines):
    """Yield (start, end) 1-indexed line numbers of each top-level <script> block."""
    start = None
    for i, line in enumerate(lines, 1):
        if start is None and RE_SCRIPT_OPEN.match(line):
            start = i
        elif start is not None and RE_SCRIPT_CLOSE.match(line):
            yield start, i
            start = None


def export_keys(lines, start, end):
    """Extract the exported key names from a module's `App.x = { ... }` literal."""
    for i in range(start - 1, end):
        line = lines[i]
        inline = RE_EXPORT_INLINE.match(line)
        if inline:
            return inline.group(1), keys_from(inline.group(2))
        opened = RE_EXPORT_OPEN.match(line)
        if opened:
            body = []
            for j in range(i + 1, end):
                if re.match(r"^\s{2,}\};\s*$", lines[j]):
                    break
                body.append(lines[j])
            return opened.group(1), keys_from("\n".join(body))
    return None, []


def keys_from(body):
    """Pull `name:` keys out of an object literal body, ignoring comments."""
    body = re.sub(r"//[^\n]*", "", body)
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    seen, out = set(), []
    for name in re.findall(r"([A-Za-z_$][A-Za-z0-9_$]*)\s*:", body):
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def header_fields(lines, start, end):
    """Read the PURPOSE/PURITY/DEPENDS fields out of a module banner comment."""
    fields, current = {}, None
    for i in range(start - 1, min(end, start + 40)):
        line = lines[i]
        match = RE_FIELD.search(line)
        if match:
            current = match.group(1)
            fields[current] = match.group(2).strip()
            continue
        cont = RE_CONT.match(line)
        if cont and current:
            fields[current] += " " + cont.group(1).strip()
            continue
        if current and (RE_MODULE.search(line) or "====" in line):
            break
    return fields


def collapse(text, limit=150):
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def collect(lines, spans):
    """Walk the file once and return (modules, test_blocks, style_range)."""
    modules, tests = [], []

    style_start = style_end = None
    for i, line in enumerate(lines, 1):
        if style_start is None and RE_STYLE_OPEN.match(line):
            style_start = i
        elif style_start and style_end is None and RE_STYLE_CLOSE.match(line):
            style_end = i

    banners = {}
    for i, line in enumerate(lines, 1):
        match = RE_BANNER.search(line)
        if match and match.group(1):
            banners[i] = match.group(1)

    for start, end in script_blocks(lines):
        name = None
        extra = ""
        for i in range(start - 1, min(end, start + 6)):
            match = RE_MODULE.search(lines[i])
            if match:
                name = match.group(1)
                extra = match.group(2).strip(" —-")
                break

        if name:
            fields = header_fields(lines, start, end)
            export_path, keys = export_keys(lines, start, end)
            modules.append(
                {
                    "name": name,
                    "note": extra,
                    "start": start,
                    "end": end,
                    "purpose": collapse(fields.get("PURPOSE", "")),
                    "purity": collapse(fields.get("PURITY", ""), 40),
                    "depends": collapse(fields.get("DEPENDS", ""), 80),
                    "export": export_path,
                    "keys": keys,
                    "sources": paths_for(spans, start, end),
                }
            )
            continue

        # A test block: record each suite with its line, grouped under any
        # `/* ===== SUITES: ... ===== */` section banner that precedes it.
        suites, section = [], None
        for i in range(start - 1, end):
            banner = RE_SUITE_BANNER.search(lines[i])
            if banner:
                section = banner.group(1)
                continue
            for name in RE_SUITE.findall(lines[i]):
                path, at = path_at(spans, i + 1)
                suites.append(
                    {"line": i + 1, "name": name, "section": section,
                     "path": path, "at": at}
                )
        if suites:
            title = None
            for back in range(start - 1, max(start - 4, 0), -1):
                if back in banners:
                    title = banners[back]
                    break
            tests.append(
                {
                    "title": title or f"(unlabelled suites at line {start})",
                    "start": start,
                    "end": end,
                    "suites": suites,
                    "sources": paths_for(spans, start, end),
                }
            )

    return modules, tests, (style_start, style_end)


def render(spans, modules, tests, style):
    total = len({p for _, _, p in spans})
    out = []
    out.append(BEGIN)
    out.append("")
    out.append(
        f"_Generated by `tools/gen-code-map.py` from `src/` ({total} source files). "
        f"Do not edit by hand — re-run the script._"
    )
    out.append("")

    style_start, style_end = style
    if style_start:
        sheets = [p for p in paths_for(spans, style_start, style_end) if p.startswith("style/")]
        out.append(
            f"**Stylesheet:** `src/style/` ({len(sheets)} files). The embedded brand logo is "
            f"parked alone in `src/style/{sheets[-1].split('/')[-1]}` — a single ~19 KB base64 "
            f"line, never worth opening."
        )
        out.append("")

    out.append(f"### Modules ({len(modules)})")
    out.append("")
    out.append("| Source | Module | Purpose |")
    out.append("|---|---|---|")
    for mod in modules:
        label = mod["name"] + (f" — {mod['note']}" if mod["note"] else "")
        out.append(
            f"| {describe(mod['sources'])} | **{label}** | {mod['purpose'] or '—'} |"
        )
    out.append("")

    out.append("### Exported surface")
    out.append("")
    for mod in modules:
        if not mod["keys"]:
            continue
        path = mod["export"] or mod["name"]
        out.append(f"- **`{path}`** — " + ", ".join(f"`{k}`" for k in mod["keys"]))
    out.append("")

    total_suites = sum(len(t["suites"]) for t in tests)
    out.append(f"### Self-test blocks ({len(tests)} blocks, {total_suites} suites)")
    out.append("")
    out.append(
        "Tests are roughly a third of the code. Skip them unless the task is about a test."
    )
    out.append("")
    for block in tests:
        out.append(f"**{block['title']}** — {describe(block['sources'])}")
        out.append("")
        section = object()  # sentinel: never equal to a real section
        for suite in block["suites"]:
            if suite["section"] != section:
                section = suite["section"]
                if section:
                    out.append(f"- _{section}_")
            indent = "  " if suite["section"] else ""
            # The block header already names a single-file block; repeating the
            # filename on every suite would be noise, so show just the line there.
            if not suite["path"]:
                where = "?"
            elif len(block["sources"]) == 1:
                where = f"line {suite['at']}"
            else:
                where = f"{suite['path'].split('/')[-1]}:{suite['at']}"
            out.append(f"{indent}- `{where}` {suite['name']}")
        out.append("")

    out.append(END)
    return "\n".join(out)


def splice(existing, block):
    if BEGIN not in existing or END not in existing:
        sys.exit(
            f"error: {TARGET} is missing the {BEGIN} / {END} markers; "
            "add them where the map should live"
        )
    head = existing.split(BEGIN)[0]
    tail = existing.split(END, 1)[1]
    return head + block + tail


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit 1 if the map is stale")
    parser.add_argument("--stdout", action="store_true", help="print the map only")
    args = parser.parse_args()

    lines = read_lines()
    spans = source_spans()
    modules, tests, style = collect(lines, spans)
    block = render(spans, modules, tests, style)

    if args.stdout:
        print(block)
        return

    if not TARGET.exists():
        sys.exit(f"error: {TARGET} not found")

    existing = TARGET.read_text(encoding="utf-8")
    updated = splice(existing, block)

    if args.check:
        if existing != updated:
            print(
                "CLAUDE.md code map is stale — run: python3 tools/gen-code-map.py",
                file=sys.stderr,
            )
            sys.exit(1)
        print("CLAUDE.md code map is current.")
        return

    if existing == updated:
        print("CLAUDE.md code map already current.")
        return

    TARGET.write_text(updated, encoding="utf-8")
    print(
        f"CLAUDE.md updated: {len(modules)} modules, "
        f"{sum(len(t['suites']) for t in tests)} suites across {len(tests)} blocks."
    )


if __name__ == "__main__":
    main()
