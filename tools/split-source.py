#!/usr/bin/env python3
"""One-time migration: explode ch-config-tool.html into src/ fragments + build.json.

This is the tool that performed the monolith split. It is kept for the audit trail and
for re-running the split if the layout ever needs to be redrawn wholesale; day to day
you edit src/ and run tools/build.py, never this.

The split is a pure partition of the file's bytes. Every line lands in exactly one
source file, in order, and tools/build.py concatenates them back. Byte-identity is
therefore a property of the design, not something to hope for — and it is asserted at
the end of this script before anything is written.

Cut points inside a <script> block come from tools/jsscan.py: only lines that begin a
new statement at the enclosing IIFE's body depth, outside every string, comment,
template literal and regex. A banner comment stays attached to the code it describes.

Usage:
    python3 tools/split-source.py [--max 500] [--dry-run]
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jsscan  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "ch-config-tool.html"
SRC = ROOT / "src"

RE_SCRIPT_OPEN = re.compile(r"^\s*<script>\s*$")
RE_SCRIPT_CLOSE = re.compile(r"^\s*</script>\s*$")
RE_STYLE_OPEN = re.compile(r"^\s*<style>\s*$")
RE_STYLE_CLOSE = re.compile(r"^\s*</style>\s*$")
RE_MODULE = re.compile(r"\*\s*MODULE:\s*(\S+)")
RE_SUITE_BANNER = re.compile(r"/\*\s*=+\s*SUITES:\s*(.*?)\s*=+\s*\*/")
RE_HTML_BANNER = re.compile(r"<!--\s*=+\s*(.*?)\s*=+\s*-->")
RE_SUITE_CALL = re.compile(r"""\bT\.suite\(\s*['"](.+?)['"]""")
RE_IIFE = re.compile(r"^\s*\(function\b")
RE_FN = re.compile(r"^\s*(?:function\s+([A-Za-z0-9_$]+)|var\s+([A-Za-z0-9_$]+)\s*=)")
RE_CSS_SECTION = re.compile(r"^\s*/\*")


def slug(text, limit=44):
    """A filesystem-safe, readable stem: camelCase becomes dash-separated."""
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", text or "")
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    text = re.sub(r"-{2,}", "-", text)
    if len(text) > limit:
        text = text[:limit].rstrip("-")
    return text or "part"


def block_label(body, preceding_gap=""):
    """Name a <script> block from its banner: module name, or test-block title.

    A test block carries no MODULE header — its title lives in the HTML comment that
    sits in the gap ABOVE it, which is why the gap is passed in.
    """
    head = "".join(body[:40])
    module = RE_MODULE.search(head)
    if module:
        name = module.group(1)
        return slug(name[4:] if name.startswith("App.") else name)
    outer = RE_HTML_BANNER.search(preceding_gap or "")
    if outer:
        return slug(outer.group(1))
    wide = "".join(body[:200])
    suite = RE_SUITE_BANNER.search(wide) or RE_SUITE_CALL.search(wide)
    if suite:
        return slug("suites-" + suite.group(1))
    if "var App = window.App" in head:
        return "app-namespace-root"
    return "block"


def fragment_hint(chunk):
    """Name a fragment from the first thing it declares."""
    for line in chunk[:60]:
        banner = RE_SUITE_BANNER.search(line)
        if banner:
            return slug(banner.group(1))
    for line in chunk[:60]:
        suite = RE_SUITE_CALL.search(line)
        if suite:
            return slug(suite.group(1))
    for line in chunk[:60]:
        fn = RE_FN.match(line)
        if fn:
            return slug(fn.group(1) or fn.group(2))
    for line in chunk[:60]:
        stripped = line.strip()
        if stripped and not stripped.startswith(("*", "/*", "//", "'use strict'")):
            return slug(stripped[:40])
    return "part"


def candidates(body, depths, clean, target):
    """Line indices where a new top-level statement begins at the IIFE body depth."""
    out = []
    for i, line in enumerate(body):
        if depths[i] != target or not clean[i] or not line.strip():
            continue
        out.append(i)
    # Drop cut points that would separate a banner comment from the code it describes:
    # if the previous non-blank line is part of a comment, this is not a clean seam.
    kept = []
    for i in out:
        j = i - 1
        while j >= 0 and not body[j].strip():
            j -= 1
        if j >= 0:
            prev = body[j].strip()
            if prev.endswith("*/") or prev.startswith("//") or prev.startswith("*"):
                continue
        kept.append(i)
    return kept


def plan_cuts(body, cands, maximum):
    """Greedy: take the furthest clean seam that still fits under the cap."""
    cuts = []
    start = 0
    while len(body) - start > maximum:
        after = [c for c in cands if c > start]
        if not after:
            break  # nothing left to cut on — this fragment is unavoidably oversized
        fits = [c for c in after if c - start <= maximum]
        cut = fits[-1] if fits else after[0]
        cuts.append(cut)
        start = cut
    return cuts


def split_block(body, maximum):
    """Return a list of fragments (each a list of lines) for one <script> block."""
    plain = [line.rstrip("\n") for line in body]
    depths, clean = jsscan.scan(plain)

    target = 0
    for i, line in enumerate(plain):
        if RE_IIFE.match(line):
            target = depths[i + 1] if i + 1 < len(depths) else 0
            break

    cands = candidates(plain, depths, clean, target)
    cuts = plan_cuts(body, cands, maximum)
    bounds = [0] + cuts + [len(body)]
    return [body[a:b] for a, b in zip(bounds, bounds[1:])]


def split_css(body, maximum):
    """Split the stylesheet at top-level comment banners; keep the asset blob alone."""
    cands = [i for i, line in enumerate(body) if RE_CSS_SECTION.match(line)]
    # The embedded binary assets banner is a hard boundary: the base64 blob after it is
    # one physical line that cannot be split, and must not drag CSS along with it.
    # The banner is named in an earlier comment that explains the convention, so take
    # the LAST mention and walk back to the comment it opens.
    hits = [i for i, line in enumerate(body) if "EMBEDDED BINARY ASSETS" in line]
    asset = None
    if hits:
        asset = hits[-1]
        while asset > 0 and not RE_CSS_SECTION.match(body[asset]):
            asset -= 1
    if asset is not None and asset not in cands:
        cands.append(asset)
        cands.sort()
    if asset is None:
        cuts = plan_cuts(body, cands, maximum)
    else:
        head = plan_cuts(body[:asset], [c for c in cands if c < asset], maximum)
        cuts = head + [asset]
    bounds = [0] + cuts + [len(body)]
    return [body[a:b] for a, b in zip(bounds, bounds[1:])]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=500, help="hard cap enforced by the build")
    ap.add_argument("--target", type=int, default=380, help="pack to this, leaving headroom under the cap")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    text = SOURCE.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    opens = [i for i, l in enumerate(lines) if RE_SCRIPT_OPEN.match(l)]
    closes = [i for i, l in enumerate(lines) if RE_SCRIPT_CLOSE.match(l)]
    if len(opens) != len(closes):
        sys.exit("error: unbalanced <script> tags")

    style_open = next(i for i, l in enumerate(lines) if RE_STYLE_OPEN.match(l))
    style_close = next(i for i, l in enumerate(lines) if RE_STYLE_CLOSE.match(l))

    files = {}   # relative path -> list of lines
    parts = []   # build.json manifest entries

    def put(path, chunk):
        if path in files:
            sys.exit(f"error: duplicate source path {path}")
        files[path] = chunk
        return path

    # ---- head, up to and including <style> -------------------------------------
    parts.append({"type": "raw", "path": put("shell/head.html", lines[: style_open + 1])})

    # ---- the stylesheet --------------------------------------------------------
    css_paths = []
    for n, chunk in enumerate(split_css(lines[style_open + 1 : style_close], args.target), 1):
        stem = "assets" if any("base64," in l for l in chunk) else fragment_hint(
            [l.replace("/*", "").replace("*", "") for l in chunk]
        )
        css_paths.append(put(f"style/{n * 10:03d}-{stem}.css", chunk))
    parts.append({"type": "files", "paths": css_paths})

    # ---- </style> through to the first <script> --------------------------------
    parts.append(
        {"type": "raw", "path": put("shell/head-close.html", lines[style_close : opens[0]])}
    )

    # ---- every <script> block --------------------------------------------------
    for n, (o, c) in enumerate(zip(opens, closes), 1):
        body = lines[o + 1 : c]
        prev_gap = parts[-1].get("gap", "") if parts and parts[-1]["type"] == "script" else ""
        label = block_label(body, prev_gap)
        frags = split_block(body, args.target)
        stem = f"js/{n * 10:04d}-{label}"
        if len(frags) == 1:
            paths = [put(f"{stem}.js", frags[0])]
        else:
            paths = [
                put(f"{stem}/{k * 10:03d}-{fragment_hint(f)}.js", f)
                for k, f in enumerate(frags, 1)
            ]
        gap_end = opens[n] if n < len(opens) else len(lines)
        parts.append(
            {
                "type": "script",
                "open": lines[o],
                "close": lines[c],
                "gap": "".join(lines[c + 1 : gap_end]) if n < len(opens) else "",
                "paths": paths,
            }
        )

    # ---- everything after the last </script> -----------------------------------
    parts.append({"type": "raw", "path": put("shell/tail.html", lines[closes[-1] + 1 :])})

    manifest = {
        "output": "ch-config-tool.html",
        "lineCap": args.max,
        "parts": parts,
    }

    # ---- prove the round trip BEFORE writing anything --------------------------
    rebuilt = []
    for part in parts:
        if part["type"] == "raw":
            rebuilt.append("".join(files[part["path"]]))
        elif part["type"] == "files":
            rebuilt.extend("".join(files[p]) for p in part["paths"])
        else:
            rebuilt.append(part["open"])
            rebuilt.extend("".join(files[p]) for p in part["paths"])
            rebuilt.append(part["close"])
            rebuilt.append(part["gap"])
    if "".join(rebuilt) != text:
        sys.exit("error: round trip is not byte-identical — refusing to write src/")

    oversize = sorted(
        ((len(v), k) for k, v in files.items() if len(v) > args.max), reverse=True
    )
    print(f"{len(files)} source files, byte-identical round trip verified")
    print(f"over the {args.max}-line cap: {len(oversize)}")
    for n, path in oversize:
        print(f"  {n:5d}  {path}")

    if args.dry_run:
        return

    if SRC.exists():
        shutil.rmtree(SRC)
    for path, chunk in files.items():
        target = SRC / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("".join(chunk), encoding="utf-8")
    (SRC / "build.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {SRC}")


if __name__ == "__main__":
    main()
