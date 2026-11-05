import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Project } from '../projects/project.models';
import { RunCase } from '../execution/execution.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { EditorField, FormDialog } from '../workspaces/ui/form-dialog';
import { DefectAttachmentSelection } from './attachment-selection';
import { defectFields } from './defect-fields';
import { DefectEnvironments, environmentField } from './defect-environments';
export interface DefectEditorResult {
  values: Record<string, unknown>;
  form: FormGroup;
  attachmentIds: string[];
}
@Component({
  selector: 'app-defect-editor',
  imports: [RouterLink, FormDialog, DefectAttachmentSelection],
  template: ` <app-form-dialog
    [title]="failure() ? 'Criar defeito a partir da falha' : 'Criar defeito avulso'"
    [fields]="fields"
    [state]="state()"
    [blocked]="blocked() || !!environmentRead.error() || !!environmentRead.wait()"
    [loading]="environmentRead.busy()"
    [wide]="true"
    hint="O defeito será criado como Aberto. A origem ficará imutável. Após uma resposta incerta, consulte a lista antes de repetir a criação."
    (saved)="saved.emit({ values: $event.values, form: $event.form, attachmentIds: ids() })"
    (closed)="closed.emit()"
  >
    <ng-content />
    @if (environmentRead.error()) {
      <p class="message error" role="alert">{{ environmentRead.error() }}</p>
      <button
        class="btn"
        type="button"
        [disabled]="environmentRead.busy() || !!environmentRead.wait()"
        (click)="loadEnvironments()"
      >
        Consultar ambientes{{ environmentRead.wait() ? ' (' + environmentRead.wait() + 's)' : '' }}
      </button>
    }
    @if (failure(); as source) {
      <section class="message info">
        <strong>Origem: {{ source.humanIdSnapshot }} · {{ source.titleSnapshot }}</strong>
        <p>
          Resultado consultado: Falhou. Título, severidade e descrição não alterados serão herdados
          da falha pelo servidor. O resultado é revalidado no momento da criação.
        </p>
      </section>
    }
    @if (canReadFiles()) {
      <details>
        <summary>Anexos opcionais ({{ ids().length }} selecionados)</summary>
        <app-defect-attachment-selection
          [workspaceId]="project().workspaceId"
          [selected]="ids()"
          [blocked]="state().busy() || blocked()"
          (changed)="ids.set($event)"
        />
      </details>
    }
    <p>
      <a [routerLink]="['/workspaces', project().workspaceId]">Abrir biblioteca do Workspace</a>
    </p>
  </app-form-dialog>`,
})
export class DefectEditor implements OnInit {
  readonly project = input.required<Project>();
  readonly failure = input<RunCase | null>(null);
  readonly state = input.required<OperationState>();
  readonly blocked = input(false);
  readonly saved = output<DefectEditorResult>();
  readonly closed = output<void>();
  readonly ids = signal<string[]>([]);
  fields: EditorField[] = [];
  readonly dialog = viewChild(FormDialog);
  private readonly environments = inject(DefectEnvironments);
  readonly environmentRead = new OperationState(inject(DestroyRef));
  private readonly workspace = inject(WorkspaceContext);
  ngOnInit() {
    const failure = this.failure();
    this.fields = defectFields(
      failure
        ? {
            title: failure.titleSnapshot,
            severity: failure.severitySnapshot,
            description: failure.comment,
          }
        : undefined,
    );
    this.loadEnvironments();
  }
  loadEnvironments() {
    this.environmentRead.run(this.environments.load(this.project()), (rows) => {
      const draft = this.dialog()?.form().getRawValue() ?? {};
      this.fields = [
        ...this.fields.filter((field) => field.key !== 'environmentId'),
        environmentField(rows, !!this.failure()),
      ].map((field) => ({ ...field, value: draft[field.key] ?? field.value }));
    });
  }
  canReadFiles() {
    return (
      this.workspace.selected()?.id === this.project().workspaceId &&
      this.workspace.can('attachment.read')
    );
  }
}
