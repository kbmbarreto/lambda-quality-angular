# Lambda Quality — Front-end

Lambda Quality é um sistema de gestão da qualidade de software de código aberto da Lambda Team, distribuído sob a [licença MIT](LICENSE).

Aplicação Angular 21, em português, com componentes standalone, Signals, Reactive Forms e rotas carregadas sob demanda. O tema reutiliza o CSS da página original (`index.html` na raiz): Tahoma, janelas clássicas, tons de azul e degradês.

## Executar localmente

Use Node.js 24 (o projeto também aceita as versões compatíveis 20.19+ e 22.12+) e npm.

```sh
npm ci
npm start
```

Acesse http://localhost:4200. A API deve estar em http://localhost:3000. O proxy de desenvolvimento encaminha `/api/**` para ela; ajuste `proxy.conf.json` caso a porta mude. O Swagger está em http://localhost:3000/docs.

## Funcionalidades disponíveis

- `/login`: autenticação por e-mail e senha e carregamento do perfil.
- `/cadastro`: solicitação de código por e-mail, confirmação, nome e senha.
- `/recuperar-senha`: solicitação de código e redefinição de senha.
- `/inicio`: visão geral com indicadores, projetos, atividade recente, metas e acompanhamento de frameworks.
- `/meu-perfil`: perfil, disponibilidade do serviço e gerenciamento das sessões.
- `/ambientes`: seleção de Workspace/Projeto e administração dos ambientes.
- `/workspaces`: listagem paginada, busca, ordenação, estado vazio e criação de Workspace.
- `/workspaces/:workspaceId`: edição e transferência de propriedade; membros, convites, papéis, grupos, campos personalizados, tags e anexos privados.
- `/convites/aceitar`: aceite do convite recebido por e-mail, inclusive passando por login ou cadastro.
- `/projetos`: seleção paginada de Workspace para acessar os projetos.
- `/workspaces/:workspaceId/projects`: projetos visíveis, busca por nome/chave, filtros e criação.
- `/workspaces/:workspaceId/projects/:projectId`: edição, arquivamento, participantes, marcos e ambientes.
- `/casos-de-teste`: seleção de Workspace e Projeto para acessar o repositório de testes.
- `/workspaces/:workspaceId/projects/:projectId/test-cases`: suítes, casos, passos, valores personalizados, tags e anexos.
- `/planos-e-execucoes`: seleção de Workspace e Projeto para planos e execuções.
- `/execucoes`: histórico completo das execuções acessíveis, com filtros e abertura da execução por `runId`.
- `/workspaces/:workspaceId/projects/:projectId/execution`: planos, execuções, resultados e comentários.
- `/defeitos`: seleção de Workspace e Projeto para acompanhar defeitos.
- `/workspaces/:workspaceId/projects/:projectId/defects`: defeitos avulsos ou originados em falhas, ambientes históricos, anexos e aba de indicadores.
- `/workspaces/:workspaceId/defects/analytics`: indicadores consolidados por período, projeto e categoria de ambiente.
- `/governanca`: seleção de Workspace para acessar Governança.
- `/workspaces/:workspaceId/governance`: frameworks, avaliações, evidências, metas, ações de melhoria e painel interno.

## Integração e sessão

Os contratos implementados seguem os guias em `../lambda-quality-api/front-specs`: autenticação, saúde, Workspaces, os 19 endpoints de Projetos, os 25 endpoints de `test-cases.md` / `test-case-contracts.md`, os 24 endpoints de `execution.md` / `execution-contracts.md`, os nove endpoints de `defects.md` / `defect-contracts.md` e os 32 endpoints de `governance.md` / `governance-contracts.md`. O módulo de Casos de Teste foi conferido com os contratos e o código local da API; sua validação automatizada usa HTTP simulado.

O access token e o perfil permanecem em memória. Para manter o login após F5, o front guarda somente o refresh token e seu prazo em `sessionStorage`, por origem e sessão da aba, sem senha, perfil ou permissões persistidos. As rotas protegidas e de login aguardam uma única restauração compartilhada: `POST /auth/refresh`, seguido de `GET /auth/me`, antes de permitir navegação. A URL protegida atual é preservada. O registro de renovação é removido antes de consumir o token de uso único e substituído pelo token rotacionado; respostas incertas não repetem refresh. Expiração, falha de validação, logout ou recuperação de senha limpam a sessão; respostas tardias não restauram um acesso encerrado nem sobrescrevem um login novo. Restrições de armazenamento não impedem o login normal, mas podem exigir novo login após recarregar. Este comportamento substitui a orientação anterior do guia de manter o par exclusivamente em memória, conforme a melhoria solicitada; usa as rotas existentes e não exige migration ou alteração de DTO.

