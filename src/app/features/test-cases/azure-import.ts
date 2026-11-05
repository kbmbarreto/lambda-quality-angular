import { AzureImportResult } from './test-case.models';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Project, canChange } from '../projects/project.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { TestCaseApi } from './test-case-api.service';

export function azureFileError(file: File): string {
  if (!/\.csv$/i.test(file.name)) return 'Selecione um arquivo .csv exportado do Azure DevOps.';
  if (file.size > 5 * 1024 * 1024) return 'O arquivo deve ter no máximo 5 MiB.';
  if (!file.size) return 'O arquivo está vazio. Selecione outro CSV.';
  return '';
}
@Component({
  selector: 'app-azure-import',
  template: `<dialog
    #dialog
    class="window editor-dialog"
    aria-labelledby="azure-import-title"
    (cancel)="cancel($event)"
  >
    <header class="window-header" id="azure-import-title">Importar CSV do Azure DevOps</header>
    <form (submit)="submit($event)" [attr.aria-busy]="state.busy()">
      <div class="panel-body">
        <p>
          Os casos serão criados como rascunho, sem suíte, neste projeto. Descrições BDD e passos
          serão preservados.
        </p>
        <p class="field-hint">
          CSV UTF-8, até 5 MiB. O mesmo arquivo neste projeto não cria casos duplicados ao reenviar.
        </p>
        <div class="field">
          <label for="azure-csv">Arquivo CSV</label
          ><input
            id="azure-csv"
            type="file"
            accept=".csv"
            [disabled]="state.busy()"
            (change)="choose($event)"
          />
        </div>
        @if (file()) {
          <p>Selecionado: {{ file()!.name }}</p>
        }
        @if (state.error()) {
          <p class="message error" role="alert">{{ state.error() }}</p>
        }
      </div>
      <footer class="window-footer">
        <button class="btn" type="button" [disabled]="state.busy()" (click)="closed.emit()">
          Cancelar
        </button>
        <button
          class="btn btn-primary"
          type="submit"
          [disabled]="!file() || state.busy() || !!state.wait()"
        >
          {{
            state.busy()
              ? 'Importando…'
              : state.wait()
                ? 'Aguarde ' + state.wait() + 's'
                : 'Importar CSV'
          }}
        </button>
      </footer>
    </form>
  </dialog>`,
})
export class AzureImport implements AfterViewInit {
  readonly project = input.required<Project>();
  readonly imported = output<AzureImportResult>();
  readonly closed = output<void>();
  readonly file = signal<File | null>(null);
  readonly state = new OperationState(inject(DestroyRef));
  private readonly api = inject(TestCaseApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  ngAfterViewInit() {
    this.dialog().nativeElement.showModal();
  }
  cancel(event: Event) {
    event.preventDefault();
    if (!this.state.busy()) this.closed.emit();
  }
  choose(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(null);
    this.state.error.set(file ? azureFileError(file) : '');
    if (file && !this.state.error()) this.file.set(file);
  }
  submit(event?: Event) {
    event?.preventDefault();
    const file = this.file(),
      p = this.project();
    if (!file || !canChange(p, 'testcase.create') || this.state.busy() || this.state.wait()) return;
    const error = azureFileError(file);
    if (error) {
      this.state.error.set(error);
      return;
    }
    this.state.run(this.api.importAzure(p.workspaceId, p.id, file), (response) =>
      this.imported.emit(response.data),
    );
  }
}
