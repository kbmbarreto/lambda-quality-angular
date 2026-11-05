import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, finalize, interval } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { NoticeService } from '../../core/notice.service';
import { EmailChallenge } from '../../core/api.models';
import { errorMessage, retryAfter } from '../../core/api-error';
import { AuthWindow } from '../../shared/auth-window';
import {
  applyFieldErrors,
  fieldError,
  matchingPasswords,
  trimmedLength,
} from '../../shared/form-feedback';

@Component({
  selector: 'app-email-flow',
  imports: [AuthWindow, ReactiveFormsModule, RouterLink],
  templateUrl: './email-flow.html',
})
export class EmailFlow {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notice = inject(NoticeService);
  private readonly destroyRef = inject(DestroyRef);
  readonly purpose: 'registration' | 'password-reset' =
    inject(ActivatedRoute).snapshot.data['purpose'];
  readonly registration = this.purpose === 'registration';
  readonly title = this.registration ? 'Criar conta' : 'Recuperar senha';
  readonly form = inject(FormBuilder).nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      displayName: ['', this.registration ? [Validators.required, trimmedLength(2, 100)] : []],
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );
  readonly challenge = signal<EmailChallenge | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly now = signal(Date.now());
  readonly resendAt = signal(0);
  readonly expiresAt = signal(0);
  readonly wait = computed(() => Math.max(0, Math.ceil((this.resendAt() - this.now()) / 1000)));
  readonly remaining = computed(() =>
    Math.max(0, Math.ceil((this.expiresAt() - this.now()) / 1000)),
  );
  private readonly rateLimitUntil = signal(0);
  readonly waitForRateLimit = computed(() =>
    Math.max(0, Math.ceil((this.rateLimitUntil() - this.now()) / 1000)),
  );

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));
  }
  fieldError(name: string): string {
    return fieldError(this.form, name);
  }

  requestCode(): void {
    if (this.loading() || this.wait()) return;
    const email = this.form.controls.email;
    email.markAsTouched();
    if (email.invalid) return;
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.auth
      .requestCode(this.purpose, email.value)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.challenge.set(response.data);
          this.now.set(Date.now());
          this.resendAt.set(this.now() + response.data.resendAfter * 1000);
          this.expiresAt.set(this.now() + response.data.expiresIn * 1000);
          this.form.controls.code.reset();
          this.success.set(`${response.message} Confira também a pasta de spam.`);
        },
        error: (error) => this.handleError(error),
      });
  }

  submit(): void {
    if (!this.challenge()) {
      this.requestCode();
      return;
    }
    if (this.loading() || this.waitForRateLimit() || !this.remaining()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const values = this.form.getRawValue();
    const body = { challengeId: this.challenge()!.challengeId, code: values.code };
    const operation: Observable<unknown> = this.registration
      ? this.auth.register({
          ...body,
          displayName: values.displayName.trim(),
          password: values.password,
        })
      : this.auth.resetPassword({ ...body, newPassword: values.password });
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    operation
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: () => {
          this.form.reset();
          this.challenge.set(null);
          this.notice.message.set(
            this.registration
              ? 'Conta criada com sucesso. Entre para continuar.'
              : 'Senha redefinida. Entre com sua nova senha.',
          );
          void this.router.navigate(['/login']);
        },
        error: (error) => this.handleError(error),
      });
  }

  private handleError(error: unknown): void {
    applyFieldErrors(this.form, error);
    this.error.set(errorMessage(error));
    const seconds = retryAfter(error);
    const status = (error as { status?: number })?.status;
    const wait = seconds || (status === 429 || status === 503 ? 60 : 0);
    this.now.set(Date.now());
    if (wait) this.resendAt.set(Math.max(this.resendAt(), this.now() + wait * 1000));
    if (status === 429) this.rateLimitUntil.set(this.now() + wait * 1000);
  }
}
