import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { FieldError } from '../../shared/field-error';
import { QuoteService } from './quote.service';

export type { QuoteRate } from './quote.service';

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

/** The quote bar. Results are shown by <vx-rate-results>, which reads the same QuoteService. */
@Component({
  selector: 'vx-rate-calculator',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError],
  template: `
    <form
      class="quote-bar"
      [formGroup]="form"
      (ngSubmit)="submit()"
      novalidate
      [attr.aria-label]="'calc.title' | t"
    >
      <div
        class="cell"
        role="group"
        [attr.aria-labelledby]="'lbl-from'"
        [class.invalid]="invalid('from_postal')"
      >
        <span class="cell-label" id="lbl-from">{{ 'calc.from' | t }}</span>
        <div class="cell-row">
          <select
            formControlName="from_country"
            [attr.aria-label]="'calc.from_country' | t"
            (change)="revalidate('from_postal')"
          >
            <option value="CA">CA</option>
            <option value="US">US</option>
          </select>
          <input
            formControlName="from_postal"
            [attr.aria-label]="'calc.from_postal' | t"
            [placeholder]="(form.value.from_country === 'US' ? 'calc.zip' : 'calc.postal') | t"
            autocomplete="postal-code"
            aria-describedby="from_postal_err"
          />
        </div>
        <vx-field-error [control]="form.get('from_postal')" id="from_postal_err" />
      </div>

      <div
        class="cell"
        role="group"
        [attr.aria-labelledby]="'lbl-to'"
        [class.invalid]="invalid('to_postal')"
      >
        <span class="cell-label" id="lbl-to">{{ 'calc.to' | t }}</span>
        <div class="cell-row">
          <select
            formControlName="to_country"
            [attr.aria-label]="'calc.to_country' | t"
            (change)="revalidate('to_postal')"
          >
            <option value="CA">CA</option>
            <option value="US">US</option>
          </select>
          <input
            formControlName="to_postal"
            [attr.aria-label]="'calc.to_postal' | t"
            [placeholder]="(form.value.to_country === 'US' ? 'calc.zip' : 'calc.postal') | t"
            aria-describedby="to_postal_err"
          />
        </div>
        <vx-field-error [control]="form.get('to_postal')" id="to_postal_err" />
      </div>

      <div class="cell" [class.invalid]="invalid('weight')">
        <label class="cell-label" for="calc-weight">{{ 'calc.weight' | t }}</label>
        <div class="cell-row">
          <input
            id="calc-weight"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.1"
            formControlName="weight"
          />
          <select formControlName="weight_unit" [attr.aria-label]="'calc.weight_unit' | t">
            <option value="kg">kg</option>
            <option value="lb">lb</option>
            <option value="g">g</option>
            <option value="oz">oz</option>
          </select>
        </div>
        <vx-field-error [control]="form.get('weight')" />
      </div>

      <div
        class="cell"
        role="group"
        [attr.aria-labelledby]="'lbl-dimensions'"
        [class.invalid]="dimsInvalid()"
      >
        <span class="cell-label" id="lbl-dimensions">{{ 'calc.dimensions' | t }}</span>
        <div class="cell-row">
          <input
            type="number"
            inputmode="decimal"
            min="0"
            formControlName="length"
            [attr.aria-label]="'calc.length' | t"
          />
          <span class="times" aria-hidden="true">×</span>
          <input
            type="number"
            inputmode="decimal"
            min="0"
            formControlName="width"
            [attr.aria-label]="'calc.width' | t"
          />
          <span class="times" aria-hidden="true">×</span>
          <input
            type="number"
            inputmode="decimal"
            min="0"
            formControlName="height"
            [attr.aria-label]="'calc.height' | t"
          />
          <select formControlName="dimension_unit" [attr.aria-label]="'calc.dimension_unit' | t">
            <option value="cm">cm</option>
            <option value="in">in</option>
          </select>
        </div>
        @if (dimsInvalid()) {
          <div class="cell-error">{{ 'validation.dimensions' | t }}</div>
        }
      </div>

      <button
        type="submit"
        class="btn btn-accent submit d-flex align-items-center justify-content-center gap-2"
        [disabled]="quotes.loading()"
      >
        @if (quotes.loading()) {
          <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        }
        {{ 'calc.submit' | t }}
        <i class="bi bi-arrow-right" aria-hidden="true"></i>
      </button>
    </form>
  `,
})
export class RateCalculator {
  protected readonly quotes = inject(QuoteService);
  private readonly positive = [Validators.required, Validators.min(0.01)];
  protected readonly form = inject(FormBuilder).nonNullable.group({
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

  protected dimsInvalid(): boolean {
    return this.invalid('length') || this.invalid('width') || this.invalid('height');
  }

  protected revalidate(name: string): void {
    this.form.get(name)?.updateValueAndValidity();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.quotes.quote(this.form.getRawValue());
  }
}
