import { tap } from 'rxjs';
import { Component, DestroyRef, OnInit, input, output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Workspace } from '../workspaces/workspace.models';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { ListState } from '../workspaces/workspace-feedback';
import { options } from '../test-cases/test-case.models';
import { validResourceId } from '../../shared/resource-id';
import { GovernanceApi } from './governance-api.service';
import { Kind, RecordItem, Query, kindLabels, statuses, recordName } from './governance.models';
const sortFields: Record<Kind, [string, string][]> = {
  frameworks: [
    ['name', 'Nome A–Z'],
    ['code', 'Código crescente'],
    ['createdAt', 'Mais recentes'],
  ],
  assessments: [
    ['assessmentDate', 'Data da avaliação'],
    ['name', 'Nome A–Z'],
    ['closedAt', 'Fechamento recente'],
  ],
  goals: [
    ['name', 'Nome A–Z'],
    ['deadline', 'Prazo crescente'],
    ['updatedAt', 'Atualizadas recentemente'],
  ],
  actions: [
    ['dueDate', 'Prazo crescente'],
    ['title', 'Título A–Z'],
    ['updatedAt', 'Atualizadas recentemente'],
  ],
};
@Component({
  selector: 'app-governance-collection',
  imports: [FormsModule, DatePipe, ListTools, PaginationControls],
  template: `<section [attr.aria-label]="labels[kind()]">
    <div class="section-heading">
      <h2>{{ labels[kind()] }}</h2>
      @if (canCreate()) {
        <button
          class="btn"
          type="button"
          [disabled]="blocked() || creationBlocked()"
          (click)="create.emit()"
        >
          Criar {{ createLabel() }}
        </button>
      }
    </div>
    @if (canRead()) {
      <div class="case-filters">
        @if (kind() !== 'frameworks') {
          <label
            >{{ filterLabel()
            }}<input
              name="reference"
              maxlength="36"
              [(ngModel)]="reference"
              placeholder="ID opcional"
              [disabled]="list.state.busy()"
          /></label>
        }
        @if (kind() === 'actions') {
          <label
            >ID do controle avaliado<input
              name="control"
              maxlength="36"
              [(ngModel)]="controlFilter"
              placeholder="ID opcional"
              [disabled]="list.state.busy()"
          /></label>
        }
      </div>
      <app-list-tools
        [label]="labels[kind()]"
        [statuses]="choices()"
        [sorts]="sorts()"
        [busy]="list.state.busy() || !!list.state.wait() || blocked()"
        (search)="search($event)"
        (refresh)="load()"
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
        <p role="status">Carregando registros…</p>
      }
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome / Título</th>
              <th>Situação</th>
              <th>Resumo</th>
              <th>Atualizado em</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            @for (item of list.rows(); track item.id) {
              <tr>
                <td class="preserve-text">{{ name(item) }}</td>
                <td>{{ status(item) }}</td>
                <td>{{ summary(item) }}</td>
                <td>{{ item.updatedAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td>
                  <button
                    class="btn"
                    type="button"
                    [disabled]="blocked()"
                    (click)="opened.emit(item)"
                  >
                    Abrir registro
                  </button>
                </td>
              </tr>
            } @empty {
              @if (!list.state.busy() && !list.state.error()) {
                <tr>
                  <td colspan="5">Nenhum registro encontrado para estes filtros.</td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      <app-pagination
        [pagination]="list.pagination()"
        [busy]="list.state.busy() || !!list.state.wait() || blocked()"
        (change)="list.page($event)"
      />
    } @else {
      <p class="message info">
        Consultar registros exige governance.read. Suas permissões de criação continuam
        independentes.
      </p>
    }
  </section>`,
})
export class GovernanceCollection implements OnInit {
  readonly kind = input.required<Kind>();
  readonly workspace = input.required<Workspace>();
  readonly blocked = input(false);
  readonly creationBlocked = input(false);
  readonly opened = output<RecordItem>();
  readonly create = output<void>();
  readonly loaded = output<void>();
  readonly labels = kindLabels;
  readonly name = recordName;
  private readonly api = inject(GovernanceApi);
  reference = '';
  controlFilter = '';
  readonly list = new ListState<RecordItem>(inject(DestroyRef), (q) =>
    this.api.list(this.workspace().id, this.kind(), q).pipe(tap(() => this.loaded.emit())),
  );
  ngOnInit() {
    this.list.query.sort = this.sorts()[0].value;
    if (this.canRead()) this.load();
  }
  canRead() {
    return this.workspace().permissions?.includes('governance.read');
  }
  canCreate() {
    return (
      this.workspace().status === 'ACTIVE' &&
      this.workspace().permissions?.includes(
        this.kind() === 'assessments' ? 'governance.assess' : 'governance.manage',
      )
    );
  }
  choices() {
    return options(statuses[this.kind()]);
  }
  sorts() {
    return sortFields[this.kind()].map(([field, label]) => ({
      value: `${field},${['updatedAt', 'createdAt', 'closedAt'].includes(field) ? 'desc' : 'asc'}`,
      label,
    }));
  }
  createLabel() {
    return {
      frameworks: 'framework',
      assessments: 'avaliação',
      goals: 'meta',
      actions: 'ação de melhoria',
    }[this.kind()];
  }
  filterLabel() {
    return {
      frameworks: '',
      assessments: 'ID do framework',
      goals: 'ID do projeto',
      actions: 'ID da meta',
    }[this.kind()];
  }
  search(q: Query) {
    if (!this.canRead() || this.blocked()) return;
    if ([this.reference, this.controlFilter].some((v) => v && !validResourceId(v))) {
      this.list.state.error.set('Informe um UUID v4 válido para os filtros de vínculo.');
      return;
    }
    const key = {
      frameworks: '',
      assessments: 'frameworkId',
      goals: 'projectId',
      actions: 'goalId',
    }[this.kind()];
    this.list.search({
      ...q,
      ...(key ? { [key]: this.reference || undefined } : {}),
      ...(this.kind() === 'actions'
        ? { controlAssessmentId: this.controlFilter || undefined }
        : {}),
    } as Query);
  }
  load() {
    if (this.canRead()) this.list.load();
  }
  status(item: RecordItem) {
    return (statuses[this.kind()] as Record<string, string>)[item.status];
  }
  summary(item: RecordItem) {
    if ('code' in item) return `${item.code} · ${item.versionLabel}`;
    if ('index' in item)
      return `${item.frameworkSnapshot.code} · Índice interno ${item.index.value ?? '—'} · ${item.index.assessedControls}/${item.index.totalControls}`;
    if ('goalType' in item)
      return item.actionProgress
        ? `${item.actionProgress.percent === null ? 'Sem ações válidas' : item.actionProgress.percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'} · ${item.actionProgress.completedActions}/${item.actionProgress.totalActions} ações concluídas · Métrica informativa ${item.lastResult?.value ?? '—'}`
        : 'Progresso das ações indisponível';
    return `Prazo ${item.dueDate?.split('-').reverse().join('/') ?? 'não definido'}`;
  }
}
