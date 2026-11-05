import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormGroup, FormControl } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { AppShell } from '../../shared/app-shell';
import { Workspace, Page, Attachment } from '../workspaces/workspace.models';
import { Project, roleCapabilities } from '../projects/project.models';
import { FormDialog } from '../workspaces/ui/form-dialog';
import { GovernanceApi } from './governance-api.service';
import { GovernanceDetail } from './governance-detail';
import { GoalActions } from './goal-actions';
import { GovernanceCreate } from './governance-create';
import { GovernanceRepository, GovernancePanel } from './governance-repository';
import { GovernanceDashboard } from './governance-dashboard';
import { FrameworkDefinition } from './framework-definition';
import { SectionTree } from './section-tree';
import { FrameworkTracking, FrameworkAssessment } from './framework-tracking';
import { FrameworkProgress, ProgressSummary, progressLabel } from './framework-progress.models';
import { AssessmentControls } from './assessment-controls';
import { GovernanceEvidence } from './governance-evidence';
import { GovernanceCollection } from './governance-collection';
import {
  Framework,
  Section,
  Control,
  Assessment,
  AssessedControl,
  Goal,
  Action,
  Evidence,
  Metrics,
  Dashboard,
  Kind,
  RecordItem,
  Query,
  GoalBody,
  validSectionMove,
  sectionDescendants,
} from './governance.models';
import { recordBody, emptyCatalogs } from './governance-fields';

const time = '2026-10-03T03:00:00Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workspace: Workspace = {
  id: 'w',
  name: 'Equipe de Qualidade',
  slug: 'qualidade',
  status: 'ACTIVE',
  ownerMemberId: 'owner',
  permissions: ['governance.read', 'governance.assess', 'governance.manage'],
  createdAt: time,
  updatedAt: time,
};
const project: Project = {
  id: id(8),
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
const framework: Framework = {
  id: id(1),
  workspaceId: 'w',
  code: 'QUALIDADE',
  name: 'Qualidade interna',
  versionLabel: '1.0',
  description: 'Descrição preservada',
  status: 'ACTIVE',
  version: 7,
  createdAt: time,
  updatedAt: time,
};
const section: Section = {
  id: id(2),
  workspaceId: 'w',
  frameworkId: framework.id,
  parentSectionId: null,
  code: 'PROCESSO',
  name: 'Processo de qualidade',
  description: 'Seção preservada',
  position: 1,
};
const control: Control = {
  creationOrder: 1,
  id: id(3),
  workspaceId: 'w',
  frameworkId: framework.id,
  sectionId: section.id,
  code: 'EVIDENCIA',
  title: 'Registrar evidências',
  description: 'Preservar resultados da revisão',
  weight: 3,
  active: true,
};
const assessment: Assessment = {
  id: id(4),
  workspaceId: 'w',
  frameworkId: framework.id,
  name: 'Avaliação de outubro',
  status: 'IN_PROGRESS',
  assessmentDate: '2026-10-03',
  frameworkSnapshot: {
    id: framework.id,
    code: framework.code,
    name: framework.name,
    versionLabel: framework.versionLabel,
    description: framework.description,
    version: 6,
    sections: [section],
  },
  closedAt: null,
  createdBy: 'user',
  version: 9,
  createdAt: time,
  updatedAt: time,
  indicatorType: 'INTERNAL',
  index: { value: 0, numerator: 0, denominator: 3, assessedControls: 0, totalControls: 1 },
};
const assessed: AssessedControl = {
  id: id(5),
  workspaceId: 'w',
  frameworkId: framework.id,
  assessmentId: assessment.id,
  controlId: control.id,
  controlSnapshot: {
    id: control.id,
    sectionId: section.id,
    code: control.code,
    title: control.title,
    description: control.description,
    weight: 3,
    sectionPath: [{ id: section.id, code: section.code, name: section.name }],
  },
  status: 'NOT_ASSESSED',
  score: null,
  justification: null,
  assessedBy: null,
  assessedAt: null,
};
const goal: Goal = {
  actionProgress: {
    basis: 'ACTIONS',
    totalActions: 0,
    completedActions: 0,
    cancelledActions: 0,
    percent: null,
  },
  id: id(6),
  workspaceId: 'w',
  projectId: null,
  frameworkId: framework.id,
  name: 'Índice interno acima de 80',
  description: null,
  goalType: 'GOVERNANCE_SCORE',
  operator: 'GTE',
  targetValue: 80,
  deadline: '2026-10-30',
  status: 'ACTIVE',
  lastResult: null,
  createdBy: 'user',
  version: 3,
  createdAt: time,
  updatedAt: time,
};
const action: Action = {
  id: id(7),
  workspaceId: 'w',
  controlAssessmentId: assessed.id,
  goalId: null,
  title: 'Revisar evidências da equipe',
  description: null,
  ownerMemberId: null,
  status: 'OPEN',
  dueDate: '2026-10-30',
  completedAt: null,
  createdBy: 'user',
  version: 5,
  createdAt: time,
  updatedAt: time,
};
const metrics: Metrics = {
  goalTypes: ['AUTOMATION_COVERAGE', 'CRITICAL_DEFECTS', 'GOVERNANCE_SCORE'],
  indicatorType: 'INTERNAL',
};
const evidence: Evidence = {
  id: id(10),
  workspaceId: 'w',
  controlAssessmentId: assessed.id,
  evidenceType: 'URL',
  referenceId: null,
  url: 'https://example.com/revisao',
  title: 'Revisão de outubro',
  validUntil: '2026-10-01',
  attachmentSnapshot: null,
  createdBy: 'user',
  createdAt: time,
  attachmentAvailable: null,
};
const file: Attachment = {
  id: id(11),
  workspaceId: 'w',
  originalName: 'revisao.txt',
  contentType: 'text/plain',
  sizeBytes: 20,
  checksum: 'abc',
  uploadedBy: 'user',
  createdAt: time,
};
const dashboard: Dashboard = {
  indicatorType: 'INTERNAL',
  frameworks: 1,
  assessments: { draft: 1, inProgress: 1, closed: 1 },
  latestAssessments: [
    {
      frameworkId: framework.id,
      assessmentId: assessment.id,
      frameworkName: framework.name,
      closedAt: time,
      index: null,
    },
  ],
  goals: { active: 1, achieved: 0, missed: 0, cancelled: 0 },
  actions: { open: 1, inProgress: 0, done: 0, cancelled: 0 },
  attention: { notMetControls: 1, partiallyMetControls: 1, expiredEvidence: 1 },
};
const base = '/api/v1/workspaces/w/governance';
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
      size: 100,
      totalItems: data.length,
      totalPages: next ? 2 : number,
      hasNext: next,
      hasPrevious: number > 1,
    },
  },
});
const form = (v: Record<string, unknown>) =>
  new FormGroup(
    Object.fromEntries(Object.entries(v).map(([k, value]) => [k, new FormControl(value)])),
  );
const evidencePath = `${base}/assessments/${assessment.id}/controls/${control.id}/evidence`;
let http: HttpTestingController;
let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
beforeAll(() =>
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  }),
);
beforeEach(() => {
  params = new BehaviorSubject(convertToParamMap({ workspaceId: 'w' }));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { data: {} } } },
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
function flushView(
  kind: Kind,
  item: RecordItem,
  sections: Section[] = [section],
  controls: Control[] = [control],
  assessedRows: AssessedControl[] = [assessed],
) {
  http.expectOne(`${base}/${kind}/${item.id}`).flush(envelope(item));
  if (kind === 'goals') {
    for (const request of http.match(
      (r) => r.url === `${base}/actions` && r.params.get('goalId') === item.id,
    ))
      request.flush(page([]));
  }
  if (kind === 'frameworks') {
    http.expectOne((r) => r.url === `${base}/frameworks/${item.id}/sections`).flush(page(sections));
    const controlsRequest = http.expectOne(
      (r) => r.url === `${base}/frameworks/${item.id}/controls`,
    );
    expect(controlsRequest.request.params.get('sort')).toBe('creationOrder,asc');
    controlsRequest.flush(page(controls));
  }
  if (kind === 'assessments') {
    http
      .expectOne((r) => r.url === `${base}/assessments/${item.id}/controls`)
      .flush(page(assessedRows));
    const a = item as Assessment;
    const counts = { NOT_ASSESSED: 0, NOT_MET: 0, PARTIALLY_MET: 0, MET: 0, NOT_APPLICABLE: 0 };
    for (const row of assessedRows) counts[row.status]++;
    const summary = {
      state: 'AVAILABLE',
      totalControls: assessedRows.length,
      applicableControls: assessedRows.length - counts.NOT_APPLICABLE,
      assessedControls: assessedRows.length - counts.NOT_ASSESSED,
      counts,
      index: {
        value: a.index.value,
        numerator: a.index.numerator,
        denominator: a.index.denominator,
      },
      completionPercent: null,
      assessmentPercent: null,
      completed: false,
    };
    http
      .expectOne(
        (r) =>
          r.url === `${base}/frameworks/${a.frameworkId}/progress` &&
          r.params.get('assessmentId') === a.id,
      )
      .flush(
        envelope({
          generatedAt: time,
          indicatorType: 'INTERNAL',
          state: a.status,
          framework: {
            id: a.frameworkId,
            code: framework.code,
            name: framework.name,
            version: framework.version,
          },
          assessment: {
            id: a.id,
            name: a.name,
            status: a.status,
            version: a.version,
            definitionVersion: a.frameworkSnapshot.version,
            assessmentDate: a.assessmentDate,
            closedAt: a.closedAt,
          },
          definitionVersionDiffers: false,
          summary,
          sections: a.frameworkSnapshot.sections.map((s) => ({
            ...s,
            direct: summary,
            subtree: summary,
          })),
        }),
      );
  }
}
function detail(kind: Kind, item: RecordItem, assessedRows: AssessedControl[] = [assessed]) {
  const f = TestBed.createComponent(GovernanceDetail);
  f.componentRef.setInput('kind', kind);
  f.componentRef.setInput('initial', item);
  f.detectChanges();
  flushView(kind, item, [section], [control], assessedRows);
  f.detectChanges();
  return f;
}
function assessmentEvidence(files = false, rows: Evidence[] = [evidence]) {
  if (files)
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: [...workspace.permissions!, 'attachment.read'],
    });
  const f = detail('assessments', assessment);
  const c = f.debugElement.query(By.directive(AssessmentControls))
    .componentInstance as AssessmentControls;
  c.selectedId.set(assessed.id);
  f.detectChanges();
  const e = f.debugElement.query(By.directive(GovernanceEvidence))
    .componentInstance as GovernanceEvidence;
  if (files) http.expectOne((r) => r.url === evidencePath).flush(page(rows));
  return { f, e, c };
}

