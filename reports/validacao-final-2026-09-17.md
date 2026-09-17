# TicketAI — validação final

**Conclusão:** pipeline concluído e aprovado no escopo de R01–R04 e da regressão R06. Validação local e testes de preenchimento no HubSpot real concluídos em 17/09/2026.

## Dev-implementacao / dev-correcao

**Resumo:**

- R01: opções são procuradas apenas na lista vinculada ao botão, sem fallback global. Campos são localizados no modal visível Propriedades dependentes.
- R02: valores vazios habilitados limpam texto, multisseleção e dropdown com opção explícita de limpeza. Quando não há controle compatível, o card indica falha em vez de retornar sucesso indevido.
- R03: Adicionar campo permite editar o nome da propriedade; um nome vazio selecionado bloqueia salvamento com aviso específico.
- R04: grupos usam um objeto sem protótipo; nomes reservados não interrompem a lista.
- R06: busca de Assunto utiliza o input dentro do portal associado ao botão, mesmo quando ele está fora de .Select-menu e .Select.
- R05: corrigido o fechamento prematuro de dropdown no simulador local, sem mudança de produção decorrente desse ticket.

**Pontos de atenção:** seletores dependem do DOM do HubSpot. Limpeza de dropdown simples depende da opção de valor vazio. Não foram alteradas permissões ou versão da extensão. Testes locais e fixture não requerem dependências npm.

## Dev-reviewer

**Veredito: aprovado.**

**Achados por severidade:** nenhum bloqueante ou importante pendente no escopo revisado. Sugestão de manutenção: revalidar a associação dos portais quando o HubSpot mudar os componentes.

R06 passou novamente pela revisão antes da repetição dos QAs. A mudança preserva a restrição ao portal do botão; não reintroduz buscas globais. Sintaxe de JavaScript e `git diff --check` aprovados.

## QA funcional

**Veredito: aprovado no fluxo principal testado.**

| Cenário | Resultado esperado | Evidência observada |
| --- | --- | --- |
| Ler classificação atual e salvar preset | Importar propriedades selecionadas | Seis propriedades detectadas; quatro selecionadas e salvas no preset de referência |
| Criar campo manual Categoria = Dúvida | Campo editável, salvo e aplicável | Preset QA — Dúvida manual alterou a categoria para Dúvida no HubSpot |
| Limpar descrição e categoria | Remover valores anteriores | Campos ficaram vazios no modal real, sem falha no card |
| Limpar Produto | Selecionar opção vazia | Produto ficou vazio no modal real |
| Salvar grupo constructor | Renderizar lista sem exceção | Grupo CONSTRUCTOR · 1 apareceu com o preset de limpeza |
| Aplicar preset completo de referência | Restaurar os quatro campos | Descrição restaurada, Produto Cilia Web, Categoria Solicitação de serviço e Assunto Cadastro de Usuários |

**Automação local:** 4/4 testes funcionais aprovados após o patch final.

## QA regressão

**Áreas testadas:** presets legados, campos desabilitados, agrupamento, pesquisa de Assunto, persistência de presets, duplicação, edição de cópia, busca, modo compacto e troca entre presets dinâmicos.

**Regressão encontrada:** R06, documentada em [ticket-r06-pesquisa-assunto.md](ticket-r06-pesquisa-assunto.md). O input de pesquisa estava fora dos contêineres inicialmente consultados. Encaminhada ao analista-suporte, diagnosticada, corrigida e revisada antes de repetir os QAs.

**Reteste real em 17/09:** selecionar Outros no Assunto do modal e aplicar QA — Restaurar classificação. Resultado: Cadastro de Usuários foi restaurado, card sem mensagem de falha. Log da extensão registrou 252 ms para Assunto e 782 ms para o preset completo nessa execução; esses valores são observações, não uma garantia de desempenho.

**Veredito final: aprovado no escopo testado.** 5/5 testes locais de regressão passaram, incluindo input de pesquisa irmão da lista dentro do portal. Os testes visuais locais de edição, duplicação, busca e modo compacto também passaram. Os três presets reais permaneceram disponíveis ao reabrir o navegador no dia seguinte.

## QA casos extremos

**Cenários locais:** opção ausente; vínculo de dropdown ausente; lista oculta; botão desconectado; modal ausente; nomes de grupo reservados; falta de opção de limpeza; opção desabilitada; checkbox que rejeita limpeza; entrada nula e valor zero; nome de campo vazio na interface.

**Cenário real complementar:** aplicar Assunto = QA pesquisa sem resultado. Durante a execução, o input do portal continha exatamente QA pesquisa sem resultado e a lista exibia Nenhum resultado encontrado. Ao terminar, o card exibia Não foi possível aplicar: Assunto; o valor Cadastro de Usuários permaneceu no campo. O preset foi posteriormente convertido de volta para o caso válido QA — Dúvida manual.

**Veredito: aprovado no escopo testado.** 8/8 testes locais passaram. Nenhuma falha adicional encontrada no reteste real. Mensagens observadas indicam o campo que falhou, sem conteúdo sensível.

## Usuário simulado

**Ambiente:** Edge com a extensão atualizada, no ticket de teste autorizado.

**Ação:** “Cliquei em QA — Dúvida manual e depois em QA — Restaurar classificação.”

**Expectativa:** “Queria trocar a categoria e voltar à classificação anterior sem preencher tudo novamente.”

**Resultado:** “A categoria passou para Dúvida e voltou para Solicitação de serviço. Produto e Assunto ficaram com os valores esperados. Consegui completar o fluxo.”

**Veredito:** nenhum problema adicional percebido nesse uso.

## Estado final e limites

- Total: **17 testes automatizados aprovados**, executados por etapa após o último patch (4 funcionais, 5 de regressão e 8 de casos extremos).
- O modal do HubSpot foi fechado com Cancelar e seu fechamento foi verificado. Não foi acionado Salvar no HubSpot nem enviada mensagem. O status observado antes e depois desta sessão de 17/09 foi Novo.
- Permaneceram três presets de teste na extensão: QA — Restaurar classificação, QA — Dúvida manual e QA — Limpar campos. O último está no grupo constructor, usado para validar R04.
- Aprovação cobre os cenários descritos. Não inclui persistência final de classificação pelo botão Salvar do HubSpot, outros pipelines/contas, falhas reais de permissão/armazenamento, importações arbitrárias ou toda combinação de propriedades dependentes.
- Não houve commit, publicação ou atualização de versão. Alterações estão no workspace.

## Encerramento

Quatro bugs originais corrigidos; R05 do simulador e R06 da pesquisa foram formalizados, diagnosticados, corrigidos e retestados. Revisão, QA funcional, regressão, casos extremos e usuário simulado concluídos. Nenhuma etapa pendente dentro do escopo testado.

Para reproduzir testes e abrir a fixture, consulte [tests/README.md](../tests/README.md).
