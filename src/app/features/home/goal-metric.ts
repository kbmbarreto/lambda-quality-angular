import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, LOCALE_ID, computed, input } from '@angular/core';
import { SaoPauloDatePipe } from '../../shared/sao-paulo-date.pipe';

registerLocaleData(localePt);

export function metricReferencePercent(
  current: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (
    current == null ||
    target == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    current < 0 ||
    target <= 0
  )
    return null;
  const ratio = (current / target) * 100;
  return Number.isFinite(ratio) ? ratio : null;
}

@Component({
  selector: 'app-goal-metric',
  imports: [DecimalPipe, SaoPauloDatePipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  template: `<section class="dashboard-goal-metric" aria-label="Métrica informativa">
    @if (ring(); as value) {
      <div class="goal-metric-circular">
        <div
          class="goal-metric-ring"
          role="img"
          [style.--progress]="value.fill + '%'"
          [attr.aria-label]="'Métrica informativa: ' + value.label + ' do critério'"
        >
          <span>{{ value.label }}</span>
        </div>
        <div>
          <strong>Valor em relação ao critério</strong>
          <small
            >{{ currentValue() | number: '1.0-2' }} de {{ targetValue() | number: '1.0-2' }}</small
          >
          <small>{{ value.label }} do critério · Métrica informativa</small>
        </div>
      </div>
    }
    <strong>Métrica informativa</strong>
    @if (currentValue() == null) {
      <small>Sem cálculo da métrica.</small>
    }
    <div class="goal-metric-values">
      <span
        >Último valor:
        <b>{{ currentValue() == null ? '—' : (currentValue() | number: '1.0-2') }}</b></span
      >
      <span
        >Critério:
        <b>{{ targetValue() == null ? '—' : (targetValue() | number: '1.0-2') }}</b></span
      >
    </div>
    @if (comparison(); as values) {
      <div
        class="goal-metric-comparison"
        role="img"
        [attr.aria-label]="
          'Comparação da métrica: valor ' + currentValue() + '; referência ' + targetValue()
        "
      >
        <div>
          <span>Valor calculado</span>
          <div class="goal-metric-track"><i [style.width.%]="values.current"></i></div>
        </div>
        <div>
          <span>Referência do critério</span>
          <div class="goal-metric-track target"><i [style.width.%]="values.target"></i></div>
        </div>
      </div>
    }
    @if (calculatedAt()) {
      <small>Calculado em {{ calculatedAt() | date: 'dd/MM/yyyy HH:mm' }}</small>
    }
    <small>Este valor não determina a conclusão das ações.</small>
  </section>`,
})
export class GoalMetric {
  readonly circular = input(false);
  readonly currentValue = input<number | null | undefined>();
  readonly targetValue = input<number | null | undefined>();
  readonly calculatedAt = input<string | null | undefined>();
  readonly ring = computed(() => {
    const percent = metricReferencePercent(this.currentValue(), this.targetValue());
    return !this.circular() || percent === null
      ? null
      : {
          label: `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
          fill: Math.min(100, percent),
        };
  });
  readonly comparison = computed(() => {
    const current = this.currentValue(),
      target = this.targetValue();
    if (
      current == null ||
      target == null ||
      !Number.isFinite(current) ||
      !Number.isFinite(target) ||
      current < 0 ||
      target < 0
    )
      return null;
    const scale = Math.max(current, target);
    // These bars compare raw values, never determine goal status or action completion.
    return {
      current: scale ? (100 * current) / scale : 0,
      target: scale ? (100 * target) / scale : 0,
    };
  });
}
