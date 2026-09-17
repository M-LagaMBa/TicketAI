# TicketAI — Planejamento inicial

**Status:** planejamento, sem implementação aprovada  
**Data de consolidação:** 16 de setembro de 2026  
**Versão atual da extensão:** 1.7

## 1. Objetivo

Evoluir o TicketAI de uma extensão baseada em presets para uma solução interna de classificação de tickets do HubSpot capaz de:

- ler o contexto do ticket;
- escolher Produto, Categoria e Assunto entre aproximadamente 150 opções;
- preencher os campos automaticamente pela interface do HubSpot;
- atender aproximadamente 10 usuários e cerca de 100 tickets por dia;
- manter todo o processamento dentro da infraestrutura da empresa;
- funcionar sem API do HubSpot, MCP do HubSpot ou API da OpenAI;
- não depender de Codex ou ChatGPT para os usuários finais;
- não exigir, nesta fase, investimento em novo hardware.

O projeto continua na fase de planejamento. Nenhuma VM, container, serviço ou alteração funcional foi criada com base neste documento.

## 2. Estado atual do TicketAI

O TicketAI 1.7 é uma extensão Manifest V3 para Edge/Chrome. O projeto atual contém:

- `manifest.json`: configuração, permissões e injeção no HubSpot;
- `background.js`: clique no ícone e comunicação com o content script;
- `content.js`: interface, armazenamento de presets e automação visual;
- armazenamento local dos presets via `chrome.storage.local`;
- preenchimento pela interface do HubSpot, simulando eventos esperados pelos componentes React;
- leitura do modal "Propriedades dependentes";
- presets dinâmicos, importação/exportação, busca, agrupamento e desfazer exclusão.

Não existe IA no projeto atual. O nome TicketAI representa, por enquanto, automação por presets e seletores de tela.

### Pontos técnicos já identificados

- O `content.js` concentra interface, CSS, armazenamento e automação em mais de 2.100 linhas.
- A automação depende da estrutura visual interna do HubSpot.
- Não existem testes automatizados, lint ou CI.
- O fluxo "Adicionar campo" cria um campo sem oferecer um input funcional para editar o rótulo.
- Campos dinâmicos com valor vazio são armazenados, mas ignorados durante a aplicação; portanto, não limpam uma propriedade.
- Alguns seletores internos do HubSpot são frágeis e podem mudar.

Esses itens não foram corrigidos porque o trabalho permanece na fase de planejamento.

## 3. Restrições confirmadas

### Integrações externas

- Não usar API da OpenAI.
- Não criar chave da OpenAI.
- Não usar MCP oficial do HubSpot.
- Não usar API oficial do HubSpot.
- Não criar aplicativo privado ou público no HubSpot.
- Não depender de aprovação de Super Admin ou permissão de App Marketplace.
- Não usar Codex/ChatGPT nos computadores dos usuários finais.

### Acesso ao HubSpot

Toda leitura e escrita deverá acontecer pela tela, com a extensão operando na sessão autenticada de cada usuário.

Fluxo pretendido:

1. A extensão identifica o ticket aberto.
2. Lê visualmente assunto, mensagens e propriedades disponíveis no DOM.
3. Envia somente o contexto necessário ao serviço interno.
4. Recebe a classificação validada.
5. Preenche Produto, Categoria e Assunto pela interface.

Não haverá acesso direto ao CRM por API.

### Privacidade

- O conteúdo dos tickets não pode ser processado em serviços externos.
- O processamento proposto será realizado no Proxmox da empresa.
- Precisa ser confirmado formalmente que "processamento interno" permite transferir o texto do navegador para o Proxmox interno.
- Dados pessoais devem ser minimizados e, quando possível, removidos antes de armazenamento ou análise histórica.
- O texto integral do ticket não deve ser persistido por padrão.

## 4. Público e volume

- Aproximadamente 10 usuários.
- Aproximadamente 100 tickets por dia, a confirmar.
- Cerca de 150 opções de classificação.
- A classificação depende do contexto da conversa, não somente do título ou de palavras isoladas.
- A equipe pode instalar a extensão manualmente.
- O preenchimento final deverá ser automático, mas a ativação imediata de automação total não é recomendada sem validação anterior.

## 5. Alternativas analisadas

### Codex com MCP local

Foi considerada uma ponte local entre a extensão e o Codex. Ela permitiria que esta conversa analisasse um ticket e devolvesse a classificação. A alternativa foi descartada como solução de equipe porque:

- nem todos utilizam Codex;
- dependeria de uma conversa ativa;
- seria uma solução individual, não centralizada;
- a extensão não consegue iniciar autonomamente uma mensagem nesta conversa.

### MCP oficial do HubSpot

A conexão foi tentada, mas o portal exige aprovação de Super Admin ou usuário com permissão de App Marketplace. Como o objetivo é não depender do administrador, essa alternativa foi descartada.

### IA embarcada em cada extensão

É possível executar um classificador pequeno no navegador, mas a alternativa apresenta:

- pacote maior;
- dificuldade de atualizar o modelo;
- aprendizado e métricas fragmentados por usuário;
- limitação de capacidade nos computadores da equipe.

