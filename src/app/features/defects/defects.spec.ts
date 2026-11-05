import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Project, roleCapabilities } from '../projects/project.models';
import { Attachment, Page, Workspace } from '../workspaces/workspace.models';
import { FormDialog } from '../workspaces/ui/form-dialog';
import { AppShell } from '../../shared/app-shell';
import { RunDetail } from '../execution/run-detail';
import { ExecutionRepositoryPanel } from '../execution/execution-repository';
import { RunCase, TestRun } from '../execution/execution.models';
import { DefectApi } from './defect-api.service';
import { Defect, DefectNavigation, DefectQuery, validExternalUrl } from './defect.models';
import { DefectDetail } from './defect-detail';
import { DefectHistoryApi } from './defect-history-api.service';
import { DefectRepository, DefectRepositoryPanel } from './defect-repository';
import { DefectAttachmentSelection } from './attachment-selection';
import { DefectView } from './defect-view';

const time = '2026-10-03T03:00:00Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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
const workspace: Workspace = {
  id: 'w',
  name: 'Equipe',
  slug: 'equipe',
  status: 'ACTIVE',
  ownerMemberId: 'owner',
  permissions: ['project.read'],
  createdAt: time,
  updatedAt: time,
};
const defect: Defect = {
  id: id(1),
  workspaceId: 'w',
  projectId: 'p',
  sequence: 1,
  humanId: 'QA-DEF-1',
  title: 'Login retorna erro',
  description: 'Erro ao autenticar',
  severity: 'CRITICAL',
  status: 'OPEN',
  testRunCaseId: null,
  testRunId: null,
  externalSystem: null,
  externalIssueId: null,
  externalUrl: null,
  version: 4,
  createdBy: 'user',
  createdAt: time,
  updatedAt: time,
  attachmentIds: [],
};
const run: TestRun = {
  id: id(2),
  workspaceId: 'w',
  projectId: 'p',
  testPlanId: null,
  milestoneId: null,
  environmentId: null,
  planNameSnapshot: null,
  milestoneSnapshot: null,
  environmentSnapshot: null,
  name: 'Regressão',
  source: 'MANUAL',
  externalRunRef: null,
  status: 'COMPLETED',
  version: 37,
  createdBy: 'user',
  createdAt: time,
  updatedAt: time,
  startedAt: time,
  finishedAt: time,
  summary: { total: 1, notTested: 0, passed: 0, failed: 1, blocked: 0, skipped: 0 },
};
const runCase: RunCase = {
  id: id(3),
  workspaceId: 'w',
  projectId: 'p',
  testRunId: run.id,
  testCaseId: id(4),
  position: 1,
  caseSequenceSnapshot: 2,
  humanIdSnapshot: 'QA-2',
  titleSnapshot: 'Autenticar',
  severitySnapshot: 'MAJOR',
  prioritySnapshot: 'HIGH',
  definitionSnapshot: {
    version: 12,
    suiteId: null,
    status: 'ACTIVE',
    description: 'Definição preservada',
    preconditions: null,
    postconditions: null,
    type: 'FUNCTIONAL',
    layer: 'E2E',
    behavior: null,
    automationStatus: 'MANUAL',
  },
  customFieldsSnapshot: [],
  tagsSnapshot: [],
  result: 'FAILED',
  executedBy: 'user',
  executedAt: time,
  comment: 'Erro 500',
  createdAt: time,
  updatedAt: time,
  steps: [],
};
const file: Attachment = {
  id: id(5),
  workspaceId: 'w',
  originalName: 'evidencia.txt',
  contentType: 'text/plain',
  sizeBytes: 20,
  checksum: 'abc',
  uploadedBy: 'user',
  createdAt: time,
};
const base = '/api/v1/workspaces/w/projects/p/defects';
const runBase = '/api/v1/workspaces/w/projects/p/test-runs';
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
const values = {
  title: defect.title,
  description: defect.description,
  severity: defect.severity,
  status: defect.status,
};
const nav = (changes: Partial<DefectNavigation> = {}): DefectNavigation => ({
  defectId: '',
  runId: '',
  runCaseId: '',
  testRunCaseId: '',
  key: '',
  ...changes,
});
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
let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
beforeEach(() => {
  params = new BehaviorSubject(convertToParamMap({ workspaceId: 'w', projectId: 'p' }));
  query = new BehaviorSubject(convertToParamMap({}));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      // Timeline integration is covered separately; the current backend does not expose it yet.
      { provide: DefectHistoryApi, useValue: { load: () => of(null) } },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: params, queryParamMap: query, snapshot: { data: { defects: true } } },
      },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  TestBed.inject(WorkspaceContext).selected.set(workspace);
});
afterEach(() => {
  try {
    http.verify({ ignoreCancelled: true });
  } finally {
    TestBed.resetTestingModule();
  }
});
function flushEnvironments() {
  for (const request of http.match((r) => r.url === '/api/v1/workspaces/w/projects/p/environments'))
    if (!request.cancelled) request.flush(page([]));
}

