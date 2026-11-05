import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, OnInit, inject, input, output } from '@angular/core';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Attachment } from '../workspaces/workspace.models';
import { ListState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
@Component({
  selector: 'app-defect-attachment-selection',
  imports: [DatePipe, ListTools, PaginationControls],
  template: ` <section aria-label="Selecionar anexos privados">
    <h3>Anexos da biblioteca</h3>
    <p>
      @if (single()) {
        Selecione um arquivo da biblioteca deste Workspace.
      } @else {
        {{ selected().length }} de 100 anexos. O arquivo pode ser reutilizado entre projetos deste
        Workspace.
      }
    </p>
    <app-list-tools
      label="anexos disponíveis"
      [sorts]="sorts"
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
      <p role="status">Carregando biblioteca…</p>
    }
    @for (item of list.rows(); track item.id) {
      <div class="picker-item">
        <span
          ><strong>{{ item.originalName }}</strong
          ><small>
            · {{ item.contentType }} · {{ size(item.sizeBytes) }} ·
            {{ item.createdAt | date: 'dd/MM/yyyy' }}</small
          ></span
        ><button
          class="btn"
          type="button"
          [disabled]="
            blocked() ||
            (single() && selected().includes(item.id)) ||
            (!selected().includes(item.id) && selected().length >= 100)
          "
          (click)="choose(item)"
        >
          {{
            selected().includes(item.id)
              ? single()
                ? 'Vinculado'
                : 'Desmarcar'
              : 'Selecionar anexo'
          }}
        </button>
      </div>
    }
    @if (!list.state.busy() && !list.state.error() && !list.rows().length) {
      <p>Nenhum anexo disponível. Envie o arquivo na biblioteca do Workspace.</p>
    }
    <app-pagination
      [pagination]="list.pagination()"
      [busy]="blocked() || list.state.busy() || !!list.state.wait()"
      (change)="list.page($event)"
    />
    @if (!single() && selected().length) {
      <details>
        <summary>Anexos selecionados ({{ selected().length }})</summary>
        @for (id of selected(); track id) {
          <div class="picker-item">
            <span>{{ names.get(id) || id }}</span
            ><button class="btn" type="button" [disabled]="blocked()" (click)="remove(id)">
              Desmarcar anexo
            </button>
          </div>
        }
      </details>
    }
  </section>`,
})
export class DefectAttachmentSelection implements OnInit {
  readonly workspaceId = input.required<string>();
  readonly selected = input<string[]>([]);
  readonly single = input(false);
  readonly blocked = input(false);
  readonly changed = output<string[]>();
  readonly added = output<Attachment>();
  private readonly workspace = inject(WorkspaceContext);
  private readonly api = inject(WorkspaceApi);
  readonly names = new Map<string, string>();
  readonly sorts = [
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'originalName,asc', label: 'Nome A–Z' },
  ];
  readonly list = new ListState<Attachment>(inject(DestroyRef), (query) =>
    this.api.list(this.workspaceId(), 'attachments', query),
  );
  ngOnInit() {
    this.list.query.sort = 'createdAt,desc';
    if (this.canRead()) this.list.load();
  }
  canRead() {
    return (
      this.workspace.selected()?.id === this.workspaceId() && this.workspace.can('attachment.read')
    );
  }
  size(bytes: number) {
    return bytes < 1024
      ? `${bytes} B`
      : bytes < 1048576
        ? `${(bytes / 1024).toFixed(1)} KiB`
        : `${(bytes / 1048576).toFixed(1)} MiB`;
  }
  choose(item: Attachment) {
    if (this.blocked() || !this.canRead() || item.workspaceId !== this.workspaceId()) return;
    if (this.single()) {
      if (!this.selected().includes(item.id) && this.selected().length < 100) this.added.emit(item);
      return;
    }
    if (this.selected().includes(item.id)) this.remove(item.id);
    else if (this.selected().length < 100) {
      this.names.set(item.id, item.originalName);
      this.changed.emit([...this.selected(), item.id]);
    }
  }
  remove(id: string) {
    if (!this.blocked()) this.changed.emit(this.selected().filter((value) => value !== id));
  }
}
