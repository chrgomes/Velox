import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { I18n } from '../core/i18n/i18n.service';
import { TKey } from '../core/i18n/en';

/**
 * Shows the first validation error of a control once it has been touched.
 * Components are OnPush by default, so this listens to the control's events (value, status,
 * touched) and re-renders through a signal instead of relying on the parent's change detection.
 */
@Component({
  selector: 'vx-field-error',
  template: `
    @if (message(); as m) {
      <div class="invalid-feedback d-block" [id]="id()">{{ m }}</div>
    }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl | null>();
  readonly id = input<string>('');
  private readonly i18n = inject(I18n);
  private readonly version = signal(0);

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      if (!control) return;
      const sub = control.events.subscribe(() => this.version.update((v) => v + 1));
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected readonly message = computed(() => {
    this.version();
    this.i18n.locale();
    const c = this.control();
    if (!c || !c.errors || !(c.touched || c.dirty)) return null;
    const [name, value] = Object.entries(c.errors)[0];
    const params: Record<string, string | number> = {};
    if (value && typeof value === 'object' && 'requiredLength' in value) {
      params['n'] = (value as { requiredLength: number }).requiredLength;
    }
    const key = `validation.${name}` as TKey;
    return this.i18n.has(key) ? this.i18n.t(key, params) : this.i18n.t('validation.invalid');
  });
}
