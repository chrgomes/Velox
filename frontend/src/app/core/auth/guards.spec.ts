import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AuthService, CurrentUser } from './auth.service';
import { authGuard, customerGuard, guestGuard, staffGuard } from './guards';

const base: CurrentUser = {
  id: 'u1',
  email: 'a@example.com',
  first_name: 'A',
  last_name: 'B',
  phone: null,
  locale: 'en',
  country: 'CA',
  timezone: 'America/Toronto',
  email_verified: true,
  mfa_enabled: true,
  is_staff: false,
  roles: [],
  permissions: [],
  mfa_setup_required: false,
};

function run(guard: typeof authGuard, url = '/app'): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

describe('route guards', () => {
  let auth: AuthService;
  let router: Router;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  const url = (r: boolean | UrlTree) => (r instanceof UrlTree ? router.serializeUrl(r) : r);

  it('sends signed-out visitors to login with a return URL', () => {
    expect(url(run(authGuard, '/app/addresses'))).toBe('/login?returnUrl=%2Fapp%2Faddresses');
  });

  it('lets signed-in users through and keeps them away from login', () => {
    auth.setUser(base);
    expect(run(authGuard)).toBe(true);
    expect(url(run(guestGuard))).toBe('/app');
  });

  it('keeps staff out of the customer portal and customers out of admin', () => {
    auth.setUser({ ...base, is_staff: true, permissions: ['admin.dashboard.view'] });
    expect(url(run(customerGuard))).toBe('/admin');
    auth.setUser(base);
    expect(url(run(staffGuard()))).toBe('/app');
  });

  it('sends staff without MFA to security settings', () => {
    auth.setUser({
      ...base,
      is_staff: true,
      mfa_enabled: false,
      mfa_setup_required: true,
      permissions: ['admin.dashboard.view'],
    });
    expect(url(run(staffGuard()))).toBe('/app/settings?section=security');
  });

  it('checks the specific permission', () => {
    auth.setUser({ ...base, is_staff: true, permissions: ['admin.dashboard.view'] });
    expect(run(staffGuard())).toBe(true);
    expect(url(run(staffGuard('audit.view')))).toBe('/admin');
  });
});
