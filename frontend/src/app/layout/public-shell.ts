import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { TranslatePipe } from '../core/i18n/i18n.service';
import { LanguageSwitcher } from '../shared/language-switcher';
import { SiteFooter } from './site-footer';

@Component({
  selector: 'vx-public-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    LanguageSwitcher,
    SiteFooter,
  ],
  template: `
    <a class="skip-link btn btn-primary" href="#main">{{ 'a11y.skip' | t }}</a>
    <header class="border-bottom bg-white sticky-top">
      <nav class="navbar navbar-expand-lg py-2" [attr.aria-label]="'nav.main' | t">
        <div class="container">
          <a
            class="navbar-brand fw-bold text-primary d-flex align-items-center gap-2"
            routerLink="/"
          >
            <i class="bi bi-box-seam-fill" aria-hidden="true"></i> Velox
          </a>
          <button
            class="navbar-toggler"
            type="button"
            (click)="open.set(!open())"
            [attr.aria-expanded]="open()"
            aria-controls="mainNav"
            [attr.aria-label]="'nav.toggle' | t"
          >
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" [class.show]="open()" id="mainNav">
            <ul class="navbar-nav me-auto">
              <li class="nav-item">
                <a class="nav-link" routerLink="/" fragment="calculator">{{ 'nav.rates' | t }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" routerLink="/services" routerLinkActive="active">{{
                  'nav.services' | t
                }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" routerLink="/business" routerLinkActive="active">{{
                  'nav.business' | t
                }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" routerLink="/faq" routerLinkActive="active">{{
                  'nav.help' | t
                }}</a>
              </li>
            </ul>
            <div class="d-flex flex-wrap align-items-center gap-2 py-2 py-lg-0">
              <vx-language-switcher />
              @if (auth.user(); as user) {
                <a class="btn btn-primary" [routerLink]="user.is_staff ? '/admin' : '/app'">
                  <i class="bi bi-person-circle me-1" aria-hidden="true"></i
                  >{{ 'nav.my_account' | t }}
                </a>
              } @else {
                <a class="btn btn-outline-primary" routerLink="/login">{{ 'nav.login' | t }}</a>
                <a class="btn btn-accent" routerLink="/register">{{ 'nav.signup' | t }}</a>
              }
            </div>
          </div>
        </div>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <router-outlet />
    </main>
    <vx-site-footer />
  `,
})
export class PublicShell {
  protected readonly auth = inject(AuthService);
  protected readonly open = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.open.set(false));
  }
}
