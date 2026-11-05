import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, NEVER, of } from 'rxjs';
import { AuthorizedProjects } from '../projects/authorized-projects';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { Home } from './home';
import { OpenDefects } from './open-defects.service';
import { FrameworkGoals } from './framework-goals';
import {
  DashboardFrameworkGovernance,
  ProgressSummary,
} from '../governance/framework-progress.models';
import { Profile } from './profile';
import { DashboardOverview } from './dashboard.models';
import { DashboardPreferences, dashboardPreferencesKey } from './dashboard-preferences';

const w = '11111111-1111-4111-8111-111111111111';
const p = '22222222-2222-4222-8222-222222222222';
const time = '2026-10-04T12:00:00Z';
const user = {
  id: 'user',
  email: 'qa@example.com',
  displayName: 'Pessoa de teste',
  status: 'ACTIVE',
  createdAt: time,
};
const overview: DashboardOverview = {
  generatedAt: time,
  period: {
    days: 30,
    from: '2026-09-04T12:00:00Z',
    to: time,
    previousFrom: '2026-08-05T12:00:00Z',
    previousTo: '2026-09-04T12:00:00Z',
  },
  metrics: {
    testCases: { value: 100, previousValue: null },
    activeTestCases: { value: 80, previousValue: null },
    executions: { value: 20, previousValue: 10 },
    defects: { value: 5, previousValue: 4 },
    coverage: { value: 95, previousValue: 75 },
    automationCoverage: { value: 80, previousValue: 75 },
  },
  results: { PASSED: 60, FAILED: 10, BLOCKED: 5, SKIPPED: 5, NOT_TESTED: 20 },
  defectsByStatus: { OPEN: 2, IN_PROGRESS: 1, RESOLVED: 1, CLOSED: 1, REJECTED: 0 },
  projects: [
    {
      id: p,
      workspaceId: w,
      workspaceName: 'Equipe',
      key: 'QA',
      name: 'Portal',
      status: 'ACTIVE',
      activeTestCases: 100,
      automationCoverage: 80,
      progress: 90,
      coverage: 80,
    },
  ],
  activity: [
    {
      id: 'event',
      title: 'Resultado registrado',
      context: 'Portal',
      occurredAt: time,
      target: { module: 'EXECUTION', workspaceId: w, projectId: p },
    },
  ],
  governance: [
    {
      id: 'goal',
      workspaceId: w,
      name: 'Melhorar automação',
      frameworkName: null,
      status: 'ACTIVE',
      progress: 80,
      actionProgress: {
        basis: 'ACTIONS',
        totalActions: 5,
        completedActions: 4,
        cancelledActions: 0,
        percent: 80,
      },
      detail: '4 de 5 ações concluídas',
    },
  ],
  documents: [
    {
      id: 'file',
      workspaceId: w,
      name: 'Política de qualidade.pdf',
      versionLabel: null,
      updatedAt: time,
    },
  ],
};
const envelope = (data: unknown) => ({ data, meta: { requestId: 'req', timestamp: time } });
function workspacePage(rows: unknown[], page = 1, hasNext = false) {
  return {
    data: rows,
    meta: {
      pagination: { page, size: 100, totalItems: 2, totalPages: 2, hasNext, hasPrevious: page > 1 },
    },
  };
}

