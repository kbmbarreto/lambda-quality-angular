import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Observable, mergeMap, from, toArray, forkJoin, of, concatMap, tap, defer } from 'rxjs';
import { ApiResponse } from '../../core/api.models';
import { ProjectApi } from '../projects/project-api.service';
import { Project, canChange } from '../projects/project.models';
import { TestCaseApi } from '../test-cases/test-case-api.service';
import { TestCase, payloadFits, allPages, caseOptions } from '../test-cases/test-case.models';
import { PaginationControls } from '../workspaces/ui/list-tools';
import { OperationState } from '../workspaces/workspace-feedback';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { FormDialog, nameField } from '../workspaces/ui/form-dialog';
import { ExecutionApi } from './execution-api.service';
import { ExecutionState } from './execution-feedback';
import { ExecutionConflict } from './execution-conflict';
import { ExecutionContextEditor } from './context-editor';
import { ExecutionCaseSelection } from './case-selection';
import { TestPlan, TestRun, planLabels } from './execution.models';
@Component({
  selector: 'app-plan-detail',
  imports: [
    DatePipe,
    PaginationControls,
    ConfirmDialog,
    FormDialog,
    ExecutionConflict,
    ExecutionContextEditor,
    ExecutionCaseSelection,
  ],
  templateUrl: './plan-detail.html',
})
export class PlanDetail implements OnInit {
  readonly project = input.required<Project>();
  readonly initial = input.required<TestPlan>();
  readonly closed = output<void>();
  readonly changed = output<void>();
  readonly openRun = output<TestRun>();
  readonly showRuns = output<TestPlan>();
  readonly api = inject(ExecutionApi);
  private readonly casesApi = inject(TestCaseApi);
  private readonly projectsApi = inject(ProjectApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = new ExecutionState(this.destroyRef);
  readonly read = new OperationState(this.destroyRef);
  readonly namesState = new OperationState(this.destroyRef);
  readonly contextState = new OperationState(this.destroyRef);
  readonly contextNames = signal<Record<string, string>>({});
  readonly plan = signal<TestPlan>(null!);
  readonly latest = signal<TestPlan | null>(null);
  readonly names = signal<Record<string, TestCase>>({});
  readonly editing = signal<TestPlan | null>(null);
  readonly action = signal<'activate' | 'complete' | 'archive' | null>(null);
  readonly creatingRun = signal(false);
  readonly latestRuns = signal<TestRun[]>([]);
  readonly selectionPage = signal(1);
  readonly pendingCases = signal<string[]>([]);
  readonly batchProgress = signal('');
  addSelected() {
    if (!this.draft() || !this.can('testcase.read') || this.locked()) return;
    const ids = [...new Set(this.pendingCases())].filter((id) => !this.ids().includes(id));
    if (!ids.length || ids.length + this.ids().length > 500) return;
    let completed = 0;
    this.batchProgress.set(`Incluindo 0 de ${ids.length} casos…`);
    this.state.run(
      from(ids).pipe(
        concatMap((id) =>
          defer(() => {
            const plan = this.plan();
            return this.api.addCase(plan.workspaceId, plan.projectId, plan.id, {
              version: plan.version,
              testCaseId: id,
            });
          }).pipe(
            tap((response) => {
              this.plan.set(response.data);
              this.pendingCases.update((current) => current.filter((value) => value !== id));
              this.batchProgress.set(`${++completed} de ${ids.length} inclusões confirmadas.`);
              this.changed.emit();
            }),
          ),
        ),
        toArray(),
      ),
      () => {
        this.state.success.set(`${completed} casos adicionados ao plano.`);
        this.loadNames();
      },
    );
  }
  readonly visibleCases = computed(() =>
    this.plan().cases.slice((this.selectionPage() - 1) * 20, this.selectionPage() * 20),
  );
  readonly selectionPagination = computed(() => ({
    page: this.selectionPage(),
    size: 20,
    totalItems: this.plan().cases.length,
    totalPages: Math.ceil(this.plan().cases.length / 20),
    hasNext: this.selectionPage() * 20 < this.plan().cases.length,
    hasPrevious: this.selectionPage() > 1,
  }));
  pageSelection(page: number) {
    if (this.locked()) return;
    this.selectionPage.set(page);
    this.loadNames();
  }
  readonly caseStatuses: Record<string, string> = { ...caseOptions.status, ARCHIVED: 'Arquivado' };
  readonly labels = planLabels;
  readonly runFields = [nameField()];
  ngOnInit() {
    this.plan.set(this.initial());
    this.loadNames();
    this.loadContext();
  }
  can(permission = 'testrun.manage') {
    return canChange(this.project(), permission);
  }
  locked() {
    return this.state.busy() || this.read.busy() || !!this.state.wait() || this.state.blocked();
  }
  draft() {
    return this.can() && this.plan().status === 'DRAFT';
  }
  ids() {
    return this.plan().cases.map((c) => c.testCaseId);
  }
  loadContext() {
    const p = this.plan();
    if (!p.milestoneId && !p.environmentId) return;
    this.contextState.run(
      forkJoin({
        milestones: allPages((page) =>
          this.projectsApi.resources(p.workspaceId, p.projectId, 'milestones', {
            page,
            size: 100,
            status: 'ALL',
            sort: 'name,asc',
          }),
        ),
        environments: allPages((page) =>
          this.projectsApi.resources(p.workspaceId, p.projectId, 'environments', {
            page,
            size: 100,
            sort: 'name,asc',
          }),
        ),
      }),
      (data) =>
        this.contextNames.set(
          Object.fromEntries(
            [...data.milestones, ...data.environments].map((item) => [item.id, item.name]),
          ),
        ),
    );
  }
  loadNames(force = false) {
    if (!this.project().permissions.includes('testcase.read') || !this.plan().cases.length) return;
    const lastPage = Math.max(1, Math.ceil(this.plan().cases.length / 20));
    if (this.selectionPage() > lastPage) this.selectionPage.set(lastPage);
    const ids = this.visibleCases()
      .map((c) => c.testCaseId)
      .filter((id) => force || !this.names()[id]);
    if (!ids.length) return;
    const p = this.project();
    this.namesState.run(
      from(ids).pipe(
        mergeMap((id) => this.casesApi.get(p.workspaceId, p.id, id), 4),
        toArray(),
      ),
      (rows) =>
        this.names.update((current) => ({
          ...current,
          ...Object.fromEntries(rows.map((row) => [row.data.id, row.data])),
        })),
    );
  }
  write(operation: Observable<ApiResponse<TestPlan>>, form?: FormGroup) {
    if (this.locked() || !this.can()) return;
    this.state.run(
      operation,
      (response) => {
        this.plan.set(response.data);
        this.latest.set(null);
        this.changed.emit();
        this.loadNames();
        this.loadContext();
      },
      form,
    );
  }
  edit() {
    if (!this.draft() || this.locked()) return;
    this.state.error.set('');
    this.editing.set(this.plan());
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    if (!this.draft() || this.locked()) return;
    const p = this.plan(),
      v = event.values;
    const body = {
      version: p.version,
      name: String(v['name']).trim(),
      description: String(v['description']).trim() || null,
      milestoneId: String(v['milestoneId']) || null,
      environmentId: String(v['environmentId']) || null,
    };
    if (!payloadFits(body)) {
      this.state.error.set('O conteúdo excede 32 KiB. Reduza os textos.');
      return;
    }
    this.state.run(
      this.api.updatePlan(p.workspaceId, p.projectId, p.id, body),
      (response) => {
        this.plan.set(response.data);
        this.editing.set(null);
        this.changed.emit();
        this.loadContext();
      },
      event.form,
    );
  }
  add(item: TestCase) {
    if (
      !this.draft() ||
      !this.can('testcase.read') ||
      this.locked() ||
      this.ids().includes(item.id) ||
      this.ids().length >= 500
    )
      return;
    const p = this.plan();
    this.write(
      this.api.addCase(p.workspaceId, p.projectId, p.id, {
        version: p.version,
        testCaseId: item.id,
      }),
    );
  }
  remove(id: string) {
    if (!this.draft() || this.locked()) return;
    const p = this.plan();
    this.write(this.api.removeCase(p.workspaceId, p.projectId, p.id, id, p.version));
  }
  move(index: number, delta: number) {
    if (!this.draft() || this.locked()) return;
    const ids = this.ids(),
      next = index + delta;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    const p = this.plan();
    this.write(this.api.orderCases(p.workspaceId, p.projectId, p.id, p.version, ids));
  }
  actionAllowed(action: 'activate' | 'complete' | 'archive') {
    const p = this.plan();
    return (
      this.can() &&
      (action === 'activate'
        ? p.status === 'DRAFT' && p.cases.length > 0 && this.can('testcase.read')
        : action === 'complete'
          ? p.status === 'ACTIVE'
          : p.status !== 'ARCHIVED')
    );
  }
  transition() {
    const action = this.action(),
      p = this.plan();
    if (!action || this.locked() || !this.can()) return;
    if (
      action === 'activate' &&
      (p.status !== 'DRAFT' || !p.cases.length || !this.can('testcase.read'))
    )
      return;
    if (action === 'complete' && p.status !== 'ACTIVE') return;
    if (action === 'archive' && p.status === 'ARCHIVED') return;
    this.state.run(
      this.api.planAction(p.workspaceId, p.projectId, p.id, action, p.version),
      (response) => {
        this.plan.set(response.data);
        this.action.set(null);
        this.changed.emit();
      },
    );
  }
  createRun(event: { values: Record<string, unknown>; form: FormGroup }) {
    const p = this.plan();
    if (this.locked() || !this.can() || !this.can('testcase.read') || p.status !== 'ACTIVE') return;
    this.state.run(
      this.api.planRun(
        p.workspaceId,
        p.projectId,
        p.id,
        p.version,
        String(event.values['name']).trim(),
      ),
      (response) => {
        this.creatingRun.set(false);
        this.changed.emit();
        this.openRun.emit(response.data);
      },
      event.form,
    );
  }
  reload() {
    if (this.read.busy() || this.state.busy()) return;
    this.latest.set(null);
    this.latestRuns.set([]);
    const p = this.plan();
    this.read.run(
      forkJoin({
        plan: this.api.plan(p.workspaceId, p.projectId, p.id),
        runs:
          this.creatingRun() && this.state.blocked()
            ? allPages((page) =>
                this.api.runs(p.workspaceId, p.projectId, {
                  page,
                  size: 100,
                  testPlanId: p.id,
                  sort: 'createdAt,desc',
                }),
              )
            : of([] as TestRun[]),
      }),
      (response) => {
        this.latestRuns.set(response.runs);
        if (this.state.blocked()) this.latest.set(response.plan.data);
        else {
          this.plan.set(response.plan.data);
          this.loadNames(true);
          this.loadContext();
        }
      },
    );
  }
  review() {
    const p = this.latest();
    if (!p || this.read.busy()) return;
    this.plan.set(p);
    this.pendingCases.update((ids) =>
      ids.filter((id) => !p.cases.some((c) => c.testCaseId === id)),
    );
    this.latest.set(null);
    this.state.blocked.set(false);
    this.state.error.set('');
    this.loadNames(true);
    this.loadContext();
    this.changed.emit();
  }
}
