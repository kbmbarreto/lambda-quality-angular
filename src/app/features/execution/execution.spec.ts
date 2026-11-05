import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DestroyRef } from '@angular/core';
import { By } from '@angular/platform-browser';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ProjectContext } from '../../core/project-context.service';
import { Project, roleCapabilities } from '../projects/project.models';
import { ProjectMembers } from '../projects/project-members';
import { FormDialog } from '../workspaces/ui/form-dialog';
import { Page, Workspace } from '../workspaces/workspace.models';
import { TestCase } from '../test-cases/test-case.models';
import { ExecutionApi } from './execution-api.service';
import { ExecutionState } from './execution-feedback';
import { RunCase, TestPlan, TestRun, canPass, fieldSnapshotValue } from './execution.models';
import { ExecutionCaseSelection } from './case-selection';
import { ExecutionContextEditor } from './context-editor';
import { ExecutionRepository, ExecutionRepositoryPanel } from './execution-repository';
import { PlanDetail } from './plan-detail';
import { RunDetail } from './run-detail';
import { TestReportImport } from './report-import';
import { parseJUnit, reportMatch, reportIssue } from './test-report';
const time = '2026-10-02T15:00:00Z';
const workspace = {
  id: 'w',
  name: 'Equipe',
  slug: 'equipe',
  status: 'ACTIVE',
  ownerMemberId: 'owner',
  permissions: ['project.read', 'testrun.read'],
  createdAt: time,
  updatedAt: time,
} satisfies Workspace;
const project: Project = {
  id: 'p',
  workspaceId: 'w',
  key: 'QA',
  name: 'Portal',
  description: null,
  status: 'ACTIVE',
  projectRole: 'MANAGER',
  permissions: roleCapabilities.MANAGER,
  createdAt: time,
  updatedAt: time,
  archivedAt: null,
};
const plan: TestPlan = {
  id: 'plan',
  workspaceId: 'w',
  projectId: 'p',
  name: 'Regressão',
  description: null,
  status: 'DRAFT',
  version: 4,
  createdBy: 'user',
  createdAt: time,
  updatedAt: time,
  activatedAt: null,
  completedAt: null,
  archivedAt: null,
  milestoneId: null,
  environmentId: null,
  cases: [],
};
const run: TestRun = {
  id: 'run',
  workspaceId: 'w',
  projectId: 'p',
  testPlanId: null,
  milestoneId: null,
  environmentId: null,
  planNameSnapshot: null,
  milestoneSnapshot: null,
  environmentSnapshot: null,
  name: 'Regressão manual',
  source: 'MANUAL',
  externalRunRef: null,
  status: 'IN_PROGRESS',
  version: 7,
  createdBy: 'user',
  createdAt: time,
  updatedAt: time,
  startedAt: time,
  finishedAt: null,
  summary: { total: 1, notTested: 1, passed: 0, failed: 0, blocked: 0, skipped: 0 },
};
const runCase: RunCase = {
  id: 'copy-case',
  workspaceId: 'w',
  projectId: 'p',
  testRunId: 'run',
  testCaseId: 'source-case',
  position: 1,
  caseSequenceSnapshot: 1,
  humanIdSnapshot: 'QA-1',
  titleSnapshot: 'Entrar',
  severitySnapshot: 'NORMAL',
  prioritySnapshot: 'MEDIUM',
  definitionSnapshot: {
    version: 99,
    suiteId: null,
    status: 'ACTIVE',
    description: 'Descrição preservada',
    preconditions: null,
    postconditions: null,
    type: 'FUNCTIONAL',
    layer: 'E2E',
    behavior: null,
    automationStatus: 'MANUAL',
  },
  customFieldsSnapshot: [],
  tagsSnapshot: [],
  result: 'NOT_TESTED',
  executedBy: null,
  executedAt: null,
  comment: null,
  createdAt: time,
  updatedAt: time,
  steps: [
    {
      id: 'copy-step',
      workspaceId: 'w',
      projectId: 'p',
      testRunId: 'run',
      testRunCaseId: 'copy-case',
      sourceStepId: 'source-step',
      position: 1,
      actionSnapshot: 'Abrir página',
      testDataSnapshot: null,
      expectedResultSnapshot: 'Página aberta',
      actualResult: null,
      result: 'NOT_TESTED',
      comment: null,
      executedBy: null,
      executedAt: null,
    },
  ],
};
const source: TestCase = {
  ...runCase.definitionSnapshot,
  id: 'source-case',
  workspaceId: 'w',
  projectId: 'p',
  createdBy: 'user',
  humanId: 'QA-1',
  sequence: 1,
  title: 'Entrar',
  status: 'ACTIVE',
  severity: 'NORMAL',
  priority: 'MEDIUM',
  steps: [],
  tagIds: [],
  attachmentIds: [],
  customFields: [],
  createdAt: time,
  updatedAt: time,
  archivedAt: null,
};
const base = '/api/v1/workspaces/w/projects/p';
const envelope = <T>(data: T) => ({
  data,
  message: 'OK',
  meta: { requestId: 'r', timestamp: time },
});
const page = <T>(data: T[], number = 1, next = false): Page<T> => ({
  ...envelope(data),
  meta: {
    requestId: 'r',
    timestamp: time,
    pagination: {
      page: number,
      size: 20,
      totalItems: data.length,
      totalPages: next ? 2 : number,
      hasNext: next,
      hasPrevious: number > 1,
    },
  },
});
const form = (values: Record<string, unknown>) =>
  new FormGroup(
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, new FormControl(v)])),
  );
beforeAll(() =>
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  }),
);
let http: HttpTestingController;
let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
beforeEach(() => {
  params = new BehaviorSubject(convertToParamMap({ workspaceId: 'w', projectId: 'p' }));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: params, snapshot: { data: { execution: true } } },
      },
    ],
  });
  http = TestBed.inject(HttpTestingController);
});
afterEach(() => {
  http.verify({ ignoreCancelled: true });
  TestBed.resetTestingModule();
});

