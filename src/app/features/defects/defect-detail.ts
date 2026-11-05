import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, from, mergeMap, toArray } from 'rxjs';
import { ApiResponse } from '../../core/api.models';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { uuidV4Pattern, validResourceId } from '../../shared/resource-id';
import { Project, canChange } from '../projects/project.models';
import { payloadFits } from '../test-cases/test-case.models';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Attachment } from '../workspaces/workspace.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { EditorField, FormDialog } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { PaginationControls } from '../workspaces/ui/list-tools';
import { DefectApi } from './defect-api.service';
import {
  Defect,
  DefectSeverity,
  DefectStatus,
  UpdateDefect,
  defectStatuses,
  validExternalUrl,
} from './defect.models';
import { DefectHistory } from './defect-history';
import { DefectState } from './defect-feedback';
import { DefectView } from './defect-view';
import { DefectConflict } from './defect-conflict';
import { DefectAttachmentSelection } from './attachment-selection';
import { defectFields } from './defect-fields';
import { DefectEnvironments, environmentField, environmentBody } from './defect-environments';
interface DefectDialog {
  mode: 'activity' | 'details' | 'external' | 'removeAttachment';
  fields: EditorField[];
  title: string;
  hint: string;
}
@Component({
  selector: 'app-defect-detail',
  imports: [
    RouterLink,
    FormDialog,
    ConfirmDialog,
    PaginationControls,
    DefectView,
    DefectConflict,
    DefectAttachmentSelection,
    DefectHistory,
  ],
  templateUrl: './defect-detail.html',
})
export class DefectDetail implements OnInit {
  readonly project = input.required<Project>();
  readonly initial = input.required<Defect>();
  readonly changed = output<Defect>();
  readonly closed = output<void>();
  private readonly api = inject(DefectApi);
  private readonly environmentsApi = inject(DefectEnvironments);
  readonly environmentRead = new OperationState(inject(DestroyRef));
  private readonly filesApi = inject(WorkspaceApi);
  private readonly workspace = inject(WorkspaceContext);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = new DefectState(this.destroyRef);
  readonly read = new OperationState(this.destroyRef);
  readonly filesState = new OperationState(this.destroyRef);
  readonly item = signal<Defect>(null!);
  readonly latest = signal<Defect | null>(null);
  readonly editor = signal<DefectDialog | null>(null);
  readonly dialog = viewChild(FormDialog);
  readonly confirm = signal<{ mode: 'external' | 'attachment'; id?: string } | null>(null);
  readonly linking = signal(false);
  readonly activityAvailable = signal(false);
  readonly filePage = signal(1);
  readonly files = signal<Record<string, Attachment>>({});
  readonly visibleFileIds = computed(() =>
    this.item().attachmentIds.slice((this.filePage() - 1) * 20, this.filePage() * 20),
  );
  readonly pagination = computed(() => ({
    page: this.filePage(),
    size: 20,
    totalItems: this.item().attachmentIds.length,
    totalPages: Math.ceil(this.item().attachmentIds.length / 20),
    hasNext: this.filePage() * 20 < this.item().attachmentIds.length,
    hasPrevious: this.filePage() > 1,
  }));
  ngOnInit() {
    this.item.set(this.initial());
    this.loadFiles();
  }
  canManage() {
    return canChange(this.project(), 'defect.manage');
  }
  canReadRuns() {
    return this.project().permissions.includes('testrun.read');
  }
  canReadFiles() {
    return (
      this.workspace.selected()?.id === this.project().workspaceId &&
      this.workspace.can('attachment.read')
    );
  }
  locked() {
    return (
      this.state.busy() ||
      this.state.blocked() ||
      !!this.state.wait() ||
      this.read.busy() ||
      !!this.read.wait()
    );
  }
  begin() {
    this.state.error.set('');
    this.state.success.set('');
  }
  private mutate(request: Observable<ApiResponse<Defect>>, form?: FormGroup, body?: unknown) {
    if (!this.canManage() || this.locked()) return;
    if (body !== undefined && !payloadFits(body)) {
      this.state.error.set('O conteúdo excede 32 KiB. Reduza os textos.');
      return;
    }
    this.state.run(
      request,
      (response) => {
        this.item.set(response.data);
        this.latest.set(null);
        this.editor.set(null);
        this.confirm.set(null);
        this.state.success.set('Defeito atualizado.');
        this.changed.emit(response.data);
        this.loadFiles();
      },
      form,
    );
  }
  edit() {
    if (!this.canManage() || this.locked()) return;
    this.begin();
    this.editor.set({
      mode: 'details',
      title: 'Editar defeito',
      fields: [...defectFields(this.item()), environmentField([], false, this.item())],
      hint: 'Escolha qualquer situação, inclusive reabrir um defeito. A origem da falha permanece imutável.',
    });
    this.loadEnvironments();
  }
  updateActivity() {
    if (!this.canManage() || this.locked()) return;
    this.begin();
    this.editor.set({
      mode: 'activity',
      title: 'Atualizar defeito',
      hint: 'Altere a situação ou registre um comentário sobre este defeito.',
      fields: this.activityFields(),
    });
  }
  private activityFields(): EditorField[] {
    return [
      {
        key: 'status',
        label: 'Situação',
        type: 'select',
        required: true,
        value: this.item().status,
        options: Object.entries(defectStatuses).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'comment',
        label: 'Comentário',
        type: 'textarea',
        max: 10000,
        value: '',
        disabled: !this.activityAvailable(),
        hint: this.activityAvailable()
          ? 'Opcional ao alterar a situação. Os comentários ficam no histórico do defeito.'
          : 'Comentários ainda não estão disponíveis. Você pode atualizar a situação.',
      },
    ];
  }
  historyAvailable(available: boolean) {
    this.activityAvailable.set(available);
    const editor = this.editor();
    if (editor?.mode !== 'activity') return;
    const draft = this.dialog()?.form().getRawValue() ?? {};
    this.editor.set({
      ...editor,
      fields: this.activityFields().map((field) => ({
        ...field,
        value: draft[field.key] ?? field.value,
      })),
    });
  }
  loadEnvironments() {
    this.environmentRead.run(this.environmentsApi.load(this.project()), (rows) => {
      const editor = this.editor();
      const draft = this.dialog()?.form().getRawValue() ?? {};
      if (editor?.mode === 'details')
        this.editor.set({
          ...editor,
          fields: [
            ...editor.fields.filter((f) => f.key !== 'environmentId'),
            environmentField(rows, false, this.item()),
          ].map((field) => ({ ...field, value: draft[field.key] ?? field.value })),
        });
    });
  }
  external() {
    if (!this.canManage() || this.locked()) return;
    const item = this.item();
    this.begin();
    this.editor.set({
      mode: 'external',
      title: 'Referência externa',
      hint: 'Referência manual. O sistema não consulta nem sincroniza a issue externa.',
      fields: [
        {
          key: 'externalSystem',
          label: 'Sistema externo',
          required: true,
          max: 50,
          value: item.externalSystem ?? '',
        },
        {
          key: 'externalIssueId',
          label: 'Identificador da issue',
          required: true,
          max: 250,
          value: item.externalIssueId ?? '',
        },
        {
          key: 'externalUrl',
          label: 'URL da issue',
          required: true,
          max: 2048,
          value: item.externalUrl ?? '',
          hint: 'URL completa HTTP ou HTTPS, sem credenciais, espaços ou barras invertidas.',
        },
      ],
    });
  }
  removeById() {
    if (!this.canManage() || this.locked()) return;
    this.begin();
    this.editor.set({
      mode: 'removeAttachment',
      title: 'Remover vínculo de anexo por ID',
      hint: 'Use o ID do anexo vinculado, inclusive de um arquivo já excluído da biblioteca. Apenas o vínculo será removido; o arquivo não será apagado.',
      fields: [
        {
          key: 'attachmentId',
          label: 'ID do anexo',
          required: true,
          max: 36,
          pattern: uuidV4Pattern,
        },
      ],
    });
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    const editor = this.editor(),
      item = this.item(),
      v = event.values;
    if (!editor || !this.canManage() || this.locked()) return;
    if (editor.mode === 'activity') {
      const status = String(v['status']) as DefectStatus;
      if (!Object.hasOwn(defectStatuses, status)) return;
      const comment = this.activityAvailable() ? String(v['comment'] ?? '').trim() : '';
      if (String(v['comment'] ?? '').trim() && !this.activityAvailable()) {
        this.state.error.set(
          'Não foi possível consultar os comentários. Consulte o histórico antes de salvar seu comentário.',
        );
        return;
      }
      if (!comment && status === item.status) {
        this.state.error.set('Altere a situação ou escreva um comentário antes de salvar.');
        return;
      }
      if (comment.length > 10000) {
        event.form
          .get('comment')
          ?.setErrors({ server: 'O comentário deve ter até 10000 caracteres.' });
        event.form.get('comment')?.markAsTouched();
        return;
      }
      const body: UpdateDefect = {
        version: item.version,
        ...(status !== item.status ? { status } : {}),
        ...(comment ? { comment } : {}),
      };
      this.mutate(
        this.api.update(item.workspaceId, item.projectId, item.id, body),
        event.form,
        body,
      );
    } else if (editor.mode === 'details') {
      if (
        this.environmentRead.busy() ||
        this.environmentRead.error() ||
        this.environmentRead.wait()
      )
        return;
      const environment = environmentBody(v, event.form);
      if (!environment) return;
      const body = {
        version: item.version,
        title: String(v['title']).trim(),
        description: String(v['description']).trim() || null,
        severity: String(v['severity']) as DefectSeverity,
        status: String(v['status']) as DefectStatus,
        ...environment,
      };
      this.mutate(
        this.api.update(item.workspaceId, item.projectId, item.id, body),
        event.form,
        body,
      );
    } else if (editor.mode === 'external') {
      const body = {
        version: item.version,
        externalSystem: String(v['externalSystem']).trim(),
        externalIssueId: String(v['externalIssueId']).trim(),
        externalUrl: String(v['externalUrl']),
      };
      if (!validExternalUrl(body.externalUrl)) {
        const control = event.form.get('externalUrl');
        control?.setErrors({
          server: 'Informe uma URL HTTP/HTTPS absoluta, sem credenciais ou espaços.',
        });
        control?.markAsTouched();
        return;
      }
      this.mutate(
        this.api.linkExternal(item.workspaceId, item.projectId, item.id, body),
        event.form,
        body,
      );
    } else {
      const id = String(v['attachmentId']);
      if (!validResourceId(id)) return;
      this.mutate(
        this.api.removeAttachment(item.workspaceId, item.projectId, item.id, id, item.version),
        event.form,
      );
    }
  }
  requestRemoval(mode: 'external' | 'attachment', id?: string) {
    if (!this.canManage() || this.locked()) return;
    this.begin();
    this.confirm.set({ mode, id });
  }
  remove() {
    const confirmation = this.confirm(),
      item = this.item();
    if (!confirmation || !this.canManage() || this.locked()) return;
    this.mutate(
      confirmation.mode === 'external'
        ? this.api.unlinkExternal(item.workspaceId, item.projectId, item.id, item.version)
        : this.api.removeAttachment(
            item.workspaceId,
            item.projectId,
            item.id,
            confirmation.id!,
            item.version,
          ),
    );
  }
  attach(file: Attachment) {
    const item = this.item();
    if (
      !this.canManage() ||
      !this.canReadFiles() ||
      this.locked() ||
      item.attachmentIds.length >= 100 ||
      item.attachmentIds.includes(file.id) ||
      file.workspaceId !== item.workspaceId
    )
      return;
    this.files.update((files) => ({ ...files, [file.id]: file }));
    this.mutate(
      this.api.addAttachment(item.workspaceId, item.projectId, item.id, file.id, item.version),
    );
  }
  reload() {
    if (this.state.busy() || this.read.busy() || this.read.wait()) return;
    const item = this.item();
    this.latest.set(null);
    this.read.run(this.api.get(item.workspaceId, item.projectId, item.id), (response) => {
      if (this.state.blocked()) this.latest.set(response.data);
      else {
        this.item.set(response.data);
        this.changed.emit(response.data);
        this.loadFiles(true);
      }
    });
  }
  review() {
    const current = this.latest();
    if (!current || this.read.busy()) return;
    this.item.set(current);
    this.latest.set(null);
    this.state.blocked.set(false);
    this.state.error.set('');
    this.changed.emit(current);
    this.loadFiles(true);
  }
  loadFiles(force = false) {
    if (!this.canReadFiles()) return;
    const item = this.item(),
      lastPage = Math.max(1, Math.ceil(item.attachmentIds.length / 20));
    if (this.filePage() > lastPage) this.filePage.set(lastPage);
    const ids = this.visibleFileIds().filter((id) => force || !this.files()[id]);
    if (!ids.length) return;
    this.filesState.run(
      from(ids).pipe(
        mergeMap((id) => this.filesApi.get(item.workspaceId, 'attachments', id), 4),
        toArray(),
      ),
      (rows) =>
        this.files.update((files) => ({
          ...files,
          ...Object.fromEntries(rows.map((row) => [row.data.id, row.data])),
        })),
    );
  }
  pageFiles(page: number) {
    if (this.filesState.busy() || this.locked()) return;
    this.filePage.set(page);
    this.loadFiles();
  }
  fileName(id: string) {
    return this.canReadFiles() ? (this.files()[id]?.originalName ?? id) : id;
  }
  download(id: string) {
    if (
      !this.canReadFiles() ||
      this.filesState.busy() ||
      this.filesState.wait() ||
      !this.item().attachmentIds.includes(id)
    )
      return;
    this.filesState.run(this.filesApi.download(this.item().workspaceId, id), (response) => {
      if (!response.body) return;
      const url = URL.createObjectURL(response.body),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = this.fileName(id);
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}
