import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DashboardProjects } from '../home/dashboard-projects';
import { ExecutionInventory } from '../execution/execution-inventory';
import { AuthorizedProjects } from './authorized-projects';
import { Project } from './project.models';
import { Workspace } from '../workspaces/workspace.models';

const time = '2026-10-08T12:00:00Z';
const w = '11111111-1111-4111-8111-111111111111';
const workspace: Workspace = {
  id: w,
  name: 'Equipe',
  slug: 'equipe',
  status: 'ACTIVE',
  ownerMemberId: 'owner',
  permissions: ['project.read'],
  createdAt: time,
  updatedAt: time,
};
const project = (id: string, permissions: string[] = ['testrun.read']): Project => ({
  id,
  workspaceId: w,
  key: 'QA',
  name: `Projeto ${id}`,
  description: null,
  status: 'ACTIVE',
  createdAt: time,
  updatedAt: time,
  archivedAt: null,
  projectRole: 'VIEWER',
  permissions,
});
const page = (data: unknown[], n = 1, hasNext = false, total = data.length) => ({
  data,
  meta: {
    pagination: {
      page: n,
      size: 100,
      totalItems: total,
      totalPages: hasNext ? n + 1 : n,
      hasNext,
      hasPrevious: n > 1,
    },
  },
});
let http: HttpTestingController;
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap({ workspaceId: w }) } },
      },
    ],
  });
  http = TestBed.inject(HttpTestingController);
});
afterEach(() => {
  http.verify({ ignoreCancelled: true });
  TestBed.resetTestingModule();
});

it('loads every authorized project page including archived and surfaces scoped failures', () => {
  let result: any;
  TestBed.inject(AuthorizedProjects)
    .list([
      workspace,
      { ...workspace, id: 'other', name: 'Outro' },
      { ...workspace, id: 'denied', permissions: [] },
    ])
    .subscribe((data) => (result = data));
  const first = http.expectOne((r) => r.url === `/api/v1/workspaces/${w}/projects`);
  expect(first.request.params.get('status')).toBe('ALL');
  first.flush(page([project('first')], 1, true));
  http
    .expectOne((r) => r.url === `/api/v1/workspaces/${w}/projects` && r.params.get('page') === '2')
    .flush(page([{ ...project('last'), status: 'ARCHIVED' }], 2));
  http
    .expectOne((r) => r.url === '/api/v1/workspaces/other/projects')
    .flush(
      { code: 'AUTH_FORBIDDEN', requestId: 'catalog-error' },
      { status: 403, statusText: 'Forbidden' },
    );
  http.expectNone((r) => r.url.includes('/denied/'));
  expect(result.projects.map((p: Project) => p.id)).toEqual(['first', 'last']);
  expect(result.issues.join(' ')).toContain('catalog-error');
});

it('shows all projects beyond the overview limit and uses filtered totalItems for ACTIVE automation counts', () => {
  const f = TestBed.createComponent(DashboardProjects);
  f.componentRef.setInput('workspaces', [workspace]);
  f.componentRef.setInput('ready', true);
  f.detectChanges();
  http
    .expectOne((r) => r.url.endsWith('/projects'))
    .flush(
      page(
        Array.from({ length: 10 }, (_, i) => project(String(i), [])),
        1,
        true,
      ),
    );
  http
    .expectOne((r) => r.url.endsWith('/projects'))
    .flush(page([project('11', ['testcase.read'])], 2));
  const active = http.expectOne(
    (r) => r.url.endsWith('/test-cases') && !r.params.has('automationStatus'),
  );
  expect(active.request.params.get('status')).toBe('ACTIVE');
  expect(active.request.params.get('size')).toBe('1');
  active.flush(page([], 1, false, 50));
  http
    .expectOne((r) => r.params.get('automationStatus') === 'AUTOMATED')
    .flush(page([], 1, false, 20));
  f.detectChanges();
  expect(f.nativeElement.querySelectorAll('tbody tr').length).toBe(11);
  expect(f.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe(
    '40',
  );
  expect(f.nativeElement.querySelector('.dashboard-projects-scroll').getAttribute('tabindex')).toBe(
    '0',
  );
});

it('refreshes the complete project catalog and counts when the dashboard is refreshed', () => {
  const f = TestBed.createComponent(DashboardProjects);
  f.componentRef.setInput('workspaces', [workspace]);
  f.componentRef.setInput('ready', true);
  f.detectChanges();
  http.expectOne((r) => r.url.endsWith('/projects')).flush(page([project('before', [])]));
  f.detectChanges();
  expect(f.componentInstance.rows().map((p) => p.id)).toEqual(['before']);
  f.componentRef.setInput('refreshKey', 1);
  f.detectChanges();
  expect(f.componentInstance.rows()).toEqual([]);
  http
    .expectOne((r) => r.url.endsWith('/projects'))
    .flush(page([project('before', []), project('new', [])]));
  f.detectChanges();
  expect(f.componentInstance.rows().map((p) => p.id)).toEqual(['before', 'new']);
});

it('cancels old project count queries and clears old rows when the Workspace changes', () => {
  const f = TestBed.createComponent(DashboardProjects);
  f.componentRef.setInput('workspaces', [workspace]);
  f.componentRef.setInput('ready', true);
  f.detectChanges();
  http.expectOne((r) => r.url.endsWith('/projects')).flush(page([project('p', ['testcase.read'])]));
  const counts = http.match((r) => r.url.endsWith('/test-cases'));
  expect(counts.length).toBe(2);
  f.componentRef.setInput('workspaceId', 'other');
  f.detectChanges();
  expect(counts.every((r) => r.cancelled)).toBe(true);
  expect(f.componentInstance.rows()).toEqual([]);
});

it('lists every execution page, applies filters and opens the exact execution with runId', () => {
  const f = TestBed.createComponent(ExecutionInventory);
  f.detectChanges();
  http.expectOne((r) => r.url === '/api/v1/workspaces').flush(page([workspace]));
  http
    .expectOne((r) => r.url.endsWith('/projects'))
    .flush(page([project('p'), project('hidden', [])]));
  f.detectChanges();
  const run = {
    id: 'first',
    workspaceId: w,
    projectId: 'p',
    name: 'Regressão',
    status: 'CREATED',
    createdAt: time,
    summary: { total: 5 },
    planNameSnapshot: 'Plano',
  };
  http.expectOne((r) => r.url.endsWith('/p/test-runs')).flush(page([run], 1, true));
  http
    .expectOne((r) => r.url.endsWith('/p/test-runs') && r.params.get('page') === '2')
    .flush(
      page(
        [
          {
            ...run,
            id: 'last',
            name: 'Teste antigo',
            status: 'COMPLETED',
            createdAt: '2025-01-01T12:00:00Z',
          },
        ],
        2,
      ),
    );
  http.expectNone((r) => r.url.includes('/hidden/test-runs'));
  f.detectChanges();
  expect(f.componentInstance.filtered().length).toBe(2);
  const link = f.nativeElement.querySelector('tbody a');
  expect(link.getAttribute('href')).toBe(`/workspaces/${w}/projects/p/execution?runId=first`);
  f.componentInstance.status.set('COMPLETED');
  f.detectChanges();
  expect(f.componentInstance.filtered().map((r) => r.id)).toEqual(['last']);
  f.componentInstance.search.set('não existe');
  expect(f.componentInstance.filtered()).toEqual([]);
});
