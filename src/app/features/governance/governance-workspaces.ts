import { Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { AppShell } from '../../shared/app-shell';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { ListState } from '../workspaces/workspace-feedback';
import { Workspace } from '../workspaces/workspace.models';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
@Component({
  selector: 'app-governance-workspaces',
  imports: [AppShell, RouterLink, DatePipe, ListTools, PaginationControls],
  template: `<app-shell
    ><section class="window">
      <header class="window-header">Governança</header>
      <div class="panel-body">
        <h1>Selecione um Workspace</h1>
        <p>Acompanhe avaliações internas, evidências, metas e ações de melhoria da equipe.</p>
        <app-list-tools
          label="Workspaces de governança"
          [sorts]="sorts"
          [busy]="list.state.busy() || !!list.state.wait()"
          (search)="list.search($event)"
          (refresh)="list.load()"
        />
        @if (context.notice()) {
          <p class="message info">{{ context.notice() }}</p>
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
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Situação</th>
                <th>Criado em</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              @for (w of list.rows(); track w.id) {
                <tr>
                  <td>{{ w.name }}</td>
                  <td>{{ w.status === 'ACTIVE' ? 'Ativo' : 'Indisponível' }}</td>
                  <td>{{ w.createdAt | date: 'dd/MM/yyyy' }}</td>
                  <td>
                    @if (available(w)) {
                      <a class="btn button-link" [routerLink]="['/workspaces', w.id, 'governance']"
                        >Abrir governança</a
                      >
                    } @else {
                      Sem acesso a governança
                    }
                  </td>
                </tr>
              } @empty {
                @if (!list.state.busy() && !list.state.error()) {
                  <tr>
                    <td colspan="4">Nenhum Workspace encontrado.</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        <app-pagination
          [pagination]="list.pagination()"
          [busy]="list.state.busy() || !!list.state.wait()"
          (change)="list.page($event)"
        />
      </div></section
  ></app-shell>`,
})
export class GovernanceWorkspaces {
  readonly context = inject(WorkspaceContext);
  private readonly api = inject(WorkspaceApi);
  readonly list = new ListState<Workspace>(inject(DestroyRef), (q) => this.api.listWorkspaces(q));
  readonly sorts = [
    { value: 'name,asc', label: 'Nome A–Z' },
    { value: 'createdAt,desc', label: 'Mais recentes' },
  ];
  constructor() {
    this.context.selected.set(null);
    inject(ProjectContext).clear();
    this.list.query.sort = 'name,asc';
    this.list.load();
  }
  available(w: Workspace) {
    return (
      w.status === 'ACTIVE' &&
      ['governance.read', 'governance.assess', 'governance.manage'].some((p) =>
        w.permissions?.includes(p),
      )
    );
  }
}
