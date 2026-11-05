# Ambientes e indicadores de bugs

Contrato da API v1 entregue em 04/10/2026 e integrado ao front-end.

## Ambientes e vínculo do defeito

As rotas existentes de ambientes do projeto aceitam `category=PRODUCTION|HOMOLOGATION|OTHER`. O cadastro solicita uma categoria explícita. O endpoint mantém validação de nome, descrição, ativação e isolamento por projeto. O front carrega todas as páginas do catálogo; apenas ambientes ativos são oferecidos para novas associações.

Criação avulsa, criação por falha e PATCH de defeitos aceitam `environmentId` UUID ou `null`.

| Operação       | Valor enviado | Efeito                                     |
| -------------- | ------------- | ------------------------------------------ |
| Falha          | Omitido       | Herdar ambiente da execução                |
| Falha          | `null`        | Remover a herança                          |
| Criação/edição | UUID          | Copiar ambiente ativo do projeto           |
| Edição         | Omitido       | Preservar associação e snapshot históricos |
| Edição         | `null`        | Remover ambiente                           |

A leitura utiliza `environmentSnapshot.name/category`; renomear ou inativar o cadastro não reescreve o defeito. O filtro de listagem aceita `environmentId`, inclusive referências históricas reconhecidas pela API. Seletores de edição preservam vínculos históricos com “Manter atual”.

## Indicadores

`GET /api/v1/workspaces/{workspaceId}/defects/analytics`

| Parâmetro    | Regra                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------- |
| `from`, `to` | Obrigatórios, datas reais `YYYY-MM-DD`, inclusivas em UTC, início ≤ fim, até 36 meses civis |
| `projectId`  | UUID opcional de um projeto autorizado                                                      |
| `category`   | `PRODUCTION`, `HOMOLOGATION`, `OTHER` ou `UNSPECIFIED`                                      |

A resposta traz `generatedAt`, `period`, `totalBugs`, `byStatus`, `byCategory`, `monthly`, `byProject` e `byEnvironment`. Todos os status/categorias e meses vazios são retornados, sem paginação.

- O histórico usa o intervalo selecionado. Os cartões e as distribuições usam o mês selecionado, limitado às datas do histórico.
- Ambas as consultas compartilham os filtros de projeto e categoria. Mudanças cancelam solicitações anteriores e retiram resultados do escopo anterior.
- Cartões: total, backlog (`OPEN`), correção (`IN_PROGRESS`), encerrados (`CLOSED`), homologação, produção, resolvidos e rejeitados.
- Os status são atuais para defeitos **criados** no período. “Encerrados” não significa eventos de fechamento ocorridos naquele mês.
- Outros ambientes e `UNSPECIFIED` (“Sem ambiente”) são preservados nos gráficos e na tabela de ambientes históricos.
- Os nomes/categorias em `byEnvironment` representam snapshots. Um mesmo ID pode aparecer com diferentes nomes históricos.
- Projetos arquivados autorizados permanecem disponíveis. A permissão efetiva retornada pela API determina a visibilidade.
- Zero confirmado é diferente de ausência de dados ou falha. Erros oferecem repetição manual; `Retry-After` é respeitado, sem polling automático.

## Acesso às telas

Defeitos → selecionar Workspace → **Indicadores de bugs do Workspace**. Dentro do projeto, a aba **Indicadores** abre o painel com o projeto selecionado. A área **Ambientes** está disponível no menu principal.

A integração requer a migração aditiva `202610040009_defect_environments` aplicada pela API. Não utiliza novos endpoints além dos entregues.

## Indicadores no inventário consolidado — 08/10/2026

A tela `/defeitos` agora apresenta sete cartões: Total de bugs, Em backlog (`OPEN`), Em correção (`IN_PROGRESS`), Bugs encerrados (`CLOSED`), Em Homologação, Em Produção e Tempo médio de correção. Há também gráficos de distribuição por situação e por categoria de ambiente. `RESOLVED` aparece separadamente de `CLOSED` na legenda; a categoria vem de `environmentSnapshot.category`, preservando Outros e Sem ambiente.

