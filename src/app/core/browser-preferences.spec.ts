import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { BrowserPreferences, preferencesCookie, storedTheme } from './browser-preferences';
import { Login } from '../features/auth/login';
import { Profile } from '../features/home/profile';

const clearCookie = () => {
  document.cookie = `${preferencesCookie}=; Path=/; Max-Age=0`;
};
describe('Browser theme and acknowledgement', () => {
  beforeEach(() => {
    clearCookie();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController, null, { optional: true })?.verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    clearCookie();
    document.documentElement.dataset['theme'] = 'lambda';
  });
  it('defaults to Lambda and writes nothing before agreement', () => {
    const p = TestBed.inject(BrowserPreferences);
    expect(p.theme()).toBe('LAMBDA');
    expect(document.documentElement.dataset['theme']).toBe('lambda');
    expect(p.hasConsent()).toBe(false);
    expect(document.cookie).not.toContain(preferencesCookie);
    p.selectTheme('CLASSIC');
    expect(document.documentElement.dataset['theme']).toBe('classic');
    expect(document.cookie).not.toContain(preferencesCookie);
  });
  it('remembers agreement and theme across a fresh service instance', () => {
    const p = TestBed.inject(BrowserPreferences);
    expect(p.accept()).toBe(true);
    p.selectTheme('CLASSIC');
    TestBed.resetTestingModule();
    const restored = TestBed.inject(BrowserPreferences);
    expect(restored.theme()).toBe('CLASSIC');
    expect(restored.hasConsent()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('classic');
    restored.selectTheme('LAMBDA');
    expect(storedTheme(document)).toBe('LAMBDA');
  });
  it('restores the dark theme and agreement before a new service renders the page', () => {
    const p = TestBed.inject(BrowserPreferences);
    p.selectTheme('LAMBDA_DARK');
    expect(document.documentElement.dataset['theme']).toBe('lambda-dark');
    expect(document.cookie).not.toContain(preferencesCookie);
    expect(p.accept()).toBe(true);
    expect(storedTheme(document)).toBe('LAMBDA_DARK');
    TestBed.resetTestingModule();
    const restored = TestBed.inject(BrowserPreferences);
    expect(restored.theme()).toBe('LAMBDA_DARK');
    expect(restored.hasConsent()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('lambda-dark');
    clearCookie();
    restored.restore();
    expect(restored.theme()).toBe('LAMBDA');
    expect(restored.hasConsent()).toBe(false);
  });
  it('restores Lambda and reopens notice on next login after deleting the cookie', () => {
    const p = TestBed.inject(BrowserPreferences);
    p.accept();
    p.selectTheme('CLASSIC');
    clearCookie();
    const login = TestBed.createComponent(Login);
    expect(login.componentInstance.cookieNoticeOpen()).toBe(true);
    expect(p.theme()).toBe('LAMBDA');
    expect(p.hasConsent()).toBe(false);
    login.destroy();
  });
  it('does not show the login notice again when agreement exists', () => {
    TestBed.inject(BrowserPreferences).accept();
    const login = TestBed.createComponent(Login);
    login.detectChanges();
    expect(login.nativeElement.querySelector('app-cookie-notice')).toBeNull();
    login.destroy();
  });
  it('ignores malformed or unsupported preferences without crashing', () => {
    document.cookie = `${preferencesCookie}=v1:UNKNOWN; Path=/`;
    const p = TestBed.inject(BrowserPreferences);
    expect(p.theme()).toBe('LAMBDA');
    expect(p.hasConsent()).toBe(false);
    p.selectTheme('DARK' as never);
    expect(p.theme()).toBe('LAMBDA');
  });
  it('changes the theme from profile radio controls without an API write', () => {
    const p = TestBed.inject(BrowserPreferences);
    p.accept();
    const profile = TestBed.createComponent(Profile);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/health/ready').flush({ data: { status: 'up' } });
    profile.detectChanges();
    const classic = profile.nativeElement.querySelector(
      'input[value="CLASSIC"]',
    ) as HTMLInputElement;
    classic.click();
    profile.detectChanges();
    expect(classic.checked).toBe(true);
    expect(p.theme()).toBe('CLASSIC');
    expect(storedTheme(document)).toBe('CLASSIC');
    const dark = profile.nativeElement.querySelector(
      'input[value="LAMBDA_DARK"]',
    ) as HTMLInputElement;
    dark.click();
    profile.detectChanges();
    expect(dark.checked).toBe(true);
    expect(classic.checked).toBe(false);
    expect(p.theme()).toBe('LAMBDA_DARK');
    expect(storedTheme(document)).toBe('LAMBDA_DARK');
    expect(profile.nativeElement.textContent).toContain('Tema atual: Lambda escuro');
    const modern = profile.nativeElement.querySelector('input[value="LAMBDA"]') as HTMLInputElement;
    modern.click();
    profile.detectChanges();
    expect(modern.checked).toBe(true);
    expect(p.theme()).toBe('LAMBDA');
    http.expectNone((r) => r.method !== 'GET');
    profile.destroy();
  });
});

describe('Cookie persistence and blocked storage', () => {
  let jar: string;
  let written: string;
  let blocked: boolean;
  const doc = {
    documentElement: { dataset: {} },
    location: { protocol: 'https:' },
    get cookie() {
      return jar;
    },
    set cookie(value: string) {
      written = value;
      if (!blocked) jar = value.split(';')[0];
    },
  } as unknown as Document;
  beforeEach(() => {
    jar = '';
    written = '';
    blocked = false;
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: doc }] });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('uses persistent root-scoped first-party cookie with SameSite and Secure on HTTPS', () => {
    TestBed.inject(BrowserPreferences).accept();
    expect(written).toContain('Path=/');
    expect(written).toContain('Max-Age=');
    expect(written).toContain('SameSite=Lax');
    expect(written).toContain('; Secure');
    expect(jar).toBe(`${preferencesCookie}=v1:LAMBDA`);
  });
  it('reports blocked cookie writes and keeps theme usable in memory', () => {
    blocked = true;
    const p = TestBed.inject(BrowserPreferences);
    expect(p.accept()).toBe(false);
    expect(p.hasConsent()).toBe(false);
    expect(p.storageError()).toContain('não permitiu');
    p.selectTheme('CLASSIC');
    expect(p.theme()).toBe('CLASSIC');
    expect(jar).toBe('');
    p.selectTheme('LAMBDA_DARK');
    expect(p.theme()).toBe('LAMBDA_DARK');
    expect(jar).toBe('');
  });
  it('handles inaccessible cookies on initialization and acceptance', () => {
    const inaccessible = {
      ...doc,
      get cookie(): string {
        throw new Error('blocked');
      },
      set cookie(_value: string) {
        throw new Error('blocked');
      },
    };
    TestBed.overrideProvider(DOCUMENT, { useValue: inaccessible });
    const p = TestBed.inject(BrowserPreferences);
    expect(p.theme()).toBe('LAMBDA');
    expect(p.accept()).toBe(false);
  });
});

