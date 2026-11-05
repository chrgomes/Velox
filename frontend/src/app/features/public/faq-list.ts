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

/** Accessible accordion (button + region pattern). */
@Component({
  selector: 'vx-faq-list',
  imports: [TranslatePipe],
  template: `
    <div class="accordion">
      @for (item of items(); track item.q; let i = $index) {
        <div class="accordion-item">
          <h3 class="accordion-header">
            <button
              class="accordion-button"
              type="button"
              [class.collapsed]="open() !== i"
              [attr.aria-expanded]="open() === i"
              [attr.aria-controls]="'faq-panel-' + i"
              [id]="'faq-btn-' + i"
              (click)="open.set(open() === i ? -1 : i)"
            >
              {{ item.q | t }}
            </button>
          </h3>
          <div
            class="accordion-collapse collapse"
            [class.show]="open() === i"
            [id]="'faq-panel-' + i"
            role="region"
            [attr.aria-labelledby]="'faq-btn-' + i"
          >
            <div class="accordion-body text-muted-strong">{{ item.a | t }}</div>
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
