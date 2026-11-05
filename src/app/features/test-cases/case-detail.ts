import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiResponse } from '../../core/api.models';
import { problemOf } from '../../core/api-error';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Project, canChange } from '../projects/project.models';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Attachment, CustomField, Tag } from '../workspaces/workspace.models';
import { FormDialog, EditorField } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { OperationState } from '../workspaces/workspace-feedback';
import { CaseEditor, CaseEditorMode, EditorResult } from './case-editor';
import { CaseConflict } from './case-conflict';
import { TestCaseApi } from './test-case-api.service';
import {
  TestCase,
  TestStep,
  TestSuite,
  caseOptions,
  payloadFits,
  suiteLabel,
} from './test-case.models';

export class CaseOperation extends OperationState {
  readonly conflict = signal(false);
  override fail(error: unknown, form?: FormGroup) {
    if (problemOf(error).code === 'TEST_CASE_VERSION_CONFLICT') this.conflict.set(true);
    super.fail(error, form);
  }
}
@Component({
  selector: 'app-case-detail',
  imports: [DatePipe, CaseEditor, FormDialog, ConfirmDialog, CaseConflict],
  templateUrl: './case-detail.html',
})
export class CaseDetail implements OnInit {
  readonly initial = input.required<TestCase>();
  readonly project = input.required<Project>();
  readonly suites = input.required<TestSuite[]>();
  readonly definitions = input.required<CustomField[]>();
  readonly tags = input.required<Tag[]>();
  readonly attachments = input.required<Attachment[]>();
  readonly resourcesReady = input(true);
  readonly startWithMove = input(false);
  readonly changed = output<TestCase>();
  readonly closed = output<void>();
  readonly workspace = inject(WorkspaceContext);
  private readonly api = inject(TestCaseApi);
  private readonly workspaceApi = inject(WorkspaceApi);
  readonly state = new CaseOperation(inject(DestroyRef));
  readonly readState = new OperationState(inject(DestroyRef));
  readonly item = signal<TestCase | null>(null);
  readonly latest = signal<TestCase | null>(null);
  readonly editor = signal<{ mode: CaseEditorMode; original: TestCase } | null>(null);
  readonly dialog = signal<{
    title: string;
    fields: EditorField[];
    mode: 'move' | 'clone' | 'step' | 'tags' | 'attachments';
    step?: TestStep;
  } | null>(null);
  readonly confirmation = signal<{
    mode: 'archive' | 'removeStep' | 'tags' | 'attachments';
    target?: string;
    title: string;
    message: string;
  } | null>(null);
  readonly labels = caseOptions;
  ngOnInit() {
    this.item.set(this.initial());
    if (this.startWithMove()) this.move();
  }
  can(permission: string) {
    return this.resourcesReady() && canChange(this.project(), permission);
  }
  activeDefinitions() {
    return this.definitions().filter((field) => !field.archivedAt);
  }
  editable() {
    return this.can('testcase.update') && this.item()?.status !== 'ARCHIVED';
  }
  disabled() {
    return (
      this.state.busy() || !!this.state.wait() || this.readState.busy() || !!this.readState.wait()
    );
  }
  suiteName() {
    const suite = this.suites().find((entry) => entry.id === this.item()?.suiteId);
    return suite ? suiteLabel(suite, this.suites()) : this.item()?.suiteId || 'Sem suíte (raiz)';
  }
  tagName(id: string) {
    return this.tags().find((tag) => tag.id === id)?.name ?? id;
  }
  attachmentName(id: string) {
    return this.attachments().find((attachment) => attachment.id === id)?.originalName ?? id;
  }
  fieldName(id: string) {
    return this.definitions().find((field) => field.id === id)?.name ?? id;
  }
  fieldLabel(fieldId: string, value: string | number | boolean | null) {
    const definition = this.definitions().find((field) => field.id === fieldId);
    return definition?.type === 'SINGLE_SELECT'
      ? (definition.options.find((option) => option.id === value)?.label ?? String(value))
      : value === null
        ? '—'
        : value === true
          ? 'Sim'
          : value === false
            ? 'Não'
            : String(value);
  }
  private begin() {
    this.state.error.set('');
    this.state.success.set('');
  }
  edit(mode: CaseEditorMode) {
    const item = this.item();
    if (
      !item ||
      this.disabled() ||
      (mode === 'restore'
        ? !this.can('testcase.archive') || item.status !== 'ARCHIVED'
        : !this.editable()) ||
      (mode === 'fields' && !this.workspace.can('field.read'))
    )
      return;
    this.begin();
    this.editor.set({ mode, original: item });
  }
  private mutate(request: Observable<ApiResponse<TestCase>>, form?: FormGroup, body?: unknown) {
    if (this.state.conflict() || this.readState.busy() || this.readState.wait()) return;
    if (body !== undefined && !payloadFits(body)) {
      this.state.error.set('O conteúdo excede 32 KiB. Reduza os textos ou divida as alterações.');
      return;
    }
    this.state.run(
      request,
      (response) => {
        this.item.set(response.data);
        this.editor.set(null);
        this.dialog.set(null);
        this.confirmation.set(null);
        this.state.success.set('Caso atualizado.');
        this.changed.emit(response.data);
      },
      form,
    );
  }
  saveEditor(result: EditorResult) {
    const editor = this.editor(),
      item = this.item(),
      p = this.project();
    if (!editor || !item || this.state.conflict()) return;
    if (editor.mode === 'restore') {
      if (!this.can('testcase.archive') || item.status !== 'ARCHIVED') return;
      const body = {
        version: item.version,
        status: result.definition.status,
        suiteId: result.suiteId,
        ...(this.workspace.can('field.read') ? { customFields: result.customFields } : {}),
      };
      this.mutate(this.api.restore(p.workspaceId, p.id, item.id, body), result.form, body);
    } else if (editor.mode === 'fields') {
      if (!this.editable() || !this.workspace.can('field.read')) return;
      this.mutate(
        this.api.fields(p.workspaceId, p.id, item.id, item.version, result.customFields),
        result.form,
        { version: item.version, customFields: result.customFields },
      );
    } else {
      if (!this.editable()) return;
      const body = {
        ...result.definition,
        version: item.version,
        ...(this.workspace.can('field.read') ? { customFields: result.customFields } : {}),
      };
      this.mutate(this.api.update(p.workspaceId, p.id, item.id, body), result.form, body);
    }
  }
  destinations(): EditorField {
    return {
      key: 'suiteId',
      label: 'Suíte de destino',
      type: 'select',
      value: this.suites().some((suite) => !suite.archivedAt && suite.id === this.item()?.suiteId)
        ? this.item()?.suiteId
        : '',
      options: [
        { value: '', label: 'Sem suíte (raiz)' },
        ...this.suites()
          .filter((suite) => !suite.archivedAt)
          .map((suite) => ({ value: suite.id, label: suiteLabel(suite, this.suites()) })),
      ],
    };
  }
  move() {
    if (!this.editable() || this.disabled()) return;
    this.begin();
    this.dialog.set({ title: 'Mover caso', mode: 'move', fields: [this.destinations()] });
  }
  clone() {
    const item = this.item();
    if (
      !item ||
      this.disabled() ||
      !this.can('testcase.create') ||
      !this.project().permissions.includes('testcase.read') ||
      (item.attachmentIds.length > 0 && !this.workspace.can('attachment.read'))
    )
      return;
    this.begin();
    this.dialog.set({
      title: 'Clonar caso',
      mode: 'clone',
      fields: [
        { key: 'title', label: 'Título da cópia', value: item.title, required: true, max: 250 },
        this.destinations(),
      ],
    });
  }
  editStep(step?: TestStep) {
    if (!this.editable() || this.disabled() || (!step && (this.item()?.steps.length ?? 0) >= 1000))
      return;
    this.begin();
    this.dialog.set({
      title: step ? 'Editar passo' : 'Adicionar passo',
      mode: 'step',
      step,
      fields: [
        {
          key: 'action',
          label: 'Ação',
          type: 'textarea',
          value: step?.action ?? '',
          required: true,
          max: 10000,
        },
        {
          key: 'testData',
          label: 'Dados de teste',
          type: 'textarea',
          value: step?.testData ?? '',
          max: 10000,
        },
        {
          key: 'expectedResult',
          label: 'Resultado esperado',
          type: 'textarea',
          value: step?.expectedResult ?? '',
          max: 10000,
        },
      ],
    });
  }
  link(kind: 'tags' | 'attachments') {
    const item = this.item();
    if (
      !item ||
      !this.editable() ||
      this.disabled() ||
      (kind === 'attachments' && !this.workspace.can('attachment.read'))
    )
      return;
    const ids = kind === 'tags' ? item.tagIds : item.attachmentIds;
    const available =
      kind === 'tags'
        ? this.tags()
            .filter((tag) => !ids.includes(tag.id))
            .map((tag) => ({ value: tag.id, label: tag.name }))
        : this.attachments()
            .filter((attachment) => !ids.includes(attachment.id))
            .map((attachment) => ({ value: attachment.id, label: attachment.originalName }));
    this.begin();
    const field: EditorField =
      kind === 'tags' && !this.workspace.can('tag.read')
        ? {
            key: 'target',
            label: 'ID da tag',
            required: true,
            pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            hint: 'Use o ID da tag deste Workspace.',
          }
        : {
            key: 'target',
            label: kind === 'tags' ? 'Tag' : 'Anexo da biblioteca',
            type: 'select',
            required: true,
            options: [{ value: '', label: 'Selecione' }, ...available],
          };
    this.dialog.set({
      title: kind === 'tags' ? 'Vincular tag' : 'Vincular anexo',
      mode: kind,
      fields: [field],
    });
  }
  saveDialog(event: { values: Record<string, unknown>; form: FormGroup }) {
    const dialog = this.dialog(),
      item = this.item(),
      p = this.project();
    if (!dialog || !item || this.state.conflict()) return;
    if (dialog.mode === 'clone') {
      if (
        !this.can('testcase.create') ||
        !p.permissions.includes('testcase.read') ||
        (item.attachmentIds.length && !this.workspace.can('attachment.read'))
      )
        return;
      const body = {
        title: String(event.values['title']).trim(),
        suiteId: String(event.values['suiteId']) || null,
      };
      this.mutate(this.api.clone(p.workspaceId, p.id, item.id, body), event.form, body);
    } else {
      if (!this.editable()) return;
      if (dialog.mode === 'move') {
        const suiteId = String(event.values['suiteId']) || null;
        this.mutate(this.api.move(p.workspaceId, p.id, item.id, item.version, suiteId), event.form);
      } else if (dialog.mode === 'step') {
        const body = {
          version: item.version,
          action: String(event.values['action']).trim(),
          testData: String(event.values['testData']) || null,
          expectedResult: String(event.values['expectedResult']) || null,
        };
        if (dialog.step && !item.steps.some((step) => step.id === dialog.step!.id)) {
          this.state.error.set('O passo foi removido. Copie sua edição e adicione um novo passo.');
          return;
        }
        this.mutate(
          dialog.step
            ? this.api.updateStep(p.workspaceId, p.id, item.id, dialog.step.id, body)
            : this.api.addStep(p.workspaceId, p.id, item.id, body),
          event.form,
          body,
        );
      } else {
        if (dialog.mode === 'attachments' && !this.workspace.can('attachment.read')) return;
        this.mutate(
          this.api.binding(
            p.workspaceId,
            p.id,
            item.id,
            dialog.mode,
            String(event.values['target']),
            item.version,
            true,
          ),
          event.form,
        );
      }
    }
  }
  confirm(mode: 'archive' | 'removeStep' | 'tags' | 'attachments', target?: string) {
    const item = this.item();
    if (
      !item ||
      this.disabled() ||
      (mode === 'archive'
        ? !this.can('testcase.archive') || item.status === 'ARCHIVED'
        : !this.editable()) ||
      (mode === 'attachments' && !this.workspace.can('attachment.read'))
    )
      return;
    this.begin();
    this.confirmation.set({
      mode,
      target,
      title: mode === 'archive' ? 'Arquivar caso' : 'Remover vínculo ou passo',
      message:
        mode === 'archive'
          ? `Arquivar ${item.humanId}? Definição, passos, valores e vínculos serão preservados.`
          : 'Confirmar a remoção deste item do caso? O catálogo e a biblioteca permanecem disponíveis.',
    });
  }
  confirmAction() {
    const dialog = this.confirmation(),
      item = this.item(),
      p = this.project();
    if (!dialog || !item || this.state.conflict()) return;
    if (dialog.mode === 'archive') {
      if (this.can('testcase.archive') && item.status !== 'ARCHIVED')
        this.mutate(this.api.archive(p.workspaceId, p.id, item.id, item.version));
    } else if (this.editable()) {
      if (dialog.mode === 'removeStep')
        this.mutate(
          this.api.removeStep(p.workspaceId, p.id, item.id, dialog.target!, item.version),
        );
      else if (dialog.mode !== 'attachments' || this.workspace.can('attachment.read'))
        this.mutate(
          this.api.binding(
            p.workspaceId,
            p.id,
            item.id,
            dialog.mode,
            dialog.target!,
            item.version,
            false,
          ),
        );
    }
  }
  orderStep(index: number, delta: number) {
    const item = this.item(),
      p = this.project();
    if (
      !item ||
      this.disabled() ||
      !this.editable() ||
      this.state.conflict() ||
      index + delta < 0 ||
      index + delta >= item.steps.length
    )
      return;
    const ids = [...item.steps].sort((a, b) => a.position - b.position).map((step) => step.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    this.mutate(this.api.orderSteps(p.workspaceId, p.id, item.id, item.version, ids), undefined, {
      version: item.version,
      ids,
    });
  }
  reload() {
    const item = this.item(),
      p = this.project();
    if (!item || this.disabled()) return;
    this.readState.run(this.api.get(p.workspaceId, p.id, item.id), (response) => {
      if (this.state.conflict()) this.latest.set(response.data);
      else {
        this.item.set(response.data);
        this.changed.emit(response.data);
      }
    });
  }
  reviewed(current: TestCase) {
    if (this.latest() !== current) return;
    this.item.set(current);
    this.latest.set(null);
    this.state.conflict.set(false);
    this.state.error.set('');
    if (
      current.status === 'ARCHIVED' &&
      this.editor()?.mode !== 'restore' &&
      this.dialog()?.mode !== 'clone'
    )
      this.state.error.set(
        'O caso foi arquivado. Copie sua edição local antes de fechar o formulário e restaure o caso para poder editar.',
      );
    else if (current.status !== 'ARCHIVED' && this.editor()?.mode === 'restore')
      this.state.error.set(
        'O caso já foi restaurado. Feche este formulário e revise a definição atual antes de editar.',
      );
    this.changed.emit(current);
  }
  download(id: string) {
    if (!this.workspace.can('attachment.read') || this.disabled()) return;
    this.readState.run(this.workspaceApi.download(this.project().workspaceId, id), (response) => {
      if (!response.body) return;
      const url = URL.createObjectURL(response.body),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = this.attachmentName(id);
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}
