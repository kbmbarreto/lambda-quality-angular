import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { ProjectApi } from '../projects/project-api.service';
import { Project } from '../projects/project.models';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Workspace } from '../workspaces/workspace.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { allPages } from './test-case.models';
@Component({
  selector: 'app-repository-picker',
  imports: [FormsModule],
  template: `<div class="repository-picker" aria-label="Workspace e projeto do repositório">
      <div class="field">
        <label for="repository-workspace">Workspace</label
        ><select
          id="repository-workspace"
          [ngModel]="chosenWorkspace() || project().workspaceId"
          (focus)="loadWorkspaces()"
          (ngModelChange)="chooseWorkspace($event)"
          [disabled]="
            workspaceState.busy() ||
            projectState.busy() ||
            !!workspaceState.wait() ||
            !!projectState.wait()
          "
        >
          @if (!workspaces().length) {
            <option [value]="project().workspaceId">
              {{ context.selected()?.name || 'Workspace atual' }}
            </option>
          }
          @for (workspace of workspaces(); track workspace.id) {
            <option [value]="workspace.id">{{ workspace.name }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label for="repository-project">Projeto</label
        ><select
          id="repository-project"
          [ngModel]="
            chosenWorkspace() && chosenWorkspace() !== project().workspaceId ? '' : project().id
          "
          (focus)="loadProjects()"
          (ngModelChange)="open($event)"
          [disabled]="projectState.busy() || !!projectState.wait()"
        >
          @if (chosenWorkspace() && chosenWorkspace() !== project().workspaceId) {
            <option value="">Selecione o projeto</option>
          } @else if (!projects().length) {
            <option [value]="project().id">{{ project().key }} · {{ project().name }}</option>
          }
          @for (item of projects(); track item.id) {
            <option [value]="item.id">
              {{ item.key }} · {{ item.name }}{{ item.status === 'ARCHIVED' ? ' (arquivado)' : '' }}
            </option>
          }
        </select>
      </div>
      @if (projectState.busy()) {
        <span role="status">Carregando projetos…</span>
      }
      @if (projectsLoaded && !projects().length) {
        <span>Nenhum projeto com acesso a casos de teste neste Workspace.</span>
      }
    </div>
    @if (workspaceState.error() || projectState.error()) {
      <p class="message error" role="alert">
        {{ workspaceState.error() || projectState.error() }}
        <button
          class="btn"
          type="button"
          [disabled]="
            workspaceState.busy() ||
            projectState.busy() ||
            !!workspaceState.wait() ||
            !!projectState.wait()
          "
          (click)="retry()"
        >
          Atualizar seleção
        </button>
      </p>
    }`,
})
export class RepositoryPicker {
  readonly project = input.required<Project>();
  readonly context = inject(WorkspaceContext);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly projectApi = inject(ProjectApi);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  readonly workspaceState = new OperationState(this.destroy);
  readonly projectState = new OperationState(this.destroy);
  readonly workspaces = signal<Workspace[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly chosenWorkspace = signal('');
  private workspacesLoaded = false;
  projectsLoaded = false;
  loadWorkspaces() {
    if (this.workspacesLoaded) return;
    this.workspaceState.run(
      allPages((page) => this.workspaceApi.listWorkspaces({ page, size: 100, sort: 'name,asc' })),
      (rows) => {
        this.workspaces.set(
          rows.filter(
            (row) => row.status === 'ACTIVE' && row.permissions?.includes('project.read'),
          ),
        );
        this.workspacesLoaded = true;
      },
    );
  }
  chooseWorkspace(id: string) {
    if (!id || this.projectState.busy()) return;
    this.chosenWorkspace.set(id);
    this.projectsLoaded = false;
    this.projects.set([]);
    this.loadProjects(true);
  }
  loadProjects(autoOpen = false) {
    if (this.projectsLoaded) return;
    const w = this.chosenWorkspace() || this.project().workspaceId;
    this.projectState.run(
      allPages((page) =>
        this.projectApi.list(w, { page, size: 100, status: 'ALL', sort: 'name,asc' }),
      ),
      (rows) => {
        this.projects.set(rows.filter((row) => row.permissions.includes('testcase.read')));
        this.projectsLoaded = true;
        if (autoOpen && this.projects().length === 1) this.open(this.projects()[0].id);
      },
    );
  }
  open(id: string) {
    if (!id || !this.projects().some((project) => project.id === id)) return;
    void this.router.navigate([
      '/workspaces',
      this.chosenWorkspace() || this.project().workspaceId,
      'projects',
      id,
      'test-cases',
    ]);
  }
  retry() {
    this.workspacesLoaded = false;
    this.projectsLoaded = false;
    this.loadWorkspaces();
    this.loadProjects();
  }
}
