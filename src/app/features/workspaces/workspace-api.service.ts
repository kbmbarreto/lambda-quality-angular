import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { WorkspaceContext } from '../../core/workspace-context.service';
import {
  Attachment,
  Creatable,
  CreateBodies,
  Group,
  Invitation,
  ListQuery,
  Member,
  Page,
  Permission,
  Resource,
  Resources,
  UpdateBodies,
  Workspace,
  CustomField,
} from './workspace.models';

@Injectable({ providedIn: 'root' })
export class WorkspaceApi {
  private readonly http = inject(HttpClient);
  private readonly context = inject(WorkspaceContext);
  private readonly base = environment.apiUrl;
  private url(id: string, suffix = ''): string {
    return `${this.base}/workspaces/${encodeURIComponent(id)}${suffix}`;
  }
  private scoped<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      timeout(20000),
      catchError((error) => {
        if (error instanceof HttpErrorResponse && (error.status === 403 || error.status === 404)) {
          this.context.notice.set(
            error.status === 403
              ? 'Suas permissões mudaram. O acesso ao Workspace será atualizado.'
              : 'O recurso não está mais disponível. O Workspace será atualizado.',
          );
          this.context.accessChanged.next();
        }
        return throwError(() => error);
      }),
    );
  }
  private params(query: ListQuery): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return params;
  }
  listWorkspaces(query: ListQuery): Observable<Page<Workspace>> {
    return this.http
      .get<Page<Workspace>>(`${this.base}/workspaces`, { params: this.params(query) })
      .pipe(timeout(20000));
  }
  getWorkspace(id: string): Observable<ApiResponse<Workspace>> {
    return this.http.get<ApiResponse<Workspace>>(this.url(id)).pipe(timeout(20000));
  }
  createWorkspace(body: { name: string; slug: string }): Observable<ApiResponse<Workspace>> {
    return this.http
      .post<ApiResponse<Workspace>>(`${this.base}/workspaces`, body)
      .pipe(timeout(20000));
  }
  updateWorkspace(
    id: string,
    body: { name: string; slug: string },
  ): Observable<ApiResponse<Workspace>> {
    return this.scoped(this.http.patch<ApiResponse<Workspace>>(this.url(id), body));
  }
  transfer(id: string, memberId: string): Observable<ApiResponse<Workspace>> {
    return this.scoped(
      this.http.post<ApiResponse<Workspace>>(this.url(id, '/ownership/transfer'), { memberId }),
    );
  }
  list<K extends Resource>(
    id: string,
    resource: K,
    query: ListQuery,
  ): Observable<Page<Resources[K]>> {
    return this.scoped(
      this.http.get<Page<Resources[K]>>(this.url(id, `/${resource}`), {
        params: this.params(query),
      }),
    );
  }
  get<K extends Resource>(
    id: string,
    resource: K,
    resourceId: string,
  ): Observable<ApiResponse<Resources[K]>> {
    return this.scoped(
      this.http.get<ApiResponse<Resources[K]>>(
        this.url(id, `/${resource}/${encodeURIComponent(resourceId)}`),
      ),
    );
  }
  create<K extends Creatable>(
    id: string,
    resource: K,
    body: CreateBodies[K],
  ): Observable<ApiResponse<Resources[K]>> {
    return this.scoped(
      this.http.post<ApiResponse<Resources[K]>>(this.url(id, `/${resource}`), body),
    );
  }
  update<K extends Creatable>(
    id: string,
    resource: K,
    resourceId: string,
    body: UpdateBodies[K],
  ): Observable<ApiResponse<Resources[K]>> {
    return this.scoped(
      this.http.patch<ApiResponse<Resources[K]>>(
        this.url(id, `/${resource}/${encodeURIComponent(resourceId)}`),
        body,
      ),
    );
  }
  remove(
    id: string,
    resource: Exclude<Resource, 'custom-fields'>,
    resourceId: string,
  ): Observable<void> {
    return this.scoped(
      this.http.delete<void>(this.url(id, `/${resource}/${encodeURIComponent(resourceId)}`)),
    );
  }
  memberStatus(
    id: string,
    memberId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Observable<ApiResponse<Member>> {
    return this.scoped(
      this.http.patch<ApiResponse<Member>>(
        this.url(id, `/members/${encodeURIComponent(memberId)}`),
        { status },
      ),
    );
  }
  invite(id: string, email: string): Observable<ApiResponse<Invitation>> {
    return this.scoped(
      this.http.post<ApiResponse<Invitation>>(this.url(id, '/invitations'), { email }),
    );
  }
  resend(id: string, invitationId: string): Observable<ApiResponse<Invitation>> {
    return this.scoped(
      this.http.post<ApiResponse<Invitation>>(
        this.url(id, `/invitations/${encodeURIComponent(invitationId)}/resend`),
        {},
      ),
    );
  }
  accept(token: string): Observable<ApiResponse<{ workspaceId: string }>> {
    return this.http
      .post<ApiResponse<{ workspaceId: string }>>(`${this.base}/invitations/accept`, { token })
      .pipe(timeout(20000));
  }
  permissions(): Observable<ApiResponse<{ permissions: Permission[] }>> {
    return this.http
      .get<ApiResponse<{ permissions: Permission[] }>>(`${this.base}/permissions`)
      .pipe(timeout(20000));
  }
  memberRole(id: string, memberId: string, roleId: string, assign: boolean): Observable<void> {
    return this.binding(
      this.url(id, `/members/${encodeURIComponent(memberId)}/roles/${encodeURIComponent(roleId)}`),
      assign,
    );
  }
  groupRole(id: string, groupId: string, roleId: string, assign: boolean): Observable<void> {
    return this.binding(
      this.url(id, `/groups/${encodeURIComponent(groupId)}/roles/${encodeURIComponent(roleId)}`),
      assign,
    );
  }
  groupMember(id: string, groupId: string, memberId: string, assign: boolean): Observable<void> {
    return this.binding(
      this.url(
        id,
        `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`,
      ),
      assign,
    );
  }
  private binding(url: string, assign: boolean): Observable<void> {
    return this.scoped(assign ? this.http.put<void>(url, {}) : this.http.delete<void>(url));
  }
  groupMembers(
    id: string,
    groupId: string,
    query: ListQuery,
  ): Observable<Page<{ memberId: string }>> {
    return this.scoped(
      this.http.get<Page<{ memberId: string }>>(
        this.url(id, `/groups/${encodeURIComponent(groupId)}/members`),
        { params: this.params(query) },
      ),
    );
  }
  archiveField(id: string, fieldId: string): Observable<ApiResponse<CustomField>> {
    return this.scoped(
      this.http.post<ApiResponse<CustomField>>(
        this.url(id, `/custom-fields/${encodeURIComponent(fieldId)}/archive`),
        {},
      ),
    );
  }
  upload(id: string, file: File): Observable<ApiResponse<Attachment>> {
    const body = new FormData();
    body.append('file', file);
    return this.scoped(this.http.post<ApiResponse<Attachment>>(this.url(id, '/attachments'), body));
  }
  download(id: string, attachmentId: string): Observable<HttpResponse<Blob>> {
    return this.scoped(
      this.http.get(this.url(id, `/attachments/${encodeURIComponent(attachmentId)}/download`), {
        responseType: 'blob',
        observe: 'response',
      }),
    );
  }
}
