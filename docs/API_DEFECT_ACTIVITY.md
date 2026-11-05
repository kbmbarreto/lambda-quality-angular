# Atualização de defeitos, comentários e histórico — 09/10/2026

## Entregue no front com a API atual

- O card **Defeitos** da tela inicial conta o estoque atual com status **OPEN**, em todos os períodos de criação, respeitando o Workspace selecionado e os projetos autorizados. Usa `GET /api/v1/defects?page=1&size=1&status=OPEN&workspaceId=...` e `meta.pagination.totalItems`. Sem Workspace selecionado, omite `workspaceId`. Não soma apenas a página exibida e não utiliza `metrics.defects` nem `defectsByStatus.OPEN` da overview, pois ambos são limitados à janela de criação. Sem comparação com o mês anterior, pois a API não oferece histórico desse estoque. Em erro exibe indisponibilidade, nunca zero ou a contagem antiga.
- **Atualizar defeito** abre um formulário curto de situação e comentário. A situação funciona hoje com o PATCH existente. **Recarregar dados** continua sendo uma consulta; **Editar defeito** mantém a edição completa dos campos.
- A API local ainda não expõe comentários/histórico. O front está preparado para o contrato **proposto abaixo**, mas isso não significa que as rotas já tenham sido entregues. Enquanto o GET de histórico retorna 404/501, a tela informa indisponibilidade e desabilita comentários. Não envia o campo novo para a API antiga e não grava comentários/histórico no navegador ou na descrição do defeito.

## Solicitação ao back-end

### 1. Acrescentar comentário ao PATCH existente

`PATCH /api/v1/workspaces/{workspaceId}/projects/{projectId}/defects/{defectId}`

```json
{
  "version": 5,
  "status": "IN_PROGRESS",
  "comment": "Investigação iniciada; falha reproduzida em homologação."
}
```

- `version` obrigatória: version atual **do defeito**. Preservar `409 DEFECT_VERSION_CONFLICT` e `requestId` nos erros.
- `comment` opcional, texto simples, não vazio após trim quando enviado, até 10000 caracteres. Omitir significa não criar comentário; não substituir descrição nem remover comentários anteriores.
- Aceitar **somente comentário** (`version` + `comment`), **somente status**, ou os dois na mesma operação. Os demais campos do PATCH permanecem compatíveis.
- Gravar alteração do defeito e evento de histórico em **uma transação**, com autor derivado do usuário autenticado e horário do servidor. Incrementar a version também em atualização que contenha apenas comentário. Não criar eventos duplicados para status igual ao atual sem comentário.
- Responder com o `ApiResponse<Defect>` habitual, contendo a version e `updatedAt` atuais. O front reconsulta o histórico após sucesso e atualiza inventário/contagens.
- Para requisições de comentário com resposta incerta, precisamos evitar duplicação. Recomenda-se aceitar uma chave de idempotência em uma entrega posterior; até lá o front bloqueia repetição automática em rede/timeout/5xx e exige consultar e revisar o estado antes de reenviar.

### 2. Disponibilizar histórico unificado

**Nova rota proposta:** `GET /api/v1/workspaces/{workspaceId}/projects/{projectId}/defects/{defectId}/history`

Parâmetros: `page`, `size` (até 100), `sort=createdAt,asc`. Usar envelope/paginação existentes. Ordenação determinística por `createdAt` e ID; eventos de criação, todos os comentários e todas as mudanças de situação, inclusive reaberturas. Atualização com status e comentário pode produzir um único evento `UPDATED` contendo ambos.

```json
{
  "data": [
    {
      "id": "UUID_DO_EVENTO",
      "type": "UPDATED",
      "actor": { "id": "UUID_DO_USUARIO", "displayName": "Nome do usuário" },
      "createdAt": "2026-10-09T14:30:00.000Z",
      "fromStatus": "OPEN",
      "toStatus": "IN_PROGRESS",
      "comment": "Investigação iniciada; falha reproduzida em homologação."
    }
  ],
  "message": "OK",
  "meta": {
    "requestId": "UUID_DA_REQUISICAO",
    "timestamp": "2026-10-09T14:30:01.000Z",
    "pagination": {
      "page": 1,
      "size": 100,
      "totalItems": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
}
```

- Tipos `CREATED` e `UPDATED`. Em criação, `fromStatus=null`; em comentário sem mudança, ambos os status podem ser `null`. `comment=null` quando não existe comentário. `actor.displayName` pode ser null; preservar a identidade histórica mesmo se o autor sair do Workspace. Nunca retornar e-mail como nome.
- Alterações de status realizadas por **qualquer fluxo da API**, inclusive edição completa, devem aparecer. Para eventos anteriores, reaproveitar os registros de auditoria disponíveis; não inventar datas, autores ou transições. Se não for possível recuperar todo o legado, informar a limitação no contrato antes da integração definitiva.
- Esse GET deve existir somente quando o PATCH já aceitar `comment`: o front usa o sucesso da consulta como disponibilidade desse recurso. 404/501 são tratados como ausência de suporte; 403, timeout, 429 e 5xx continuam sendo erros, com `requestId` e `Retry-After` preservados.
- O front consulta **todas as páginas** ao abrir o defeito e ao receber um novo estado/version, em ordem cronológica, com rolagem própria. Cancela a consulta do defeito anterior e não expõe eventos de outro escopo.
- `Cache-Control: no-store`; mesmo Bearer, Workspace ativo/membership e visibilidade de projeto do detalhe do defeito. Leitura com `defect.read`; escrita com `defect.manage`; projetos arquivados permitem consulta, bloqueiam escrita. Não exigir grant global de auditoria para ler o histórico do próprio defeito. Aplicar isolamento por Workspace + projeto + defeito em todas as queries.

### 3. Persistência e auditoria

Criar armazenamento durável de comentários/eventos e a migration necessária (ou reaproveitar estrutura de eventos existente com payload apropriado). Manter histórico append-only, com vínculo ao defeito e autor. Não basta gravar apenas o status atual ou retornar a atividade recente do dashboard: precisamos do histórico completo do recurso.

## Validação esperada na API

Testar comentário isolado, status isolado, mudança acompanhada de comentário, reabertura, paginação com mais de 100 eventos, isolamento entre empresas/projetos, leitura por membro com `defect.read`, escrita por leitor/projeto arquivado bloqueada, comentários em texto simples, conflito de versão e atomicidade em falhas. Verificar que o card OPEN inclui defeitos antigos ainda abertos e exclui os demais status.

Não é necessário alterar a overview para a contagem atual. Como otimização opcional, pode-se acrescentar `metrics.openDefects` com a mesma semântica de estoque atual; manter `metrics.defects` com a semântica de criação por período para compatibilidade.
