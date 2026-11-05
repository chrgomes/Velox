import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { shareReplay } from 'rxjs';
import { API, Page, errorCode } from '../../core/api';
import { I18n, TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';
import { EmptyState } from '../../shared/empty-state';
import { FieldError } from '../../shared/field-error';
import { SimulatedNotice } from '../../shared/simulated-notice';
import { postalFor } from '../public/rate-calculator';

export interface Address {
  id: string;
  nickname: string | null;
  name: string | null;
  company: string | null;
  street1: string;
  street2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: 'US' | 'CA';
  phone: string | null;
  email: string | null;
  is_residential: boolean;
  is_default_sender: boolean;
  verified: boolean;
}

interface Country {
  code: 'US' | 'CA';
  name: string;
  regions: { code: string; name: string }[];
}

interface Verification {
  is_valid: boolean;
  simulated: boolean;
  messages: string[];
  suggestion: {
    street1: string;
    street2: string | null;
    city: string;
    region: string;
    postal_code: string;
    country: string;
  } | null;
}

@Component({
  selector: 'vx-addresses',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, EmptyState, SimulatedNotice],
  template: `
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <h1 class="h3 mb-0 me-auto">{{ 'addr.title' | t }}</h1>
      @if (!editing()) {
        <button type="button" class="btn btn-primary" (click)="startNew()">
          <i class="bi bi-plus-lg me-1" aria-hidden="true"></i>{{ 'addr.add' | t }}
        </button>
      }
    </div>

    @if (message()) {
      <div class="alert alert-success" role="status">{{ message() }}</div>
    }

    @if (editing()) {
      <form
        class="card border-0 shadow-card mb-4"
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
      >
        <div class="card-body p-3 p-md-4">
          <h2 class="h5 mb-3">
            {{ (editing() === 'new' ? 'addr.new_title' : 'addr.edit_title') | t }}
          </h2>
          @if (error()) {
            <div class="alert alert-danger" role="alert">{{ error() }}</div>
          }
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <label class="form-label" for="a-nick"
                >{{ 'addr.nickname' | t }}
                <span class="text-muted-strong small">({{ 'common.optional' | t }})</span></label
              >
              <input
                id="a-nick"
                class="form-control"
                formControlName="nickname"
                [placeholder]="'addr.nickname_ph' | t"
              />
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="a-name">{{ 'addr.name' | t }}</label>
              <input id="a-name" class="form-control" formControlName="name" autocomplete="name" />
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label" for="a-company"
                >{{ 'addr.company' | t }}
                <span class="text-muted-strong small">({{ 'common.optional' | t }})</span></label
              >
              <input
                id="a-company"
                class="form-control"
                formControlName="company"
                autocomplete="organization"
              />
            </div>
            @if (form.errors?.['nameOrCompany'] && form.touched) {
              <div class="col-12">
                <div class="invalid-feedback d-block">{{ 'validation.name_or_company' | t }}</div>
              </div>
            }
            <div class="col-12 col-md-4">
              <label class="form-label" for="a-country">{{ 'field.country' | t }}</label>
              <select
                id="a-country"
                class="form-select"
                formControlName="country"
                (change)="onCountry()"
              >
                <option value="CA">{{ 'country.CA' | t }}</option>
                <option value="US">{{ 'country.US' | t }}</option>
              </select>
            </div>
            <div class="col-12 col-md-8">
              <label class="form-label" for="a-street1">{{ 'addr.street1' | t }}</label>
              <input
                id="a-street1"
                class="form-control"
                formControlName="street1"
                autocomplete="address-line1"
                [class.is-invalid]="bad('street1')"
              />
              <vx-field-error [control]="form.get('street1')" />
            </div>
            <div class="col-12">
              <label class="form-label" for="a-street2"
                >{{ 'addr.street2' | t }}
                <span class="text-muted-strong small">({{ 'common.optional' | t }})</span></label
              >
              <input
                id="a-street2"
                class="form-control"
                formControlName="street2"
                autocomplete="address-line2"
              />
            </div>
            <div class="col-12 col-md-5">
              <label class="form-label" for="a-city">{{ 'addr.city' | t }}</label>
              <input
                id="a-city"
                class="form-control"
                formControlName="city"
                autocomplete="address-level2"
                [class.is-invalid]="bad('city')"
              />
              <vx-field-error [control]="form.get('city')" />
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="a-region">{{
                (form.value.country === 'US' ? 'addr.state' : 'addr.province') | t
              }}</label>
              <select
                id="a-region"
                class="form-select"
                formControlName="region"
                autocomplete="address-level1"
                [class.is-invalid]="bad('region')"
              >
                <option value="">—</option>
                @for (r of regions(); track r.code) {
                  <option [value]="r.code">{{ r.name }}</option>
                }
              </select>
              <vx-field-error [control]="form.get('region')" />
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label" for="a-postal">{{
                (form.value.country === 'US' ? 'calc.zip' : 'calc.postal') | t
              }}</label>
              <input
                id="a-postal"
                class="form-control"
                formControlName="postal_code"
                autocomplete="postal-code"
                [class.is-invalid]="bad('postal_code')"
              />
              <vx-field-error [control]="form.get('postal_code')" />
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="a-phone"
                >{{ 'field.phone' | t }}
                <span class="text-muted-strong small">({{ 'common.optional' | t }})</span></label
              >
              <input
                id="a-phone"
                type="tel"
                class="form-control"
                formControlName="phone"
                autocomplete="tel"
              />
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label" for="a-email"
                >{{ 'field.email' | t }}
                <span class="text-muted-strong small">({{ 'common.optional' | t }})</span></label
              >
              <input
                id="a-email"
                type="email"
                class="form-control"
                formControlName="email"
                [class.is-invalid]="bad('email')"
              />
              <vx-field-error [control]="form.get('email')" />
            </div>
            <div class="col-12 d-flex flex-wrap gap-4">
              <div class="form-check">
                <input
                  id="a-res"
                  type="checkbox"
                  class="form-check-input"
                  formControlName="is_residential"
                />
                <label class="form-check-label" for="a-res">{{ 'addr.residential' | t }}</label>
              </div>
              <div class="form-check">
                <input
                  id="a-default"
                  type="checkbox"
                  class="form-check-input"
                  formControlName="is_default_sender"
                />
                <label class="form-check-label" for="a-default">{{
                  'addr.default_sender' | t
                }}</label>
              </div>
            </div>
          </div>

          @if (verification(); as v) {
            <div class="mt-3" aria-live="polite">
              @if (v.simulated) {
                <vx-simulated-notice />
              }
              @if (v.is_valid && v.suggestion) {
                <div class="alert alert-success mb-0">
                  <div class="fw-semibold mb-1">{{ 'addr.verify_ok' | t }}</div>
                  <div class="small">
                    {{ v.suggestion.street1 }}, {{ v.suggestion.city }} {{ v.suggestion.region }}
                    {{ v.suggestion.postal_code }}
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm btn-success mt-2"
                    (click)="useSuggestion()"
                  >
                    {{ 'addr.use_suggestion' | t }}
                  </button>
                </div>
              } @else {
                <div class="alert alert-warning mb-0">
                  <div class="fw-semibold">{{ 'addr.verify_fail' | t }}</div>
                  <ul class="small mb-0">
                    @for (m of v.messages; track m) {
                      <li>{{ messageText(m) }}</li>
                    }
                  </ul>
                </div>
              }
            </div>
          }

          <div class="d-flex flex-wrap gap-2 mt-4">
            <button type="submit" class="btn btn-primary" [disabled]="busy()">
              {{ 'common.save' | t }}
            </button>
            <button
              type="button"
              class="btn btn-outline-primary"
              (click)="verify()"
              [disabled]="busy()"
            >
              <i class="bi bi-patch-check me-1" aria-hidden="true"></i>{{ 'addr.verify' | t }}
            </button>
            <button type="button" class="btn btn-link" (click)="cancel()">
              {{ 'common.cancel' | t }}
            </button>
          </div>
        </div>
      </form>
    }

    <div class="card border-0 shadow-card">
      <div class="card-body">
        <div class="mb-3" style="max-width: 360px">
          <label class="visually-hidden" for="a-search">{{ 'common.search' | t }}</label>
          <input
            id="a-search"
            type="search"
            class="form-control"
            [placeholder]="'addr.search_ph' | t"
            (input)="search($any($event.target).value)"
          />
        </div>
        @if (page(); as p) {
          @if (p.items.length === 0) {
            <vx-empty-state
              icon="journal-bookmark"
              [title]="'addr.empty_title' | t"
              [text]="'addr.empty_body' | t"
            />
          } @else {
            <table class="table align-middle table-stack mb-0">
              <thead>
                <tr>
                  <th scope="col">{{ 'addr.col_name' | t }}</th>
                  <th scope="col">{{ 'addr.col_address' | t }}</th>
                  <th scope="col">{{ 'addr.col_status' | t }}</th>
                  <th scope="col">
                    <span class="visually-hidden">{{ 'common.actions' | t }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (a of p.items; track a.id) {
                  <tr>
                    <td [attr.data-label]="'addr.col_name' | t">
                      <div class="fw-semibold">{{ a.nickname || a.name || a.company }}</div>
                      @if (a.nickname) {
                        <div class="small text-muted-strong">{{ a.name || a.company }}</div>
                      }
                    </td>
                    <td [attr.data-label]="'addr.col_address' | t" class="small">
                      {{ a.street1 }}
                      @if (a.street2) {
                        , {{ a.street2 }}
                      }
                      <br />{{ a.city }} {{ a.region }} {{ a.postal_code }} · {{ a.country }}
                    </td>
                    <td [attr.data-label]="'addr.col_status' | t">
                      @if (a.is_default_sender) {
                        <span class="badge text-bg-primary me-1">{{
                          'addr.default_badge' | t
                        }}</span>
                      }
                      @if (a.verified) {
                        <span class="badge text-bg-success"
                          ><i class="bi bi-patch-check me-1" aria-hidden="true"></i
                          >{{ 'addr.verified' | t }}</span
                        >
                      } @else {
                        <span class="badge text-bg-light border text-dark">{{
                          'addr.unverified' | t
                        }}</span>
                      }
                    </td>
                    <td class="text-end text-nowrap">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-primary me-1"
                        (click)="edit(a)"
                      >
                        {{ 'common.edit' | t }}
                      </button>
                      @if (confirmDelete() === a.id) {
                        <button type="button" class="btn btn-sm btn-danger" (click)="remove(a)">
                          {{ 'common.confirm_delete' | t }}
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-danger"
                          (click)="confirmDelete.set(a.id)"
                        >
                          {{ 'common.delete' | t }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (p.total > p.page_size) {
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
                <span class="small">{{
                  'common.page_of' | t: { page: p.page, pages: pages() }
                }}</span>
                <button
                  class="btn btn-sm btn-outline-secondary"
                  [disabled]="p.page >= pages()"
                  (click)="load(p.page + 1)"
                >
                  {{ 'common.next' | t }}
                </button>
              </nav>
            }
          }
        }
      </div>
    </div>
  `,
})
export class AddressesPage implements OnInit {
  readonly new = input<string | undefined>();
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly page = signal<Page<Address> | null>(null);
  protected readonly editing = signal<'new' | string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly verification = signal<Verification | null>(null);
  protected readonly confirmDelete = signal<string | null>(null);
  private query = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly countries = toSignal(
    this.http.get<Country[]>(`${API}/reference/countries`).pipe(shareReplay(1)),
    { initialValue: [] },
  );
  private readonly country = signal<'US' | 'CA'>('CA');
  protected readonly regions = computed(
    () => this.countries().find((c) => c.code === this.country())?.regions ?? [],
  );
  protected readonly pages = computed(() => {
    const p = this.page();
    return p ? Math.max(1, Math.ceil(p.total / p.page_size)) : 1;
  });

