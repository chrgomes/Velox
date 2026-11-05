import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { API, Page, errorCode } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';
import { EmptyState } from '../../shared/empty-state';
import { FieldError } from '../../shared/field-error';

interface CustomerRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  country: string;
  locale: string;
  status: 'active' | 'suspended' | 'deleted';
  email_verified: boolean;
  mfa_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface AuditRow {
  id: number;
  created_at: string;
  action: string;
  actor_type: string;
  actor_email: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
}

const STATUS_CLASS: Record<string, string> = {
  active: 'text-bg-success',
  suspended: 'text-bg-warning',
  deleted: 'text-bg-secondary',
};

@Component({
  selector: 'vx-admin-dashboard',
  imports: [TranslatePipe, RouterLink],
  template: `
    <h1 class="h3 mb-4">{{ 'admin.dash.title' | t }}</h1>
    @if (data(); as d) {
      <div class="row g-3 mb-4">
        @for (s of stats(); track s.label) {
          <div class="col-6 col-md-4 col-xl-2">
            <div class="card border-0 shadow-card h-100">
              <div class="card-body">
                <div class="small text-muted-strong">{{ s.label | t }}</div>
                <div class="fs-3 fw-bold tabular" [class.text-danger]="s.alert && s.value > 0">
                  {{ s.value }}
                </div>
              </div>
            </div>
          </div>
        }
      </div>
      <div class="alert alert-info small">{{ 'admin.dash.phase_note' | t }}</div>
      <div class="card border-0 shadow-card">
        <div class="card-body">
          <h2 class="h5">{{ 'admin.dash.recent' | t }}</h2>
          <ul class="list-group list-group-flush">
            @for (c of d.recent_customers; track c.id) {
              <li class="list-group-item d-flex justify-content-between">
                <a [routerLink]="['/admin/customers', c.id]"
                  >{{ c.first_name }} {{ c.last_name }}</a
                >
                <span class="small text-muted-strong">{{
                  i18n.formatDate(c.created_at, 'datetime')
                }}</span>
              </li>
            } @empty {
              <li class="list-group-item text-muted-strong">{{ 'admin.customers.none' | t }}</li>
            }
          </ul>
        </div>
      </div>
    }
  `,
})
export class AdminDashboardPage implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18n);
  protected readonly data = signal<{
    customers: {
      total: number;
      active: number;
      suspended: number;
      new_7d: number;
      new_30d: number;
      verified: number;
    };
    staff: number;
    emails: { queued: number; failed: number };
    recent_customers: CustomerRow[];
  } | null>(null);
  protected readonly stats = computed<{ label: TKey; value: number; alert?: boolean }[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: 'admin.dash.customers', value: d.customers.total },
      { label: 'admin.dash.new_7d', value: d.customers.new_7d },
      { label: 'admin.dash.verified', value: d.customers.verified },
      { label: 'admin.dash.suspended', value: d.customers.suspended },
      { label: 'admin.dash.staff', value: d.staff },
      { label: 'admin.dash.emails_failed', value: d.emails.failed, alert: true },
    ];
  });

  ngOnInit(): void {
    this.http
      .get<NonNullable<ReturnType<typeof this.data>>>(`${API}/admin/dashboard`)
      .subscribe((d) => this.data.set(d));
  }
}

