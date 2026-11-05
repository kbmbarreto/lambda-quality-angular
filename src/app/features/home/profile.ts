import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { ApiResponse } from '../../core/api.models';
import { errorMessage } from '../../core/api-error';
import { NoticeService } from '../../core/notice.service';
import { AppShell } from '../../shared/app-shell';
import { BrowserPreferences, themeNames } from '../../core/browser-preferences';

@Component({
  selector: 'app-profile',
  imports: [DatePipe, AppShell],
  templateUrl: './profile.html',
})
export class Profile {
  readonly preferences = inject(BrowserPreferences);
  readonly themeNames = themeNames;
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly notice = inject(NoticeService);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly checking = signal(false);
  readonly health = signal<'unknown' | 'up' | 'down'>('unknown');
  readonly healthError = signal('');
  readonly checkedAt = signal<Date | null>(null);
  readonly confirmLogoutAll = signal(false);

  constructor() {
    this.checkHealth();
  }

  checkHealth(): void {
    if (this.checking()) return;
    this.checking.set(true);
    this.healthError.set('');
    this.http
      .get<ApiResponse<{ status: 'up' }>>(`${environment.apiUrl}/health/ready`)
      .pipe(
        timeout(10000),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.checking.set(false)),
      )
      .subscribe({
        next: () => {
          this.health.set('up');
          this.checkedAt.set(new Date());
        },
        error: (error) => {
          this.health.set('down');
          this.checkedAt.set(new Date());
          this.healthError.set(errorMessage(error));
        },
      });
  }

  reloadProfile(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.auth
      .loadProfile()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        error: (error) => this.error.set(errorMessage(error)),
      });
  }

  logout(all = false): void {
    if (this.busy()) return;
    this.busy.set(true);
    // Let revocation finish even if navigation destroys the page.
    this.auth
      .logout(all)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.notice.message.set(
            all ? 'Todas as suas sessões foram encerradas.' : 'Sessão encerrada com sucesso.',
          );
          void this.router.navigate(['/login']);
        },
        error: () => {
          this.notice.message.set(
            'Sessão encerrada neste navegador. Não foi possível confirmar a revogação no servidor.',
          );
          void this.router.navigate(['/login']);
        },
      });
  }
}
