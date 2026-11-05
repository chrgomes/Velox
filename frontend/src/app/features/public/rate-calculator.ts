import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { API, Money, errorCode } from '../../core/api';
import { I18n, TranslatePipe } from '../../core/i18n/i18n.service';
import { FieldError } from '../../shared/field-error';
import { SimulatedNotice } from '../../shared/simulated-notice';

export interface QuoteRate {
  carrier: string;
  carrier_name: string;
  service_code: string;
  service_name: string;
  price: Money;
  delivery_days_min: number;
  delivery_days_max: number;
  estimated_delivery_date: string | null;
  guaranteed: boolean;
  tracking_included: boolean;
  source: string;
}

interface QuoteResponse {
  is_estimate: boolean;
  simulated: boolean;
  rates: QuoteRate[];
}

export const POSTAL_PATTERNS: Record<'US' | 'CA', RegExp> = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
};

/** Validates a postal code against the country selected in a sibling control. */
export function postalFor(countryControl: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const country = control.parent?.get(countryControl)?.value as 'US' | 'CA' | undefined;
    const value = String(control.value ?? '').trim();
    if (!value || !country) return null;
    return POSTAL_PATTERNS[country].test(value) ? null : { postal: true };
  };
}

@Component({
  selector: 'vx-rate-calculator',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, SimulatedNotice, RouterLink],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="card shadow-card border-0">
      <div class="card-body p-3 p-md-4">
        <h2 class="h4 mb-3">{{ 'calc.title' | t }}</h2>
        <div class="row g-3">
          <fieldset class="col-12 col-md-6">
            <legend class="form-label fw-semibold small text-uppercase text-muted-strong">
              {{ 'calc.from' | t }}
            </legend>
            <div class="input-group">
              <select
                class="form-select flex-grow-0 w-auto"
                formControlName="from_country"
                [attr.aria-label]="'calc.from_country' | t"
                (change)="revalidate('from_postal')"
              >
                <option value="CA">{{ 'country.CA' | t }}</option>
                <option value="US">{{ 'country.US' | t }}</option>
              </select>
              <input
                class="form-control"
                formControlName="from_postal"
                [attr.aria-label]="'calc.from_postal' | t"
                [placeholder]="(form.value.from_country === 'US' ? 'calc.zip' : 'calc.postal') | t"
                autocomplete="postal-code"
                [class.is-invalid]="invalid('from_postal')"
                aria-describedby="from_postal_err"
              />
            </div>
            <vx-field-error [control]="form.get('from_postal')" id="from_postal_err" />
          </fieldset>
          <fieldset class="col-12 col-md-6">
            <legend class="form-label fw-semibold small text-uppercase text-muted-strong">
              {{ 'calc.to' | t }}
            </legend>
            <div class="input-group">
              <select
                class="form-select flex-grow-0 w-auto"
                formControlName="to_country"
                [attr.aria-label]="'calc.to_country' | t"
                (change)="revalidate('to_postal')"
              >
                <option value="CA">{{ 'country.CA' | t }}</option>
                <option value="US">{{ 'country.US' | t }}</option>
              </select>
              <input
                class="form-control"
                formControlName="to_postal"
                [attr.aria-label]="'calc.to_postal' | t"
                [placeholder]="(form.value.to_country === 'US' ? 'calc.zip' : 'calc.postal') | t"
                [class.is-invalid]="invalid('to_postal')"
                aria-describedby="to_postal_err"
              />
            </div>
            <vx-field-error [control]="form.get('to_postal')" id="to_postal_err" />
          </fieldset>
          <div class="col-12 col-md-4">
            <label
              class="form-label fw-semibold small text-uppercase text-muted-strong"
              for="calc-weight"
              >{{ 'calc.weight' | t }}</label
            >
            <div class="input-group">
              <input
                id="calc-weight"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.1"
                class="form-control"
                formControlName="weight"
                [class.is-invalid]="invalid('weight')"
                aria-describedby="weight_err"
              />
              <select
                class="form-select flex-grow-0 w-auto"
                formControlName="weight_unit"
                [attr.aria-label]="'calc.weight_unit' | t"
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
                <option value="g">g</option>
                <option value="oz">oz</option>
              </select>
            </div>
            <vx-field-error [control]="form.get('weight')" id="weight_err" />
          </div>
          <fieldset class="col-12 col-md-8">
            <legend class="form-label fw-semibold small text-uppercase text-muted-strong">
              {{ 'calc.dimensions' | t }}
            </legend>
            <div class="input-group">
              <input
                type="number"
                inputmode="decimal"
                min="0"
                class="form-control"
                formControlName="length"
                [attr.aria-label]="'calc.length' | t"
                [placeholder]="'calc.length_short' | t"
                [class.is-invalid]="invalid('length')"
              />
              <span class="input-group-text" aria-hidden="true">×</span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                class="form-control"
                formControlName="width"
                [attr.aria-label]="'calc.width' | t"
                [placeholder]="'calc.width_short' | t"
                [class.is-invalid]="invalid('width')"
              />
              <span class="input-group-text" aria-hidden="true">×</span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                class="form-control"
                formControlName="height"
                [attr.aria-label]="'calc.height' | t"
                [placeholder]="'calc.height_short' | t"
                [class.is-invalid]="invalid('height')"
              />
              <select
                class="form-select flex-grow-0 w-auto"
                formControlName="dimension_unit"
                [attr.aria-label]="'calc.dimension_unit' | t"
              >
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
            @if (invalid('length') || invalid('width') || invalid('height')) {
              <div class="invalid-feedback d-block">{{ 'validation.dimensions' | t }}</div>
            }
          </fieldset>
        </div>
        <div class="d-grid d-md-flex justify-content-md-end mt-3">
          <button type="submit" class="btn btn-accent btn-lg px-4" [disabled]="loading()">
            @if (loading()) {
              <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            }
            {{ 'calc.submit' | t }}
          </button>
        </div>
      </div>
    </form>

    <section class="mt-4" aria-live="polite" [attr.aria-busy]="loading()">
      @if (error()) {
        <div class="alert alert-danger" role="alert">{{ error() }}</div>
      }
      @if (loading()) {
        @for (i of [1, 2, 3]; track i) {
          <div class="card border-0 shadow-card mb-2 placeholder-glow">
            <div class="card-body">
              <span class="placeholder col-7"></span><span class="placeholder col-3 ms-2"></span>
            </div>
          </div>
        }
      }
      @if (result(); as r) {
        @if (r.simulated) {
          <vx-simulated-notice />
        }
        <h3 class="h5">{{ 'calc.results' | t: { n: r.rates.length } }}</h3>
        @if (r.rates.length === 0) {
          <p class="text-muted-strong">{{ 'calc.no_rates' | t }}</p>
        }
        <ul class="list-unstyled mb-0">
          @for (rate of r.rates; track rate.carrier + rate.service_code) {
            <li class="card border-0 shadow-card mb-2">
              <div class="card-body d-flex flex-wrap align-items-center gap-3">
                <div class="flex-grow-1">
                  <div class="fw-semibold">{{ rate.carrier_name }} · {{ rate.service_name }}</div>
                  <div class="small text-muted-strong">
                    {{ deliveryText(rate) }}
                    @if (rate.guaranteed) {
                      · <span class="text-success fw-semibold">{{ 'calc.guaranteed' | t }}</span>
                    }
                    @if (rate.tracking_included) {
                      · {{ 'calc.tracking' | t }}
                    }
                  </div>
                  <div class="mt-1 d-flex gap-1">
                    @if (rate === cheapest()) {
                      <span class="badge rounded-pill text-bg-success"
                        ><i class="bi bi-piggy-bank me-1" aria-hidden="true"></i
                        >{{ 'calc.cheapest' | t }}</span
                      >
                    }
                    @if (rate === fastest()) {
                      <span class="badge rounded-pill text-bg-primary"
                        ><i class="bi bi-lightning-charge me-1" aria-hidden="true"></i
                        >{{ 'calc.fastest' | t }}</span
                      >
                    }
                  </div>
                </div>
                <div class="text-end">
                  <div class="fs-4 fw-bold tabular">
                    {{ i18n.formatMoney(rate.price.amount, rate.price.currency) }}
                  </div>
                  <div class="small text-muted-strong">{{ 'calc.estimate_note' | t }}</div>
                </div>
              </div>
            </li>
          }
        </ul>
        <p class="small text-muted-strong mt-3 mb-0">
          {{ 'calc.phase_note' | t }} <a routerLink="/register">{{ 'calc.create_account' | t }}</a>
        </p>
      }
    </section>
  `,
})
export class RateCalculator {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18n);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<QuoteResponse | null>(null);

  protected readonly cheapest = computed(() => {
    const rates = this.result()?.rates ?? [];
    return rates.length > 1
      ? rates.reduce((a, b) => (b.price.amount < a.price.amount ? b : a))
      : null;
  });
  protected readonly fastest = computed(() => {
    const rates = this.result()?.rates ?? [];
    return rates.length > 1
      ? rates.reduce((a, b) => (b.delivery_days_max < a.delivery_days_max ? b : a))
      : null;
  });

  private readonly positive = [Validators.required, Validators.min(0.01)];
  protected readonly form = this.fb.nonNullable.group({
    from_country: ['CA' as 'US' | 'CA'],
    from_postal: ['', [Validators.required, postalFor('from_country')]],
    to_country: ['CA' as 'US' | 'CA'],
    to_postal: ['', [Validators.required, postalFor('to_country')]],
    weight: [1, [...this.positive, Validators.max(1000)]],
    weight_unit: ['kg' as 'kg' | 'lb' | 'g' | 'oz'],
    length: [30, [...this.positive, Validators.max(300)]],
    width: [20, [...this.positive, Validators.max(300)]],
    height: [10, [...this.positive, Validators.max(300)]],
    dimension_unit: ['cm' as 'cm' | 'in'],
  });

  protected invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  protected revalidate(name: string): void {
    this.form.get(name)?.updateValueAndValidity();
  }

  protected deliveryText(rate: QuoteRate): string {
    const days =
      rate.delivery_days_min === rate.delivery_days_max
        ? this.i18n.t('calc.days_one', { n: rate.delivery_days_max })
        : this.i18n.t('calc.days_range', {
            min: rate.delivery_days_min,
            max: rate.delivery_days_max,
          });
    return rate.estimated_delivery_date
      ? `${days} · ${this.i18n.t('calc.eta', { date: this.i18n.formatDate(rate.estimated_delivery_date + 'T12:00:00') })}`
      : days;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.http.post<QuoteResponse>(`${API}/quotes`, this.form.getRawValue()).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.i18n.error(errorCode(err)));
        this.loading.set(false);
      },
    });
  }
}
