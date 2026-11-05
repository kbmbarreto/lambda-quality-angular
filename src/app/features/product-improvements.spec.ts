import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../core/auth.service';
import { businessDate } from '../shared/sao-paulo-date.pipe';
import { Project } from './projects/project.models';
import { DefectInventory } from './defects/defect-inventory';
import { DefectApi } from './defects/defect-api.service';
import { DefectSummaryApi } from './defects/defect-summary-api.service';
import { NEVER } from 'rxjs';
import { DefectInventoryRow } from './defects/defect.models';
import { AzureImport, azureFileError } from './test-cases/azure-import';
import { TestCaseApi } from './test-cases/test-case-api.service';
import { TestRepositoryPanel } from './test-cases/test-repository';
import { TestVaultPanel } from './test-vault/test-vault';
import { TestVaultApi } from './test-vault/test-vault-api.service';
import { VaultEditor } from './test-vault/vault-editor';
import { VaultEntry } from './test-vault/test-vault.models';
const time = '2026-10-06T13:00:00.000-03:00';
const project: Project = {
  id: 'p',
  workspaceId: 'w',
  key: 'QA',
  name: 'Portal',
  description: null,
  status: 'ACTIVE',
  projectRole: 'MANAGER',
  permissions: [
    'project.read',
    'testvault.read',
    'testvault.reveal',
    'testvault.manage',
    'testcase.read',
    'testcase.create',
  ],
  createdAt: time,
  updatedAt: time,
  archivedAt: null,
};
const base = '/api/v1/workspaces/w/projects/p/test-vault';
const entry: VaultEntry = {
  id: 'entry',
  workspaceId: 'w',
  projectId: 'p',
  name: 'Conta de homologação',
  environmentId: null,
  version: 1,
  createdBy: 'tester',
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
};
const secret = {
  id: entry.id,
  version: 1,
  username: ' tester ',
  password: ' demo-only ',
  url: 'https://example.com',
  notes: 'Dados fictícios\nSegunda linha',
};
const envelope = (data: unknown) => ({
  data,
  message: 'OK',
  meta: { requestId: 'request-id', timestamp: time },
});
const page = (data: unknown[] = []) => ({
  ...envelope(data),
  meta: {
    ...envelope(null).meta,
    pagination: {
      page: 1,
      size: 20,
      totalItems: data.length,
      totalPages: 1,
      hasPrevious: false,
      hasNext: false,
    },
  },
});
let http: HttpTestingController;
const user = signal<{ id: string } | null>({ id: 'tester' });
beforeAll(() =>
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  }),
);
beforeEach(() => {
  user.set({ id: 'tester' });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AuthService, useValue: { user } },
      // The independent summary and pagination are covered by defect-summary.spec.ts.
      { provide: DefectSummaryApi, useValue: { get: () => NEVER } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
});
afterEach(() => {
  http.verify({ ignoreCancelled: true });
  vi.restoreAllMocks();
});
function vault(p = project) {
  const f = TestBed.createComponent(TestVaultPanel);
  f.componentRef.setInput('project', p);
  f.detectChanges();
  if (p.permissions.includes('testvault.read'))
    http.expectOne((r) => r.url === base).flush(page([entry]));
  if (p.permissions.includes('project.read'))
    http
      .expectOne((r) => r.url === base.replace('/test-vault', '/environments'))
      .flush(
        page([
          {
            id: 'hm',
            name: 'Homologação',
            active: true,
            deletedAt: null,
            category: 'HOMOLOGATION',
          },
          { id: 'prod', name: 'Produção', active: true, deletedAt: null, category: 'PRODUCTION' },
          { id: 'inactive', name: 'Inativo', active: false, deletedAt: null, category: 'OTHER' },
        ]),
      );
  f.detectChanges();
  return f;
}
function editVault(f: ReturnType<typeof vault>, value: VaultEntry | null = entry) {
  f.componentInstance.edit(value);
  f.detectChanges();
  return f.debugElement.query(By.directive(VaultEditor)).componentInstance as VaultEditor;
}
describe('São Paulo dates', () => {
  it('formats Z and offsets as the same instant, with the correct previous day', () => {
    expect(businessDate('2026-10-06T01:00:00.000Z')).toBe('05/10/2026 22:00:00');
    expect(businessDate('2026-10-05T22:00:00.000-03:00')).toBe('05/10/2026 22:00:00');
  });
  it('preserves calendar dates and handles historical daylight saving through IANA', () => {
    expect(businessDate('2026-10-06', 'dd/MM/yyyy')).toBe('06/10/2026');
    expect(businessDate('2018-12-01T03:00:00Z')).toBe('01/12/2018 01:00:00');
  });
  it('handles null, invalid dates and numeric timestamps', () => {
    expect(businessDate(null)).toBeNull();
    expect(businessDate('invalid')).toBeNull();
    expect(businessDate(Date.parse('2026-10-06T16:00:00Z'))).toBe('06/10/2026 13:00:00');
  });
});
describe('Global defect inventory', () => {
  it('loads without selecting a Workspace and opens by all scope IDs, including archives', () => {
    const f = TestBed.createComponent(DefectInventory);
    f.detectChanges();
    const r = http.expectOne((r) => r.url === '/api/v1/defects');
    expect(r.request.params.has('workspaceId')).toBe(false);
    const row: DefectInventoryRow = {
      id: 'defect',
      workspaceId: 'w2',
      workspaceName: 'Outra equipe',
      projectId: 'p2',
      projectKey: 'QA',
      projectName: 'Histórico',
      projectStatus: 'ARCHIVED',
      humanId: 'QA-1',
      sequence: 1,
      title: 'Falha',
      status: 'OPEN',
      severity: 'NORMAL',
      version: 1,
      createdAt: time,
      updatedAt: time,
      environmentSnapshot: null,
    };
    r.flush(page([row]));
    f.detectChanges();
    expect(f.nativeElement.querySelector('a').getAttribute('href')).toBe(
      '/workspaces/w2/projects/p2/defects?defectId=defect',
    );
    expect(f.nativeElement.textContent).toContain('Arquivado');
  });
  it('cancels obsolete requests when Workspace changes and searches/pages on the server', () => {
    const f = TestBed.createComponent(DefectInventory);
    f.detectChanges();
    const old = http.expectOne((r) => r.url === '/api/v1/defects');
    f.componentRef.setInput('workspaceId', 'w2');
    f.detectChanges();
    expect(old.cancelled).toBe(true);
    const r = http.expectOne((r) => r.url === '/api/v1/defects');
    expect(r.request.params.get('workspaceId')).toBe('w2');
    r.flush(page());
    const c = f.componentInstance;
    c.q = ' falha ';
    c.status = 'OPEN';
    c.severity = 'MAJOR';
    c.search();
    const search = http.expectOne((r) => r.url === '/api/v1/defects');
    expect(search.request.params.get('q')).toBe('falha');
    expect(search.request.params.get('severity')).toBe('MAJOR');
    search.flush(page());
    c.list.page(2);
    const next = http.expectOne((r) => r.url === '/api/v1/defects');
    expect(next.request.params.get('page')).toBe('2');
    next.flush(page());
  });
  it('invalidates after a successful defect mutation and never fans out to projects', () => {
    const f = TestBed.createComponent(DefectInventory);
    f.detectChanges();
    http.expectOne((r) => r.url === '/api/v1/defects').flush(page());
    TestBed.inject(DefectApi).create('w', 'p', { title: 'Falha' }).subscribe();
    http.expectOne('/api/v1/workspaces/w/projects/p/defects').flush(envelope({}));
    http.expectOne((r) => r.url === '/api/v1/defects').flush(page());
    http.expectNone((r) => r.url.endsWith('/projects'));
  });
});
describe('Azure CSV import', () => {
  it('validates extension, empty content and 5 MiB including upper-case extension', () => {
    expect(azureFileError(new File(['abc'], 'sample.CSV'))).toBe('');
    expect(azureFileError(new File(['abc'], 'sample.txt'))).toContain('.csv');
    expect(azureFileError(new File([], 'sample.csv'))).toContain('vazio');
    expect(azureFileError(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'sample.csv'))).toContain(
      '5 MiB',
    );
  });
  it('sends only multipart file and leaves Content-Type boundary to the browser', () => {
    const file = new File(['Title\nTeste'], 'sample.csv');
    TestBed.inject(TestCaseApi).importAzure('w', 'p', file).subscribe();
    const r = http.expectOne('/api/v1/workspaces/w/projects/p/test-cases/import/azure-devops');
    expect(r.request.body instanceof FormData).toBe(true);
    expect([...r.request.body.keys()]).toEqual(['file']);
    expect(r.request.body.get('file').name).toBe(file.name);
    expect(r.request.headers.has('Content-Type')).toBe(false);
    r.flush(envelope({ importedCount: 1, alreadyImported: false, cases: [] }));
  });
  it('prevents duplicate submission, retains file on logical-record errors and safely retries the same bytes', () => {
    const f = TestBed.createComponent(AzureImport);
    f.componentRef.setInput('project', project);
    f.detectChanges();
    const c = f.componentInstance;
    const file = new File(['CSV'], 'sample.csv');
    c.choose({ target: { files: [file] } } as unknown as Event);
    c.submit();
    c.submit();
    const r = http.expectOne('/api/v1/workspaces/w/projects/p/test-cases/import/azure-devops');
    r.flush(
      {
        code: 'TEST_CASE_IMPORT_INVALID',
        detail: 'Registro lógico 3: título obrigatório.',
        requestId: 'req',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(c.state.busy()).toBe(false);
    expect(c.file()).toBe(file);
    expect(c.state.error()).toContain('Registro lógico 3');
    const emit = vi.spyOn(c.imported, 'emit');
    c.submit();
    const retry = http.expectOne((r) => r.url.endsWith('/import/azure-devops'));
    retry.flush(envelope({ importedCount: 2, alreadyImported: true, cases: [] }));
    expect(emit).toHaveBeenCalledWith({ importedCount: 2, alreadyImported: true, cases: [] });
  });
  it('does not import without create permission or into an archived project', () => {
    const f = TestBed.createComponent(AzureImport);
    f.componentRef.setInput('project', { ...project, status: 'ARCHIVED' });
    f.detectChanges();
    f.componentInstance.file.set(new File(['CSV'], 'sample.csv'));
    f.componentInstance.submit();
    http.expectNone((r) => r.method === 'POST');
  });
  it('refreshes root drafts and counters, clearing restrictive suite and advanced filters', () => {
    const f = TestBed.createComponent(TestRepositoryPanel);
    f.componentRef.setInput('project', project);
    f.detectChanges();
    http.expectOne((r) => r.url.endsWith('/test-cases')).flush(page());
    http.expectOne((r) => r.url.endsWith('/test-suites')).flush(page());
    http
      .expectOne((r) => r.url.endsWith('/summary'))
      .flush(envelope({ totalCases: 0, suites: [] }));
    const c = f.componentInstance;
    c.suiteFilter = 'old';
    c.priorityFilter = 'HIGH';
    c.list.query.status = 'ACTIVE';
    c.imported({ importedCount: 2, alreadyImported: false, cases: [] });
    const r = http.expectOne((r) => r.url.endsWith('/test-cases'));
    expect(r.request.params.get('root')).toBe('true');
    expect(r.request.params.get('status')).toBe('DRAFT');
    expect(r.request.params.has('suiteId')).toBe(false);
    expect(r.request.params.has('priority')).toBe(false);
    r.flush(page());
    http
      .expectOne((r) => r.url.endsWith('/summary'))
      .flush(envelope({ totalCases: 2, suites: [] }));
  });
});
describe('Project test vault', () => {
  it('loads metadata without revealing secrets and filters non-production active environments', () => {
    const f = vault();
    expect(f.componentInstance.revealed()).toBeNull();
    http.expectNone((r) => r.url.endsWith('/reveal'));
    expect(f.componentInstance.environments().map((e) => e.id)).toEqual(['hm']);
    expect(f.nativeElement.textContent).not.toContain(secret.password);
  });
  it('honors effective permissions even when the local role is MANAGER', () => {
    const f = vault({ ...project, permissions: ['testvault.read'] });
    const c = f.componentInstance;
    c.reveal(entry);
    c.edit(entry);
    c.confirmDelete(entry);
    expect(c.editing()).toBeNull();
    expect(c.deleting()).toBeNull();
    http.expectNone((r) => r.method !== 'GET');
    expect(f.nativeElement.textContent).not.toContain('Revelar');
    expect(f.nativeElement.textContent).not.toContain('Adicionar registro');
  });
  it('allows explicitly granted reveal on an archived project, while blocking writes', () => {
    const f = vault({ ...project, status: 'ARCHIVED', projectRole: 'VIEWER' });
    const c = f.componentInstance;
    c.edit();
    expect(c.editing()).toBeNull();
    c.reveal(entry);
    const r = http.expectOne(`${base}/entry/reveal`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({});
    expect(r.request.headers.get('Cache-Control')).toBe('no-store');
    r.flush(envelope(secret));
    expect(c.revealed()).toEqual(secret);
    c.hide();
    expect(c.revealed()).toBeNull();
  });
  it('preserves encrypted fields when updating metadata and sends the current version', () => {
    const f = vault();
    const editor = editVault(f);
    editor.form.controls.name.setValue('Novo rótulo');
    editor.submit();
    const r = http.expectOne(`${base}/entry`);
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({ name: 'Novo rótulo', version: 1 });
    expect(r.request.body.secret).toBeUndefined();
    r.flush(envelope({ ...entry, name: 'Novo rótulo', version: 2 }));
    http.expectOne((r) => r.url === base).flush(page());
    expect(f.componentInstance.editing()).toBeNull();
  });
  it('requires an explicit reveal before editing, sends the full secret and preserves spaces', () => {
    const f = vault();
    const editor = editVault(f);
    f.componentInstance.reveal(entry, true);
    http.expectOne(`${base}/entry/reveal`).flush(envelope(secret));
    editor.form.controls.password.setValue(' new demo ');
    editor.submit();
    const r = http.expectOne(`${base}/entry`);
    expect(r.request.body.secret).toEqual({
      username: secret.username,
      password: ' new demo ',
      url: secret.url,
      notes: secret.notes,
    });
    r.flush(envelope({ ...entry, version: 2 }));
    http.expectOne((r) => r.url === base).flush(page());
    f.detectChanges();
    expect(editor.form.controls.password.value).toBe('');
  });
  it('creates notes without credentials and omits unrelated scope fields from the body', () => {
    const f = vault();
    const editor = editVault(f, null);
    editor.form.patchValue({ name: 'Massa de testes', notes: 'Dados fictícios' });
    editor.submit();
    const r = http.expectOne((r) => r.url === base && r.method === 'POST');
    expect(r.request.body).toEqual({
      name: 'Massa de testes',
      environmentId: null,
      username: '',
      password: '',
      url: null,
      notes: 'Dados fictícios',
    });
    r.flush(envelope(entry));
    http.expectOne((r) => r.url === base).flush(page());
  });
  it('keeps the form in memory and displays detail on unavailable encryption without logout', () => {
    const f = vault();
    const editor = editVault(f, null);
    editor.form.patchValue({ name: 'Conta', password: 'demo-only' });
    editor.submit();
    http
      .expectOne((r) => r.url === base && r.method === 'POST')
      .flush(
        {
          code: 'TEST_VAULT_UNAVAILABLE',
          detail: 'Chave temporariamente indisponível.',
          requestId: 'ref',
        },
        { status: 503, statusText: 'Unavailable' },
      );
    expect(editor.form.controls.password.value).toBe('demo-only');
    expect(f.componentInstance.state.error()).toContain('Chave temporariamente indisponível.');
    expect(user()).not.toBeNull();
    expect(f.componentInstance.state.busy()).toBe(false);
  });
  it('blocks automatic repetition after an ambiguous create response', () => {
    const f = vault();
    const editor = editVault(f, null);
    editor.form.controls.name.setValue('Conta');
    editor.submit();
    http
      .expectOne((r) => r.url === base && r.method === 'POST')
      .flush({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    expect(f.componentInstance.uncertain()).toBe(true);
    editor.submit();
    http.expectNone((r) => r.method === 'POST');
    expect(editor.form.controls.name.value).toBe('Conta');
  });
  it('reloads metadata on conflict and requires reopening before resubmission', () => {
    const f = vault();
    const editor = editVault(f);
    editor.form.controls.name.setValue('Rótulo');
    editor.submit();
    http
      .expectOne(`${base}/entry`)
      .flush({ code: 'TEST_VAULT_VERSION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    http.expectOne((r) => r.url === base).flush(page([{ ...entry, version: 2 }]));
    expect(f.componentInstance.editing()).toBeNull();
    expect(f.componentInstance.state.error()).toContain('reabra');
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('cancels pending reveal and clears revealed secrets on logout or permission loss', () => {
    const f = vault();
    const c = f.componentInstance;
    c.reveal(entry);
    const pending = http.expectOne(`${base}/entry/reveal`);
    user.set(null);
    f.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(c.revealed()).toBeNull();
    user.set({ id: 'tester' });
    f.detectChanges();
    c.reveal(entry);
    http.expectOne(`${base}/entry/reveal`).flush(envelope(secret));
    f.componentRef.setInput('project', { ...project, permissions: ['testvault.read'] });
    f.detectChanges();
    expect(c.revealed()).toBeNull();
  });
  it('clears edited credentials and cancels operations when the component is destroyed', () => {
    const f = vault();
    const editor = editVault(f);
    f.componentInstance.reveal(entry, true);
    const request = http.expectOne(`${base}/entry/reveal`);
    request.flush(envelope(secret));
    expect(editor.form.controls.password.value).toBe(secret.password);
    f.destroy();
    expect(editor.form.controls.password.value).toBe('');
  });
  it('uses version for delete, supports 204 and refreshes metadata', () => {
    const f = vault();
    const c = f.componentInstance;
    c.confirmDelete(entry);
    c.remove();
    const r = http.expectOne(`${base}/entry`);
    expect(r.request.method).toBe('DELETE');
    expect(r.request.body).toEqual({ version: 1 });
    r.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne((r) => r.url === base).flush(page());
    expect(c.deleting()).toBeNull();
  });
  it('maps nested secret validation errors onto the editable field', () => {
    const f = vault();
    const editor = editVault(f);
    f.componentInstance.reveal(entry, true);
    http.expectOne(`${base}/entry/reveal`).flush(envelope(secret));
    editor.submit();
    http.expectOne(`${base}/entry`).flush(
      {
        code: 'VALIDATION_ERROR',
        errors: [{ field: 'secret.password', message: 'Limite excedido.' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(editor.error('password')).toBe('Limite excedido.');
  });
  it('whitelists vault queries and never submits status to the new endpoint', () => {
    TestBed.inject(TestVaultApi)
      .list('w', 'p', { status: 'ALL', q: 'Conta', environmentId: 'hm', size: 20 })
      .subscribe();
    const r = http.expectOne((r) => r.url === base);
    expect(r.request.params.keys()).toEqual(['q', 'environmentId', 'size']);
    r.flush(page());
  });
  it('clears secrets on project changes before loading the new scoped metadata', () => {
    const f = vault(),
      c = f.componentInstance;
    c.reveal(entry);
    http.expectOne(`${base}/entry/reveal`).flush(envelope(secret));
    f.componentRef.setInput('project', { ...project, id: 'another-project' });
    f.detectChanges();
    expect(c.revealed()).toBeNull();
    expect(c.environments()).toEqual([]);
    http
      .expectOne((r) => r.url === '/api/v1/workspaces/w/projects/another-project/test-vault')
      .flush(page());
  });
  it('never persists revealed credentials in browser storage', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const f = vault();
    f.componentInstance.reveal(entry);
    http.expectOne(`${base}/entry/reveal`).flush(envelope(secret));
    f.detectChanges();
    expect(storage).not.toHaveBeenCalled();
    f.componentInstance.hide();
    expect(f.componentInstance.revealed()).toBeNull();
  });
  it('shows metadata query detail on 503 and permits a later explicit retry', () => {
    const f = vault(),
      c = f.componentInstance;
    c.list.load();
    http
      .expectOne((r) => r.url === base)
      .flush(
        {
          code: 'SERVICE_UNAVAILABLE',
          detail: 'Consulta temporariamente indisponível.',
          requestId: 'ref',
        },
        { status: 503, statusText: 'Unavailable' },
      );
    expect(c.list.state.error()).toContain('Consulta temporariamente indisponível.');
    expect(c.list.state.busy()).toBe(false);
    c.list.load();
    http.expectOne((r) => r.url === base).flush(page());
  });
});
