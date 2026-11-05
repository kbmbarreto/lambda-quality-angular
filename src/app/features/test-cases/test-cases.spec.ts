import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { RepositoryHistory } from './repository-location';
import { RepositoryPicker } from './repository-picker';
import { TestRepositoryEntry } from './test-repository-entry';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Project, roleCapabilities } from '../projects/project.models';
import { CustomField, Page, Workspace } from '../workspaces/workspace.models';
import { CaseDetail } from './case-detail';
import { CaseEditor, EditorResult } from './case-editor';
import { customValueError, fieldForm, fieldValues } from './case-fields';
import { SuiteTree, repositoryCounts } from './suite-tree';
import { SuitePanel } from './suite-panel';
import { TestCaseApi } from './test-case-api.service';
import { CaseDefinition, TestCase, TestSuite, payloadFits } from './test-case.models';
import { TestRepository, TestRepositoryPanel } from './test-repository';

const time = '2026-10-02T15:00:00Z';
const workspace: Workspace = {
  id: 'workspace-one',
  name: 'Equipe',
  slug: 'equipe',
  status: 'ACTIVE',
  ownerMemberId: 'owner',
  createdAt: time,
  updatedAt: time,
  permissions: ['project.read', 'testcase.read'],
};
const project: Project = {
  id: 'project-one',
  workspaceId: workspace.id,
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
const definition: CaseDefinition = {
  title: 'Entrar',
  description: null,
  preconditions: null,
  postconditions: null,
  severity: 'NORMAL',
  priority: 'MEDIUM',
  status: 'DRAFT',
  type: 'FUNCTIONAL',
  layer: 'E2E',
  behavior: null,
  automationStatus: 'MANUAL',
};
const testCase: TestCase = {
  ...definition,
  id: 'case-one',
  workspaceId: workspace.id,
  projectId: project.id,
  createdBy: 'user',
  suiteId: null,
  humanId: 'QA-1',
  sequence: 1,
  version: 3,
  steps: [
    {
      id: 'step-one',
      workspaceId: workspace.id,
      projectId: project.id,
      testCaseId: 'case-one',
      position: 1,
      action: 'Abrir página',
      testData: null,
      expectedResult: null,
    },
  ],
  tagIds: [],
  attachmentIds: [],
  customFields: [],
  createdAt: time,
  updatedAt: time,
  archivedAt: null,
};
const suite: TestSuite = {
  id: 'suite-one',
  workspaceId: workspace.id,
  projectId: project.id,
  parentSuiteId: null,
  name: 'Login',
  description: null,
  position: 1,
  createdAt: time,
  updatedAt: time,
  archivedAt: null,
};
const customField: CustomField = {
  id: 'field-one',
  workspaceId: workspace.id,
  name: 'Custo',
  key: 'custo',
  description: null,
  type: 'NUMBER',
  target: 'TEST_CASE',
  required: true,
  position: 1,
  options: [],
  archivedAt: null,
  createdAt: time,
  updatedAt: time,
};
const base = '/api/v1/workspaces/workspace-one/projects/project-one';
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
});
const envelope = <T>(data: T) => ({
  data,
  message: 'OK',
  meta: { timestamp: time, requestId: 'request-one' },
});
const page = <T>(data: T[], current = 1, hasNext = false): Page<T> => ({
  ...envelope(data),
  meta: {
    ...envelope(data).meta,
    pagination: {
      page: current,
      size: 100,
      totalItems: hasNext ? 101 : data.length,
      totalPages: hasNext ? 2 : current,
      hasNext,
      hasPrevious: current > 1,
    },
  },
});
const form = (values: Record<string, unknown>) =>
  new FormGroup(
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, new FormControl(value)])),
  );

