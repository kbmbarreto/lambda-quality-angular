import {
  Component,
  DestroyRef,
  Injector,
  runInInjectionContext,
  OnInit,
  input,
  output,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { FormDialog, EditorField, EditorChange } from '../workspaces/ui/form-dialog';
import { changeGoalEditor } from './goal-editor';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { OperationState } from '../workspaces/workspace-feedback';
import { GovernanceApi } from './governance-api.service';
import { GovernanceCatalogs } from './governance-catalogs.service';
import { GovernanceSession } from './governance-session';
import { GovernanceSummary } from './governance-summary';
import { GovernanceConflict } from './governance-conflict';
import { FrameworkDefinition } from './framework-definition';
import { AssessmentControls } from './assessment-controls';
import { FrameworkTracking } from './framework-tracking';
import { GoalActions } from './goal-actions';
import { GoalActionCompletion } from './goal-action-progress';
import {
  Kind,
  RecordItem,
  Goal,
  Action,
  FrameworkBody,
  GoalBody,
  ActionBody,
  goalStatuses,
} from './governance.models';
import { Catalogs, emptyCatalogs, recordFields, recordBody } from './governance-fields';
export interface Creation {
  kind: Kind;
  links?: {
    frameworkId?: string;
    sectionId?: string;
    goalId?: string;
    controlAssessmentId?: string;
  };
}
@Component({
  selector: 'app-governance-detail',
  imports: [
    FormDialog,
    ConfirmDialog,
    GovernanceSummary,
    GovernanceConflict,
    FrameworkDefinition,
    AssessmentControls,
    FrameworkTracking,
    GoalActions,
    GoalActionCompletion,
  ],
  templateUrl: './governance-detail.html',
})
export class GovernanceDetail implements OnInit {
  readonly goalLabels = goalStatuses;
  readonly kind = input.required<Kind>();
  readonly initial = input.required<RecordItem>();
  readonly initialAssessmentId = input('');
  readonly initialTracking = input(false);
  readonly opened = output<{ kind: Kind; id: string }>();
  readonly frameworkTab = signal<'structure' | 'tracking'>('structure');
  readonly tracking = viewChild(FrameworkTracking);
  readonly goalActions = viewChild(GoalActions);
  readonly closed = output<void>();
  readonly changed = output<void>();
  readonly create = output<Creation>();
  private readonly injector = inject(Injector);
  private readonly api = inject(GovernanceApi);
  private readonly catalogsApi = inject(GovernanceCatalogs);
  private readonly workspace = inject(WorkspaceContext);
  readonly catalogRead = new OperationState(inject(DestroyRef));
  readonly editor = signal<EditorField[] | null>(null);
  readonly dialog = viewChild(FormDialog);
  readonly confirmation = signal<{ action: string; title: string; message: string } | null>(null);
  catalogs: Catalogs = emptyCatalogs;
  session!: GovernanceSession;
  readonly activeControl = (c: { active: boolean }) => c.active;
  ngOnInit() {
    if (this.initialTracking()) this.frameworkTab.set('tracking');
    this.session = runInInjectionContext(
      this.injector,
      () => new GovernanceSession(this.kind(), this.initial(), () => this.changed.emit()),
    );
    this.session.reload();
  }
  navigationBusy() {
    return (
      this.session.state.busy() ||
      this.session.read.busy() ||
      !!this.tracking()?.busy() ||
      !!this.goalActions()?.busy()
    );
  }
  createSectionGoal(sectionId: string) {
    const frameworkId =
      this.kind() === 'frameworks' ? this.session.item().id : this.session.assessment().frameworkId;
    this.create.emit({ kind: 'goals', links: { frameworkId, sectionId } });
  }
  canManage() {
    return (
      this.session.manageable() &&
      !this.goalActions()?.busy() &&
      !this.tracking()?.busy() &&
      !this.catalogRead.busy() &&
      !this.catalogRead.wait()
    );
  }
  editable() {
    return (
      this.canManage() &&
      this.kind() !== 'assessments' &&
      !['ARCHIVED', 'CANCELLED', 'DONE'].includes(this.session.item().status)
    );
  }
  edit() {
    if (!this.editable()) return;
    this.loadEditor();
  }
  loadEditor() {
    const w = this.workspace.selected();
    if (!w) return;
    const draft = this.dialog()?.form().getRawValue();
    this.session.state.error.set('');
    this.catalogRead.run(
      this.catalogsApi.load(
        w,
        this.kind(),
        this.kind() === 'goals'
          ? draft
            ? String(draft['frameworkId'] ?? '')
            : this.goal().frameworkId
          : null,
      ),
      (c) => {
        this.catalogs = c;
        this.editor.set(
          recordFields(this.kind(), c, this.session.item()).map((f) =>
            draft ? { ...f, value: draft[f.key] ?? f.value } : f,
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
        this.catalogRead,
        this.session.item().workspaceId,
        (fields) => {
          if (this.editor()) this.editor.set(fields);
        },
      );
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    if (!this.editor() || !this.editable() || this.catalogRead.error()) return;
    const body = recordBody(this.kind(), event.values, event.form, this.catalogs);
    if (!body) return;
    const s = this.session,
      i = s.item();
    const closed = () => this.editor.set(null);
    if (this.kind() === 'frameworks') {
      const update = { ...(body as FrameworkBody), version: i.version };
      s.write(
        this.api.update(i.workspaceId, 'frameworks', i.id, update),
        update,
        closed,
        event.form,
      );
    } else if (this.kind() === 'goals') {
      const update = { ...(body as GoalBody), version: i.version };
      // Historical owners/sections may no longer be assignable. An unchanged
      // association is preserved by omission, per the PATCH contract.
      if (update.ownerMemberId === (this.goal().ownerMemberId ?? null)) delete update.ownerMemberId;
      if (
        update.sectionId === (this.goal().sectionId ?? null) &&
        update.frameworkId === this.goal().frameworkId &&
        update.goalType === this.goal().goalType
      )
        delete update.sectionId;
      s.write(this.api.update(i.workspaceId, 'goals', i.id, update), update, closed, event.form);
    } else if (this.kind() === 'actions') {
      const update = {
        ...(body as Omit<ActionBody, 'goalId' | 'controlAssessmentId'>),
        version: i.version,
      };
      s.write(this.api.update(i.workspaceId, 'actions', i.id, update), update, closed, event.form);
    }
  }
  request(action: string) {
    const s = this.session,
      i = s.item();
    if (s.locked()) return;
    if (this.kind() === 'assessments') {
      if (
        !s.canAssess() ||
        !((action === 'start' && i.status === 'DRAFT') || (action === 'close' && this.canClose()))
      )
        return;
    } else if (!this.canManage()) return;
    const messages: Record<string, [string, string]> = {
      activate: [
        'Ativar framework',
        'Ativar esta definição com seus controles ativos? Novas avaliações preservarão uma cópia dela.',
      ],
      archive: [
        'Arquivar framework',
        'Arquivar esta definição permanentemente? As avaliações existentes serão preservadas.',
      ],
      start: [
        'Iniciar avaliação',
        'Iniciar a avaliação para classificar controles e vincular evidências?',
      ],
      close: [
        'Fechar avaliação',
        'Fechar esta avaliação permanentemente? Resultados e evidências ficarão disponíveis apenas para consulta.',
      ],
      calculate: [
        'Atualizar métrica informativa',
        'Atualizar o resultado usando as fontes atuais autorizadas? A conclusão da meta continuará baseada nas ações vinculadas.',
      ],
      cancel: [
        'Cancelar registro',
        'Cancelar permanentemente este registro? O histórico e os vínculos serão preservados.',
      ],
      progress: ['Iniciar ação de melhoria', 'Marcar esta ação como Em andamento?'],
      complete: [
        'Concluir ação de melhoria',
        'Concluir permanentemente esta ação? A meta vinculada terá sua conclusão atualizada. As avaliações permanecerão preservadas.',
      ],
    };
    const m = messages[action];
    if (m) {
      s.state.error.set('');
      this.confirmation.set({ action, title: m[0], message: m[1] });
    }
  }
  canClose() {
    const s = this.session;
    return (
      s.canAssess() &&
      s.assessment().status === 'IN_PROGRESS' &&
      s.view().assessed.length === s.assessment().index.totalControls &&
      s
        .view()
        .assessed.every(
          (c) =>
            c.status !== 'NOT_ASSESSED' &&
            (c.status !== 'NOT_APPLICABLE' || !!c.justification?.trim()),
        )
    );
  }
  confirm() {
    const s = this.session,
      c = this.confirmation(),
      i = s.item();
    if (!c || s.locked()) return;
    const action = c.action,
      body = { version: i.version },
      done = () => this.confirmation.set(null);
    if (this.kind() === 'assessments') {
      if (
        !s.canAssess() ||
        (action === 'close' && !this.canClose()) ||
        (action === 'start' && i.status !== 'DRAFT')
      )
        return;
      if (action === 'start' || action === 'close')
        s.write(this.api.assessmentAction(i.workspaceId, i.id, action, i.version), body, done);
      return;
    }
    if (!this.canManage()) return;
    if (this.kind() === 'frameworks') {
      if (i.status === 'ARCHIVED') return;
      if (
        action === 'activate' &&
        (i.status !== 'DRAFT' || !s.view().controls.some((c) => c.active))
      )
        return;
      if (action === 'activate' || action === 'archive') {
        const b = {
          ...body,
          status: action === 'activate' ? ('ACTIVE' as const) : ('ARCHIVED' as const),
        };
        s.write(this.api.update(i.workspaceId, 'frameworks', i.id, b), b, done);
      }
    } else if (this.kind() === 'goals') {
      if (i.status === 'CANCELLED') return;
      if (action === 'calculate')
        s.write(this.api.calculate(i.workspaceId, i.id, i.version), body, done);
      else if (action === 'cancel') {
        const b = { ...body, status: 'CANCELLED' as const };
        s.write(this.api.update(i.workspaceId, 'goals', i.id, b), b, done);
      }
    } else if (this.kind() === 'actions') {
      if (['DONE', 'CANCELLED'].includes(i.status)) return;
      if (action === 'complete')
        s.write(this.api.complete(i.workspaceId, i.id, i.version), body, done);
      else if (action === 'cancel' || (action === 'progress' && i.status === 'OPEN')) {
        const b = {
          ...body,
          status: action === 'cancel' ? ('CANCELLED' as const) : ('IN_PROGRESS' as const),
        };
        s.write(this.api.update(i.workspaceId, 'actions', i.id, b), b, done);
      }
    }
  }
  goal() {
    return this.session.item() as Goal;
  }
  action() {
    return this.session.item() as Action;
  }
}
