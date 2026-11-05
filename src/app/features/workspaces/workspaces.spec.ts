import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FormControl, FormGroup } from '@angular/forms';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { authInterceptor } from '../../core/auth.interceptor';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { InvitationContext } from '../../core/invitation-context.service';
import { WorkspaceApi } from './workspace-api.service';
import { Workspace } from './workspace.models';
import { WorkspaceList } from './workspace-list';
import { CatalogPanel } from './catalog-panel';
import { MembersPanel } from './members-panel';
import { AttachmentsPanel } from './attachments-panel';
import { AcceptInvitation } from './accept-invitation';
import { Login } from '../auth/login';

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
const page = <T>(data: T[], totalItems = data.length) => ({
  ...envelope(data),
  meta: {
    ...envelope(data).meta,
    pagination: {
      page: 1,
      size: 20,
      totalItems,
      totalPages: Math.ceil(totalItems / 20),
      hasNext: totalItems > 20,
      hasPrevious: false,
    },
  },
});

describe('Workspace integration', () => {
  let api: WorkspaceApi;
  let http: HttpTestingController;
  let auth: AuthService;
  let context: WorkspaceContext;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(WorkspaceApi);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    context = TestBed.inject(WorkspaceContext);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function login(): void {
    auth.login('user@example.com', 'password').subscribe();
    http
      .expectOne('/api/v1/auth/login')
      .flush(
        envelope({
          accessToken: 'access-one',
          refreshToken: 'refresh-one',
          tokenType: 'Bearer',
          expiresIn: 900,
          refreshExpiresIn: 86400,
        }),
      );
    http
      .expectOne('/api/v1/auth/me')
      .flush(
        envelope({
          id: 'user-one',
          email: 'user@example.com',
          displayName: 'Usuário',
          status: 'ACTIVE',
          createdAt: workspace.createdAt,
          emailVerifiedAt: workspace.createdAt,
        }),
      );
  }
  it('loads paginated workspaces with bearer and omits blank search values', () => {
    login();
    api
      .listWorkspaces({ page: 2, size: 20, sort: 'name,asc', q: '' })
      .subscribe((response) => expect(response.meta.pagination.totalItems).toBe(30));
    const request = http.expectOne((request) => request.url === '/api/v1/workspaces');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-one');
    expect(request.request.params.has('q')).toBe(false);
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page([workspace], 30));
  });
  it('does not log out on tenant forbidden errors, and requests capability refresh', () => {
    login();
    context.selected.set(workspace);
    const changed = vi.fn();
    context.accessChanged.subscribe(changed);
    api.list(workspace.id, 'invitations', { page: 1 }).subscribe({ error: () => undefined });
    http
      .expectOne((request) => request.url.endsWith('/invitations'))
      .flush({ code: 'AUTH_FORBIDDEN' }, { status: 403, statusText: 'Forbidden' });
    expect(auth.user()).not.toBeNull();
    expect(auth.accessToken).toBe('access-one');
    expect(changed).toHaveBeenCalledOnce();
    http.expectNone('/api/v1/auth/refresh');
  });
  it('invalidates the current scope on missing tenant resources without clearing global identity', () => {
    login();
    const changed = vi.fn();
    context.accessChanged.subscribe(changed);
    api.get(workspace.id, 'members', 'member-missing').subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/workspaces/workspace-one/members/member-missing')
      .flush({ code: 'RESOURCE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(changed).toHaveBeenCalledOnce();
    expect(auth.user()).not.toBeNull();
  });
  it('clears workspace data synchronously with session termination', () => {
    login();
    context.selected.set(workspace);
    auth.clearSession();
    expect(context.selected()).toBeNull();
  });
  it('sends only the file in multipart uploads and lets the browser supply Content-Type', () => {
    login();
    api.upload(workspace.id, new File(['test'], 'notes.txt', { type: 'text/plain' })).subscribe();
    const request = http.expectOne('/api/v1/workspaces/workspace-one/attachments');
    expect(request.request.body instanceof FormData).toBe(true);
    expect([...request.request.body.keys()]).toEqual(['file']);
    expect(request.request.headers.has('Content-Type')).toBe(false);
    request.flush(envelope({}));
  });
  it('uses authenticated blob downloads instead of public file links', () => {
    login();
    api
      .download(workspace.id, 'file-one')
      .subscribe((response) => expect(response.body).toBeInstanceOf(Blob));
    const request = http.expectOne(
      '/api/v1/workspaces/workspace-one/attachments/file-one/download',
    );
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-one');
    request.flush(new Blob(['private file']));
  });
  it('normalizes blob Problem Details before renewing expired download tokens', async () => {
    login();
    api.download(workspace.id, 'file-one').subscribe();
    const request = http.expectOne(
      '/api/v1/workspaces/workspace-one/attachments/file-one/download',
    );
    const problem = new Blob([JSON.stringify({ code: 'AUTH_ACCESS_TOKEN_EXPIRED' })], {
      type: 'application/problem+json',
    });
    request.flush(problem, { status: 401, statusText: 'Unauthorized' });
    const refresh = await vi.waitFor(() => http.expectOne('/api/v1/auth/refresh'));
    refresh.flush(
      envelope({
        accessToken: 'access-two',
        refreshToken: 'refresh-two',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 86400,
      }),
    );
    const retried = http.expectOne(
      '/api/v1/workspaces/workspace-one/attachments/file-one/download',
    );
    expect(retried.request.headers.get('Authorization')).toBe('Bearer access-two');
    retried.flush(new Blob(['private file']));
  });
  it('handles idempotent grant and revoke operations with 204 responses', () => {
    login();
    const completed = vi.fn();
    api.memberRole(workspace.id, 'member-one', 'role-one', true).subscribe(completed);
    const assign = http.expectOne(
      '/api/v1/workspaces/workspace-one/members/member-one/roles/role-one',
    );
    expect(assign.request.method).toBe('PUT');
    assign.flush(null, { status: 204, statusText: 'No Content' });
    api.groupMember(workspace.id, 'group-one', 'member-one', false).subscribe(completed);
    const remove = http.expectOne(
      '/api/v1/workspaces/workspace-one/groups/group-one/members/member-one',
    );
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
    expect(completed).toHaveBeenCalledTimes(2);
  });
  it('keeps invite tokens out of URLs and browser storage, and clears on explicit logout', () => {
    login();
    const invitation = TestBed.inject(InvitationContext);
    const token = 'A'.repeat(43);
    invitation.capture('token=' + token);
    api.accept(invitation.token()).subscribe();
    const request = http.expectOne('/api/v1/invitations/accept');
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.body).toEqual({ token });
    request.flush(envelope({ workspaceId: workspace.id }));
    auth.logout().subscribe();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(invitation.token()).toBe('');
  });
  it('redirects login to invitation acceptance when a token is pending', () => {
    TestBed.inject(InvitationContext).token.set('A'.repeat(43));
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.form.patchValue({ email: 'user@example.com', password: 'password' });
    fixture.componentInstance.submit();
    http
      .expectOne('/api/v1/auth/login')
      .flush(envelope({ accessToken: 'access-one', refreshToken: 'refresh-one' }));
    http
      .expectOne('/api/v1/auth/me')
      .flush(envelope({ id: 'user-one', email: 'user@example.com' }));
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/convites/aceitar']);
  });
  it('does not accept invitations while anonymous', () => {
    TestBed.inject(InvitationContext).token.set('A'.repeat(43));
    const fixture = TestBed.createComponent(AcceptInvitation);
    fixture.componentInstance.accept();
    http.expectNone('/api/v1/invitations/accept');
  });
  it('exposes the empty list state and pagination without inventing data', async () => {
    const fixture = TestBed.createComponent(WorkspaceList);
    http.expectOne((request) => request.url === '/api/v1/workspaces').flush(page([]));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Nenhum Workspace encontrado');
    expect(fixture.nativeElement.textContent).toContain('0 registro(s)');
  });
  it('rejects protected owner status changes before making an API mutation', () => {
    const fixture = TestBed.createComponent(MembersPanel);
    fixture.componentRef.setInput('workspace', {
      ...workspace,
      permissions: ['workspace.read', 'workspace.manage_members'],
    });
    fixture.componentInstance.confirmation.set({
      action: 'remove',
      member: { id: 'owner-one', isOwner: true, status: 'ACTIVE' } as never,
    });
    fixture.componentInstance.confirm();
    http.expectNone((request) => request.method === 'DELETE');
  });
  it('does not submit immutable field attributes during edits', () => {
    const fixture = TestBed.createComponent(CatalogPanel);
    fixture.componentRef.setInput('workspace', {
      ...workspace,
      permissions: ['field.read', 'field.manage'],
    });
    fixture.componentRef.setInput('kind', 'custom-fields');
    fixture.componentInstance.editor.set({
      title: 'Editar',
      fields: [],
      item: { id: 'field-one' } as never,
    });
    fixture.componentInstance.save({
      values: {
        name: ' Impacto ',
        description: '',
        required: true,
        position: 3,
        key: 'immutable',
        type: 'TEXT',
        options: 'invalid extra',
      },
      form: new FormGroup({}),
    });
    const request = http.expectOne('/api/v1/workspaces/workspace-one/custom-fields/field-one');
    expect(request.request.body).toEqual({
      name: 'Impacto',
      description: null,
      required: true,
      position: 3,
    });
    request.flush(envelope({}));
    http.expectOne((request) => request.url.endsWith('/custom-fields')).flush(page([]));
  });
  it('rejects duplicate single-select options locally', () => {
    const fixture = TestBed.createComponent(CatalogPanel);
    fixture.componentRef.setInput('workspace', { ...workspace, permissions: ['field.manage'] });
    fixture.componentRef.setInput('kind', 'custom-fields');
    fixture.componentInstance.editor.set({ title: 'Criar', fields: [], item: null });
    const form = new FormGroup({ options: new FormControl('duplicada\nduplicada') });
    fixture.componentInstance.save({
      values: {
        name: 'Impacto',
        type: 'SINGLE_SELECT',
        key: 'impacto',
        options: 'duplicada\nduplicada',
        position: 0,
      },
      form,
    });
    expect(form.get('options')?.hasError('server')).toBe(true);
    http.expectNone((request) => request.method === 'POST');
  });
  it('prevents users from granting a permission they do not have', () => {
    const fixture = TestBed.createComponent(CatalogPanel);
    fixture.componentRef.setInput('workspace', {
      ...workspace,
      permissions: ['workspace.read', 'workspace.manage_roles'],
    });
    fixture.componentRef.setInput('kind', 'roles');
    fixture.componentInstance.editor.set({ title: 'Criar', fields: [], item: null });
    fixture.componentInstance.save({
      values: { name: 'Administrador indevido', permissionCodes: ['attachment.delete'] },
      form: new FormGroup({}),
    });
    http.expectNone((request) => request.method === 'POST');
    expect(fixture.componentInstance.operation.error()).toContain('não pode conceder');
  });
  it('rejects forbidden, empty, and oversized uploads before sending data', () => {
    const fixture = TestBed.createComponent(AttachmentsPanel);
    fixture.componentRef.setInput('workspace', workspace);
    for (const file of [
      new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }),
      new File([], 'x.txt', { type: 'text/plain' }),
      new File([new Uint8Array(11 * 1048576)], 'x.txt', { type: 'text/plain' }),
    ]) {
      fixture.componentInstance.selectFile({
        target: { files: [file], value: '' },
      } as unknown as Event);
      expect(fixture.componentInstance.file()).toBeNull();
    }
    http.expectNone((request) => request.method === 'POST');
  });
});
