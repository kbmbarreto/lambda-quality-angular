import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Control, Section } from './governance.models';
import { FrameworkProgress, progressLabel } from './framework-progress.models';

@Component({
  selector: 'app-section-tree',
  imports: [FormsModule],
  template: `<nav class="suite-tree" aria-label="Navegar pelas seções do framework">
    <div class="suite-tree-heading">
      <h2>Seções</h2>
      @if (canCreate()) {
        <button
          class="btn"
          type="button"
          [disabled]="sections().length >= 500"
          (click)="create.emit()"
        >
          + Seção
        </button>
      }
    </div>
    <label class="sr-only" for="framework-section-search">Buscar seção</label>
    <input
      id="framework-section-search"
      class="suite-search"
      placeholder="Buscar código ou nome de seção"
      maxlength="100"
      [ngModel]="term()"
      (ngModelChange)="term.set($event)"
    />
    <div class="suite-tree-tools">
      <button type="button" (click)="collapsed.set(empty)" aria-label="Expandir todas as seções">
        Expandir
      </button>
      <button type="button" (click)="collapseAll()" aria-label="Recolher todas as seções">
        Recolher
      </button>
    </div>
    <button
      class="suite-choice"
      type="button"
      [class.active]="!selectedId()"
      [attr.aria-current]="!selectedId() ? 'true' : null"
      [disabled]="disabled()"
      (click)="selected.emit('')"
    >
      <span>Todos os controles</span><span class="suite-count">{{ controls().length }}</span>
    </button>
    <div class="suite-tree-items">
      @for (row of rows(); track row.section.id) {
        <div class="suite-tree-row" [style.padding-inline-start.px]="row.depth * 16">
          @if (row.hasChildren) {
            <button
              class="suite-disclosure"
              type="button"
              [attr.aria-expanded]="!collapsed().has(row.section.id) || !!term().trim()"
              [attr.aria-label]="
                (collapsed().has(row.section.id) && !term().trim() ? 'Expandir ' : 'Recolher ') +
                row.section.name
              "
              (click)="toggle(row.section.id)"
            >
              {{ collapsed().has(row.section.id) && !term().trim() ? '›' : '⌄' }}
            </button>
          } @else {
            <span class="suite-disclosure" aria-hidden="true"></span>
          }
          <button
            class="suite-choice"
            type="button"
            [class.active]="selectedId() === row.section.id"
            [attr.aria-current]="selectedId() === row.section.id ? 'true' : null"
            [disabled]="disabled()"
            [title]="
              row.section.code +
              ' · ' +
              row.section.name +
              ' · ' +
              (counts().direct.get(row.section.id) ?? 0) +
              ' nesta seção · ' +
              (counts().branches.get(row.section.id) ?? 0) +
              ' incluindo subseções'
            "
            (click)="selected.emit(row.section.id)"
          >
            <svg class="suite-folder" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 6h7l2 2h9v12H3z" />
            </svg>
            <span class="suite-choice-name"
              ><small class="framework-section-code">{{ row.section.code }}</small
              >{{ row.section.name }}
              @if (summary(row.section.id); as result) {
                <small class="section-progress-label"
                  >{{ label(result.subtree) }} · {{ result.subtree.counts.MET }}/{{
                    result.subtree.applicableControls
                  }}
                  atendidos</small
                >
                @if (result.subtree.index.value != null) {
                  <span class="dashboard-progress section-progress" aria-hidden="true"
                    ><span [style.width.%]="result.subtree.index.value"></span
                  ></span>
                }
              }
            </span>
            <span class="suite-count">{{ counts().branches.get(row.section.id) ?? 0 }}</span>
          </button>
        </div>
      } @empty {
        <p class="suite-empty">
          {{
            term().trim()
              ? 'Nenhuma seção encontrada.'
              : 'Crie a primeira seção para organizar seus controles.'
          }}
        </p>
      }
    </div>
    <p class="suite-tree-hint">
      {{
        progress()
          ? 'Progresso inclui subseções da avaliação selecionada.'
          : 'Contagens incluem subseções e controles ativos e inativos.'
      }}
    </p>
  </nav>`,
})
export class SectionTree {
  readonly sections =
    input.required<Pick<Section, 'id' | 'parentSectionId' | 'code' | 'name' | 'position'>[]>();
  readonly controls = input.required<Pick<Control, 'sectionId'>[]>();
  readonly progress = input<FrameworkProgress | null>(null);
  readonly label = progressLabel;
  summary(id: string) {
    return this.progress()?.sections.find((section) => section.id === id);
  }
  readonly selectedId = input('');
  readonly disabled = input(false);
  readonly canCreate = input(false);
  readonly selected = output<string>();
  readonly create = output<void>();
  readonly term = signal('');
  readonly collapsed = signal(new Set<string>());
  readonly empty = new Set<string>();
  readonly counts = computed(() => {
    const byId = new Map(this.sections().map((s) => [s.id, s]));
    const direct = new Map<string, number>(),
      branches = new Map<string, number>();
    for (const control of this.controls()) {
      direct.set(control.sectionId, (direct.get(control.sectionId) ?? 0) + 1);
      let id: string | null = control.sectionId;
      const seen = new Set<string>();
      while (id && !seen.has(id)) {
        seen.add(id);
        branches.set(id, (branches.get(id) ?? 0) + 1);
        id = byId.get(id)?.parentSectionId ?? null;
      }
    }
    return { direct, branches };
  });
  readonly rows = computed(() => {
    const sections = this.sections(),
      byId = new Map(sections.map((s) => [s.id, s]));
    const children = new Map<string | null, (typeof sections)[number][]>();
    for (const section of sections) {
      const parent =
        section.parentSectionId && byId.has(section.parentSectionId)
          ? section.parentSectionId
          : null;
      children.set(parent, [...(children.get(parent) ?? []), section]);
    }
    for (const siblings of children.values())
      siblings.sort((a, b) => a.position - b.position || a.code.localeCompare(b.code));
    const term = this.term().trim().toLocaleLowerCase('pt-BR'),
      matches = new Set<string>();
    if (term)
      for (const section of sections) {
        if (!`${section.code} ${section.name}`.toLocaleLowerCase('pt-BR').includes(term)) continue;
        let current: (typeof sections)[number] | undefined = section;
        const seen = new Set<string>();
        while (current && !seen.has(current.id)) {
          seen.add(current.id);
          matches.add(current.id);
          current = current.parentSectionId ? byId.get(current.parentSectionId) : undefined;
        }
      }
    const rows: { section: (typeof sections)[number]; depth: number; hasChildren: boolean }[] = [],
      visited = new Set<string>();
    const stack = (children.get(null) ?? []).map((section) => ({ section, depth: 0 })).reverse();
    while (stack.length) {
      const row = stack.pop()!;
      if (visited.has(row.section.id)) continue;
      visited.add(row.section.id);
      if (term && !matches.has(row.section.id)) continue;
      const descendants = children.get(row.section.id) ?? [];
      rows.push({ ...row, hasChildren: !!descendants.length });
      if (!this.collapsed().has(row.section.id) || term)
        for (const section of [...descendants].reverse())
          stack.push({ section, depth: row.depth + 1 });
    }
    return rows;
  });
  toggle(id: string) {
    const next = new Set(this.collapsed());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.collapsed.set(next);
  }
  collapseAll() {
    this.collapsed.set(new Set(this.sections().map((s) => s.id)));
  }
}
