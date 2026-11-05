import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { WorkspaceApi } from './workspace-api.service';
import { Group, Member, Role, Workspace } from './workspace.models';
import { ListState, OperationState } from './workspace-feedback';
import { ListTools, PaginationControls } from './ui/list-tools';
import { ConfirmDialog } from './ui/confirm-dialog';
import { ResourcePicker } from './ui/resource-picker';

@Component({
  selector: 'app-members-panel',
  imports: [DatePipe, ListTools, PaginationControls, ConfirmDialog, ResourcePicker],
  templateUrl: './members-panel.html',
})
export class MembersPanel {
  readonly workspace = input.required<Workspace>();
  readonly changed = output<void>();
  private readonly api = inject(WorkspaceApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly list = new ListState<Member>(this.destroyRef, (query) =>
    this.api.list(this.workspace().id, 'members', query),
  );
  readonly operation = new OperationState(this.destroyRef);
  readonly selected = signal<Member | null>(null);
  readonly confirmation = signal<{
    member: Member;
    action: 'remove' | 'suspend' | 'activate';
  } | null>(null);
  readonly picker = signal<'role' | 'roleFilter' | 'groupFilter' | null>(null);
  readonly statuses = [
    { value: 'ACTIVE', label: 'Ativos' },
    { value: 'SUSPENDED', label: 'Suspensos' },
    { value: 'REMOVED', label: 'Removidos' },
  ];
  readonly sorts = [
    { value: 'joinedAt,desc', label: 'Mais recentes' },
    { value: 'joinedAt,asc', label: 'Mais antigos' },
    { value: 'status,asc', label: 'Situação' },
  ];
  readonly eligibleRole = (item: Member | Role | Group) =>
    'permissionCodes' in item &&
    item.permissionCodes.every((code) => this.workspace().permissions?.includes(code));
  readonly alwaysEligible = () => true;
  constructor() {
    effect(() => {
      this.workspace().id;
      untracked(() => this.list.load());
    });
  }
  can(permission: string): boolean {
    return !!this.workspace().permissions?.includes(permission);
  }
  view(member: Member): void {
    this.operation.run(this.api.get(this.workspace().id, 'members', member.id), (result) =>
      this.selected.set(result.data),
    );
  }
  request(member: Member, action: 'remove' | 'suspend' | 'activate'): void {
    this.operation.error.set('');
    this.confirmation.set({ member, action });
  }
  confirm(): void {
    const request = this.confirmation();
    if (
      !request ||
      request.member.isOwner ||
      request.member.status === 'REMOVED' ||
      !this.can('workspace.manage_members')
    )
      return;
    const done = () => {
      this.confirmation.set(null);
      this.selected.set(null);
      this.list.load();
      this.changed.emit();
    };
    if (request.action === 'remove')
      this.operation.run(this.api.remove(this.workspace().id, 'members', request.member.id), done);
    else
      this.operation.run(
        this.api.memberStatus(
          this.workspace().id,
          request.member.id,
          request.action === 'suspend' ? 'SUSPENDED' : 'ACTIVE',
        ),
        done,
      );
  }
  choose(item: Member | Role | Group): void {
    if (this.picker() === 'roleFilter') {
      this.list.search({ roleId: item.id });
      this.picker.set(null);
      return;
    }
    if (this.picker() === 'groupFilter') {
      this.list.search({ groupId: item.id });
      this.picker.set(null);
      return;
    }
    const member = this.selected();
    if (!member || !('permissionCodes' in item) || !this.eligibleRole(item)) return;
    this.picker.set(null);
    this.operation.run(this.api.memberRole(this.workspace().id, member.id, item.id, true), () => {
      this.view(member);
      this.list.load();
      this.changed.emit();
    });
  }
  revoke(roleId: string): void {
    const member = this.selected();
    if (
      !member ||
      !this.can('workspace.manage_roles') ||
      !member.roles.some((role) => role.id === roleId && role.source === 'DIRECT')
    )
      return;
    this.operation.run(this.api.memberRole(this.workspace().id, member.id, roleId, false), () => {
      this.view(member);
      this.list.load();
      this.changed.emit();
    });
  }
  clearFilters(): void {
    this.list.search({ roleId: '', groupId: '' });
  }
  openPicker(picker: 'role' | 'roleFilter' | 'groupFilter'): void {
    this.operation.error.set('');
    this.picker.set(picker);
  }
}
