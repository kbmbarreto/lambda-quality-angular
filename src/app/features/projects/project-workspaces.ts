import { DefectInventory } from '../defects/defect-inventory';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { projectSection } from './project-section';
import { AppShell } from '../../shared/app-shell';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { ListState } from '../workspaces/workspace-feedback';
import { Workspace } from '../workspaces/workspace.models';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';

@Component({
  selector: 'app-project-workspaces',
  imports: [AppShell, RouterLink, ListTools, PaginationControls, DefectInventory],
  template: `<app-shell
    ><section class="window" [class.defect-inventory-window]="section.detail === 'defects'">
      <header class="window-header">
        {{ section.title }}
      </header>
      <div class="panel-body">
        <h1>Selecione um Workspace</h1>
        <p>
          Os projetos e seus participantes pertencem a um Workspace. Selecione a equipe para
          continuar.
        </p>
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
        <app-list-tools
          label="Workspaces para projetos"
          [sorts]="sorts"
          [busy]="list.state.busy() || !!list.state.wait()"
          (search)="list.search($event)"
          (refresh)="list.load()"
        />
        @if (list.state.busy()) {
          <p role="status">Carregando Workspaces…</p>
        }
        @for (workspace of list.rows(); track workspace.id) {
          <div class="picker-item">
            <div>
              <strong>{{ workspace.name }}</strong>
              <p>{{ workspace.slug }}</p>
            </div>
            @if (
              workspace.status === 'ACTIVE' &&
              (workspace.permissions?.includes('project.read') ||
                workspace.permissions?.includes('project.create'))
            ) {
              @if (section.detail === 'defects') {
                <button type="button" class="btn" (click)="defectWorkspace.set(workspace.id)">
                  Filtrar defeitos
                </button>
              }
              <a
                class="btn button-link"
                [routerLink]="['/workspaces', workspace.id, section.selector]"
                >{{ section.module ? 'Selecionar projeto' : 'Abrir projetos' }}</a
              >
            } @else {
              <span>Sem acesso a projetos</span>
            }
          </div>
        }
        @if (!list.state.busy() && !list.state.error() && !list.rows().length) {
          <p>
            Nenhum Workspace encontrado. <a routerLink="/workspaces">Criar ou acessar Workspaces</a>
          </p>
        }
        <app-pagination
          [pagination]="list.pagination()"
          [busy]="list.state.busy() || !!list.state.wait()"
          (change)="list.page($event)"
        />
        @if (section.detail === 'defects') {
          @if (defectWorkspace()) {
            <button class="btn" type="button" (click)="defectWorkspace.set('')">
              Mostrar todos os Workspaces
            </button>
          }
          <app-defect-inventory [workspaceId]="defectWorkspace()" />
        }
      </div></section
  ></app-shell>`,
})
export class ProjectWorkspaces {
  readonly defectWorkspace = signal('');
  readonly section = projectSection(inject(ActivatedRoute).snapshot.data);
  readonly context = inject(WorkspaceContext);
  private readonly api = inject(WorkspaceApi);
  readonly sorts = [
    { value: 'name,asc', label: 'Nome A–Z' },
    { value: 'createdAt,desc', label: 'Mais recentes' },
  ];
  readonly list = new ListState<Workspace>(inject(DestroyRef), (query) =>
    this.api.listWorkspaces(query),
  );
  constructor() {
    this.context.selected.set(null);
    inject(ProjectContext).selected.set(null);
    this.list.query.sort = 'name,asc';
    this.list.load();
  }
}
