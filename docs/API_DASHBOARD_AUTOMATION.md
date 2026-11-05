# Melhorias de execução e painel — solicitação para a API (07/10/2026)

## Novos apontamentos: total ACTIVE e todo o histórico (07/10/2026)

**Pendente na API.** O front já está preparado para os campos abaixo. A implementação atual da API soma casos não arquivados de qualquer status em `metrics.testCases` e valida `days` somente como `7 | 30 | 90`. Não alterar o banco nem criar uma rota para atender estes apontamentos.

### Total global de casos ativos

Acrescentar `metrics.activeTestCases: { value: number | null; previousValue: number | null }` em `GET /api/v1/dashboard/overview`:

- `value`: soma de **todos** os casos `status = ACTIVE` e `archived_at IS NULL`, nos Workspaces/projetos ativos autorizados pelo usuário, com `testcase.read`. Excluir `DRAFT`, `DEPRECATED` e qualquer outra situação. A projeção de automação atual já consulta essa base; reutilizar seus totais, sem carregar os casos individualmente.
- Independente de `days`: representa o catálogo atual. Não somar `projects[].activeTestCases`, pois a lista do painel é limitada e pode ter grants diferentes da agregação.
- Nenhuma base acessível: `null`; consulta autorizada vazia: `0`. `previousValue`: `null` enquanto não houver histórico confiável do status na abertura da janela.
- Preservar `metrics.testCases` com a semântica antiga para compatibilidade. O card **Casos de teste** do front passa a consumir exclusivamente `metrics.activeTestCases`; enquanto o campo estiver ausente, exibe `—`, sem apresentar o total antigo como se fosse ACTIVE.

### Todo o período

Estender `days` para `7 | 30 | 90 | 'ALL'` e responder `period.supportedDays: [7, 30, 90, 'ALL']` **somente quando o suporte estiver entregue**. O padrão sem query continua `30`. O front habilita a opção Todo o período a partir dessa declaração; a ausência mantém as três janelas atuais. `GET .../dashboard/overview?days=ALL&workspaceId=...` deve:

- Consultar todo o histórico **autorizado** de execuções e defeitos, sem aplicar um limite artificial de dias. Conservar as regras de visibilidade e os significados atuais de contagem/distribuição.
- Preservar os limites de tamanho de projetos, metas, documentos e atividade recente. "Todo o período" muda a janela temporal, não a paginação/quantidade de itens desses blocos.
- Retornar `period.days = 'ALL'`, `period.from` como o primeiro instante autorizado relevante ou `null` sem histórico, `period.to = generatedAt`, `period.previousFrom = null` e `period.previousTo = null`.
- Não inventar um período anterior: `metrics.*.previousValue = null` nessa seleção. O front também oculta comparações com período anterior quando `period.days = 'ALL'`.
- Catálogo/automação, metas e atendimento dos frameworks continuam indicadores atuais independentes da janela, assim como hoje.

Exemplo parcial de resposta (as demais chaves permanecem):

```json
{
  "period": {
    "days": "ALL",
    "supportedDays": [7, 30, 90, "ALL"],
    "from": null,
    "to": "2026-10-07T19:00:00Z",
    "previousFrom": null,
    "previousTo": null
  },
  "metrics": {
    "activeTestCases": { "value": 125, "previousValue": null }
  }
}
```

Atualizar DTOs, OpenAPI, `front-specs/dashboard.md` e testes da API: múltiplos tenants, grants mistos, projetos além do limite da tabela, rascunhos/descontinuados/arquivados excluídos, base vazia/sem acesso e histórico anterior aos 90 dias. Preservar envelope, `requestId` e cache `no-store`.

### Métrica de automação e preferências: sem nova dependência

O círculo **Conclusão das ações** usa `governance[].progress`/`actionProgress` exclusivamente, conforme a regra entregue em 07/10. O front também mostra um círculo de **Valor em relação ao critério**, usando `100 × currentValue / targetValue` quando há um valor não negativo e um critério positivo: `3.98` diante de `40` produz `9,95%`. Sem ações válidas, esse círculo da métrica ocupa o destaque e a ausência de ações é mostrada em texto separado. Sem valor ou com critério zero, não inventar uma proporção; zero diante de critério positivo é `0%`. O preenchimento visual é limitado a 100%, mas o rótulo conserva a proporção real quando excede o critério. O valor calculado, critério e barras comparativas permanecem visíveis, usando `currentValue`, `targetValue` e `calculatedAt` existentes. Esses gráficos não determinam cumprimento do operador nem conclusão da meta, e não alteram a situação fornecida pela API. Nenhuma alteração da API é necessária para esses gráficos.

Os filtros são salvos em `localStorage`, por conta e origem do navegador, sem tokens, senhas nem dados dos projetos. Antes de restaurar um Workspace, o front confere a lista completa de Workspaces ativos acessíveis. A opção ALL salva é restaurada após a API anunciar suporte; numa versão sem suporte, a página usa 30 dias e avisa. Trocar filtros cancela a consulta anterior. Nenhuma rota de preferências é necessária.

## Alteração necessária: indicadores de automação

Estender **a rota existente** `GET /api/v1/dashboard/overview`, preservando filtros `days` / `workspaceId`, envelopes, autorização e campos antigos. Não precisamos de uma rota nova.

O contrato atual entrega cobertura **de execução** em `metrics.coverage` e `projects[].coverage`, e progresso de execução em `projects[].progress`. Esses valores não medem automação. O front deixou de usá-los nos cartões/colunas alterados e já está preparado para receber:

