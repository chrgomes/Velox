import { Routes } from '@angular/router';
import { authGuard, customerGuard, guestGuard, staffGuard } from './core/auth/guards';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/public-shell').then((m) => m.PublicShell),
    children: [
      {
        path: '',
        title: 'Colibri',
        loadComponent: () => import('./features/public/home').then((m) => m.Home),
      },
      {
        path: 'services',
        loadComponent: () => import('./features/public/content-pages').then((m) => m.ServicesPage),
      },
      {
        path: 'business',
        loadComponent: () => import('./features/public/content-pages').then((m) => m.BusinessPage),
      },
      {
        path: 'about',
        loadComponent: () => import('./features/public/content-pages').then((m) => m.AboutPage),
      },
      {
        path: 'faq',
        loadComponent: () => import('./features/public/content-pages').then((m) => m.FaqPage),
      },
      {
        path: 'contact',
        loadComponent: () => import('./features/public/content-pages').then((m) => m.ContactPage),
      },
      {
        path: 'privacy',
        data: { kind: 'privacy' },
        loadComponent: () => import('./features/public/content-pages').then((m) => m.LegalPage),
      },
      {
        path: 'terms',
        data: { kind: 'terms' },
        loadComponent: () => import('./features/public/content-pages').then((m) => m.LegalPage),
      },
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/auth-pages').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/auth-pages').then((m) => m.RegisterPage),
      },
      {
        path: 'verify-email',
        loadComponent: () => import('./features/auth/auth-pages').then((m) => m.VerifyEmailPage),
      },
      {
        path: 'forgot-password',
        loadComponent: () => import('./features/auth/auth-pages').then((m) => m.ForgotPasswordPage),
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./features/auth/auth-pages').then((m) => m.ResetPasswordPage),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/portal-shell').then((m) => m.PortalShell),
    children: [
      {
        path: '',
        canActivate: [customerGuard],
        loadComponent: () => import('./features/portal/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'addresses',
        canActivate: [customerGuard],
        loadComponent: () => import('./features/portal/addresses').then((m) => m.AddressesPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/portal/settings').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [staffGuard()],
    loadComponent: () => import('./layout/admin-shell').then((m) => m.AdminShell),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/admin/admin-pages').then((m) => m.AdminDashboardPage),
      },
      {
        path: 'customers',
        canActivate: [staffGuard('customers.view')],
        loadComponent: () =>
          import('./features/admin/admin-pages').then((m) => m.AdminCustomersPage),
      },
      {
        path: 'customers/:id',
        canActivate: [staffGuard('customers.view')],
        loadComponent: () =>
          import('./features/admin/admin-pages').then((m) => m.AdminCustomerPage),
      },
      {
        path: 'staff',
        canActivate: [staffGuard('staff.manage')],
        loadComponent: () => import('./features/admin/admin-pages').then((m) => m.AdminStaffPage),
      },
      {
        path: 'audit',
        canActivate: [staffGuard('audit.view')],
        loadComponent: () => import('./features/admin/admin-pages').then((m) => m.AdminAuditPage),
      },
      {
        path: 'settings',
        canActivate: [staffGuard('settings.manage')],
        loadComponent: () =>
          import('./features/admin/admin-pages').then((m) => m.AdminSettingsPage),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./layout/public-shell').then((m) => m.PublicShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/public/content-pages').then((m) => m.NotFoundPage),
      },
    ],
  },
];
