import { TestBed } from '@angular/core/testing';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { I18n } from './i18n.service';

describe('I18n', () => {
  let i18n: I18n;
  beforeEach(() => {
    i18n = TestBed.inject(I18n);
    i18n.set('en');
  });

  it('has identical keys in every dictionary', () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(fr).sort()).toEqual(keys);
    expect(Object.keys(es).sort()).toEqual(keys);
  });

  it('keeps placeholders consistent across languages', () => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(params(fr[key]), `fr ${key}`).toBe(params(en[key]));
      expect(params(es[key]), `es ${key}`).toBe(params(en[key]));
    }
  });

  it('interpolates parameters and switches language', () => {
    expect(i18n.t('dash.hello', { name: 'Ana' })).toBe('Hello, Ana');
    i18n.set('es-419');
    expect(i18n.t('dash.hello', { name: 'Ana' })).toBe('Hola, Ana');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('es-419');
  });

  it('translates API error codes with a safe fallback', () => {
    expect(i18n.error('auth.invalid_credentials')).toBe('Email or password is incorrect.');
    expect(i18n.error('something.new')).toBe(en['errors.unknown']);
  });

  it('formats money in the active locale', () => {
    expect(i18n.formatMoney(123456, 'CAD')).toContain('1,234.56');
    i18n.set('fr-CA');
    expect(i18n.formatMoney(123456, 'CAD').replace(/\s/g, ' ')).toContain('1 234,56');
  });
});
