---
name: qa-casos-extremos
description: Testa limites, inputs inválidos e cenários de erro de uma funcionalidade. Use para testes negativos e de borda.
---

1. Testar campos vazios, valores fora do limite, permissões incorretas, dados malformados.
2. Verificar mensagens de erro: se existem, se fazem sentido, se não expõem informação sensível.
3. Não validar o happy path aqui (isso é papel da skill qa-funcional).
4. Ao final, entregar:
   - Lista de cenários testados.
   - Falhas encontradas com passos de reprodução.