describe('Test management HTTP contracts', () => {
  let api: TestCaseApi, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(TestCaseApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  it('uses the delivered summary response without pagination or extra queries', () => {
    let result: unknown;
    const summary = {
      totalCases: 8,
      suites: [
        { suiteId: null, totalCases: 1 },
        { suiteId: suite.id, totalCases: 7 },
      ],
    };
    api.summary(workspace.id, project.id, 'ALL', [suite]).subscribe((r) => (result = r.data));
    const request = http.expectOne(`${base}/test-cases/summary?status=ALL`);
    expect(request.request.params.keys()).toEqual(['status']);
    request.flush(envelope(summary));
    expect(result).toEqual(summary);
    http.expectNone((r) => r.url === `${base}/test-cases`);
  });
  it('falls back to exact paginated totals when summary is missing, without refreshing access', () => {
    const access = vi.fn();
    TestBed.inject(ProjectContext).accessChanged.subscribe(access);
    let result:
      { totalCases: number; suites: { suiteId: string | null; totalCases: number }[] } | undefined;
    const child = { ...suite, id: 'child', parentSuiteId: suite.id };
    api
      .summary(workspace.id, project.id, 'ALL', [suite, child])
      .subscribe((r) => (result = r.data));
    http
      .expectOne(`${base}/test-cases/summary?status=ALL`)
      .flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    const pending = http.match((r) => r.url === `${base}/test-cases`);
    expect(pending).toHaveLength(3);
    for (const request of pending) {
      expect(request.request.params.get('size')).toBe('1');
      expect(request.request.params.get('status')).toBe('ALL');
      const total = request.request.params.get('root')
        ? 2
        : request.request.params.get('suiteId') === suite.id
          ? 41
          : 8;
      const response = page([testCase]);
      response.meta.pagination.totalItems = total;
      request.flush(response);
    }
    expect(access).not.toHaveBeenCalled();
    expect(result?.totalCases).toBe(51);
    expect(result?.suites.find((group) => group.suiteId === suite.id)?.totalCases).toBe(41);
    // Once absence is confirmed, status changes use existing routes directly.
    api.summary(workspace.id, project.id, 'ARCHIVED', []).subscribe();
    http.expectNone((r) => r.url.endsWith('/summary'));
    http
      .expectOne((r) => r.params.get('root') === 'true' && r.params.get('status') === 'ARCHIVED')
      .flush(page([]));
  });
  it('recognizes the legacy UUID guard rejecting summary without swallowing other validation errors', () => {
    const w = '11111111-1111-4111-8111-111111111111',
      p = '22222222-2222-4222-8222-222222222222';
    const url = `/api/v1/workspaces/${w}/projects/${p}/test-cases`;
    let total: number | undefined;
    api.summary(w, p).subscribe((r) => (total = r.data.totalCases));
    http
      .expectOne(`${url}/summary`)
      .flush(
        { code: 'VALIDATION_ERROR', detail: 'Informe identificadores UUID v4 válidos.' },
        { status: 400, statusText: 'Bad Request' },
      );
    http.expectOne((r) => r.url === url && r.params.get('root') === 'true').flush(page([]));
    expect(total).toBe(0);
  });
  it('does not mask validation errors from a supported summary route', () => {
    let error: unknown;
    api.summary(workspace.id, project.id, 'INVALID').subscribe({ error: (e) => (error = e) });
    http
      .expectOne(`${base}/test-cases/summary?status=INVALID`)
      .flush(
        { code: 'VALIDATION_ERROR', detail: 'Revise os dados da solicitação.' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(error).toBeInstanceOf(HttpErrorResponse);
    http.expectNone((r) => r.url === `${base}/test-cases`);
  });
  it('limits concurrent fallback queries and preserves permission failures', () => {
    let error: unknown;
    const access = vi.fn();
    TestBed.inject(ProjectContext).accessChanged.subscribe(access);
    api
      .summary(
        workspace.id,
        project.id,
        undefined,
        Array.from({ length: 8 }, (_, i) => ({ ...suite, id: `suite-${i}` })),
      )
      .subscribe({ error: (e) => (error = e) });
    http
      .expectOne(`${base}/test-cases/summary`)
      .flush({}, { status: 404, statusText: 'Not Found' });
    const pending = http.match((r) => r.url === `${base}/test-cases`);
    expect(pending).toHaveLength(3);
    pending[0].flush({}, { status: 403, statusText: 'Forbidden' });
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(access).toHaveBeenCalledOnce();
    expect(pending[1].cancelled).toBe(true);
    expect(pending[2].cancelled).toBe(true);
    http.expectNone((r) => r.url === `${base}/test-cases`);
  });
  it('loads every suite page before publishing a complete tree', () => {
    let rows: TestSuite[] | undefined;
    api.allSuites(workspace.id, project.id).subscribe((value) => (rows = value));
    const first = http.expectOne((r) => r.url === `${base}/test-suites`);
    expect(first.request.params.get('status')).toBe('ALL');
    first.flush(page([suite], 1, true));
    expect(rows).toBeUndefined();
    const second = http.expectOne(
      (r) => r.url === `${base}/test-suites` && r.params.get('page') === '2',
    );
    second.flush(page([{ ...suite, id: 'child', parentSuiteId: suite.id }], 2));
    expect(rows?.map((item) => item.id)).toEqual(['suite-one', 'child']);
  });
  it('does not expose a partial tree after a page failure', () => {
    const next = vi.fn(),
      error = vi.fn();
    api.allSuites(workspace.id, project.id).subscribe({ next, error });
    http.expectOne((r) => r.url === `${base}/test-suites`).flush(page([suite], 1, true));
    http
      .expectOne((r) => r.params.get('page') === '2')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });
  it('preserves root=false and case filters without inventing defaults', () => {
    api
      .cases(workspace.id, project.id, {
        page: 2,
        size: 20,
        root: false,
        status: 'ALL',
        priority: 'HIGH',
        automationStatus: 'AUTOMATED',
        tagId: 'tag',
        q: 'login',
        sort: 'title,asc',
      })
      .subscribe();
    const request = http.expectOne((r) => r.url === `${base}/test-cases`);
    expect(request.request.params.get('root')).toBe('false');
    expect(request.request.params.get('suiteId')).toBeNull();
    expect(request.request.params.get('priority')).toBe('HIGH');
    request.flush(page([]));
  });
  it('uses the documented method, payload and aggregate response for every mutation', () => {
    const calls: {
      run: () => Observable<unknown>;
      method: string;
      suffix: string;
      body: unknown;
    }[] = [
      {
        run: () =>
          api.createSuite(workspace.id, project.id, { name: 'Login', parentSuiteId: null }),
        method: 'POST',
        suffix: '/test-suites',
        body: { name: 'Login', parentSuiteId: null },
      },
      {
        run: () => api.updateSuite(workspace.id, project.id, suite.id, { description: null }),
        method: 'PATCH',
        suffix: '/test-suites/suite-one',
        body: { description: null },
      },
      {
        run: () =>
          api.moveSuite(workspace.id, project.id, suite.id, { parentSuiteId: null, position: 1 }),
        method: 'POST',
        suffix: '/test-suites/suite-one/move',
        body: { parentSuiteId: null, position: 1 },
      },
      {
        run: () => api.archiveSuite(workspace.id, project.id, suite.id),
        method: 'POST',
        suffix: '/test-suites/suite-one/archive',
        body: {},
      },
      {
        run: () => api.orderSuites(workspace.id, project.id, null, [suite.id]),
        method: 'PUT',
        suffix: '/test-suites/order',
        body: { parentSuiteId: null, ids: [suite.id] },
      },
      {
        run: () => api.create(workspace.id, project.id, { title: 'Entrar' }),
        method: 'POST',
        suffix: '/test-cases',
        body: { title: 'Entrar' },
      },
      {
        run: () => api.update(workspace.id, project.id, testCase.id, { version: 3, title: 'Novo' }),
        method: 'PATCH',
        suffix: '/test-cases/case-one',
        body: { version: 3, title: 'Novo' },
      },
      {
        run: () => api.move(workspace.id, project.id, testCase.id, 3, null),
        method: 'POST',
        suffix: '/test-cases/case-one/move',
        body: { version: 3, suiteId: null },
      },
      {
        run: () => api.clone(workspace.id, project.id, testCase.id, {}),
        method: 'POST',
        suffix: '/test-cases/case-one/clone',
        body: {},
      },
      {
        run: () => api.archive(workspace.id, project.id, testCase.id, 3),
        method: 'POST',
        suffix: '/test-cases/case-one/archive',
        body: { version: 3 },
      },
      {
        run: () =>
          api.restore(workspace.id, project.id, testCase.id, {
            version: 3,
            status: 'ACTIVE',
            suiteId: null,
          }),
        method: 'POST',
        suffix: '/test-cases/case-one/restore',
        body: { version: 3, status: 'ACTIVE', suiteId: null },
      },
      {
        run: () =>
          api.addStep(workspace.id, project.id, testCase.id, { version: 3, action: 'Abrir' }),
        method: 'POST',
        suffix: '/test-cases/case-one/steps',
        body: { version: 3, action: 'Abrir' },
      },
      {
        run: () =>
          api.updateStep(workspace.id, project.id, testCase.id, 'step-one', {
            version: 3,
            testData: null,
          }),
        method: 'PATCH',
        suffix: '/test-cases/case-one/steps/step-one',
        body: { version: 3, testData: null },
      },
      {
        run: () => api.removeStep(workspace.id, project.id, testCase.id, 'step-one', 3),
        method: 'DELETE',
        suffix: '/test-cases/case-one/steps/step-one',
        body: { version: 3 },
      },
      {
        run: () => api.orderSteps(workspace.id, project.id, testCase.id, 3, ['step-one']),
        method: 'PUT',
        suffix: '/test-cases/case-one/steps/order',
        body: { version: 3, ids: ['step-one'] },
      },
      {
        run: () =>
          api.fields(workspace.id, project.id, testCase.id, 3, [
            { fieldId: 'field', value: false },
          ]),
        method: 'PUT',
        suffix: '/test-cases/case-one/custom-fields',
        body: { version: 3, customFields: [{ fieldId: 'field', value: false }] },
      },
    ];
    for (const kind of ['tags', 'attachments'] as const)
      for (const assign of [true, false])
        calls.push({
          run: () => api.binding(workspace.id, project.id, testCase.id, kind, 'target', 3, assign),
          method: assign ? 'PUT' : 'DELETE',
          suffix: `/test-cases/case-one/${kind}/target`,
          body: { version: 3 },
        });
    for (const call of calls) {
      const next = vi.fn();
      call.run().subscribe(next);
      const request = http.expectOne(`${base}${call.suffix}`);
      expect(request.request.method).toBe(call.method);
      expect(request.request.body).toEqual(call.body);
      request.flush(envelope({ ...testCase, version: 4 }));
      expect(next).toHaveBeenCalledWith(envelope({ ...testCase, version: 4 }));
    }
  });
  it('queries individual suites, cases and steps without a body', () => {
    for (const [run, suffix, data] of [
      [() => api.suite(workspace.id, project.id, suite.id), '/test-suites/suite-one', suite],
      [() => api.get(workspace.id, project.id, testCase.id), '/test-cases/case-one', testCase],
      [
        () => api.steps(workspace.id, project.id, testCase.id),
        '/test-cases/case-one/steps',
        testCase.steps,
      ],
    ] as const) {
      (run() as Observable<unknown>).subscribe();
      const request = http.expectOne(`${base}${suffix}`);
      expect(request.request.method).toBe('GET');
      expect(request.request.body).toBeNull();
      request.flush(envelope(data));
    }
  });
  it('refreshes only the affected project on denial and never retries the mutation', () => {
    const changed = vi.fn();
    TestBed.inject(ProjectContext).accessChanged.subscribe(changed);
    api.archive(workspace.id, project.id, testCase.id, 3).subscribe({ error: () => {} });
    http
      .expectOne(`${base}/test-cases/case-one/archive`)
      .flush({ code: 'AUTH_FORBIDDEN' }, { status: 403, statusText: 'Forbidden' });
    expect(changed).toHaveBeenCalledWith({ workspaceId: workspace.id, projectId: project.id });
    http.expectNone(`${base}/test-cases/case-one/archive`);
  });
});

describe('Case editing, permissions and concurrency', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(WorkspaceContext).selected.set(workspace);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function detail(p = project, item = testCase) {
    const fixture = TestBed.createComponent(CaseDetail);
    for (const [key, value] of Object.entries({
      project: p,
      initial: item,
      suites: [],
      definitions: [],
      tags: [],
      attachments: [],
    }))
      fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }
  const result = (title = 'Edição local'): EditorResult => ({
    definition: { ...definition, title },
    suiteId: 'ignored',
    steps: [{ action: 'ignored' }],
    customFields: [],
    form: form({ title }),
  });
  it('sends only definition fields and the returned version when editing', () => {
    const fixture = detail();
    fixture.componentInstance.edit('edit');
    fixture.componentInstance.saveEditor(result());
    const request = http.expectOne(`${base}/test-cases/case-one`);
    expect(request.request.body.version).toBe(3);
    expect(request.request.body.suiteId).toBeUndefined();
    expect(request.request.body.steps).toBeUndefined();
    request.flush(envelope({ ...testCase, version: 4 }));
    expect(fixture.componentInstance.item()?.version).toBe(4);
  });
  it('preserves local edits on conflict and requires deliberate review before saving a new version', async () => {
    const fixture = detail();
    fixture.componentInstance.edit('edit');
    await fixture.whenStable();
    const editor = fixture.debugElement.query(By.directive(CaseEditor))
      .componentInstance as CaseEditor;
    editor.form.get('title')!.setValue('Edição local');
    editor.submit();
    http
      .expectOne(`${base}/test-cases/case-one`)
      .flush(
        { code: 'TEST_CASE_VERSION_CONFLICT', requestId: 'conflict' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(fixture.componentInstance.state.conflict()).toBe(true);
    expect(fixture.componentInstance.editor()).not.toBeNull();
    expect(editor.form.value.title).toBe('Edição local');
    await fixture.whenStable();
    editor.submit();
    http.expectNone(`${base}/test-cases/case-one`);
    fixture.componentInstance.reload();
    const current = { ...testCase, version: 5, title: 'Outra edição' };
    http.expectOne(`${base}/test-cases/case-one`).flush(envelope(current));
    expect(fixture.componentInstance.item()?.version).toBe(3);
    expect(fixture.componentInstance.latest()?.version).toBe(5);
    fixture.componentInstance.reviewed(current);
    await fixture.whenStable();
    editor.submit();
    const saved = http.expectOne(`${base}/test-cases/case-one`);
    expect(saved.request.body.version).toBe(5);
    expect(saved.request.body.title).toBe('Edição local');
    saved.flush(envelope({ ...current, title: 'Edição local', version: 6 }));
  });
  it('blocks mutations for a reader and for archived projects regardless of role', () => {
    for (const p of [
      { ...project, permissions: ['testcase.read'] },
      { ...project, status: 'ARCHIVED' as const },
    ]) {
      const fixture = detail(p);
      fixture.componentInstance.edit('edit');
      fixture.componentInstance.clone();
      fixture.componentInstance.confirm('archive');
      fixture.componentInstance.orderStep(0, 1);
      expect(fixture.componentInstance.editor()).toBeNull();
      expect(fixture.componentInstance.dialog()).toBeNull();
      expect(fixture.componentInstance.confirmation()).toBeNull();
      fixture.destroy();
    }
    http.expectNone((r) => r.method !== 'GET');
  });
  it('restores an archived case with explicit status, root and version', () => {
    const fixture = detail(project, { ...testCase, status: 'ARCHIVED', archivedAt: time });
    fixture.componentInstance.edit('edit');
    expect(fixture.componentInstance.editor()).toBeNull();
    fixture.componentInstance.edit('restore');
    fixture.componentInstance.saveEditor({
      ...result(),
      suiteId: null,
      definition: { ...definition, status: 'ACTIVE' },
    });
    const request = http.expectOne(`${base}/test-cases/case-one/restore`);
    expect(request.request.body).toEqual({ version: 3, status: 'ACTIVE', suiteId: null });
    request.flush(envelope({ ...testCase, version: 4, status: 'ACTIVE' }));
  });
  it('requires attachment.read to clone attached cases or write attachment bindings', () => {
    const fixture = detail(project, { ...testCase, attachmentIds: ['file'] });
    fixture.componentInstance.clone();
    fixture.componentInstance.link('attachments');
    fixture.componentInstance.confirm('attachments', 'file');
    expect(fixture.componentInstance.dialog()).toBeNull();
    expect(fixture.componentInstance.confirmation()).toBeNull();
  });
  it('cancels pending detail requests when leaving the scope', () => {
    const fixture = detail();
    fixture.componentInstance.reload();
    const request = http.expectOne(`${base}/test-cases/case-one`);
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
  it('shows nested step validation at the affected field', () => {
    const state = detail().componentInstance.state;
    const fixture = TestBed.createComponent(CaseEditor);
    for (const [key, value] of Object.entries({
      mode: 'create',
      suites: [],
      definitions: [],
      state,
    }))
      fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    fixture.componentInstance.addStep();
    const editor = fixture.componentInstance;
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        code: 'VALIDATION_ERROR',
        errors: [{ field: 'steps.0.action', message: 'Ação inválida' }],
      },
    });
    editor.state().fail(error, editor.form);
    expect(editor.stepError(0, 'action')).toBe('Ação inválida');
  });
  it('reorders the complete sibling set and excludes descendants as move destinations', () => {
    const fixture = TestBed.createComponent(SuitePanel);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('suites', [
      suite,
      { ...suite, id: 'second', name: 'Outra', position: 2 },
      { ...suite, id: 'child', parentSuiteId: suite.id },
      { ...suite, id: 'archived', archivedAt: time },
    ]);
    fixture.detectChanges();
    fixture.componentInstance.move(suite);
    expect(
      fixture.componentInstance.editor()?.fields[0].options?.map((option) => option.value),
    ).toEqual(['', 'second']);
    fixture.componentInstance.editor.set(null);
    fixture.componentInstance.order(suite, 1);
    const request = http.expectOne(`${base}/test-suites/order`);
    expect(request.request.body).toEqual({ parentSuiteId: null, ids: ['second', 'suite-one'] });
    request.flush(envelope([]));
  });
});

describe('Repository scope and fields', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(WorkspaceContext).selected.set(workspace);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function repository(suites: TestSuite[] = [], cases: TestCase[] = []) {
    const fixture = TestBed.createComponent(TestRepositoryPanel);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page(cases));
    http.expectOne((r) => r.url === `${base}/test-suites`).flush(page(suites));
    http
      .expectOne(`${base}/test-cases/summary`)
      .flush(envelope({ totalCases: cases.length, suites: [] }));
    fixture.detectChanges();
    return fixture;
  }
  it('keeps applied filters during pagination and removes suiteId when choosing root', () => {
    const fixture = repository(),
      view = fixture.componentInstance;
    view.suiteFilter = 'suite';
    view.priorityFilter = 'HIGH';
    view.search({ q: 'entrar', sort: 'title,asc' });
    http.expectOne((r) => r.params.get('suiteId') === 'suite').flush(page([]));
    view.list.page(2);
    const second = http.expectOne((r) => r.params.get('page') === '2');
    expect(second.request.params.get('priority')).toBe('HIGH');
    second.flush(page([]));
    view.suiteFilter = 'root';
    view.search({ q: '' });
    const root = http.expectOne((r) => r.params.get('root') === 'true');
    expect(root.request.params.has('suiteId')).toBe(false);
    expect(root.request.params.get('page')).toBe('1');
    root.flush(page([]));
  });
  it('clears selection and cancels old requests on project/Workspace navigation', async () => {
    const params = new BehaviorSubject(
      convertToParamMap({ workspaceId: workspace.id, projectId: project.id }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { data: {} } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TestRepository);
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http.expectOne(base).flush(envelope(project));
    await fixture.whenStable();
    const cases = http.expectOne((r) => r.url === `${base}/test-cases`),
      suites = http.expectOne((r) => r.url === `${base}/test-suites`);
    http.expectNone(`${base}/test-cases/summary`);
    suites.flush(page([]));
    const summary = http.expectOne(`${base}/test-cases/summary`);
    params.next(convertToParamMap({ workspaceId: 'workspace-two', projectId: 'project-two' }));
    fixture.detectChanges();
    expect(TestBed.inject(ProjectContext).selected()).toBeNull();
    expect(cases.cancelled).toBe(true);
    expect(summary.cancelled).toBe(true);
    http
      .expectOne('/api/v1/workspaces/workspace-two')
      .flush(envelope({ ...workspace, id: 'workspace-two' }));
    http
      .expectOne('/api/v1/workspaces/workspace-two/projects/project-two')
      .flush(envelope({ ...project, id: 'project-two', workspaceId: 'workspace-two' }));
    fixture.destroy();
  });
  it('navigates the suite tree in one click, preserves filters and shows direct and branch counts', () => {
    const child = { ...suite, id: 'child', name: 'Recuperar senha', parentSuiteId: suite.id };
    const fixture = repository([suite, child], [testCase]);
    const view = fixture.componentInstance;
    view.summary.set({
      totalCases: 4,
      suites: [
        { suiteId: null, totalCases: 1 },
        { suiteId: suite.id, totalCases: 1 },
        { suiteId: child.id, totalCases: 2 },
      ],
    });
    view.priorityFilter = 'HIGH';
    fixture.detectChanges();
    const tree = fixture.debugElement.query(By.directive(SuiteTree)).componentInstance as SuiteTree;
    expect(tree.branchCount(suite.id)).toBe(3);
    expect(tree.count(suite.id)).toBe(1);
    const childButton = [
      ...fixture.nativeElement.querySelectorAll('app-suite-tree button'),
    ] as HTMLButtonElement[];
    childButton.find((button) => button.textContent?.includes('Recuperar senha'))!.click();
    const request = http.expectOne(
      (r) => r.url === `${base}/test-cases` && r.params.get('suiteId') === 'child',
    );
    expect(request.request.params.get('priority')).toBe('HIGH');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([{ ...testCase, suiteId: child.id }]));
    fixture.detectChanges();
    expect(view.currentSuite()?.id).toBe('child');
    expect(fixture.nativeElement.querySelector('.repository-suite-heading').textContent).toContain(
      '2 casos nesta suíte',
    );
    expect(fixture.nativeElement.querySelector('.case-title-link').textContent).toContain('Entrar');
    http.expectNone(`${base}/test-cases/summary`);
  });
  it('cancels obsolete counts when the status changes without applying list filters to the inventory', () => {
    const fixture = repository(),
      view = fixture.componentInstance;
    view.filterSuite('root');
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([]));
    view.search({ status: 'ARCHIVED', q: 'buscar' });
    const first = http.expectOne(`${base}/test-cases/summary?status=ARCHIVED`);
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([]));
    view.search({ status: 'ALL', q: 'buscar' });
    expect(first.cancelled).toBe(true);
    const latest = http.expectOne(`${base}/test-cases/summary?status=ALL`);
    expect(latest.request.params.has('q')).toBe(false);
    latest.flush(envelope({ totalCases: 7, suites: [{ suiteId: null, totalCases: 7 }] }));
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([]));
    expect(view.summary()?.totalCases).toBe(7);
  });
  function quickRepository(fields: CustomField[] = []) {
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: [...(workspace.permissions ?? []), 'field.read'],
    });
    const fixture = repository([suite]);
    http.expectOne((r) => r.url.endsWith('/custom-fields')).flush(page(fields));
    fixture.componentInstance.filterSuite(suite.id);
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([]));
    fixture.detectChanges();
    return fixture;
  }
  it('creates consecutive cases in the selected suite with defaults and refreshes the counts', () => {
    const fixture = quickRepository(),
      view = fixture.componentInstance;
    view.quickTitle.setValue('  Entrar com senha  ');
    fixture.nativeElement
      .querySelector('.quick-case-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = http.expectOne(`${base}/test-cases`);
    expect(request.request.body).toEqual({ title: 'Entrar com senha', suiteId: suite.id });
    view.filterSuite('root');
    expect(view.suiteFilter).toBe(suite.id);
    request.flush(envelope({ ...testCase, suiteId: suite.id }));
    http
      .expectOne(`${base}/test-cases/summary`)
      .flush(envelope({ totalCases: 1, suites: [{ suiteId: suite.id, totalCases: 1 }] }));
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([testCase]));
    fixture.detectChanges();
    expect(view.quickTitle.value).toBe('');
    expect(view.creating()).toBe(false);
    expect(view.selected()).toBeNull();
    expect(view.suiteFilter).toBe(suite.id);
    expect(fixture.nativeElement.textContent).toContain('QA-1 criado em Login');
  });
  it('preserves the title on failure and uses the complete editor for mandatory custom fields', () => {
    const fixture = quickRepository(),
      view = fixture.componentInstance;
    view.quickTitle.setValue('Validar senha');
    view.addQuickCase();
    http
      .expectOne(`${base}/test-cases`)
      .flush({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    expect(view.quickTitle.value).toBe('Validar senha');
    expect(view.quickState.error()).not.toBe('');
    view.definitions.set([customField]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.quick-case-form')).toBeNull();
    view.create();
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(CaseEditor))
      .componentInstance as CaseEditor;
    expect(editor.form.get('suiteId')?.value).toBe(suite.id);
    expect(editor.form.get('title')?.value).toBe('Validar senha');
    expect(editor.definitions()).toEqual([customField]);
  });
  it('opens the association dialog directly with a fresh version and keeps the tree on screen', () => {
    const fixture = repository([suite], [testCase]);
    const button = fixture.nativeElement.querySelector(
      '[aria-label="Alterar suíte de QA-1"]',
    ) as HTMLButtonElement;
    button.click();
    http.expectOne(`${base}/test-cases/case-one`).flush(envelope({ ...testCase, version: 5 }));
    fixture.detectChanges();
    const detail = fixture.debugElement.query(By.directive(CaseDetail))
      .componentInstance as CaseDetail;
    expect(detail.item()?.version).toBe(5);
    expect(detail.dialog()?.mode).toBe('move');
    expect(fixture.nativeElement.querySelector('app-suite-tree')).not.toBeNull();
    detail.closed.emit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.case-title-link')).not.toBeNull();
  });
  it('prefills a new child suite from the current context and blocks creation in archived suites', () => {
    const fixture = repository([suite]),
      view = fixture.componentInstance;
    view.filterSuite(suite.id);
    http.expectOne((r) => r.url === `${base}/test-cases`).flush(page([]));
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.directive(SuitePanel))
      .componentInstance as SuitePanel;
    panel.edit();
    expect(panel.editor()?.fields.find((field) => field.key === 'parentSuiteId')?.value).toBe(
      suite.id,
    );
    panel.editor.set(null);
    view.suites.set([{ ...suite, archivedAt: time }]);
    fixture.detectChanges();
    expect(view.canCreateHere()).toBe(false);
    expect(fixture.nativeElement.querySelector('.repository-quick-create')).toBeNull();
  });
  it('accepts decimal numbers, zero and false for required fields without coercion', () => {
    expect(customValueError(customField, 0)).toBeNull();
    expect(customValueError(customField, 1.25)).toBeNull();
    expect(customValueError(customField, '1.25')).not.toBeNull();
    expect(customValueError(customField, Infinity)).not.toBeNull();
    expect(customValueError({ ...customField, type: 'BOOLEAN' }, false)).toBeNull();
    expect(customValueError({ ...customField, type: 'TEXT' }, '  ')).toEqual({ required: true });
    expect(customValueError({ ...customField, type: 'DATE' }, '2026-02-30')).not.toBeNull();
    expect(customValueError({ ...customField, type: 'DATE' }, '2024-02-29')).toBeNull();
    expect(
      customValueError(
        { ...customField, type: 'SINGLE_SELECT', options: [{ id: 'option-id', label: 'Opção' }] },
        'Opção',
      ),
    ).not.toBeNull();
    const fields = fieldForm(
      [customField, { ...customField, id: 'archived', archivedAt: time }],
      [{ fieldId: customField.id, value: 0 }],
    );
    expect(fieldValues(new FormGroup({ customFields: fields }))).toEqual([
      { fieldId: customField.id, value: 0 },
    ]);
  });
  it('limits JSON by UTF-8 bytes rather than character count', () => {
    expect(payloadFits({ title: 'a'.repeat(32000) })).toBe(true);
    expect(payloadFits({ title: 'á'.repeat(17000) })).toBe(false);
  });
});