function panel(p = project, navigation = nav()) {
  const fixture = TestBed.createComponent(DefectRepositoryPanel);
  fixture.componentRef.setInput('project', p);
  fixture.componentRef.setInput('navigation', navigation);
  fixture.detectChanges();
  if (!fixture.componentInstance.navigationError()) {
    http.expectOne((r) => r.url === base && r.method === 'GET').flush(page([defect]));
    flushEnvironments();
  }
  return fixture;
}
function detail(p = project, initial = defect) {
  const fixture = TestBed.createComponent(DefectDetail);
  fixture.componentRef.setInput('project', p);
  fixture.componentRef.setInput('initial', initial);
  fixture.detectChanges();
  return fixture;
}
function failurePanel(
  status: TestRun['status'] = 'COMPLETED',
  result: RunCase['result'] = 'FAILED',
) {
  const fixture = panel(project, nav({ runId: run.id, runCaseId: runCase.id }));
  http.expectOne(`${runBase}/${run.id}`).flush(envelope({ ...run, status }));
  http
    .expectOne(`${runBase}/${run.id}/cases/${runCase.id}`)
    .flush(envelope({ ...runCase, result }));
  fixture.detectChanges();
  return fixture;
}

describe('Defect API contracts', () => {
  const contracts: [string, string, string, (a: DefectApi) => Observable<unknown>, unknown?][] = [
    [
      'list',
      'GET',
      '',
      (a) =>
        a.list('w', 'p', {
          page: 2,
          size: 20,
          sort: 'sequence,asc',
          q: 'Login',
          status: 'ALL',
          severity: 'CRITICAL',
          testRunCaseId: runCase.id,
        }),
    ],
    ['create', 'POST', '', (a) => a.create('w', 'p', { title: 'Falha' }), { title: 'Falha' }],
    [
      'from failure',
      'POST',
      '/from-failure',
      (a) => a.fromFailure('w', 'p', { testRunCaseId: runCase.id }),
      { testRunCaseId: runCase.id },
    ],
    ['get', 'GET', `/${defect.id}`, (a) => a.get('w', 'p', defect.id)],
    [
      'update',
      'PATCH',
      `/${defect.id}`,
      (a) => a.update('w', 'p', defect.id, { version: 4, status: 'OPEN', description: null }),
      { version: 4, status: 'OPEN', description: null },
    ],
    [
      'external',
      'POST',
      `/${defect.id}/external-link`,
      (a) =>
        a.linkExternal('w', 'p', defect.id, {
          version: 4,
          externalSystem: 'Jira',
          externalIssueId: 'QA-22',
          externalUrl: 'https://example.com/QA-22',
        }),
      {
        version: 4,
        externalSystem: 'Jira',
        externalIssueId: 'QA-22',
        externalUrl: 'https://example.com/QA-22',
      },
    ],
    [
      'remove external',
      'DELETE',
      `/${defect.id}/external-link`,
      (a) => a.unlinkExternal('w', 'p', defect.id, 4),
      { version: 4 },
    ],
    [
      'attachment',
      'POST',
      `/${defect.id}/attachments`,
      (a) => a.addAttachment('w', 'p', defect.id, file.id, 4),
      { version: 4, attachmentId: file.id },
    ],
    [
      'remove attachment',
      'DELETE',
      `/${defect.id}/attachments/${file.id}`,
      (a) => a.removeAttachment('w', 'p', defect.id, file.id, 4),
      { version: 4 },
    ],
  ];
  for (const [name, method, path, call, body] of contracts)
    it(name, () => {
      call(TestBed.inject(DefectApi)).subscribe();
      const req = http.expectOne((r) => r.url === base + path && r.method === method);
      expect(req.request.body ?? undefined).toEqual(body);
      if (name === 'list')
        expect(req.request.params.keys().sort()).toEqual([
          'page',
          'q',
          'severity',
          'size',
          'sort',
          'status',
          'testRunCaseId',
        ]);
      else expect(req.request.params.keys()).toEqual([]);
      req.flush(name === 'list' ? page([defect]) : envelope(defect));
    });
  it('whitelists list parameters and encodes scoped identifiers', () => {
    TestBed.inject(DefectApi)
      .list('w/a', 'p/b', { page: 1, size: 20, unexpected: 'no', q: '' } as DefectQuery)
      .subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/workspaces/w%2Fa/projects/p%2Fb/defects');
    expect(req.request.params.keys()).toEqual(['page', 'size']);
    req.flush(page([]));
  });
  it.each([403, 404])('revalidates this project on %i without retrying', (status) => {
    const refresh = vi.fn();
    TestBed.inject(ProjectContext).accessChanged.subscribe(refresh);
    TestBed.inject(DefectApi)
      .get('w', 'p', defect.id)
      .subscribe({ error: () => {} });
    http
      .expectOne(`${base}/${defect.id}`)
      .flush({ code: 'AUTH_FORBIDDEN' }, { status, statusText: 'Denied' });
    expect(refresh).toHaveBeenCalledWith({ workspaceId: 'w', projectId: 'p' });
  });
});