describe('32 Governance HTTP contracts', () => {
  const frameworkBody = {
    code: 'QUALIDADE',
    name: 'Qualidade',
    versionLabel: '1.0',
    description: null,
  };
  const sectionBody = {
    version: 7,
    code: 'SECAO',
    name: 'Seção',
    parentSectionId: null,
    position: 1,
  };
  const controlBody = {
    version: 7,
    code: 'CONTROLE',
    title: 'Controle',
    sectionId: section.id,
    weight: 1,
    active: false,
  };
  const assessmentBody = {
    frameworkId: framework.id,
    name: 'Avaliação',
    assessmentDate: '2026-10-03',
  };
  const goalBody: GoalBody = {
    name: 'Meta',
    goalType: 'AUTOMATION_COVERAGE',
    operator: 'GTE',
    targetValue: 80.25,
    projectId: null,
    frameworkId: null,
  };
  const actionBody = { title: 'Ação', controlAssessmentId: assessed.id, goalId: goal.id };
  const query: Query = { page: 2, size: 20, sort: 'name,asc', q: 'Qualidade', status: 'ALL' };
  const contracts: [string, string, string, (a: GovernanceApi) => Observable<unknown>, unknown?][] =
    [
      ['framework list', 'GET', 'frameworks', (a) => a.list('w', 'frameworks', query)],
      [
        'framework create',
        'POST',
        'frameworks',
        (a) => a.create('w', 'frameworks', frameworkBody),
        frameworkBody,
      ],
      [
        'framework get',
        'GET',
        `frameworks/${framework.id}`,
        (a) => a.get('w', 'frameworks', framework.id),
      ],
      [
        'framework update',
        'PATCH',
        `frameworks/${framework.id}`,
        (a) => a.update('w', 'frameworks', framework.id, { version: 7, status: 'ACTIVE' }),
        { version: 7, status: 'ACTIVE' },
      ],
      [
        'assessment list',
        'GET',
        'assessments',
        (a) => a.list('w', 'assessments', { ...query, frameworkId: framework.id }),
      ],
      [
        'assessment create',
        'POST',
        'assessments',
        (a) => a.create('w', 'assessments', assessmentBody),
        assessmentBody,
      ],
      [
        'assessment get',
        'GET',
        `assessments/${assessment.id}`,
        (a) => a.get('w', 'assessments', assessment.id),
      ],
      [
        'goal list',
        'GET',
        'goals',
        (a) => a.list('w', 'goals', { ...query, projectId: project.id }),
      ],
      ['goal create', 'POST', 'goals', (a) => a.create('w', 'goals', goalBody), goalBody],
      ['goal get', 'GET', `goals/${goal.id}`, (a) => a.get('w', 'goals', goal.id)],
      [
        'goal update',
        'PATCH',
        `goals/${goal.id}`,
        (a) => a.update('w', 'goals', goal.id, { version: 3, description: null }),
        { version: 3, description: null },
      ],
      [
        'action list',
        'GET',
        'actions',
        (a) =>
          a.list('w', 'actions', { ...query, goalId: goal.id, controlAssessmentId: assessed.id }),
      ],
      ['action create', 'POST', 'actions', (a) => a.create('w', 'actions', actionBody), actionBody],
      ['action get', 'GET', `actions/${action.id}`, (a) => a.get('w', 'actions', action.id)],
      [
        'action update',
        'PATCH',
        `actions/${action.id}`,
        (a) => a.update('w', 'actions', action.id, { version: 5, status: 'IN_PROGRESS' }),
        { version: 5, status: 'IN_PROGRESS' },
      ],
      [
        'sections list',
        'GET',
        `frameworks/${framework.id}/sections`,
        (a) => a.sections('w', framework.id, query),
      ],
      [
        'section create',
        'POST',
        `frameworks/${framework.id}/sections`,
        (a) => a.createSection('w', framework.id, sectionBody),
        sectionBody,
      ],
      [
        'section update',
        'PATCH',
        `frameworks/${framework.id}/sections/${section.id}`,
        (a) =>
          a.updateSection('w', framework.id, section.id, {
            version: 7,
            parentSectionId: null,
            position: 2,
          }),
        { version: 7, parentSectionId: null, position: 2 },
      ],
      [
        'controls list',
        'GET',
        `frameworks/${framework.id}/controls`,
        (a) => a.controls('w', framework.id, { ...query, active: false, sectionId: section.id }),
      ],
      [
        'control create',
        'POST',
        `frameworks/${framework.id}/controls`,
        (a) => a.createControl('w', framework.id, controlBody),
        controlBody,
      ],
      [
        'control update',
        'PATCH',
        `frameworks/${framework.id}/controls/${control.id}`,
        (a) => a.updateControl('w', framework.id, control.id, { version: 7, active: false }),
        { version: 7, active: false },
      ],
      [
        'assessment start',
        'POST',
        `assessments/${assessment.id}/start`,
        (a) => a.assessmentAction('w', assessment.id, 'start', 9),
        { version: 9 },
      ],
      [
        'assessment controls list',
        'GET',
        `assessments/${assessment.id}/controls`,
        (a) => a.assessedControls('w', assessment.id, query),
      ],
      [
        'assess control',
        'PUT',
        `assessments/${assessment.id}/controls/${control.id}`,
        (a) =>
          a.assess('w', assessment.id, control.id, {
            version: 9,
            status: 'NOT_APPLICABLE',
            justification: 'Não se aplica',
          }),
        { version: 9, status: 'NOT_APPLICABLE', justification: 'Não se aplica' },
      ],
      [
        'evidence list',
        'GET',
        `assessments/${assessment.id}/controls/${control.id}/evidence`,
        (a) => a.evidence('w', assessment.id, control.id, query),
      ],
      [
        'evidence add',
        'POST',
        `assessments/${assessment.id}/controls/${control.id}/evidence`,
        (a) =>
          a.addEvidence('w', assessment.id, control.id, {
            version: 9,
            evidenceType: 'URL',
            url: evidence.url,
            title: evidence.title,
            validUntil: null,
          }),
        {
          version: 9,
          evidenceType: 'URL',
          url: evidence.url,
          title: evidence.title,
          validUntil: null,
        },
      ],
      [
        'evidence remove',
        'DELETE',
        `assessments/${assessment.id}/controls/${control.id}/evidence/${evidence.id}`,
        (a) => a.removeEvidence('w', assessment.id, control.id, evidence.id, 9),
        { version: 9 },
      ],
      [
        'assessment close',
        'POST',
        `assessments/${assessment.id}/close`,
        (a) => a.assessmentAction('w', assessment.id, 'close', 9),
        { version: 9 },
      ],
      [
        'goal calculate',
        'POST',
        `goals/${goal.id}/calculate`,
        (a) => a.calculate('w', goal.id, 3),
        { version: 3 },
      ],
      [
        'action complete',
        'POST',
        `actions/${action.id}/complete`,
        (a) => a.complete('w', action.id, 5),
        { version: 5 },
      ],
      ['metrics', 'GET', 'metrics', (a) => a.metrics('w')],
      ['dashboard', 'GET', 'dashboard', (a) => a.dashboard('w')],
    ];
  for (const [name, method, path, call, body] of contracts)
    it(name, () => {
      call(TestBed.inject(GovernanceApi)).subscribe();
      const r = http.expectOne((req) => req.url === `${base}/${path}` && req.method === method);
      expect(r.request.body ?? undefined).toEqual(body);
      if (!name.includes('list')) expect(r.request.params.keys()).toEqual([]);
      if (name === 'sections list' || name === 'evidence list')
        expect(r.request.params.keys()).not.toContain('status');
      if (name === 'controls list') {
        expect(r.request.params.get('active')).toBe('false');
        expect(r.request.params.has('status')).toBe(false);
      }
      if (name === 'assessment controls list') expect(r.request.params.has('q')).toBe(false);
      r.flush(envelope(framework));
    });
  it('encodes scope IDs and filters unknown list keys', () => {
    TestBed.inject(GovernanceApi)
      .list('w/a', 'goals', { page: 1, size: 20, unexpected: 'x', goalId: id(20) } as Query)
      .subscribe();
    const r = http.expectOne((req) => req.url === '/api/v1/workspaces/w%2Fa/governance/goals');
    expect(r.request.params.keys()).toEqual(['page', 'size']);
    r.flush(page([]));
  });
  it.each([403, 404])('refreshes matching workspace grants on %i without retrying', (status) => {
    const cb = vi.fn();
    TestBed.inject(WorkspaceContext).accessChanged.subscribe(cb);
    TestBed.inject(GovernanceApi)
      .get('w', 'goals', goal.id)
      .subscribe({ error: () => {} });
    http
      .expectOne(`${base}/goals/${goal.id}`)
      .flush({ code: 'AUTH_FORBIDDEN' }, { status, statusText: 'Denied' });
    expect(cb).toHaveBeenCalledOnce();
  });
  it('does not refresh a different workspace after an old request fails', () => {
    const cb = vi.fn();
    TestBed.inject(WorkspaceContext).accessChanged.subscribe(cb);
    TestBed.inject(GovernanceApi)
      .get('old', 'goals', goal.id)
      .subscribe({ error: () => {} });
    http
      .expectOne(`/api/v1/workspaces/old/governance/goals/${goal.id}`)
      .flush({ code: 'AUTH_FORBIDDEN' }, { status: 403, statusText: 'Denied' });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('Framework aggregate and preserved drafts', () => {
  it('keeps the actual metadata form across conflict and explicitly reviews the new version', () => {
    const f = detail('frameworks', framework);
    const c = f.componentInstance;
    c.edit();
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.form().get('name')!.setValue('Minha alteração');
    dialog.form().get('description')!.setValue('  Texto preservado\n');
    dialog.submit();
    const first = http.expectOne(`${base}/frameworks/${framework.id}`);
    expect(first.request.body.version).toBe(7);
    expect(first.request.body.description).toBe('  Texto preservado\n');
    first.flush(
      { code: 'GOVERNANCE_VERSION_CONFLICT', requestId: 'conflict-id' },
      { status: 409, statusText: 'Conflict' },
    );
    dialog.submit();
    http.expectNone((r) => r.method === 'PATCH');
    c.session.reload();
    flushView('frameworks', { ...framework, name: 'Alteração concorrente', version: 14 });
    f.detectChanges();
    expect(dialog.form().get('name')!.value).toBe('Minha alteração');
    expect(c.session.item().version).toBe(7);
    expect(f.nativeElement.textContent).toContain('Alteração concorrente');
    c.session.review();
    f.detectChanges();
    dialog.submit();
    const retry = http.expectOne(`${base}/frameworks/${framework.id}`);
    expect(retry.request.body.version).toBe(14);
    expect(Object.keys(retry.request.body).sort()).toEqual([
      'code',
      'description',
      'name',
      'version',
      'versionLabel',
    ]);
    retry.flush(envelope({ ...framework, name: 'Minha alteração', version: 25 }));
    flushView('frameworks', { ...framework, name: 'Minha alteração', version: 25 });
    f.detectChanges();
    expect(c.session.item().version).toBe(25);
    expect(c.editor()).toBeNull();
  });
  it('uses frameworkVersion returned by a child mutation and waits for refresh before another write', () => {
    const f = detail('frameworks', framework);
    const c = f.componentInstance;
    const child = f.debugElement.query(By.directive(FrameworkDefinition))
      .componentInstance as FrameworkDefinition;
    child.openSection();
    f.detectChanges();
    const v = {
      code: 'NOVA',
      name: 'Nova seção',
      description: '',
      parentSectionId: '',
      position: 3,
    };
    child.save({ values: v, form: form(v) });
    const r = http.expectOne(`${base}/frameworks/${framework.id}/sections`);
    expect(r.request.body).toEqual({
      version: 7,
      code: 'NOVA',
      name: 'Nova seção',
      description: null,
      parentSectionId: null,
      position: 3,
    });
    r.flush(envelope({ section: { ...section, id: id(22) }, frameworkVersion: 18 }));
    expect(c.session.item().version).toBe(18);
    expect(c.session.state.busy()).toBe(true);
    child.openControl();
    expect(child.editor()?.kind).toBe('section');
    flushView('frameworks', { ...framework, version: 18 }, [section, { ...section, id: id(22) }]);
    f.detectChanges();
    child.openControl();
    f.detectChanges();
    const controlValues = {
      sectionId: section.id,
      code: 'NOVO',
      title: 'Novo controle',
      description: '',
      weight: 2,
      active: false,
    };
    child.save({ values: controlValues, form: form(controlValues) });
    const next = http.expectOne(`${base}/frameworks/${framework.id}/controls`);
    expect(next.request.body.version).toBe(18);
    expect(next.request.body.active).toBe(false);
    next.flush(
      envelope({ control: { ...control, id: id(23), active: false }, frameworkVersion: 21 }),
    );
    flushView('frameworks', { ...framework, version: 21 });
  });
  it('retains a confirmed server version and draft when subsequent refresh fails', () => {
    const f = detail('frameworks', framework);
    const c = f.componentInstance;
    c.edit();
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.submit();
    http
      .expectOne(`${base}/frameworks/${framework.id}`)
      .flush(envelope({ ...framework, version: 15 }));
    http
      .expectOne(`${base}/frameworks/${framework.id}`)
      .flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    expect(c.session.item().version).toBe(15);
    expect(c.session.state.blocked()).toBe(true);
    expect(c.editor()).toBeTruthy();
    dialog.submit();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('loads every sections page before enabling a tree move and excludes descendants', () => {
    const f = TestBed.createComponent(GovernanceDetail);
    f.componentRef.setInput('kind', 'frameworks');
    f.componentRef.setInput('initial', framework);
    f.detectChanges();
    http.expectOne(`${base}/frameworks/${framework.id}`).flush(envelope(framework));
    const childSection = { ...section, id: id(21), parentSectionId: section.id };
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/sections`)
      .flush(page([section], 1, true));
    expect(f.componentInstance.session.ready()).toBe(false);
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/sections`)
      .flush(page([childSection], 2));
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/controls`)
      .flush(page([control]));
    f.detectChanges();
    const child = f.debugElement.query(By.directive(FrameworkDefinition))
      .componentInstance as FrameworkDefinition;
    child.openSection(section);
    expect(
      child
        .editor()!
        .fields.find((f) => f.key === 'parentSectionId')!
        .options!.some((o) => o.value === childSection.id),
    ).toBe(false);
  });
  it('blocks activation without active controls and last-control deactivation', () => {
    const f = detail('frameworks', framework);
    const child = f.debugElement.query(By.directive(FrameworkDefinition))
      .componentInstance as FrameworkDefinition;
    child.openControl(control);
    const v = {
      sectionId: section.id,
      code: control.code,
      title: control.title,
      description: control.description,
      weight: 3,
      active: false,
    };
    const draft = form(v);
    child.save({ values: v, form: draft });
    expect(draft.get('active')!.errors?.['server']).toBeTruthy();
    http.expectNone((r) => r.method === 'PATCH');
    f.componentInstance.session.view.update((v) => ({
      ...v,
      item: { ...framework, status: 'DRAFT' },
      controls: [{ ...control, active: false }],
    }));
    f.componentInstance.request('activate');
    f.componentInstance.confirm();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('prevents definition writes when archived, or without manage grant', () => {
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['governance.read', 'governance.assess'],
    });
    const f = detail('frameworks', { ...framework, status: 'ARCHIVED' });
    const c = f.componentInstance;
    c.edit();
    c.request('archive');
    expect(c.editor()).toBeNull();
    expect(c.confirmation()).toBeNull();
    const child = f.debugElement.query(By.directive(FrameworkDefinition))
      .componentInstance as FrameworkDefinition;
    child.openSection();
    expect(child.editor()).toBeNull();
    http.expectNone((r) => r.method !== 'GET');
  });
  it('rejects UTF-8 payloads over 32 KiB before sending', () => {
    const f = detail('frameworks', framework);
    const c = f.componentInstance;
    c.edit();
    const v = {
      code: framework.code,
      name: framework.name,
      versionLabel: '1.0',
      description: '😀'.repeat(9000),
    };
    c.save({ values: v, form: form(v) });
    expect(c.session.state.error()).toContain('32 KiB');
    http.expectNone((r) => r.method === 'PATCH');
  });
});

describe('Assessment controls and closure', () => {
  it('requires N/A justification and uses definition controlId with the assessment version', () => {
    const f = detail('assessments', assessment);
    const c = f.componentInstance;
    const controls = f.debugElement.query(By.directive(AssessmentControls))
      .componentInstance as AssessmentControls;
    controls.edit(assessed);
    const v = { status: 'NOT_APPLICABLE', justification: '  ' };
    const draft = form(v);
    controls.save({ values: v, form: draft });
    expect(draft.get('justification')!.errors?.['server']).toBeTruthy();
    http.expectNone((r) => r.method === 'PUT');
    const valid = { ...v, justification: '  Fora do escopo\n' };
    controls.save({ values: valid, form: form(valid) });
    const r = http.expectOne(`${base}/assessments/${assessment.id}/controls/${control.id}`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ version: 9, ...valid });
    r.flush(
      envelope({
        ...assessment,
        version: 16,
        index: { value: null, numerator: 0, denominator: 0, assessedControls: 1, totalControls: 1 },
      }),
    );
    flushView(
      'assessments',
      {
        ...assessment,
        version: 16,
        index: { value: null, numerator: 0, denominator: 0, assessedControls: 1, totalControls: 1 },
      },
      [],
      [],
      [{ ...assessed, status: 'NOT_APPLICABLE', justification: valid.justification }],
    );
    f.detectChanges();
    expect(c.canClose()).toBe(true);
    expect(c.session.assessment().frameworkSnapshot.version).toBe(6);
    expect(c.session.assessment().index.value).toBeNull();
  });
  it('blocks close until every control is classified and then submits only version', () => {
    const f = detail('assessments', assessment);
    const c = f.componentInstance;
    c.request('close');
    expect(c.confirmation()).toBeNull();
    c.session.view.update((v) => ({
      ...v,
      item: { ...assessment, index: { ...assessment.index, assessedControls: 1 } },
      assessed: [{ ...assessed, status: 'MET', score: 100 }],
    }));
    c.request('close');
    c.confirm();
    const r = http.expectOne(`${base}/assessments/${assessment.id}/close`);
    expect(r.request.body).toEqual({ version: 9 });
    r.flush(envelope({ ...assessment, status: 'CLOSED', version: 10, closedAt: time }));
    flushView(
      'assessments',
      { ...assessment, status: 'CLOSED', version: 10, closedAt: time },
      [],
      [],
      [{ ...assessed, status: 'MET', score: 100 }],
    );
    f.detectChanges();
    expect(c.session.assessable()).toBe(false);
  });
  it('keeps closed assessments read-only but allows independent improvement actions', () => {
    const f = detail('assessments', { ...assessment, status: 'CLOSED' });
    const controls = f.debugElement.query(By.directive(AssessmentControls))
      .componentInstance as AssessmentControls;
    controls.edit(assessed);
    expect(controls.editor()).toBeNull();
    const create = vi.fn();
    f.componentInstance.create.subscribe(create);
    const button = Array.from(
      f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.trim() === 'Criar ação de melhoria')!;
    button.click();
    expect(create).toHaveBeenCalledWith({
      kind: 'actions',
      links: { controlAssessmentId: assessed.id },
    });
    http.expectNone((r) => r.method !== 'GET');
  });
  it('does not infer assess permission from manage', () => {
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['governance.read', 'governance.manage'],
    });
    const f = detail('assessments', assessment);
    const controls = f.debugElement.query(By.directive(AssessmentControls))
      .componentInstance as AssessmentControls;
    controls.edit(assessed);
    expect(controls.editor()).toBeNull();
    expect(f.componentInstance.session.assessable()).toBe(false);
  });
});

describe('Private evidence and reference rules', () => {
  it('allows URL evidence without attachment.read and does not submit referenceId', () => {
    const { f, e } = assessmentEvidence();
    e.open('URL');
    const v = { title: 'Revisão', url: 'https://example.com/a%20b', validUntil: '' };
    e.save({ values: v, form: form(v) });
    const r = http.expectOne(evidencePath);
    expect(r.request.body).toEqual({
      version: 9,
      evidenceType: 'URL',
      title: 'Revisão',
      url: v.url,
      validUntil: null,
    });
    r.flush(envelope({ ...assessment, version: 11 }));
    flushView('assessments', { ...assessment, version: 11 });
    f.detectChanges();
    http.expectNone((req) => req.url.includes('/attachments'));
  });
  it('validates safe URL and calendar validity before a request', () => {
    const { e } = assessmentEvidence();
    e.open('URL');
    const v = { title: 'Referência', url: 'https://user:pass@example.com/a', validUntil: '' };
    const draft = form(v);
    e.save({ values: v, form: draft });
    expect(draft.get('url')!.errors?.['server']).toBeTruthy();
    const invalid = { ...v, url: 'https://example.com/a', validUntil: '2026-02-30' };
    const dates = form(invalid);
    e.save({ values: invalid, form: dates });
    expect(dates.get('validUntil')!.errors?.['server']).toBeTruthy();
    http.expectNone((r) => r.method === 'POST');
  });
  it('removes a binding by its evidence ID without file grants or deletion', () => {
    const { f, e } = assessmentEvidence();
    e.open('REMOVE');
    const values = { evidenceId: evidence.id };
    e.save({ values, form: form(values) });
    const r = http.expectOne(`${evidencePath}/${evidence.id}`);
    expect(r.request.method).toBe('DELETE');
    expect(r.request.body).toEqual({ version: 9 });
    r.flush(envelope({ ...assessment, version: 13 }));
    flushView('assessments', { ...assessment, version: 13 });
    f.detectChanges();
    http.expectNone((req) => req.url.includes('/attachments/'));
  });
  it('shows a deleted attachment snapshot and blocks its download', () => {
    const link = {
      ...evidence,
      evidenceType: 'ATTACHMENT' as const,
      referenceId: file.id,
      url: null,
      attachmentSnapshot: {
        originalName: file.originalName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
      },
      attachmentAvailable: false,
    };
    const { f, e } = assessmentEvidence(true, [link]);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain(file.originalName);
    expect(f.nativeElement.textContent).toContain('descrição histórica');
    e.download(link);
    http.expectNone((req) => req.url.endsWith('/download'));
  });
  it('uses protected Blob download for an available private attachment', () => {
    const link = {
      ...evidence,
      evidenceType: 'ATTACHMENT' as const,
      referenceId: file.id,
      url: null,
      attachmentSnapshot: {
        originalName: file.originalName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
      },
      attachmentAvailable: true,
    };
    const { e } = assessmentEvidence(true, [link]);
    e.download(link);
    const r = http.expectOne(`/api/v1/workspaces/w/attachments/${file.id}/download`);
    expect(r.request.responseType).toBe('blob');
    r.flush(null);
  });
  it('adds a selected attachment with exact type-specific fields and refreshes evidence before unlocking', () => {
    const { f, e } = assessmentEvidence(true);
    e.open('ATTACHMENT');
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/v1/workspaces/w/attachments').flush(page([file]));
    e.choose({ ...file, workspaceId: 'other' });
    expect(e.chosen()).toBeNull();
    e.choose(file);
    const values = { title: 'Arquivo', validUntil: '2026-10-20' };
    e.save({ values, form: form(values) });
    const r = http.expectOne(evidencePath);
    expect(r.request.body).toEqual({
      version: 9,
      evidenceType: 'ATTACHMENT',
      title: 'Arquivo',
      referenceId: file.id,
      validUntil: '2026-10-20',
    });
    r.flush(envelope({ ...assessment, version: 17 }));
    flushView('assessments', { ...assessment, version: 17 });
    expect(f.componentInstance.session.state.busy()).toBe(true);
    http.expectOne((req) => req.url === evidencePath).flush(page([evidence]));
    expect(f.componentInstance.session.state.busy()).toBe(false);
  });
  it('does not expose unsafe server URLs as navigable links', () => {
    const { f } = assessmentEvidence(true, [{ ...evidence, url: 'javascript:alert(1)' }]);
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[href^="javascript"]')).toBeNull();
    expect(f.nativeElement.textContent).toContain('URL indisponível');
  });
});

describe('Goals, calculations and independent actions', () => {
  it('accepts decimal percentages and zero critical-defect targets, rejecting incompatible scopes and invalid dates', () => {
    const valid = {
      name: 'Cobertura',
      description: '  Texto\n',
      goalType: 'AUTOMATION_COVERAGE',
      operator: 'GTE',
      targetValue: 80.25,
      projectId: '',
      frameworkId: '',
      deadline: '2026-10-20',
    };
    expect(recordBody('goals', valid, form(valid), emptyCatalogs)).toEqual({
      ...valid,
      projectId: null,
      frameworkId: null,
    });
    const zero = { ...valid, goalType: 'CRITICAL_DEFECTS', targetValue: 0 };
    expect(recordBody('goals', zero, form(zero), emptyCatalogs)).toMatchObject({ targetValue: 0 });
    for (const invalid of [
      { ...valid, targetValue: 100.01 },
      { ...valid, targetValue: NaN },
      { ...valid, targetValue: 80.255 },
      { ...zero, targetValue: 1.5 },
      { ...valid, deadline: '2026-02-30' },
      { ...valid, goalType: 'GOVERNANCE_SCORE', frameworkId: '', projectId: project.id },
      { ...valid, frameworkId: framework.id },
    ])
      expect(recordBody('goals', invalid, form(invalid), emptyCatalogs)).toBeNull();
  });
  it('only exposes metrics returned by GET metrics and preserves a decimal number through the actual form', () => {
    const f = TestBed.createComponent(GovernanceCreate);
    f.componentRef.setInput('workspace', workspace);
    f.componentRef.setInput('kind', 'goals');
    f.detectChanges();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    http
      .expectOne(`${base}/metrics`)
      .flush(envelope({ ...metrics, goalTypes: ['AUTOMATION_COVERAGE'] }));
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    expect(
      f.componentInstance
        .fields()!
        .find((f) => f.key === 'goalType')!
        .options!.map((o) => o.value),
    ).toEqual(['AUTOMATION_COVERAGE']);
    dialog.form().get('name')!.setValue('Cobertura acima de 80,25');
    const targetInput = f.nativeElement.querySelector('#editor-targetValue') as HTMLInputElement;
    targetInput.value = '80.25';
    targetInput.dispatchEvent(new Event('input'));
    expect(dialog.form().get('targetValue')!.value).toBe(80.25);
    dialog.submit();
    const r = http.expectOne(`${base}/goals`);
    expect(r.request.body.targetValue).toBe(80.25);
    expect(r.request.body.frameworkId).toBeNull();
    expect(r.request.body).not.toHaveProperty('version');
    r.flush(
      envelope({
        ...goal,
        goalType: 'AUTOMATION_COVERAGE',
        frameworkId: null,
        targetValue: 80.25,
        version: 1,
      }),
    );
  });
  it('calculates only on explicit action using version, displaying server result and source time', () => {
    const f = detail('goals', goal);
    const c = f.componentInstance;
    http.expectNone((r) => r.url.endsWith('/calculate'));
    c.request('calculate');
    c.confirm();
    const r = http.expectOne(`${base}/goals/${goal.id}/calculate`);
    expect(r.request.body).toEqual({ version: 3 });
    const updated = {
      ...goal,
      version: 14,
      status: 'ACHIEVED' as const,
      lastResult: {
        value: 85,
        numerator: 255,
        denominator: 3,
        calculatedAt: time,
        sourceIds: [assessment.id],
      },
    };
    r.flush(envelope(updated));
    flushView('goals', updated);
    f.detectChanges();
    expect(c.session.item().version).toBe(14);
    expect(f.nativeElement.textContent).toContain('85');
    expect(f.nativeElement.textContent).toContain(assessment.id);
    expect(f.nativeElement.textContent).toContain('Calculado em');
  });
  it('allows recalculation of achieved/missed goals but keeps cancelled goals terminal', () => {
    for (const status of ['ACHIEVED', 'MISSED', 'CANCELLED'] as const) {
      const f = detail('goals', { ...goal, status });
      const c = f.componentInstance;
      c.request('calculate');
      if (status === 'CANCELLED') {
        c.confirm();
        http.expectNone((r) => r.url.endsWith('/calculate'));
      } else {
        c.confirm();
        http
          .expectOne(`${base}/goals/${goal.id}/calculate`)
          .flush(envelope({ ...goal, status, version: 4 }));
        flushView('goals', { ...goal, status, version: 4 });
      }
      f.destroy();
    }
  });
  it('clears lastResult after editing a goal using the full returned response', () => {
    const initial = {
      ...goal,
      lastResult: {
        value: 90,
        numerator: 270,
        denominator: 3,
        calculatedAt: time,
        sourceIds: [assessment.id],
      },
      status: 'ACHIEVED' as const,
    };
    const f = detail('goals', initial);
    const c = f.componentInstance;
    c.edit();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/sections`)
      .flush(page([section]));
    http.expectOne(`${base}/metrics`).flush(envelope(metrics));
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.form().get('targetValue')!.setValue(95.25);
    dialog.submit();
    const r = http.expectOne(`${base}/goals/${goal.id}`);
    expect(r.request.body.targetValue).toBe(95.25);
    expect(r.request.body.version).toBe(3);
    expect(r.request.body).not.toHaveProperty('lastResult');
    const updated = {
      ...initial,
      targetValue: 95.25,
      lastResult: null,
      status: 'ACTIVE' as const,
      version: 5,
    };
    r.flush(envelope(updated));
    flushView('goals', updated);
    expect((c.session.item() as Goal).lastResult).toBeNull();
  });
  it('blocks mutation and calculation for a project archived after goal creation', () => {
    const linked = {
      ...goal,
      goalType: 'AUTOMATION_COVERAGE' as const,
      frameworkId: null,
      projectId: project.id,
    };
    const f = TestBed.createComponent(GovernanceDetail);
    f.componentRef.setInput('kind', 'goals');
    f.componentRef.setInput('initial', linked);
    f.detectChanges();
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(linked));
    http
      .expectOne((r) => r.url === `${base}/actions` && r.params.get('goalId') === goal.id)
      .flush(page([]));
    http
      .expectOne(`/api/v1/workspaces/w/projects/${project.id}`)
      .flush(envelope({ ...project, status: 'ARCHIVED', archivedAt: time }));
    f.detectChanges();
    expect(f.componentInstance.canManage()).toBe(false);
    f.componentInstance.request('calculate');
    expect(f.componentInstance.confirmation()).toBeNull();
    http.expectNone((r) => r.method === 'POST');
  });
  it('completes an action with its own version without writing assessment or goal', () => {
    const f = detail('actions', action);
    const c = f.componentInstance;
    c.request('complete');
    c.confirm();
    const r = http.expectOne(`${base}/actions/${action.id}/complete`);
    expect(r.request.body).toEqual({ version: 5 });
    r.flush(envelope({ ...action, status: 'DONE', version: 12, completedAt: time }));
    flushView('actions', { ...action, status: 'DONE', version: 12, completedAt: time });
    f.detectChanges();
    expect(c.editable()).toBe(false);
    expect(c.session.item().version).toBe(12);
    http.expectNone(
      (r) => r.method !== 'GET' && (r.url.includes('/assessments/') || r.url.includes('/goals/')),
    );
  });
  it('keeps action origin immutable and cannot reopen an in-progress action', () => {
    const f = detail('actions', { ...action, status: 'IN_PROGRESS' });
    const c = f.componentInstance;
    c.edit();
    http.expectOne((r) => r.url === `${base}/goals`).flush(page([goal]));
    f.detectChanges();
    const keys = c.editor()!.map((f) => f.key);
    expect(keys).not.toContain('goalId');
    expect(keys).not.toContain('controlAssessmentId');
    c.editor.set(null);
    c.request('progress');
    c.confirm();
    http.expectNone((r) => r.method === 'PATCH');
  });
});

describe('Scope, uncertain writes, permissions and dashboards', () => {
  it('cancels previous workspace requests and clears detail/drafts on tenant change', () => {
    const f = TestBed.createComponent(GovernanceRepository);
    http.expectOne('/api/v1/workspaces/w').flush(envelope(workspace));
    f.detectChanges();
    const previous = http.expectOne(`${base}/dashboard`);
    params.next(convertToParamMap({ workspaceId: 'new' }));
    f.detectChanges();
    expect(previous.cancelled).toBe(true);
    expect(TestBed.inject(WorkspaceContext).selected()).toBeNull();
    f.destroy();
    expect(http.expectOne('/api/v1/workspaces/new').cancelled).toBe(true);
  });
  it('supports write-only grants without issuing read requests or inferring other permissions', () => {
    const w = { ...workspace, permissions: ['governance.assess'] };
    TestBed.inject(WorkspaceContext).selected.set(w);
    const f = TestBed.createComponent(GovernancePanel);
    f.componentRef.setInput('workspace', w);
    f.detectChanges();
    expect(f.componentInstance.tab()).toBe('assessments');
    expect(f.nativeElement.textContent).not.toContain('Frameworks');
    expect(f.nativeElement.textContent).toContain('Criar avaliação');
    f.componentInstance.beginCreation({ kind: 'frameworks' });
    expect(f.componentInstance.creating()).toBeNull();
    f.componentInstance.beginCreation({ kind: 'assessments' });
    f.detectChanges();
    http.expectNone((r) => r.method === 'GET');
    const create = f.debugElement.query(By.directive(GovernanceCreate))
      .componentInstance as GovernanceCreate;
    const values = { frameworkId: framework.id, name: 'Avaliação', assessmentDate: '2026-10-03' };
    create.save({ values, form: form(values) });
    const r = http.expectOne(`${base}/assessments`);
    expect(r.request.body).toEqual(values);
    r.flush(envelope({ ...assessment, status: 'DRAFT', version: 1 }));
  });
  it('blocks repetition after uncertain creation until the fresh collection is consulted', () => {
    const f = TestBed.createComponent(GovernancePanel);
    f.componentRef.setInput('workspace', workspace);
    f.detectChanges();
    http.expectOne(`${base}/dashboard`).flush(envelope(dashboard));
    f.componentInstance.selectTab('frameworks');
    f.detectChanges();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    f.componentInstance.beginCreation({ kind: 'frameworks' });
    f.detectChanges();
    const create = f.debugElement.query(By.directive(GovernanceCreate))
      .componentInstance as GovernanceCreate;
    const values = { code: 'NOVO', name: 'Novo', versionLabel: '1.0', description: '' };
    const event = { values, form: form(values) };
    create.save(event);
    http
      .expectOne(`${base}/frameworks`)
      .flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    create.save(event);
    expect(create.state.blocked()).toBe(true);
    http.expectNone((r) => r.method === 'POST');
    create.closed.emit(true);
    f.detectChanges();
    expect(f.componentInstance.uncertainCreation()).toBe(true);
    f.componentInstance.beginCreation({ kind: 'frameworks' });
    expect(f.componentInstance.creating()).toBeNull();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    f.componentInstance.beginCreation({ kind: 'frameworks' });
    expect(f.componentInstance.creating()).toBeTruthy();
  });
  it('permits consulting the collection after uncertain creation and a failed refresh', () => {
    const f = TestBed.createComponent(GovernancePanel);
    f.componentRef.setInput('workspace', workspace);
    f.detectChanges();
    http.expectOne(`${base}/dashboard`).flush(envelope(dashboard));
    f.componentInstance.closeCreation('frameworks', true);
    f.detectChanges();
    http
      .expectOne((r) => r.url === `${base}/frameworks`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    const collection = f.debugElement.query(By.directive(GovernanceCollection))
      .componentInstance as GovernanceCollection;
    expect(collection.creationBlocked()).toBe(true);
    expect(collection.blocked()).toBe(false);
    const refresh = f.debugElement
      .queryAll(By.css('button'))
      .find((el) => el.nativeElement.textContent.trim() === 'Atualizar');
    expect(refresh?.nativeElement.disabled).toBe(false);
    refresh?.nativeElement.click();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    expect(f.componentInstance.uncertainCreation()).toBe(false);
  });
  it('blocks assessment transitions when the Workspace is archived', () => {
    TestBed.inject(WorkspaceContext).selected.set({ ...workspace, status: 'ARCHIVED' });
    const f = detail('assessments', { ...assessment, status: 'DRAFT' });
    f.componentInstance.request('start');
    expect(f.componentInstance.confirmation()).toBeNull();
    http.expectNone((r) => r.method === 'POST');
  });
  it('revalidates Workspace access when a linked project can no longer be consulted', () => {
    const context = TestBed.inject(WorkspaceContext);
    const spy = vi.fn();
    context.accessChanged.subscribe(spy);
    const f = TestBed.createComponent(GovernanceDetail);
    f.componentRef.setInput('kind', 'goals');
    f.componentRef.setInput('initial', { ...goal, projectId: project.id });
    f.detectChanges();
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope({ ...goal, projectId: project.id }));
    http
      .expectOne((r) => r.url === `${base}/actions` && r.params.get('goalId') === goal.id)
      .flush(page([]));
    http
      .expectOne(`/api/v1/workspaces/w/projects/${project.id}`)
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(context.selected()).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    expect(f.componentInstance.session.ready()).toBe(false);
    http.expectNone((r) => r.method === 'POST');
  });
  it('accepts typed integer positions while rejecting fractional positions in definition forms', () => {
    const f = detail('frameworks', framework);
    const definition = f.debugElement.query(By.directive(FrameworkDefinition))
      .componentInstance as FrameworkDefinition;
    definition.openSection(section);
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    const position = f.nativeElement.querySelector('#editor-position') as HTMLInputElement;
    position.value = '2.5';
    position.dispatchEvent(new Event('input'));
    dialog.submit();
    expect(dialog.form().get('position')!.hasError('integer')).toBe(true);
    http.expectNone((r) => r.method === 'PATCH');
    position.value = '2';
    position.dispatchEvent(new Event('input'));
    dialog.submit();
    const r = http.expectOne(`${base}/frameworks/${framework.id}/sections/${section.id}`);
    expect(r.request.body.position).toBe(2);
    expect(r.request.body.version).toBe(7);
    r.flush(envelope({ section: { ...section, position: 2 }, frameworkVersion: 8 }));
    flushView('frameworks', { ...framework, version: 8 }, [{ ...section, position: 2 }]);
  });
  it('keeps the active detail mounted while its aggregate write and refresh are pending', () => {
    const f = TestBed.createComponent(GovernancePanel);
    f.componentRef.setInput('workspace', workspace);
    f.detectChanges();
    http.expectOne(`${base}/dashboard`).flush(envelope(dashboard));
    f.componentInstance.openId('goals', goal.id);
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(goal));
    f.detectChanges();
    flushView('goals', goal);
    f.detectChanges();
    const detail = f.debugElement.query(By.directive(GovernanceDetail))
      .componentInstance as GovernanceDetail;
    detail.request('calculate');
    detail.confirm();
    f.detectChanges();
    expect(f.componentInstance.navigationBusy()).toBe(true);
    f.componentInstance.selectTab('dashboard');
    expect(f.componentInstance.selected()?.data.id).toBe(goal.id);
    http.expectOne(`${base}/goals/${goal.id}/calculate`).flush(envelope({ ...goal, version: 4 }));
    f.componentInstance.selectTab('dashboard');
    expect(f.componentInstance.selected()?.data.id).toBe(goal.id);
    flushView('goals', { ...goal, version: 4 });
    f.detectChanges();
    expect(f.componentInstance.navigationBusy()).toBe(false);
    f.componentInstance.selectTab('dashboard');
    f.detectChanges();
    http.expectOne(`${base}/dashboard`).flush(envelope(dashboard));
    expect(f.componentInstance.selected()).toBeNull();
  });
  it('serializes mutations, applies field errors, request IDs and Retry-After', () => {
    const f = detail('frameworks', framework);
    const c = f.componentInstance;
    c.edit();
    f.detectChanges();
    const d = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    d.submit();
    d.submit();
    const r = http.expectOne(`${base}/frameworks/${framework.id}`);
    r.flush(
      {
        code: 'VALIDATION_ERROR',
        requestId: 'validation-ref',
        errors: [{ field: 'name', code: 'invalid', message: 'Nome recusado' }],
      },
      { status: 400, statusText: 'Invalid' },
    );
    expect(d.form().get('name')!.errors?.['server']).toBe('Nome recusado');
    expect(c.session.state.error()).toContain('validation-ref');
    d.form().get('name')!.setValue('Novo nome');
    d.submit();
    http
      .expectOne(`${base}/frameworks/${framework.id}`)
      .flush(
        { code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429, statusText: 'Slow down', headers: new HttpHeaders({ 'Retry-After': '4' }) },
      );
    d.submit();
    expect(c.session.state.wait()).toBe(4);
    http.expectNone((req) => req.method === 'PATCH');
  });
  it('uses server-visible dashboard counts, null indices, attention and no recalculation', () => {
    const f = TestBed.createComponent(GovernanceDashboard);
    f.componentRef.setInput('workspaceId', 'w');
    f.detectChanges();
    http.expectOne(`${base}/dashboard`).flush(envelope(dashboard));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sem valor aplicável');
    expect(f.nativeElement.textContent).toContain('Evidências vencidas');
    expect(f.nativeElement.textContent).toContain('nem representa certificação');
    expect(f.componentInstance.data()?.goals.active).toBe(1);
    http.expectNone((r) => r.url.endsWith('/calculate'));
  });
  it('filters collections with only the scoped link IDs accepted by the endpoint', () => {
    const f = TestBed.createComponent(GovernanceCollection);
    f.componentRef.setInput('workspace', workspace);
    f.componentRef.setInput('kind', 'actions');
    f.detectChanges();
    http.expectOne((r) => r.url === `${base}/actions`).flush(page([action]));
    const c = f.componentInstance;
    c.reference = goal.id;
    c.controlFilter = assessed.id;
    c.search({ q: 'Revisar', status: 'OPEN' });
    const r = http.expectOne((req) => req.url === `${base}/actions`);
    expect(r.request.params.get('goalId')).toBe(goal.id);
    expect(r.request.params.get('controlAssessmentId')).toBe(assessed.id);
    r.flush(page([action]));
    c.reference = 'invalid';
    c.search({});
    http.expectNone((req) => req.url === `${base}/actions`);
  });
  it('marks governance in the sidebar and excludes Workspaces for scoped/query routes', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(
      '/workspaces/w/governance?tab=goals',
    );
    const f = TestBed.createComponent(AppShell);
    f.detectChanges();
    expect(f.componentInstance.isGovernanceSection()).toBe(true);
    expect(f.componentInstance.isWorkspaceSection()).toBe(false);
    expect(f.nativeElement.querySelector('[aria-current="page"]').textContent.trim()).toBe(
      'Governança',
    );
  });
});

describe('Section tree limits', () => {
  it('prevents cycles and missing parents, permitting root and valid reordering', () => {
    const child = { ...section, id: id(20), parentSectionId: section.id };
    expect(sectionDescendants(section.id, [section, child])).toEqual(
      new Set([section.id, child.id]),
    );
    expect(validSectionMove(section.id, child.id, [section, child])).toBe(false);
    expect(validSectionMove(section.id, id(99), [section, child])).toBe(false);
    expect(validSectionMove(child.id, null, [section, child])).toBe(true);
  });
  it('allows exactly 20 levels and rejects insertion or movement to 21', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ...section,
      id: id(i + 100),
      parentSectionId: i ? id(i + 99) : null,
    }));
    expect(validSectionMove(null, rows[18].id, rows)).toBe(true);
    expect(validSectionMove(null, rows[19].id, rows)).toBe(false);
  });
});

