#!/usr/bin/env bash
# Update Pivot to the latest version from GitHub and restart it. Your data is kept.
#   sudo bash /opt/pivot/deploy/update.sh
set -euo pipefail
SRC="${SRC:-$HOME/Claude/pivot}"
if [ -d "$SRC/.git" ] || [ -d "$SRC/../.git" ]; then
  (cd "$SRC" && git pull --ff-only)
fi
cd "$SRC"
DEMO="${DEMO:-0}" bash deploy/install.sh
