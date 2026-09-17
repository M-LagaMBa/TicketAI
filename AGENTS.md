# Fluxo de trabalho do projeto

Este projeto usa um pipeline de papéis, cada um implementado como uma skill em `.agents/skills/`. Siga a ordem abaixo e só pule uma etapa se o usuário pedir explicitamente.

## Papéis e ordem de execução

1. **dev-implementacao** — implementa a funcionalidade ou correção solicitada.
2. **dev-reviewer** — revisa o que foi implementado.
   - Se reprovado: volta para **dev-implementacao** com a lista de achados, não segue adiante.
   - Se aprovado: segue para a etapa 3.
3. **qa-funcional** — testa o fluxo principal (happy path).
4. **qa-regressao** — testa se nada que já funcionava quebrou.
5. **qa-casos-extremos** — testa limites, inputs inválidos e cenários de erro.
   - Se qualquer QA (3, 4 ou 5) encontrar um problema: aciona **analista-suporte** para formalizar o achado como ticket, depois segue para a etapa 7.
   - Se os três QAs aprovarem: segue para a etapa 6.
6. **usuario-simulado** — simula o uso real da aplicação já testada, do ponto de vista de um usuário leigo a experiente.
   - Se o usuário simulado perceber um problema: aciona **analista-suporte**, depois segue para a etapa 7.
   - Se não houver problema: pipeline concluído.
7. **analista-suporte** — transforma o relato (do QA ou do usuário) em um ticket estruturado.
8. **dev-debug** — investiga a causa raiz a partir do ticket, sem corrigir.
9. **dev-correcao** — aplica a correção com base no diagnóstico do dev-debug.
   - Depois da correção: volta para **dev-reviewer** (etapa 2) para revalidar.

## Regras gerais

- Cada skill entrega sua saída no formato descrito no próprio SKILL.md; não pule o formato de saída esperado.
- Não avance de etapa sem o veredito da etapa anterior (por exemplo, não rodar QA sem o dev-reviewer ter aprovado).
- Se o usuário pedir uma etapa isolada (ex: "só revisa esse código"), execute só a skill pedida, sem disparar o pipeline inteiro.
- Ao final de cada rodada completa do pipeline, resumir em poucas linhas: o que foi feito, o que foi encontrado, e em que etapa o pipeline parou ou terminou.
