import { HttpClient } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { API, errorCode } from '../../core/api';
import { AuthService, CurrentUser } from '../../core/auth/auth.service';
import { I18n, LOCALES, Locale, TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';
import { FieldError } from '../../shared/field-error';
import { PASSWORD_MIN, matchControl, passwordStrength } from '../../shared/password-validators';

interface Session {
  id: string;
  started_at: string;
  last_used_at: string;
  ip: string | null;
  user_agent: string | null;
  current: boolean;
}

const NOTIFICATION_EVENTS: { key: string; label: TKey }[] = [
  { key: 'label_purchased', label: 'notif.label_purchased' },
  { key: 'tracking_out_for_delivery', label: 'notif.tracking_out_for_delivery' },
  { key: 'tracking_delivered', label: 'notif.tracking_delivered' },
  { key: 'tracking_exception', label: 'notif.tracking_exception' },
  { key: 'refund_processed', label: 'notif.refund_processed' },
  { key: 'marketing', label: 'notif.marketing' },
];

const TIMEZONES = [
  'America/St_Johns',
  'America/Halifax',
  'America/Toronto',
  'America/Winnipeg',
  'America/Regina',
  'America/Edmonton',
  'America/Vancouver',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

@Component({
  selector: 'vx-settings',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, NgTemplateOutlet],
  template: `
    <h1 class="h3 mb-4">{{ 'settings.title' | t }}</h1>
    @if (auth.user()?.mfa_setup_required) {
      <div class="alert alert-warning" role="alert">
        <i class="bi bi-shield-exclamation me-2" aria-hidden="true"></i
        >{{ 'settings.staff_mfa_required' | t }}
      </div>
    }

    <!-- Profile -->
    <section class="card border-0 shadow-card mb-4" aria-labelledby="s-profile">
      <form
        class="card-body p-3 p-md-4"
        [formGroup]="profile"
        (ngSubmit)="saveProfile()"
        novalidate
      >
        <h2 id="s-profile" class="h5 mb-3">{{ 'settings.profile' | t }}</h2>
        @if (notice()['profile']) {
          <div class="alert alert-success py-2" role="status">{{ notice()['profile'] }}</div>
        }
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label class="form-label" for="p-first">{{ 'field.first_name' | t }}</label>
            <input
              id="p-first"
              class="form-control"
              formControlName="first_name"
              autocomplete="given-name"
            />
            <vx-field-error [control]="profile.get('first_name')" />
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="p-last">{{ 'field.last_name' | t }}</label>
            <input
              id="p-last"
              class="form-control"
              formControlName="last_name"
              autocomplete="family-name"
            />
            <vx-field-error [control]="profile.get('last_name')" />
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="p-email">{{ 'field.email' | t }}</label>
            <input id="p-email" class="form-control" [value]="auth.user()?.email" disabled />
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="p-phone"
              >{{ 'field.phone' | t }}
              <span class="small text-muted-strong">({{ 'common.optional' | t }})</span></label
            >
            <input
              id="p-phone"
              type="tel"
              class="form-control"
              formControlName="phone"
              autocomplete="tel"
            />
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="p-locale">{{ 'field.language' | t }}</label>
            <select id="p-locale" class="form-select" formControlName="locale">
              @for (l of locales; track l.code) {
                <option [value]="l.code">{{ l.label }}</option>
              }
            </select>
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label" for="p-tz">{{ 'field.timezone' | t }}</label>
            <select id="p-tz" class="form-select" formControlName="timezone">
              @for (tz of timezones; track tz) {
                <option [value]="tz">{{ tz.replace('_', ' ') }}</option>
              }
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary mt-3" [disabled]="busy()">
          {{ 'common.save' | t }}
        </button>
      </form>
    </section>

    <!-- Security -->
    <section
      #security
      class="card border-0 shadow-card mb-4"
      aria-labelledby="s-security"
      tabindex="-1"
    >
      <div class="card-body p-3 p-md-4">
        <h2 id="s-security" class="h5 mb-3">{{ 'settings.security' | t }}</h2>
        @if (notice()['security']) {
          <div class="alert alert-success py-2" role="status">{{ notice()['security'] }}</div>
        }
        @if (failure()) {
          <div class="alert alert-danger py-2" role="alert">{{ failure() }}</div>
        }

        <h3 class="h6">{{ 'settings.mfa' | t }}</h3>
        @if (auth.user()?.mfa_enabled) {
          <p class="text-success">
            <i class="bi bi-shield-check me-1" aria-hidden="true"></i>{{ 'settings.mfa_on' | t }}
          </p>
          @if (recoveryCodes()) {
            <ng-container *ngTemplateOutlet="codesTpl" />
          }
          <form class="row g-2 align-items-end mb-2" [formGroup]="mfaManage" novalidate>
            <div class="col-12 col-md-4">
              <label class="form-label small" for="m-code">{{ 'mfa.code' | t }}</label>
              <input
                id="m-code"
                class="form-control"
                formControlName="code"
                autocomplete="one-time-code"
              />
            </div>
            @if (!auth.user()?.is_staff) {
              <div class="col-12 col-md-4">
                <label class="form-label small" for="m-pw">{{ 'field.password' | t }}</label>
                <input
                  id="m-pw"
                  type="password"
                  class="form-control"
                  formControlName="password"
                  autocomplete="current-password"
                />
              </div>
            }
            <div class="col-12 col-md-4 d-flex gap-2 flex-wrap">
              <button type="button" class="btn btn-outline-primary" (click)="regenerateCodes()">
                {{ 'settings.mfa_new_codes' | t }}
              </button>
              @if (!auth.user()?.is_staff) {
                <button type="button" class="btn btn-outline-danger" (click)="disableMfa()">
                  {{ 'settings.mfa_disable' | t }}
                </button>
              }
            </div>
          </form>
        } @else if (setup(); as s) {
          <ol class="small">
            <li>{{ 'settings.mfa_step1' | t }}</li>
            <li>{{ 'settings.mfa_step2' | t }}</li>
          </ol>
          <div class="d-flex flex-wrap gap-4 align-items-start">
            <div
              class="qr-box border rounded p-2 bg-white"
              [innerHTML]="s.qr"
              role="img"
              [attr.aria-label]="'settings.mfa_qr' | t"
            ></div>
            <div>
              <p class="small mb-1">{{ 'settings.mfa_manual' | t }}</p>
              <code class="d-block mb-3 user-select-all">{{ s.secret }}</code>
              <form
                [formGroup]="mfaEnable"
                (ngSubmit)="enableMfa()"
                class="d-flex gap-2"
                novalidate
              >
                <label class="visually-hidden" for="m-enable">{{ 'mfa.code' | t }}</label>
                <input
                  id="m-enable"
                  class="form-control tabular"
                  style="max-width: 10rem"
                  formControlName="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  placeholder="123456"
                />
                <button class="btn btn-primary" type="submit">
                  {{ 'settings.mfa_confirm' | t }}
                </button>
              </form>
            </div>
          </div>
        } @else {
          <p class="small text-muted-strong">{{ 'settings.mfa_off' | t }}</p>
          @if (recoveryCodes()) {
            <ng-container *ngTemplateOutlet="codesTpl" />
          }
          <button type="button" class="btn btn-primary" (click)="startMfa()">
            {{ 'settings.mfa_enable' | t }}
          </button>
        }

        <hr class="my-4" />
        <h3 class="h6">{{ 'settings.password' | t }}</h3>
        <form class="row g-2" [formGroup]="password" (ngSubmit)="changePassword()" novalidate>
          <div class="col-12 col-md-4">
            <label class="form-label small" for="pw-current">{{
              'field.current_password' | t
            }}</label>
            <input
              id="pw-current"
              type="password"
              class="form-control"
              formControlName="current"
              autocomplete="current-password"
            />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label small" for="pw-new">{{ 'field.new_password' | t }}</label>
            <input
              id="pw-new"
              type="password"
              class="form-control"
              formControlName="next"
              autocomplete="new-password"
            />
            <vx-field-error [control]="password.get('next')" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label small" for="pw-confirm">{{
              'field.confirm_password' | t
            }}</label>
            <input
              id="pw-confirm"
              type="password"
              class="form-control"
              formControlName="confirm"
              autocomplete="new-password"
            />
            <vx-field-error [control]="password.get('confirm')" />
          </div>
          <div class="col-12">
            <button type="submit" class="btn btn-outline-primary">
              {{ 'settings.password_change' | t }}
            </button>
          </div>
        </form>

        <hr class="my-4" />
        <div class="d-flex align-items-center mb-2">
          <h3 class="h6 mb-0 me-auto">{{ 'settings.sessions' | t }}</h3>
          <button type="button" class="btn btn-sm btn-outline-danger" (click)="logoutAll()">
            {{ 'settings.logout_all' | t }}
          </button>
        </div>
        <ul class="list-group">
          @for (s of sessions(); track s.id) {
            <li class="list-group-item d-flex flex-wrap align-items-center gap-2">
              <i class="bi bi-laptop text-muted-strong" aria-hidden="true"></i>
              <div class="flex-grow-1 small">
                <div class="fw-semibold">
                  {{ describeAgent(s.user_agent) }}
                  @if (s.current) {
                    <span class="badge text-bg-success ms-1">{{ 'settings.this_device' | t }}</span>
                  }
                </div>
                <div class="text-muted-strong">
                  {{
                    'settings.session_meta'
                      | t: { ip: s.ip ?? '—', date: i18n.formatDate(s.last_used_at, 'datetime') }
                  }}
                </div>
              </div>
              @if (!s.current) {
                <button type="button" class="btn btn-sm btn-outline-secondary" (click)="revoke(s)">
                  {{ 'settings.revoke' | t }}
                </button>
              }
            </li>
          }
        </ul>
      </div>
    </section>

    <ng-template #codesTpl>
      <div class="alert alert-info">
        <div class="fw-semibold mb-2">{{ 'settings.recovery_title' | t }}</div>
        <p class="small">{{ 'settings.recovery_body' | t }}</p>
        <ul class="list-unstyled row row-cols-2 row-cols-md-5 g-1 font-monospace mb-0">
          @for (c of recoveryCodes(); track c) {
            <li class="col">{{ c }}</li>
          }
        </ul>
      </div>
    </ng-template>

    @if (!auth.user()?.is_staff) {
      <!-- Notifications -->
      <section class="card border-0 shadow-card mb-4" aria-labelledby="s-notif">
        <div class="card-body p-3 p-md-4">
          <h2 id="s-notif" class="h5 mb-1">{{ 'settings.notifications' | t }}</h2>
          <p class="small text-muted-strong">{{ 'settings.notifications_lead' | t }}</p>
          @for (e of events; track e.key) {
            <div class="form-check form-switch">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                [id]="'n-' + e.key"
                [checked]="prefs()[e.key]"
                (change)="togglePref(e.key, $any($event.target).checked)"
              />
              <label class="form-check-label" [for]="'n-' + e.key">{{ e.label | t }}</label>
            </div>
          }
        </div>
      </section>

      <!-- Close account -->
      <section class="card border-danger mb-4" aria-labelledby="s-close">
        <form
          class="card-body p-3 p-md-4"
          [formGroup]="close"
          (ngSubmit)="closeAccount()"
          novalidate
        >
          <h2 id="s-close" class="h5 text-danger">{{ 'settings.close' | t }}</h2>
          <p class="small">{{ 'settings.close_body' | t }}</p>
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-4">
              <label class="form-label small" for="c-pw">{{ 'field.password' | t }}</label>
              <input
                id="c-pw"
                type="password"
                class="form-control"
                formControlName="password"
                autocomplete="current-password"
              />
            </div>
            @if (auth.user()?.mfa_enabled) {
              <div class="col-12 col-md-3">
                <label class="form-label small" for="c-code">{{ 'mfa.code' | t }}</label>
                <input
                  id="c-code"
                  class="form-control"
                  formControlName="code"
                  autocomplete="one-time-code"
                />
              </div>
            }
            <div class="col-12 col-md-3">
              <label class="form-label small" for="c-confirm">{{
                'settings.close_type' | t
              }}</label>
              <input
                id="c-confirm"
                class="form-control"
                formControlName="confirm"
                placeholder="CLOSE"
              />
            </div>
            <div class="col-12 col-md-2">
              <button
                type="submit"
                class="btn btn-danger w-100"
                [disabled]="close.value.confirm !== 'CLOSE'"
              >
                {{ 'settings.close_submit' | t }}
              </button>
            </div>
          </div>
        </form>
      </section>
    }
  `,
})
export class SettingsPage implements OnInit, AfterViewInit {
  readonly section = input<string | undefined>();
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly locales = LOCALES;
  protected readonly timezones = TIMEZONES;
  protected readonly events = NOTIFICATION_EVENTS;
  private readonly securityRef = viewChild<ElementRef<HTMLElement>>('security');

  protected readonly busy = signal(false);
  protected readonly notice = signal<Record<string, string>>({});
  protected readonly failure = signal<string | null>(null);
  protected readonly sessions = signal<Session[]>([]);
  protected readonly prefs = signal<Record<string, boolean>>({});
  protected readonly setup = signal<{ secret: string; qr: SafeHtml } | null>(null);
  protected readonly recoveryCodes = signal<string[] | null>(null);

  protected readonly profile = this.fb.nonNullable.group({
    first_name: ['', [Validators.required, Validators.maxLength(100)]],
    last_name: ['', [Validators.required, Validators.maxLength(100)]],
    phone: [''],
    locale: ['en' as Locale],
    timezone: ['America/Toronto'],
  });
  protected readonly password = this.fb.nonNullable.group({
    current: ['', Validators.required],
    next: ['', [Validators.required, Validators.minLength(PASSWORD_MIN), passwordStrength]],
    confirm: ['', [Validators.required, matchControl('next')]],
  });
  protected readonly mfaEnable = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  protected readonly mfaManage = this.fb.nonNullable.group({ code: [''], password: [''] });
  protected readonly close = this.fb.nonNullable.group({
    password: ['', Validators.required],
    code: [''],
    confirm: [''],
  });

  ngOnInit(): void {
    const u = this.auth.user();
    if (u) {
      this.profile.reset({
        first_name: u.first_name,
        last_name: u.last_name,
        phone: u.phone ?? '',
        locale: u.locale,
        timezone: TIMEZONES.includes(u.timezone) ? u.timezone : 'America/Toronto',
      });
    }
    this.loadSessions();
    if (!u?.is_staff) {
      this.http
        .get<{ preferences: Record<string, boolean> }>(
          `${API}/customers/me/notification-preferences`,
        )
        .subscribe((r) => this.prefs.set(r.preferences));
    }
  }

  ngAfterViewInit(): void {
    if (this.section() === 'security')
      setTimeout(() => this.securityRef()?.nativeElement.focus(), 0);
  }

  private say(section: string, key: TKey): void {
    this.failure.set(null);
    this.notice.set({ ...this.notice(), [section]: this.i18n.t(key) });
  }

  private fail(err: unknown): void {
    this.failure.set(this.i18n.error(errorCode(err)));
  }

  saveProfile(): void {
    this.profile.markAllAsTouched();
    if (this.profile.invalid) return;
    this.busy.set(true);
    const v = this.profile.getRawValue();
    this.http
      .patch<CurrentUser>(`${API}/customers/me`, { ...v, phone: v.phone.trim() || null })
      .subscribe({
        next: (user) => {
          this.busy.set(false);
          this.auth.setUser(user);
          this.say('profile', 'settings.saved');
        },
        error: (err) => {
          this.busy.set(false);
          this.notice.set({ ...this.notice(), profile: this.i18n.error(errorCode(err)) });
        },
      });
  }

  private refreshMe(): void {
    this.http.get<CurrentUser>(`${API}/customers/me`).subscribe((u) => this.auth.setUser(u));
  }

  startMfa(): void {
    this.recoveryCodes.set(null);
    this.http.post<{ secret: string; qr_svg: string }>(`${API}/auth/mfa/setup`, {}).subscribe({
      // The SVG is generated by our own API from a fixed template (no user input), so it is safe to render.
      next: (r) =>
        this.setup.set({ secret: r.secret, qr: this.sanitizer.bypassSecurityTrustHtml(r.qr_svg) }),
      error: (err) => this.fail(err),
    });
  }

  enableMfa(): void {
    if (this.mfaEnable.invalid) return;
    this.http
      .post<{ recovery_codes: string[] }>(`${API}/auth/mfa/enable`, this.mfaEnable.getRawValue())
      .subscribe({
        next: (r) => {
          this.setup.set(null);
          this.mfaEnable.reset();
          this.recoveryCodes.set(r.recovery_codes);
          this.say('security', 'settings.mfa_enabled_msg');
          this.refreshMe();
        },
        error: (err) => this.fail(err),
      });
  }

  regenerateCodes(): void {
    this.http
      .post<{ recovery_codes: string[] }>(`${API}/auth/mfa/recovery-codes`, {
        code: this.mfaManage.getRawValue().code,
      })
      .subscribe({
        next: (r) => {
          this.recoveryCodes.set(r.recovery_codes);
          this.mfaManage.reset();
          this.say('security', 'settings.codes_regenerated');
        },
        error: (err) => this.fail(err),
      });
  }

  disableMfa(): void {
    this.http.post(`${API}/auth/mfa/disable`, this.mfaManage.getRawValue()).subscribe({
      next: () => {
        this.mfaManage.reset();
        this.recoveryCodes.set(null);
        this.say('security', 'settings.mfa_disabled_msg');
        this.refreshMe();
      },
      error: (err) => this.fail(err),
    });
  }

  changePassword(): void {
    this.password.markAllAsTouched();
    this.password.controls.confirm.updateValueAndValidity();
    if (this.password.invalid) return;
    const v = this.password.getRawValue();
    this.http
      .post(`${API}/auth/password/change`, { current_password: v.current, new_password: v.next })
      .subscribe({
        next: () => {
          this.password.reset();
          this.say('security', 'settings.password_changed');
          this.loadSessions();
        },
        error: (err) => this.fail(err),
      });
  }

  loadSessions(): void {
    this.http.get<Session[]>(`${API}/auth/sessions`).subscribe((s) => this.sessions.set(s));
  }

  revoke(s: Session): void {
    this.http.delete(`${API}/auth/sessions/${s.id}`).subscribe(() => this.loadSessions());
  }

  logoutAll(): void {
    this.http.post(`${API}/auth/logout-all`, {}).subscribe(() => {
      this.auth.clear();
      void this.auth.logout();
    });
  }

  describeAgent(ua: string | null): string {
    if (!ua) return this.i18n.t('settings.unknown_device');
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : this.i18n.t('settings.browser');
    const os = /Windows/.test(ua)
      ? 'Windows'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Android/.test(ua)
          ? 'Android'
          : /iPhone|iPad/.test(ua)
            ? 'iOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
    return os ? `${browser} · ${os}` : browser;
  }

  togglePref(key: string, enabled: boolean): void {
    this.http
      .put<{ preferences: Record<string, boolean> }>(
        `${API}/customers/me/notification-preferences`,
        { preferences: { [key]: enabled } },
      )
      .subscribe((r) => this.prefs.set(r.preferences));
  }

  closeAccount(): void {
    const v = this.close.getRawValue();
    this.http
      .request('DELETE', `${API}/customers/me`, {
        body: { password: v.password, code: v.code || null, confirm: v.confirm },
      })
      .subscribe({
        next: () => {
          this.auth.clear();
          window.location.assign('/');
        },
        error: (err) => this.fail(err),
      });
  }
}
