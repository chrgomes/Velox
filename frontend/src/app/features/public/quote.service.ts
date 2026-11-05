import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API, Money, errorCode } from '../../core/api';

export interface QuoteRate {
  carrier: string;
  carrier_name: string;
  service_code: string;
  service_name: string;
  price: Money;
  delivery_days_min: number;
  delivery_days_max: number;
  estimated_delivery_date: string | null;
  guaranteed: boolean;
  tracking_included: boolean;
  source: string;
}

export interface QuoteResponse {
  is_estimate: boolean;
  simulated: boolean;
  rates: QuoteRate[];
}

export interface QuoteRequest {
  from_country: 'US' | 'CA';
  from_postal: string;
  to_country: 'US' | 'CA';
  to_postal: string;
  weight: number;
  weight_unit: 'kg' | 'lb' | 'g' | 'oz';
  length: number;
  width: number;
  height: number;
  dimension_unit: 'cm' | 'in';
}

/** Shared state between the quote bar (hero) and the results panel below it. */
@Injectable({ providedIn: 'root' })
export class QuoteService {
  private readonly http = inject(HttpClient);
  readonly loading = signal(false);
  readonly errorCode = signal<string | null>(null);
  readonly request = signal<QuoteRequest | null>(null);
  readonly result = signal<QuoteResponse | null>(null);

  quote(request: QuoteRequest): void {
    this.loading.set(true);
    this.errorCode.set(null);
    this.result.set(null);
    this.request.set(request);
    this.http.post<QuoteResponse>(`${API}/quotes`, request).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorCode.set(errorCode(err));
        this.loading.set(false);
      },
    });
  }
}
