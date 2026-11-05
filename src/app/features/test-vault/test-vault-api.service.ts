import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { ProjectContext } from '../../core/project-context.service';
import { Page } from '../workspaces/workspace.models';
import {
  VaultEntry,
  VaultCreate,
  VaultUpdate,
  VaultQuery,
  RevealedEntry,
} from './test-vault.models';
@Injectable({ providedIn: 'root' })
export class TestVaultApi {
  private readonly http = inject(HttpClient);
  private readonly context = inject(ProjectContext);
  private request<T>(
    w: string,
    p: string,
    method: string,
    suffix = '',
    body?: unknown,
    query: VaultQuery = {},
  ) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (
        ['page', 'size', 'sort', 'q', 'environmentId'].includes(key) &&
        value !== undefined &&
        value !== ''
      )
        params = params.set(key, String(value));
    return this.http
      .request<T>(
        method,
        `${environment.apiUrl}/workspaces/${encodeURIComponent(w)}/projects/${encodeURIComponent(p)}/test-vault${suffix}`,
        {
          body,
          params,
          headers: { 'Cache-Control': 'no-store' },
          cache: 'no-store',
        },
      )
      .pipe(
        timeout(20000),
        catchError((error) => {
          if (
            error instanceof HttpErrorResponse &&
            (error.status === 403 || error.error?.code === 'PROJECT_ARCHIVED')
          ) {
            this.context.notice.set(
              'O acesso ou o estado do projeto mudou. As permissões serão atualizadas.',
            );
            this.context.accessChanged.next({ workspaceId: w, projectId: p });
          }
          return throwError(() => error);
        }),
      );
  }
  list(w: string, p: string, query: VaultQuery) {
    return this.request<Page<VaultEntry>>(w, p, 'GET', '', undefined, query);
  }
  create(w: string, p: string, body: VaultCreate) {
    return this.request<ApiResponse<VaultEntry>>(w, p, 'POST', '', body);
  }
  update(w: string, p: string, id: string, body: VaultUpdate) {
    return this.request<ApiResponse<VaultEntry>>(w, p, 'PATCH', `/${encodeURIComponent(id)}`, body);
  }
  reveal(w: string, p: string, id: string) {
    return this.request<ApiResponse<RevealedEntry>>(
      w,
      p,
      'POST',
      `/${encodeURIComponent(id)}/reveal`,
      {},
    );
  }
  remove(w: string, p: string, id: string, version: number) {
    return this.request<void>(w, p, 'DELETE', `/${encodeURIComponent(id)}`, { version });
  }
}
