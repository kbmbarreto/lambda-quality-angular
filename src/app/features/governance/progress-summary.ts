import { Component, input } from '@angular/core';
import { ProgressSummary, progressLabel } from './framework-progress.models';
@Component({
  selector: 'app-progress-summary',
  template: `@if (summary(); as s) {
    <div class="governance-progress-summary" aria-live="polite">
      <div>
        <span>Atendimento ponderado</span><strong>{{ label(s) }}</strong>
        @if (s.index.value != null) {
          <div
            class="dashboard-progress"
            role="progressbar"
            aria-label="Atendimento ponderado"
            [attr.aria-valuenow]="s.index.value"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span [style.width.%]="s.index.value"></span>
          </div>
        }
      </div>
      <div>
        <span>Itens atendidos</span><strong>{{ s.counts.MET }}/{{ s.applicableControls }}</strong
        ><small>{{ percent(s.completionPercent) }} dos aplicáveis</small>
      </div>
      <div>
        <span>Itens avaliados</span><strong>{{ s.assessedControls }}/{{ s.totalControls }}</strong
        ><small>{{ percent(s.assessmentPercent) }} avaliados</small>
      </div>
    </div>
  }`,
})
export class GovernanceProgressSummary {
  readonly summary = input<ProgressSummary | null>(null);
  readonly label = progressLabel;
  percent(value: number | null) {
    return value == null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  }
}
