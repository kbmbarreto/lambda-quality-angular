import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DefectInventory } from './defect-inventory';
import { DefectInventoryIndicators } from './defect-inventory-indicators';
import { DefectSummaryApi } from './defect-summary-api.service';
import { DefectInventorySummary, summarizeDefects } from './defect-summary';
import { DefectInventoryRow } from './defect.models';
import { DefectApi } from './defect-api.service';

const time = '2026-10-08T12:00:00Z';
const row = (
  id: string,
  status: DefectInventoryRow['status'] = 'OPEN',
  category: 'HOMOLOGATION' | 'PRODUCTION' | 'OTHER' | null = null,
): DefectInventoryRow => ({
  id,
  workspaceId: 'w',
  workspaceName: 'Equipe',
  projectId: 'p',
  projectName: 'Portal',
  projectKey: 'QA',
  projectStatus: 'ACTIVE',
  sequence: 1,
  humanId: 'QA-DEF-1',
  title: 'Falha',
  status,
  severity: 'MAJOR',
  version: 1,
  createdAt: time,
  updatedAt: time,
  environmentSnapshot: category ? { name: 'Ambiente', category } : null,
});
const page = (data: DefectInventoryRow[], n = 1, hasNext = false) => ({
  data,
  meta: {
    pagination: {
      page: n,
      size: 100,
      totalItems: 200,
      totalPages: hasNext ? 2 : n,
      hasNext,
      hasPrevious: n > 1,
    },
  },
});
const summary: DefectInventorySummary = {
  ...summarizeDefects([
    row('1', 'OPEN', 'HOMOLOGATION'),
    row('2', 'CLOSED', 'PRODUCTION'),
    row('3', 'RESOLVED', 'OTHER'),
    row('4', 'IN_PROGRESS'),
  ]),
  generatedAt: time,
  resolutionTime: { averageHours: 18.5, sampleSize: 2, basis: 'CREATED_TO_RESOLVED' },
};
const envelope = (data: unknown) => ({
  data,
  message: 'OK',
  meta: { requestId: 'req', timestamp: time },
});
let http: HttpTestingController;
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  http = TestBed.inject(HttpTestingController);
});
afterEach(() => {
  http.verify({ ignoreCancelled: true });
  TestBed.resetTestingModule();
});

it('uses all inventory pages and preserved categories without inventing correction durations', () => {
  let data: DefectInventorySummary | undefined;
  TestBed.inject(DefectSummaryApi)
    .get({ workspaceId: 'w', q: 'login', severity: 'MAJOR', status: 'ALL' })
    .subscribe((result) => (data = result));
  const aggregate = http.expectOne((r) => r.url === '/api/v1/defects/summary');
  expect(aggregate.request.params.get('workspaceId')).toBe('w');
  aggregate.flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
  const first = http.expectOne((r) => r.url === '/api/v1/defects');
  expect(first.request.params.get('size')).toBe('100');
  expect(first.request.params.get('q')).toBe('login');
  first.flush(
    page([row('1', 'OPEN', 'HOMOLOGATION'), row('2', 'RESOLVED', 'PRODUCTION')], 1, true),
  );
  expect(data).toBeUndefined();
  const second = http.expectOne((r) => r.url === '/api/v1/defects' && r.params.get('page') === '2');
  expect(second.request.params.get('severity')).toBe('MAJOR');
  second.flush(
    page([row('3', 'CLOSED', 'OTHER'), row('4', 'IN_PROGRESS'), row('5', 'REJECTED')], 2),
  );
  expect(data!.totalBugs).toBe(5);
  expect(data!.byStatus.CLOSED).toBe(1);
  expect(data!.byStatus.RESOLVED).toBe(1);
  expect(data!.byCategory).toEqual({ HOMOLOGATION: 1, PRODUCTION: 1, OTHER: 1, UNSPECIFIED: 2 });
  expect(data!.resolutionTime).toBeNull();
});

it('never presents partial totals or changes the scope after a missing summary and denied inventory', () => {
  let values = 0,
    failure: any;
  TestBed.inject(DefectSummaryApi)
    .get({ workspaceId: 'denied' })
    .subscribe({ next: () => values++, error: (error) => (failure = error) });
  http
    .expectOne((r) => r.url === '/api/v1/defects/summary')
    .flush({}, { status: 404, statusText: 'Not Found' });
  const fallback = http.expectOne((r) => r.url === '/api/v1/defects');
  expect(fallback.request.params.get('workspaceId')).toBe('denied');
  fallback.flush(
    { code: 'RESOURCE_NOT_FOUND', requestId: 'denied-request' },
    { status: 404, statusText: 'Not Found' },
  );
  expect(values).toBe(0);
  expect(failure.error.requestId).toBe('denied-request');
});

it('uses the aggregate API after delivery and propagates errors without scanning inventory', () => {
  const api = TestBed.inject(DefectSummaryApi);
  let data: DefectInventorySummary | undefined;
  api.get({}).subscribe((result) => (data = result));
  http.expectOne('/api/v1/defects/summary').flush(envelope(summary));
  expect(data).toEqual(summary);
  api.get({ workspaceId: 'other' }).subscribe({ error: () => {} });
  http
    .expectOne('/api/v1/defects/summary?workspaceId=other')
    .flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
  http.expectNone((r) => r.url === '/api/v1/defects');
});

