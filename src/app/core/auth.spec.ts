import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { NoticeService } from './notice.service';
import { Tokens, User } from './api.models';
import { vi } from 'vitest';
import { SessionResume, sessionResumeKey } from './session-resume';
import { authGuard, guestGuard } from './auth.guard';
import { Observable } from 'rxjs';
import { UrlTree } from '@angular/router';

const tokens: Tokens = {
  accessToken: 'access-one',
  refreshToken: 'refresh-one',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshExpiresIn: 86400,
};
const user: User = {
  id: 'user-one',
  email: 'user@example.com',
  displayName: 'Usuário',
  status: 'ACTIVE',
  createdAt: '2026-10-01T13:00:00Z',
  emailVerifiedAt: '2026-10-01T13:00:00Z',
};
const envelope = <T>(data: T) => ({
  data,
  message: 'OK',
  meta: { requestId: 'request-one', timestamp: '2026-10-01T13:00:00Z' },
});

describe('Auth HTTP integration', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  beforeEach(() => {
    sessionStorage.removeItem(sessionResumeKey);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => {
    http.verify();
    sessionStorage.removeItem(sessionResumeKey);
    vi.restoreAllMocks();
  });

  function login(): void {
    auth.login(' user@example.com ', ' password with spaces ').subscribe();
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.body).toEqual({
      email: 'user@example.com',
      password: ' password with spaces ',
    });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(envelope(tokens));
    const profile = http.expectOne('/api/v1/auth/me');
    expect(profile.request.headers.get('Authorization')).toBe('Bearer access-one');
    profile.flush(envelope(user));
  }

  it('persists only the expiring refresh token in this tab after confirming the profile', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    login();
    expect(auth.user()).toEqual(user);
    const saved = JSON.parse(sessionStorage.getItem(sessionResumeKey)!);
    expect(saved).toEqual({ refreshToken: tokens.refreshToken, expiresAt: expect.any(Number) });
    expect(saved.expiresAt).toBeGreaterThan(Date.now());
    expect(localStorage.getItem(sessionResumeKey)).toBeNull();
    expect(local.mock.calls.every(([key]) => key === sessionResumeKey)).toBe(true);
    expect(sessionStorage.getItem(sessionResumeKey)).not.toContain(tokens.accessToken);
    expect(sessionStorage.getItem(sessionResumeKey)).not.toContain(user.email);
  });

  it('does not retry invalid credentials', () => {
    const failure = vi.fn();
    auth.login(user.email, 'wrong').subscribe({ error: failure });
    http
      .expectOne('/api/v1/auth/login')
      .flush({ code: 'AUTH_INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
    expect(failure).toHaveBeenCalledOnce();
    expect(auth.user()).toBeNull();
    http.expectNone('/api/v1/auth/refresh');
  });

  it('shares a single refresh between simultaneous expired requests', () => {
    login();
    auth.loadProfile().subscribe();
    auth.loadProfile().subscribe();
    const requests = http.match('/api/v1/auth/me');
    requests.forEach((request) =>
      request.flush(
        { code: 'AUTH_ACCESS_TOKEN_EXPIRED' },
        { status: 401, statusText: 'Unauthorized' },
      ),
    );
    const refresh = http.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-one' });
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(envelope({ ...tokens, accessToken: 'access-two', refreshToken: 'refresh-two' }));
    const retried = http.match('/api/v1/auth/me');
    expect(retried).toHaveLength(2);
    retried.forEach((request) => {
      expect(request.request.headers.get('Authorization')).toBe('Bearer access-two');
      request.flush(envelope(user));
    });
  });

  it('uses the rotated token when a late expired response arrives', () => {
    login();
    auth.loadProfile().subscribe();
    auth.loadProfile().subscribe();
    const pending = http.match('/api/v1/auth/me');
    pending[0].flush(
      { code: 'AUTH_ACCESS_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    http
      .expectOne('/api/v1/auth/refresh')
      .flush(envelope({ ...tokens, accessToken: 'access-two' }));
    http.expectOne('/api/v1/auth/me').flush(envelope(user));
    pending[1].flush(
      { code: 'AUTH_ACCESS_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const retried = http.expectOne('/api/v1/auth/me');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer access-two');
    retried.flush(envelope(user));
    http.expectNone('/api/v1/auth/refresh');
  });

  it('ends revoked sessions without refreshing', () => {
    login();
    auth.loadProfile().subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/auth/me')
      .flush({ code: 'AUTH_SESSION_REVOKED' }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    expect(auth.accessToken).toBeNull();
    http.expectNone('/api/v1/auth/refresh');
    expect(TestBed.inject(NoticeService).message()).toContain('sessão terminou');
  });

  it('does not retry failed refreshes and clears the session', () => {
    login();
    auth.loadProfile().subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/auth/me')
      .flush({ code: 'AUTH_ACCESS_TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/v1/auth/refresh').error(new ProgressEvent('error'));
    expect(auth.user()).toBeNull();
    expect(auth.accessToken).toBeNull();
    http.expectNone('/api/v1/auth/refresh');
  });

  it('does not refresh twice when the retried request is unauthorized', () => {
    login();
    auth.loadProfile().subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/auth/me')
      .flush({ code: 'AUTH_ACCESS_TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/v1/auth/refresh')
      .flush(envelope({ ...tokens, accessToken: 'access-two' }));
    http
      .expectOne('/api/v1/auth/me')
      .flush({ code: 'AUTH_ACCESS_TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    http.expectNone('/api/v1/auth/refresh');
    expect(auth.user()).toBeNull();
  });

  it('does not leak bearer tokens to external URLs or public health checks', () => {
    login();
    client.get('https://example.com/api/v1/auth/me').subscribe();
    client.get('/api/v1/health/ready').subscribe();
    for (const url of ['https://example.com/api/v1/auth/me', '/api/v1/health/ready']) {
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
  });

  it('clears local state when logout cannot be confirmed', () => {
    login();
    auth.logout().subscribe({ error: () => undefined });
    http.expectOne('/api/v1/auth/logout').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(auth.user()).toBeNull();
    expect(auth.accessToken).toBeNull();
  });

  it('handles bodyless logout-all responses', () => {
    login();
    const success = vi.fn();
    auth.logout(true).subscribe(success);
    http
      .expectOne('/api/v1/auth/logout-all')
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(success).toHaveBeenCalledOnce();
    expect(auth.user()).toBeNull();
  });

  it('does not restore the session from a refresh completed after local logout', () => {
    login();
    auth.refresh().subscribe({ error: () => undefined });
    const pending = http.expectOne('/api/v1/auth/refresh');
    auth.clearSession();
    pending.flush(envelope({ ...tokens, accessToken: 'late-token' }));
    expect(auth.user()).toBeNull();
    expect(auth.accessToken).toBeNull();
    expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
  });
  it('restores a page reload with one renewal and validates me before allowing protected navigation', () => {
    TestBed.inject(SessionResume).save(tokens);
    const protectedResult = vi.fn(),
      guestResult = vi.fn();
    const guarded = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    ) as Observable<boolean | UrlTree>;
    const guest = TestBed.runInInjectionContext(() =>
      guestGuard({} as never, {} as never),
    ) as Observable<boolean | UrlTree>;
    guarded.subscribe(protectedResult);
    guest.subscribe(guestResult);
    const renewal = http.expectOne('/api/v1/auth/refresh');
    expect(renewal.request.body).toEqual({ refreshToken: tokens.refreshToken });
    expect(renewal.request.headers.has('Authorization')).toBe(false);
    expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
    renewal.flush(
      envelope({ ...tokens, accessToken: 'restored-access', refreshToken: 'rotated-refresh' }),
    );
    const profile = http.expectOne('/api/v1/auth/me');
    expect(profile.request.headers.get('Authorization')).toBe('Bearer restored-access');
    expect(protectedResult).not.toHaveBeenCalled();
    expect(auth.user()).toBeNull();
    profile.flush(envelope(user));
    expect(protectedResult).toHaveBeenCalledExactlyOnceWith(true);
    expect(TestBed.inject(Router).serializeUrl(guestResult.mock.calls[0][0])).toBe('/inicio');
    expect(auth.user()).toEqual(user);
    expect(JSON.parse(sessionStorage.getItem(sessionResumeKey)!).refreshToken).toBe(
      'rotated-refresh',
    );
    http.expectNone('/api/v1/auth/login');
  });
  it('does not restore expired or malformed tab records or trust a cached profile', () => {
    for (const record of [
      '{invalid',
      JSON.stringify({ refreshToken: 'old', expiresAt: Date.now() - 1 }),
      JSON.stringify({ user, accessToken: 'forged' }),
    ]) {
      sessionStorage.setItem(sessionResumeKey, record);
      const ready = vi.fn();
      auth.ensureSession().subscribe(ready);
      expect(ready).toHaveBeenCalledExactlyOnceWith(false);
      expect(auth.user()).toBeNull();
      expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
    }
    http.expectNone('/api/v1/auth/refresh');
    http.expectNone('/api/v1/auth/me');
  });
  it('clears a revoked saved session and returns to login without retrying refresh', () => {
    TestBed.inject(SessionResume).save(tokens);
    const ready = vi.fn();
    auth.ensureSession().subscribe(ready);
    http
      .expectOne('/api/v1/auth/refresh')
      .flush({ code: 'AUTH_SESSION_REVOKED' }, { status: 401, statusText: 'Unauthorized' });
    expect(ready).toHaveBeenCalledExactlyOnceWith(false);
    expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
    expect(auth.accessToken).toBeNull();
    http.expectNone('/api/v1/auth/me');
    http.expectNone('/api/v1/auth/refresh');
  });
  it('never replays a single-use refresh token after a network failure', () => {
    TestBed.inject(SessionResume).save(tokens);
    const ready = vi.fn();
    auth.ensureSession().subscribe(ready);
    http.expectOne('/api/v1/auth/refresh').error(new ProgressEvent('error'));
    auth.ensureSession().subscribe(ready);
    expect(ready.mock.calls).toEqual([[false], [false]]);
    expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
    http.expectNone('/api/v1/auth/refresh');
  });
  it('fails restoration if me cannot validate the renewed session', () => {
    TestBed.inject(SessionResume).save(tokens);
    const ready = vi.fn();
    auth.ensureSession().subscribe(ready);
    http.expectOne('/api/v1/auth/refresh').flush(envelope(tokens));
    http.expectOne('/api/v1/auth/me').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(ready).toHaveBeenCalledExactlyOnceWith(false);
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
  });
  it('keeps ordinary login usable when session storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    login();
    expect(auth.user()).toEqual(user);
    expect(auth.accessToken).toBe(tokens.accessToken);
    expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
  });
  it('removes tab persistence immediately when logout starts, even if the response fails', () => {
    login();
    auth.logout().subscribe({ error: () => undefined });
    expect(sessionStorage.getItem(sessionResumeKey)).toBeNull();
    http.expectOne('/api/v1/auth/logout').error(new ProgressEvent('error'));
    expect(auth.user()).toBeNull();
    auth.ensureSession().subscribe();
    http.expectNone('/api/v1/auth/refresh');
  });
  it('does not persist a late restoration after logout or overwrite a new login', () => {
    TestBed.inject(SessionResume).save(tokens);
    auth.ensureSession().subscribe();
    const old = http.expectOne('/api/v1/auth/refresh');
    auth.clearSession();
    login();
    old.flush(envelope({ ...tokens, accessToken: 'stale-access', refreshToken: 'stale-refresh' }));
    expect(auth.user()).toEqual(user);
    expect(auth.accessToken).toBe(tokens.accessToken);
    expect(JSON.parse(sessionStorage.getItem(sessionResumeKey)!).refreshToken).toBe(
      tokens.refreshToken,
    );
    http.expectNone('/api/v1/auth/me');
  });
});
