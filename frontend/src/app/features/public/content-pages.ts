import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';
import { FaqList } from './faq-list';

@Component({
  selector: 'vx-page-header',
  imports: [TranslatePipe],
  template: `
    <section class="hero py-5 border-bottom">
      <div class="container" style="max-width: 960px">
        <h1 class="fw-bold">{{ title() | t }}</h1>
        @if (lead()) {
          <p class="lead text-muted-strong mb-0">{{ lead()! | t }}</p>
        }
      </div>
    </section>
  `,
})
export class PageHeader {
  readonly title = input.required<TKey>();
  readonly lead = input<TKey | null>(null);
}

interface Block {
  icon: string;
  title: TKey;
  body: TKey;
}

@Component({
  selector: 'vx-services',
  imports: [PageHeader, TranslatePipe, RouterLink],
  template: `
    <vx-page-header title="services.title" lead="services.lead" />
    <div class="container py-5" style="max-width: 960px">
      <div class="row g-4">
        @for (b of blocks; track b.title) {
          <div class="col-12 col-md-6">
            <div class="card h-100 border-0 shadow-card">
              <div class="card-body">
                <span class="icon-circle mb-3" aria-hidden="true"
                  ><i class="bi" [class]="'bi-' + b.icon"></i
                ></span>
                <h2 class="h5">{{ b.title | t }}</h2>
                <p class="text-muted-strong mb-0">{{ b.body | t }}</p>
              </div>
            </div>
          </div>
        }
      </div>
      <div class="alert alert-info mt-4 mb-0">{{ 'services.availability' | t }}</div>
      <p class="mt-4">
        <a routerLink="/" fragment="calculator" class="btn btn-accent">{{
          'home.services_cta_rates' | t
        }}</a>
      </p>
    </div>
  `,
})
export class ServicesPage {
  protected readonly blocks: Block[] = [
    { icon: 'flag', title: 'services.domestic_ca_title', body: 'services.domestic_ca_body' },
    { icon: 'flag-fill', title: 'services.domestic_us_title', body: 'services.domestic_us_body' },
    {
      icon: 'arrow-left-right',
      title: 'services.crossborder_title',
      body: 'services.crossborder_body',
    },
    { icon: 'printer', title: 'services.labels_title', body: 'services.labels_body' },
    { icon: 'geo-alt', title: 'services.tracking_title', body: 'services.tracking_body' },
    { icon: 'arrow-counterclockwise', title: 'services.voids_title', body: 'services.voids_body' },
  ];
}

@Component({
  selector: 'vx-business',
  imports: [PageHeader, TranslatePipe, RouterLink],
  template: `
    <vx-page-header title="business.title" lead="business.lead" />
    <div class="container py-5" style="max-width: 960px">
      <div class="row g-4">
        @for (b of blocks; track b.title) {
          <div class="col-12 col-md-4">
            <div class="card h-100 border-0 shadow-card">
              <div class="card-body">
                <span class="icon-circle mb-3" aria-hidden="true"
                  ><i class="bi" [class]="'bi-' + b.icon"></i
                ></span>
                <h2 class="h5">{{ b.title | t }}</h2>
                <p class="text-muted-strong mb-0">{{ b.body | t }}</p>
              </div>
            </div>
          </div>
        }
      </div>
      <div class="card border-0 bg-primary-subtle-vx mt-4">
        <div class="card-body p-4">
          <h2 class="h5">{{ 'business.roadmap_title' | t }}</h2>
          <p class="mb-3">{{ 'business.roadmap_body' | t }}</p>
          <a routerLink="/register" class="btn btn-accent me-2">{{ 'nav.signup' | t }}</a>
          <a routerLink="/contact" class="btn btn-outline-primary">{{
            'business.contact_cta' | t
          }}</a>
        </div>
      </div>
    </div>
  `,
})
export class BusinessPage {
  protected readonly blocks: Block[] = [
    { icon: 'cash-stack', title: 'business.b1_title', body: 'business.b1_body' },
    { icon: 'people', title: 'business.b2_title', body: 'business.b2_body' },
    { icon: 'filetype-csv', title: 'business.b3_title', body: 'business.b3_body' },
  ];
}

@Component({
  selector: 'vx-about',
  imports: [PageHeader, TranslatePipe],
  template: `
    <vx-page-header title="about.title" lead="about.lead" />
    <div class="container py-5" style="max-width: 760px">
      <p>{{ 'about.p1' | t }}</p>
      <p>{{ 'about.p2' | t }}</p>
      <p class="mb-0">{{ 'about.p3' | t }}</p>
    </div>
  `,
})
export class AboutPage {}

@Component({
  selector: 'vx-faq-page',
  imports: [PageHeader, FaqList],
  template: `
    <vx-page-header title="faq.title" lead="faq.lead" />
    <div class="container py-5" style="max-width: 860px"><vx-faq-list /></div>
  `,
})
export class FaqPage {}

@Component({
  selector: 'vx-contact',
  imports: [PageHeader, TranslatePipe],
  template: `
    <vx-page-header title="contact.title" lead="contact.lead" />
    <div class="container py-5" style="max-width: 760px">
      <div class="card border-0 shadow-card">
        <div class="card-body p-4">
          <h2 class="h5">
            <i class="bi bi-envelope me-2" aria-hidden="true"></i>{{ 'contact.email_title' | t }}
          </h2>
          <p>
            <a [href]="'mailto:' + email">{{ email }}</a>
          </p>
          <p class="text-muted-strong small mb-0">{{ 'contact.response' | t }}</p>
        </div>
      </div>
    </div>
  `,
})
export class ContactPage {
  protected readonly email = environment.supportEmail;
}

@Component({
  selector: 'vx-legal',
  imports: [PageHeader, TranslatePipe],
  template: `
    <vx-page-header [title]="kind() === 'privacy' ? 'legal.privacy_title' : 'legal.terms_title'" />
    <div class="container py-5" style="max-width: 760px">
      <div class="alert alert-warning" role="note">
        <strong>{{ 'legal.draft_title' | t }}</strong> {{ 'legal.draft_body' | t }}
      </div>
      @if (kind() === 'privacy') {
        <p>{{ 'legal.privacy_p1' | t }}</p>
        <p>{{ 'legal.privacy_p2' | t }}</p>
        <p>{{ 'legal.privacy_p3' | t }}</p>
      } @else {
        <p>{{ 'legal.terms_p1' | t }}</p>
        <p>{{ 'legal.terms_p2' | t }}</p>
      }
    </div>
  `,
})
export class LegalPage {
  readonly kind = input<'privacy' | 'terms'>('privacy');
}

@Component({
  selector: 'vx-not-found',
  imports: [TranslatePipe, RouterLink],
  template: `
    <div class="container py-5 text-center" style="max-width: 640px">
      <p class="display-4 fw-bold text-primary">404</p>
      <h1 class="h3">{{ 'notfound.title' | t }}</h1>
      <p class="text-muted-strong">{{ 'notfound.body' | t }}</p>
      <a routerLink="/" class="btn btn-primary">{{ 'notfound.home' | t }}</a>
    </div>
  `,
})
export class NotFoundPage {}