O interceptor envia bearer somente às rotas protegidas da API configurada e renova exclusivamente em `AUTH_ACCESS_TOKEN_EXPIRED`, uma vez, compartilhando a renovação entre requisições simultâneas. Falhas de refresh exigem novo login; não há repetição automática de mutações ou refresh. Logout remove imediatamente a persistência da aba antes de aguardar a revogação no servidor. Nenhum token de autenticação é guardado em localStorage ou no cookie de preferências.

Os formulários tratam Problem Details, erros por campo, `Retry-After`, cooldown de reenvio, expiração de desafios e loading. Senhas não sofrem trim; códigos são strings para preservar zeros à esquerda. Falhas de logout distinguem encerramento local de revogação confirmada pelo servidor. Cadastro e recuperação reais dependem da configuração de e-mail do back-end.

## Administração de Workspaces

O Workspace selecionado e suas permissões ficam em memória. Trocar de Workspace ou encerrar a sessão limpa o contexto; requisições das telas anteriores são canceladas. Ações usam as permissões atuais retornadas pela consulta do Workspace, enquanto a API continua sendo responsável pela autorização. 403/404 atualizam o escopo sem encerrar o login global. Mudanças de acesso recarregam capacidades; ownership é separado dos papéis.

Membros exibem concessões diretas e herdadas por grupos. Somente concessões diretas podem ser revogadas nessa tela. Proprietários são protegidos contra suspensão e remoção; transferência exige escolher outro membro ativo e confirmar. Papéis de sistema são imutáveis. Campos preservam chave, tipo, alvo e opções na edição; arquivamento mantém a chave reservada.

O ícone de envelope no canto superior direito abre o modal de aceite de convite, sem sair da tela atual. Após confirmar o aceite, o usuário entra no Workspace retornado pela API. O acesso pelo link do e-mail continua disponível.

O link de convite deve apontar para a aplicação (preferencialmente `/convites/aceitar`) e usar `#token=...`. O fragmento é removido do histórico e o token permanece somente em memória durante login/cadastro. Após atualizar a página, reabra o link do e-mail. Aceite bem-sucedido recarrega a lista de Workspaces. Convites e e-mails dependem de `INVITATION_ACCEPT_URL` e SendGrid no back-end; “aceito pelo provedor” não garante entrega na caixa postal.

Anexos usam `FormData` sem Content-Type manual e downloads autenticados com Blob e URL temporária. Upload aceita um arquivo não vazio PNG/JPEG/PDF/TXT/CSV, até o limite padrão de 10 MiB; o servidor valida tipo, conteúdo e seu limite configurado. Erros de download em Blob são convertidos em Problem Details, incluindo o caso de token expirado. Nenhuma URL pública permanente é criada.

Após timeout ou falha de rede em uma alteração, a interface orienta consultar o estado antes de repetir. Não há retry automático de mutações. Cancelar a tela não confirma cancelamento de uma operação que já chegou ao servidor.

## Projetos

O menu Projetos permite escolher um Workspace; a administração do Workspace também oferece acesso direto aos seus projetos. A listagem usa ACTIVE por padrão, com filtros para arquivados e todos. Chaves são normalizadas para maiúsculas, têm 2–12 caracteres e permanecem imutáveis e reservadas após arquivamento.

As ações usam as permissões efetivas retornadas pelo projeto, resultantes das permissões do Workspace e do papel local (Leitor/Editor/Gestor). Um administrador pode acessar pelo Workspace sem vínculo local. A atribuição de participantes utiliza `WorkspaceMember.id` e só permite papéis cujas capacidades o ator possui; suspensos não recebem novas atribuições. A remoção preserva o usuário e seu vínculo com o Workspace. Após alterações, o acesso é consultado novamente, inclusive quando o ator modifica seu próprio vínculo.

Projetos arquivados preservam participantes, marcos e ambientes para consulta e bloqueiam mutações; não há restauração nesta fase. Marcos nascem planejados, usam datas de calendário sem conversão de fuso e validam início ≤ prazo. Conclusão é uma ação específica com confirmação; concluídos não são editados e cancelados precisam ser reabertos antes de concluir. A exclusão de marcos/ambientes é lógica. Ambientes inativos continuam consultáveis e editáveis; nomes excluídos permanecem reservados.

Dados e requisições são isolados por Workspace/projeto, cancelados na troca de rota e limpos no logout. Negativas de acesso revalidam o escopo sem repetir a mutação nem entrar em loop. Os testes HTTP usam respostas simuladas; a conferência visual também usa uma prévia local com dados simulados, sem alterar a API real.

## Casos de teste e suítes

O menu Casos de teste abre diretamente o último projeto válido da sessão, ou o único projeto acessível. Quando há mais de uma opção, Workspace e projeto são escolhidos na mesma tela e podem ser trocados no próprio repositório. A seleção é separada por usuário e seu acesso é revalidado.

