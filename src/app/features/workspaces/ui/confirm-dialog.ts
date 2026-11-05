import { AfterViewInit, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { OperationState } from '../workspace-feedback';

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog
      #dialog
      class="window editor-dialog"
      (cancel)="cancel($event)"
      aria-labelledby="confirm-title"
    >
      <header id="confirm-title" class="window-header">{{ title() }}</header>
      <div class="panel-body">
        <p>{{ message() }}</p>
        @if (state().error()) {
          <p class="message error" role="alert">{{ state().error() }}</p>
        }
        <ng-content />
      </div>
      <footer class="window-footer">
        <button class="btn" type="button" [disabled]="state().busy()" (click)="closed.emit()">
          Cancelar</button
        ><button
          class="btn"
          type="button"
          [disabled]="state().busy() || !!state().wait() || blocked()"
          (click)="confirmed.emit()"
        >
          {{
            state().busy()
              ? 'Aguarde…'
              : state().wait()
                ? 'Aguarde ' + state().wait() + 's'
                : 'Confirmar'
          }}
        </button>
      </footer>
    </dialog>
  `,
})
export class ConfirmDialog implements AfterViewInit {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly state = input.required<OperationState>();
  readonly blocked = input(false);
  readonly confirmed = output<void>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }
  cancel(event: Event): void {
    event.preventDefault();
    if (!this.state().busy()) this.closed.emit();
  }
}
