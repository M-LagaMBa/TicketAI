# Handoff — TicketAI v1.9

**Status:** versão implementada, validada e preparada para publicação.
**Commit de referência:** `V 1.9`
**Repositório:** https://github.com/M-LagaMBa/TicketAI

## Visão geral

O TicketAI é uma extensão Manifest V3 para Edge e Chrome que automatiza a classificação de tickets no HubSpot por meio de presets. O preenchimento ocorre pela interface do HubSpot, sem API do HubSpot e sem API da OpenAI.

## Entregas da v1.9

- Presets legados e presets dinâmicos com campos configuráveis.
- Leitura da classificação atual no modal “Propriedades dependentes”.
- Aplicação de campos de texto, dropdown, pesquisa e seleção múltipla.
- Confirmação individual dos valores após cada preenchimento.
- Feedback que fecha após sucesso e permanece aberto em caso de falha, inclusive quando a lista é reconstruída durante a aplicação.
- Sugestão de grupos existentes e prevenção de grupos duplicados.
- Importação e exportação JSON com detecção de duplicados por nome e grupo.
- Organização de grupos por setas e arraste e solte, com destaque de origem, destino e sombra durante o movimento.
- Widget flutuante, modo compacto, busca, seleção em lote, desfazer exclusão e atalhos `Alt + Q`, `Alt + W` e `Esc`.

## Arquivos e validação

- `manifest.json`, `background.js`, `content.js` e `icons/` formam o pacote da extensão.
- `README.md` contém a documentação completa e o histórico de versões.
- `tests/` contém a fixture e os testes automatizados.
- `reports/HANDOFF-v1.9-2026-09-17.md` contém o handoff detalhado, limitações e próximos passos.
- `TicketAI-v1.9-store.zip` contém somente os arquivos necessários para a Microsoft Store.
- Sintaxe JavaScript, `git diff --check` e 31 testes automatizados foram aprovados.
- O fluxo foi validado no HubSpot real com aplicação do preset “E-mail em copia” e fechamento do ticket.

## Instalação e publicação

Para desenvolvimento, carregue a pasta do projeto em `edge://extensions` ou `chrome://extensions` usando “Carregar sem compactação”.

Para a Microsoft Store, envie `TicketAI-v1.9-store.zip` e recarregue a extensão após a instalação.

## Compatibilidade e limites

A automação depende do DOM atual do HubSpot, incluindo o modal “Propriedades dependentes”, atributos `aria-owns`/`aria-controls` e estruturas de dropdown. Alterações no layout podem exigir revisão dos localizadores em `content.js`.

Os presets e a ordem dos grupos ficam em `chrome.storage.local`; não há sincronização automática entre perfis ou dispositivos.

O planejamento inicial da solução permanece disponível em [`docs/PLANEJAMENTO_INICIAL.md`](docs/PLANEJAMENTO_INICIAL.md).

## Próximos passos

1. Publicar o ZIP na Microsoft Store.
2. Executar um smoke test em um ticket de homologação após a instalação.
3. Monitorar mudanças do DOM do HubSpot.
4. Avaliar sincronização opcional, identificadores estáveis de propriedades e cancelamento de aplicações longas em versões futuras.
