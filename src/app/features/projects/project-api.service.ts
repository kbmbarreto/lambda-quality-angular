import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { ProjectContext } from '../../core/project-context.service';
import { ListQuery, Page } from '../workspaces/workspace.models';
import {
  Project,
  ProjectBody,
  ProjectMember,
  ProjectMemberDetails,
  ProjectRole,
  ProjectResources,
  ProjectBodies,
  ProjectUpdates,
  Milestone,
} from './project.models';

@Injectable({ providedIn: 'root' })
export class ProjectApi {
  private readonly http = inject(HttpClient);
  private readonly context = inject(ProjectContext);
  private url(workspaceId: string, projectId?: string, suffix = ''): string {
    return `${environment.apiUrl}/workspaces/${encodeURIComponent(workspaceId)}/projects${projectId ? '/' + encodeURIComponent(projectId) : ''}${suffix}`;
  }
  private params(query: ListQuery & { active?: boolean }, keys: string[]): HttpParams {
    let params = new HttpParams();
    for (const key of keys) {
      const value = query[key as keyof typeof query];
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return params;
  }
  private scoped<T>(
    request: Observable<T>,
    workspaceId: string,
    projectId?: string,
  ): Observable<T> {
    return request.pipe(
      timeout(20000),
      catchError((error) => {
        if (
          error instanceof HttpErrorResponse &&
          ([403, 404].includes(error.status) || error.error?.code === 'PROJECT_ARCHIVED')
        ) {
          this.context.notice.set(
            'O acesso ou o estado do projeto mudou. As permissões serão atualizadas.',
          );
          this.context.accessChanged.next({ workspaceId, projectId });
        }
        return throwError(() => error);
      }),
    );
  }
  list(workspaceId: string, query: ListQuery): Observable<Page<Project>> {
    return this.scoped(
      this.http.get<Page<Project>>(this.url(workspaceId), {
        params: this.params(query, ['page', 'size', 'sort', 'q', 'status']),
      }),
      workspaceId,
    );
  }
  get(workspaceId: string, projectId: string): Observable<ApiResponse<Project>> {
    // Scope refresh handles its own failure; emitting here would cause a refresh loop.
    return this.http
      .get<ApiResponse<Project>>(this.url(workspaceId, projectId))
      .pipe(timeout(20000));
  }
  create(
    workspaceId: string,
    body: ProjectBody & { key: string },
  ): Observable<ApiResponse<Project>> {
    return this.scoped(
      this.http.post<ApiResponse<Project>>(this.url(workspaceId), body),
      workspaceId,
    );
  }
  update(
    workspaceId: string,
    projectId: string,
    body: ProjectBody,
  ): Observable<ApiResponse<Project>> {
    return this.scoped(
      this.http.patch<ApiResponse<Project>>(this.url(workspaceId, projectId), body),
      workspaceId,
      projectId,
    );
  }
  archive(workspaceId: string, projectId: string): Observable<ApiResponse<Project>> {
    return this.scoped(
      this.http.post<ApiResponse<Project>>(this.url(workspaceId, projectId, '/archive'), {}),
      workspaceId,
      projectId,
    );
  }
  members(
    workspaceId: string,
    projectId: string,
    query: ListQuery,
  ): Observable<Page<ProjectMemberDetails>> {
    return this.scoped(
      this.http.get<Page<ProjectMemberDetails>>(this.url(workspaceId, projectId, '/members'), {
        params: this.params(query, ['page', 'size', 'sort']),
      }),
      workspaceId,
      projectId,
    );
  }
  assign(
    workspaceId: string,
    projectId: string,
    workspaceMemberId: string,
    projectRole: ProjectRole,
  ): Observable<ApiResponse<ProjectMember>> {
    return this.scoped(
      this.http.put<ApiResponse<ProjectMember>>(
        this.url(workspaceId, projectId, `/members/${encodeURIComponent(workspaceMemberId)}`),
        { projectRole },
      ),
      workspaceId,
      projectId,
    );
  }
  removeMember(
    workspaceId: string,
    projectId: string,
    workspaceMemberId: string,
  ): Observable<void> {
    return this.scoped(
      this.http.delete<void>(
        this.url(workspaceId, projectId, `/members/${encodeURIComponent(workspaceMemberId)}`),
      ),
      workspaceId,
      projectId,
    );
  }
  resources<K extends keyof ProjectResources>(
    workspaceId: string,
    projectId: string,
    kind: K,
    query: ListQuery & { active?: boolean },
  ): Observable<Page<ProjectResources[K]>> {
    return this.scoped(
      this.http.get<Page<ProjectResources[K]>>(this.url(workspaceId, projectId, `/${kind}`), {
        params: this.params(query, [
          'page',
          'size',
          'sort',
          'q',
          kind === 'milestones' ? 'status' : 'active',
        ]),
      }),
      workspaceId,
      projectId,
    );
  }
  resource<K extends keyof ProjectResources>(
    workspaceId: string,
    projectId: string,
    kind: K,
    id: string,
  ): Observable<ApiResponse<ProjectResources[K]>> {
    return this.scoped(
      this.http.get<ApiResponse<ProjectResources[K]>>(
        this.url(workspaceId, projectId, `/${kind}/${encodeURIComponent(id)}`),
      ),
      workspaceId,
      projectId,
    );
  }
  createResource<K extends keyof ProjectResources>(
    workspaceId: string,
    projectId: string,
    kind: K,
    body: ProjectBodies[K],
  ): Observable<ApiResponse<ProjectResources[K]>> {
    return this.scoped(
      this.http.post<ApiResponse<ProjectResources[K]>>(
        this.url(workspaceId, projectId, `/${kind}`),
        body,
      ),
      workspaceId,
      projectId,
    );
  }
  updateResource<K extends keyof ProjectResources>(
    workspaceId: string,
    projectId: string,
    kind: K,
    id: string,
    body: ProjectUpdates[K],
  ): Observable<ApiResponse<ProjectResources[K]>> {
    return this.scoped(
      this.http.patch<ApiResponse<ProjectResources[K]>>(
        this.url(workspaceId, projectId, `/${kind}/${encodeURIComponent(id)}`),
        body,
      ),
      workspaceId,
      projectId,
    );
  }
  removeResource(
    workspaceId: string,
    projectId: string,
    kind: keyof ProjectResources,
    id: string,
  ): Observable<void> {
    return this.scoped(
      this.http.delete<void>(
        this.url(workspaceId, projectId, `/${kind}/${encodeURIComponent(id)}`),
      ),
      workspaceId,
      projectId,
    );
  }
  complete(workspaceId: string, projectId: string, id: string): Observable<ApiResponse<Milestone>> {
    return this.scoped(
      this.http.post<ApiResponse<Milestone>>(
        this.url(workspaceId, projectId, `/milestones/${encodeURIComponent(id)}/complete`),
        {},
      ),
      workspaceId,
      projectId,
    );
  }
}