describe('Suite tree inventory', () => {
  it('sums child counts once and guards malformed cycles', () => {
    const child = { ...suite, id: 'child', parentSuiteId: suite.id };
    const result = repositoryCounts(
      {
        totalCases: 5,
        suites: [
          { suiteId: null, totalCases: 1 },
          { suiteId: suite.id, totalCases: 1 },
          { suiteId: child.id, totalCases: 3 },
        ],
      },
      [suite, child],
    );
    expect(result.direct.get(null)).toBe(1);
    expect(result.branches.get(suite.id)).toBe(4);
    const cyclic = repositoryCounts(
      { totalCases: 1, suites: [{ suiteId: child.id, totalCases: 1 }] },
      [{ ...suite, parentSuiteId: child.id }, child],
    );
    expect(cyclic.branches.get(suite.id)).toBe(1);
  });
  it('finds nested suites with their ancestors even when the branch is collapsed', () => {
    const fixture = TestBed.createComponent(SuiteTree);
    fixture.componentRef.setInput('suites', [
      suite,
      { ...suite, id: 'child', name: 'Senha', parentSuiteId: suite.id },
    ]);
    const tree = fixture.componentInstance;
    tree.collapseAll();
    expect(tree.rows().map((row) => row.suite.id)).toEqual([suite.id]);
    tree.term.set('senha');
    expect(tree.rows().map((row) => row.suite.id)).toEqual([suite.id, 'child']);
    expect(tree.count(suite.id)).toBe('—');
    fixture.destroy();
  });
});

