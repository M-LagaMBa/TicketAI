# Validação do TicketAI

Requer Node.js com suporte a `node:test` (usado nesta rodada: Node 24). Não requer dependências npm.

Na raiz do projeto:

```powershell
node --test tests/content.test.cjs
node tests/serve-fixture.cjs
```

O segundo comando serve apenas três arquivos conhecidos em `http://127.0.0.1:4177/`. Encerre com Ctrl+C.

## Pipeline

Após aprovação do dev-reviewer, execute cada conjunto em ordem:

```powershell
node --test --test-name-pattern=funcional tests/content.test.cjs
node --test --test-name-pattern=regressao tests/content.test.cjs
node --test --test-name-pattern=extremos tests/content.test.cjs
```

Os testes isolados executam funções de produção em Node VM com DOM e relógio simulados. A exposição das funções é feita somente na cópia em memória do teste; a extensão não expõe uma API adicional.

## Interface local

A página local carrega o `content.js` real com uma implementação simulada de `chrome.storage.local` e controles semelhantes aos inspecionados no HubSpot. Os dados ficam em localStorage dessa origem sob a chave `ticketai-test`, separados dos presets reais da extensão.

Checklist manual:

1. Novo Preset → remover campos padrão → Adicionar campo → nome Descrição do ticket → informar valor → salvar → aplicar. O texto deve mudar.
2. Usar grupo constructor, toString ou __proto__. A lista deve continuar renderizando.
3. Aplicar Limpar campos. Descrição e categoria devem ficar vazias.
4. Aplicar Preset legado. Esperado: Texto legado / Cilia Web / Dúvida / Cadastro.
5. Duplicar um preset, editar a cópia e confirmar que o original foi preservado.
6. Buscar pelo nome e alternar Alt+W. A lista deve filtrar e o modo compacto deve exibir um card.
7. Adicionar campo sem nome e salvar. O formulário deve mostrar um aviso e preservar os dados.
8. Ler classificação atual → salvar → alterar descrição → aplicar preset. Os valores salvos devem ser restaurados.
9. O contador Elemento externo — cliques deve permanecer em zero.

## Limites

O simulador não reproduz os componentes React, permissões e contexto isolado de uma extensão real. Aprovação local não substitui a execução com a extensão recarregada no Edge/Chrome e um ticket de teste no HubSpot.