describe('Framework repository experience', () => {
  const childSection: Section = {
    ...section,
    id: id(21),
    code: 'FILHA',
    name: 'Revisão',
    parentSectionId: section.id,
    position: 4,
  };
  const otherSection: Section = {
    ...section,
    id: id(22),
    code: 'OUTRA',
    name: 'Outra seção',
    position: 2,
  };
  const childControl: Control = {
    ...control,
    id: id(23),
    code: 'REVISAO',
    sectionId: childSection.id,
    active: false,
  };
  function repository() {
    const f = detail('frameworks', framework);
    f.componentInstance.session.view.update((v) => ({
      ...v,
      sections: [section, childSection, otherSection],
      controls: [control, childControl],
    }));
    f.detectChanges();
    const definition = f.debugElement.query(By.directive(FrameworkDefinition))
      .componentInstance as FrameworkDefinition;
    const tree = f.debugElement.query(By.directive(SectionTree)).componentInstance as SectionTree;
    return { f, definition, tree };
  }
  it('navigates a hierarchy with complete branch counts and searches children while retaining ancestors', () => {
    const { f, definition, tree } = repository();
    expect(tree.counts().branches.get(section.id)).toBe(2);
    expect(tree.counts().direct.get(section.id)).toBe(1);
    expect(tree.counts().branches.get(otherSection.id) ?? 0).toBe(0);
    tree.selected.emit(section.id);
    f.detectChanges();
    expect(definition.visibleControls().map((c) => c.id)).toEqual([control.id, childControl.id]);
    definition.includeDescendants = false;
    expect(definition.visibleControls().map((c) => c.id)).toEqual([control.id]);
    definition.activeFilter = 'false';
    definition.includeDescendants = true;
    expect(definition.visibleControls().map((c) => c.id)).toEqual([childControl.id]);
    expect(tree.counts().branches.get(section.id)).toBe(2);
    tree.collapseAll();
    expect(tree.rows().some((row) => row.section.id === childSection.id)).toBe(false);
    tree.term.set('FILHA');
    expect(tree.rows().map((row) => [row.section.id, row.depth])).toEqual([
      [section.id, 0],
      [childSection.id, 1],
    ]);
    expect(f.nativeElement.querySelector('.framework-controls-table')).toBeTruthy();
  });
  it('creates controls in the selected section, prevents double submits, and uses the returned version for the next write', () => {
    const { f, definition, tree } = repository();
    tree.selected.emit(childSection.id);
    f.detectChanges();
    const code = f.nativeElement.querySelector('#framework-quick-code') as HTMLInputElement;
    const title = f.nativeElement.querySelector('#framework-quick-title') as HTMLInputElement;
    code.value = 'REV-2';
    code.dispatchEvent(new Event('input'));
    title.value = '  Aprovar revisão  ';
    title.dispatchEvent(new Event('input'));
    definition.quickCreate();
    definition.quickCreate();
    const req = http.expectOne(`${base}/frameworks/${framework.id}/controls`);
    expect(req.request.body).toEqual({
      version: 7,
      sectionId: childSection.id,
      code: 'REV-2',
      title: 'Aprovar revisão',
      weight: 1,
      active: true,
    });
    definition.selectSection(otherSection.id);
    expect(definition.selectedId()).toBe(childSection.id);
    f.detectChanges();
    expect(f.nativeElement.querySelector('#framework-quick-code')).toBe(code);
    expect(code.closest('fieldset')!.disabled).toBe(true);
    const created = {
      ...control,
      id: id(24),
      sectionId: childSection.id,
      code: 'REV-2',
      title: 'Aprovar revisão',
    };
    req.flush(envelope({ control: created, frameworkVersion: 10 }));
    f.detectChanges();
    expect(f.debugElement.query(By.directive(FrameworkDefinition)).componentInstance).toBe(
      definition,
    );
    expect(definition.selectedId()).toBe(childSection.id);
    definition.quickCreate();
    http.expectNone((r) => r.method === 'POST');
    flushView(
      'frameworks',
      { ...framework, version: 10 },
      [section, childSection, otherSection],
      [control, childControl, created],
    );
    f.detectChanges();
    expect(definition.quickForm.getRawValue()).toEqual({ code: '', title: '' });
    expect(tree.counts().branches.get(section.id)).toBe(3);
    definition.quickForm.setValue({ code: 'REV-3', title: 'Próxima revisão' });
    definition.quickCreate();
    const next = http.expectOne(`${base}/frameworks/${framework.id}/controls`);
    expect(next.request.body.version).toBe(10);
    expect(next.request.body.sectionId).toBe(childSection.id);
    next.flush(
      envelope({ control: { ...created, id: id(25), code: 'REV-3' }, frameworkVersion: 11 }),
    );
    flushView(
      'frameworks',
      { ...framework, version: 11 },
      [section, childSection, otherSection],
      [control, childControl, created],
    );
  });
  it('preselects context and appends sibling position for a new subsection, preserving quick fields in the full editor', () => {
    const { f, definition, tree } = repository();
    tree.selected.emit(section.id);
    definition.openSection(undefined, section.id);
    expect(definition.editor()!.fields.find((f) => f.key === 'parentSectionId')!.value).toBe(
      section.id,
    );
    expect(definition.editor()!.fields.find((f) => f.key === 'position')!.value).toBe(5);
    definition.editor.set(null);
    definition.quickForm.setValue({ code: 'NOVO', title: 'Controle em elaboração' });
    definition.openControl();
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    expect(dialog.form().get('sectionId')!.value).toBe(section.id);
    expect(dialog.form().get('code')!.value).toBe('NOVO');
    expect(dialog.form().get('title')!.value).toBe('Controle em elaboração');
    dialog.closed.emit();
    expect(definition.quickForm.controls.title.value).toBe('Controle em elaboração');
  });
  it('moves only the section link using the aggregate version and refreshes the affected counts', () => {
    const { f, definition, tree } = repository();
    tree.selected.emit(section.id);
    definition.openMove(control);
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.form().get('sectionId')!.setValue(otherSection.id);
    dialog.submit();
    const req = http.expectOne(`${base}/frameworks/${framework.id}/controls/${control.id}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ version: 7, sectionId: otherSection.id });
    const moved = { ...control, sectionId: otherSection.id };
    req.flush(envelope({ control: moved, frameworkVersion: 9 }));
    flushView(
      'frameworks',
      { ...framework, version: 9 },
      [section, childSection, otherSection],
      [moved, childControl],
    );
    f.detectChanges();
    expect(definition.editor()).toBeNull();
    expect(definition.selectedId()).toBe(section.id);
    expect(tree.counts().branches.get(section.id)).toBe(1);
    expect(tree.counts().branches.get(otherSection.id)).toBe(1);
    expect(definition.visibleControls().map((c) => c.id)).toEqual([childControl.id]);
  });
  it('validates quick fields and keeps the draft visible after a concurrent write until reviewed', () => {
    const { f, definition, tree } = repository();
    tree.selected.emit(section.id);
    definition.quickForm.setValue({ code: 'inválido', title: '   ' });
    definition.quickCreate();
    http.expectNone((r) => r.method === 'POST');
    definition.quickForm.setValue({ code: 'NOVO', title: 'Meu controle' });
    definition.quickCreate();
    http
      .expectOne(`${base}/frameworks/${framework.id}/controls`)
      .flush({ code: 'GOVERNANCE_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    f.detectChanges();
    expect(definition.quickForm.getRawValue()).toEqual({ code: 'NOVO', title: 'Meu controle' });
    expect(f.nativeElement.querySelector('#framework-quick-code')?.value).toBe('NOVO');
    expect(
      f.nativeElement.querySelector('#framework-quick-code')?.closest('fieldset')?.disabled,
    ).toBe(true);
    definition.quickCreate();
    http.expectNone((r) => r.method === 'POST');
    f.componentInstance.session.reload();
    flushView(
      'frameworks',
      { ...framework, version: 12 },
      [section, childSection, otherSection],
      [control, childControl],
    );
    f.componentInstance.session.review();
    definition.quickCreate();
    const retry = http.expectOne(`${base}/frameworks/${framework.id}/controls`);
    expect(retry.request.body.version).toBe(12);
    retry.flush(envelope({ control: { ...control, id: id(24) }, frameworkVersion: 13 }));
    flushView('frameworks', { ...framework, version: 13 });
  });
  it('keeps browsing and counts available without exposing writes to read-only or archived frameworks', () => {
    const { f, definition, tree } = repository();
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['governance.read'],
    });
    tree.selected.emit(section.id);
    f.detectChanges();
    expect(definition.visibleControls()).toHaveLength(2);
    expect(f.nativeElement.querySelector('#framework-quick-code')).toBeNull();
    definition.quickCreate();
    definition.openMove(control);
    expect(definition.editor()).toBeNull();
    http.expectNone((r) => r.method !== 'GET');
    TestBed.inject(WorkspaceContext).selected.set(workspace);
    f.componentInstance.session.view.update((v) => ({
      ...v,
      item: { ...framework, status: 'ARCHIVED' },
    }));
    f.detectChanges();
    definition.quickCreate();
    definition.openMove(control);
    expect(definition.editor()).toBeNull();
    expect(f.nativeElement.querySelector('#framework-quick-code')).toBeNull();
  });
});

describe('Framework progress and section goals', () => {
  const summary: ProgressSummary = {
    state: 'AVAILABLE',
    totalControls: 4,
    applicableControls: 4,
    assessedControls: 3,
    counts: { NOT_ASSESSED: 1, NOT_MET: 0, PARTIALLY_MET: 1, MET: 2, NOT_APPLICABLE: 0 },
    index: { value: 62.5, numerator: 250, denominator: 4 },
    completionPercent: 50,
    assessmentPercent: 75,
    completed: false,
  };
  function progress(a = assessment): FrameworkProgress {
    return {
      generatedAt: time,
      indicatorType: 'INTERNAL',
      state: a.status,
      framework: {
        id: framework.id,
        code: framework.code,
        name: framework.name,
        version: framework.version,
      },
      assessment: {
        id: a.id,
        name: a.name,
        status: a.status,
        version: a.version,
        definitionVersion: a.frameworkSnapshot.version,
        assessmentDate: a.assessmentDate,
        closedAt: a.closedAt,
      },
      definitionVersionDiffers: true,
      summary,
      sections: [{ ...section, direct: summary, subtree: summary }],
    };
  }
  it('uses only the assessment query parameter for progress and retains the exact historical source', () => {
    TestBed.inject(GovernanceApi).progress('w', framework.id, assessment.id).subscribe();
    const request = http.expectOne((r) => r.url === `${base}/frameworks/${framework.id}/progress`);
    expect(request.request.params.keys()).toEqual(['assessmentId']);
    expect(request.request.params.get('assessmentId')).toBe(assessment.id);
    request.flush(envelope(progress()));
  });
  it('shows empty/not applicable states without inferring 100% completion', () => {
    expect(progressLabel(null)).toBe('Sem avaliação');
    expect(
      progressLabel({
        ...summary,
        state: 'EMPTY',
        index: { value: null, numerator: 0, denominator: 0 },
      }),
    ).toBe('Sem itens');
    expect(
      progressLabel({
        ...summary,
        state: 'NOT_APPLICABLE',
        index: { value: null, numerator: 0, denominator: 0 },
      }),
    ).toBe('Não aplicável');
    expect(progressLabel(summary)).toBe('62,5%');
  });
  it('marks the definition control ID using the current assessment version and retains section selection after refresh', () => {
    const f = detail('assessments', assessment),
      controls = f.debugElement.query(By.directive(AssessmentControls))
        .componentInstance as AssessmentControls;
    controls.chooseSection(section.id);
    controls.markMet(assessed);
    controls.markMet(assessed);
    const request = http.expectOne(`${base}/assessments/${assessment.id}/controls/${control.id}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ version: 9, status: 'MET' });
    const updated = {
      ...assessment,
      version: 10,
      index: { ...assessment.index, value: 100, assessedControls: 1, numerator: 300 },
    };
    request.flush(envelope(updated));
    flushView(
      'assessments',
      updated,
      [section],
      [control],
      [{ ...assessed, status: 'MET', score: 100 }],
    );
    f.detectChanges();
    const after = f.debugElement.query(By.directive(AssessmentControls))
      .componentInstance as AssessmentControls;
    expect(after).toBe(controls);
    expect(after.sectionId()).toBe(section.id);
    expect(after.summary()?.index.value).toBe(100);
    expect(f.componentInstance.session.item().version).toBe(10);
  });
  it('keeps aggregate progress independent from table search and status filters', () => {
    const f = detail('assessments', assessment),
      controls = f.debugElement.query(By.directive(AssessmentControls))
        .componentInstance as AssessmentControls;
    f.componentInstance.session.view.update((view) => ({ ...view, progress: progress() }));
    controls.search.set('No match');
    controls.statusFilter = 'MET';
    expect(controls.rows()).toHaveLength(0);
    expect(controls.summary()).toBe(summary);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('62,5%');
  });
  it('blocks classification when reads returned different aggregate versions', () => {
    const f = detail('assessments', assessment),
      s = f.componentInstance.session;
    s.reload();
    http.expectOne(`${base}/assessments/${assessment.id}`).flush(envelope(assessment));
    http
      .expectOne((r) => r.url === `${base}/assessments/${assessment.id}/controls`)
      .flush(page([assessed]));
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/progress`)
      .flush(envelope(progress({ ...assessment, version: 10 })));
    expect(s.locked()).toBe(true);
    expect(s.read.error()).toContain('alterado');
    const controls = f.debugElement.query(By.directive(AssessmentControls))
      .componentInstance as AssessmentControls;
    controls.markMet(assessed);
    http.expectNone((r) => r.method === 'PUT');
    s.reload();
    flushView('assessments', { ...assessment, version: 10 });
    expect(s.locked()).toBe(false);
  });
  it('renders a framework without a current assessment and never starts one implicitly', () => {
    const f = TestBed.createComponent(FrameworkTracking);
    f.componentRef.setInput('framework', framework);
    f.componentRef.setInput('canCreate', true);
    f.detectChanges();
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/progress`)
      .flush(
        envelope({
          ...progress(),
          state: 'NO_ASSESSMENT',
          assessment: null,
          summary: null,
          sections: [],
        }),
      );
    http
      .expectOne((r) => r.url === `${base}/assessments`)
      .flush(page([{ ...assessment, status: 'DRAFT' }]));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('ainda não tem uma avaliação');
    expect(f.nativeElement.querySelector('app-framework-assessment')).toBeNull();
    http.expectNone((r) => r.method !== 'GET');
  });
  it('opens the explicit draft snapshot read-only with an explicit start action', () => {
    const draft = { ...assessment, status: 'DRAFT' as const };
    const f = TestBed.createComponent(FrameworkTracking);
    f.componentRef.setInput('framework', framework);
    f.componentRef.setInput('initialAssessmentId', draft.id);
    f.detectChanges();
    const read = http.expectOne((r) => r.url === `${base}/frameworks/${framework.id}/progress`);
    expect(read.request.params.get('assessmentId')).toBe(draft.id);
    read.flush(envelope(progress(draft)));
    http.expectOne((r) => r.url === `${base}/assessments`).flush(page([draft]));
    http.expectOne(`${base}/assessments/${draft.id}`).flush(envelope(draft));
    f.detectChanges();
    flushView('assessments', draft);
    f.detectChanges();
    const child = f.debugElement.query(By.directive(FrameworkAssessment))
      .componentInstance as FrameworkAssessment;
    expect(child.session.assessable()).toBe(false);
    expect(f.nativeElement.textContent).toContain('Abrir avaliação para iniciar');
    expect(f.nativeElement.textContent).toContain('Hierarquia e pesos preservados na avaliação');
    http.expectNone((r) => r.method !== 'GET');
  });
  it('prefills a section goal with framework, target and dependent section choices', () => {
    const f = TestBed.createComponent(GovernanceCreate);
    f.componentRef.setInput('workspace', workspace);
    f.componentRef.setInput('kind', 'goals');
    f.componentRef.setInput('links', { frameworkId: framework.id, sectionId: section.id });
    f.detectChanges();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    http.expectOne(`${base}/metrics`).flush(envelope(metrics));
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/sections`)
      .flush(page([section]));
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    expect(dialog.form().get('goalType')?.value).toBe('GOVERNANCE_SCORE');
    expect(dialog.form().get('sectionId')?.value).toBe(section.id);
    expect(dialog.form().get('targetValue')?.value).toBe(100);
    dialog.form().get('name')?.setValue('Atender Level 2');
    dialog.submit();
    const request = http.expectOne(`${base}/goals`);
    expect(request.request.body.sectionId).toBe(section.id);
    expect(request.request.body.frameworkId).toBe(framework.id);
    expect(request.request.body.projectId).toBeNull();
    request.flush(envelope({ ...goal, sectionId: section.id }));
  });
  it('preserves the entire goal draft when a different framework loads its section selector', () => {
    const nextFramework = { ...framework, id: id(40), name: 'Outro framework' },
      nextSection = { ...section, id: id(41), frameworkId: id(40) };
    const f = TestBed.createComponent(GovernanceCreate);
    f.componentRef.setInput('workspace', workspace);
    f.componentRef.setInput('kind', 'goals');
    f.detectChanges();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework, nextFramework]));
    http.expectOne(`${base}/metrics`).flush(envelope(metrics));
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.form().patchValue({
      name: 'Meu rascunho',
      description: 'Texto',
      goalType: 'GOVERNANCE_SCORE',
      frameworkId: nextFramework.id,
      sectionId: section.id,
      targetValue: 95.25,
      deadline: '2026-12-31',
    });
    f.componentInstance.changeFields({
      key: 'frameworkId',
      values: dialog.form().getRawValue(),
      form: dialog.form(),
    });
    http
      .expectOne((r) => r.url === `${base}/frameworks/${nextFramework.id}/sections`)
      .flush(page([nextSection]));
    f.detectChanges();
    expect(dialog.form().get('name')?.value).toBe('Meu rascunho');
    expect(dialog.form().get('targetValue')?.value).toBe(95.25);
    expect(dialog.form().get('deadline')?.value).toBe('2026-12-31');
    expect(dialog.form().get('sectionId')?.value).toBe('');
    expect(
      f.componentInstance
        .fields()
        ?.find((field) => field.key === 'sectionId')
        ?.options?.map((row) => row.value),
    ).toEqual(['', nextSection.id]);
  });
  it('rejects section goals for incompatible metrics or another framework', () => {
    const values = {
      name: 'Meta',
      goalType: 'AUTOMATION_COVERAGE',
      operator: 'GTE',
      targetValue: 80,
      frameworkId: '',
      projectId: '',
      sectionId: section.id,
    };
    expect(
      recordBody('goals', values, form(values), { ...emptyCatalogs, sections: [section] }),
    ).toBeNull();
    const wrong = { ...values, goalType: 'GOVERNANCE_SCORE', frameworkId: id(42) };
    expect(
      recordBody('goals', wrong, form(wrong), { ...emptyCatalogs, sections: [section] }),
    ).toBeNull();
  });
  it('blocks saving during a section catalog failure and preserves the draft on retry', () => {
    const f = TestBed.createComponent(GovernanceCreate);
    f.componentRef.setInput('workspace', workspace);
    f.componentRef.setInput('kind', 'goals');
    f.detectChanges();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    http.expectOne(`${base}/metrics`).flush(envelope(metrics));
    f.detectChanges();
    const dialog = f.debugElement.query(By.directive(FormDialog)).componentInstance as FormDialog;
    dialog.form().patchValue({
      name: 'Meta preservada',
      goalType: 'GOVERNANCE_SCORE',
      frameworkId: framework.id,
      targetValue: 95,
      deadline: '2026-12-31',
    });
    f.componentInstance.changeFields({
      key: 'frameworkId',
      values: dialog.form().getRawValue(),
      form: dialog.form(),
    });
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/sections`)
      .flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    dialog.submit();
    http.expectNone((r) => r.method === 'POST');
    f.componentInstance.load();
    http.expectOne((r) => r.url === `${base}/frameworks`).flush(page([framework]));
    http.expectOne(`${base}/metrics`).flush(envelope(metrics));
    http
      .expectOne((r) => r.url === `${base}/frameworks/${framework.id}/sections`)
      .flush(page([section]));
    f.detectChanges();
    expect(dialog.form().get('name')?.value).toBe('Meta preservada');
    expect(dialog.form().get('targetValue')?.value).toBe(95);
    expect(dialog.form().get('deadline')?.value).toBe('2026-12-31');
    expect(f.componentInstance.read.error()).toBe('');
  });
});

