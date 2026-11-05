import { DecimalPipe } from '@angular/common';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, input } from '@angular/core';
import { calendarDate } from '../projects/project.models';
import { GoalActionCompletion } from './goal-action-progress';
import {
  Kind,
  RecordItem,
  Framework,
  Assessment,
  Goal,
  Action,
  recordName,
  statuses,
  goalTypes,
  operators,
  sectionPath,
} from './governance.models';
@Component({
  selector: 'app-governance-summary',
  imports: [DatePipe, DecimalPipe, GoalActionCompletion],
  template: `<h2>{{ name(item()) }}</h2>
    <p>
      <strong>{{ status() }}</strong> · Versão {{ item().version }}
    </p>
    @if (kind() === 'goals') {
      <app-goal-action-progress [data]="goal().actionProgress" />
    }
    <dl class="profile-details">
      <dt>Descrição</dt>
      <dd class="preserve-text">{{ description() ?? 'Sem descrição' }}</dd>
      @switch (kind()) {
        @case ('frameworks') {
          <dt>Código / Versão da definição</dt>
          <dd>{{ framework().code }} / {{ framework().versionLabel }}</dd>
        }
        @case ('assessments') {
          <dt>Framework preservado</dt>
          <dd>
            {{ assessment().frameworkSnapshot.code }} · {{ assessment().frameworkSnapshot.name }} ·
            {{ assessment().frameworkSnapshot.versionLabel }} (versão
            {{ assessment().frameworkSnapshot.version }})
          </dd>
          <dt>Seções preservadas</dt>
          <dd>
            <details>
              <summary>Consultar árvore original</summary>
              @for (section of assessment().frameworkSnapshot.sections; track section.id) {
                <p class="preserve-text">
                  {{ path(section.id, assessment().frameworkSnapshot.sections) }} · Posição
                  {{ section.position }}<br />{{ section.description }}
                </p>
              }
            </details>
          </dd>
          <dt>Data da avaliação</dt>
          <dd>{{ date(assessment().assessmentDate) }}</dd>
          <dt>Índice interno</dt>
          <dd>
            {{
              assessment().index.value === null
                ? 'Sem valor aplicável'
                : (assessment().index.value | number: '1.2-2')
            }}
            · {{ assessment().index.assessedControls }} de
            {{ assessment().index.totalControls }} controles avaliados
          </dd>
          <dt>Cálculo ponderado</dt>
          <dd>
            {{ assessment().index.numerator }} / {{ assessment().index.denominator }} · N/A
            excluído; não avaliados contribuem zero na prévia.
          </dd>
          <dt>Fechada em</dt>
          <dd>
            {{ (assessment().closedAt | date: 'dd/MM/yyyy HH:mm:ss') || 'Ainda não fechada' }}
          </dd>
        }
        @case ('goals') {
          <dt>Métrica informativa / Critério</dt>
          <dd>
            {{ metrics[goal().goalType] }} · {{ operators[goal().operator] }}
            {{ goal().targetValue }}
          </dd>
          <dt>Escopo</dt>
          <dd>
            {{ goal().projectId ? 'Projeto: ' + goal().projectId : 'Workspace'
            }}{{ goal().frameworkId ? ' · Framework: ' + goal().frameworkId : '' }}
          </dd>
          <dt>Prazo</dt>
          <dd>{{ date(goal().deadline) }}</dd>
          <dt>Seção</dt>
          <dd>
            {{
              goal().sectionName ||
                (goal().sectionId ? 'Seção indisponível na fonte' : 'Framework inteiro / sem seção')
            }}
          </dd>
          <dt>Responsável</dt>
          <dd>
            {{
              goal().ownerDisplayName ||
                (goal().ownerMemberId ? 'Responsável histórico indisponível' : 'Não atribuído')
            }}
          </dd>
          <dt>Último resultado da métrica informativa</dt>
          <dd>
            @if (goal().lastResult; as result) {
              {{ result.value === null ? 'Sem valor aplicável' : result.value }} · Calculado em
              {{ result.calculatedAt | date: 'dd/MM/yyyy HH:mm:ss' }}
              <p>
                Numerador: {{ result.numerator ?? '—' }} · Denominador:
                {{ result.denominator ?? '—' }}
              </p>
              @if (result.reason) {
                <p>{{ reasons[result.reason] }}</p>
              }
              <details>
                <summary>Fontes utilizadas</summary>
                <p class="preserve-text">{{ result.sourceIds.join(', ') || 'Sem fontes' }}</p>
              </details>
            } @else {
              Ainda não calculada
            }
          </dd>
        }
        @case ('actions') {
          <dt>Responsável</dt>
          <dd>{{ action().ownerMemberId || 'Não atribuído' }}</dd>
          <dt>Prazo</dt>
          <dd>{{ date(action().dueDate) }}</dd>
          <dt>Vínculos</dt>
          <dd>
            Meta: {{ action().goalId || 'Nenhuma' }}<br />Controle avaliado:
            {{ action().controlAssessmentId || 'Nenhum' }}
          </dd>
          <dt>Concluída em</dt>
          <dd>
            {{ (action().completedAt | date: 'dd/MM/yyyy HH:mm:ss') || 'Ainda não concluída' }}
          </dd>
        }
      }
      <dt>Atualizado em</dt>
      <dd>{{ item().updatedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
    </dl>`,
})
export class GovernanceSummary {
  readonly kind = input.required<Kind>();
  readonly item = input.required<RecordItem>();
  readonly name = recordName;
  readonly date = calendarDate;
  readonly metrics = goalTypes;
  readonly operators = operators;
  readonly path = sectionPath;
  readonly reasons = {
    NO_CLOSED_ASSESSMENT: 'Ainda não há avaliação encerrada.',
    SECTION_NOT_IN_SNAPSHOT: 'A seção não existe na última avaliação encerrada.',
    EMPTY_SECTION: 'A seção da avaliação está vazia.',
    NO_APPLICABLE_CONTROLS: 'A fonte não possui controles aplicáveis.',
  };
  framework() {
    return this.item() as Framework;
  }
  assessment() {
    return this.item() as Assessment;
  }
  goal() {
    return this.item() as Goal;
  }
  action() {
    return this.item() as Action;
  }
  description() {
    const i = this.item();
    return 'frameworkSnapshot' in i ? i.frameworkSnapshot.description : i.description;
  }
  status() {
    return (statuses[this.kind()] as Record<string, string>)[this.item().status];
  }
}
