#!/usr/bin/env python3
"""Assemble dist/ — the document module as a folder you can copy into another project.

The module's JavaScript is already a build target (src/build-doc.json). Its CSS is not:
the designer's rules still live in CH's single stylesheet, interleaved with the
application's. Physically splitting that file would reorder the cascade in
ch-config-tool.html, so this EXTRACTS instead, and does it from the data rather than by
eye: a rule reaches dist/doc-designer.css when every class and id its selector names is
one the module's own code emits, plus the token, reset and element rules everything
rests on.

That makes the split checkable rather than a matter of judgement, which is the point —
`--check` fails if a rule the workspace needs was left behind, or if an application-only
rule leaked into the distributable, where it could restyle somebody else's page.

Usage:
  python3 tools/build-dist.py            # write dist/
  python3 tools/build-dist.py --check    # verify dist/ is up to date, write nothing
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

# What the module's own code puts in the DOM. Everything else in the stylesheet belongs
# to whatever application is hosting it.
DOC_JS = sorted((SRC / "doc" / "js").rglob("*.js"))
# Generic rules: no class, no id — the design tokens, the reset, the element defaults.
# The workspace inherits all of it, and a host page that already has its own is free to
# delete this block: it is at the top of the file, on its own, and labelled.
GENERIC = re.compile(r"^[a-z:*\[][^.#]*$", re.I)
# The module's namespaces. Scanning the code finds most of what it emits, but not the
# names it composes — `rd-nav-` + depth, `prv-h` + level, a relevance key appended to
# `rd-cat-`. Those are the module's just as much as the literal ones, and a rule styling
# one of them is not optional: without this, the preview's headings and the workspace's
# tabs would arrive in another project unstyled, which is a hard thing to debug from a
# stylesheet that looks complete.
PREFIXES = ("rd-", "prv-", "rpt-", "ord-")
# Modifier classes the module composes onto its own elements at runtime — `rd-tab` plus
# ` on`, `ord-step` plus ` off`. They carry no styling of their own; they only ever
# qualify something else, so they never pull an application rule across on their own.
STATES = ("on", "off", "auto", "sel", "dragging", "drop-target", "primary", "danger",
          "muted", "empty", "open", "paged")


def emitted_names():
    """Every class and id the module's code writes into the page."""
    classes, ids = set(), set()
    ident = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
    for f in DOC_JS:
        t = f.read_text(encoding="utf-8")
        for m in re.finditer(r'class="([^"{}]*)"', t):
            classes.update(c for c in m.group(1).split() if ident.match(c))
        for m in re.finditer(r"classList\.(?:add|remove|toggle|contains)\('([^']+)'\)", t):
            if ident.match(m.group(1)):
                classes.add(m.group(1))
        for m in re.finditer(r'id="([A-Za-z][A-Za-z0-9_-]*)"', t):
            ids.add(m.group(1))
        for m in re.finditer(r"getElementById\('([A-Za-z][A-Za-z0-9_-]*)'\)", t):
            ids.add(m.group(1))
    return classes, ids


def app_css():
    """CH's stylesheet, concatenated exactly as the application build concatenates it."""
    manifest = json.loads((SRC / "build.json").read_text(encoding="utf-8"))
    parts = [p for part in manifest["parts"] if part["type"] == "files" for p in part["paths"]]
    return "".join((SRC / p).read_text(encoding="utf-8") for p in parts), parts


def blocks(css):
    """Top-level items: (kind, prelude, body, raw). Comments are dropped."""
    out, i, n = [], 0, len(css)
    while i < n:
        if css.startswith("/*", i):
            i = css.find("*/", i)
            i = n if i == -1 else i + 2
            continue
        if css[i].isspace():
            i += 1
            continue
        j = css.find("{", i)
        if j == -1:
            break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == "{":
                depth += 1
            elif css[k] == "}":
                depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        out.append(("at" if prelude.startswith("@") else "rule", prelude, body))
        i = k
    return out


def wanted(selector, classes, ids):
    """A selector belongs to the module when every name in it is the module's own."""
    sel = re.sub(r"/\*.*?\*/", "", selector, flags=re.S).strip()
    if not sel:
        return False
    used_c = set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]*)", sel))
    used_i = set(re.findall(r"#([A-Za-z][A-Za-z0-9_-]*)", sel))
    if not used_c and not used_i:
        return bool(GENERIC.match(sel))
    def mine(name, seen):
        return name in seen or name.startswith(PREFIXES) or name in STATES
    return (all(mine(c, classes) for c in used_c) and all(mine(i, ids) for i in used_i))


