#!/usr/bin/env bash
# Start the dev server on the pinned Node.
#
# Vite 8 bundles rolldown, which imports `styleText` from `node:util` — added in
# Node 20.12. A machine whose PATH still resolves an older v20 fails at import
# with "does not provide an export named 'styleText'", which reads as a broken
# install rather than a Node version. `.node-version` says 24 and `engines` says
# >=24; this makes the launcher honour that instead of inheriting whatever `node`
# happens to be first on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash)"
  fnm use >/dev/null 2>&1 || true
fi
exec npx vite "$@"
