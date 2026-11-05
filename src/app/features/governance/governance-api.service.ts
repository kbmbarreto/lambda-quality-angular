import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout, forkJoin, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Page } from '../workspaces/workspace.models';
import { FrameworkProgress } from './framework-progress.models';
import {
  Records,
  Kind,
  Bodies,
  Updates,
  Query,
  Section,
  Control,
  SectionBody,
  ControlBody,
  SectionMutation,
  ControlMutation,
  Assessment,
  AssessedControl,
  ComplianceStatus,
  Evidence,
  EvidenceBody,
  Goal,
  Action,
  Metrics,
  Dashboard,
} from './governance.models';
const baseKeys = ['page', 'size', 'sort', 'q'];
const keys: Record<Kind, string[]> = {
  frameworks: [...baseKeys, 'status'],
  assessments: [...baseKeys, 'status', 'frameworkId'],
  goals: [...baseKeys, 'status', 'projectId'],
  actions: [...baseKeys, 'status', 'goalId', 'controlAssessmentId'],
};
@Injectable({ providedIn: 'root' })
export class GovernanceApi {
  private readonly http = inject(HttpClient);
  private readonly context = inject(WorkspaceContext);
  private path(...parts: string[]) {
    return parts.map(encodeURIComponent).join('/');
  }
  private request<T>(
    w: string,
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
    allowed: string[] = [],
  ): Observable<ApiResponse<T>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {}))
      if (allowed.includes(key) && value !== undefined && value !== '')
        params = params.set(key, String(value));
    return this.http
      .request<ApiResponse<T>>(
        method,
        `${environment.apiUrl}/workspaces/${encodeURIComponent(w)}/governance/${path}`,
        { body, params },
      )
      .pipe(
        timeout(20000),
        catchError((error) => {
          if (
            error instanceof HttpErrorResponse &&
            ([403, 404].includes(error.status) || error.error?.code === 'PROJECT_ARCHIVED') &&
            this.context.selected()?.id === w
          ) {
            this.context.notice.set(
              'O acesso ou o estado do recurso mudou. As permissões serão atualizadas.',
            );
            this.context.accessChanged.next();
          }
          return throwError(() => error);
        }),
      );
  }
  list<K extends Kind>(w: string, kind: K, query: Query) {
    return this.request<Records[K][]>(w, 'GET', kind, undefined, query, keys[kind]) as Observable<
      Page<Records[K]>
    >;
  }
  get<K extends Kind>(w: string, kind: K, id: string) {
    return this.request<Records[K]>(w, 'GET', this.path(kind, id));
  }
  create<K extends Kind>(w: string, kind: K, body: Bodies[K]) {
    return this.request<Records[K]>(w, 'POST', kind, body);
  }
  update<K extends keyof Updates>(w: string, kind: K, id: string, body: Updates[K]) {
    return this.request<Records[K]>(w, 'PATCH', this.path(kind, id), body);
  }
  refreshActionGoals(w: string, ids: string[]) {
    const distinct = [...new Set(ids)];
    if (!distinct.length) return of([] as Goal[]);
    return forkJoin({
      goals: forkJoin(
        distinct.map((id) =>
          forkJoin({
            goal: this.get(w, 'goals', id),
            actions: this.list(w, 'actions', {
              goalId: id,
              page: 1,
              size: 20,
              status: 'ALL',
              sort: 'dueDate,asc',
            }),
          }).pipe(map((r) => r.goal.data)),
        ),
      ),
      dashboard: this.dashboard(w),
    }).pipe(map((r) => r.goals));
  }
  sections(w: string, id: string, query: Query) {
    return this.request<Section[]>(
      w,
      'GET',
      this.path('frameworks', id, 'sections'),
      undefined,
      query,
      baseKeys,
    ) as Observable<Page<Section>>;
  }
  controls(w: string, id: string, query: Query) {
    return this.request<Control[]>(
      w,
      'GET',
      this.path('frameworks', id, 'controls'),
      undefined,
      query,
      [...baseKeys, 'active', 'sectionId'],
    ) as Observable<Page<Control>>;
  }
  createSection(w: string, id: string, body: SectionBody) {
    return this.request<SectionMutation>(w, 'POST', this.path('frameworks', id, 'sections'), body);
  }
  updateSection(
    w: string,
    id: string,
    childId: string,
    body: Partial<SectionBody> & { version: number },
  ) {
    return this.request<SectionMutation>(
      w,
      'PATCH',
      this.path('frameworks', id, 'sections', childId),
      body,
    );
  }
  createControl(w: string, id: string, body: ControlBody) {
    return this.request<ControlMutation>(w, 'POST', this.path('frameworks', id, 'controls'), body);
  }
  updateControl(
    w: string,
    id: string,
    childId: string,
    body: Partial<ControlBody> & { version: number },
  ) {
    return this.request<ControlMutation>(
      w,
      'PATCH',
      this.path('frameworks', id, 'controls', childId),
      body,
    );
  }
  assessmentAction(w: string, id: string, action: 'start' | 'close', version: number) {
    return this.request<Assessment>(w, 'POST', this.path('assessments', id, action), { version });
  }
  assessedControls(w: string, id: string, query: Query) {
    return this.request<AssessedControl[]>(
      w,
      'GET',
      this.path('assessments', id, 'controls'),
      undefined,
      query,
      ['page', 'size', 'sort', 'status'],
    ) as Observable<Page<AssessedControl>>;
  }
  assess(
    w: string,
    id: string,
    controlId: string,
    body: { version: number; status: ComplianceStatus; justification?: string | null },
  ) {
    return this.request<Assessment>(
      w,
      'PUT',
      this.path('assessments', id, 'controls', controlId),
      body,
    );
  }
  evidence(w: string, id: string, controlId: string, query: Query) {
    return this.request<Evidence[]>(
      w,
      'GET',
      this.path('assessments', id, 'controls', controlId, 'evidence'),
      undefined,
      query,
      baseKeys,
    ) as Observable<Page<Evidence>>;
  }
  addEvidence(w: string, id: string, controlId: string, body: EvidenceBody) {
    return this.request<Assessment>(
      w,
      'POST',
      this.path('assessments', id, 'controls', controlId, 'evidence'),
      body,
    );
  }
  removeEvidence(w: string, id: string, controlId: string, evidenceId: string, version: number) {
    return this.request<Assessment>(
      w,
      'DELETE',
      this.path('assessments', id, 'controls', controlId, 'evidence', evidenceId),
      { version },
    );
  }
  calculate(w: string, id: string, version: number) {
    return this.request<Goal>(w, 'POST', this.path('goals', id, 'calculate'), { version });
  }
  complete(w: string, id: string, version: number) {
    return this.request<Action>(w, 'POST', this.path('actions', id, 'complete'), { version });
  }
  metrics(w: string) {
    return this.request<Metrics>(w, 'GET', 'metrics');
  }
  dashboard(w: string) {
    return this.request<Dashboard>(w, 'GET', 'dashboard');
  }
  progress(w: string, frameworkId: string, assessmentId?: string) {
    return this.request<FrameworkProgress>(
      w,
      'GET',
      this.path('frameworks', frameworkId, 'progress'),
      undefined,
      { assessmentId },
      ['assessmentId'],
    );
  }
}
