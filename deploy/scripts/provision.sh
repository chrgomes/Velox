#!/usr/bin/env bash
# First-time setup of an Ubuntu 24.04 LTS droplet for the Velox API. Run as root.
# Usage: sudo bash provision.sh api.example.com
set -euo pipefail
DOMAIN="${1:?usage: provision.sh <api-domain>}"

apt-get update
apt-get -y upgrade
apt-get -y install python3.12 python3.12-venv python3-pip nginx certbot python3-certbot-nginx git \
  postgresql-client ufw unattended-upgrades fail2ban

# Firewall: SSH + HTTP(S) only.
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades

# Service user and directories.
id velox >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/velox --shell /usr/sbin/nologin velox
install -d -o velox -g velox /opt/velox/releases /var/log/velox
install -d -m 750 -o root -g velox /etc/velox
if [ ! -f /etc/velox/api.env ]; then
  echo "Create /etc/velox/api.env from backend/.env.example (chmod 640, group velox) before deploying."
fi

# nginx
cp "$(dirname "$0")/../nginx/velox-proxy.conf" /etc/nginx/snippets/velox-proxy.conf
sed "s/api.example.com/${DOMAIN}/g" "$(dirname "$0")/../nginx/velox-api.conf" > /etc/nginx/sites-available/velox-api
ln -sf /etc/nginx/sites-available/velox-api /etc/nginx/sites-enabled/velox-api
rm -f /etc/nginx/sites-enabled/default
install -d /var/www/certbot

# systemd units
cp "$(dirname "$0")"/../systemd/velox-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable velox-api velox-worker

echo "Next: point DNS for ${DOMAIN} at this server, run: certbot --nginx -d ${DOMAIN}, then deploy.sh"
