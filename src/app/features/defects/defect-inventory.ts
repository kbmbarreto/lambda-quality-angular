import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SaoPauloDatePipe } from '../../shared/sao-paulo-date.pipe';
import { ListState } from '../workspaces/workspace-feedback';
import { ListQuery } from '../workspaces/workspace.models';
import { PaginationControls } from '../workspaces/ui/list-tools';
import { caseOptions, options } from '../test-cases/test-case.models';
import { DefectApi } from './defect-api.service';
import { DefectInventoryRow, DefectInventoryQuery, defectStatuses } from './defect.models';
import { DefectInventoryIndicators } from './defect-inventory-indicators';
import { DefectSummaryQuery } from './defect-summary';

@Component({
  selector: 'app-defect-inventory',
  imports: [
    FormsModule,
    RouterLink,
    PaginationControls,
    SaoPauloDatePipe,
    DefectInventoryIndicators,
  ],
  template: `<section class="resource-section" aria-labelledby="defect-inventory-title">
    <h2 id="defect-inventory-title">Inventário de defeitos</h2>
    <p>
      {{
        workspaceId()
          ? 'Defeitos do Workspace selecionado.'
          : 'Defeitos de todos os Workspaces aos quais você tem acesso.'
      }}
      Projetos arquivados também aparecem nesta consulta.
    </p>
    <form class="list-toolbar" (ngSubmit)="search()">
      <label class="sr-only" for="inventory-query">Buscar título de defeito</label>
      <input
        id="inventory-query"
        name="q"
        [(ngModel)]="q"
        maxlength="100"
        placeholder="Buscar título de defeito"
      />
      <label class="sr-only" for="inventory-status">Situação</label>
      <select id="inventory-status" name="status" [(ngModel)]="status">
        <option value="ALL">Todas as situações</option>
        @for (item of statuses; track item.value) {
          <option [value]="item.value">{{ item.label }}</option>
        }
      </select>
      <label class="sr-only" for="inventory-severity">Severidade</label>
      <select id="inventory-severity" name="severity" [(ngModel)]="severity">
        <option value="">Todas as severidades</option>
        @for (item of severities; track item.value) {
          <option [value]="item.value">{{ item.label }}</option>
        }
      </select>
      <label class="sr-only" for="inventory-sort">Ordenação</label>
      <select id="inventory-sort" name="sort" [(ngModel)]="sort">
        <option value="createdAt,desc">Mais recentes</option>
        <option value="updatedAt,desc">Atualizados recentemente</option>
        <option value="title,asc">Título A–Z</option>
        <option value="sequence,asc">Identificador crescente</option>
      </select>
      <button class="btn" [disabled]="list.state.busy() || !!list.state.wait()">Buscar</button>
      <button
        class="btn"
        type="button"
        [disabled]="list.state.busy() || !!list.state.wait()"
        (click)="refresh()"
      >
        Atualizar
      </button>
    </form>
    <app-defect-inventory-indicators [query]="applied()" [refreshKey]="indicatorRefresh()" />
    @if (list.state.error()) {
      <p class="message error" role="alert">
        {{ list.state.error() }}
        @if (list.state.wait()) {
          Aguarde {{ list.state.wait() }}s.
        }
      </p>
    }
    @if (list.state.busy()) {
      <p role="status">Carregando defeitos…</p>
    }
    @if (list.rows().length) {
      <div class="table-scroll">
        <table class="data-table defect-inventory-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Título</th>
              <th>Workspace</th>
              <th>Projeto</th>
              <th>Situação</th>
              <th>Severidade</th>
              <th>Ambiente</th>
              <th>Criado em</th>
              <th>Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            @for (item of list.rows(); track item.id) {
              <tr>
                <td>
                  <a
                    [routerLink]="[
                      '/workspaces',
                      item.workspaceId,
                      'projects',
                      item.projectId,
                      'defects',
                    ]"
                    [queryParams]="{ defectId: item.id }"
                    ><strong>{{ item.humanId }}</strong></a
                  >
                </td>
                <td>{{ item.title }}</td>
                <td>{{ item.workspaceName }}</td>
                <td>
                  {{ item.projectName }}
                  @if (item.projectStatus === 'ARCHIVED') {
                    <small>Arquivado</small>
                  }
                </td>
                <td>{{ labels[item.status] }}</td>
                <td>{{ severityLabels[item.severity] }}</td>
                <td>{{ item.environmentSnapshot?.name || 'Sem ambiente' }}</td>
                <td>{{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td>{{ item.updatedAt | date: 'dd/MM/yyyy HH:mm' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (!list.state.busy() && !list.state.error()) {
      <p>Nenhum defeito encontrado para os filtros selecionados.</p>
    }
    <app-pagination
      [pagination]="list.pagination()"
      [busy]="list.state.busy() || !!list.state.wait()"
      (change)="list.page($event)"
    />
  </section>`,
})
export class DefectInventory {
  readonly workspaceId = input('');
  private readonly api = inject(DefectApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly labels = defectStatuses;
  readonly statuses = options(defectStatuses);
  readonly severities = options(caseOptions.severity);
  readonly severityLabels = caseOptions.severity;
  q = '';
  status = 'ALL';
  severity = '';
  sort = 'createdAt,desc';
  readonly applied = signal<DefectSummaryQuery>({ status: 'ALL' });
  readonly indicatorRefresh = signal(0);
  readonly list = new ListState<DefectInventoryRow>(this.destroyRef, (query) =>
    this.api.inventory({
      ...query,
      workspaceId: this.workspaceId() || undefined,
    } as DefectInventoryQuery),
  );
  constructor() {
    effect(() => {
      this.workspaceId();
      untracked(() => {
        this.list.cancel();
        this.search();
      });
    });
    this.api.inventoryChanged.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());
  }
  refresh() {
    this.list.load();
    this.indicatorRefresh.update((value) => value + 1);
  }
  search() {
    this.applied.set({
      workspaceId: this.workspaceId() || undefined,
      q: this.q.trim() || undefined,
      status: this.status,
      severity: this.severity ? (this.severity as DefectSummaryQuery['severity']) : undefined,
    });
    this.list.search({
      q: this.q.trim(),
      status: this.status,
      sort: this.sort,
      severity: this.severity || undefined,
    } as ListQuery);
  }
}
