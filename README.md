# Velox

Multi-carrier shipping platform for Canada and the US: compare rates, buy labels, track parcels.
English, French and Spanish.

**Status:** Phase 1 (foundation) complete — accounts, security, address book, admin, and a public
rate calculator using **simulated** rates. Shipping and payments arrive in Phase 2. See
[PROGRESS.md](PROGRESS.md) and [`docs/`](docs/README.md).

Stack: Angular 22 + Bootstrap 5 · FastAPI + SQLAlchemy 2 · PostgreSQL 16 · native deployment (no Docker).

## Run it locally

Prerequisites: Python 3.12+, Node 22, PostgreSQL 16.

```bash
# 1. Database
createuser -P velox            # password: velox
createdb -O velox velox
createdb -O velox velox_test   # for the test suite

# 2. API  (http://localhost:8000/api/docs)
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env           # development defaults work as-is
alembic upgrade head
python -m scripts.seed --demo  # roles + demo users
uvicorn app.main:app --reload --port 8000
# optional, in another terminal: python -m scripts.worker   (sends queued emails to the console)

# 3. Web  (http://localhost:4200)
cd frontend
npm install
npm start
```

Demo logins (development only), password `Velox-demo-2026!`:
- `demo@example.com` — customer
- `admin@example.com` — super administrator (you will be asked to set up two-factor authentication)

In development, emails are not sent; read them at `GET /api/v1/dev/emails?to=<address>`.

## Tests

```bash
cd backend && pytest                      # uses the velox_test database
cd frontend && npm test                   # unit tests (Vitest)
cd frontend && npx playwright test        # end-to-end; needs the API and web servers running
```

## Deploy

See [deploy/RUNBOOK.md](deploy/RUNBOOK.md).
