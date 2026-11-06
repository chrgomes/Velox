# Project Directory Structure

```
Velox/                            repository (brand name is Colibri; see D-017)
├── README.md                     setup overview, links to docs
├── PROGRESS.md                   living progress document
├── .github/
│   ├── workflows/
│   │   ├── backend.yml           ruff, mypy, pytest (PostgreSQL service), pip-audit
│   │   └── frontend.yml          lint, unit tests, build all locales, npm audit
│   └── dependabot.yml
├── docs/                         architecture & specs (this folder)
│
├── backend/
│   ├── pyproject.toml            project metadata, ruff/mypy/pytest config
│   ├── requirements.txt          pinned runtime deps (pip-compile output)
│   ├── requirements-dev.txt      pinned dev/test deps
│   ├── .env.example              every config key, no secrets
│   ├── alembic.ini
│   ├── migrations/               Alembic env + versions/
│   ├── app/
│   │   ├── main.py               FastAPI app factory, router registration
│   │   ├── core/
│   │   │   ├── config.py         Pydantic Settings
│   │   │   ├── db.py             async engine, session dependency
│   │   │   ├── security.py       hashing, JWT, token utils, encryption
│   │   │   ├── permissions.py    require_permission(), current_user, current_account
│   │   │   ├── errors.py         error codes + exception handlers
│   │   │   ├── i18n.py           Babel setup, locale negotiation
│   │   │   ├── idempotency.py
│   │   │   ├── rate_limit.py
│   │   │   ├── logging.py
│   │   │   └── money.py          Money type, rounding
│   │   ├── modules/
│   │   │   ├── identity/         models, schemas, repository, service, router, tests/
│   │   │   ├── accounts/
│   │   │   ├── shipping/
│   │   │   ├── tracking/
│   │   │   ├── payments/
│   │   │   ├── pricing/
│   │   │   ├── notifications/
│   │   │   ├── admin/
│   │   │   └── audit/
│   │   ├── integrations/
│   │   │   ├── shipping_providers/{base.py, easypost/, mock/}
│   │   │   ├── payment_providers/{base.py, stripe/, mock/}
│   │   │   ├── email/{base.py, postmark/, console/}
│   │   │   └── storage/{base.py, spaces/, local/}
│   │   ├── jobs/                 procrastinate app + tasks
│   │   ├── templates/            email (Jinja2) + PDF templates
│   │   └── locales/              en/, fr_CA/, es_419/ gettext catalogs
│   ├── scripts/                  seed data, create superuser, maintenance
│   └── tests/                    cross-module integration & security tests, fixtures
│
├── frontend/
│   ├── package.json
│   ├── angular.json              locale build configs (en, fr-CA, es-419), prerender routes
│   ├── src/
│   │   ├── main.ts / app.config.ts / app.routes.ts
│   │   ├── styles/               _tokens.scss, _bootstrap-overrides.scss, styles.scss
│   │   ├── locale/               messages.xlf, messages.fr-CA.xlf, messages.es-419.xlf
│   │   ├── app/
│   │   │   ├── core/             auth service, interceptors, guards, error handling, api client
│   │   │   ├── shared/           ui components, pipes (money, weight), directives, models
│   │   │   ├── features/
│   │   │   │   ├── public/       home, calculator, services, carriers, faq, contact, legal…
│   │   │   │   ├── auth/         login, register, verify, reset, mfa
│   │   │   │   ├── tracking/     public + portal tracking
│   │   │   │   ├── portal/       dashboard, shipments, create wizard, checkout, addresses, settings
│   │   │   │   └── admin/        dashboard, customers, shipments, payments, pricing, reports…
│   │   │   └── layout/           public shell, portal shell, admin shell, header, footer
│   │   └── assets/               logo, icons (SVG), images
│   └── e2e/                      Playwright smoke tests
│
└── deploy/
    ├── nginx/velox-api.conf
    ├── systemd/velox-api.service, velox-worker.service
    ├── scripts/provision.sh      first-time server setup (Ubuntu LTS)
    ├── scripts/deploy.sh         pull, venv install, migrate, restart
    └── RUNBOOK.md                deploy, rollback, restore, key rotation, incident steps
```

Conventions:
- Python: snake_case modules, `ruff` formatting/linting, `mypy --strict` on `app/`.
- TypeScript: Angular style guide, kebab-case files, `ESLint` + `Prettier`.
- DB: plural snake_case tables, `id UUID` PKs (UUIDv7 generated in app for index locality),
  FK columns `<entity>_id`, timestamps `created_at`/`updated_at` on every table.
- API: `/api/v1`, plural nouns, snake_case JSON.
