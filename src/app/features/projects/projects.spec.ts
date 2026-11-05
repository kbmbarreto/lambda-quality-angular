import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { authInterceptor } from '../../core/auth.interceptor';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { ProjectApi } from './project-api.service';
import { ProjectDetail } from './project-detail';
import { ProjectList } from './project-list';
import { ProjectMembers } from './project-members';
import { ProjectResourcesPanel } from './project-resources';
import { ProjectScope } from './project-scope';
import {
  Project,
  Milestone,
  ProjectEnvironment,
  roleCapabilities,
  validCalendarDate,
  calendarDate,
} from './project.models';
import { Workspace, Member } from '../workspaces/workspace.models';

const time = '2026-10-02T15:00:00Z';
const workspace: Workspace = {
  id: 'workspace-one',
  name: 'Equipe',
  slug: 'equipe',
  status: 'ACTIVE',
  ownerMemberId: 'owner',
  memberId: 'member',
  isOwner: true,
  permissions: ['workspace.read', 'project.read', 'project.create'],
  createdAt: time,
  updatedAt: time,
};
const project: Project = {
  id: 'project-one',
  workspaceId: workspace.id,
  key: 'PORTAL',
  name: 'Portal Cliente',
  description: null,
  status: 'ACTIVE',
  createdAt: time,
  updatedAt: time,
  archivedAt: null,
  projectRole: 'MANAGER',
  permissions: roleCapabilities.MANAGER,
};
const milestone: Milestone = {
  id: 'milestone-one',
  workspaceId: workspace.id,
  projectId: project.id,
  name: 'Primeira entrega',
  description: null,
  status: 'PLANNED',
  startDate: '2026-10-02',
  dueDate: '2026-10-31',
  completedAt: null,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
};
const environment: ProjectEnvironment = {
  id: 'env-one',
  workspaceId: workspace.id,
  projectId: project.id,
  name: 'Homologação',
  description: null,
  active: false,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
};
const envelope = <T>(data: T) => ({
  data,
  message: 'OK',
  meta: { requestId: 'request-one', timestamp: time },
});
const page = <T>(data: T[]) => ({
  ...envelope(data),
  meta: {
    ...envelope(data).meta,
    pagination: {
      page: 1,
      size: 20,
      totalItems: data.length,
      totalPages: data.length ? 1 : 0,
      hasNext: false,
      hasPrevious: false,
    },
  },
});
const root = '/api/v1/workspaces/workspace-one/projects';
const path = `${root}/project-one`;
const form = (values: Record<string, unknown>) =>
  new FormGroup(
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, new FormControl(value)])),
  );