describe('Home overview and Meu Perfil', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.removeItem(dashboardPreferencesKey(user.id));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // The complete project catalog is covered in authorized-projects.spec.ts.
        { provide: AuthorizedProjects, useValue: { list: () => NEVER } },
        // Current open stock and scope cancellation are covered in open-defects.spec.ts.
        { provide: OpenDefects, useValue: { count: () => of(12) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(AuthService), 'user').mockReturnValue(user as never);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    localStorage.removeItem(dashboardPreferencesKey(user.id));
  });
  function home(data: DashboardOverview | null = overview) {
    const f = TestBed.createComponent(Home);
    f.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/workspaces')
      .flush(workspacePage([{ id: w, name: 'Equipe', status: 'ACTIVE' }], 1));
    if (data) http.expectOne('/api/v1/dashboard/overview?days=30').flush(envelope(data));
    return f;
  }
  it('loads all workspace pages without unsupported status filters, leaving account and health on Meu Perfil', () => {
    const f = TestBed.createComponent(Home);
    f.detectChanges();
    const first = http.expectOne((r) => r.url === '/api/v1/workspaces');
    expect(first.request.params.get('status')).toBeNull();
    first.flush(workspacePage([{ id: w, name: 'Equipe', status: 'ACTIVE' }], 1, true));
    const second = http.expectOne((r) => r.url === '/api/v1/workspaces');
    expect(second.request.params.get('page')).toBe('2');
    second.flush(workspacePage([{ id: p, name: 'Outra equipe', status: 'ACTIVE' }], 2));
    http.expectOne('/api/v1/dashboard/overview?days=30').flush(envelope(overview));
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('#dashboard-workspace option')).toHaveLength(3);
    expect(f.nativeElement.textContent).not.toContain(user.email);
    expect(f.nativeElement.textContent).not.toContain('Disponibilidade do serviço');
    expect(f.nativeElement.textContent).not.toContain('Encerrar todas as sessões');
    expect(f.nativeElement.querySelector('nav a[href="/meu-perfil"]')).toBeTruthy();
    expect(f.nativeElement.querySelector('header a[href="/meu-perfil"]')).toBeTruthy();
    http.expectNone('/api/v1/health/ready');
    http.expectNone('/api/v1/auth/me');
  });
  it('renders real metrics with correct comparison units and source-specific result labels', () => {
    const f = home();
    f.detectChanges();
    const c = f.componentInstance;
    expect(c.results().total).toBe(100);
    expect(c.results().rows.find((r) => r.key === 'PASSED')!.percent).toBe(60);
    expect(f.nativeElement.querySelector('.dashboard-donut').getAttribute('aria-label')).toContain(
      '100 resultados',
    );
    expect(f.nativeElement.querySelector('.metric-executions').textContent).toContain('↑ 100%');
    expect(f.nativeElement.querySelector('.metric-coverage').textContent).toContain('↑ 5 p.p.');
    expect(f.nativeElement.querySelector('.metric-defects .trend-bad')).toBeNull();
    expect(f.nativeElement.querySelector('.metric-defects strong').textContent.trim()).toBe('12');
    expect(f.nativeElement.querySelector('.metric-defects').textContent).toContain(
      'Abertos (OPEN)',
    );
    expect(f.nativeElement.querySelector('.metric-testCases').textContent).toContain(
      'Somente casos ativos (ACTIVE)',
    );
    expect(c.change(10, 0)).toBeNull();
    expect(c.change(10, 0, true)).toBe('↑ 10 p.p.');
    expect(f.nativeElement.querySelector('.dashboard-feed a').getAttribute('href')).toBe(
      `/workspaces/${w}/projects/${p}/execution`,
    );
    expect(f.nativeElement.textContent).toContain('Rejeitado');
    expect(f.nativeElement.textContent).toContain('Não testado');
  });
  it('shows active counts and automation percentages and places governance before projects and activity', () => {
    const f = home();
    f.detectChanges();
    const table = f.nativeElement.querySelector('.dashboard-projects') as HTMLElement;
    expect(table.querySelector('thead')!.textContent).toContain('Testes');
    expect(table.querySelector('thead')!.textContent).toContain('Automatizados');
    expect(table.querySelectorAll('tbody td')[2].textContent!.trim()).toBe('100');
    expect(table.querySelectorAll('tbody td')[3].textContent).toContain('80%');
    expect(table.textContent).not.toContain('90%');
    const titles = Array.from(
      f.nativeElement.querySelectorAll('section .dashboard-card-heading h2'),
    ).map((e: any) => e.id);
    expect(titles.slice(0, 5)).toEqual([
      'dashboard-results-title',
      'dashboard-defects-title',
      'dashboard-goals-title',
      'dashboard-projects-title',
      'dashboard-activity-title',
    ]);
  });
  it('links metric cards to their modules and keeps the selected Workspace in the destination', () => {
    const f = home();
    f.detectChanges();
    const href = (key: string) =>
      f.nativeElement.querySelector('.metric-' + key + ' a').getAttribute('href');
    expect(href('testCases')).toBe('/casos-de-teste');
    expect(href('executions')).toBe('/execucoes');
    expect(href('defects')).toBe('/defeitos');
    f.componentInstance.workspaceId = w;
    f.componentInstance.filtersChanged();
    http.expectOne(`/api/v1/dashboard/overview?days=30&workspaceId=${w}`).flush(envelope(overview));
    f.detectChanges();
    expect(href('testCases')).toBe(`/workspaces/${w}/test-cases`);
    expect(href('executions')).toBe(`/execucoes?workspaceId=${w}`);
    expect(href('defects')).toBe(`/workspaces/${w}/defects`);
    expect(f.nativeElement.querySelector('.metric-coverage a')).toBeNull();
  });
  it('uses action completion in goals while keeping metric values and framework assessment separate', () => {
    const f = home({
      ...overview,
      governance: [
        {
          ...overview.governance![0],
          progress: 33.33,
          currentValue: 95,
          targetValue: 20,
          status: 'MISSED',
          detail: '1 de 3 ações concluídas',
          actionProgress: {
            basis: 'ACTIONS',
            totalActions: 3,
            completedActions: 1,
            cancelledActions: 2,
            percent: 33.33,
          },
        },
      ],
    });
    f.detectChanges();
    const item = f.nativeElement.querySelector('.dashboard-goals li') as HTMLElement;
    expect(item.querySelector('.goal-action-ring')!.textContent).toContain('33,33%');
    expect(item.textContent).toContain('1 de 3 ações válidas concluídas');
    expect(item.textContent).toContain('Não atingida');
    expect(item.textContent).toContain('Último valor: 95');
    expect(item.textContent).toContain('Critério: 20');
    expect(f.nativeElement.textContent).toContain('Atendimento dos frameworks por avaliações');
  });
  it('displays no valid actions and zero distinctly and does not round a pending goal to 100', () => {
    const base = overview.governance![0];
    const f = home({
      ...overview,
      governance: [
        {
          ...base,
          id: 'empty',
          progress: null,
          actionProgress: {
            basis: 'ACTIONS',
            totalActions: 0,
            completedActions: 0,
            cancelledActions: 2,
            percent: null,
          },
        },
        {
          ...base,
          id: 'zero',
          progress: 0,
          actionProgress: {
            basis: 'ACTIONS',
            totalActions: 1,
            completedActions: 0,
            cancelledActions: 0,
            percent: 0,
          },
        },
        {
          ...base,
          id: 'pending',
          progress: 99.99,
          actionProgress: {
            basis: 'ACTIONS',
            totalActions: 100000,
            completedActions: 99999,
            cancelledActions: 0,
            percent: 99.99,
          },
        },
      ],
    });
    f.detectChanges();
    const rows = f.nativeElement.querySelectorAll('.dashboard-goals li');
    expect(rows[0].textContent).toContain('Sem ações válidas');
    expect(rows[1].querySelector('.goal-action-ring').textContent).toContain('0%');
    expect(rows[2].querySelector('.goal-action-ring').textContent).toContain('99,99%');
    expect(f.componentInstance.goalSummary()!.active).toBe(3);
  });
  it('does not relabel legacy execution values as automation or invent a count', () => {
    const legacy = {
      ...overview,
      metrics: { ...overview.metrics, automationCoverage: undefined },
      projects: overview.projects!.map((p) => ({
        ...p,
        activeTestCases: undefined,
        automationCoverage: undefined,
      })),
    };
    const f = home(legacy);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metric-coverage strong').textContent.trim()).toBe('—');
    const cells = f.nativeElement.querySelectorAll('.dashboard-projects tbody td');
    expect(cells[2].textContent.trim()).toBe('—');
    expect(cells[3].textContent.trim()).toBe('—');
    f.componentInstance.data.set({
      ...overview,
      projects: overview.projects!.map((p) => ({
        ...p,
        activeTestCases: 0,
        automationCoverage: null,
      })),
      metrics: { ...overview.metrics, automationCoverage: { value: 0, previousValue: null } },
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metric-coverage strong').textContent.trim()).toBe('0%');
    expect(cells[2].textContent.trim()).toBe('0');
  });
  it('clears the previous scope before requesting a different workspace and period', () => {
    const f = home();
    f.detectChanges();
    const c = f.componentInstance;
    c.days = 7;
    c.workspaceId = w;
    c.refresh();
    f.detectChanges();
    expect(c.data()).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Resultado registrado');
    const request = http.expectOne(`/api/v1/dashboard/overview?days=7&workspaceId=${w}`);
    c.refresh();
    http.expectNone((r) => r.url === '/api/v1/dashboard/overview');
    request.flush(envelope({ ...overview, activity: [], projects: [] }));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Nenhuma atividade no período');
  });
  it('uses the consolidated ACTIVE count, never the legacy total or the limited project list', () => {
    const f = home({
      ...overview,
      metrics: {
        ...overview.metrics,
        testCases: { value: 150, previousValue: null },
        activeTestCases: { value: 80, previousValue: null },
      },
      projects: [{ ...overview.projects![0], activeTestCases: 10 }],
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metric-testCases strong').textContent.trim()).toBe('80');
    f.componentInstance.data.set({
      ...overview,
      metrics: { ...overview.metrics, activeTestCases: undefined },
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metric-testCases strong').textContent.trim()).toBe('—');
    f.componentInstance.data.set({
      ...overview,
      metrics: { ...overview.metrics, activeTestCases: { value: 0, previousValue: null } },
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metric-testCases strong').textContent.trim()).toBe('0');
  });
  it('fills the primary metric circle for 3.98 against 40 without inventing action completion', () => {
    const f = home({
      ...overview,
      governance: [
        {
          ...overview.governance![0],
          currentValue: 3.98,
          targetValue: 40,
          progress: null,
          actionProgress: {
            basis: 'ACTIONS',
            totalActions: 0,
            completedActions: 0,
            cancelledActions: 0,
            percent: null,
          },
        },
      ],
    });
    f.detectChanges();
    const goal = f.nativeElement.querySelector('.dashboard-goals li');
    expect(goal.querySelector('.goal-action-completion').textContent).toContain(
      'Sem ações válidas',
    );
    expect(goal.querySelector('.goal-metric-values').textContent).toContain('3,98');
    expect(goal.querySelector('.goal-metric-values').textContent).toContain('40');
    expect(parseFloat(goal.querySelector('.goal-metric-track i').style.width)).toBeCloseTo(9.95);
    expect(goal.querySelector('.goal-metric-ring').textContent).toContain('9,95%');
    expect(
      parseFloat(goal.querySelector('.goal-metric-ring').style.getPropertyValue('--progress')),
    ).toBeCloseTo(9.95);
    expect(goal.querySelector('.goal-action-ring')).toBeNull();
    expect(goal.textContent).toContain('Em andamento');
    expect(
      goal
        .querySelector('app-goal-metric')
        .compareDocumentPosition(goal.querySelector('app-goal-action-progress')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    f.componentInstance.data.set({
      ...overview,
      governance: [
        {
          ...overview.governance![0],
          currentValue: null,
          targetValue: 40,
          progress: 100,
          actionProgress: {
            basis: 'ACTIONS',
            totalActions: 1,
            completedActions: 1,
            cancelledActions: 0,
            percent: 100,
          },
        },
      ],
    });
    f.detectChanges();
    expect(goal.querySelector('.goal-action-ring').textContent).toContain('100%');
    expect(goal.querySelector('.dashboard-goal-metric').textContent).toContain(
      'Sem cálculo da métrica',
    );
    expect(goal.querySelector('.goal-metric-comparison')).toBeNull();
  });
  it('distinguishes a zero metric from an undefined ratio and does not turn metric ratios into goal status', () => {
    const base = {
      ...overview.governance![0],
      progress: null,
      actionProgress: {
        basis: 'ACTIONS' as const,
        totalActions: 0,
        completedActions: 0,
        cancelledActions: 0,
        percent: null,
      },
    };
    const f = home({ ...overview, governance: [{ ...base, currentValue: 0, targetValue: 40 }] });
    f.detectChanges();
    const goal = f.nativeElement.querySelector('.dashboard-goals li');
    expect(goal.querySelector('.goal-metric-ring').textContent).toContain('0%');
    f.componentInstance.data.set({
      ...overview,
      governance: [{ ...base, currentValue: 0, targetValue: 0 }],
    });
    f.detectChanges();
    expect(goal.querySelector('.goal-metric-ring')).toBeNull();
    expect(goal.textContent).toContain('Sem ações válidas');
    f.componentInstance.data.set({
      ...overview,
      governance: [{ ...base, currentValue: 80, targetValue: 40 }],
    });
    f.detectChanges();
    expect(goal.querySelector('.goal-metric-ring').textContent).toContain('200%');
    expect(goal.querySelector('.goal-metric-ring').style.getPropertyValue('--progress')).toBe(
      '100%',
    );
    expect(goal.textContent).toContain('Em andamento');
    expect(f.componentInstance.goalSummary()?.achieved).toBe(0);
  });
  it('remembers filters per account and restores the workspace after validating all pages', () => {
    const f = home();
    f.componentInstance.days = 90;
    f.componentInstance.workspaceId = w;
    f.componentInstance.filtersChanged();
    http.expectOne(`/api/v1/dashboard/overview?days=90&workspaceId=${w}`).flush(envelope(overview));
    f.destroy();
    const next = TestBed.createComponent(Home);
    next.detectChanges();
    http.expectNone((r) => r.url === '/api/v1/dashboard/overview');
    http.expectOne((r) => r.url === '/api/v1/workspaces').flush(workspacePage([], 1, true));
    http.expectNone((r) => r.url === '/api/v1/dashboard/overview');
    http
      .expectOne((r) => r.url === '/api/v1/workspaces')
      .flush(workspacePage([{ id: w, name: 'Equipe', status: 'ACTIVE' }], 2));
    http.expectOne(`/api/v1/dashboard/overview?days=90&workspaceId=${w}`).flush(envelope(overview));
    expect(next.componentInstance.days).toBe(90);
    expect(next.componentInstance.workspaceId).toBe(w);
    expect(TestBed.inject(DashboardPreferences).read('another-user')).toEqual({
      days: 30,
      workspaceId: '',
    });
  });
  it('resets an unavailable saved workspace and safely ignores corrupt preferences', () => {
    const preferences = TestBed.inject(DashboardPreferences);
    localStorage.setItem(dashboardPreferencesKey(user.id), '{invalid');
    expect(preferences.read(user.id)).toEqual({ days: 30, workspaceId: '' });
    localStorage.setItem(
      dashboardPreferencesKey(user.id),
      JSON.stringify({ days: 365, workspaceId: 'not-a-uuid' }),
    );
    expect(preferences.read(user.id)).toEqual({ days: 30, workspaceId: '' });
    preferences.save(user.id, { days: 7, workspaceId: w });
    const f = TestBed.createComponent(Home);
    f.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/workspaces')
      .flush(workspacePage([{ id: w, name: 'Equipe', status: 'ARCHIVED' }], 1));
    http.expectOne('/api/v1/dashboard/overview?days=7').flush(envelope(overview));
    expect(f.componentInstance.workspaceId).toBe('');
    expect(f.componentInstance.filterNotice()).toContain('não está disponível');
    expect(preferences.read(user.id)).toEqual({ days: 7, workspaceId: '' });
  });
  it('keeps filtering usable when the browser refuses to save preferences', () => {
    const f = home();
    vi.spyOn(TestBed.inject(DashboardPreferences), 'save').mockReturnValue(false);
    f.componentInstance.days = 7;
    f.componentInstance.filtersChanged();
    http.expectOne('/api/v1/dashboard/overview?days=7').flush(envelope(overview));
    expect(f.componentInstance.storageNotice()).toContain('Não foi possível lembrar');
    expect(f.componentInstance.data()).toEqual(overview);
  });
  it('keeps the overview accessible when validating a saved workspace fails temporarily', () => {
    const preferences = TestBed.inject(DashboardPreferences);
    preferences.save(user.id, { days: 7, workspaceId: w });
    const f = TestBed.createComponent(Home);
    f.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/workspaces')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/api/v1/dashboard/overview?days=7').flush(envelope(overview));
    expect(f.componentInstance.workspaceId).toBe('');
    expect(f.componentInstance.data()).toEqual(overview);
    expect(preferences.read(user.id).workspaceId).toBe(w);
    expect(f.componentInstance.filterNotice()).toContain('Não foi possível restaurar');
  });
  it('cancels the previous scope request when the filters change', () => {
    const f = home();
    f.componentInstance.days = 7;
    f.componentInstance.filtersChanged();
    const pending = http.expectOne('/api/v1/dashboard/overview?days=7');
    f.componentInstance.days = 90;
    f.componentInstance.filtersChanged();
    expect(pending.cancelled).toBe(true);
    http.expectOne('/api/v1/dashboard/overview?days=90').flush(envelope(overview));
    expect(f.componentInstance.data()).toEqual(overview);
  });
  it('only enables ALL with API support, remembers it and hides previous-period comparisons', () => {
    const supported = {
      ...overview,
      period: { ...overview.period, supportedDays: [7, 30, 90, 'ALL'] as const },
    };
    const f = home({
      ...supported,
      period: { ...supported.period, supportedDays: [...supported.period.supportedDays] },
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('#dashboard-period option:last-child').disabled).toBe(
      false,
    );
    f.componentInstance.days = 'ALL';
    f.componentInstance.filtersChanged();
    const all = {
      ...overview,
      period: {
        days: 'ALL' as const,
        supportedDays: [7, 30, 90, 'ALL'] as const,
        from: null,
        to: time,
        previousFrom: null,
        previousTo: null,
      },
    };
    http.expectOne('/api/v1/dashboard/overview?days=ALL').flush(envelope(all));
    f.detectChanges();
    expect(f.nativeElement.querySelector('.dashboard-updated').textContent).toContain(
      'Todo o período',
    );
    expect(f.nativeElement.textContent).not.toContain('vs. período anterior');
    expect(TestBed.inject(DashboardPreferences).read(user.id).days).toBe('ALL');
    f.destroy();
    const next = home();
    expect(next.componentInstance.days).toBe(30);
    expect(next.componentInstance.filterNotice()).toContain('Todo o período não está disponível');
    http.expectNone('/api/v1/dashboard/overview?days=ALL');
    next.detectChanges();
    expect(next.nativeElement.querySelector('#dashboard-period option:last-child').disabled).toBe(
      true,
    );
  });
  it('restores ALL after the API confirms its availability', () => {
    TestBed.inject(DashboardPreferences).save(user.id, { days: 'ALL', workspaceId: '' });
    const f = home({
      ...overview,
      period: { ...overview.period, supportedDays: [7, 30, 90, 'ALL'] },
    });
    http.expectOne('/api/v1/dashboard/overview?days=ALL').flush(
      envelope({
        ...overview,
        period: {
          ...overview.period,
          days: 'ALL',
          supportedDays: [7, 30, 90, 'ALL'],
          previousFrom: null,
          previousTo: null,
        },
      }),
    );
    expect(f.componentInstance.days).toBe('ALL');
  });
  it('keeps unavailable overview blocks empty while independently showing the real open inventory count', () => {
    const f = home(null);
    http
      .expectOne('/api/v1/dashboard/overview?days=30')
      .flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect(f.componentInstance.unavailable()).toBe(true);
    expect(f.nativeElement.textContent).toContain(
      'O painel de indicadores ainda não está disponível',
    );
    const cards = f.nativeElement.querySelectorAll('.dashboard-metric strong');
    expect(Array.from(cards).map((row) => (row as HTMLElement).textContent?.trim())).toEqual([
      '—',
      '—',
      '12',
      '—',
    ]);
    expect(f.nativeElement.querySelector('.dashboard-shortcuts a')).toBeTruthy();
    expect(f.nativeElement.querySelector('svg.dashboard-donut')).toBeNull();
  });
  it('distinguishes unavailable permission blocks from authorized empty totals, including zero denominators', () => {
    const empty = {
      ...overview,
      metrics: { ...overview.metrics, automationCoverage: { value: null, previousValue: null } },
      results: null,
      projects: [],
      activity: null,
      governance: [],
      documents: [],
    };
    const f = home(empty);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Resultados indisponíveis neste acesso');
    expect(f.nativeElement.textContent).toContain('Consultando todos os projetos');
    expect(f.nativeElement.textContent).toContain('Atividades indisponíveis neste acesso');
    expect(f.nativeElement.querySelector('.metric-coverage strong').textContent.trim()).toBe('—');
    f.componentInstance.data.set({
      ...empty,
      results: { NOT_TESTED: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, SKIPPED: 0 },
    });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Nenhum resultado no período');
    expect(f.nativeElement.textContent).not.toContain('NaN');
  });
  it('respects Retry-After and never displays stale metrics after a failed refresh', () => {
    const f = home();
    f.detectChanges();
    f.componentInstance.refresh();
    http.expectOne('/api/v1/dashboard/overview?days=30').flush(
      { code: 'RATE_LIMIT_EXCEEDED' },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new HttpHeaders({ 'Retry-After': '60' }),
      },
    );
    f.detectChanges();
    expect(f.componentInstance.state.wait()).toBe(60);
    expect(f.componentInstance.data()).toBeNull();
    f.componentInstance.refresh();
    http.expectNone((r) => r.url === '/api/v1/dashboard/overview');
    expect(f.componentInstance.unavailable()).toBe(false);
    expect(f.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });
  it('moves account details, health checks and explicit session revocation to Meu Perfil', () => {
    const f = TestBed.createComponent(Profile);
    f.detectChanges();
    http.expectOne('/api/v1/health/ready').flush(envelope({ status: 'up' }));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain(user.email);
    expect(f.nativeElement.textContent).toContain('Disponibilidade do serviço');
    expect(f.nativeElement.textContent).toContain('Sessões de acesso');
    f.componentInstance.reloadProfile();
    f.componentInstance.reloadProfile();
    http.expectOne('/api/v1/auth/me').flush(envelope(user));
    const done = new Subject<void>();
    const logout = vi.spyOn(TestBed.inject(AuthService), 'logout').mockReturnValue(done);
    const navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (Array.from(f.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.trim() === 'Encerrar todas as sessões')!
      .click();
    f.detectChanges();
    expect(logout).not.toHaveBeenCalled();
    (Array.from(f.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.trim() === 'Confirmar')!
      .click();
    f.componentInstance.logout(true);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith(true);
    done.next();
    done.complete();
    expect(navigation).toHaveBeenCalledWith(['/login']);
  });
});

describe('Framework governance on Home', () => {
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
  const source = {
    id: p,
    name: 'Avaliação de outubro',
    status: 'IN_PROGRESS' as const,
    version: 9,
    definitionVersion: 7,
    assessmentDate: '2026-10-04',
    closedAt: null,
  };
  const block: DashboardFrameworkGovernance = {
    indicatorType: 'INTERNAL',
    generatedAt: time,
    frameworkCount: 1,
    frameworksWithAssessment: 1,
    overall: summary,
    frameworks: [
      {
        workspaceId: w,
        workspaceName: 'Equipe',
        frameworkId: w,
        frameworkName: 'TMMi',
        state: 'IN_PROGRESS',
        assessment: source,
        definitionVersionDiffers: false,
        summary,
        sections: [{ id: p, code: 'TMMI-2', name: 'TMMi Nível 2', summary }],
      },
    ],
    attention: {
      notAssessedControls: 1,
      notMetControls: 0,
      partiallyMetControls: 1,
      expiredEvidence: 2,
      upcomingGoals: 3,
    },
  };
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  afterEach(() => TestBed.resetTestingModule());
  it('links to the exact displayed assessment and preserves server summaries and attention counts', () => {
    const f = TestBed.createComponent(FrameworkGoals);
    f.componentRef.setInput('data', block);
    f.detectChanges();
    const href = (f.nativeElement.querySelector('a') as HTMLAnchorElement).getAttribute('href')!;
    expect(href).toContain('frameworkId=' + w);
    expect(href).toContain('assessmentId=' + p);
    expect(f.nativeElement.textContent).toContain('62,5%');
    expect(f.nativeElement.textContent).toContain('TMMi Nível 2');
    expect(f.nativeElement.textContent).toContain('Provisório');
    expect(f.nativeElement.textContent).toContain('2 evidências expiradas');
    expect(f.nativeElement.textContent).toContain('3 metas com prazo');
  });
  it('shows frameworks without assessment without inventing zero progress', () => {
    const f = TestBed.createComponent(FrameworkGoals);
    f.componentRef.setInput('data', {
      ...block,
      overall: null,
      frameworksWithAssessment: 0,
      frameworks: [
        {
          ...block.frameworks[0],
          state: 'NO_ASSESSMENT',
          assessment: null,
          summary: null,
          sections: [],
        },
      ],
    });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sem avaliação');
    expect(f.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(f.nativeElement.querySelector('a').getAttribute('href')).not.toContain('assessmentId=');
  });
});
