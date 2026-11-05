import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { fieldError, trimmedLength } from '../../shared/form-feedback';
import { CustomField } from '../workspaces/workspace.models';
import { OperationState } from '../workspaces/workspace-feedback';
import {
  CaseDefinition,
  CaseStatus,
  CreateCase,
  FieldValue,
  TestCase,
  TestSuite,
  caseOptions,
  options,
  suiteLabel,
} from './test-case.models';
import { CaseFields, fieldForm, fieldValues } from './case-fields';
import { CaseConflict } from './case-conflict';

export type CaseEditorMode = 'create' | 'edit' | 'restore' | 'fields';
export type EditorResult = {
  definition: CaseDefinition;
  suiteId: string | null;
  customFields: FieldValue[];
  steps: CreateCase['steps'];
  form: FormGroup;
};
@Component({
  selector: 'app-case-editor',
  imports: [ReactiveFormsModule, CaseFields, CaseConflict],
  templateUrl: './case-editor.html',
})
export class CaseEditor implements OnInit, AfterViewInit {
  readonly mode = input.required<CaseEditorMode>();
  readonly original = input<TestCase | null>(null);
  readonly suites = input.required<TestSuite[]>();
  readonly definitions = input.required<CustomField[]>();
  readonly fieldsAvailable = input(true);
  readonly suiteId = input<string | null>(null);
  readonly initialTitle = input('');
  readonly state = input.required<OperationState>();
  readonly conflict = input(false);
  readonly latest = input<TestCase | null>(null);
  readonly readError = input('');
  readonly reading = input(false);
  readonly reload = output<void>();
  readonly reviewed = output<TestCase>();
  readonly saved = output<EditorResult>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly titles = {
    create: 'Criar caso de teste',
    edit: 'Editar caso de teste',
    restore: 'Restaurar caso de teste',
    fields: 'Substituir valores personalizados',
  };
  readonly labels = caseOptions;
  readonly enumKeys = [
    'status',
    'severity',
    'priority',
    'type',
    'layer',
    'automationStatus',
  ] as const;
  readonly enumLabels = {
    status: 'Situação',
    severity: 'Severidade',
    priority: 'Prioridade',
    type: 'Tipo',
    layer: 'Camada',
    automationStatus: 'Automação',
  };
  readonly textKeys = ['description', 'preconditions', 'postconditions'] as const;
  readonly textLabels = {
    description: 'Descrição',
    preconditions: 'Pré-condições',
    postconditions: 'Pós-condições',
  };
  readonly options = options;
  form!: FormGroup;
  ngOnInit(): void {
    const item = this.original();
    const defaults = {
      status: 'DRAFT',
      severity: 'NORMAL',
      priority: 'MEDIUM',
      type: 'FUNCTIONAL',
      layer: 'E2E',
      automationStatus: 'MANUAL',
    };
    const controls: Record<string, FormControl | FormArray> = {
      title: new FormControl(item?.title ?? this.initialTitle(), [trimmedLength(1, 250)]),
      behavior: new FormControl(item?.behavior ?? '', Validators.maxLength(100)),
      suiteId: new FormControl(
        this.suites().some(
          (suite) => !suite.archivedAt && suite.id === (item?.suiteId ?? this.suiteId()),
        )
          ? (item?.suiteId ?? this.suiteId())
          : '',
      ),
      customFields: fieldForm(this.definitions(), item?.customFields ?? []),
      steps: new FormArray<FormGroup>([]),
    };
    for (const key of this.enumKeys)
      controls[key] = new FormControl(
        item?.[key] === 'ARCHIVED' ? 'DRAFT' : (item?.[key] ?? defaults[key]),
        Validators.required,
      );
    for (const key of this.textKeys)
      controls[key] = new FormControl(item?.[key] ?? '', Validators.maxLength(10000));
    this.form = new FormGroup(controls);
    if (this.mode() === 'restore' || this.mode() === 'fields') {
      for (const [key, control] of Object.entries(this.form.controls))
        if (
          key !== 'customFields' &&
          !(this.mode() === 'restore' && ['status', 'suiteId'].includes(key))
        )
          control.disable();
    }
  }
  ngAfterViewInit() {
    this.dialog().nativeElement.showModal();
  }
  activeSuites() {
    return this.suites().filter((suite) => !suite.archivedAt);
  }
  suiteName(suite: TestSuite) {
    return suiteLabel(suite, this.suites());
  }
  stepGroups() {
    return (this.form.get('steps') as FormArray).controls as FormGroup[];
  }
  addStep() {
    if (this.state().busy() || this.stepGroups().length >= 1000) return;
    (this.form.get('steps') as FormArray).push(
      new FormGroup({
        action: new FormControl('', [trimmedLength(1, 10000)]),
        testData: new FormControl('', Validators.maxLength(10000)),
        expectedResult: new FormControl('', Validators.maxLength(10000)),
      }),
    );
  }
  removeStep(index: number) {
    if (!this.state().busy()) (this.form.get('steps') as FormArray).removeAt(index);
  }
  error(key: string) {
    if (this.form.get(key)?.hasError('server')) return fieldError(this.form, key);
    if (this.form.get(key)?.touched && this.form.get(key)?.hasError('trimmedLength'))
      return 'Informe um título entre 1 e 250 caracteres.';
    return fieldError(this.form, key);
  }
  stepError(index: number, key: string) {
    if (this.stepGroups()[index].get(key)?.hasError('server'))
      return fieldError(this.stepGroups()[index], key);
    if (
      this.stepGroups()[index].get(key)?.touched &&
      this.stepGroups()[index].get(key)?.hasError('trimmedLength')
    )
      return 'Informe uma ação entre 1 e 10000 caracteres.';
    return fieldError(this.stepGroups()[index], key);
  }
  cancel(event: Event) {
    event.preventDefault();
    if (!this.state().busy()) this.closed.emit();
  }
  submit() {
    if (this.state().busy() || this.state().wait() || this.conflict() || this.reading()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const definition: CaseDefinition = {
      title: String(raw.title).trim(),
      description: raw.description || null,
      preconditions: raw.preconditions || null,
      postconditions: raw.postconditions || null,
      behavior: raw.behavior || null,
      status: raw.status as CaseStatus,
      severity: raw.severity,
      priority: raw.priority,
      type: raw.type,
      layer: raw.layer,
      automationStatus: raw.automationStatus,
    };
    this.saved.emit({
      definition,
      suiteId: raw.suiteId || null,
      customFields: fieldValues(this.form),
      steps: this.stepGroups().map((group) => ({
        action: group.value.action.trim(),
        testData: group.value.testData || null,
        expectedResult: group.value.expectedResult || null,
      })),
      form: this.form,
    });
  }
}
