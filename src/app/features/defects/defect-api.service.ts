import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout, Subject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { ProjectContext } from '../../core/project-context.service';
import { Page } from '../workspaces/workspace.models';
import {
  DefectInventoryRow,
  DefectInventoryQuery,
  CreateDefect,
  Defect,
  DefectQuery,
  ExternalIssue,
  FailureDefect,
  UpdateDefect,
} from './defect.models';
@Injectable({ providedIn: 'root' })
export class DefectApi {
  readonly inventoryChanged = new Subject<void>();
  inventory(query: DefectInventoryQuery): Observable<Page<DefectInventoryRow>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (
        ['page', 'size', 'sort', 'q', 'status', 'workspaceId', 'projectId', 'severity'].includes(
          key,
        ) &&
        value !== undefined &&
        value !== ''
      )
        params = params.set(key, String(value));
    return this.http
      .get<Page<DefectInventoryRow>>(`${environment.apiUrl}/defects`, { params })
      .pipe(timeout(20000));
  }
  private readonly http = inject(HttpClient);
  private readonly context = inject(ProjectContext);
  private request<T>(
    w: string,
    p: string,
    method: string,
    path = '',
    body?: unknown,
    query?: DefectQuery,
  ) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {}))
      if (
        [
          'page',
          'size',
          'sort',
          'q',
          'status',
          'severity',
          'testRunCaseId',
          'environmentId',
        ].includes(key) &&
        value !== undefined &&
        value !== ''
      )
        params = params.set(key, String(value));
    return this.http
      .request<ApiResponse<T>>(
        method,
        `${environment.apiUrl}/workspaces/${encodeURIComponent(w)}/projects/${encodeURIComponent(p)}/defects${path}`,
        { body, params },
      )
      .pipe(
        timeout(20000),
        tap(() => {
          if (method !== 'GET') this.inventoryChanged.next();
        }),
        catchError((error) => {
          if (
            error instanceof HttpErrorResponse &&
            ([403, 404].includes(error.status) || error.error?.code === 'PROJECT_ARCHIVED')
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
  private path(id: string) {
    return `/${encodeURIComponent(id)}`;
  }
  list(w: string, p: string, query: DefectQuery): Observable<Page<Defect>> {
    return this.request<Defect[]>(w, p, 'GET', '', undefined, query) as Observable<Page<Defect>>;
  }
  create(w: string, p: string, body: CreateDefect) {
    return this.request<Defect>(w, p, 'POST', '', body);
  }
  fromFailure(w: string, p: string, body: FailureDefect) {
    return this.request<Defect>(w, p, 'POST', '/from-failure', body);
  }
  get(w: string, p: string, id: string) {
    return this.request<Defect>(w, p, 'GET', this.path(id));
  }
  update(w: string, p: string, id: string, body: UpdateDefect) {
    return this.request<Defect>(w, p, 'PATCH', this.path(id), body);
  }
  linkExternal(w: string, p: string, id: string, body: ExternalIssue) {
    return this.request<Defect>(w, p, 'POST', `${this.path(id)}/external-link`, body);
  }
  unlinkExternal(w: string, p: string, id: string, version: number) {
    return this.request<Defect>(w, p, 'DELETE', `${this.path(id)}/external-link`, { version });
  }
  addAttachment(w: string, p: string, id: string, attachmentId: string, version: number) {
    return this.request<Defect>(w, p, 'POST', `${this.path(id)}/attachments`, {
      version,
      attachmentId,
    });
  }
  removeAttachment(w: string, p: string, id: string, attachmentId: string, version: number) {
    return this.request<Defect>(
      w,
      p,
      'DELETE',
      `${this.path(id)}/attachments/${encodeURIComponent(attachmentId)}`,
      { version },
    );
  }
}