function indicators(query = { workspaceId: 'w' }) {
  const f = TestBed.createComponent(DefectInventoryIndicators);
  f.componentRef.setInput('query', query);
  f.detectChanges();
  return f;
}
it('renders seven cards, separates resolved from closed and uses the API duration and sample', () => {
  const f = indicators();
  http.expectOne((r) => r.url === '/api/v1/defects/summary').flush(envelope(summary));
  f.detectChanges();
  expect(f.nativeElement.querySelectorAll('.defect-kpi').length).toBe(7);
  expect(f.nativeElement.querySelector('.defect-resolution-kpi').textContent).toContain('18,5 h');
  expect(f.nativeElement.querySelector('.defect-resolution-kpi').textContent).toContain('2 bugs');
  expect(f.nativeElement.querySelector('.defect-resolution-kpi').textContent).toContain(
    'Da criação à resolução',
  );
  expect(
    f.nativeElement.querySelector('.defect-status-donut').getAttribute('aria-label'),
  ).toContain('4 bugs');
  expect(f.nativeElement.textContent).toContain('Resolvido');
  expect(f.nativeElement.textContent).toContain('Sem ambiente');
});

it('distinguishes zero, no resolution samples and unavailable duration without drawing fake progress', () => {
  const f = indicators();
  http
    .expectOne((r) => r.url === '/api/v1/defects/summary')
    .flush(
      envelope({
        ...summary,
        resolutionTime: { averageHours: 0, sampleSize: 1, basis: 'IN_PROGRESS_TO_RESOLVED' },
      }),
    );
  f.detectChanges();
  expect(f.nativeElement.querySelector('.defect-resolution-kpi strong').textContent).toBe('0 h');
  expect(f.nativeElement.querySelector('.defect-resolution-kpi').textContent).toContain(
    'Do início da correção',
  );
  f.componentInstance.data.set({
    ...summary,
    resolutionTime: { averageHours: null, sampleSize: 0, basis: 'CREATED_TO_RESOLVED' },
  });
  f.detectChanges();
  expect(f.nativeElement.querySelector('.defect-resolution-kpi').textContent).toContain(
    'Sem resoluções',
  );
  f.componentInstance.data.set({ ...summary, resolutionTime: null });
  f.detectChanges();
  expect(f.nativeElement.querySelector('.defect-resolution-kpi strong').textContent).toBe('—');
  expect(f.nativeElement.querySelector('.defect-resolution-kpi').textContent).toContain(
    'Indisponível',
  );
});

it('cancels obsolete filter requests and clears indicators before a new scope is read', () => {
  const f = indicators();
  const old = http.expectOne((r) => r.url === '/api/v1/defects/summary');
  f.componentRef.setInput('query', {
    workspaceId: 'w2',
    status: 'OPEN',
    q: 'login',
    severity: 'CRITICAL',
  });
  f.detectChanges();
  expect(old.cancelled).toBe(true);
  expect(f.componentInstance.data()).toBeNull();
  const latest = http.expectOne((r) => r.url === '/api/v1/defects/summary');
  expect(latest.request.params.get('workspaceId')).toBe('w2');
  expect(latest.request.params.get('status')).toBe('OPEN');
  expect(latest.request.params.get('q')).toBe('login');
  expect(latest.request.params.get('severity')).toBe('CRITICAL');
  latest.flush(envelope(summary));
});

it('preserves requestId and cooldown after failures and never shows page-one totals as complete', () => {
  const f = indicators();
  http
    .expectOne((r) => r.url === '/api/v1/defects/summary')
    .flush({}, { status: 404, statusText: 'Not Found' });
  http.expectOne((r) => r.url === '/api/v1/defects').flush(page([row('1')], 1, true));
  http
    .expectOne((r) => r.url === '/api/v1/defects')
    .flush(
      { code: 'RATE_LIMIT_EXCEEDED', requestId: 'summary-throttle' },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new HttpHeaders({ 'Retry-After': '15' }),
      },
    );
  f.detectChanges();
  expect(f.componentInstance.data()).toBeNull();
  expect(f.componentInstance.state.wait()).toBe(15);
  expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('summary-throttle');
  f.componentRef.setInput('query', { workspaceId: 'other' });
  f.detectChanges();
  expect(f.componentInstance.state.busy()).toBe(false);
  http.expectNone((r) => r.url === '/api/v1/defects');
});

it('keeps counts independent of table pagination and refreshes them after mutations', () => {
  const f = TestBed.createComponent(DefectInventory);
  f.detectChanges();
  http.expectOne((r) => r.url === '/api/v1/defects').flush(page([row('1')]));
  http.expectOne((r) => r.url === '/api/v1/defects/summary').flush(envelope(summary));
  f.detectChanges();
  f.componentInstance.list.page(2);
  http.expectOne((r) => r.url === '/api/v1/defects').flush(page([], 2));
  http.expectNone((r) => r.url === '/api/v1/defects/summary');
  TestBed.inject(DefectApi).inventoryChanged.next();
  f.detectChanges();
  http.expectOne((r) => r.url === '/api/v1/defects').flush(page([], 2));
  http.expectOne((r) => r.url === '/api/v1/defects/summary').flush(envelope(summarizeDefects([])));
});
