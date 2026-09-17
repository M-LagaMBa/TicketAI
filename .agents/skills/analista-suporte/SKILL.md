---
name: analista-suporte
description: Transforma o relato de um usuário em um ticket estruturado para o time de dev, no padrão de tickets do Cilia. Use quando o pedido for para abrir, redigir ou formalizar um ticket a partir de um relato de erro.
---

1. Preservar o texto original do usuário no campo de problema, sem reescrever o relato.
2. Classificar como bug ou melhoria e montar o ticket no formato correspondente:

   Bug:
   - Título: [SEGURADORA] descrição curta
   - Problema: texto original do usuário, preservando bullets
   - Seguradora / Sinistro / Orçamento / ID Sinistro (quando aplicável)
   - Ação esperada: comportamento correto do sistema, não uma tarefa de dev

   Melhoria:
   - Título: escopo da proposta
   - Problema/Oportunidade: resumo contextualizado da limitação atual
   - Descrição: impacto, comportamento atual, comportamento esperado ao final

3. Não assinar o ticket como responsável.
4. Ao final, entregar o ticket pronto para a skill dev-implementacao ou dev-debug assumir.
