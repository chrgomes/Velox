import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { TranslatePipe } from '../core/i18n/i18n.service';
import { TKey } from '../core/i18n/en';
import { LanguageSwitcher } from '../shared/language-switcher';

interface NavItem {
  path: string;
  icon: string;
  label: TKey;
  exact?: boolean;
}

@Component({
  selector: 'vx-portal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitcher],
  template: `
    <a class="skip-link btn btn-primary" href="#main">{{ 'a11y.skip' | t }}</a>
    <header class="border-bottom bg-white sticky-top">
      <div class="container-fluid px-3 px-lg-4 py-2 d-flex align-items-center gap-3">
        <a class="fw-bold text-primary text-decoration-none fs-5" routerLink="/"
          ><i class="bi bi-box-seam-fill me-2" aria-hidden="true"></i>Velox</a
        >
        <span class="ms-auto d-none d-sm-inline text-muted-strong small">{{
          auth.user()?.email
        }}</span>
        <vx-language-switcher />
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="auth.logout()">
          <i class="bi bi-box-arrow-right me-1" aria-hidden="true"></i>{{ 'nav.logout' | t }}
        </button>
      </div>
    </header>
    <div class="container-fluid px-0">
      <div class="row g-0">
        <nav
          class="col-lg-2 d-none d-lg-block border-end bg-white min-vh-100 p-3 portal-nav"
          [attr.aria-label]="'nav.portal' | t"
        >
          <ul class="nav flex-column gap-1">
            @for (item of items(); track item.path) {
              <li class="nav-item">
                <a
                  class="nav-link d-flex align-items-center gap-2"
                  [routerLink]="item.path"
                  routerLinkActive="active"
                  [routerLinkActiveOptions]="{ exact: !!item.exact }"
                >
                  <i class="bi" [class]="'bi-' + item.icon" aria-hidden="true"></i
                  >{{ item.label | t }}
                </a>
              </li>
            }
          </ul>
        </nav>
        <main
          id="main"
          tabindex="-1"
          class="col-12 col-lg-10 bg-surface min-vh-100 p-3 p-lg-4 has-bottom-tabs"
        >
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
  protected readonly items = computed<NavItem[]>(() =>
    this.auth.isStaff()
      ? [
          { path: '/admin', icon: 'speedometer2', label: 'nav.admin', exact: true },
          { path: '/app/settings', icon: 'gear', label: 'nav.settings' },
        ]
      : [
          { path: '/app', icon: 'house', label: 'nav.dashboard', exact: true },
          { path: '/app/addresses', icon: 'journal-bookmark', label: 'nav.addresses' },
          { path: '/app/settings', icon: 'gear', label: 'nav.settings' },
        ],
  );
}
