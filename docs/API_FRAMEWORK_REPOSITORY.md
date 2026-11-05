# Estrutura de frameworks: integração da experiência de repositório

A navegação por seções, as contagens e o cadastro contextual usam os contratos existentes da API v1. **Nenhuma alteração obrigatória no back-end.**

- `GET /workspaces/{workspaceId}/governance/frameworks/{id}`: metadados e versão do agregado.
- `GET .../frameworks/{id}/sections?page=...&size=100&sort=position,asc`: todas as páginas da árvore, até 500 seções.
- `GET .../frameworks/{id}/controls?page=...&size=100&sort=code,asc`: todas as páginas dos controles, até 1000.
- `POST .../frameworks/{id}/sections`: criação com `parentSectionId` contextual e posição seguinte entre irmãos; código, nome, descrição e posição editáveis no formulário.
- `POST .../frameworks/{id}/controls`: cadastro rápido com `version`, `sectionId`, `code`, `title`, `weight: 1`, `active: true`. Cadastro completo acrescenta descrição, peso e atividade.
- `PATCH .../frameworks/{id}/controls/{childId}`: alterar seção envia apenas `version` e `sectionId`; edição completa mantém os demais campos.
- `PATCH .../frameworks/{id}/sections/{childId}`: edição e movimentação da seção existente, com validação de ciclos e limite de 20 níveis.

As contagens são calculadas sobre o catálogo completo carregado, incluem controles ativos e inativos e acumulam subseções. Busca e filtros da tabela não alteram essas contagens. A seleção inclui subseções por padrão; uma opção restringe a lista à seção escolhida.

Cada mutação usa a versão atual do framework, aplica `frameworkVersion` retornado e aguarda a recarga antes de permitir outra escrita. Conflitos e respostas incertas preservam o formulário e exigem revisão do estado atual. Frameworks arquivados e acessos sem `governance.manage` permanecem consultáveis. Avaliações existentes mantêm seus snapshots.

Um endpoint de resumo poderia reduzir o carregamento inicial em frameworks grandes, mas não é necessário para esta entrega: a sessão existente já carrega todas as páginas para edição e validação da hierarquia. Não foi introduzida dependência de uma nova rota.
