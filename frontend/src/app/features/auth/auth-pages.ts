import { HttpClient } from '@angular/common/http';
import { Component, OnInit, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { API, errorCode, errorDetails } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, TranslatePipe } from '../../core/i18n/i18n.service';
import { FieldError } from '../../shared/field-error';
import { PASSWORD_MIN, matchControl, passwordStrength } from '../../shared/password-validators';

const CARD = 'container py-5';

function safeReturnUrl(url: string | null | undefined): string | null {
  // Only allow in-app paths (no protocol-relative or absolute URLs).
  return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

@Component({
  selector: 'vx-login',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError],
  template: `
    <div [class]="card" style="max-width: 460px">
      <div class="card border-0 shadow-card">
        <div class="card-body p-4">
          @if (!mfaToken()) {
            <h1 class="h3 mb-3">{{ 'login.title' | t }}</h1>
            @if (expired()) {
              <div class="alert alert-info small">{{ 'login.expired' | t }}</div>
            }
            @if (error()) {
              <div class="alert alert-danger" role="alert">{{ error() }}</div>
            }
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <div class="mb-3">
                <label class="form-label" for="login-email">{{ 'field.email' | t }}</label>
                <input
                  id="login-email"
                  type="email"
                  class="form-control"
                  formControlName="email"
                  autocomplete="username"
                  [class.is-invalid]="bad('email')"
                />
                <vx-field-error [control]="form.get('email')" />
              </div>
              <div class="mb-2">
                <label class="form-label" for="login-password">{{ 'field.password' | t }}</label>
                <input
                  id="login-password"
                  type="password"
                  class="form-control"
                  formControlName="password"
                  autocomplete="current-password"
                  [class.is-invalid]="bad('password')"
                />
                <vx-field-error [control]="form.get('password')" />
              </div>
              <p class="small mb-3">
                <a routerLink="/forgot-password">{{ 'login.forgot' | t }}</a>
              </p>
              <button class="btn btn-primary w-100" type="submit" [disabled]="busy()">
                {{ 'login.submit' | t }}
              </button>
            </form>
            <p class="small text-center mt-3 mb-0">
              {{ 'login.no_account' | t }} <a routerLink="/register">{{ 'nav.signup' | t }}</a>
            </p>
          } @else {
            <h1 class="h3 mb-2">{{ 'mfa.challenge_title' | t }}</h1>
            <p class="text-muted-strong small">{{ 'mfa.challenge_body' | t }}</p>
            @if (error()) {
              <div class="alert alert-danger" role="alert">{{ error() }}</div>
            }
            <form [formGroup]="mfaForm" (ngSubmit)="submitMfa()" novalidate>
              <label class="form-label" for="mfa-code">{{ 'mfa.code' | t }}</label>
              <input
                id="mfa-code"
                class="form-control form-control-lg tabular mb-3"
                formControlName="code"
                autocomplete="one-time-code"
                inputmode="text"
              />
              <button class="btn btn-primary w-100" type="submit" [disabled]="busy()">
                {{ 'mfa.verify' | t }}
              </button>
            </form>
            <button
              type="button"
              class="btn btn-link btn-sm mt-2 px-0"
              (click)="mfaToken.set(null)"
            >
              {{ 'mfa.back' | t }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  readonly returnUrl = input<string | undefined>();
  readonly expired = input<string | undefined>();
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  protected readonly card = CARD;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mfaToken = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly mfaForm = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  bad(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && c.touched;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: (res) => {
        this.busy.set(false);
        if ('mfa_token' in res) this.mfaToken.set(res.mfa_token);
        else this.done();
      },
      error: (err) => this.fail(err),
    });
  }

  submitMfa(): void {
    if (this.mfaForm.invalid || !this.mfaToken()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.loginMfa(this.mfaToken()!, this.mfaForm.getRawValue().code.trim()).subscribe({
      next: () => this.done(),
      error: (err) => {
        if (errorCode(err) === 'auth.mfa_token_invalid') this.mfaToken.set(null);
        this.fail(err);
      },
    });
  }

  private done(): void {
    this.busy.set(false);
    void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()) ?? this.auth.homeUrl());
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    const code = errorCode(err);
    const retry = Number(errorDetails(err)['retry_after'] ?? 0);
    this.error.set(
      code === 'auth.account_locked' || code === 'rate_limited'
        ? this.i18n.t('errors.auth.account_locked_minutes', {
            n: Math.max(1, Math.ceil(retry / 60)),
          })
        : this.i18n.error(code),
    );
  }
}

@Component({
  selector: 'vx-register',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError],
  template: `
    <div [class]="card" style="max-width: 560px">
      <div class="card border-0 shadow-card">
        <div class="card-body p-4">
          <h1 class="h3 mb-1">{{ 'register.title' | t }}</h1>
          <p class="text-muted-strong mb-4">{{ 'register.lead' | t }}</p>
          @if (error()) {
            <div class="alert alert-danger" role="alert">{{ error() }}</div>
          }
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="row g-3">
              <div class="col-12 col-sm-6">
                <label class="form-label" for="reg-first">{{ 'field.first_name' | t }}</label>
                <input
                  id="reg-first"
                  class="form-control"
                  formControlName="first_name"
                  autocomplete="given-name"
                  [class.is-invalid]="bad('first_name')"
                />
                <vx-field-error [control]="form.get('first_name')" />
              </div>
              <div class="col-12 col-sm-6">
                <label class="form-label" for="reg-last">{{ 'field.last_name' | t }}</label>
                <input
                  id="reg-last"
                  class="form-control"
                  formControlName="last_name"
                  autocomplete="family-name"
                  [class.is-invalid]="bad('last_name')"
                />
                <vx-field-error [control]="form.get('last_name')" />
              </div>
              <div class="col-12">
                <label class="form-label" for="reg-email">{{ 'field.email' | t }}</label>
                <input
                  id="reg-email"
                  type="email"
                  class="form-control"
                  formControlName="email"
                  autocomplete="email"
                  [class.is-invalid]="bad('email')"
                />
                <vx-field-error [control]="form.get('email')" />
              </div>
              <div class="col-12">
                <label class="form-label" for="reg-password">{{ 'field.password' | t }}</label>
                <input
                  id="reg-password"
                  type="password"
                  class="form-control"
                  formControlName="password"
                  autocomplete="new-password"
                  aria-describedby="pw-hint"
                  [class.is-invalid]="bad('password')"
                />
                <div id="pw-hint" class="form-text">
                  {{ 'register.password_hint' | t: { n: min } }}
                </div>
                <vx-field-error [control]="form.get('password')" />
              </div>
              <div class="col-12 col-sm-6">
                <label class="form-label" for="reg-country">{{ 'field.country' | t }}</label>
                <select id="reg-country" class="form-select" formControlName="country">
                  <option value="CA">{{ 'country.CA' | t }}</option>
                  <option value="US">{{ 'country.US' | t }}</option>
                </select>
              </div>
              <div class="col-12 col-sm-6">
                <label class="form-label" for="reg-locale">{{ 'field.language' | t }}</label>
                <select
                  id="reg-locale"
                  class="form-select"
                  formControlName="locale"
                  (change)="i18n.set(form.getRawValue().locale)"
                >
                  <option value="en">English</option>
                  <option value="fr-CA">Français</option>
                  <option value="es-419">Español</option>
                </select>
              </div>
              <div class="col-12">
                <div class="form-check">
                  <input
                    id="reg-terms"
                    type="checkbox"
                    class="form-check-input"
                    formControlName="accept_terms"
                    [class.is-invalid]="bad('accept_terms')"
                  />
                  <label class="form-check-label" for="reg-terms">
                    {{ 'register.accept_prefix' | t }}
                    <a routerLink="/terms" target="_blank">{{ 'nav.terms' | t }}</a>
                    {{ 'register.accept_and' | t }}
                    <a routerLink="/privacy" target="_blank">{{ 'nav.privacy' | t }}</a>
                  </label>
                </div>
                <vx-field-error [control]="form.get('accept_terms')" />
              </div>
            </div>
            <button class="btn btn-accent w-100 mt-4" type="submit" [disabled]="busy()">
              {{ 'register.submit' | t }}
            </button>
          </form>
          <p class="small text-center mt-3 mb-0">
            {{ 'register.have_account' | t }} <a routerLink="/login">{{ 'nav.login' | t }}</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly card = CARD;
  protected readonly min = PASSWORD_MIN;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    first_name: ['', [Validators.required, Validators.maxLength(100)]],
    last_name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(PASSWORD_MIN),
        Validators.maxLength(128),
        passwordStrength,
      ],
    ],
    country: ['CA' as 'US' | 'CA'],
    locale: [this.i18n.locale()],
    accept_terms: [false, Validators.requiredTrue],
  });

  constructor() {
    // Keep the account language in step with the site language switcher.
    effect(() => this.form.controls.locale.setValue(this.i18n.locale(), { emitEvent: false }));
  }

  bad(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && c.touched;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl('/app?welcome=1'),
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(errorCode(err)));
      },
    });
  }
}

