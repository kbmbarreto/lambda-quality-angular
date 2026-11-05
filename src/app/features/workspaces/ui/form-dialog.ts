import {
  AfterViewInit,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { fieldError, trimmedLength } from '../../../shared/form-feedback';
import { OperationState } from '../workspace-feedback';

export interface EditorField {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'date' | 'textarea' | 'select' | 'checkbox' | 'number' | 'permissions';
  value?: unknown;
  required?: boolean;
  max?: number;
  min?: number;
  integer?: boolean;
  step?: number;
  pattern?: RegExp;
  hint?: string;
  options?: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}
export interface EditorChange {
  key: string;
  values: Record<string, unknown>;
  form: FormGroup;
}
export const nameField = (value = ''): EditorField => ({
  key: 'name',
  label: 'Nome',
  value,
  required: true,
  max: 100,
});
export const descriptionField = (value: string | null = null): EditorField => ({
  key: 'description',
  label: 'Descrição',
  type: 'textarea',
  value: value ?? '',
  max: 500,
});

@Component({
  selector: 'app-form-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <dialog
      #dialog
      class="window editor-dialog"
      [class.wide-dialog]="wide()"
      (cancel)="cancel($event)"
      aria-labelledby="editor-dialog-title"
    >
      <header class="window-header" id="editor-dialog-title">{{ title() }}</header>
      <form [formGroup]="form()" (ngSubmit)="submit()" [attr.aria-busy]="state().busy()">
        <div class="panel-body">
          @if (hint()) {
            <p>{{ hint() }}</p>
          }
          @if (state().error()) {
            <p class="message error" role="alert">{{ state().error() }}</p>
          }
          <ng-content />
          <fieldset class="form-fields" [disabled]="state().busy() || loading()">
            @for (field of fields(); track field.key) {
              <div class="field">
                <label [for]="'editor-' + field.key"
                  >{{ field.label }}{{ field.required ? ' *' : '' }}</label
                >
                @switch (field.type) {
                  @case ('textarea') {
                    <textarea
                      [id]="'editor-' + field.key"
                      [formControlName]="field.key"
                      [attr.maxlength]="field.max ?? null"
                      [readOnly]="state().busy()"
                      [attr.aria-describedby]="'error-' + field.key"
                    ></textarea>
                  }
                  @case ('select') {
                    <select
                      [id]="'editor-' + field.key"
                      [formControlName]="field.key"
                      [attr.aria-describedby]="'error-' + field.key"
                      (change)="selectChanged(field.key, $event)"
                    >
                      @for (option of field.options ?? []; track option.value) {
                        <option [value]="option.value" [disabled]="option.disabled">
                          {{ option.label }}
                        </option>
                      }
                    </select>
                  }
                  @case ('checkbox') {
                    <input
                      [id]="'editor-' + field.key"
                      type="checkbox"
                      [formControlName]="field.key"
                    />
                  }
                  @case ('number') {
                    <input
                      [id]="'editor-' + field.key"
                      type="number"
                      [formControlName]="field.key"
                      [attr.step]="field.step ?? 1"
                      [attr.min]="field.min ?? null"
                      [attr.max]="field.max ?? null"
                      [readOnly]="state().busy()"
                      [attr.aria-describedby]="'error-' + field.key"
                    />
                  }
                  @case ('permissions') {
                    <fieldset class="permission-list">
                      <legend class="sr-only">{{ field.label }}</legend>
                      @for (option of field.options ?? []; track option.value) {
                        <label
                          ><input
                            type="checkbox"
                            [checked]="contains(field.key, option.value)"
                            [disabled]="option.disabled || state().busy()"
                            (change)="toggle(field.key, option.value)"
                          />{{ option.label }}</label
                        >
                      }
                    </fieldset>
                  }
                  @default {
                    <input
                      [id]="'editor-' + field.key"
                      [type]="field.type ?? 'text'"
                      [formControlName]="field.key"
                      [attr.maxlength]="field.max ?? null"
                      [attr.min]="field.type === 'date' ? '1000-01-01' : null"
                      [attr.max]="field.type === 'date' ? '9999-12-31' : null"
                      [readOnly]="state().busy()"
                      [attr.aria-describedby]="'error-' + field.key"
                    />
                  }
                }
                <span [id]="'error-' + field.key" class="field-error">{{
                  fieldError(field.key)
                }}</span>
                @if (field.hint) {
                  <span class="field-hint">{{ field.hint }}</span>
                }
              </div>
            }
          </fieldset>
        </div>
        <footer class="window-footer">
          <button class="btn" type="button" (click)="closed.emit()" [disabled]="state().busy()">
            Cancelar</button
          ><button
            class="btn"
            type="submit"
            [disabled]="state().busy() || loading() || !!state().wait() || blocked()"
          >
            {{
              state().busy()
                ? 'Aguarde…'
                : state().wait()
                  ? 'Aguarde ' + state().wait() + 's'
                  : submitLabel()
            }}
          </button>
        </footer>
      </form>
    </dialog>
  `,
})
export class FormDialog implements AfterViewInit {
  readonly title = input.required<string>();
  readonly fields = input.required<EditorField[]>();
  readonly state = input.required<OperationState>();
  readonly hint = input('');
  readonly wide = input(false);
  readonly blocked = input(false);
  readonly loading = input(false);
  readonly submitLabel = input('Salvar');
  readonly changed = output<EditorChange>();
  readonly saved = output<{ values: Record<string, unknown>; form: FormGroup }>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly form = computed(() => {
    const controls: Record<string, FormControl> = {};
    for (const field of this.fields()) {
      const validators: ValidatorFn[] = [];
      if (field.required) validators.push(Validators.required);
      if (field.type === 'email') validators.push(Validators.email);
      if (field.pattern) validators.push(Validators.pattern(field.pattern));
      if (field.type === 'number') {
        if (field.min !== undefined) validators.push(Validators.min(field.min));
        if (field.max !== undefined) validators.push(Validators.max(field.max));
        if (field.integer !== false)
          validators.push((control) =>
            Number.isInteger(control.value) ? null : { integer: true },
          );
      } else if (field.type !== 'permissions' && field.type !== 'checkbox') {
        if (field.max) validators.push(Validators.maxLength(field.max));
        if (field.required && field.type !== 'email')
          validators.push(trimmedLength(field.min ?? 1, field.max ?? 100));
      }
      controls[field.key] = new FormControl(
        {
          value:
            field.value ??
            (field.type === 'checkbox' ? false : field.type === 'permissions' ? [] : ''),
          disabled: !!field.disabled,
        },
        validators,
      );
    }
    return new FormGroup(controls);
  });
  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }
  selectChanged(key: string, event: Event) {
    this.form()
      .get(key)
      ?.setValue((event.target as HTMLSelectElement).value);
    this.changed.emit({ key, values: this.form().getRawValue(), form: this.form() });
  }
  cancel(event: Event): void {
    event.preventDefault();
    if (!this.state().busy()) this.closed.emit();
  }
  contains(key: string, value: string): boolean {
    return (this.form().get(key)?.value as string[]).includes(value);
  }
  toggle(key: string, value: string): void {
    const control = this.form().get(key)!;
    const items = control.value as string[];
    control.setValue(
      items.includes(value) ? items.filter((item) => item !== value) : [...items, value],
    );
  }
  fieldError(key: string): string {
    const control = this.form().get(key);
    if (control?.touched && control.hasError('trimmedLength'))
      return 'Preencha com um texto válido dentro do limite indicado.';
    if (
      control?.touched &&
      (control.hasError('integer') || control.hasError('min') || control.hasError('max'))
    )
      return this.fields().find((field) => field.key === key)?.integer === false
        ? 'Informe um número dentro do limite indicado.'
        : 'Informe um número inteiro dentro do limite indicado.';
    if (control?.touched && control.hasError('pattern'))
      return 'Formato inválido. Confira a orientação abaixo.';
    return fieldError(this.form(), key);
  }
  submit(): void {
    if (this.state().busy() || this.state().wait() || this.blocked()) return;
    this.form().markAllAsTouched();
    if (this.form().invalid) return;
    this.saved.emit({ values: this.form().getRawValue(), form: this.form() });
  }
}
