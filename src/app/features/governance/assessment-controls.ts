import { Component, input, output, signal, inject } from '@angular/core';
import { FormsModule, FormGroup } from '@angular/forms';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { FormDialog, EditorField } from '../workspaces/ui/form-dialog';
import { PaginationControls } from '../workspaces/ui/list-tools';
import { options } from '../test-cases/test-case.models';
import { GovernanceApi } from './governance-api.service';
import { GovernanceSession } from './governance-session';
import { GovernanceConflict } from './governance-conflict';
import { GovernanceEvidence } from './governance-evidence';
import { AssessedControl, ComplianceStatus, complianceStatuses } from './governance.models';
import { fieldFailure } from './governance-fields';
import { localPagination } from './framework-definition';
import { SectionTree } from './section-tree';
import { GovernanceProgressSummary } from './progress-summary';
@Component({
  selector: 'app-assessment-controls',
  imports: [
    FormsModule,
    DatePipe,
    FormDialog,
    PaginationControls,
    GovernanceConflict,
    GovernanceEvidence,
    SectionTree,
    GovernanceProgressSummary,
  ],
  templateUrl: './assessment-controls.html',
})
export class AssessmentControls {
  readonly session = input.required<GovernanceSession>();
  readonly action = output<string>();
  private readonly api = inject(GovernanceApi);
  readonly page = signal(1);
  readonly sectionId = signal('');
  readonly search = signal('');
  readonly goal = output<string>();
  sections() {
    return (
      this.session().view().progress?.sections ??
      this.session().assessment().frameworkSnapshot.sections
    );
  }
  controls() {
    return this.session()
      .view()
      .assessed.map((c) => c.controlSnapshot);
  }
  summary() {
    const progress = this.session().view().progress;
    return this.sectionId()
      ? (progress?.sections.find((s) => s.id === this.sectionId())?.subtree ?? null)
      : (progress?.summary ?? null);
  }
  sectionName() {
    return this.sections().find((s) => s.id === this.sectionId())?.name ?? 'Todos os controles';
  }
  chooseSection(id: string) {
    this.sectionId.set(id);
    this.page.set(1);
  }
  markMet(c: AssessedControl) {
    const s = this.session();
    if (!s.assessable() || c.status === 'MET') return;
    const body = { version: s.item().version, status: 'MET' as const };
    s.write(this.api.assess(s.item().workspaceId, s.item().id, c.controlId, body), body, () => {});
  }
  readonly selectedId = signal('');
  readonly editor = signal<{ control: AssessedControl; fields: EditorField[] } | null>(null);
  readonly statuses = complianceStatuses;
  readonly choices = options(complianceStatuses);
  statusFilter = '';
  rows() {
    return this.session()
      .view()
      .assessed.filter(
        (c) =>
          (!this.statusFilter || c.status === this.statusFilter) &&
          (!this.sectionId() ||
            c.controlSnapshot.sectionPath.some((s) => s.id === this.sectionId())) &&
          `${c.controlSnapshot.code} ${c.controlSnapshot.title}`
            .toLocaleLowerCase('pt-BR')
            .includes(this.search().trim().toLocaleLowerCase('pt-BR')),
      );
  }
  visible() {
    return this.rows().slice((this.page() - 1) * 20, this.page() * 20);
  }
  pagination() {
    return localPagination(this.rows().length, this.page());
  }
  selected() {
    return this.session()
      .view()
      .assessed.find((c) => c.id === this.selectedId());
  }
  edit(c: AssessedControl) {
    if (!this.session().assessable()) return;
    this.session().state.error.set('');
    this.editor.set({
      control: c,
      fields: [
        {
          key: 'status',
          label: 'Classificação',
          type: 'select',
          required: true,
          value: c.status,
          options: this.choices,
        },
        {
          key: 'justification',
          label: 'Justificativa',
          type: 'textarea',
          max: 10000,
          value: c.justification ?? '',
          hint: 'Obrigatória para Não aplicável. Texto preservado.',
        },
      ],
    });
  }
  save(event: { values: Record<string, unknown>; form: FormGroup }) {
    const s = this.session(),
      e = this.editor();
    if (!e || !s.assessable()) return;
    const status = String(event.values['status']) as ComplianceStatus;
    if (!(status in complianceStatuses)) return;
    const justification = String(event.values['justification'] ?? '');
    if (status === 'NOT_APPLICABLE' && !justification.trim()) {
      fieldFailure(event.form, 'justification', 'Justifique a classificação não aplicável.');
      return;
    }
    const body = { version: s.item().version, status, justification: justification || null };
    s.write(
      this.api.assess(s.item().workspaceId, s.item().id, e.control.controlId, body),
      body,
      () => this.editor.set(null),
      event.form,
    );
  }
}
