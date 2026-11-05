import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, computed, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription, TimeoutError, finalize, interval } from 'rxjs';
import { errorMessage, problemOf, retryAfter } from '../../core/api-error';
import { applyFieldErrors } from '../../shared/form-feedback';
import { ListQuery, Page, Pagination } from './workspace.models';

export function workspaceError(error: unknown): string {
  const problem = problemOf(error);
  if (error instanceof TimeoutError || (error instanceof HttpErrorResponse && error.status === 0))
    return 'Não foi possível confirmar a resposta. Atualize a lista ou consulte o recurso antes de repetir uma alteração.';
  const messages: Record<string, string> = {
    AUTH_FORBIDDEN: 'Você não tem permissão para esta ação. As permissões serão atualizadas.',
    RESOURCE_NOT_FOUND: 'Recurso indisponível ou sem acesso neste Workspace.',
    RESOURCE_CONFLICT:
      'Os dados entram em conflito com o estado atual. Atualize a consulta antes de tentar novamente.',
    WORKSPACE_INVITATION_INVALID:
      'Convite inválido, expirado, cancelado ou destinado a outro e-mail. Solicite um novo convite.',
    WORKSPACE_INVITATION_COOLDOWN: 'Aguarde o prazo indicado para reenviar o convite.',
    PROJECT_ARCHIVED:
      'O projeto está arquivado. Consulte o histórico; alterações estão bloqueadas.',
    GOVERNANCE_VERSION_CONFLICT:
      'O recurso foi alterado por outra pessoa. Consulte e revise o estado atual antes de reenviar.',
    GOVERNANCE_FRAMEWORK_ARCHIVED: 'O framework está arquivado. Alterações estão bloqueadas.',
    GOVERNANCE_FRAMEWORK_INACTIVE: 'A avaliação exige um framework ativo.',
    GOVERNANCE_FRAMEWORK_EMPTY: 'O framework precisa manter pelo menos um controle ativo.',
    GOVERNANCE_STATE_INVALID: 'A situação do recurso mudou. Consulte o estado atual.',
    GOVERNANCE_SECTION_CYCLE: 'A seção não pode apontar para si ou para um descendente.',
    GOVERNANCE_SECTION_DEPTH: 'A árvore de seções admite até 20 níveis.',
    GOVERNANCE_LIMIT:
      'O recurso atingiu o limite permitido. Remova um vínculo ou ajuste a definição.',
    GOVERNANCE_ASSESSMENT_LOCKED:
      'Somente avaliações em andamento aceitam classificações e evidências.',
    GOVERNANCE_ASSESSMENT_INCOMPLETE:
      'Classifique todos os controles e justifique Não aplicável antes de fechar.',
    GOVERNANCE_GOAL_CANCELLED: 'A meta está cancelada e não pode ser alterada ou calculada.',
    GOVERNANCE_ACTION_TERMINAL: 'A ação está concluída ou cancelada e não pode ser alterada.',
    DEFECT_VERSION_CONFLICT:
      'Outra pessoa alterou este defeito. Consulte os dados atuais e revise antes de salvar novamente.',
    DEFECT_FAILURE_REQUIRED:
      'A origem precisa ter resultado Falhou. Consulte o caso da execução antes de criar o defeito.',
    DEFECT_EXTERNAL_URL_INVALID:
      'Informe uma URL HTTP/HTTPS absoluta, sem credenciais, espaços ou barras invertidas.',
    DEFECT_ATTACHMENT_LIMIT:
      'O defeito já possui 100 vínculos de anexos. Remova um vínculo, inclusive histórico, antes de adicionar outro.',
    DEFECT_SEQUENCE_EXHAUSTED:
      'O projeto atingiu o limite de identificadores de defeitos. Contate a administração.',
    TEST_PLAN_VERSION_CONFLICT:
      'O plano foi alterado por outra pessoa. Consulte o estado atual e revise antes de salvar.',
    TEST_RUN_VERSION_CONFLICT:
      'A execução foi alterada por outra pessoa. Consulte resultados e comentários antes de salvar.',
    TEST_PLAN_NOT_DRAFT: 'Somente planos em rascunho podem ser editados.',
    TEST_PLAN_NOT_ACTIVE: 'Ative o plano antes de criar uma execução.',
    TEST_PLAN_STATE_INVALID: 'A situação do plano mudou. Atualize a consulta.',
    TEST_PLAN_CASE_EXISTS: 'Este caso já pertence ao plano. Atualize a seleção.',
    TEST_PLAN_RUNS_OPEN: 'Conclua ou aborte as execuções abertas antes de fechar o plano.',
    TEST_CASE_NOT_EXECUTABLE:
      'Os casos devem estar ativos e com os campos obrigatórios preenchidos.',
    TEST_CONTEXT_UNAVAILABLE:
      'O marco ou ambiente está indisponível. Atualize o contexto do plano ou da execução.',
    TEST_RUN_STATE_INVALID: 'A situação da execução mudou. Atualize a consulta.',
    TEST_RUN_NOT_IN_PROGRESS: 'Inicie a execução antes de registrar resultados ou comentários.',
    TEST_RUN_STEPS_INCOMPLETE:
      'Todos os passos precisam passar ou ser ignorados antes de passar o caso.',
    TEST_RUN_INCOMPLETE: 'Confirme o resultado de todos os casos antes de concluir a execução.',
    TEST_SELECTION_INVALID: 'Selecione até 500 casos distintos e disponíveis neste projeto.',
    TEST_RUN_STEP_LIMIT: 'A seleção excede o limite de 10000 passos por execução.',
    TEST_CASE_VERSION_CONFLICT:
      'Outra pessoa alterou este caso. Consulte a versão atual e revise suas alterações antes de salvar novamente.',
    TEST_VAULT_VERSION_CONFLICT:
      'Este registro foi alterado. Reabra os dados atualizados e revise antes de salvar novamente.',
    TEST_CASE_ARCHIVED: 'O caso está arquivado. Restaure-o antes de editar.',
    TEST_SUITE_ARCHIVED: 'A suíte está arquivada. Escolha uma suíte ativa ou a raiz.',
    TEST_SUITE_CYCLE:
      'Uma suíte não pode ser movida para si mesma ou para uma de suas descendentes.',
    TEST_SUITE_NOT_EMPTY:
      'Mova ou arquive os casos e as suítes filhas antes de arquivar esta suíte.',
    TEST_ORDER_INVALID: 'A ordem mudou. Atualize a consulta antes de reorganizar os itens.',
    TAG_IN_USE:
      'A tag está vinculada a casos de teste, inclusive arquivados. Remova os vínculos antes de excluí-la.',
    PROJECT_MEMBER_INACTIVE:
      'O participante deve estar ativo no Workspace e possuir uma conta ativa.',
    MILESTONE_COMPLETED: 'O marco está concluído e não pode ser editado.',
    MILESTONE_CANCELLED: 'Reabra o marco cancelado antes de concluí-lo.',
    ATTACHMENT_FILE_REQUIRED: 'Selecione um arquivo para enviar.',
    ATTACHMENT_EMPTY: 'O arquivo está vazio. Selecione outro arquivo.',
    ATTACHMENT_TYPE_INVALID:
      'O tipo ou o conteúdo do arquivo não é permitido. Use PNG, JPEG, PDF, TXT ou CSV UTF-8.',
    ATTACHMENT_STORAGE_UNAVAILABLE:
      'O armazenamento está indisponível. Consulte a biblioteca antes de repetir o envio.',
  };
  const productDetail = [
    'TEST_CASE_IMPORT_INVALID',
    'CUSTOM_FIELD_REQUIRED',
    'TEST_VAULT_UNAVAILABLE',
    'TEST_VAULT_ENVIRONMENT_INVALID',
  ].includes(problem.code ?? '')
    ? problem.detail
    : undefined;
  const message =
    productDetail ||
    (problem.code && messages[problem.code]) ||
    (problem.code?.startsWith('WORKSPACE_') && problem.detail) ||
    errorMessage(error);
  if (error instanceof HttpErrorResponse && error.status === 413)
    return `O conteúdo excede o limite permitido pelo servidor.${problem.requestId ? ' Referência: ' + problem.requestId : ''}`;
  if (error instanceof HttpErrorResponse && error.status >= 500)
    return `${message} Consulte o estado antes de repetir uma alteração.${problem.requestId ? ' Referência: ' + problem.requestId : ''}`;
  return `${message}${problem.requestId && !message.includes(problem.requestId) ? ' Referência: ' + problem.requestId : ''}`;
}

