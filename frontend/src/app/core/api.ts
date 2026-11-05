import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';

export const API = environment.apiBase;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string | null;
  };
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface Money {
  amount: number;
  currency: string;
}

/** Stable error code from an API error response (translated by the UI), or a generic one. */
export function errorCode(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiErrorBody | null;
    if (body?.error?.code) return body.error.code;
    if (err.status === 0) return 'network';
  }
  return 'unknown';
}

export function errorDetails(err: unknown): Record<string, unknown> {
  if (err instanceof HttpErrorResponse) {
    return ((err.error as ApiErrorBody | null)?.error?.details ?? {}) as Record<string, unknown>;
  }
  return {};
}