Suítes aparecem em uma árvore lateral com contagens, busca e expansão; clicar em uma pasta mostra seus casos ao lado. O título de um caso abre seus detalhes. O cadastro rápido cria um rascunho na suíte selecionada, enquanto o formulário completo atende campos obrigatórios e definições detalhadas. Associar ou alterar suíte fica disponível na própria linha do caso.

As contagens usam a rota agregada documentada em [docs/API_TEST_REPOSITORY.md](docs/API_TEST_REPOSITORY.md), com fallback para os totais da paginação existente quando ela ainda não estiver disponível. O carregamento das contagens não bloqueia a consulta dos casos.

O repositório pertence a um único Workspace/Projeto. As ações seguem as permissions efetivas `testcase.read/create/update/archive`; projetos arquivados permitem apenas consulta. A atribuição de participantes considera as novas capacidades de cada papel local, sem presumir grants pelo nome do papel.

Casos oferecem busca, paginação, ordenação e filtros por suíte/raiz, situação, prioridade, automação e tag. O padrão exclui arquivados. A definição inclui passos próprios e campos personalizados; tags e anexos podem ser vinculados após a criação. A clonagem cria um rascunho; restauração exige escolher a situação e um destino ativo. Arquivos continuam na biblioteca privada do Workspace.

Cada alteração envia a `version` retornada pela API, inclusive DELETE de passos e vínculos. Conflitos preservam o formulário local, mostram os dados atuais e exigem revisão explícita antes de usar a versão nova; consultar não reenvia a alteração. Falhas de rede ou 503 orientam consultar o estado antes de repetir criação ou clone. O conteúdo JSON é limitado a 32 KiB em bytes UTF-8.

Suítes são carregadas por todas as páginas antes de habilitar movimentação e ordenação. Ordenar envia o conjunto completo de irmãos ativos, e destinos excluem a própria suíte e suas descendentes. Arquivamento exige ausência de filhos ou casos não arquivados e não é recursivo; não há restauração de suítes.

Campos usam os tipos do catálogo, opções por UUID, datas de calendário, números sem coerção e booleanos que distinguem falso de não preenchido. Novos obrigatórios devem ser preenchidos na próxima edição/restauração. Valores de definições arquivadas permanecem no histórico. Catálogos exigem `field.read/tag.read`; sem esses grants, os valores existentes são preservados e tags podem ser vinculadas por ID. Anexos e clones que os copiam exigem `attachment.read`.

Shared steps e parâmetros não fazem parte desta fase. A API deve ter aplicado a migração `202610020003_test_management`. Os testes do módulo usam respostas simuladas; a integração com o servidor real ainda precisa ser conferida quando ele estiver disponível neste computador.

## Planos e execuções

O módulo utiliza `testrun.read/execute/manage` efetivos do projeto. Leitores consultam; editores iniciam/concluem execuções e registram resultados/comentários; gestores administram planos, criam e abortam execuções. Incluir casos, ativar planos e criar execuções também exige `testcase.read`. A atribuição dos papéis locais considera esses novos grants. Projetos arquivados permitem somente consulta.

Planos nascem em rascunho, inclusive vazios. Metadados e seleção ordenada são editáveis somente nessa situação. A seleção aceita até 500 casos DRAFT/ACTIVE distintos; ativação exige todos ACTIVE e congela o plano. A ordenação envia todos os IDs de TestCase, incluindo os casos fora da página visível, e remoção usa o ID de TestCase com version no body. Conclusão e arquivamento não permitem execuções abertas e não possuem restauração.

Execuções são criadas a partir de planos ativos, herdando marco e ambiente, ou avulsas com 1–500 casos ativos. O servidor valida campos obrigatórios e o limite de 10000 passos. A interface envia somente a seleção e o contexto; snapshots, origem MANUAL e resultados iniciais são definidos pelo servidor. Marcos cancelados e ambientes inativos não podem ser selecionados. Nomes e descrições do contexto ficam preservados na execução.

A execução inicia em CREATED e precisa ser iniciada para receber resultados. Cada caso possui resultado explícito; PASSED exige todos os passos PASSED/SKIPPED. Alterar um passo devolve o caso para NOT_TESTED, exigindo nova confirmação. Conclusão exige resultados finais em todos os casos; aborto preserva resultados parciais. Execuções encerradas são imutáveis. A definição preservada mostra passos, tags e valores personalizados, incluindo campos arquivados, false, zero e labels históricos das opções. Anexos continuam na biblioteca privada e não são copiados.

Comentários do resultado são editáveis com o resultado; comentários no histórico são registros separados imutáveis com autor, data e alvo (execução/caso/passo). Resultados e comentários enviam a versão do Run e os IDs das cópias. Criar Run de plano usa a versão do plano sem incrementá-la. As alterações ficam serializadas até atualizar summary, casos e comentários; falha na consulta após uma escrita confirmada preserva a nova versão e bloqueia novas escritas até revisão. Conflitos preservam o formulário e exigem consulta e revisão explícita. Respostas incertas em criação/comentários exigem consultar as execuções ou o histórico para evitar duplicação; não há retry automático de mutações.

