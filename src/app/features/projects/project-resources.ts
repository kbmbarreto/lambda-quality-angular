import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule, FormGroup } from '@angular/forms';
import { ProjectApi } from './project-api.service';
import {
  Project,
  Milestone,
  ProjectEnvironment,
  canChange,
  milestoneLabels,
  calendarDate,
  validCalendarDate,
  EnvironmentCategory,
  environmentCategories,
} from './project.models';
import { OperationState, ListState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { FormDialog, EditorField, nameField, descriptionField } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { DetailDialog } from './detail-dialog';
type Item = Milestone | ProjectEnvironment;
type Editor = { id?: string; fields: EditorField[] };

@Component({
  selector: 'app-project-resources',
  imports: [FormsModule, ListTools, PaginationControls, FormDialog, ConfirmDialog, DetailDialog],
  template: `
    <div class="section-heading">
      <h2>{{ title() }}</h2>
      @if (manageable()) {
        <button class="btn" type="button" [disabled]="operation.busy()" (click)="edit()">
          {{ kind() === 'milestones' ? 'Criar marco' : 'Criar ambiente' }}
        </button>
      }
    </div>
    @if (operation.error() && !editor() && !confirmation()) {
      <p class="message error" role="alert">{{ operation.error() }}</p>
    }
    @if (operation.success()) {
      <p class="message success" role="status">{{ operation.success() }}</p>
    }
    @if (kind() === 'environments') {
      <div class="list-toolbar">
        <label for="environment-active">Situação dos ambientes</label
        ><select id="environment-active" [(ngModel)]="active">
          <option value="">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
      </div>
    }
    <app-list-tools
      [label]="title()"
      [statuses]="kind() === 'milestones' ? statuses : []"
      [sorts]="sorts()"
      [busy]="list.state.busy() || !!list.state.wait()"
      (search)="search($event)"
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
      <p role="status">Carregando {{ title().toLowerCase() }}…</p>
    }
    @if (list.rows().length) {
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Situação</th>
              @if (kind() === 'environments') {
                <th>Categoria</th>
              }
              <th>{{ kind() === 'milestones' ? 'Início / Prazo' : 'Descrição' }}</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            @for (item of list.rows(); track item.id) {
              <tr>
                <td>
                  <strong>{{ item.name }}</strong>
                </td>
                <td>{{ status(item) }}</td>
                @if (kind() === 'environments') {
                  <td>{{ category(item) }}</td>
                }
                <td>{{ summary(item) }}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="btn"
                      type="button"
                      [disabled]="operation.busy()"
                      (click)="consult(item)"
                    >
                      Consultar
                    </button>
                    @if (manageable()) {
                      @if (editable(item)) {
                        <button
                          class="btn"
                          type="button"
                          [disabled]="operation.busy()"
                          (click)="consult(item, true)"
                        >
                          Editar
                        </button>
                      }
                      @if (completable(item)) {
                        <button
                          class="btn"
                          type="button"
                          [disabled]="operation.busy()"
                          (click)="confirm(item, 'complete')"
                        >
                          Concluir
                        </button>
                      }
                      <button
                        class="btn"
                        type="button"
                        [disabled]="operation.busy()"
                        (click)="confirm(item, 'remove')"
                      >
                        Excluir
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (!list.state.busy() && !list.state.error()) {
      <p>
        Nenhum {{ kind() === 'milestones' ? 'marco' : 'ambiente' }} encontrado para os filtros
        selecionados.
      </p>
    }
    <app-pagination
      [pagination]="list.pagination()"
      [busy]="list.state.busy() || !!list.state.wait()"
      (change)="list.page($event)"
    />
    @if (editor(); as form) {
      <app-form-dialog
        [title]="
          (form.id ? 'Editar ' : 'Criar ') + (kind() === 'milestones' ? 'marco' : 'ambiente')
        "
        [fields]="form.fields"
        [state]="operation"
        [hint]="
          kind() === 'milestones'
            ? 'Datas são opcionais e não possuem fuso horário. O início deve ser anterior ou igual ao prazo. Marcos concluídos preservam seu histórico.'
            : 'Desativar preserva a consulta e permite edição posterior. Nomes excluídos continuam reservados neste projeto.'
        "
        (saved)="save($event)"
        (closed)="editor.set(null)"
      />
    }
    @if (details(); as detail) {
      <app-detail-dialog
        [title]="detail.title"
        [fields]="detail.fields"
        (closed)="details.set(null)"
      />
    }
    @if (confirmation(); as action) {
      <app-confirm-dialog
        [title]="
          action.action === 'complete'
            ? 'Concluir marco'
            : 'Excluir ' + (kind() === 'milestones' ? 'marco' : 'ambiente')
        "
        [message]="action.message"
        [state]="operation"
        (confirmed)="execute()"
        (closed)="confirmation.set(null)"
      />
    }
  `,
})
export class ProjectResourcesPanel {
  readonly project = input.required<Project>();
  readonly kind = input.required<'milestones' | 'environments'>();
  readonly title = computed(() => (this.kind() === 'milestones' ? 'Marcos' : 'Ambientes'));
  readonly manageable = computed(() =>
    canChange(
      this.project(),
      this.kind() === 'milestones' ? 'milestone.manage' : 'environment.manage',
    ),
  );
  private readonly api = inject(ProjectApi);
  readonly operation = new OperationState(inject(DestroyRef));
  readonly editor = signal<Editor | null>(null);
  readonly details = signal<{ title: string; fields: { label: string; value: string }[] } | null>(
    null,
  );
  readonly confirmation = signal<{
    item: Item;
    action: 'complete' | 'remove';
    message: string;
  } | null>(null);
  readonly statuses = Object.entries(milestoneLabels).map(([value, label]) => ({ value, label }));
  readonly sorts = computed(() => [
    { value: 'name,asc', label: 'Nome A–Z' },
    { value: 'createdAt,desc', label: 'Mais recentes' },
    ...(this.kind() === 'milestones'
      ? [{ value: 'dueDate,asc', label: 'Prazo mais próximo' }]
      : []),
  ]);
  private filterActive: boolean | undefined;
  readonly list = new ListState<Item>(inject(DestroyRef), (query) =>
    this.api.resources(this.project().workspaceId, this.project().id, this.kind(), {
      ...query,
      active: this.filterActive,
    }),
  );
  active = '';
  category(item: Item) {
    return 'active' in item ? environmentCategories[item.category ?? 'OTHER'] : '';
  }
  ngOnInit(): void {
    this.list.query.sort = 'name,asc';
    this.list.load();
  }
  search(query: { q?: string; sort?: string; status?: string }): void {
    this.filterActive = this.active === '' ? undefined : this.active === 'true';
    this.list.search(query);
  }
  status(item: Item): string {
    return 'status' in item ? milestoneLabels[item.status] : item.active ? 'Ativo' : 'Inativo';
  }
  summary(item: Item): string {
    return 'status' in item
      ? `${calendarDate(item.startDate)} / ${calendarDate(item.dueDate)}`
      : item.description || '—';
  }
  editable(item: Item): boolean {
    return !('status' in item) || item.status !== 'COMPLETED';
  }
  completable(item: Item): boolean {
    return 'status' in item && (item.status === 'PLANNED' || item.status === 'IN_PROGRESS');
  }
  edit(item?: Item): void {
    if (!this.manageable() || (item && !this.editable(item))) return;
    const fields: EditorField[] = [nameField(item?.name), descriptionField(item?.description)];
    if (this.kind() === 'milestones') {
      const milestone = item as Milestone | undefined;
      fields.push(
        { key: 'startDate', label: 'Início', type: 'date', value: milestone?.startDate || '' },
        { key: 'dueDate', label: 'Prazo', type: 'date', value: milestone?.dueDate || '' },
      );
      if (milestone)
        fields.push({
          key: 'status',
          label: 'Situação',
          type: 'select',
          value: milestone.status,
          required: true,
          options: this.statuses.filter((status) => status.value !== 'COMPLETED'),
        });
    } else {
      fields.push(
        {
          key: 'category',
          label: 'Categoria',
          type: 'select',
          required: true,
          value: item ? ((item as ProjectEnvironment).category ?? 'OTHER') : '',
          options: [
            { value: '', label: 'Selecione a categoria' },
            ...Object.entries(environmentCategories).map(([value, label]) => ({ value, label })),
          ],
        },
        {
          key: 'active',
          label: 'Ambiente ativo',
          type: 'checkbox',
          value: item ? (item as ProjectEnvironment).active : true,
        },
      );
    }
    this.operation.error.set('');
    this.editor.set({ id: item?.id, fields });
  }
  consult(item: Item, editing = false): void {
    this.operation.run(
      this.api.resource(this.project().workspaceId, this.project().id, this.kind(), item.id),
      (response) => {
        if (editing) this.edit(response.data);
        else {
          const resource = response.data;
          this.details.set({
            title: resource.name,
            fields: [
              { label: 'Descrição', value: resource.description || '—' },
              { label: 'Situação', value: this.status(resource) },
              ...('status' in resource
                ? [
                    { label: 'Início', value: calendarDate(resource.startDate) },
                    { label: 'Prazo', value: calendarDate(resource.dueDate) },
                    {
                      label: 'Concluído em',
                      value: resource.completedAt
                        ? new Date(resource.completedAt).toLocaleString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                          })
                        : '—',
                    },
                  ]
                : [{ label: 'Categoria', value: this.category(resource) }]),
              {
                label: 'Criado em',
                value: new Date(resource.createdAt).toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                }),
              },
              {
                label: 'Atualizado em',
                value: new Date(resource.updatedAt).toLocaleString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                }),
              },
            ],
          });
        }
      },
    );
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }): void {
    const editor = this.editor();
    if (!editor || !this.manageable()) return;
    const values = event.values;
    const base = {
      name: String(values['name']).trim(),
      description: String(values['description']).trim() || null,
    };
    const project = this.project();
    if (this.kind() === 'milestones') {
      const startDate = String(values['startDate'] || '') || null,
        dueDate = String(values['dueDate'] || '') || null;
      for (const [key, value] of Object.entries({ startDate, dueDate })) {
        if (value && !validCalendarDate(value)) {
          event.form
            .get(key)
            ?.setErrors({ server: 'Informe uma data válida entre os anos 1000 e 9999.' });
          this.operation.error.set('Confira as datas do marco.');
          return;
        }
      }
      if (startDate && dueDate && startDate > dueDate) {
        event.form
          .get('dueDate')
          ?.setErrors({ server: 'O prazo deve ser igual ou posterior ao início.' });
        this.operation.error.set('O prazo não pode ser anterior ao início.');
        return;
      }
      const body = { ...base, startDate, dueDate };
      const status = values['status'];
      if (editor.id && !['PLANNED', 'IN_PROGRESS', 'CANCELLED'].includes(String(status))) return;
      this.operation.run(
        editor.id
          ? this.api.updateResource(project.workspaceId, project.id, 'milestones', editor.id, {
              ...body,
              status: status as 'PLANNED' | 'IN_PROGRESS' | 'CANCELLED',
            })
          : this.api.createResource(project.workspaceId, project.id, 'milestones', body),
        () => this.saved(),
        event.form,
      );
    } else {
      const category = String(values['category']);
      if (!(category in environmentCategories)) {
        event.form.get('category')?.setErrors({ server: 'Escolha a categoria do ambiente.' });
        return;
      }
      const body = {
        ...base,
        active: values['active'] === true,
        category: category as EnvironmentCategory,
      };
      this.operation.run(
        editor.id
          ? this.api.updateResource(
              project.workspaceId,
              project.id,
              'environments',
              editor.id,
              body,
            )
          : this.api.createResource(project.workspaceId, project.id, 'environments', body),
        () => this.saved(),
        event.form,
      );
    }
  }
  private saved(): void {
    this.editor.set(null);
    this.operation.success.set('Dados salvos.');
    this.list.load();
  }
  confirm(item: Item, action: 'complete' | 'remove'): void {
    if (!this.manageable() || (action === 'complete' && !this.completable(item))) return;
    this.operation.error.set('');
    this.confirmation.set({
      item,
      action,
      message:
        action === 'complete'
          ? `Concluir o marco ${item.name}? A conclusão preserva a data e impede futuras edições deste marco.`
          : `Excluir ${item.name}? O recurso sairá das consultas. ${this.kind() === 'environments' ? 'O nome continuará reservado e o ambiente será desativado.' : 'O histórico será preservado.'} Não há restauração nesta fase.`,
    });
  }
  execute(): void {
    const action = this.confirmation();
    if (
      !action ||
      !this.manageable() ||
      (action.action === 'complete' && !this.completable(action.item))
    )
      return;
    const project = this.project();
    if (action.action === 'complete')
      this.operation.run(this.api.complete(project.workspaceId, project.id, action.item.id), () =>
        this.completed(),
      );
    else
      this.operation.run(
        this.api.removeResource(project.workspaceId, project.id, this.kind(), action.item.id),
        () => this.completed(),
      );
  }
  private completed(): void {
    this.confirmation.set(null);
    this.operation.success.set('Alteração confirmada.');
    this.list.load();
  }
}
