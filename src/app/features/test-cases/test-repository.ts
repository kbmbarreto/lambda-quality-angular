import { AzureImport } from './azure-import';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
  computed,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { forkJoin, of, Subscription, finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { trimmedLength } from '../../shared/form-feedback';
import { SuiteTree, repositoryCounts } from './suite-tree';
import { RepositoryPicker } from './repository-picker';
import { RepositoryHistory } from './repository-location';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Project, canChange } from '../projects/project.models';
import { ProjectScope } from '../projects/project-scope';
import { ProjectFrame } from '../projects/project-frame';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Attachment, CustomField, ListQuery, Tag } from '../workspaces/workspace.models';
import { ListState, OperationState } from '../workspaces/workspace-feedback';
import { ListTools, PaginationControls } from '../workspaces/ui/list-tools';
import { TestCaseApi } from './test-case-api.service';
import {
  AzureImportResult,
  CaseQuery,
  RepositorySummary,
  TestCase,
  TestSuite,
  allPages,
  caseOptions,
  options,
  payloadFits,
  suiteLabel,
} from './test-case.models';
import { CaseDetail } from './case-detail';
import { CaseEditor, EditorResult } from './case-editor';
import { SuitePanel } from './suite-panel';

@Component({
  selector: 'app-test-repository-panel',
  imports: [
    AzureImport,
    FormsModule,
    ReactiveFormsModule,
    SuiteTree,
    ListTools,
    PaginationControls,
    SuitePanel,
    CaseEditor,
    CaseDetail,
  ],
  templateUrl: './test-repository.html',
})
export class TestRepositoryPanel implements OnInit {
  readonly project = input.required<Project>();
  readonly workspace = inject(WorkspaceContext);
  private readonly api = inject(TestCaseApi);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly history = inject(RepositoryHistory);
  readonly suiteState = new OperationState(this.destroyRef);
  readonly catalogState = new OperationState(this.destroyRef);
  readonly state = new OperationState(this.destroyRef);
  readonly suites = signal<TestSuite[]>([]);
  readonly definitions = signal<CustomField[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly attachments = signal<Attachment[]>([]);
  readonly selected = signal<TestCase | null>(null);
  readonly moveOnOpen = signal(false);
  readonly creating = signal(false);
  readonly importing = signal(false);
  readonly importResult = signal<AzureImportResult | null>(null);
  readonly listTools = viewChild(ListTools);
  imported(result: AzureImportResult) {
    this.importing.set(false);
    this.importResult.set(result);
    this.showImported();
  }
  showImported() {
    this.selected.set(null);
    this.managingSuites.set(false);
    this.suiteFilter = 'root';
    this.suiteSelection.set('root');
    this.tagFilter = this.priorityFilter = this.automationFilter = '';
    this.list.query = {
      page: 1,
      size: 20,
      sort: 'sequence,asc',
      status: 'DRAFT',
      root: true,
    } as CaseQuery;
    const tools = this.listTools();
    if (tools) {
      tools.q = '';
      tools.status = 'DRAFT';
      tools.sort = 'sequence,asc';
    }
    this.list.load();
    this.loadSummary();
  }
  readonly managingSuites = signal(false);
  readonly summaryState = new OperationState(this.destroyRef);
  readonly quickState = new OperationState(this.destroyRef);
  readonly summary = signal<RepositorySummary | null>(null);
  readonly createdCase = signal<TestCase | null>(null);
  readonly quickTitle = new FormControl('', {
    nonNullable: true,
    validators: [trimmedLength(1, 250)],
  });
  private summaryRequest?: Subscription;
  readonly suitePanel = viewChild(SuitePanel);
  readonly currentSuite = computed(() =>
    this.suites().find((suite) => suite.id === this.suiteSelection()),
  );
  readonly suiteSelection = signal('');
  readonly counts = computed(() => repositoryCounts(this.summary(), this.suites()));
  readonly childSuites = computed(() =>
    this.suites()
      .filter((suite) => suite.parentSuiteId === this.currentSuite()?.id && !suite.archivedAt)
      .sort((a, b) => a.position - b.position),
  );
  private suitesLoaded = false;
  private catalogsLoaded = false;
  readonly labels = caseOptions;
  readonly statuses = [
    ...options(caseOptions.status),
    { value: 'ARCHIVED', label: 'Arquivados' },
    { value: 'ALL', label: 'Todos' },
  ];
  readonly sorts = [
    { value: 'sequence,asc', label: 'Identificador crescente' },
    { value: 'title,asc', label: 'Título A–Z' },
    { value: 'createdAt,desc', label: 'Mais recentes' },
    { value: 'updatedAt,desc', label: 'Atualizados recentemente' },
  ];
  readonly priorities = options(caseOptions.priority);
  readonly automationOptions = options(caseOptions.automationStatus);
  suiteFilter = '';
  tagFilter = '';
  priorityFilter = '';
  automationFilter = '';
  readonly list = new ListState<TestCase>(this.destroyRef, (query) =>
    this.api.cases(this.project().workspaceId, this.project().id, query as CaseQuery),
  );
  ngOnInit() {
    if (!this.project().permissions.includes('testcase.read')) return;
    this.history.remember(this.project());
    this.list.query.sort = 'sequence,asc';
    this.list.load();
    this.loadSuites();
    this.loadCatalogs();
  }
  ready() {
    return (
      this.suitesLoaded &&
      this.catalogsLoaded &&
      !this.suiteState.busy() &&
      !this.catalogState.busy() &&
      !this.suiteState.error() &&
      !this.catalogState.error()
    );
  }
  can(permission: string) {
    return this.ready() && canChange(this.project(), permission);
  }
  activeDefinitions() {
    return this.definitions().filter((field) => !field.archivedAt);
  }
  suiteName(suite: TestSuite) {
    return suiteLabel(suite, this.suites());
  }
  loadSuites() {
    const p = this.project();
    this.suitesLoaded = false;
    this.suiteState.run(this.api.allSuites(p.workspaceId, p.id), (rows) => {
      this.suites.set(rows);
      this.suitesLoaded = true;
      this.loadSummary();
    });
  }
  loadCatalogs() {
    const w = this.project().workspaceId;
    this.catalogsLoaded = false;
    this.catalogState.run(
      forkJoin({
        fields: this.workspace.can('field.read')
          ? allPages((page) =>
              this.workspaceApi.list(w, 'custom-fields', {
                page,
                size: 100,
                status: 'ALL',
                sort: 'position,asc',
              }),
            )
          : of([] as CustomField[]),
        tags: this.workspace.can('tag.read')
          ? allPages((page) =>
              this.workspaceApi.list(w, 'tags', { page, size: 100, sort: 'name,asc' }),
            )
          : of([] as Tag[]),
        attachments: this.workspace.can('attachment.read')
          ? allPages((page) =>
              this.workspaceApi.list(w, 'attachments', { page, size: 100, sort: 'createdAt,desc' }),
            )
          : of([] as Attachment[]),
      }),
      (result) => {
        this.definitions.set(result.fields);
        this.tags.set(result.tags);
        this.attachments.set(result.attachments);
        this.catalogsLoaded = true;
      },
    );
  }
  loadSummary() {
    if (!this.suitesLoaded || this.summaryState.wait()) return;
    this.summaryRequest?.unsubscribe();
    this.summary.set(null);
    this.summaryState.error.set('');
    this.summaryState.busy.set(true);
    const p = this.project();
    this.summaryRequest = this.api
      .summary(p.workspaceId, p.id, this.list.query.status, this.suites())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.summaryState.busy.set(false)),
      )
      .subscribe({
        next: (response) => this.summary.set(response.data),
        error: (error) => this.summaryState.fail(error),
      });
  }
  count(id: string | null) {
    return this.summary() ? (this.counts().direct.get(id) ?? 0) : '—';
  }
  branchCount(id: string) {
    return this.summary() ? (this.counts().branches.get(id) ?? 0) : '—';
  }
  heading() {
    return (
      this.currentSuite()?.name ?? (this.suiteFilter === 'root' ? 'Sem suíte' : 'Todos os casos')
    );
  }
  createSuite() {
    this.suitePanel()?.edit(undefined, null);
  }
  canCreateHere() {
    return this.can('testcase.create') && !this.currentSuite()?.archivedAt;
  }
  quickAvailable() {
    return (
      this.workspace.can('field.read') &&
      !this.activeDefinitions().some((field) => field.target === 'TEST_CASE' && field.required)
    );
  }
  addQuickCase() {
    if (
      !this.canCreateHere() ||
      !this.quickAvailable() ||
      this.quickState.busy() ||
      this.quickState.wait()
    )
      return;
    this.quickTitle.markAsTouched();
    if (this.quickTitle.invalid) return;
    const p = this.project();
    const title = this.quickTitle.value.trim();
    const suiteId = this.currentSuite()?.id ?? null;
    this.quickState.run(this.api.create(p.workspaceId, p.id, { title, suiteId }), (response) => {
      this.createdCase.set(response.data);
      this.quickState.success.set(
        `${response.data.humanId} criado em ${this.heading() === 'Todos os casos' ? 'Sem suíte' : this.heading()}.`,
      );
      this.quickTitle.reset();
      this.changed();
    });
  }
  refreshRepository() {
    this.list.load();
    this.loadSuites();
  }
  search(query: ListQuery) {
    this.suiteSelection.set(this.suiteFilter);
    const previousStatus = this.list.query.status;
    this.list.search({
      ...query,
      suiteId: this.suiteFilter && this.suiteFilter !== 'root' ? this.suiteFilter : undefined,
      root: this.suiteFilter === 'root' ? true : undefined,
      tagId: this.tagFilter || undefined,
      priority: this.priorityFilter || undefined,
      automationStatus: this.automationFilter || undefined,
    } as CaseQuery);
    if (previousStatus !== this.list.query.status) this.loadSummary();
  }
  filterSuite(id: string) {
    if (this.quickState.busy() || this.list.state.wait() || this.creating()) return;
    this.suiteFilter = id;
    this.suiteSelection.set(id);
    this.selected.set(null);
    this.managingSuites.set(false);
    this.createdCase.set(null);
    this.search(this.list.query);
  }
  open(item: TestCase, associate = false) {
    if (this.state.busy() || this.state.wait()) return;
    this.selected.set(null);
    this.moveOnOpen.set(associate);
    const p = this.project();
    this.state.run(this.api.get(p.workspaceId, p.id, item.id), (response) =>
      this.selected.set(response.data),
    );
  }
  create() {
    if (!this.canCreateHere() || this.state.busy() || this.quickState.busy()) return;
    this.state.error.set('');
    this.creating.set(true);
  }
  save(result: EditorResult) {
    if (!this.can('testcase.create')) return;
    const p = this.project(),
      body = {
        ...result.definition,
        suiteId: result.suiteId,
        steps: result.steps,
        ...(this.workspace.can('field.read') ? { customFields: result.customFields } : {}),
      };
    if (!payloadFits(body)) {
      this.state.error.set(
        'O conteúdo excede 32 KiB. Reduza os textos ou adicione os passos após criar o caso.',
      );
      return;
    }
    this.state.run(
      this.api.create(p.workspaceId, p.id, body),
      (response) => {
        this.creating.set(false);
        this.selected.set(response.data);
        this.quickTitle.reset();
        this.changed();
      },
      result.form,
    );
  }
  changed() {
    this.loadSummary();
    this.list.load();
  }
  suitesChanged() {
    this.loadSuites();
    this.list.load();
  }
}
@Component({
  selector: 'app-test-repository',
  providers: [ProjectScope],
  imports: [ProjectFrame, RepositoryPicker, TestRepositoryPanel, RouterLink],
  template: `<app-project-frame title="Casos de teste">
    @if (scope.context.selected(); as project) {
      <app-repository-picker [project]="project" />
      @if (project.permissions.includes('testvault.read')) {
        <p>
          <a
            class="btn button-link"
            [routerLink]="[
              '/workspaces',
              project.workspaceId,
              'projects',
              project.id,
              'test-vault',
            ]"
            >Cofre de testes</a
          >
        </p>
      }
      @if (project.status === 'ARCHIVED') {
        <p class="message info" role="status">
          Projeto arquivado. Casos e suítes estão disponíveis para consulta; alterações estão
          bloqueadas.
        </p>
      }
      @if (project.permissions.includes('testcase.read')) {
        <app-test-repository-panel [project]="project" />
      } @else {
        <p class="message info">
          Sua conta não possui permissão para consultar casos de teste neste projeto.
        </p>
      }
    }
  </app-project-frame>`,
})
export class TestRepository {
  readonly scope = inject(ProjectScope);
}
