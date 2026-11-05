import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, from, map, mergeMap, of, switchMap, startWith, toArray } from 'rxjs';
import { SaoPauloDatePipe } from '../../shared/sao-paulo-date.pipe';
import { AppShell } from '../../shared/app-shell';
import { AuthorizedProjects } from '../projects/authorized-projects';
import { allPages } from '../test-cases/test-case.models';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { workspaceError } from '../workspaces/workspace-feedback';
import { ExecutionApi } from './execution-api.service';
import { TestRun, runLabels } from './execution.models';

@Component({
  selector: 'app-execution-inventory',
  imports: [AppShell, FormsModule, RouterLink, SaoPauloDatePipe],
  template: `<app-shell>
    <div class="section-heading">
      <div>
        <h1>Todas as execuções</h1>
        <p>Histórico completo dos projetos aos quais você tem acesso, incluindo os arquivados.</p>
      </div>
      <a class="btn" routerLink="/planos-e-execucoes">Planos e execuções por projeto</a>
    </div>
    <div class="list-toolbar">
      <label
        >Workspace<select [ngModel]="workspaceId()" (ngModelChange)="changeWorkspace($event)">
          <option value="">Todos os meus Workspaces</option>
          @for (w of catalog()?.workspaces ?? []; track w.id) {
            <option [value]="w.id">{{ w.name }}</option>
          }
        </select></label
      >
      <label
        >Projeto<select
          [ngModel]="projectId()"
          (ngModelChange)="projectId.set($event); page.set(1)"
        >
          <option value="">Todos os projetos</option>
          @for (p of projects(); track p.id) {
            <option [value]="p.id">{{ p.name }} · {{ p.workspaceName }}</option>
          }
        </select></label
      >
      <label
        >Situação<select [ngModel]="status()" (ngModelChange)="status.set($event); page.set(1)">
          <option value="">Todas</option>
          @for (entry of statuses; track entry.value) {
            <option [value]="entry.value">{{ entry.label }}</option>
          }
        </select></label
      >
      <label
        >Buscar execução<input
          type="search"
          maxlength="100"
          [ngModel]="search()"
          (ngModelChange)="search.set($event); page.set(1)"
      /></label>
      <button class="btn" [disabled]="busy()" (click)="reload.update((n) => n + 1)">
        Atualizar
      </button>
    </div>
    @if (!catalog() || busy()) {
      <p role="status">Consultando execuções…</p>
    }
    @if (issues().length) {
      <div class="message error" role="alert">
        <strong>A lista pode estar incompleta.</strong>
        @for (issue of issues(); track $index) {
          <p>{{ issue }}</p>
        }
      </div>
    }
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Execução</th>
            <th>Projeto</th>
            <th>Workspace</th>
            <th>Plano</th>
            <th>Situação</th>
            <th>Casos</th>
            <th>Criada em</th>
          </tr>
        </thead>
        <tbody>
          @for (run of visible(); track run.id) {
            <tr>
              <td>
                <a
                  [routerLink]="[
                    '/workspaces',
                    run.workspaceId,
                    'projects',
                    run.projectId,
                    'execution',
                  ]"
                  [queryParams]="{ runId: run.id }"
                  >{{ run.name }}</a
                >
              </td>
              <td>{{ run.projectName }}</td>
              <td>{{ run.workspaceName }}</td>
              <td>{{ run.planNameSnapshot ?? 'Avulsa' }}</td>
              <td>{{ labels[run.status] }}</td>
              <td>{{ run.summary.total }}</td>
              <td>{{ run.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
            </tr>
          } @empty {
            @if (!busy() && catalog()) {
              <tr>
                <td colspan="7">Nenhuma execução encontrada.</td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <span>{{ filtered().length }} execuções · Página {{ page() }} de {{ totalPages() }}</span>
      <button class="btn" [disabled]="page() <= 1" (click)="page.update((n) => n - 1)">
        Anterior
      </button>
      <button class="btn" [disabled]="page() >= totalPages()" (click)="page.update((n) => n + 1)">
        Próxima
      </button>
    </div>
  </app-shell>`,
})
export class ExecutionInventory {
  private readonly workspacesApi = inject(WorkspaceApi);
  private readonly projectsApi = inject(AuthorizedProjects);
  private readonly api = inject(ExecutionApi);
  private readonly entryWorkspace =
    inject(ActivatedRoute).snapshot.queryParamMap.get('workspaceId') ?? '';
  readonly reload = signal(0);
  readonly workspaceId = signal('');
  readonly projectId = signal('');
  readonly status = signal('');
  readonly search = signal('');
  readonly page = signal(1);
  readonly busy = signal(false);
  readonly labels = runLabels;
  readonly statuses = Object.entries(runLabels).map(([value, label]) => ({ value, label }));
  readonly catalog = toSignal(
    toObservable(this.reload).pipe(
      switchMap(() =>
        allPages((page) =>
          this.workspacesApi.listWorkspaces({ page, size: 100, sort: 'name,asc' }),
        ).pipe(
          switchMap((rows) => {
            const workspaces = rows.filter((w) => w.status === 'ACTIVE');
            if (!this.catalogInitialized) {
              this.workspaceId.set(
                workspaces.some((w) => w.id === this.entryWorkspace) ? this.entryWorkspace : '',
              );
              this.catalogInitialized = true;
            } else if (!workspaces.some((w) => w.id === this.workspaceId()))
              this.changeWorkspace('');
            return this.projectsApi
              .list(workspaces)
              .pipe(map((result) => ({ ...result, workspaces })));
          }),
          catchError((error) =>
            of({ workspaces: [], projects: [], issues: [workspaceError(error)] }),
          ),
          startWith(null),
        ),
      ),
    ),
    { initialValue: null },
  );
  private catalogInitialized = false;
  readonly projects = computed(() =>
    (this.catalog()?.projects ?? []).filter(
      (p) =>
        p.permissions.includes('testrun.read') &&
        (!this.workspaceId() || p.workspaceId === this.workspaceId()),
    ),
  );
  private readonly scope = computed(() => ({
    projects: this.projects(),
    projectId: this.projectId(),
    reload: this.reload(),
  }));
  readonly result = toSignal(
    toObservable(this.scope).pipe(
      switchMap((scope) => {
        this.busy.set(true);
        this.page.set(1);
        return from(
          scope.projects.filter((p) => !scope.projectId || p.id === scope.projectId),
        ).pipe(
          mergeMap(
            (project) =>
              allPages((page) =>
                this.api.runs(project.workspaceId, project.id, {
                  page,
                  size: 100,
                  sort: 'createdAt,desc',
                }),
              ).pipe(
                map((rows) => ({
                  rows: rows.map((run) => ({
                    ...run,
                    projectName: project.name,
                    workspaceName: project.workspaceName,
                  })),
                  issue: '',
                })),
                catchError((error) =>
                  of({
                    rows: [] as InventoryRun[],
                    issue: `${project.name}: ${workspaceError(error)}`,
                  }),
                ),
              ),
            4,
          ),
          toArray(),
          map((results) => {
            this.busy.set(false);
            return {
              rows: results.flatMap((r) => r.rows),
              issues: results.map((r) => r.issue).filter(Boolean),
            };
          }),
          startWith({ rows: [] as InventoryRun[], issues: [] as string[] }),
        );
      }),
    ),
    { initialValue: null },
  );
  readonly issues = computed(() => [
    ...(this.catalog()?.issues ?? []),
    ...(this.result()?.issues ?? []),
  ]);
  readonly filtered = computed(() =>
    (this.result()?.rows ?? [])
      .filter(
        (run) =>
          (!this.workspaceId() || run.workspaceId === this.workspaceId()) &&
          (!this.projectId() || run.projectId === this.projectId()) &&
          (!this.status() || run.status === this.status()) &&
          run.name
            .toLocaleLowerCase('pt-BR')
            .includes(this.search().trim().toLocaleLowerCase('pt-BR')),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
  );
  readonly visible = computed(() =>
    this.filtered().slice((this.page() - 1) * 20, this.page() * 20),
  );
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 20)));
  changeWorkspace(id: string) {
    this.workspaceId.set(id);
    this.projectId.set('');
    this.page.set(1);
  }
}
type InventoryRun = TestRun & { projectName: string; workspaceName: string };
