import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, input, output } from '@angular/core';
import { caseOptions } from '../test-cases/test-case.models';
import {
  FieldSnapshot,
  RunCase,
  RunStep,
  TestResult,
  fieldSnapshotValue,
  resultLabels,
} from './execution.models';
@Component({
  selector: 'app-run-snapshot',
  imports: [DatePipe],
  template: ` <section aria-label="Definição preservada do caso">
    <h3>{{ item().humanIdSnapshot }} · {{ item().titleSnapshot }}</h3>
    @if (item().definitionSnapshot.preconditions) {
      <p class="preserve-text">
        <strong>Pré-condições:</strong> {{ item().definitionSnapshot.preconditions }}
      </p>
    }
    <h4 class="sr-only">Passos do teste</h4>
    @for (step of item().steps; track step.id) {
      <article class="case-step runner-step">
        <h4>{{ step.position }}. {{ step.actionSnapshot }}</h4>
        <div class="runner-step-content">
          <div class="runner-step-instructions">
            <dl class="profile-details">
              <dt>Dados de teste</dt>
              <dd class="preserve-text">{{ step.testDataSnapshot ?? '—' }}</dd>
              <dt>Resultado esperado</dt>
              <dd class="preserve-text">{{ step.expectedResultSnapshot ?? '—' }}</dd>
            </dl>
            <details>
              <summary>Resultado obtido e registros</summary>
              <dl class="profile-details">
                <dt>Resultado obtido</dt>
                <dd class="preserve-text">{{ step.actualResult ?? '—' }}</dd>
                <dt>Resultado</dt>
                <dd>{{ results[step.result] }}</dd>
                <dt>Comentário do resultado</dt>
                <dd class="preserve-text">{{ step.comment ?? '—' }}</dd>
                <dt>Executado por / em</dt>
                <dd>
                  {{ step.executedBy ?? '—' }} /
                  {{ (step.executedAt | date: 'dd/MM/yyyy HH:mm:ss') ?? '—' }}
                </dd>
              </dl>
            </details>
          </div>
          <div class="runner-step-results">
            <span class="result-badge" [attr.data-result]="step.result">{{
              results[step.result]
            }}</span>
            @if (editable()) {
              <div class="row-actions" [attr.aria-label]="'Resultado do passo ' + step.position">
                @for (result of quickResults; track result) {
                  <button
                    type="button"
                    class="btn result-button"
                    [attr.data-result]="result"
                    [attr.aria-label]="results[result] + ' · passo ' + step.position"
                    [disabled]="busy()"
                    (click)="quickStepResult.emit({ step, result })"
                  >
                    {{ results[result] }}
                  </button>
                }
                <button class="btn" [disabled]="busy()" (click)="stepResult.emit(step)">
                  Detalhar resultado do passo {{ step.position }}</button
                ><button class="btn" [disabled]="busy()" (click)="comment.emit(step)">
                  Comentar passo {{ step.position }}
                </button>
              </div>
            }
          </div>
        </div>
      </article>
    } @empty {
      <p>Este caso não possui passos.</p>
    }
    <details class="runner-definition">
      <summary>Detalhes do caso, classificação e campos preservados</summary>
      <p>
        Alterar um passo devolve o caso para “Não testado”. Confirme o resultado final após
        registrar os passos.
      </p>
      <p>Versão da definição: {{ item().definitionSnapshot.version }}</p>
      <dl class="profile-details">
        <dt>Descrição</dt>
        <dd class="preserve-text">{{ item().definitionSnapshot.description ?? '—' }}</dd>
        <dt>Pré-condições</dt>
        <dd class="preserve-text">{{ item().definitionSnapshot.preconditions ?? '—' }}</dd>
        <dt>Pós-condições</dt>
        <dd class="preserve-text">{{ item().definitionSnapshot.postconditions ?? '—' }}</dd>
        <dt>Prioridade / Severidade</dt>
        <dd>
          {{ labels.priority[item().prioritySnapshot] }} /
          {{ labels.severity[item().severitySnapshot] }}
        </dd>
        <dt>Tipo / Camada</dt>
        <dd>
          {{ labels.type[item().definitionSnapshot.type] }} /
          {{ labels.layer[item().definitionSnapshot.layer] }}
        </dd>
        <dt>Comportamento / Automação</dt>
        <dd>
          {{ item().definitionSnapshot.behavior ?? '—' }} /
          {{ labels.automationStatus[item().definitionSnapshot.automationStatus] }}
        </dd>
        <dt>Situação / Suíte original</dt>
        <dd>
          {{ status(item().definitionSnapshot.status) }} /
          {{ item().definitionSnapshot.suiteId ?? 'Sem suíte' }}
        </dd>
        <dt>Executado por / em</dt>
        <dd>
          {{ item().executedBy ?? '—' }} /
          {{ (item().executedAt | date: 'dd/MM/yyyy HH:mm:ss') ?? '—' }}
        </dd>
        <dt>Comentário do resultado</dt>
        <dd class="preserve-text">{{ item().comment ?? '—' }}</dd>
      </dl>
      @if (item().tagsSnapshot.length) {
        <h4>Tags preservadas</h4>
        <p>
          @for (tag of item().tagsSnapshot; track tag.id) {
            <span class="snapshot-tag">{{ tag.name }}</span>
          }
        </p>
      }
      @if (item().customFieldsSnapshot.length) {
        <h4>Campos preservados</h4>
        <dl class="profile-details">
          @for (field of item().customFieldsSnapshot; track field.fieldId) {
            <dt>
              {{ field.name }} ({{ field.key }}){{ field.required ? ' *' : ''
              }}{{ field.archivedAt ? ' · arquivado' : '' }}
            </dt>
            <dd class="preserve-text">{{ value(field) }}</dd>
          }
        </dl>
      }
    </details>
  </section>`,
})
export class RunSnapshot {
  readonly item = input.required<RunCase>();
  readonly editable = input(false);
  readonly busy = input(false);
  readonly quickResults: TestResult[] = ['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'];
  readonly quickStepResult = output<{ step: RunStep; result: TestResult }>();
  readonly stepResult = output<RunStep>();
  readonly comment = output<RunStep | null>();
  readonly labels = caseOptions;
  readonly results = resultLabels;
  status(value: string) {
    return (
      ({ ...caseOptions.status, ARCHIVED: 'Arquivado' } as Record<string, string>)[value] ?? value
    );
  }
  value(field: FieldSnapshot) {
    return fieldSnapshotValue(field);
  }
}