describe('Defect creation and origin', () => {
  it('creates an independent defect with exact fields and server version', () => {
    const f = panel();
    const c = f.componentInstance;
    c.create();
    c.save({ values, form: form(values), attachmentIds: [] });
    const req = http.expectOne({ method: 'POST', url: base });
    expect(req.request.body).toEqual({
      title: defect.title,
      description: defect.description,
      severity: defect.severity,
    });
    req.flush(envelope({ ...defect, version: 1 }));
    expect(c.selected()?.version).toBe(1);
    http.expectOne((r) => r.url === base).flush(page([defect]));
  });
  it.each(['IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const)(
    'creates from a FAILED copy in %s without writing run version or snapshots',
    (status) => {
      const c = failurePanel(status).componentInstance;
      c.create(true);
      const inherited = {
        title: runCase.titleSnapshot,
        description: runCase.comment,
        severity: runCase.severitySnapshot,
      };
      c.save({ values: inherited, form: form(inherited), attachmentIds: [] });
      const req = http.expectOne({ method: 'POST', url: `${base}/from-failure` });
      expect(req.request.body).toEqual({ testRunCaseId: runCase.id });
      req.flush(envelope({ ...defect, testRunCaseId: runCase.id, testRunId: run.id, version: 1 }));
      http.expectOne((r) => r.url === base).flush(page([defect]));
      expect(c.origin()?.run.version).toBe(37);
      expect(c.origin()?.item.result).toBe('FAILED');
    },
  );
  it('sends only overridden failure metadata, including explicit null to clear description', () => {
    const c = failurePanel().componentInstance;
    c.create(true);
    c.save({
      values: { title: 'Personalizado', description: '', severity: runCase.severitySnapshot },
      form: form(values),
      attachmentIds: [],
    });
    const req = http.expectOne(`${base}/from-failure`);
    expect(req.request.body).toEqual({
      testRunCaseId: runCase.id,
      title: 'Personalizado',
      description: null,
    });
    req.flush(envelope(defect));
    http.expectOne((r) => r.url === base).flush(page([defect]));
  });
  it('blocks a non-failed origin', () => {
    const c = failurePanel('COMPLETED', 'PASSED').componentInstance;
    c.create(true);
    expect(c.creating()).toBeNull();
  });
  it('preserves the draft and blocks submit when refreshed origin no longer failed', () => {
    const f = failurePanel();
    const c = f.componentInstance;
    c.create(true);
    f.detectChanges();
    flushEnvironments();
    f.detectChanges();
    const editor = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    editor.form().get('title')!.setValue('Meu rascunho');
    c.loadOrigin();
    http.expectOne(`${runBase}/${run.id}`).flush(envelope(run));
    http
      .expectOne(`${runBase}/${run.id}/cases/${runCase.id}`)
      .flush(envelope({ ...runCase, result: 'PASSED' }));
    f.detectChanges();
    editor.submit();
    expect(editor.form().get('title')?.value).toBe('Meu rascunho');
    http.expectNone((r) => r.method === 'POST');
  });
  it('does not consult runs or accept a failure without testrun.read', () => {
    const c = panel(
      { ...project, permissions: ['defect.read', 'defect.manage'] },
      nav({ runId: run.id, runCaseId: runCase.id }),
    ).componentInstance;
    expect(c.origin()).toBeNull();
    c.create(true);
    expect(c.creating()).toBeNull();
    http.expectNone((r) => r.url.startsWith(runBase));
  });
  it.each([
    nav({ runId: 'bad', runCaseId: runCase.id }),
    nav({ runId: run.id }),
    nav({ testRunCaseId: runCase.id }),
  ])('rejects invalid or unauthorized navigation before querying', (navigation) => {
    const f = panel({ ...project, permissions: ['defect.read'] }, navigation);
    expect(f.componentInstance.navigationError()).toBeTruthy();
    http.expectNone((r) => r.url === base);
  });
  it('rejects a response for an origin from another project', () => {
    const f = panel(project, nav({ runId: run.id, runCaseId: runCase.id }));
    http.expectOne(`${runBase}/${run.id}`).flush(envelope(run));
    http
      .expectOne(`${runBase}/${run.id}/cases/${runCase.id}`)
      .flush(envelope({ ...runCase, projectId: 'other' }));
    expect(f.componentInstance.origin()).toBeNull();
    expect(f.componentInstance.originState.error()).toBeTruthy();
  });
  it('filters by copy ID with severity and default sequence sort', () => {
    const f = TestBed.createComponent(DefectRepositoryPanel);
    f.componentRef.setInput('project', project);
    f.componentRef.setInput('navigation', nav({ testRunCaseId: runCase.id }));
    f.detectChanges();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('testRunCaseId')).toBe(runCase.id);
    expect(req.request.params.get('sort')).toBe('sequence,asc');
    req.flush(page([]));
    f.componentInstance.severityFilter = 'MAJOR';
    flushEnvironments();
    f.componentInstance.search({ q: 'Erro', status: 'CLOSED' });
    const search = http.expectOne((r) => r.url === base);
    expect(search.request.params.get('severity')).toBe('MAJOR');
    expect(search.request.params.get('testRunCaseId')).toBe(runCase.id);
    search.flush(page([]));
  });
  it('blocks repeat after an uncertain creation until the list is consulted', () => {
    const c = panel().componentInstance;
    c.create();
    const event = { values, form: form(values), attachmentIds: [] };
    c.save(event);
    http.expectOne(base).flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    c.save(event);
    expect(c.createState.blocked()).toBe(true);
    http.expectNone((r) => r.method === 'POST');
    c.closeCreation();
    const read = http.expectOne((r) => r.url === base);
    c.create();
    expect(c.creating()).toBeNull();
    read.flush(page([defect]));
    c.create();
    expect(c.creating()).toBeTruthy();
  });
  it('enforces UTF-8 byte size without sending oversized JSON', () => {
    const c = panel().componentInstance;
    c.create();
    c.save({
      values: { ...values, description: '😀'.repeat(9000) },
      form: form(values),
      attachmentIds: [],
    });
    expect(c.createState.error()).toContain('32 KiB');
    http.expectNone((r) => r.method === 'POST');
  });
  it('requires attachment.read and distinct IDs when creating with files', () => {
    const c = panel().componentInstance;
    c.create();
    const event = { values, form: form(values), attachmentIds: [file.id] };
    c.save(event);
    http.expectNone((r) => r.method === 'POST');
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['attachment.read'],
    });
    c.save({ ...event, attachmentIds: [file.id, file.id] });
    http.expectNone((r) => r.method === 'POST');
    c.save(event);
    const req = http.expectOne(base);
    expect(req.request.body.attachmentIds).toEqual([file.id]);
    req.flush(envelope(defect));
    http.expectOne((r) => r.url === base).flush(page([]));
    flushEnvironments();
  });
});

