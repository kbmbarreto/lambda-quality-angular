import { Component, input } from '@angular/core';
import { GovernanceSession } from './governance-session';
import { GovernanceSummary } from './governance-summary';
import { complianceStatuses, sectionPath } from './governance.models';
@Component({
  selector: 'app-governance-conflict',
  imports: [GovernanceSummary],
  template: `@if (session().read.error()) {
      <p class="message error" role="alert">
        {{ session().read.error() }}
        @if (session().read.wait()) {
          Aguarde {{ session().read.wait() }}s.
        }
      </p>
    }
    @if (session().state.blocked()) {
      <section class="message info" aria-label="Revisar alteração concorrente de governança">
        <p>
          Seu formulário permanece preenchido. Consulte os dados atuais, compare e revise antes de
          reenviar. Após uma resposta incerta, verifique se a alteração já foi aplicada.
        </p>
        <button
          class="btn"
          type="button"
          [disabled]="session().read.busy() || !!session().read.wait()"
          (click)="session().reload()"
        >
          Consultar estado atual
        </button>
        @if (session().latest(); as latest) {
          <app-governance-summary [kind]="session().kind" [item]="latest.item" />
          <details>
            <summary>Definições e resultados atuais</summary>
            @for (s of latest.sections; track s.id) {
              <p>
                {{ path(s.id, latest.sections) }} · Posição {{ s.position }}<br />{{
                  s.description
                }}
              </p>
            }
            @for (c of latest.controls; track c.id) {
              <p>
                {{ c.code }} · {{ c.title }} · Peso {{ c.weight }} ·
                {{ c.active ? 'Ativo' : 'Inativo' }} · Seção {{ c.sectionId }}<br />{{
                  c.description
                }}
              </p>
            }
            @for (c of latest.assessed; track c.id) {
              <p>
                {{ c.controlSnapshot.code }} · {{ c.controlSnapshot.title }} · {{ labels[c.status]
                }}<br />{{ c.justification }}
              </p>
            }
          </details>
          <button
            class="btn"
            type="button"
            [disabled]="session().read.busy() || !!session().read.wait()"
            (click)="session().review()"
          >
            Revisei as alterações; usar esta versão
          </button>
        }
      </section>
    }`,
})
export class GovernanceConflict {
  readonly session = input.required<GovernanceSession>();
  readonly labels = complianceStatuses;
  readonly path = sectionPath;
}