describe('Cookie notice on login', () => {
  const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  beforeAll(() =>
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    }),
  );
  afterAll(() => {
    if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
  beforeEach(() => {
    clearCookie();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    clearCookie();
  });
  it('opens a labelled modal, blocks accidental dismissal and closes after agreement', () => {
    const login = TestBed.createComponent(Login);
    login.detectChanges();
    const dialog = login.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-describedby')).toBe('cookie-description');
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(TestBed.inject(BrowserPreferences).hasConsent()).toBe(false);
    dialog.querySelector('button')!.click();
    login.detectChanges();
    expect(login.nativeElement.querySelector('dialog')).toBeNull();
    expect(TestBed.inject(BrowserPreferences).hasConsent()).toBe(true);
    login.destroy();
  });
  it('allows access without persistence if cookies are blocked', () => {
    const p = TestBed.inject(BrowserPreferences);
    vi.spyOn(p, 'accept').mockImplementation(() => {
      p.storageError.set('O navegador não permitiu salvar o cookie.');
      return false;
    });
    const login = TestBed.createComponent(Login);
    login.detectChanges();
    (login.nativeElement.querySelector('dialog button') as HTMLButtonElement).click();
    login.detectChanges();
    expect(login.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'não permitiu',
    );
    const continueButton = [...login.nativeElement.querySelectorAll('dialog button')].find(
      (b: unknown) => (b as HTMLButtonElement).textContent?.trim() === 'Continuar sem salvar',
    ) as HTMLButtonElement;
    continueButton.click();
    login.detectChanges();
    expect(login.nativeElement.querySelector('dialog')).toBeNull();
    expect(p.hasConsent()).toBe(false);
    login.destroy();
  });
});
