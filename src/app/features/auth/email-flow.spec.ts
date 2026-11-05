import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { EmailFlow } from './email-flow';
import { NoticeService } from '../../core/notice.service';
import { vi } from 'vitest';

describe('Email verification flows', () => {
  let http: HttpTestingController;
  function setup(purpose: 'registration' | 'password-reset') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { purpose } } } },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(EmailFlow).componentInstance;
  }
  afterEach(() => http.verify());
  function requestCode(flow: EmailFlow) {
    flow.form.controls.email.setValue('user@example.com');
    flow.submit();
    http
      .expectOne(`/api/v1/auth/${flow.purpose}/code`)
      .flush({
        data: { challengeId: 'challenge-one', expiresIn: 600, resendAfter: 60 },
        message: 'Código enviado.',
      });
  }
  function fill(flow: EmailFlow) {
    flow.form.patchValue({
      displayName: ' Usuário ',
      code: '012345',
      password: ' password 123 ',
      confirmPassword: ' password 123 ',
    });
  }

  it('requests a code without sending a password and enforces resend cooldown', () => {
    const flow = setup('registration');
    flow.form.controls.email.setValue('user@example.com');
    flow.submit();
    const request = http.expectOne('/api/v1/auth/registration/code');
    expect(request.request.body).toEqual({ email: 'user@example.com' });
    request.flush({
      data: { challengeId: 'challenge-one', expiresIn: 600, resendAfter: 60 },
      message: 'Código enviado.',
    });
    flow.requestCode();
    http.expectNone('/api/v1/auth/registration/code');
    expect(flow.wait()).toBe(60);
  });

  it('preserves leading zeroes in codes and spaces in passwords', () => {
    const flow = setup('registration');
    requestCode(flow);
    fill(flow);
    flow.submit();
    const request = http.expectOne('/api/v1/auth/register');
    expect(request.request.body).toEqual({
      challengeId: 'challenge-one',
      code: '012345',
      displayName: 'Usuário',
      password: ' password 123 ',
    });
    request.flush({ data: {}, message: 'Criado.' }, { status: 201, statusText: 'Created' });
    expect(flow.form.controls.password.value).toBe('');
    expect(TestBed.inject(NoticeService).message()).toContain('Conta criada');
  });

  it('does not submit mismatched passwords or a blank trimmed name', () => {
    const flow = setup('registration');
    requestCode(flow);
    fill(flow);
    flow.form.controls.confirmPassword.setValue('different password');
    flow.submit();
    http.expectNone('/api/v1/auth/register');
    flow.form.controls.confirmPassword.setValue(' password 123 ');
    flow.form.controls.displayName.setValue('  ');
    flow.submit();
    http.expectNone('/api/v1/auth/register');
  });

  it('rejects expired challenges and permits a new request after cooldown', () => {
    const flow = setup('registration');
    requestCode(flow);
    fill(flow);
    flow.now.set(flow.expiresAt() + 1);
    flow.submit();
    http.expectNone('/api/v1/auth/register');
    flow.requestCode();
    http
      .expectOne('/api/v1/auth/registration/code')
      .flush({
        data: { challengeId: 'challenge-two', expiresIn: 600, resendAfter: 60 },
        message: 'Enviado.',
      });
    expect(flow.challenge()?.challengeId).toBe('challenge-two');
    expect(flow.form.controls.code.value).toBe('');
  });

  it('uses the recovery contract and handles 204 without a body', () => {
    const flow = setup('password-reset');
    requestCode(flow);
    fill(flow);
    flow.submit();
    const request = http.expectOne('/api/v1/auth/password-reset');
    expect(request.request.body).toEqual({
      challengeId: 'challenge-one',
      code: '012345',
      newPassword: ' password 123 ',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(flow.form.controls.password.value).toBe('');
    expect(TestBed.inject(NoticeService).message()).toContain('Senha redefinida');
  });

  it('binds server validation to newPassword and respects Retry-After', () => {
    const flow = setup('password-reset');
    requestCode(flow);
    fill(flow);
    flow.submit();
    http
      .expectOne('/api/v1/auth/password-reset')
      .flush(
        {
          code: 'VALIDATION_ERROR',
          errors: [{ field: 'newPassword', code: 'INVALID_VALUE', message: 'Senha recusada.' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(flow.fieldError('password')).toBe('Senha recusada.');
    expect(flow.loading()).toBe(false);
    flow.form.controls.password.setValue('another password');
    flow.form.controls.confirmPassword.setValue('another password');
    flow.submit();
    http
      .expectOne('/api/v1/auth/password-reset')
      .flush(
        { code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '90' } },
      );
    expect(flow.waitForRateLimit()).toBe(90);
    flow.submit();
    http.expectNone('/api/v1/auth/password-reset');
  });
});