A API deve ter aplicado a migração `202610020004_execution`. Os testes HTTP e a conferência visual usam dados simulados. O servidor local não estava disponível durante esta implementação; a integração real deve ser conferida quando a API estiver em execução.

### Seleção em lote e relatórios — 08/10/2026

A criação de um plano permite marcar vários casos e enviar `caseIds` na rota existente. No rascunho já criado, o seletor tem caixas de marcação, seleção da página e preservação entre páginas. A inclusão usa `POST test-plans/{id}/cases` em sequência, sempre com a versão retornada pela inclusão anterior. A interface mostra quantas inclusões foram confirmadas, interrompe na primeira falha e não repete escritas automaticamente. Não é uma transação única: inclusões já confirmadas permanecem no plano.

Na execução de um plano, após iniciá-la, “Importar relatório” aceita **JUnit XML**, até 2 MiB e 500 resultados. A prévia permite marcar resultados e associá-los aos casos preservados da execução. O identificador pode estar no nome do teste ou numa propriedade JUnit `lambdaquality.caseId` (ID do TestCase) / `lambdaquality.humanId` (ex.: `QA-12`). Um título igual não é usado como vínculo automático. Falhas/erros viram FAILED, skipped vira SKIPPED e os demais testes viram PASSED. DTD e entidades XML são rejeitados. Não há upload para a biblioteca de anexos.

O importador utiliza as rotas existentes de resultado com `testrun.execute`, serializa as versões e exige autorização explícita para substituir resultados existentes. Preserva comentários anteriores, acrescenta a origem JUnit e não altera passos nem encerra a execução. PASSED continua exigindo passos PASSED/SKIPPED: um resultado externo de sucesso não comprova individualmente os passos. Falha ou resposta incerta interrompe a fila; consulte o estado atual e revise os itens restantes.

“Meus projetos” consulta todas as páginas dos Workspaces/projetos autorizados, incluindo projetos arquivados em Workspaces ativos. Conta casos ACTIVE e ACTIVE + AUTOMATED pelos totais de paginação já disponíveis; ausência de permissão/erro não vira zero. O card possui rolagem e cabeçalho fixo. O inventário de execuções consulta todas as páginas dos projetos com `testrun.read`, com no máximo quatro projetos simultâneos e cancelamento ao trocar de escopo. Os cartões do início levam aos respectivos módulos; Execuções leva ao inventário geral. Os atalhos respeitam o Workspace selecionado. O inventário apresenta todo o histórico, independentemente do período do card.

### Solicitações sugeridas ao back-end

As rotas atuais atendem aos atalhos, histórico, projetos e importação de resultados compatíveis com as regras manuais. Para permitir **importação automática completa**, inclusive casos com passos pendentes, precisamos de um contrato específico. Proposta para discussão, ainda não implementada/consumida pelo front:

- `POST /api/v1/workspaces/{workspaceId}/projects/{projectId}/test-runs/{runId}/result-imports/preview`: multipart com arquivo JUnit XML; `testrun.read/execute`, execução IN_PROGRESS de plano do mesmo escopo. Validar tamanho/formato, IDs e resultado sem gravar. Retornar `previewId`, versão da execução, hash do arquivo, validade e os itens com resultado, vínculo proposto e impedimentos. Identificadores ambíguos/repetidos precisam de revisão, sem associação por título presumida.
- `POST .../result-imports/{previewId}/apply`: `{version, requestKey, mappings:[{itemId, runCaseId}], overwrite:false}`. Confirmar a seleção em transação, verificar o escopo/grants, a versão e a validade da prévia. Retornar execução atualizada e resumo da importação. Usar idempotência por `requestKey` e disponibilizar `GET .../result-imports/{previewId}` para conferir estado após timeout antes de reenviar. Em conflito, devolver `409 TEST_RUN_VERSION_CONFLICT` com `requestId` e não gravar parcialmente.
- **Regra necessária:** definir como resultado externo PASSED convive com os passos do snapshot. Recomendamos uma modalidade de resultado externo auditável, com arquivo/hash/ferramenta e origem preservados, que aceite o resultado do caso sem fabricar resultados dos passos. Manter a regra de execução manual e a imutabilidade de execuções encerradas. A decisão deve constar no OpenAPI/guia antes de integrar.

Opcionais para desempenho em instalações grandes:

- Inclusão atômica em lote: `POST .../test-plans/{planId}/cases/bulk`, body `{version, caseIds}`; validar todos os IDs, duplicados, limite de 500 e estado DRAFT antes de gravar; retornar TestPlan com nova versão. Elimina a fila de inclusões individuais.
- `GET /api/v1/test-runs` consolidado e paginado, filtros `workspaceId/projectId/status/q`, ordenação e nomes de projeto/Workspace, aplicando `testrun.read` e visibilidade antes de filtrar/contar/paginar. Elimina a leitura de todas as execuções no navegador.
- `GET /api/v1/dashboard/projects` paginado, filtro `workspaceId/status`, nomes e indicadores `activeTestCases/automationCoverage` calculados conforme os grants de fonte. Elimina as consultas de contagens por projeto e o limite da lista da overview.

