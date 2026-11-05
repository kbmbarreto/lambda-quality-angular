import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { WorkspaceApi } from './workspace-api.service';
import { prepareAttachment, attachmentFileError } from './attachment-file';
import { Attachment, Workspace } from './workspace.models';
import { ListState, OperationState } from './workspace-feedback';
import { ListTools, PaginationControls } from './ui/list-tools';
import { ConfirmDialog } from './ui/confirm-dialog';

@Component({
  selector: 'app-attachments-panel',
  imports: [DatePipe, ListTools, PaginationControls, ConfirmDialog],
  template: `
    <h2>Biblioteca de anexos</h2>
    <p>
      Arquivos privados do Workspace: PNG, JPEG, PDF, TXT ou CSV UTF-8. Limite padrão de 10 MiB,
      sujeito à configuração do servidor.
    </p>
    @if (can('attachment.upload')) {
      <div class="upload-toolbar">
        <label for="attachment-file">Arquivo</label
        ><input
          id="attachment-file"
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,.txt,.csv"
          [disabled]="operation.busy()"
          (change)="selectFile($event)"
        /><button
          class="btn"
          type="button"
          [disabled]="!file() || operation.busy() || !!operation.wait()"
          (click)="upload()"
        >
          {{ operation.busy() ? 'Aguarde…' : 'Enviar arquivo' }}
        </button>
      </div>
    }
    @if (can('attachment.read')) {
      <app-list-tools
        label="anexos"
        [busy]="list.state.busy() || !!list.state.wait()"
        [sorts]="sorts"
        (search)="list.search($event)"
        (refresh)="list.load()"
      />
    } @else {
      <p class="message info">
        Você pode enviar arquivos, mas não possui permissão para consultar a biblioteca.
      </p>
    }
    @if (list.state.error() || operation.error()) {
      <p class="message error" role="alert">
        {{ list.state.error() || operation.error() }}
        @if (list.state.wait() || operation.wait()) {
          Aguarde {{ list.state.wait() || operation.wait() }}s.
        }
      </p>
    }
    @if (operation.success()) {
      <p class="message success" role="status">{{ operation.success() }}</p>
    }
    @if (list.state.busy()) {
      <p role="status">Carregando anexos…</p>
    }
    @if (
      can('attachment.read') && !list.state.busy() && !list.state.error() && !list.rows().length
    ) {
      <p class="empty-state">Nenhum anexo encontrado.</p>
    }
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Tipo</th>
            <th>Tamanho</th>
            <th>Enviado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (attachment of list.rows(); track attachment.id) {
            <tr>
              <td>{{ attachment.originalName }}</td>
              <td>{{ attachment.contentType }}</td>
              <td>{{ size(attachment.sizeBytes) }}</td>
              <td>{{ attachment.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td class="row-actions">
                <button
                  class="btn"
                  type="button"
                  (click)="view(attachment)"
                  [disabled]="operation.busy()"
                >
                  Consultar</button
                ><button
                  class="btn"
                  type="button"
                  (click)="download(attachment)"
                  [disabled]="operation.busy() || !!operation.wait()"
                >
                  Baixar
                </button>
                @if (can('attachment.delete')) {
                  <button
                    class="btn"
                    type="button"
                    (click)="requestDelete(attachment)"
                    [disabled]="operation.busy()"
                  >
                    Excluir
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-pagination
      [pagination]="list.pagination()"
      [busy]="list.state.busy()"
      (change)="list.page($event)"
    />
    @if (details(); as attachment) {
      <section class="detail-card">
        <div class="section-heading">
          <h3>{{ attachment.originalName }}</h3>
          <button class="link-button" type="button" (click)="details.set(null)">
            Fechar detalhes
          </button>
        </div>
        <p>{{ attachment.contentType }} · {{ size(attachment.sizeBytes) }}</p>
        <p class="checksum">SHA-256: {{ attachment.checksum }}</p>
      </section>
    }
    @if (removing(); as attachment) {
      <app-confirm-dialog
        title="Excluir anexo"
        [message]="
          'Excluir ' +
          attachment.originalName +
          '? O arquivo deixará de estar disponível para consulta e download.'
        "
        [state]="operation"
        (confirmed)="remove()"
        (closed)="removing.set(null)"
      />
    }
  `,
})
export class AttachmentsPanel {
  readonly workspace = input.required<Workspace>();
  private readonly api = inject(WorkspaceApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly list = new ListState<Attachment>(this.destroyRef, (query) =>
    this.api.list(this.workspace().id, 'attachments', query),
  );
  readonly operation = new OperationState(this.destroyRef);
  readonly file = signal<File | null>(null);
  readonly details = signal<Attachment | null>(null);
  readonly removing = signal<Attachment | null>(null);
  readonly sorts = [
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'originalName,asc', label: 'Nome A–Z' },
    { value: 'sizeBytes,desc', label: 'Maiores arquivos' },
  ];
  private readonly objectUrls = new Set<string>();
  private fileInput?: HTMLInputElement;
  constructor() {
    effect(() => {
      this.workspace().id;
      this.can('attachment.read');
      untracked(() => {
        if (this.can('attachment.read')) this.list.load();
        else {
          this.list.rows.set([]);
          this.list.pagination.set(null);
        }
      });
    });
    this.destroyRef.onDestroy(() => this.objectUrls.forEach((url) => URL.revokeObjectURL(url)));
  }
  can(permission: string): boolean {
    return !!this.workspace().permissions?.includes(permission);
  }
  size(bytes: number): string {
    return bytes >= 1048576
      ? (bytes / 1048576).toFixed(2) + ' MiB'
      : Math.ceil(bytes / 1024) + ' KiB';
  }
  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fileInput = input;
    const file = input.files?.[0];
    this.file.set(null);
    this.operation.error.set('');
    if (!file) return;
    const prepared = prepareAttachment(file);
    if (!prepared) {
      this.operation.error.set(attachmentFileError);
      input.value = '';
      return;
    }
    this.file.set(prepared);
  }
  upload(): void {
    const file = this.file();
    if (!file || !this.can('attachment.upload')) return;
    this.operation.run(this.api.upload(this.workspace().id, file), () => {
      this.file.set(null);
      if (this.fileInput) this.fileInput.value = '';
      this.operation.success.set('Arquivo enviado com sucesso.');
      if (this.can('attachment.read')) this.list.load();
    });
  }
  view(attachment: Attachment): void {
    this.operation.run(
      this.api.get(this.workspace().id, 'attachments', attachment.id),
      (response) => this.details.set(response.data),
    );
  }
  download(attachment: Attachment): void {
    this.operation.run(this.api.download(this.workspace().id, attachment.id), (response) => {
      if (!response.body) return;
      const url = URL.createObjectURL(response.body);
      this.objectUrls.add(url);
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const utf8Name = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const plainName = /filename="([^\"]+)"/i.exec(disposition)?.[1];
      let filename = attachment.originalName;
      try {
        filename = utf8Name ? decodeURIComponent(utf8Name) : plainName || filename;
      } catch {
        /* Use metadata when header encoding is invalid. */
      }
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename.replace(/[\\/]/g, '_');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        this.objectUrls.delete(url);
      }, 1000);
    });
  }
  requestDelete(attachment: Attachment): void {
    this.operation.error.set('');
    this.removing.set(attachment);
  }
  remove(): void {
    const attachment = this.removing();
    if (!attachment || !this.can('attachment.delete')) return;
    this.operation.run(this.api.remove(this.workspace().id, 'attachments', attachment.id), () => {
      this.removing.set(null);
      this.details.set(null);
      this.list.load();
    });
  }
}