  protected readonly form = inject(FormBuilder).group(
    {
      nickname: [''],
      name: [''],
      company: [''],
      street1: ['', [Validators.required, Validators.maxLength(200)]],
      street2: [''],
      city: ['', [Validators.required, Validators.maxLength(100)]],
      region: ['', Validators.required],
      postal_code: ['', [Validators.required, postalFor('country')]],
      country: ['CA' as 'US' | 'CA'],
      phone: [''],
      email: ['', Validators.email],
      is_residential: [true],
      is_default_sender: [false],
    },
    {
      validators: (g) =>
        g.get('name')?.value?.trim() || g.get('company')?.value?.trim()
          ? null
          : { nameOrCompany: true },
    },
  );

  ngOnInit(): void {
    this.load(1);
    if (this.new()) this.startNew();
  }

  load(page: number): void {
    let params = new HttpParams().set('page', page).set('page_size', 25);
    if (this.query) params = params.set('q', this.query);
    this.http
      .get<Page<Address>>(`${API}/customers/addresses`, { params })
      .subscribe((p) => this.page.set(p));
  }

  search(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.query = value.trim();
      this.load(1);
    }, 250);
  }

  bad(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && c.touched;
  }

  onCountry(): void {
    this.country.set(this.form.value.country ?? 'CA');
    this.form.patchValue({ region: '' });
    this.form.get('postal_code')?.updateValueAndValidity();
  }

  startNew(): void {
    this.form.reset({
      country: 'CA',
      is_residential: true,
      is_default_sender: (this.page()?.total ?? 0) === 0,
    });
    this.country.set('CA');
    this.open('new');
  }

  edit(a: Address): void {
    this.form.reset({ ...a });
    this.country.set(a.country);
    this.open(a.id);
  }

  cancel(): void {
    this.editing.set(null);
  }

  private open(id: string): void {
    this.error.set(null);
    this.message.set(null);
    this.verification.set(null);
    this.editing.set(id);
  }

  private payload() {
    const v = this.form.getRawValue();
    const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
    return {
      ...v,
      nickname: clean(v.nickname),
      name: clean(v.name),
      company: clean(v.company),
      street2: clean(v.street2),
      phone: clean(v.phone),
      email: clean(v.email),
    };
  }

  verify(): void {
    const v = this.form.getRawValue();
    if (!v.street1 || !v.city || !v.region || !v.postal_code) {
      this.form.markAllAsTouched();
      return;
    }
    this.http
      .post<Verification>(`${API}/addresses/verify`, {
        street1: v.street1,
        street2: v.street2 || null,
        city: v.city,
        region: v.region,
        postal_code: v.postal_code,
        country: v.country,
      })
      .subscribe({
        next: (r) => this.verification.set(r),
        error: (err) => this.error.set(this.i18n.error(errorCode(err))),
      });
  }

  useSuggestion(): void {
    const s = this.verification()?.suggestion;
    if (s)
      this.form.patchValue({
        street1: s.street1,
        street2: s.street2 ?? '',
        city: s.city,
        region: s.region,
        postal_code: s.postal_code,
      });
  }

  messageText(code: string): string {
    const key = `addr.msg.${code.replace('address.', '')}` as TKey;
    return this.i18n.has(key) ? this.i18n.t(key) : code;
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const id = this.editing();
    const req =
      id === 'new'
        ? this.http.post<Address>(`${API}/customers/addresses`, this.payload())
        : this.http.patch<Address>(`${API}/customers/addresses/${id}`, this.payload());
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.editing.set(null);
        this.message.set(this.i18n.t('addr.saved'));
        this.load(this.page()?.page ?? 1);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(errorCode(err)));
      },
    });
  }

  remove(a: Address): void {
    this.http.delete(`${API}/customers/addresses/${a.id}`).subscribe(() => {
      this.confirmDelete.set(null);
      this.message.set(this.i18n.t('addr.deleted'));
      this.load(this.page()?.page ?? 1);
    });
  }
}