Nenhuma dessas propostas autoriza exposição de dados de outro Workspace ou muda os grants existentes. As melhorias atuais não exigem migrations novas no back-end.

## Defeitos

O módulo usa as permissões efetivas `defect.read/manage` do projeto. Leitores consultam; editores e gestores gerenciam defeitos conforme os grants do Workspace. Projetos arquivados permitem apenas consulta. A listagem oferece busca pelo título, situação, severidade, origem, ordenação e paginação; o padrão inclui todas as situações.

Defeitos nascem abertos, com versão 1 e identificador próprio `CHAVE-DEF-sequência`, independente dos casos de teste. Podem ser criados avulsos ou a partir do caso com resultado FAILED de uma execução, inclusive concluída ou abortada. A origem exige `testrun.read`, utiliza o ID da cópia do caso e fica imutável; várias ocorrências podem ser vinculadas à mesma falha. O servidor herda os campos não alterados e revalida o resultado na criação. Criar um defeito não altera versão, resultados ou snapshots da execução. Links entre módulos permitem consultar a origem e os defeitos daquele caso.

Título, descrição, severidade e qualquer situação podem ser editados, inclusive reabertura. As mutações enviam a versão atual do defeito e utilizam a versão devolvida pelo servidor, inclusive em operações sem efeito. Conflitos preservam o formulário, mostram o estado atual e exigem revisão explícita antes do reenvio. Falhas de rede, timeout ou 5xx bloqueiam repetição até consulta; não há retry automático. Criação não é idempotente. O JSON respeita o limite de 32 KiB em UTF-8.

Referências externas são manuais: sistema, identificador e URL HTTP/HTTPS absoluta, sem credenciais, espaços ou barras invertidas. A interface valida a URL e usa links com `noopener noreferrer`; não consulta nem sincroniza sistemas externos. Remover a referência não altera a issue externa.

Anexos reutilizam a biblioteca privada do Workspace, com seleção paginada de até 100 IDs distintos. Consultar nomes, vincular e baixar exige `attachment.read`, separadamente de `defect.read`. Downloads continuam autenticados; nenhuma URL permanente é gerada. Remover um vínculo exige apenas `defect.manage` e preserva o arquivo. Vínculos de arquivos excluídos podem ser removidos por ID; o limite do servidor considera também esses vínculos históricos.

Não há exclusão ou arquivamento de defeitos nesta fase. A API deve ter aplicado a migração `202610020005_defects`. Os testes HTTP e a conferência visual usam dados simulados; a integração real precisa ser conferida quando o servidor local estiver disponível.

## Ambientes e indicadores de bugs

Ambientes possuem uma área própria por projeto, com cadastro, edição, ativação/inativação e categoria explícita (Homologação, Produção ou Outro). Defeitos avulsos permitem escolher o ambiente. Defeitos de uma falha podem herdar a execução, remover a herança ou escolher outro ambiente ativo. Edição preserva nome e categoria históricos quando o vínculo permanece inalterado.

Em Defeitos, **Indicadores de bugs do Workspace** reúne histórico mensal por categoria, cartões do mês e gráficos por projeto, ambiente, homologação e produção. O projeto também oferece a aba Indicadores. As consultas utilizam datas reais inclusivas em UTC, até 36 meses civis, projeto opcional e categoria. “Outro” e “Sem ambiente” permanecem visíveis. Os status representam a situação atual dos bugs criados no intervalo, sem reconstruir transições históricas.

A API deve ter aplicado `202610040009_defect_environments`. Veja [API_DEFECT_ANALYTICS.md](docs/API_DEFECT_ANALYTICS.md).

## Governança

O módulo pertence ao Workspace e utiliza os grants independentes `governance.read/assess/manage`, retornados pela API. Leitura consulta; avaliação cria, inicia, classifica, vincula evidências e fecha; gestão administra frameworks, metas e ações. O catálogo aceita as 32 permissões atuais; a matriz local dos papéis de Projeto permanece igual. Não há inferência de grants pelo nome do papel.

Frameworks possuem seções hierárquicas, posição explícita e controles com peso e ativação. Todas as páginas da definição são carregadas antes de permitir movimentos na árvore; destinos excluem a própria seção e descendentes, respeitando 20 níveis, 500 seções e 1000 controles. Ativação exige ao menos um controle ativo. Arquivamento é terminal; o último controle de um framework ativo não pode ser desativado.

