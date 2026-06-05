#!/bin/bash
# Convenience wrapper for bash users (macOS / Linux / WSL).
# The real build is the cross-platform Node script build.mjs — this just calls it,
# so there is a single source of truth and no Python dependency.
#
# On Windows (PowerShell), don't use this script — run `node build.mjs` directly.
#
# Usage:
#   bash build_slides.sh [path/to/slides.md]   (defaults to ./slides.md)

set -euo pipefail
cd "$(dirname "$0")"
exec node build.mjs "$@"
