# Visão geral do produto — contrato de referência

> Atualização em 07/10/2026: o front passou a exibir automação e contagens de casos ativos. Os campos adicionais necessários estão em [API_DASHBOARD_AUTOMATION.md](API_DASHBOARD_AUTOMATION.md); `coverage` e `progress` abaixo conservam a semântica histórica de execução.

## Estado da entrega

A rota consolidada foi entregue e é consumida pelo front com filtros, gráficos e tratamento de estados. Este documento conserva o contrato de referência da solicitação original. O bloco adicional `frameworkGovernance`, entregue em 04/10/2026, está descrito em [API_GOVERNANCE_PROGRESS.md](API_GOVERNANCE_PROGRESS.md).

A página Meu Perfil usa as rotas existentes de autenticação e saúde, sem alterações. O repositório de frameworks também usa as rotas existentes, sem alterações obrigatórias; consulte `API_FRAMEWORK_REPOSITORY.md`.

## Rota consumida

`GET /api/v1/dashboard/overview`

- Bearer válido; resposta `ApiResponse<DashboardOverview>`, sem cache compartilhado (`Cache-Control: no-store`).
- `days`: inteiro enumerado `7 | 30 | 90`, padrão `30`.
- `workspaceId`: UUID v4 opcional. Ausente consolida os Workspaces acessíveis ao usuário; presente restringe a um Workspace acessível.
- Não há mutação nem cálculo persistido de metas. Não requer novo grant global: cada bloco deve aplicar as permissões atuais de sua fonte.
- Janela corrente UTC: `[generatedAt - days, generatedAt)`. Janela anterior: mesmo tamanho, imediatamente anterior. Retornar os limites efetivos para o front exibir a data de referência.
- Workspaces/projetos arquivados ficam fora do escopo operacional padrão. Listar somente os projetos ativos acessíveis ao usuário; não inferir ou incluir entidades ocultas em nenhuma soma.

## Semântica dos indicadores

