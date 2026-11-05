import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, finalize, interval } from 'rxjs';
import { AppShell } from '../../shared/app-shell';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { WorkspaceApi } from './workspace-api.service';
import { Group, Member, Role } from './workspace.models';
import { OperationState, workspaceError } from './workspace-feedback';
import { retryAfter } from '../../core/api-error';
import { EditorField, FormDialog, nameField } from './ui/form-dialog';
import { slugField } from './workspace-list';
import { ResourcePicker } from './ui/resource-picker';
import { ConfirmDialog } from './ui/confirm-dialog';
import { MembersPanel } from './members-panel';
import { InvitationsPanel } from './invitations-panel';
import { CatalogPanel } from './catalog-panel';
import { AttachmentsPanel } from './attachments-panel';

type Tab =
  | 'overview'
  | 'members'
  | 'invitations'
  | 'roles'
  | 'groups'
  | 'custom-fields'
  | 'tags'
  | 'attachments';
@Component({
  selector: 'app-workspace-detail',
  imports: [
    AppShell,
    DatePipe,
    RouterLink,
    FormDialog,
    ResourcePicker,
    ConfirmDialog,
    MembersPanel,
    InvitationsPanel,
    CatalogPanel,
    AttachmentsPanel,
  ],
  templateUrl: './workspace-detail.html',
})
export class WorkspaceDetail {
  readonly context = inject(WorkspaceContext);
  private readonly api = inject(WorkspaceApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly id = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly tab = signal<Tab>('overview');
  readonly operation = new OperationState(this.destroyRef);
  readonly editor = signal<EditorField[] | null>(null);
  readonly selectingOwner = signal(false);
  readonly newOwner = signal<Member | null>(null);
  readonly accessWait = signal(0);
  private accessRetryAt = 0;
  private request?: Subscription;
  readonly tabs: { key: Tab; label: string; permission: string }[] = [
    { key: 'overview', label: 'Visão geral', permission: 'workspace.read' },
    { key: 'members', label: 'Membros', permission: 'workspace.read' },
    { key: 'invitations', label: 'Convites', permission: 'workspace.manage_members' },
    { key: 'roles', label: 'Papéis', permission: 'workspace.read' },
    { key: 'groups', label: 'Grupos', permission: 'workspace.read' },
    { key: 'custom-fields', label: 'Campos', permission: 'field.read' },
    { key: 'tags', label: 'Tags', permission: 'tag.read' },
    { key: 'attachments', label: 'Anexos', permission: 'attachment.read' },
  ];
  readonly eligibleOwner = (item: Member | Role | Group) =>
    'user' in item && item.status === 'ACTIVE' && !item.isOwner;
  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() =>
        this.accessWait.set(Math.max(0, Math.ceil((this.accessRetryAt - Date.now()) / 1000))),
      );
    this.context.accessChanged.pipe(takeUntilDestroyed()).subscribe(() => {
      this.context.selected.set(null);
      this.editor.set(null);
      this.newOwner.set(null);
      this.selectingOwner.set(false);
      this.refresh();
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.context.clear();
      this.tab.set('overview');
      this.editor.set(null);
      this.newOwner.set(null);
      this.selectingOwner.set(false);
      this.id.set(params.get('workspaceId') ?? '');
      this.refresh();
    });
    this.destroyRef.onDestroy(() => this.context.selected.set(null));
  }
  can(permission: string): boolean {
    return this.context.can(permission);
  }
  available(tab: Tab): boolean {
    if (tab === 'custom-fields') return this.can('field.read') || this.can('field.manage');
    if (tab === 'tags') return this.can('tag.read') || this.can('tag.manage');
    if (tab === 'attachments') return this.can('attachment.read') || this.can('attachment.upload');
    const target = this.tabs.find((item) => item.key === tab);
    return !!target && this.can(target.permission);
  }
  refresh(): void {
    if (this.accessWait()) return;
    this.request?.unsubscribe();
    const id = this.id();
    this.loading.set(true);
    this.error.set('');
    this.request = this.api
      .getWorkspace(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (this.id() !== id) return;
          this.context.selected.set(response.data);
          const currentTab = this.tabs.find((tab) => tab.key === this.tab());
          if (currentTab && !this.available(currentTab.key)) this.tab.set('overview');
        },
        error: (error) => {
          this.context.selected.set(null);
          this.error.set(workspaceError(error));
          if (error instanceof HttpErrorResponse && error.status === 429) {
            const seconds = retryAfter(error) || 60;
            this.accessRetryAt = Date.now() + seconds * 1000;
            this.accessWait.set(seconds);
          }
          if (
            error instanceof HttpErrorResponse &&
            (error.status === 403 || error.status === 404)
          ) {
            this.context.notice.set(
              'O Workspace não está disponível para sua conta. Escolha outro Workspace ou solicite acesso.',
            );
            void this.router.navigate(['/workspaces']);
          }
        },
      });
  }
  selectTab(tab: Tab): void {
    if (this.available(tab)) {
      this.operation.error.set('');
      this.tab.set(tab);
    }
  }
  edit(): void {
    const workspace = this.context.selected();
    if (!workspace || !this.can('workspace.update')) return;
    this.operation.error.set('');
    this.editor.set([nameField(workspace.name), slugField(workspace.slug)]);
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }): void {
    if (!this.can('workspace.update')) return;
    this.operation.run(
      this.api.updateWorkspace(this.id(), {
        name: String(event.values['name']).trim(),
        slug: String(event.values['slug']).trim(),
      }),
      () => {
        this.editor.set(null);
        this.operation.success.set('Workspace atualizado.');
        this.refresh();
      },
      event.form,
    );
  }
  chooseOwner(item: Member | Role | Group): void {
    if (!this.eligibleOwner(item)) return;
    this.selectingOwner.set(false);
    this.operation.error.set('');
    this.newOwner.set(item as Member);
  }
  transfer(): void {
    const owner = this.newOwner();
    if (!owner || !this.context.selected()?.isOwner) return;
    this.operation.run(this.api.transfer(this.id(), owner.id), () => {
      this.newOwner.set(null);
      this.operation.success.set('Propriedade transferida. Seu acesso será atualizado.');
      this.refresh();
    });
  }
}
