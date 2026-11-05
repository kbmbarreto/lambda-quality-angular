import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { Home } from './home';
import { DashboardApi } from './dashboard-api.service';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { AuthorizedProjects } from '../projects/authorized-projects';
import { DefectApi } from '../defects/defect-api.service';

const page = (total: number) => ({
  data: [],
  meta: {
    pagination: {
      page: 1,
      size: 1,
      totalItems: total,
      totalPages: total,
      hasNext: total > 1,
      hasPrevious: false,
    },
  },
});

describe('Current open defects on the home dashboard', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthorizedProjects, useValue: { list: () => NEVER } },
        { provide: WorkspaceApi, useValue: { listWorkspaces: () => of(page(0)) } },
        { provide: DashboardApi, useValue: { overview: () => of(null) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  const countRequest = () => http.expectOne((r) => r.url === '/api/v1/defects');
  function home() {
    const f = TestBed.createComponent(Home);
    f.detectChanges();
    return f;
  }
  it('counts the entire authorized current OPEN inventory, regardless of period or page size', () => {
    const f = home();
    const request = countRequest();
    expect(request.request.params.get('status')).toBe('OPEN');
    expect(request.request.params.get('size')).toBe('1');
    expect(request.request.params.has('days')).toBe(false);
    expect(request.request.params.has('workspaceId')).toBe(false);
    request.flush(page(153));
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metric-defects strong').textContent.trim()).toBe('153');
    expect(f.nativeElement.querySelector('.metric-defects').textContent).toContain('posição atual');
    expect(f.componentInstance.metrics()[2].previousValue).toBeNull();
    f.componentInstance.days = 7;
    f.componentInstance.filtersChanged();
    const next = countRequest();
    expect(next.request.params.has('days')).toBe(false);
    next.flush(page(153));
    expect(f.componentInstance.openDefects()).toBe(153);
  });
  it('cancels the old Workspace request and refreshes again after successful defect mutations', () => {
    const f = home();
    const old = countRequest();
    f.componentInstance.workspaceId = 'another-workspace';
    f.componentInstance.filtersChanged();
    expect(old.cancelled).toBe(true);
    expect(f.componentInstance.openDefects()).toBeNull();
    const current = countRequest();
    expect(current.request.params.get('workspaceId')).toBe('another-workspace');
    current.flush(page(12));
    TestBed.inject(DefectApi).inventoryChanged.next();
    expect(f.componentInstance.openDefects()).toBeNull();
    countRequest().flush(page(11));
    expect(f.componentInstance.openDefects()).toBe(11);
  });
  it('keeps failures unavailable, preserves requestId, and distinguishes a confirmed zero', () => {
    const f = home();
    countRequest().flush(page(10));
    f.componentInstance.refresh();
    countRequest().flush(
      { code: 'SERVICE_UNAVAILABLE', requestId: 'open-count-ref' },
      { status: 503, statusText: 'Unavailable' },
    );
    f.detectChanges();
    expect(f.componentInstance.openDefects()).toBeNull();
    expect(f.nativeElement.querySelector('.metric-defects strong').textContent.trim()).toBe('—');
    expect(f.nativeElement.textContent).toContain('open-count-ref');
    f.componentInstance.loadOpenDefects();
    countRequest().flush(page(0));
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metric-defects strong').textContent.trim()).toBe('0');
  });
});