def filter_selectors(prelude, classes, ids):
    keep = [s for s in prelude.split(",") if wanted(s, classes, ids)]
    return ", ".join(s.strip() for s in keep)


def module_css():
    css, _ = app_css()
    classes, ids = emitted_names()
    kept, dropped = [], 0
    for kind, prelude, body in blocks(css):
        if kind == "at":
            inner = []
            for k2, p2, b2 in blocks(body):
                sel = filter_selectors(p2, classes, ids) if k2 == "rule" else p2
                if sel:
                    inner.append("    %s {%s}" % (sel, b2.rstrip()))
                else:
                    dropped += 1
            if inner:
                kept.append("%s {\n%s\n  }" % (prelude, "\n".join(inner)))
            continue
        sel = filter_selectors(prelude, classes, ids)
        if sel:
            kept.append("  %s {%s}" % (sel, body.rstrip()))
        else:
            dropped += 1
    head = (
        "/* doc-designer.css — the document designer's styles, extracted from the CH\n"
        " * Config Tool's stylesheet by tools/build-dist.py.\n"
        " *\n"
        " * A rule is here because every class and id its selector names is one the module\n"
        " * itself puts in the page. The first rules are the design tokens, the reset and the\n"
        " * element defaults everything else rests on: if your page already has its own, they\n"
        " * are yours to delete.\n"
        " *\n"
        " * Generated file — do not edit. Re-run: python3 tools/build-dist.py\n"
        " */\n"
    )
    return head + "\n".join(kept) + "\n", dropped


def check_coverage(css_out):
    """Nothing the workspace needs may be missing, and nothing else may be present."""
    classes, ids = emitted_names()
    src_css, _ = app_css()
    problems = []
    for kind, prelude, body in blocks(src_css):
        if kind == "at":
            continue
        for sel in prelude.split(","):
            if wanted(sel, classes, ids) and re.search(r"[.#]", sel):
                name = re.findall(r"[.#]([A-Za-z][A-Za-z0-9_-]*)", sel)[-1]
                if name not in css_out:
                    problems.append("missing from dist/doc-designer.css: %s" % sel.strip())
    for kind, prelude, body in blocks(css_out):
        if kind == "at":
            continue
        for sel in prelude.split(","):
            if not wanted(sel, classes, ids):
                problems.append("leaked into dist/doc-designer.css: %s" % sel.strip())
    # The other direction, and the one that actually bit: a rule that plainly styles the
    # module — its selector is in one of the module's namespaces — must not be left behind
    # merely because the scanner never saw that class written out in full.
    for kind, prelude, body in blocks(src_css):
        inner = [prelude] if kind == "rule" else [p for k, p, _ in blocks(body) if k == "rule"]
        for pre in inner:
            for sel in pre.split(","):
                # The TARGET of the selector, not any ancestor: `.rpt-rel .badge` styles a
                # badge, which is the application's, and leaving it behind is right.
                target = re.split(r"[\s>+~]+", sel.strip())[-1]
                names = re.findall(r"[.#]([A-Za-z][A-Za-z0-9_-]*)", target)
                if any(n.startswith(PREFIXES) for n in names) and not wanted(sel, classes, ids):
                    problems.append("a module rule was left with the application: %s" % sel.strip())
    return problems


def main():
    check = "--check" in sys.argv
    css, dropped = module_css()
    problems = check_coverage(css)
    if problems:
        for p in problems[:20]:
            print("dist: " + p)
        sys.exit(1)

    js = subprocess.run([sys.executable, str(ROOT / "tools" / "build.py"),
                         "--manifest", "src/build-doc.json"] + (["--check"] if check else []),
                        cwd=ROOT)
    if js.returncode:
        sys.exit(js.returncode)

    target = DIST / "doc-designer.css"
    if check:
        current = target.read_text(encoding="utf-8") if target.exists() else ""
        if current != css:
            print("dist: doc-designer.css is stale — run python3 tools/build-dist.py")
            sys.exit(1)
        print("dist: up to date (%d rules kept for the module, %d left with the application)"
              % (css.count("{"), dropped))
        return
    DIST.mkdir(exist_ok=True)
    target.write_text(css, encoding="utf-8")
    print("dist: wrote doc-designer.css — %d rules kept, %d left with the application"
          % (css.count("{"), dropped))


if __name__ == "__main__":
    main()
