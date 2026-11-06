import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Logo: mark + wordmark. Colour follows the surrounding `.on-navy` context. */
@Component({
  selector: 'vx-brand',
  imports: [RouterLink],
  template: `
    <a class="brand" routerLink="/" aria-label="Colibri home">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect width="30" height="30" rx="8" fill="#2D5BFF"></rect>
        <path
          d="M3.6 13.2 L10.4 12 C10.9 9.7 13.6 8.6 15.5 10.5 L25.2 4.6 C24 9.6 21.6 12.3 18.8 13.7 L24.6 23.6 L20.9 22.1 L19.6 25.4 C17.2 21.4 14.4 17.6 12.1 15.6 C11.3 15 10.8 14.2 10.5 13.6 Z"
          fill="#FFFFFF"
        ></path>
        <circle cx="13.2" cy="11.7" r="0.85" fill="#2D5BFF"></circle>
      </svg>
      colibri
    </a>
  `,
})
export class Brand {}