Pode permanecer como fallback futuro, mas não é a recomendação principal.

### Servidor interno no Proxmox

É a arquitetura preferida. Centraliza taxonomia, modelo, regras, auditoria e atualizações sem enviar tickets para a internet.

## 6. Proxmox inspecionado

O painel foi consultado somente em modo leitura. Nenhuma alteração foi feita.

### Host

- Proxmox VE 9.2.11.
- CPU: Intel Core i5-7400 @ 3,00 GHz.
- 4 CPUs lógicas, 1 socket.
- RAM total: 15,53 GiB.
- RAM observada em uso: 9,60 GiB (61,82%).
- Swap: 8 GiB.
- Volume raiz: 95,95 GiB, com 68,44 GiB utilizados.
- Repositório marcado como não pronto para produção habilitado; deve ser revisado antes de produção.

### Armazenamento

- SSD Intel `SSDSC2BB800G7R`, 800,17 GB, SMART aprovado, desgaste de 7%.
- LVM-Thin `local-lvm`: 656,84 GB totais, 103,25 GB usados, aproximadamente 553,59 GB livres.
- HDD Samsung `SAMSUNG_HD502HI`, 500,11 GB, SMART aprovado.

### Cargas existentes observadas

- VM 100, Windows Server 2022, ligada e consumindo aproximadamente metade da RAM do host.
- CT 103 ligado.
- VM 101, EVE-NG, desligada.
- Nenhuma GPU dedicada foi confirmada pelo painel consultado.

### Conclusão de capacidade

O armazenamento é suficiente. CPU e memória são limitadores para um LLM convencional atendendo dez usuários.

Sem investimento, o host consegue executar:

- serviço interno do TicketAI;
- banco leve;
- regras determinísticas;
- classificação estatística;
- busca por similaridade e embeddings pequenos;
- fila, auditoria e painel administrativo.

Ollama com um modelo pequeno pode ser testado posteriormente, mas não deve ser a base inicial. Um LLM maior poderia prejudicar as cargas atuais e apresentar latência ruim.

## 7. Arquitetura proposta sem investimento

```text
Extensão TicketAI (10 usuários)
          |
          | HTTPS interno
          v
TicketAI Server no Proxmox
  - autenticação
  - extração/normalização
  - catálogo de classificações
  - regras determinísticas
  - busca por exemplos semelhantes
  - classificador estatístico
  - validação de combinações
  - auditoria e métricas
          |
          v
Classificação estruturada
          |
          v
Extensão preenche o HubSpot pela tela
```

### Dimensionamento inicial sugerido

- VM ou container Linux isolado.
- 2 vCPUs.
- 2 a 4 GB de RAM.
- 30 a 50 GB de disco no `local-lvm`.
- Docker opcional; a decisão VM versus LXC ainda não foi fechada.
- Nenhum acesso público à internet.
- Acesso somente por rede interna ou VPN.

### Componentes iniciais

- API interna leve, por exemplo FastAPI ou Node.js.
- SQLite no piloto; PostgreSQL somente quando houver necessidade operacional.
- Classificador TF-IDF de palavras e caracteres.
- Regressão logística ou Linear SVM.
- Regras explícitas para sinais inequívocos.
- Busca por tickets históricos semelhantes.
- Catálogo versionado das combinações válidas.

### Classificação hierárquica

Não se deve pedir ao classificador que escolha diretamente entre 150 opções sem contexto estrutural.

Fluxo recomendado:

1. Identificar Produto.
2. Filtrar categorias válidas para o Produto.
3. Identificar Categoria.
4. Filtrar assuntos válidos para a combinação.
5. Identificar Assunto.
6. Validar a combinação final.

Isso reduz ambiguidade, custo computacional e classificações impossíveis.

## 8. Papel potencial do Ollama

O Ollama não será requisito da primeira versão.

Ele poderá ser avaliado posteriormente como desempate quando:

- duas classes tiverem pontuações próximas;
- o texto for incomum;
- o classificador indicar baixa confiança;
- houver contexto longo que exija interpretação adicional.

Um modelo pequeno por CPU deverá ser comparado com o classificador tradicional usando o mesmo conjunto de validação. Ele só será incorporado se melhorar a precisão sem criar latência operacional inadequada.

## 9. Auditoria inicial de tickets pela tela

Antes de selecionar modelo ou iniciar implementação, será realizada uma análise exploratória de aproximadamente 100 tickets fechados e já classificados.

### Método de acesso

- Exclusivamente pela interface visual do HubSpot.
- Sessão já autenticada do usuário.
- Sem API, MCP ou token.
- Sem alterar propriedades.
- Automação de navegador apenas para navegação e leitura.

### Amostragem

Não usar apenas os últimos 100 tickets. A amostra deve incluir:

- diferentes atendentes;
- diferentes datas;
- produtos e categorias variados;
- tickets simples, extensos e ambíguos;
- categorias comuns e raras;
- casos com classificações potencialmente semelhantes.

### Dados analisados em cada ticket

