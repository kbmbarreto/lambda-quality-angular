import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, from, map, mergeMap, of, switchMap, startWith, toArray } from 'rxjs';
import { AuthorizedProjects } from '../projects/authorized-projects';
import { TestCaseApi } from '../test-cases/test-case-api.service';
import { Workspace } from '../workspaces/workspace.models';
import { workspaceError } from '../workspaces/workspace-feedback';
import { DashboardOverview } from './dashboard.models';

type ProjectRow = NonNullable<DashboardOverview['projects']>[number];
@Component({
  selector: 'app-dashboard-projects',
  imports: [RouterLink, DecimalPipe],
  template: `
    <div class="dashboard-card-heading">
      <h2 id="dashboard-projects-title">Meus projetos</h2>
      <a routerLink="/projetos">Ver todos</a>
    </div>
    @if (busy()) {
      <p role="status">Consultando todos os projetos…</p>
    }
    @if (result()?.issues?.length) {
      <details class="message info">
        <summary>Algumas consultas não puderam ser concluídas</summary>
        @for (issue of result()!.issues; track $index) {
          <p>{{ issue }}</p>
        }
        <button class="btn" (click)="retry.update((value) => value + 1)">
          Consultar novamente
        </button>
      </details>
    }
    <div
      class="table-scroll dashboard-projects-scroll"
      role="region"
      aria-label="Todos os meus projetos"
      tabindex="0"
    >
      <table class="data-table dashboard-projects">
        <thead>
          <tr>
            <th scope="col">Projeto</th>
            <th scope="col">Workspace</th>
            <th scope="col">Testes</th>
            <th scope="col">Automatizados</th>
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          @for (project of rows(); track project.id) {
            <tr>
              <td>
                <a [routerLink]="['/workspaces', project.workspaceId, 'projects', project.id]">{{
                  project.name
                }}</a>
              </td>
              <td>{{ project.workspaceName }}</td>
              <td>
                {{
                  project.activeTestCases == null
                    ? '—'
                    : (project.activeTestCases | number: '1.0-0')
                }}
              </td>
              <td>
                @if (project.automationCoverage != null) {
                  <div
                    class="dashboard-progress"
                    role="progressbar"
                    [attr.aria-label]="'Automação de ' + project.name"
                    [attr.aria-valuenow]="project.automationCoverage"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <span [style.width.%]="project.automationCoverage"></span>
                  </div>
                  <small>{{ project.automationCoverage | number: '1.0-1' }}%</small>
                } @else {
                  —
                }
              </td>
              <td>{{ project.status === 'ACTIVE' ? 'Ativo' : 'Arquivado' }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">
                {{ busy() ? 'Carregando projetos…' : 'Nenhum projeto disponível neste escopo.' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <p class="dashboard-footnote">
      {{ rows().length }} projetos acessíveis, incluindo arquivados. Testes: casos ativos.
      Automatizados: casos ativos automatizados ÷ casos ativos. Indicadores atuais.
    </p>
  `,
})
export class DashboardProjects {
  readonly workspaces = input<Workspace[]>([]);
  readonly workspaceId = input('');
  readonly ready = input(false);
  readonly refreshKey = input(0);
  readonly overview = input<DashboardOverview['projects']>(null);
  readonly retry = signal(0);
  readonly busy = signal(false);
  private readonly catalog = inject(AuthorizedProjects);
  private readonly cases = inject(TestCaseApi);
  private readonly scope = computed(() => ({
    workspaces: this.workspaces(),
    workspaceId: this.workspaceId(),
    ready: this.ready(),
    refresh: this.refreshKey(),
    retry: this.retry(),
  }));
  readonly result = toSignal(
    toObservable(this.scope).pipe(
      switchMap((scope) => {
        this.busy.set(scope.ready);
        if (!scope.ready) return of(null);
        return this.catalog
          .list(scope.workspaces.filter((w) => !scope.workspaceId || w.id === scope.workspaceId))
          .pipe(
            switchMap((catalog) =>
              from(catalog.projects).pipe(
                mergeMap((project) => {
                  const base: ProjectRow = {
                    ...project,
                    activeTestCases: null,
                    automationCoverage: null,
                    progress: null,
                    coverage: null,
                  };
                  if (!project.permissions.includes('testcase.read'))
                    return of({ row: base, issue: '' });
                  return forkJoin({
                    active: this.cases.cases(project.workspaceId, project.id, {
                      page: 1,
                      size: 1,
                      status: 'ACTIVE',
                    }),
                    automated: this.cases.cases(project.workspaceId, project.id, {
                      page: 1,
                      size: 1,
                      status: 'ACTIVE',
                      automationStatus: 'AUTOMATED',
                    }),
                  }).pipe(
                    map((counts) => ({
                      row: {
                        ...base,
                        activeTestCases: counts.active.meta.pagination.totalItems,
                        automationCoverage: counts.active.meta.pagination.totalItems
                          ? (100 * counts.automated.meta.pagination.totalItems) /
                            counts.active.meta.pagination.totalItems
                          : null,
                      },
                      issue: '',
                    })),
                    catchError((error) =>
                      of({ row: base, issue: `${project.name}: ${workspaceError(error)}` }),
                    ),
                  );
                }, 4),
                toArray(),
                map((results) => ({
                  rows: results
                    .map((r) => r.row)
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
                  issues: [...catalog.issues, ...results.map((r) => r.issue).filter(Boolean)],
                })),
              ),
            ),
            map((result) => {
              this.busy.set(false);
              return result;
            }),
            catchError((error) => {
              this.busy.set(false);
              return of({ rows: [] as ProjectRow[], issues: [workspaceError(error)] });
            }),
            startWith(null),
          );
      }),
    ),
    { initialValue: null },
  );
  readonly rows = computed(() => this.result()?.rows ?? this.overview() ?? []);
}
