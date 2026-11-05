import { Component, input } from '@angular/core';

@Component({
  selector: 'vx-empty-state',
  template: `
    <div class="text-center py-5 px-3">
      <span class="icon-circle mb-3" aria-hidden="true"
        ><i class="bi" [class]="'bi-' + icon()"></i
      ></span>
      <h2 class="h5">{{ title() }}</h2>
      @if (text()) {
        <p class="text-muted-strong mb-3">{{ text() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly text = input<string>('');
}
