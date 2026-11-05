import { Component, ElementRef, computed, input, signal, inject, viewChild } from '@angular/core';
import {
  FormsModule,
  FormGroup,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { fieldError, trimmedLength } from '../../shared/form-feedback';
import { FormDialog, EditorField } from '../workspaces/ui/form-dialog';
import { PaginationControls } from '../workspaces/ui/list-tools';
import { Pagination } from '../workspaces/workspace.models';
import { GovernanceApi } from './governance-api.service';
import { GovernanceSession } from './governance-session';
import { GovernanceConflict } from './governance-conflict';
import {
  Section,
  Control,
  SectionBody,
  ControlBody,
  sectionPath,
  sectionDescendants,
  validSectionMove,
} from './governance.models';
import { codeField, textField, descriptionField, fieldFailure } from './governance-fields';
import { SectionTree } from './section-tree';
import { WorkspaceContext } from '../../core/workspace-context.service';
export function localPagination(total: number, page: number): Pagination {
  return {
    page,
    size: 20,
    totalItems: total,
    totalPages: Math.ceil(total / 20),
    hasNext: page * 20 < total,
    hasPrevious: page > 1,
  };
}
interface DefinitionEditor {
  kind: 'section' | 'control' | 'move-control';
  id: string | null;
  title: string;
  fields: EditorField[];
}
@Component({
  selector: 'app-framework-definition',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    FormDialog,
    PaginationControls,
    GovernanceConflict,
    SectionTree,
  ],
  templateUrl: './framework-definition.html',
})
export class FrameworkDefinition {
  readonly session = input.required<GovernanceSession>();
  private readonly api = inject(GovernanceApi);
  private readonly workspace = inject(WorkspaceContext);
  readonly editor = signal<DefinitionEditor | null>(null);
  readonly controlPage = signal(1);
  readonly path = sectionPath;
  readonly selectedId = signal('');
  readonly selectedSection = computed(
    () =>
      this.session()
        .view()
        .sections.find((s) => s.id === this.selectedId()) ?? null,
  );
  readonly directCount = computed(
    () =>
      this.session()
        .view()
        .controls.filter((c) => c.sectionId === this.selectedId()).length,
  );
  readonly branchCount = computed(() => {
    const ids = sectionDescendants(this.selectedId(), this.session().view().sections);
    return this.session()
      .view()
      .controls.filter((c) => ids.has(c.sectionId)).length;
  });
  readonly quickForm = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Z0-9_.-]{1,50}$/)],
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, trimmedLength(1, 250), Validators.maxLength(250)],
    }),
  });
  private readonly quickCode = viewChild<ElementRef<HTMLInputElement>>('quickCode');
  includeDescendants = true;
  controlQuery = '';
  activeFilter = '';
  showQuickCreate() {
    return (
      this.session().can('governance.manage') &&
      this.workspace.selected()?.status === 'ACTIVE' &&
      this.session().framework().status !== 'ARCHIVED'
    );
  }
  canAddSection(parent: string | null) {
    return (
      this.session().view().sections.length < 500 &&
      validSectionMove(null, parent, this.session().view().sections)
    );
  }
  canEdit() {
    return this.session().manageable() && this.session().framework().status !== 'ARCHIVED';
  }
  selectSection(id: string) {
    if (this.session().locked() || this.editor()) return;
    this.selectedId.set(id);
    this.controlPage.set(1);
  }
  controls() {
    const q = this.controlQuery.trim().toLocaleLowerCase();
    const selected = this.selectedSection();
    const ids = selected
      ? this.includeDescendants
        ? sectionDescendants(selected.id, this.session().view().sections)
        : new Set([selected.id])
      : null;
    return this.session()
      .view()
      .controls.filter(
        (c) =>
          `${c.code} ${c.title}`.toLocaleLowerCase().includes(q) &&
          (!ids || ids.has(c.sectionId)) &&
          (!this.activeFilter || String(c.active) === this.activeFilter),
      );
  }
  controlPagination() {
    return localPagination(this.controls().length, this.controlPage());
  }
  visibleControls() {
    return this.controls().slice((this.controlPage() - 1) * 20, this.controlPage() * 20);
  }
  openSection(section?: Section, parentId: string | null = null) {
    if (!this.canEdit() || (!section && this.session().view().sections.length >= 500)) return;
    if (!section && !this.canAddSection(parentId)) return;
    const rows = this.session().view().sections,
      excluded = section ? sectionDescendants(section.id, rows) : new Set<string>();
    this.session().state.error.set('');
    this.editor.set({
      kind: 'section',
      id: section?.id ?? null,
      title: section ? 'Editar / mover seção' : 'Criar seção',
      fields: [
        codeField(section?.code),
        textField('name', 'Nome', 100, section?.name, true),
        descriptionField(section?.description),
        {
          key: 'parentSectionId',
          label: 'Seção superior',
          type: 'select',
          value: section ? (section.parentSectionId ?? '') : (parentId ?? ''),
          options: [
            { value: '', label: 'Raiz' },
            ...rows
              .filter((s) => !excluded.has(s.id))
              .map((s) => ({
                value: s.id,
                label: sectionPath(s.id, rows),
                disabled: !validSectionMove(section?.id ?? null, s.id, rows),
              })),
          ],
        },
        {
          key: 'position',
          label: 'Posição',
          type: 'number',
          required: true,
          min: 1,
          max: 1000000,
          value:
            section?.position ??
            Math.min(
              1000000,
              Math.max(
                0,
                ...rows.filter((s) => s.parentSectionId === parentId).map((s) => s.position),
              ) + 1,
            ),
        },
      ],
    });
  }
  openControl(control?: Control) {
    if (
      !this.canEdit() ||
      !this.session().view().sections.length ||
      (!control && this.session().view().controls.length >= 1000)
    )
      return;
    this.session().state.error.set('');
    this.editor.set({
      kind: 'control',
      id: control?.id ?? null,
      title: control ? 'Editar controle' : 'Criar controle',
      fields: [
        {
          key: 'sectionId',
          label: 'Seção',
          type: 'select',
          required: true,
          value: control?.sectionId ?? this.selectedSection()?.id ?? '',
          options: [
            { value: '', label: 'Selecione uma seção' },
            ...this.session()
              .view()
              .sections.map((s) => ({
                value: s.id,
                label: sectionPath(s.id, this.session().view().sections),
              })),
          ],
        },
        codeField(control?.code ?? this.quickForm.controls.code.value),
        textField(
          'title',
          'Título',
          250,
          control?.title ?? this.quickForm.controls.title.value,
          true,
        ),
        descriptionField(control?.description),
        {
          key: 'weight',
          label: 'Peso',
          type: 'number',
          required: true,
          min: 1,
          max: 1000,
          value: control?.weight ?? 1,
        },
        {
          key: 'active',
          label: 'Controle ativo',
          type: 'checkbox',
          value: control?.active ?? true,
        },
      ],
    });
  }
  openMove(control: Control) {
    if (!this.canEdit()) return;
    this.session().state.error.set('');
    this.editor.set({
      kind: 'move-control',
      id: control.id,
      title: `Alterar seção de ${control.code}`,
      fields: [
        {
          key: 'sectionId',
          label: 'Seção de destino',
          type: 'select',
          required: true,
          value: control.sectionId,
          options: this.session()
            .view()
            .sections.map((s) => ({
              value: s.id,
              label: sectionPath(s.id, this.session().view().sections),
            })),
        },
      ],
    });
  }
  quickError(key: 'code' | 'title') {
    const control = this.quickForm.controls[key];
    if (control.touched && control.hasError('pattern'))
      return 'Use letras maiúsculas, números, ponto, traço ou sublinhado.';
    if (control.touched && control.hasError('trimmedLength'))
      return 'Informe um título de até 250 caracteres.';
    return fieldError(this.quickForm, key);
  }
  quickCreate() {
    const s = this.session(),
      section = this.selectedSection();
    if (!this.canEdit() || this.editor() || !section || s.view().controls.length >= 1000) return;
    this.quickForm.markAllAsTouched();
    if (this.quickForm.invalid) return;
    const f = s.framework(),
      body: ControlBody = {
        version: f.version,
        sectionId: section.id,
        code: this.quickForm.controls.code.value.trim(),
        title: this.quickForm.controls.title.value.trim(),
        weight: 1,
        active: true,
      };
    s.write(
      this.api.createControl(f.workspaceId, f.id, body),
      body,
      () => {
        this.quickForm.reset();
        this.controlQuery = '';
        this.activeFilter = '';
        this.controlPage.set(1);
        this.quickCode()?.nativeElement.focus();
      },
      this.quickForm,
    );
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    const s = this.session(),
      e = this.editor(),
      v = event.values;
    if (!e || !this.canEdit()) return;
    const f = s.framework(),
      description = v['description'] === '' ? null : String(v['description']);
    if (e.kind === 'move-control') {
      const sectionId = String(v['sectionId']);
      if (!e.id || !s.view().sections.some((r) => r.id === sectionId)) return;
      const body = { version: f.version, sectionId };
      s.write(
        this.api.updateControl(f.workspaceId, f.id, e.id, body),
        body,
        () => {
          this.editor.set(null);
          this.controlPage.set(1);
        },
        event.form,
      );
    } else if (e.kind === 'section') {
      const parent = String(v['parentSectionId'] || '') || null;
      if (!validSectionMove(e.id, parent, s.view().sections)) {
        fieldFailure(
          event.form,
          'parentSectionId',
          'A movimentação cria um ciclo ou excede 20 níveis.',
        );
        return;
      }
      const body: SectionBody = {
        version: f.version,
        code: String(v['code']).trim(),
        name: String(v['name']).trim(),
        description,
        parentSectionId: parent,
        position: Number(v['position']),
      };
      s.write(
        e.id
          ? this.api.updateSection(f.workspaceId, f.id, e.id, body)
          : this.api.createSection(f.workspaceId, f.id, body),
        body,
        () => {
          this.editor.set(null);
          if (!e.id) {
            const created = s.view().sections.find((row) => row.code === body.code);
            if (created) this.selectedId.set(created.id);
          }
          this.controlPage.set(1);
        },
        event.form,
      );
    } else {
      const active = v['active'];
      if (typeof active !== 'boolean') return;
      if (
        f.status === 'ACTIVE' &&
        !active &&
        s.view().controls.find((c) => c.id === e.id)?.active &&
        s.view().controls.filter((c) => c.active).length === 1
      ) {
        fieldFailure(
          event.form,
          'active',
          'O framework ativo precisa manter pelo menos um controle ativo.',
        );
        return;
      }
      const sectionId = String(v['sectionId']);
      if (!s.view().sections.some((r) => r.id === sectionId)) return;
      const body: ControlBody = {
        version: f.version,
        sectionId,
        code: String(v['code']).trim(),
        title: String(v['title']).trim(),
        description,
        weight: Number(v['weight']),
        active,
      };
      s.write(
        e.id
          ? this.api.updateControl(f.workspaceId, f.id, e.id, body)
          : this.api.createControl(f.workspaceId, f.id, body),
        body,
        () => {
          this.editor.set(null);
          this.controlPage.set(1);
          if (!e.id) {
            this.quickForm.reset();
            this.selectedId.set(sectionId);
            this.controlQuery = '';
            this.activeFilter = '';
          }
        },
        event.form,
      );
    }
  }
}
