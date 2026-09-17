# Handoff do projeto — TicketAI v1.9

**Data:** 17/09/2026  
**Versão:** 1.9  
**Repositório:** https://github.com/M-LagaMBa/TicketAI  
**Commit de publicação:** `V 1.9`

## Estado atual

O TicketAI é uma extensão Manifest V3 para Edge e Chrome que automatiza a classificação de tickets no HubSpot por meio de presets. A versão 1.9 está implementada no código, documentada no README e empacotada para envio à Microsoft Store.

## Funcionalidades entregues

- Widget flutuante com arraste, redimensionamento, minimização e posição persistida.
- Presets legados e presets dinâmicos com campos configuráveis.
- Leitura da classificação atual no modal “Propriedades dependentes” do HubSpot.
- Criação, edição, duplicação, exclusão e seleção em lote de presets.
- Campos de texto, dropdown, pesquisa e seleção múltipla.
- Aplicação somente dos campos configurados no preset; o Proprietário do ticket permanece sob controle manual.
- Confirmação individual dos valores após o preenchimento.
- Feedback no card durante a aplicação; fecha após sucesso e permanece aberto em caso de falha.
- Proteção contra feedback preso quando a lista é reconstruída durante a aplicação.
- Sugestão de grupos existentes, normalização de grupo e prevenção de grupos duplicados por diferença de caixa ou espaços externos.
- Importação e exportação de backups JSON, com detecção de presets duplicados por nome e grupo e confirmação para substituir ou manter os atuais.
- Organização dos grupos na tela inicial por botões de subir/descer e arraste e solte.
- Destaque do grupo de origem, do destino e sombra acompanhando o arraste.
- Modo compacto com navegação por scroll e atalho `Alt + W`.
- Atalhos `Alt + Q` e `Esc`.

## Arquivos principais

- `manifest.json` — manifesto Manifest V3, permissões e versão 1.9.
- `background.js` — alternância do widget pelo ícone da extensão.
- `content.js` — interface, persistência local e automação HubSpot.
- `README.md` — documentação e histórico de versões.
- `icons/` — ícones 16, 32, 48 e 128 px.
- `tests/content.test.cjs` — testes automatizados da lógica de preenchimento, feedback, importação e cenários extremos.
- `reports/` — relatórios e handoffs do projeto.
- `TicketAI-v1.9-store.zip` — pacote com somente os arquivos necessários para a Microsoft Store.

## Validação realizada

- Sintaxe de `content.js`: aprovada.
- `git diff --check`: aprovado.
- Suíte automatizada: 31 testes aprovados.
- Reprodução no HubSpot real: aplicação do preset “E-mail em copia” concluída com confirmação dos campos.
- Fluxo real finalizado: ticket fechado após a aplicação do preset.
- Pacote da Store verificado com `manifest.json`, scripts e ícones na raiz esperada do ZIP.

## Como carregar localmente

1. Acesse `edge://extensions` ou `chrome://extensions`.
2. Ative o Modo do desenvolvedor.
3. Use “Carregar sem compactação” e selecione a pasta do projeto.
4. Fixe o ícone do TicketAI e abra um ticket HubSpot.

Para publicar na Microsoft Store, envie `TicketAI-v1.9-store.zip`. O arquivo contém `manifest.json`, `background.js`, `content.js` e `icons/`; arquivos de teste e documentação ficam fora do pacote de publicação.

## Persistência e compatibilidade

Os presets são armazenados em `chrome.storage.local`, junto com a ordem dos grupos. Eles não são sincronizados automaticamente entre navegadores, perfis ou usuários.

A automação depende de elementos e atributos do DOM do HubSpot, incluindo o modal “Propriedades dependentes”, `aria-owns`, `aria-controls`, títulos de opções e controles de dropdown. Mudanças no layout do HubSpot podem exigir ajustes nos localizadores de `content.js`.

## Próximos passos recomendados

1. Recarregar a extensão após a instalação do pacote 1.9.
2. Executar um smoke test em um ticket de homologação: abrir o modal, aplicar um preset dinâmico, confirmar os campos e salvar o status.
3. Validar a importação de um backup com duplicados nos dois caminhos: substituir e manter os atuais.
4. Monitorar mudanças do DOM do HubSpot e manter uma fixture de regressão para os dropdowns e portais.
5. Avaliar sincronização opcional de presets, identificadores estáveis de propriedades e cancelamento de aplicações longas em versões futuras.

## Reversão

Para voltar ao estado anterior, instale a versão anterior da extensão ou faça checkout do commit anterior à publicação `V 1.9`. Os presets existentes no armazenamento local devem ser exportados antes de qualquer troca de versão.
