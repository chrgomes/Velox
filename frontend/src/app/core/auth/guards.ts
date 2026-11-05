import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Signed-in users only. The server enforces access; guards only decide what to show. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Customer portal: staff accounts belong in the admin area (except account settings). */
export const customerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isStaff() ? inject(Router).createUrlTree(['/admin']) : true;
};

/** Pages for signed-out visitors (login, register). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};

/** Staff with a given permission. Staff without MFA are sent to set it up first. */
export function staffGuard(permission = 'admin.dashboard.view'): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();
    if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    if (!user.is_staff) return router.createUrlTree(['/app']);
    if (user.mfa_setup_required) return router.parseUrl('/app/settings?section=security');
    return auth.can(permission) ? true : router.createUrlTree(['/admin']);
  };
}
