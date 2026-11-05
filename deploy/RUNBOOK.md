# Velox Runbook

Native deployment: Ubuntu 24.04 LTS, nginx, systemd, Python venv. No Docker (see docs/00-decisions.md D-006).

## 1. One-time setup

1. **Database:** create a DigitalOcean Managed PostgreSQL 16 cluster (Toronto). Add the droplet as a
   trusted source. Create database `velox` and user `velox`. Use `sslmode=require` in the URL:
   `postgresql+psycopg://velox:<pw>@<host>:25060/velox?sslmode=require`.
2. **Server:** create an Ubuntu 24.04 droplet in TOR1, add your SSH key, then:
   ```bash
   git clone https://github.com/chrgomes/Velox.git /tmp/velox
   sudo bash /tmp/velox/deploy/scripts/provision.sh api.example.com
   ```
3. **Secrets:** create `/etc/velox/api.env` from `backend/.env.example`
   (`sudo chown root:velox /etc/velox/api.env && sudo chmod 640 /etc/velox/api.env`). For staging and production set at least:
   `VELOX_APP_MODE`, `VELOX_DATABASE_URL`, `VELOX_JWT_SECRET`, `VELOX_ENCRYPTION_KEY`,
   `VELOX_COOKIE_SECURE=true`, `VELOX_CORS_ORIGINS='["https://www.example.com"]'`,
   `VELOX_PUBLIC_WEB_URL`, `VELOX_EMAIL_PROVIDER=postmark`, `VELOX_POSTMARK_SERVER_TOKEN`,
   `VELOX_PASSWORD_BREACH_CHECK=true`. The app refuses to start in production with unsafe defaults.
4. **TLS:** point `api.example.com` at the droplet, then `sudo certbot --nginx -d api.example.com`.
5. **First deploy:** `sudo bash /tmp/velox/deploy/scripts/deploy.sh main`
6. **First administrator:**
   ```bash
   cd /opt/velox/current/backend
   sudo -u velox bash -c 'set -a; . /etc/velox/api.env; set +a; /opt/velox/venv/bin/python -m scripts.create_superuser --email you@example.com --first-name You --last-name Admin'
   ```
   The invite email arrives via the worker. After setting a password, the admin must enable two-factor authentication.

## 2. Frontend hosting

Build: `cd frontend && npm ci && npx ng build` → static files in `frontend/dist/frontend/browser`.
Before building, set `apiBase` in `src/environments/environment.production.ts` and the API origin in
`public/_headers` (`connect-src`).

| Option | Notes |
|---|---|
| **Cloudflare Pages** (recommended) | Free; global CDN; uses `_redirects` and `_headers` as-is. Build command `npm ci && npx ng build`, output `dist/frontend/browser`, root `frontend`. |
| DigitalOcean App Platform (static site) | Keeps everything with one vendor; free tier for static sites. Add a catch-all rewrite to `index.html` and the headers from `_headers` in the app spec. |
| Netlify | Also reads `_redirects` and `_headers` unchanged. |
| Same droplet via nginx | No extra vendor and no CDN. Serve the folder with `try_files $uri /index.html;` and copy the headers from `_headers` into the server block. |

## 3. Routine deploy

```bash
sudo bash /opt/velox/current/deploy/scripts/deploy.sh main
```
The script clones the ref into a new release folder, installs dependencies, runs migrations and the
seed, switches the `current` symlink, restarts services and checks `/api/v1/ready`. If the check
fails it rolls back the symlink automatically. **Migrations must be backward compatible** with the
previous release (add columns first, remove them in a later release).

## 4. Rollback

```bash
ls -1dt /opt/velox/releases/*                       # pick the previous release
sudo ln -sfn /opt/velox/releases/<previous> /opt/velox/current
sudo systemctl restart velox-api velox-worker
```
Only roll back the database (`alembic downgrade <rev>`) if the migration is known to be safe to reverse.

## 5. Operations

| Task | Command |
|---|---|
| Logs | `journalctl -u velox-api -f` / `journalctl -u velox-worker -f` (JSON, one request per line, with `request_id`) |
| Health | `curl -s https://api.example.com/api/v1/ready` |
| Stuck emails | Admin dashboard → "Failed emails"; rows in `email_messages` with `status='failed'` show `last_error` |
| Unlock a customer | Admin → Customers → Reactivate (also clears lockout) |
| Restart | `sudo systemctl restart velox-api velox-worker` |

## 6. Backups and restore

- Managed PostgreSQL: daily backups + point-in-time recovery (7 days), automatic.
- Weekly logical dump to Spaces (cron on the droplet, 30-day lifecycle rule):
  `pg_dump --format=custom "$DATABASE_URL_PLAIN" | s3cmd put - s3://velox-backups/$(date +%F).dump`
- **Quarterly restore drill:** restore the latest dump into a scratch database, run
  `alembic current` and spot-check row counts. Record the result in PROGRESS.md.

## 7. Key rotation

| Secret | Procedure | Effect |
|---|---|---|
| `VELOX_JWT_SECRET` | Replace, restart | All access tokens expire immediately; refresh cookies still work, so users stay signed in. |
| `VELOX_ENCRYPTION_KEY` | **Not rotatable yet** (MFA secrets are encrypted with it). Planned: MultiFernet with old+new keys. | — |
| Postmark token | Replace in Postmark and env file, restart worker | — |

## 8. Incident checklist

1. Check `/api/v1/ready`, `journalctl`, Sentry, DigitalOcean database metrics.
2. Suspected account compromise: Admin → Customers → Suspend (ends all sessions immediately).
3. Suspected key leak: rotate the secret (section 7), then review `audit_logs` for the affected period.
4. Write a short post-incident note in PROGRESS.md (what happened, impact, fix, follow-ups).
