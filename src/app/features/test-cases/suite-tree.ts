import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RepositorySummary, TestSuite } from './test-case.models';

export function repositoryCounts(summary: RepositorySummary | null, suites: TestSuite[]) {
  const direct = new Map<string | null, number>();
  const branches = new Map<string, number>();
  const byId = new Map(suites.map((suite) => [suite.id, suite]));
  for (const group of summary?.suites ?? []) {
    direct.set(group.suiteId, group.totalCases);
    let id = group.suiteId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      branches.set(id, (branches.get(id) ?? 0) + group.totalCases);
      id = byId.get(id)?.parentSuiteId ?? null;
    }
  }
  return { direct, branches };
}
@Component({
  selector: 'app-suite-tree',
  imports: [FormsModule],
  template: `<nav class="suite-tree" aria-label="Navegar pelas suítes">
    <div class="suite-tree-heading">
      <h2>Suítes</h2>
      @if (canCreate()) {
        <button class="btn" type="button" [disabled]="disabled()" (click)="create.emit()">
          + Suíte
        </button>
      }
    </div>
    <label class="sr-only" for="suite-search">Buscar suíte</label>
    <input
      id="suite-search"
      class="suite-search"
      placeholder="Buscar suíte"
      [ngModel]="term()"
      (ngModelChange)="term.set($event)"
    />
    <div class="suite-tree-tools">
      <button type="button" (click)="expandAll()" aria-label="Expandir todas as suítes">
        Expandir
      </button>
      <button type="button" (click)="collapseAll()" aria-label="Recolher todas as suítes">
        Recolher
      </button>
    </div>
    <button
      class="suite-choice"
      type="button"
      [class.active]="selectedId() === ''"
      [attr.aria-current]="selectedId() === '' ? 'true' : null"
      [disabled]="selectionDisabled()"
      (click)="selected.emit('')"
    >
      <span>Todos os casos</span><span class="suite-count">{{ summary()?.totalCases ?? '—' }}</span>
    </button>
    <button
      class="suite-choice"
      type="button"
      [class.active]="selectedId() === 'root'"
      [attr.aria-current]="selectedId() === 'root' ? 'true' : null"
      [disabled]="selectionDisabled()"
      (click)="selected.emit('root')"
    >
      <span>Sem suíte</span><span class="suite-count">{{ count(null) }}</span>
    </button>
    <div class="suite-tree-items">
      @for (row of rows(); track row.suite.id) {
        <div class="suite-tree-row" [style.padding-inline-start.px]="row.depth * 16">
          @if (row.hasChildren) {
            <button
              class="suite-disclosure"
              type="button"
              [attr.aria-expanded]="!collapsed().has(row.suite.id) || !!term()"
              [attr.aria-label]="
                (collapsed().has(row.suite.id) ? 'Expandir ' : 'Recolher ') + row.suite.name
              "
              (click)="toggle(row.suite.id)"
            >
              {{ collapsed().has(row.suite.id) && !term() ? '›' : '⌄' }}
            </button>
          } @else {
            <span class="suite-disclosure" aria-hidden="true"></span>
          }
          <button
            type="button"
            class="suite-choice"
            [class.active]="selectedId() === row.suite.id"
            [class.archived]="!!row.suite.archivedAt"
            [disabled]="selectionDisabled()"
            [attr.aria-current]="selectedId() === row.suite.id ? 'true' : null"
            [title]="countTitle(row.suite)"
            (click)="selected.emit(row.suite.id)"
          >
            <svg class="suite-folder" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 6h7l2 2h9v12H3z" />
            </svg>
            <span class="suite-choice-name"
              >{{ row.suite.name }}
              @if (row.suite.archivedAt) {
                <small>(arquivada)</small>
              }
            </span>
            <span class="suite-count">{{ branchCount(row.suite.id) }}</span>
          </button>
        </div>
      } @empty {
        @if (!busy()) {
          <p class="suite-empty">
            {{
              term()
                ? 'Nenhuma suíte encontrada.'
                : 'Crie a primeira suíte para organizar seus casos.'
            }}
          </p>
        }
      }
    </div>
    @if (busy()) {
      <p class="suite-empty" role="status">Carregando suítes…</p>
    }
    <p class="suite-tree-hint">Os números incluem as subsuítes.</p>
  </nav>`,
})
export class SuiteTree {
  readonly suites = input.required<TestSuite[]>();
  readonly summary = input<RepositorySummary | null>(null);
  readonly selectedId = input('');
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly selectionDisabled = input(false);
  readonly canCreate = input(false);
  readonly selected = output<string>();
  readonly create = output<void>();
  readonly term = signal('');
  readonly collapsed = signal(new Set<string>());
  readonly counts = computed(() => repositoryCounts(this.summary(), this.suites()));
  readonly rows = computed(() => {
    const suites = this.suites();
    const byId = new Map(suites.map((suite) => [suite.id, suite]));
    const children = new Map<string | null, TestSuite[]>();
    for (const suite of suites) {
      const parent =
        suite.parentSuiteId && byId.has(suite.parentSuiteId) ? suite.parentSuiteId : null;
      children.set(parent, [...(children.get(parent) ?? []), suite]);
    }
    for (const siblings of children.values())
      siblings.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const term = this.term().trim().toLocaleLowerCase('pt-BR');
    const matches = new Set<string>();
    if (term)
      for (const suite of suites) {
        if (!suite.name.toLocaleLowerCase('pt-BR').includes(term)) continue;
        let current: TestSuite | undefined = suite;
        const seen = new Set<string>();
        while (current && !seen.has(current.id)) {
          seen.add(current.id);
          matches.add(current.id);
          current = current.parentSuiteId ? byId.get(current.parentSuiteId) : undefined;
        }
      }
    const rows: { suite: TestSuite; depth: number; hasChildren: boolean }[] = [];
    const visited = new Set<string>();
    const stack = (children.get(null) ?? []).map((suite) => ({ suite, depth: 0 })).reverse();
    while (stack.length) {
      const row = stack.pop()!;
      if (visited.has(row.suite.id)) continue;
      visited.add(row.suite.id);
      if (term && !matches.has(row.suite.id)) continue;
      const descendants = children.get(row.suite.id) ?? [];
      rows.push({ ...row, hasChildren: descendants.length > 0 });
      if (!this.collapsed().has(row.suite.id) || term)
        for (const suite of [...descendants].reverse()) stack.push({ suite, depth: row.depth + 1 });
    }
    return rows;
  });
  count(id: string | null) {
    return this.summary() ? (this.counts().direct.get(id) ?? 0) : '—';
  }
  branchCount(id: string) {
    return this.summary() ? (this.counts().branches.get(id) ?? 0) : '—';
  }
  countTitle(suite: TestSuite) {
    return `${this.count(suite.id)} nesta suíte · ${this.branchCount(suite.id)} incluindo subsuítes`;
  }
  toggle(id: string) {
    const next = new Set(this.collapsed());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.collapsed.set(next);
  }
  expandAll() {
    this.collapsed.set(new Set());
  }
  collapseAll() {
    this.collapsed.set(new Set(this.suites().map((suite) => suite.id)));
  }
}
