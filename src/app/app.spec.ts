import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { Login } from './features/auth/login';
import { vi } from 'vitest';
import { BrowserPreferences } from './core/browser-preferences';

describe('Route access', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient()] });
    // Cookie notice is covered separately; these tests exercise route protection.
    vi.spyOn(TestBed.inject(BrowserPreferences), 'hasConsent').mockReturnValue(true);
  });
  it('redirects anonymous users from the home page to login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/inicio', Login);
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Lambda Quality',
    );
  });
  it('protects Meu Perfil from anonymous users', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/meu-perfil', Login);
    expect(harness.routeNativeElement?.querySelector('input[type="email"]')).toBeTruthy();
  });
  it('redirects unknown paths through the protected home page', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/unknown', Login);
    expect(harness.routeNativeElement?.querySelector('input[type="email"]')).toBeTruthy();
  });
});
