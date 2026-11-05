import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { ProjectContext } from '../../core/project-context.service';
import { ListQuery, Page } from '../workspaces/workspace.models';
import {
  CommentBody,
  ExecutionComment,
  PlanBody,
  PlanCase,
  ResultBody,
  RunBody,
  RunCase,
  RunCaseQuery,
  RunQuery,
  TestPlan,
  TestRun,
} from './execution.models';

@Injectable({ providedIn: 'root' })
export class ExecutionApi {
  private readonly http = inject(HttpClient);
  private readonly context = inject(ProjectContext);
  private request<T>(
    w: string,
    p: string,
    method: string,
    path: string,
    body?: unknown,
    query?: object,
    keys: string[] = [],
  ) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {}))
      if (keys.includes(key) && value !== undefined && value !== '')
        params = params.set(key, String(value));
    return this.http
      .request<ApiResponse<T>>(
        method,
        `${environment.apiUrl}/workspaces/${encodeURIComponent(w)}/projects/${encodeURIComponent(p)}/${path}`,
        { body, params },
      )
      .pipe(
        timeout(20000),
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
  private planPath(id: string) {
    return `test-plans/${encodeURIComponent(id)}`;
  }
  private runPath(id: string) {
    return `test-runs/${encodeURIComponent(id)}`;
  }
  plans(w: string, p: string, q: ListQuery): Observable<Page<TestPlan>> {
    return this.request<TestPlan[]>(w, p, 'GET', 'test-plans', undefined, q, [
      'page',
      'size',
      'q',
      'status',
      'sort',
    ]) as Observable<Page<TestPlan>>;
  }
  createPlan(w: string, p: string, body: PlanBody) {
    return this.request<TestPlan>(w, p, 'POST', 'test-plans', body);
  }
  plan(w: string, p: string, id: string) {
    return this.request<TestPlan>(w, p, 'GET', this.planPath(id));
  }
  updatePlan(
    w: string,
    p: string,
    id: string,
    body: Omit<Partial<PlanBody>, 'caseIds'> & { version: number },
  ) {
    return this.request<TestPlan>(w, p, 'PATCH', this.planPath(id), body);
  }
  planCases(w: string, p: string, id: string, q: ListQuery): Observable<Page<PlanCase>> {
    return this.request<PlanCase[]>(w, p, 'GET', `${this.planPath(id)}/cases`, undefined, q, [
      'page',
      'size',
      'sort',
    ]) as Observable<Page<PlanCase>>;
  }
  addCase(
    w: string,
    p: string,
    id: string,
    body: { version: number; testCaseId: string; position?: number },
  ) {
    return this.request<TestPlan>(w, p, 'POST', `${this.planPath(id)}/cases`, body);
  }
  removeCase(w: string, p: string, id: string, caseId: string, version: number) {
    return this.request<TestPlan>(
      w,
      p,
      'DELETE',
      `${this.planPath(id)}/cases/${encodeURIComponent(caseId)}`,
      { version },
    );
  }
  orderCases(w: string, p: string, id: string, version: number, caseIds: string[]) {
    return this.request<TestPlan>(w, p, 'PUT', `${this.planPath(id)}/cases/order`, {
      version,
      caseIds,
    });
  }
  planAction(
    w: string,
    p: string,
    id: string,
    action: 'activate' | 'complete' | 'archive',
    version: number,
  ) {
    return this.request<TestPlan>(w, p, 'POST', `${this.planPath(id)}/${action}`, { version });
  }
  planRun(w: string, p: string, id: string, version: number, name: string) {
    return this.request<TestRun>(w, p, 'POST', `${this.planPath(id)}/runs`, { version, name });
  }
  runs(w: string, p: string, q: RunQuery): Observable<Page<TestRun>> {
    return this.request<TestRun[]>(w, p, 'GET', 'test-runs', undefined, q, [
      'page',
      'size',
      'q',
      'status',
      'sort',
      'testPlanId',
    ]) as Observable<Page<TestRun>>;
  }
  createRun(w: string, p: string, body: RunBody) {
    return this.request<TestRun>(w, p, 'POST', 'test-runs', body);
  }
  run(w: string, p: string, id: string) {
    return this.request<TestRun>(w, p, 'GET', this.runPath(id));
  }
  runCases(w: string, p: string, id: string, q: RunCaseQuery): Observable<Page<RunCase>> {
    return this.request<RunCase[]>(w, p, 'GET', `${this.runPath(id)}/cases`, undefined, q, [
      'page',
      'size',
      'q',
      'result',
      'sort',
    ]) as Observable<Page<RunCase>>;
  }
  runCase(w: string, p: string, id: string, caseId: string) {
    return this.request<RunCase>(
      w,
      p,
      'GET',
      `${this.runPath(id)}/cases/${encodeURIComponent(caseId)}`,
    );
  }
  runAction(
    w: string,
    p: string,
    id: string,
    action: 'start' | 'complete' | 'abort',
    version: number,
  ) {
    return this.request<TestRun>(w, p, 'POST', `${this.runPath(id)}/${action}`, { version });
  }
  caseResult(w: string, p: string, id: string, caseId: string, body: ResultBody) {
    return this.request<TestRun>(
      w,
      p,
      'PUT',
      `${this.runPath(id)}/cases/${encodeURIComponent(caseId)}/result`,
      body,
    );
  }
  stepResult(
    w: string,
    p: string,
    id: string,
    caseId: string,
    stepId: string,
    body: ResultBody & { actualResult?: string | null },
  ) {
    return this.request<TestRun>(
      w,
      p,
      'PUT',
      `${this.runPath(id)}/cases/${encodeURIComponent(caseId)}/steps/${encodeURIComponent(stepId)}/result`,
      body,
    );
  }
  comments(w: string, p: string, id: string, q: ListQuery): Observable<Page<ExecutionComment>> {
    return this.request<ExecutionComment[]>(
      w,
      p,
      'GET',
      `${this.runPath(id)}/comments`,
      undefined,
      q,
      ['page', 'size', 'q', 'sort'],
    ) as Observable<Page<ExecutionComment>>;
  }
  comment(w: string, p: string, id: string, body: CommentBody) {
    return this.request<TestRun>(w, p, 'POST', `${this.runPath(id)}/comments`, body);
  }
}