Esses indicadores cobrem **todo o histórico** dos defeitos autorizados, incluindo projetos arquivados, e compartilham os filtros aplicados `workspaceId`, `q`, `status` e `severity` do inventário. Trocar de página ou ordenação não muda as quantidades; elas não são calculadas somente sobre as linhas visíveis. Atualizar, buscar ou receber uma notificação de alteração de defeito renova os indicadores. Trocar de filtros cancela consultas anteriores e retira resultados antigos. Alterar campos sem clicar Buscar não modifica o escopo aplicado.

### Contrato solicitado ao back-end

**Nova rota proposta:** `GET /api/v1/defects/summary`, sem paginação e sem filtros de data obrigatórios. O front está preparado para consumi-la quando entregue. Bearer, mesmos Workspaces ativos, membership e `defect.read` efetivo de `GET /defects`; visibilidade deve ser aplicada antes de filtrar e agregar. Aceitar `workspaceId`, `projectId`, `q`, `status` (padrão ALL) e `severity`, com exatamente a mesma semântica do inventário. Escopo informado não autorizado deve retornar 404; não produzir estatísticas de fontes ocultas. Não precisa de grant global novo. Resposta com `Cache-Control: no-store`, `requestId`, `generatedAt` e envelope habitual:

```json
{
  "data": {
    "generatedAt": "2026-10-08T18:00:00.000Z",
    "totalBugs": 15,
    "byStatus": { "OPEN": 2, "IN_PROGRESS": 1, "RESOLVED": 2, "CLOSED": 10, "REJECTED": 0 },
    "byCategory": { "HOMOLOGATION": 10, "PRODUCTION": 5, "OTHER": 0, "UNSPECIFIED": 0 },
    "resolutionTime": {
      "averageHours": 18.5,
      "sampleSize": 12,
      "basis": "CREATED_TO_RESOLVED"
    }
  },
  "message": "Indicadores consultados com sucesso.",
  "meta": { "requestId": "uuid", "timestamp": "2026-10-08T18:00:00.000Z" }
}
```

Todas as situações/categorias devem estar presentes, inclusive zeros. Ambas as somas devem corresponder a `totalBugs`. `resolutionTime: null` significa fonte de duração indisponível. Sem amostra válida: `{averageHours:null, sampleSize:0, basis:...}`; duração real igual a zero continua sendo zero. A média usa durações em horas corridas UTC, ponderada pelos bugs elegíveis, nunca uma média de médias de Workspaces.

**Definição proposta, sujeita à confirmação do produto:** média de `resolvedAt - createdAt` dos defeitos filtrados atualmente RESOLVED/CLOSED, usando a resolução válida mais recente do ciclo atual. REJECTED, bugs abertos/em correção e registros sem datas confiáveis não entram na amostra. Reabertura invalida a resolução anterior para o cálculo; nova resolução cria uma nova data. CLOSED usa a data de resolução que antecedeu o fechamento, não `updatedAt` nem a edição de anexos. Se a empresa escolher medir apenas trabalho em correção, usar `basis: IN_PROGRESS_TO_RESOLVED` e fornecer o início do ciclo de correção. O front apresenta a base retornada na legenda.

**Lacuna atual:** Defect/Inventário não expõem `resolvedAt` nem o início de correção. O back-end precisa registrar esses eventos ou obter durações confiáveis de um histórico auditável. Avaliar uma migration aditiva para os marcos do ciclo se o histórico atual não permitir reconstrução segura. Registros legados sem fonte confiável devem ficar fora da amostra, sem usar `updatedAt` como aproximação. Documentar regras para transição direta a CLOSED, reaberturas e dados legados no OpenAPI. Indicador indisponível não significa duração zero.

### Compatibilidade até a entrega

Enquanto `GET /defects/summary` não existir, o front utiliza todas as páginas de `GET /defects`, com os mesmos filtros autorizados, para os seis indicadores de quantidade e gráficos. Não usa a rota analítica por Workspace, cujo limite de 36 meses não cobre o inventário inteiro. Falha em qualquer página impede apresentar um total parcial como completo. O cartão de tempo permanece indisponível. Ao entregar a rota agregada, ela também elimina a necessidade de ler todas as linhas para contar. Uma sessão que já detectou a API antiga deve recarregar a página para reconhecer a nova rota.