```ts
metrics: {
  // Demais métricas preservadas.
  automationCoverage: {
    value: number | null; // 0 a 100, até duas casas decimais
    previousValue: number | null;
  }
}
projects: Array<{
  // Demais propriedades preservadas.
  activeTestCases: number | null; // inteiro >= 0
  automationCoverage: number | null;
}> | null;
```

Exemplo parcial de resposta:

```json
{
  "metrics": {
    "automationCoverage": { "value": 75, "previousValue": null }
  },
  "projects": [{ "activeTestCases": 120, "automationCoverage": 75 }]
}
```

### Regra de cálculo proposta e usada pelo texto do front

- Considerar **somente casos com `status = ACTIVE` e sem arquivamento**. Excluir rascunhos (`DRAFT`), descontinuados (`DEPRECATED`) e arquivados. Esta é a interpretação adotada para “menos os inativos”.
- `activeTestCases`: quantidade desses casos no projeto, sem depender das execuções nem da paginação do catálogo.
- Numerador da automação: casos dessa mesma base com `automationStatus = AUTOMATED`. `MANUAL`, `TO_BE_AUTOMATED`, `IN_PROGRESS` e `NOT_APPLICABLE` não contam como automatizados.
- Denominador: **todos os casos ativos**, inclusive `NOT_APPLICABLE`, conforme o pedido de porcentagem sobre os testes ativos. Se o produto desejar excluir os não aplicáveis, alinhar a fórmula e a legenda com o front antes de mudar.
- Por projeto: `100 × automatizados ativos / activeTestCases`. Catálogo vazio: contagem `0` e cobertura `null`; catálogo não vazio sem automatizados: `0%`.
- Cartão global: `100 × soma dos automatizados ativos / soma dos casos ativos`, considerando **todos os projetos autorizados no escopo**, não só os 10 apresentados na tabela. É uma proporção consolidada, não média simples de percentuais.
- São indicadores do **catálogo atual**: `days` continua filtrando execuções, defeitos e atividades, mas não reduz essa base aos testes criados/executados no período.
- `previousValue`: preencher apenas se existir histórico confiável de status e automação na abertura do período. Sem histórico, retornar `null`; não usar cobertura de execução nem inferir status passado a partir do atual.

### Acesso e compatibilidade

Usar o escopo atual de Workspaces/projetos ativos, participação e `testcase.read`. Não exigir `testrun.read` para contar casos/automação. Respeitar `project.read` na lista de projetos e as regras atuais de visibilidade das fontes na agregação. Uma linha visível sem acesso aos casos retorna os dois campos `null`. Não revelar totais de outros tenants/projetos privados.

Retornar `null` para fontes indisponíveis/sem acesso, nunca substituí-las por zero. Manter `Cache-Control: no-store`, erros padrão e `requestId`. O front aceita os novos campos ausentes durante a implantação e mostra `—`, sem reutilizar as métricas antigas.

Calcular no servidor, com consultas agregadas e sem carregar todos os casos no navegador. Atualizar Swagger, `front-specs/dashboard.md` e testes de isolamento, grants mistos, zero denominador, estados excluídos, enum de automação e consolidação de projetos com tamanhos diferentes. Não é necessária migration se as colunas atuais já atendem à consulta.

## Execução de testes: rotas atuais suficientes

A experiência oferece Modo foco e usa uma fila lateral paginada, seleção inicial do primeiro caso pendente na página (ou do primeiro caso se não há pendentes), passos com botões diretos, detalhes recolhíveis e confirmação final fixa. “Avançar após confirmar” só navega depois de a gravação e a consulta de confirmação terminarem com sucesso.

Continuamos usando as rotas existentes sob `/api/v1/workspaces/:workspaceId/projects/:projectId/test-runs/:runId`:

- `GET /` e `GET /cases`, `GET /cases/:runCaseId` para estado, fila e snapshot.
- `PUT /cases/:runCaseId/steps/:runStepId/result` para cada passo.
- `PUT /cases/:runCaseId/result` para a confirmação explícita do caso.
- `GET/POST /comments` para histórico; `POST /start`, `/complete`, `/abort` para transições.

Os atalhos preservam `comment` e `actualResult` existentes. O formulário detalhado permite alterar esses textos. Cada mutação usa a versão mais recente e é serializada até o refresh terminar; respostas incertas e conflitos bloqueiam novas gravações até revisão. Alterar um passo continua devolvendo o caso a `NOT_TESTED`. `PASSED` final exige todos os passos `PASSED` ou `SKIPPED`.

**Não há alteração obrigatória na API de execução.** Um endpoint transacional para gravar múltiplos passos e o resultado final pode ser avaliado no futuro, mas não é dependência desta entrega.

## Demais melhorias: sem alteração de rota

- Projeto no inventário de defeitos: usar apenas `projectName`, já disponível.
- Governança: reposicionar o bloco e desenhar índice ponderado, contagens, barras por framework/seção e situação das metas com `frameworkGovernance` e `governance` existentes. Sem recalcular metas ao abrir a página.
- Os totais de metas do painel representam somente as metas exibidas (a API limita a seis), com legenda explícita; não são totais globais.

O contrato histórico de execução permanece em [API_DASHBOARD_OVERVIEW.md](API_DASHBOARD_OVERVIEW.md). Este documento define os novos campos de automação consumidos pela experiência atual.
