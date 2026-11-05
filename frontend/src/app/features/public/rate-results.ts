import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, TranslatePipe } from '../../core/i18n/i18n.service';
import { QuoteRate, QuoteService } from './quote.service';

type SortKey = 'price' | 'speed';

interface Row extends QuoteRate {
  mark: string;
  cheapest: boolean;
  fastest: boolean;
}

/** Results panel under the hero: a preview before searching, then rate rows. */
@Component({
  selector: 'vx-rate-results',
  imports: [TranslatePipe, RouterLink],
  template: `
    <section
      class="results-panel"
      aria-live="polite"
      [attr.aria-busy]="quotes.loading()"
      [attr.aria-label]="'calc.results_label' | t"
    >
      <div class="panel-head">
        @if (quotes.request(); as r) {
          <p class="mb-0 fw-semibold">
            {{ r.from_postal.toUpperCase() }} ({{ r.from_country }}) →
            {{ r.to_postal.toUpperCase() }} ({{ r.to_country }})
          </p>
          <p class="mb-0 small text-muted-strong">
            {{ r.weight }} {{ r.weight_unit }} · {{ r.length }} × {{ r.width }} × {{ r.height }}
            {{ r.dimension_unit }}
          </p>
        } @else {
          <p class="mb-0 fw-semibold">{{ 'calc.preview_title' | t }}</p>
        }
        <div class="ms-auto d-flex flex-wrap align-items-center gap-2">
          @if (quotes.result()?.simulated) {
            <span class="tag tag-simulated"
              ><i class="bi bi-info-circle" aria-hidden="true"></i>{{ 'sim.badge' | t }}</span
            >
          }
          @if (rows().length > 1) {
            <div class="segmented" role="group" [attr.aria-label]="'calc.sort_label' | t">
              <button
                type="button"
                [attr.aria-pressed]="sort() === 'price'"
                (click)="sort.set('price')"
              >
                {{ 'calc.cheapest' | t }}
              </button>
              <button
                type="button"
                [attr.aria-pressed]="sort() === 'speed'"
                (click)="sort.set('speed')"
              >
                {{ 'calc.fastest' | t }}
              </button>
            </div>
          }
        </div>
      </div>

      @if (quotes.errorCode(); as code) {
        <div class="alert alert-danger m-3" role="alert">{{ i18n.error(code) }}</div>
      }

      @if (quotes.loading()) {
        @for (i of [1, 2, 3]; track i) {
          <div class="rate-row placeholder-glow" aria-hidden="true">
            <span class="placeholder col-8"></span><span class="placeholder col-6"></span
            ><span></span><span class="placeholder col-4 ms-auto"></span>
          </div>
        }
      } @else if (quotes.result(); as res) {
        @if (rows().length === 0) {
          <p class="p-4 mb-0 text-muted-strong">{{ 'calc.no_rates' | t }}</p>
        }
        <ul class="list-unstyled mb-0">
          @for (rate of rows(); track rate.carrier + rate.service_code) {
            <li class="rate-row" [class.featured]="rate.cheapest">
              <div class="d-flex align-items-center gap-3">
                <span class="carrier-mark" aria-hidden="true">{{ rate.mark }}</span>
                <div>
                  <p class="mb-0 fw-semibold">{{ rate.service_name }}</p>
                  <p class="mb-0 small text-muted-strong">{{ rate.carrier_name }}</p>
                </div>
              </div>
              <div class="small">
                @if (rate.estimated_delivery_date) {
                  <p class="mb-0 fw-semibold">
                    {{ i18n.formatDate(rate.estimated_delivery_date + 'T12:00:00') }}
                  </p>
                }
                <p class="mb-0 text-muted-strong">{{ days(rate) }}</p>
              </div>
              <div class="d-flex flex-wrap gap-1">
                @if (rate.cheapest) {
                  <span class="tag tag-cheapest">{{ 'calc.cheapest' | t }}</span>
                }
                @if (rate.fastest) {
                  <span class="tag tag-fastest">{{ 'calc.fastest' | t }}</span>
                }
                @if (rate.guaranteed) {
                  <span class="tag tag-guaranteed">{{ 'calc.guaranteed' | t }}</span>
                }
              </div>
              <div class="text-end">
                <span class="price">{{
                  i18n.formatMoney(rate.price.amount, rate.price.currency)
                }}</span>
                <span class="d-block small text-subtle">{{ 'calc.estimate_note' | t }}</span>
              </div>
            </li>
          }
        </ul>
        <div
          class="d-flex flex-wrap align-items-center gap-2 px-4 py-3 border-top bg-surface small"
        >
          <span class="text-muted-strong">{{ 'calc.phase_note' | t }}</span>
          <a routerLink="/register" class="fw-semibold">{{ 'calc.create_account' | t }}</a>
        </div>
      } @else {
        <div class="p-4 d-flex flex-wrap align-items-center gap-3">
          <span class="icon-circle" aria-hidden="true"><i class="bi bi-list-ol"></i></span>
          <p class="mb-0 text-muted-strong flex-grow-1" style="flex-basis: 16rem">
            {{ 'calc.preview_body' | t }}
          </p>
        </div>
      }
    </section>
  `,
})
export class RateResults {
  protected readonly quotes = inject(QuoteService);
  protected readonly i18n = inject(I18n);
  protected readonly sort = signal<SortKey>('price');

  protected readonly rows = computed<Row[]>(() => {
    const rates = this.quotes.result()?.rates ?? [];
    if (rates.length === 0) return [];
    const minPrice = Math.min(...rates.map((r) => r.price.amount));
    const minDays = Math.min(...rates.map((r) => r.delivery_days_max));
    const rows = rates.map((r) => ({
      ...r,
      mark: MARKS[r.carrier] ?? r.carrier_name.slice(0, 2).toUpperCase(),
      cheapest: rates.length > 1 && r.price.amount === minPrice,
      fastest: rates.length > 1 && r.delivery_days_max === minDays,
    }));
    const byPrice = (a: Row, b: Row) => a.price.amount - b.price.amount;
    const bySpeed = (a: Row, b: Row) => a.delivery_days_max - b.delivery_days_max || byPrice(a, b);
    return rows.sort(this.sort() === 'price' ? byPrice : bySpeed);
  });

  protected days(rate: QuoteRate): string {
    return rate.delivery_days_min === rate.delivery_days_max
      ? this.i18n.t('calc.days_one', { n: rate.delivery_days_max })
      : this.i18n.t('calc.days_range', {
          min: rate.delivery_days_min,
          max: rate.delivery_days_max,
        });
  }
}

const MARKS: Record<string, string> = {
  canada_post: 'CP',
  purolator: 'PU',
  canpar: 'CN',
  ups: 'UPS',
  fedex: 'FX',
  usps: 'USPS',
};
