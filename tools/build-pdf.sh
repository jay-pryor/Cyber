#!/usr/bin/env bash
#
# DOD-8, as a command instead of a manual check.
#
# Generates a report from ch-config-tool.html, converts it with pandoc + tectonic, and
# renders the pages to PNGs so they can be looked at. Every emitted-artifact defect in
# this repo's register was found by running the artifact rather than by reading the code
# that produced it (D-010, D-012, D-016, D-018, D-046, D-047, D-048) — this is what makes
# that cheap enough to do every time.
#
#   tools/build-pdf.sh [outdir]
#
# The two binaries are fetched on first use into <outdir>/bin and reused after that. The
# TOOL itself remains offline and dependency-free; this is developer tooling and lives
# outside it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-${TMPDIR:-/tmp}/ch-pdf}"
BIN="$OUT/bin"
PANDOC_VERSION=3.1.11
TECTONIC_VERSION=0.15.0

mkdir -p "$BIN"
export PATH="$BIN:$PATH"

if [ ! -x "$BIN/pandoc" ]; then
  echo "· fetching pandoc $PANDOC_VERSION"
  curl -sSL "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz" \
    | tar xz -C "$OUT"
  cp "$OUT/pandoc-${PANDOC_VERSION}/bin/pandoc" "$BIN/"
fi
if [ ! -x "$BIN/tectonic" ]; then
  echo "· fetching tectonic $TECTONIC_VERSION"
  curl -sSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    | tar xz -C "$BIN"
fi

# The document. Kept beside this script rather than inline so it can be edited to
# reproduce a report without touching the runner.
echo "· generating report.md"
NODE_PATH="${NODE_PATH:-$ROOT/node_modules}" node "$ROOT/tools/make-reference-doc.js" "$OUT/report.md"

# The user's own Lua filter when the repo carries one — the PDF people actually get is
# the one built through it, so that is the one worth checking.
FILTER=()
if [ -f "$ROOT/pdfGenLuaConfig.lua" ]; then
  echo "· using pdfGenLuaConfig.lua"
  FILTER=(--lua-filter="$ROOT/pdfGenLuaConfig.lua")
fi

echo "· building report.pdf"
pandoc "$OUT/report.md" "${FILTER[@]}" --pdf-engine=tectonic -o "$OUT/report.pdf" 2>"$OUT/tex.log" || true
sed 's/^/  /' "$OUT/tex.log" | grep -v 'warnings were issued' || true

if command -v pdftoppm >/dev/null; then
  rm -f "$OUT"/page-*.png
  pdftoppm -png -r 110 "$OUT/report.pdf" "$OUT/page"
  echo "· pages: $(ls "$OUT"/page-*.png | wc -l)"
fi

# Overfull boxes are the standing measure of whether the width model is holding (D-024,
# D-027). Read from the log of the build just done rather than by building a second time.
# Anything over a point is worth chasing; the sub-0.2pt ones are longtable rounding and
# have been there since v2.2.
BIG=$(grep -oE 'Overfull \\hbox \([0-9.]+pt' "$OUT/tex.log" \
  | sed -E 's/.*\(([0-9.]+)pt/\1/' | awk '$1 > 1' | sort -rn -u || true)
if [ -n "$BIG" ]; then
  echo "· overfull boxes over 1pt: $(echo "$BIG" | tr '\n' ' ')"
else
  echo "· no overfull box over 1pt"
fi

echo "· done: $OUT/report.pdf"
