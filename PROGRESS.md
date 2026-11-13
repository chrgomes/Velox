# Project Progress

_Last updated: 2026-11-13_

## Current phase
**On hold until the new year (paused 2026-11-13).** Phase 1 (foundation) is code complete and
redesigned; staging deployment waits on the domain.

## Where we left off
- **Open pull request #13** (ready to merge): rename to **Colibri**, Better Stack instead of Sentry
  (D-018), mobile app planned after launch (D-019, roadmap M1/M2).
- **Logo:** not chosen. Eleven directions are on the design canvas ("Logo directions" and
  "Logo directions, round 2"); shortlist: F Hover, D "c" monogram, I Pin-bird. The current
  hummingbird mark is a placeholder.
- **Accounts:**

  | Service | Status |
  |---|---|
  | DigitalOcean | Signed up. Do not create the server or database until the domain is ready. |
  | Better Stack | Signed up. No monitors yet. |
  | EasyPost | Signed up. Test key **not** stored yet (add it via the secure form or environment settings when Phase 2 starts). Ask EasyPost about reselling labels at a markup. |
  | Postmark | In progress; needs the domain. |
  | Stripe (Canada, test mode) | In progress. |
  | Domain | **Blocker.** Trademark search for "Colibri" (CIPO, USPTO; classes 35, 39, 42), then buy via Cloudflare Registrar. |
  | Work email | Needs the domain: start with Cloudflare Email Routing, then Google Workspace or Zoho to send. |

## When resuming
1. Merge PR #13 (and choose a logo, a small follow-up change).
2. Trademark check → buy the domain → work email → Postmark DNS.
3. Create the DigitalOcean database and server and deploy staging (`deploy/RUNBOOK.md`).
4. Store the EasyPost and Stripe test keys, then start Phase 2 (shipments and rates first).
5. Before launch: accountant (tax on resold postage), lawyer (Terms, Privacy, Competition Act wording,
   Ontario online-agreement rules), fluent review of French and Spanish copy.

## Completed
### Phase 0 — Architecture (merged in PR #1)
Decision log, architecture, technical spec, directory structure, ERD/schema, API docs, design system, roadmap.

### Phase 1 — Foundation
| Area | Status |
|---|---|
| Backend skeleton (FastAPI, config, JSON logging with request ids, error envelope, security headers) | ✅ |
| Database: Alembic baseline (identity, accounts, addresses, audit, notifications, settings, rate limits) | ✅ |
| Auth: register, email verification, login, lockout, refresh rotation + reuse detection, logout, logout-all, sessions | ✅ |
| Passwords: Argon2id, reset, change, optional breached-password check | ✅ |
| MFA: TOTP with replay protection, recovery codes, encrypted secrets; required for staff | ✅ |
| RBAC: roles/permissions seeded; permission checks on every admin endpoint | ✅ |
| Customer profile, language/time zone, notification preferences, account closure (anonymization) | ✅ |
| Address book with search, default sender, simulated verification | ✅ |
| Public rate calculator (simulated rates, clearly labelled) | ✅ |
| Admin API + UI: dashboard, customers (search, detail, suspend/reactivate), staff invites/roles, audit log, settings | ✅ |
| Email outbox + worker; Postmark and console providers; EN/FR/ES templates | ✅ |
| Frontend: public site, auth pages, portal, admin, EN/FR/ES, responsive, accessible patterns | ✅ |
| Tests: 55 backend (pytest), 20 frontend unit (Vitest), 6 end-to-end (Playwright, all 3 languages) | ✅ |
| CI (GitHub Actions, native PostgreSQL), Dependabot | ✅ (runs on first push/PR) |
| Deployment: nginx, systemd, provision/deploy scripts with health-check rollback, runbook | ✅ (untested on a real droplet) |

## Next steps
1. Owner: domain (blocker), then Postmark and Stripe → deploy staging (exit checklist item).
2. Lighthouse audit of the homepage on staging.
3. Phase 2 (shipping engine + payments) once EasyPost and Stripe test keys are available.

## Outstanding owner actions
See `docs/02-technical-spec.md` §10. Business decisions are recorded in `docs/00-decisions.md` D-012.

## Incomplete functionality register (clearly marked in the UI)
| Item | Where it shows | Planned |
|---|---|---|
| Rates and address verification are **simulated** (mock provider) | Yellow "Simulated data" notice | Phase 2 (EasyPost) |
| Shipments, labels, tracking, payments | Dashboard "Shipping is coming soon"; zero counts | Phase 2 |
| Privacy policy and terms are placeholders | "Draft" banner on both pages | Before launch (lawyer) |
| French and Spanish copy is machine-assisted | — | Fluent review before launch |
| Contact page is email only (no form) | — | Later |
| Monitoring (Better Stack uptime, errors, logs) not wired yet | — | With staging deploy |
| Per-locale URLs + prerendering for SEO | — | Launch hardening (D-013) |
| Encryption key rotation (MultiFernet) | — | Before launch |

## Known issues / technical notes
- Angular 22 components are OnPush by default; components that read form state from a child must use signals (see `shared/field-error.ts`).
- Production build disables critical-CSS inlining so the strict CSP (`frontend/public/_headers`) can block inline scripts.
- Access tokens are checked against the session on every request, so logout and suspension take effect immediately.
- Sales-tax treatment of resold postage still needs an accountant (blocks Phase 2 checkout tax config).
