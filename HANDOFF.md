# Handoff — TicketAI

## Estado atual

O projeto está exclusivamente na fase de planejamento. Não iniciar implementação, provisionar VM ou alterar tickets sem nova autorização explícita.

O planejamento completo está em [`docs/PLANEJAMENTO_INICIAL.md`](docs/PLANEJAMENTO_INICIAL.md).

## Objetivo resumido

Construir uma solução interna para aproximadamente 10 usuários e cerca de 100 tickets/dia que leia o contexto do ticket e preencha automaticamente Produto, Categoria e Assunto entre aproximadamente 150 opções.

## Restrições obrigatórias

- Sem API da OpenAI.
- Sem API ou MCP do HubSpot.
- Sem depender de Codex para os usuários.
- Sem aprovação administrativa do HubSpot.
- Leitura e preenchimento exclusivamente pela tela do HubSpot.
- Processamento somente na infraestrutura interna.
- Sem investimento em hardware neste momento.

## Infraestrutura observada

- Proxmox VE 9.2.11.
- Intel i5-7400, 4 CPUs lógicas.
- 15,53 GiB de RAM; aproximadamente 9,60 GiB estavam em uso.
- `local-lvm`: 656,84 GB totais, aproximadamente 553,59 GB livres.
- SSD Intel de 800 GB e HDD Samsung de 500 GB.
- VM Windows Server 2022 e CT 103 ligados.
- GPU dedicada não confirmada.

Conclusão: armazenamento suficiente; CPU/RAM insuficientes para basear a primeira versão em um LLM. O host suporta uma API interna leve, regras, banco e classificador estatístico.

## Arquitetura preferida

Extensão TicketAI -> HTTPS interno -> serviço no Proxmox -> regras + similaridade + classificador hierárquico -> validação -> extensão preenche o HubSpot pela interface.

Começar com TF-IDF + Linear SVM/regressão logística. Ollama é apenas experimento futuro e deve provar ganho de precisão/latência antes de entrar no fluxo.

## Próxima atividade

Auditoria somente leitura de aproximadamente 100 tickets fechados e classificados usando exclusivamente a interface do HubSpot.

Antes de executar:

1. definir uma amostra distribuída, não apenas os últimos 100;
2. definir formato de registro anonimizado;
3. testar o procedimento com 5 tickets;
4. confirmar que nenhuma propriedade será alterada;
5. registrar Produto, Categoria, Assunto, sinais relevantes, coerência e ambiguidades.

Os 100 tickets servem para compreender o processo e montar a taxonomia; não são dados suficientes para treinar com segurança 150 categorias.

## Decisões pendentes

- Confirmar autorização para o texto sair do navegador e ser processado no Proxmox interno.
- Confirmar volume diário.
- Obter taxonomia completa.
- Definir retenção de dados e critérios de precisão.
- Definir contexto relevante: conversa, notas internas, anexos e propriedades.

## Regra de continuidade

Preservar a etapa de planejamento. A próxima pessoa ou agente deve ler o documento completo antes de propor implementação e não deve usar APIs externas nem modificar o ambiente sem autorização.
