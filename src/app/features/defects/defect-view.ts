import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { Component, input } from '@angular/core';
import { caseOptions } from '../test-cases/test-case.models';
import { environmentCategories } from '../projects/project.models';
import { Defect, defectStatuses, validExternalUrl } from './defect.models';
@Component({
  selector: 'app-defect-view',
  imports: [DatePipe],
  template: ` <p>
      <strong>{{ statuses[item().status] }}</strong> · {{ severities[item().severity] }} · Versão
      {{ item().version }}
    </p>
    <dl class="profile-details">
      <dt>Descrição</dt>
      <dd class="preserve-text">{{ item().description ?? 'Sem descrição' }}</dd>
      <dt>Origem</dt>
      <dd>
        {{ item().testRunCaseId ? 'Caso da execução: ' + item().testRunCaseId : 'Defeito avulso' }}
      </dd>
      <dt>Ambiente</dt>
      <dd>
        {{ item().environmentSnapshot?.name || 'Sem ambiente'
        }}{{
          item().environmentSnapshot ? ' · ' + categories[item().environmentSnapshot!.category] : ''
        }}
      </dd>
      <dt>Referência externa</dt>
      <dd>
        @if (item().externalSystem) {
          <strong>{{ item().externalSystem }} · {{ item().externalIssueId }}</strong
          ><br />
          @if (safeUrl()) {
            <a
              [href]="item().externalUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="preserve-text"
              >{{ item().externalUrl }}</a
            >
          } @else {
            <span>URL indisponível para navegação.</span>
          }
        } @else {
          Sem referência externa
        }
      </dd>
      <dt>Criado por / em</dt>
      <dd>{{ item().createdBy }} / {{ item().createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
      <dt>Atualizado em</dt>
      <dd>{{ item().updatedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
      @if (showAttachmentIds()) {
        <dt>Anexos ativos</dt>
        <dd class="preserve-text">{{ item().attachmentIds.join(', ') || 'Sem anexos' }}</dd>
      }
    </dl>`,
})
export class DefectView {
  readonly item = input.required<Defect>();
  readonly showAttachmentIds = input(false);
  readonly statuses = defectStatuses;
  readonly severities = caseOptions.severity;
  readonly categories = environmentCategories;
  safeUrl() {
    return validExternalUrl(this.item().externalUrl);
  }
}
