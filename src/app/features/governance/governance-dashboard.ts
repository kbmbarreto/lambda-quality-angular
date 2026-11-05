import { DecimalPipe } from '@angular/common';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, DestroyRef, OnInit, input, output, inject, signal } from '@angular/core';
import { OperationState } from '../workspaces/workspace-feedback';
import { GovernanceApi } from './governance-api.service';
import { Dashboard } from './governance.models';
@Component({
  selector: 'app-governance-dashboard',
  imports: [DatePipe, DecimalPipe],
  template: `<section aria-label="Painel de governança">
    <div class="section-heading">
      <h2>Visão geral</h2>
      <button
        class="btn"
        type="button"
        [disabled]="state.busy() || !!state.wait()"
        (click)="load()"
      >
        Atualizar painel
      </button>
    </div>
    <p>
      Indicadores internos. As situações das metas acompanham a conclusão das ações. Este painel não
      recalcula a métrica informativa nem representa certificação oficial.
    </p>
    @if (state.error()) {
      <p class="message error" role="alert">
        {{ state.error() }}
        @if (state.wait()) {
          Aguarde {{ state.wait() }}s.
        }
      </p>
    }
    @if (state.busy()) {
      <p role="status">Consultando indicadores…</p>
    }
    @if (data(); as d) {
      <p>Consultado em {{ consultedAt() | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
      <h3>Frameworks e avaliações</h3>
      <div class="execution-summary">
        <span
          >Frameworks<strong>{{ d.frameworks }}</strong></span
        ><span
          >Rascunhos<strong>{{ d.assessments.draft }}</strong></span
        ><span
          >Em andamento<strong>{{ d.assessments.inProgress }}</strong></span
        ><span
          >Fechadas<strong>{{ d.assessments.closed }}</strong></span
        >
      </div>
      <h3>Metas visíveis</h3>
      <div class="execution-summary">
        <span
          >Ativas<strong>{{ d.goals.active }}</strong></span
        ><span
          >Atingidas<strong>{{ d.goals.achieved }}</strong></span
        ><span
          >Não atingidas no prazo<strong>{{ d.goals.missed }}</strong></span
        ><span
          >Canceladas<strong>{{ d.goals.cancelled }}</strong></span
        >
      </div>
      <h3>Ações visíveis</h3>
      <div class="execution-summary">
        <span
          >Abertas<strong>{{ d.actions.open }}</strong></span
        ><span
          >Em andamento<strong>{{ d.actions.inProgress }}</strong></span
        ><span
          >Concluídas<strong>{{ d.actions.done }}</strong></span
        ><span
          >Canceladas<strong>{{ d.actions.cancelled }}</strong></span
        >
      </div>
      <h3>Pontos de atenção</h3>
      <p>Considera somente a última avaliação fechada de cada framework.</p>
      <div class="execution-summary">
        <span
          >Não atendidos<strong>{{ d.attention.notMetControls }}</strong></span
        ><span
          >Parcialmente atendidos<strong>{{ d.attention.partiallyMetControls }}</strong></span
        ><span
          >Evidências vencidas<strong>{{ d.attention.expiredEvidence }}</strong></span
        >
      </div>
      <h3>Últimas avaliações fechadas</h3>
      @for (row of d.latestAssessments; track row.frameworkId) {
        <div class="picker-item">
          <span
            ><strong>{{ row.frameworkName }}</strong> · Índice interno
            {{ row.index === null ? 'Sem valor aplicável' : (row.index | number: '1.2-2') }} ·
            {{ row.closedAt | date: 'dd/MM/yyyy HH:mm' }}</span
          ><button class="btn" type="button" (click)="assessment.emit(row.assessmentId)">
            Abrir avaliação
          </button>
        </div>
      } @empty {
        <p>Nenhuma avaliação fechada disponível.</p>
      }
    }
  </section>`,
})
export class GovernanceDashboard implements OnInit {
  readonly workspaceId = input.required<string>();
  readonly assessment = output<string>();
  private readonly api = inject(GovernanceApi);
  readonly state = new OperationState(inject(DestroyRef));
  readonly data = signal<Dashboard | null>(null);
  readonly consultedAt = signal('');
  ngOnInit() {
    this.load();
  }
  load() {
    this.state.run(this.api.dashboard(this.workspaceId()), (r) => {
      this.data.set(r.data);
      this.consultedAt.set(new Date().toISOString());
    });
  }
}
