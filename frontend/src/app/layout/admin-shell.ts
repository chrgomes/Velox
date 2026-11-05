import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { TranslatePipe } from '../core/i18n/i18n.service';
import { TKey } from '../core/i18n/en';
import { Brand } from '../shared/brand';
import { LanguageSwitcher } from '../shared/language-switcher';

interface NavItem {
  path: string;
  icon: string;
  label: TKey;
  permission: string;
  exact?: boolean;
}

const ITEMS: NavItem[] = [
  {
    path: '/admin',
    icon: 'speedometer2',
    label: 'admin.nav.dashboard',
    permission: 'admin.dashboard.view',
    exact: true,
  },
  {
    path: '/admin/customers',
    icon: 'people',
    label: 'admin.nav.customers',
    permission: 'customers.view',
  },
  {
    path: '/admin/staff',
    icon: 'person-badge',
    label: 'admin.nav.staff',
    permission: 'staff.manage',
  },
  {
    path: '/admin/audit',
    icon: 'clipboard-data',
    label: 'admin.nav.audit',
    permission: 'audit.view',
  },
  {
    path: '/admin/settings',
    icon: 'sliders',
    label: 'admin.nav.settings',
    permission: 'settings.manage',
  },
];

@Component({
  selector: 'vx-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitcher, Brand],
  template: `
    <a class="skip-link btn btn-primary" href="#main">{{ 'a11y.skip' | t }}</a>
    <header class="bg-navy sticky-top">
      <div class="container-fluid px-3 px-lg-4 py-2 d-flex flex-wrap align-items-center gap-3">
        <span class="on-navy d-inline-flex align-items-center gap-2"
          ><vx-brand /><span class="badge bg-accent-vx">{{ 'admin.badge' | t }}</span></span
        >
        <nav class="d-flex flex-wrap gap-1 ms-lg-3" [attr.aria-label]="'nav.admin' | t">
          @for (item of items(); track item.path) {
            <a
              class="btn btn-sm btn-outline-on-navy border-0"
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: !!item.exact }"
            >
              <i class="bi me-1" [class]="'bi-' + item.icon" aria-hidden="true"></i
              >{{ item.label | t }}
            </a>
          }
        </nav>
        <div class="ms-auto d-flex align-items-center gap-2">
          <vx-language-switcher [dark]="true" />
          <a class="btn btn-sm btn-outline-light" routerLink="/app/settings"
            ><i class="bi bi-gear" aria-hidden="true"></i
            ><span class="visually-hidden">{{ 'nav.settings' | t }}</span></a
          >
          <button type="button" class="btn btn-sm btn-outline-light" (click)="auth.logout()">
            {{ 'nav.logout' | t }}
          </button>
        </div>
      </div>
    </header>
    <main id="main" tabindex="-1" class="container-fluid px-3 px-lg-4 py-4 bg-surface min-vh-100">
      <router-outlet />
    </main>
  `,
})
export class AdminShell {
  protected readonly auth = inject(AuthService);
  protected readonly items = computed(() => ITEMS.filter((i) => this.auth.can(i.permission)));
}
