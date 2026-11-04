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
