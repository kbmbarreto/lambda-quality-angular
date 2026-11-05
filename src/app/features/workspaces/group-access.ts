import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { WorkspaceApi } from './workspace-api.service';
import { Group, Member, Role, Workspace } from './workspace.models';
import { ListState, OperationState } from './workspace-feedback';
import { PaginationControls } from './ui/list-tools';
import { ResourcePicker } from './ui/resource-picker';

@Component({
  selector: 'app-group-access',
  imports: [PaginationControls, ResourcePicker],
  template: `
    <dialog
      #dialog
      class="window editor-dialog wide-dialog"
      aria-labelledby="group-title"
      (cancel)="cancel($event)"
    >
      <header class="window-header" id="group-title">
        Participantes e papéis · {{ group().name }}
      </header>
      <div class="panel-body">
        @if (operation.error() || members.state.error()) {
          <p class="message error" role="alert">
            {{ operation.error() || members.state.error() }}
            @if (operation.wait() || members.state.wait()) {
              Aguarde {{ operation.wait() || members.state.wait() }}s.
            }
          </p>
        }
        <div class="section-heading">
          <h3>Participantes</h3>
          <div class="row-actions">
            <button
              class="btn"
              type="button"
              (click)="members.load()"
              [disabled]="members.state.busy() || !!members.state.wait()"
            >
              Atualizar
            </button>
            @if (canManage()) {
              <button
                class="btn"
                type="button"
                (click)="picker.set('members')"
                [disabled]="operation.busy()"
              >
                Adicionar membro
              </button>
            }
          </div>
        </div>
        @if (members.state.busy()) {
          <p role="status">Carregando participantes…</p>
        }
        @for (member of members.rows(); track member.id) {
          <div class="picker-item">
            <span>{{ member.user.displayName }} · {{ member.user.email }}</span>
            @if (canManage()) {
              <button
                class="btn"
                type="button"
                [disabled]="operation.busy() || !!operation.wait()"
                (click)="removeMember(member.id)"
              >
                Retirar do grupo
              </button>
            }
          </div>
        }
        @if (!members.state.busy() && !members.rows().length && !members.state.error()) {
          <p>Nenhum participante encontrado.</p>
        }
        <app-pagination
          [pagination]="members.pagination()"
          [busy]="members.state.busy()"
          (change)="members.page($event)"
        />
        <div class="section-heading">
          <h3>Papéis concedidos pelo grupo</h3>
          @if (canManage()) {
            <button
              class="btn"
              type="button"
              [disabled]="operation.busy()"
              (click)="picker.set('roles')"
            >
              Atribuir papel
            </button>
          }
        </div>
        @for (role of roles(); track role.id) {
          <div class="picker-item">
            <span>{{ role.name }}</span>
            @if (canManage()) {
              <button
                class="btn"
                type="button"
                [disabled]="operation.busy() || !!operation.wait()"
                (click)="removeRole(role.id)"
              >
                Revogar do grupo
              </button>
            }
          </div>
        }
        @if (!roles().length) {
          <p>Nenhum papel associado.</p>
        }
        <p class="field-hint">
          As alterações preservam membros, papéis diretos e concessões de outros grupos.
        </p>
      </div>
      <footer class="window-footer">
        <button class="btn" type="button" [disabled]="operation.busy()" (click)="closed.emit()">
          Fechar
        </button>
      </footer>
    </dialog>
    @if (picker(); as resource) {
      <app-resource-picker
        [workspaceId]="workspace().id"
        [resource]="resource"
        [title]="resource === 'members' ? 'Adicionar membro ao grupo' : 'Atribuir papel ao grupo'"
        [eligible]="eligible"
        (chosen)="choose($event)"
        (closed)="picker.set(null)"
      />
    }
  `,
})
export class GroupAccess implements AfterViewInit {
  readonly workspace = input.required<Workspace>();
  readonly group = input.required<Group>();
  readonly changed = output<void>();
  readonly closed = output<void>();
  private readonly api = inject(WorkspaceApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly operation = new OperationState(this.destroyRef);
  readonly roles = signal<Role[]>([]);
  readonly picker = signal<'members' | 'roles' | null>(null);
  readonly members = new ListState<Member>(this.destroyRef, (query) =>
    this.api.groupMembers(this.workspace().id, this.group().id, query).pipe(
      switchMap((response) => {
        const items = response.data.map((item) =>
          this.api
            .get(this.workspace().id, 'members', item.memberId)
            .pipe(map((result) => result.data)),
        );
        return (items.length ? forkJoin(items) : of([] as Member[])).pipe(
          map((data) => ({ ...response, data })),
        );
      }),
    ),
  );
  readonly eligible = (item: Member | Group | Role) =>
    'user' in item
      ? item.status !== 'REMOVED'
      : 'permissionCodes' in item &&
        item.permissionCodes.every((code) => this.workspace().permissions?.includes(code));
  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
    this.members.load();
    this.reloadRoles();
  }
  canManage(): boolean {
    return !!this.workspace().permissions?.includes('workspace.manage_groups');
  }
  cancel(event: Event): void {
    event.preventDefault();
    if (!this.operation.busy()) this.closed.emit();
  }
  private reloadRoles(): void {
    this.operation.run(
      this.api.get(this.workspace().id, 'groups', this.group().id).pipe(
        switchMap((result) => {
          const roles = result.data.roleIds.map((roleId) =>
            this.api
              .get(this.workspace().id, 'roles', roleId)
              .pipe(map((response) => response.data)),
          );
          return roles.length ? forkJoin(roles) : of([] as Role[]);
        }),
      ),
      (roles) => this.roles.set(roles),
    );
  }
  choose(item: Member | Group | Role): void {
    if (!this.canManage() || !this.eligible(item)) return;
    const resource = this.picker();
    this.picker.set(null);
    const request =
      resource === 'members'
        ? this.api.groupMember(this.workspace().id, this.group().id, item.id, true)
        : this.api.groupRole(this.workspace().id, this.group().id, item.id, true);
    this.operation.run(request, () => this.afterChange());
  }
  removeMember(memberId: string): void {
    if (this.canManage())
      this.operation.run(
        this.api.groupMember(this.workspace().id, this.group().id, memberId, false),
        () => this.afterChange(),
      );
  }
  removeRole(roleId: string): void {
    if (this.canManage())
      this.operation.run(
        this.api.groupRole(this.workspace().id, this.group().id, roleId, false),
        () => this.afterChange(),
      );
  }
  private afterChange(): void {
    this.members.load();
    this.reloadRoles();
    this.changed.emit();
  }
}
