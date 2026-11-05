import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { WorkspaceApi } from '../workspace-api.service';
import { ListState } from '../workspace-feedback';
import { Group, Member, Role } from '../workspace.models';
import { ListTools, PaginationControls } from './list-tools';

@Component({
  selector: 'app-resource-picker',
  imports: [ListTools, PaginationControls],
  template: `
    <dialog
      #dialog
      class="window editor-dialog"
      aria-labelledby="picker-title"
      (cancel)="cancel($event)"
    >
      <header class="window-header" id="picker-title">{{ title() }}</header>
      <div class="panel-body">
        <app-list-tools
          label="opções"
          [busy]="list.state.busy() || !!list.state.wait()"
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
          <p role="status">Carregando opções…</p>
        }
        @for (item of list.rows(); track item.id) {
          <div class="picker-item">
            <span>{{ label(item) }}</span
            ><button
              class="btn"
              type="button"
              [disabled]="!eligible()(item)"
              (click)="chosen.emit(item)"
            >
              Selecionar
            </button>
          </div>
        }
        @if (!list.state.busy() && !list.state.error() && !list.rows().length) {
          <p>Nenhuma opção encontrada.</p>
        }
        <app-pagination
          [pagination]="list.pagination()"
          [busy]="list.state.busy()"
          (change)="list.page($event)"
        />
      </div>
      <footer class="window-footer">
        <button class="btn" type="button" (click)="closed.emit()">Cancelar</button>
      </footer>
    </dialog>
  `,
})
export class ResourcePicker implements AfterViewInit {
  readonly workspaceId = input.required<string>();
  readonly resource = input.required<'members' | 'roles' | 'groups'>();
  readonly title = input.required<string>();
  readonly eligible = input<(item: Member | Role | Group) => boolean>(() => true);
  readonly chosen = output<Member | Role | Group>();
  readonly closed = output<void>();
  private readonly api = inject(WorkspaceApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly list = new ListState<Member | Role | Group>(inject(DestroyRef), (query) =>
    this.api.list(this.workspaceId(), this.resource(), query),
  );
  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
    this.list.load();
  }
  label(item: Member | Role | Group): string {
    return 'user' in item
      ? `${item.user.displayName} · ${item.user.email} (${item.status})`
      : item.name;
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }
}
