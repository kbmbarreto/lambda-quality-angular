import { Component, input, output } from '@angular/core';
import {
  ExecutionComment,
  RunCase,
  TestPlan,
  TestRun,
  planLabels,
  runLabels,
} from './execution.models';
import { RunSnapshot } from './run-snapshot';
@Component({
  selector: 'app-execution-conflict',
  imports: [RunSnapshot],
  template: ` @if (blocked()) {
    <section class="message info" aria-label="Revisar estado da execução">
      <p>
        Seu formulário permanece preenchido. Consulte o estado atual e revise antes de enviar
        novamente. Após uma resposta incerta, verifique se a ação já foi aplicada.
      </p>
      <button class="btn" type="button" [disabled]="busy() || !!wait()" (click)="reload.emit()">
        {{ wait() ? 'Aguarde ' + wait() + 's' : 'Consultar estado atual' }}
      </button>
      @if (plan(); as current) {
        <h3>Plano atual · versão {{ current.version }}</h3>
        <p>{{ current.name }} · {{ plans[current.status] }}</p>
        <p class="preserve-text">{{ current.description ?? '—' }}</p>
        <p>
          Marco: {{ current.milestoneId ?? '—' }} · Ambiente: {{ current.environmentId ?? '—' }}
        </p>
        <p>Seleção completa ({{ current.cases.length }}):</p>
        @for (item of current.cases; track item.testCaseId) {
          <p>{{ item.position }}. {{ item.testCaseId }}</p>
        }
      }
      @if (run(); as current) {
        <h3>Execução atual · versão {{ current.version }}</h3>
        <p>{{ current.name }} · {{ runs[current.status] }}</p>
        <p>
          {{ current.summary.total }} casos · {{ current.summary.notTested }} não testados ·
          {{ current.summary.passed }} passaram · {{ current.summary.failed }} falharam ·
          {{ current.summary.blocked }} bloqueados · {{ current.summary.skipped }} ignorados
        </p>
      }
      @if (item(); as currentCase) {
        <app-run-snapshot [item]="currentCase" />
      }
      @if (recentRuns().length) {
        <h4>Execuções já criadas para este plano</h4>
        @for (existing of recentRuns(); track existing.id) {
          <p>
            {{ existing.name }} · {{ runs[existing.status] }} · {{ existing.createdAt }} ·
            {{ existing.id }}
          </p>
        }
      }
      @if (comments().length) {
        <h4>Comentários atuais consultados</h4>
        @for (comment of comments(); track comment.id) {
          <p class="preserve-text">
            {{ comment.text }} · {{ comment.createdBy }} · {{ comment.createdAt }}
          </p>
        }
      }
      @if (plan() || run()) {
        <button class="btn" type="button" [disabled]="busy() || !!wait()" (click)="reviewed.emit()">
          Revisei o estado; continuar com esta versão
        </button>
      }
    </section>
  }`,
})
export class ExecutionConflict {
  readonly blocked = input(false);
  readonly busy = input(false);
  readonly wait = input(0);
  readonly plan = input<TestPlan | null>(null);
  readonly run = input<TestRun | null>(null);
  readonly item = input<RunCase | null>(null);
  readonly recentRuns = input<TestRun[]>([]);
  readonly comments = input<ExecutionComment[]>([]);
  readonly reload = output<void>();
  readonly reviewed = output<void>();
  readonly plans = planLabels;
  readonly runs = runLabels;
}
