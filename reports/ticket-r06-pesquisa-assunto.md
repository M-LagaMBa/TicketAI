# R06 — Regressão da pesquisa no HubSpot real

**Título:** [TicketAI] Pesquisa de Assunto não alcança o campo Pesquisar do portal

**Problema (relato original do QA):** No HubSpot, a caixa “Pesquisar” fica fora da lista de opções, mas dentro do mesmo painel do dropdown. A correção atual não alcança essa caixa.

**Seguradora / Sinistro / Orçamento / ID Sinistro:** Não se aplica.

**Ação esperada:** Ao aplicar um Assunto, a extensão deve digitar o valor no campo de pesquisa do dropdown correspondente e selecionar o resultado, sem interagir com buscas de outros campos.

## Dev-debug

**Reprodução:** Aplicar o preset de referência no Edge com o modal Propriedades dependentes aberto. Assunto leva aproximadamente 2,4 segundos; abrir Assunto e inspecionar a posição do input Pesquisar no DOM.

**Evidências:** No portal apontado por aria-owns, `searchInPortal=true`, `searchInSelect=false` e `searchInMenu=false`. A opção de referência foi selecionada por já estar disponível; isso não comprova que a busca funcionou.

**Causa raiz:** A alteração de escopo em fillSearchField procurava o input apenas dentro de .Select-menu ou de seu ancestral .Select. No DOM real, o input é irmão dessa estrutura dentro do portal.

**Hipóteses descartadas:** Permissão ou ausência de dropdown: a lista foi aberta e a opção selecionada. Lentidão de rede não explica a ausência estrutural do input nos seletores usados.

**Sugestão:** Procurar o input no contêiner apontado por aria-owns/aria-controls do próprio botão, mantendo o isolamento entre campos. Acrescentar teste com input fora da lista.

## Dev-correcao

**Patch:** helper findDropdownSearchInput consulta apenas contêineres explicitamente vinculados ao botão e, para estrutura local, o Select correspondente.

**Explicação:** Restaura o preenchimento da busca sem reintroduzir consulta global a inputs.

**Teste de regressão:** Portal contém o menu e um input de pesquisa irmão; o preset deve preencher esse input e selecionar a opção.

**Validação:** Resultados de revisão e QA após o patch registrados no relatório da rodada.
