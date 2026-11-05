import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Logo: mark + wordmark. Colour follows the surrounding `.on-navy` context. */
@Component({
  selector: 'vx-brand',
  imports: [RouterLink],
  template: `
    <a class="brand" routerLink="/" aria-label="Velox home">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect width="30" height="30" rx="8" fill="#2D5BFF"></rect>
        <path
          d="M8 9l7 13 7-13"
          fill="none"
          stroke="#FFFFFF"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        ></path>
      </svg>
      velox
    </a>
  `,
})
export class Brand {}
