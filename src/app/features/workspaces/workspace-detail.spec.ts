import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { WorkspaceDetail } from './workspace-detail';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Workspace } from './workspace.models';

const workspace: Workspace = {
  id: 'workspace-one',
  name: 'Equipe Quality',
  slug: 'equipe-quality',
  status: 'ACTIVE',
  ownerMemberId: 'owner-one',
  memberId: 'member-one',
  isOwner: false,
  permissions: ['workspace.read', 'tag.read', 'field.read', 'attachment.read'],
  createdAt: '2026-10-02T12:00:00Z',
  updatedAt: '2026-10-02T12:00:00Z',
};
const envelope = <T>(data: T) => ({
  data,
  message: 'OK',
  meta: { requestId: 'request-one', timestamp: '2026-10-02T12:00:00Z' },
});
const emptyPage = {
  ...envelope([]),
  meta: {
    ...envelope([]).meta,
    pagination: {
      page: 1,
      size: 20,
      totalItems: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    },
  },
};

describe('Workspace scope and capabilities', () => {
  let fixture: ComponentFixture<WorkspaceDetail>;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ workspaceId: workspace.id }));
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
    fixture = TestBed.createComponent(WorkspaceDetail);
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  it('hides tenant administration, invites and ownership transfer for a regular member', async () => {
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Editar Workspace');
    expect(fixture.nativeElement.textContent).not.toContain('Transferir propriedade');
    const navigation = fixture.nativeElement.querySelector('.workspace-tabs');
    expect(navigation.textContent).not.toContain('Convites');
    fixture.componentInstance.selectTab('invitations');
    expect(fixture.componentInstance.tab()).toBe('overview');
  });
  it('clears data immediately when switching workspace and ignores canceled results', () => {
    const context = TestBed.inject(WorkspaceContext);
    expect(context.selected()?.id).toBe(workspace.id);
    fixture.componentInstance.tab.set('members');
    params.next(convertToParamMap({ workspaceId: 'workspace-two' }));
    expect(context.selected()).toBeNull();
    expect(fixture.componentInstance.tab()).toBe('overview');
    http
      .expectOne('/api/v1/workspaces/workspace-two')
      .flush(envelope({ ...workspace, id: 'workspace-two', name: 'Outra equipe' }));
    expect(context.selected()?.name).toBe('Outra equipe');
  });
  it('invalidates scoped screens and reloads permissions after a denied resource operation', () => {
    const context = TestBed.inject(WorkspaceContext);
    fixture.componentInstance.tab.set('members');
    context.accessChanged.next();
    expect(context.selected()).toBeNull();
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    expect(context.selected()?.permissions).toEqual(workspace.permissions);
  });
  it('returns to the workspace list when membership is no longer visible', () => {
    fixture.componentInstance.refresh();
    http
      .expectOne('/api/v1/workspaces/workspace-one')
      .flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(TestBed.inject(WorkspaceContext).selected()).toBeNull();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/workspaces']);
  });
  it('does not submit transfer for a non-owner even when a destination is selected', () => {
    fixture.componentInstance.newOwner.set({ id: 'member-other' } as never);
    fixture.componentInstance.transfer();
    http.expectNone((request) => request.url.endsWith('/ownership/transfer'));
  });
  it('uses the member ID for ownership transfer, then reloads capabilities', () => {
    TestBed.inject(WorkspaceContext).selected.set({ ...workspace, isOwner: true });
    fixture.componentInstance.newOwner.set({ id: 'member-other', userId: 'global-user' } as never);
    fixture.componentInstance.transfer();
    const request = http.expectOne('/api/v1/workspaces/workspace-one/ownership/transfer');
    expect(request.request.body).toEqual({ memberId: 'member-other' });
    request.flush(envelope({ ...workspace, ownerMemberId: 'member-other' }));
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    expect(TestBed.inject(WorkspaceContext).selected()?.isOwner).toBe(false);
  });
  it('returns to overview when a refreshed capability no longer permits the active tab', () => {
    fixture.componentInstance.tab.set('invitations');
    fixture.componentInstance.refresh();
    http.expectOne('/api/v1/workspaces/workspace-one').flush(envelope(workspace));
    expect(fixture.componentInstance.tab()).toBe('overview');
  });
  it('allows an upload-only capability without querying the private library', async () => {
    TestBed.inject(WorkspaceContext).selected.set({
      ...workspace,
      permissions: ['workspace.read', 'attachment.upload'],
    });
    fixture.componentInstance.selectTab('attachments');
    await fixture.whenStable();
    http.expectNone((request) => request.url.endsWith('/attachments'));
    expect(fixture.nativeElement.textContent).toContain('Enviar arquivo');
    expect(fixture.nativeElement.textContent).toContain(
      'não possui permissão para consultar a biblioteca',
    );
  });
  it('uses paginated requests when browsing a readable catalog', async () => {
    fixture.componentInstance.selectTab('tags');
    fixture.detectChanges();
    await vi.waitFor(() => {
      const request = http.expectOne((request) => request.url.endsWith('/tags'));
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('size')).toBe('20');
      request.flush(emptyPage);
    });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Nenhum registro encontrado');
  });
});
