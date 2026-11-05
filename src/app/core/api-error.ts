import { HttpErrorResponse } from '@angular/common/http';
import { Observable, TimeoutError, from, switchMap, throwError } from 'rxjs';
import { ApiProblem } from './api.models';

// HttpClient returns Blob errors for private file downloads too.
export function normalizeProblemError(error: unknown): Observable<never> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob))
    return throwError(() => error);
  return from(error.error.text()).pipe(
    switchMap((text) => {
      let problem: unknown;
      try {
        problem = JSON.parse(text);
      } catch {
        return throwError(() => error);
      }
      return throwError(
        () =>
          new HttpErrorResponse({
            error: problem,
            headers: error.headers,
            status: error.status,
            statusText: error.statusText,
            url: error.url ?? undefined,
          }),
      );
    }),
  );
}

export function problemOf(error: unknown): Partial<ApiProblem> {
  return error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
    ? error.error
    : {};
}

export function retryAfter(error: unknown): number {
  if (!(error instanceof HttpErrorResponse)) return 0;
  const header = error.headers.get('Retry-After');
  if (!header) return 0;
  const seconds = Number(header);
  return (
    Math.max(
      0,
      Number.isFinite(seconds) ? seconds : Math.ceil((Date.parse(header) - Date.now()) / 1000),
    ) || 0
  );
}

export function errorMessage(error: unknown): string {
  const problem = problemOf(error);
  const messages: Record<string, string> = {
    VALIDATION_ERROR: 'Revise os campos indicados e tente novamente.',
    AUTH_INVALID_CREDENTIALS: 'E-mail ou senha inválidos.',
    AUTH_INVALID_EMAIL_CODE: 'Código inválido ou expirado. Confira o código ou solicite outro.',
    RATE_LIMIT_EXCEEDED: 'Muitas tentativas. Aguarde o prazo indicado antes de tentar novamente.',
    EMAIL_DELIVERY_UNAVAILABLE:
      'Não foi possível enviar o e-mail. Aguarde para solicitar outro código.',
    SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível. Tente novamente mais tarde.',
    RESOURCE_CONFLICT:
      'Não foi possível concluir o cadastro. Tente entrar ou solicite outro código.',
  };
  if (problem.code && messages[problem.code]) return messages[problem.code];
  if (error instanceof TimeoutError || (error instanceof HttpErrorResponse && error.status === 0)) {
    return 'Não foi possível confirmar a resposta do servidor. Verifique sua conexão. Se enviou um cadastro ou redefinição, tente entrar antes de repetir a operação.';
  }
  if (error instanceof HttpErrorResponse && error.status === 401)
    return 'Sua sessão terminou. Entre novamente.';
  return `Não foi possível concluir a solicitação.${problem.requestId ? ' Referência: ' + problem.requestId : ''}`;
}
