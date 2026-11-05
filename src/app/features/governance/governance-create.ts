import {
  Component,
  DestroyRef,
  OnInit,
  input,
  output,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { catchError, map, of, switchMap, throwError } from 'rxjs';
import { Workspace } from '../workspaces/workspace.models';
import { FormDialog, EditorField, EditorChange } from '../workspaces/ui/form-dialog';
import { changeGoalEditor } from './goal-editor';
import { OperationState } from '../workspaces/workspace-feedback';
import { payloadFits } from '../test-cases/test-case.models';
import { GovernanceApi } from './governance-api.service';
import { GovernanceCatalogs } from './governance-catalogs.service';
import { GovernanceState } from './governance-feedback';
import { Kind, RecordItem, kindLabels } from './governance.models';
import { Catalogs, emptyCatalogs, recordFields, recordBody } from './governance-fields';
@Component({
  selector: 'app-governance-create',
  imports: [FormDialog],
  template: `@if (read.error()) {
      <p class="message error" role="alert">
        {{ read.error() }}
        @if (read.wait()) {
          Aguarde {{ read.wait() }}s.
        }
      </p>
      <button class="btn" type="button" [disabled]="read.busy() || !!read.wait()" (click)="load()">
        Consultar opções novamente</button
      ><button class="btn" type="button" (click)="closed.emit(false)">Cancelar criação</button>
    }
    @if (read.busy()) {
      <p role="status">Consultando opções disponíveis…</p>
    }
    @if (fields(); as fields) {
      <app-form-dialog
        [title]="'Criar · ' + labels[kind()]"
        [fields]="fields"
        [state]="state"
        [wide]="true"
        [blocked]="state.blocked() || !canCreate() || !!read.error() || !!read.wait()"
        [loading]="read.busy()"
        [hint]="hint()"
        (saved)="save($event)"
        (closed)="closed.emit(state.blocked())"
        (changed)="changeFields($event)"
      >
        @if (read.error()) {
          <p class="message error" role="alert">{{ read.error() }}</p>
          <button
            class="btn"
            type="button"
            [disabled]="read.busy() || !!read.wait()"
            (click)="load()"
          >
            Consultar opções novamente{{ read.wait() ? ' (' + read.wait() + 's)' : '' }}
          </button>
        }
        @if (state.blocked()) {
          <p class="message info">
            Não foi possível confirmar a criação. Feche o formulário e consulte a lista antes de
            criar novamente. A criação repetida pode duplicar o registro.
          </p>
        }
      </app-form-dialog>
    }`,
})
export class GovernanceCreate implements OnInit {
  readonly workspace = input.required<Workspace>();
  readonly kind = input.required<Kind>();
  readonly links = input<{
    frameworkId?: string;
    sectionId?: string;
    goalId?: string;
    controlAssessmentId?: string;
  }>({});
  readonly created = output<RecordItem>();
  readonly closed = output<boolean>();
  private readonly api = inject(GovernanceApi);
  private readonly catalogsApi = inject(GovernanceCatalogs);
  private readonly destroy = inject(DestroyRef);
  readonly state = new GovernanceState(this.destroy);
  readonly read = new OperationState(this.destroy);
  readonly fields = signal<EditorField[] | null>(null);
  readonly dialog = viewChild(FormDialog);
  readonly labels = kindLabels;
  catalogs: Catalogs = emptyCatalogs;
  ngOnInit() {
    this.load();
  }
  canCreate() {
    return (
      this.workspace().status === 'ACTIVE' &&
      this.workspace().permissions?.includes(
        this.kind() === 'assessments' ? 'governance.assess' : 'governance.manage',
      )
    );
  }
  hint() {
    return this.kind() === 'goals'
      ? 'A conclusão da meta acompanha as ações vinculadas. O critério define somente a métrica informativa: índice interno usa framework e escopo Workspace; outras métricas usam Projeto ou Workspace. Atualizar a métrica de Workspace exige acesso a todos os projetos ativos da fonte.'
      : this.kind() === 'assessments'
        ? 'A avaliação copiará o framework ativo e seus controles. A data é de calendário.'
        : this.kind() === 'frameworks'
          ? 'O framework nasce em rascunho. Crie seções e controles antes de ativá-lo. A descrição preserva o texto informado.'
          : 'Ações vinculadas atualizam automaticamente a conclusão da meta. O controle avaliado é preservado; o vínculo com a meta pode ser alterado enquanto a ação estiver aberta ou em andamento.';
  }
  load() {
    if (!this.canCreate()) return;
    const draft = this.dialog()?.form().getRawValue();
    this.read.run(
      this.catalogsApi.load(
        this.workspace(),
        this.kind(),
        draft ? String(draft['frameworkId'] ?? '') : this.links().frameworkId,
      ),
      (c) => {
        this.catalogs = c;
        const fields = recordFields(this.kind(), c, undefined, this.links());
        this.fields.set(
          fields.map((f) =>
            draft
              ? { ...f, value: draft[f.key] ?? f.value }
              : f.key === 'frameworkId' && this.kind() === 'assessments' && this.links().frameworkId
                ? { ...f, value: this.links().frameworkId }
                : f,
          ),
        );
      },
    );
  }
  changeFields(event: EditorChange) {
    if (this.kind() === 'goals')
      changeGoalEditor(
        event,
        this.catalogs,
        this.catalogsApi,
        this.read,
        this.workspace().id,
        (fields) => {
          if (this.fields()) this.fields.set(fields);
        },
      );
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    if (
      !this.canCreate() ||
      this.read.busy() ||
      this.read.error() ||
      this.read.wait() ||
      this.state.blocked() ||
      this.state.busy() ||
      this.state.wait()
    )
      return;
    const body = recordBody(this.kind(), event.values, event.form, this.catalogs);
    if (!body) return;
    if (!payloadFits(body)) {
      this.state.error.set('O conteúdo excede 32 KiB. Reduza os textos.');
      return;
    }
    this.state.run(
      this.api.create(this.workspace().id, this.kind(), body).pipe(
        switchMap((r) =>
          this.kind() === 'actions' &&
          'goalId' in r.data &&
          r.data.goalId &&
          this.workspace().permissions?.includes('governance.read')
            ? this.api.refreshActionGoals(this.workspace().id, [r.data.goalId]).pipe(
                map(() => r),
                catchError((error: unknown) => {
                  this.state.blocked.set(true);
                  return throwError(() => error);
                }),
              )
            : of(r),
        ),
      ),
      (r) => this.created.emit(r.data),
      event.form,
    );
  }
}
