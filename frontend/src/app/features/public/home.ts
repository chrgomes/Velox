import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';
import { FaqList } from './faq-list';
import { RateCalculator } from './rate-calculator';
import { RateResults } from './rate-results';

interface Item {
  icon: string;
  title: TKey;
  body: TKey;
}

@Component({
  selector: 'vx-home',
  imports: [RouterLink, TranslatePipe, RateCalculator, RateResults, FaqList],
  template: `
    <section class="hero text-center" id="calculator">
      <div class="container">
        <p class="pill mb-4">
          <span class="dot" aria-hidden="true"></span>{{ 'home.eyebrow' | t }}
        </p>
        <h1 class="fw-bold">{{ 'home.title' | t }}</h1>
        <p class="lead mt-4 mb-5">{{ 'home.subtitle' | t }}</p>
        <vx-rate-calculator />
        <p class="fine-print mt-3 mb-0">{{ 'home.trust' | t }}</p>
      </div>
    </section>

    <div class="container" style="margin-top: -4.5rem; max-width: 1136px">
      <vx-rate-results />
    </div>

    <section class="container py-5 text-center" aria-labelledby="carriers-heading">
      <h2 id="carriers-heading" class="eyebrow mt-4 mb-3">{{ 'home.carriers_title' | t }}</h2>
      <ul class="carrier-strip">
        @for (c of carriers; track c) {
          <li>{{ c }}</li>
        }
      </ul>
      <p class="small text-subtle mt-3 mb-0">{{ 'home.carriers_note' | t }}</p>
    </section>

    <section class="container py-5" aria-labelledby="why-heading">
      <div class="row g-5 align-items-start">
        <div class="col-12 col-lg-5">
          <p class="fw-semibold text-primary mb-2">{{ 'home.why_eyebrow' | t }}</p>
          <h2 id="why-heading" class="section-title mb-3">{{ 'home.why_title' | t }}</h2>
          <p class="fs-5 text-muted-strong mb-4">{{ 'home.why_body' | t }}</p>
          <a routerLink="/services" class="fw-semibold"
            >{{ 'home.why_link' | t }} <i class="bi bi-arrow-right" aria-hidden="true"></i
          ></a>
        </div>
        <div class="col-12 col-lg-7">
          <div class="row g-4 gy-5">
            @for (f of features; track f.title) {
              <div class="col-12 col-sm-6">
                <i class="bi feature-icon" [class]="'bi-' + f.icon" aria-hidden="true"></i>
                <h3 class="h5 font-display fw-bold mt-3 mb-2">{{ f.title | t }}</h3>
                <p class="text-muted-strong mb-0">{{ f.body | t }}</p>
              </div>
            }
          </div>
        </div>
      </div>
    </section>

    <section class="bg-surface border-top border-bottom py-5 mt-4" aria-labelledby="how-heading">
      <div class="container py-4">
        <h2 id="how-heading" class="section-title text-center mb-5">{{ 'home.how_title' | t }}</h2>
        <ol class="row g-4 list-unstyled mb-0">
          @for (step of steps; track step.title; let i = $index) {
            <li class="col-12 col-md-4">
              <div class="step-card">
                <p class="num mb-2">0{{ i + 1 }}</p>
                <h3 class="h4 font-display fw-bold mb-2">{{ step.title | t }}</h3>
                <p class="text-muted-strong mb-0">{{ step.body | t }}</p>
              </div>
            </li>
          }
        </ol>
      </div>
    </section>

    <section class="container py-5 my-4" aria-labelledby="business-heading">
      <div class="navy-band">
        <div class="row g-5 align-items-center">
          <div class="col-12 col-lg-6">
            <p class="eyebrow-on-navy mb-2">{{ 'home.business_eyebrow' | t }}</p>
            <h2 id="business-heading" class="section-title mb-3">
              {{ 'home.business_title' | t }}
            </h2>
            <p class="muted fs-5 mb-4">{{ 'home.business_body' | t }}</p>
            <div class="d-flex flex-wrap gap-2">
              <a routerLink="/contact" class="btn btn-on-navy">{{ 'home.business_cta' | t }}</a>
              <a routerLink="/register" class="btn btn-outline-on-navy">{{ 'nav.signup' | t }}</a>
            </div>
          </div>
          <div class="col-12 col-lg-6">
            <ul class="list-unstyled d-grid gap-3 mb-0">
              @for (p of points; track p.title) {
                <li class="point">
                  <i class="bi bi-check-lg fs-5" aria-hidden="true"></i>
                  <span
                    ><strong class="fw-semibold">{{ p.title | t }}</strong>
                    <span class="muted ms-1">{{ p.body | t }}</span></span
                  >
                </li>
              }
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="container pb-5 mb-4" aria-labelledby="faq-heading">
      <div class="row g-5">
        <div class="col-12 col-lg-5">
          <h2 id="faq-heading" class="section-title mb-3">{{ 'faq.home_title' | t }}</h2>
          <p class="text-muted-strong">
            {{ 'faq.cant_find' | t }} <a routerLink="/contact">{{ 'faq.contact_link' | t }}</a
            >.
            {{ 'contact.response' | t }}
          </p>
          <a routerLink="/faq" class="fw-semibold"
            >{{ 'home.faq_more' | t }} <i class="bi bi-arrow-right" aria-hidden="true"></i
          ></a>
        </div>
        <div class="col-12 col-lg-7">
          <vx-faq-list [limit]="5" />
        </div>
      </div>
    </section>
  `,
})
export class Home {
  // Carriers the Phase 2 EasyPost integration is planned to cover (docs/00-decisions.md D-003).
  protected readonly carriers = ['Canada Post', 'Purolator', 'UPS', 'FedEx', 'USPS', 'Canpar'];
  protected readonly features: Item[] = [
    { icon: 'list-columns-reverse', title: 'home.f_rates_title', body: 'home.f_rates_body' },
    { icon: 'file-earmark-text', title: 'home.f_customs_title', body: 'home.f_customs_body' },
    { icon: 'printer', title: 'home.f_print_title', body: 'home.f_print_body' },
    { icon: 'geo-alt', title: 'home.f_tracking_title', body: 'home.f_tracking_body' },
  ];
  protected readonly steps: Item[] = [
    { icon: '', title: 'home.step1_title', body: 'home.step1_body' },
    { icon: '', title: 'home.step2_title', body: 'home.step2_body' },
    { icon: '', title: 'home.step3_title', body: 'home.step3_body' },
  ];
  protected readonly points: Item[] = [
    { icon: '', title: 'home.biz_p1_title', body: 'home.biz_p1_body' },
    { icon: '', title: 'home.biz_p2_title', body: 'home.biz_p2_body' },
    { icon: '', title: 'home.biz_p3_title', body: 'home.biz_p3_body' },
  ];
}
