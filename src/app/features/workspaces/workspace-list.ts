import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { FormGroup } from '@angular/forms';
import { AppShell } from '../../shared/app-shell';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { WorkspaceApi } from './workspace-api.service';
import { ListState, OperationState } from './workspace-feedback';
import { Workspace } from './workspace.models';
import { ListTools, PaginationControls } from './ui/list-tools';
import { EditorField, FormDialog, nameField } from './ui/form-dialog';

export const slugField = (value = ''): EditorField => ({
  key: 'slug',
  label: 'Identificador (slug)',
  value,
  required: true,
  min: 3,
  max: 80,
  pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  hint: '3 a 80 caracteres: letras minúsculas e números, separados por hífen.',
});

@Component({
  selector: 'app-workspace-list',
  imports: [AppShell, RouterLink, DatePipe, ListTools, PaginationControls, FormDialog],
  template: `
    <app-shell>
      <section class="window">
        <header class="window-header">Workspaces</header>
        <div class="panel-body">
          <div class="section-heading">
            <div>
              <h1>Meus Workspaces</h1>
              <p>Organize equipes, acessos e os catálogos de qualidade.</p>
            </div>
            <button class="btn" type="button" (click)="openCreate()">Criar Workspace</button>
          </div>
          <app-list-tools
            label="Workspaces"
            [busy]="list.state.busy() || !!list.state.wait()"
            [sorts]="sorts"
            (search)="list.search($event)"
            (refresh)="list.load()"
          />
          @if (context.notice()) {
            <p class="message info" role="status">{{ context.notice() }}</p>
          }
          @if (list.state.error()) {
            <p class="message error" role="alert">
              {{ list.state.error() }}
              @if (list.state.wait()) {
                Aguarde {{ list.state.wait() }}s.
              }
            </p>
          }
          @if (list.state.busy()) {
            <p role="status">Carregando Workspaces…</p>
          }
          @if (!list.state.busy() && !list.state.error() && !list.rows().length) {
            <div class="empty-state">
              <h2>Nenhum Workspace encontrado</h2>
              <p>Crie seu primeiro Workspace ou aceite um convite enviado para seu e-mail.</p>
              <a routerLink="/convites/aceitar">Aceitar convite</a>
            </div>
          }
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Identificador</th>
                  <th>Seu acesso</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (workspace of list.rows(); track workspace.id) {
                  <tr>
                    <td>{{ workspace.name }}</td>
                    <td>{{ workspace.slug }}</td>
                    <td>{{ workspace.isOwner ? 'Proprietário' : 'Membro' }}</td>
                    <td>{{ workspace.createdAt | date: 'dd/MM/yyyy' }}</td>
                    <td>
                      <a class="btn button-link" [routerLink]="['/workspaces', workspace.id]"
                        >Abrir</a
                      >
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pagination
            [pagination]="list.pagination()"
            [busy]="list.state.busy()"
            (change)="list.page($event)"
          />
        </div>
      </section>
      @if (creating()) {
        <app-form-dialog
          title="Criar Workspace"
          [fields]="fields"
          [state]="operation"
          hint="Você será o proprietário do novo Workspace."
          (closed)="creating.set(false)"
          (saved)="create($event)"
        />
      }
    </app-shell>
  `,
})
export class WorkspaceList {
  private readonly api = inject(WorkspaceApi);
  private readonly router = inject(Router);
  readonly context = inject(WorkspaceContext);
  private readonly destroyRef = inject(DestroyRef);
  readonly list = new ListState<Workspace>(this.destroyRef, (query) =>
    this.api.listWorkspaces(query),
  );
  readonly operation = new OperationState(this.destroyRef);
  readonly creating = signal(false);
  readonly fields = [nameField(), slugField()];
  readonly sorts = [
    { value: 'name,asc', label: 'Nome A–Z' },
    { value: 'name,desc', label: 'Nome Z–A' },
    { value: 'createdAt,desc', label: 'Mais recentes' },
  ];
  constructor() {
    this.context.selected.set(null);
    this.list.load();
  }
  openCreate(): void {
    this.operation.error.set('');
    this.creating.set(true);
  }
  create(event: { values: Record<string, unknown>; form: FormGroup }): void {
    this.operation.run(
      this.api.createWorkspace({
        name: String(event.values['name']).trim(),
        slug: String(event.values['slug']).trim(),
      }),
      (response) => {
        this.creating.set(false);
        void this.router.navigate(['/workspaces', response.data.id]);
      },
      event.form,
    );
  }
}
