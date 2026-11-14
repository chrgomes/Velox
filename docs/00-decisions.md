# Decision Log

Confirmed decisions. Each entry records what was decided, why, and what it rules out.
New decisions are appended; superseded ones are marked, never deleted.

| # | Date | Decision | Status |
|---|------|----------|--------|
| D-001 | 2026-11-04 | Markets: United States and Canada | Accepted |
| D-002 | 2026-11-04 | Languages: English, French (Canadian), Spanish (Latin American) | Accepted |
| D-003 | 2026-11-04 | Carrier access through an aggregator, EasyPost first | Accepted |
| D-004 | 2026-11-04 | Payments: Stripe first, PayPal later, behind a provider adapter | Accepted |
| D-005 | 2026-11-04 | No prepaid wallet | Accepted |
| D-006 | 2026-11-04 | Hosting: DigitalOcean Toronto (native, no containers) + Cloudflare Pages | Accepted |
| D-007 | 2026-11-04 | MVP scope as defined in `02-technical-spec.md` §1 | Accepted |
| D-008 | 2026-11-04 | Background jobs on PostgreSQL (`procrastinate`), no Redis | Accepted |
| D-009 | 2026-11-04 | Money stored as integer minor units + ISO currency code | Accepted |
| D-010 | 2026-11-04 | Card payments authorized first, captured only after labels are bought | Accepted |
| D-011 | 2026-11-04 | Multi-label checkout (one card charge for many labels) | Accepted |
| D-012 | 2026-11-05 | Business: Canadian company based in Ontario; Stripe Canada account | Accepted |
| D-013 | 2026-11-05 | i18n: runtime JSON/TS dictionaries instead of `@angular/localize` builds | Accepted (supersedes part of 01-architecture §5) |
| D-014 | 2026-11-05 | Phase 1 jobs: email outbox + simple worker; `procrastinate` deferred to Phase 2 | Accepted (refines D-008) |
| D-015 | 2026-11-05 | Synchronous SQLAlchemy sessions (not async) | Accepted |
| D-016 | 2026-11-05 | Staff must enable MFA before using the admin API | Accepted |
| D-017 | 2026-11-06 | Brand name: Colibri (replaces working name Velox) | Accepted |
| D-018 | 2026-11-08 | Monitoring: Better Stack instead of Sentry | Accepted |
| D-019 | 2026-11-10 | Website first; iOS/Android app after launch via Capacitor | Accepted |

---

## D-001 Markets: US and Canada
Domestic US, domestic Canada and cross-border US↔Canada shipments are supported at launch.
Other international destinations come later (Phase 5). Currencies: CAD and USD.

## D-002 Languages
`en`, `fr-CA`, `es-419`. All user-facing text is translatable: web UI, emails, API error
messages (via error codes), PDF receipts, normalized tracking statuses. Machine-drafted French
and Spanish copy must be reviewed by a fluent human before launch.

## D-003 Aggregator: EasyPost
**Why:** a single integration gives rates, labels (PDF/PNG/ZPL, 4×6), tracking webhooks, address
verification and customs forms for USPS, UPS, FedEx, Canada Post, Purolator, Canpar and more.
EasyPost provides an integrated Canada Post account and USPS by default, so no individual carrier
contracts are required to launch.
**Consequence:** the integration layer is a *shipping provider* adapter (EasyPost today, direct
carriers later). Carrier capability differences (e.g. Canpar labels cannot be voided through
EasyPost) are modelled as per-carrier capability flags, not `if carrier == ...` checks.
**To verify before launch:** current carrier list, pricing/fees, reseller terms.

## D-004 Payments: Stripe first
**Why:** strong US + Canada support, Stripe Tax (GST/HST/PST and US sales tax), localized
payment UI in EN/FR/ES, manual-capture PaymentIntents (needed for D-010).
PayPal added later through the same `PaymentProvider` interface.
Card data never touches our servers (Stripe Payment Element; PCI scope SAQ A).

## D-005 No wallet
Avoids holding customer funds (money-services regulation). Every label purchase is a card
charge. Per-transaction fees (~2.9% + 0.30) are softened by D-011 and, later, invoiced business
billing (Phase 4).

## D-006 Hosting
| Component | Service |
|---|---|
| API + worker | DigitalOcean Droplet, Ubuntu LTS, nginx → gunicorn/uvicorn, systemd units |
| Database | DigitalOcean Managed PostgreSQL (Toronto), daily backups + PITR |
| Files (labels, receipts) | DigitalOcean Spaces, private bucket, short-lived signed URLs |
| Frontend | Cloudflare Pages (static, prerendered per locale) |
| Email | Postmark (or Amazon SES) |
| TLS | Let's Encrypt via certbot (API); Cloudflare (frontend) |

