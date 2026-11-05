import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { forkJoin, map, of } from 'rxjs';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { validResourceId } from '../../shared/resource-id';
import { Project, canChange } from '../projects/project.models';
import { ProjectScope } from '../projects/project-scope';
import { ProjectFrame } from '../projects/project-frame';
import { ExecutionApi } from '../execution/execution-api.service';
import { RunCase, TestRun, runLabels } from '../execution/execution.models';
import { RunSnapshot } from '../execution/run-snapshot';
import { caseOptions, options, payloadFits } from '../test-cases/test-case.models';
import { ListQuery } from '../workspaces/workspace.models';
import { ListState, OperationState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { DefectApi } from './defect-api.service';
import {
  Defect,
  DefectNavigation,
  DefectQuery,
  DefectSeverity,
  FailureDefect,
  defectStatuses,
} from './defect.models';
import { DefectState } from './defect-feedback';
import { DefectDetail } from './defect-detail';
import { DefectEditor, DefectEditorResult } from './defect-editor';
import { DefectEnvironments, environmentBody } from './defect-environments';
import { ProjectEnvironment, environmentCategories } from '../projects/project.models';
import { DefectAnalyticsPanel } from './defect-analytics';
const emptyNavigation: DefectNavigation = {
  defectId: '',
  runId: '',
  runCaseId: '',
  testRunCaseId: '',
  key: '',
};
@Component({
  selector: 'app-defect-repository-panel',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ListTools,
    PaginationControls,
    RunSnapshot,
    DefectDetail,
    DefectEditor,
  ],
  templateUrl: './defect-repository.html',
})
export class DefectRepositoryPanel implements OnInit {
  readonly project = input.required<Project>();
  readonly navigation = input<DefectNavigation>(emptyNavigation);
  private readonly api = inject(DefectApi);
  private readonly environmentsApi = inject(DefectEnvironments);
  readonly environments = signal<ProjectEnvironment[]>([]);
  readonly environmentRead = new OperationState(inject(DestroyRef));
  readonly categories = environmentCategories;
  environmentFilter = '';
  private readonly runsApi = inject(ExecutionApi);
  private readonly workspace = inject(WorkspaceContext);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = new OperationState(this.destroyRef);
  readonly originState = new OperationState(this.destroyRef);
  readonly createState = new DefectState(this.destroyRef);
  readonly selected = signal<Defect | null>(null);
  readonly detail = viewChild(DefectDetail);
  readonly origin = signal<{ run: TestRun; item: RunCase } | null>(null);
  readonly creating = signal<{ failure: RunCase | null } | null>(null);
  readonly sourceFilter = signal('');
  readonly navigationError = signal('');
  severityFilter = '';
  readonly statuses = [...options(defectStatuses), { value: 'ALL', label: 'Todos' }];
  readonly severities = options(caseOptions.severity);
  readonly severityLabels = caseOptions.severity;
  readonly statusLabels = defectStatuses;
  readonly runLabels = runLabels;
  readonly sorts = [
    { value: 'sequence,asc', label: 'Identificador crescente' },
    { value: 'title,asc', label: 'Título A–Z' },
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'updatedAt,desc', label: 'Atualizados recentemente' },
  ];
  readonly list = new ListState<Defect>(this.destroyRef, (query) =>
    this.api.list(this.project().workspaceId, this.project().id, {
      ...query,
      severity: this.severityFilter || undefined,
      testRunCaseId: this.sourceFilter() || undefined,
      environmentId: this.environmentFilter || undefined,
    } as DefectQuery),
  );
  ngOnInit() {
    const nav = this.navigation();
    if (
      [nav.defectId, nav.runId, nav.runCaseId, nav.testRunCaseId].some(
        (value) => value && !validResourceId(value),
      ) ||
      !!nav.runId !== !!nav.runCaseId
    ) {
      this.navigationError.set(
        'O link contém identificadores inválidos ou uma origem incompleta. Abra a lista de defeitos ou selecione a falha na execução.',
      );
      return;
    }
    if (nav.testRunCaseId) {
      if (!this.canReadRuns()) {
        this.navigationError.set(
          'Consultar defeitos por caso da execução exige permissão para ler execuções.',
        );
        return;
      }
      this.sourceFilter.set(nav.testRunCaseId);
    }
    this.list.query.sort = 'sequence,asc';
    this.list.load();
    this.loadEnvironments();
    if (nav.defectId) this.openId(nav.defectId);
    else if (nav.runCaseId) this.loadOrigin();
  }
  canManage() {
    return canChange(this.project(), 'defect.manage');
  }
  loadEnvironments() {
    this.environmentRead.run(this.environmentsApi.load(this.project()), (rows) =>
      this.environments.set(rows),
    );
  }
  canReadRuns() {
    return this.project().permissions.includes('testrun.read');
  }
  canReadFiles() {
    return (
      this.workspace.selected()?.id === this.project().workspaceId &&
      this.workspace.can('attachment.read')
    );
  }
  search(query: ListQuery) {
    this.list.search(query);
  }
  clearFilter() {
    this.sourceFilter.set('');
    this.list.search({});
  }
  openId(id: string) {
    const p = this.project();
    this.state.run(this.api.get(p.workspaceId, p.id, id), (response) =>
      this.selected.set(response.data),
    );
  }
  open(item: Defect) {
    if (!this.state.busy() && !this.state.wait()) this.openId(item.id);
  }
  changed() {
    this.list.load();
  }
  close() {
    this.selected.set(null);
    this.list.load();
  }
  loadOrigin() {
    if (!this.canReadRuns() || this.createState.busy()) return;
    const nav = this.navigation(),
      p = this.project();
    this.origin.set(null);
    this.originState.run(
      forkJoin({
        run: this.runsApi.run(p.workspaceId, p.id, nav.runId),
        item: this.runsApi.runCase(p.workspaceId, p.id, nav.runId, nav.runCaseId),
      }),
      (response) => {
        const run = response.run.data,
          item = response.item.data;
        if (
          run.id !== nav.runId ||
          item.id !== nav.runCaseId ||
          run.workspaceId !== p.workspaceId ||
          run.projectId !== p.id ||
          item.workspaceId !== p.workspaceId ||
          item.projectId !== p.id ||
          item.testRunId !== run.id
        ) {
          this.originState.error.set('A origem não está disponível neste projeto.');
          return;
        }
        this.origin.set({ run, item });
      },
    );
  }
  canUseOrigin() {
    return (
      this.canManage() &&
      this.canReadRuns() &&
      this.origin()?.item.result === 'FAILED' &&
      !this.originState.busy() &&
      !this.originState.wait()
    );
  }
  create(fromFailure = false) {
    if (
      !this.canManage() ||
      this.state.busy() ||
      this.createState.busy() ||
      (this.createState.blocked() &&
        (this.list.state.busy() || this.list.state.wait() || this.list.state.error())) ||
      (fromFailure && !this.canUseOrigin())
    )
      return;
    this.createState.error.set('');
    this.createState.blocked.set(false);
    this.creating.set({ failure: fromFailure ? this.origin()!.item : null });
  }
  save(event: DefectEditorResult) {
    const creating = this.creating();
    if (
      !creating ||
      !this.canManage() ||
      this.createState.busy() ||
      this.createState.wait() ||
      this.createState.blocked()
    )
      return;
    if (
      event.attachmentIds.length &&
      (!this.canReadFiles() ||
        event.attachmentIds.length > 100 ||
        new Set(event.attachmentIds).size !== event.attachmentIds.length)
    )
      return;
    const p = this.project(),
      v = event.values,
      metadata = {
        title: String(v['title']).trim(),
        description: String(v['description']).trim() || null,
        severity: String(v['severity']) as DefectSeverity,
      },
      attachments = event.attachmentIds.length ? { attachmentIds: event.attachmentIds } : {};
    const environment = environmentBody(v, event.form);
    if (!environment) return;
    if (creating.failure) {
      const source = creating.failure;
      if (!this.canUseOrigin() || this.origin()?.item.id !== source.id) return;
      const body: FailureDefect = {
        testRunCaseId: source.id,
        ...attachments,
        ...environment,
        ...(metadata.title !== source.titleSnapshot ? { title: metadata.title } : {}),
        ...(metadata.severity !== source.severitySnapshot ? { severity: metadata.severity } : {}),
        ...(metadata.description !== source.comment ? { description: metadata.description } : {}),
      };
      if (!this.fits(body)) return;
      this.createState.run(
        this.api.fromFailure(p.workspaceId, p.id, body),
        (response) => {
          this.creating.set(null);
          this.selected.set(response.data);
          this.list.load();
        },
        event.form,
      );
    } else {
      const body = { ...metadata, ...attachments, ...environment };
      if (!this.fits(body)) return;
      this.createState.run(
        this.api.create(p.workspaceId, p.id, body),
        (response) => {
          this.creating.set(null);
          this.selected.set(response.data);
          this.list.load();
        },
        event.form,
      );
    }
  }
  private fits(body: unknown) {
    if (payloadFits(body)) return true;
    this.createState.error.set('O conteúdo excede 32 KiB. Reduza os textos ou os anexos.');
    return false;
  }
  closeCreation() {
    this.creating.set(null);
    if (this.createState.blocked()) this.list.load();
  }
  resetNavigation() {
    void this.router.navigate([
      '/workspaces',
      this.project().workspaceId,
      'projects',
      this.project().id,
      'defects',
    ]);
  }
}
@Component({
  selector: 'app-defect-repository',
  providers: [ProjectScope],
  imports: [ProjectFrame, DefectRepositoryPanel, DefectAnalyticsPanel],
  template: `<app-project-frame title="Defeitos">
    @if (scope.context.selected(); as project) {
      @if (project.status === 'ARCHIVED') {
        <p class="message info">
          Projeto arquivado. Defeitos e vínculos estão disponíveis para consulta; alterações estão
          bloqueadas.
        </p>
      }
      @if (project.permissions.includes('defect.read')) {
        <nav class="workspace-tabs" aria-label="Defeitos e indicadores">
          <button
            type="button"
            [class.active]="tab() === 'list'"
            [disabled]="navigationBusy()"
            (click)="tab.set('list')"
          >
            Defeitos</button
          ><button
            type="button"
            [class.active]="tab() === 'analytics'"
            [disabled]="navigationBusy()"
            (click)="tab.set('analytics')"
          >
            Indicadores de bugs
          </button>
        </nav>
        @if (tab() === 'analytics') {
          <app-defect-analytics
            [workspaceId]="project.workspaceId"
            [initialProjectId]="project.id"
          />
        } @else {
          @for (nav of [navigation()]; track nav.key) {
            <app-defect-repository-panel [project]="project" [navigation]="nav" />
          }
        }
      } @else {
        <p class="message info">
          Sua conta não possui permissão para consultar defeitos neste projeto.
        </p>
      }
    }
  </app-project-frame>`,
})
export class DefectRepository {
  readonly scope = inject(ProjectScope);
  readonly tab = signal<'list' | 'analytics'>('list');
  readonly panel = viewChild(DefectRepositoryPanel);
  navigationBusy() {
    const panel = this.panel();
    return (
      !!panel &&
      (panel.createState.busy() ||
        panel.state.busy() ||
        !!panel.creating() ||
        !!panel.detail()?.state.busy() ||
        !!panel.detail()?.read.busy())
    );
  }
  private readonly route = inject(ActivatedRoute);
  readonly navigation = toSignal(
    (
      this.route.queryParamMap ?? of(this.route.snapshot.queryParamMap ?? convertToParamMap({}))
    ).pipe(
      map((params) => {
        const values = {
          defectId: params.get('defectId') ?? '',
          runId: params.get('fromRunId') ?? '',
          runCaseId: params.get('fromRunCaseId') ?? '',
          testRunCaseId: params.get('testRunCaseId') ?? '',
        };
        return { ...values, key: JSON.stringify(values) };
      }),
    ),
    { initialValue: emptyNavigation },
  );
}