describe('Defect details, conflicts and private files', () => {
  it('preserves the comment through a version conflict and submits only after reviewing the current state', () => {
    TestBed.inject(DefectHistoryApi).load = () => of([]);
    const f = detail();
    const c = f.componentInstance;
    c.updateActivity();
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.form().get('comment')!.setValue('Minha investigação.');
    dialog.form().get('status')!.setValue('IN_PROGRESS');
    dialog.submit();
    http
      .expectOne(`${base}/${defect.id}`)
      .flush(
        { code: 'DEFECT_VERSION_CONFLICT', requestId: 'activity-conflict' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(c.state.blocked()).toBe(true);
    expect(c.state.error()).toContain('activity-conflict');
    dialog.submit();
    http.expectNone((r) => r.method === 'PATCH');
    c.reload();
    http.expectOne(`${base}/${defect.id}`).flush(envelope({ ...defect, version: 7 }));
    expect(dialog.form().get('comment')!.value).toBe('Minha investigação.');
    c.review();
    f.detectChanges();
    dialog.submit();
    const retry = http.expectOne(`${base}/${defect.id}`);
    expect(retry.request.body).toEqual({
      version: 7,
      status: 'IN_PROGRESS',
      comment: 'Minha investigação.',
    });
    retry.flush(envelope({ ...defect, version: 8, status: 'IN_PROGRESS' }));
  });
  it('opens a focused status editor from Atualizar defeito and saves only changed fields', () => {
    const f = detail();
    const c = f.componentInstance;
    const button = Array.from(f.nativeElement.querySelectorAll('button')).find(
      (b: any) => b.textContent.trim() === 'Atualizar defeito',
    ) as HTMLButtonElement;
    button.click();
    f.detectChanges();
    expect(c.editor()?.mode).toBe('activity');
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    expect(dialog.form().get('comment')?.disabled).toBe(true);
    dialog.submit();
    expect(c.state.error()).toContain('Altere a situação');
    http.expectNone((r) => r.method === 'PATCH');
    dialog.form().get('status')!.setValue('IN_PROGRESS');
    dialog.submit();
    const update = http.expectOne(`${base}/${defect.id}`);
    expect(update.request.body).toEqual({ version: 4, status: 'IN_PROGRESS' });
    update.flush(envelope({ ...defect, status: 'IN_PROGRESS', version: 5 }));
    expect(c.item().status).toBe('IN_PROGRESS');
    expect(c.editor()).toBeNull();
  });
  it('prepares a comment-only update and an atomic comment/status update for the additive API', () => {
    const f = detail();
    const c = f.componentInstance;
    c.historyAvailable(true);
    c.updateActivity();
    const draft = { status: 'OPEN', comment: '  Investigando o erro 500.  ' };
    c.save({ values: draft, form: form(draft) });
    const first = http.expectOne(`${base}/${defect.id}`);
    expect(first.request.body).toEqual({ version: 4, comment: 'Investigando o erro 500.' });
    first.flush(envelope({ ...defect, version: 5 }));
    c.updateActivity();
    const next = { status: 'RESOLVED', comment: 'Correção publicada.' };
    c.save({ values: next, form: form(next) });
    const second = http.expectOne(`${base}/${defect.id}`);
    expect(second.request.body).toEqual({
      version: 5,
      status: 'RESOLVED',
      comment: 'Correção publicada.',
    });
    second.flush(envelope({ ...defect, status: 'RESOLVED', version: 6 }));
  });
  it('does not drop a comment draft if history access becomes unavailable', () => {
    const c = detail().componentInstance;
    c.historyAvailable(true);
    c.updateActivity();
    c.historyAvailable(false);
    const draft = { status: 'RESOLVED', comment: 'Minha observação' };
    c.save({ values: draft, form: form(draft) });
    http.expectNone((r) => r.method === 'PATCH');
    expect(c.state.error()).toContain('antes de salvar seu comentário');
  });
  it('does not expose the update action to readers or archived projects', () => {
    for (const p of [
      { ...project, permissions: ['defect.read'] },
      { ...project, status: 'ARCHIVED' as const },
    ]) {
      const f = detail(p);
      f.componentInstance.updateActivity();
      expect(f.componentInstance.editor()).toBeNull();
      expect(
        Array.from(f.nativeElement.querySelectorAll('button')).some(
          (b: any) => b.textContent.trim() === 'Atualizar defeito',
        ),
      ).toBe(false);
      f.destroy();
    }
  });
  it('keeps the actual dialog draft through conflict, then uses reviewed server version', () => {
    const f = detail();
    const c = f.componentInstance;
    c.edit();
    flushEnvironments();
    f.detectChanges();
    const editor = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    editor.form().get('title')!.setValue('Minha alteração');
    editor.form().get('status')!.setValue('RESOLVED');
    editor.submit();
    const first = http.expectOne(`${base}/${defect.id}`);
    expect(first.request.body.version).toBe(4);
    expect(Object.keys(first.request.body).sort()).toEqual([
      'description',
      'severity',
      'status',
      'title',
      'version',
    ]);
    first.flush(
      { code: 'DEFECT_VERSION_CONFLICT', requestId: 'conflict-r' },
      { status: 409, statusText: 'Conflict' },
    );
    editor.submit();
    http.expectNone((r) => r.method === 'PATCH');
    c.reload();
    http
      .expectOne(`${base}/${defect.id}`)
      .flush(envelope({ ...defect, title: 'Edição de outra pessoa', version: 9 }));
    f.detectChanges();
    expect(c.item().version).toBe(4);
    expect(editor.form().get('title')!.value).toBe('Minha alteração');
    expect(f.nativeElement.textContent).toContain('Edição de outra pessoa');
    editor.submit();
    http.expectNone((r) => r.method === 'PATCH');
    c.review();
    f.detectChanges();
    editor.submit();
    const retry = http.expectOne(`${base}/${defect.id}`);
    expect(retry.request.body).toEqual({
      version: 9,
      title: 'Minha alteração',
      description: defect.description,
      severity: defect.severity,
      status: 'RESOLVED',
    });
    retry.flush(envelope({ ...defect, title: 'Minha alteração', status: 'RESOLVED', version: 17 }));
    expect(c.item().version).toBe(17);
  });
  it('uses returned version for no-op binding removal and external reference removal', () => {
    const c = detail().componentInstance;
    c.requestRemoval('attachment', file.id);
    c.remove();
    http.expectOne(`${base}/${defect.id}/attachments/${file.id}`).flush(envelope(defect));
    expect(c.item().version).toBe(4);
    c.requestRemoval('external');
    c.remove();
    const req = http.expectOne(`${base}/${defect.id}/external-link`);
    expect(req.request.body).toEqual({ version: 4 });
    req.flush(envelope(defect));
    expect(c.item().version).toBe(4);
  });
  it.each(['ARCHIVED', 'READ_ONLY'] as const)('blocks edits and removals for %s', (mode) => {
    const p =
      mode === 'ARCHIVED'
        ? { ...project, status: 'ARCHIVED' as const }
        : { ...project, permissions: ['defect.read'] };
    const f = detail(p, { ...defect, attachmentIds: [file.id] });
    const c = f.componentInstance;
    c.edit();
    flushEnvironments();
    c.external();
    c.removeById();
    c.requestRemoval('attachment', file.id);
    c.attach(file);
    expect(c.editor()).toBeNull();
    expect(c.confirm()).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Baixar anexo');
    http.expectNone((r) => r.method !== 'GET');
  });
  it('removes a historical binding by ID without attachment.read or attachment.delete', () => {
    const c = detail({
      ...project,
      permissions: ['defect.read', 'defect.manage'],
    }).componentInstance;
    c.removeById();
    c.save({ values: { attachmentId: file.id }, form: form({ attachmentId: file.id }) });
    const req = http.expectOne(`${base}/${defect.id}/attachments/${file.id}`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ version: 4 });
    req.flush(envelope({ ...defect, version: 5 }));
    http.expectNone((r) => r.url === '/api/v1/workspaces/w/attachments/' + file.id);
  });
  it('queries only private metadata and uses authenticated blob download with attachment.read', () => {
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['attachment.read'],
    });
    const f = detail(project, { ...defect, attachmentIds: [file.id] });
    const c = f.componentInstance;
    http.expectOne('/api/v1/workspaces/w/attachments/' + file.id).flush(envelope(file));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain(file.originalName);
    c.download(file.id);
    const req = http.expectOne('/api/v1/workspaces/w/attachments/' + file.id + '/download');
    expect(req.request.responseType).toBe('blob');
    req.flush(null);
  });
  it('does not read or download metadata when only defect.read is granted', () => {
    const f = detail(
      { ...project, permissions: ['defect.read'] },
      { ...defect, attachmentIds: [file.id], testRunId: run.id, testRunCaseId: runCase.id },
    );
    f.componentInstance.download(file.id);
    expect(f.nativeElement.textContent).toContain(file.id);
    expect(f.nativeElement.textContent).not.toContain('Abrir caso de origem');
    http.expectNone((r) => r.url.includes('/attachments/'));
  });
  it('rejects duplicate, foreign-workspace and over-limit bindings', () => {
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['attachment.read'],
    });
    const c = detail().componentInstance;
    c.attach({ ...file, workspaceId: 'other' });
    c.item.set({ ...defect, attachmentIds: [file.id] });
    c.attach(file);
    c.item.set({ ...defect, attachmentIds: Array.from({ length: 100 }, (_, i) => id(100 + i)) });
    c.attach(file);
    http.expectNone((r) => r.method === 'POST');
  });
  it('sends external URL unchanged and validates it before the request', () => {
    const c = detail().componentInstance;
    c.external();
    const bad = {
      externalSystem: 'Jira',
      externalIssueId: 'QA-8',
      externalUrl: ' https://example.com/QA-8',
    };
    const draft = form(bad);
    c.save({ values: bad, form: draft });
    expect(draft.get('externalUrl')!.errors?.['server']).toBeTruthy();
    http.expectNone((r) => r.method === 'POST');
    const valid = {
      ...bad,
      externalSystem: ' Jira ',
      externalIssueId: ' QA-8 ',
      externalUrl: 'https://example.com/QA-8?q=a%20b',
    };
    c.save({ values: valid, form: form(valid) });
    const req = http.expectOne(`${base}/${defect.id}/external-link`);
    expect(req.request.body).toEqual({
      ...valid,
      version: 4,
      externalSystem: 'Jira',
      externalIssueId: 'QA-8',
    });
    req.flush(envelope({ ...defect, version: 5 }));
  });
  it('serializes writes and honors Retry-After', () => {
    const c = detail().componentInstance;
    c.edit();
    flushEnvironments();
    const event = { values, form: form(values) };
    c.save(event);
    c.save(event);
    const req = http.expectOne(`${base}/${defect.id}`);
    req.flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Slow down', headers: new HttpHeaders({ 'Retry-After': '3' }) },
    );
    c.save(event);
    expect(c.state.wait()).toBe(3);
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('retains errors and drafts after failed reload during conflict', () => {
    const c = detail().componentInstance;
    c.edit();
    flushEnvironments();
    c.save({ values, form: form(values) });
    http
      .expectOne(`${base}/${defect.id}`)
      .flush({ code: 'DEFECT_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    c.reload();
    http
      .expectOne(`${base}/${defect.id}`)
      .flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    c.review();
    expect(c.state.blocked()).toBe(true);
    expect(c.read.error()).toBeTruthy();
    expect(c.editor()).toBeTruthy();
  });
});

describe('Defect navigation and paginated attachment selection', () => {
  it('cancels scoped requests and clears drafts when the project changes', () => {
    const f = TestBed.createComponent(DefectRepository);
    http.expectOne('/api/v1/workspaces/w').flush(envelope(workspace));
    http.expectOne('/api/v1/workspaces/w/projects/p').flush(envelope(project));
    f.detectChanges();
    const previous = http.expectOne((r) => r.url === base);
    params.next(convertToParamMap({ workspaceId: 'new', projectId: 'new-p' }));
    f.detectChanges();
    expect(previous.cancelled).toBe(true);
    expect(TestBed.inject(ProjectContext).selected()).toBeNull();
    f.destroy();
    expect(http.expectOne('/api/v1/workspaces/new').cancelled).toBe(true);
  });
  it('recreates the panel when origin query parameters change', () => {
    const f = TestBed.createComponent(DefectRepository);
    http.expectOne('/api/v1/workspaces/w').flush(envelope(workspace));
    http.expectOne('/api/v1/workspaces/w/projects/p').flush(envelope(project));
    f.detectChanges();
    http.expectOne((r) => r.url === base).flush(page([]));
    flushEnvironments();
    const old = f.debugElement.query(By.directive(DefectRepositoryPanel))
      .componentInstance as DefectRepositoryPanel;
    old.create();
    f.detectChanges();
    flushEnvironments();
    query.next(convertToParamMap({ fromRunId: run.id, fromRunCaseId: runCase.id }));
    f.detectChanges();
    const current = f.debugElement.query(By.directive(DefectRepositoryPanel))
      .componentInstance as DefectRepositoryPanel;
    expect(current).not.toBe(old);
    expect(current.creating()).toBeNull();
    http.expectOne((r) => r.url === base).flush(page([]));
    flushEnvironments();
    http.expectOne(`${runBase}/${run.id}`).flush(envelope(run));
    http.expectOne(`${runBase}/${run.id}/cases/${runCase.id}`).flush(envelope(runCase));
  });
  it('preserves distinct selection across pages and caps it at 100', () => {
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['attachment.read'],
    });
    const f = TestBed.createComponent(DefectAttachmentSelection);
    f.componentRef.setInput('workspaceId', 'w');
    f.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/workspaces/w/attachments')
      .flush(page([file], 1, true));
    const c = f.componentInstance;
    c.changed.subscribe((ids) => f.componentRef.setInput('selected', ids));
    c.choose(file);
    f.detectChanges();
    c.list.page(2);
    const req = http.expectOne((r) => r.url === '/api/v1/workspaces/w/attachments');
    expect(req.request.params.get('page')).toBe('2');
    const second = { ...file, id: id(6) };
    req.flush(page([second], 2));
    c.choose(second);
    f.detectChanges();
    expect(c.selected()).toEqual([file.id, second.id]);
    f.componentRef.setInput(
      'selected',
      Array.from({ length: 100 }, (_, i) => id(i + 100)),
    );
    f.detectChanges();
    c.choose(file);
    expect(c.selected()).toHaveLength(100);
  });
});

