import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API } from '../../core/api';
import { I18n } from '../../core/i18n/i18n.service';
import { POSTAL_PATTERNS, RateCalculator } from './rate-calculator';
import { RateResults } from './rate-results';

describe('RateCalculator', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RateCalculator, RateResults],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(I18n).set('en');
  });

  it('validates postal codes per country', () => {
    expect(POSTAL_PATTERNS.CA.test('M5H 2N2')).toBe(true);
    expect(POSTAL_PATTERNS.CA.test('m5h2n2')).toBe(true);
    expect(POSTAL_PATTERNS.CA.test('D5H 2N2')).toBe(false);
    expect(POSTAL_PATTERNS.US.test('10001')).toBe(true);
    expect(POSTAL_PATTERNS.US.test('10001-1234')).toBe(true);
    expect(POSTAL_PATTERNS.US.test('1000')).toBe(false);
  });

  it('does not submit an invalid form', async () => {
    const fixture = TestBed.createComponent(RateCalculator);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    TestBed.inject(HttpTestingController).expectNone(`${API}/quotes`);
    expect(el.textContent).toContain('This field is required.');
  });

  it('requests quotes and the results panel labels and tags them', async () => {
    const results = TestBed.createComponent(RateResults);
    await results.whenStable();
    expect((results.nativeElement as HTMLElement).textContent).toContain(
      'Your rates will appear here',
    );
    const fixture = TestBed.createComponent(RateCalculator);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = (name: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`[formcontrolname=${name}]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('from_postal', 'M5H 2N2');
    type('to_postal', 'V6B 1A1');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    const req = TestBed.inject(HttpTestingController).expectOne(`${API}/quotes`);
    expect(req.request.body).toMatchObject({
      from_country: 'CA',
      from_postal: 'M5H 2N2',
      weight_unit: 'kg',
    });
    const rate = (code: string, amount: number, days: number) => ({
      carrier: 'canada_post',
      carrier_name: 'Canada Post',
      service_code: code,
      service_name: code,
      price: { amount, currency: 'CAD' },
      delivery_days_min: 1,
      delivery_days_max: days,
      estimated_delivery_date: '2026-11-20',
      guaranteed: false,
      tracking_included: true,
      source: 'mock',
    });
    req.flush({
      is_estimate: true,
      simulated: true,
      rates: [rate('slow', 1000, 7), rate('fast', 3000, 1)],
    });
    await results.whenStable();
    const out = results.nativeElement as HTMLElement;
    expect(out.textContent).toContain('Simulated rates');
    expect(out.textContent).toContain('$10.00');
    expect(out.textContent).toContain('Cheapest');
    expect(out.textContent).toContain('Fastest');
    // Default sort is cheapest first; switching to fastest reorders the rows.
    const firstService = () => out.querySelector('li.rate-row .fw-semibold')?.textContent?.trim();
    expect(firstService()).toBe('slow');
    out.querySelectorAll<HTMLButtonElement>('.segmented button')[1].click();
    await results.whenStable();
    expect(firstService()).toBe('fast');
  });
});
