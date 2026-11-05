# Acompanhamento de frameworks e metas por seção

Contrato entregue pela API v1 em 04/10/2026 e integrado ao front-end.

## Navegação e acompanhamento

Em Governança → Frameworks, a aba **Estrutura** mantém o cadastro de seções e controles. A aba **Acompanhamento** utiliza a árvore preservada em uma avaliação, com percentual por seção incluindo seus descendentes.

- Consulta: `GET /api/v1/workspaces/{workspaceId}/governance/frameworks/{frameworkId}/progress`.
- Único parâmetro opcional: `assessmentId`, para consultar uma fonte específica.
- A seleção padrão usa a avaliação em andamento mais recente; na ausência dela, a última encerrada. Rascunhos precisam ser selecionados explicitamente.
- Sem avaliação, `state=NO_ASSESSMENT`, `assessment=null`, `summary=null` e `sections=[]`. A tela mostra “Sem avaliação”, sem criar ou iniciar registros automaticamente.
- O resultado contém `indicatorType=INTERNAL`, fonte e versões, `definitionVersionDiffers`, resumo do framework e resumos `direct/subtree` das seções do snapshot.
- Alterações na definição atual não substituem a estrutura histórica. Avaliações encerradas são consultáveis e não permitem alterações.

O resumo informa totais, controles aplicáveis/avaliados, contagens por situação, índice ponderado, percentual de itens atendidos, percentual de avaliação e `completed`. A interface usa os valores do servidor, independentemente dos filtros da tabela.

**Atendimento ponderado** e **itens atendidos** são medidas distintas. Os estados têm pontuações fixas: não atendido e não avaliado contribuem com zero; parcialmente atendido com 50; atendido com 100. Não aplicáveis são excluídos do denominador. Seções vazias mostram “Sem itens”; todos não aplicáveis mostram “Não aplicável”. Não se infere conclusão a partir de arredondamentos.

## Classificação rápida

“Marcar como atendido” utiliza `PUT /assessments/{assessmentId}/controls/{controlId}` com `{version, status: "MET"}`. O ID é o controle da definição, e a versão pertence à avaliação. Classificação detalhada, justificativa de N/A, evidências e ações de melhoria continuam disponíveis.

Somente avaliações em andamento e usuários com `governance.assess` podem classificar. A escrita consulta novamente avaliação, controles e progresso antes de liberar novas alterações. Divergência entre as versões da avaliação e do progresso bloqueia escrita e exige nova consulta. A seção e os filtros são preservados após uma classificação.

## Envio de evidências no controle

O painel de evidências oferece URL, **Enviar arquivo como evidência** e seleção de anexos existentes. O envio direto usa `POST /workspaces/{workspaceId}/attachments` com multipart `file`; em seguida, `POST /assessments/{assessmentId}/controls/{controlId}/evidence` com `evidenceType=ATTACHMENT`, `referenceId`, título, validade e versão da avaliação.

São usadas as rotas já existentes. O arquivo fica na biblioteca privada para reutilização, sem exigir navegação até Workspaces. Tipos permitidos: PNG, JPEG, PDF, TXT e CSV UTF-8; validação local de arquivo não vazio e até 10 MiB, com validação definitiva pelo servidor.

A avaliação precisa estar em andamento. O envio requer `attachment.upload` e o vínculo requer `attachment.read` e `governance.assess`. O painel explica o estado ou a permissão ausente e oferece iniciar um rascunho explicitamente, preservando o snapshot.

Upload e vínculo são duas operações sequenciais sob o mesmo bloqueio da avaliação. Se o vínculo falhar após um upload confirmado, o arquivo e o formulário permanecem disponíveis para repetir apenas o vínculo com a versão revisada. Se o upload não tiver resposta confirmada, a interface oferece consultar a biblioteca no próprio formulário para recuperar o arquivo ou repetir o envio após inspeção. Não há repetição automática nem exclusão automática de bytes.

## Metas por seção

A seção selecionada oferece **Criar meta desta seção**, preenchendo framework, seção, métrica `GOVERNANCE_SCORE` e alvo 100. O formulário permite alterar alvo, operador, prazo e responsável.

As rotas existentes de criação, leitura e PATCH de metas aceitam `sectionId` e `ownerMemberId`, ambos opcionais e anuláveis. A leitura inclui `sectionName`, `sectionPath` e `ownerDisplayName`.

- Uma seção exige índice de governança, framework correspondente e escopo Workspace (`projectId=null`).
- O responsável é um membro ativo do Workspace; vínculos históricos não alterados são preservados por omissão no PATCH.
- Trocar framework consulta todas as páginas de seções e preserva o restante do formulário. Falhas bloqueiam o envio e permitem repetir a consulta sem perder o rascunho.
- O cálculo de metas usa a última avaliação **encerrada**, inclusive para uma seção. O acompanhamento provisório não é apresentado como resultado calculado da meta.
- `lastResult` conserva seção, caminho, fonte e razão de resultado ausente: sem avaliação encerrada, seção ausente do snapshot, seção vazia ou nenhum controle aplicável.
- Consultar o painel não calcula metas. Alterar a meta limpa o resultado conforme a resposta da API.

## Tela inicial

`GET /api/v1/dashboard/overview` fornece o bloco adicional `frameworkGovernance`: resumo geral, frameworks, fonte exata de cada um, resumo dos níveis raiz e atenção (não avaliados, não atendidos, parciais, evidências vencidas e metas próximas do prazo).

Esse bloco aparece em **Metas de governança**, junto às metas existentes. Links para frameworks carregam `frameworkId` e `assessmentId`, abrindo a mesma fonte exibida no resumo. Links para metas carregam `goalId`.

O período do dashboard não limita a posição atual dos frameworks. O front não calcula médias entre percentuais nem usa armazenamento local para marcar conclusões.

## Dependência de implantação

A API deve ter aplicado a migração `202610040008_framework_progress_goals`. O front consome os endpoints entregues; não foi necessária outra alteração no back-end para esta integração.
