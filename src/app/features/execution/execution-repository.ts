import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { map, of } from 'rxjs';
import { validResourceId } from '../../shared/resource-id';
import { FormGroup } from '@angular/forms';
import { Project, canChange } from '../projects/project.models';
import { ProjectFrame } from '../projects/project-frame';
import { ProjectScope } from '../projects/project-scope';
import { options, payloadFits } from '../test-cases/test-case.models';
import { ListState, OperationState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { ExecutionApi } from './execution-api.service';
import { ExecutionState } from './execution-feedback';
import { ExecutionContextEditor } from './context-editor';
import { PlanDetail } from './plan-detail';
import { RunDetail } from './run-detail';
import { RunQuery, TestPlan, TestRun, planLabels, runLabels } from './execution.models';
@Component({
  selector: 'app-execution-repository-panel',
  imports: [DatePipe, ListTools, PaginationControls, ExecutionContextEditor, PlanDetail, RunDetail],
  templateUrl: './execution-repository.html',
})
export class ExecutionRepositoryPanel implements OnInit {
  readonly project = input.required<Project>();
  readonly entryRunId = input('');
  readonly entryCaseId = input('');
  private readonly api = inject(ExecutionApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = new OperationState(this.destroyRef);
  readonly createState = new ExecutionState(this.destroyRef);
  readonly tab = signal<'plans' | 'runs'>('plans');
  readonly plan = signal<TestPlan | null>(null);
  readonly run = signal<TestRun | null>(null);
  readonly creating = signal<'plan' | 'run' | null>(null);
  readonly planFilter = signal<TestPlan | null>(null);
  readonly plans = new ListState<TestPlan>(this.destroyRef, (q) =>
    this.api.plans(this.project().workspaceId, this.project().id, q),
  );
  readonly runs = new ListState<TestRun>(this.destroyRef, (q) =>
    this.api.runs(this.project().workspaceId, this.project().id, {
      ...q,
      testPlanId: this.planFilter()?.id,
    } as RunQuery),
  );
  readonly planLabels = planLabels;
  readonly runLabels = runLabels;
  readonly planStatuses = [...options(planLabels), { value: 'ALL', label: 'Todos' }];
  readonly runStatuses = [...options(runLabels), { value: 'ALL', label: 'Todas' }];
  readonly planSorts = [
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'name,asc', label: 'Nome A–Z' },
    { value: 'updatedAt,desc', label: 'Atualizados recentemente' },
  ];
  readonly runSorts = [
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'name,asc', label: 'Nome A–Z' },
    { value: 'startedAt,desc', label: 'Iniciadas recentemente' },
    { value: 'finishedAt,desc', label: 'Finalizadas recentemente' },
  ];
  ngOnInit() {
    this.plans.query.sort = 'createdAt,desc';
    this.runs.query.sort = 'createdAt,desc';
    if (this.entryRunId()) {
      if (
        !validResourceId(this.entryRunId()) ||
        (this.entryCaseId() && !validResourceId(this.entryCaseId()))
      ) {
        this.state.error.set('O link da execução contém identificadores inválidos.');
        return;
      }
      const p = this.project();
      this.state.run(this.api.run(p.workspaceId, p.id, this.entryRunId()), (response) => {
        this.run.set(response.data);
        this.tab.set('runs');
      });
    } else if (this.entryCaseId()) {
      this.state.error.set('Selecione uma execução para consultar o caso de origem.');
    } else this.plans.load();
  }
  can(permission = 'testrun.manage') {
    return canChange(this.project(), permission);
  }
  switchTab(tab: 'plans' | 'runs') {
    if (this.state.busy() || this.createState.busy()) return;
    this.tab.set(tab);
    this.plan.set(null);
    this.run.set(null);
    const list = tab === 'plans' ? this.plans : this.runs;
    list.query = { page: 1, size: 20, sort: 'createdAt,desc' };
    list.load();
  }
  openPlan(item: TestPlan) {
    const p = this.project();
    this.state.run(this.api.plan(p.workspaceId, p.id, item.id), (response) =>
      this.plan.set(response.data),
    );
  }
  openRun(item: TestRun) {
    const p = this.project();
    this.state.run(this.api.run(p.workspaceId, p.id, item.id), (response) => {
      this.plan.set(null);
      this.run.set(response.data);
      this.tab.set('runs');
    });
  }
  filterRuns(plan: TestPlan) {
    this.planFilter.set(plan);
    this.switchTab('runs');
  }
  clearFilter() {
    this.planFilter.set(null);
    this.runs.search({});
  }
  create(kind: 'plan' | 'run') {
    if (!this.can() || (kind === 'run' && !this.can('testcase.read')) || this.state.busy()) return;
    this.createState.error.set('');
    this.createState.blocked.set(false);
    this.creating.set(kind);
  }
  save(event: { values: Record<string, unknown>; form: FormGroup; caseIds: string[] }) {
    const kind = this.creating();
    if (
      !kind ||
      !this.can() ||
      this.createState.blocked() ||
      this.createState.busy() ||
      (kind === 'run' && (!this.can('testcase.read') || !event.caseIds.length))
    )
      return;
    const p = this.project(),
      v = event.values,
      common = {
        name: String(v['name']).trim(),
        milestoneId: String(v['milestoneId']) || null,
        environmentId: String(v['environmentId']) || null,
      };
    const body =
      kind === 'plan'
        ? {
            ...common,
            description: String(v['description']).trim() || null,
            ...(this.can('testcase.read') ? { caseIds: event.caseIds } : {}),
          }
        : { ...common, caseIds: event.caseIds };
    if (!payloadFits(body)) {
      this.createState.error.set('O conteúdo excede 32 KiB. Reduza os textos ou a seleção.');
      return;
    }
    if (kind === 'plan')
      this.createState.run(
        this.api.createPlan(p.workspaceId, p.id, body),
        (response) => {
          this.creating.set(null);
          this.plan.set(response.data);
          this.plans.load();
        },
        event.form,
      );
    else
      this.createState.run(
        this.api.createRun(p.workspaceId, p.id, { ...common, caseIds: event.caseIds }),
        (response) => {
          this.creating.set(null);
          this.run.set(response.data);
          this.tab.set('runs');
          this.runs.load();
        },
        event.form,
      );
  }
  closePlan() {
    this.plan.set(null);
    this.plans.load();
  }
  closeRun() {
    this.run.set(null);
    this.runs.load();
  }
}
@Component({
  selector: 'app-execution-repository',
  providers: [ProjectScope],
  imports: [ProjectFrame, ExecutionRepositoryPanel],
  template: `<app-project-frame title="Planos e execuções">
    @if (scope.context.selected(); as project) {
      @if (project.status === 'ARCHIVED') {
        <p class="message info">
          Projeto arquivado. Planos, execuções e resultados estão disponíveis para consulta.
        </p>
      }
      @if (project.permissions.includes('testrun.read')) {
        <!-- Each route target owns its requests, selections and drafts. -->
        @for (target of [entry()]; track target.key) {
          <app-execution-repository-panel
            [project]="project"
            [entryRunId]="target.runId"
            [entryCaseId]="target.runCaseId"
          />
        }
      } @else {
        <p class="message info">
          Sua conta não possui permissão para consultar planos e execuções neste projeto.
        </p>
      }
    }
  </app-project-frame>`,
})
export class ExecutionRepository {
  readonly scope = inject(ProjectScope);
  private readonly route = inject(ActivatedRoute);
  readonly entry = toSignal(
    (
      this.route.queryParamMap ?? of(this.route.snapshot.queryParamMap ?? convertToParamMap({}))
    ).pipe(
      map((params) => {
        const runId = params.get('runId') ?? '',
          runCaseId = params.get('runCaseId') ?? '';
        return { runId, runCaseId, key: JSON.stringify([runId, runCaseId]) };
      }),
    ),
    { initialValue: { runId: '', runCaseId: '', key: '' } },
  );
}
