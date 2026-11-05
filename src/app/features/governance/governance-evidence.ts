import {
  Component,
  DestroyRef,
  OnInit,
  input,
  output,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormGroup } from '@angular/forms';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { RouterLink } from '@angular/router';
import { tap, finalize, Observable, catchError, switchMap, throwError, TimeoutError } from 'rxjs';
import { uuidV4Pattern, validResourceId } from '../../shared/resource-id';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Attachment } from '../workspaces/workspace.models';
import {
  prepareAttachment,
  attachmentAccept,
  attachmentFileError,
} from '../workspaces/attachment-file';
import { ListState, OperationState } from '../workspaces/workspace-feedback';
import { FormDialog, EditorField } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { validExternalUrl } from '../defects/defect.models';
import { DefectAttachmentSelection } from '../defects/attachment-selection';
import { GovernanceApi } from './governance-api.service';
import { GovernanceSession } from './governance-session';
import { GovernanceConflict } from './governance-conflict';
import { AssessedControl, Evidence, EvidenceBody } from './governance.models';
import { textField, dateField, validateDates, fieldFailure } from './governance-fields';
@Component({
  selector: 'app-governance-evidence',
  imports: [
    DatePipe,
    RouterLink,
    FormDialog,
    ConfirmDialog,
    ListTools,
    PaginationControls,
    DefectAttachmentSelection,
    GovernanceConflict,
  ],
  templateUrl: './governance-evidence.html',
})
export class GovernanceEvidence implements OnInit {
  readonly session = input.required<GovernanceSession>();
  readonly control = input.required<AssessedControl>();
  readonly closed = output<void>();
  private readonly api = inject(GovernanceApi);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly destroy = inject(DestroyRef);
  readonly filesState = new OperationState(this.destroy);
  readonly editor = signal<{
    mode: 'URL' | 'ATTACHMENT' | 'UPLOAD' | 'REMOVE';
    fields: EditorField[];
  } | null>(null);
  readonly removal = signal<Evidence | null>(null);
  readonly chosen = signal<Attachment | null>(null);
  readonly consulted = signal(false);
  readonly starting = signal(false);
  readonly file = signal<File | null>(null);
  readonly fileError = signal('');
  readonly uploadUncertain = signal(false);
  readonly dialog = viewChild(FormDialog);
  readonly attachmentPicker = viewChild(DefectAttachmentSelection);
  readonly accept = attachmentAccept;
  readonly safeUrl = validExternalUrl;
  readonly sorts = [
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'title,asc', label: 'Título A–Z' },
    { value: 'validUntil,asc', label: 'Validade crescente' },
  ];
  readonly list = new ListState<Evidence>(this.destroy, (q) =>
    this.api.evidence(
      this.session().item().workspaceId,
      this.session().item().id,
      this.control().controlId,
      q,
    ),
  );
  private refreshCurrent = () => this.refreshRequest();
  ngOnInit() {
    this.list.query.sort = 'createdAt,desc';
    this.session().refreshExtras = this.refreshCurrent;
    this.destroy.onDestroy(() => {
      if (this.session().refreshExtras === this.refreshCurrent)
        this.session().refreshExtras = undefined;
    });
    if (this.canFiles()) this.load();
  }
  canFiles() {
    return this.session().can('attachment.read');
  }
  canUpload() {
    return this.canFiles() && this.session().can('attachment.upload');
  }
  canStart() {
    return this.session().canAssess() && this.session().assessment().status === 'DRAFT';
  }
  start() {
    const s = this.session();
    if (!this.starting() || !this.canStart()) return;
    s.write(
      this.api.assessmentAction(s.item().workspaceId, s.item().id, 'start', s.item().version),
      { version: s.item().version },
      () => this.starting.set(false),
    );
  }
  load() {
    if (!this.session().can('governance.read')) return;
    this.consulted.set(true);
    this.list.load();
  }
  private refreshRequest(): Observable<unknown> {
    if (!this.consulted())
      return new Observable((sub) => {
        sub.next(null);
        sub.complete();
      });
    this.list.state.busy.set(true);
    return this.api
      .evidence(
        this.session().item().workspaceId,
        this.session().item().id,
        this.control().controlId,
        this.list.query,
      )
      .pipe(
        tap((r) => {
          this.list.rows.set(r.data);
          this.list.pagination.set(r.meta.pagination);
          this.list.state.error.set('');
        }),
        finalize(() => this.list.state.busy.set(false)),
      );
  }
  canEdit() {
    return this.session().assessable() && !this.list.state.busy() && !this.list.state.wait();
  }
  canAdd() {
    return (
      this.canEdit() && !this.list.state.error() && (this.list.pagination()?.totalItems ?? 0) < 100
    );
  }
  open(mode: 'URL' | 'ATTACHMENT' | 'UPLOAD' | 'REMOVE') {
    if (
      !this.canEdit() ||
      (mode !== 'REMOVE' && !this.canAdd()) ||
      (mode === 'ATTACHMENT' && !this.canFiles()) ||
      (mode === 'UPLOAD' && !this.canUpload())
    )
      return;
    this.session().state.error.set('');
    this.chosen.set(null);
    this.file.set(null);
    this.fileError.set('');
    this.editor.set({
      mode,
      fields:
        mode === 'REMOVE'
          ? [
              {
                ...textField('evidenceId', 'ID do vínculo de evidência', 36, '', true),
                pattern: uuidV4Pattern,
              },
            ]
          : [
              textField('title', 'Título da evidência', 250, '', true),
              ...(mode === 'URL'
                ? [
                    {
                      ...textField('url', 'URL da evidência', 2048, '', true),
                      hint: 'URL HTTP/HTTPS completa, sem credenciais, espaços ou barras invertidas.',
                    },
                  ]
                : []),
              dateField('validUntil', 'Válida até'),
            ],
    });
  }
  choose(file: Attachment) {
    if (
      this.canEdit() &&
      this.canFiles() &&
      file.workspaceId === this.session().item().workspaceId
    ) {
      this.chosen.set(file);
      this.file.set(null);
      this.uploadUncertain.set(false);
      this.fileError.set('');
      this.fillTitle(file.originalName);
    }
  }
  private fillTitle(name: string) {
    const title = this.dialog()?.form().get('title');
    if (title && !String(title.value ?? '').trim()) title.setValue(name.slice(0, 250));
  }
  selectFile(event: Event) {
    if (!this.canEdit() || !this.canUpload() || this.uploadUncertain()) return;
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];
    this.file.set(null);
    this.chosen.set(null);
    this.fileError.set('');
    if (!selected) return;
    const file = prepareAttachment(selected);
    if (!file) {
      this.fileError.set(attachmentFileError);
      input.value = '';
      return;
    }
    this.file.set(file);
    this.fillTitle(file.name);
  }
  canRetryUpload() {
    const picker = this.attachmentPicker();
    return (
      this.canEdit() &&
      this.canUpload() &&
      !!picker?.list.pagination() &&
      !picker.list.state.busy() &&
      !picker.list.state.error() &&
      !picker.list.state.wait()
    );
  }
  retryUpload() {
    if (!this.canRetryUpload()) return;
    this.uploadUncertain.set(false);
    this.session().state.error.set('');
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    const s = this.session(),
      e = this.editor(),
      v = event.values;
    if (!e || !this.canEdit()) return;
    if (e.mode === 'REMOVE') {
      const id = String(v['evidenceId']);
      if (validResourceId(id))
        s.write(
          this.api.removeEvidence(
            s.item().workspaceId,
            s.item().id,
            this.control().controlId,
            id,
            s.item().version,
          ),
          { version: s.item().version },
          () => this.editor.set(null),
          event.form,
        );
      return;
    }
    if (!this.canAdd()) return;
    if (!validateDates(event.form, v, ['validUntil'])) return;
    const body: EvidenceBody = {
      version: s.item().version,
      evidenceType: e.mode === 'URL' ? 'URL' : 'ATTACHMENT',
      title: String(v['title']).trim(),
      validUntil: String(v['validUntil'] || '') || null,
    };
    if (e.mode === 'URL') {
      const url = String(v['url']);
      if (!validExternalUrl(url)) {
        fieldFailure(
          event.form,
          'url',
          'Informe uma URL HTTP/HTTPS absoluta, sem credenciais ou espaços.',
        );
        return;
      }
      body.url = url;
    } else if (e.mode === 'UPLOAD' && !this.chosen()) {
      const file = this.file();
      if (!this.canUpload() || !file || this.uploadUncertain()) {
        this.fileError.set('Selecione um arquivo para enviar ou recupere o arquivo já enviado.');
        return;
      }
      // Keep both writes under the assessment lock. A confirmed upload is
      // retained if binding fails, so retrying the link never uploads it again.
      s.write(
        this.workspaceApi.upload(s.item().workspaceId, file).pipe(
          catchError((error) => {
            if (
              error instanceof TimeoutError ||
              (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
            )
              this.uploadUncertain.set(true);
            return throwError(() => error);
          }),
          switchMap((response) => {
            this.chosen.set(response.data);
            this.file.set(null);
            if (
              !this.canFiles() ||
              !s.can('governance.assess') ||
              s.assessment().status !== 'IN_PROGRESS' ||
              response.data.workspaceId !== s.item().workspaceId
            ) {
              return throwError(
                () => new HttpErrorResponse({ status: 403, error: { code: 'AUTH_FORBIDDEN' } }),
              );
            }
            return this.api.addEvidence(
              s.item().workspaceId,
              s.item().id,
              this.control().controlId,
              { ...body, referenceId: response.data.id },
            );
          }),
        ),
        body,
        () => this.editor.set(null),
        event.form,
      );
      return;
    } else {
      const file = this.chosen();
      if (!this.canFiles() || !file || file.workspaceId !== s.item().workspaceId) {
        s.state.error.set('Selecione um anexo disponível neste Workspace.');
        return;
      }
      body.referenceId = file.id;
    }
    s.write(
      this.api.addEvidence(s.item().workspaceId, s.item().id, this.control().controlId, body),
      body,
      () => this.editor.set(null),
      event.form,
    );
  }
  remove() {
    const s = this.session(),
      e = this.removal();
    if (!e || !this.canEdit()) return;
    s.write(
      this.api.removeEvidence(
        s.item().workspaceId,
        s.item().id,
        this.control().controlId,
        e.id,
        s.item().version,
      ),
      { version: s.item().version },
      () => this.removal.set(null),
    );
  }
  download(e: Evidence) {
    if (
      !this.canFiles() ||
      e.evidenceType !== 'ATTACHMENT' ||
      !e.referenceId ||
      !e.attachmentAvailable ||
      this.filesState.busy() ||
      this.filesState.wait()
    )
      return;
    this.filesState.run(
      this.workspaceApi.download(this.session().item().workspaceId, e.referenceId),
      (r) => {
        if (!r.body) return;
        const url = URL.createObjectURL(r.body),
          a = document.createElement('a');
        a.href = url;
        a.download = e.attachmentSnapshot?.originalName ?? 'evidencia';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    );
  }
  expired(e: Evidence) {
    return !!e.validUntil && e.validUntil < new Date().toISOString().slice(0, 10);
  }
}
