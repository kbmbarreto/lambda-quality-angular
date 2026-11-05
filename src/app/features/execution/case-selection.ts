import { Component, DestroyRef, OnInit, inject, input, output } from '@angular/core';
import { Project } from '../projects/project.models';
import { TestCaseApi } from '../test-cases/test-case-api.service';
import { TestCase, caseOptions } from '../test-cases/test-case.models';
import { ListState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
@Component({
  selector: 'app-execution-case-selection',
  imports: [ListTools, PaginationControls],
  template: `<section aria-label="Selecionar casos de teste">
    <h3>{{ single() ? 'Adicionar caso ao plano' : 'Selecionar casos de teste' }}</h3>
    <p>
      {{ selected().length }} de {{ limit() }} casos selecionados. A seleção permanece ao trocar de
      página.
    </p>
    <app-list-tools
      label="casos disponíveis"
      [statuses]="statuses"
      defaultStatus="ACTIVE"
      [busy]="blocked() || list.state.busy() || !!list.state.wait()"
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
      <p role="status">Carregando casos…</p>
    }
    @if (!single()) {
      <div class="row-actions">
        <label
          ><input
            type="checkbox"
            [checked]="pageSelected()"
            [indeterminate]="pagePartlySelected()"
            [disabled]="blocked() || list.state.busy() || !available().length"
            (change)="togglePage()"
          />
          Selecionar disponíveis nesta página</label
        >
        <button
          class="btn"
          type="button"
          [disabled]="blocked() || !selected().length"
          (click)="changed.emit([])"
        >
          Limpar seleção
        </button>
      </div>
    }
    @for (item of list.rows(); track item.id) {
      <div class="picker-item execution-case-option" [class.single-case-option]="single()">
        @if (!single()) {
          <input
            type="checkbox"
            [attr.aria-label]="'Selecionar ' + item.humanId + ' · ' + item.title"
            [checked]="selected().includes(item.id) || excluded().includes(item.id)"
            [disabled]="
              blocked() ||
              !eligible(item) ||
              excluded().includes(item.id) ||
              (!selected().includes(item.id) && selected().length >= limit())
            "
            (change)="choose(item)"
          />
        }
        <span class="execution-case-title"
          ><strong>{{ item.humanId }} · {{ item.title }}</strong> ·
          {{ item.status === 'ARCHIVED' ? 'Arquivado' : labels.status[item.status] }}</span
        >
        @if (single() && eligible(item)) {
          <button
            class="btn"
            type="button"
            [disabled]="
              blocked() ||
              (!selected().includes(item.id) && selected().length >= limit()) ||
              (single() && selected().includes(item.id))
            "
            (click)="choose(item)"
          >
            {{
              selected().includes(item.id)
                ? single()
                  ? 'Incluído'
                  : 'Desmarcar'
                : single()
                  ? 'Adicionar'
                  : 'Selecionar'
            }}
          </button>
        } @else if (excluded().includes(item.id)) {
          <span class="execution-case-note">Já incluído no plano</span>
        } @else if (!eligible(item)) {
          <span class="execution-case-note">Indisponível para seleção</span>
        }
      </div>
    }
    @if (!list.state.busy() && !list.state.error() && !list.rows().length) {
      <p>Nenhum caso disponível para estes filtros.</p>
    }
    <app-pagination
      [pagination]="list.pagination()"
      [busy]="blocked() || list.state.busy() || !!list.state.wait()"
      (change)="list.page($event)"
    />
    @if (!single() && selected().length) {
      <details>
        <summary>Seleção ordenada ({{ selected().length }})</summary>
        @for (id of selected(); track id; let index = $index) {
          <div class="picker-item">
            <span>{{ index + 1 }}. {{ names.get(id) || id }}</span
            ><button class="btn" type="button" [disabled]="blocked()" (click)="remove(id)">
              Remover da seleção
            </button>
          </div>
        }
      </details>
    }
  </section>`,
  styles: `
    .execution-case-option {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      align-items: start;
      gap: 6px 12px;
      text-align: left;
    }
    .execution-case-option > input[type='checkbox'] {
      margin: 2px 0 0;
    }
    .execution-case-title {
      min-width: 0;
      line-height: 1.5;
    }
    .execution-case-note {
      grid-column: 2;
      color: var(--muted);
    }
    .single-case-option {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .single-case-option .execution-case-note {
      grid-column: 1 / -1;
    }
  `,
})
export class ExecutionCaseSelection implements OnInit {
  readonly project = input.required<Project>();
  readonly single = input(false);
  readonly allowDraft = input(false);
  readonly excluded = input<string[]>([]);
  readonly limit = input(500);
  readonly selected = input<string[]>([]);
  readonly blocked = input(false);
  readonly changed = output<string[]>();
  readonly added = output<TestCase>();
  private readonly api = inject(TestCaseApi);
  readonly names = new Map<string, string>();
  readonly labels = caseOptions;
  readonly list = new ListState<TestCase>(inject(DestroyRef), (q) =>
    this.api.cases(this.project().workspaceId, this.project().id, { ...q, sort: 'sequence,asc' }),
  );
  get statuses() {
    return this.single() || this.allowDraft()
      ? [
          { value: 'ACTIVE', label: 'Ativos' },
          { value: 'DRAFT', label: 'Rascunhos' },
        ]
      : [];
  }
  ngOnInit() {
    this.list.query = { page: 1, size: 20, status: 'ACTIVE', sort: 'sequence,asc' };
    this.list.load();
  }
  eligible(item: TestCase) {
    return (
      item.status === 'ACTIVE' || ((this.single() || this.allowDraft()) && item.status === 'DRAFT')
    );
  }
  available() {
    return this.list
      .rows()
      .filter((item) => this.eligible(item) && !this.excluded().includes(item.id));
  }
  pageSelected() {
    return (
      this.available().length > 0 &&
      this.available().every((item) => this.selected().includes(item.id))
    );
  }
  pagePartlySelected() {
    return (
      !this.pageSelected() && this.available().some((item) => this.selected().includes(item.id))
    );
  }
  togglePage() {
    if (this.blocked() || this.list.state.busy()) return;
    const available = this.available();
    if (this.pageSelected()) {
      const ids = new Set(available.map((item) => item.id));
      this.changed.emit(this.selected().filter((id) => !ids.has(id)));
    } else {
      const ids = [...this.selected()];
      for (const item of available) {
        if (!ids.includes(item.id) && ids.length < this.limit()) {
          ids.push(item.id);
          this.names.set(item.id, `${item.humanId} · ${item.title}`);
        }
      }
      this.changed.emit(ids);
    }
  }
  choose(item: TestCase) {
    if (this.blocked() || !this.eligible(item) || this.excluded().includes(item.id)) return;
    if (this.single()) {
      if (!this.selected().includes(item.id) && this.selected().length < this.limit())
        this.added.emit(item);
      return;
    }
    if (this.selected().includes(item.id)) this.remove(item.id);
    else if (this.selected().length < this.limit()) {
      this.names.set(item.id, `${item.humanId} · ${item.title}`);
      this.changed.emit([...this.selected(), item.id]);
    }
  }
  remove(id: string) {
    if (!this.blocked()) this.changed.emit(this.selected().filter((value) => value !== id));
  }
}
