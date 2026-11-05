import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { API } from '../api';
import { authInterceptor } from './auth.interceptor';
import { AuthService, CurrentUser } from './auth.service';

const USER: CurrentUser = {
  id: 'u1',
  email: 'a@example.com',
  first_name: 'A',
  last_name: 'B',
  phone: null,
  locale: 'en',
  country: 'CA',
  timezone: 'America/Toronto',
  email_verified: true,
  mfa_enabled: false,
  is_staff: false,
  roles: [],
  permissions: [],
  mfa_setup_required: false,
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  function signIn(token = 'old-token'): void {
    auth.login('a@example.com', 'pw').subscribe();
    backend
      .expectOne(`${API}/auth/login`)
      .flush({ access_token: token, expires_in: 900, user: USER });
  }

  it('adds auth, CSRF and language headers to API calls only', () => {
    signIn();
    http.get(`${API}/customers/me`).subscribe();
    const req = backend.expectOne(`${API}/customers/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer old-token');
    expect(req.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(req.request.headers.get('Accept-Language')).toBeTruthy();
    expect(req.request.withCredentials).toBe(true);
    req.flush({});

    http.get('https://example.org/other').subscribe();
    expect(
      backend.expectOne('https://example.org/other').request.headers.has('Authorization'),
    ).toBe(false);
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('refreshes once on 401 and retries with the new token', async () => {
    signIn();
    let body: unknown;
    http.get(`${API}/customers/me`).subscribe((b) => (body = b));
    backend.expectOne(`${API}/customers/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    backend
      .expectOne(`${API}/auth/refresh`)
      .flush({ access_token: 'new-token', expires_in: 900, user: USER });
    await settle();
    const retry = backend.expectOne(`${API}/customers/me`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ ok: true });
    expect(body).toEqual({ ok: true });
  });

  it('clears the session and goes to login when refresh fails', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    signIn();
    let failed = false;
    http.get(`${API}/customers/me`).subscribe({ error: () => (failed = true) });
    backend.expectOne(`${API}/customers/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    backend.expectOne(`${API}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(failed).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('does not try to refresh for a failed login', () => {
    let failed = false;
    auth.login('a@example.com', 'bad').subscribe({ error: () => (failed = true) });
    backend.expectOne(`${API}/auth/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectNone(`${API}/auth/refresh`);
    expect(failed).toBe(true);
  });
});
