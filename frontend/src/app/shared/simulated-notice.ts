import { Component } from '@angular/core';
import { TranslatePipe } from '../core/i18n/i18n.service';

/** Shown wherever simulated (non-carrier) data appears. Never remove while mock providers are used. */
@Component({
  selector: 'vx-simulated-notice',
  imports: [TranslatePipe],
  template: `
    <div class="alert alert-warning d-flex gap-2 align-items-start small mb-3" role="note">
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>
        <strong>{{ 'sim.title' | t }}</strong> {{ 'sim.body' | t }}
      </div>
    </div>
  `,
})
export class SimulatedNotice {}
