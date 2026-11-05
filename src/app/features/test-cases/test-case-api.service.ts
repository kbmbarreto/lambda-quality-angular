import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, mergeMap, throwError, timeout, toArray } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { ProjectContext } from '../../core/project-context.service';
import { Page } from '../workspaces/workspace.models';
import {
  AzureImportResult,
  CaseQuery,
  RepositorySummary,
  CaseStatus,
  CreateCase,
  FieldValue,
  StepBody,
  SuiteBody,
  SuiteQuery,
  TestCase,
  TestStep,
  TestSuite,
  UpdateCase,
  allPages,
} from './test-case.models';

@Injectable({ providedIn: 'root' })
export class TestCaseApi {
  private readonly http = inject(HttpClient);
  private readonly context = inject(ProjectContext);
  private summarySupported: boolean | undefined;
  private url(w: string, p: string, path: string): string {
    return `${environment.apiUrl}/workspaces/${encodeURIComponent(w)}/projects/${encodeURIComponent(p)}/${path}`;
  }
  private request<T>(
    w: string,
    p: string,
    method: string,
    path: string,
    body?: unknown,
    query?: CaseQuery | SuiteQuery,
  ): Observable<ApiResponse<T>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    return this.http.request<ApiResponse<T>>(method, this.url(w, p, path), { body, params }).pipe(
      timeout(20000),
      catchError((error) => {
        if (
          error instanceof HttpErrorResponse &&
          ([403, 404].includes(error.status) || error.error?.code === 'PROJECT_ARCHIVED') &&
          !(path === 'test-cases/summary' && error.status === 404)
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
  importAzure(w: string, p: string, file: File) {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.request<AzureImportResult>(w, p, 'POST', 'test-cases/import/azure-devops', body);
  }
  suites(w: string, p: string, query: SuiteQuery): Observable<Page<TestSuite>> {
    return this.request<TestSuite[]>(w, p, 'GET', 'test-suites', undefined, query) as Observable<
      Page<TestSuite>
    >;
  }
  allSuites(w: string, p: string): Observable<TestSuite[]> {
    return allPages((page) =>
      this.suites(w, p, { page, size: 100, status: 'ALL', sort: 'position,asc' }),
    );
  }
  suite(w: string, p: string, id: string) {
    return this.request<TestSuite>(w, p, 'GET', `test-suites/${encodeURIComponent(id)}`);
  }
  createSuite(w: string, p: string, body: SuiteBody & { parentSuiteId?: string | null }) {
    return this.request<TestSuite>(w, p, 'POST', 'test-suites', body);
  }
  updateSuite(w: string, p: string, id: string, body: Partial<SuiteBody>) {
    return this.request<TestSuite>(w, p, 'PATCH', `test-suites/${encodeURIComponent(id)}`, body);
  }
  moveSuite(
    w: string,
    p: string,
    id: string,
    body: { parentSuiteId: string | null; position?: number },
  ) {
    return this.request<TestSuite>(
      w,
      p,
      'POST',
      `test-suites/${encodeURIComponent(id)}/move`,
      body,
    );
  }
  archiveSuite(w: string, p: string, id: string) {
    return this.request<TestSuite>(
      w,
      p,
      'POST',
      `test-suites/${encodeURIComponent(id)}/archive`,
      {},
    );
  }
  orderSuites(w: string, p: string, parentSuiteId: string | null, ids: string[]) {
    return this.request<TestSuite[]>(w, p, 'PUT', 'test-suites/order', { parentSuiteId, ids });
  }
  cases(w: string, p: string, query: CaseQuery): Observable<Page<TestCase>> {
    return this.request<TestCase[]>(w, p, 'GET', 'test-cases', undefined, query) as Observable<
      Page<TestCase>
    >;
  }
  summary(w: string, p: string, status?: string, suites: TestSuite[] = []) {
    const existingRoutes = () =>
      from([null, ...suites.map((suite) => suite.id)]).pipe(
        mergeMap(
          (suiteId) =>
            this.cases(w, p, {
              page: 1,
              size: 1,
              status,
              ...(suiteId ? { suiteId } : { root: true }),
            }).pipe(
              map((response) => ({
                response,
                suiteId,
                totalCases: response.meta.pagination.totalItems,
              })),
            ),
          3,
        ),
        toArray(),
        map((groups): ApiResponse<RepositorySummary> => ({
          data: {
            totalCases: groups.reduce((total, group) => total + group.totalCases, 0),
            suites: groups.map(({ suiteId, totalCases }) => ({ suiteId, totalCases })),
          },
          message: 'Contagens consultadas.',
          meta: groups[0].response.meta,
        })),
      );
    if (this.summarySupported === false) return existingRoutes();
    return this.request<RepositorySummary>(w, p, 'GET', 'test-cases/summary', undefined, {
      status,
    }).pipe(
      map((response) => {
        this.summarySupported = true;
        return response;
      }),
      catchError((error) => {
        // Older APIs resolve "summary" as :caseId and reject it in the UUID guard.
        const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
        const legacyRoute =
          error instanceof HttpErrorResponse &&
          error.status === 400 &&
          error.error?.code === 'VALIDATION_ERROR' &&
          error.error?.detail === 'Informe identificadores UUID v4 válidos.' &&
          uuid.test(w) &&
          uuid.test(p);
        if (error instanceof HttpErrorResponse && (error.status === 404 || legacyRoute)) {
          this.summarySupported = false;
          return existingRoutes();
        }
        return throwError(() => error);
      }),
    );
  }
  get(w: string, p: string, id: string) {
    return this.request<TestCase>(w, p, 'GET', `test-cases/${encodeURIComponent(id)}`);
  }
  create(w: string, p: string, body: CreateCase) {
    return this.request<TestCase>(w, p, 'POST', 'test-cases', body);
  }
  update(w: string, p: string, id: string, body: UpdateCase) {
    return this.request<TestCase>(w, p, 'PATCH', `test-cases/${encodeURIComponent(id)}`, body);
  }
  move(w: string, p: string, id: string, version: number, suiteId: string | null) {
    return this.request<TestCase>(w, p, 'POST', `test-cases/${encodeURIComponent(id)}/move`, {
      version,
      suiteId,
    });
  }
  clone(w: string, p: string, id: string, body: { title?: string; suiteId?: string | null }) {
    return this.request<TestCase>(w, p, 'POST', `test-cases/${encodeURIComponent(id)}/clone`, body);
  }
  archive(w: string, p: string, id: string, version: number) {
    return this.request<TestCase>(w, p, 'POST', `test-cases/${encodeURIComponent(id)}/archive`, {
      version,
    });
  }
  restore(
    w: string,
    p: string,
    id: string,
    body: {
      version: number;
      status: CaseStatus;
      suiteId?: string | null;
      customFields?: FieldValue[];
    },
  ) {
    return this.request<TestCase>(
      w,
      p,
      'POST',
      `test-cases/${encodeURIComponent(id)}/restore`,
      body,
    );
  }
  steps(w: string, p: string, id: string) {
    return this.request<TestStep[]>(w, p, 'GET', `test-cases/${encodeURIComponent(id)}/steps`);
  }
  addStep(
    w: string,
    p: string,
    id: string,
    body: StepBody & { version: number; position?: number },
  ) {
    return this.request<TestCase>(w, p, 'POST', `test-cases/${encodeURIComponent(id)}/steps`, body);
  }
  updateStep(
    w: string,
    p: string,
    id: string,
    stepId: string,
    body: Partial<StepBody> & { version: number },
  ) {
    return this.request<TestCase>(
      w,
      p,
      'PATCH',
      `test-cases/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`,
      body,
    );
  }
  removeStep(w: string, p: string, id: string, stepId: string, version: number) {
    return this.request<TestCase>(
      w,
      p,
      'DELETE',
      `test-cases/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`,
      { version },
    );
  }
  orderSteps(w: string, p: string, id: string, version: number, ids: string[]) {
    return this.request<TestCase>(w, p, 'PUT', `test-cases/${encodeURIComponent(id)}/steps/order`, {
      version,
      ids,
    });
  }
  binding(
    w: string,
    p: string,
    id: string,
    kind: 'tags' | 'attachments',
    targetId: string,
    version: number,
    assign: boolean,
  ) {
    return this.request<TestCase>(
      w,
      p,
      assign ? 'PUT' : 'DELETE',
      `test-cases/${encodeURIComponent(id)}/${kind}/${encodeURIComponent(targetId)}`,
      { version },
    );
  }
  fields(w: string, p: string, id: string, version: number, customFields: FieldValue[]) {
    return this.request<TestCase>(
      w,
      p,
      'PUT',
      `test-cases/${encodeURIComponent(id)}/custom-fields`,
      { version, customFields },
    );
  }
}
