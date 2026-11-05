import { Component, computed, input } from '@angular/core';
import { GoalActionProgress as Progress } from './governance.models';

export function actionPercentLabel(percent: number | null): string {
  return percent === null
    ? 'Sem ações válidas'
    : `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

@Component({
  selector: 'app-goal-action-progress',
  template: `<section
    class="goal-action-completion"
    [class.compact]="compact()"
    aria-label="Conclusão das ações"
  >
    @if (showRing()) {
      <div
        class="goal-action-ring"
        role="img"
        [style.--progress]="(percent() ?? 0) + '%'"
        [attr.aria-label]="'Conclusão das ações: ' + label()"
      >
        <span>{{ percent() === null ? '—' : label() }}</span>
      </div>
    }
    <div>
      <strong>Conclusão das ações</strong>
      @if (data(); as progress) {
        @if (percent() === null) {
          <p>Sem ações válidas</p>
        }
        <p>
          {{ progress.completedActions }} de {{ progress.totalActions }} ações válidas concluídas
        </p>
        <small>
          {{ progress.cancelledActions }}
          {{ progress.cancelledActions === 1 ? 'cancelada · excluída' : 'canceladas · excluídas' }}
          da conclusão
        </small>
        @if (!compact()) {
          <p class="hint">
            A meta exige todas as ações válidas concluídas. O critério da métrica informativa não
            altera esse percentual.
          </p>
        }
      } @else {
        <p>Progresso das ações indisponível.</p>
      }
    </div>
  </section>`,
})
export class GoalActionCompletion {
  readonly data = input<Progress | null>(null);
  readonly compact = input(false);
  readonly showRing = input(true);
  // The overview exposes progress separately; its value is supplied by the API.
  readonly overviewPercent = input<number | null | undefined>(undefined);
  readonly percent = computed(() =>
    this.data()
      ? this.overviewPercent() === undefined
        ? this.data()!.percent
        : this.overviewPercent()!
      : null,
  );
  readonly label = computed(() =>
    this.data() ? actionPercentLabel(this.percent()) : 'Progresso indisponível',
  );
}
