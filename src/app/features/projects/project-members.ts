import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ProjectApi } from './project-api.service';
import {
  Project,
  ProjectMemberDetails,
  ProjectRole,
  canChange,
  projectRoleLabels,
  roleCapabilities,
} from './project.models';
import { OperationState, ListState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { ResourcePicker } from '../workspaces/ui/resource-picker';
import { FormDialog, EditorField } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { Member, Role, Group } from '../workspaces/workspace.models';

@Component({
  selector: 'app-project-members',
  imports: [DatePipe, ListTools, PaginationControls, ResourcePicker, FormDialog, ConfirmDialog],
  template: `
    <div class="section-heading">
      <h2>Participantes</h2>
      @if (manageable()) {
        <button
          class="btn"
          type="button"
          [disabled]="operation.busy()"
          (click)="selecting.set(true)"
        >
          Adicionar participante
        </button>
      }
    </div>
    <p>
      O papel local combina com as permissões do Workspace. Suspensão no Workspace interrompe o
      acesso ao projeto.
    </p>
    @if (operation.error() && !editor() && !removing()) {
      <p class="message error" role="alert">{{ operation.error() }}</p>
    }
    <app-list-tools
      label="participantes"
      [searchable]="false"
      [sorts]="sorts"
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
      <p role="status">Carregando participantes…</p>
    }
    @if (list.rows().length) {
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome / E-mail</th>
              <th>Papel no projeto</th>
              <th>Acesso no Workspace</th>
              <th>Entrada</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            @for (member of list.rows(); track member.id) {
              <tr>
                <td>
                  <strong>{{ member.user.displayName }}</strong>
                  <p>{{ member.user.email }}</p>
                </td>
                <td>{{ labels[member.projectRole] }}</td>
                <td>
                  {{
                    member.workspaceMemberStatus === 'ACTIVE' && member.user.status === 'ACTIVE'
                      ? 'Ativo'
                      : 'Suspenso'
                  }}
                </td>
                <td>{{ member.createdAt | date: 'dd/MM/yyyy' }}</td>
                <td>
                  <div class="table-actions">
                    @if (manageable()) {
                      @if (
                        member.workspaceMemberStatus === 'ACTIVE' && member.user.status === 'ACTIVE'
                      ) {
                        <button
                          class="btn"
                          type="button"
                          [disabled]="operation.busy()"
                          (click)="editMember(member)"
                        >
                          Alterar papel
                        </button>
                      }
                      <button
                        class="btn"
                        type="button"
                        [disabled]="operation.busy()"
                        (click)="removing.set(member)"
                      >
                        Remover do projeto
                      </button>
                    } @else {
                      <span>Consulta</span>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (!list.state.busy() && !list.state.error()) {
      <p>Nenhum participante encontrado.</p>
    }
    <app-pagination
      [pagination]="list.pagination()"
      [busy]="list.state.busy() || !!list.state.wait()"
      (change)="list.page($event)"
    />
    @if (selecting()) {
      <app-resource-picker
        [workspaceId]="project().workspaceId"
        resource="members"
        title="Escolher participante do Workspace"
        [eligible]="eligible"
        (chosen)="choose($event)"
        (closed)="selecting.set(false)"
      />
    }
    @if (editor(); as form) {
      <app-form-dialog
        [title]="'Papel de ' + form.name"
        [fields]="form.fields"
        [state]="operation"
        hint="Leitor consulta; Editor também altera projeto, marcos e ambientes; Gestor também arquiva e administra participantes. Só é possível atribuir um papel cujas capacidades você possui."
        (saved)="save($event)"
        (closed)="editor.set(null)"
      />
    }
    @if (removing(); as member) {
      <app-confirm-dialog
        title="Remover participante"
        [message]="
          'Remover ' +
          member.user.displayName +
          ' deste projeto? O vínculo com o Workspace será preservado. Pessoas com acesso a todos os projetos pelo Workspace continuam com esse acesso.'
        "
        [state]="operation"
        (confirmed)="remove()"
        (closed)="removing.set(null)"
      />
    }
  `,
})
export class ProjectMembers {
  readonly project = input.required<Project>();
  readonly changed = output<void>();
  private readonly api = inject(ProjectApi);
  readonly operation = new OperationState(inject(DestroyRef));
  readonly manageable = computed(() => canChange(this.project(), 'project.manage_members'));
  readonly labels = projectRoleLabels;
  readonly selecting = signal(false);
  readonly removing = signal<ProjectMemberDetails | null>(null);
  readonly editor = signal<{ memberId: string; name: string; fields: EditorField[] } | null>(null);
  readonly sorts = [
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'projectRole,asc', label: 'Papel no projeto' },
  ];
  readonly list = new ListState<ProjectMemberDetails>(inject(DestroyRef), (query) =>
    this.api.members(this.project().workspaceId, this.project().id, query),
  );
  readonly eligible = (item: Member | Role | Group) =>
    'user' in item && item.status === 'ACTIVE' && item.user.status === 'ACTIVE';
  ngOnInit(): void {
    this.list.query.sort = 'createdAt,desc';
    this.list.load();
  }
  canAssign(role: ProjectRole): boolean {
    return (
      this.manageable() &&
      // The API checks vault delegation against the target's current grants.
      roleCapabilities[role].every(
        (code) => code.startsWith('testvault.') || this.project().permissions.includes(code),
      )
    );
  }
  private open(memberId: string, name: string, role: ProjectRole): void {
    const roles = (Object.keys(projectRoleLabels) as ProjectRole[]).map((value) => ({
      value,
      label: projectRoleLabels[value],
      disabled: !this.canAssign(value),
    }));
    this.operation.error.set('');
    this.editor.set({
      memberId,
      name,
      fields: [
        {
          key: 'projectRole',
          label: 'Papel local',
          type: 'select',
          required: true,
          value: role,
          options: roles,
        },
      ],
    });
  }
  choose(item: Member | Role | Group): void {
    if (!this.manageable() || !this.eligible(item) || !('user' in item)) return;
    this.selecting.set(false);
    this.open(item.id, item.user.displayName, 'VIEWER');
  }
  editMember(member: ProjectMemberDetails): void {
    if (
      this.manageable() &&
      member.workspaceMemberStatus === 'ACTIVE' &&
      member.user.status === 'ACTIVE'
    )
      this.open(member.workspaceMemberId, member.user.displayName, member.projectRole);
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }): void {
    const editor = this.editor(),
      role = event.values['projectRole'] as ProjectRole;
    if (!editor || !Object.hasOwn(roleCapabilities, role) || !this.canAssign(role)) {
      this.operation.error.set('Você não pode atribuir todas as capacidades deste papel.');
      return;
    }
    this.operation.run(
      this.api.assign(this.project().workspaceId, this.project().id, editor.memberId, role),
      () => {
        this.editor.set(null);
        this.changed.emit();
      },
      event.form,
    );
  }
  remove(): void {
    const member = this.removing();
    if (!member || !this.manageable()) return;
    this.operation.run(
      this.api.removeMember(
        this.project().workspaceId,
        this.project().id,
        member.workspaceMemberId,
      ),
      () => {
        this.removing.set(null);
        this.changed.emit();
      },
    );
  }
}
