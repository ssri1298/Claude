#!/usr/bin/env bash
# Pivot — one-command installer for a fresh Ubuntu 22.04 / 24.04 cloud server.
#
#   sudo bash deploy/install.sh              # real trading app (paper mode by default)
#   sudo DEMO=1 bash deploy/install.sh       # simulated demo market instead
#   sudo DOMAIN=pivot.example.com bash deploy/install.sh   # use your own domain
#
# What it does: installs Node.js 22 + Caddy (automatic HTTPS), builds Pivot into /opt/pivot,
# runs it as a background service that restarts itself, and prints your app address.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Please run with sudo"; exit 1; fi
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/pivot
DATA=/var/lib/pivot
SERVICE=pivot
PORT=8080
if [ "${DEMO:-0}" = "1" ]; then SERVICE=pivot-demo; PORT=8081; fi

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git rsync ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "==> Installing Caddy (automatic HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# Small servers need swap to build the web app
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  echo "==> Adding 1 GB swap"
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

timedatectl set-timezone Asia/Kolkata || true

echo "==> Copying Pivot to $APP"
id -u pivot >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin pivot
mkdir -p "$APP" "$DATA"
rsync -a --delete --exclude node_modules --exclude dist --exclude data "$SRC/" "$APP/"
cd "$APP"
echo "==> Installing dependencies and building the app (takes a few minutes)"
npm ci --no-audit --no-fund
npm run build
chown -R pivot:pivot "$APP" "$DATA"

IP="$(curl -fsS https://checkip.amazonaws.com || curl -fsS https://api.ipify.org)"
IP="$(echo "$IP" | tr -d '[:space:]')"
if [ -z "${DOMAIN:-}" ]; then
  DOMAIN="$(echo "$IP" | tr '.' '-').sslip.io"
  [ "${DEMO:-0}" = "1" ] && DOMAIN="demo-$DOMAIN"
fi

echo "==> Creating the $SERVICE service"
cat > /etc/systemd/system/$SERVICE.service <<UNIT
[Unit]
Description=Pivot VCP trading agents ($SERVICE)
After=network-online.target
Wants=network-online.target

[Service]
User=pivot
WorkingDirectory=$APP
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=PIVOT_DATA=$DATA
Environment=PIVOT_PUBLIC_URL=https://$DOMAIN
$( [ "${DEMO:-0}" = "1" ] && echo "Environment=PIVOT_DEMO=1" )
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

echo "==> Configuring HTTPS for https://$DOMAIN"
mkdir -p /etc/caddy/sites
grep -q 'import sites/\*' /etc/caddy/Caddyfile 2>/dev/null || echo 'import sites/*' > /etc/caddy/Caddyfile
cat > /etc/caddy/sites/$SERVICE.caddy <<CADDY
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:$PORT {
    flush_interval -1
  }
}
CADDY

ufw allow OpenSSH >/dev/null || true
ufw allow 80/tcp >/dev/null || true
ufw allow 443/tcp >/dev/null || true
ufw --force enable >/dev/null || true

systemctl daemon-reload
systemctl enable --now $SERVICE
systemctl restart $SERVICE
systemctl reload caddy || systemctl restart caddy

cat <<DONE

  ✅ Pivot is installed and running.

  Open your app:          https://$DOMAIN
  Server's fixed IP:      $IP     ← register this in the Kite developer console (IP whitelist)
  Kite redirect URL:      https://$DOMAIN/api/kite/callback

  Useful commands:
    sudo systemctl status $SERVICE      (is it running?)
    sudo journalctl -u $SERVICE -f      (live logs)
    sudo bash $APP/deploy/update.sh     (install a newer version)

DONE