describe('Execution API contracts', () => {
  const contracts: [string, string, string, (api: ExecutionApi) => unknown, unknown?][] = [
    [
      'list plans',
      'GET',
      'test-plans',
      (a) => a.plans('w', 'p', { page: 2, size: 20, q: 'teste', status: 'ALL', sort: 'name,asc' }),
    ],
    [
      'create plan',
      'POST',
      'test-plans',
      (a) => a.createPlan('w', 'p', { name: 'Plano', caseIds: [] }),
      { name: 'Plano', caseIds: [] },
    ],
    ['get plan', 'GET', 'test-plans/plan', (a) => a.plan('w', 'p', 'plan')],
    [
      'edit plan',
      'PATCH',
      'test-plans/plan',
      (a) => a.updatePlan('w', 'p', 'plan', { version: 4, name: 'Novo', environmentId: null }),
      { version: 4, name: 'Novo', environmentId: null },
    ],
    [
      'list selection',
      'GET',
      'test-plans/plan/cases',
      (a) =>
        a.planCases('w', 'p', 'plan', {
          page: 1,
          size: 100,
          sort: 'position,asc',
          q: 'rejected',
          status: 'ALL',
        }),
    ],
    [
      'add source case',
      'POST',
      'test-plans/plan/cases',
      (a) => a.addCase('w', 'p', 'plan', { version: 4, testCaseId: 'source-case', position: 1 }),
      { version: 4, testCaseId: 'source-case', position: 1 },
    ],
    [
      'remove source case',
      'DELETE',
      'test-plans/plan/cases/source-case',
      (a) => a.removeCase('w', 'p', 'plan', 'source-case', 4),
      { version: 4 },
    ],
    [
      'order source cases',
      'PUT',
      'test-plans/plan/cases/order',
      (a) => a.orderCases('w', 'p', 'plan', 4, ['a', 'b']),
      { version: 4, caseIds: ['a', 'b'] },
    ],
    ...(['activate', 'complete', 'archive'] as const).map(
      (action) =>
        [
          action,
          'POST',
          `test-plans/plan/${action}`,
          (a: ExecutionApi) => a.planAction('w', 'p', 'plan', action, 4),
          { version: 4 },
        ] as (typeof contracts)[number],
    ),
    [
      'plan run uses plan version',
      'POST',
      'test-plans/plan/runs',
      (a) => a.planRun('w', 'p', 'plan', 4, 'Execução'),
      { version: 4, name: 'Execução' },
    ],
    [
      'list runs',
      'GET',
      'test-runs',
      (a) =>
        a.runs('w', 'p', {
          testPlanId: 'plan',
          status: 'IN_PROGRESS',
          q: 'manual',
          sort: 'createdAt,desc',
        }),
    ],
    [
      'create adhoc run',
      'POST',
      'test-runs',
      (a) => a.createRun('w', 'p', { name: 'Avulsa', caseIds: ['source-case'], milestoneId: null }),
      { name: 'Avulsa', caseIds: ['source-case'], milestoneId: null },
    ],
    ['get run', 'GET', 'test-runs/run', (a) => a.run('w', 'p', 'run')],
    [
      'list copied cases',
      'GET',
      'test-runs/run/cases',
      (a) =>
        a.runCases('w', 'p', 'run', { result: 'FAILED', q: 'Entrar', sort: 'titleSnapshot,asc' }),
    ],
    [
      'get copied case',
      'GET',
      'test-runs/run/cases/copy-case',
      (a) => a.runCase('w', 'p', 'run', 'copy-case'),
    ],
    ...(['start', 'complete', 'abort'] as const).map(
      (action) =>
        [
          action,
          'POST',
          `test-runs/run/${action}`,
          (a: ExecutionApi) => a.runAction('w', 'p', 'run', action, 7),
          { version: 7 },
        ] as (typeof contracts)[number],
    ),
    [
      'case result uses run version',
      'PUT',
      'test-runs/run/cases/copy-case/result',
      (a) => a.caseResult('w', 'p', 'run', 'copy-case', { version: 7, result: 'FAILED' }),
      { version: 7, result: 'FAILED' },
    ],
    [
      'step result uses copied ids',
      'PUT',
      'test-runs/run/cases/copy-case/steps/copy-step/result',
      (a) =>
        a.stepResult('w', 'p', 'run', 'copy-case', 'copy-step', {
          version: 7,
          result: 'PASSED',
          actualResult: null,
          comment: null,
        }),
      { version: 7, result: 'PASSED', actualResult: null, comment: null },
    ],
    [
      'list comments',
      'GET',
      'test-runs/run/comments',
      (a) => a.comments('w', 'p', 'run', { q: 'texto', sort: 'createdAt,asc' }),
    ],
    [
      'add immutable step comment',
      'POST',
      'test-runs/run/comments',
      (a) =>
        a.comment('w', 'p', 'run', {
          version: 7,
          text: 'Registro',
          runCaseId: 'copy-case',
          runStepId: 'copy-step',
        }),
      { version: 7, text: 'Registro', runCaseId: 'copy-case', runStepId: 'copy-step' },
    ],
  ];
  it.each(contracts)('%s', (name, method, path, invoke, body) => {
    const api = TestBed.inject(ExecutionApi);
    (invoke(api) as ReturnType<ExecutionApi['plan']>).subscribe();
    const request = http.expectOne((r) => r.url === `${base}/${path}`);
    expect(request.request.method).toBe(method);
    if (body) expect(request.request.body).toEqual(body);
    else expect(request.request.body).toBeNull();
    if (method === 'GET' && path.endsWith('/cases') && path.startsWith('test-plans'))
      expect(request.request.params.keys()).toEqual(['page', 'size', 'sort']);
    if (method === 'GET' && path === 'test-runs')
      expect(request.request.params.get('testPlanId')).toBe('plan');
    if (path === 'test-runs/run/cases') {
      expect(request.request.params.get('result')).toBe('FAILED');
      expect(request.request.params.has('status')).toBe(false);
    }
    if (method !== 'GET') expect(request.request.params.keys()).toEqual([]);
    request.flush(envelope({}));
  });
  it.each([403, 404])('revalidates only the denied tenant on %s', (status) => {
    let changed: unknown;
    TestBed.inject(ProjectContext).accessChanged.subscribe((v) => (changed = v));
    TestBed.inject(ExecutionApi)
      .run('other-w', 'other-p', 'run')
      .subscribe({ error: () => {} });
    http
      .expectOne('/api/v1/workspaces/other-w/projects/other-p/test-runs/run')
      .flush({ code: 'AUTH_FORBIDDEN' }, { status, statusText: 'Denied' });
    expect(changed).toEqual({ workspaceId: 'other-w', projectId: 'other-p' });
  });
});
function detailRun(current: TestRun = run, access: Project = project) {
  const fixture = TestBed.createComponent(RunDetail);
  fixture.componentRef.setInput('project', access);
  fixture.componentRef.setInput('initial', current);
  fixture.detectChanges();
  http.expectOne(`${base}/test-runs/run`).flush(envelope(current));
  flushRunView();
  fixture.detectChanges();
  return fixture;
}
function flushRunView(item: RunCase = runCase, selected = false) {
  http.expectOne((r) => r.url === `${base}/test-runs/run/cases`).flush(page([item]));
  http.expectOne((r) => r.url === `${base}/test-runs/run/comments`).flush(page([]));
  if (selected) http.expectOne(`${base}/test-runs/run/cases/copy-case`).flush(envelope(item));
}
function detailPlan(current: TestPlan = plan, access: Project = project) {
  const fixture = TestBed.createComponent(PlanDetail);
  fixture.componentRef.setInput('project', access);
  fixture.componentRef.setInput('initial', current);
  fixture.detectChanges();
  http.match((r) => r.url === `${base}/test-cases`).forEach((r) => r.flush(page([])));
  http
    .match((r) => r.url.includes('/test-cases/') && r.method === 'GET')
    .forEach((r) => r.flush(envelope(source)));
  return fixture;
}

