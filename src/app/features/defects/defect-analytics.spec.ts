import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { DefectAnalyticsApi } from './defect-analytics-api.service';
import { DefectAnalyticsPanel, analyticsRangeError, monthWindow } from './defect-analytics';
import { DefectAnalytics } from './defect-analytics.models';
const w = '11111111-1111-4111-8111-111111111111',
  p = '22222222-2222-4222-8222-222222222222';
const time = '2026-10-04T12:00:00Z';
const counts = { HOMOLOGATION: 10, PRODUCTION: 5, OTHER: 2, UNSPECIFIED: 1 };
const data: DefectAnalytics = {
  generatedAt: time,
  period: { from: '2026-09-01', to: '2026-09-30', dateField: 'createdAt', timezone: 'UTC' },
  totalBugs: 18,
  byStatus: { OPEN: 2, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 12, REJECTED: 1 },
  byCategory: counts,
  monthly: [
    {
      month: '2026-07',
      totalBugs: 0,
      byCategory: { HOMOLOGATION: 0, PRODUCTION: 0, OTHER: 0, UNSPECIFIED: 0 },
    },
    { month: '2026-08', totalBugs: 18, byCategory: counts },
    { month: '2026-09', totalBugs: 18, byCategory: counts },
  ],
  byProject: [
    { projectId: p, projectKey: 'QA', projectName: 'Portal', totalBugs: 18, byCategory: counts },
  ],
  byEnvironment: [
    { projectId: p, environmentId: null, name: null, category: 'UNSPECIFIED', totalBugs: 1 },
  ],
};
const envelope = (value: unknown) => ({
  data: value,
  message: 'OK',
  meta: { requestId: 'test', timestamp: time },
});
const path = `/api/v1/workspaces/${w}/defects/analytics`;
describe('Defect analytics integration', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    try {
      http.verify({ ignoreCancelled: true });
    } finally {
      TestBed.resetTestingModule();
    }
  });
  function panel() {
    const fixture = TestBed.createComponent(DefectAnalyticsPanel);
    fixture.componentRef.setInput('workspaceId', w);
    fixture.detectChanges();
    const initial = http.match((r) => r.url === path);
    expect(initial).toHaveLength(2);
    initial.forEach((request) => request.flush(envelope(data)));
    fixture.componentInstance.from = '2026-07-01';
    fixture.componentInstance.to = '2026-09-30';
    fixture.componentInstance.month = '2026-09';
    fixture.componentInstance.apply();
    http.match((r) => r.url === path).forEach((request) => request.flush(envelope(data)));
    fixture.detectChanges();
    return fixture;
  }
  it('requests only documented query fields and preserves UNSPECIFIED', () => {
    TestBed.inject(DefectAnalyticsApi)
      .analytics(w, { from: '2026-09-01', to: '2026-09-30', projectId: p, category: 'UNSPECIFIED' })
      .subscribe();
    const request = http.expectOne((r) => r.url === path);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual(['from', 'to', 'projectId', 'category']);
    expect(request.request.params.get('category')).toBe('UNSPECIFIED');
    request.flush(envelope(data));
  });
  it('renders the requested cards, all environment categories and project distributions from two windows', () => {
    const f = panel(),
      text = f.nativeElement.textContent;
    for (const label of [
      'Histórico de bugs encontrados',
      'Em backlog',
      'Em correção',
      'Encerrados',
      'Resolvidos',
      'Rejeitados',
      'Sem ambiente',
      'Outro',
      'Homologação por projeto',
      'Produção por projeto',
      'Portal',
    ])
      expect(text).toContain(label);
    expect(f.componentInstance.cards().map((row) => row.value)).toEqual([
      18, 2, 1, 12, 10, 5, 2, 1,
    ]);
    expect(f.componentInstance.chart().monthly[0].bars.every((bar) => bar.count === 0)).toBe(true);
    expect(f.nativeElement.querySelectorAll('.horizontal-bug-bars')).toHaveLength(4);
    expect(text).toContain('Situação atual');
    http.expectNone((r) => r.url.endsWith('/defects'));
  });
  it('loads another month once and reuses the history and all project counts', () => {
    const f = panel(),
      history = f.componentInstance.history();
    f.componentInstance.selectMonth('2026-08');
    const request = http.expectOne((r) => r.url === path);
    expect(request.request.params.get('from')).toBe('2026-08-01');
    expect(request.request.params.get('to')).toBe('2026-08-31');
    request.flush(
      envelope({ ...data, period: { ...data.period, from: '2026-08-01', to: '2026-08-31' } }),
    );
    expect(f.componentInstance.history()).toBe(history);
  });
  it('cancels both previous windows and clears results when the scope changes', () => {
    const f = panel(),
      c = f.componentInstance;
    c.projectId = p;
    c.apply();
    const previous = http.match((r) => r.url === path);
    expect(previous).toHaveLength(2);
    c.category = 'PRODUCTION';
    c.apply();
    expect(previous.every((request) => request.cancelled)).toBe(true);
    expect(c.history()).toBeNull();
    expect(c.monthData()).toBeNull();
    const current = http.match((r) => r.url === path);
    expect(current).toHaveLength(2);
    for (const request of current) {
      expect(request.request.params.get('category')).toBe('PRODUCTION');
      expect(request.request.params.get('projectId')).toBe(p);
      request.flush(envelope(data));
    }
  });
  it('does not turn failure into zero and offers manual retry', () => {
    const f = panel(),
      c = f.componentInstance;
    c.apply();
    const requests = http.match((r) => r.url === path);
    requests[0].flush(
      { code: 'SERVICE_UNAVAILABLE', requestId: 'trace' },
      { status: 503, statusText: 'Unavailable' },
    );
    expect(requests[1].cancelled).toBe(true);
    expect(c.history()).toBeNull();
    expect(c.monthData()).toBeNull();
    expect(c.cards().every((card) => card.value === undefined)).toBe(true);
    expect(c.state.error()).toContain('trace');
    c.retry();
    http.match((r) => r.url === path).forEach((request) => request.flush(envelope(data)));
    expect(c.monthData()?.totalBugs).toBe(18);
  });
  it('honors Retry-After and stops requests when the component is destroyed', () => {
    const f = panel(),
      c = f.componentInstance;
    c.apply();
    const requests = http.match((r) => r.url === path);
    requests[0].flush(
      { code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429, statusText: 'Rate limited', headers: new HttpHeaders({ 'Retry-After': '3' }) },
    );
    expect(c.state.wait()).toBe(3);
    c.retry();
    c.apply();
    http.expectNone((r) => r.url === path);
    f.destroy();
  });
  it('keeps zero values distinguishable from missing access/data', () => {
    const f = panel(),
      c = f.componentInstance;
    c.apply();
    const empty = {
      ...data,
      totalBugs: 0,
      byProject: [],
      byEnvironment: [],
      byStatus: { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, REJECTED: 0 },
      byCategory: { PRODUCTION: 0, HOMOLOGATION: 0, OTHER: 0, UNSPECIFIED: 0 },
    };
    http.match((r) => r.url === path).forEach((request) => request.flush(envelope(empty)));
    f.detectChanges();
    expect(c.cards().every((card) => card.value === 0)).toBe(true);
    expect(f.nativeElement.textContent).toContain('Nenhum projeto autorizado');
  });
  it('reads every project page and keeps authorized archived projects in selectors', () => {
    TestBed.inject(WorkspaceContext).selected.set({
      id: w,
      name: 'Equipe',
      slug: 'equipe',
      status: 'ACTIVE',
      ownerMemberId: 'member',
      createdAt: time,
      updatedAt: time,
      permissions: ['project.read'],
    });
    const f = TestBed.createComponent(DefectAnalyticsPanel);
    f.componentRef.setInput('workspaceId', w);
    f.detectChanges();
    const page = (rows: unknown[], number: number, next: boolean) => ({
      ...envelope(rows),
      meta: {
        pagination: {
          page: number,
          size: 100,
          totalItems: 2,
          totalPages: 2,
          hasNext: next,
          hasPrevious: number > 1,
        },
      },
    });
    http
      .expectOne((r) => r.url === `/api/v1/workspaces/${w}/projects`)
      .flush(
        page(
          [{ id: p, name: 'Portal', status: 'ARCHIVED', permissions: ['defect.read'] }],
          1,
          true,
        ),
      );
    const second = http.expectOne((r) => r.url === `/api/v1/workspaces/${w}/projects`);
    expect(second.request.params.get('page')).toBe('2');
    second.flush(
      page([{ id: 'hidden', name: 'Privado', status: 'ACTIVE', permissions: [] }], 2, false),
    );
    http.match((r) => r.url === path).forEach((request) => request.flush(envelope(data)));
    expect(f.componentInstance.projects()).toHaveLength(1);
    expect(f.componentInstance.projects()[0].status).toBe('ARCHIVED');
  });
  it('rejects invalid calendar dates, reversed windows and excess fiscal months before HTTP', () => {
    const f = panel(),
      c = f.componentInstance;
    for (const [from, to] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-09-02', '2026-09-01'],
      ['2023-01-31', '2026-01-01'],
    ]) {
      c.from = from;
      c.to = to;
      c.apply();
      expect(c.validation()).toBeTruthy();
      http.expectNone((r) => r.url === path);
    }
    expect(analyticsRangeError('2024-01-01', '2026-12-31')).toBe('');
  });
  it('clips the first/last month to exact UTC calendar boundaries', () => {
    expect(monthWindow('2024-02', '2024-02-10', '2024-02-29')).toEqual({
      from: '2024-02-10',
      to: '2024-02-29',
    });
    expect(monthWindow('2026-09', '2026-07-20', '2026-09-15')).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
    });
  });
  it('requests a scope permission refresh when analytics access is revoked', () => {
    const context = TestBed.inject(ProjectContext),
      events: unknown[] = [];
    const subscription = context.accessChanged.subscribe((event) => events.push(event));
    TestBed.inject(DefectAnalyticsApi)
      .analytics(w, { from: '2026-09-01', to: '2026-09-30' })
      .subscribe({ error: () => {} });
    http
      .expectOne((r) => r.url === path)
      .flush({ code: 'FORBIDDEN' }, { status: 403, statusText: 'Forbidden' });
    expect(events).toEqual([{ workspaceId: w }]);
    expect(context.notice()).toContain('permissões');
    subscription.unsubscribe();
  });
});
