# Contrato da API: contagens do repositório de testes

A API implementou esta rota em 03/10/2026, operação OpenAPI `getTestCaseSummary`. O contrato entregue corresponde à solicitação abaixo; o front usa uma consulta para os números de toda a árvore:

`GET /api/v1/workspaces/{workspaceId}/projects/{projectId}/test-cases/summary`

## Acesso e filtros

- Bearer token e permissão efetiva `testcase.read` no projeto, com o mesmo isolamento de Workspace/Projeto da listagem de casos.
- IDs de rota em UUID v4. Projetos arquivados continuam consultáveis por quem tem acesso.
- Query opcional `status`: `DRAFT`, `ACTIVE`, `DEPRECATED`, `ARCHIVED` ou `ALL`.
- Sem `status`, excluir casos arquivados, como na listagem atual.
- Não recebe paginação, busca, ordenação ou filtro de suíte. A busca filtra a lista; as contagens representam o inventário do projeto na situação selecionada.

## Resposta

```json
{
  "data": {
    "totalCases": 8,
    "suites": [
      { "suiteId": null, "totalCases": 1 },
      { "suiteId": "33333333-3333-4333-8333-333333333333", "totalCases": 7 }
    ]
  },
  "message": "Contagens de casos consultadas com sucesso.",
  "meta": {
    "requestId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "timestamp": "2026-10-03T20:00:00.000Z"
  }
}
```

`totalCases` conta todos os casos do projeto que atendem ao filtro. Cada grupo conta **somente os casos associados diretamente** à suíte. `suiteId: null` representa casos sem suíte. Todos os números são inteiros não negativos. Grupos vazios podem ser omitidos; um projeto vazio retorna `totalCases: 0` e `suites: []`.

O front soma os grupos de descendentes para exibir o total de uma pasta e utiliza a contagem direta na lista da suíte selecionada. Não somar descendentes na API, pois isso duplicaria os números.

## Implementação e aceite

- Agregar por `suite_id`, restringindo `workspace_id`, `project_id` e situação, sem carregar passos, vínculos ou definições completas dos casos. Não requer migração do banco.
- Registrar a rota estática `summary` antes de `:caseId`.
- Manter o envelope e os erros de autenticação, permissão e validação existentes; incluir a rota no OpenAPI.
- Conferir casos sem suíte, suítes vazias, pais/filhos, todos os filtros de situação, projetos arquivados, isolamento entre projetos/Workspaces, falta de acesso e UUID/query inválidos.

## Compatibilidade enquanto a API não possui a rota

Ao receber 404 nessa rota (ou o 400 específico do guard legado que interpreta `summary` como um UUID de caso), o front usa `GET .../test-cases?page=1&size=1&root=true` e uma consulta `size=1&suiteId={id}` por suíte, lendo `meta.pagination.totalItems`. São no máximo três consultas simultâneas. Carrega todas as páginas de suítes antes de contar e cancela consultas ao sair do projeto. O 404 da rota opcional não aciona uma atualização de acesso nem impede abrir casos.

Esse fallback custa mais chamadas em projetos grandes. Depois de disponibilizar a rota agregada, recarregar o front para que ele volte a detectá-la.

## Rotas existentes suficientes para os demais fluxos

- Criar suíte: `POST .../test-suites`, com `parentSuiteId` no contexto da pasta.
- Cadastro rápido: `POST .../test-cases`, com `title` e `suiteId`. Situação e demais padrões continuam definidos pelo servidor.
- Associar ou mudar suíte: `POST .../test-cases/{caseId}/move`, com `version` atual e `suiteId` (ou `null` para remover a associação).

Não são necessárias novas rotas para cadastrar ou associar casos.

## Consultas para selecionar o contexto

`GET /api/v1/workspaces` aceita somente `page`, `size`, `sort` e `q`. **Não enviar `status`**: a API rejeita parâmetros extras com 400. A entrada e o seletor do repositório carregam todas as páginas e filtram Workspaces ativos com `project.read` localmente. O filtro `status=ALL` continua válido na listagem de projetos.