- ID do ticket.
- Assunto.
- Contexto relevante da conversa.
- Produto atribuído.
- Categoria atribuída.
- Assunto/classificação final.
- Trechos ou sinais que justificam a decisão.
- Coerência aparente da classificação.
- Possíveis alternativas ou ambiguidades.
- Regra inferida.

### Privacidade durante a auditoria

- Não copiar nomes, e-mails, telefones ou identificadores pessoais para o relatório.
- Produzir apenas resumos anonimizados.
- Não persistir a conversa completa.
- Manter arquivos de análise dentro da infraestrutura local autorizada.

### Limitação da amostra

Cem tickets são suficientes para entender o processo, descobrir inconsistências e desenhar a taxonomia. Não são suficientes para treinar 150 categorias com segurança.

Depois da análise exploratória, será necessário obter amostras direcionadas:

- 20 a 50 exemplos ou mais para categorias comuns;
- mais exemplos para classes frequentemente confundidas;
- todos os exemplos disponíveis para categorias raras;
- correção ou validação humana de rótulos inconsistentes.

### Entregáveis da auditoria

- mapa Produto -> Categoria -> Assunto;
- regras observadas;
- campos do ticket realmente úteis;
- categorias ambíguas;
- inconsistências históricas;
- exemplos anonimizados;
- distribuição de exemplos por classe;
- recomendação de classificador;
- estimativa de dados adicionais necessários.

## 10. Estratégia de ativação

Embora o requisito final seja preenchimento automático, não é recomendado ativá-lo sem medir a qualidade.

### Fase 1 — Análise histórica

Ler e compreender a amostra sem alterar tickets.

### Fase 2 — Modo sombra

O sistema classifica novos tickets sem preencher. A previsão é comparada com a classificação humana.

### Fase 3 — Sugestão assistida

A extensão mostra a sugestão para confirmação e registra correções.

### Fase 4 — Automação seletiva

Combinações com precisão comprovada e alta confiança são preenchidas automaticamente.

### Fase 5 — Automação ampliada

Demais classes entram gradualmente após atingirem critérios mínimos.

Automação silenciosa completa no primeiro dia foi considerada um risco para a qualidade dos dados.

## 11. Atualizações e distribuição

Para dez usuários, a primeira estratégia pode ser manual e interna:

- pacotes versionados da extensão;
- página interna de download;
- arquivo `version.json` para avisar sobre nova versão;
- configurações e catálogo atualizados centralmente sem reinstalar a extensão;
- servidor e classificador versionados;
- rollback para a versão anterior;
- compatibilidade temporária com uma versão anterior da extensão.

### Atualizações do servidor

- imagens e dependências com versões fixas;
- nunca usar `latest` em produção;
- backup antes de migrações;
- ambiente de teste;
- atualização por etapas;
- snapshot do Proxmox antes de mudanças relevantes;
- classificador novo só substitui o anterior após avaliação comparativa.

## 12. Riscos principais

- Alterações de layout do HubSpot quebrarem a leitura ou preenchimento.
- Tickets com contexto insuficiente.
- Categorias mal definidas ou sobrepostas.
- Histórico contendo classificações incorretas.
- Classes raras sem exemplos suficientes.
- Automação propagar erros silenciosamente.
- CPU/RAM do host ficarem saturadas pelas cargas existentes.
- Instalação manual causar versões diferentes entre usuários.
- Texto do ticket conter instruções maliciosas ou irrelevantes.
- Política interna proibir que o conteúdo saia do navegador para o Proxmox.

## 13. Decisões já tomadas

- Continuar na fase de planejamento.
- Não implementar ou provisionar infraestrutura ainda.
- Não usar serviços externos de IA.
- Não usar API/MCP do HubSpot.
- A extensão continuará sendo a ponte com o HubSpot pela tela.
- O Proxmox será considerado servidor central interno.
- Não comprar hardware agora.
- Avaliar classificador leve antes de Ollama.
- Realizar análise exploratória de tickets antes de escolher modelo.

## 14. Questões em aberto

- Confirmar se são aproximadamente 100 tickets por dia.
- Confirmar formalmente se o Proxmox pode receber texto dos tickets.
- Definir quais partes da conversa devem ser lidas.
- Definir se notas internas entram ou não no contexto.
- Obter a taxonomia completa das aproximadamente 150 opções.
- Definir como selecionar a amostra dos 100 tickets.
- Definir tempo máximo aceitável por classificação.
- Definir política de retenção e auditoria.
- Definir métrica mínima para ativar preenchimento automático.
- Confirmar navegadores e versões utilizados pela equipe.
- Verificar possibilidade futura de RAM/GPU, sem compromisso de investimento.

## 15. Próximo passo recomendado

Preparar a auditoria somente leitura dos 100 tickets pela tela do HubSpot:

1. definir filtros e amostragem;
2. criar formato local de registro anonimizado;
3. executar um piloto com 5 tickets;
4. validar se o contexto e as propriedades podem ser lidos de forma consistente;
5. ajustar o procedimento;
6. analisar os demais tickets em lotes;
7. consolidar a taxonomia antes de projetar o classificador.

Nenhum ticket deve ser modificado durante essa etapa.