describe('Manual external URL', () => {
  it.each([
    'javascript:alert(1)',
    'ftp://example.com/a',
    '/relative',
    'https://user:pass@example.com/a',
    'https://example.com\\evil',
    'https://example.com/a b',
    ' https://example.com',
    'https://example.com/\n',
    'https://example.com/\u007f',
    'https://example.com/' + 'a'.repeat(2048),
  ])('rejects %s', (value) => expect(validExternalUrl(value)).toBe(false));
  it.each([
    'https://example.com/QA-1',
    'http://localhost:3000/issues/1',
    'https://example.com/a%20b',
  ])('accepts %s', (value) => expect(validExternalUrl(value)).toBe(true));
  it('renders unsafe server references as text and safe links with noreferrer', () => {
    const f = TestBed.createComponent(DefectView);
    f.componentRef.setInput('item', {
      ...defect,
      externalSystem: 'Jira',
      externalIssueId: 'QA-1',
      externalUrl: 'javascript:alert(1)',
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('a')).toBeNull();
    f.componentRef.setInput('item', {
      ...defect,
      externalSystem: 'Jira',
      externalIssueId: 'QA-1',
      externalUrl: 'https://example.com/QA-1',
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('Execution entry and module navigation', () => {
  function loadRun(p = project, result: RunCase['result'] = 'FAILED') {
    const f = TestBed.createComponent(RunDetail);
    f.componentRef.setInput('project', p);
    f.componentRef.setInput('initial', run);
    f.componentRef.setInput('entryCaseId', runCase.id);
    f.detectChanges();
    http.expectOne(`${runBase}/${run.id}`).flush(envelope(run));
    http.expectOne((r) => r.url === `${runBase}/${run.id}/cases`).flush(page([runCase]));
    http.expectOne((r) => r.url === `${runBase}/${run.id}/comments`).flush(page([]));
    http
      .expectOne(`${runBase}/${run.id}/cases/${runCase.id}`)
      .flush(envelope({ ...runCase, result }));
    f.detectChanges();
    return f;
  }
  it('opens the origin run directly and selects the copied case', () => {
    const f = TestBed.createComponent(ExecutionRepositoryPanel);
    f.componentRef.setInput('project', project);
    f.componentRef.setInput('entryRunId', run.id);
    f.componentRef.setInput('entryCaseId', runCase.id);
    f.detectChanges();
    http.expectOne(`${runBase}/${run.id}`).flush(envelope(run));
    f.detectChanges();
    http.expectOne(`${runBase}/${run.id}`).flush(envelope(run));
    http.expectOne((r) => r.url === `${runBase}/${run.id}/cases`).flush(page([runCase]));
    http.expectOne((r) => r.url === `${runBase}/${run.id}/comments`).flush(page([]));
    http.expectOne(`${runBase}/${run.id}/cases/${runCase.id}`).flush(envelope(runCase));
    f.detectChanges();
    expect(f.componentInstance.tab()).toBe('runs');
    expect(f.debugElement.query(By.directive(RunDetail)).componentInstance.selected().id).toBe(
      runCase.id,
    );
    http.expectNone((r) => r.url.endsWith('/test-plans'));
  });
  it('offers failure creation on a completed run without execute permission', () => {
    const f = loadRun({
      ...project,
      permissions: ['testrun.read', 'defect.read', 'defect.manage'],
    });
    const link = Array.from(
      f.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    ).find((a) => a.textContent?.trim() === 'Criar defeito desta falha')!;
    expect(link.getAttribute('href')).toContain(`fromRunCaseId=${runCase.id}`);
    expect(link.getAttribute('href')).toContain(`testRunCaseId=${runCase.id}`);
    expect(link.getAttribute('href')).not.toContain(runCase.testCaseId);
    expect(f.componentInstance.run().version).toBe(37);
  });
  it.each(['PASSED', 'VIEWER'] as const)(
    'keeps the history link and omits creation for %s',
    (mode) => {
      const f =
        mode === 'VIEWER'
          ? loadRun({ ...project, permissions: ['testrun.read', 'defect.read'] })
          : loadRun(project, 'PASSED');
      expect(f.nativeElement.textContent).not.toContain('Criar defeito desta falha');
      expect(f.nativeElement.textContent).toContain('Ver defeitos deste caso');
    },
  );
  it.each(['defects', 'execution'] as const)(
    'marks the correct sidebar module with %s query links',
    (module) => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'url', 'get').mockReturnValue(
        `/workspaces/w/projects/p/${module}?runId=${run.id}`,
      );
      const f = TestBed.createComponent(AppShell);
      f.detectChanges();
      const c = f.componentInstance;
      expect(c.isProjectSection()).toBe(false);
      expect(c.isWorkspaceSection()).toBe(false);
      expect(c.isDefectSection()).toBe(module === 'defects');
      expect(c.isExecutionSection()).toBe(module === 'execution');
      const current = f.nativeElement.querySelector('[aria-current="page"]');
      expect(current.textContent.trim()).toBe(
        module === 'defects' ? 'Defeitos' : 'Planos e execuções',
      );
    },
  );
  it('associates the title label with one unique input', () => {
    const f = detail();
    f.componentInstance.edit();
    flushEnvironments();
    f.detectChanges();
    const label = f.nativeElement.querySelector('label[for="editor-title"]') as HTMLLabelElement;
    expect(label.control?.tagName).toBe('INPUT');
    expect(f.nativeElement.querySelectorAll('#editor-title').length).toBe(1);
  });
});

describe('Defect environment associations', () => {
  const environment = {
    id: id(81),
    workspaceId: 'w',
    projectId: 'p',
    name: 'Homologação atual',
    category: 'HOMOLOGATION' as const,
    description: null,
    active: true,
    createdAt: time,
    updatedAt: time,
    deletedAt: null,
  };
  it('loads every environment page and offers only active assignments', () => {
    const f = detail();
    f.componentInstance.edit();
    const endpoint = '/api/v1/workspaces/w/projects/p/environments';
    http.expectOne((r) => r.url === endpoint).flush(page([environment], 1, true));
    http
      .expectOne((r) => r.url === endpoint && r.params.get('page') === '2')
      .flush(page([{ ...environment, id: id(82), name: 'Inativo', active: false }], 2));
    f.detectChanges();
    const options = f.componentInstance
      .editor()!
      .fields.find((field) => field.key === 'environmentId')!.options!;
    expect(
      options.some(
        (option) => option.value === environment.id && option.label.includes('Homologação'),
      ),
    ).toBe(true);
    expect(options.some((option) => option.value === id(82))).toBe(false);
  });
  it.each([
    ['__INHERIT__', undefined],
    ['', null],
    [id(81), id(81)],
  ])('sends the correct failure association for %s', (selection, expected) => {
    const f = failurePanel();
    const c = f.componentInstance;
    c.create(true);
    const data = {
      title: runCase.titleSnapshot,
      description: runCase.comment,
      severity: runCase.severitySnapshot,
      environmentId: selection,
    };
    c.save({ values: data, form: form(data), attachmentIds: [] });
    const request = http.expectOne(`${base}/from-failure`);
    expect(request.request.body.environmentId).toBe(expected);
    expect('environmentId' in request.request.body).toBe(expected !== undefined);
    request.flush(envelope({ ...defect, testRunCaseId: runCase.id }));
    http.expectOne((r) => r.url === base).flush(page([defect]));
  });
  it.each([
    ['__KEEP__', undefined],
    ['', null],
    [id(81), id(81)],
  ])('preserves historical data or changes it explicitly with %s', (selection, expected) => {
    const historical = {
      ...defect,
      environmentId: environment.id,
      environmentSnapshot: { name: 'Nome histórico', category: 'PRODUCTION' as const },
    };
    const f = detail(project, historical);
    const c = f.componentInstance;
    c.edit();
    http.expectOne((r) => r.url.endsWith('/environments')).flush(page([environment]));
    f.detectChanges();
    const selector = c.editor()!.fields.find((field) => field.key === 'environmentId')!;
    expect(selector.options![0].label).toContain('Nome histórico');
    expect(f.nativeElement.textContent).toContain('Produção');
    const data = { ...values, environmentId: selection };
    c.save({ values: data, form: form(data) });
    const request = http.expectOne(`${base}/${defect.id}`);
    expect(request.request.body.environmentId).toBe(expected);
    expect('environmentId' in request.request.body).toBe(expected !== undefined);
    request.flush(envelope({ ...historical, version: 5 }));
  });
  it('keeps a defect draft after an environment catalog failure and retry', () => {
    const f = detail();
    const c = f.componentInstance;
    c.edit();
    f.detectChanges();
    let dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.form().get('title')!.setValue('Rascunho preservado');
    http
      .expectOne((r) => r.url.endsWith('/environments'))
      .flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    dialog.submit();
    http.expectNone((r) => r.method === 'PATCH');
    c.loadEnvironments();
    http.expectOne((r) => r.url.endsWith('/environments')).flush(page([environment]));
    f.detectChanges();
    dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    expect(dialog.form().get('title')!.value).toBe('Rascunho preservado');
  });
  it('forwards an environment filter including historical environment ids', () => {
    TestBed.inject(DefectApi)
      .list('w', 'p', { environmentId: id(99), status: 'ALL' })
      .subscribe();
    const request = http.expectOne((r) => r.url === base);
    expect(request.request.params.get('environmentId')).toBe(id(99));
    request.flush(page([]));
  });
});
