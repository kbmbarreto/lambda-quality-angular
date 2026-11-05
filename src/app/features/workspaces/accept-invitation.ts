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
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthWindow } from '../../shared/auth-window';
import { AuthService } from '../../core/auth.service';
import { InvitationContext } from '../../core/invitation-context.service';
import { WorkspaceApi } from './workspace-api.service';
import { OperationState } from './workspace-feedback';

@Component({
  selector: 'app-accept-invitation',
  imports: [AuthWindow, RouterLink, NgTemplateOutlet],
  template: `
    <ng-template #content>
      <div class="window-body">
        @if (!modal()) {
          <h1 class="system-name">Aceitar convite</h1>
        }
        @if (operation.error()) {
          <p class="message error" role="alert">{{ operation.error() }}</p>
        }
        @if (!invitation.token()) {
          <p>
            Abra o link enviado no e-mail de convite. Se atualizou a página, reabra esse link para
            continuar.
          </p>
        } @else if (!auth.user()) {
          <p>Entre ou crie uma conta com o mesmo e-mail que recebeu o convite.</p>
          <div class="auth-links">
            <a routerLink="/login">Entrar</a><a routerLink="/cadastro">Criar conta</a>
          </div>
        } @else {
          <p>
            Você está conectado como <strong>{{ auth.user()?.email }}</strong
            >.
          </p>
          <p>Confirme para entrar no Workspace associado ao convite.</p>
        }
      </div>
      <footer class="window-footer split">
        @if (modal()) {
          <button class="btn" type="button" [disabled]="operation.busy()" (click)="dismiss()">
            Fechar
          </button>
        } @else {
          <a [routerLink]="auth.user() ? '/workspaces' : '/login'">Voltar</a>
        }
        @if (auth.user() && invitation.token()) {
          <button
            class="btn"
            type="button"
            [disabled]="operation.busy() || !!operation.wait()"
            (click)="accept()"
          >
            {{
              operation.busy()
                ? 'Aguarde…'
                : operation.wait()
                  ? 'Aguarde ' + operation.wait() + 's'
                  : 'Aceitar convite'
            }}
          </button>
        }
      </footer>
    </ng-template>
    @if (modal()) {
      <dialog
        #dialog
        class="window editor-dialog"
        aria-labelledby="invitation-dialog-title"
        (cancel)="cancel($event)"
      >
        <header id="invitation-dialog-title" class="window-header">Aceitar convite</header>
        <ng-container [ngTemplateOutlet]="content" />
      </dialog>
    } @else {
      <app-auth-window title="Convite · Lambda Quality">
        <ng-container [ngTemplateOutlet]="content" />
      </app-auth-window>
    }
  `,
})
export class AcceptInvitation implements AfterViewInit {
  readonly modal = input(false);
  readonly closed = output<void>();
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly auth = inject(AuthService);
  readonly invitation = inject(InvitationContext);
  private readonly api = inject(WorkspaceApi);
  private readonly router = inject(Router);
  readonly operation = new OperationState(inject(DestroyRef));
  ngAfterViewInit(): void {
    this.dialog()?.nativeElement.showModal();
  }
  dismiss(): void {
    if (this.operation.busy()) return;
    this.dialog()?.nativeElement.close();
    this.closed.emit();
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }
  accept(): void {
    if (!this.auth.user() || !this.invitation.token()) return;
    this.operation.run(this.api.accept(this.invitation.token()), (response) => {
      this.invitation.clear();
      if (this.modal()) this.dismiss();
      void this.router.navigate(
        this.modal() ? ['/workspaces', response.data.workspaceId] : ['/workspaces'],
      );
    });
  }
}
