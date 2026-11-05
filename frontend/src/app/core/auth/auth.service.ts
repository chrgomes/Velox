import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, from, map, shareReplay, tap } from 'rxjs';
import { API } from '../api';
import { I18n, Locale } from '../i18n/i18n.service';

export interface CurrentUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  locale: Locale;
  country: 'US' | 'CA';
  timezone: string;
  email_verified: boolean;
  mfa_enabled: boolean;
  is_staff: boolean;
  roles: string[];
  permissions: string[];
  mfa_setup_required: boolean;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  user: CurrentUser;
}

export interface MfaChallenge {
  mfa_required: true;
  mfa_token: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  country: 'US' | 'CA';
  locale: Locale;
  accept_terms: boolean;
}

/**
 * Session state. The access token lives in memory only; the refresh token is an HttpOnly cookie
 * the browser sends to /api/v1/auth/* (docs/01-architecture.md §5).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);

  private readonly token = signal<string | null>(null);
  readonly user = signal<CurrentUser | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isStaff = computed(() => this.user()?.is_staff ?? false);
  private refreshInFlight: Observable<string> | null = null;

  accessToken(): string | null {
    return this.token();
  }

  can(permission: string): boolean {
    return this.user()?.permissions.includes(permission) ?? false;
  }

  /** Called once at startup: restores the session from the refresh cookie if there is one. */
  async restore(): Promise<void> {
    try {
      await firstValueFrom(this.refresh());
    } catch {
      this.clear();
    }
  }

  login(email: string, password: string): Observable<TokenResponse | MfaChallenge> {
    return this.http
      .post<TokenResponse | MfaChallenge>(`${API}/auth/login`, { email, password })
      .pipe(tap((res) => ('access_token' in res ? this.accept(res) : undefined)));
  }

  loginMfa(mfaToken: string, code: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${API}/auth/login/mfa`, { mfa_token: mfaToken, code })
      .pipe(tap((res) => this.accept(res)));
  }

  register(payload: RegisterPayload): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${API}/auth/register`, payload)
      .pipe(tap((res) => this.accept(res)));
  }

  /**
   * Rotate the refresh cookie. Concurrent callers share one request, and the Web Locks API
   * serialises refreshes across tabs so a rotated token is never presented twice.
   */
  refresh(): Observable<string> {
    if (!this.refreshInFlight) {
      const run = () => firstValueFrom(this.http.post<TokenResponse>(`${API}/auth/refresh`, {}));
      const locked: Promise<TokenResponse> =
        typeof navigator !== 'undefined' && navigator.locks
          ? navigator.locks.request('velox-refresh', run)
          : run();
      this.refreshInFlight = from(locked).pipe(
        tap({
          next: (res) => this.accept(res),
          error: () => this.clear(),
          finalize: () => (this.refreshInFlight = null),
        }),
        map((res) => res.access_token),
        shareReplay(1),
      );
    }
    return this.refreshInFlight;
  }

  async logout(redirect = true): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${API}/auth/logout`, {}));
    } catch {
      /* session may already be gone */
    }
    this.clear();
    if (redirect) await this.router.navigateByUrl('/login');
  }

  setUser(user: CurrentUser): void {
    this.user.set(user);
    if (user.locale) this.i18n.set(user.locale);
  }

  clear(): void {
    this.token.set(null);
    this.user.set(null);
  }

  /** Where to send a user after they sign in. */
  homeUrl(): string {
    const user = this.user();
    if (!user) return '/login';
    if (user.mfa_setup_required) return '/app/settings?section=security';
    return user.is_staff ? '/admin' : '/app';
  }

  private accept(res: TokenResponse): void {
    this.token.set(res.access_token);
    this.setUser(res.user);
  }
}
