import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup, ValidationErrors } from '@angular/forms';
import { problemOf } from '../core/api-error';

export function trimmedLength(min: number, max: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const length = String(control.value ?? '').trim().length;
    return length >= min && length <= max ? null : { trimmedLength: true };
  };
}

export function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };
}

export function applyFieldErrors(form: FormGroup, error: unknown): void {
  if (!(error instanceof HttpErrorResponse)) return;
  for (const field of problemOf(error).errors ?? []) {
    const fieldName = field.field === 'newPassword' ? 'password' : field.field;
    const control = form.get(fieldName) ?? form.get(fieldName.split('.')[0]);
    if (control) {
      control.setErrors({ ...control.errors, server: field.message });
      control.markAsTouched();
    }
  }
}

export function fieldError(form: FormGroup, name: string): string {
  const control = form.get(name);
  if (!control?.touched || !control.errors) return '';
  const errors = control.errors;
  if (errors['server']) return errors['server'];
  if (errors['required']) return 'Preencha este campo.';
  if (errors['email']) return 'Informe um e-mail válido.';
  if (errors['trimmedLength']) return 'Informe um nome entre 2 e 100 caracteres.';
  if (errors['pattern']) return 'Informe os seis dígitos do código.';
  if (errors['minlength'])
    return `Use pelo menos ${errors['minlength'].requiredLength} caracteres.`;
  if (errors['maxlength']) return `Use no máximo ${errors['maxlength'].requiredLength} caracteres.`;
  return 'Revise este campo.';
}
