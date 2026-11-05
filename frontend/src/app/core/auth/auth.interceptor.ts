import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { API } from '../api';
import { I18n } from '../i18n/i18n.service';
import { AuthService } from './auth.service';

const NO_REFRESH = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/register',
  '/auth/password/',
  '/auth/verify',
];

function withHeaders(
  req: HttpRequest<unknown>,
  token: string | null,
  locale: string,
): HttpRequest<unknown> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    'Accept-Language': locale,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return req.clone({ setHeaders: headers, withCredentials: true });
}

/** Adds auth + locale headers to API calls and transparently refreshes an expired access token once. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API)) return next(req);
  const auth = inject(AuthService);
  const i18n = inject(I18n);
  const router = inject(Router);

  return next(withHeaders(req, auth.accessToken(), i18n.locale())).pipe(
    catchError((err: unknown) => {
      const canRefresh =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        auth.accessToken() !== null &&
        !NO_REFRESH.some((path) => req.url.includes(path));
      if (!canRefresh) return throwError(() => err);
      return auth.refresh().pipe(
        switchMap((token) => next(withHeaders(req, token, i18n.locale()))),
        catchError((refreshErr: unknown) => {
          auth.clear();
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url, expired: 1 } });
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