describe('Project HTTP contracts', () => {
  let api: ProjectApi, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(ProjectApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  it('sends bearer and project filters within the selected Workspace', () => {
    TestBed.inject(AuthService).login('user@example.com', 'password').subscribe();
    http.expectOne('/api/v1/auth/login').flush(
      envelope({
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 86400,
      }),
    );
    http.expectOne('/api/v1/auth/me').flush(
      envelope({
        id: 'user',
        displayName: 'Usuário',
        email: 'user@example.com',
        status: 'ACTIVE',
        createdAt: time,
        emailVerifiedAt: time,
      }),
    );
    api
      .list(workspace.id, { page: 2, size: 20, status: 'ARCHIVED', q: 'Portal', sort: 'key,asc' })
      .subscribe();
    const request = http.expectOne((r) => r.url === root);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access');
    expect(request.request.params.get('status')).toBe('ARCHIVED');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page([]));
  });
  it('omits unsupported member search/status and uses WorkspaceMember.id for PUT', () => {
    api
      .members(workspace.id, project.id, {
        q: 'invalid',
        status: 'ACTIVE',
        page: 1,
        sort: 'projectRole,asc',
      })
      .subscribe();
    const list = http.expectOne((r) => r.url === `${path}/members`);
    expect(list.request.params.has('q')).toBe(false);
    expect(list.request.params.has('status')).toBe(false);
    list.flush(page([]));
    api.assign(workspace.id, project.id, 'workspace-member', 'EDITOR').subscribe();
    const assignment = http.expectOne(`${path}/members/workspace-member`);
    expect(assignment.request.method).toBe('PUT');
    expect(assignment.request.body).toEqual({ projectRole: 'EDITOR' });
    assignment.flush(envelope({}));
  });
  it('preserves active=false as a boolean filter and excludes status', () => {
    api
      .resources(workspace.id, project.id, 'environments', {
        active: false,
        status: 'ALL',
        q: 'homologação',
      })
      .subscribe();
    const request = http.expectOne((r) => r.url === `${path}/environments`);
    expect(request.request.params.get('active')).toBe('false');
    expect(request.request.params.has('status')).toBe(false);
    request.flush(page([environment]));
  });
  it('keeps completion a separate POST and handles no-content removals', () => {
    api.complete(workspace.id, project.id, milestone.id).subscribe();
    const complete = http.expectOne(`${path}/milestones/milestone-one/complete`);
    expect(complete.request.method).toBe('POST');
    expect(complete.request.body).toEqual({});
    complete.flush(envelope({ ...milestone, status: 'COMPLETED', completedAt: time }));
    let removed = false;
    api
      .removeMember(workspace.id, project.id, 'workspace-member')
      .subscribe(() => (removed = true));
    http
      .expectOne(`${path}/members/workspace-member`)
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(removed).toBe(true);
  });
  it('invalidates only the denied project scope and never repeats the mutation', () => {
    const context = TestBed.inject(ProjectContext);
    context.selected.set(project);
    const changed = vi.fn();
    context.accessChanged.subscribe(changed);
    api
      .update(workspace.id, project.id, { name: 'Novo', description: null })
      .subscribe({ error: () => {} });
    http
      .expectOne(path)
      .flush({ code: 'AUTH_FORBIDDEN' }, { status: 403, statusText: 'Forbidden' });
    expect(changed).toHaveBeenCalledWith({ workspaceId: workspace.id, projectId: project.id });
    http.expectNone(path);
  });
  it('refreshes project status on an archived conflict', () => {
    const changed = vi.fn();
    TestBed.inject(ProjectContext).accessChanged.subscribe(changed);
    api
      .createResource(workspace.id, project.id, 'environments', {
        name: 'QA',
        description: null,
        active: true,
      })
      .subscribe({ error: () => {} });
    http
      .expectOne(`${path}/environments`)
      .flush({ code: 'PROJECT_ARCHIVED' }, { status: 409, statusText: 'Conflict' });
    expect(changed).toHaveBeenCalledOnce();
  });
  it('clears project and Workspace synchronously when the session ends', () => {
    TestBed.inject(ProjectContext).selected.set(project);
    TestBed.inject(WorkspaceContext).selected.set(workspace);
    TestBed.inject(AuthService).clearSession();
    expect(TestBed.inject(ProjectContext).selected()).toBeNull();
    expect(TestBed.inject(WorkspaceContext).selected()).toBeNull();
  });
});

describe('Project scope and local capabilities', () => {
  let http: HttpTestingController, params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(
      convertToParamMap({ workspaceId: workspace.id, projectId: project.id }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { data: {} } } },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function detail(value = project) {
    const fixture = TestBed.createComponent(ProjectDetail);
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http.expectOne(path).flush(envelope(value));
    return fixture;
  }
  it('uses effective project permissions even when the local role is MANAGER', async () => {
    const fixture = detail({ ...project, permissions: ['project.read'] });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Editar projeto');
    expect(fixture.componentInstance.can('project.archive')).toBe(false);
    fixture.componentInstance.archive();
    http.expectNone(`${path}/archive`);
  });
  it('allows administrator capabilities without a local ProjectMember', () => {
    const fixture = detail({ ...project, projectRole: null });
    expect(fixture.componentInstance.can('project.manage_members')).toBe(true);
  });
  it('makes archived projects read-only across all tabs', async () => {
    const fixture = detail({ ...project, status: 'ARCHIVED', archivedAt: time });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Projeto arquivado');
    expect(fixture.nativeElement.textContent).not.toContain('Editar projeto');
    fixture.componentInstance.tab.set('milestones');
    await fixture.whenStable();
    http.expectOne((r) => r.url === `${path}/milestones`).flush(page([milestone]));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Consultar');
    expect(fixture.nativeElement.textContent).not.toContain('Criar marco');
    expect(fixture.nativeElement.textContent).not.toContain('Concluir');
  });
  it('sends only editable project fields, then refreshes access', () => {
    const fixture = detail();
    const values = { key: 'CHANGED', name: ' Nome novo ', description: '' };
    fixture.componentInstance.save({ values, form: form(values) });
    const request = http.expectOne(path);
    expect(request.request.body).toEqual({ name: 'Nome novo', description: null });
    request.flush(envelope({ ...project, name: 'Nome novo' }));
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http.expectOne(path).flush(envelope({ ...project, name: 'Nome novo' }));
  });
  it('clears old scope immediately and cancels requests on project/Workspace navigation', () => {
    const fixture = detail();
    fixture.componentInstance.tab.set('members');
    params.next(convertToParamMap({ workspaceId: 'workspace-two', projectId: 'project-two' }));
    expect(TestBed.inject(ProjectContext).selected()).toBeNull();
    expect(TestBed.inject(WorkspaceContext).selected()).toBeNull();
    const pending = http.expectOne('/api/v1/workspaces/workspace-two');
    params.next(convertToParamMap({ workspaceId: 'workspace-three', projectId: 'project-three' }));
    expect(pending.cancelled).toBe(true);
    http
      .expectOne('/api/v1/workspaces/workspace-three')
      .flush(envelope({ ...workspace, id: 'workspace-three' }));
    http
      .expectOne('/api/v1/workspaces/workspace-three/projects/project-three')
      .flush(envelope({ ...project, id: 'project-three', workspaceId: 'workspace-three' }));
  });
  it('returns to project list on project 404 without clearing the global session', () => {
    const fixture = detail();
    fixture.componentInstance.scope.refresh();
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http
      .expectOne(path)
      .flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([
      '/workspaces',
      workspace.id,
      'projects',
    ]);
    expect(TestBed.inject(ProjectContext).selected()).toBeNull();
  });
  it('stops repeated denial refreshes and requires manual retry', () => {
    const fixture = detail();
    const context = TestBed.inject(ProjectContext);
    context.accessChanged.next({ workspaceId: workspace.id, projectId: project.id });
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    http.expectOne(path).flush(envelope(project));
    context.accessChanged.next({ workspaceId: workspace.id, projectId: project.id });
    http.expectNone(path);
    expect(fixture.componentInstance.scope.context.selected()).toBeNull();
    expect(fixture.componentInstance.scope.state.error()).toContain('manualmente');
  });
  it('supports create-only Workspace capability without querying the project list', async () => {
    params.next(convertToParamMap({ workspaceId: workspace.id }));
    const fixture = TestBed.createComponent(ProjectList);
    http
      .expectOne('/api/v1/workspaces/workspace-one')
      .flush(envelope({ ...workspace, permissions: ['project.create'] }));
    await fixture.whenStable();
    http.expectNone((r) => r.url === root);
    expect(fixture.nativeElement.textContent).toContain('Criar projeto');
  });
  it('shows an empty paginated project list with ACTIVE as the default', async () => {
    params.next(convertToParamMap({ workspaceId: workspace.id }));
    const fixture = TestBed.createComponent(ProjectList);
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    await fixture.whenStable();
    const list = http.expectOne((r) => r.url === root);
    expect(list.request.params.get('status')).toBe('ACTIVE');
    list.flush(page([]));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Nenhum projeto encontrado');
  });
});

