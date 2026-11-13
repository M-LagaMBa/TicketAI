# TicketAI

Extensão para aplicar presets de classificação em tickets do HubSpot, com Pipeline e Status opcionais.

**Versão 2.4 · Manifest V3 · Microsoft Edge e Google Chrome**

Desenvolvido por [Lagamba Tech](https://m.lagamba.workers.dev/).

## Novidades da V 2.4

- Interface escura com destaque âmbar e telas próprias para opções, grupos e backups.
- Aplicação indicada apenas pela seta **↗**, com a descrição **Aplicar preset** ao passar o mouse, liberando espaço para o nome.
- Busca por nome ou grupo com destaque dos resultados, botão **×** para limpar e foco apenas na borda externa.
- Menu **⋯** em cada card para editar, duplicar ou excluir.
- Confirmação dentro do card: **Aplicando…**, **✓ Aplicado** por dois segundos ou **⚠ Conferir campos** com detalhes, nova tentativa e fechamento.
- Modo compacto com um preset por vez, largura de 320 px e altura ajustada ao conteúdo. Navegação pelas setas ou roda do mouse.
- Editor com rolagem interna, ações fixas e Pipeline/Status em seção expansível.
- Cabeçalho reduzido e rodapé centralizado: **Desenvolvido por Lagamba Tech**, com **V 2.4** logo abaixo.
- Redimensionamento pelas bordas e pelo canto inferior direito, sem ícone de setas no rodapé.

## Como usar

1. Abra um ticket no HubSpot e clique no ícone da extensão para abrir o TicketAI.
2. Busque o preset pelo nome ou grupo, se necessário.
3. Clique na seta **↗** ou na área de aplicação do card.
4. Confira o resultado e revise o ticket antes de salvar no HubSpot.

Quando configurados no preset, Pipeline e Status são ajustados e confirmados antes da classificação. Os campos de classificação são preenchidos no modal **Propriedades dependentes**. Se o preset não configura o workflow, abra esse modal pelo fluxo adequado do ticket antes de aplicar os campos.

**O salvamento final do ticket continua manual.** A confirmação indica que os valores foram preenchidos e conferidos, não que o ticket foi salvo.

### Estados da confirmação

| Estado | Comportamento |
|---|---|
| Aplicando… | Indicador discreto junto à ação; outras aplicações ficam bloqueadas durante o preenchimento. |
| ✓ Aplicado | Texto e superfície verde suave por dois segundos; depois, a seta reaparece. |
| ⚠ Conferir campos | Estado âmbar persistente. Clique para ver a contagem e os campos não confirmados. |
| Tentar novamente | Executa novamente o preset e confere os valores reais no HubSpot. |
| Fechar | Encerra a indicação de falha sem alterar os campos do ticket. |

**Esc** durante a aplicação cancela as próximas etapas. Alterações já realizadas são mantidas.

## Criar e editar presets

1. Clique em **Novo preset**, ou abra **⋯ → Editar** em um preset existente.
2. Informe nome e grupo. O campo Grupo sugere nomes existentes e permite criar um novo.
3. Use **Ler dados atuais** para importar Pipeline, Status e os campos disponíveis no ticket.
4. Revise os nomes e valores das propriedades. Adicione, remova ou desmarque campos conforme necessário.
5. Ative Pipeline e Status somente se o preset deve aplicá-los.
6. Clique em **Salvar preset**.

Campos desmarcados continuam disponíveis ao reabrir a edição. Um campo selecionado com valor vazio permite limpar a propriedade correspondente. A leitura da classificação depende dos campos disponíveis no modal **Propriedades dependentes**; sem ele, a leitura informa o que falta e pode aproveitar os dados de workflow disponíveis.

## Organizar presets e grupos

- **Grupos:** abra o botão ao lado da busca ou **Opções → Organizar grupos**. Reordene por arraste ou pelos botões de subir/descer e clique em **Concluir**. A ordem fica salva no navegador.
- **Duplicação:** use **⋯ → Duplicar**. A cópia recebe um sufixo numérico no nome.
- **Exclusão:** use o menu do card, **Opções → Selecionar presets** para apagar vários ou **Apagar todos**. As exclusões pedem confirmação e oferecem **Desfazer por 20 segundos**.
- **Posição e tamanho:** arraste o cabeçalho ou redimensione pelas bordas/canto. Em Opções, use **Restaurar posição e tamanho** quando necessário.

## Backup e restauração

Em **Opções → Exportar backup**, confira a prévia e clique em **Baixar JSON**. O arquivo preserva os campos dinâmicos e o workflow dos presets.

Em **Opções → Importar backup**, selecione um arquivo JSON ou cole seu conteúdo e clique em **Importar presets**. Backups legados continuam aceitos. Duplicados são identificados por nome e grupo; escolha **Manter atuais**, **Substituir** ou **Cancelar**.

## Atalhos

| Atalho | Ação |
|---|---|
| Alt + Q | Abre o widget ou alterna entre minimizado e expandido. |
| Alt + W | Ativa ou desativa o modo compacto. |
| Esc | Cancela as próximas etapas da aplicação; fora dela, fecha menus e diálogos. |

## Instalação e atualização local

1. Acesse `edge://extensions` ou `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta do projeto.
4. Fixe o ícone da extensão na barra do navegador.

Para atualizar uma instalação carregada desta pasta, clique em **Recarregar** na página de extensões e atualize a aba do HubSpot.

## Pacote para Microsoft Edge Add-ons

Pacote atual: [TicketAI-v2.4-store.zip](TicketAI-v2.4-store.zip). Envie o ZIP sem descompactar no fluxo de atualização da extensão no painel da Microsoft.

O pacote contém somente `manifest.json`, `background.js`, `content.js` e os quatro ícones de runtime. README, testes, relatórios e protótipos ficam fora do ZIP. A versão do manifesto é **2.4**. O pacote foi gerado e comparado ao código local; **a publicação na Microsoft não foi executada**.

Hashes e inventário: [PACOTE.json](reports/release-v2.4/PACOTE.json).

## Validação e limitações

A implementação da confirmação passou por **65 testes automatizados** e conferência no navegador local nos modos normal e compacto. Os ajustes posteriores da seta e do tooltip passaram por verificação de sintaxe e integridade do pacote; não houve nova conferência visual desses ajustes.

Comandos disponíveis:

```powershell
node --check content.js
node --check background.js
node --test --test-isolation=none tests/content.test.cjs
git diff --check
```

As verificações locais usam controles e armazenamento simulados; não substituem o teste da extensão instalada no HubSpot. O smoke test dessa versão no HubSpot, o download de backup, o arraste nativo e o ciclo do service worker ainda precisam de conferência específica. Evidências: [VALIDACAO.md](reports/release-v2.4/VALIDACAO.md).

A automação depende da estrutura do HubSpot. Mudanças nos controles ou no modal podem exigir ajustes. Presets alteram somente as propriedades configuradas; confirme os valores finais antes de salvar o ticket. Mantenha um backup JSON dos presets.

## Estrutura do projeto

```text
TicketAI/
├── manifest.json       # configuração e permissões
├── background.js       # abertura pelo ícone do navegador
├── content.js          # interface e automação
├── icons/              # ícones da extensão
├── tests/              # testes e ambiente local simulado
├── reports/            # evidências e inventário do pacote
├── HANDOFF.md          # contexto técnico de continuidade
├── README.md
└── TicketAI-v2.4-store.zip
```

## Histórico de versões

### V 2.4 — Interface e confirmação no card

Interface, busca com limpeza, aplicação por seta, confirmação de sucesso por dois segundos, detalhes e nova tentativa em falhas, modo compacto ajustado ao conteúdo e rodapé centralizado. Mantidas as funcionalidades de presets, workflow, grupos e backups.

### V 2.3 — Compatibilidade de Categoria

Presets antigos aplicam Categoria em seleção única, mantendo compatibilidade com controles múltiplos. A leitura e a confirmação reconhecem os valores UITag. Valores múltiplos incompatíveis com um campo simples são reportados como não confirmados.

### V 2.2 — Compatibilidade de Status

Reconhecimento das opções de Status no dropdown vinculado, preservação do nome completo da Pipeline e confirmação do Status no modal antes da classificação. Presets importados com Pipeline truncada precisam ser corrigidos ou lidos novamente.

### V 2.1 — Ajustes de interface

Adicionado

🔗 O crédito “Lagamba Tech” no rodapé agora leva ao site https://m.lagamba.workers.dev/ em uma nova aba.

Corrigido

📐 A barra de ações do modo de seleção se adapta a widgets estreitos, evitando sobreposição dos botões “Selecionar tudo”, “Apagar” e “Cancelar”.

### V 2.0 — Encerramento e leitura unificada

Adicionado

🔁 Workflow opcional por preset — cada preset pode guardar a Pipeline e o Status do ticket, além dos campos de classificação. Ao aplicar, o TicketAI ajusta primeiro o workflow e só então preenche a classificação. Presets antigos continuam compatíveis.

📥 Leitura única — o botão “Ler dados atuais” importa Pipeline, Status e classificação de uma vez. Se o modal “Propriedades dependentes” não estiver aberto, a leitura preserva Pipeline e Status e informa o passo restante.

🎯 Prioridade do Status correto — com o modal “Propriedades dependentes” aberto, o Status salvo no preset vem do próprio modal (por exemplo, “Fechado”), que é o valor que habilitou a classificação.

🪟 Compatibilidade com “Exibir” — a extensão localiza Pipeline e Status exclusivamente no cartão “Destaques de Ticket”, evitando confundir esses campos com os filtros da lista.

⎋ Cancelamento por Esc — durante a aplicação de um preset, Esc interrompe silenciosamente as próximas etapas. Alterações já realizadas não são revertidas e o card não mantém sinalização de progresso.

🔴 Erro destacado — se qualquer etapa não for confirmada, o card preserva a mensagem do campo com falha e recebe contorno vermelho até uma nova aplicação.

Corrigido

🐛 A alteração de Pipeline/Status agora aguarda a confirmação do modal do HubSpot antes de seguir para a classificação, sem exigir o salvamento manual naquele instante.

🐛 A leitura e a aplicação no modo “Exibir” deixaram de interagir com filtros de Pipeline e Status da lista de tickets.

🐛 A importação de backups v2 agora preserva o workflow de cada preset, incluindo Pipeline e Status. Ao importar um arquivo com presets duplicados, a opção “Substituir” atualiza os existentes com esses valores.

### V 1.9 — Grupos reutilizáveis

Adicionado

📂 O campo Grupo sugere os grupos já utilizados nos presets e permite criar um novo grupo digitando seu nome.

🧭 A comparação ignora diferenças de maiúsculas, minúsculas e espaços nas bordas, reutilizando o nome já cadastrado para evitar grupos duplicados.

📦 Na importação de backups, presets com o mesmo nome e grupo são identificados antes de salvar. O usuário pode substituir os existentes ou mantê-los e importar somente os novos.

↕️ Na tela inicial, o modo "Organizar grupos" permite mover um grupo para cima ou para baixo com os botões de chevron, ou posicioná-lo diretamente sobre outro grupo com arraste e solte. A ordem fica salva no navegador e é preservada ao reabrir o widget.

🎨 O grupo de origem e o grupo de destino recebem destaque durante o arraste para deixar claro onde a troca será feita; os cards de presets ficam protegidos contra cliques acidentais enquanto a organização está ativa.

🧹 Ao concluir uma aplicação com sucesso, o feedback de confirmação é encerrado mesmo que a lista seja reconstruída durante o processo (por exemplo, ao abrir a organização de grupos). Em caso de erro, o painel continua disponível para conferência.

### V 1.8 — Confirmação do preenchimento

Adicionado

✅ Confirmação do valor exibido no Hubspot após cada campo ser preenchido, com resultado individual por propriedade.

✅ Feedback de aplicação no card: permanece aberto durante o preenchimento, fecha automaticamente quando tudo é confirmado e permanece aberto quando há falha.

✅ Resumo de confirmações no modo compacto, com detalhes disponíveis ao expandir o widget.

Corrigido

🐛 Removida a limpeza automática de campos omitidos pelo preset, que podia interferir em propriedades dinâmicas da conta. O preset volta a alterar somente os campos configurados; o campo Proprietário do ticket permanece sob controle manual.

🐛 Campos de seleção múltipla são identificados pela presença de checkboxes, inclusive propriedades cujo nome não contém “Categoria”.

🧪 A v1.8 foi validada com 7 testes funcionais automatizados após a remoção da limpeza automática.

### V 1.7 — Presets dinâmicos e leitura da classificação do Hubspot

Adicionado

🔍 Leitura da classificação atual — o TicketAI lê os campos presentes no modal "Propriedades dependentes" e importa os valores atualmente preenchidos.

🧩 Presets com estrutura dinâmica — os presets passam a trabalhar com uma lista de campos, em vez de depender exclusivamente de um conjunto fixo de propriedades.

✏️ Campos editáveis — após importar a classificação, o usuário pode alterar os valores antes de salvar.

☑️ Seleção individual de campos — cada propriedade pode ser incluída ou desmarcada do preset.

🗑️ Remoção de campos — campos desnecessários podem ser retirados do preset antes do salvamento.

➕ Adição de campos — o formulário permite acrescentar propriedades ao preset quando necessário.

⬜ Campos sem valor — um campo selecionado pode permanecer vazio de forma intencional.

🧾 Novo fluxo de criação de preset — o formulário de "Novo Preset" concentra a leitura e a revisão da classificação em um único lugar.

🎨 Novo design do formulário — organização em etapas: Informações → Origem do preset → Campos, seguindo a identidade visual do TicketAI.

📦 Nova estrutura de exportação/importação — presets dinâmicos passam a preservar os campos configurados no backup JSON.

Corrigido

🐛 Removido o atalho Ctrl+N, que conflitava com o comportamento padrão do navegador.

🐛 Ajustados os avisos e confirmações para permanecerem centralizados dentro do widget.

🐛 Ajustes de estabilidade no cabeçalho após a remoção do botão visual de modo compacto.

A v1.7 foi testada localmente após a implementação do novo fluxo de presets e, até o momento, não foram identificados bugs durante os testes realizados.

### V 1.6 — Correção de seleção, ícone da extensão e ajuda rápida

Corrigido

🐛 Presets com o valor "Dúvida" na Categoria não marcavam o campo corretamente, mesmo com outros valores (ex: "Indevido", "Solicitação de serviço") funcionando normalmente. Causa: a busca pela opção a clicar vasculhava a página inteira, e "Dúvida" coincidia com outro elemento qualquer do Hubspot com o mesmo texto, clicando no lugar errado. A busca agora é restrita ao container da lista realmente aberta no momento.

🐛 Clicar no ícone da extensão na barra de ferramentas nem sempre abria o widget. O background.js agora garante que o content.js está carregado na página antes de mandar o comando de abrir, em vez de só tentar como reação a uma falha de mensagem.

🔒 Removida a permissão activeTab do manifest.json — não é aceita pela Microsoft Store, e era redundante já que a extensão usa host_permissions fixo para o domínio do Hubspot.

Adicionado

❓ Ícone de ajuda ("?") no cabeçalho, ao lado dos controles do widget, com um resumo dos atalhos de teclado disponíveis (Alt+Q, Alt+W, Esc). Fecha clicando fora ou pressionando Esc.

Otimizado

⚡ Removidas as pausas fixas entre os campos do preenchimento (Descrição → Produto → Categoria → Assunto). Antes, cada transição esperava um tempo cego (200-300ms) na esperança de que o próximo campo já tivesse aparecido; agora cada etapa espera só o campo dela realmente existir (waitFor), com um teto de segurança generoso (até 2s) para não falhar em conexões ou computadores mais lentos.

⚡ Detecção do campo de múltipla seleção (Categoria) trocada de "pausa fixa + checagem única" para espera ativa até o container realmente existir — mais rápido no caso comum, e mais confiável em conexões lentas (o valor fixo anterior podia ser curto demais nesses casos).

⚡ Removida a pausa fixa de 400ms após digitar no campo de busca do Assunto — a etapa seguinte já espera pela opção certa aparecer, tornando essa pausa redundante.

⚡ Delay fixo por checkbox ao limpar a Categoria (120ms) trocado por confirmação ativa de que o checkbox realmente desmarcou, com teto de segurança de 300ms.

🔍 Adicionado log opcional de tempo de cada etapa do preenchimento no console do navegador (F12), para ajudar a calibrar os tempos com dados reais do ambiente de cada usuário. Pode ser desligado trocando TA_DEBUG_TIMING para false no início do content.js.

Nenhum comportamento de preenchimento foi alterado — só a forma de esperar entre uma etapa e outra, que passou de "tempo fixo" para "até a etapa seguinte realmente estar pronta".

### V 1.5 — Estabilidade em segundo plano e posição do widget

Corrigido

🐛 O widget podia mudar de posição sozinho ao ativar ou desativar o modo compacto (o ajuste automático da v1.3 para evitar sobrepor a barra do Hubspot ficava "preso" depois, deslocando o widget permanentemente). Removido de vez: a posição agora só muda se o usuário arrastar o widget manualmente, em qualquer modo (normal, minimizado ou compacto).

🐛 O preenchimento de um preset travava por completo se o usuário trocasse de aba do navegador durante o processo, retomando só quando voltava para a aba do Hubspot. Causa: a barra de progresso usava requestAnimationFrame, que o navegador pausa totalmente quando a aba não está visível, e o preenchimento ficava esperando essa animação terminar antes de seguir para o próximo campo. A barra passou a usar transition de CSS, sem depender de requestAnimationFrame, e o preenchimento não espera mais por ela — agora continua rodando normalmente mesmo com a aba do Hubspot em segundo plano.

### V 1.4 — Primeiro ajuste de posição do modo compacto

Corrigido

🐛 No modo compacto, se o widget estivesse posicionado muito perto do topo da página, ele podia ficar por cima da barra de navegação do Hubspot. Adicionado um ajuste automático: ao entrar no modo compacto nessa situação, o widget era empurrado um pouco para baixo, guardando a posição original para restaurar exatamente ao sair do modo compacto.

Esse ajuste automático ainda causava uma mudança de posição perceptível durante o modo compacto (mesmo restaurando depois). Foi substituído por uma solução mais direta na v1.5 — ver abaixo.

### V 1.3 — Confirmações, estabilidade e novos atalhos

Corrigido

🐛 Diálogos de confirmação e aviso (confirm/alert nativos do navegador) substituídos por um modal próprio do TicketAI. Os diálogos nativos apareciam por cima da página do Hubspot, fora do controle visual da extensão.

🐛 Ajuste definitivo na limpeza do campo Categoria ao trocar de preset (técnica mais confiável de atualização do campo, via evento nativo do navegador).

🐛 O formulário de novo/editar preset podia cobrir o cabeçalho do widget quando a janela estava pequena, dificultando fechar ou minimizar com o formulário aberto. O cabeçalho agora fica sempre acessível.

🐛 Cabeçalho e rodapé do widget reduzidos, evitando que o modo compacto sobreponha a barra de navegação do Hubspot.

🐛 O modo compacto agora reposiciona o widget automaticamente se ele estiver muito colado ao topo da página.

🐛 A faixa de redimensionamento lateral podia atrapalhar o clique na barra de rolagem da lista; ajustado o espaço reservado para cada uma.

🐛 Barra de progresso do preenchimento passou a animar de forma contínua durante o preenchimento, em vez de saltar em blocos.

Adicionado

🔢 Contador de presets por grupo (ex: "Cadastro · 3") e contador total de presets cadastrados, ambos atualizados automaticamente.

➕ Estado de busca sem resultados agora oferece um botão para criar um novo preset direto.

❌ Botão de fechar (X) adicionado ao formulário de novo/editar preset.

⌨️ Novo atalho Alt+W para abrir/fechar o modo compacto.

⎋ Menu de opções (engrenagem) agora também fecha pressionando Esc, além de clicar fora ou no botão de fechar.

🎨 Ícone oficial da extensão e logo em SVG (pasta logo/ e icons/), prontos para uso na barra de ferramentas do navegador.

### V 1.2 — Ajustes de UX e novas funcionalidades

Corrigido

🐛 Campo de busca perdia o foco a cada letra digitada. A busca agora só atualiza a lista, sem recriar o campo de texto.

🐛 Categoria ainda não limpava a seleção anterior corretamente (ajuste definitivo).

🐛 Seta de redimensionar aparecia por cima do menu de opções perto da borda do widget.

🐛 Botão "+ Novo Preset" ficava desproporcional em widgets redimensionados para tamanhos grandes.

🐛 Espaçamento entre "Desenvolvido por" e "Lagamba Tech" ajustado ao padrão do Widgetize.

🐛 Barra de rolagem lateral não era clicável (só disparava redimensionamento). Faixas de borda reduzidas de 15px para 6px.

🐛 Botões do menu de opções fora do padrão de tamanho do Widgetize, ajustados.

Adicionado

🔍 Destaque do termo buscado nos resultados da busca.

✏️ Ícones de editar, duplicar e apagar em cada preset, com legenda ao passar o mouse. Duplicar gera nome automático (ex: "Retransmissão" → "Retransmissão (1)").

🟢 Barra de progresso discreta no card durante o preenchimento, substituindo a mensagem de texto "Preenchido".

⚙️ Menu de opções com auto-fechamento (mesmo comportamento do Widgetize), mais as opções "Selecionar Presets" (lote) e "Apagar Tudo", ambas com confirmação e undo de 20s.

🗑️ Tela separada de "Gerenciar Presets" removida — tudo acontece direto na tela principal.

➕ Botão "+" ao lado da busca para criar preset sem abrir o menu de opções.

⌨️ Atalhos Alt+Q (abrir/minimizar/maximizar) e Ctrl+N (novo preset).

🏷️ Versão da extensão exibida no rodapé, abaixo de "Lagamba Tech".

📎 Modo compacto: mostra um preset por vez, navegação por scroll do mouse, rodapé oculto para ocupar menos espaço.

### V 1.1 — Correções de automação

🐛 Automação buscava campos em toda a página, podendo confundir com campos de mesmo nome escondidos atrás do modal. Restringida à área do modal "Propriedades dependentes".

🐛 Cliques simulados passaram a disparar a sequência completa de eventos de mouse (pointerdown → mousedown → pointerup → mouseup → click), já que alguns componentes do Hubspot não reagem a um .click() isolado.

🐛 Campo Categoria (múltipla seleção) não limpava a seleção anterior ao trocar de preset. Corrigido via alteração direta do checked do checkbox + evento change.

🐛 Espera desnecessária de até 1.5s em todo campo, deixando o preenchimento lento. Agora só ocorre quando o campo é explicitamente marcado como múltipla seleção.

### V 1.0 — Primeira versão funcional

Widget flutuante injetado na página do Hubspot, no mesmo padrão visual do Widgetize: arrastável, redimensionável nas 4 bordas, minimizável, com posição e tamanho salvos entre recarregamentos.

Cadastro de presets com 6 campos: Nome, Grupo, Descrição, Produto, Categoria, Assunto.

Tela de uso com busca + lista de presets agrupados por categoria.

Tela separada de "Gerenciar Presets": criar, editar, apagar.

Automação localizando os campos do modal "Propriedades dependentes" pelo rótulo visível, preenchendo na ordem Descrição → Produto → Categoria → Assunto.

Undo de 20s ao apagar um preset.

Exportar/Importar em JSON.

Feedback simples de "Preenchido" ao concluir.
