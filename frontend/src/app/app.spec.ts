import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { I18n } from './core/i18n/i18n.service';

describe('App', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }),
  );

  it('sets a translated document title that follows the locale', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const title = TestBed.inject(Title);
    TestBed.inject(I18n).set('en');
    TestBed.tick();
    expect(title.getTitle()).toContain('Compare shipping rates');
    TestBed.inject(I18n).set('fr-CA');
    TestBed.tick();
    expect(title.getTitle()).toContain('Comparez les tarifs');
  });
});
