import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormGroup } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiResponse } from '../../core/api.models';
import { Project, canChange } from '../projects/project.models';
import { options, payloadFits, allPages } from '../test-cases/test-case.models';
import { ListQuery, Page } from '../workspaces/workspace.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { EditorField, FormDialog } from '../workspaces/ui/form-dialog';
import { ConfirmDialog } from '../workspaces/ui/confirm-dialog';
import { ExecutionApi } from './execution-api.service';
import { ExecutionState } from './execution-feedback';
import { ExecutionConflict } from './execution-conflict';
import { RunSnapshot } from './run-snapshot';
import { TestReportImport } from './report-import';
import {
  ExecutionComment,
  ResultBody,
  RunCase,
  RunCaseQuery,
  RunStep,
  TestRun,
  TestResult,
  canPass,
  resultLabels,
  runLabels,
} from './execution.models';
interface RunView {
  run: TestRun;
  cases: Page<RunCase>;
  comments: Page<ExecutionComment>;
  selected: RunCase | null;
}
interface RunEditor {
  kind: 'case' | 'step' | 'comment';
  title: string;
  caseId?: string;
  stepId?: string;
  fields: EditorField[];
}
@Component({
  selector: 'app-run-detail',
  imports: [
    DatePipe,
    RouterLink,
    ListTools,
    PaginationControls,
    FormDialog,
    ConfirmDialog,
    ExecutionConflict,
    RunSnapshot,
    TestReportImport,
  ],
  templateUrl: './run-detail.html',
})
export class RunDetail implements OnInit {
  readonly project = input.required<Project>();
  readonly initial = input.required<TestRun>();
  readonly entryCaseId = input('');
  readonly closed = output<void>();
  readonly changed = output<void>();
  private readonly api = inject(ExecutionApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = new ExecutionState(this.destroyRef);
  readonly read = new OperationState(this.destroyRef);
  readonly run = signal<TestRun>(null!);
  readonly cases = signal<Page<RunCase> | null>(null);
  readonly comments = signal<Page<ExecutionComment> | null>(null);
  readonly selected = signal<RunCase | null>(null);
  readonly latest = signal<RunView | null>(null);
  readonly latestComments = signal<ExecutionComment[]>([]);
  readonly fresh = signal(false);
  readonly editor = signal<RunEditor | null>(null);
  readonly action = signal<'start' | 'complete' | 'abort' | null>(null);
  readonly canPass = canPass;
  readonly advanceAfterResult = signal(false);
  readonly focusMode = signal(false);
  readonly importing = signal(false);
  reportUpdated(run: TestRun) {
    this.run.set(run);
    this.fresh.set(false);
    this.changed.emit();
  }
  reportSettled() {
    this.fresh.set(false);
    this.reload();
  }

  private readonly caseBody = viewChild<ElementRef<HTMLElement>>('caseBody');
  private visibleCaseId: string | undefined;
  constructor() {
    effect(() => {
      const id = this.selected()?.id;
      const body = this.caseBody();
      if (body && id !== this.visibleCaseId) {
        body.nativeElement.scrollTop = 0;
        this.visibleCaseId = id;
      }
    });
  }
  readonly quickResults: TestResult[] = ['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'];
  readonly runs = runLabels;
  readonly results = resultLabels;
  readonly statuses = options(resultLabels);
  readonly caseSorts = [
    { value: 'position,asc', label: 'Ordem da execução' },
    { value: 'titleSnapshot,asc', label: 'Título A–Z' },
  ];
  caseQuery: RunCaseQuery = { page: 1, size: 20, sort: 'position,asc' };
  commentQuery: ListQuery = { page: 1, size: 20, sort: 'createdAt,asc' };
  ngOnInit() {
    this.run.set(this.initial());
    this.reload(this.entryCaseId() || undefined);
  }
  can(permission = 'testrun.execute') {
    return canChange(this.project(), permission);
  }
  locked() {
    return (
      this.importing() ||
      this.state.busy() ||
      this.read.busy() ||
      !!this.state.wait() ||
      this.state.blocked() ||
      !this.fresh()
    );
  }
  executable() {
    return this.can() && this.run().status === 'IN_PROGRESS';
  }
  private view(run: TestRun, selectedId = this.selected()?.id): Observable<RunView> {
    return forkJoin({
      cases: this.api.runCases(run.workspaceId, run.projectId, run.id, this.caseQuery),
      comments: this.api.comments(run.workspaceId, run.projectId, run.id, this.commentQuery),
      selected: selectedId
        ? this.api
            .runCase(run.workspaceId, run.projectId, run.id, selectedId)
            .pipe(map((r) => r.data))
        : of(null),
    }).pipe(map((data) => ({ ...data, run })));
  }
  private apply(view: RunView) {
    this.run.set(view.run);
    const firstLoad = this.cases() === null;
    this.cases.set(view.cases);
    this.comments.set(view.comments);
    this.selected.set(
      view.selected ??
        (firstLoad
          ? (view.cases.data.find((item) => item.result === 'NOT_TESTED') ??
            view.cases.data[0] ??
            null)
          : null),
    );
    this.fresh.set(true);
  }
  reload(selectedId = this.selected()?.id) {
    if (this.state.busy() || this.read.busy() || this.read.wait()) return;
    const run = this.run();
    this.fresh.set(false);
    this.latest.set(null);
    this.latestComments.set([]);
    this.read.run(
      this.api.run(run.workspaceId, run.projectId, run.id).pipe(
        switchMap((response) =>
          forkJoin({
            view: this.view(response.data, selectedId),
            history:
              this.state.blocked() && this.editor()?.kind === 'comment'
                ? allPages((page) =>
                    this.api.comments(run.workspaceId, run.projectId, run.id, {
                      page,
                      size: 100,
                      sort: 'createdAt,desc',
                    }),
                  )
                : of([] as ExecutionComment[]),
          }),
        ),
      ),
      (result) => {
        this.latestComments.set(result.history);
        if (this.state.blocked()) this.latest.set(result.view);
        else this.apply(result.view);
      },
    );
  }
  review() {
    const latest = this.latest();
    if (!latest || this.read.busy()) return;
    this.apply(latest);
    this.latest.set(null);
    this.state.blocked.set(false);
    this.state.error.set('');
    this.changed.emit();
  }
  searchCases(q: ListQuery) {
    if (this.locked()) return;
    this.caseQuery = {
      page: 1,
      size: 20,
      q: q.q,
      sort: q.sort,
      result: (q.status || undefined) as RunCaseQuery['result'],
    };
    this.selected.set(null);
    this.reloadFirstCase();
  }
  pageCases(page: number) {
    if (this.locked()) return;
    this.caseQuery = { ...this.caseQuery, page };
    this.selected.set(null);
    this.reloadFirstCase();
  }
  searchComments(q: ListQuery) {
    if (this.locked()) return;
    this.commentQuery = { page: 1, size: 20, q: q.q, sort: 'createdAt,asc' };
    this.reload();
  }
  pageComments(page: number) {
    if (this.locked()) return;
    this.commentQuery = { ...this.commentQuery, page };
    this.reload();
  }
  open(item: RunCase) {
    if (!this.locked()) this.reload(item.id);
  }
  executionPercent() {
    const summary = this.run().summary;
    return summary.total ? ((summary.total - summary.notTested) / summary.total) * 100 : 0;
  }
  nextCase() {
    if (this.locked()) return;
    const page = this.cases();
    if (!page) return;
    const items = page.data;
    const index = items.findIndex((item) => item.id === this.selected()?.id);
    const ordered = [...items.slice(index + 1), ...items.slice(0, Math.max(0, index))];
    const pending = ordered.find((item) => item.result === 'NOT_TESTED');
    const next = pending ?? items[index + 1];
    if (next) this.open(next);
    else if (page.meta.pagination.hasNext) {
      this.selected.set(null);
      this.caseQuery = { ...this.caseQuery, page: page.meta.pagination.page + 1 };
      this.reloadFirstCase();
    } else if (
      page.meta.pagination.hasPrevious &&
      this.run().summary.notTested > 0 &&
      (!this.caseQuery.result ||
        this.caseQuery.result === 'ALL' ||
        this.caseQuery.result === 'NOT_TESTED')
    ) {
      this.selected.set(null);
      this.caseQuery = { ...this.caseQuery, page: 1 };
      this.reloadFirstCase();
    } else this.state.success.set('Fim da fila atual. Revise os resultados ou conclua a execução.');
  }
  private reloadFirstCase() {
    this.cases.set(null);
    this.reload();
  }
  quickResult(result: TestResult, step?: RunStep) {
    const item = this.selected(),
      run = this.run();
    if (!item || this.locked() || !this.executable() || !this.quickResults.includes(result)) return;
    if (!step && result === 'PASSED' && !canPass(item)) {
      this.state.error.set('Conclua ou ignore todos os passos antes de passar o caso.');
      return;
    }
    // Shortcuts change only the result, preserving the existing notes and actual outcome.
    if (step) {
      const target = item.steps.find((s) => s.id === step.id);
      if (!target) return;
      const body = {
        version: run.version,
        result,
        comment: target.comment,
        actualResult: target.actualResult,
      };
      if (!this.fits(body)) return;
      this.write(
        this.api.stepResult(run.workspaceId, run.projectId, run.id, item.id, target.id, body),
      );
    } else {
      const body = { version: run.version, result, comment: item.comment };
      if (!this.fits(body)) return;
      this.write(
        this.api.caseResult(run.workspaceId, run.projectId, run.id, item.id, body),
        undefined,
        this.advanceAfterResult(),
      );
    }
  }
  canCreateDefect() {
    return (
      this.project().permissions.includes('defect.read') &&
      canChange(this.project(), 'defect.manage') &&
      this.project().permissions.includes('testrun.read')
    );
  }
  closeCase() {
    if (!this.locked()) this.selected.set(null);
  }
  editResult(step?: RunStep) {
    const item = this.selected();
    if (!item || !this.executable() || this.locked()) return;
    const target = step ?? item;
    this.state.error.set('');
    this.editor.set({
      kind: step ? 'step' : 'case',
      title: step ? `Resultado do passo ${step.position}` : 'Resultado explícito do caso',
      caseId: item.id,
      stepId: step?.id,
      fields: [
        {
          key: 'result',
          label: 'Resultado',
          type: 'select',
          required: true,
          value: target.result,
          options: options(resultLabels).map((option) => ({
            ...option,
            disabled: !step && option.value === 'PASSED' && !canPass(item),
          })),
        },
        ...(step
          ? [
              {
                key: 'actualResult',
                label: 'Resultado obtido',
                type: 'textarea' as const,
                max: 10000,
                value: step.actualResult ?? '',
              },
            ]
          : []),
        {
          key: 'comment',
          label: 'Comentário do resultado',
          type: 'textarea',
          max: 10000,
          value: target.comment ?? '',
        },
      ],
    });
  }
  comment(caseTarget = false, step?: RunStep | null) {
    if (!this.executable() || this.locked()) return;
    const item = this.selected();
    if (caseTarget && !item) return;
    this.state.error.set('');
    this.editor.set({
      kind: 'comment',
      title: step
        ? `Comentar passo ${step.position}`
        : caseTarget
          ? 'Comentar caso'
          : 'Comentar execução',
      caseId: caseTarget ? item!.id : undefined,
      stepId: step?.id,
      fields: [
        {
          key: 'text',
          label: 'Comentário no histórico',
          type: 'textarea',
          required: true,
          max: 10000,
        },
      ],
    });
  }
  private write(operation: Observable<ApiResponse<TestRun>>, form?: FormGroup, advance = false) {
    if (this.locked()) return;
    this.state.run(
      operation.pipe(
        tap((response) => {
          this.run.set(response.data);
          this.fresh.set(false);
          this.changed.emit();
        }),
        switchMap((response) =>
          this.view(response.data).pipe(
            catchError((error) => {
              this.state.blocked.set(true);
              return throwError(() => error);
            }),
          ),
        ),
      ),
      (view) => {
        this.apply(view);
        this.editor.set(null);
        this.action.set(null);
        this.state.success.set('Alteração confirmada e resultados atualizados.');
        if (advance) this.nextCase();
      },
      form,
    );
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    const editor = this.editor(),
      run = this.run();
    if (!editor || this.locked() || !this.executable()) return;
    const v = event.values;
    if (editor.kind === 'comment') {
      const body = {
        version: run.version,
        text: String(v['text']).trim(),
        ...(editor.caseId ? { runCaseId: editor.caseId } : {}),
        ...(editor.stepId ? { runStepId: editor.stepId } : {}),
      };
      if (!body.text || body.text.length > 10000 || !this.fits(body)) return;
      this.write(this.api.comment(run.workspaceId, run.projectId, run.id, body), event.form);
      return;
    }
    const item = this.selected();
    if (!item || item.id !== editor.caseId) return;
    const result = String(v['result']) as ResultBody['result'];
    if (!(result in resultLabels)) return;
    if (editor.kind === 'case' && result === 'PASSED' && !canPass(item)) {
      this.state.error.set('Conclua ou ignore todos os passos antes de passar o caso.');
      return;
    }
    const body: ResultBody = {
      version: run.version,
      result,
      comment: String(v['comment']).trim() || null,
    };
    if (editor.kind === 'step') {
      if (!item.steps.some((s) => s.id === editor.stepId)) return;
      const stepBody = { ...body, actualResult: String(v['actualResult']).trim() || null };
      if (!this.fits(stepBody)) return;
      this.write(
        this.api.stepResult(
          run.workspaceId,
          run.projectId,
          run.id,
          item.id,
          editor.stepId!,
          stepBody,
        ),
        event.form,
      );
    } else {
      if (!this.fits(body)) return;
      this.write(
        this.api.caseResult(run.workspaceId, run.projectId, run.id, item.id, body),
        event.form,
      );
    }
  }
  private fits(body: unknown) {
    if (payloadFits(body)) return true;
    this.state.error.set('O conteúdo excede 32 KiB. Reduza os textos.');
    return false;
  }
  transition() {
    const action = this.action(),
      run = this.run();
    if (!action || this.locked()) return;
    if (action === 'start' && (!this.can() || run.status !== 'CREATED')) return;
    if (action === 'complete' && (!this.executable() || run.summary.notTested > 0)) return;
    if (
      action === 'abort' &&
      (!this.can('testrun.manage') || !['CREATED', 'IN_PROGRESS'].includes(run.status))
    )
      return;
    this.write(this.api.runAction(run.workspaceId, run.projectId, run.id, action, run.version));
  }
}