describe('Evidence upload inside framework tracking', () => {
  const uploadPath = '/api/v1/workspaces/w/attachments';
  function editor() {
    const result = assessmentEvidence(true, []);
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: [...workspace.permissions!, 'attachment.read', 'attachment.upload'],
    });
    result.e.open('UPLOAD');
    result.f.detectChanges();
    const dialog = result.f.debugElement.query(By.directive(FormDialog))
      .componentInstance as FormDialog;
    const localFile = new File(['Evidência de revisão'], file.originalName, { type: 'text/plain' });
    result.e.selectFile({ target: { files: [localFile], value: 'selected' } } as unknown as Event);
    result.f.detectChanges();
    return { ...result, dialog, localFile };
  }
  function finishUpload(f: ReturnType<typeof editor>['f'], version = 10) {
    http.expectOne(evidencePath).flush(envelope({ ...assessment, version }));
    flushView('assessments', { ...assessment, version });
    expect(f.componentInstance.session.state.busy()).toBe(true);
    http
      .expectOne((r) => r.url === evidencePath)
      .flush(
        page([
          {
            ...evidence,
            evidenceType: 'ATTACHMENT',
            referenceId: file.id,
            url: null,
            attachmentAvailable: true,
            attachmentSnapshot: {
              originalName: file.originalName,
              contentType: file.contentType,
              sizeBytes: file.sizeBytes,
              checksum: file.checksum,
            },
          },
        ]),
      );
    f.detectChanges();
  }
  it('uploads and binds in one save, preserves the draft and serializes the entire operation', () => {
    const { f, e, dialog, localFile } = editor();
    expect(dialog.form().get('title')?.value).toBe(file.originalName);
    dialog.form().patchValue({ title: 'Ata de revisão', validUntil: '2026-12-31' });
    dialog.submit();
    dialog.submit();
    const upload = http.expectOne(uploadPath);
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body instanceof FormData).toBe(true);
    expect((upload.request.body as FormData).get('file')).toBe(localFile);
    expect(upload.request.headers.has('Content-Type')).toBe(false);
    expect(f.componentInstance.session.state.busy()).toBe(true);
    http.expectNone(evidencePath);
    upload.flush(envelope(file));
    const binding = http.expectOne(evidencePath);
    expect(binding.request.body).toEqual({
      version: 9,
      evidenceType: 'ATTACHMENT',
      title: 'Ata de revisão',
      validUntil: '2026-12-31',
      referenceId: file.id,
    });
    expect(e.chosen()).toEqual(file);
    expect(f.componentInstance.session.state.busy()).toBe(true);
    expect(dialog.form().get('title')?.value).toBe('Ata de revisão');
    binding.flush(envelope({ ...assessment, version: 10 }));
    flushView('assessments', { ...assessment, version: 10 });
    http.expectOne((r) => r.url === evidencePath).flush(page([evidence]));
    f.detectChanges();
    expect(e.editor()).toBeNull();
    expect(f.componentInstance.session.item().version).toBe(10);
    http.expectNone((r) => r.method === 'PUT' || r.method === 'DELETE');
  });
  it('retains a confirmed upload after a binding conflict and retries only the binding using the reviewed version', () => {
    const { f, e, dialog } = editor();
    dialog.form().get('title')!.setValue('Meu rascunho');
    dialog.submit();
    http.expectOne(uploadPath).flush(envelope(file));
    http
      .expectOne(evidencePath)
      .flush({ code: 'GOVERNANCE_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(e.chosen()?.id).toBe(file.id);
    expect(e.file()).toBeNull();
    expect(e.uploadUncertain()).toBe(false);
    dialog.submit();
    http.expectNone((r) => r.method === 'POST');
    const s = f.componentInstance.session;
    s.reload();
    flushView('assessments', { ...assessment, version: 12 });
    http.expectOne((r) => r.url === evidencePath).flush(page([]));
    s.review();
    f.detectChanges();
    expect(dialog.form().get('title')?.value).toBe('Meu rascunho');
    dialog.submit();
    const retry = http.expectOne(evidencePath);
    expect(retry.request.body.version).toBe(12);
    expect(retry.request.body.referenceId).toBe(file.id);
    http.expectNone(uploadPath);
    retry.flush(envelope({ ...assessment, version: 13 }));
    flushView('assessments', { ...assessment, version: 13 });
    http.expectOne((r) => r.url === evidencePath).flush(page([evidence]));
  });
  it('recovers an uncertain upload from the local library without uploading again', () => {
    const { f, e, dialog } = editor();
    dialog.submit();
    http
      .expectOne(uploadPath)
      .flush(
        { code: 'ATTACHMENT_STORAGE_UNAVAILABLE' },
        { status: 503, statusText: 'Unavailable' },
      );
    expect(e.uploadUncertain()).toBe(true);
    http.expectNone(evidencePath);
    f.detectChanges();
    http.expectOne((r) => r.url === uploadPath).flush(page([file]));
    const s = f.componentInstance.session;
    s.reload();
    flushView('assessments', assessment);
    http.expectOne((r) => r.url === evidencePath).flush(page([]));
    s.review();
    f.detectChanges();
    dialog.submit();
    http.expectNone((r) => r.method === 'POST');
    e.choose(file);
    f.detectChanges();
    expect(e.uploadUncertain()).toBe(false);
    dialog.submit();
    const binding = http.expectOne(evidencePath);
    expect(binding.request.body.referenceId).toBe(file.id);
    http.expectNone(uploadPath);
    binding.flush(envelope({ ...assessment, version: 10 }));
    flushView('assessments', { ...assessment, version: 10 });
    http.expectOne((r) => r.url === evidencePath).flush(page([evidence]));
  });
  it('requires inspecting the local library and explicit retry after an uncertain upload', () => {
    const { f, e, dialog } = editor();
    dialog.submit();
    http
      .expectOne(uploadPath)
      .flush({ code: 'UNAVAILABLE' }, { status: 500, statusText: 'Unavailable' });
    f.detectChanges();
    const catalog = http.expectOne((r) => r.url === uploadPath);
    e.retryUpload();
    expect(e.uploadUncertain()).toBe(true);
    catalog.flush(page([]));
    const s = f.componentInstance.session;
    s.reload();
    flushView('assessments', assessment);
    http.expectOne((r) => r.url === evidencePath).flush(page([]));
    s.review();
    expect(e.canRetryUpload()).toBe(true);
    http.expectNone((r) => r.method === 'POST');
    e.retryUpload();
    f.detectChanges();
    dialog.submit();
    http.expectOne(uploadPath).flush(envelope(file));
    finishUpload(f);
  });
  it('blocks invalid, empty and oversized files before uploading', () => {
    const { e, dialog } = editor();
    const large = new File(['content'], 'large.txt', { type: 'text/plain' });
    Object.defineProperty(large, 'size', { value: 10 * 1048576 + 1 });
    for (const candidate of [
      new File(['x'], 'program.exe', { type: 'application/octet-stream' }),
      new File([], 'empty.txt', { type: 'text/plain' }),
      large,
    ]) {
      e.selectFile({ target: { files: [candidate], value: 'selected' } } as unknown as Event);
      expect(e.file()).toBeNull();
      expect(e.fileError()).toContain('10 MiB');
      dialog.submit();
      http.expectNone((r) => r.method === 'POST');
    }
  });
  it('validates the evidence date before uploading any file', () => {
    const { e } = editor();
    const values = { title: 'Arquivo', validUntil: '2026-02-30' },
      draft = form(values);
    e.save({ values, form: draft });
    expect(draft.get('validUntil')!.errors?.['server']).toBeTruthy();
    http.expectNone((r) => r.method === 'POST');
  });
  it('cancels a pending upload when leaving the framework and never starts the binding', () => {
    const { f, dialog } = editor();
    dialog.submit();
    const upload = http.expectOne(uploadPath);
    f.destroy();
    expect(upload.cancelled).toBe(true);
    http.expectNone(evidencePath);
  });
  it('rechecks permission before binding a newly uploaded file', () => {
    const { dialog } = editor();
    dialog.submit();
    const upload = http.expectOne(uploadPath);
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['governance.read', 'attachment.read', 'attachment.upload'],
    });
    upload.flush(envelope(file));
    http.expectNone(evidencePath);
  });
  it('keeps library selection available without upload permission and explains the restriction', () => {
    const { f, e } = assessmentEvidence(true, []);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('permissão de envio de anexos');
    e.open('UPLOAD');
    expect(e.editor()).toBeNull();
    e.open('ATTACHMENT');
    expect(e.editor()?.mode).toBe('ATTACHMENT');
  });
  it.each(['DRAFT', 'CLOSED'] as const)(
    'explains the %s restriction and prevents upload/binding',
    (status) => {
      const { f, e } = assessmentEvidence(true, []);
      const s = f.componentInstance.session;
      s.view.update((v) => ({ ...v, item: { ...assessment, status } }));
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain(
        status === 'DRAFT' ? 'está em rascunho' : 'foi encerrada',
      );
      e.open('UPLOAD');
      expect(e.editor()).toBeNull();
      http.expectNone((r) => r.method === 'POST');
    },
  );
  it('explains missing assessment permission instead of silently hiding all inclusion options', () => {
    const { f, e } = assessmentEvidence(true, []);
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['governance.read', 'attachment.read', 'attachment.upload'],
    });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('solicite permissão para avaliar');
    e.open('UPLOAD');
    expect(e.editor()).toBeNull();
    http.expectNone((r) => r.method === 'POST');
  });
  it('starts a draft assessment explicitly from evidence and unlocks inclusion after refresh', () => {
    const { f, e } = assessmentEvidence(true, []);
    const s = f.componentInstance.session;
    s.view.update((v) => ({ ...v, item: { ...assessment, status: 'DRAFT' } }));
    f.detectChanges();
    expect(e.canStart()).toBe(true);
    e.start();
    http.expectNone((r) => r.method === 'POST');
    e.starting.set(true);
    e.start();
    const start = http.expectOne(`${base}/assessments/${assessment.id}/start`);
    expect(start.request.body).toEqual({ version: 9 });
    start.flush(envelope({ ...assessment, version: 10 }));
    flushView('assessments', { ...assessment, version: 10 });
    http.expectOne((r) => r.url === evidencePath).flush(page([]));
    f.detectChanges();
    expect(e.starting()).toBe(false);
    expect(e.canEdit()).toBe(true);
    e.open('ATTACHMENT');
    expect(e.editor()?.mode).toBe('ATTACHMENT');
  });
  it('does not upload when the control already reached the evidence limit', () => {
    const { e, dialog } = editor();
    e.list.pagination.update((current) => ({ ...current!, totalItems: 100 }));
    e.save({ values: dialog.form().getRawValue(), form: dialog.form() });
    http.expectNone((r) => r.method === 'POST');
  });
});