describe('Repository entry navigation', () => {
  let http: HttpTestingController, navigate: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  it('opens the only accessible project without an intermediate open button', () => {
    const fixture = TestBed.createComponent(TestRepositoryEntry);
    fixture.detectChanges();
    const request = http.expectOne((r) => r.url === '/api/v1/workspaces');
    expect(request.request.params.keys().sort()).toEqual(['page', 'size', 'sort']);
    request.flush(page([workspace, { ...workspace, id: 'suspended', status: 'SUSPENDED' }]));
    http
      .expectOne((r) => r.url === '/api/v1/workspaces/workspace-one/projects')
      .flush(page([project, { ...project, id: 'hidden', permissions: [] }]));
    expect(navigate).toHaveBeenCalledWith(
      ['/workspaces', workspace.id, 'projects', project.id, 'test-cases'],
      { replaceUrl: true },
    );
    fixture.destroy();
  });
  it('loads all workspace pages with valid parameters before choosing an active accessible workspace', () => {
    const fixture = TestBed.createComponent(TestRepositoryEntry);
    fixture.detectChanges();
    const first = http.expectOne((r) => r.url === '/api/v1/workspaces');
    expect(first.request.params.keys().sort()).toEqual(['page', 'size', 'sort']);
    first.flush(page([{ ...workspace, id: 'archived', status: 'ARCHIVED' }], 1, true));
    http.expectNone((r) => r.url.endsWith('/projects'));
    const second = http.expectOne(
      (r) => r.url === '/api/v1/workspaces' && r.params.get('page') === '2',
    );
    expect(second.request.params.has('status')).toBe(false);
    second.flush(
      page(
        [workspace, { ...workspace, id: 'no-project-read', permissions: ['workspace.read'] }],
        2,
      ),
    );
    http
      .expectOne((r) => r.url === '/api/v1/workspaces/workspace-one/projects')
      .flush(page([project]));
    expect(fixture.componentInstance.workspaces()).toEqual([workspace]);
    expect(navigate).toHaveBeenCalledWith(
      ['/workspaces', workspace.id, 'projects', project.id, 'test-cases'],
      { replaceUrl: true },
    );
    fixture.destroy();
  });
  it('uses the same valid workspace query when switching context inside the repository', () => {
    const fixture = TestBed.createComponent(RepositoryPicker);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('#repository-workspace').dispatchEvent(new Event('focus'));
    const request = http.expectOne((r) => r.url === '/api/v1/workspaces');
    expect(request.request.params.keys().sort()).toEqual(['page', 'size', 'sort']);
    request.flush(page([workspace, { ...workspace, id: 'suspended', status: 'SUSPENDED' }]));
    fixture.detectChanges();
    expect(fixture.componentInstance.workspaces()).toEqual([workspace]);
    fixture.destroy();
  });
  it('opens a chosen project from a card when several projects are available', () => {
    const fixture = TestBed.createComponent(TestRepositoryEntry);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/v1/workspaces').flush(page([workspace]));
    http
      .expectOne((r) => r.url.endsWith('/projects'))
      .flush(page([project, { ...project, id: 'second', key: 'MOBILE', name: 'Aplicativo' }]));
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    const cards = fixture.nativeElement.querySelectorAll('.repository-project-card');
    expect(cards).toHaveLength(2);
    cards[1].click();
    expect(navigate).toHaveBeenCalledWith(
      ['/workspaces', workspace.id, 'projects', 'second', 'test-cases'],
      { replaceUrl: true },
    );
    fixture.destroy();
  });
  it('revalidates the remembered project and falls back to selection after access is removed', () => {
    const history = TestBed.inject(RepositoryHistory);
    vi.spyOn(history, 'read').mockReturnValue({ workspaceId: workspace.id, projectId: project.id });
    const clear = vi.spyOn(history, 'clear');
    const fixture = TestBed.createComponent(TestRepositoryEntry);
    fixture.detectChanges();
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http.expectOne(base).flush({}, { status: 404, statusText: 'Not Found' });
    expect(clear).toHaveBeenCalledOnce();
    http.expectOne((r) => r.url === '/api/v1/workspaces').flush(page([]));
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Nenhum Workspace');
    fixture.destroy();
  });
  it('keeps network errors visible and retries the remembered project', () => {
    vi.spyOn(TestBed.inject(RepositoryHistory), 'read').mockReturnValue({
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const fixture = TestBed.createComponent(TestRepositoryEntry);
    fixture.detectChanges();
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http.expectOne(base).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('[role=alert] button').click();
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http.expectOne(base).flush(envelope(project));
    expect(navigate).toHaveBeenCalledOnce();
    fixture.destroy();
  });
  it('separates saved locations by user and ignores malformed storage', () => {
    const auth = TestBed.inject(AuthService);
    const user = vi.spyOn(auth, 'user').mockReturnValue({ id: 'history-test-a' } as never);
    const history = TestBed.inject(RepositoryHistory);
    const saved = {
      ...project,
      workspaceId: '11111111-1111-4111-8111-111111111111',
      id: '22222222-2222-4222-8222-222222222222',
    };
    try {
      history.remember(saved);
      expect(history.read()?.projectId).toBe(saved.id);
      user.mockReturnValue({ id: 'history-test-b' } as never);
      sessionStorage.setItem('lambdaquality.repository.history-test-b', '{broken');
      expect(history.read()).toBeNull();
      user.mockReturnValue({ id: 'history-test-a' } as never);
      expect(history.read()?.workspaceId).toBe(saved.workspaceId);
      history.clear();
      expect(history.read()).toBeNull();
    } finally {
      sessionStorage.removeItem('lambdaquality.repository.history-test-a');
      sessionStorage.removeItem('lambdaquality.repository.history-test-b');
    }
  });
});
