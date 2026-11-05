import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, finalize, forkJoin, map, of } from 'rxjs';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { ProjectApi } from '../projects/project-api.service';
import { Project, validCalendarDate, calendarDate } from '../projects/project.models';
import { ProjectScope } from '../projects/project-scope';
import { ProjectFrame } from '../projects/project-frame';
import { allPages } from '../test-cases/test-case.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { DefectAnalyticsApi } from './defect-analytics-api.service';
import {
  BugCategory,
  DefectAnalytics,
  DefectAnalyticsQuery,
  bugCategories,
} from './defect-analytics.models';

export function analyticsRangeError(from: string, to: string): string {
  if (!validCalendarDate(from) || !validCalendarDate(to))
    return 'Informe datas reais de início e fim.';
  if (from > to) return 'O fim deve ser igual ou posterior ao início.';
  const [fy, fm] = from.split('-').map(Number),
    [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + tm - fm + 1 > 36 ? 'Selecione no máximo 36 meses civis.' : '';
}
export function monthWindow(month: string, from: string, to: string): { from: string; to: string } {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01` > from ? `${month}-01` : from, to: last < to ? last : to };
}
@Component({
  selector: 'app-defect-analytics',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './defect-analytics.html',
})
export class DefectAnalyticsPanel implements OnInit {
  readonly workspaceId = input.required<string>();
  readonly initialProjectId = input('');
  private readonly api = inject(DefectAnalyticsApi);
  private readonly projectsApi = inject(ProjectApi);
  private readonly workspace = inject(WorkspaceContext);
  private readonly destroy = inject(DestroyRef);
  readonly state = new OperationState(this.destroy);
  readonly projectRead = new OperationState(this.destroy);
  readonly history = signal<DefectAnalytics | null>(null);
  readonly monthData = signal<DefectAnalytics | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly active = signal<DefectAnalyticsQuery | null>(null);
  readonly validation = signal('');
  readonly categories = Object.entries(bugCategories).map(([key, label], index) => ({
    key: key as BugCategory,
    label,
    color: ['#2589ed', '#2425a6', '#c98517', '#70829c'][index],
  }));
  private request?: Subscription;
  private generation = 0;
  from = '';
  to = '';
  projectId = '';
  category = '';
  month = '';
  readonly date = calendarDate;
  readonly cards = computed(() => {
    const data = this.monthData();
    return [
      { label: 'Total de bugs', value: data?.totalBugs },
      { label: 'Em backlog', value: data?.byStatus.OPEN },
      { label: 'Em correção', value: data?.byStatus.IN_PROGRESS },
      { label: 'Encerrados', value: data?.byStatus.CLOSED },
      { label: 'Bugs em homologação', value: data?.byCategory.HOMOLOGATION },
      { label: 'Bugs em produção', value: data?.byCategory.PRODUCTION },
      { label: 'Resolvidos', value: data?.byStatus.RESOLVED },
      { label: 'Rejeitados', value: data?.byStatus.REJECTED },
    ];
  });
  readonly chart = computed(() => {
    const monthly = this.history()?.monthly ?? [];
    const width = Math.max(560, monthly.length * 76 + 64),
      height = 244;
    const max = Math.max(
      2,
      Math.ceil(Math.max(0, ...monthly.flatMap((row) => Object.values(row.byCategory))) / 2) * 2,
    );
    const plotHeight = 160,
      group = (width - 70) / Math.max(1, monthly.length);
    return {
      width,
      height,
      max,
      ticks: [0, max / 2, max],
      monthly: monthly.map((row, index) => ({
        ...row,
        x: 50 + index * group,
        label: this.monthLabel(row.month),
        bars: this.categories.map((c, i) => ({
          ...c,
          count: row.byCategory[c.key],
          x: 50 + index * group + i * ((group * 0.8) / 4),
          width: (group * 0.8) / 4 - 2,
          height: (row.byCategory[c.key] / max) * plotHeight,
        })),
      })),
    };
  });
  ngOnInit() {
    const today = new Date().toISOString().slice(0, 10);
    this.from = `${today.slice(0, 4)}-01-01`;
    this.to = today;
    this.month = today.slice(0, 7);
    this.projectId = this.initialProjectId();
    this.loadProjects();
    this.apply();
  }
  loadProjects() {
    if (this.workspace.selected()?.id !== this.workspaceId() || !this.workspace.can('project.read'))
      return;
    this.projectRead.run(
      allPages((page) =>
        this.projectsApi.list(this.workspaceId(), {
          page,
          size: 100,
          status: 'ALL',
          sort: 'name,asc',
        }),
      ),
      (rows) => this.projects.set(rows.filter((p) => p.permissions.includes('defect.read'))),
    );
  }
  apply() {
    if (this.state.wait()) return;
    const error = analyticsRangeError(this.from, this.to);
    this.validation.set(error);
    if (error) return;
    if (this.category && !(this.category in bugCategories)) {
      this.validation.set('Selecione uma categoria válida.');
      return;
    }
    if (this.month < this.from.slice(0, 7) || this.month > this.to.slice(0, 7))
      this.month = this.to.slice(0, 7);
    const query: DefectAnalyticsQuery = {
      from: this.from,
      to: this.to,
      ...(this.projectId ? { projectId: this.projectId } : {}),
      ...(this.category ? { category: this.category as BugCategory } : {}),
    };
    this.active.set(query);
    this.load(query, true);
  }
  selectMonth(month: string) {
    const query = this.active();
    if (
      !query ||
      !this.history() ||
      this.state.wait() ||
      !this.history()!.monthly.some((row) => row.month === month)
    )
      return;
    this.month = month;
    this.load(query, false);
  }
  retry() {
    const query = this.active();
    if (query) this.load(query, true);
  }
  private load(query: DefectAnalyticsQuery, history: boolean) {
    if (this.state.wait()) return;
    const generation = ++this.generation;
    this.request?.unsubscribe();
    if (history) this.history.set(null);
    this.monthData.set(null);
    this.state.error.set('');
    this.state.busy.set(true);
    const window = monthWindow(this.month, query.from, query.to);
    this.request = forkJoin({
      history: history
        ? this.api.analytics(this.workspaceId(), query).pipe(map((r) => r.data))
        : of(this.history()),
      month: this.api
        .analytics(this.workspaceId(), { ...query, ...window })
        .pipe(map((r) => r.data)),
    })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          if (generation === this.generation) this.state.busy.set(false);
        }),
      )
      .subscribe({
        next: (response) => {
          this.history.set(response.history);
          this.monthData.set(response.month);
        },
        error: (error) => this.state.fail(error),
      });
  }
  monthLabel(month: string) {
    return new Date(`${month}-01T12:00:00Z`)
      .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .replace(' de ', '/');
  }
  hasProject(id: string) {
    return this.projects().some((project) => project.id === id);
  }
  projectName(id: string) {
    const p = this.monthData()?.byProject.find((project) => project.projectId === id);
    return p ? `${p.projectKey} · ${p.projectName}` : id;
  }
  categoryLabel(category: BugCategory) {
    return bugCategories[category];
  }
  categoryRows() {
    const data = this.monthData();
    return this.categories.map((c) => ({
      label: c.label,
      count: data?.byCategory[c.key] ?? 0,
      color: c.color,
    }));
  }
  projectRows(category?: BugCategory) {
    return (this.monthData()?.byProject ?? []).map((p) => ({
      ...p,
      label: p.projectName,
      count: category ? p.byCategory[category] : p.totalBugs,
    }));
  }
  barWidth(count: number, rows: { count: number }[]) {
    return (count / Math.max(1, ...rows.map((row) => row.count))) * 100;
  }
}
@Component({
  selector: 'app-defect-analytics-repository',
  providers: [ProjectScope],
  imports: [ProjectFrame, DefectAnalyticsPanel],
  template: `<app-project-frame title="Defeitos" heading="Indicadores de bugs">
    @if (scope.workspace.selected()) {
      <app-defect-analytics [workspaceId]="scope.workspaceId()" />
    }
  </app-project-frame>`,
})
export class DefectAnalyticsRepository {
  readonly scope = inject(ProjectScope);
}
