# Confirmação do preenchimento por campo — 17/09/2026

## Dev-implementacao

**Resumo:** após cada ação, o TicketAI relê o controle no modal e exige valor correspondente durante pelo menos 120 ms, com limite de 1,5 s. Ao terminar, confere novamente os campos confirmados para detectar invalidação por propriedades posteriores. O card mostra Aguardando, Aplicando, Confirmado ou Não confirmado — confira no HubSpot. O modo compacto mostra a contagem e o atalho para os detalhes. Presets legados usam a mesma verificação. Uma aplicação em andamento impede aplicações concorrentes.

**Arquivos:** content.js e tests/content.test.cjs. Formato dos presets, permissões e versão 1.7 preservados. Nenhuma migração ou publicação realizada.

**Pontos de atenção:** a confirmação se refere ao valor exibido no modal, não ao salvamento do ticket no servidor. Ela depende do marcador data-option-text no botão. Ausência desse marcador, inclusive para valores vazios, produz resultado não confirmado. Mudanças tardias após a janela de observação não são monitoradas. A janela estável acrescenta cerca de 120 ms por campo no caso normal; o prazo pode aumentar quando não há confirmação. Feedback é de cada execução, não um monitor contínuo dos campos. Apenas o resultado mais recente é mantido em memória para reconstrução da lista, sem valores de tickets; desaparece ao recarregar a página ou salvar um preset.

## Dev-reviewer

**Veredito final: aprovado para QA local.**

- Importante, resolvido antes do QA: detalhamento não cabia no modo compacto; incluído resumo curto com Alt+W para detalhes.
- R07 foi corrigido e passou por nova revisão antes de repetir os QAs.
- Nenhum achado bloqueante ou importante pendente no escopo local.
- Sugestão: validar os marcadores de seleção, especialmente vazios e múltiplos, no HubSpot real antes de publicar.
- Sintaxe de JavaScript e git diff --check aprovados.

## QA funcional

**Veredito: aprovado localmente. 6/6 testes.**

- Aplicar texto e dropdown: valores finais correspondentes, resultado confirmado.
- Limpar texto, dropdown e multisseleção: valores removidos e confirmados nos controles simulados.
- Múltiplas seleções: comparação independe da ordem.
- Resultado: texto visível por campo e aria-busy liberado ao concluir. A UI usa role=status e aria-live; não houve teste com leitor de tela real.
- Na fixture, Minha classificação restaurou Texto legado / Cilia Web / Dúvida / Cadastro; quatro confirmações visíveis.

## QA regressão

**Veredito: aprovado localmente. 8/8 testes.**

Áreas testadas: presets legados; campos desabilitados; agrupamento; portais e pesquisa de Assunto dentro e fora da lista; falha de confirmação em legado; limpeza; reconstrução do card durante aplicação. Na interface também foram testadas busca e alternância normal/compacto após aplicação. Nenhuma regressão pendente no reteste.

## QA casos extremos

**Veredito final: aprovado localmente. 15/15 testes.**

Cenários: opção ausente; vínculo ausente; lista oculta; botão desconectado; modal ausente; grupos reservados; limpeza indisponível; opção desabilitada; rejeição de limpeza; normalização nula/zero; clique sem alteração do valor; texto rejeitado; reversão assíncrona; campo posterior invalidando anterior; seleção adicional; marcador ausente; aplicação concorrente; exceção de controle com liberação do bloqueio e mensagem sem conteúdo sensível.

**Falha visual encontrada e resolvida:** [R07](ticket-r07-feedback-compacto.md). Trocar de modo durante preenchimento deixava Aplicando no card novo. Após a correção e nova revisão, os três conjuntos foram repetidos na ordem: 6 funcionais, 8 de regressão e 15 extremos, todos aprovados. Reteste visual mostrou 4/4 confirmados após alternar o modo durante a execução.

## Usuário simulado

**Ambiente:** fixture local no navegador, com controles visíveis.

- **Ação:** “Cliquei em Limpar campos e depois em Minha classificação. Também abri os detalhes pelo Alt+W.”
- **Expectativa:** “Queria apagar os campos, restaurar a classificação e saber se tinha dado certo.”
- **Resultado:** “Os campos ficaram vazios e depois voltaram aos valores do preset. Consegui ver Confirmado para cada um e o resumo no modo compacto.”
- **Veredito:** nenhum problema adicional percebido nesse cenário local.

## Estado final

Pipeline local concluído; 29 testes aprovados. A integração desta melhoria ainda não foi testada no HubSpot real. A aprovação real do handoff anterior cobre a versão anterior, não esta nova confirmação.

Para validar: recarregar a extensão e a página do HubSpot; aplicar preset completo, limpar campos, tentar valor inexistente e alternar Alt+W durante a execução. Conferir se as mensagens correspondem aos valores reais. O teste não exige salvar o ticket.

## Reversão

Cópia exata dos arquivos anteriores em [rollback-confirmacao-2026-09-17](rollback-confirmacao-2026-09-17/README.md). Ela inclui as correções anteriores já aprovadas, que ainda não estavam em commit. Não usar git restore para reverter esta melhoria.
