<div align="center">

🎫 TicketAI

Classificação automática de tickets no Hubspot, a partir de presets

Manifest V3 · Edge / Chrome · v1.9

Desenvolvido por Lagamba Tech

</div>

✨ O que é

O TicketAI é uma extensão de navegador que elimina o preenchimento manual e repetitivo da classificação de tickets no Hubspot. Em vez de abrir Produto, Categoria e Assunto um por um toda vez, você cadastra um preset uma única vez e, depois, é só um clique.

A partir da v1.7, o cadastro de presets também pode aproveitar a classificação que já está preenchida no Hubspot: o TicketAI lê o modal "Propriedades dependentes", importa os campos encontrados e permite revisar, editar, selecionar ou remover o que será salvo no preset.

Antes:  abrir Produto → escolher → abrir Categoria → escolher → abrir Assunto → buscar → escolher
Agora:  clicar no preset

Para criar um preset:
Ler classificação atual → revisar campos → editar valores → salvar

🚀 Como usar

Abra um ticket no Hubspot e mude o Status para Fechado, até aparecer o modal "Propriedades dependentes".

Clique no ícone do TicketAI para abrir o widget.

Clique no preset correspondente ao caso.

A extensão preenche os campos configurados no preset, respeitando a ordem e as dependências do Hubspot.

Para criar um preset, clique em + Novo Preset.

No formulário, clique em Ler classificação atual para importar os campos e valores atualmente preenchidos no Hubspot.

Revise a classificação: selecione/desmarque campos, edite os valores ou remova campos que não devem fazer parte do preset.

Clique em Salvar.

⌨️ Atalhos de teclado

Atalho

Ação

Alt + Q

Abre o widget (se não existir) ou alterna minimizado ⇄ maximizado

Alt + W

Abre/fecha o modo compacto

Esc

Fecha menus, diálogos e elementos auxiliares abertos

🖱️ Funcionalidades

🗂️ Presets completos — Nome, Grupo e campos de classificação configuráveis, preenchidos de uma vez.

🔍 Leitura da classificação atual — importa os campos e valores já preenchidos no modal "Propriedades dependentes" do Hubspot.

✏️ Presets editáveis — os valores importados podem ser alterados antes de salvar o preset.

☑️ Seleção de campos — escolha quais campos serão aplicados pelo preset.

🗑️ Remoção de campos — retire campos que não devem fazer parte do preset.

➕ Adição de campos — permite acrescentar campos ao preset quando necessário.

⬜ Valores vazios — um campo pode permanecer selecionado mesmo sem valor, permitindo aplicar a propriedade vazia.

🔍 Busca com destaque — filtra por nome ou grupo, com o termo buscado realçado nos resultados.

✏️ Editar, duplicar e apagar — direto no card de cada preset, sem tela separada.

🧾 Seleção em lote — apague vários presets de uma vez, ou tudo, sempre com confirmação.

↩️ Desfazer exclusão — 20 segundos para reverter qualquer apagar.

📦 Exportar / Importar — backup dos presets em JSON, incluindo a nova estrutura dinâmica de campos.

🖥️ Widget flutuante — arrasta, redimensiona e minimiza, com posição salva entre recarregamentos.

📎 Modo compacto — mostra um preset por vez, navegação por scroll do mouse e atalho Alt+W.

🟢 Feedback visual — barra de progresso discreta no card durante o preenchimento, com destaque de conclusão.

🗂️ Organização de grupos — reordene os grupos na tela inicial usando os controles de subir/descer ou arraste e solte.

🖱️ Arraste com indicação visual — o grupo em movimento recebe destaque e uma sombra acompanha o ponteiro até o destino.

📁 Estrutura de arquivos

ticketai/
├── manifest.json     → configuração da extensão (Manifest V3)
├── background.js     → abre/fecha o widget ao clicar no ícone
├── content.js        → widget (interface) + automação de preenchimento
├── README.md
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png

🧩 Como carregar (modo desenvolvedor)

Acesse edge://extensions (ou chrome://extensions).

Ative o Modo do desenvolvedor.

Clique em Carregar sem compactação e selecione a pasta do projeto.

Fixe o ícone na barra de ferramentas.

📜 Histórico de versões

v1.0 — Primeira versão funcional

Widget flutuante injetado na página do Hubspot, no mesmo padrão visual do Widgetize: arrastável, redimensionável nas 4 bordas, minimizável, com posição e tamanho salvos entre recarregamentos.

Cadastro de presets com 6 campos: Nome, Grupo, Descrição, Produto, Categoria, Assunto.

Tela de uso com busca + lista de presets agrupados por categoria.

Tela separada de "Gerenciar Presets": criar, editar, apagar.

Automação localizando os campos do modal "Propriedades dependentes" pelo rótulo visível, preenchendo na ordem Descrição → Produto → Categoria → Assunto.

Undo de 20s ao apagar um preset.

Exportar/Importar em JSON.

Feedback simples de "Preenchido" ao concluir.

v1.1 — Correções de automação

🐛 Automação buscava campos em toda a página, podendo confundir com campos de mesmo nome escondidos atrás do modal. Restringida à área do modal "Propriedades dependentes".

