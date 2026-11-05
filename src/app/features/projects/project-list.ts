import { DefectInventory } from '../defects/defect-inventory';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { projectSection } from './project-section';
import { ProjectApi } from './project-api.service';
import { ProjectScope } from './project-scope';
import { ProjectFrame } from './project-frame';
import { Project, projectRoleLabels } from './project.models';
import { ListState, OperationState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { EditorField, FormDialog, nameField, descriptionField } from '../workspaces/ui/form-dialog';

export const projectKeyField = (): EditorField => ({
  key: 'key',
  label: 'Chave do projeto',
  required: true,
  min: 2,
  max: 12,
  pattern: /^[a-zA-Z][a-zA-Z0-9_]{1,11}$/,
  hint: 'De 2 a 12 letras, números ou _. Comece com uma letra. Será convertida para maiúsculas e não poderá ser alterada.',
});
@Component({
  selector: 'app-project-list-panel',
  imports: [RouterLink, DatePipe, ListTools, PaginationControls, FormDialog],
  template: `
    <div class="section-heading">
      <h2>
        {{ section.heading }}
      </h2>
      @if (section.detail === 'defects') {
        <a
          class="btn button-link"
          [routerLink]="['/workspaces', scope.workspaceId(), 'defects', 'analytics']"
          >Indicadores de bugs do Workspace</a
        >
      }
      @if (!section.module && scope.workspace.can('project.create')) {
        <button class="btn" type="button" [disabled]="operation.busy()" (click)="editor.set(true)">
          Criar projeto
        </button>
      }
    </div>
    @if (operation.error() && !editor()) {
      <p class="message error" role="alert">{{ operation.error() }}</p>
    }
    @if (operation.success()) {
      <p class="message success" role="status">{{ operation.success() }}</p>
    }
    @if (scope.workspace.can('project.read')) {
      <app-list-tools
        label="projetos"
        [statuses]="statuses"
        defaultStatus="ACTIVE"
        [sorts]="sorts"
        [busy]="list.state.busy() || !!list.state.wait()"
        (search)="list.search($event)"
        (refresh)="list.load()"
      />
      @if (list.state.error()) {
        <p class="message error" role="alert">
          {{ list.state.error() }}
          @if (list.state.wait()) {
            Aguarde {{ list.state.wait() }}s.
          }
        </p>
      }
      @if (list.state.busy()) {
        <p role="status">Carregando projetos…</p>
      }
      @if (list.rows().length) {
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Chave / Nome</th>
                <th>Situação</th>
                <th>Seu papel</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (project of list.rows(); track project.id) {
                <tr>
                  <td>
                    <strong>{{ project.key }}</strong>
                    <p>{{ project.name }}</p>
                  </td>
                  <td>{{ project.status === 'ACTIVE' ? 'Ativo' : 'Arquivado' }}</td>
                  <td>
                    {{
                      project.projectRole
                        ? roleLabels[project.projectRole]
                        : 'Acesso pelo Workspace'
                    }}
                  </td>
                  <td>{{ project.createdAt | date: 'dd/MM/yyyy' }}</td>
                  <td>
                    @if (project.permissions.includes(section.permission)) {
                      <a class="btn button-link" [routerLink]="projectLink(project)">{{
                        section.action
                      }}</a>
                    } @else {
                      <span>Sem permissão para consultar este módulo</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!list.state.busy() && !list.state.error()) {
        <p>Nenhum projeto encontrado para os filtros selecionados.</p>
      }
      <app-pagination
        [pagination]="list.pagination()"
        [busy]="list.state.busy() || !!list.state.wait()"
        (change)="list.page($event)"
      />
    } @else {
      <p class="message info">
        Sua conta não possui permissão para listar projetos neste Workspace.
      </p>
    }
    @if (editor()) {
      <app-form-dialog
        title="Criar projeto"
        [fields]="fields"
        [state]="operation"
        hint="A chave é única neste Workspace. Após uma falha de resposta, consulte a chave antes de repetir a criação."
        (saved)="save($event)"
        (closed)="editor.set(false)"
      />
    }
  `,
})
export class ProjectListPanel {
  readonly section = projectSection(inject(ActivatedRoute).snapshot.data);
  projectLink(project: Project) {
    return [
      '/workspaces',
      project.workspaceId,
      'projects',
      project.id,
      ...(this.section.detail ? [this.section.detail] : []),
    ];
  }
  readonly scope = inject(ProjectScope);
  private readonly api = inject(ProjectApi);
  private readonly router = inject(Router);
  readonly operation = new OperationState(inject(DestroyRef));
  readonly editor = signal(false);
  readonly fields = [projectKeyField(), nameField(), descriptionField()];
  readonly roleLabels = projectRoleLabels;
  readonly statuses = [
    { value: 'ACTIVE', label: 'Ativos' },
    { value: 'ARCHIVED', label: 'Arquivados' },
    { value: 'ALL', label: 'Todos' },
  ];
  readonly sorts = [
    { value: 'name,asc', label: 'Nome A–Z' },
    { value: 'key,asc', label: 'Chave A–Z' },
    { value: 'createdAt,desc', label: 'Mais recentes' },
  ];
  readonly list = new ListState<Project>(inject(DestroyRef), (query) =>
    this.api.list(this.scope.workspaceId(), query),
  );
  constructor() {
    this.list.query = { page: 1, size: 20, status: 'ACTIVE', sort: 'name,asc' };
    if (this.scope.workspace.can('project.read')) this.list.load();
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }): void {
    if (!this.scope.workspace.can('project.create')) return;
    this.operation.run(
      this.api.create(this.scope.workspaceId(), {
        key: String(event.values['key']).trim().toUpperCase(),
        name: String(event.values['name']).trim(),
        description: String(event.values['description']).trim() || null,
      }),
      (response) => {
        this.editor.set(false);
        if (response.data.permissions.includes('project.read'))
          void this.router.navigate([
            '/workspaces',
            this.scope.workspaceId(),
            'projects',
            response.data.id,
          ]);
        else {
          this.operation.success.set(
            'Projeto criado. Solicite permissão de leitura para acessá-lo.',
          );
        }
      },
      event.form,
    );
  }
}
@Component({
  selector: 'app-project-list',
  providers: [ProjectScope],
  imports: [ProjectFrame, ProjectListPanel, DefectInventory],
  template: `<app-project-frame [title]="section.title">
    @if (scope.workspace.selected()) {
      <app-project-list-panel />
      @if (section.detail === 'defects') {
        <app-defect-inventory [workspaceId]="scope.workspaceId()" />
      }
    }
  </app-project-frame>`,
})
export class ProjectList {
  readonly section = projectSection(inject(ActivatedRoute).snapshot.data);
  readonly scope = inject(ProjectScope);
}
