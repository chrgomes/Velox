# Development Roadmap & Implementation Priorities

The master prompt's phases are kept, with one change: **payments move into Phase 2**, because a
label cannot be sold without them. MVP launch = end of Phase 2 + launch hardening.

| Phase | Name | Outcome | Gate to next phase |
|---|---|---|---|
| 0 | Architecture | These documents | ✅ Merged (PR #1) |
| 1 | Foundation | Running app: auth, accounts, addresses, i18n, admin shell, CI, deploy to staging | Checklist §2 (code complete; staging deploy pending accounts) |
| 2 | Shipping engine + payments | Quote → pay → label → track → void, admin pricing | Checklist §3 |
| 2L | Launch hardening | Security review, legal pages, translations reviewed, production keys, monitoring | **MVP launch** |
| M1 | Mobile app (after launch) | iOS and Android apps (Capacitor, shared Angular code): phone sign-in, push tracking updates, barcode scanning, Apple Pay / Google Pay | Website launched |
| M2 | Camera parcel measuring | Measure a box with the phone camera (LiDAR iPhones first, then AR tap-the-corners) | M1 released |
| 3 | Supplies store | Catalogue, cart, checkout reuse, inventory | |
| 4 | Financial management | Invoices, statements, business billing, finance reports | |
| 5 | Advanced shipping | Business accounts, CSV bulk, returns, international, API keys, integrations | |
| 6 | Warehouse | Receiving, scanning, sorting, consolidation, dispatch, manifests | |
| 7 | Continuous production readiness | Performance, monitoring, DR drills (ongoing from launch) | |

## 1. Phase 1 implementation order

1. Repo tooling: backend skeleton (FastAPI app factory, config, logging, error envelope),
   frontend skeleton (Angular, Bootstrap, tokens, three locale builds), CI workflows.
2. Database: Alembic baseline; identity + accounts + addresses + audit + settings tables.
3. Auth: register, verify email, login, refresh rotation, logout, password reset, MFA, sessions.
4. RBAC: roles/permissions seed, `require_permission`, staff creation script.
5. Customer profile, address book (verification stubbed behind the provider interface; mock adapter).
6. Frontend: public shell + homepage (calculator UI wired to mock quotes, clearly labelled
   simulated), auth pages, portal shell + dashboard (empty states), address book, settings,
   language switcher.
7. Admin shell: dashboard placeholder metrics *marked incomplete*, customers list/detail, staff management, audit log viewer.
8. Email: Postmark adapter + console adapter; localized verification/reset templates.
9. Deploy: provisioning scripts, nginx, systemd, staging environment on DigitalOcean, runbook.

## 2. Phase 1 exit checklist
- [x] All Phase 1 endpoints documented in OpenAPI and covered by pytest (incl. auth abuse cases)
- [x] Cross-account access tests pass (customer A cannot read B's addresses)
- [x] Staff permission matrix tests pass
- [x] Alembic upgrade/downgrade round-trip in CI
- [x] Angular unit tests for auth service, guards, interceptors, forms
- [x] Playwright: register → verify → login → add address → logout, in all 3 locales
- [ ] Lighthouse ≥ 90 on homepage (mobile)
- [ ] Staging deployed from scripts on a fresh droplet
- [x] PROGRESS.md updated

## 3. Phase 2 implementation order
1. Carrier/service reference data, markup rules + pricing engine (pure, heavily unit-tested).
2. Shipping provider interface, mock adapter, EasyPost adapter (test keys).
3. Shipments: drafts, addresses snapshot, parcels, customs, state machine.
4. Rating endpoints + public quote endpoint; rate UI.
5. Payment provider interface, mock + Stripe adapters; checkouts, idempotency, tax calc.
6. Authorize → buy → capture orchestration, webhook ingestion, recovery job.
7. Labels storage + download (PDF/ZPL, 4×6/letter), receipts.
8. Tracking webhooks, normalization, public tracking pages, notifications.
9. Void/refund flow with capability checks.
10. Shipment list/search/filter/export; dashboard metrics.
11. Admin: shipments, payments/refunds, markup rules with preview, carriers, reports, reconciliation.

## 4. Phase 2 exit checklist
- [ ] Shipment lifecycle tests: every state transition, every illegal transition rejected
- [ ] Payment tests: double-submit, webhook-before-client, provider failure mid-batch, partial capture, expired quote, expired authorization
- [ ] DB constraint prevents two purchased labels for one shipment (tested)
- [ ] End-to-end in sandbox: US domestic, CA domestic, CA→US, US→CA with customs
- [ ] Labels print correctly on a 4×6 thermal printer (manual check, ZPL + PDF)
- [ ] Test-mode banner verified on every page showing test data
- [ ] Reconciliation report matches Stripe test dashboard

## 5. Launch hardening (2L)
Security review (OWASP ASVS L2 checklist), dependency audit, penetration-style test of auth and
checkout, legal pages reviewed, FR/ES translations reviewed, production EasyPost + Stripe keys,
Better Stack uptime and error alerts, backup restore drill, load test (k6 or Locust) at 5× expected peak.

## 6. Mobile app (after launch; D-019)

The website launches first. The mobile app follows, reusing the website's Angular code through
Capacitor so iOS and Android are published to the App Store and Google Play without a second codebase.

**M1 — Mobile app**
- Capacitor iOS and Android projects built from `frontend/`; app icons, splash screen, deep links.
- Phone sign-in: refresh token kept in the iOS Keychain / Android Keystore instead of a browser cookie
  (small backend addition: a token flow for native clients).
- Push notifications for tracking milestones (APNs / FCM), respecting notification preferences.
- Barcode scanning to look up tracking numbers; optional text recognition to fill in addresses.
- Apple Pay and Google Pay through Stripe; printer-free drop-off codes where the carrier and EasyPost support them.
- Needs: Apple Developer Program (~US$99/year), Google Play (one-time ~US$25), a Mac or cloud build
  service for iOS, App Store / Play privacy disclosures.

**M2 — Camera parcel measuring**
- Native module (ARKit / ARCore) bridged into the app; not possible on the website.
- LiDAR iPhones and iPads first (about ±1 cm), then AR tap-the-corners for other phones (about ±1–3 cm).
- Results are rounded up and always editable; the customer stays responsible for declared sizes
  (carrier adjustment charges) — wording added to the Terms. Weight still comes from a scale.
- Compare building it ourselves with licensing a commercial dimensioning SDK.
