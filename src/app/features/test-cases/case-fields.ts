import { Component, input } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { CustomField } from '../workspaces/workspace.models';
import { validCalendarDate } from '../projects/project.models';
import { fieldError } from '../../shared/form-feedback';
import { FieldValue } from './test-case.models';

export function customValueError(field: CustomField, value: unknown): ValidationErrors | null {
  const empty =
    value === null || value === undefined || (typeof value === 'string' && !value.trim());
  if (empty) return field.required ? { required: true } : null;
  switch (field.type) {
    case 'TEXT':
      return typeof value === 'string' && value.length <= 10000 ? null : { type: true };
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value) ? null : { type: true };
    case 'BOOLEAN':
      return typeof value === 'boolean' ? null : { type: true };
    case 'DATE':
      return typeof value === 'string' && validCalendarDate(value) ? null : { type: true };
    case 'SINGLE_SELECT':
      return field.options.some((option) => option.id === value) ? null : { type: true };
  }
}
export function fieldForm(definitions: CustomField[], values: FieldValue[]): FormArray<FormGroup> {
  return new FormArray(
    definitions
      .filter((field) => !field.archivedAt)
      .map(
        (field) =>
          new FormGroup({
            fieldId: new FormControl(field.id),
            value: new FormControl(
              values.find((entry) => entry.fieldId === field.id)?.value ?? null,
              [(control: AbstractControl) => customValueError(field, control.value)],
            ),
          }),
      ),
  );
}
export function fieldValues(form: FormGroup): FieldValue[] {
  return (form.get('customFields') as FormArray).getRawValue().map((entry: FieldValue) => ({
    fieldId: entry.fieldId,
    value: entry.value === '' ? null : entry.value,
  }));
}
@Component({
  selector: 'app-case-fields',
  imports: [ReactiveFormsModule],
  template: `<div [formGroup]="form()">
    <div formArrayName="customFields" class="form-fields">
      @for (group of groups(); track group; let index = $index) {
        @let definition = definitions()[index];
        <div class="field" [formGroupName]="index">
          <label [for]="'custom-value-' + definition.id"
            >{{ definition.name }}{{ definition.required ? ' *' : '' }}</label
          >
          @switch (definition.type) {
            @case ('BOOLEAN') {
              <select [id]="'custom-value-' + definition.id" formControlName="value">
                <option [ngValue]="null">Não preenchido</option>
                <option [ngValue]="true">Sim</option>
                <option [ngValue]="false">Não</option>
              </select>
            }
            @case ('SINGLE_SELECT') {
              <select [id]="'custom-value-' + definition.id" formControlName="value">
                <option [ngValue]="null">Não preenchido</option>
                @for (option of definition.options; track option.id) {
                  <option [ngValue]="option.id">{{ option.label }}</option>
                }
              </select>
            }
            @case ('NUMBER') {
              <input
                [id]="'custom-value-' + definition.id"
                type="number"
                step="any"
                formControlName="value"
              />
            }
            @case ('DATE') {
              <input
                [id]="'custom-value-' + definition.id"
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                formControlName="value"
              />
            }
            @default {
              <textarea
                [id]="'custom-value-' + definition.id"
                formControlName="value"
                maxlength="10000"
              ></textarea>
            }
          }
          <span class="field-hint">{{ definition.description }}</span>
          <span class="field-error" role="status">{{ error(index) }}</span>
        </div>
      }
    </div>
  </div>`,
})
export class CaseFields {
  readonly form = input.required<FormGroup>();
  readonly definitions = input.required<CustomField[]>();
  groups() {
    return (this.form().get('customFields') as FormArray).controls;
  }
  error(index: number): string {
    const group = this.groups()[index] as FormGroup;
    if (group.get('fieldId')?.hasError('server')) return fieldError(group, 'fieldId');
    if (group.get('value')?.hasError('server')) return fieldError(group, 'value');
    return group.get('value')?.touched && group.get('value')?.hasError('type')
      ? 'Informe um valor válido para o tipo deste campo.'
      : fieldError(group, 'value');
  }
}
