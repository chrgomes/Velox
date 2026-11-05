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
  exact?: boolean;
}

@Component({
  selector: 'vx-portal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitcher, Brand],
  template: `
    <a class="skip-link btn btn-primary" href="#main">{{ 'a11y.skip' | t }}</a>
    <div class="portal-layout">
      <nav class="portal-side on-navy" [attr.aria-label]="'nav.portal' | t">
        <div class="px-2 pb-4"><vx-brand /></div>
        @for (item of items(); track item.path) {
          <a
            class="nav-link"
            [routerLink]="item.path"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: !!item.exact }"
            ariaCurrentWhenActive="page"
          >
            <i class="bi" [class]="'bi-' + item.icon" aria-hidden="true"></i>{{ item.label | t }}
          </a>
        }
        <div class="account">
          <span class="avatar" aria-hidden="true">{{ initials() }}</span>
          <div class="min-w-0 small">
            <p class="mb-0 text-white fw-semibold text-truncate">
              {{ auth.user()?.first_name }} {{ auth.user()?.last_name }}
            </p>
            <p class="mb-0 text-truncate" style="color: #a9b4cc">{{ auth.user()?.email }}</p>
          </div>
        </div>
      </nav>

      <div class="portal-main">
        <header class="portal-topbar">
          <span class="d-lg-none"><vx-brand /></span>
          <div class="ms-auto d-flex flex-wrap align-items-center gap-2">
            <vx-language-switcher />
            @if (!auth.isStaff()) {
              <a
                class="btn btn-accent d-none d-sm-inline-flex align-items-center gap-2"
                routerLink="/"
                fragment="calculator"
              >
                <i class="bi bi-calculator" aria-hidden="true"></i>{{ 'dash.compare_rates' | t }}
              </a>
            }
            <button type="button" class="btn btn-outline-secondary" (click)="auth.logout()">
              <i class="bi bi-box-arrow-right me-1" aria-hidden="true"></i>{{ 'nav.logout' | t }}
            </button>
          </div>
        </header>
        <main id="main" tabindex="-1" class="p-3 p-lg-4 has-bottom-tabs" style="max-width: 1240px">
          <router-outlet />
        </main>
      </div>
    </div>
    <nav class="bottom-tabs d-flex d-lg-none" [attr.aria-label]="'nav.portal' | t">
      @for (item of items(); track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: !!item.exact }"
        >
          <i class="bi" [class]="'bi-' + item.icon" aria-hidden="true"></i>{{ item.label | t }}
        </a>
      }
    </nav>
  `,
})
export class PortalShell {
  protected readonly auth = inject(AuthService);
  protected readonly initials = computed(() => {
    const u = this.auth.user();
    return u ? `${u.first_name.charAt(0)}${u.last_name.charAt(0)}`.toUpperCase() : '';
  });
  protected readonly items = computed<NavItem[]>(() =>
    this.auth.isStaff()
      ? [
          { path: '/admin', icon: 'speedometer2', label: 'nav.admin', exact: true },
          { path: '/app/settings', icon: 'sliders', label: 'nav.settings' },
        ]
      : [
          { path: '/app', icon: 'house', label: 'nav.dashboard', exact: true },
          { path: '/app/addresses', icon: 'journal-bookmark', label: 'nav.addresses' },
          { path: '/app/settings', icon: 'sliders', label: 'nav.settings' },
        ],
  );
}
