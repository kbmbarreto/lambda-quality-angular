import { AfterViewInit, Component, ElementRef, inject, output, viewChild } from '@angular/core';
import { BrowserPreferences } from '../core/browser-preferences';

@Component({
  selector: 'app-cookie-notice',
  template: `
    <dialog
      #dialog
      class="window editor-dialog cookie-dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-description"
      (cancel)="$event.preventDefault()"
    >
      <header class="window-header" id="cookie-title">Cookies e preferências</header>
      <div class="panel-body">
        <div class="cookie-symbol" aria-hidden="true">✓</div>
        <h2>Seu ambiente, do seu jeito</h2>
        <p id="cookie-description">
          Usamos um cookie neste navegador para lembrar que você concordou com este aviso e guardar
          sua escolha de tema: Padrão Lambda ou Clássico. Também lembramos seus filtros de período e
          Workspace no armazenamento local deste navegador, separadamente para cada conta.
        </p>
        <p>
          Esse cookie não contém senha nem token de acesso e não é usado para publicidade ou
          rastreamento. Para manter seu acesso ao atualizar a página, guardamos o token de renovação
          temporariamente na sessão desta aba. Ele é apagado ao sair e validado pelo servidor a cada
          restauração. Sua senha não é armazenada.
        </p>
        <p class="field-hint">
          Você pode trocar o tema em Meu Perfil → Aparência. Ao apagar este cookie, o aviso será
          exibido novamente e o tema Padrão Lambda será restaurado.
        </p>
        @if (preferences.storageError()) {
          <p class="message error" role="alert">{{ preferences.storageError() }}</p>
        }
      </div>
      <footer class="window-footer">
        @if (preferences.storageError()) {
          <button type="button" class="btn" (click)="closed.emit()">Continuar sem salvar</button>
        }
        <button type="button" class="btn btn-primary" autofocus (click)="accept()">
          Concordar e continuar
        </button>
      </footer>
    </dialog>
  `,
})
export class CookieNotice implements AfterViewInit {
  readonly preferences = inject(BrowserPreferences);
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }
  accept(): void {
    if (this.preferences.accept()) this.closed.emit();
  }
}
