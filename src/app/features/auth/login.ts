import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, interval } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { NoticeService } from '../../core/notice.service';
import { InvitationContext } from '../../core/invitation-context.service';
import { errorMessage, retryAfter } from '../../core/api-error';
import { AuthWindow } from '../../shared/auth-window';
import { applyFieldErrors, fieldError } from '../../shared/form-feedback';
import { BrowserPreferences } from '../../core/browser-preferences';
import { CookieNotice } from '../../shared/cookie-notice';

@Component({
  selector: 'app-login',
  imports: [AuthWindow, ReactiveFormsModule, RouterLink, CookieNotice],
  templateUrl: './login.html',
})
export class Login {
  readonly preferences = inject(BrowserPreferences);
  readonly cookieNoticeOpen = signal(!this.preferences.hasConsent());
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly notice = inject(NoticeService);
  private readonly invitation = inject(InvitationContext);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });
  readonly loading = signal(false);
  readonly error = signal('');
  readonly wait = signal(0);
  private waitUntil = 0;

  constructor() {
    this.preferences.restore();
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.wait.set(Math.max(0, Math.ceil((this.waitUntil - Date.now()) / 1000))));
  }

  fieldError(name: string): string {
    return fieldError(this.form, name);
  }

  submit(): void {
    if (this.loading() || this.wait()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.error.set('');
    this.notice.message.set('');
    this.loading.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth
      .login(email, password)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: () => {
          this.form.controls.password.reset();
          void this.router.navigate([this.invitation.token() ? '/convites/aceitar' : '/inicio']);
        },
        error: (error) => {
          applyFieldErrors(this.form, error);
          this.error.set(errorMessage(error));
          const seconds = retryAfter(error) || (error.status === 429 ? 60 : 0);
          this.waitUntil = Date.now() + seconds * 1000;
          this.wait.set(seconds);
        },
      });
  }
}
