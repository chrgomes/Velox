import { HttpClient } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import { API } from '../core/api';
import { AuthService } from '../core/auth/auth.service';
import { I18n, LOCALES, Locale, TranslatePipe } from '../core/i18n/i18n.service';

@Component({
  selector: 'vx-language-switcher',
  imports: [TranslatePipe],
  template: `
    <div class="btn-group btn-group-sm" role="group" [attr.aria-label]="'lang.label' | t">
      @for (l of locales; track l.code) {
        <button
          type="button"
          class="btn"
          [class.btn-primary]="!dark() && i18n.locale() === l.code"
          [class.btn-outline-primary]="!dark() && i18n.locale() !== l.code"
          [class.btn-light]="dark() && i18n.locale() === l.code"
          [class.btn-outline-light]="dark() && i18n.locale() !== l.code"
          [attr.aria-pressed]="i18n.locale() === l.code"
          [attr.lang]="l.code"
          [attr.title]="l.label"
          (click)="choose(l.code)"
        >
          {{ l.short }}
        </button>
      }
    </div>
  `,
})
export class LanguageSwitcher {
  /** Use on dark backgrounds (admin header) for sufficient contrast. */
  readonly dark = input(false);
  protected readonly i18n = inject(I18n);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  protected readonly locales = LOCALES;

  choose(locale: Locale): void {
    this.i18n.set(locale);
    const user = this.auth.user();
    if (user && user.locale !== locale) {
      // Remember the choice on the account so emails arrive in the same language.
      this.http.patch(`${API}/customers/me`, { locale }).subscribe({
        next: () => this.auth.setUser({ ...user, locale }),
        error: () => undefined,
      });
    }
  }
}
