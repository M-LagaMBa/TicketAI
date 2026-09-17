# R07 — Feedback permanece em Aplicando após alternar o modo

## Analista-suporte

- **Tipo:** bug.
- **Título:** [TicketAI] Resultado não atualiza ao alternar o modo durante o preenchimento.
- **Problema (relato do QA):** “Ao alternar para o modo compacto durante o preenchimento, os campos eram atualizados e o card continuava mostrando ‘Aplicando…’.”
- **Seguradora / Sinistro / Orçamento / ID Sinistro:** não se aplica; fixture local.
- **Ação esperada:** o card visível deve exibir o resultado final mesmo após alternar o modo durante a aplicação.

## Dev-debug

- **Reprodução:** aplicar Limpar campos e imediatamente pressionar Alt+W. A descrição e a categoria ficam vazias, mas o resumo continua em Aplicando.
- **Causa raiz:** renderList recria o card ao alternar o modo. A operação assíncrona mantém a referência ao card removido e escreve o resultado nele. O cache recebe o resultado final, porém o novo card não é atualizado.
- **Hipótese descartada:** travamento do preenchimento; os valores finais aparecem corretamente nos controles e o dropdown fecha.
- **Sugestão:** resolver o card atual pelo ID dentro do widget ao atualizar o feedback e acrescentar teste de reconstrução durante a aplicação.
- Nenhuma alteração de produção foi feita na etapa de diagnóstico.

## Dev-correcao

- **Patch:** showFieldResults resolve o card atual pelo ID dentro do widget antes de atualizar o resultado.
- **Explicação:** o resultado passa a alcançar o elemento visível após busca ou alternância de modo, mantendo o cache da última aplicação.
- **Validação:** teste de regressão que substitui o card durante a aplicação; 29 testes aprovados após nova revisão; reteste visual alternando Alt+W durante execução resultou em 4/4 confirmados.
- **Estado:** corrigido e retestado localmente.