@Component({
  selector: 'vx-verify-email',
  imports: [RouterLink, TranslatePipe],
  template: `
    <div [class]="card" style="max-width: 520px">
      <div class="card border-0 shadow-card">
        <div class="card-body p-4 text-center">
          @switch (state()) {
            @case ('working') {
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">{{ 'common.loading' | t }}</span>
              </div>
            }
            @case ('ok') {
              <span class="icon-circle mb-3" aria-hidden="true"
                ><i class="bi bi-check-lg"></i
              ></span>
              <h1 class="h4">{{ 'verify.ok_title' | t }}</h1>
              <p class="text-muted-strong">{{ 'verify.ok_body' | t }}</p>
              <a
                class="btn btn-primary"
                [routerLink]="auth.isAuthenticated() ? auth.homeUrl() : '/login'"
                >{{ 'common.continue' | t }}</a
              >
            }
            @default {
              <h1 class="h4">{{ 'verify.fail_title' | t }}</h1>
              <p class="text-muted-strong">{{ 'verify.fail_body' | t }}</p>
              <a
                class="btn btn-outline-primary"
                [routerLink]="auth.isAuthenticated() ? '/app' : '/login'"
                >{{ 'common.continue' | t }}</a
              >
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class VerifyEmailPage implements OnInit {
  readonly token = input<string | undefined>();
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);
  protected readonly card = CARD;
  protected readonly state = signal<'working' | 'ok' | 'failed'>('working');

  ngOnInit(): void {
    const token = this.token();
    if (!token) {
      this.state.set('failed');
      return;
    }
    this.http.post(`${API}/auth/verify-email`, { token }).subscribe({
      next: () => {
        this.state.set('ok');
        const user = this.auth.user();
        if (user) this.auth.setUser({ ...user, email_verified: true });
      },
      error: () => this.state.set('failed'),
    });
  }
}

@Component({
  selector: 'vx-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError],
  template: `
    <div [class]="card" style="max-width: 460px">
      <div class="card border-0 shadow-card">
        <div class="card-body p-4">
          <h1 class="h3 mb-2">{{ 'forgot.title' | t }}</h1>
          @if (sent()) {
            <div class="alert alert-success" role="status">{{ 'forgot.sent' | t }}</div>
            <a routerLink="/login">{{ 'forgot.back' | t }}</a>
          } @else {
            <p class="text-muted-strong">{{ 'forgot.lead' | t }}</p>
            @if (error()) {
              <div class="alert alert-danger" role="alert">{{ error() }}</div>
            }
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <label class="form-label" for="forgot-email">{{ 'field.email' | t }}</label>
              <input
                id="forgot-email"
                type="email"
                class="form-control mb-1"
                formControlName="email"
                autocomplete="email"
              />
              <vx-field-error [control]="form.get('email')" />
              <button class="btn btn-primary w-100 mt-3" type="submit" [disabled]="busy()">
                {{ 'forgot.submit' | t }}
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordPage {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly card = CARD;
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.http.post(`${API}/auth/password/forgot`, this.form.getRawValue()).subscribe({
      next: () => this.sent.set(true),
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(errorCode(err)));
      },
    });
  }
}

