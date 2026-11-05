import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { fieldError, trimmedLength } from '../../shared/form-feedback';
import { OperationState } from '../workspaces/workspace-feedback';
import { ProjectEnvironment } from '../projects/project.models';
import { VaultEntry, VaultSecret } from './test-vault.models';
export interface VaultDraft {
  name: string;
  environmentId?: string | null;
  secret?: VaultSecret;
  form: FormGroup;
}
@Component({
  selector: 'app-vault-editor',
  imports: [ReactiveFormsModule],
  template: `<dialog
    #dialog
    class="window editor-dialog wide-dialog"
    aria-labelledby="vault-editor-title"
    (cancel)="cancel($event)"
  >
    <header class="window-header" id="vault-editor-title">
      {{ entry() ? 'Editar registro do cofre' : 'Adicionar ao cofre de testes' }}
    </header>
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      autocomplete="off"
      [attr.aria-busy]="state().busy()"
    >
      <div class="panel-body">
        <p>
          Use um nome descritivo, sem senhas ou credenciais. Os dados sensíveis ficam restritos às
          pessoas com permissão para revelar.
        </p>
        @if (state().error()) {
          <p class="message error" role="alert">{{ state().error() }}</p>
        }
        @if (uncertain()) {
          <p class="message info">
            A resposta não foi confirmada. Feche e confira a lista antes de repetir a alteração.
          </p>
        }
        <fieldset class="form-fields" [disabled]="state().busy()">
          <div class="field">
            <label for="vault-name">Nome *</label
            ><input
              id="vault-name"
              formControlName="name"
              maxlength="100"
              autocomplete="off"
            /><span class="field-error">{{ error('name') }}</span>
          </div>
          <div class="field">
            <label for="vault-environment">Ambiente de teste</label
            ><select id="vault-environment" formControlName="environmentId">
              @if (entry()) {
                <option value="__KEEP__">Manter ambiente atual</option>
              }
              <option value="">Sem ambiente</option>
              @for (env of environments(); track env.id) {
                <option [value]="env.id">{{ env.name }}</option>
              }</select
            ><span class="field-hint">Somente ambientes ativos que não sejam de produção.</span
            ><span class="field-error">{{ error('environmentId') }}</span>
          </div>
          @if (entry() && !editingSecret) {
            <p>As credenciais serão preservadas ao salvar nome ou ambiente.</p>
            @if (canReveal()) {
              <button
                class="btn"
                type="button"
                [disabled]="state().busy() || !!state().wait()"
                (click)="revealRequested.emit()"
              >
                Revelar para editar credenciais
              </button>
            }
          }
          @if (editingSecret) {
            <div class="field">
              <label for="vault-username">Usuário (opcional)</label
              ><input
                id="vault-username"
                formControlName="username"
                maxlength="1000"
                autocomplete="off"
                spellcheck="false"
              /><span class="field-error">{{ error('username') }}</span>
            </div>
            <div class="field">
              <label for="vault-password">Senha (opcional)</label
              ><input
                id="vault-password"
                type="password"
                formControlName="password"
                maxlength="2000"
                autocomplete="new-password"
              /><span class="field-error">{{ error('password') }}</span>
            </div>
            <div class="field">
              <label for="vault-url">URL (opcional)</label
              ><input
                id="vault-url"
                formControlName="url"
                maxlength="2048"
                autocomplete="off"
                spellcheck="false"
              /><span class="field-error">{{ error('url') }}</span>
            </div>
            <div class="field">
              <label for="vault-notes">Notas (opcional)</label
              ><textarea
                id="vault-notes"
                formControlName="notes"
                maxlength="10000"
                autocomplete="off"
                spellcheck="false"
              ></textarea
              ><span class="field-error">{{ error('notes') }}</span>
            </div>
            @if (entry()) {
              <button class="case-suite-link" type="button" (click)="discardSecret()">
                Descartar edição das credenciais
              </button>
            }
          }
        </fieldset>
      </div>
      <footer class="window-footer">
        <button class="btn" type="button" [disabled]="state().busy()" (click)="closed.emit()">
          {{ uncertain() ? 'Fechar e conferir lista' : 'Cancelar' }}
        </button>
        <button
          class="btn btn-primary"
          type="submit"
          [disabled]="state().busy() || !!state().wait() || uncertain()"
        >
          {{
            state().busy()
              ? 'Salvando…'
              : state().wait()
                ? 'Aguarde ' + state().wait() + 's'
                : 'Salvar'
          }}
        </button>
      </footer>
    </form>
  </dialog>`,
})
export class VaultEditor implements AfterViewInit, OnDestroy {
  readonly entry = input<VaultEntry | null>(null);
  readonly environments = input<ProjectEnvironment[]>([]);
  readonly state = input.required<OperationState>();
  readonly canReveal = input(false);
  readonly uncertain = input(false);
  readonly saved = output<VaultDraft>();
  readonly closed = output<void>();
  readonly revealRequested = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  editingSecret = false;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [trimmedLength(1, 100)] }),
    environmentId: new FormControl('', { nonNullable: true }),
    username: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    url: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2048)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(10000)] }),
  });
  constructor() {
    effect(() => {
      const entry = this.entry();
      this.clearSecret();
      this.editingSecret = !entry;
      this.form.controls.name.setValue(entry?.name ?? '');
      this.form.controls.environmentId.setValue(entry ? '__KEEP__' : '');
    });
  }
  ngAfterViewInit() {
    this.dialog().nativeElement.showModal();
  }
  ngOnDestroy() {
    this.form.reset();
    this.clearSecret();
  }
  clearSecret() {
    this.form.patchValue({ username: '', password: '', url: '', notes: '' });
  }
  discardSecret() {
    this.clearSecret();
    this.editingSecret = false;
  }
  setSecret(secret: VaultSecret) {
    this.form.patchValue({
      username: secret.username,
      password: secret.password,
      url: secret.url ?? '',
      notes: secret.notes ?? '',
    });
    this.editingSecret = true;
  }
  error(key: string) {
    const c = this.form.get(key);
    return c?.touched && c.hasError('trimmedLength')
      ? 'Informe um nome de 1 a 100 caracteres.'
      : fieldError(this.form, key);
  }
  cancel(event: Event) {
    event.preventDefault();
    if (!this.state().busy()) this.closed.emit();
  }
  submit() {
    if (this.state().busy() || this.state().wait() || this.uncertain()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saved.emit({
      name: v.name.trim(),
      ...(v.environmentId !== '__KEEP__' ? { environmentId: v.environmentId || null } : {}),
      ...(this.editingSecret
        ? {
            secret: {
              username: v.username,
              password: v.password,
              url: v.url || null,
              notes: v.notes || null,
            },
          }
        : {}),
      form: this.form,
    });
  }
}