| Campo                              | Definição                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metrics.testCases.value`          | Catálogo atual: casos não arquivados dos projetos visíveis com `testcase.read`. Inclui rascunhos e ativos.                                                                     |
| `metrics.testCases.previousValue`  | Mesmo catálogo na abertura do período corrente, somente se houver fonte histórica confiável. Caso contrário `null`; não reconstruir estado histórico a partir do status atual. |
| `metrics.executions.value`         | Quantidade de `TestRun` criadas no período, em projetos visíveis com `testrun.read`, em todas as situações.                                                                    |
| `metrics.executions.previousValue` | TestRuns criadas na janela anterior, com o mesmo escopo autorizado atual.                                                                                                      |
| `metrics.defects.value`            | Defeitos criados no período, em todas as situações, em projetos visíveis com `defect.read`.                                                                                    |
| `metrics.defects.previousValue`    | Defeitos criados na janela anterior, com o mesmo escopo autorizado atual.                                                                                                      |
| `metrics.coverage.value`           | Média simples das coberturas de execução dos projetos com os grants de fonte necessários e catálogo não vazio. Número `0–100`, até duas casas; `null` sem base.                |
| `metrics.coverage.previousValue`   | Média da janela anterior apenas com denominadores históricos confiáveis; caso contrário `null`.                                                                                |

**Cobertura proposta:** cobertura de execução, não cobertura de requisitos nem de automação. Por projeto, usar `100 × casos distintos do catálogo atual com resultado PASSED/FAILED/BLOCKED e executedAt na janela / casos não arquivados do catálogo atual`. SKIPPED/NOT_TESTED não contam como exercitados. Exigir `testcase.read` e `testrun.read` no mesmo projeto. Denominador zero produz `null`, nunca 100%. Deduplicar `testCaseId`, independentemente de múltiplas execuções/versões. Essa definição deve ser confirmada na implementação; caso o produto use outra definição, atualizar o contrato e o texto do front juntos.

**Gráfico de resultados:** `results` é a distribuição dos resultados atuais dos `RunCase` das TestRuns criadas no período, somando `TestRun.summary`. Não confundir resultado de caso (PASSED/FAILED etc.) com situação da execução (CREATED/IN_PROGRESS/COMPLETED/ABORTED). O gráfico se chama “Resultados de testes”, e seu total pode diferir do cartão “Execuções”.

**Defeitos por situação:** distribuição do status atual dos defeitos criados no período. Usar os cinco enums existentes; não inventar “Em análise” ou “Em correção”.

## Contrato de resposta

Todas as chaves abaixo são obrigatórias. Bloco `null` significa fonte indisponível ou sem grant; array vazio/contagem zero significa consulta autorizada sem registros. Zero não substitui erro, ausência de permissão ou histórico inexistente.

```ts
type Metric = { value: number | null; previousValue: number | null };
type Target = {
  module: 'TEST_CASES' | 'EXECUTION' | 'DEFECTS' | 'GOVERNANCE' | 'PROJECT' | 'WORKSPACE';
  workspaceId: string; // UUID v4
  projectId: string | null; // obrigatório para módulos de projeto
};
type DashboardOverview = {
  generatedAt: string; // ISO 8601 UTC
  period: {
    days: 7 | 30 | 90;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  metrics: {
    testCases: Metric;
    executions: Metric;
    defects: Metric;
    coverage: Metric;
  };
  results: {
    NOT_TESTED: number;
    PASSED: number;
    FAILED: number;
    BLOCKED: number;
    SKIPPED: number;
  } | null;
  defectsByStatus: {
    OPEN: number;
    IN_PROGRESS: number;
    RESOLVED: number;
    CLOSED: number;
    REJECTED: number;
  } | null;
  projects: Array<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    key: string;
    name: string;
    status: 'ACTIVE' | 'ARCHIVED';
    progress: number | null;
    coverage: number | null;
  }> | null;
  activity: Array<{
    id: string;
    title: string;
    context: string;
    occurredAt: string;
    target: Target;
  }> | null;
  governance: Array<{
    id: string;
    workspaceId: string;
    name: string;
    frameworkName: string | null;
    progress: number | null;
    detail: string;
    status: 'ACTIVE' | 'ACHIEVED' | 'MISSED' | 'CANCELLED';
  }> | null;
  documents: Array<{
    id: string;
    workspaceId: string;
    name: string;
    versionLabel: string | null;
    updatedAt: string;
  }> | null;
};
```

Os tipos usados pelo front estão em `src/app/features/home/dashboard.models.ts`. IDs são UUIDs v4 e datas ISO 8601. Valores percentuais são números `0–100`; contagens são inteiros não negativos.

### Projetos

No máximo 10, ordenados por `updatedAt DESC, id ASC`, respeitando `project.read` e acesso de participação. `progress` = percentual de RunCases com resultado diferente de NOT_TESTED nas TestRuns criadas no período; denominator zero ou ausência de `testrun.read` produz `null`. SKIPPED conta como encerrado para esse progresso, mas não na cobertura. Sem `testcase.read`/`testrun.read`, cobertura `null`. A lista é resumida; o front “Ver todos” abre Projetos. Totais e médias dos cartões devem usar **todos os registros autorizados**, não só essas 10 linhas.

### Atividade recente

No máximo 10, ocorridas na janela selecionada, ordenadas por `occurredAt DESC, id ASC`. Eventos reais das fontes disponíveis, filtrados pelos grants correspondentes e pelo acesso atual ao recurso. Pode usar os registros de auditoria existentes se já houver uma fonte autorizada; caso não exista, retornar `null` até implementá-la. Não fabricar eventos históricos a partir do mero `updatedAt`. `title` até 250 caracteres, `context` até 250. Não expor e-mails/tokens, detalhes privados de outros membros nem eventos de entidades cujo acesso foi revogado. O front constrói rotas locais usando `target`, sem aceitar URLs arbitrárias. Por enquanto os links abrem o módulo correspondente.

### Metas de governança

No máximo 6 metas ACTIVE/ACHIEVED/MISSED com `governance.read`, respeitando fontes e acesso de metas por projeto. Desde 07/10/2026, `progress = actionProgress.percent`: ações DONE divididas por ações válidas vinculadas (não CANCELLED), com até duas casas decimais; sem válidas retorna null e pendências limitam a exibição a 99,99%. `actionProgress` é obrigatório e contém `basis: ACTIONS`, `totalActions`, `completedActions`, `cancelledActions` e `percent`. `status` e `detail` usam a mesma base, com prazo definido pelo servidor em UTC. A interface usa o percentual e os totais da API, sem derivá-los da página de ações. `currentValue`, `targetValue`, `calculatedAt` e `lastResult` continuam informativos, separados da conclusão; abrir o Início não recalcula a métrica nem grava a meta. O círculo exige 100% das ações válidas, independentemente do critério informativo. `frameworkGovernance` continua baseado exclusivamente nas avaliações, sem alteração de índice, controles ou snapshots.

### Documentos e referências

No máximo 6 arquivos disponíveis da biblioteca atual, com `attachment.read` e acesso ao Workspace, ordenados por atualização decrescente e ID. `name` pode usar o nome original do arquivo. `versionLabel` é `null` se o modelo atual não tem versionamento — não precisa criar versionamento de documentos para esta entrega. Não retornar URLs de storage, credenciais ou bytes. Os links abrem o Workspace, onde a biblioteca já oferece downloads autenticados. Se não houver uma fonte de referências adequada, devolver `null`. Esse bloco é catálogo atual, não filtro de upload por período.

### Permissões, indisponibilidade e erros

- Aplicar grants e visibilidade de cada fonte, incluindo participação em projetos. Não somar dados ocultos.
- Consulta sem qualquer fonte visível: resposta 200 com métricas nulas e blocos nulos; acesso explícito a Workspace inexistente/invisível: 404 conforme padrão de isolamento.
- Bloco sem grant: `null`. Bloco autorizado sem registros: zeros/arrays vazios. Fonte temporariamente indisponível pode ser `null`; uma falha da consulta inteira deve usar Problem Details, não um sucesso com zeros.
- `400` query inválida; `401` autenticação; `403` conforme política de autorização; `404` recurso/rota indisponível; `429` com Retry-After; `500/503` com requestId.
- Enquanto a rota ainda não existe, o front trata 404 como painel indisponível e mantém os atalhos. Outros erros seguem o tratamento padrão, sem polling ou repetição automática.

## Validação esperada na API

Conferir isolamento entre tenants, revogação de acesso, projetos privados, grants mistos, paginação dos catálogos subjacentes e totais completos; limites das janelas UTC; deduplicação de cobertura; divisão por zero; catálogo vazio versus fonte indisponível; grupos com zero nos enums; metas sem recálculo; eventos/documentos sem vazamento. Agregações devem acontecer no servidor, com consultas limitadas e índices adequados, sem fan-out proporcional a cada caso de teste.

Entregar exemplos HTTP, atualizar Swagger/front-specs e confirmar o contrato acima. Não há necessidade de alterar as rotas de Casos de Teste, Execuções, Defeitos, Governança ou autenticação já existentes.
