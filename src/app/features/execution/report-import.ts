import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, concatMap, defer, forkJoin, from, tap, throwError, toArray } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Project, canChange } from '../projects/project.models';
import { allPages, payloadFits } from '../test-cases/test-case.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { ExecutionApi } from './execution-api.service';
import { ExecutionState } from './execution-feedback';
import { RunCase, TestRun, resultLabels } from './execution.models';
import { ReportResult, parseJUnit, reportIssue, reportLimit, reportMatch } from './test-report';

interface ImportRow extends ReportResult {
  targetId: string;
  selected: boolean;
  confirmed: boolean;
}
@Component({
  selector: 'app-test-report-import',
  imports: [FormsModule],
  template: `<section class="detail-card" aria-label="Importar relatório de testes">
    <div class="section-heading">
      <h3>Importar relatório JUnit XML</h3>
      <button class="btn" [disabled]="busy()" (click)="closed.emit()">Fechar importação</button>
    </div>
    <p>
      Até 2 MiB e 500 resultados. Use o identificador do caso no nome do teste ou nas propriedades
      lambdaquality.caseId / lambdaquality.humanId. Confira os vínculos antes de importar.
    </p>
    <p>
      O relatório atualiza os resultados dos casos. Os passos e os comentários existentes são
      preservados. A execução permanece aberta para revisão.
    </p>
    <label
      >Relatório de testes
      <input
        type="file"
        accept=".xml,application/xml,text/xml"
        [disabled]="busy() || state.blocked()"
        (change)="chooseFile($event)"
    /></label>
    @if (error()) {
      <p class="message error" role="alert">{{ error() }}</p>
    }
    @if (state.error()) {
      <p class="message error" role="alert">{{ state.error() }}</p>
    }
    @if (read.error()) {
      <p class="message error" role="alert">{{ read.error() }}</p>
    }
    @if (busy()) {
      <p role="status">
        {{ state.busy() ? 'Registrando resultados…' : 'Lendo relatório e consultando execução…' }}
      </p>
    }
    @if (progress()) {
      <p role="status">{{ progress() }}</p>
    }
    @if (state.blocked()) {
      <p class="message info">
        A importação foi interrompida. Consulte os resultados atuais antes de revisar os itens
        restantes.
      </p>
    }
    @if (rows().length) {
      <p>
        <strong>{{ fileName() }}</strong> · {{ rows().length }} resultados no relatório ·
        {{ selectedCount() }} selecionados.
      </p>
      <div class="table-scroll report-preview">
        <table class="data-table">
          <thead>
            <tr>
              <th>Importar</th>
              <th>Teste no relatório</th>
              <th>Resultado</th>
              <th>Caso desta execução</th>
              <th>Revisão</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index; let index = $index) {
              <tr>
                <td>
                  <input
                    type="checkbox"
                    [attr.aria-label]="'Importar ' + row.name"
                    [checked]="row.selected"
                    [disabled]="busy() || state.blocked() || row.confirmed"
                    (change)="select(index, $any($event.target).checked)"
                  />
                </td>
                <td>
                  {{ row.name }}
                  @if (row.comment) {
                    <details>
                      <summary>Mensagem do relatório</summary>
                      <p class="preserve-text">{{ row.comment }}</p>
                    </details>
                  }
                </td>
                <td>{{ labels[row.result] }}</td>
                <td>
                  <select
                    [attr.aria-label]="'Caso de ' + row.name"
                    [ngModel]="row.targetId"
                    [disabled]="busy() || state.blocked() || row.confirmed"
                    (ngModelChange)="mapCase(index, $event)"
                  >
                    <option value="">Selecionar caso</option>
                    @for (item of cases(); track item.id) {
                      <option [value]="item.id">
                        {{ item.humanIdSnapshot }} · {{ item.titleSnapshot }}
                      </option>
                    }
                  </select>
                </td>
                <td>
                  @if (row.confirmed) {
                    Confirmado
                  } @else {
                    {{ issue(row) || 'Pronto para importar' }}
                    @if (target(row)?.result !== 'NOT_TESTED' && target(row)) {
                      <small>Resultado atual: {{ labels[target(row)!.result] }}</small>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <label
        ><input
          type="checkbox"
          [ngModel]="overwrite()"
          [disabled]="busy() || state.blocked()"
          (ngModelChange)="overwrite.set($event)"
        />
        Permitir substituir resultados já registrados dos casos selecionados</label
      >
      <div class="row-actions">
        <button
          class="btn"
          [disabled]="busy() || !!read.wait() || !!state.wait()"
          (click)="refresh()"
        >
          Consultar resultados atuais
        </button>
        <button
          class="btn"
          [disabled]="busy() || state.blocked() || !!state.wait() || !ready() || !selectedCount()"
          (click)="apply()"
        >
          Importar {{ selectedCount() }} resultados
        </button>
      </div>
      <p class="dashboard-footnote">
        As inclusões são confirmadas em sequência. Em caso de erro, os resultados já confirmados
        permanecem salvos; não há repetição automática.
      </p>
    }
  </section>`,
})
export class TestReportImport {
  readonly project = input.required<Project>();
  readonly initial = input.required<TestRun>();
  readonly closed = output<void>();
  readonly updated = output<TestRun>();
  readonly settled = output<void>();
  private readonly api = inject(ExecutionApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = new ExecutionState(this.destroyRef);
  readonly read = new OperationState(this.destroyRef);
  readonly run = signal<TestRun | null>(null);
  readonly cases = signal<RunCase[]>([]);
  readonly rows = signal<ImportRow[]>([]);
  readonly fileName = signal('');
  readonly error = signal('');
  readonly progress = signal('');
  readonly readingFile = signal(false);
  readonly overwrite = signal(false);
  readonly current = signal(false);
  readonly labels = resultLabels;
  private fileGeneration = 0;
  constructor() {
    this.destroyRef.onDestroy(() => {
      this.fileGeneration++;
    });
  }
  busy() {
    return this.state.busy() || this.read.busy() || this.readingFile();
  }
  selectedCount() {
    return this.rows().filter((r) => r.selected && !r.confirmed).length;
  }
  target(row: ImportRow) {
    return this.cases().find((c) => c.id === row.targetId);
  }
  issue(row: ImportRow) {
    if (row.confirmed) return '';
    const issue = reportIssue(row, this.target(row));
    if (issue) return issue;
    if (
      row.selected &&
      this.rows().filter((r) => r.selected && !r.confirmed && r.targetId === row.targetId).length >
        1
    )
      return 'Mais de um resultado selecionado para este caso. Escolha apenas um.';
    if (row.selected && this.target(row)?.result !== 'NOT_TESTED' && !this.overwrite())
      return 'Autorize a substituição ou desmarque este resultado.';
    return '';
  }
  ready() {
    return (
      this.current() &&
      this.run()?.status === 'IN_PROGRESS' &&
      this.rows()
        .filter((r) => r.selected && !r.confirmed)
        .every((row) => !this.issue(row))
    );
  }
  select(index: number, selected: boolean) {
    if (this.busy() || this.state.blocked() || this.rows()[index]?.confirmed) return;
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, selected } : row)));
  }
  mapCase(index: number, targetId: string) {
    if (this.busy() || this.state.blocked() || this.rows()[index]?.confirmed) return;
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, targetId } : row)));
  }
  async chooseFile(event: Event) {
    if (this.busy() || this.state.blocked()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const generation = ++this.fileGeneration;
    this.error.set('');
    this.progress.set('');
    this.state.error.set('');
    this.rows.set([]);
    this.overwrite.set(false);
    if (file.size > reportLimit) {
      this.error.set('O relatório deve ter até 2 MiB.');
      return;
    }
    this.readingFile.set(true);
    try {
      const text = await file.text();
      if (generation !== this.fileGeneration) return;
      const rows = parseJUnit(text);
      this.fileName.set(file.name);
      this.rows.set(
        rows.map((row) => ({ ...row, targetId: '', selected: false, confirmed: false })),
      );
      this.refresh(true);
    } catch (error) {
      if (generation === this.fileGeneration)
        this.error.set(
          error instanceof Error ? error.message : 'Não foi possível ler o relatório.',
        );
    } finally {
      if (generation === this.fileGeneration) this.readingFile.set(false);
    }
  }
  refresh(autoMatch = false) {
    if (this.state.busy() || this.read.busy() || this.read.wait()) return;
    const run = this.run() ?? this.initial();
    this.current.set(false);
    this.read.run(
      forkJoin({
        run: this.api.run(run.workspaceId, run.projectId, run.id),
        cases: allPages((page) =>
          this.api.runCases(run.workspaceId, run.projectId, run.id, {
            page,
            size: 100,
            sort: 'position,asc',
          }),
        ),
      }),
      (data) => {
        this.current.set(true);
        this.run.set(data.run.data);
        this.cases.set(data.cases);
        this.updated.emit(data.run.data);
        this.state.blocked.set(false);
        this.state.error.set('');
        this.overwrite.set(false);
        if (autoMatch)
          this.rows.update((rows) =>
            rows.map((row) => {
              const targetId = reportMatch(row, data.cases);
              return {
                ...row,
                targetId,
                selected:
                  !!targetId &&
                  !reportIssue(
                    row,
                    data.cases.find((c) => c.id === targetId),
                  ) &&
                  data.cases.find((c) => c.id === targetId)?.result === 'NOT_TESTED',
              };
            }),
          );
        this.settled.emit();
      },
    );
  }
  apply() {
    const run = this.run();
    if (
      !run ||
      this.busy() ||
      this.state.blocked() ||
      this.state.wait() ||
      !this.ready() ||
      !this.selectedCount() ||
      !canChange(this.project(), 'testrun.execute')
    )
      return;
    const selection = this.rows().filter((row) => row.selected && !row.confirmed);
    const comments = new Map(
      selection.map((row) => [
        row.targetId,
        [this.target(row)?.comment, `[JUnit: ${this.fileName()}] ${row.name}\n${row.comment}`]
          .filter(Boolean)
          .join('\n\n'),
      ]),
    );
    if (
      selection.some(
        (row) =>
          comments.get(row.targetId)!.length > 10000 ||
          !payloadFits({
            version: run.version,
            result: row.result,
            comment: comments.get(row.targetId),
          }),
      )
    ) {
      this.error.set(
        'O comentário resultante excede o limite permitido. Reduza a mensagem do relatório ou o comentário existente.',
      );
      return;
    }
    this.error.set('');
    this.current.set(false);
    let confirmed = 0;
    this.progress.set(`0 de ${selection.length} resultados confirmados.`);
    this.state.run(
      this.api.run(run.workspaceId, run.projectId, run.id).pipe(
        concatMap((response) => {
          if (response.data.version !== run.version || response.data.status !== 'IN_PROGRESS')
            return throwError(
              () =>
                new HttpErrorResponse({
                  status: 409,
                  error: { code: 'TEST_RUN_VERSION_CONFLICT', requestId: response.meta?.requestId },
                }),
            );
          return from(selection).pipe(
            concatMap((row) =>
              defer(() =>
                this.api.caseResult(run.workspaceId, run.projectId, run.id, row.targetId, {
                  version: this.run()!.version,
                  result: row.result,
                  comment: comments.get(row.targetId)!,
                }),
              ).pipe(
                tap((result) => {
                  this.run.set(result.data);
                  this.updated.emit(result.data);
                  this.rows.update((rows) =>
                    rows.map((item) =>
                      item === row ? { ...item, selected: false, confirmed: true } : item,
                    ),
                  );
                  this.progress.set(
                    `${++confirmed} de ${selection.length} resultados confirmados.`,
                  );
                }),
              ),
            ),
            toArray(),
          );
        }),
        catchError((error) => {
          this.settled.emit();
          return throwError(() => error);
        }),
      ),
      () => {
        this.progress.set(
          `${confirmed} resultados importados. Revise a execução antes de concluí-la.`,
        );
        this.settled.emit();
      },
    );
  }
}