@Component({
  selector: 'vx-admin-customers',
  imports: [TranslatePipe, RouterLink, EmptyState],
  template: `
    <h1 class="h3 mb-3">{{ 'admin.customers.title' | t }}</h1>
    <div class="card border-0 shadow-card">
      <div class="card-body">
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <label class="visually-hidden" for="c-q">{{ 'common.search' | t }}</label>
            <input
              id="c-q"
              type="search"
              class="form-control"
              [placeholder]="'admin.customers.search_ph' | t"
              (input)="setQuery($any($event.target).value)"
            />
          </div>
          <div class="col-12 col-md-3">
            <label class="visually-hidden" for="c-status">{{ 'addr.col_status' | t }}</label>
            <select
              id="c-status"
              class="form-select"
              (change)="setStatus($any($event.target).value)"
            >
              <option value="">{{ 'admin.customers.all' | t }}</option>
              <option value="active">{{ 'status.active' | t }}</option>
              <option value="suspended">{{ 'status.suspended' | t }}</option>
              <option value="deleted">{{ 'status.deleted' | t }}</option>
            </select>
          </div>
        </div>
        @if (page(); as p) {
          @if (p.items.length === 0) {
            <vx-empty-state icon="people" [title]="'admin.customers.none' | t" />
          } @else {
            <table class="table align-middle table-stack mb-0">
              <thead>
                <tr>
                  <th scope="col">{{ 'addr.col_name' | t }}</th>
                  <th scope="col">{{ 'field.email' | t }}</th>
                  <th scope="col">{{ 'field.country' | t }}</th>
                  <th scope="col">{{ 'addr.col_status' | t }}</th>
                  <th scope="col">{{ 'admin.customers.joined' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (c of p.items; track c.id) {
                  <tr>
                    <td [attr.data-label]="'addr.col_name' | t">
                      <a [routerLink]="[c.id]">{{ c.first_name }} {{ c.last_name }}</a>
                    </td>
                    <td [attr.data-label]="'field.email' | t" class="small">
                      {{ c.email }}
                      @if (c.email_verified) {
                        <i
                          class="bi bi-patch-check text-success"
                          [attr.aria-label]="'addr.verified' | t"
                        ></i>
                      }
                    </td>
                    <td [attr.data-label]="'field.country' | t">{{ c.country }}</td>
                    <td [attr.data-label]="'addr.col_status' | t">
                      <span class="badge" [class]="statusClass[c.status]">{{
                        statusKey(c.status) | t
                      }}</span>
                    </td>
                    <td [attr.data-label]="'admin.customers.joined' | t" class="small">
                      {{ i18n.formatDate(c.created_at) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <nav
              class="d-flex justify-content-between align-items-center mt-3"
              [attr.aria-label]="'common.pagination' | t"
            >
              <button
                class="btn btn-sm btn-outline-secondary"
                [disabled]="p.page === 1"
                (click)="load(p.page - 1)"
              >
                {{ 'common.previous' | t }}
              </button>
              <span class="small">{{ 'admin.total' | t: { n: p.total } }}</span>
              <button
                class="btn btn-sm btn-outline-secondary"
                [disabled]="p.page * p.page_size >= p.total"
                (click)="load(p.page + 1)"
              >
                {{ 'common.next' | t }}
              </button>
            </nav>
          }
        }
      </div>
    </div>
  `,
})
export class AdminCustomersPage implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18n);
  protected readonly page = signal<Page<CustomerRow> | null>(null);
  protected readonly statusClass = STATUS_CLASS;
  private q = '';
  private status = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.load(1);
  }

  statusKey(s: string): TKey {
    return `status.${s}` as TKey;
  }

  setQuery(value: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.q = value.trim();
      this.load(1);
    }, 250);
  }

  setStatus(value: string): void {
    this.status = value;
    this.load(1);
  }

  load(page: number): void {
    let params = new HttpParams().set('page', page);
    if (this.q) params = params.set('q', this.q);
    if (this.status) params = params.set('status', this.status);
    this.http
      .get<Page<CustomerRow>>(`${API}/admin/customers`, { params })
      .subscribe((p) => this.page.set(p));
  }
}