describe('Execution workflows', () => {
  it('preserves plan metadata edits across a version conflict and rejects a frozen plan after review', () => {
    const fixture = detailPlan(),
      component = fixture.componentInstance;
    component.edit();
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/milestones`).flush(page([]));
    http.expectOne((r) => r.url === `${base}/environments`).flush(page([]));
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(FormDialog))
      .componentInstance as FormDialog;
    editor.form().patchValue({ name: 'Meu nome local', description: 'Minha descrição' });
    editor.submit();
    http
      .expectOne(`${base}/test-plans/plan`)
      .flush({ code: 'TEST_PLAN_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    component.reload();
    http
      .expectOne(`${base}/test-plans/plan`)
      .flush(envelope({ ...plan, version: 5, name: 'Nome concorrente', status: 'ACTIVE' }));
    fixture.detectChanges();
    expect(editor.form().getRawValue()['name']).toBe('Meu nome local');
    expect(component.plan().version).toBe(4);
    component.review();
    fixture.detectChanges();
    editor.submit();
    http.expectNone((r) => r.method === 'PATCH');
    expect(component.plan().status).toBe('ACTIVE');
  });
  it('checks existing plan runs before unlocking a creation with an uncertain response', () => {
    const component = detailPlan({ ...plan, status: 'ACTIVE' }).componentInstance;
    component.creatingRun.set(true);
    component.createRun({
      values: { name: 'Nova execução' },
      form: form({ name: 'Nova execução' }),
    });
    http
      .expectOne(`${base}/test-plans/plan/runs`)
      .flush({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    expect(component.state.blocked()).toBe(true);
    component.reload();
    http.expectOne(`${base}/test-plans/plan`).flush(envelope({ ...plan, status: 'ACTIVE' }));
    http
      .expectOne((r) => r.url === `${base}/test-runs` && r.params.get('testPlanId') === 'plan')
      .flush(page([{ ...run, name: 'Nova execução' }]));
    expect(component.latestRuns()[0].name).toBe('Nova execução');
    expect(component.state.blocked()).toBe(true);
    http.expectNone((r) => r.method === 'POST');
  });
  it('consults the unfiltered comment history after an uncertain immutable comment', () => {
    const component = detailRun().componentInstance;
    component.commentQuery.q = 'filtro anterior';
    component.comment();
    component.save({ values: { text: 'Meu registro' }, form: form({ text: 'Meu registro' }) });
    http
      .expectOne(`${base}/test-runs/run/comments`)
      .flush({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    component.reload();
    http.expectOne(`${base}/test-runs/run`).flush(envelope({ ...run, version: 8 }));
    http.expectOne((r) => r.url === `${base}/test-runs/run/cases`).flush(page([runCase]));
    http.expectOne(`${base}/test-runs/run/cases/copy-case`).flush(envelope(runCase));
    http
      .expectOne(
        (r) =>
          r.url === `${base}/test-runs/run/comments` && r.params.get('q') === 'filtro anterior',
      )
      .flush(page([]));
    const comment = {
      id: 'posted',
      workspaceId: 'w',
      projectId: 'p',
      testRunId: 'run',
      runCaseId: null,
      runStepId: null,
      text: 'Meu registro',
      createdBy: 'user',
      createdAt: time,
    };
    http
      .expectOne((r) => r.url === `${base}/test-runs/run/comments` && !r.params.has('q'))
      .flush(page([comment]));
    expect(component.latestComments()).toEqual([comment]);
    expect(component.state.blocked()).toBe(true);
  });
  it('does not submit the outer creation form when searching or paginating the case picker', () => {
    const fixture = TestBed.createComponent(ExecutionRepositoryPanel);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/test-plans`).flush(page([]));
    fixture.componentInstance.create('run');
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/milestones`).flush(page([]));
    http.expectOne((r) => r.url === `${base}/environments`).flush(page([]));
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([source], 1, true));
    fixture.detectChanges();
    const context = fixture.debugElement.query(By.directive(ExecutionContextEditor))
      .componentInstance as ExecutionContextEditor;
    context.ids.set([source.id]);
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(FormDialog))
      .componentInstance as FormDialog;
    editor.form().patchValue({ name: 'Execução válida' });
    const inner = fixture.nativeElement.querySelector('app-execution-case-selection form');
    inner.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([source], 1, true));
    http.expectNone((r) => r.method === 'POST');
    fixture.detectChanges();
    const next = Array.from(
      fixture.nativeElement.querySelectorAll('app-execution-case-selection app-pagination button'),
    ).find((button: any) => button.textContent.trim() === 'Próxima') as HTMLButtonElement;
    expect(next.type).toBe('button');
    next.click();
    http
      .expectOne((r) => r.url === `${base}/test-cases` && r.params.get('page') === '2')
      .flush(page([source], 2));
    http.expectNone((r) => r.method === 'POST');
    editor.submit();
    const creation = http.expectOne(`${base}/test-runs`);
    expect(creation.request.body).toEqual({
      name: 'Execução válida',
      milestoneId: null,
      environmentId: null,
      caseIds: [source.id],
    });
    creation.flush(envelope({ ...run, status: 'CREATED', version: 1 }));
    http.expectOne((r) => r.url === `${base}/test-runs`).flush(page([run]));
    fixture.detectChanges();
    http.expectOne(`${base}/test-runs/run`).flush(envelope(run));
    flushRunView();
  });

  it('opens the first snapshot in a focused runner without a separate initial case query', () => {
    const fixture = detailRun();
    expect(fixture.componentInstance.selected()?.id).toBe(runCase.id);
    expect(fixture.nativeElement.querySelector('.runner-case[aria-current="true"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.runner-result-bar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.runner-history').open).toBe(false);
    expect(fixture.nativeElement.querySelector('.runner-context').open).toBe(false);
  });
  it('preserves step notes in shortcuts, serializes requests and only enables pass after confirmed steps', () => {
    const fixture = detailRun(),
      c = fixture.componentInstance;
    const item = {
      ...runCase,
      comment: 'Caso anterior',
      steps: [{ ...runCase.steps[0], comment: 'Nota anterior', actualResult: 'Tela aberta' }],
    };
    c.selected.set(item);
    c.quickResult('PASSED');
    http.expectNone((r) => r.method === 'PUT');
    c.quickResult('PASSED', item.steps[0]);
    const request = http.expectOne(`${base}/test-runs/run/cases/copy-case/steps/copy-step/result`);
    expect(request.request.body).toEqual({
      version: 7,
      result: 'PASSED',
      comment: 'Nota anterior',
      actualResult: 'Tela aberta',
    });
    c.quickResult('FAILED', item.steps[0]);
    http.expectNone((r) => r.method === 'PUT');
    request.flush(envelope({ ...run, version: 8 }));
    c.quickResult('FAILED');
    http.expectNone((r) => r.method === 'PUT');
    const updated = { ...item, steps: [{ ...item.steps[0], result: 'PASSED' as const }] };
    flushRunView(updated, true);
    c.quickResult('PASSED');
    const result = http.expectOne(`${base}/test-runs/run/cases/copy-case/result`);
    expect(result.request.body).toEqual({ version: 8, result: 'PASSED', comment: 'Caso anterior' });
    result.flush(envelope({ ...run, version: 9 }));
    flushRunView({ ...updated, result: 'PASSED' }, true);
  });
  it('advances only after the result refresh succeeds and uses the pending case from the queue', () => {
    const c = detailRun().componentInstance;
    const next = { ...runCase, id: 'next-case', position: 2 };
    c.advanceAfterResult.set(true);
    c.quickResult('FAILED');
    const request = http.expectOne(`${base}/test-runs/run/cases/copy-case/result`);
    expect(c.selected()?.id).toBe('copy-case');
    request.flush(envelope({ ...run, version: 8 }));
    expect(c.selected()?.id).toBe('copy-case');
    http
      .expectOne((r) => r.url === `${base}/test-runs/run/cases`)
      .flush(page([{ ...runCase, result: 'FAILED' }, next]));
    http.expectOne((r) => r.url === `${base}/test-runs/run/comments`).flush(page([]));
    http
      .expectOne(`${base}/test-runs/run/cases/copy-case`)
      .flush(envelope({ ...runCase, result: 'FAILED' }));
    http.expectOne(`${base}/test-runs/run`).flush(envelope({ ...run, version: 8 }));
    http
      .expectOne((r) => r.url === `${base}/test-runs/run/cases`)
      .flush(page([{ ...runCase, result: 'FAILED' }, next]));
    http.expectOne((r) => r.url === `${base}/test-runs/run/comments`).flush(page([]));
    http.expectOne(`${base}/test-runs/run/cases/next-case`).flush(envelope(next));
    expect(c.selected()?.id).toBe('next-case');
  });
  it('keeps the current case and blocks further shortcuts after a version conflict', () => {
    const c = detailRun().componentInstance;
    c.advanceAfterResult.set(true);
    c.quickResult('FAILED');
    http
      .expectOne(`${base}/test-runs/run/cases/copy-case/result`)
      .flush({ code: 'TEST_RUN_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(c.selected()?.id).toBe('copy-case');
    expect(c.state.blocked()).toBe(true);
    c.quickResult('SKIPPED');
    c.nextCase();
    http.expectNone((r) => r.method === 'PUT' || r.method === 'GET');
  });
  it('moves to the next queue page and selects its first case without retaining a hidden case', () => {
    const c = detailRun().componentInstance;
    c.cases.set(page([runCase], 1, true));
    c.nextCase();
    http.expectOne(`${base}/test-runs/run`).flush(envelope(run));
    const next = { ...runCase, id: 'page-two', position: 21 };
    const query = http.expectOne((r) => r.url === `${base}/test-runs/run/cases`);
    expect(query.request.params.get('page')).toBe('2');
    query.flush(page([next], 2));
    http.expectOne((r) => r.url === `${base}/test-runs/run/comments`).flush(page([]));
    expect(c.selected()?.id).toBe('page-two');
    expect(c.caseQuery.page).toBe(2);
  });
  it.each(['COMPLETED', 'ABORTED'] as const)(
    'does not expose quick result mutations for %s runs',
    (status) => {
      const fixture = detailRun({ ...run, status });
      fixture.componentInstance.quickResult('FAILED');
      fixture.componentInstance.quickResult('PASSED', runCase.steps[0]);
      http.expectNone((r) => r.method === 'PUT');
      expect(fixture.nativeElement.querySelector('.runner-result-bar .result-button')).toBeNull();
    },
  );
  it('serializes step writes through the post-write refresh and reconfirms the case', () => {
    const fixture = detailRun(),
      component = fixture.componentInstance;
    component.selected.set(runCase);
    component.editResult(runCase.steps[0]);
    const event = {
      values: { result: 'PASSED', comment: '', actualResult: 'Página aberta' },
      form: form({ result: 'PASSED', comment: '', actualResult: 'Página aberta' }),
    };
    component.save(event);
    const request = http.expectOne(`${base}/test-runs/run/cases/copy-case/steps/copy-step/result`);
    expect(request.request.body).toEqual({
      version: 7,
      result: 'PASSED',
      comment: null,
      actualResult: 'Página aberta',
    });
    request.flush(envelope({ ...run, version: 8 }));
    expect(component.state.busy()).toBe(true);
    component.save(event);
    http.expectNone((r) => r.method === 'PUT');
    const updated = {
      ...runCase,
      result: 'NOT_TESTED' as const,
      steps: [{ ...runCase.steps[0], result: 'PASSED' as const, actualResult: 'Página aberta' }],
    };
    flushRunView(updated, true);
    expect(component.state.busy()).toBe(false);
    expect(component.selected()?.result).toBe('NOT_TESTED');
    component.editResult();
    component.save({
      values: { result: 'PASSED', comment: '' },
      form: form({ result: 'PASSED', comment: '' }),
    });
    const confirm = http.expectOne(`${base}/test-runs/run/cases/copy-case/result`);
    expect(confirm.request.body.version).toBe(8);
    confirm.flush(
      envelope({ ...run, version: 9, summary: { ...run.summary, notTested: 0, passed: 1 } }),
    );
    flushRunView({ ...updated, result: 'PASSED' }, true);
    expect(component.run().summary.notTested).toBe(0);
  });
  it('blocks further writes after a confirmed write whose refresh failed', () => {
    const component = detailRun().componentInstance;
    component.selected.set(runCase);
    component.editResult();
    const event = {
      values: { result: 'FAILED', comment: '' },
      form: form({ result: 'FAILED', comment: '' }),
    };
    component.save(event);
    http
      .expectOne(`${base}/test-runs/run/cases/copy-case/result`)
      .flush(envelope({ ...run, version: 8 }));
    http
      .expectOne((r) => r.url === `${base}/test-runs/run/cases`)
      .flush({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    http
      .match((r) => r.url.includes('/test-runs/run'))
      .forEach((r) => {
        if (!r.cancelled) r.flush(page([]));
      });
    expect(component.run().version).toBe(8);
    expect(component.state.blocked()).toBe(true);
    expect(component.fresh()).toBe(false);
    component.save(event);
    http.expectNone((r) => r.method === 'PUT');
    component.reload();
    http.expectOne(`${base}/test-runs/run`).flush(envelope({ ...run, version: 8 }));
    flushRunView({ ...runCase, result: 'FAILED' }, true);
    expect(component.state.blocked()).toBe(true);
    component.review();
    expect(component.selected()?.result).toBe('FAILED');
    expect(component.locked()).toBe(false);
  });
  it('preserves the actual form on 409 and only uses the new run version after review', () => {
    const fixture = detailRun(),
      component = fixture.componentInstance;
    component.selected.set(runCase);
    component.editResult();
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(FormDialog))
      .componentInstance as FormDialog;
    editor.form().patchValue({ result: 'FAILED', comment: 'Meu diagnóstico' });
    editor.submit();
    http
      .expectOne(`${base}/test-runs/run/cases/copy-case/result`)
      .flush(
        { code: 'TEST_RUN_VERSION_CONFLICT', requestId: 'conflict-r' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(component.state.blocked()).toBe(true);
    component.reload();
    http.expectOne(`${base}/test-runs/run`).flush(envelope({ ...run, version: 10 }));
    flushRunView({ ...runCase, comment: 'Comentário de outra pessoa' }, true);
    fixture.detectChanges();
    expect(editor.form().getRawValue()).toEqual({ result: 'FAILED', comment: 'Meu diagnóstico' });
    expect(component.run().version).toBe(7);
    expect(fixture.nativeElement.textContent).toContain('Comentário de outra pessoa');
    editor.submit();
    http.expectNone((r) => r.method === 'PUT');
    component.review();
    fixture.detectChanges();
    editor.submit();
    const save = http.expectOne(`${base}/test-runs/run/cases/copy-case/result`);
    expect(save.request.body).toEqual({
      version: 10,
      result: 'FAILED',
      comment: 'Meu diagnóstico',
    });
    save.flush(envelope({ ...run, version: 11 }));
    flushRunView({ ...runCase, result: 'FAILED', comment: 'Meu diagnóstico' }, true);
  });
  it('rejects passing incomplete steps and completing untested cases', () => {
    const component = detailRun().componentInstance;
    component.selected.set(runCase);
    component.editResult();
    component.save({ values: { result: 'PASSED', comment: '' }, form: form({ result: 'PASSED' }) });
    component.action.set('complete');
    component.transition();
    http.expectNone((r) => r.method === 'PUT' || r.method === 'POST');
    expect(canPass(runCase)).toBe(false);
    expect(canPass({ ...runCase, steps: [] })).toBe(true);
    expect(canPass({ ...runCase, steps: [{ ...runCase.steps[0], result: 'SKIPPED' }] })).toBe(true);
  });
  it('records immutable comments using the run aggregate and matching copied target ids', () => {
    const component = detailRun().componentInstance;
    component.selected.set(runCase);
    component.comment(true, runCase.steps[0]);
    component.save({ values: { text: '  Evidência observada  ' }, form: form({ text: 'texto' }) });
    const request = http.expectOne(`${base}/test-runs/run/comments`);
    expect(request.request.body).toEqual({
      version: 7,
      text: 'Evidência observada',
      runCaseId: 'copy-case',
      runStepId: 'copy-step',
    });
    request.flush(envelope({ ...run, version: 8 }));
    flushRunView(runCase, true);
  });
  it.each(['COMPLETED', 'ABORTED'] as const)('keeps %s runs immutable', (status) => {
    const fixture = detailRun({ ...run, status });
    const component = fixture.componentInstance;
    component.selected.set(runCase);
    component.editResult();
    component.comment();
    component.action.set('start');
    component.transition();
    expect(component.editor()).toBeNull();
    http.expectNone((r) => r.method === 'POST' || r.method === 'PUT');
    expect(fixture.nativeElement.textContent).toContain('Execução encerrada');
    expect(fixture.nativeElement.textContent).not.toContain('Abortar execução');
  });
  it('allows executors to record results but prevents creating and aborting runs', () => {
    const access = {
      ...project,
      projectRole: 'EDITOR' as const,
      permissions: roleCapabilities.EDITOR,
    };
    const fixture = detailRun(run, access);
    fixture.componentInstance.action.set('abort');
    fixture.componentInstance.transition();
    http.expectNone((r) => r.method === 'POST');
    fixture.componentInstance.selected.set(runCase);
    fixture.componentInstance.editResult();
    expect(fixture.componentInstance.editor()?.kind).toBe('case');
  });
  it('keeps readers and archived projects from mutating', () => {
    for (const access of [
      { ...project, permissions: ['testrun.read'] },
      { ...project, status: 'ARCHIVED' as const },
    ]) {
      const fixture = detailRun(run, access);
      fixture.componentInstance.selected.set(runCase);
      fixture.componentInstance.editResult();
      fixture.componentInstance.comment();
      fixture.componentInstance.action.set('abort');
      fixture.componentInstance.transition();
      expect(fixture.componentInstance.editor()).toBeNull();
      fixture.destroy();
    }
    http.expectNone((r) => r.method === 'POST' || r.method === 'PUT');
  });
  it('sends every source TestCase id on plan reorder, and the source id on removal', () => {
    const current = {
      ...plan,
      cases: ['a', 'b', 'c'].map((id, index) => ({
        id: `join-${id}`,
        workspaceId: 'w',
        projectId: 'p',
        testPlanId: 'plan',
        testCaseId: id,
        position: index + 1,
      })),
    };
    const component = detailPlan(current).componentInstance;
    component.move(0, 1);
    const request = http.expectOne(`${base}/test-plans/plan/cases/order`);
    expect(request.request.body).toEqual({ version: 4, caseIds: ['b', 'a', 'c'] });
    request.flush(envelope({ ...current, version: 5 }));
    http.match((r) => r.url.includes('/test-cases/')).forEach((r) => r.flush(envelope(source)));
    component.remove('a');
    const removal = http.expectOne(`${base}/test-plans/plan/cases/a`);
    expect(removal.request.method).toBe('DELETE');
    expect(removal.request.body).toEqual({ version: 5 });
    removal.flush(envelope({ ...plan, version: 6 }));
  });
  it('reorders the entire plan even when only a later selection page is visible', () => {
    const ids = Array.from({ length: 45 }, (_, index) => `source-${index}`);
    const current = {
      ...plan,
      cases: ids.map((id, index) => ({
        id: `join-${index}`,
        workspaceId: 'w',
        projectId: 'p',
        testPlanId: 'plan',
        testCaseId: id,
        position: index + 1,
      })),
    };
    const component = detailPlan(current, {
      ...project,
      permissions: ['project.read', 'testrun.read', 'testrun.manage'],
    }).componentInstance;
    component.pageSelection(2);
    expect(component.visibleCases()[0].testCaseId).toBe('source-20');
    expect(component.visibleCases().length).toBe(20);
    component.move(20, -1);
    const request = http.expectOne(`${base}/test-plans/plan/cases/order`);
    expect(request.request.body.caseIds.length).toBe(45);
    expect(request.request.body.caseIds.slice(18, 22)).toEqual([
      'source-18',
      'source-20',
      'source-19',
      'source-21',
    ]);
    expect(request.request.body.caseIds[44]).toBe('source-44');
    request.flush(envelope({ ...current, version: 5 }));
  });
  it('uses the plan version for creation without incrementing the plan locally', () => {
    const current = { ...plan, status: 'ACTIVE' as const };
    const component = detailPlan(current).componentInstance;
    component.createRun({
      values: { name: '  Nova execução  ' },
      form: form({ name: 'Nova execução' }),
    });
    const request = http.expectOne(`${base}/test-plans/plan/runs`);
    expect(request.request.body).toEqual({ version: 4, name: 'Nova execução' });
    request.flush(envelope({ ...run, version: 1, testPlanId: 'plan', status: 'CREATED' }));
    expect(component.plan().version).toBe(4);
  });
  it('requires testcase.read to add, activate and create runs, but permits empty plan administration', () => {
    const component = detailPlan(plan, {
      ...project,
      permissions: ['project.read', 'testrun.read', 'testrun.manage'],
    }).componentInstance;
    component.add(source);
    component.action.set('activate');
    component.transition();
    component.createRun({ values: { name: 'Execução' }, form: form({ name: 'Execução' }) });
    http.expectNone((r) => r.method === 'POST');
    expect(component.draft()).toBe(true);
  });
  it('freezes active plan selections and blocks editing completed and archived plans', () => {
    for (const status of ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const) {
      const component = detailPlan({ ...plan, status }).componentInstance;
      component.add(source);
      component.remove('a');
      component.move(0, 1);
      component.edit();
      expect(component.editing()).toBeNull();
    }
    http.expectNone((r) => r.method !== 'GET');
  });
  it('preserves false, zero and historical option labels', () => {
    const field = {
      fieldId: 'f',
      key: 'key',
      name: 'Campo',
      type: 'BOOLEAN',
      required: true,
      options: [],
      archivedAt: time,
      value: false,
    };
    expect(fieldSnapshotValue(field)).toBe('Não');
    expect(fieldSnapshotValue({ ...field, type: 'NUMBER', value: 0 })).toBe('0');
    expect(
      fieldSnapshotValue({
        ...field,
        type: 'SINGLE_SELECT',
        value: 'o',
        options: [{ id: 'o', label: 'Opção histórica' }],
      }),
    ).toBe('Opção histórica');
  });
  it('retains selection across pages and never adds duplicates or more than 500 cases', () => {
    const fixture = TestBed.createComponent(ExecutionCaseSelection);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([source], 1, true));
    fixture.componentInstance.changed.subscribe((ids) =>
      fixture.componentRef.setInput('selected', ids),
    );
    fixture.componentInstance.choose(source);
    fixture.componentInstance.list.page(2);
    http
      .expectOne((r) => r.url === `${base}/test-cases` && r.params.get('page') === '2')
      .flush(page([{ ...source, id: 'source-two' }], 2));
    fixture.componentInstance.choose({ ...source, id: 'source-two' });
    expect(fixture.componentInstance.selected()).toEqual(['source-case', 'source-two']);
    fixture.componentRef.setInput(
      'selected',
      Array.from({ length: 500 }, (_, index) => `case-${index}`),
    );
    fixture.componentInstance.choose(source);
    expect(fixture.componentInstance.selected().length).toBe(500);
    fixture.componentInstance.choose({ ...source, status: 'DEPRECATED' });
    expect(fixture.componentInstance.selected().length).toBe(500);
  });
  it('loads all context pages and excludes cancelled milestones and inactive environments', () => {
    const fixture = TestBed.createComponent(ExecutionContextEditor);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput(
      'state',
      TestBed.runInInjectionContext(() => new ExecutionState(TestBed.inject(DestroyRef))),
    );
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === `${base}/milestones`)
      .flush(page([{ id: 'cancelled', name: 'Cancelado', status: 'CANCELLED' }], 1, true));
    http
      .expectOne((r) => r.url === `${base}/milestones` && r.params.get('page') === '2')
      .flush(page([{ id: 'valid', name: 'Entrega', status: 'PLANNED' }], 2));
    http
      .expectOne((r) => r.url === `${base}/environments`)
      .flush(
        page([
          { id: 'inactive', name: 'Antigo', active: false },
          { id: 'active', name: 'Homologação', active: true },
        ]),
      );
    expect(
      fixture.componentInstance
        .fields()
        ?.find((f) => f.key === 'milestoneId')
        ?.options?.map((o) => o.value),
    ).toEqual(['', 'valid']);
    expect(
      fixture.componentInstance
        .fields()
        ?.find((f) => f.key === 'environmentId')
        ?.options?.map((o) => o.value),
    ).toEqual(['', 'active']);
  });
  it('respects Retry-After, server field errors and request ids without retrying mutations', () => {
    const state = TestBed.runInInjectionContext(
      () => new ExecutionState(TestBed.inject(DestroyRef)),
    );
    const current = form({ name: 'Plano' });
    state.fail(
      new HttpErrorResponse({
        status: 429,
        headers: new HttpHeaders({ 'Retry-After': '30' }),
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          requestId: 'rate-r',
          errors: [{ field: 'name', message: 'Nome inválido' }],
        },
      }),
      current,
    );
    expect(state.wait()).toBeGreaterThan(0);
    expect(state.error()).toContain('rate-r');
    expect(current.get('name')?.errors?.['server']).toBe('Nome inválido');
  });
  it('requires testrun grants when assigning local project roles', () => {
    const fixture = TestBed.createComponent(ProjectMembers);
    fixture.componentRef.setInput('project', {
      ...project,
      permissions: ['project.read', 'project.manage_members', 'testcase.read'],
    });
    expect(fixture.componentInstance.canAssign('VIEWER')).toBe(false);
    fixture.componentRef.setInput('project', project);
    expect(fixture.componentInstance.canAssign('VIEWER')).toBe(true);
    expect(roleCapabilities.EDITOR).toContain('testrun.execute');
    expect(roleCapabilities.EDITOR).not.toContain('testrun.manage');
    expect(roleCapabilities.MANAGER).toContain('testrun.manage');
  });
  it('blocks a large UTF-8 result payload before sending it', () => {
    const component = detailRun().componentInstance;
    component.selected.set(runCase);
    component.editResult(runCase.steps[0]);
    component.save({
      values: { result: 'FAILED', actualResult: 'あ'.repeat(8000), comment: 'あ'.repeat(8000) },
      form: form({ result: 'FAILED' }),
    });
    http.expectNone((r) => r.method === 'PUT');
    expect(component.state.error()).toContain('32 KiB');
  });
  it('clears and cancels execution requests when changing the tenant', () => {
    const fixture = TestBed.createComponent(ExecutionRepository);
    fixture.detectChanges();
    http.expectOne('/api/v1/workspaces/w').flush(envelope(workspace));
    http.expectOne(base).flush(envelope(project));
    fixture.detectChanges();
    const old = http.expectOne((r) => r.url === `${base}/test-plans`);
    params.next(convertToParamMap({ workspaceId: 'new-w', projectId: 'new-p' }));
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    expect(TestBed.inject(ProjectContext).selected()).toBeNull();
    http.expectOne('/api/v1/workspaces/new-w').flush(envelope({ ...workspace, id: 'new-w' }));
    http
      .expectOne('/api/v1/workspaces/new-w/projects/new-p')
      .flush(envelope({ ...project, id: 'new-p', workspaceId: 'new-w' }));
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/workspaces/new-w/projects/new-p/test-plans')
      .flush(page([]));
  });
});

describe('Bulk selection and report imports', () => {
  it('selects only eligible page cases, respects remaining capacity and preserves other pages', () => {
    const f = TestBed.createComponent(ExecutionCaseSelection);
    f.componentRef.setInput('project', project);
    f.componentRef.setInput('allowDraft', true);
    f.componentRef.setInput('limit', 3);
    f.componentRef.setInput('excluded', ['already']);
    f.componentRef.setInput('selected', ['other-page']);
    f.detectChanges();
    http
      .expectOne((r) => r.url === `${base}/test-cases`)
      .flush(
        page([
          source,
          { ...source, id: 'draft', status: 'DRAFT' },
          { ...source, id: 'already' },
          { ...source, id: 'old', status: 'DEPRECATED' },
        ]),
      );
    f.componentInstance.changed.subscribe((ids) => f.componentRef.setInput('selected', ids));
    f.componentInstance.togglePage();
    expect(f.componentInstance.selected()).toEqual(['other-page', source.id, 'draft']);
    expect(f.componentInstance.pageSelected()).toBe(true);
    f.componentInstance.togglePage();
    expect(f.componentInstance.selected()).toEqual(['other-page']);
  });
  it('adds multiple cases with returned versions and stops after a conflict preserving confirmed additions', () => {
    const c = detailPlan(plan, {
      ...project,
      permissions: ['testrun.manage', 'testcase.read'],
    }).componentInstance;
    c.pendingCases.set(['first', 'second', 'third']);
    c.addSelected();
    const first = http.expectOne(`${base}/test-plans/plan/cases`);
    expect(first.request.body).toEqual({ version: 4, testCaseId: 'first' });
    expect(c.state.busy()).toBe(true);
    first.flush(envelope({ ...plan, version: 5, cases: [{ testCaseId: 'first' }] }));
    const second = http.expectOne(`${base}/test-plans/plan/cases`);
    expect(second.request.body).toEqual({ version: 5, testCaseId: 'second' });
    second.flush(
      { code: 'TEST_PLAN_VERSION_CONFLICT', requestId: 'batch-conflict' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(c.plan().version).toBe(5);
    expect(c.pendingCases()).toEqual(['second', 'third']);
    expect(c.state.blocked()).toBe(true);
    expect(c.state.error()).toContain('batch-conflict');
    expect(c.batchProgress()).toContain('1 de 3');
    c.addSelected();
    http.expectNone((r) => r.method === 'POST');
  });
  it('parses JUnit statuses and refuses entities, malformed XML, empty and oversized result sets', () => {
    const rows = parseJUnit(
      '<testsuites><testsuite><testcase name="Teste por ID"><properties><property name="lambdaquality.caseId" value="case-1"/></properties></testcase><testcase name="Teste por referência"><properties><property name="lambdaquality.humanId" value="QA-2"/></properties><failure message="Erro">Detalhe</failure></testcase><testcase name="QA-3"><skipped/></testcase></testsuite></testsuites>',
    );
    expect(rows.map((r) => r.result)).toEqual(['PASSED', 'FAILED', 'SKIPPED']);
    expect(rows.map((r) => r.reference)).toEqual(['case-1', 'QA-2', 'QA-3']);
    expect(rows[1].comment).toBe('Erro\nDetalhe');
    expect(() => parseJUnit('<!DOCTYPE testsuite><testsuite/>')).toThrow('DTD');
    expect(() => parseJUnit('<testsuite><testcase></testsuite>')).toThrow('válido');
    expect(() => parseJUnit('<testsuite/>')).toThrow('1 a 500');
    expect(() => parseJUnit('<testsuite>' + '<testcase/>'.repeat(501) + '</testsuite>')).toThrow(
      '1 a 500',
    );
  });
  it('matches only unambiguous identifiers and does not infer PASSED for unfinished steps', () => {
    const report = {
      name: 'teste',
      reference: runCase.humanIdSnapshot + ' deve funcionar',
      result: 'PASSED' as const,
      comment: '',
    };
    expect(reportMatch(report, [runCase])).toBe(runCase.id);
    expect(reportMatch({ ...report, reference: runCase.titleSnapshot }, [runCase])).toBe('');
    expect(reportMatch(report, [runCase, { ...runCase, id: 'duplicate' }])).toBe('');
    expect(
      reportIssue(report, { ...runCase, steps: [{ ...runCase.steps[0], result: 'NOT_TESTED' }] }),
    ).toContain('passos pendentes');
  });
  function importer() {
    const f = TestBed.createComponent(TestReportImport);
    f.componentRef.setInput('project', project);
    f.componentRef.setInput('initial', { ...run, testPlanId: 'plan' });
    f.detectChanges();
    const c = f.componentInstance;
    c.run.set({ ...run, testPlanId: 'plan' });
    c.cases.set([
      { ...runCase, result: 'NOT_TESTED', comment: 'Nota anterior', steps: [] },
      { ...runCase, id: 'second', result: 'NOT_TESTED', steps: [] },
    ]);
    c.fileName.set('results.xml');
    c.current.set(true);
    c.rows.set([
      {
        name: 'Teste 1',
        reference: 'QA-1',
        result: 'PASSED',
        comment: '',
        targetId: runCase.id,
        selected: true,
        confirmed: false,
      },
      {
        name: 'Teste 2',
        reference: 'QA-2',
        result: 'FAILED',
        comment: 'Erro',
        targetId: 'second',
        selected: true,
        confirmed: false,
      },
    ]);
    return c;
  }
  it('preflights the version, imports sequentially and preserves comments and step results', () => {
    const c = importer();
    c.apply();
    http.expectOne(`${base}/test-runs/run`).flush(envelope(run));
    const first = http.expectOne(`${base}/test-runs/run/cases/${runCase.id}/result`);
    expect(first.request.body.version).toBe(7);
    expect(first.request.body.result).toBe('PASSED');
    expect(first.request.body.comment).toContain('Nota anterior');
    first.flush(envelope({ ...run, version: 8 }));
    const second = http.expectOne(`${base}/test-runs/run/cases/second/result`);
    expect(second.request.body.version).toBe(8);
    second.flush(envelope({ ...run, version: 9 }));
    expect(c.rows().every((row) => row.confirmed)).toBe(true);
    expect(c.run()!.version).toBe(9);
    http.expectNone((r) => r.url.includes('/steps/') || r.url.endsWith('/complete'));
  });
  it('requires overwrite consent, rejects duplicate targets and blocks retry after uncertain writes', () => {
    const c = importer();
    c.cases.update((cases) => cases.map((item) => ({ ...item, result: 'PASSED' })));
    expect(c.ready()).toBe(false);
    c.overwrite.set(true);
    expect(c.ready()).toBe(true);
    c.rows.update((rows) => rows.map((row) => ({ ...row, targetId: runCase.id })));
    expect(c.ready()).toBe(false);
    c.mapCase(1, 'second');
    c.apply();
    http.expectOne(`${base}/test-runs/run`).flush(envelope(run));
    http
      .expectOne(`${base}/test-runs/run/cases/${runCase.id}/result`)
      .error(new ProgressEvent('error'));
    expect(c.state.blocked()).toBe(true);
    expect(c.rows().some((row) => row.confirmed)).toBe(false);
    c.apply();
    http.expectNone((r) => r.method === 'PUT');
  });
  it('writes nothing when the run version changed after report preview', () => {
    const c = importer();
    c.apply();
    http.expectOne(`${base}/test-runs/run`).flush(envelope({ ...run, version: 8 }));
    expect(c.state.blocked()).toBe(true);
    http.expectNone((r) => r.method === 'PUT');
  });
});
