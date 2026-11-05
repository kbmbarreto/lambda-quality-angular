import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, throwError } from 'rxjs';
import { AppShell } from '../../shared/app-shell';
import { ProjectApi } from '../projects/project-api.service';
import { Project } from '../projects/project.models';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Workspace } from '../workspaces/workspace.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { allPages } from './test-case.models';
import { RepositoryHistory } from './repository-location';
@Component({
  selector: 'app-test-repository-entry',
  imports: [AppShell, FormsModule, RouterLink],
  template: `<app-shell
    ><section class="window">
      <header class="window-header">Casos de teste</header>
      <div class="panel-body repository-entry">
        <div class="eyebrow">Casos de teste</div>
        <h1>Repositório de testes</h1>
        @if (state.busy() || projectState.busy()) {
          <p role="status">Abrindo repositório…</p>
        }
        @if (state.error() || projectState.error()) {
          <p class="message error" role="alert">
            {{ state.error() || projectState.error() }}
            <button
              class="btn"
              type="button"
              [disabled]="
                state.busy() || projectState.busy() || !!state.wait() || !!projectState.wait()
              "
              (click)="retry()"
            >
              Tentar novamente
            </button>
          </p>
        }
        @if (loaded()) {
          <p>
            Escolha o projeto para navegar pelas suítes e seus casos. Sua seleção será mantida nesta
            sessão.
          </p>
          <div class="repository-picker">
            <div class="field">
              <label for="entry-workspace">Workspace</label
              ><select
                id="entry-workspace"
                [ngModel]="workspaceId()"
                (ngModelChange)="chooseWorkspace($event)"
                [disabled]="state.busy() || projectState.busy() || !!projectState.wait()"
              >
                <option value="">Selecione o Workspace</option>
                @for (w of workspaces(); track w.id) {
                  <option [value]="w.id">{{ w.name }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="entry-project">Projeto</label
              ><select
                id="entry-project"
                [ngModel]="''"
                (ngModelChange)="open($event)"
                [disabled]="!workspaceId() || projectState.busy()"
              >
                <option value="">Selecione o projeto</option>
                @for (p of projects(); track p.id) {
                  <option [value]="p.id">
                    {{ p.key }} · {{ p.name }}{{ p.status === 'ARCHIVED' ? ' (arquivado)' : '' }}
                  </option>
                }
              </select>
            </div>
          </div>
          @if (!workspaces().length) {
            <p>
              Nenhum Workspace com acesso a projetos.
              <a routerLink="/workspaces">Acessar Workspaces</a>
            </p>
          } @else if (workspaceId() && projectsLoaded() && !projects().length) {
            <p>
              Nenhum projeto com acesso a casos de teste neste Workspace.
              <a [routerLink]="['/workspaces', workspaceId(), 'projects']">Acessar projetos</a>
            </p>
          }
          @if (projects().length > 1) {
            <div class="repository-project-cards">
              @for (p of projects(); track p.id) {
                <button class="repository-project-card" type="button" (click)="open(p.id)">
                  <strong>{{ p.key }}</strong
                  ><span>{{ p.name }}</span
                  ><small>Abrir suítes e casos →</small>
                </button>
              }
            </div>
          }
        }
      </div>
    </section></app-shell
  >`,
})
export class TestRepositoryEntry implements OnInit {
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly projectApi = inject(ProjectApi);
  private readonly history = inject(RepositoryHistory);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly state = new OperationState(this.destroy);
  readonly projectState = new OperationState(this.destroy);
  readonly workspaces = signal<Workspace[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly workspaceId = signal('');
  readonly loaded = signal(false);
  readonly projectsLoaded = signal(false);
  ngOnInit() {
    const previous = this.history.read();
    const scoped = this.route.snapshot.paramMap.get('workspaceId');
    if (previous && (!scoped || scoped === previous.workspaceId)) {
      this.state.run(
        forkJoin({
          workspace: this.workspaceApi.getWorkspace(previous.workspaceId),
          project: this.projectApi.get(previous.workspaceId, previous.projectId),
        }).pipe(
          catchError((error) =>
            error instanceof HttpErrorResponse && [403, 404].includes(error.status)
              ? of(null)
              : throwError(() => error),
          ),
        ),
        (result) => {
          if (
            result?.workspace.data.status === 'ACTIVE' &&
            result.project.data.permissions.includes('testcase.read')
          )
            this.navigate(result.project.data);
          else {
            this.history.clear();
            this.loadWorkspaces();
          }
        },
      );
    } else this.loadWorkspaces();
  }
  loadWorkspaces() {
    this.state.run(
      allPages((page) => this.workspaceApi.listWorkspaces({ page, size: 100, sort: 'name,asc' })),
      (rows) => {
        this.workspaces.set(
          rows.filter((w) => w.status === 'ACTIVE' && w.permissions?.includes('project.read')),
        );
        this.loaded.set(true);
        const scoped = this.route.snapshot.paramMap.get('workspaceId');
        const choice =
          this.workspaces().find((w) => w.id === scoped) ??
          (this.workspaces().length === 1 ? this.workspaces()[0] : null);
        if (choice) this.chooseWorkspace(choice.id);
      },
    );
  }
  chooseWorkspace(id: string) {
    if (this.projectState.busy() || this.projectState.wait()) return;
    this.workspaceId.set(id);
    this.projects.set([]);
    this.projectsLoaded.set(false);
    if (!id) return;
    this.projectState.run(
      allPages((page) =>
        this.projectApi.list(id, { page, size: 100, status: 'ALL', sort: 'name,asc' }),
      ),
      (rows) => {
        this.projects.set(rows.filter((p) => p.permissions.includes('testcase.read')));
        this.projectsLoaded.set(true);
        if (this.projects().length === 1) this.navigate(this.projects()[0]);
      },
    );
  }
  open(id: string) {
    const project = this.projects().find((p) => p.id === id);
    if (project) this.navigate(project);
  }
  private navigate(project: Project) {
    this.history.remember(project);
    void this.router.navigate(
      ['/workspaces', project.workspaceId, 'projects', project.id, 'test-cases'],
      { replaceUrl: true },
    );
  }
  retry() {
    if (this.workspaceId()) this.chooseWorkspace(this.workspaceId());
    else this.ngOnInit();
  }
}