Avaliações preservam a definição, a árvore, os caminhos e os pesos no momento da criação. Somente avaliações em andamento aceitam classificações e evidências; N/A exige justificativa. Fechamento exige todos os controles classificados e preserva resultados para consulta. O índice ponderado vem do servidor e é exclusivamente interno, sem afirmação de certificação. Todos N/A produzem valor nulo, não zero. Alterar o framework não modifica avaliações existentes.

Evidências usam URLs HTTP/HTTPS validadas, seleção de arquivos existentes ou envio direto no próprio controle. O botão **Enviar arquivo como evidência** solicita arquivo, título e validade opcional; um único envio salva na biblioteca privada e cria o vínculo sem sair do framework. Exige `attachment.upload`, `attachment.read` e `governance.assess`. Rascunhos explicam o bloqueio e oferecem iniciar a avaliação no mesmo painel. Upload e vínculo ficam serializados; arquivos confirmados são reutilizados ao repetir um vínculo após conflito. Envios inconclusivos exigem consultar e conferir a biblioteca local antes de repetir. Arquivos exigem `attachment.read`, inclusive ao consultar um controle com evidências mistas. Downloads são autenticados e temporários; arquivos indisponíveis conservam sua descrição histórica. Remover um vínculo exige avaliação e preserva os bytes. A validade vencida apenas sinaliza atenção. Até 100 vínculos por controle; avaliações fechadas não permitem alterações.

Metas implementam somente cobertura de automação, defeitos críticos abertos e índice de governança. Critérios aceitam percentuais com duas casas ou contagens inteiras, operadores e prazo calendário. A conclusão usa `actionProgress` retornado pela API: ações DONE entre todas as vinculadas não CANCELLED, independentemente da métrica e das avaliações. Sem válidas é “Sem ações válidas”, zero é “0%”, e percentuais conservam até duas casas (99,99% continua pendente). Situação e prazo são interpretados pelo servidor, sem cálculo local de status. **Atualizar métrica informativa** consulta as fontes e grava `lastResult`; consultas e painel não recalculam esse valor. Edição limpa o resultado conforme a resposta da API; metas canceladas são terminais. Metas de Projeto e ações vinculadas respeitam visibilidade e arquivamento. Cálculos de automação/defeitos do Workspace exigem acesso a todos os Projetos ativos e à fonte; não utilizam uma amostra dos visíveis.

Ações podem vincular meta e controle avaliado e atribuir um membro ativo por `WorkspaceMember.id`. Nos detalhes de uma meta, **Vincular ação existente** permite buscar e paginar as ações do Workspace; a confirmação avisa quando o vínculo será transferido de outra meta. A lista vinculada permite abrir a ação ou desvinculá-la. O PATCH envia somente `version` da ação e `goalId` (UUID para associar, `null` para remover), preservando o controle avaliado imutável e o resultado informativo da meta. Criação, vínculo, transferência, remoção e mudanças de situação/conclusão das ações podem alterar a situação, versão e data das metas afetadas na mesma transação. O front reconsulta as metas de origem/destino, listas por `goalId` e painel após a escrita; novas mutações da meta usam sua versão atual, nunca a da ação. Exige `governance.read/manage`, Workspace e projetos ativos; ações concluídas/canceladas não aceitam alterações e metas canceladas permitem somente remoção. Conflitos e respostas incertas exigem consultar e revisar o estado antes de reenviar; uma associação já confirmada por GET não repete o PATCH. Utiliza os endpoints existentes entregues em 07/10/2026, sem outra alteração no back-end. Avaliações e atendimento de frameworks continuam independentes das ações; metas canceladas permanecem canceladas. Ações pendentes podem reabrir uma meta atingida, e cancelar todas as ações não produz atingimento. Conclusão e cancelamento são terminais. O painel usa exclusivamente contagens visíveis retornadas pelo servidor e atenção da última avaliação fechada de cada framework.

Toda alteração usa a versão atual do agregado correto: seções/controles incrementam o framework; resultados/evidências incrementam a avaliação; metas e ações têm versões próprias. Escritas ficam serializadas até consultar os dados atualizados. Conflitos preservam o formulário e exigem consulta e revisão explícita; falhas de rede, timeout ou 5xx bloqueiam repetição até conferir o estado. Criações inconclusivas exigem consultar novamente a coleção. JSON respeita 32 KiB em UTF-8; não há retry automático de mutações. Troca de Workspace e mudança de acesso cancelam o escopo anterior.

A API deve ter aplicado a migração `202610030006_governance`. Os testes HTTP e a conferência visual usam dados simulados; o servidor local não estava disponível e a integração real deve ser conferida quando ele estiver em execução.

## Organização

