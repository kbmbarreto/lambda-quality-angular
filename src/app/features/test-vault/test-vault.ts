import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, TimeoutError, finalize } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { problemOf } from '../../core/api-error';
import { SaoPauloDatePipe } from '../../shared/sao-paulo-date.pipe';
import { Project, ProjectEnvironment, canChange } from '../projects/project.models';
import { ProjectScope } from '../projects/project-scope';
import { ProjectFrame } from '../projects/project-frame';
import { ProjectApi } from '../projects/project-api.service';
import { ListState, OperationState, workspaceError } from '../workspaces/workspace-feedback';
import { PaginationControls } from '../workspaces/ui/list-tools';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { allPages } from '../test-cases/test-case.models';
import { TestVaultApi } from './test-vault-api.service';
import { VaultEntry, RevealedEntry, VaultQuery } from './test-vault.models';
import { VaultEditor, VaultDraft } from './vault-editor';

@Component({
  selector: 'app-test-vault-panel',
  imports: [FormsModule, SaoPauloDatePipe, PaginationControls, ConfirmDialog, VaultEditor],
  templateUrl: './test-vault.html',
})
export class TestVaultPanel implements OnInit {
  readonly project = input.required<Project>();
  private readonly api = inject(TestVaultApi);
  private readonly projectApi = inject(ProjectApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formatError = (error: unknown) => {
    const problem = problemOf(error);
    if (error instanceof HttpErrorResponse && error.status === 503 && problem.detail)
      return `${problem.detail}${problem.requestId ? ' Referência: ' + problem.requestId : ''}`;
    return workspaceError(error);
  };
  readonly state = new OperationState(this.destroyRef, this.formatError);
  readonly environmentState = new OperationState(this.destroyRef);
  readonly environments = signal<ProjectEnvironment[]>([]);
  readonly editing = signal<{ entry: VaultEntry | null } | null>(null);
  readonly deleting = signal<VaultEntry | null>(null);
  readonly revealed = signal<RevealedEntry | null>(null);
  readonly revealedName = signal('');
  readonly uncertain = signal(false);
  readonly editor = viewChild(VaultEditor);
  private revealRequest?: Subscription;
  private revealGeneration = 0;
  private operation?: Subscription;
  private scopeKey = '';
  private initialized = false;
  q = '';
  environmentId = '';
  sort = 'name,asc';
  readonly list = new ListState<VaultEntry>(
    this.destroyRef,
    (query) => {
      const p = this.project();
      return this.api.list(p.workspaceId, p.id, query as VaultQuery);
    },
    this.formatError,
  );
  constructor() {
    effect(() => {
      const p = this.project(),
        user = this.auth.user();
      untracked(() => {
        const key = `${p.workspaceId}/${p.id}`;
        if (this.scopeKey && this.scopeKey !== key) {
          this.operation?.unsubscribe();
          this.close();
          this.list.cancel();
          this.environments.set([]);
          if (this.initialized && user && p.permissions.includes('testvault.read')) this.search();
        }
        this.scopeKey = key;
        if (!user || !p.permissions.includes('testvault.read')) this.list.cancel();
        if (!user || !canChange(p, 'testvault.manage')) this.operation?.unsubscribe();
        if (!user || !p.permissions.includes('testvault.reveal')) this.hide();
        if (!user || !canChange(p, 'testvault.manage')) this.close();
      });
    });
    this.destroyRef.onDestroy(() => {
      this.hide();
      this.operation?.unsubscribe();
    });
  }
  ngOnInit() {
    this.initialized = true;
    if (this.can('testvault.read')) this.search();
    this.loadEnvironments();
  }
  can(permission: string) {
    return !!this.auth.user() && this.project().permissions.includes(permission);
  }
  manageable() {
    return !!this.auth.user() && canChange(this.project(), 'testvault.manage');
  }
  loadEnvironments() {
    const p = this.project();
    if (!this.can('project.read')) return;
    this.environmentState.run(
      allPages((page) =>
        this.projectApi.resources(p.workspaceId, p.id, 'environments', {
          page,
          size: 100,
          active: true,
          sort: 'name,asc',
        }),
      ),
      (rows) => {
        this.environments.set(
          rows.filter((e) => e.active && !e.deletedAt && e.category !== 'PRODUCTION'),
        );
      },
    );
  }
  search() {
    this.list.search({
      q: this.q.trim(),
      sort: this.sort,
      environmentId: this.environmentId || undefined,
    } as VaultQuery);
  }
  environment(entry: VaultEntry) {
    return (
      this.environments().find((e) => e.id === entry.environmentId)?.name ??
      (entry.environmentId ? 'Ambiente vinculado' : 'Sem ambiente')
    );
  }
  edit(entry: VaultEntry | null = null) {
    if (!this.manageable() || this.state.busy() || this.state.wait()) return;
    this.hide();
    this.state.error.set('');
    this.state.success.set('');
    this.uncertain.set(false);
    this.editing.set({ entry });
  }
  hide() {
    ++this.revealGeneration;
    this.revealRequest?.unsubscribe();
    this.revealed.set(null);
    this.revealedName.set('');
    this.editor()?.discardSecret();
  }
  close() {
    this.hide();
    this.editing.set(null);
    this.deleting.set(null);
    this.uncertain.set(false);
  }
  reveal(entry: VaultEntry, forEditing = false) {
    if (!this.can('testvault.reveal') || this.state.busy() || this.state.wait()) return;
    this.hide();
    const generation = this.revealGeneration,
      p = this.project();
    this.state.error.set('');
    this.state.success.set('');
    this.state.busy.set(true);
    this.revealRequest = this.api
      .reveal(p.workspaceId, p.id, entry.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.state.busy.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (generation !== this.revealGeneration || !this.can('testvault.reveal')) return;
          if (forEditing) {
            if (response.data.version !== entry.version) {
              this.conflict();
              return;
            }
            if (this.manageable()) this.editor()?.setSecret(response.data);
          } else {
            this.revealedName.set(entry.name);
            this.revealed.set(response.data);
          }
        },
        error: (error) => this.state.fail(error),
      });
  }
  async copy(field: 'username' | 'password' | 'url' | 'notes') {
    const value = this.revealed()?.[field];
    if (!this.can('testvault.reveal') || value == null) return;
    const generation = this.revealGeneration;
    try {
      await navigator.clipboard.writeText(value);
      if (generation === this.revealGeneration)
        this.state.success.set('Copiado para a área de transferência.');
    } catch {
      if (generation === this.revealGeneration)
        this.state.error.set(
          'Não foi possível copiar. Verifique a permissão da área de transferência.',
        );
    }
  }
  save(draft: VaultDraft) {
    if (!this.manageable() || this.state.busy() || this.state.wait() || this.uncertain()) return;
    const editing = this.editing();
    if (!editing) return;
    const p = this.project(),
      entry = editing.entry;
    if (draft.secret && entry && !this.can('testvault.reveal')) return;
    const body = {
      name: draft.name,
      ...('environmentId' in draft ? { environmentId: draft.environmentId } : {}),
      ...(entry
        ? { version: entry.version, ...(draft.secret ? { secret: draft.secret } : {}) }
        : draft.secret),
    };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 32768) {
      this.state.error.set('O conteúdo excede 32 KiB. Reduza os textos antes de salvar.');
      return;
    }
    this.state.busy.set(true);
    this.state.error.set('');
    const request = entry
      ? this.api.update(p.workspaceId, p.id, entry.id, {
          name: draft.name,
          version: entry.version,
          ...(draft.environmentId !== undefined ? { environmentId: draft.environmentId } : {}),
          ...(draft.secret ? { secret: draft.secret } : {}),
        })
      : this.api.create(p.workspaceId, p.id, {
          name: draft.name,
          environmentId: draft.environmentId,
          ...draft.secret!,
        });
    this.operation = request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.state.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.close();
          this.state.success.set(entry ? 'Registro atualizado.' : 'Registro criado.');
          this.list.load();
        },
        error: (error) => {
          this.state.fail(error, draft.form);
          for (const issue of problemOf(error).errors ?? []) {
            const control = draft.form.get(issue.field.replace(/^secret\./, ''));
            if (control) {
              control.setErrors({ server: issue.message });
              control.markAsTouched();
            }
          }
          if (problemOf(error).code === 'TEST_VAULT_VERSION_CONFLICT') this.conflict();
          else if (
            error instanceof TimeoutError ||
            (error instanceof HttpErrorResponse &&
              (error.status === 0 ||
                (error.status >= 500 && problemOf(error).code !== 'TEST_VAULT_UNAVAILABLE')))
          )
            this.uncertain.set(true);
        },
      });
  }
  conflict() {
    this.close();
    this.list.load();
    this.state.error.set(
      'Este registro mudou. A lista foi atualizada; reabra o registro e revise as alterações antes de salvar novamente.',
    );
  }
  confirmDelete(entry: VaultEntry) {
    if (this.manageable() && !this.state.busy()) {
      this.hide();
      this.state.error.set('');
      this.deleting.set(entry);
    }
  }
  remove() {
    const entry = this.deleting(),
      p = this.project();
    if (!entry || !this.manageable() || this.state.busy() || this.state.wait()) return;
    this.state.busy.set(true);
    this.state.error.set('');
    this.operation = this.api
      .remove(p.workspaceId, p.id, entry.id, entry.version)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.state.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.close();
          this.state.success.set('Registro excluído.');
          this.list.load();
        },
        error: (error) => {
          this.state.fail(error);
          if (problemOf(error).code === 'TEST_VAULT_VERSION_CONFLICT') this.conflict();
          else if (
            error instanceof TimeoutError ||
            (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
          ) {
            this.deleting.set(null);
            this.list.load();
          }
        },
      });
  }
}
@Component({
  selector: 'app-test-vault',
  providers: [ProjectScope],
  imports: [ProjectFrame, TestVaultPanel],
  template: `<app-project-frame title="Cofre de testes">
    @if (scope.context.selected(); as project) {
      @if (project.status === 'ARCHIVED') {
        <p class="message info">
          Projeto arquivado. O cofre está disponível para consulta; alterações estão bloqueadas.
        </p>
      }
      @if (project.permissions.includes('testvault.read')) {
        @for (p of [project]; track p.workspaceId + '/' + p.id) {
          <app-test-vault-panel [project]="p" />
        }
      } @else {
        <p class="message info">
          Sua conta não possui permissão para consultar o cofre deste projeto.
        </p>
      }
    }
  </app-project-frame>`,
})
export class TestVault {
  readonly scope = inject(ProjectScope);
}