@Component({
  selector: 'vx-admin-customer',
  imports: [TranslatePipe, RouterLink, ReactiveFormsModule],
  template: `
    <a routerLink="/admin/customers" class="small"
      ><i class="bi bi-arrow-left me-1" aria-hidden="true"></i>{{ 'admin.customers.back' | t }}</a
    >
    @if (c(); as c) {
      <div class="d-flex flex-wrap align-items-center gap-2 my-3">
        <h1 class="h3 mb-0 me-auto">{{ c.first_name }} {{ c.last_name }}</h1>
        <span class="badge fs-6" [class]="statusClass[c.status]">{{
          statusKey(c.status) | t
        }}</span>
      </div>
      @if (error()) {
        <div class="alert alert-danger">{{ error() }}</div>
      }
      <div class="row g-4">
        <div class="col-12 col-lg-5">
          <div class="card border-0 shadow-card">
            <div class="card-body">
              <dl class="row mb-0 small">
                <dt class="col-5">{{ 'field.email' | t }}</dt>
                <dd class="col-7 text-break">{{ c.email }}</dd>
                <dt class="col-5">{{ 'field.phone' | t }}</dt>
                <dd class="col-7">{{ c.phone || '—' }}</dd>
                <dt class="col-5">{{ 'field.country' | t }}</dt>
                <dd class="col-7">{{ c.country }} · {{ c.locale }}</dd>
                <dt class="col-5">{{ 'admin.customer.verified' | t }}</dt>
                <dd class="col-7">{{ (c.email_verified ? 'common.yes' : 'common.no') | t }}</dd>
                <dt class="col-5">{{ 'settings.mfa' | t }}</dt>
                <dd class="col-7">{{ (c.mfa_enabled ? 'common.yes' : 'common.no') | t }}</dd>
                <dt class="col-5">{{ 'admin.customer.addresses' | t }}</dt>
                <dd class="col-7">{{ c.address_count }}</dd>
                <dt class="col-5">{{ 'admin.customer.sessions' | t }}</dt>
                <dd class="col-7">{{ c.active_sessions }}</dd>
                <dt class="col-5">{{ 'admin.customers.joined' | t }}</dt>
                <dd class="col-7">{{ i18n.formatDate(c.created_at, 'datetime') }}</dd>
                <dt class="col-5">{{ 'admin.customer.last_login' | t }}</dt>
                <dd class="col-7">{{ i18n.formatDate(c.last_login_at, 'datetime') }}</dd>
              </dl>
            </div>
          </div>
          @if (auth.can('customers.suspend') && c.status !== 'deleted') {
            <form
              class="card border-0 shadow-card mt-3"
              [formGroup]="form"
              (ngSubmit)="toggle(c)"
              novalidate
            >
              <div class="card-body">
                <label class="form-label" for="reason">{{ 'admin.customer.reason' | t }}</label>
                <input id="reason" class="form-control mb-2" formControlName="reason" />
                <button
                  type="submit"
                  class="btn"
                  [class]="c.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success'"
                  [disabled]="form.invalid"
                >
                  {{
                    (c.status === 'active' ? 'admin.customer.suspend' : 'admin.customer.reactivate')
                      | t
                  }}
                </button>
              </div>
            </form>
          }
        </div>
        <div class="col-12 col-lg-7">
          <div class="card border-0 shadow-card">
            <div class="card-body">
              <h2 class="h5">{{ 'admin.customer.activity' | t }}</h2>
              @if (c.recent_activity === null) {
                <p class="small text-muted-strong mb-0">
                  {{ 'admin.customer.activity_hidden' | t }}
                </p>
              } @else {
                <ul class="list-group list-group-flush small">
                  @for (a of c.recent_activity; track a.id) {
                    <li class="list-group-item d-flex justify-content-between gap-2">
                      <code>{{ a.action }}</code
                      ><span class="text-muted-strong">{{
                        i18n.formatDate(a.created_at, 'datetime')
                      }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminCustomerPage implements OnInit {
  readonly id = input.required<string>();
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(AuthService);
  protected readonly statusClass = STATUS_CLASS;
  protected readonly error = signal<string | null>(null);
  protected readonly c = signal<
    | (CustomerRow & {
        phone: string | null;
        address_count: number;
        active_sessions: number;
        recent_activity: AuditRow[] | null;
      })
    | null
  >(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  ngOnInit(): void {
    this.load();
  }

  statusKey(s: string): TKey {
    return `status.${s}` as TKey;
  }

  load(): void {
    this.http
      .get<NonNullable<ReturnType<typeof this.c>>>(`${API}/admin/customers/${this.id()}`)
      .subscribe({
        next: (c) => this.c.set(c),
        error: (err) => this.error.set(this.i18n.error(errorCode(err))),
      });
  }

  toggle(c: CustomerRow): void {
    const action = c.status === 'active' ? 'suspend' : 'reactivate';
    this.http.post(`${API}/admin/customers/${c.id}/${action}`, this.form.getRawValue()).subscribe({
      next: () => {
        this.form.reset();
        this.load();
      },
      error: (err) => this.error.set(this.i18n.error(errorCode(err))),
    });
  }
}

interface StaffRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  roles: string[];
  mfa_enabled: boolean;
  invitation_pending: boolean;
  last_login_at: string | null;
}

@Component({
  selector: 'vx-admin-staff',
  imports: [TranslatePipe, ReactiveFormsModule, FieldError],
  template: `
    <h1 class="h3 mb-3">{{ 'admin.staff.title' | t }}</h1>
    @if (message()) {
      <div class="alert alert-success" role="status">{{ message() }}</div>
    }
    @if (error()) {
      <div class="alert alert-danger" role="alert">{{ error() }}</div>
    }
    <form
      class="card border-0 shadow-card mb-4"
      [formGroup]="form"
      (ngSubmit)="invite()"
      novalidate
    >
      <div class="card-body">
        <h2 class="h5">{{ 'admin.staff.invite' | t }}</h2>
        <div class="row g-2 align-items-end">
          <div class="col-12 col-md-3">
            <label class="form-label small" for="s-first">{{ 'field.first_name' | t }}</label
            ><input id="s-first" class="form-control" formControlName="first_name" />
          </div>
          <div class="col-12 col-md-3">
            <label class="form-label small" for="s-last">{{ 'field.last_name' | t }}</label
            ><input id="s-last" class="form-control" formControlName="last_name" />
          </div>
          <div class="col-12 col-md-3">
            <label class="form-label small" for="s-email">{{ 'field.email' | t }}</label
            ><input
              id="s-email"
              type="email"
              class="form-control"
              formControlName="email"
            /><vx-field-error [control]="form.get('email')" />
          </div>
          <div class="col-8 col-md-2">
            <label class="form-label small" for="s-role">{{ 'admin.staff.role' | t }}</label>
            <select id="s-role" class="form-select" formControlName="role">
              @for (r of roleCodes; track r) {
                <option [value]="r">{{ roleKey(r) | t }}</option>
              }
            </select>
          </div>
          <div class="col-4 col-md-1">
            <button class="btn btn-primary w-100" type="submit" [disabled]="form.invalid">
              {{ 'admin.staff.send' | t }}
            </button>
          </div>
        </div>
      </div>
    </form>
    <div class="card border-0 shadow-card">
      <div class="card-body">
        <table class="table align-middle table-stack mb-0">
          <thead>
            <tr>
              <th scope="col">{{ 'addr.col_name' | t }}</th>
              <th scope="col">{{ 'admin.staff.role' | t }}</th>
              <th scope="col">{{ 'addr.col_status' | t }}</th>
              <th scope="col">
                <span class="visually-hidden">{{ 'common.actions' | t }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (s of staff(); track s.id) {
              <tr>
                <td [attr.data-label]="'addr.col_name' | t">
                  <div class="fw-semibold">{{ s.first_name }} {{ s.last_name }}</div>
                  <div class="small text-muted-strong">{{ s.email }}</div>
                </td>
                <td [attr.data-label]="'admin.staff.role' | t">
                  <label class="visually-hidden" [for]="'role-' + s.id">{{
                    'admin.staff.role' | t
                  }}</label>
                  <select
                    class="form-select form-select-sm"
                    [id]="'role-' + s.id"
                    [value]="s.roles[0]"
                    (change)="setRole(s, $any($event.target).value)"
                    [disabled]="s.id === auth.user()?.id"
                  >
                    @for (r of roleCodes; track r) {
                      <option [value]="r" [selected]="s.roles.includes(r)">
                        {{ roleKey(r) | t }}
                      </option>
                    }
                  </select>
                </td>
                <td [attr.data-label]="'addr.col_status' | t" class="small">
                  <span class="badge" [class]="statusClass[s.status]">{{
                    statusKey(s.status) | t
                  }}</span>
                  @if (s.invitation_pending) {
                    <span class="badge text-bg-light border text-dark ms-1">{{
                      'admin.staff.pending' | t
                    }}</span>
                  }
                  @if (s.mfa_enabled) {
                    <span class="badge text-bg-success ms-1">MFA</span>
                  }
                </td>
                <td class="text-end text-nowrap">
                  @if (s.invitation_pending) {
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary me-1"
                      (click)="resend(s)"
                    >
                      {{ 'admin.staff.resend' | t }}
                    </button>
                  }
                  @if (s.id !== auth.user()?.id) {
                    <button
                      type="button"
                      class="btn btn-sm"
                      [class]="s.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success'"
                      (click)="toggle(s)"
                    >
                      {{
                        (s.status === 'active'
                          ? 'admin.customer.suspend'
                          : 'admin.customer.reactivate'
                        ) | t
                      }}
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdminStaffPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly auth = inject(AuthService);
  protected readonly statusClass = STATUS_CLASS;
  protected readonly roleCodes = ['super_admin', 'operations_admin', 'support'];
  protected readonly staff = signal<StaffRow[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    first_name: ['', Validators.required],
    last_name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['support'],
  });

  ngOnInit(): void {
    this.load();
  }

  roleKey(r: string): TKey {
    return `role.${r}` as TKey;
  }

  statusKey(s: string): TKey {
    return `status.${s}` as TKey;
  }

  load(): void {
    this.http.get<StaffRow[]>(`${API}/admin/staff`).subscribe((s) => this.staff.set(s));
  }

  private ok(key: TKey): void {
    this.error.set(null);
    this.message.set(this.i18n.t(key));
    this.load();
  }

  private bad(err: unknown): void {
    this.message.set(null);
    this.error.set(this.i18n.error(errorCode(err)));
    this.load();
  }

  invite(): void {
    const v = this.form.getRawValue();
    this.http
      .post(`${API}/admin/staff`, {
        first_name: v.first_name,
        last_name: v.last_name,
        email: v.email,
        roles: [v.role],
      })
      .subscribe({
        next: () => {
          this.form.reset({ role: 'support' });
          this.ok('admin.staff.invited');
        },
        error: (err) => this.bad(err),
      });
  }

  setRole(s: StaffRow, role: string): void {
    this.http
      .patch(`${API}/admin/staff/${s.id}`, { roles: [role] })
      .subscribe({ next: () => this.ok('settings.saved'), error: (e) => this.bad(e) });
  }

  toggle(s: StaffRow): void {
    const status = s.status === 'active' ? 'suspended' : 'active';
    this.http
      .patch(`${API}/admin/staff/${s.id}`, { status })
      .subscribe({ next: () => this.ok('settings.saved'), error: (e) => this.bad(e) });
  }

  resend(s: StaffRow): void {
    this.http
      .post(`${API}/admin/staff/${s.id}/resend-invite`, {})
      .subscribe({ next: () => this.ok('admin.staff.invited'), error: (e) => this.bad(e) });
  }
}

@Component({
  selector: 'vx-admin-audit',
  imports: [TranslatePipe],
  template: `
    <h1 class="h3 mb-3">{{ 'admin.audit.title' | t }}</h1>
    <div class="card border-0 shadow-card">
      <div class="card-body">
        <div class="mb-3" style="max-width: 360px">
          <label class="visually-hidden" for="au-action">{{ 'admin.audit.filter' | t }}</label>
          <input
            id="au-action"
            class="form-control"
            [placeholder]="'admin.audit.filter_ph' | t"
            (change)="filter($any($event.target).value)"
          />
        </div>
        @if (page(); as p) {
          <div class="table-responsive">
            <table class="table table-sm align-middle small mb-0">
              <thead>
                <tr>
                  <th scope="col">{{ 'admin.audit.when' | t }}</th>
                  <th scope="col">{{ 'admin.audit.action' | t }}</th>
                  <th scope="col">{{ 'admin.audit.actor' | t }}</th>
                  <th scope="col">{{ 'admin.audit.entity' | t }}</th>
                  <th scope="col">IP</th>
                  <th scope="col">{{ 'admin.audit.details' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (a of p.items; track a.id) {
                  <tr>
                    <td class="text-nowrap">{{ i18n.formatDate(a.created_at, 'datetime') }}</td>
                    <td>
                      <code>{{ a.action }}</code>
                    </td>
                    <td>{{ a.actor_email ?? a.actor_type }}</td>
                    <td class="text-break">{{ a.entity_type }} {{ a.entity_id }}</td>
                    <td>{{ a.ip ?? '—' }}</td>
                    <td class="text-break font-monospace">{{ meta(a) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <nav
            class="d-flex justify-content-between align-items-center mt-3"
            [attr.aria-label]="'common.pagination' | t"
          >
            <button
              class="btn btn-sm btn-outline-secondary"
              [disabled]="p.page === 1"
              (click)="load(p.page - 1)"
            >
              {{ 'common.previous' | t }}
            </button>
            <span>{{ 'admin.total' | t: { n: p.total } }}</span>
            <button
              class="btn btn-sm btn-outline-secondary"
              [disabled]="p.page * p.page_size >= p.total"
              (click)="load(p.page + 1)"
            >
              {{ 'common.next' | t }}
            </button>
          </nav>
        }
      </div>
    </div>
  `,
})
export class AdminAuditPage implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18n);
  protected readonly page = signal<Page<AuditRow> | null>(null);
  private action = '';

  ngOnInit(): void {
    this.load(1);
  }

  meta(a: AuditRow): string {
    return Object.keys(a.metadata ?? {}).length ? JSON.stringify(a.metadata) : '';
  }

  filter(value: string): void {
    this.action = value.trim();
    this.load(1);
  }

  load(page: number): void {
    let params = new HttpParams().set('page', page).set('page_size', 50);
    if (this.action) params = params.set('action', this.action);
    this.http
      .get<Page<AuditRow>>(`${API}/admin/audit-logs`, { params })
      .subscribe((p) => this.page.set(p));
  }
}

@Component({
  selector: 'vx-admin-settings',
  imports: [TranslatePipe, ReactiveFormsModule],
  template: `
    <h1 class="h3 mb-3">{{ 'admin.settings.title' | t }}</h1>
    @if (message()) {
      <div class="alert" [class]="ok() ? 'alert-success' : 'alert-danger'" role="status">
        {{ message() }}
      </div>
    }
    <form
      class="card border-0 shadow-card"
      [formGroup]="form"
      (ngSubmit)="save()"
      novalidate
      style="max-width: 720px"
    >
      <div class="card-body">
        <div class="form-check form-switch mb-3">
          <input
            id="st-reg"
            class="form-check-input"
            type="checkbox"
            role="switch"
            formControlName="registration_open"
          />
          <label class="form-check-label" for="st-reg">{{
            'admin.settings.registration_open' | t
          }}</label>
        </div>
        <div class="mb-3">
          <label class="form-label" for="st-email">{{ 'admin.settings.support_email' | t }}</label>
          <input id="st-email" type="email" class="form-control" formControlName="support_email" />
        </div>
        <div class="mb-3">
          <label class="form-label" for="st-banner">{{ 'admin.settings.banner' | t }}</label>
          <input
            id="st-banner"
            class="form-control"
            formControlName="maintenance_banner"
            maxlength="200"
          />
        </div>
        <div class="mb-3">
          <label class="form-label" for="st-quote">{{ 'admin.settings.quote_minutes' | t }}</label>
          <input
            id="st-quote"
            type="number"
            min="1"
            max="1440"
            class="form-control"
            formControlName="quote_cache_minutes"
            style="max-width: 10rem"
          />
        </div>
        <button class="btn btn-primary" type="submit" [disabled]="form.invalid">
          {{ 'common.save' | t }}
        </button>
      </div>
    </form>
  `,
})
export class AdminSettingsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly message = signal<string | null>(null);
  protected readonly ok = signal(true);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    registration_open: [true],
    support_email: ['', [Validators.required, Validators.email]],
    maintenance_banner: [''],
    quote_cache_minutes: [30, [Validators.required, Validators.min(1), Validators.max(1440)]],
  });

  ngOnInit(): void {
    this.http
      .get<ReturnType<typeof this.form.getRawValue>>(`${API}/admin/settings`)
      .subscribe((s) => this.form.reset(s));
  }

  save(): void {
    const v = this.form.getRawValue();
    this.http
      .patch(`${API}/admin/settings`, { ...v, quote_cache_minutes: Number(v.quote_cache_minutes) })
      .subscribe({
        next: () => {
          this.ok.set(true);
          this.message.set(this.i18n.t('settings.saved'));
        },
        error: (err) => {
          this.ok.set(false);
          this.message.set(this.i18n.error(errorCode(err)));
        },
      });
  }
}
