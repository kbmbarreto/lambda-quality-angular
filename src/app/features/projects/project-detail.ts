import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProjectScope } from './project-scope';
import { ProjectFrame } from './project-frame';
import { ProjectApi } from './project-api.service';
import { ProjectMembers } from './project-members';
import { ProjectResourcesPanel } from './project-resources';
import { Project, canChange, projectRoleLabels } from './project.models';
import { FormDialog, EditorField, nameField, descriptionField } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { OperationState } from '../workspaces/workspace-feedback';

@Component({
  selector: 'app-project-detail',
  providers: [ProjectScope],
  imports: [
    ProjectFrame,
    DatePipe,
    ProjectMembers,
    ProjectResourcesPanel,
    FormDialog,
    ConfirmDialog,
    RouterLink,
  ],
  template: `<app-project-frame>
    @if (scope.context.selected(); as project) {
      @if (project.status === 'ARCHIVED') {
        <p class="message info" role="status">
          Projeto arquivado. O histórico permanece disponível para consulta; alterações estão
          bloqueadas. Não há restauração nesta fase.
        </p>
      }
      <nav class="workspace-tabs" aria-label="Seções do projeto">
        @if (project.permissions.includes('testcase.read')) {
          <a
            class="btn button-link"
            [routerLink]="[
              '/workspaces',
              project.workspaceId,
              'projects',
              project.id,
              'test-cases',
            ]"
            >Casos de teste</a
          >
        }
        @if (project.permissions.includes('testrun.read')) {
          <a
            class="btn button-link"
            [routerLink]="['/workspaces', project.workspaceId, 'projects', project.id, 'execution']"
            >Planos e execuções</a
          >
        }
        @if (project.permissions.includes('defect.read')) {
          <a
            class="btn button-link"
            [routerLink]="['/workspaces', project.workspaceId, 'projects', project.id, 'defects']"
            >Defeitos</a
          >
        }
        @if (project.permissions.includes('testvault.read')) {
          <a
            class="btn button-link"
            [routerLink]="[
              '/workspaces',
              project.workspaceId,
              'projects',
              project.id,
              'test-vault',
            ]"
            >Cofre de testes</a
          >
        }
        @for (item of tabs; track item.key) {
          <button
            type="button"
            [class.active]="tab() === item.key"
            [attr.aria-current]="tab() === item.key ? 'page' : null"
            (click)="tab.set(item.key)"
          >
            {{ item.label }}
          </button>
        }
      </nav>
      @switch (tab()) {
        @case ('overview') {
          <div class="section-heading">
            <h2>Visão geral</h2>
            <div class="table-actions">
              @if (can('project.update')) {
                <button
                  class="btn"
                  type="button"
                  [disabled]="operation.busy()"
                  (click)="edit(project)"
                >
                  Editar projeto
                </button>
              }
              @if (can('project.archive')) {
                <button
                  class="btn"
                  type="button"
                  [disabled]="operation.busy()"
                  (click)="archiving.set(true)"
                >
                  Arquivar projeto
                </button>
              }
            </div>
          </div>
          @if (operation.error() && !editor() && !archiving()) {
            <p class="message error" role="alert">{{ operation.error() }}</p>
          }
          @if (operation.success()) {
            <p class="message success" role="status">{{ operation.success() }}</p>
          }
          <dl class="profile-details">
            <dt>Chave</dt>
            <dd>{{ project.key }}</dd>
            <dt>Nome</dt>
            <dd>{{ project.name }}</dd>
            <dt>Descrição</dt>
            <dd>{{ project.description || '—' }}</dd>
            <dt>Situação</dt>
            <dd>{{ project.status === 'ACTIVE' ? 'Ativo' : 'Arquivado' }}</dd>
            <dt>Seu papel local</dt>
            <dd>
              {{ project.projectRole ? labels[project.projectRole] : 'Acesso pelo Workspace' }}
            </dd>
            <dt>Criado em</dt>
            <dd>{{ project.createdAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
            <dt>Atualizado em</dt>
            <dd>{{ project.updatedAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
            @if (project.archivedAt) {
              <dt>Arquivado em</dt>
              <dd>{{ project.archivedAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
            }
          </dl>
          <p class="message info">
            Seu acesso combina as permissões do Workspace com o papel neste projeto. A chave é
            permanente e permanece reservada após arquivamento.
          </p>
        }
        @case ('members') {
          <app-project-members [project]="project" (changed)="scope.refresh()" />
        }
        @case ('milestones') {
          <app-project-resources [project]="project" kind="milestones" />
        }
        @case ('environments') {
          <app-project-resources [project]="project" kind="environments" />
        }
      }
      @if (editor(); as fields) {
        <app-form-dialog
          title="Editar projeto"
          [fields]="fields"
          [state]="operation"
          (saved)="save($event)"
          (closed)="editor.set(null)"
        />
      }
      @if (archiving()) {
        <app-confirm-dialog
          title="Arquivar projeto"
          [message]="
            'Arquivar ' +
            project.name +
            '? Participantes, marcos e ambientes serão preservados. Todas as alterações serão bloqueadas. Não há restauração nesta fase.'
          "
          [state]="operation"
          (confirmed)="archive()"
          (closed)="archiving.set(false)"
        />
      }
    }
  </app-project-frame>`,
})
export class ProjectDetail {
  readonly scope = inject(ProjectScope);
  private readonly api = inject(ProjectApi);
  readonly operation = new OperationState(inject(DestroyRef));
  readonly tab = signal<'overview' | 'members' | 'milestones' | 'environments'>('overview');
  readonly tabs = [
    { key: 'overview', label: 'Visão geral' },
    { key: 'members', label: 'Participantes' },
    { key: 'milestones', label: 'Marcos' },
    { key: 'environments', label: 'Ambientes' },
  ] as const;
  readonly labels = projectRoleLabels;
  readonly editor = signal<EditorField[] | null>(null);
  readonly archiving = signal(false);
  constructor() {
    let routeKey = '';
    effect(() => {
      const key = `${this.scope.workspaceId()}/${this.scope.projectId()}`;
      if (key !== routeKey) {
        routeKey = key;
        this.tab.set('overview');
        this.operation.error.set('');
        this.operation.success.set('');
      }
      if (!this.scope.context.selected()) {
        this.editor.set(null);
        this.archiving.set(false);
      }
    });
  }
  can(permission: string): boolean {
    const project = this.scope.context.selected();
    return !!project && canChange(project, permission);
  }
  edit(project: Project): void {
    if (this.can('project.update')) {
      this.operation.error.set('');
      this.editor.set([
        { key: 'key', label: 'Chave (permanente)', value: project.key, disabled: true },
        nameField(project.name),
        descriptionField(project.description),
      ]);
    }
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }): void {
    if (!this.can('project.update')) return;
    this.operation.run(
      this.api.update(this.scope.workspaceId(), this.scope.projectId(), {
        name: String(event.values['name']).trim(),
        description: String(event.values['description']).trim() || null,
      }),
      () => {
        this.editor.set(null);
        this.operation.success.set('Projeto atualizado.');
        this.scope.refresh();
      },
      event.form,
    );
  }
  archive(): void {
    if (!this.can('project.archive')) return;
    this.operation.run(this.api.archive(this.scope.workspaceId(), this.scope.projectId()), () => {
      this.archiving.set(false);
      this.operation.success.set('Projeto arquivado.');
      this.scope.refresh();
    });
  }
}
