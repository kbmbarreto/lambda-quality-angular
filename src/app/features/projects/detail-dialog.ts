import { AfterViewInit, Component, ElementRef, input, output, viewChild } from '@angular/core';
@Component({
  selector: 'app-detail-dialog',
  template: `<dialog
    #dialog
    class="window editor-dialog"
    aria-labelledby="detail-title"
    (cancel)="closed.emit()"
  >
    <header class="window-header" id="detail-title">{{ title() }}</header>
    <div class="panel-body">
      <dl class="profile-details">
        @for (field of fields(); track field.label) {
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        }
      </dl>
    </div>
    <footer class="window-footer">
      <button class="btn" type="button" (click)="closed.emit()">Fechar</button>
    </footer>
  </dialog>`,
})
export class DetailDialog implements AfterViewInit {
  readonly title = input.required<string>();
  readonly fields = input.required<{ label: string; value: string }[]>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }
}
