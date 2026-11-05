import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/i18n.service';
import { Brand } from '../shared/brand';
import { LanguageSwitcher } from '../shared/language-switcher';

@Component({
  selector: 'vx-site-footer',
  imports: [RouterLink, TranslatePipe, LanguageSwitcher, Brand],
  template: `
    <footer class="site-footer">
      <div class="container pt-5 pb-4">
        <div class="row g-4">
          <div class="col-12 col-md-4">
            <vx-brand />
            <p class="small text-muted-strong mt-3 mb-3" style="max-width: 22rem">
              {{ 'footer.tagline' | t }}
            </p>
            <vx-language-switcher />
          </div>
          <nav class="col-6 col-md-2 offset-md-2" [attr.aria-label]="'footer.shipping' | t">
            <p class="eyebrow mb-3">{{ 'footer.shipping' | t }}</p>
            <ul class="list-unstyled d-grid gap-2">
              <li>
                <a routerLink="/" fragment="calculator">{{ 'nav.rates' | t }}</a>
              </li>
              <li>
                <a routerLink="/services">{{ 'nav.services' | t }}</a>
              </li>
              <li>
                <a routerLink="/faq">{{ 'nav.help' | t }}</a>
              </li>
            </ul>
          </nav>
          <nav class="col-6 col-md-2" [attr.aria-label]="'footer.company' | t">
            <p class="eyebrow mb-3">{{ 'footer.company' | t }}</p>
            <ul class="list-unstyled d-grid gap-2">
              <li>
                <a routerLink="/about">{{ 'nav.about' | t }}</a>
              </li>
              <li>
                <a routerLink="/business">{{ 'nav.business' | t }}</a>
              </li>
              <li>
                <a routerLink="/contact">{{ 'nav.contact' | t }}</a>
              </li>
            </ul>
          </nav>
          <nav class="col-6 col-md-2" [attr.aria-label]="'footer.legal' | t">
            <p class="eyebrow mb-3">{{ 'footer.legal' | t }}</p>
            <ul class="list-unstyled d-grid gap-2">
              <li>
                <a routerLink="/privacy">{{ 'nav.privacy' | t }}</a>
              </li>
              <li>
                <a routerLink="/terms">{{ 'nav.terms' | t }}</a>
              </li>
            </ul>
          </nav>
        </div>
        <div
          class="d-flex flex-wrap justify-content-between gap-2 border-top mt-4 pt-3 small text-subtle"
        >
          <span>{{ 'footer.copyright' | t: { year: year } }}</span>
          <span>English · Français · Español</span>
        </div>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  protected readonly year = new Date().getFullYear();
}
