#!/usr/bin/env bash
# Deploy a git revision of the API to this server. Run as root (or via sudo).
# Usage: sudo bash deploy.sh <git-ref>     e.g. sudo bash deploy.sh main
set -euo pipefail
REF="${1:-main}"
REPO="${VELOX_REPO:-https://github.com/chrgomes/Velox.git}"
RELEASE="/opt/velox/releases/$(date -u +%Y%m%d%H%M%S)"

sudo -u velox git clone --depth 1 --branch "$REF" "$REPO" "$RELEASE"
[ -d /opt/velox/venv ] || sudo -u velox python3.12 -m venv /opt/velox/venv
sudo -u velox /opt/velox/venv/bin/pip install --quiet --upgrade pip
sudo -u velox /opt/velox/venv/bin/pip install --quiet -r "$RELEASE/backend/requirements.txt"

# Migrations run before the switch; they must stay backward compatible with the running release.
sudo -u velox bash -c "set -a; . /etc/velox/api.env; set +a; cd '$RELEASE/backend' \
  && /opt/velox/venv/bin/alembic upgrade head && /opt/velox/venv/bin/python -m scripts.seed"

PREVIOUS="$(readlink -f /opt/velox/current || true)"
ln -sfn "$RELEASE" /opt/velox/current
systemctl restart velox-api velox-worker

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8000/api/v1/ready >/dev/null; then
    echo "Deployed $REF -> $RELEASE"
    ls -1dt /opt/velox/releases/* | tail -n +6 | xargs -r rm -rf   # keep 5 releases
    exit 0
  fi
  sleep 1
done

echo "Health check failed; rolling back to $PREVIOUS" >&2
if [ -n "$PREVIOUS" ]; then
  ln -sfn "$PREVIOUS" /opt/velox/current
  systemctl restart velox-api velox-worker
fi
exit 1
