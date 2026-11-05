import { Component, computed, input, signal } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { TKey } from '../../core/i18n/en';

const ITEMS: { q: TKey; a: TKey }[] = [
  { q: 'faq.q1', a: 'faq.a1' },
  { q: 'faq.q2', a: 'faq.a2' },
  { q: 'faq.q3', a: 'faq.a3' },
  { q: 'faq.q4', a: 'faq.a4' },
  { q: 'faq.q5', a: 'faq.a5' },
  { q: 'faq.q6', a: 'faq.a6' },
  { q: 'faq.q7', a: 'faq.a7' },
];

/** Accessible disclosure list (button + region pattern). */
@Component({
  selector: 'vx-faq-list',
  imports: [TranslatePipe],
  template: `
    <div class="faq-list">
      @for (item of items(); track item.q; let i = $index) {
        <div class="faq-item">
          <h3 class="m-0">
            <button
              class="faq-q"
              type="button"
              [attr.aria-expanded]="open() === i"
              [attr.aria-controls]="'faq-panel-' + i"
              [id]="'faq-btn-' + i"
              (click)="open.set(open() === i ? -1 : i)"
            >
              {{ item.q | t }}
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
            </button>
          </h3>
          <div
            [id]="'faq-panel-' + i"
            role="region"
            [attr.aria-labelledby]="'faq-btn-' + i"
            [hidden]="open() !== i"
          >
            <p class="faq-a">{{ item.a | t }}</p>
          </div>
        </div>
      }
    </div>
  `,
})
export class FaqList {
  readonly limit = input<number>(ITEMS.length);
  protected readonly open = signal(0);
  protected readonly items = computed(() => ITEMS.slice(0, this.limit()));
}
