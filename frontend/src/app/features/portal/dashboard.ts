import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';
import { EmptyState } from '../../shared/empty-state';

interface Dashboard {
  shipping_available: boolean;
  shipments: {
    total: number;
    active: number;
    delivered: number;
    drafts: number;
    cancelled: number;
  };
  setup: {
    email_verified: boolean;
    has_addresses: boolean;
    has_default_sender: boolean;
    mfa_enabled: boolean;
  };
  address_count: number;
  currency: string;
}

interface SetupStep {
  label: TKey;
  done: boolean;
  link?: string;
  query?: Record<string, string>;
}

@Component({
  selector: 'vx-dashboard',
  imports: [RouterLink, TranslatePipe, EmptyState],
  template: `
    <h1 class="h3 mb-1">{{ 'dash.hello' | t: { name: auth.user()?.first_name ?? '' } }}</h1>
    <p class="text-muted-strong">{{ (welcome() ? 'dash.welcome' : 'dash.lead') | t }}</p>

    @if (data(); as d) {
      @if (!d.setup.email_verified) {
        <div class="alert alert-warning d-flex flex-wrap align-items-center gap-2" role="status">
          <i class="bi bi-envelope-exclamation" aria-hidden="true"></i>
          <span class="flex-grow-1">{{
            'dash.verify_banner' | t: { email: auth.user()?.email ?? '' }
          }}</span>
          <button
            type="button"
            class="btn btn-sm btn-outline-dark"
            (click)="resend()"
            [disabled]="resent()"
          >
            {{ (resent() ? 'dash.verify_sent' : 'dash.verify_resend') | t }}
          </button>
        </div>
      }

      <div class="row g-3 mb-4">
        @for (s of stats(); track s.label) {
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-card h-100">
              <div class="card-body">
                <div class="small text-muted-strong">{{ s.label | t }}</div>
                <div class="fs-3 fw-bold tabular">{{ s.value }}</div>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="row g-4">
        <div class="col-12 col-xl-7">
          <div class="card border-0 shadow-card h-100">
            <div class="card-body">
              <h2 class="h5">{{ 'dash.shipments_title' | t }}</h2>
              <vx-empty-state
                icon="truck"
                [title]="'dash.shipping_soon_title' | t"
                [text]="'dash.shipping_soon_body' | t"
              >
                <a class="btn btn-accent" routerLink="/" fragment="calculator">{{
                  'dash.compare_rates' | t
                }}</a>
              </vx-empty-state>
            </div>
          </div>
        </div>
        <div class="col-12 col-xl-5">
          <div class="card border-0 shadow-card h-100">
            <div class="card-body">
              <h2 class="h5">{{ 'dash.setup_title' | t }}</h2>
              <ul class="list-unstyled mb-0">
                @for (step of setup(); track step.label) {
                  <li class="d-flex align-items-center gap-2 py-2 border-bottom">
                    <i
                      class="bi fs-5"
                      [class]="
                        step.done
                          ? 'bi-check-circle-fill text-success'
                          : 'bi-circle text-muted-strong'
                      "
                      aria-hidden="true"
                    ></i>
                    <span class="flex-grow-1" [class.text-decoration-line-through]="step.done">{{
                      step.label | t
                    }}</span>
                    <span class="visually-hidden">{{
                      (step.done ? 'common.done' : 'common.todo') | t
                    }}</span>
                    @if (!step.done && step.link) {
                      <a
                        class="btn btn-sm btn-outline-primary"
                        [routerLink]="step.link"
                        [queryParams]="step.query"
                        >{{ 'common.start' | t }}</a
                      >
                    }
                  </li>
                }
              </ul>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="placeholder-glow">
        <span class="placeholder col-12" style="height: 8rem"></span>
      </div>
    }
  `,
})
export class DashboardPage implements OnInit {
  readonly welcome = input<string | undefined>();
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly resent = signal(false);

  protected readonly stats = computed<{ label: TKey; value: number }[]>(() => {
    const s = this.data()?.shipments;
    if (!s) return [];
    return [
      { label: 'dash.stat_total', value: s.total },
      { label: 'dash.stat_active', value: s.active },
      { label: 'dash.stat_delivered', value: s.delivered },
      { label: 'dash.stat_drafts', value: s.drafts },
    ];
  });

  protected readonly setup = computed<SetupStep[]>(() => {
    const s = this.data()?.setup;
    if (!s) return [];
    const steps: SetupStep[] = [
      { label: 'dash.setup_verify', done: s.email_verified },
      {
        label: 'dash.setup_address',
        done: s.has_default_sender,
        link: '/app/addresses',
        query: { new: '1' },
      },
      {
        label: 'dash.setup_mfa',
        done: s.mfa_enabled,
        link: '/app/settings',
        query: { section: 'security' },
      },
    ];
    return steps;
  });

  ngOnInit(): void {
    this.http.get<Dashboard>(`${API}/customers/me/dashboard`).subscribe((d) => this.data.set(d));
  }

  resend(): void {
    const email = this.auth.user()?.email;
    if (!email) return;
    this.http
      .post(`${API}/auth/resend-verification`, { email })
      .subscribe({ next: () => this.resent.set(true), error: () => this.resent.set(true) });
  }
}
