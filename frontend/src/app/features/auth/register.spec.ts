import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API } from '../../core/api';
import { I18n } from '../../core/i18n/i18n.service';
import { RegisterPage } from './auth-pages';

describe('RegisterPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(I18n).set('en');
  });

  it('requires a strong password and accepted terms before calling the API', async () => {
    const fixture = TestBed.createComponent(RegisterPage);
    await fixture.whenStable();
    const form = (fixture.componentInstance as any).form;
    form.setValue({
      first_name: 'Ana',
      last_name: 'Lima',
      email: 'ana@example.com',
      password: 'aaaaaaaaaaaa',
      country: 'CA',
      locale: 'en',
      accept_terms: false,
    });
    expect(form.get('password').errors).toEqual({ weakPassword: true });
    expect(form.get('accept_terms').errors).toEqual({ required: true });
    (fixture.componentInstance as any).submit();
    TestBed.inject(HttpTestingController).expectNone(`${API}/auth/register`);
  });

  it('shows the translated server error', async () => {
    const fixture = TestBed.createComponent(RegisterPage);
    await fixture.whenStable();
    const form = (fixture.componentInstance as any).form;
    form.setValue({
      first_name: 'Ana',
      last_name: 'Lima',
      email: 'ana@example.com',
      password: 'Strong-Pass-2026',
      country: 'CA',
      locale: 'en',
      accept_terms: true,
    });
    (fixture.componentInstance as any).submit();
    TestBed.inject(HttpTestingController)
      .expectOne(`${API}/auth/register`)
      .flush(
        { error: { code: 'auth.registration_failed', message: 'x' } },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'We could not create an account',
    );
  });
});
