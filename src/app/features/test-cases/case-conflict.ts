import { Component, input, output } from '@angular/core';
import { TestCase, caseOptions } from './test-case.models';
@Component({
  selector: 'app-case-conflict',
  template: `@if (blocked()) {
    <section class="message info" aria-label="Revisar edição concorrente">
      <p>
        Suas alterações permanecem no formulário. Consulte os dados atuais e compare antes de
        continuar.
      </p>
      <button class="btn" type="button" [disabled]="busy()" (click)="reload.emit()">
        Consultar versão atual
      </button>
      @if (latest(); as current) {
        <h3>Dados atuais do servidor · versão {{ current.version }}</h3>
        <dl class="profile-details">
          <dt>Título</dt>
          <dd>{{ current.title }}</dd>
          <dt>Descrição</dt>
          <dd class="preserve-text">{{ current.description || '—' }}</dd>
          <dt>Pré-condições</dt>
          <dd class="preserve-text">{{ current.preconditions || '—' }}</dd>
          <dt>Pós-condições</dt>
          <dd class="preserve-text">{{ current.postconditions || '—' }}</dd>
          <dt>Situação</dt>
          <dd>{{ current.status === 'ARCHIVED' ? 'Arquivado' : labels.status[current.status] }}</dd>
          <dt>Prioridade / Severidade</dt>
          <dd>{{ labels.priority[current.priority] }} / {{ labels.severity[current.severity] }}</dd>
          <dt>Tipo / Camada</dt>
          <dd>{{ labels.type[current.type] }} / {{ labels.layer[current.layer] }}</dd>
          <dt>Comportamento / Automação</dt>
          <dd>
            {{ current.behavior || '—' }} / {{ labels.automationStatus[current.automationStatus] }}
          </dd>
          <dt>Suíte</dt>
          <dd>{{ current.suiteId || 'Sem suíte' }}</dd>
        </dl>
        <h4>Passos atuais</h4>
        @for (step of current.steps; track step.id) {
          <p class="preserve-text">
            {{ step.position }}. {{ step.action }} · Dados: {{ step.testData || '—' }} · Resultado:
            {{ step.expectedResult || '—' }}
          </p>
        }
        <h4>Valores e vínculos atuais</h4>
        @for (field of current.customFields; track field.fieldId) {
          <p>{{ field.fieldId }}: {{ field.value }}</p>
        }
        <p>Tags: {{ current.tagIds.join(', ') || '—' }}</p>
        <p>Anexos: {{ current.attachmentIds.join(', ') || '—' }}</p>
        <button class="btn" type="button" [disabled]="busy()" (click)="reviewed.emit(current)">
          Revisei as alterações; usar esta versão
        </button>
      }
    </section>
  }`,
})
export class CaseConflict {
  readonly blocked = input(false);
  readonly busy = input(false);
  readonly latest = input<TestCase | null>(null);
  readonly reload = output<void>();
  readonly reviewed = output<TestCase>();
  readonly labels = caseOptions;
}
