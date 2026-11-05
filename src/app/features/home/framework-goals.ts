import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DashboardFrameworkGovernance,
  progressLabel,
} from '../governance/framework-progress.models';
import { assessmentStatuses } from '../governance/governance.models';

@Component({
  selector: 'app-framework-goals',
  imports: [RouterLink],
  template: `@if (data(); as block) {
      <div class="home-framework-governance">
        <h3>Atendimento dos frameworks</h3>
        @if (block.overall; as summary) {
          <div class="governance-overview-chart">
            <div
              class="governance-score-ring"
              [style.--score]="(summary.index.value ?? 0) + '%'"
              role="img"
              [attr.aria-label]="'Atendimento ponderado: ' + label(summary)"
            >
              <div>
                <strong>{{ label(summary) }}</strong
                ><span>Atendimento</span>
              </div>
            </div>
            <div class="governance-score-legend">
              <span
                ><i class="governance-dot met"></i
                ><strong>{{ summary.counts.MET }}</strong> Atendidos</span
              >
              <span
                ><i class="governance-dot partial"></i
                ><strong>{{ summary.counts.PARTIALLY_MET }}</strong> Parciais</span
              >
              <span
                ><i class="governance-dot unmet"></i
                ><strong>{{ summary.counts.NOT_MET }}</strong> Não atendidos</span
              >
              <span
                ><i class="governance-dot pending"></i
                ><strong>{{ summary.counts.NOT_ASSESSED }}</strong> Não avaliados</span
              >
              <span
                ><strong>{{ summary.counts.NOT_APPLICABLE }}</strong> Não aplicáveis</span
              >
            </div>
          </div>
          <p class="dashboard-footnote">
            {{ summary.counts.MET }}/{{ summary.applicableControls }} itens aplicáveis atendidos ·
            {{ summary.assessedControls }}/{{ summary.totalControls }} avaliados. O índice considera
            os pesos e o atendimento parcial.
          </p>
        } @else {
          <p class="dashboard-empty">Sem avaliação consolidada neste escopo.</p>
        }
        <p class="dashboard-footnote">
          {{ block.frameworksWithAssessment }}/{{ block.frameworkCount }} frameworks com avaliação ·
          Posição atual, incluindo avaliações em andamento.
        </p>
        <div class="home-framework-cards">
          @for (f of block.frameworks; track f.workspaceId + ':' + f.frameworkId) {
            <article class="home-framework-progress">
              <div class="section-heading">
                <a
                  [routerLink]="['/workspaces', f.workspaceId, 'governance']"
                  [queryParams]="{ frameworkId: f.frameworkId, assessmentId: f.assessment?.id }"
                  >{{ f.frameworkName }}</a
                ><strong>{{ label(f.summary) }}</strong>
              </div>
              <small
                >{{ f.workspaceName }} ·
                {{ f.assessment ? statuses[f.assessment.status] : 'Sem avaliação' }}</small
              >
              @if (f.summary?.index?.value != null) {
                <div
                  class="dashboard-progress"
                  role="progressbar"
                  [attr.aria-label]="'Atendimento de ' + f.frameworkName"
                  [attr.aria-valuenow]="f.summary!.index.value"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <span [style.width.%]="f.summary!.index.value"></span>
                </div>
              }
              @if (f.assessment) {
                <small
                  >Fonte: {{ f.assessment.name }} ·
                  {{
                    f.assessment.status === 'CLOSED' ? 'Resultado encerrado' : 'Provisório'
                  }}</small
                >
              }
              @for (section of f.sections; track section.id) {
                <div class="home-framework-level">
                  <span>{{ section.name }}</span
                  ><span>{{ label(section.summary) }}</span>
                  @if (section.summary.index.value != null) {
                    <div
                      class="dashboard-progress"
                      role="progressbar"
                      [attr.aria-label]="'Atendimento de ' + section.name"
                      [attr.aria-valuenow]="section.summary.index.value"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <span [style.width.%]="section.summary.index.value"></span>
                    </div>
                  }
                </div>
              }
            </article>
          } @empty {
            <p class="dashboard-empty">Nenhum framework ativo neste escopo.</p>
          }
        </div>
        <details open class="governance-attention">
          <summary>
            Atenção: {{ block.attention.notMetControls }} não atendidos ·
            {{ block.attention.partiallyMetControls }} parciais
          </summary>
          <ul>
            <li>{{ block.attention.notAssessedControls }} controles não avaliados</li>
            <li>{{ block.attention.notMetControls }} controles não atendidos</li>
            <li>{{ block.attention.partiallyMetControls }} controles parcialmente atendidos</li>
            <li>{{ block.attention.expiredEvidence }} evidências expiradas</li>
            <li>{{ block.attention.upcomingGoals }} metas com prazo nos próximos 30 dias</li>
          </ul>
        </details>
      </div>
    } @else {
      <p class="dashboard-empty">Atendimento dos frameworks indisponível neste escopo.</p>
    }`,
})
export class FrameworkGoals {
  readonly data = input<DashboardFrameworkGovernance | null>(null);
  readonly label = progressLabel;
  readonly statuses = assessmentStatuses;
}