🐛 Cliques simulados passaram a disparar a sequência completa de eventos de mouse (pointerdown → mousedown → pointerup → mouseup → click), já que alguns componentes do Hubspot não reagem a um .click() isolado.

🐛 Campo Categoria (múltipla seleção) não limpava a seleção anterior ao trocar de preset. Corrigido via alteração direta do checked do checkbox + evento change.

🐛 Espera desnecessária de até 1.5s em todo campo, deixando o preenchimento lento. Agora só ocorre quando o campo é explicitamente marcado como múltipla seleção.

v1.2 — Ajustes de UX e novas funcionalidades

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

v1.3 — Confirmações, estabilidade e novos atalhos

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

v1.4 — Primeiro ajuste de posição do modo compacto

Corrigido

🐛 No modo compacto, se o widget estivesse posicionado muito perto do topo da página, ele podia ficar por cima da barra de navegação do Hubspot. Adicionado um ajuste automático: ao entrar no modo compacto nessa situação, o widget era empurrado um pouco para baixo, guardando a posição original para restaurar exatamente ao sair do modo compacto.

Esse ajuste automático ainda causava uma mudança de posição perceptível durante o modo compacto (mesmo restaurando depois). Foi substituído por uma solução mais direta na v1.5 — ver abaixo.

v1.5 — Estabilidade em segundo plano e posição do widget

Corrigido

🐛 O widget podia mudar de posição sozinho ao ativar ou desativar o modo compacto (o ajuste automático da v1.3 para evitar sobrepor a barra do Hubspot ficava "preso" depois, deslocando o widget permanentemente). Removido de vez: a posição agora só muda se o usuário arrastar o widget manualmente, em qualquer modo (normal, minimizado ou compacto).

🐛 O preenchimento de um preset travava por completo se o usuário trocasse de aba do navegador durante o processo, retomando só quando voltava para a aba do Hubspot. Causa: a barra de progresso usava requestAnimationFrame, que o navegador pausa totalmente quando a aba não está visível, e o preenchimento ficava esperando essa animação terminar antes de seguir para o próximo campo. A barra passou a usar transition de CSS, sem depender de requestAnimationFrame, e o preenchimento não espera mais por ela — agora continua rodando normalmente mesmo com a aba do Hubspot em segundo plano.

v1.6 — Correção de seleção, ícone da extensão e ajuda rápida

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

v1.7 — Presets dinâmicos e leitura da classificação do Hubspot

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

v1.8 — Confirmação do preenchimento

Adicionado

✅ Confirmação do valor exibido no Hubspot após cada campo ser preenchido, com resultado individual por propriedade.

✅ Feedback de aplicação no card: permanece aberto durante o preenchimento, fecha automaticamente quando tudo é confirmado e permanece aberto quando há falha.

✅ Resumo de confirmações no modo compacto, com detalhes disponíveis ao expandir o widget.

Corrigido

🐛 Removida a limpeza automática de campos omitidos pelo preset, que podia interferir em propriedades dinâmicas da conta. O preset volta a alterar somente os campos configurados; o campo Proprietário do ticket permanece sob controle manual.

🐛 Campos de seleção múltipla são identificados pela presença de checkboxes, inclusive propriedades cujo nome não contém “Categoria”.

🧪 A v1.8 foi validada com 7 testes funcionais automatizados após a remoção da limpeza automática.

v1.9 — Grupos reutilizáveis

Adicionado

📂 O campo Grupo sugere os grupos já utilizados nos presets e permite criar um novo grupo digitando seu nome.

🧭 A comparação ignora diferenças de maiúsculas, minúsculas e espaços nas bordas, reutilizando o nome já cadastrado para evitar grupos duplicados.

📦 Na importação de backups, presets com o mesmo nome e grupo são identificados antes de salvar. O usuário pode substituir os existentes ou mantê-los e importar somente os novos.

↕️ Na tela inicial, o modo "Organizar grupos" permite mover um grupo para cima ou para baixo com os botões de chevron, ou posicioná-lo diretamente sobre outro grupo com arraste e solte. A ordem fica salva no navegador e é preservada ao reabrir o widget.

🎨 O grupo de origem e o grupo de destino recebem destaque durante o arraste para deixar claro onde a troca será feita; os cards de presets ficam protegidos contra cliques acidentais enquanto a organização está ativa.

🧹 Ao concluir uma aplicação com sucesso, o feedback de confirmação é encerrado mesmo que a lista seja reconstruída durante o processo (por exemplo, ao abrir a organização de grupos). Em caso de erro, o painel continua disponível para conferência.

⚠️ Pontos de atenção

A automação depende da estrutura atual do Hubspot (classes, data-test-id, title). Mudanças de layout no Hubspot podem exigir revisão de findFieldButton, findFieldTextInput, selectOptionByText e clearMultiSelection em content.js.

A leitura da classificação depende da existência do modal "Propriedades dependentes" e dos campos que estiverem disponíveis nele no momento da leitura.

A estrutura dinâmica dos presets permite que diferentes presets contenham diferentes conjuntos de propriedades.

<div align="center">

Lagamba Tech

</div>