describe('Project participant and resource rules', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function resources(kind: 'milestones' | 'environments', value = project) {
    const fixture = TestBed.createComponent(ProjectResourcesPanel);
    fixture.componentRef.setInput('project', value);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${path}/${kind}`).flush(page([]));
    return fixture;
  }
  it('does not assign capabilities the actor lacks, even with manage_members permission', () => {
    const fixture = TestBed.createComponent(ProjectMembers);
    fixture.componentRef.setInput('project', {
      ...project,
      permissions: [
        'project.read',
        'project.manage_members',
        'testcase.read',
        'testrun.read',
        'defect.read',
      ],
    });
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${path}/members`).flush(page([]));
    expect(fixture.componentInstance.canAssign('VIEWER')).toBe(true);
    expect(fixture.componentInstance.canAssign('EDITOR')).toBe(false);
    expect(fixture.componentInstance.canAssign('MANAGER')).toBe(false);
    fixture.componentInstance.choose({
      id: 'workspace-member',
      userId: 'global-user',
      status: 'ACTIVE',
      user: { displayName: 'Membro', status: 'ACTIVE' },
    } as Member);
    fixture.componentInstance.save({
      values: { projectRole: 'MANAGER' },
      form: form({ projectRole: 'MANAGER' }),
    });
    http.expectNone(`${path}/members/workspace-member`);
    fixture.componentInstance.save({
      values: { projectRole: 'VIEWER' },
      form: form({ projectRole: 'VIEWER' }),
    });
    http.expectOne(`${path}/members/workspace-member`).flush(envelope({}));
  });
  it('prevents inactive Workspace members from being assigned', () => {
    const fixture = TestBed.createComponent(ProjectMembers);
    fixture.componentRef.setInput('project', project);
    fixture.componentInstance.choose({
      id: 'member',
      status: 'SUSPENDED',
      user: { status: 'ACTIVE' },
    } as Member);
    expect(fixture.componentInstance.editor()).toBeNull();
    fixture.componentInstance.choose({
      id: 'member',
      status: 'ACTIVE',
      user: { status: 'SUSPENDED' },
    } as Member);
    expect(fixture.componentInstance.editor()).toBeNull();
  });
  it('requires the new testcase grant before assigning the reader role', () => {
    const fixture = TestBed.createComponent(ProjectMembers);
    fixture.componentRef.setInput('project', {
      ...project,
      permissions: ['project.read', 'project.manage_members'],
    });
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${path}/members`).flush(page([]));
    expect(fixture.componentInstance.canAssign('VIEWER')).toBe(false);
  });
  it('rejects an impossible calendar date and an inverted milestone range', () => {
    const fixture = resources('milestones');
    fixture.componentInstance.edit();
    const invalid = { name: 'Entrega', description: '', startDate: '2026-02-30', dueDate: '' };
    const invalidForm = form(invalid);
    fixture.componentInstance.save({ values: invalid, form: invalidForm });
    expect(invalidForm.get('startDate')?.hasError('server')).toBe(true);
    const inverted = { ...invalid, startDate: '2026-10-31', dueDate: '2026-10-01' };
    fixture.componentInstance.save({ values: inverted, form: form(inverted) });
    expect(fixture.componentInstance.operation.error()).toContain('anterior');
    http.expectNone(`${path}/milestones`);
  });
  it('creates PLANNED milestones without status and sends null for cleared dates', () => {
    const fixture = resources('milestones');
    fixture.componentInstance.edit();
    const values = { name: ' Entrega ', description: '', startDate: '', dueDate: '' };
    fixture.componentInstance.save({ values, form: form(values) });
    const request = http.expectOne(`${path}/milestones`);
    expect(request.request.body).toEqual({
      name: 'Entrega',
      description: null,
      startDate: null,
      dueDate: null,
    });
    request.flush(envelope(milestone));
    http.expectOne((r) => r.url === `${path}/milestones`).flush(page([milestone]));
  });
  it('preserves immutable completed milestones and does not complete canceled ones', () => {
    const fixture = resources('milestones');
    fixture.componentInstance.edit({ ...milestone, status: 'COMPLETED' });
    expect(fixture.componentInstance.editor()).toBeNull();
    fixture.componentInstance.confirm({ ...milestone, status: 'CANCELLED' }, 'complete');
    expect(fixture.componentInstance.confirmation()).toBeNull();
  });
  it('updates inactive environments with JSON boolean and can still consult them', () => {
    const fixture = resources('environments');
    fixture.componentInstance.edit(environment);
    const values = {
      name: 'Homologação',
      description: '',
      active: false,
      category: 'HOMOLOGATION',
    };
    fixture.componentInstance.save({ values, form: form(values) });
    const request = http.expectOne(`${path}/environments/env-one`);
    expect(request.request.body).toEqual({
      name: 'Homologação',
      description: null,
      active: false,
      category: 'HOMOLOGATION',
    });
    request.flush(envelope(environment));
    http.expectOne((r) => r.url === `${path}/environments`).flush(page([environment]));
    fixture.componentInstance.consult(environment);
    http.expectOne(`${path}/environments/env-one`).flush(envelope(environment));
    expect(
      fixture.componentInstance.details()?.fields.find((field) => field.label === 'Situação')
        ?.value,
    ).toBe('Inativo');
  });
  it('keeps the inactive environment filter during pagination and clears it when selecting all', () => {
    const fixture = resources('environments');
    fixture.componentInstance.active = 'false';
    fixture.componentInstance.search({ q: 'QA', sort: 'name,asc' });
    const filtered = http.expectOne((request) => request.url === `${path}/environments`);
    expect(filtered.request.params.get('active')).toBe('false');
    expect(filtered.request.params.has('status')).toBe(false);
    filtered.flush(page([environment]));
    fixture.componentInstance.list.page(2);
    const next = http.expectOne((request) => request.url === `${path}/environments`);
    expect(next.request.params.get('active')).toBe('false');
    expect(next.request.params.get('page')).toBe('2');
    next.flush(page([]));
    fixture.componentInstance.active = '';
    fixture.componentInstance.search({ q: '', sort: 'name,asc' });
    const all = http.expectOne((request) => request.url === `${path}/environments`);
    expect(all.request.params.has('active')).toBe(false);
    expect(all.request.params.get('page')).toBe('1');
    all.flush(page([]));
  });
  it('rejects archived resource mutations', () => {
    const fixture = resources('environments', { ...project, status: 'ARCHIVED' });
    fixture.componentInstance.edit();
    expect(fixture.componentInstance.editor()).toBeNull();
    fixture.componentInstance.confirm(environment, 'remove');
    expect(fixture.componentInstance.confirmation()).toBeNull();
  });
  it('renders date-only values without timezone conversion and handles leap years', () => {
    expect(calendarDate('2026-10-02')).toBe('02/10/2026');
    expect(validCalendarDate('2024-02-29')).toBe(true);
    expect(validCalendarDate('2026-02-29')).toBe(false);
    expect(validCalendarDate('0999-01-01')).toBe(false);
  });
});