@Component({
  selector: 'vx-reset-password',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError],
  template: `
    <div [class]="card" style="max-width: 460px">
      <div class="card border-0 shadow-card">
        <div class="card-body p-4">
          <h1 class="h3 mb-3">{{ (invite() ? 'reset.invite_title' : 'reset.title') | t }}</h1>
          @if (done()) {
            <div class="alert alert-success" role="status">{{ 'reset.done' | t }}</div>
            <a class="btn btn-primary" routerLink="/login">{{ 'nav.login' | t }}</a>
          } @else if (!token()) {
            <div class="alert alert-danger">{{ 'errors.auth.token_invalid' | t }}</div>
          } @else {
            @if (error()) {
              <div class="alert alert-danger" role="alert">{{ error() }}</div>
            }
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <div class="mb-3">
                <label class="form-label" for="reset-pw">{{ 'field.new_password' | t }}</label>
                <input
                  id="reset-pw"
                  type="password"
                  class="form-control"
                  formControlName="password"
                  autocomplete="new-password"
                />
                <div class="form-text">{{ 'register.password_hint' | t: { n: min } }}</div>
                <vx-field-error [control]="form.get('password')" />
              </div>
              <div class="mb-3">
                <label class="form-label" for="reset-confirm">{{
                  'field.confirm_password' | t
                }}</label>
                <input
                  id="reset-confirm"
                  type="password"
                  class="form-control"
                  formControlName="confirm"
                  autocomplete="new-password"
                />
                <vx-field-error [control]="form.get('confirm')" />
              </div>
              <button class="btn btn-primary w-100" type="submit" [disabled]="busy()">
                {{ 'reset.submit' | t }}
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class ResetPasswordPage {
  readonly token = input<string | undefined>();
  readonly invite = input<string | undefined>();
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly card = CARD;
  protected readonly min = PASSWORD_MIN;
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(PASSWORD_MIN),
        Validators.maxLength(128),
        passwordStrength,
      ],
    ],
    confirm: ['', [Validators.required, matchControl('password')]],
  });

  submit(): void {
    this.form.markAllAsTouched();
    this.form.controls.confirm.updateValueAndValidity();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.http
      .post(`${API}/auth/password/reset`, {
        token: this.token(),
        new_password: this.form.getRawValue().password,
      })
      .subscribe({
        next: () => this.done.set(true),
        error: (err) => {
          this.busy.set(false);
          this.error.set(this.i18n.error(errorCode(err)));
        },
      });
  }
}
