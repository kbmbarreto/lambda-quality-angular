import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { SaoPauloDatePipe } from '../../shared/sao-paulo-date.pipe';
import { OperationState } from '../workspaces/workspace-feedback';
import { Defect, defectStatuses } from './defect.models';
import { DefectHistoryApi, DefectHistoryEntry } from './defect-history-api.service';

@Component({
  selector: 'app-defect-history',
  imports: [SaoPauloDatePipe],
  template: `
    <section aria-label="Histórico do defeito" class="defect-history">
      <div class="section-heading">
        <h3>Comentários e histórico de situação</h3>
        <button
          class="btn"
          type="button"
          [disabled]="state.busy() || !!state.wait()"
          (click)="load()"
        >
          {{ state.busy() ? 'Consultando…' : 'Atualizar histórico' }}
        </button>
      </div>
      @if (state.busy()) {
        <p role="status">Consultando todo o histórico do defeito…</p>
      } @else if (state.error()) {
        <p class="message error" role="alert">{{ state.error() }}</p>
      } @else if (unsupported()) {
        <p class="message info" role="status">
          Comentários e histórico ainda não estão disponíveis.
        </p>
      } @else {
        <p class="field-hint">{{ entries().length }} registro(s) · histórico completo</p>
        <div
          class="defect-timeline"
          tabindex="0"
          role="region"
          aria-label="Todos os registros do defeito"
        >
          @for (entry of entries(); track entry.id) {
            <article class="defect-event">
              <div class="defect-event-heading">
                <strong>{{ entry.actor.displayName || entry.actor.id }}</strong>
                <time [attr.datetime]="entry.createdAt">{{
                  entry.createdAt | date: 'dd/MM/yyyy HH:mm:ss'
                }}</time>
              </div>
              @if (entry.type === 'CREATED') {
                <p>
                  Defeito criado
                  @if (entry.toStatus) {
                    · {{ labels[entry.toStatus] }}
                  }
                </p>
              } @else if (entry.toStatus && entry.toStatus !== entry.fromStatus) {
                <p class="defect-status-change">
                  {{
                    entry.fromStatus ? labels[entry.fromStatus] : 'Situação anterior não registrada'
                  }}
                  <span aria-label="alterado para"> → </span
                  ><strong>{{ labels[entry.toStatus] }}</strong>
                </p>
              }
              @if (entry.comment) {
                <p class="preserve-text defect-comment">{{ entry.comment }}</p>
              }
            </article>
          } @empty {
            <p>Nenhum comentário ou mudança de situação registrado.</p>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .defect-history {
      margin: 24px 0;
    }
    .defect-timeline {
      max-height: 440px;
      overflow: auto;
      padding: 2px 10px 2px 2px;
    }
    .defect-event {
      margin: 0 0 12px;
      padding: 14px 16px;
      border: 1px solid var(--divider);
      border-left: 3px solid var(--accent);
      border-radius: 6px;
      background: var(--surface-alt);
    }
    .defect-event-heading {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
    }
    time {
      color: var(--muted);
    }
    .defect-comment {
      overflow-wrap: anywhere;
      margin-bottom: 0;
    }
  `,
})
export class DefectHistory {
  readonly item = input.required<Defect>();
  readonly available = output<boolean>();
  private readonly api = inject(DefectHistoryApi);
  private readonly cancel = new Subject<void>();
  readonly state = new OperationState(inject(DestroyRef));
  readonly entries = signal<DefectHistoryEntry[]>([]);
  readonly unsupported = signal(false);
  readonly labels = defectStatuses;
  constructor() {
    effect(() => {
      const item = this.item();
      // Reading the response version refreshes the timeline after any successful mutation/reload.
      void item.version;
      untracked(() => this.load());
    });
  }
  load() {
    this.cancel.next();
    this.available.emit(false);
    this.entries.set([]);
    this.unsupported.set(false);
    const item = this.item();
    this.state.run(
      this.api.load(item.workspaceId, item.projectId, item.id).pipe(takeUntil(this.cancel)),
      (entries) => {
        this.unsupported.set(entries === null);
        this.entries.set(entries ?? []);
        this.available.emit(entries !== null);
      },
    );
  }
}