describe('Existing improvement actions linked to goals', () => {
  function setup(item: Goal = goal) {
    const f = detail('goals', item);
    const c = f.debugElement.query(By.directive(GoalActions)).componentInstance as GoalActions;
    return { f, c };
  }
  function select(c: GoalActions, item: Action = action, current: Action = item, removing = false) {
    c.select(item, removing);
    http.expectOne(`${base}/actions/${item.id}`).flush(envelope(current));
    if (current.goalId)
      http
        .expectOne(`${base}/goals/${current.goalId}`)
        .flush(envelope({ ...goal, id: current.goalId }));
  }
  function flushResult(c: GoalActions, updated: Action) {
    const currentGoal = { ...goal, version: goal.version + 1 };
    http.expectOne(`${base}/actions/${updated.id}`).flush(envelope(updated));
    if (updated.goalId)
      http.expectOne(`${base}/goals/${updated.goalId}`).flush(envelope(currentGoal));
    for (const request of http.match((r) => r.url.startsWith(`${base}/goals/`))) {
      request.flush(envelope({ ...currentGoal, id: request.request.url.split('/').pop()! }));
    }
    for (const request of http.match(
      (r) => r.url === `${base}/actions` && r.params.has('goalId'),
    )) {
      request.flush(page(request.request.params.get('goalId') === updated.goalId ? [updated] : []));
    }
    http.expectOne(`${base}/dashboard`).flush(envelope(dashboard));
    http
      .expectOne((r) => r.url === `${base}/actions` && r.params.get('goalId') === goal.id)
      .flush(page(updated.goalId ? [updated] : []));
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(currentGoal));
  }
  it('searches and paginates workspace actions without restricting to the destination goal', () => {
    const { c } = setup();
    c.choose();
    const first = http.expectOne((r) => r.url === `${base}/actions`);
    expect(first.request.params.has('goalId')).toBe(false);
    expect(first.request.params.has('controlAssessmentId')).toBe(false);
    first.flush(page([action], 1, true));
    c.candidates.search({ q: 'evidências', status: 'IN_PROGRESS' });
    const search = http.expectOne((r) => r.url === `${base}/actions`);
    expect(search.request.params.get('q')).toBe('evidências');
    expect(search.request.params.get('status')).toBe('IN_PROGRESS');
    search.flush(page([action], 1, true));
    c.candidates.page(2);
    const second = http.expectOne((r) => r.url === `${base}/actions`);
    expect(second.request.params.get('page')).toBe('2');
    expect(second.request.params.has('goalId')).toBe(false);
    second.flush(page([]));
  });
  it('links with the fresh action version and reloads the new goal version while preserving its control', () => {
    const { c, f } = setup();
    const changed = vi.fn();
    c.changed.subscribe(changed);
    select(c, action, { ...action, version: 12 });
    c.confirm();
    const patch = http.expectOne(`${base}/actions/${action.id}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ version: 12, goalId: goal.id });
    patch.flush(envelope({ ...action, goalId: goal.id, version: 13 }));
    flushResult(c, { ...action, goalId: goal.id, version: 13 });
    expect(f.componentInstance.session.item().version).toBe(goal.version + 1);
    expect(c.linked.rows()[0].controlAssessmentId).toBe(assessed.id);
    expect(c.selection()).toBeNull();
    expect(changed).toHaveBeenCalled();
    http.expectNone((r) => r.method !== 'GET' && !r.url.endsWith(`/actions/${action.id}`));
  });
  it('warns that selecting an action from another goal transfers the association', () => {
    const { c, f } = setup();
    select(c, { ...action, goalId: id(22) });
    f.detectChanges();
    expect(f.nativeElement.querySelector('dialog').textContent).toContain(
      'o vínculo será transferido',
    );
    c.confirm();
    http
      .expectOne(`${base}/actions/${action.id}`)
      .flush(envelope({ ...action, goalId: goal.id, version: 6 }));
    flushResult(c, { ...action, goalId: goal.id, version: 6 });
  });
  it('removes only the goal association using the current action version', () => {
    const { c } = setup();
    select(c, { ...action, goalId: goal.id }, { ...action, goalId: goal.id, version: 9 }, true);
    c.confirm();
    const patch = http.expectOne(`${base}/actions/${action.id}`);
    expect(patch.request.body).toEqual({ version: 9, goalId: null });
    patch.flush(envelope({ ...action, version: 10 }));
    flushResult(c, { ...action, version: 10 });
    expect(c.success()).toContain('desvinculada');
  });
  it('blocks completed, cancelled, already-linked and cross-workspace selections', () => {
    const { c } = setup();
    for (const item of [
      { ...action, status: 'DONE' as const },
      { ...action, status: 'CANCELLED' as const },
      { ...action, goalId: goal.id },
      { ...action, workspaceId: 'another' },
    ])
      c.select(item);
    expect(c.selection()).toBeNull();
    http.expectNone((r) => r.url === `${base}/actions/${action.id}`);
  });
  it('allows removing from a cancelled goal but prevents linking or creating new actions', () => {
    const { c, f } = setup({ ...goal, status: 'CANCELLED' });
    c.choose();
    c.select(action);
    expect(c.picker()).toBe(false);
    expect(c.selection()).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Criar ação desta meta');
    select(c, { ...action, goalId: goal.id }, { ...action, goalId: goal.id }, true);
    expect(c.canConfirm()).toBe(true);
  });
  it('does not write after the source action becomes terminal or its project is archived', () => {
    const { c } = setup();
    select(c, action, { ...action, status: 'DONE' });
    c.confirm();
    expect(c.canConfirm()).toBe(false);
    c.closeSelection();
    c.select({ ...action, goalId: id(22) });
    http.expectOne(`${base}/actions/${action.id}`).flush(envelope({ ...action, goalId: id(22) }));
    http
      .expectOne(`${base}/goals/${id(22)}`)
      .flush(envelope({ ...goal, id: id(22), projectId: project.id }));
    http
      .expectOne(`/api/v1/workspaces/w/projects/${project.id}`)
      .flush(envelope({ ...project, status: 'ARCHIVED' }));
    c.confirm();
    expect(c.canConfirm()).toBe(false);
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('requires read/manage grants and prevents writes after switching workspace', () => {
    const { c } = setup();
    const context = TestBed.inject(WorkspaceContext);
    context.selected.set({ ...workspace, permissions: ['governance.read'] });
    c.choose();
    c.select(action);
    expect(c.selection()).toBeNull();
    context.selected.set(workspace);
    select(c);
    context.selected.set({ ...workspace, id: 'another' });
    c.confirm();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('requires reviewing a concurrent update before PATCH with the latest action version', () => {
    const { c } = setup();
    select(c);
    c.confirm();
    http
      .expectOne(`${base}/actions/${action.id}`)
      .flush({ code: 'GOVERNANCE_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(goal));
    c.confirm();
    http.expectNone((r) => r.method === 'PATCH');
    const s = c.selection()!;
    s.reload();
    http.expectOne(`${base}/actions/${action.id}`).flush(envelope({ ...action, version: 8 }));
    c.confirm();
    http.expectNone((r) => r.method === 'PATCH');
    s.review();
    c.confirm();
    const patch = http.expectOne(`${base}/actions/${action.id}`);
    expect(patch.request.body).toEqual({ version: 8, goalId: goal.id });
    patch.flush(envelope({ ...action, goalId: goal.id, version: 9 }));
    flushResult(c, { ...action, goalId: goal.id, version: 9 });
  });
  it('confirms an applied association after an uncertain response without repeating PATCH', () => {
    const { c } = setup();
    select(c);
    c.confirm();
    http
      .expectOne(`${base}/actions/${action.id}`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    c.confirm();
    http.expectNone((r) => r.method === 'PATCH');
    const s = c.selection()!;
    s.reload();
    http
      .expectOne(`${base}/actions/${action.id}`)
      .flush(envelope({ ...action, goalId: goal.id, version: 6 }));
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(goal));
    s.review();
    c.confirm();
    http.expectNone((r) => r.method === 'PATCH');
    http
      .expectOne((r) => r.url === `${base}/actions`)
      .flush(page([{ ...action, goalId: goal.id, version: 6 }]));
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(goal));
    expect(c.selection()).toBeNull();
  });
  it('does not remove an association transferred by another user since selection', () => {
    const { c } = setup();
    select(c, { ...action, goalId: goal.id }, { ...action, goalId: id(22) }, true);
    c.confirm();
    expect(c.canConfirm()).toBe(false);
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('cancels candidate requests when closing the picker or destroying the goal', () => {
    const { c, f } = setup();
    c.choose();
    const request = http.expectOne((r) => r.url === `${base}/actions`);
    c.closePicker();
    expect(request.cancelled).toBe(true);
    c.choose();
    const again = http.expectOne((r) => r.url === `${base}/actions`);
    f.destroy();
    expect(again.cancelled).toBe(true);
  });
});

describe('Goal completion based on actions', () => {
  const progress = {
    basis: 'ACTIONS' as const,
    totalActions: 3,
    completedActions: 1,
    cancelledActions: 2,
    percent: 33.33,
  };
  const informational = {
    value: 95,
    numerator: 95,
    denominator: 1,
    calculatedAt: time,
    sourceIds: [assessment.id],
  };
  it('shows aggregate action totals and API status independently of metric, target or assessment', () => {
    const f = detail('goals', {
      ...goal,
      actionProgress: progress,
      targetValue: 20,
      status: 'MISSED',
      lastResult: informational,
    });
    const completion = f.nativeElement.querySelector('app-goal-action-progress');
    expect(completion.textContent).toContain('33,33%');
    expect(completion.textContent).toContain('1 de 3 ações válidas concluídas');
    expect(completion.textContent).toContain('2 canceladas');
    expect(f.nativeElement.textContent).toContain('Não atingida no prazo');
    expect(f.nativeElement.textContent).toContain('Métrica informativa / Critério');
    expect(f.nativeElement.textContent).toContain('95');
    expect(f.nativeElement.textContent).toContain('Atualizar métrica informativa');
    expect(f.nativeElement.textContent).not.toContain('Calcular meta');
    http.expectNone((r) => r.url.endsWith('/calculate'));
  });
  it('does not require a closed assessment to show achieved action completion and respects cancellation', () => {
    const complete = { ...progress, completedActions: 3, percent: 100 };
    for (const status of ['ACHIEVED', 'CANCELLED'] as const) {
      const f = detail('goals', {
        ...goal,
        status,
        actionProgress: complete,
        lastResult: { ...informational, value: null, reason: 'NO_CLOSED_ASSESSMENT' },
      });
      expect(f.nativeElement.querySelector('app-goal-action-progress').textContent).toContain(
        '100%',
      );
      expect(f.nativeElement.textContent).toContain(
        status === 'CANCELLED' ? 'Cancelada' : 'Atingida',
      );
      expect(f.nativeElement.textContent).toContain('Ainda não há avaliação encerrada');
      f.destroy();
    }
  });
  function actionDetail(item: Action) {
    const f = TestBed.createComponent(GovernanceDetail);
    f.componentRef.setInput('kind', 'actions');
    f.componentRef.setInput('initial', item);
    f.detectChanges();
    http.expectOne(`${base}/actions/${item.id}`).flush(envelope(item));
    http
      .expectOne(`${base}/goals/${goal.id}`)
      .flush(envelope({ ...goal, actionProgress: progress, version: 8 }));
    f.detectChanges();
    return f;
  }
  function refresh(updated: Action, newGoal: Goal) {
    http.expectOne(`${base}/actions/${updated.id}`).flush(envelope(updated));
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(newGoal));
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(newGoal));
    const list = http.expectOne((r) => r.url === `${base}/actions`);
    expect(list.request.params.get('goalId')).toBe(goal.id);
    expect(list.request.params.get('status')).toBe('ALL');
    list.flush(page([updated]));
    http.expectOne(`${base}/dashboard`).flush(envelope(dashboard));
  }
  it('reloads the goal and dashboard after completion and keeps versions and assessments separate', () => {
    const item = { ...action, goalId: goal.id };
    const f = actionDetail(item);
    const c = f.componentInstance;
    c.request('complete');
    c.confirm();
    const request = http.expectOne(`${base}/actions/${action.id}/complete`);
    expect(request.request.body).toEqual({ version: action.version });
    const completed = { ...item, status: 'DONE' as const, version: 6 };
    request.flush(envelope(completed));
    const achieved = {
      ...goal,
      actionProgress: { ...progress, completedActions: 3, percent: 100 },
      version: 9,
      status: 'ACHIEVED' as const,
      lastResult: informational,
    };
    refresh(completed, achieved);
    f.detectChanges();
    expect(c.session.item().version).toBe(6);
    expect(c.session.view().linkedGoal!.version).toBe(9);
    expect(
      f.nativeElement.querySelector('[aria-label="Meta vinculada à ação"]').textContent,
    ).toContain('100%');
    expect(c.session.view().linkedGoal!.lastResult).toEqual(informational);
    http.expectNone((r) => r.url.includes('/assessments/'));
    http.expectNone((r) => r.url.endsWith('/calculate'));
  });
  it('cancelling the last pending action displays achieved from the refreshed goal', () => {
    const item = { ...action, goalId: goal.id };
    const f = actionDetail(item);
    const c = f.componentInstance;
    c.request('cancel');
    c.confirm();
    const request = http.expectOne(`${base}/actions/${action.id}`);
    expect(request.request.body).toEqual({ version: action.version, status: 'CANCELLED' });
    const cancelled = { ...item, status: 'CANCELLED' as const, version: 6 };
    request.flush(envelope(cancelled));
    refresh(cancelled, {
      ...goal,
      status: 'ACHIEVED',
      version: 9,
      actionProgress: {
        ...progress,
        totalActions: 2,
        completedActions: 2,
        cancelledActions: 3,
        percent: 100,
      },
    });
    f.detectChanges();
    expect(c.session.view().linkedGoal!.status).toBe('ACHIEVED');
    expect(
      f.nativeElement.querySelector('[aria-label="Meta vinculada à ação"]').textContent,
    ).toContain('2 de 2 ações válidas concluídas');
  });
  it('blocks another write when the refresh after a confirmed completion fails', () => {
    const item = { ...action, goalId: goal.id };
    const f = actionDetail(item);
    const c = f.componentInstance;
    c.request('complete');
    c.confirm();
    const updated = { ...item, status: 'DONE' as const, version: 6 };
    http.expectOne(`${base}/actions/${action.id}/complete`).flush(envelope(updated));
    http.expectOne(`${base}/actions/${action.id}`).flush(envelope(updated));
    http.expectOne(`${base}/goals/${goal.id}`).flush(envelope(goal));
    http
      .expectOne(`${base}/goals/${goal.id}`)
      .flush({ requestId: 'goal-refresh-error' }, { status: 503, statusText: 'Unavailable' });
    for (const request of http.match(
      (r) => r.url === `${base}/actions` || r.url === `${base}/dashboard`,
    ))
      expect(request.cancelled).toBe(true);
    expect(c.session.state.blocked()).toBe(true);
    expect(c.session.state.error()).toContain('goal-refresh-error');
    c.confirm();
    http.expectNone((r) => r.method === 'POST');
  });
  it('keeps goal version current after creation and avoids a duplicate POST on refresh failure', () => {
    const f = TestBed.createComponent(GovernanceCreate);
    f.componentRef.setInput('workspace', workspace);
    f.componentRef.setInput('kind', 'actions');
    f.componentRef.setInput('links', { goalId: goal.id });
    f.detectChanges();
    http.expectOne((r) => r.url === `${base}/goals`).flush(page([goal]));
    const c = f.componentInstance;
    const created = vi.fn();
    c.created.subscribe(created);
    const values = { title: 'Formalizar revisão', goalId: goal.id, controlAssessmentId: null };
    const event = { values, form: form(values) };
    c.save(event);
    http.expectOne(`${base}/actions`).flush(envelope({ ...action, goalId: goal.id }));
    const fresh = http.expectOne(`${base}/goals/${goal.id}`);
    expect(created).not.toHaveBeenCalled();
    fresh.flush({ requestId: 'after-create' }, { status: 503, statusText: 'Unavailable' });
    for (const request of http.match(
      (r) => r.url === `${base}/actions` || r.url === `${base}/dashboard`,
    ))
      expect(request.cancelled).toBe(true);
    expect(c.state.blocked()).toBe(true);
    c.save(event);
    http.expectNone((r) => r.method === 'POST');
  });
});