export class OperationState {
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  private readonly until = signal(0);
  private readonly now = signal(Date.now());
  private generation = 0;
  readonly wait = computed(() => Math.max(0, Math.ceil((this.until() - this.now()) / 1000)));
  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly formatError = workspaceError,
  ) {
    interval(1000)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.now.set(Date.now()));
  }
  fail(error: unknown, form?: FormGroup): void {
    if (form) applyFieldErrors(form, error);
    this.error.set(this.formatError(error));
    const seconds =
      retryAfter(error) || (error instanceof HttpErrorResponse && error.status === 429 ? 60 : 0);
    this.now.set(Date.now());
    this.until.set(this.now() + seconds * 1000);
  }
  run<T>(operation: Observable<T>, done: (result: T) => void, form?: FormGroup): void {
    if (this.busy() || this.wait()) return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    operation
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (generation === this.generation) this.busy.set(false);
        }),
      )
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          done(result);
        },
        error: (error) => this.fail(error, form),
      });
  }
}

export class ListState<T> {
  readonly rows = signal<T[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly state: OperationState;
  query: ListQuery = { page: 1, size: 20 };
  private request?: Subscription;
  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly loader: (query: ListQuery) => Observable<Page<T>>,
    formatError = workspaceError,
  ) {
    this.state = new OperationState(destroyRef, formatError);
  }
  cancel(): void {
    this.request?.unsubscribe();
    this.rows.set([]);
    this.pagination.set(null);
  }
  load(): void {
    if (this.state.wait()) return;
    this.request?.unsubscribe();
    this.state.busy.set(true);
    this.state.error.set('');
    this.rows.set([]);
    this.pagination.set(null);
    this.request = this.loader(this.query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.state.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.rows.set(result.data);
          this.pagination.set(result.meta.pagination);
        },
        error: (error) => this.state.fail(error),
      });
  }
  search(query: ListQuery): void {
    this.query = { ...this.query, ...query, page: 1 };
    this.load();
  }
  page(page: number): void {
    this.query = { ...this.query, page };
    this.load();
  }
}
