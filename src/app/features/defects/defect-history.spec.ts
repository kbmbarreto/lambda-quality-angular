import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProjectContext } from '../../core/project-context.service';
import { DefectHistory } from './defect-history';
import { DefectHistoryEntry } from './defect-history-api.service';
import { Defect } from './defect.models';

const item = { id: 'd1', workspaceId: 'w', projectId: 'p', version: 4 } as Defect;
const path = '/api/v1/workspaces/w/projects/p/defects/d1/history';
const entry: DefectHistoryEntry = {
  id: 'e1',
  type: 'UPDATED',
  actor: { id: 'u1', displayName: 'Pessoa de teste' },
  createdAt: '2026-10-09T14:30:00Z',
  fromStatus: 'OPEN',
  toStatus: 'IN_PROGRESS',
  comment: 'Investigando o erro.\n<script>alert(1)</script>',
};
function page(data: DefectHistoryEntry[], number = 1, hasNext = false) {
  return {
    data,
    meta: {
      pagination: {
        page: number,
        size: 100,
        totalItems: 2,
        totalPages: 2,
        hasNext,
        hasPrevious: number > 1,
      },
    },
  };
}
describe('Defect history additive integration', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function history() {
    const f = TestBed.createComponent(DefectHistory);
    f.componentRef.setInput('item', item);
    f.detectChanges();
    return f;
  }
  it('automatically loads all pages and renders authors, dates, transitions and escaped comments', () => {
    const f = history();
    const first = http.expectOne((r) => r.url === path);
    expect(first.request.params.get('sort')).toBe('createdAt,asc');
    expect(first.request.params.get('size')).toBe('100');
    first.flush(page([entry], 1, true));
    expect(f.componentInstance.entries()).toEqual([]);
    const second = http.expectOne((r) => r.url === path);
    expect(second.request.params.get('page')).toBe('2');
    second.flush(
      page(
        [
          {
            ...entry,
            id: 'e2',
            fromStatus: 'IN_PROGRESS',
            toStatus: 'RESOLVED',
            comment: 'Corrigido.',
          },
        ],
        2,
      ),
    );
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.defect-event')).toHaveLength(2);
    expect(f.nativeElement.textContent).toContain('Pessoa de teste');
    expect(f.nativeElement.textContent).toContain('09/10/2026 11:30:00');
    expect(f.nativeElement.textContent).toContain('Aberto');
    expect(f.nativeElement.textContent).toContain('Resolvido');
    expect(f.nativeElement.textContent).toContain('<script>alert(1)</script>');
    expect(f.nativeElement.querySelector('script')).toBeNull();
    expect(f.nativeElement.textContent).toContain('histórico completo');
    http.expectNone((r) => r.url === path);
  });
  it('refreshes after a new defect version and cancels reads of the previous scope', () => {
    const f = history();
    http.expectOne((r) => r.url === path).flush(page([entry]));
    f.componentRef.setInput('item', { ...item, version: 5 });
    f.detectChanges();
    const pending = http.expectOne((r) => r.url === path);
    expect(f.componentInstance.entries()).toEqual([]);
    f.componentRef.setInput('item', { ...item, id: 'd2', workspaceId: 'w2' });
    f.detectChanges();
    expect(pending.cancelled).toBe(true);
    http
      .expectOne((r) => r.url === '/api/v1/workspaces/w2/projects/p/defects/d2/history')
      .flush(page([]));
    expect(f.componentInstance.entries()).toEqual([]);
  });
  it('handles the absent API without claiming empty history or invalidating project access', () => {
    const f = history();
    const context = TestBed.inject(ProjectContext);
    http
      .expectOne((r) => r.url === path)
      .flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect(f.componentInstance.unsupported()).toBe(true);
    expect(f.nativeElement.textContent).toContain('ainda não estão disponíveis');
    expect(f.nativeElement.textContent).not.toContain('histórico completo');
    expect(context.notice()).toBe('');
  });
  it('does not treat permission errors as missing API and preserves requestId', () => {
    const f = history();
    http
      .expectOne((r) => r.url === path)
      .flush(
        { code: 'AUTH_FORBIDDEN', requestId: 'history-ref' },
        { status: 403, statusText: 'Forbidden' },
      );
    f.detectChanges();
    expect(f.componentInstance.unsupported()).toBe(false);
    expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('history-ref');
    expect(f.nativeElement.textContent).not.toContain('histórico completo');
  });
  it('clears partial results if a later page fails and respects Retry-After', () => {
    const f = history();
    http.expectOne((r) => r.url === path).flush(page([entry], 1, true));
    http
      .expectOne((r) => r.url === path)
      .flush(
        { requestId: 'second-page' },
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: new HttpHeaders({ 'Retry-After': '30' }),
        },
      );
    f.detectChanges();
    expect(f.componentInstance.entries()).toEqual([]);
    expect(f.componentInstance.state.wait()).toBe(30);
    f.componentInstance.load();
    http.expectNone((r) => r.url === path);
    expect(f.nativeElement.querySelector('button').disabled).toBe(true);
  });
});
