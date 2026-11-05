import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../core/auth.service';
import { InvitationContext } from '../core/invitation-context.service';
import { AcceptInvitation } from '../features/workspaces/accept-invitation';
import { AppShell } from './app-shell';

const token = 'A'.repeat(43);
const workspaceId = '11111111-1111-4111-8111-111111111111';
describe('Invitation modal in the app header', () => {
  let http: HttpTestingController;
  const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });
  afterAll(() => {
    for (const [key, descriptor] of [
      ['showModal', originalShow],
      ['close', originalClose],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
    }
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(AuthService), 'user').mockReturnValue({
      id: 'user',
      email: 'qa@example.com',
      displayName: 'Pessoa de teste',
    } as never);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });
  function open() {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      'header button[aria-label="Aceitar convite"]',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    return {
      fixture,
      button,
      dialog: fixture.nativeElement.querySelector('dialog') as HTMLDialogElement,
    };
  }
  it('opens and closes without navigation or accepting anything when there is no token', () => {
    const { fixture, button, dialog } = open();
    expect(fixture.nativeElement.querySelector('nav a[href="/convites/aceitar"]')).toBeNull();
    expect(dialog.open).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.textContent).toContain('Abra o link enviado no e-mail');
    http.expectNone('/api/v1/invitations/accept');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    dialog.querySelector('button')!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fixture.destroy();
  });
  it('requires confirmation, serializes acceptance and opens the returned workspace', () => {
    TestBed.inject(InvitationContext).token.set(token);
    const { fixture, dialog } = open();
    http.expectNone('/api/v1/invitations/accept');
    const confirm = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Aceitar convite',
    )!;
    confirm.click();
    fixture.detectChanges();
    const request = http.expectOne('/api/v1/invitations/accept');
    expect(request.request.body).toEqual({ token });
    expect(request.request.params.keys()).toEqual([]);
    const modal = fixture.debugElement.query(By.directive(AcceptInvitation))
      .componentInstance as AcceptInvitation;
    modal.accept();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('button')!.disabled).toBe(true);
    request.flush({
      data: { workspaceId },
      message: 'Convite aceito.',
      meta: { requestId: 'request', timestamp: '2026-10-04T12:00:00Z' },
    });
    fixture.detectChanges();
    expect(TestBed.inject(InvitationContext).token()).toBe('');
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/workspaces', workspaceId]);
    fixture.destroy();
  });
  it('preserves the invitation after a failed acceptance and allows dismissal', () => {
    TestBed.inject(InvitationContext).token.set(token);
    const { fixture, dialog } = open();
    const modal = fixture.debugElement.query(By.directive(AcceptInvitation))
      .componentInstance as AcceptInvitation;
    modal.accept();
    http
      .expectOne('/api/v1/invitations/accept')
      .flush({ code: 'WORKSPACE_INVITATION_INVALID' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(dialog.querySelector('[role=alert]')?.textContent).toContain('Convite inválido');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(InvitationContext).token()).toBe(token);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(TestBed.inject(InvitationContext).token()).toBe(token);
    fixture.destroy();
  });
});
