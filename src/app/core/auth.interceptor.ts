import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { NoticeService } from './notice.service';
import { normalizeProblemError, problemOf } from './api-error';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notice = inject(NoticeService);
  const protectedRequest =
    request.url.startsWith(`${environment.apiUrl}/`) &&
    !/\/auth\/(login|refresh|register|registration\/code|password-reset(?:\/code)?)$/.test(
      request.url,
    ) &&
    !request.url.startsWith(`${environment.apiUrl}/health/`);
  if (!protectedRequest || !auth.accessToken) return next(request);
  const token = auth.accessToken;
  const withToken = (accessToken: string) =>
    request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } });
  const endSession = (error: unknown) => {
    auth.clearSession();
    notice.message.set('Sua sessão terminou. Entre novamente.');
    void router.navigate(['/login']);
    return throwError(() => error);
  };
  return next(withToken(token)).pipe(
    catchError(normalizeProblemError),
    catchError((error) => {
      if (error.status !== 401) return throwError(() => error);
      if (problemOf(error).code !== 'AUTH_ACCESS_TOKEN_EXPIRED') return endSession(error);
      // Another request may already have rotated the tokens before this response arrived.
      const renewal =
        auth.accessToken && auth.accessToken !== token
          ? next(withToken(auth.accessToken))
          : auth.refresh().pipe(switchMap((tokens) => next(withToken(tokens.accessToken))));
      return renewal.pipe(
        catchError(normalizeProblemError),
        catchError((retryError) => {
          if (!auth.accessToken || retryError.status === 401) return endSession(retryError);
          return throwError(() => retryError);
        }),
      );
    }),
  );
};
