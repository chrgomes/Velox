import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';
import { FaqList } from './faq-list';
import { RateCalculator } from './rate-calculator';

interface Feature {
  icon: string;
  title: TKey;
  body: TKey;
}

@Component({
  selector: 'vx-home',
  imports: [RouterLink, TranslatePipe, RateCalculator, FaqList],
  template: `
    <section class="hero py-5">
      <div class="container">
        <div class="row g-4 align-items-start">
          <div class="col-12 col-lg-5 pt-lg-4">
            <p class="badge rounded-pill text-bg-light border text-primary mb-3">
              {{ 'home.eyebrow' | t }}
            </p>
            <h1 class="display-5 fw-bold mb-3">{{ 'home.title' | t }}</h1>
            <p class="lead text-muted-strong mb-4">{{ 'home.subtitle' | t }}</p>
            <ul class="list-unstyled d-grid gap-2 mb-4">
              <li>
                <i class="bi bi-check-circle-fill text-success me-2" aria-hidden="true"></i
                >{{ 'home.point1' | t }}
              </li>
              <li>
                <i class="bi bi-check-circle-fill text-success me-2" aria-hidden="true"></i
                >{{ 'home.point2' | t }}
              </li>
              <li>
                <i class="bi bi-check-circle-fill text-success me-2" aria-hidden="true"></i
                >{{ 'home.point3' | t }}
              </li>
            </ul>
          </div>
          <div class="col-12 col-lg-7" id="calculator">
            <vx-rate-calculator />
          </div>
        </div>
      </div>
    </section>

    <section class="py-5 border-bottom" aria-labelledby="carriers-heading">
      <div class="container text-center">
        <h2 id="carriers-heading" class="h6 text-uppercase text-muted-strong mb-3">
          {{ 'home.carriers_title' | t }}
        </h2>
        <ul class="list-inline fs-5 fw-semibold text-muted-strong mb-2">
          @for (c of carriers; track c) {
            <li class="list-inline-item mx-3">{{ c }}</li>
          }
        </ul>
        <p class="small text-muted-strong mb-0">{{ 'home.carriers_note' | t }}</p>
      </div>
    </section>

    <section class="py-5" aria-labelledby="how-heading">
      <div class="container">
        <h2 id="how-heading" class="text-center mb-4">{{ 'home.how_title' | t }}</h2>
        <ol class="row g-4 list-unstyled">
          @for (step of steps; track step.title; let i = $index) {
            <li class="col-12 col-md-4">
              <div class="card h-100 border-0 shadow-card">
                <div class="card-body">
                  <span class="icon-circle mb-3" aria-hidden="true"
                    ><i class="bi" [class]="'bi-' + step.icon"></i
                  ></span>
                  <h3 class="h5">
                    <span class="text-primary me-1">{{ i + 1 }}.</span>{{ step.title | t }}
                  </h3>
                  <p class="text-muted-strong mb-0">{{ step.body | t }}</p>
                </div>
              </div>
            </li>
          }
        </ol>
      </div>
    </section>

    <section class="py-5 bg-surface" aria-labelledby="services-heading">
      <div class="container">
        <h2 id="services-heading" class="text-center mb-4">{{ 'home.services_title' | t }}</h2>
        <div class="row g-4">
          @for (f of features; track f.title) {
            <div class="col-12 col-md-6 col-lg-3">
              <div class="card h-100 border-0 shadow-card">
                <div class="card-body">
                  <span class="icon-circle mb-3" aria-hidden="true"
                    ><i class="bi" [class]="'bi-' + f.icon"></i
                  ></span>
                  <h3 class="h5">{{ f.title | t }}</h3>
                  <p class="text-muted-strong mb-0">{{ f.body | t }}</p>
                </div>
              </div>
            </div>
          }
        </div>
        <p class="text-center mt-4 mb-0">
          <a routerLink="/services" class="btn btn-outline-primary">{{
            'home.services_cta' | t
          }}</a>
        </p>
      </div>
    </section>

    <section class="py-5" aria-labelledby="business-heading">
      <div class="container">
        <div class="card border-0 bg-primary text-white">
          <div class="card-body p-4 p-md-5 d-md-flex align-items-center gap-4">
            <div class="flex-grow-1">
              <h2 id="business-heading" class="h3">{{ 'home.business_title' | t }}</h2>
              <p class="mb-md-0">{{ 'home.business_body' | t }}</p>
            </div>
            <a routerLink="/business" class="btn btn-accent btn-lg">{{
              'home.business_cta' | t
            }}</a>
          </div>
        </div>
      </div>
    </section>

    <section class="py-5 bg-surface" aria-labelledby="faq-heading">
      <div class="container" style="max-width: 860px">
        <h2 id="faq-heading" class="text-center mb-4">{{ 'faq.title' | t }}</h2>
        <vx-faq-list [limit]="4" />
        <p class="text-center mt-3 mb-0">
          <a routerLink="/faq">{{ 'home.faq_more' | t }}</a>
        </p>
      </div>
    </section>
  `,
})
export class Home {
  // Only carriers the Phase 2 EasyPost integration is planned to cover (docs/00-decisions.md D-003).
  protected readonly carriers = ['Canada Post', 'Purolator', 'UPS', 'FedEx', 'USPS', 'Canpar'];
  protected readonly steps: Feature[] = [
    { icon: 'calculator', title: 'home.step1_title', body: 'home.step1_body' },
    { icon: 'printer', title: 'home.step2_title', body: 'home.step2_body' },
    { icon: 'geo-alt', title: 'home.step3_title', body: 'home.step3_body' },
  ];
  protected readonly features: Feature[] = [
    {
      icon: 'arrow-left-right',
      title: 'home.f_crossborder_title',
      body: 'home.f_crossborder_body',
    },
    { icon: 'shop', title: 'home.f_smallbiz_title', body: 'home.f_smallbiz_body' },
    { icon: 'tag', title: 'home.f_labels_title', body: 'home.f_labels_body' },
    { icon: 'translate', title: 'home.f_languages_title', body: 'home.f_languages_body' },
  ];
}
