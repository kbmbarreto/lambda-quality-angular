import { DecimalPipe, registerLocaleData } from '@angular/common';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import localePt from '@angular/common/locales/pt';
import { Component, DestroyRef, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppShell } from '../../shared/app-shell';
import { allPages } from '../test-cases/test-case.models';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Workspace } from '../workspaces/workspace.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { defectStatuses } from '../defects/defect.models';
import { resultLabels, TestResult } from '../execution/execution.models';
import { DashboardApi } from './dashboard-api.service';
import { DashboardOverview, DashboardPeriod, dashboardLink } from './dashboard.models';
import { FrameworkGoals } from './framework-goals';
import { GoalActionCompletion } from '../governance/goal-action-progress';
import { AuthService } from '../../core/auth.service';
import { DashboardPreferences } from './dashboard-preferences';
import { Subject, takeUntil, catchError, throwError } from 'rxjs';
import { GoalMetric, metricReferencePercent } from './goal-metric';
import { DashboardProjects } from './dashboard-projects';
import { OpenDefects } from './open-defects.service';
import { DefectApi } from '../defects/defect-api.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

registerLocaleData(localePt);

@Component({
  selector: 'app-home',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    AppShell,
    FrameworkGoals,
    GoalActionCompletion,
    GoalMetric,
    DashboardProjects,
  ],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './home.html',
})
export class Home {
  private readonly api = inject(DashboardApi);
  private readonly openDefectsApi = inject(OpenDefects);
  private readonly cancelOpenDefects = new Subject<void>();
  readonly openDefectsState = new OperationState(inject(DestroyRef));
  readonly openDefects = signal<number | null>(null);
  private readonly workspacesApi = inject(WorkspaceApi);
  private readonly preferences = inject(DashboardPreferences);
  private readonly userId = inject(AuthService).user()?.id;
  private readonly savedFilters = this.preferences.read(this.userId);
  private readonly cancelOverview = new Subject<void>();
  private restoreAllPeriod = this.savedFilters.days === 'ALL';
  readonly state = new OperationState(inject(DestroyRef));
  readonly workspaceState = new OperationState(inject(DestroyRef));
  readonly workspaces = signal<Workspace[]>([]);
  readonly data = signal<DashboardOverview | null>(null);
  readonly unavailable = signal(false);
  readonly supportsAllPeriod = signal(false);
  readonly filterNotice = signal('');
  readonly storageNotice = signal('');
  readonly projectRefresh = signal(0);
  readonly overviewPeriod = computed(() => this.data()?.period.days);
  readonly link = dashboardLink;
  readonly goalStatuses = {
    ACTIVE: 'Em andamento',
    ACHIEVED: 'Atingida',
    MISSED: 'Não atingida',
    CANCELLED: 'Cancelada',
  };
  readonly goalSummary = computed(() => {
    const goals = this.data()?.governance;
    return goals == null
      ? null
      : {
          active: goals.filter((g) => g.status === 'ACTIVE').length,
          achieved: goals.filter((g) => g.status === 'ACHIEVED').length,
          missed: goals.filter((g) => g.status === 'MISSED').length,
        };
  });
  days: DashboardPeriod = this.savedFilters.days === 'ALL' ? 30 : this.savedFilters.days;
  workspaceId = this.savedFilters.workspaceId;
  readonly metrics = computed(() => {
    const data = this.data();
    return [
      {
        key: 'testCases',
        label: 'Casos de teste',
        hint: 'Somente casos ativos (ACTIVE)',
        icon: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5',
        ...data?.metrics.activeTestCases,
      },
      {
        key: 'executions',
        label: 'Execuções',
        hint: 'Criadas no período',
        icon: 'M8 5l12 7-12 7z',
        ...data?.metrics.executions,
      },
      {
        key: 'defects',
        label: 'Defeitos',
        hint: this.openDefectsState.busy()
          ? 'Consultando defeitos abertos…'
          : this.openDefectsState.error() || this.openDefects() === null
            ? 'Contagem de abertos indisponível'
            : 'Abertos (OPEN) · posição atual',
        icon: 'M9 8h6v10H9z M10 4h4v4 M4 9h5 M15 9h5 M4 15h5 M15 15h5 M7 21l3-3 M17 21l-3-3',
        value: this.openDefects(),
        previousValue: null,
      },
      {
        key: 'coverage',
        label: 'Cobertura de automação',
        hint: 'Casos ativos automatizados',
        icon: 'M5 20v-6h3v6 M11 20V9h3v11 M17 20V4h3v16',
        ...data?.metrics.automationCoverage,
      },
    ];
  });
  readonly results = computed(() => {
    const values = this.data()?.results;
    const total = values ? Object.values(values).reduce((sum, n) => sum + n, 0) : 0;
    const colors: Record<TestResult, string> = {
      PASSED: '#28a660',
      FAILED: '#e85245',
      BLOCKED: '#eaa51b',
      SKIPPED: '#8797b0',
      NOT_TESTED: '#448eef',
    };
    let offset = 0;
    const rows = (['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED', 'NOT_TESTED'] as TestResult[]).map(
      (key) => {
        const count = values?.[key] ?? 0;
        const percent = total ? (count / total) * 100 : 0;
        const row = {
          key,
          label: resultLabels[key],
          count,
          percent,
          offset: -offset,
          color: colors[key],
        };
        offset += percent;
        return row;
      },
    );
    return { total, rows };
  });
  readonly defects = computed(() => {
    const counts = this.data()?.defectsByStatus;
    const max = counts ? Math.max(1, ...Object.values(counts)) : 1;
    return Object.entries(defectStatuses).map(([key, label], i) => ({
      key,
      label,
      count: counts?.[key as keyof typeof defectStatuses] ?? 0,
      height: ((counts?.[key as keyof typeof defectStatuses] ?? 0) / max) * 100,
      color: ['#e85245', '#eaa51b', '#448eef', '#28a660', '#8797b0'][i],
    }));
  });
  constructor() {
    inject(DefectApi)
      .inventoryChanged.pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (!this.savedFilters.workspaceId || !this.workspaceState.busy()) this.loadOpenDefects();
      });
    this.workspaceState.run(
      allPages((page) =>
        this.workspacesApi.listWorkspaces({ page, size: 100, sort: 'name,asc' }),
      ).pipe(
        catchError((error: unknown) => {
          if (this.savedFilters.workspaceId) {
            this.workspaceId = '';
            this.filterNotice.set(
              'Não foi possível restaurar o Workspace salvo. Exibindo todos os seus Workspaces.',
            );
            this.refresh();
          }
          return throwError(() => error);
        }),
      ),
      (rows) => {
        const available = rows.filter((workspace) => workspace.status === 'ACTIVE');
        this.workspaces.set(available);
        if (this.workspaceId && !available.some((w) => w.id === this.workspaceId)) {
          this.workspaceId = '';
          this.preferences.save(this.userId, { days: this.savedFilters.days, workspaceId: '' });
          this.filterNotice.set(
            'O Workspace salvo não está disponível. Exibindo todos os seus Workspaces.',
          );
        }
        if (this.savedFilters.workspaceId) this.refresh();
      },
    );
    // Validate a restored tenant against the complete authorized list before querying its data.
    if (!this.savedFilters.workspaceId) this.refresh();
  }
  filtersChanged() {
    if (this.days === 'ALL' && !this.supportsAllPeriod()) return;
    this.restoreAllPeriod = false;
    this.filterNotice.set('');
    this.storageNotice.set(
      this.preferences.save(this.userId, { days: this.days, workspaceId: this.workspaceId })
        ? ''
        : 'Não foi possível lembrar os filtros neste navegador. Sua escolha vale para esta página.',
    );
    this.cancelOverview.next();
    this.refresh();
  }
  refresh() {
    if (this.state.busy() || this.state.wait()) return;
    this.projectRefresh.update((value) => value + 1);
    this.loadOpenDefects();
    this.data.set(null);
    this.unavailable.set(false);
    this.state.run(
      this.api.overview(this.days, this.workspaceId).pipe(takeUntil(this.cancelOverview)),
      (data) => {
        this.supportsAllPeriod.set(
          data?.period.supportedDays?.includes('ALL') === true || data?.period.days === 'ALL',
        );
        if (this.restoreAllPeriod && data) {
          this.restoreAllPeriod = false;
          if (this.supportsAllPeriod()) {
            this.days = 'ALL';
            this.refresh();
            return;
          }
          this.filterNotice.set('Todo o período não está disponível. Exibindo os últimos 30 dias.');
        }
        this.data.set(data);
        this.unavailable.set(data === null);
      },
    );
  }
  loadOpenDefects() {
    this.cancelOpenDefects.next();
    this.openDefects.set(null);
    this.openDefectsState.run(
      this.openDefectsApi.count(this.workspaceId).pipe(takeUntil(this.cancelOpenDefects)),
      (total) => this.openDefects.set(total),
    );
  }
  metricLink(key: string): string[] {
    if (key === 'executions') return ['/execucoes'];
    const module = key === 'testCases' ? 'test-cases' : 'defects';
    return this.workspaceId
      ? ['/workspaces', this.workspaceId, module]
      : [key === 'testCases' ? '/casos-de-teste' : '/defeitos'];
  }
  metricInCircle(goal: NonNullable<DashboardOverview['governance']>[number]) {
    return (
      !goal.actionProgress?.totalActions &&
      metricReferencePercent(goal.currentValue, goal.targetValue) !== null
    );
  }
  change(
    value: number | null | undefined,
    previous: number | null | undefined,
    percentagePoints = false,
  ) {
    if (value == null || previous == null || (!percentagePoints && previous === 0)) return null;
    const delta = percentagePoints ? value - previous : ((value - previous) / previous) * 100;
    const formatted = Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    return delta === 0
      ? 'Sem alteração'
      : `${delta > 0 ? '↑' : '↓'} ${formatted}${percentagePoints ? ' p.p.' : '%'}`;
  }
  favorable(key: string, value: number | null | undefined, previous: number | null | undefined) {
    return (
      value != null && previous != null && (key === 'defects' ? value < previous : value > previous)
    );
  }
}
