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
import { FormGroup } from '@angular/forms';
import { WorkspaceApi } from './workspace-api.service';
import {
  Creatable,
  CreateBodies,
  CustomField,
  Group,
  Permission,
  Role,
  Tag,
  UpdateBodies,
  Workspace,
} from './workspace.models';
import { ListState, OperationState } from './workspace-feedback';
import { EditorField, FormDialog, descriptionField, nameField } from './ui/form-dialog';
import { ListTools, PaginationControls } from './ui/list-tools';
import { ConfirmDialog } from './ui/confirm-dialog';
import { GroupAccess } from './group-access';

type CatalogItem = Role | Group | CustomField | Tag;
const labels: Record<Creatable, string> = {
  roles: 'Papéis de acesso',
  groups: 'Grupos',
  'custom-fields': 'Campos personalizados',
  tags: 'Tags',
};
const permissions: Record<Creatable, string> = {
  roles: 'workspace.manage_roles',
  groups: 'workspace.manage_groups',
  'custom-fields': 'field.manage',
  tags: 'tag.manage',
};

@Component({
  selector: 'app-catalog-panel',
  imports: [DatePipe, FormDialog, ListTools, PaginationControls, ConfirmDialog, GroupAccess],
  templateUrl: './catalog-panel.html',
})
export class CatalogPanel {
  readonly workspace = input.required<Workspace>();
  readonly kind = input.required<Creatable>();
  readonly changed = output<void>();
  private readonly api = inject(WorkspaceApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly list = new ListState<CatalogItem>(this.destroyRef, (query) =>
    this.api.list(this.workspace().id, this.kind(), query),
  );
  readonly operation = new OperationState(this.destroyRef);
  readonly editor = signal<{
    title: string;
    fields: EditorField[];
    item: CatalogItem | null;
  } | null>(null);
  readonly removing = signal<CatalogItem | null>(null);
  readonly group = signal<Group | null>(null);
  readonly details = signal<CatalogItem | null>(null);
  constructor() {
    effect(() => {
      this.workspace().id;
      this.kind();
      this.canRead();
      untracked(() => {
        if (this.canRead()) this.list.load();
        else {
          this.list.rows.set([]);
          this.list.pagination.set(null);
        }
      });
    });
  }
  title(): string {
    return labels[this.kind()];
  }
  canManage(): boolean {
    return !!this.workspace().permissions?.includes(permissions[this.kind()]);
  }
  canRead(): boolean {
    return !!this.workspace().permissions?.includes(
      this.kind() === 'custom-fields'
        ? 'field.read'
        : this.kind() === 'tags'
          ? 'tag.read'
          : 'workspace.read',
    );
  }
  editable(item: CatalogItem): boolean {
    return (
      this.canManage() &&
      !('systemRole' in item && item.systemRole) &&
      !('archivedAt' in item && item.archivedAt)
    );
  }
  sorts(): { value: string; label: string }[] {
    return [
      {
        value: this.kind() === 'custom-fields' ? 'position,asc' : 'name,asc',
        label: this.kind() === 'custom-fields' ? 'Posição' : 'Nome A–Z',
      },
      { value: 'createdAt,desc', label: 'Mais recentes' },
    ];
  }
  statuses(): { value: string; label: string }[] {
    return this.kind() === 'custom-fields'
      ? [
          { value: 'ACTIVE', label: 'Ativos' },
          { value: 'ARCHIVED', label: 'Arquivados' },
          { value: 'ALL', label: 'Todos' },
        ]
      : [];
  }
  description(item: CatalogItem): string {
    return 'description' in item ? (item.description ?? '—') : '—';
  }
  summary(item: CatalogItem): string {
    if ('systemRole' in item)
      return `${item.systemRole ? 'Sistema' : 'Personalizado'} · ${item.permissionCodes.length} permissão(ões)`;
    if ('memberCount' in item)
      return `${item.memberCount} membro(s) · ${item.roleIds.length} papel(is)`;
    if ('key' in item)
      return `${item.key} · ${item.type} · ${item.archivedAt ? 'Arquivado' : 'Ativo'}`;
    return 'Tag do Workspace';
  }
  view(item: CatalogItem): void {
    this.operation.run(this.api.get(this.workspace().id, this.kind(), item.id), (result) =>
      this.details.set(result.data),
    );
  }
  open(item: CatalogItem | null = null): void {
    this.operation.error.set('');
    if (item && !this.editable(item)) return;
    if (!this.canManage()) return;
    if (this.kind() === 'roles') {
      this.operation.run(this.api.permissions(), (response) =>
        this.openWithPermissions(item, response.data.permissions),
      );
    } else this.openWithPermissions(item, []);
  }
  private openWithPermissions(item: CatalogItem | null, catalog: Permission[]): void {
    const fields: EditorField[] = [nameField(item?.name)];
    if (this.kind() === 'roles' || this.kind() === 'groups' || this.kind() === 'custom-fields')
      fields.push(descriptionField(item && 'description' in item ? item.description : null));
    if (this.kind() === 'roles')
      fields.push({
        key: 'permissionCodes',
        label: 'Permissões',
        type: 'permissions',
        value: item && 'permissionCodes' in item ? item.permissionCodes : [],
        options: catalog.map((permission) => ({
          value: permission.code,
          label: permission.description,
          disabled: !this.workspace().permissions?.includes(permission.code),
        })),
        hint: 'Selecione somente permissões que você possui. Uma lista vazia não concede direitos.',
      });
    if (this.kind() === 'custom-fields') {
      const current = item as CustomField | null;
      fields.push(
        {
          key: 'key',
          label: 'Chave',
          value: current?.key ?? '',
          required: true,
          max: 80,
          pattern: /^[a-z][a-z0-9_]*$/,
          disabled: !!item,
          hint: 'Comece com letra minúscula; use letras minúsculas, números e underscore. A chave não pode ser alterada.',
        },
        {
          key: 'type',
          label: 'Tipo',
          type: 'select',
          value: current?.type ?? 'TEXT',
          disabled: !!item,
          options: [
            { value: 'TEXT', label: 'Texto' },
            { value: 'NUMBER', label: 'Número' },
            { value: 'BOOLEAN', label: 'Sim / Não' },
            { value: 'DATE', label: 'Data' },
            { value: 'SINGLE_SELECT', label: 'Seleção única' },
          ],
        },
        {
          key: 'required',
          label: 'Obrigatório',
          type: 'checkbox',
          value: current?.required ?? false,
        },
        {
          key: 'position',
          label: 'Posição',
          type: 'number',
          value: current?.position ?? 0,
          required: true,
          min: 0,
          max: 100000,
        },
        {
          key: 'options',
          label: 'Opções',
          type: 'textarea',
          value: current?.options.map((option) => option.label).join('\n') ?? '',
          disabled: !!item,
          max: 5050,
          hint: 'Somente para seleção única: uma opção por linha, de 1 a 50 opções distintas com até 100 caracteres cada. As opções não podem ser alteradas.',
        },
      );
    }
    this.editor.set({ title: `${item ? 'Editar' : 'Criar'} · ${this.title()}`, fields, item });
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }): void {
    const editor = this.editor();
    if (!editor || !this.canManage()) return;
    const values = event.values;
    const name = String(values['name']).trim();
    const description = String(values['description'] ?? '').trim() || null;
    let body: CreateBodies[Creatable] | UpdateBodies[Creatable] = { name };
    switch (this.kind()) {
      case 'roles': {
        const codes = values['permissionCodes'] as string[];
        if (codes.some((code) => !this.workspace().permissions?.includes(code))) {
          this.operation.error.set('Você não pode conceder permissões que não possui.');
          return;
        }
        body = { name, description, permissionCodes: codes };
        break;
      }
      case 'groups':
        body = { name, description };
        break;
      case 'custom-fields': {
        body = {
          name,
          description,
          required: !!values['required'],
          position: Number(values['position']),
        };
        if (!editor.item) {
          const type = values['type'] as CustomField['type'];
          const options = String(values['options'] ?? '')
            .split('\n')
            .map((option) => option.trim())
            .filter(Boolean);
          if (
            (type === 'SINGLE_SELECT' &&
              (!options.length ||
                options.length > 50 ||
                new Set(options).size !== options.length ||
                options.some((option) => option.length > 100))) ||
            (type !== 'SINGLE_SELECT' && options.length)
          ) {
            event.form
              .get('options')
              ?.setErrors({
                server:
                  'Seleção única exige 1 a 50 opções distintas de até 100 caracteres. Outros tipos devem ficar sem opções.',
              });
            event.form.get('options')?.markAsTouched();
            return;
          }
          body = { ...body, key: String(values['key']).trim(), type, target: 'TEST_CASE', options };
        }
      }
    }
    const request = editor.item
      ? this.api.update(
          this.workspace().id,
          this.kind(),
          editor.item.id,
          body as UpdateBodies[Creatable],
        )
      : this.api.create(this.workspace().id, this.kind(), body as CreateBodies[Creatable]);
    this.operation.run(
      request,
      () => {
        this.editor.set(null);
        this.operation.success.set('Alteração salva com sucesso.');
        if (this.canRead()) this.list.load();
        if (this.kind() === 'roles' || this.kind() === 'groups') this.changed.emit();
      },
      event.form,
    );
  }
  remove(): void {
    const item = this.removing();
    if (!item || !this.editable(item)) return;
    if (this.kind() === 'custom-fields')
      this.operation.run(this.api.archiveField(this.workspace().id, item.id), () =>
        this.afterRemove(),
      );
    else
      this.operation.run(
        this.api.remove(this.workspace().id, this.kind() as 'roles' | 'groups' | 'tags', item.id),
        () => this.afterRemove(),
      );
  }
  private afterRemove(): void {
    this.removing.set(null);
    this.details.set(null);
    this.list.load();
    this.operation.success.set('Operação concluída.');
    if (this.kind() === 'roles' || this.kind() === 'groups') this.changed.emit();
  }
  requestRemove(item: CatalogItem): void {
    this.operation.error.set('');
    this.removing.set(item);
  }
  manageGroup(item: CatalogItem): void {
    this.group.set(item as Group);
  }
  detailsRole(): Role | null {
    const item = this.details();
    return item && 'permissionCodes' in item ? item : null;
  }
  detailsField(): CustomField | null {
    const item = this.details();
    return item && 'key' in item ? item : null;
  }
}
