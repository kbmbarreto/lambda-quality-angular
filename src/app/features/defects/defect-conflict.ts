import { Component, input, output } from '@angular/core';
import { Defect } from './defect.models';
import { DefectView } from './defect-view';
@Component({
  selector: 'app-defect-conflict',
  imports: [DefectView],
  template: `
    @if (error()) {
      <p class="message error" role="alert">
        {{ error() }}
        @if (wait()) {
          Aguarde {{ wait() }}s.
        }
      </p>
    }
    @if (blocked()) {
      <section class="message info" aria-label="Revisar alteração concorrente do defeito">
        <p>
          Seu formulário permanece preenchido. Consulte o defeito atual e compare antes de reenviar.
          Após uma resposta incerta, verifique se a alteração já foi aplicada.
        </p>
        <button class="btn" type="button" [disabled]="busy() || !!wait()" (click)="reload.emit()">
          Consultar defeito atual
        </button>
        @if (latest(); as current) {
          <h3>{{ current.humanId }} · {{ current.title }}</h3>
          <app-defect-view [item]="current" [showAttachmentIds]="true" /><button
            class="btn"
            type="button"
            [disabled]="busy() || !!wait()"
            (click)="reviewed.emit()"
          >
            Revisei as alterações; usar esta versão
          </button>
        }
      </section>
    }
  `,
})
export class DefectConflict {
  readonly blocked = input(false);
  readonly busy = input(false);
  readonly wait = input(0);
  readonly error = input('');
  readonly latest = input<Defect | null>(null);
  readonly reload = output<void>();
  readonly reviewed = output<void>();
}
