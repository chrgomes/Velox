import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/i18n.service';
import { LanguageSwitcher } from '../shared/language-switcher';

@Component({
  selector: 'vx-site-footer',
  imports: [RouterLink, TranslatePipe, LanguageSwitcher],
  template: `
    <footer class="bg-dark text-white mt-5 pt-5 pb-4">
      <div class="container">
        <div class="row g-4">
          <div class="col-12 col-md-4">
            <p class="fw-bold fs-5 mb-2">
              <i class="bi bi-box-seam-fill me-2" aria-hidden="true"></i>Velox
            </p>
            <p class="text-white-50 small">{{ 'footer.tagline' | t }}</p>
          </div>
          <nav class="col-6 col-md-2" [attr.aria-label]="'footer.company' | t">
            <p class="fw-semibold small text-uppercase">{{ 'footer.company' | t }}</p>
            <ul class="list-unstyled small">
              <li>
                <a class="link-light" routerLink="/about">{{ 'nav.about' | t }}</a>
              </li>
              <li>
                <a class="link-light" routerLink="/contact">{{ 'nav.contact' | t }}</a>
              </li>
              <li>
                <a class="link-light" routerLink="/business">{{ 'nav.business' | t }}</a>
              </li>
            </ul>
          </nav>
          <nav class="col-6 col-md-2" [attr.aria-label]="'footer.shipping' | t">
            <p class="fw-semibold small text-uppercase">{{ 'footer.shipping' | t }}</p>
            <ul class="list-unstyled small">
              <li>
                <a class="link-light" routerLink="/services">{{ 'nav.services' | t }}</a>
              </li>
              <li>
                <a class="link-light" routerLink="/" fragment="calculator">{{ 'nav.rates' | t }}</a>
              </li>
              <li>
                <a class="link-light" routerLink="/faq">{{ 'nav.help' | t }}</a>
              </li>
            </ul>
          </nav>
          <nav class="col-6 col-md-2" [attr.aria-label]="'footer.legal' | t">
            <p class="fw-semibold small text-uppercase">{{ 'footer.legal' | t }}</p>
            <ul class="list-unstyled small">
              <li>
                <a class="link-light" routerLink="/privacy">{{ 'nav.privacy' | t }}</a>
              </li>
              <li>
                <a class="link-light" routerLink="/terms">{{ 'nav.terms' | t }}</a>
              </li>
            </ul>
          </nav>
          <div class="col-6 col-md-2"><vx-language-switcher [dark]="true" /></div>
        </div>
        <hr class="border-secondary" />
        <p class="small text-white-50 mb-0">{{ 'footer.copyright' | t: { year: year } }}</p>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  protected readonly year = new Date().getFullYear();
}
