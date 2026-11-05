import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Project, canChange } from '../projects/project.models';
import { DetailDialog } from '../projects/detail-dialog';
import { FormDialog, EditorField, nameField } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { OperationState } from '../workspaces/workspace-feedback';
import { TestCaseApi } from './test-case-api.service';
import { TestSuite, payloadFits, suiteDescendants, suiteLabel } from './test-case.models';

@Component({
  selector: 'app-suite-panel',
  imports: [FormDialog, ConfirmDialog, DetailDialog],
  template: `<section aria-label="Suítes de teste">
    <div class="section-heading">
      @if (!compact()) {
        <h2>Suítes</h2>
        <button class="btn" type="button" [disabled]="disabled()" (click)="refresh.emit()">
          Atualizar suítes
        </button>
      }
      @if (can('testcase.create')) {
        <button class="btn" type="button" [disabled]="disabled()" (click)="edit()">
          {{ compact() ? (parentSuiteId() ? '+ Nova subsuíte' : '+ Nova suíte') : 'Criar suíte' }}
        </button>
      }
      @if (compact() && currentSuite(); as suite) {
        <details class="suite-action-menu">
          <summary class="btn">Ações da suíte</summary>
          <div class="suite-action-options">
            <button class="btn" type="button" [disabled]="disabled()" (click)="consult(suite)">
              Consultar suíte
            </button>
            @if (!suite.archivedAt && can('testcase.update')) {
              <button class="btn" type="button" [disabled]="disabled()" (click)="edit(suite)">
                Editar suíte
              </button>
              <button class="btn" type="button" [disabled]="disabled()" (click)="move(suite)">
                Mover suíte
              </button>
            }
            @if (!suite.archivedAt && can('testcase.archive')) {
              <button
                class="btn"
                type="button"
                [disabled]="disabled()"
                (click)="confirmArchive(suite)"
              >
                Arquivar suíte
              </button>
            }
          </div>
        </details>
      }
    </div>
    @if (state.error() && !editor() && !archiving()) {
      <p class="message error" role="alert">{{ state.error() }}</p>
    }
    @if (state.success()) {
      <p class="message success" role="status">{{ state.success() }}</p>
    }
    @if (!compact()) {
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Suíte / caminho</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            @for (suite of suites(); track suite.id) {
              <tr>
                <td>{{ label(suite) }}</td>
                <td>{{ suite.archivedAt ? 'Arquivada' : 'Ativa' }}</td>
                <td class="table-actions">
                  <button
                    class="btn"
                    type="button"
                    [disabled]="disabled()"
                    (click)="consult(suite)"
                  >
                    Consultar
                  </button>
                  <button class="btn" type="button" (click)="selected.emit(suite.id)">
                    Ver casos
                  </button>
                  @if (!suite.archivedAt) {
                    @if (can('testcase.update')) {
                      <button
                        class="btn"
                        type="button"
                        [disabled]="disabled()"
                        (click)="edit(suite)"
                      >
                        Editar
                      </button>
                      <button
                        class="btn"
                        type="button"
                        [disabled]="disabled()"
                        (click)="move(suite)"
                      >
                        Mover
                      </button>
                      <button
                        class="btn"
                        type="button"
                        [disabled]="disabled() || !canOrder(suite, -1)"
                        [attr.aria-label]="'Subir suíte ' + suite.name"
                        (click)="order(suite, -1)"
                      >
                        ↑
                      </button>
                      <button
                        class="btn"
                        type="button"
                        [disabled]="disabled() || !canOrder(suite, 1)"
                        [attr.aria-label]="'Descer suíte ' + suite.name"
                        (click)="order(suite, 1)"
                      >
                        ↓
                      </button>
                    }
                    @if (can('testcase.archive')) {
                      <button
                        class="btn"
                        type="button"
                        [disabled]="disabled()"
                        (click)="confirmArchive(suite)"
                      >
                        Arquivar
                      </button>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (!suites().length) {
        <p>Nenhuma suíte neste projeto. Casos podem ficar na raiz.</p>
      }
    }
    @if (editor(); as dialog) {
      <app-form-dialog
        [title]="dialog.title"
        [fields]="dialog.fields"
        [state]="state"
        (saved)="save($event)"
        (closed)="editor.set(null)"
      />
    }
    @if (archiving(); as suite) {
      <app-confirm-dialog
        title="Arquivar suíte"
        [message]="
          'Arquivar ' +
          suite.name +
          '? A suíte deve estar sem filhos ou casos não arquivados. Não há restauração de suíte.'
        "
        [state]="state"
        (confirmed)="archive(suite)"
        (closed)="archiving.set(null)"
      />
    }
    @if (details(); as suite) {
      <app-detail-dialog
        [title]="suite.name"
        [fields]="detailFields(suite)"
        (closed)="details.set(null)"
      />
    }
  </section>`,
})
export class SuitePanel {
  readonly project = input.required<Project>();
  readonly suites = input.required<TestSuite[]>();
  readonly loading = input(false);
  readonly compact = input(false);
  readonly parentSuiteId = input<string | null>(null);
  readonly selectedSuiteId = input('');
  readonly changed = output<void>();
  readonly selected = output<string>();
  readonly refresh = output<void>();
  private readonly api = inject(TestCaseApi);
  readonly state = new OperationState(inject(DestroyRef));
  readonly editor = signal<{
    title: string;
    fields: EditorField[];
    mode: 'create' | 'edit' | 'move';
    suite?: TestSuite;
  } | null>(null);
  readonly archiving = signal<TestSuite | null>(null);
  readonly details = signal<TestSuite | null>(null);
  can(permission: string) {
    return canChange(this.project(), permission);
  }
  disabled() {
    return this.state.busy() || !!this.state.wait() || this.loading();
  }
  label(suite: TestSuite) {
    return suiteLabel(suite, this.suites());
  }
  private destinations(exclude?: string): EditorField['options'] {
    const excluded = exclude ? suiteDescendants(exclude, this.suites()) : new Set<string>();
    return [
      { value: '', label: 'Raiz' },
      ...this.suites()
        .filter((suite) => !suite.archivedAt && !excluded.has(suite.id))
        .map((suite) => ({ value: suite.id, label: this.label(suite) })),
    ];
  }
  currentSuite() {
    return this.suites().find((suite) => suite.id === this.selectedSuiteId());
  }
  edit(suite?: TestSuite, parentSuiteId = this.parentSuiteId()) {
    if (
      this.disabled() ||
      !this.can(suite ? 'testcase.update' : 'testcase.create') ||
      suite?.archivedAt
    )
      return;
    this.state.error.set('');
    const fields: EditorField[] = [
      nameField(suite?.name),
      {
        key: 'description',
        label: 'Descrição',
        type: 'textarea',
        max: 10000,
        value: suite?.description ?? '',
      },
    ];
    if (!suite)
      fields.push({
        key: 'parentSuiteId',
        label: 'Suíte pai',
        type: 'select',
        value: parentSuiteId ?? '',
        options: this.destinations(),
      });
    this.editor.set({
      title: suite ? 'Editar suíte' : 'Criar suíte',
      fields,
      mode: suite ? 'edit' : 'create',
      suite,
    });
  }
  move(suite: TestSuite) {
    if (this.disabled() || !this.can('testcase.update') || suite.archivedAt) return;
    this.state.error.set('');
    this.editor.set({
      title: 'Mover suíte',
      mode: 'move',
      suite,
      fields: [
        {
          key: 'parentSuiteId',
          label: 'Suíte pai de destino',
          type: 'select',
          value: suite.parentSuiteId ?? '',
          options: this.destinations(suite.id),
          hint: 'A suíte será colocada ao final dos irmãos de destino.',
        },
      ],
    });
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    const dialog = this.editor(),
      p = this.project();
    if (
      !dialog ||
      !this.can(dialog.mode === 'create' ? 'testcase.create' : 'testcase.update') ||
      this.loading()
    )
      return;
    const parentSuiteId = String(event.values['parentSuiteId'] ?? '') || null;
    const body = {
      name: String(event.values['name'] ?? '').trim(),
      description: String(event.values['description'] ?? '') || null,
    };
    if (
      !payloadFits(
        dialog.mode === 'move'
          ? { parentSuiteId }
          : { ...body, ...(dialog.mode === 'create' ? { parentSuiteId } : {}) },
      )
    ) {
      this.state.error.set('O conteúdo excede 32 KiB. Reduza a descrição.');
      return;
    }
    const request =
      dialog.mode === 'create'
        ? this.api.createSuite(p.workspaceId, p.id, { ...body, parentSuiteId })
        : dialog.mode === 'edit'
          ? this.api.updateSuite(p.workspaceId, p.id, dialog.suite!.id, body)
          : this.api.moveSuite(p.workspaceId, p.id, dialog.suite!.id, { parentSuiteId });
    this.state.run(
      request,
      () => {
        this.editor.set(null);
        this.state.success.set('Suíte salva.');
        this.changed.emit();
      },
      event.form,
    );
  }
  private siblings(suite: TestSuite) {
    return this.suites()
      .filter((item) => !item.archivedAt && item.parentSuiteId === suite.parentSuiteId)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }
  canOrder(suite: TestSuite, delta: number) {
    const rows = this.siblings(suite),
      index = rows.findIndex((item) => item.id === suite.id);
    return index >= 0 && index + delta >= 0 && index + delta < rows.length;
  }
  order(suite: TestSuite, delta: number) {
    if (
      this.disabled() ||
      !this.can('testcase.update') ||
      suite.archivedAt ||
      !this.canOrder(suite, delta)
    )
      return;
    const rows = this.siblings(suite),
      index = rows.findIndex((item) => item.id === suite.id);
    [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
    const ids = rows.map((item) => item.id),
      p = this.project();
    if (!payloadFits({ parentSuiteId: suite.parentSuiteId, ids })) {
      this.state.error.set('A ordem excede 32 KiB. Mova a suíte individualmente.');
      return;
    }
    this.state.run(this.api.orderSuites(p.workspaceId, p.id, suite.parentSuiteId, ids), () => {
      this.state.success.set('Ordem das suítes atualizada.');
      this.changed.emit();
    });
  }
  confirmArchive(suite: TestSuite) {
    if (!this.disabled() && this.can('testcase.archive') && !suite.archivedAt) {
      this.state.error.set('');
      this.archiving.set(suite);
    }
  }
  archive(suite: TestSuite) {
    const p = this.project();
    if (!this.can('testcase.archive') || suite.archivedAt) return;
    this.state.run(this.api.archiveSuite(p.workspaceId, p.id, suite.id), () => {
      this.archiving.set(null);
      this.state.success.set('Suíte arquivada.');
      this.changed.emit();
    });
  }
  consult(suite: TestSuite) {
    const p = this.project();
    if (this.disabled()) return;
    this.state.run(this.api.suite(p.workspaceId, p.id, suite.id), (response) =>
      this.details.set(response.data),
    );
  }
  detailFields(suite: TestSuite) {
    return [
      { label: 'Caminho', value: this.label(suite) },
      { label: 'Descrição', value: suite.description || '—' },
      { label: 'Posição entre irmãos', value: String(suite.position) },
      {
        label: 'Criada em',
        value: new Date(suite.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      },
    ];
  }
}
