import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  Injector,
  OnInit,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { ListState } from '../workspaces/workspace-feedback';
import { GovernanceApi } from './governance-api.service';
import { GovernanceSession } from './governance-session';
import { GovernanceConflict } from './governance-conflict';
import { Action, Goal, actionStatuses } from './governance.models';

@Component({
  selector: 'app-goal-actions',
  imports: [ListTools, PaginationControls, ConfirmDialog, GovernanceConflict],
  templateUrl: './goal-actions.html',
})
export class GoalActions implements OnInit {
  readonly session = input.required<GovernanceSession>();
  readonly blocked = input(false);
  readonly opened = output<string>();
  readonly changed = output<void>();
  private readonly api = inject(GovernanceApi);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  readonly picker = signal(false);
  readonly selection = signal<GovernanceSession | null>(null);
  readonly removing = signal(false);
  readonly success = signal('');
  readonly labels = actionStatuses;
  readonly statuses = [
    { value: 'OPEN', label: 'Abertas' },
    { value: 'IN_PROGRESS', label: 'Em andamento' },
  ];
  readonly linked = new ListState<Action>(this.destroy, (query) =>
    this.api.list(this.goal().workspaceId, 'actions', { ...query, goalId: this.goal().id }),
  );
  readonly candidates = new ListState<Action>(this.destroy, (query) =>
    this.api.list(this.goal().workspaceId, 'actions', query),
  );
  ngOnInit() {
    this.linked.query.sort = this.candidates.query.sort = 'dueDate,asc';
    if (this.session().can('governance.read')) this.linked.load();
  }
  goal() {
    return this.session().item() as Goal;
  }
  action(session: GovernanceSession) {
    return session.item() as Action;
  }
  busy() {
    const selected = this.selection();
    return !!selected && (selected.state.busy() || selected.read.busy());
  }
  canManage() {
    return !this.blocked() && this.session().can('governance.read') && this.session().manageable();
  }
  editable(action: Action) {
    return (
      action.workspaceId === this.goal().workspaceId &&
      ['OPEN', 'IN_PROGRESS'].includes(action.status)
    );
  }
  choose() {
    if (!this.canManage() || this.goal().status === 'CANCELLED' || this.selection()) return;
    this.success.set('');
    this.picker.set(true);
    this.candidates.load();
  }
  closePicker() {
    if (this.busy()) return;
    this.picker.set(false);
    this.candidates.cancel();
  }
  select(action: Action, removing = false) {
    if (!this.canManage() || this.selection() || !this.editable(action)) return;
    if (
      removing
        ? action.goalId !== this.goal().id
        : this.goal().status === 'CANCELLED' || action.goalId === this.goal().id
    )
      return;
    this.success.set('');
    this.removing.set(removing);
    const selected = runInInjectionContext(
      this.injector,
      () => new GovernanceSession('actions', action, () => this.changed.emit()),
    );
    this.selection.set(selected);
    selected.reload();
  }
  message() {
    const action = this.selection()?.item() as Action | undefined;
    if (!action) return '';
    if (this.removing())
      return `Remover o vínculo de “${action.title}” com “${this.goal().name}”? A ação continuará cadastrada.`;
    const transfer =
      action.goalId && action.goalId !== this.goal().id
        ? ' Esta ação já está vinculada a outra meta. Ao confirmar, o vínculo será transferido para esta meta.'
        : '';
    return `Vincular “${action.title}” à meta “${this.goal().name}”?${transfer} O vínculo com o controle avaliado será preservado.`;
  }
  canConfirm() {
    const s = this.selection();
    if (!s || !this.canManage() || !s.manageable() || !this.editable(s.item() as Action))
      return false;
    const a = s.item() as Action;
    return this.removing()
      ? a.goalId === null || a.goalId === this.goal().id
      : this.goal().status !== 'CANCELLED';
  }
  confirm() {
    const s = this.selection();
    if (!s || !this.canConfirm()) return;
    const action = s.item() as Action;
    const body = { version: action.version, goalId: this.removing() ? null : this.goal().id };
    // A GET after an uncertain response may already confirm the desired association.
    if (action.goalId === body.goalId) {
      this.finish();
      return;
    }
    s.write(
      this.api.update(action.workspaceId, 'actions', action.id, body).pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409) {
            s.state.blocked.set(true);
            this.session().reload();
          }
          return throwError(() => error);
        }),
      ),
      body,
      () => this.finish(),
    );
  }
  finish() {
    this.success.set(this.removing() ? 'Ação desvinculada da meta.' : 'Ação vinculada à meta.');
    this.selection.set(null);
    this.closePicker();
    this.linked.load();
    this.session().reload();
    this.changed.emit();
  }
  closeSelection() {
    if (this.busy()) return;
    const uncertain = this.selection()?.state.blocked();
    this.selection.set(null);
    if (uncertain) {
      this.linked.load();
      this.session().reload();
      this.changed.emit();
    }
  }
}