- `src/app/core`: contratos tipados, autenticação, interceptor, guards e erros.
- `src/app/features/auth`: login e fluxos de confirmação por e-mail.
- `src/app/features/home`: visão geral do produto e página Meu Perfil (conta, disponibilidade e sessões).
- `src/app/features/workspaces`: serviços tipados, listagens e administração por Workspace.
- `src/app/features/projects`: contratos tipados, contexto de acesso, projetos, participantes, marcos e ambientes.
- `src/app/features/test-cases`: repositório, suítes, definição de casos, passos, vínculos, campos tipados e revisão de conflitos.
- `src/app/features/execution`: contratos, planos, seleção ordenada, execuções, snapshots, resultados, comentários e revisão de conflitos.
- `src/app/features/defects`: contratos, repositório, criação a partir de falhas, edição, referências externas, anexos e revisão de conflitos.
- `src/app/features/governance`: contratos, frameworks, árvore, avaliações preservadas, evidências, metas, ações, painel e revisão de conflitos.
- `src/app/features/workspaces/ui`: ferramentas de busca/paginação, formulários e seletores acessíveis em diálogos.
- `src/app/shared`: janela de autenticação e validação de formulários.
- `src/styles.css`: tema compartilhado e ajustes responsivos.
- `src/environments`: URL base da API por ambiente.
- `index.html`: referência visual original, preservada.

## Verificar e publicar

```sh
npm test -- --watch=false
npm run build
```

Neste Mac, o cache nativo LMDB do Angular apresentou encerramento do Node com `SIGABRT`. Para executar sem o cache local, use `CI=1 npm run build` ou `CI=1 npm start`. O build de produção foi validado dessa forma; não há alteração de dependências por causa desse problema.

Os testes usam a infraestrutura HTTP do Angular, sem enviar e-mails ou criar contas reais. Cobrem autenticação, rotas protegidas, convites, paginação, isolamento entre Workspaces, permissões, ownership, campos imutáveis, grants idempotentes, validação de upload e downloads privados com renovação de token. As telas autenticadas também foram conferidas em uma prévia local com dados simulados; essa prévia não altera a configuração de integração real da aplicação.

O build fica em `dist/lambda-quality/browser`. Em produção, configure o servidor para servir `index.html` nas rotas da aplicação e encaminhar `/api` ao back-end. O proxy do `ng serve` não faz parte do build. Para uma API em outro domínio, altere `environment.production.ts` e configure CORS no back-end. Sirva a aplicação por HTTPS em produção.

A dependência de build `piscina` tem override para uma versão corrigida (`>=5.3.2` dentro da major 5), mantendo Angular 21. As versões resolvidas estão em `package-lock.json`.

## Repositório de frameworks e visão geral do produto

Frameworks agora usam árvore de seções com busca e contagens, tabela de controles ao lado, cadastro rápido com código/título e vínculo contextual, criação de subseções e ação dedicada para alterar a seção de um controle. As rotas atuais atendem essa experiência; veja [a integração de frameworks](docs/API_FRAMEWORK_REPOSITORY.md).

A conta, a disponibilidade e o encerramento de sessões ficam em `/meu-perfil`, acessível pelo menu e pelo nome no cabeçalho. `/inicio` fica reservado aos indicadores, gráficos, projetos, atividade recente, metas, referências e guia rápido, com filtros de Workspace e últimos 7/30/90 dias.

O painel inicial consome `GET /api/v1/dashboard/overview`, incluindo o acompanhamento de frameworks em Metas de governança. Percentuais, níveis, avaliações de origem e atenção vêm do servidor, junto às metas existentes. Dados ausentes e falhas permanecem distintos de zero. Veja [API_GOVERNANCE_PROGRESS.md](docs/API_GOVERNANCE_PROGRESS.md) para os contratos e a navegação por avaliação/seção. A mudança de Meu Perfil não exige alteração na API.

## Temas e aviso de cookies

Padrão Lambda é o tema inicial: superfícies claras, destaques em azul e navegação com ícones. Meu Perfil → Aparência permite alternar imediatamente entre Padrão Lambda, Lambda escuro (mesmo layout, superfícies escuras e detalhes azuis) e Clássico, preservando o visual azul compacto. O tema claro Lambda continua como padrão para novos acessos. A paleta usa variáveis CSS em `src/styles.css`; `data-theme` é aplicado antes da inicialização da aplicação. Cores semânticas dos resultados continuam independentes da identidade visual.

O login apresenta um diálogo de cookies enquanto não existir o cookie `lambda_quality_preferences`. Após concordar, ele guarda apenas a versão do aceite e o tema (`v1:LAMBDA`, `v1:LAMBDA_DARK` ou `v1:CLASSIC`), com escopo `/`, `SameSite=Lax`, validade persistente e `Secure` em HTTPS. Nenhuma senha ou token é persistido nele. A preferência é por navegador/origem, sem nova rota de API e sem sincronização entre dispositivos. Não usamos localStorage como cópia do aceite: apagar esse cookie restaura Lambda e reexibe o aviso no próximo login/recarregamento. O navegador pode limitar a retenção de cookies persistentes; nesse caso o aceite precisará ser renovado ao expirar.

