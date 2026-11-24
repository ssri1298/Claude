#!/usr/bin/env bash
# Pivot in-app updater (runs as root, started by systemd when the app leaves a request).
#
# The web app (user "pivot") never gets root. It only writes
#   /var/lib/pivot/update/request.json   {"action":"check"|"update","token":"<optional GitHub token>"}
# and systemd's pivot-update.path unit starts this script, which:
#   check  → git fetch, report how many new versions are available
#   update → git pull (as the repository's owner), run deploy/install.sh, report the result
# Results go to /var/lib/pivot/update/status.json for the app to show.
# This file is installed to /opt/pivot-updater (root-owned) so the app cannot change it.
set -uo pipefail

DIR="${PIVOT_UPDATE_DIR:-/var/lib/pivot/update}"
REQ="$DIR/request.json"
STATUS="$DIR/status.json"
LOG="$DIR/update.log"
SRC="$(cat "${PIVOT_SOURCE_FILE:-/etc/pivot/source}" 2>/dev/null || true)"

[ -f "$REQ" ] || exit 0
ACTION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("action","check"))' "$REQ" 2>/dev/null || echo check)"
TOKEN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("token",""))' "$REQ" 2>/dev/null || true)"
rm -f "$REQ"

status() { # state message [extra-json]
  python3 - "$STATUS" "$1" "$2" "${3:-}" <<'PY'
import json, sys, datetime
path, state, msg, extra = sys.argv[1:5]
data = {"state": state, "message": msg, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
if extra:
    try:
        data.update(json.loads(extra))
    except Exception:
        pass
json.dump(data, open(path, "w"))
PY
  chown pivot:pivot "$STATUS" 2>/dev/null || true
}

if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  status error "The updater does not know where Pivot's code is. Run the install command once from the SSH terminal."
  exit 0
fi
OWNER="$(stat -c %U "$SRC")"
REPO="$(git -c safe.directory='*' -C "$SRC" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO" ]; then
  status error "Pivot's code folder is not a git repository, so it cannot be updated automatically."
  exit 0
fi

g() { # run git as the repository owner (never as root), with an optional GitHub token
  if [ -n "$TOKEN" ]; then
    local auth
    auth="$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"
    sudo -u "$OWNER" env GIT_TERMINAL_PROMPT=0 git -C "$REPO" -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" "$@"
  else
    sudo -u "$OWNER" env GIT_TERMINAL_PROMPT=0 git -C "$REPO" "$@"
  fi
}

versions() { # JSON with current/latest commit + list of new commits
  python3 - "$REPO" "$OWNER" <<'PY'
import json, subprocess, sys
repo, owner = sys.argv[1:3]
def git(*a):
    return subprocess.run(["sudo", "-u", owner, "git", "-C", repo, *a], capture_output=True, text=True).stdout.strip()
cur = git("log", "-1", "--format=%h|%cI|%s").split("|", 2)
up = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
behind = int(git("rev-list", "--count", "HEAD..@{u}") or 0) if up else 0
new = [dict(zip(["commit", "date", "subject"], l.split("|", 2))) for l in git("log", "--format=%h|%cI|%s", "HEAD..@{u}").splitlines()[:30]] if up else []
print(json.dumps({"current": dict(zip(["commit", "date", "subject"], cur)), "branch": up, "behind": behind, "newVersions": new}))
PY
}

FETCH_ERR="$(g fetch --quiet 2>&1)"
if [ $? -ne 0 ]; then
  if echo "$FETCH_ERR" | grep -qiE "auth|could not read Username|403|not found"; then
    status error "GitHub asked for a login. Add a read-only GitHub token in Settings → App updates and try again." "{\"needsToken\": true}"
  else
    status error "Could not reach GitHub: $(echo "$FETCH_ERR" | tail -1 | tr '"' "'")"
  fi
  exit 0
fi

if [ "$ACTION" = "check" ]; then
  V="$(versions)"
  BEHIND="$(echo "$V" | python3 -c 'import json,sys; print(json.load(sys.stdin)["behind"])')"
  if [ "$BEHIND" -gt 0 ]; then status available "$BEHIND new version(s) available" "$V"; else status uptodate "Pivot is up to date" "$V"; fi
  exit 0
fi

# ---- update
status updating "Downloading the new version…" "$(versions)"
PULL_ERR="$(g pull --ff-only 2>&1)"
if [ $? -ne 0 ]; then
  status error "Could not download the update: $(echo "$PULL_ERR" | tail -1 | tr '"' "'")"
  exit 0
fi
status updating "Installing — Pivot will restart in a minute or two…" "$(versions)"
if bash "${PIVOT_INSTALLER:-$SRC/deploy/install.sh}" >"$LOG" 2>&1; then
  status done "Updated successfully" "$(versions)"
else
  status error "The installer failed — see the last lines of the update log" "{\"log\": $(tail -15 "$LOG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
fi
chown pivot:pivot "$LOG" 2>/dev/null || true