Region: Toronto, which keeps personal data in Canada (simplifies Quebec Law 25) with good latency
to the US. No Docker at any stage.

## D-007 MVP scope
See `02-technical-spec.md` §1. Everything else is deferred to later phases.

## D-008 Background jobs without Redis
`procrastinate` uses PostgreSQL (`LISTEN/NOTIFY` + `SELECT … FOR UPDATE SKIP LOCKED`).
One fewer service to run, transactional enqueueing (job is created in the same DB transaction
as the business change). Revisit Redis only if measured load requires it.

## D-009 Money representation
All amounts are `BIGINT` minor units (cents) paired with a `CHAR(3)` currency. No floats
anywhere in money paths. Conversions between CAD/USD are not performed by us: a quote is priced
in the currency the provider returns, and the customer pays in that currency.

## D-010 Authorize → buy → capture
Card is authorized (manual capture), labels are bought from the provider, then only the amount
for successfully purchased labels is captured. If every label fails, the authorization is
cancelled. Customers are never charged for a label that was not created, and no refund is needed
for provider failures.

## D-011 Multi-label checkout
A checkout contains 1–N shipments with selected rates, paid with one PaymentIntent.
Partial failures capture a reduced amount.

## D-012 Business entity
No company is registered yet. Test accounts (EasyPost, Stripe Canada, Better Stack) are opened personally
now; live accounts are activated under an Ontario or federal corporation before launch. Ontario HST is
13%; other provinces are handled by Stripe Tax. Accountant and lawyer reviews remain launch blockers.

## D-013 Runtime translations
One build serves all three languages; switching language is instant and remembered per user.
English is the source dictionary and French/Spanish are typed against it, so a missing key fails
compilation. Server-side text (emails) uses JSON catalogs in `backend/app/locales/` with a test that
all catalogs have identical keys. **Open item:** per-locale URLs (`/fr/…`) and prerendering for SEO
are scheduled for launch hardening (2L).

## D-014 Email outbox
Emails are inserted into `email_messages` in the same transaction as the change that triggers them,
then sent by `python -m scripts.worker` (claims rows with `SKIP LOCKED`, retries up to 5 times,
removes bodies containing one-time links after delivery). Phase 2 needs scheduled and webhook jobs;
`procrastinate` is evaluated then.

## D-015 Synchronous database access
FastAPI runs sync endpoints in a thread pool; sync SQLAlchemy is simpler to test and reason about.
Revisit only if profiling shows thread-pool saturation.

## D-016 Staff MFA
Staff can sign in without MFA but every admin endpoint returns `auth.staff_mfa_required` until it is
enabled, and staff cannot turn it off.

## D-017 Brand name: Colibri
"Colibri" (hummingbird) is nearly the same word in English, French (*colibri*) and Spanish (*colibrí*),
suggests small, fast and precise delivery, and is more distinctive than "Velox". Written without an
accent everywhere, including Spanish copy. All customer-facing text, emails and the logo use it.
Internal identifiers keep the old name to avoid risky churn before anything is deployed: the
`VELOX_` settings prefix, the `velox` database and service user, systemd units (`velox-api`,
`velox-worker`), the `velox_refresh` cookie, `velox.locale` browser storage and the GitHub repository.
**Before buying the domain:** check `.com` and `.ca` availability and search CIPO and USPTO
(classes 35, 39, 42); final clearance by the lawyer.

## D-018 Monitoring: Better Stack
One service for uptime monitoring (API `/health` and `/ready`, the website), alerting, a public
status page, error tracking and log search, replacing the planned Sentry plus DigitalOcean uptime
checks. Error tracking uses the standard Sentry SDKs (`sentry-sdk` for Python, `@sentry/angular`
for the frontend) configured with Better Stack's ingestion address, so switching provider later is
a configuration change. The existing PII redaction in the JSON log formatter stays in front of
anything sent. Free plan to start; confirm current limits (monitors, error volume, retention) and
the data region at sign-up, and mention the provider in the privacy policy.

## D-019 Mobile app after launch
The website is the launch product. iOS and Android apps follow after launch (roadmap M1, M2),
built with Capacitor from the same Angular code rather than separate native apps, so features and
translations stay in one place. Camera parcel measuring (ARKit / ARCore) comes in the app's second
version. Until then: keep every page mobile-friendly and keep the API client-agnostic (JSON, no
browser-only assumptions beyond the refresh cookie, which gets a native-client alternative in M1).
