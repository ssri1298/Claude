#!/usr/bin/env bash
# Builds a ready-to-run Scalpel bundle: prebuilt web app + server + production deps + start scripts.
# Usage: scripts/package-release.sh <output-dir>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/release}"
APP="$OUT/Scalpel"
cd "$ROOT"
npm run build >/dev/null
rm -rf "$APP" && mkdir -p "$APP"
cp -r dist server "$APP/"
cat > "$APP/package.json" <<'JSON'
{
  "name": "scalpel-study-agent",
  "version": "1.1.0",
  "private": true,
  "type": "module",
  "scripts": { "start": "node --disable-warning=ExperimentalWarning server/index.js" },
  "dependencies": { "express": "^4.22.1" },
  "engines": { "node": ">=22.13" }
}
JSON
(cd "$APP" && npm install --omit=dev --no-audit --no-fund >/dev/null)
cp "$ROOT/scripts/release/"* "$APP/"
chmod +x "$APP/Start Scalpel (Mac).command" "$APP/start-linux.sh"
(cd "$OUT" && rm -f Scalpel.zip && zip -qr Scalpel.zip Scalpel)
echo "$OUT/Scalpel.zip"