Se cookies estiverem bloqueados, o diálogo explica a falha e permite continuar sem salvar. O aviso também descreve os filtros guardados em localStorage e o token de renovação temporário em sessionStorage para restaurar o acesso após F5. Adicionar analytics ou outras categorias de cookies exigirá revisar o aviso e seu gerenciamento de preferências.

## Integração do produto — 06/10/2026

- Defeitos mostra o inventário autorizado (`GET /api/v1/defects`) antes da seleção de Workspace. Busca, filtros e paginação são feitos na API; abrir um defeito usa os IDs de Workspace, projeto e registro. Projetos arquivados permanecem consultáveis.
- Casos de teste → **Importar CSV do Azure DevOps** envia somente o arquivo `.csv` de até 5 MiB. O resultado abre rascunhos sem suíte e atualiza as contagens. Reenvio dos mesmos bytes no mesmo projeto é idempotente no servidor; erros mantêm o arquivo selecionado. A visão geral não tem cache de dados e consulta a API novamente ao abrir Início.
- Projeto → **Cofre de testes**, também acessível pelo repositório de casos, consulta apenas metadados. Criar/editar/excluir usa `testvault.manage`; revelar/copiar usa `testvault.reveal`; a lista exige `testvault.read`, sempre do projeto retornado pela API. Credenciais são reveladas somente por ação explícita e permanecem na memória enquanto abertas. Edição de metadados omite `secret`; edição de credenciais requer revelação e substitui o objeto completo. Conflitos atualizam a lista e exigem reabrir o registro; respostas de criação não confirmadas bloqueiam repetição até conferir a lista. Campos sensíveis são limpos ao fechar, ocultar, perder permissões, sair ou trocar projeto.
- Timestamps são formatados em `America/Sao_Paulo`, incluindo históricos com horário de verão. Datas de calendário não mudam de dia. Períodos de agregação continuam seguindo o contrato existente. Controles de definição usam `creationOrder,asc`, sem ordenar pelo código; snapshots de avaliações permanecem independentes.

O back-end deve ter a migration `202610060001_product_improvements` aplicada no dialeto configurado e a chave externa do cofre configurada conforme seu guia de operação. A chave fica exclusivamente na API. Sem ela, os metadados continuam disponíveis e o formulário mostra o erro de indisponibilidade ao gravar/revelar. As verificações automatizadas e a prévia visual usam dados fictícios; não substituem a conferência das permissões e da configuração no ambiente real.

### Execução focada e indicadores de automação

A execução oferece Modo foco para ampliar a área de trabalho e apresenta fila lateral paginada, passos com resultado direto, contexto/histórico recolhíveis e barra fixa para confirmar o caso, com opção de avançar após a gravação. Atalhos preservam os textos existentes e mantêm as regras de versão e resultado final explícito.

No Início, Metas de governança fica abaixo dos gráficos, com atendimento consolidado, frameworks e prioridades. Meus projetos mostra Testes (ativos) e Automatizados (%), e o cartão usa Cobertura de automação. A API precisa acrescentar os três campos descritos em [API_DASHBOARD_AUTOMATION.md](docs/API_DASHBOARD_AUTOMATION.md); até a entrega, valores ausentes aparecem como `—`. O inventário exibe apenas o nome do projeto.

Os filtros de período e Workspace do Início são lembrados no navegador por conta. A restauração valida o Workspace acessível e cancela consultas do escopo anterior. Todo o período usa `days=ALL` e é habilitado quando a API declara `period.supportedDays`; o card Casos de teste usa o total consolidado `metrics.activeTestCases`, sem reutilizar o total antigo com rascunhos. As duas dependências estão detalhadas em [API_DASHBOARD_AUTOMATION.md](docs/API_DASHBOARD_AUTOMATION.md). Nas metas, a métrica informativa ganhou uma comparação gráfica visível entre valor e critério, separada da conclusão por ações.

## Licença

Este projeto é distribuído sob a [licença MIT](LICENSE).

## Identificadores do produto

O pacote se chama `lambda-quality-angular` e o projeto Angular se chama `lambda-quality`. Os identificadores de armazenamento do navegador usam `lambda_quality_*` e `lambdaquality.repository.*`; as propriedades de relatórios JUnit usam `lambdaquality.caseId` e `lambdaquality.humanId`.

A mudança das chaves de armazenamento exige novo login e redefine as preferências e os filtros locais de acessos anteriores. Relatórios JUnit devem usar as propriedades acima. O caminho `../lambda-quality-api/front-specs` pressupõe que o repositório da API esteja disponível com esse nome; a API é mantida separadamente deste front-end.

## Logomarca

O PNG original fica em `assets/logo_lambda_quality.png`. A interface usa `assets/logo_lambda_quality_transparent.png`, com fundo transparente. No tema Lambda escuro, a marca recebe uma apresentação branca via CSS para manter o contraste. Os arquivos de `assets/` são incluídos automaticamente no build.
