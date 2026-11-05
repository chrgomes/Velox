# UI/UX Design System

Working brand name: **Velox** (replaceable; all brand strings and colours live in tokens and i18n files).

## 1. Principles
1. **Price clarity first.** Totals, taxes and fees are visible before payment; no surprise costs.
2. **Fast path for repeat shippers.** Saved addresses, duplicate shipment, remembered parcel sizes.
3. **Honest data.** Estimates are labelled as estimates; test mode is unmistakable.
4. **Mobile-first, accessible.** WCAG 2.2 AA; every flow works by keyboard and screen reader.
5. **Built for three languages.** Layouts tolerate ~35% text expansion; no text inside images.

## 2. Tokens (`frontend/src/styles/_tokens.scss`, mapped onto Bootstrap 5 variables)

### Colour
| Token | Hex | Use | Contrast on white |
|---|---|---|---|
| `primary` | `#1E40AF` | links, primary buttons (white text), focus | 8.7:1 |
| `primary-dark` | `#1E3A8A` | hover/active | 10.4:1 |
| `primary-subtle` | `#EFF4FF` | selected rows, info panels | n/a (background) |
| `accent` | `#F59E0B` | main CTA ("Get rates"), **dark text only** | n/a (used with `#111827` text, 8.3:1) |
| `ink` | `#111827` | body text | 17.7:1 |
| `muted` | `#4B5563` | secondary text | 7.6:1 |
| `border` | `#D1D5DB` | dividers, inputs | n/a |
| `surface` | `#F9FAFB` | page background sections | n/a |
| `success` | `#047857` | delivered, paid | 5.5:1 |
| `warning` | `#B45309` | attention, test mode | 5.0:1 |
| `danger` | `#B91C1C` | exceptions, errors | 6.5:1 |
| `info` | `#0369A1` | in transit | 5.9:1 |

Colour is never the only signal: status badges always pair colour with an icon and text.

### Shipment status badges
| Status | Colour | Icon |
|---|---|---|
| Draft / Rated | muted | pencil |
| Label purchased / Pre-transit | primary | tag |
| In transit / Out for delivery | info | truck |
| Delivered | success | check-circle |
| Exception / Return to sender | danger | alert-triangle |
| Void requested / Voided | warning / muted | x-circle |

### Typography
- Font: **Inter** (self-hosted, latin + latin-ext subsets for French/Spanish diacritics); fallback
  `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Scale (rem): 0.875 small · 1 body · 1.125 lead · 1.25 h5 · 1.5 h4 · 1.875 h3 · 2.25 h2 · 3 h1 (display, desktop only; 2.25 on mobile).
- Tabular numerals (`font-variant-numeric: tabular-nums`) for prices, weights and tracking numbers.

### Space, shape, depth
- Spacing: Bootstrap scale (0.25 / 0.5 / 1 / 1.5 / 3 rem).
- Radius: 0.5rem default, 0.75rem cards, pill for badges.
- Shadows: `sm` for cards, `md` for dropdowns/modals only.
- Breakpoints: Bootstrap defaults; designs start at 360 px.
- Icons: Bootstrap Icons (SVG sprite, self-hosted).

## 3. Components (`shared/ui`)
| Component | Notes |
|---|---|
| `vx-rate-calculator` | homepage + portal; postal/country/weight/dims; unit toggle |
| `vx-rate-list` / `vx-rate-card` | carrier logo, service, price, ETA, badges (Cheapest, Fastest, Best value); sort; `aria-live` announcement when results load |
| `vx-address-form` | country-aware fields (State/ZIP vs Province/Postal code), autocomplete hints, verification suggestions dialog |
| `vx-parcel-form` | dims + weight, saved parcel presets, unit conversion |
| `vx-stepper` | shipment wizard: From → To → Package → Options → Customs (if needed) → Rates → Review |
| `vx-status-badge` | colour + icon + text |
| `vx-tracking-timeline` | vertical event list, latest first |
| `vx-money` pipe / `vx-weight` pipe | locale formatting, currency code shown when it differs from account currency |
| `vx-data-table` | sortable, paginated, responsive (stacks to cards < 768 px) |
| `vx-empty-state` | illustration-free: icon + message + action |
| `vx-test-mode-banner` | fixed top bar, warning colour, shown whenever test data is present |
| `vx-language-switcher` | EN · FR · ES, keeps current route |
| `vx-confirm-dialog` | destructive actions (void, delete) |
| `vx-form-field` | label, hint, error wiring (`aria-describedby`), required marker |

Bootstrap is used directly for grid, buttons, forms, modals, toasts (via `ng-bootstrap`); wrappers
are created only where behaviour is added.

## 4. Layouts
- **Public shell:** sticky header (logo, Ship, Track, Pricing, Business, Help, language, Log in,
  primary CTA), footer with links, legal and language.
- **Portal shell:** top bar + left nav (desktop) / bottom tab bar (mobile: Home, Ship, Track,
  Shipments, Account).
- **Admin shell:** denser left nav, wider tables, environment indicator (production/sandbox).

## 5. Homepage structure
1. Hero: one-line value proposition + calculator card (from/to postal code, weight, dims, "Compare rates").
2. Carrier logo strip (only carriers actually enabled).
3. How it works (3 steps).
4. Featured services: US↔Canada, small business, label printing.
5. Testimonials: **only real ones**; the section stays hidden until we have them.
6. Business CTA.
7. FAQ (accordion, FAQPage structured data).
8. Footer.

## 6. Interaction & content rules
- Inline validation on blur, summary of errors on submit with links to fields.
- Prices shown with tax notes ("+ tax calculated at checkout") until the tax is known.
- Buttons describe outcomes ("Buy 3 labels · $54.20"), not "Submit".
- Loading: skeletons for rate lists; never block the whole page.
- Plain language, sentence case, no jargon without explanation (e.g. "HS code").
- All copy lives in translation files from day one.
