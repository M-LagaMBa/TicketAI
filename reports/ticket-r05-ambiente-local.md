# R05 — Bug no ambiente local de QA

**Título:** [TicketAI / QA] Simulador fecha dropdown ao iniciar um preset

**Problema (relato original do QA):** A limpeza da categoria falhou na página de teste.

**Seguradora / Sinistro / Orçamento / ID Sinistro:** Não se aplica.

**Ação esperada:** O ambiente de teste deve manter aberta a lista que o preset está preenchendo, permitindo observar a seleção ou limpeza.

## Dev-debug

**Reprodução:** Abrir a página local, criar/aplicar um preset de descrição e clicar em Limpar campos. A descrição fica vazia, a categoria permanece Solicitação de serviço e o card informa falha em Categoria.

**Evidências:** Log de preenchimento leva aproximadamente 1,6 segundo, compatível com timeout de 1,5 segundo aguardando lista. Abrir Categoria manualmente mostra lista visível com checkbox selecionado; a lista tem dimensões e visibility: visible. Os testes isolados com a mesma associação aria-owns passaram.

**Hipóteses:** Nome do campo incorreto e lista permanentemente oculta descartados pela inspeção do DOM e abertura manual. A hipótese de defeito da limpeza de checkbox não explica o timeout antes de localizar a lista.

**Causa identificada no simulador:** O listener global de clique fecha menus para qualquer clique fora de .Select e de [data-dropdown]. O clique original do card também satisfaz essa condição. A execução assíncrona pode abrir a lista antes de o evento alcançar esse listener, fechando-a imediatamente.

**Sugestão de correção:** Excluir cliques originados no widget da regra de fechamento do simulador. Não alterar o código de produção com base nesse cenário artificial.

## Dev-correcao

**Patch:** tests/fixture.js exclui #ticketai-widget do listener de fechamento externo.

**Explicação:** Impede que o simulador cancele a ação que acaba de iniciar. O clique final em document.body continua fechando a lista.

**Validação:** Repetir o cenário de limpeza no navegador e os testes funcionais após reaprovação pelo reviewer. Resultado registrado no relatório da rodada.

## Dev-reviewer

**Veredito:** Aprovado para repetir QA funcional. Correção restrita ao simulador; nenhum código de produção foi alterado por R05.

**Achados por severidade:** Nenhum achado bloqueante ou importante no patch do simulador. A integração com React real permanece fora do alcance desse ambiente.
