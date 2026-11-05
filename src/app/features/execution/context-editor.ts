import { Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Project } from '../projects/project.models';
import { ProjectApi } from '../projects/project-api.service';
import { allPages } from '../test-cases/test-case.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { EditorField, FormDialog, nameField } from '../workspaces/ui/form-dialog';
import { ExecutionCaseSelection } from './case-selection';
import { TestPlan } from './execution.models';
@Component({
  selector: 'app-execution-context-editor',
  imports: [FormDialog, ExecutionCaseSelection],
  template: `
    @if (fields(); as editorFields) {
      <app-form-dialog
        [title]="plan() ? 'Editar plano' : run() ? 'Criar execução avulsa' : 'Criar plano'"
        [fields]="editorFields"
        [wide]="!plan()"
        [state]="state()"
        [blocked]="blocked() || (run() && !ids().length)"
        hint="Após uma resposta incerta, consulte a lista antes de repetir a criação."
        (saved)="saved.emit({ values: $event.values, form: $event.form, caseIds: ids() })"
        (closed)="closed.emit()"
      >
        <ng-content />
        @if (!plan() && project().permissions.includes('testcase.read')) {
          <app-execution-case-selection
            [project]="project()"
            [selected]="ids()"
            [allowDraft]="!run()"
            [blocked]="state().busy() || blocked()"
            (changed)="ids.set($event)"
          />
        }
      </app-form-dialog>
    } @else {
      <section class="detail-card">
        <p role="status">Carregando marcos e ambientes…</p>
        @if (catalog.error()) {
          <p class="message error" role="alert">{{ catalog.error() }}</p>
          <button class="btn" [disabled]="catalog.busy() || !!catalog.wait()" (click)="load()">
            {{ catalog.wait() ? 'Aguarde ' + catalog.wait() + 's' : 'Consultar novamente' }}
          </button>
        }
        <button class="btn" (click)="closed.emit()">Cancelar</button>
      </section>
    }
  `,
})
export class ExecutionContextEditor implements OnInit {
  readonly project = input.required<Project>();
  readonly plan = input<TestPlan | null>(null);
  readonly run = input(false);
  readonly state = input.required<OperationState>();
  readonly blocked = input(false);
  readonly saved = output<{
    values: Record<string, unknown>;
    form: FormGroup;
    caseIds: string[];
  }>();
  readonly closed = output<void>();
  private readonly api = inject(ProjectApi);
  readonly catalog = new OperationState(inject(DestroyRef));
  readonly fields = signal<EditorField[] | null>(null);
  readonly ids = signal<string[]>([]);
  ngOnInit() {
    this.load();
  }
  load() {
    const p = this.project();
    this.catalog.run(
      forkJoin({
        milestones: allPages((page) =>
          this.api.resources(p.workspaceId, p.id, 'milestones', {
            page,
            size: 100,
            status: 'ALL',
            sort: 'name,asc',
          }),
        ),
        environments: allPages((page) =>
          this.api.resources(p.workspaceId, p.id, 'environments', {
            page,
            size: 100,
            sort: 'name,asc',
          }),
        ),
      }),
      (result) => {
        const plan = this.plan();
        const milestoneOptions = result.milestones
          .filter((m) => !m.deletedAt && m.status !== 'CANCELLED')
          .map((m) => ({ value: m.id, label: m.name, disabled: false }));
        const environmentOptions = result.environments
          .filter((e) => !e.deletedAt && e.active)
          .map((e) => ({ value: e.id, label: e.name, disabled: false }));
        if (plan?.milestoneId && !milestoneOptions.some((m) => m.value === plan.milestoneId))
          milestoneOptions.push({
            value: plan.milestoneId,
            label: 'Marco atual indisponível — escolha outro ou remova',
            disabled: true,
          });
        if (plan?.environmentId && !environmentOptions.some((e) => e.value === plan.environmentId))
          environmentOptions.push({
            value: plan.environmentId,
            label: 'Ambiente atual indisponível — escolha outro ou remova',
            disabled: true,
          });
        this.fields.set([
          nameField(plan?.name),
          ...(!this.run()
            ? [
                {
                  key: 'description',
                  label: 'Descrição',
                  type: 'textarea' as const,
                  value: plan?.description ?? '',
                  max: 10000,
                },
              ]
            : []),
          {
            key: 'milestoneId',
            label: 'Marco',
            type: 'select',
            value: plan?.milestoneId ?? '',
            options: [{ value: '', label: 'Sem marco' }, ...milestoneOptions],
          },
          {
            key: 'environmentId',
            label: 'Ambiente',
            type: 'select',
            value: plan?.environmentId ?? '',
            options: [{ value: '', label: 'Sem ambiente' }, ...environmentOptions],
          },
        ]);
      },
    );
  }
}
