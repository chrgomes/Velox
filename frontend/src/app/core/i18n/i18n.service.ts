import { DOCUMENT } from '@angular/common';
import { Injectable, Pipe, PipeTransform, computed, effect, inject, signal } from '@angular/core';
import { en, TKey } from './en';
import { es } from './es';
import { fr } from './fr';

export type Locale = 'en' | 'fr-CA' | 'es-419';

export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'fr-CA', label: 'Français', short: 'FR' },
  { code: 'es-419', label: 'Español', short: 'ES' },
];

const DICTIONARIES: Record<Locale, Record<TKey, string>> = { en, 'fr-CA': fr, 'es-419': es };
const STORAGE_KEY = 'velox.locale';

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && stored in DICTIONARIES) return stored;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  if (nav.startsWith('fr')) return 'fr-CA';
  if (nav.startsWith('es')) return 'es-419';
  return 'en';
}

/**
 * Runtime translations. All three dictionaries are typed against the English one, so a missing
 * key in French or Spanish is a compile error (docs/02-technical-spec.md §7).
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly document = inject(DOCUMENT);
  readonly locale = signal<Locale>(detectLocale());
  private readonly dict = computed(() => DICTIONARIES[this.locale()]);

  constructor() {
    effect(() => {
      const locale = this.locale();
      this.document.documentElement.lang = locale;
      try {
        localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        /* storage unavailable */
      }
    });
  }

  set(locale: Locale): void {
    if (locale in DICTIONARIES) this.locale.set(locale);
  }

  t(key: TKey, params?: Record<string, string | number>): string {
    let text = this.dict()[key] ?? en[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params))
        text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  /** Translate an API error code (e.g. "auth.invalid_credentials"), falling back to a generic message. */
  error(code: string): string {
    const key = `errors.${code}` as TKey;
    return key in en ? this.t(key) : this.t('errors.unknown');
  }

  has(key: string): key is TKey {
    return key in en;
  }

  formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat(this.locale(), { style: 'currency', currency }).format(
      amount / 100,
    );
  }

  formatDate(value: string | Date | null | undefined, style: 'date' | 'datetime' = 'date'): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    return new Intl.DateTimeFormat(
      this.locale(),
      style === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' },
    ).format(date);
  }
}

/** `{{ 'nav.ship' | t }}` — impure so it re-renders when the locale signal changes. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(key: TKey, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}
