import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { WorkspaceApi } from './workspace-api.service';
import { Invitation, Workspace } from './workspace.models';
import { ListState, OperationState } from './workspace-feedback';
import { FormDialog } from './ui/form-dialog';
import { ConfirmDialog } from './ui/confirm-dialog';
import { ListTools, PaginationControls } from './ui/list-tools';

@Component({
  selector: 'app-invitations-panel',
  imports: [DatePipe, FormDialog, ConfirmDialog, ListTools, PaginationControls],
  template: `
    <div class="section-heading">
      <h2>Convites</h2>
      <button
        class="btn"
        type="button"
        [disabled]="operation.busy() || !!operation.wait()"
        (click)="open()"
      >
        Convidar membro
      </button>
    </div>
    <p>
      O registro do convite não garante entrega na caixa postal. Um reenvio invalida o link
      anterior.
    </p>
    <app-list-tools
      label="convites"
      [busy]="list.state.busy() || !!list.state.wait()"
      [statuses]="statuses"
      [sorts]="sorts"
      (search)="list.search($event)"
      (refresh)="list.load()"
    />
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
      <p role="status">Carregando convites…</p>
    }
    @if (!list.state.busy() && !list.state.error() && !list.rows().length) {
      <p class="empty-state">Nenhum convite encontrado.</p>
    }
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>E-mail</th>
            <th>Situação</th>
            <th>Envio</th>
            <th>Expira em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (invitation of list.rows(); track invitation.id) {
            <tr>
              <td>{{ invitation.email }}</td>
              <td>{{ statusLabel(invitation.status) }}</td>
              <td>{{ deliveryLabel(invitation.deliveryStatus) }}</td>
              <td>{{ invitation.expiresAt | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td class="row-actions">
                <button
                  class="btn"
                  type="button"
                  (click)="view(invitation)"
                  [disabled]="operation.busy()"
                >
                  Consultar
                </button>
                @if (pending(invitation)) {
                  <button
                    class="btn"
                    type="button"
                    [disabled]="operation.busy() || !!operation.wait() || !!resendWait(invitation)"
                    (click)="resend(invitation)"
                  >
                    {{
                      resendWait(invitation)
                        ? 'Reenviar em ' + resendWait(invitation) + 's'
                        : 'Reenviar'
                    }}</button
                  ><button
                    class="btn"
                    type="button"
                    [disabled]="operation.busy()"
                    (click)="requestCancel(invitation)"
                  >
                    Cancelar convite
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
    @if (details(); as invitation) {
      <section class="detail-card">
        <div class="section-heading">
          <h3>{{ invitation.email }}</h3>
          <button class="link-button" type="button" (click)="details.set(null)">
            Fechar detalhes
          </button>
        </div>
        <p>{{ statusLabel(invitation.status) }} · {{ deliveryLabel(invitation.deliveryStatus) }}</p>
        <p>
          Criado em {{ invitation.createdAt | date: 'dd/MM/yyyy HH:mm' }} · Último envio
          {{ invitation.lastSentAt | date: 'dd/MM/yyyy HH:mm' }}
        </p>
        @if (invitation.acceptedAt) {
          <p>Aceito em {{ invitation.acceptedAt | date: 'dd/MM/yyyy HH:mm' }}</p>
        }
      </section>
    }
    @if (creating()) {
      <app-form-dialog
        title="Convidar membro"
        [fields]="fields"
        [state]="operation"
        (saved)="invite($event)"
        (closed)="creating.set(false)"
      />
    }
    @if (canceling(); as invitation) {
      <app-confirm-dialog
        title="Cancelar convite"
        [message]="'Cancelar o convite de ' + invitation.email + '? O link deixará de funcionar.'"
        [state]="operation"
        (confirmed)="cancel()"
        (closed)="canceling.set(null)"
      />
    }
  `,
})
export class InvitationsPanel {
  readonly workspace = input.required<Workspace>();
  private readonly api = inject(WorkspaceApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly list = new ListState<Invitation>(this.destroyRef, (query) =>
    this.api.list(this.workspace().id, 'invitations', query),
  );
  readonly operation = new OperationState(this.destroyRef);
  readonly creating = signal(false);
  readonly canceling = signal<Invitation | null>(null);
  readonly details = signal<Invitation | null>(null);
  readonly fields = [
    {
      key: 'email',
      label: 'E-mail do convidado',
      type: 'email' as const,
      required: true,
      max: 254,
    },
  ];
  readonly statuses = [
    { value: 'PENDING', label: 'Pendentes' },
    { value: 'ACCEPTED', label: 'Aceitos' },
    { value: 'CANCELED', label: 'Cancelados' },
    { value: 'EXPIRED', label: 'Expirados' },
  ];
  readonly sorts = [
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'email,asc', label: 'E-mail A–Z' },
    { value: 'expiresAt,asc', label: 'Expiração' },
  ];
  private readonly now = signal(Date.now());
  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));
    effect(() => {
      this.workspace().id;
      untracked(() => this.list.load());
    });
  }
  pending(invitation: Invitation): boolean {
    return invitation.status === 'PENDING' || invitation.status === 'EXPIRED';
  }
  resendWait(invitation: Invitation): number {
    return Math.max(0, Math.ceil((Date.parse(invitation.lastSentAt) + 60000 - this.now()) / 1000));
  }
  statusLabel(status: string): string {
    return (
      (
        {
          PENDING: 'Pendente',
          ACCEPTED: 'Aceito',
          CANCELED: 'Cancelado',
          EXPIRED: 'Expirado',
        } as Record<string, string>
      )[status] ?? status
    );
  }
  deliveryLabel(status: string): string {
    return (
      (
        {
          PENDING: 'Envio pendente',
          SENT: 'Aceito pelo provedor',
          FAILED: 'Falha no envio; pode ser reenviado',
        } as Record<string, string>
      )[status] ?? status
    );
  }
  open(): void {
    this.operation.error.set('');
    this.creating.set(true);
  }
  invite(event: { values: Record<string, unknown>; form: FormGroup }): void {
    this.operation.run(
      this.api.invite(this.workspace().id, String(event.values['email']).trim()),
      () => {
        this.creating.set(false);
        this.list.load();
        this.operation.success.set('Convite registrado. Consulte o status de envio.');
      },
      event.form,
    );
  }
  view(invitation: Invitation): void {
    this.operation.run(this.api.get(this.workspace().id, 'invitations', invitation.id), (result) =>
      this.details.set(result.data),
    );
  }
  resend(invitation: Invitation): void {
    if (this.resendWait(invitation) || !this.pending(invitation)) return;
    this.operation.run(this.api.resend(this.workspace().id, invitation.id), () => {
      this.list.load();
      this.operation.success.set('Reenvio registrado. O link anterior foi invalidado.');
    });
  }
  requestCancel(invitation: Invitation): void {
    this.operation.error.set('');
    this.canceling.set(invitation);
  }
  cancel(): void {
    const invitation = this.canceling();
    if (!invitation) return;
    this.operation.run(this.api.remove(this.workspace().id, 'invitations', invitation.id), () => {
      this.canceling.set(null);
      this.details.set(null);
      this.list.load();
    });
  }
}
