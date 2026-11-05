import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, finalize } from 'rxjs';
import { SaoPauloDatePipe } from '../../shared/sao-paulo-date.pipe';
import { OperationState } from '../workspaces/workspace-feedback';
import { defectStatuses } from './defect.models';
import { bugCategories } from './defect-analytics.models';
import { DefectInventorySummary, DefectSummaryQuery } from './defect-summary';
import { DefectSummaryApi } from './defect-summary-api.service';

registerLocaleData(localePt);

@Component({
  selector: 'app-defect-inventory-indicators',
  imports: [DecimalPipe, SaoPauloDatePipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  template: `<section
    class="defect-inventory-indicators"
    aria-label="Indicadores do inventário de defeitos"
    [attr.aria-busy]="state.busy()"
  >
    <div class="section-heading">
      <div>
        <h3>Visão dos bugs</h3>
        <p>
          Todo o histórico do inventário, com os filtros aplicados. As quantidades incluem todas as
          páginas.
        </p>
      </div>
      @if (data()) {
        <small>Consultado em {{ data()!.generatedAt | date: 'dd/MM/yyyy HH:mm' }}</small>
      }
    </div>
    @if (state.error()) {
      <p class="message error" role="alert">{{ state.error() }}</p>
      <button class="btn" [disabled]="state.busy() || !!state.wait()" (click)="load()">
        {{ state.wait() ? 'Aguarde ' + state.wait() + 's' : 'Consultar indicadores novamente' }}
      </button>
    }
    <div class="defect-kpi-grid">
      @for (card of cards(); track card.key) {
        <article class="dashboard-card defect-kpi" [style.--kpi-color]="card.color">
          <div class="defect-kpi-heading">
            <span class="defect-kpi-icon" aria-hidden="true"
              ><svg viewBox="0 0 24 24"><path [attr.d]="card.icon" /></svg
            ></span>
            <h4>{{ card.label }}</h4>
          </div>
          <strong>{{ card.value == null ? '—' : (card.value | number: '1.0-0') }}</strong>
          <small>{{
            state.busy() ? 'Consultando…' : card.value == null ? 'Indisponível' : card.hint
          }}</small>
          @if (card.share != null) {
            <div class="defect-kpi-track" aria-hidden="true">
              <span [style.width.%]="card.share"></span>
            </div>
            <small>{{ card.share | number: '1.0-1' }}% do total</small>
          }
        </article>
      }
      <article class="dashboard-card defect-kpi defect-resolution-kpi">
        <div class="defect-kpi-heading">
          <span class="defect-kpi-icon" aria-hidden="true"
            ><svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" /></svg
          ></span>
          <h4>Tempo médio de correção</h4>
        </div>
        <strong
          >{{ averageHours() == null ? '—' : (averageHours() | number: '1.0-2')
          }}{{ averageHours() == null ? '' : ' h' }}</strong
        >
        <small>{{
          state.busy()
            ? 'Consultando…'
            : data()?.resolutionTime == null
              ? 'Indisponível'
              : averageHours() == null
                ? 'Sem resoluções com duração registrada'
                : data()!.resolutionTime!.sampleSize + ' bugs com duração registrada'
        }}</small>
        @if (data()?.resolutionTime) {
          <small
            >{{
              data()!.resolutionTime!.basis === 'IN_PROGRESS_TO_RESOLVED'
                ? 'Do início da correção à resolução'
                : 'Da criação à resolução'
            }}
            · horas corridas</small
          >
        }
      </article>
    </div>
    @if (data()) {
      @if (!data()!.resolutionTime) {
        <p class="dashboard-footnote">
          O tempo médio depende do registro da data de resolução de cada bug.
        </p>
      }
      <div class="defect-inventory-charts">
        <article class="dashboard-card">
          <h4>Situação dos bugs</h4>
          @if (data()!.totalBugs) {
            <div class="defect-status-chart">
              <svg
                class="defect-status-donut"
                viewBox="0 0 160 160"
                role="img"
                [attr.aria-label]="'Distribuição de ' + data()!.totalBugs + ' bugs por situação'"
              >
                <circle cx="80" cy="80" r="58" fill="none" stroke="#e3e8ef" stroke-width="18" />
                @for (row of statuses(); track row.key) {
                  <circle
                    cx="80"
                    cy="80"
                    r="58"
                    fill="none"
                    [attr.stroke]="row.color"
                    stroke-width="18"
                    pathLength="100"
                    [attr.stroke-dasharray]="row.share + ' ' + (100 - row.share)"
                    [attr.stroke-dashoffset]="row.offset"
                    transform="rotate(-90 80 80)"
                  />
                }
                <text x="80" y="80" text-anchor="middle" class="defect-donut-total">
                  {{ data()!.totalBugs | number }}
                </text>
                <text x="80" y="100" text-anchor="middle">bugs</text>
              </svg>
              <ul class="dashboard-legend">
                @for (row of statuses(); track row.key) {
                  <li>
                    <span class="dashboard-legend-label"
                      ><i [style.background]="row.color" aria-hidden="true"></i
                      >{{ row.label }}</span
                    ><span>{{ row.count | number }} · {{ row.share | number: '1.0-1' }}%</span>
                  </li>
                }
              </ul>
            </div>
          } @else {
            <p>Nenhum bug para os filtros aplicados.</p>
          }
        </article>
        <article class="dashboard-card">
          <h4>Bugs por ambiente</h4>
          <ul class="defect-environment-bars">
            @for (row of categories(); track row.key) {
              <li>
                <div>
                  <span>{{ row.label }}</span
                  ><strong>{{ row.count | number }}</strong>
                </div>
                <div
                  class="defect-environment-track"
                  role="img"
                  [attr.aria-label]="
                    row.label + ': ' + row.count + ' bugs, ' + row.share + '% do total'
                  "
                >
                  <span [style.width.%]="row.share" [style.background]="row.color"></span>
                </div>
              </li>
            }
          </ul>
          <small
            >Categoria preservada no defeito. Outros ambientes e bugs sem ambiente também entram no
            total.</small
          >
        </article>
      </div>
    }
  </section>`,
})
export class DefectInventoryIndicators {
  readonly query = input.required<DefectSummaryQuery>();
  readonly refreshKey = input(0);
  private readonly api = inject(DefectSummaryApi);
  private readonly destroy = inject(DestroyRef);
  readonly state = new OperationState(this.destroy);
  readonly data = signal<DefectInventorySummary | null>(null);
  private request?: Subscription;
  private generation = 0;
  constructor() {
    effect(() => {
      this.query();
      this.refreshKey();
      untracked(() => this.load());
    });
  }
  load() {
    const generation = ++this.generation;
    this.request?.unsubscribe();
    this.data.set(null);
    if (this.state.wait()) {
      this.state.busy.set(false);
      return;
    }
    this.state.busy.set(true);
    this.state.error.set('');
    this.request = this.api
      .get(this.query())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          if (this.generation === generation) this.state.busy.set(false);
        }),
      )
      .subscribe({
        next: (data) => this.data.set(data),
        error: (error) => this.state.fail(error),
      });
  }
  readonly averageHours = computed(() => {
    const time = this.data()?.resolutionTime;
    return time &&
      time.sampleSize > 0 &&
      time.averageHours != null &&
      Number.isFinite(time.averageHours) &&
      time.averageHours >= 0
      ? time.averageHours
      : null;
  });
  readonly statuses = computed(() => {
    const data = this.data();
    let offset = 0;
    return Object.entries(defectStatuses).map(([key, label], index) => {
      const count = data?.byStatus[key as keyof typeof defectStatuses] ?? 0;
      const share = data?.totalBugs ? (100 * count) / data.totalBugs : 0;
      const row = {
        key,
        label,
        count,
        share,
        offset: -offset,
        color: ['#e85245', '#eaa51b', '#448eef', '#28a660', '#8797b0'][index],
      };
      offset += share;
      return row;
    });
  });
  readonly categories = computed(() =>
    Object.entries(bugCategories).map(([key, label], index) => {
      const count = this.data()?.byCategory[key as keyof typeof bugCategories] ?? 0;
      return {
        key,
        label,
        count,
        share: this.data()?.totalBugs ? (100 * count) / this.data()!.totalBugs : 0,
        color: ['#2589ed', '#c71939', '#c98517', '#70829c'][index],
      };
    }),
  );
  readonly cards = computed(() => {
    const data = this.data();
    return [
      {
        key: 'total',
        label: 'Total de bugs',
        value: data?.totalBugs,
        hint: 'Inventário filtrado',
        color: '#536980',
        icon: 'M9 8h6v10H9z M10 4h4v4 M4 9h5 M15 9h5 M4 15h5 M15 15h5',
      },
      {
        key: 'backlog',
        label: 'Em backlog',
        value: data?.byStatus.OPEN,
        hint: 'Abertos',
        color: '#e85245',
        icon: 'M4 5h16v15H4z M4 14h5l1 3h4l1-3h5',
      },
      {
        key: 'correction',
        label: 'Em correção',
        value: data?.byStatus.IN_PROGRESS,
        hint: 'Em andamento',
        color: '#b87900',
        icon: 'M5 4h14v4l-5 4 5 4v4H5v-4l5-4-5-4z',
      },
      {
        key: 'closed',
        label: 'Bugs encerrados',
        value: data?.byStatus.CLOSED,
        hint: 'Fechados',
        color: '#23884c',
        icon: 'M5 12l4 4L19 6',
      },
      {
        key: 'homologation',
        label: 'Em Homologação',
        value: data?.byCategory.HOMOLOGATION,
        hint: 'Ambiente de homologação',
        color: '#2589ed',
        icon: 'M9 3h6 M10 3v6L5 19h14L14 9V3 M8 14h8',
      },
      {
        key: 'production',
        label: 'Em Produção',
        value: data?.byCategory.PRODUCTION,
        hint: 'Ambiente de produção',
        color: '#c71939',
        icon: 'M4 4h16v12H4z M8 20h8 M12 16v4',
      },
    ].map((card) => ({
      ...card,
      share:
        card.key === 'total' || !data || !data.totalBugs || card.value == null
          ? null
          : (100 * card.value) / data.totalBugs,
    }));
  });
}
