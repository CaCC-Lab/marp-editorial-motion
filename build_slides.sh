#!/bin/bash
# Build slides.html (with GSAP motion) and slides.pdf from a Markdown file,
# using the Editorial Refined Minimalism theme (theme.css).
#
# Usage:
#   bash build_slides.sh [path/to/slides.md]
# Defaults to ./slides.md if no path is given.
#
# Requirements: Node.js (for npx marp) and Python 3 (for inject_gsap.py).

set -euo pipefail

cd "$(dirname "$0")"

SRC="${1:-slides.md}"

if [ ! -f "$SRC" ]; then
  echo "✗ Markdown not found: $SRC"
  echo ""
  echo "  Pass a slides file, e.g.:  bash build_slides.sh examples/slides.md"
  echo "  Or create ./slides.md with front-matter:"
  echo ""
  echo "    ---"
  echo "    marp: true"
  echo "    size: 16:9"
  echo "    paginate: false"
  echo "    theme: erm"
  echo "    ---"
  echo ""
  echo "  See examples/slides.md and the README for the class system."
  exit 1
fi

OUT_PDF="${SRC%.md}.pdf"
OUT_HTML="${SRC%.md}.html"

echo "[1/3] $OUT_PDF  (print / share)"
npx --yes @marp-team/marp-cli --pdf  --allow-local-files --theme ./theme.css "$SRC" -o "$OUT_PDF"

echo "[2/3] $OUT_HTML  (browser)"
npx --yes @marp-team/marp-cli --html --allow-local-files --theme ./theme.css "$SRC" -o "$OUT_HTML"

echo "[3/3] inject GSAP motion into $OUT_HTML"
python3 inject_gsap.py "$OUT_HTML"

echo ""
echo "✓ Done."
echo "  - $OUT_PDF   : static PDF"
echo "  - $OUT_HTML  : open in a browser for the animated version"
echo "  - Tweak theme.css (:root) to restyle, then rebuild."
