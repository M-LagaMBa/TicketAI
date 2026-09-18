(function() {
  if (window.hasTicketAILoaded) return;
  window.hasTicketAILoaded = true;

  const TICKETAI_VERSION = '2.0';

  // Log leve de tempo de cada etapa do preenchimento, só aparece no console
  // (F12) se TA_DEBUG_TIMING estiver true. Ajuda a calibrar os timeouts com
  // dado real do ambiente de cada usuário, sem precisar de instrumentação à parte.
  const TA_DEBUG_TIMING = true;
  function debugLog(label, startTime) {
    if (!TA_DEBUG_TIMING) return;
    const elapsed = Math.round(performance.now() - startTime);
    console.debug(`[TicketAI] ${label}: ${elapsed}ms`);
  }

  let presets = [];
  let searchQuery = "";
  let editingId = null;
  let selectMode = false;
  let selectedIds = new Set();
  let peekMode = false;
  let peekIndex = 0;
  let groupOrder = [];
  let organizingGroups = false;
  let draggedGroup = null;
  let dragTargetGroup = null;
  let draggedLabel = null;
  let dragTargetLabel = null;
  let draggedGhost = null;
  let dragPointerListenerInstalled = false;
  let pendingUndo = null; // { items: [{ preset, index }], timer }

  // ---------------------------------------------------------------------
  // UTILITÁRIOS
  // ---------------------------------------------------------------------

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  // Escapa o texto e envolve o trecho buscado em <mark> para destaque visual.
  function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
    const q = (query || '').trim();
    if (!q) return escaped;
    const escQuery = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escQuery) return escaped;
    const regex = new RegExp(escQuery, 'ig');
    return escaped.replace(regex, (match) => `<mark class="ta-highlight">${match}</mark>`);
  }

  function cssEscapeValue(str) {
    if (window.CSS && CSS.escape) return CSS.escape(str);
    return String(str).replace(/["\\]/g, '\\$&');
  }

  function generateId() {
    const maxId = presets.reduce((max, p) => Math.max(max, p.id || 0), 0);
    return Math.max(Date.now(), maxId + 1);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Espera até que a função condicao() retorne algo "truthy", ou desiste após o tempo limite.
  function waitFor(condicao, timeoutMs = 3000, intervalMs = 100) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (isPresetApplicationCancelled()) return resolve(null);
        const result = condicao();
        if (result) return resolve(result);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  // ---------------------------------------------------------------------
  // AUTOMAÇÃO DE PREENCHIMENTO NO HUBSPOT
  // ---------------------------------------------------------------------
  // ATENÇÃO: os seletores abaixo foram mapeados manualmente na estrutura
  // atual do Hubspot. Se a Hubspot atualizar o layout do formulário,
  // pode ser necessário revisar findFieldButton() e selectOptionByText().

  // A página pode ter campos com o MESMO rótulo em mais de um lugar ao mesmo
  // tempo (ex: o painel lateral do ticket, atrás do modal). Por isso toda
  // busca de campo precisa ser restrita à área do modal "Propriedades
  // dependentes", nunca à página inteira.
  function getModalScope() {
    return Array.from(document.querySelectorAll('[role="dialog"]')).find(dialog =>
      dialog.getClientRects().length > 0 &&
      Array.from(dialog.querySelectorAll('h1, h2, h3')).some(heading =>
        heading.textContent.trim() === 'Propriedades dependentes')) || null;
  }

  // Dispara a sequência completa de eventos de mouse. Um .click() simples
  // não é suficiente para alguns componentes internos da Hubspot, que
  // esperam pointerdown/mousedown antes do click.
  function simulateClick(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
    };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      const EventCtor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new EventCtor(type, opts));
    });
  }

  // Localiza o botão/dropdown de um campo a partir do texto do rótulo visível
  // (ex: "Produto", "Categoria", "Assunto"), restrito à área do modal aberto.
  function findFieldButton(labelText) {
    const scope = getModalScope();
    if (!scope) return null;
    const labelSelector = '[class*="FormControl__LabelWrapper"]';
    const labels = scope.querySelectorAll(labelSelector);
    const target = labelText.trim().toLowerCase();

    for (const label of labels) {
      const txt = (label.textContent || '').replace('*', '').trim().toLowerCase();
      if (!txt.startsWith(target)) continue;

      let el = label.parentElement;
      for (let i = 0; i < 6 && el && scope.contains(el); i++) {
        const btn = el.querySelector('button[data-dropdown="true"]');
        if (btn) return btn;
        el = el.parentElement;
      }
    }
    return null;
  }

  // Localiza o textarea/input de texto livre de um campo (ex: Descrição do
  // ticket), restrito à área do modal aberto.
  function findFieldTextInput(labelText) {
    const scope = getModalScope();
    if (!scope) return null;
    const labelSelector = '[class*="FormControl__LabelWrapper"]';
    const labels = scope.querySelectorAll(labelSelector);
    const target = labelText.trim().toLowerCase();

    for (const label of labels) {
      const txt = (label.textContent || '').replace('*', '').trim().toLowerCase();
      if (!txt.startsWith(target)) continue;

      let el = label.parentElement;
      for (let i = 0; i < 6 && el && scope.contains(el); i++) {
        const input = el.querySelector('textarea, input[type="text"]');
        if (input) return input;
        el = el.parentElement;
      }
    }
    return null;
  }

  // Versões "espera até existir" das duas buscas acima. Campos dependentes
  // (Categoria só aparece depois do Produto, Assunto só depois da Categoria)
  // não estão prontos no instante em que terminamos o campo anterior — em
  // vez de uma pausa fixa "no escuro", ficamos checando a cada poucos
  // milissegundos até o campo realmente existir, ou desistimos no timeout.
  function waitForFieldButton(labelText, timeoutMs = 2000) {
    return waitFor(() => findFieldButton(labelText), timeoutMs, 60);
  }
  function waitForFieldTextInput(labelText, timeoutMs = 2000) {
    return waitFor(() => findFieldTextInput(labelText), timeoutMs, 60);
  }

  // Pipeline e status ficam no card "Destaques de Ticket", fora do modal de
  // propriedades dependentes. No modo "Exibir", a lista também possui filtros
  // com esses mesmos rótulos; por isso a busca é limitada ao card do ticket.
  function findTicketHighlightsScope(labelText) {
    const target = String(labelText || '').trim().toLowerCase();
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
      .filter(el => el.getClientRects().length > 0 &&
        (el.textContent || '').trim().toLowerCase() === 'destaques de ticket');

    for (const heading of headings) {
      let container = heading.parentElement;
      for (let depth = 0; depth < 7 && container; depth++, container = container.parentElement) {
        const hasLabel = Array.from(container.querySelectorAll('div, span, label'))
          .some(el => el.getClientRects().length > 0 &&
            (el.textContent || '').trim().toLowerCase() === target);
        if (hasLabel) return container;
      }
    }
    return null;
  }

  function findTicketPropertyButton(labelText) {
    const target = String(labelText || '').trim().toLowerCase();
    const scope = findTicketHighlightsScope(labelText);
    if (!scope) return null;
    const labels = Array.from(scope.querySelectorAll('div, span, label'))
      .filter(el => el.getClientRects().length > 0 &&
        (el.textContent || '').trim().toLowerCase() === target);
    for (const label of labels) {
      let container = label.parentElement;
      for (let depth = 0; depth < 4 && container; depth++, container = container.parentElement) {
        const buttons = Array.from(container.querySelectorAll('button'))
          .filter(button => button.getClientRects().length > 0);
        const button = buttons.find(item => {
          const text = (item.textContent || '').trim().toLowerCase();
          return text.startsWith(target) || (item.getAttribute('aria-label') || '').toLowerCase().startsWith(target);
        }) || (buttons.length === 1 ? buttons[0] : null);
        if (button) return button;
      }
    }
    return null;
  }

  function ticketPropertyValue(labelText) {
    const button = findTicketPropertyButton(labelText);
    if (!button) return '';
    const marked = Array.from(button.querySelectorAll('[data-option-text="true"]'))
      .map(el => (el.textContent || '').trim()).filter(Boolean);
    if (marked.length) return marked.join(', ');
    const label = String(labelText || '').trim();
    return (button.textContent || '').trim().replace(new RegExp(`^${label}\\s*`, 'i'), '').trim();
  }

  function modalDropdownValue(labelText) {
    const button = findFieldButton(labelText);
    if (!button) return '';
    const marked = Array.from(button.querySelectorAll('[data-option-text="true"]'))
      .map(el => (el.textContent || '').trim()).filter(Boolean);
    return marked.join(', ') || (button.textContent || '').trim();
  }

  function normalizeWorkflow(workflow) {
    const clean = value => String(value ?? '').trim();
    const pipeline = clean(workflow?.pipeline);
    const status = clean(workflow?.status);
    return { pipeline, status };
  }

  function normalizeImportedPreset(item, id) {
    const normalizedItem = {
      id,
      name: item.name,
      group: item.group || 'GERAL',
      descricao: item.descricao || '',
      produto: item.produto || '',
      categoria: item.categoria || '',
      assunto: item.assunto || ''
    };
    if (Array.isArray(item.fields)) {
      normalizedItem.fields = item.fields
        .map(normalizeBetaField)
        .filter(field => field.label);
    }
    const workflow = normalizeWorkflow(item.workflow);
    if (workflow.pipeline || workflow.status) normalizedItem.workflow = workflow;
    return normalizedItem;
  }

  function valuesMatch(actual, expected) {
    return String(actual || '').trim().toLocaleLowerCase() === String(expected || '').trim().toLocaleLowerCase();
  }

  function readCurrentWorkflow() {
    return {
      pipeline: ticketPropertyValue('Pipeline'),
      // O modal mostra o Status que efetivamente habilitou a classificação.
      // O card lateral só é usado quando o modal ainda não está aberto.
      status: modalDropdownValue('Status do ticket') || ticketPropertyValue('Status do ticket')
    };
  }

  function describeTicketImport(workflow, fieldsCount) {
    const hasWorkflow = !!(workflow?.pipeline || workflow?.status);
    const hasClassification = fieldsCount > 0;
    if (hasWorkflow && hasClassification) {
      return {kind: 'success', text: `✓ Pipeline, Status e ${fieldsCount} campos importados. Revise antes de salvar.`};
    }
    if (hasWorkflow) {
      return {kind: 'success', text: '✓ Pipeline e Status importados. Abra o modal “Propriedades dependentes” para importar a classificação.'};
    }
    if (hasClassification) {
      return {kind: 'success', text: `✓ ${fieldsCount} campos importados. Abra um ticket com “Destaques de Ticket” para importar Pipeline e Status.`};
    }
    return {kind: 'error', text: 'Abra um ticket com “Destaques de Ticket” e o modal “Propriedades dependentes”.'};
  }

  function ticketPropertyIsConfirmed(labelText, valueText) {
    if (valuesMatch(ticketPropertyValue(labelText), valueText)) return true;
    // Ao selecionar o Status, o HubSpot abre o modal de propriedades e só
    // atualiza o card lateral depois do Salvar manual. Nesse intervalo, o
    // modal é a fonte de verdade; usar o card lateral interromperia a
    // classificação embora o Status já esteja corretamente selecionado.
    return labelText === 'Status do ticket' && fieldValueMatches({
      label: labelText, value: valueText, type: 'dropdown'
    });
  }

  async function setTicketProperty(labelText, valueText) {
    if (isPresetApplicationCancelled()) return false;
    const current = ticketPropertyValue(labelText);
    if (valuesMatch(current, valueText)) return true;
    const button = await waitFor(() => findTicketPropertyButton(labelText), 2500, 60);
    if (!button || isPresetApplicationCancelled()) return false;
    simulateClick(button);
    await sleep(40);
    if (!await selectOptionByText(valueText, button) || isPresetApplicationCancelled()) return false;
    return !!await waitFor(() => ticketPropertyIsConfirmed(labelText, valueText), 3000, 80);
  }

  async function applyWorkflowBeforeClassification(preset, card) {
    const workflow = normalizeWorkflow(preset?.workflow);
    const results = Object.create(null);
    const showFailure = () => {
      const failed = Object.entries(results).find(([, ok]) => !ok);
      if (!failed || !card) return;
      const output = card.querySelector('.ta-field-results');
      if (output) {
        output.hidden = false;
        output.textContent = `${failed[0]}: Não confirmado — confira no HubSpot`;
      }
    };
    if (workflow.pipeline && !isPresetApplicationCancelled()) {
      results.Pipeline = await setTicketProperty('Pipeline', workflow.pipeline);
      if (!results.Pipeline) { showFailure(); return results; }
    }
    if (workflow.status && !isPresetApplicationCancelled()) {
      // O HubSpot recria as opções de status depois de uma mudança de pipeline.
      results['Status do ticket'] = await setTicketProperty('Status do ticket', workflow.status);
    }
    showFailure();
    return results;
  }


  // ---------------------------------------------------------------------
  // BETA 1 - LEITURA DA CLASSIFICAÇÃO ATUAL DO HUBSPOT
  // ---------------------------------------------------------------------
  // Esta função é experimental e NÃO altera a classificação do ticket.
  // Ela apenas inspeciona o modal "Propriedades dependentes" e mostra no
  // console os elementos que podem representar os campos de classificação.
  function readCurrentClassification() {
    console.group('%cTicketAI - Leitura da classificação', 'color:#F59E0B;font-weight:bold;');

    const modal = Array.from(document.querySelectorAll('[role="dialog"]'))
      .find(el => /propriedades dependentes/i.test(el.innerText || ''));

    if (!modal) {
      console.warn('TicketAI: modal "Propriedades dependentes" não encontrado.');
      console.groupEnd();
      return [];
    }

    const dependentScope = modal.querySelector('[data-test-id="hs_pipeline_stage-dependents"]') || modal;
    const controls = Array.from(dependentScope.querySelectorAll('[data-test-id="FormControl"]'));
    const results = [];

    controls.forEach(control => {
      const label = (control.querySelector('.FormControl__StyledInnerLabel-kxPGLN')?.textContent || '').trim();
      if (!label) return;

      const textarea = control.querySelector('textarea');
      if (textarea) {
        results.push({ index: results.length + 1, label, value: textarea.value || '', type: 'textarea' });
        return;
      }

      // Campos de seleção múltipla podem ter um input checkbox antes das
      // opções. Eles precisam ser classificados como multi para que a limpeza
      // desmarque os itens, mesmo quando o rótulo não contém "Categoria".
      const checkboxes = control.querySelectorAll('input[type="checkbox"]');
      if (checkboxes.length) {
        const selected = [...new Set(
          Array.from(control.querySelectorAll('[data-option-text="true"]'))
            .map(el => (el.textContent || '').trim()).filter(Boolean)
        )];
        results.push({ index: results.length + 1, label,
          value: selected.length > 1 ? selected : (selected[0] || ''), type: 'multi' });
        return;
      }

      const input = control.querySelector('input');
      if (input) {
        results.push({ index: results.length + 1, label, value: input.value || '', type: 'input' });
        return;
      }

      const selected = [...new Set(
        Array.from(control.querySelectorAll('[data-option-text="true"]'))
          .map(el => (el.textContent || '').trim())
          .filter(Boolean)
      )];

      results.push({
        index: results.length + 1,
        label,
        value: selected.length > 1 ? selected : (selected[0] || ''),
        type: /categoria/i.test(label) ? 'multi' : 'dropdown'
      });
    });

    console.log(`Campos encontrados: ${results.length}`);
    console.table(results);
    console.log('Classificação estruturada:', results);
    console.groupEnd();
    return results;
  }


  // Preenche um campo de texto livre disparando os eventos que o React espera.
  function fillTextInput(input, text) {
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // HubSpot usa aria-owns para ligar o botão ao portal. Nunca escolhe uma
  // lista global por posição: sem vínculo verificável, o preenchimento falha.
  function getOpenDropdownContainer(button) {
    if (!button || !button.isConnected) return null;
    const visible = el => el && el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden';
    const controlledIds = (button.getAttribute('aria-controls') || button.getAttribute('aria-owns') || '').trim();
    if (controlledIds) {
      const menus = controlledIds.split(/\s+/).map(id => document.getElementById(id))
        .map(el => el?.matches('.Select-menu') ? el : el?.querySelector('.Select-menu'))
        .filter(visible);
      return menus.length === 1 ? menus[0] : null;
    }
    const localMenu = button.closest('.Select')?.querySelector('.Select-menu');
    if (visible(localMenu)) return localMenu;
    return null;
  }

  function findDropdownSearchInput(button) {
    if (!getOpenDropdownContainer(button)) return null;
    // A busca do HubSpot fica fora de .Select, dentro do portal do botão.
    const ids = (button.getAttribute('aria-controls') || button.getAttribute('aria-owns') || '').trim();
    for (const id of ids.split(/\s+/).filter(Boolean)) {
      const input = document.getElementById(id)?.querySelector('input[placeholder="Pesquisar"]');
      if (input && input.getClientRects().length > 0) return input;
    }
    return button.closest('.Select')?.querySelector('input[placeholder="Pesquisar"]') || null;
  }

  // Clica no elemento (botão, checkbox ou div com título) cujo atributo
  // title ou data-option-value bate com o texto da opção desejada.
  // Busca só dentro da lista aberta, não na página inteira: um valor comum
  // (ex: "Dúvida") pode coincidir com outro elemento qualquer do Hubspot que
  // tenha o mesmo texto, fazendo clicar no lugar errado.
  async function selectOptionByText(text, button) {
    const sel = `[title="${cssEscapeValue(text)}"], [data-option-value="${cssEscapeValue(text)}"]`;
    const el = await waitFor(() => {
      const scope = getOpenDropdownContainer(button);
      return scope?.querySelector(sel) || null;
    }, 3000);
    if (!el) return false;
    const target = el.querySelector('button') || el;
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') return false;
    simulateClick(target);
    return true;
  }

  // Desmarca todas as opções já selecionadas dentro de um campo de múltipla
  // seleção (ex: Categoria). A seleção real fica no `checked` do checkbox,
  // não no atributo aria-selected da linha (esse só reflete foco/destaque).
  // Usamos o setter nativo + evento "change" (técnica padrão para forçar
  // atualização de componentes React controlados), em vez de depender só
  // de clique simulado, que nem sempre alterna o estado de forma confiável.
  // Entre um desmarque e outro, espera CONFIRMAR que desmarcou (em vez de um
  // tempo fixo) — geralmente mais rápido, e não trava se demorar um pouco
  // mais que o normal, até um teto de segurança de 300ms por checkbox.
  async function clearMultiSelection(container) {
    const checkboxSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked').set;
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    if (!checkboxes.length) return false;
    for (const cb of checkboxes) {
      if (!cb.checked) continue;
      checkboxSetter.call(cb, false);
      cb.dispatchEvent(new Event('click', { bubbles: true }));
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      if (!await waitFor(() => !cb.checked, 300, 20)) return false;
    }
    return true;
  }

  // Campo com dropdown simples (Produto): abre e seleciona a opção pelo texto.
  // Passe { multi: true } para campos de múltipla seleção (ex: Categoria):
  // nesse caso, desmarca qualquer opção já selecionada antes de marcar a nova,
  // evitando que o preset anterior deixe categorias "presas" junto com a nova.
  //
  // Não há mais pausa fixa "no escuro" à espera do campo ou da lista
  // aparecerem: cada etapa espera SÓ o tempo que realmente precisar
  // (waitFor), com um teto de segurança generoso pra não falhar em
  // conexões/computadores mais lentos. O único delay fixo que resta (80ms,
  // logo após o clique que abre o dropdown) é uma margem de segurança
  // contra a animação de abertura do Hubspot, não uma espera de conteúdo.
  async function fillDropdownField(labelText, valueText, opts = {}) {
    if (opts.multi) return fillDynamicMultiField(labelText, valueText);
    const t0 = performance.now();
    const btn = await waitForFieldButton(labelText);
    if (!btn) { debugLog(`"${labelText}": campo não encontrado`, t0); return false; }

    if (btn.getAttribute('data-dropdown-open') !== 'true') {
      simulateClick(btn);
      await sleep(40);
    }

    // Só uma opção explicitamente vazia pode limpar um dropdown simples.
    // Sem esse controle, falha em vez de preservar o valor com falso sucesso.
    const ok = valueText === ''
      ? await clearDropdownSelection(btn)
      : await selectOptionByText(valueText, btn);
    debugLog(`"${labelText}" preenchido`, t0);
    return ok;
  }

  // Campo de busca (Assunto): abre, digita para filtrar, e clica no resultado.
  // Mesma lógica: sem pausas fixas, só esperas condicionais com teto de segurança.
  async function fillSearchField(labelText, valueText) {
    if (valueText === '') return fillDropdownField(labelText, '');
    const t0 = performance.now();
    const btn = await waitForFieldButton(labelText);
    if (!btn) { debugLog(`"${labelText}": campo não encontrado`, t0); return false; }

    if (btn.getAttribute('data-dropdown-open') !== 'true') {
      simulateClick(btn);
      await sleep(40);
    }

    const searchInput = await waitFor(
      () => findDropdownSearchInput(btn),
      2000, 60
    );
    if (searchInput) {
      fillTextInput(searchInput, valueText);
    }

    const ok = await selectOptionByText(valueText, btn);
    debugLog(`"${labelText}" preenchido`, t0);
    return ok;
  }

  async function clearDropdownSelection(button) {
    const option = await waitFor(() =>
      getOpenDropdownContainer(button)?.querySelector('[data-option-value=""]'), 1500, 50);
    if (!option) return false;
    const target = option.querySelector('button') || option;
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') return false;
    simulateClick(target);
    return true;
  }

  // Anima a barra de progresso via CSS (transition), não via
  // requestAnimationFrame. O navegador pausa completamente o rAF quando a
  // aba não está visível, o que travava todo o preenchimento até o usuário
  // voltar pra aba — a transição de CSS não sofre essa pausa.
  function setProgress(bar, pct) {
    if (!bar) return;
    bar.style.width = pct + '%';
  }

  // Preenche o preset inteiro na ordem correta (campos dependentes exigem
  // que cada etapa termine antes de abrir a próxima). Anima uma barra de
  // progresso discreta no card enquanto roda, e pisca o card ao concluir.
  // Não há mais pausas fixas entre um campo e outro: cada função de
  // preenchimento já espera o campo seguinte existir antes de agir nele
  // (waitForFieldButton/waitForFieldTextInput), então a espera acontece só
  // quando e pelo tempo que for realmente necessário.
  // Confere o controle novamente: o React pode substituir o nó após o clique.
  function fieldValueMatches(field) {
    const type = field.type || 'dropdown';
    if (type === 'input' || type === 'textarea') {
      const input = findFieldTextInput(field.label);
      const expected = Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? '');
      return !!input && input.value === expected;
    }
    const button = findFieldButton(field.label);
    if (!button) return false;
    const selected = Array.from(button.querySelectorAll('[data-option-text="true"]'))
      .map(el => (el.textContent || '').trim()).filter(Boolean);
    const expected = (Array.isArray(field.value) ? field.value : [field.value ?? ''])
      .map(value => String(value).trim()).filter(Boolean);
    // Ausência do marcador de seleção é inconclusiva, inclusive ao limpar.
    if (!button.querySelectorAll('[data-option-text="true"]').length) return false;
    if (type === 'multi') {
      const actual = [...new Set(selected)].sort();
      const wanted = [...new Set(expected)].sort();
      return actual.length === wanted.length && actual.every((value, i) => value === wanted[i]);
    }
    return expected.length <= 1 && selected.length === expected.length && selected.every((value, i) => value === expected[i]);
  }

  async function confirmFieldValue(field) {
    let matchingSince = null;
    // Exige uma pequena janela estável para detectar rejeições assíncronas.
    return !!await waitFor(() => {
      if (!fieldValueMatches(field)) { matchingSince = null; return false; }
      if (matchingSince === null) matchingSince = Date.now();
      return Date.now() - matchingSince >= 60;
    }, 1500, 60);
  }

  let lastApplicationFeedback = null;
  function getCurrentCard(card) {
    if (!card?.dataset?.id) return card;
    const widget = document.getElementById('ticketai-widget');
    return Array.from(widget?.querySelectorAll('.ta-preset-card') || [])
      .find(current => current.dataset.id === card.dataset.id) || card;
  }

  function showFieldResults(card, fields, results, activeLabel = '') {
    if (card?.dataset?.id) {
      lastApplicationFeedback = {id: card.dataset.id, fields: fields.map(({label}) => ({label})),
        results: {...results}, activeLabel};
      // Busca e modo compacto recriam os cards durante uma aplicação.
      card = getCurrentCard(card);
    }
    const output = card?.querySelector('.ta-field-results');
    if (!output) return;
    output.hidden = false;
    output.textContent = fields.map(field => {
      const status = field.label === activeLabel ? 'Aplicando…'
        : results[field.label] === true ? 'Confirmado'
        : results[field.label] === false ? 'Não confirmado — confira no HubSpot' : 'Aguardando';
      return `${field.label}: ${status}`;
    }).join('\n');
    const summary = card.querySelector('.ta-field-summary');
    if (summary) {
      summary.hidden = false;
      const confirmed = fields.filter(field => results[field.label] === true).length;
      summary.textContent = activeLabel ? 'Aplicando…' : `${confirmed}/${fields.length} confirmados · Alt+W: detalhes`;
    }
  }

  let applyingPreset = false;
  let activePresetApplication = null;

  function isPresetApplicationCancelled() {
    return !!activePresetApplication?.cancelled;
  }

  function cancelActivePresetApplication() {
    if (!applyingPreset || !activePresetApplication) return false;
    activePresetApplication.cancelled = true;
    return true;
  }

  function clearPresetCancellationFeedback(card) {
    card = getCurrentCard(card);
    const output = card?.querySelector('.ta-field-results');
    const summary = card?.querySelector('.ta-field-summary');
    const progressBar = card?.querySelector('.ta-progress-bar');
    if (output) output.hidden = true;
    if (summary) summary.hidden = true;
    setProgress(progressBar, 0);
    card?.classList?.remove('ta-application-failed', 'ta-filled-warning', 'ta-filled');
    if (card) card.title = '';
  }

  function closePreviousFeedback() {
    const widget = document.getElementById('ticketai-widget');
    for (const previous of Array.from(widget?.querySelectorAll('.ta-preset-card') || [])) {
      const output = previous.querySelector('.ta-field-results');
      const summary = previous.querySelector('.ta-field-summary');
      if (output) output.hidden = true;
      if (summary) summary.hidden = true;
      previous.classList?.remove('ta-application-failed', 'ta-filled-warning', 'ta-filled');
      previous.title = '';
    }
  }

  async function applyPresetToCard(preset, card) {
    if (applyingPreset) return null;
    closePreviousFeedback();
    applyingPreset = true;
    activePresetApplication = {cancelled: false};
    card?.setAttribute('aria-busy', 'true');
    try {
      const workflowResult = await applyWorkflowBeforeClassification(preset, card);
      if (isPresetApplicationCancelled()) {
        clearPresetCancellationFeedback(card);
        return null;
      }
      const workflowFailed = Object.values(workflowResult).some(value => value === false);
      const classificationResult = workflowFailed ? {} : await applyPresetWithConfirmation(preset, card);
      if (isPresetApplicationCancelled()) {
        clearPresetCancellationFeedback(card);
        return null;
      }
      const result = {...workflowResult, ...classificationResult};
      const failed = result && Object.values(result).some(value => value === false);
      if (failed) {
        const current = getCurrentCard(card);
        current?.classList?.add('ta-application-failed');
      }
      if (!failed && card?.dataset?.id) {
        const current = getCurrentCard(card);
        const output = current?.querySelector('.ta-field-results');
        const summary = current?.querySelector('.ta-field-summary');
        if (output) output.hidden = true;
        if (summary) summary.hidden = true;
      }
      return result;
    } finally {
      applyingPreset = false;
      activePresetApplication = null;
      card?.setAttribute('aria-busy', 'false');
    }
  }

  async function applyPresetWithConfirmation(preset, card) {
    const t0 = performance.now();
    const progressBar = card ? card.querySelector('.ta-progress-bar') : null;

    // Presets criados pela Beta usam a estrutura dinâmica `fields`.
    // Presets antigos continuam usando descricao/produto/categoria/assunto.
    if (Array.isArray(preset.fields)) {
      const fields = preset.fields.filter(field => field && field.label && field.enabled !== false);

      const totalSteps = Math.max(fields.length, 1);
      let doneSteps = 0;
      const bump = () => {
        doneSteps++;
        const target = Math.min(92, Math.round((doneSteps / totalSteps) * 92));
        setProgress(progressBar, target);
      };

      const results = Object.create(null);

      for (const field of fields) {
        if (isPresetApplicationCancelled()) break;
        showFieldResults(card, fields, results, field.label);
        let value = field.value ?? '';
        let ok = true;

        if (Array.isArray(value)) {
          value = value.filter(Boolean);
        }

        const type = field.type || 'dropdown';
        if (Array.isArray(value) && value.length === 0 && type !== 'multi') value = '';

        try {
          if (type === 'textarea' || type === 'input') {
            const input = await waitForFieldTextInput(field.label);
            if (input) {
              fillTextInput(
                input,
                Array.isArray(value) ? value.join(', ') : String(value)
              );
            } else {
              ok = false;
            }
          } else if (type === 'search') {
            if (Array.isArray(value)) {
              for (const item of value) {
                if (item) ok = await fillSearchField(field.label, item) && ok;
              }
            } else {
              ok = await fillSearchField(field.label, String(value));
            }
          } else if (type === 'multi') {
            ok = await fillDynamicMultiField(field.label, value);
          } else {
            if (Array.isArray(value)) {
              for (const item of value) {
                if (item) ok = await fillDropdownField(field.label, item) && ok;
              }
            } else {
              ok = await fillDropdownField(field.label, String(value));
            }
          }

          results[field.label] = ok && await confirmFieldValue(field);
        } catch {
          // Mantém o retorno por campo mesmo se um controle desaparecer durante a ação.
          results[field.label] = false;
        }
        showFieldResults(card, fields, results);
        bump();
      }

      if (isPresetApplicationCancelled()) return results;

      simulateClick(document.body);
      // Fecha um dropdown que o usuário possa ter aberto durante a aplicação.
      setTimeout(() => simulateClick(document.body), 80);

      // Uma propriedade posterior pode invalidar uma seleção anterior.
      for (const field of fields) {
        if (results[field.label]) results[field.label] = fieldValueMatches(field);
      }
      showFieldResults(card, fields, results);
      card = getCurrentCard(card);

      const falhouAlgo = Object.values(results).some(v => v === false);
      debugLog(`preset "${preset.name}" concluído${falhouAlgo ? ' (com falha parcial)' : ''}`, t0);

      // O feedback só precisa sobreviver a reconstruções enquanto a aplicação
      // está em andamento ou terminou com erro. Depois de uma conclusão bem
      // sucedida, não o mantenha em `lastApplicationFeedback`, pois uma ação
      // estrutural (por exemplo, abrir a organização de grupos) recria os
      // cards e poderia restaurar indevidamente o painel já encerrado.
      if (!falhouAlgo) lastApplicationFeedback = null;

      if (card) {
        card.title = falhouAlgo
          ? 'Não foi possível confirmar: ' + Object.keys(results).filter(label => results[label] === false).join(', ')
          : '';
        setProgress(progressBar, 100);
        card.classList.add(falhouAlgo ? 'ta-application-failed' : 'ta-filled');
        if (!falhouAlgo) {
          const output = card.querySelector('.ta-field-results');
          const summary = card.querySelector('.ta-field-summary');
          if (output) output.hidden = true;
          if (summary) summary.hidden = true;
        }
        if (!falhouAlgo) {
          setTimeout(() => {
            card.classList.remove('ta-filled');
            setProgress(progressBar, 0);
          }, 900);
        }
      }

      return results;
    }

    // Presets legados usam a mesma confirmação, preservando as chaves retornadas.
    const confirmed = await applyPresetWithConfirmation({...preset, fields: betaLegacyFields(preset)}, card);
    return {
      descricao: confirmed['Descrição do ticket'] ?? true,
      produto: confirmed.Produto ?? true,
      categoria: confirmed.Categoria ?? true,
      assunto: confirmed.Assunto ?? true
    };
  }
  // Preenche um campo de múltipla seleção com uma ou várias opções.
  async function fillDynamicMultiField(labelText, values) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean);

    const btn = await waitForFieldButton(labelText);
    if (!btn) return false;

    if (btn.getAttribute('data-dropdown-open') !== 'true') {
      simulateClick(btn);
      await sleep(40);
    }

    const container = await waitFor(
      () => getOpenDropdownContainer(btn),
      1500, 50
    );

    if (!container || !await clearMultiSelection(container)) return false;

    let ok = true;

    for (const value of list) {
      if (btn.getAttribute('data-dropdown-open') !== 'true') {
        simulateClick(btn);
        await sleep(40);
      }

      const selected = await selectOptionByText(String(value), btn);
      ok = selected && ok;
      await sleep(30);
    }

    return ok;
  }

  // ---------------------------------------------------------------------
  // PRESETS DINÂMICOS - BETA
  // ---------------------------------------------------------------------

  function normalizeBetaField(field) {
    const value = Array.isArray(field?.value)
      ? field.value.filter(v => String(v ?? '').trim() !== '')
      : String(field?.value ?? '');
    return {
      label: String(field?.label || '').trim(),
      value,
      type: field?.type || betaInferTypeFromLabel(field?.label || '', 'dropdown'),
      enabled: field?.enabled !== false
    };
  }

  function betaFieldDisplayValue(field) {
    if (Array.isArray(field.value)) return field.value.join(', ');
    return String(field.value || '');
  }

  function betaInferTypeFromLabel(label, currentType) {
    if (currentType && currentType !== 'dropdown') return currentType;
    if (/descrição/i.test(label)) return 'textarea';
    if (/categoria/i.test(label)) return 'multi';
    if (/assunto/i.test(label)) return 'search';
    return currentType || 'dropdown';
  }

  function betaLegacyFields(preset) {
    if (!preset) {
      return [
        { label: 'Descrição do ticket', value: '', type: 'textarea', enabled: true },
        { label: 'Produto', value: '', type: 'dropdown', enabled: true },
        { label: 'Categoria', value: '', type: 'multi', enabled: true },
        { label: 'Assunto', value: '', type: 'search', enabled: true }
      ];
    }
    return [
      { label: 'Descrição do ticket', value: preset.descricao || '', type: 'textarea', enabled: !!preset.descricao },
      { label: 'Produto', value: preset.produto || '', type: 'dropdown', enabled: !!preset.produto },
      { label: 'Categoria', value: preset.categoria || '', type: 'multi', enabled: !!preset.categoria },
      { label: 'Assunto', value: preset.assunto || '', type: 'search', enabled: !!preset.assunto }
    ];
  }

  function openUnifiedPresetModal(preset = null, initialFields = null) {
    const overlay = document.getElementById('ta-modal-overlay');
    const modal = overlay?.querySelector('.ta-modal');
    if (!overlay || !modal) return;

    const isEditing = !!preset;
    let fields = (initialFields || []).map(normalizeBetaField);
    let mode = Array.isArray(preset?.fields) ? 'hubspot' : 'manual';

    modal.style.cssText = `width:100%;height:100%;max-width:none;max-height:none;padding:0;display:flex;flex-direction:column;overflow:hidden;background:#0D1117;color:#E6EDF3;border:0;border-radius:14px;box-shadow:none;`;
    modal.innerHTML = `
      <div class="ta-newpreset-header">
        <div class="ta-newpreset-heading">
          <span class="ta-newpreset-title-icon">${isEditing ? '✎' : '+'}</span>
          <div>
            <div class="ta-newpreset-title">${isEditing ? 'Editar preset' : 'Novo preset'}</div>
            <div class="ta-newpreset-subtitle">Defina o encerramento e importe a classificação atual.</div>
          </div>
        </div>
        <button id="ta-unified-close" class="ta-newpreset-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="ta-newpreset-body">
        <section class="ta-newpreset-section">
          <div class="ta-newpreset-section-title"><span>1</span><strong>Informações</strong></div>
          <div class="ta-newpreset-grid">
            <div class="ta-newpreset-main-field">
              <div class="ta-newpreset-label">Nome do preset</div>
              <input id="ta-unified-name" class="ta-newpreset-input" type="text" value="${String(preset?.name || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" placeholder="Ex.: Atualização cadastral">
            </div>
            <div class="ta-newpreset-main-field">
              <div class="ta-newpreset-label">Grupo</div>
              <div class="ta-group-picker"><input id="ta-unified-group" class="ta-newpreset-input" type="text" autocomplete="off" value="${String(preset?.group || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" placeholder="Escolha ou crie um grupo"><div id="ta-group-suggestions" class="ta-group-suggestions" hidden></div></div>
              <small class="ta-newpreset-hint">Escolha um grupo existente ou digite um novo.</small>
            </div>
          </div>
        </section>

        <section class="ta-newpreset-section">
          <div class="ta-newpreset-section-title"><span>2</span><strong>Dados atuais do ticket</strong></div>
          <div class="ta-newpreset-help">Importe Pipeline, Status e classificação de uma vez. O salvamento final no HubSpot continua manual.</div>
          <button id="ta-read-ticket-data" class="ta-newpreset-mode" type="button">
            <span class="ta-newpreset-mode-icon">↻</span>
            <span><strong>Ler dados atuais</strong><small>Importe Pipeline, Status e a classificação visível no HubSpot.</small></span>
          </button>
          <div class="ta-newpreset-fields" style="margin-top:7px">
            <div class="ta-newpreset-field"><div class="ta-newpreset-field-top"><input id="ta-workflow-pipeline-enabled" type="checkbox"><strong>Pipeline</strong></div><div class="ta-newpreset-field-bottom"><input id="ta-workflow-pipeline" class="ta-newpreset-input" type="text" placeholder="Ex.: [Sinistros] Pipeline de Suporte"></div></div>
            <div class="ta-newpreset-field"><div class="ta-newpreset-field-top"><input id="ta-workflow-status-enabled" type="checkbox"><strong>Status do ticket</strong></div><div class="ta-newpreset-field-bottom"><input id="ta-workflow-status" class="ta-newpreset-input" type="text" placeholder="Ex.: Fechado"></div></div>
          </div>
        </section>

        <div id="ta-unified-status" class="ta-newpreset-status"></div>

        <section class="ta-newpreset-section ta-newpreset-fields-section">
          <div class="ta-newpreset-section-head">
            <div class="ta-newpreset-section-title"><span>3</span><strong>Campos</strong></div>
            <span id="ta-unified-count" class="ta-newpreset-count"></span>
          </div>
          <div class="ta-newpreset-help">Selecione os campos e ajuste os valores que o preset deverá aplicar.</div>
          <div id="ta-unified-fields" class="ta-newpreset-fields"></div>
          <button id="ta-unified-add" class="ta-newpreset-add" type="button">＋ Adicionar campo</button>
        </section>
      </div>
      <div class="ta-newpreset-footer"><button id="ta-unified-cancel" class="ta-newpreset-cancel" type="button">Cancelar</button><button id="ta-unified-save" class="ta-newpreset-save" type="button">Salvar</button></div>
    `;

    const fieldsContainer = modal.querySelector('#ta-unified-fields');
    const countEl = modal.querySelector('#ta-unified-count');
    const statusEl = modal.querySelector('#ta-unified-status');
    const readTicketDataBtn = modal.querySelector('#ta-read-ticket-data');
    const groupInput = modal.querySelector('#ta-unified-group');
    const groupSuggestions = modal.querySelector('#ta-group-suggestions');
    const workflow = normalizeWorkflow(preset?.workflow);
    const workflowPipeline = modal.querySelector('#ta-workflow-pipeline');
    const workflowStatus = modal.querySelector('#ta-workflow-status');
    const workflowPipelineEnabled = modal.querySelector('#ta-workflow-pipeline-enabled');
    const workflowStatusEnabled = modal.querySelector('#ta-workflow-status-enabled');
    workflowPipeline.value = workflow.pipeline;
    workflowStatus.value = workflow.status;
    workflowPipelineEnabled.checked = !!workflow.pipeline;
    workflowStatusEnabled.checked = !!workflow.status;

    const renderGroupSuggestions = () => {
      const query = groupInput.value.trim().toLowerCase();
      const matches = getGroupNames().filter(group => !query || group.toLowerCase().includes(query));
      groupSuggestions.innerHTML = matches.map(group => `<button type="button" class="ta-group-suggestion">${escapeHtml(group)}</button>`).join('');
      groupSuggestions.hidden = matches.length === 0;
      groupSuggestions.querySelectorAll('.ta-group-suggestion').forEach(button => {
        button.onclick = () => { groupInput.value = button.textContent; groupSuggestions.hidden = true; };
      });
    };
    groupInput.onfocus = renderGroupSuggestions;
    groupInput.oninput = renderGroupSuggestions;
    groupInput.onblur = () => setTimeout(() => { groupSuggestions.hidden = true; }, 120);

    const setStatus = (text='', kind='') => { statusEl.textContent=text; statusEl.className='ta-newpreset-status'+(kind?' '+kind:''); };
    const syncModes = () => { if (readTicketDataBtn) readTicketDataBtn.classList.toggle('is-active', mode === 'hubspot'); };

    function renderFields() {
      fieldsContainer.innerHTML='';
      countEl.textContent=`${fields.filter(f=>f.enabled!==false).length}/${fields.length} selecionado${fields.length===1?'':'s'}`;
      if(!fields.length){const e=document.createElement('div');e.className='ta-newpreset-empty';e.textContent='Nenhum campo adicionado. Clique em “＋ Adicionar campo”.';fieldsContainer.appendChild(e);return;}
      fields.forEach((field,index)=>{
        const row=document.createElement('div');row.className='ta-newpreset-field'+(field.enabled===false?' is-disabled':'');
        const top=document.createElement('div');top.className='ta-newpreset-field-top';
        const check=document.createElement('input');check.type='checkbox';check.checked=field.enabled!==false;check.onchange=()=>{field.enabled=check.checked;renderFields();};
        const order=document.createElement('span');order.className='ta-newpreset-order';order.textContent=index+1;
        const label=document.createElement('input');
        label.type='text';label.className='ta-newpreset-input ta-field-label-input';
        label.value=field.label;label.placeholder='Nome da propriedade';
        label.setAttribute('aria-label','Nome da propriedade');
        const remove=document.createElement('button');remove.type='button';remove.className='ta-newpreset-remove';remove.innerHTML='<span aria-hidden="true">×</span>';remove.title='Remover campo';remove.setAttribute('aria-label','Remover campo');remove.onclick=()=>{fields.splice(index,1);renderFields();};
        top.append(check,order,label,remove);
        const bottom=document.createElement('div');bottom.className='ta-newpreset-field-bottom';
        field.type=betaInferTypeFromLabel(field.label,field.type);
        const value=document.createElement('input');
        value.type='text';
        value.className='ta-newpreset-input ta-field-value-input';
        value.value=betaFieldDisplayValue(field);
        value.placeholder=field.type==='multi'?'Valores separados por vírgula':'Valor do campo';
        value.oninput=()=>field.value=field.type==='multi'?value.value.split(',').map(v=>v.trim()).filter(Boolean):value.value;
        label.oninput=()=>{
          field.label=label.value;
          field.type=betaInferTypeFromLabel(field.label,'dropdown');
          value.placeholder=field.type==='multi'?'Valores separados por vírgula':'Valor do campo';
          value.oninput();
        };
        bottom.append(value);
        row.append(top,bottom);
        fieldsContainer.appendChild(row);
      });
    }

    const readTicketData = () => {
      const current = readCurrentWorkflow();
      if (current.pipeline) { workflowPipeline.value = current.pipeline; workflowPipelineEnabled.checked = true; }
      if (current.status) { workflowStatus.value = current.status; workflowStatusEnabled.checked = true; }
      const detected = readCurrentClassification();
      if (detected.length) {
        fields = detected.map(f => normalizeBetaField({...f, enabled:String(betaFieldDisplayValue(f)).trim() !== '' && !/proprietário do ticket/i.test(f.label)}));
        mode = 'hubspot';
        renderFields();
      }
      const feedback = describeTicketImport(current, detected.length);
      syncModes();
      setStatus(feedback.text, feedback.kind);
    };

    if (readTicketDataBtn) readTicketDataBtn.onclick=readTicketData;
    modal.querySelector('#ta-unified-add').onclick=()=>{fields.push({label:'',value:'',type:'dropdown',enabled:true});renderFields();const labels=fieldsContainer.querySelectorAll('.ta-field-label-input');if(labels.length)labels[labels.length-1].focus();};
    modal.querySelector('#ta-unified-close').onclick=closeModal;
    modal.querySelector('#ta-unified-cancel').onclick=closeModal;
    modal.querySelector('#ta-unified-save').onclick=async()=>{
      const name=modal.querySelector('#ta-unified-name').value.trim();
      const typedGroup=modal.querySelector('#ta-unified-group').value.trim();
      const existingGroup=getGroupNames().find(group => group.toLowerCase() === typedGroup.toLowerCase());
      const group=existingGroup || typedGroup || 'GERAL';
      if(!name){await showAlertModal('Informe um nome para o preset.');return;}
      const clean=fields.map(normalizeBetaField).filter(f=>f.enabled);
      if(clean.some(f=>!f.label)){await showAlertModal('Informe o nome de cada campo selecionado.');return;}
      if(!clean.length){await showAlertModal('Adicione ou selecione pelo menos um campo para salvar o preset.');return;}
      const savedWorkflow = {
        pipeline: workflowPipelineEnabled.checked ? workflowPipeline.value.trim() : '',
        status: workflowStatusEnabled.checked ? workflowStatus.value.trim() : ''
      };
      const data={name,group,fields:clean,...((savedWorkflow.pipeline || savedWorkflow.status) ? {workflow:savedWorkflow} : {})};
      lastApplicationFeedback = null;
      if(isEditing){const existing=presets.find(x=>x.id===preset.id);if(existing){Object.assign(existing,data);if(!data.workflow)delete existing.workflow;}}else{presets.push({id:generateId(),...data});}
      closeModal();save();
    };

    overlay.classList.add('is-visible');syncModes();renderFields();setStatus(mode==='hubspot'?'Preset dinâmico: revise os campos antes de salvar.':'',mode==='hubspot'?'success':'');
    setTimeout(()=>modal.querySelector('#ta-unified-name')?.focus(),0);
  }


  // ---------------------------------------------------------------------
  // ESTILOS
  // ---------------------------------------------------------------------

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #ticketai-widget {
        position: fixed; top: 20px; right: 20px; width: 380px; height: 650px;
        min-width: 280px; min-height: 300px; background: #0D1117;
        border: 1px solid #2A313B; border-radius: 16px;
        z-index: 2147483647; display: flex; flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6); font-family: 'Inter', sans-serif;
        color: #E6EDF3; overflow: visible;
      }
      .ta-resizer { position: absolute; top: 0; width: 6px; height: 100%; cursor: ew-resize; z-index: 10001; }
      .ta-resizer-left { left: 0; }
      .ta-resizer-right { right: 0; }
      .ta-resizer-vertical { position: absolute; left: 0; width: 100%; height: 6px; cursor: ns-resize; z-index: 10001; }
      .ta-resizer-top { top: 0; }
      .ta-resizer-bottom { bottom: 0; }
      #ticketai-widget.is-minimized { height: 36px !important; min-height: 36px !important; overflow: hidden; }
      #ticketai-widget.is-minimized .ta-body, #ticketai-widget.is-minimized .ta-footer { display: none !important; }
      #ticketai-widget.is-peek { height: 115px !important; min-height: 115px !important; overflow: hidden; }
      #ticketai-widget.is-peek .ta-footer { display: none !important; }
      #ticketai-widget.is-peek .ta-search-row { display: none !important; }
      #ticketai-widget.is-peek .ta-selection-toolbar { display: none !important; }
      #ticketai-widget.is-peek .ta-body { padding: 8px 15px; }
      #ticketai-widget.is-peek .ta-preset-card { margin-bottom: 0; }
      #ticketai-widget.ta-anim { transition: height 0.25s ease; }
      .ta-header { padding: 0 12px; height: 36px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2A313B; cursor: move; flex-shrink: 0; border-radius: 16px 16px 0 0; }
      .ta-header span.ta-title { font-weight: 700; font-size: 13px; pointer-events: none; letter-spacing: 0.2px; }
      .ta-header span.ta-title .ta-title-ticket { color: #E6EDF3; }
      .ta-header span.ta-title .ta-title-ai { color: #F59E0B; }
      .ta-btn-group { display: flex; gap: 10px; z-index: 10002; align-items: center; }
      .ta-help-popover { position: absolute; top: calc(100% + 8px); right: 0; background: #161B22; border: 1px solid #2A313B; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 6px; min-width: 220px; box-shadow: 0 16px 34px rgba(0,0,0,0.55); opacity: 0; transform: translateY(-6px) scale(0.97); pointer-events: none; transition: 0.18s ease; z-index: 10010; cursor: default; }
      .ta-help-popover.is-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .ta-help-title { font-size: 10px; font-weight: 800; color: #9BA4B5; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2px; }
      .ta-help-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; color: #E6EDF3; }
      .ta-help-key { font-size: 10px; font-weight: 700; color: #F59E0B; background: rgba(245,158,11,0.12); border-radius: 5px; padding: 2px 6px; flex-shrink: 0; white-space: nowrap; }
      .ta-h-btn { cursor: pointer; font-size: 13px; opacity: 0.55; transition: 0.2s; line-height: 1; color: #9BA4B5; }
      .ta-h-btn:hover { opacity: 1; color: #E6EDF3; }
      .ta-h-btn#ta-btn-close:hover { color: #EF4444; }
      .ta-body { flex: 1; overflow-y: auto; padding: 15px; margin-right: 6px; display: flex; flex-direction: column; }
      .ta-body::-webkit-scrollbar { width: 6px; }
      .ta-body::-webkit-scrollbar-track { background: transparent; }
      .ta-body::-webkit-scrollbar-thumb { background: #2A313B; border-radius: 10px; }
      .ta-body::-webkit-scrollbar-thumb:hover { background: #3a4452; }
      .ta-search-row { display: flex; gap: 8px; margin-bottom: 10px; flex-shrink: 0; }
      .ta-organize-groups { width:34px; flex:0 0 34px; border:1px solid #2A313B; border-radius:7px; background:#161B22; color:#8B949E; cursor:pointer; }
      .ta-organize-groups:hover, .ta-organize-groups.is-active { border-color:#F59E0B; color:#F59E0B; }
      .ta-group-label.ta-group-organizing { cursor:grab; border:1px dashed #596579; padding:5px 7px; border-radius:6px; }
      .ta-group-label.ta-group-organizing, .ta-group-label.ta-group-organizing * { user-select:none; }
      #ticketai-widget.ta-organizing-groups .ta-preset-card { pointer-events:none; user-select:none; }
      .ta-group-label.ta-group-organizing.is-dragging { cursor:grabbing; border-color:#F59E0B; background:rgba(245,158,11,.18); box-shadow:0 0 0 2px rgba(245,158,11,.22); color:#F59E0B; opacity:1; animation:ta-group-drag-pulse .9s ease-in-out infinite; }
      .ta-group-drag-ghost { position:fixed; z-index:2147483647; pointer-events:none; box-sizing:border-box; padding:7px 9px; border:1px solid #F59E0B; border-radius:6px; background:#242A33; color:#F59E0B; font-size:10px; font-weight:700; box-shadow:0 14px 24px rgba(0,0,0,.55), 0 0 0 2px rgba(245,158,11,.35); opacity:.9; transform:rotate(1deg) scale(1.02); }
      @keyframes ta-group-drag-pulse { 0%,100% { transform:translateY(0) scale(1); box-shadow:0 2px 0 rgba(245,158,11,.18), 0 0 0 2px rgba(245,158,11,.28); } 50% { transform:translateY(-3px) scale(1.012); box-shadow:0 10px 0 -3px rgba(245,158,11,.16), 0 14px 20px rgba(0,0,0,.42), 0 0 0 2px rgba(245,158,11,.55); } }
      @media (prefers-reduced-motion: reduce) { .ta-group-label.ta-group-organizing.is-dragging { animation:none; } }
      .ta-group-label.ta-group-organizing.is-drag-over { border-color:#F59E0B; background:rgba(245,158,11,.1); }
      .ta-group-order-controls { float:right; display:flex; gap:4px; margin-top:-2px; }
      .ta-group-order-controls button { width:24px; height:22px; display:inline-flex; align-items:center; justify-content:center; padding:0; border:1px solid #3A4452; border-radius:6px; background:rgba(22,27,34,.72); color:#9BA4B5; cursor:pointer; font-size:0; line-height:1; transition:background .15s ease,border-color .15s ease,color .15s ease,transform .1s ease; }
      .ta-group-order-controls button::before { font-size:13px; font-weight:800; line-height:1; }
      .ta-group-order-controls button:first-child::before { content:'⌃'; transform:translateY(1px); }
      .ta-group-order-controls button:last-child::before { content:'⌄'; transform:translateY(-1px); }
      .ta-group-order-controls button:hover { border-color:#F59E0B; background:rgba(245,158,11,.12); color:#F59E0B; }
      .ta-group-order-controls button:active { transform:scale(.94); }
      .ta-search-input { flex: 1; min-width: 0; background: #0D1117; border: 1px solid #2A313B; color: #E6EDF3; border-radius: 8px; padding: 8px 12px; font-size: 12px; outline: none; box-sizing: border-box; transition: 0.15s; }
      .ta-search-input::placeholder { color: #6B7280; }
      .ta-search-input:focus { border-color: #F59E0B; box-shadow: 0 0 0 3px rgba(245,158,11,0.12); }
      .ta-highlight { background: rgba(245,158,11,0.35); color: #fff; border-radius: 3px; padding: 0 1px; }
      .ta-btn-square { width: 34px; height: 34px; flex-shrink: 0; border-radius: 8px; background: transparent; color: #F59E0B; border: 1px solid #F59E0B; font-weight: 700; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: 0.15s; }
      .ta-btn-square:hover { background: #F59E0B; color: #0D1117; }
      .ta-group-label { font-size: 10px; color: #9BA4B5; text-transform: uppercase; letter-spacing: 0.6px; margin: 14px 0 6px; font-weight: 700; }
      .ta-group-label:first-child { margin-top: 0; }
      .ta-preset-card { position: relative; overflow: hidden; background: #161B22; border: 1px solid #2A313B; border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; display: flex; flex-direction: column; gap: 0; }
      .ta-preset-card:hover { background: #1E242C; }
      .ta-preset-card.ta-filled { border-color: #F59E0B !important; box-shadow: 0 0 0 2px rgba(245,158,11,0.25); }
      .ta-preset-card.ta-application-failed { border-color: #EF4444 !important; box-shadow: 0 0 0 2px rgba(239,68,68,0.28); }
      .ta-field-results { white-space: pre-line; font-size: 11px; line-height: 1.5; color: #E6EDF3; margin-top: 8px; overflow-wrap: anywhere; }
      .ta-field-results[hidden] { display: none; }
      .ta-field-summary { display: none; font-size: 10px; margin-top: 5px; color: #E6EDF3; }
      #ticketai-widget.is-peek .ta-field-results { display: none; }
      #ticketai-widget.is-peek .ta-field-summary:not([hidden]) { display: block; }
      .ta-progress-bar { position: absolute; top: 0; left: 0; height: 2px; width: 0%; background: #F59E0B; border-radius: 2px 2px 0 0; transition: width 0.28s ease; }
      .ta-card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .ta-preset-name { font-size: 13px; font-weight: 500; color: #E6EDF3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; line-height: 1.3; }
      .ta-card-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .ta-preset-actions { display: flex; gap: 4px; align-items: center; }
      .ta-icon-btn { font-size: 12px; opacity: 0.85; cursor: pointer; transition: 0.15s; width: 21px; height: 21px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
      .ta-icon-btn.ta-edit { color: #F59E0B; }
      .ta-icon-btn.ta-edit:hover { background: rgba(245,158,11,0.14); opacity: 1; }
      .ta-icon-btn.ta-dup { color: #E6EDF3; }
      .ta-icon-btn.ta-dup:hover { background: rgba(230,237,243,0.1); opacity: 1; }
      .ta-icon-btn.ta-danger { color: #EF4444; }
      .ta-icon-btn.ta-danger:hover { background: rgba(239,68,68,0.14); opacity: 1; }
      .ta-preset-checkbox-wrap { display: none; flex-shrink: 0; }
      .ta-preset-card.select-mode-active .ta-preset-checkbox-wrap { display: flex; }
      .ta-preset-card.select-mode-active .ta-preset-actions { display: none; }
      .ta-preset-card.select-mode-active.is-selected { border-color: #F59E0B; background: rgba(245,158,11,0.10); }
      .ta-preset-card.select-mode-active.is-selected::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; background: #F59E0B; }
      .ta-checkbox { width: 16px; height: 16px; accent-color: #F59E0B; cursor: pointer; }
      .ta-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; gap: 6px; flex: 1; }
      .ta-empty-icon { font-size: 26px; margin-bottom: 6px; opacity: 0.7; }
      .ta-empty-state > div:not(.ta-empty-icon):not(.ta-empty-sub) { color: #E6EDF3; font-size: 13px; font-weight: 600; }
      .ta-empty-sub { font-size: 11px; color: #9BA4B5; }
      .ta-empty-cta { margin-top: 12px; }
      .ta-preset-count { text-align: center; font-size: 10px; color: #9BA4B5; margin-top: 4px; }
      .ta-footer { padding: 12px 15px 8px; background: #0D1117; border-top: 1px solid #2A313B; flex-shrink: 0; border-radius: 0 0 16px 16px; }
      .ta-footer-row { display: flex; gap: 8px; }
      .ta-btn-add { display: flex; align-items: center; justify-content: center; gap: 7px; flex: 1; background: transparent; color: #F59E0B; border: 1px solid #F59E0B; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 0.6px; font-size: 11px; transition: 0.15s; }
      .ta-btn-add:hover { background: #F59E0B; color: #0D1117; }
      .ta-gear-wrap { position: relative; flex-shrink: 0; }
      .ta-btn-gear { width: 38px; height: 100%; min-height: 38px; border-radius: 8px; background: transparent; border: 1px solid #2A313B; color: #9BA4B5; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.15s; }
      .ta-btn-gear:hover, .ta-btn-gear.is-active { border-color: #F59E0B; color: #F59E0B; }
      .ta-popover { position: absolute; bottom: calc(100% + 8px); right: 0; background: #161B22; border: 1px solid #2A313B; border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 7px; min-width: 260px; max-width: 300px; box-shadow: 0 20px 45px rgba(0,0,0,0.6); opacity: 0; transform: translateY(6px) scale(0.97); pointer-events: none; transition: 0.18s ease; z-index: 10010; }
      .ta-popover.is-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .ta-popover-header { display: flex; align-items: center; gap: 8px; padding: 2px 4px 6px; border-bottom: 1px solid #2A313B; margin-bottom: 2px; }
      .ta-popover-header-icon { color: #F59E0B; font-size: 14px; }
      .ta-popover-header-title { flex: 1; font-size: 13px; font-weight: 700; color: #E6EDF3; text-transform: uppercase; letter-spacing: 0.4px; }
      .ta-popover-close { cursor: pointer; font-size: 13px; color: #9BA4B5; opacity: 0.8; transition: 0.15s; line-height: 1; }
      .ta-popover-close:hover { color: #E6EDF3; opacity: 1; }
      .ta-popover-item { position: relative; display: flex; align-items: center; gap: 12px; font-size: 13px; padding: 10px 12px; background: rgba(255,255,255,0.02); color: #E6EDF3; border: 1px solid transparent; border-radius: 10px; cursor: pointer; transition: 0.15s; text-align: left; font-weight: 500; width: 100%; }
      .ta-popover-item:hover { background: #1E242C; }
      .ta-popover-item-icon { font-size: 14px; line-height: 1; flex-shrink: 0; width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }
      .ta-icon-amber { background: rgba(245,158,11,0.14); color: #F59E0B; }
      .ta-icon-blue { background: rgba(56,189,248,0.14); color: #38BDF8; }
      .ta-icon-danger { background: rgba(239,68,68,0.14); color: #EF4444; }
      .ta-popover-item-text { flex: 1; }
      .ta-popover-chevron { color: #6B7280; font-size: 15px; flex-shrink: 0; }
      .ta-popover-accent-amber { border-left: 3px solid #F59E0B; padding-left: 10px; }
      .ta-popover-accent-danger { border-left: 3px solid #EF4444; padding-left: 10px; }
      .ta-text-danger { color: #EF4444; }
      .ta-selection-toolbar { display: none; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 6px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; font-size: 10px; color: #F59E0B; flex-shrink: 0; overflow: hidden; }
      .ta-selection-toolbar.is-visible { display: flex; }
      .ta-selection-toolbar #ta-selection-count { flex: 0 0 auto; white-space: nowrap; }
      .ta-selection-actions { display: flex; gap: 6px; flex-wrap: nowrap; align-items: center; flex: 0 0 auto; }
      .ta-selection-actions button { font-size: 9px; padding: 5px 8px; white-space: nowrap; background: transparent; color: #E6EDF3; border: 1px solid #2A313B; border-radius: 7px; cursor: pointer; text-transform: uppercase; font-weight: bold; transition: 0.15s; }
      .ta-selection-actions button:hover { border-color: #9BA4B5; }
      .ta-selection-actions .ta-danger-inline { color: #EF4444; border-color: rgba(239,68,68,0.35); }
      .ta-selection-actions .ta-danger-inline:hover { border-color: #EF4444; background: rgba(239,68,68,0.1); }
      .ta-dev-footer { text-align: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid #2A313B; display: flex; flex-direction: column; gap: 1px; }
      .ta-dev-label { font-size: 8px; color: #6B7280; text-transform: uppercase; letter-spacing: 2px; line-height: 1.2; }
      .ta-dev-name { color: #F59E0B; font-weight: 800; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; line-height: 1.2; }
      .ta-version { font-size: 8px; color: #6B7280; margin-top: 1px; letter-spacing: 0.5px; line-height: 1; }
      .ta-undo-toast { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #161B22; border: 1px solid #2A313B; border-radius: 10px; padding: 0 12px; font-size: 11px; color: #E6EDF3; overflow: hidden; max-height: 0; opacity: 0; margin-bottom: 0; flex-shrink: 0; transition: max-height 0.2s ease, opacity 0.2s ease, margin-bottom 0.2s ease, padding 0.2s ease; }
      .ta-undo-toast.is-visible { max-height: 40px; opacity: 1; margin-bottom: 10px; padding: 9px 12px; }
      .ta-undo-toast button { background: none; border: none; color: #F59E0B; font-weight: 800; cursor: pointer; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; flex-shrink: 0; }
      .ta-undo-toast button:hover { text-decoration: underline; }
      .ta-modal-overlay { position: absolute; inset: 0; box-sizing: border-box; padding: 0; background: rgba(13,17,23,.98); display: flex; align-items: stretch; justify-content: stretch; z-index: 10050; opacity: 0; pointer-events: none; transition: opacity .15s ease; border-radius: 16px; overflow: hidden; }
      .ta-modal-overlay.is-visible { opacity: 1; pointer-events: auto; }
      .ta-modal { background: #0D1117; border: 0; border-radius: 16px; padding: 0; width: 100%; max-width: none; height: 100%; max-height: none; display: flex; flex-direction: column; gap: 0; box-shadow: none; overflow: hidden; }
      .ta-modal::-webkit-scrollbar, .ta-newpreset-body::-webkit-scrollbar { width: 7px; }
      .ta-modal::-webkit-scrollbar-track, .ta-newpreset-body::-webkit-scrollbar-track { background: transparent; }
      .ta-modal::-webkit-scrollbar-thumb, .ta-newpreset-body::-webkit-scrollbar-thumb { background: #303846; border-radius: 10px; }
      .ta-modal::-webkit-scrollbar-thumb:hover, .ta-newpreset-body::-webkit-scrollbar-thumb:hover { background: #465264; }
      .ta-modal, .ta-newpreset-body { scrollbar-width:thin; scrollbar-color:#303846 transparent; }
      .ta-modal::-webkit-scrollbar-button, .ta-newpreset-body::-webkit-scrollbar-button { display:none; width:0; height:0; }
      .ta-modal-title { font-size: 15px; font-weight: 800; color: #E6EDF3; letter-spacing: .1px; }
      .ta-modal-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 17px 20px; border-bottom: 1px solid #2A313B; flex-shrink: 0; }
      .ta-modal-close { width: 30px; height: 30px; display:flex; align-items:center; justify-content:center; cursor: pointer; font-size: 19px; opacity: .65; transition: .15s; line-height: 1; color: #9BA4B5; border-radius: 7px; }
      .ta-modal-close:hover { opacity: 1; color: #E6EDF3; background: #1E242C; }
      .ta-field-label { font-size: 10px; color: #9BA4B5; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; letter-spacing: .55px; }
      .ta-field-input { width: 100%; background: #161B22; color: #E6EDF3; border: 1px solid #2A313B; border-radius: 8px; padding: 9px 10px; outline: none; font-size: 12px; box-sizing: border-box; transition: .15s; }
      .ta-field-input::placeholder { color: #626D7C; }
      .ta-field-input:focus { border-color: #F59E0B; box-shadow: 0 0 0 3px rgba(245,158,11,.10); }
      .ta-modal-actions { display: flex; gap: 8px; margin-top: 6px; }
      .ta-cancel-link { background: transparent; color: #9BA4B5; border: none; font-size: 11px; cursor: pointer; margin-top: 5px; text-decoration: underline; text-align: center; width: 100%; display: block; transition: .15s; }
      .ta-cancel-link:hover { color: #E6EDF3; }
      .ta-newpreset-header { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:52px; padding:10px 13px; border-bottom:1px solid #2A313B; flex-shrink:0; background:#0D1117; }
      .ta-newpreset-heading { display:flex; align-items:center; gap:9px; min-width:0; }
      .ta-newpreset-title-icon { width:24px; height:24px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(245,158,11,.45); border-radius:7px; color:#F59E0B; font-size:15px; font-weight:800; flex-shrink:0; }
      .ta-newpreset-title { font-size:13px; font-weight:800; color:#E6EDF3; letter-spacing:.1px; }
      .ta-newpreset-subtitle { margin-top:2px; color:#6F7A8A; font-size:9px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ta-newpreset-close { width:27px; height:27px; display:flex; align-items:center; justify-content:center; border:0; background:transparent; color:#7D8797; font-size:19px; line-height:1; cursor:pointer; border-radius:7px; padding:0; flex-shrink:0; }
      .ta-newpreset-close:hover { color:#E6EDF3; background:#161B22; }
      .ta-newpreset-body { padding:12px 13px; overflow:auto; min-height:0; background:#0D1117; }
      .ta-newpreset-grid { display:grid; grid-template-columns:1fr; gap:8px; }
      .ta-newpreset-main-field { min-width:0; }
      .ta-newpreset-label { font-size:9px; font-weight:800; color:#8B95A5; text-transform:uppercase; letter-spacing:.55px; margin-bottom:5px; }
      .ta-newpreset-section-label { margin-top:13px; }
      .ta-newpreset-input { width:100%; box-sizing:border-box; height:34px; background:#161B22; color:#E6EDF3; border:1px solid #2A313B; border-radius:7px; padding:7px 9px; font-size:11px; outline:none; }
      .ta-newpreset-input::placeholder { color:#626D7C; }
      .ta-newpreset-input:focus { border-color:#F59E0B; box-shadow:0 0 0 2px rgba(245,158,11,.08); }
      .ta-newpreset-hint { display:block; margin-top:4px; color:#8B949E; font-size:10px; }
      .ta-group-picker { position:relative; }
      .ta-group-suggestions { position:absolute; z-index:20; top:calc(100% + 4px); left:0; right:0; max-height:170px; overflow-y:auto; padding:5px; background:#1C2128; border:1px solid #3A4452; border-radius:8px; box-shadow:0 10px 24px rgba(0,0,0,.45); }
      .ta-group-suggestions { scrollbar-width:thin; scrollbar-color:#3A4452 transparent; }
      .ta-group-suggestions::-webkit-scrollbar { width:6px; }
      .ta-group-suggestions::-webkit-scrollbar-track { background:transparent; }
      .ta-group-suggestions::-webkit-scrollbar-thumb { background:#3A4452; border-radius:10px; }
      .ta-group-suggestions::-webkit-scrollbar-thumb:hover { background:#596579; }
      .ta-group-suggestions::-webkit-scrollbar-button { display:none; width:0; height:0; }
      .ta-group-suggestions[hidden] { display:none; }
      .ta-group-suggestion { display:block; width:100%; padding:8px 9px; border:0; border-radius:5px; background:transparent; color:#E6EDF3; text-align:left; font:inherit; font-size:11px; cursor:pointer; }
      .ta-group-suggestion:hover { background:#2A313B; color:#F59E0B; }
      .ta-newpreset-modes { display:grid; grid-template-columns:1fr 1fr; gap:7px; }

      .ta-newpreset-origin-legend {
        margin-top: 6px;
        color: #626D7C;
        font-size: 8px;
        line-height: 1.35;
      }
      .ta-newpreset-mode {
        min-height: 45px;
        padding: 8px 10px;
      }
      .ta-newpreset-mode-icon {
        width: 27px;
        height: 27px;
      }
      .ta-newpreset-mode strong {
        font-size: 10px;
        margin: 0;
      }
      .ta-newpreset-mode { display:flex; align-items:center; gap:8px; text-align:left; padding:9px; background:#11161D; color:#E6EDF3; border:1px solid #2A313B; border-radius:8px; cursor:pointer; transition:.15s; min-height:51px; box-sizing:border-box; }
      .ta-newpreset-mode:hover { border-color:#465264; background:#151B23; }
      .ta-newpreset-mode.is-active { border-color:#F59E0B; background:rgba(245,158,11,.06); box-shadow:inset 0 0 0 1px rgba(245,158,11,.10); }
      .ta-newpreset-mode-icon { width:25px; height:25px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border-radius:6px; background:#1A2029; color:#E6EDF3; font-size:12px; }
      .ta-newpreset-mode strong { display:block; font-size:10px; margin-bottom:2px; }
      .ta-newpreset-mode small { display:block; color:#6F7A8A; font-size:8px; line-height:1.3; }
      .ta-newpreset-status { min-height:13px; margin:6px 0 1px; color:#6F7A8A; font-size:9px; line-height:1.3; }
      .ta-newpreset-status.success { color:#8FD694; }
      .ta-newpreset-status.error { color:#FCA5A5; }
      .ta-newpreset-section-head { display:flex; align-items:flex-end; justify-content:space-between; gap:8px; margin-top:10px; }
      .ta-newpreset-help { color:#626D7C; font-size:8px; line-height:1.3; }
      .ta-newpreset-count { flex-shrink:0; color:#F59E0B; font-size:9px; font-weight:800; }
      .ta-newpreset-fields { display:flex; flex-direction:column; gap:6px; margin-top:6px; }
      .ta-newpreset-field { padding:7px; background:#11161D; border:1px solid #2A313B; border-radius:8px; transition:.15s; }
      .ta-newpreset-field:hover { border-color:#354052; }
      .ta-newpreset-field.is-disabled { opacity:.48; }
      .ta-newpreset-field-top { display:flex; align-items:center; gap:5px; }
      .ta-newpreset-order { width:15px; color:#5F6978; font-size:8px; text-align:center; flex-shrink:0; }
      .ta-field-label-input { flex:1; min-width:0; }
      .ta-newpreset-remove { width:27px; height:27px; flex-shrink:0; border:1px solid #3A2222; background:rgba(239,68,68,.05); color:#EF4444; border-radius:6px; cursor:pointer; font-size:11px; }
      .ta-newpreset-remove:hover { background:rgba(239,68,68,.12); }
      .ta-newpreset-field-bottom { display:flex; gap:5px; margin-top:5px; padding-left:20px; }
      .ta-newpreset-select { width:94px; flex-shrink:0; height:29px; background:#161B22; color:#C9D1D9; border:1px solid #2A313B; border-radius:6px; padding:5px 7px; font-size:8px; outline:none; }
      .ta-field-value-input { flex:1; min-width:0; height:29px; }
      .ta-newpreset-empty { padding:14px; text-align:center; color:#626D7C; border:1px dashed #2A313B; border-radius:8px; font-size:9px; }
      .ta-newpreset-add { width:100%; margin-top:7px; padding:7px; border:1px dashed #394454; background:transparent; color:#F59E0B; border-radius:7px; cursor:pointer; font-size:9px; font-weight:800; }
      .ta-newpreset-add:hover { background:rgba(245,158,11,.04); border-color:#F59E0B; }
      .ta-newpreset-footer { display:flex; gap:7px; padding:9px 13px; border-top:1px solid #2A313B; background:#0D1117; flex-shrink:0; }
      .ta-newpreset-cancel, .ta-newpreset-save { height:34px; border-radius:7px; cursor:pointer; font-size:10px; font-weight:800; transition:.15s; }
      .ta-newpreset-cancel { flex:0 0 92px; background:#161B22; color:#9BA4B5; border:1px solid #2A313B; }
      .ta-newpreset-cancel:hover { background:#1E242C; color:#E6EDF3; border-color:#465264; }
      .ta-newpreset-save { flex:1; background:transparent; color:#F59E0B; border:1px solid #F59E0B; text-transform:uppercase; letter-spacing:.6px; }
      .ta-newpreset-save:hover { background:#F59E0B; color:#0D1117; }
      @media (max-width: 360px) {
        .ta-newpreset-grid, .ta-newpreset-modes { grid-template-columns:1fr; }
        .ta-newpreset-body { padding:10px; }
        .ta-newpreset-footer { padding:8px 10px; }
        .ta-newpreset-subtitle { display:none; }
      }

      .ta-confirm-icon { font-size: 30px; text-align: center; margin: 4px 0 2px; }
      .ta-confirm-message { font-size: 12px; color: #9BA4B5; line-height: 1.5; text-align: center; }
      .ta-confirm-cancel-btn { background: transparent; color: #9BA4B5; border: 1px solid #2A313B; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 0.6px; font-size: 11px; transition: 0.15s; }
      .ta-confirm-cancel-btn:hover { border-color: #9BA4B5; color: #E6EDF3; }
      .ta-confirm-ok-danger { background: #EF4444 !important; color: #fff !important; border: 1px solid #EF4444 !important; }
      .ta-confirm-ok-danger:hover { background: #dc2626 !important; }

      /* -----------------------------------------------------------------
         V 1.7 - AJUSTE VISUAL E MODAIS DE AVISO
         ----------------------------------------------------------------- */

      /* Texto do Novo Preset: maior e mais legível, mantendo o widget compacto. */
      .ta-newpreset-title { font-size:14px !important; }
      .ta-newpreset-subtitle { font-size:10px !important; }
      .ta-newpreset-label { font-size:10px !important; margin-bottom:6px !important; }
      .ta-newpreset-input { height:36px !important; padding:8px 10px !important; font-size:12px !important; }
      .ta-newpreset-origin-legend { font-size:9px !important; line-height:1.45 !important; color:#7D8797 !important; }
      .ta-newpreset-mode { min-height:48px !important; padding:9px 10px !important; }
      .ta-newpreset-mode-icon { width:28px !important; height:28px !important; font-size:13px !important; }
      .ta-newpreset-mode strong { font-size:11px !important; margin:0 !important; }
      .ta-newpreset-status { font-size:10px !important; }
      .ta-newpreset-help { font-size:9px !important; line-height:1.4 !important; }
      .ta-newpreset-count { font-size:10px !important; }
      .ta-newpreset-field { padding:8px !important; }
      .ta-newpreset-order { width:17px !important; font-size:9px !important; }
      .ta-field-label-input { font-size:12px !important; }
      .ta-newpreset-remove { width:29px !important; height:29px !important; font-size:12px !important; }
      .ta-newpreset-field-bottom { gap:6px !important; margin-top:6px !important; padding-left:22px !important; }
      .ta-newpreset-select { width:102px !important; height:31px !important; font-size:10px !important; padding:5px 7px !important; }
      .ta-field-value-input { height:31px !important; font-size:11px !important; }
      .ta-newpreset-empty { font-size:10px !important; }
      .ta-newpreset-add { padding:8px !important; font-size:10px !important; }
      .ta-newpreset-cancel, .ta-newpreset-save {
        height:36px !important;
        font-size:11px !important;
      }

      /* Todos os avisos/confirmações ficam centralizados dentro do TicketAI. */
      #ta-confirm-overlay {
        align-items:center !important;
        justify-content:center !important;
        padding:16px !important;
        background:rgba(13,17,23,.72) !important;
      }

      #ta-confirm-overlay .ta-modal {
        width:min(300px, calc(100% - 20px)) !important;
        max-width:300px !important;
        height:auto !important;
        max-height:calc(100% - 32px) !important;
        min-height:0 !important;
        padding:18px !important;
        border:1px solid #2A313B !important;
        border-radius:12px !important;
        background:#0D1117 !important;
        box-shadow:0 18px 45px rgba(0,0,0,.45) !important;
        box-sizing:border-box !important;
        overflow:auto !important;
      }

      #ta-confirm-overlay .ta-modal-title {
        font-size:15px !important;
        line-height:1.3 !important;
        margin-bottom:7px !important;
      }

      #ta-confirm-overlay .ta-confirm-icon {
        font-size:24px !important;
        margin:0 0 7px !important;
      }

      #ta-confirm-overlay .ta-confirm-message {
        font-size:12px !important;
        line-height:1.5 !important;
        color:#A8B1BF !important;
        margin:0 auto !important;
        max-width:260px !important;
      }

      #ta-confirm-overlay .ta-modal-actions {
        display:flex !important;
        justify-content:center !important;
        gap:8px !important;
        margin-top:16px !important;
      }

      #ta-confirm-overlay #ta-confirm-ok,
      #ta-confirm-overlay #ta-confirm-cancel {
        min-height:34px !important;
        font-size:11px !important;
        border-radius:7px !important;
      }

      #ta-confirm-overlay #ta-confirm-ok,
      #ta-confirm-overlay #ta-confirm-cancel {
        flex:1 !important;
      }


      .ta-newpreset-modes {
        grid-template-columns:1fr !important;
      }
      .ta-newpreset-mode {
        width:100% !important;
        min-height:44px !important;
        padding:8px 10px !important;
      }
      .ta-newpreset-origin-legend {
        margin-top:5px !important;
        margin-bottom:10px !important;
        font-size:9px !important;
        line-height:1.35 !important;
        white-space:nowrap !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
      }
      .ta-newpreset-fields-head {
        align-items:center !important;
        gap:8px !important;
        margin-bottom:5px !important;
      }
      .ta-newpreset-fields-head h3,
      .ta-newpreset-fields-title {
        font-size:11px !important;
        margin:0 !important;
      }
      .ta-newpreset-help {
        font-size:9px !important;
        line-height:1.25 !important;
        margin:0 !important;
        white-space:nowrap !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
      }
      .ta-newpreset-count {
        font-size:9px !important;
        line-height:1 !important;
        white-space:nowrap !important;
        flex-shrink:0 !important;
      }


      /* V 1.7 - campos mais limpos e tipografia legível */
      .ta-newpreset-section-label,
      .ta-newpreset-label {
        font-size:10px !important;
        letter-spacing:.06em !important;
        font-weight:700 !important;
        color:#B8C2D1 !important;
      }

      .ta-newpreset-help,
      .ta-newpreset-origin-legend,
      .ta-newpreset-subtitle {
        font-size:10px !important;
        line-height:1.45 !important;
        color:#7F8B9D !important;
      }

      .ta-newpreset-field {
        padding:9px 10px !important;
        border-radius:9px !important;
      }

      .ta-newpreset-field-top {
        gap:7px !important;
      }

      .ta-field-label-input {
        height:34px !important;
        font-size:12px !important;
        font-weight:600 !important;
        color:#E6EDF3 !important;
      }

      .ta-newpreset-field-bottom {
        margin-top:7px !important;
        padding-left:22px !important;
      }

      .ta-field-value-input {
        width:100% !important;
        height:34px !important;
        font-size:12px !important;
        color:#D8DEE9 !important;
        padding:7px 10px !important;
      }

      .ta-field-value-input::placeholder {
        color:#667085 !important;
      }

      .ta-newpreset-remove {
        width:31px !important;
        height:31px !important;
        min-width:31px !important;
        padding:0 !important;
        border:1px solid #3A2529 !important;
        border-radius:7px !important;
        background:#17191E !important;
        color:#E25555 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        font-size:20px !important;
        font-weight:400 !important;
        line-height:1 !important;
        transition:all .15s ease !important;
      }

      .ta-newpreset-remove:hover {
        background:#28191C !important;
        border-color:#8F343A !important;
        color:#FF6B6B !important;
      }

      .ta-newpreset-remove span {
        transform:translateY(-1px);
      }

      .ta-newpreset-count {
        font-size:9px !important;
        font-weight:700 !important;
        letter-spacing:0 !important;
      }

      .ta-newpreset-footer button {
        font-size:11px !important;
        font-weight:700 !important;
        letter-spacing:.01em !important;
      }


      /* V 1.7 - PROTÓTIPO 2: DESTAQUE ESTRUTURADO */
      .ta-newpreset-section {
        margin:0 0 14px;
      }
      .ta-newpreset-section-title {
        display:flex;
        align-items:center;
        gap:7px;
        margin-bottom:8px;
        color:#E6EDF3;
      }
      .ta-newpreset-section-title > span {
        width:19px;
        height:19px;
        display:flex;
        align-items:center;
        justify-content:center;
        border:1px solid #F59E0B;
        border-radius:50%;
        color:#F59E0B;
        font-size:9px;
        font-weight:800;
        flex-shrink:0;
      }
      .ta-newpreset-section-title strong {
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.5px;
      }
      .ta-newpreset-grid {
        grid-template-columns:1fr 1fr !important;
        gap:8px !important;
      }
      .ta-newpreset-label {
        font-size:10px !important;
        margin-bottom:5px !important;
      }
      .ta-newpreset-input {
        height:36px !important;
        font-size:12px !important;
        padding:8px 10px !important;
      }
      .ta-newpreset-mode {
        width:100% !important;
        min-height:58px !important;
        padding:10px !important;
        border-radius:8px !important;
      }
      .ta-newpreset-mode-icon {
        width:31px !important;
        height:31px !important;
        font-size:15px !important;
      }
      .ta-newpreset-mode strong {
        font-size:11px !important;
      }
      .ta-newpreset-mode small {
        display:block !important;
        margin-top:3px !important;
        font-size:9px !important;
        line-height:1.35 !important;
        color:#7D8797 !important;
      }
      .ta-newpreset-origin-legend {
        margin-top:6px !important;
        font-size:9px !important;
        line-height:1.4 !important;
      }
      .ta-newpreset-section-head {
        align-items:center !important;
        margin-top:0 !important;
      }
      .ta-newpreset-section-head .ta-newpreset-section-title {
        margin-bottom:0 !important;
      }
      .ta-newpreset-help {
        margin-top:0 !important;
        font-size:9px !important;
        line-height:1.35 !important;
      }
      .ta-newpreset-count {
        font-size:9px !important;
        white-space:nowrap !important;
      }
      .ta-newpreset-fields {
        gap:6px !important;
        margin-top:7px !important;
      }
      .ta-newpreset-field {
        padding:8px 9px !important;
        border-radius:8px !important;
      }
      .ta-newpreset-field-top {
        min-height:31px !important;
        gap:7px !important;
      }
      .ta-newpreset-order {
        width:18px !important;
        font-size:9px !important;
      }
      .ta-field-label-input {
        flex:1;
        min-width:0;
        color:#E6EDF3;
        font-size:12px;
        font-weight:700;
        line-height:1.25;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .ta-newpreset-field-bottom {
        margin-top:6px !important;
        padding-left:25px !important;
      }
      .ta-field-value-input {
        width:100% !important;
        height:34px !important;
        font-size:12px !important;
      }
      .ta-newpreset-remove {
        width:31px !important;
        height:31px !important;
        border-radius:7px !important;
        background:rgba(239,68,68,.04) !important;
        border:1px solid #3A2529 !important;
        color:#EF4444 !important;
        font-size:19px !important;
      }
      .ta-newpreset-remove:hover {
        background:rgba(239,68,68,.12) !important;
        border-color:#7F3438 !important;
      }
      .ta-newpreset-add {
        margin-top:8px !important;
        height:34px !important;
        padding:0 10px !important;
        font-size:10px !important;
      }
      .ta-newpreset-status {
        font-size:10px !important;
        min-height:14px !important;
      }
      .ta-newpreset-footer {
        padding:10px 13px !important;
      }
      .ta-newpreset-cancel,
      .ta-newpreset-save {
        height:36px !important;
        font-size:11px !important;
      }
      @media (max-width:360px) {
        .ta-newpreset-grid { grid-template-columns:1fr !important; }
      }

    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------
  // DOM DO WIDGET
  // ---------------------------------------------------------------------

  function buildWidgetDom() {
    const widget = document.createElement('div');
    widget.id = 'ticketai-widget';
    widget.innerHTML = `
      <div class="ta-resizer ta-resizer-left" id="ta-res-l"></div>
      <div class="ta-resizer ta-resizer-right" id="ta-res-r"></div>
      <div class="ta-resizer-vertical ta-resizer-top" id="ta-res-t"></div>
      <div class="ta-resizer-vertical ta-resizer-bottom" id="ta-res-b"></div>
      <div class="ta-header" id="ta-drag-h">
        <span class="ta-title"><span class="ta-title-ticket">Ticket</span><span class="ta-title-ai">AI</span></span>
        <div class="ta-btn-group">
          <div class="ta-h-btn ta-help-wrap" style="position:relative;">
            <span id="ta-btn-help" title="Atalhos de teclado">?</span>
            <div class="ta-help-popover" id="ta-help-popover">
              <div class="ta-help-title">Atalhos de teclado</div>
              <div class="ta-help-row"><span class="ta-help-key">Alt + Q</span><span>Abrir / minimizar / maximizar</span></div>
              <div class="ta-help-row"><span class="ta-help-key">Alt + W</span><span>Modo compacto</span></div>
              <div class="ta-help-row"><span class="ta-help-key">Esc</span><span>Fechar menus e modais</span></div>
            </div>
          </div>
          <div class="ta-h-btn" id="ta-btn-min" title="Minimizar">–</div>
          <div class="ta-h-btn" id="ta-btn-close" title="Fechar">✕</div>
        </div>
      </div>
      <div class="ta-body" id="ta-body">
        <div class="ta-undo-toast" id="ta-undo-toast">
          <span id="ta-undo-toast-text">Preset apagado</span>
          <button id="ta-undo-toast-btn" type="button">Desfazer</button>
        </div>
        <div class="ta-selection-toolbar" id="ta-selection-toolbar">
          <span id="ta-selection-count">0 selecionados</span>
          <div class="ta-selection-actions">
            <button id="ta-btn-select-all" type="button">Selecionar Tudo</button>
            <button id="ta-btn-selection-delete" type="button" class="ta-danger-inline">Apagar</button>
            <button id="ta-btn-selection-cancel" type="button">Cancelar</button>
          </div>
        </div>
        <div class="ta-search-row" id="ta-search-row">
          <input type="text" id="ta-search-input" class="ta-search-input" placeholder="Buscar preset...">
          <button id="ta-btn-organize-groups" class="ta-organize-groups" type="button" title="Organizar grupos">☷</button>
        </div>
        <div id="ta-list"></div>
      </div>
      <div class="ta-footer">
        <div class="ta-footer-row">
          <div style="display:flex; gap:6px; flex:1;">
            <button id="ta-btn-add" class="ta-btn-add" title="Novo preset" type="button"><span>+</span>Novo Preset</button>
            
          </div>
          <div class="ta-gear-wrap">
            <button id="ta-btn-gear" class="ta-btn-gear" title="Opções" type="button">⚙</button>
            <div class="ta-popover" id="ta-popover">
              <div class="ta-popover-header">
                <span class="ta-popover-header-icon">⚙</span>
                <span class="ta-popover-header-title">Configurações</span>
                <span class="ta-popover-close" id="ta-popover-close" title="Fechar">✕</span>
              </div>
              <button id="ta-btn-select-mode" class="ta-popover-item ta-popover-accent-amber" type="button" title="Selecionar vários presets para apagar de uma vez">
                <span class="ta-popover-item-icon ta-icon-amber">☑</span>
                <span class="ta-popover-item-text">Selecionar preset</span>
                <span class="ta-popover-chevron">›</span>
              </button>
              <button id="ta-btn-export" class="ta-popover-item" type="button" title="Baixar todos os presets em um arquivo JSON">
                <span class="ta-popover-item-icon ta-icon-amber">↑</span>
                <span class="ta-popover-item-text">Exportar</span>
                <span class="ta-popover-chevron">›</span>
              </button>
              <button id="ta-btn-import" class="ta-popover-item" type="button" title="Importar presets de um arquivo JSON">
                <span class="ta-popover-item-icon ta-icon-blue">↓</span>
                <span class="ta-popover-item-text">Importar</span>
                <span class="ta-popover-chevron">›</span>
              </button>
              <button id="ta-btn-delete-all" class="ta-popover-item ta-popover-accent-danger" type="button" title="Apagar todos os presets cadastrados">
                <span class="ta-popover-item-icon ta-icon-danger">🗑</span>
                <span class="ta-popover-item-text ta-text-danger">Apagar todos</span>
                <span class="ta-popover-chevron">›</span>
              </button>
              <input type="file" id="ta-import-file" style="display:none" accept=".json">
            </div>
          </div>
        </div>
        <div class="ta-preset-count" id="ta-preset-count"></div>
        <div class="ta-dev-footer">
          <span class="ta-dev-label">Desenvolvido por</span>
          <span class="ta-dev-name">Lagamba Tech</span>
          <span class="ta-version">V ${TICKETAI_VERSION}</span>
        </div>
      </div>

      <div class="ta-modal-overlay" id="ta-modal-overlay">
        <div class="ta-modal">
          <div class="ta-modal-header-row">
            <div class="ta-modal-title" id="ta-modal-title">Novo preset</div>
            <span class="ta-modal-close" id="ta-modal-close" title="Fechar">✕</span>
          </div>
          <div>
            <div class="ta-field-label">Nome do preset</div>
            <input type="text" id="ta-field-name" class="ta-field-input" placeholder="Ex: Retransmissão de pacote">
          </div>
          <div>
            <div class="ta-field-label">Grupo</div>
            <input type="text" id="ta-field-group" class="ta-field-input" placeholder="Ex: Integração">
          </div>
          <div>
            <div class="ta-field-label">Descrição do ticket</div>
            <input type="text" id="ta-field-descricao" class="ta-field-input" placeholder="Texto sugerido">
          </div>
          <div>
            <div class="ta-field-label">Produto</div>
            <input type="text" id="ta-field-produto" class="ta-field-input" placeholder="Ex: Cilia Web">
          </div>
          <div>
            <div class="ta-field-label">Categoria</div>
            <input type="text" id="ta-field-categoria" class="ta-field-input" placeholder="Ex: Problema">
          </div>
          <div>
            <div class="ta-field-label">Assunto</div>
            <input type="text" id="ta-field-assunto" class="ta-field-input" placeholder="Ex: Retransmissão de orçamento">
          </div>
          <div class="ta-modal-actions">
            <button id="ta-modal-save" class="ta-btn-add" style="flex:1;">Salvar</button>
          </div>
          <div id="ta-modal-cancel" class="ta-cancel-link">Cancelar</div>
        </div>
      </div>

      <div class="ta-modal-overlay" id="ta-confirm-overlay">
        <div class="ta-modal" style="max-width: 260px;">
          <div class="ta-confirm-icon" id="ta-confirm-icon" style="display:none;">⚠️</div>
          <div class="ta-modal-title" id="ta-confirm-title" style="text-align:center;">Confirmar</div>
          <div id="ta-confirm-message" class="ta-confirm-message"></div>
          <div class="ta-modal-actions">
            <button id="ta-confirm-cancel" class="ta-confirm-cancel-btn" type="button">Cancelar</button>
            <button id="ta-confirm-ok" class="ta-btn-add" type="button" style="flex:1;">OK</button>
          </div>
        </div>
      </div>
    `;
    return widget;
  }

  // ---------------------------------------------------------------------
  // GEOMETRIA (posição e tamanho persistentes)
  // ---------------------------------------------------------------------

  function saveGeometry(widget) {
    const geom = {
      left: widget.offsetLeft,
      top: widget.offsetTop,
      width: widget.offsetWidth,
      height: widget.offsetHeight
    };
    chrome.storage.local.set({ ticketaiGeom: geom });
  }

  function applySavedGeometry(widget) {
    chrome.storage.local.get(['ticketaiGeom'], (res) => {
      const g = res.ticketaiGeom;
      if (!g) return;
      widget.style.left = g.left + 'px';
      widget.style.top = g.top + 'px';
      widget.style.right = 'auto';
      widget.style.width = g.width + 'px';
      widget.style.height = g.height + 'px';
    });
  }

  function setupResize(widget) {
    const startResizing = (e, side) => {
      e.preventDefault();
      const startX = e.clientX; const startY = e.clientY;
      const startWidth = widget.offsetWidth; const startHeight = widget.offsetHeight;
      const startLeft = widget.offsetLeft; const startTop = widget.offsetTop;
      const onMouseMove = (mE) => {
        if (side === 'left') {
          const newWidth = startWidth + (startX - mE.clientX);
          if (newWidth > 280) { widget.style.width = newWidth + 'px'; widget.style.left = (startLeft - (startX - mE.clientX)) + 'px'; }
        } else if (side === 'right') {
          const newWidth = startWidth + (mE.clientX - startX);
          if (newWidth > 280) widget.style.width = newWidth + 'px';
        } else if (side === 'top') {
          const newHeight = startHeight + (startY - mE.clientY);
          if (newHeight > 300) { widget.style.height = newHeight + 'px'; widget.style.top = (startTop - (startY - mE.clientY)) + 'px'; }
        } else if (side === 'bottom') {
          const newHeight = startHeight + (mE.clientY - startY);
          if (newHeight > 300) widget.style.height = newHeight + 'px';
        }
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveGeometry(widget);
      };
      window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
    };
    document.getElementById('ta-res-l').onmousedown = (e) => startResizing(e, 'left');
    document.getElementById('ta-res-r').onmousedown = (e) => startResizing(e, 'right');
    document.getElementById('ta-res-t').onmousedown = (e) => startResizing(e, 'top');
    document.getElementById('ta-res-b').onmousedown = (e) => startResizing(e, 'bottom');
  }

  function setupDrag(widget) {
    let drag = false, oX, oY;
    document.getElementById('ta-drag-h').onmousedown = (e) => {
      if (e.target.closest('.ta-btn-group')) return;
      drag = true; oX = e.clientX - widget.offsetLeft; oY = e.clientY - widget.offsetTop;
    };
    document.addEventListener('mousemove', (e) => {
      if (drag) {
        widget.style.left = (e.clientX - oX) + 'px'; widget.style.top = (e.clientY - oY) + 'px'; widget.style.right = 'auto';
      }
    });
    document.addEventListener('mouseup', () => {
      if (drag) { drag = false; saveGeometry(widget); }
    });
  }


  // Modo compacto: mostra 1 preset por vez, sem rodapé nem busca. Role o
  // mouse sobre o card para passar para o próximo/anterior preset. A posição
  // (top/left) nunca é alterada automaticamente — fica exatamente onde o
  // usuário colocou, em qualquer troca de modo. Se precisar reposicionar,
  // o cabeçalho continua arrastável mesmo com o modo compacto ativo.
  function togglePeek(widget) {
    widget.classList.remove('is-minimized');
    widget.classList.add('ta-anim');
    widget.classList.toggle('is-peek');
    peekMode = widget.classList.contains('is-peek');
    peekIndex = 0;

    setTimeout(() => widget.classList.remove('ta-anim'), 260);
    render();
  }

  function toggleMinimize(widget) {
    widget.classList.remove('is-peek');
    peekMode = false;
    widget.classList.add('ta-anim');
    widget.classList.toggle('is-minimized');
    setTimeout(() => widget.classList.remove('ta-anim'), 260);
    render();
  }

  function setupHeaderButtons(widget) {
    const peekBtn = document.getElementById('ta-btn-peek');
    if (peekBtn) {
      peekBtn.onclick = (e) => {
        e.stopPropagation();
        togglePeek(widget);
      };
    }
    document.getElementById('ta-btn-min').onclick = (e) => { e.stopPropagation(); toggleMinimize(widget); };
    document.getElementById('ta-btn-close').onclick = () => widget.style.display = 'none';

    const helpBtn = document.getElementById('ta-btn-help');
    const helpPopover = document.getElementById('ta-help-popover');
    helpBtn.onclick = (e) => {
      e.stopPropagation();
      helpPopover.classList.toggle('is-open');
    };
    document.addEventListener('click', (e) => {
      if (!helpPopover.classList.contains('is-open')) return;
      if (e.target.closest('#ta-help-popover') || e.target.closest('#ta-btn-help')) return;
      helpPopover.classList.remove('is-open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && helpPopover.classList.contains('is-open')) helpPopover.classList.remove('is-open');
    });
  }

  // Rolar o mouse dentro do modo compacto avança/retrocede um preset por vez.
  function setupPeekWheel() {
    const body = document.getElementById('ta-body');
    body.addEventListener('wheel', (e) => {
      if (!peekMode) return;
      e.preventDefault();
      const list = getFilteredPresets();
      if (list.length === 0) return;
      if (e.deltaY > 0) peekIndex = Math.min(peekIndex + 1, list.length - 1);
      else if (e.deltaY < 0) peekIndex = Math.max(peekIndex - 1, 0);
      renderList();
    }, { passive: false });
  }

  // ---------------------------------------------------------------------
  // DESFAZER EXCLUSÃO
  // ---------------------------------------------------------------------
  // Obs: a especificação de redesign pede para não haver toasts de
  // notificação (sucesso/erro/importação/etc). O aviso de "Desfazer" abaixo
  // não é uma notificação, é uma ação reversível, por isso foi mantido.

  function showUndoToast(items, label) {
    if (pendingUndo) clearTimeout(pendingUndo.timer);
    const toast = document.getElementById('ta-undo-toast');
    if (!toast) { pendingUndo = null; return; }
    const textEl = document.getElementById('ta-undo-toast-text');
    if (textEl) textEl.textContent = label;
    toast.classList.add('is-visible');
    const timer = setTimeout(() => {
      toast.classList.remove('is-visible');
      pendingUndo = null;
    }, 20000);
    pendingUndo = { items, timer };
  }

  function undoDelete() {
    if (!pendingUndo) return;
    clearTimeout(pendingUndo.timer);
    const { items } = pendingUndo;
    items.slice().sort((a, b) => a.index - b.index).forEach(({ preset, index }) => {
      const insertAt = Math.min(index, presets.length);
      presets.splice(insertAt, 0, preset);
    });
    pendingUndo = null;
    const toast = document.getElementById('ta-undo-toast');
    if (toast) toast.classList.remove('is-visible');
    save();
  }

  function setupUndoToast() {
    document.getElementById('ta-undo-toast-btn').onclick = () => undoDelete();
  }

  // ---------------------------------------------------------------------
  // CRUD DE PRESETS
  // ---------------------------------------------------------------------

  function save() {
    chrome.storage.local.set({ ticketaiPresets: presets, ticketaiGroupOrder: groupOrder }, render);
  }

  function deletePresetsWithUndo(ids) {
    const idSet = new Set(ids);
    const items = [];
    presets.forEach((p, i) => { if (idSet.has(p.id)) items.push({ preset: p, index: i }); });
    if (items.length === 0) return;
    presets = presets.filter(p => !idSet.has(p.id));
    selectedIds = new Set(Array.from(selectedIds).filter(id => !idSet.has(id)));
    save();
    const label = items.length === 1 ? 'Preset apagado' : `${items.length} presets apagados`;
    showUndoToast(items, label);
  }

  function getDuplicateName(baseName) {
    const names = new Set(presets.map(p => p.name));
    let n = 1;
    let candidate = `${baseName} (${n})`;
    while (names.has(candidate)) { n++; candidate = `${baseName} (${n})`; }
    return candidate;
  }

  function duplicatePreset(p) {
    const clone = { ...p, id: generateId(), name: getDuplicateName(p.name) };
    presets.push(clone);
    save();
  }

  function openModal(preset = null) {
    const fields = Array.isArray(preset?.fields)
      ? preset.fields
      : betaLegacyFields(preset);
    openUnifiedPresetModal(preset, fields);
  }

  function closeModal() {
    document.getElementById('ta-modal-overlay').classList.remove('is-visible');
    editingId = null;
  }

  // Modal de confirmação/aviso dentro do próprio widget, substituindo
  // confirm()/alert() nativos do navegador (que aparecem fora da extensão,
  // atrás/sobre a página do Hubspot, e quebram a experiência).
  function showConfirmModal(message, opts = {}) {
    const { okOnly = false, title = 'Confirmar', okText = 'OK', danger = false } = opts;
    return new Promise((resolve) => {
      const overlay = document.getElementById('ta-confirm-overlay');
      const iconEl = document.getElementById('ta-confirm-icon');
      const titleEl = document.getElementById('ta-confirm-title');
      const msgEl = document.getElementById('ta-confirm-message');
      const okBtn = document.getElementById('ta-confirm-ok');
      const cancelBtn = document.getElementById('ta-confirm-cancel');
      if (!overlay || !msgEl || !okBtn || !cancelBtn) { resolve(true); return; }

      titleEl.textContent = title;
      msgEl.textContent = message;
      okBtn.textContent = okText;
      cancelBtn.style.display = okOnly ? 'none' : 'block';
      if (iconEl) iconEl.style.display = danger ? 'block' : 'none';
      okBtn.classList.toggle('ta-confirm-ok-danger', danger);
      overlay.classList.add('is-visible');

      const cleanup = (result) => {
        overlay.classList.remove('is-visible');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      };
      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
    });
  }

  function showAlertModal(message, title = 'Aviso') {
    return showConfirmModal(message, { okOnly: true, title });
  }

  function setupModal() {
    // O formulário de Novo Preset é configurado dinamicamente pelo openModal().
    // Aqui apenas ligamos o botão principal à abertura do formulário.
    const addBtn = document.getElementById('ta-btn-add');
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      };
    }
  }

  // ---------------------------------------------------------------------
  // SELEÇÃO EM LOTE
  // ---------------------------------------------------------------------

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    renderList();
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const countEl = document.getElementById('ta-selection-count');
    if (countEl) countEl.textContent = `${selectedIds.size} selecionado${selectedIds.size === 1 ? '' : 's'}`;
  }

  function exitSelectMode() {
    selectMode = false;
    selectedIds.clear();
    document.getElementById('ta-selection-toolbar').classList.remove('is-visible');
    render();
  }

  function setupSelectionMode() {
    document.getElementById('ta-btn-select-mode').onclick = () => {
      selectMode = true;
      selectedIds.clear();
      document.getElementById('ta-selection-toolbar').classList.add('is-visible');
      closePopover();
      render();
    };

    document.getElementById('ta-btn-selection-cancel').onclick = () => exitSelectMode();

    document.getElementById('ta-btn-select-all').onclick = () => {
      const visible = getFilteredPresets();
      const allSelected = visible.length > 0 && visible.every(p => selectedIds.has(p.id));
      if (allSelected) visible.forEach(p => selectedIds.delete(p.id));
      else visible.forEach(p => selectedIds.add(p.id));
      renderList();
      updateSelectionUI();
    };

    document.getElementById('ta-btn-selection-delete').onclick = async () => {
      if (selectedIds.size === 0) { await showAlertModal('Nenhum preset selecionado.'); return; }
      const count = selectedIds.size;
      const ok = await showConfirmModal(`Apagar os ${count} presets selecionados? Esta ação não pode ser desfeita.`, { title: 'Apagar presets', okText: 'OK, apagar', danger: true });
      if (ok) {
        deletePresetsWithUndo(Array.from(selectedIds));
        selectMode = false;
        document.getElementById('ta-selection-toolbar').classList.remove('is-visible');
      }
    };
  }

  // ---------------------------------------------------------------------
  // RENDERIZAÇÃO
  // ---------------------------------------------------------------------

  function getFilteredPresets() {
    if (!searchQuery) return presets;
    const q = searchQuery.toLowerCase();
    return presets.filter(p => p.name.toLowerCase().includes(q) || (p.group || '').toLowerCase().includes(q));
  }

  function getGroupNames() {
    const groups = [];
    const seen = new Set();
    presets.forEach(preset => {
      const group = String(preset.group || 'GERAL').trim() || 'GERAL';
      const key = group.toLowerCase();
      if (!seen.has(key)) { seen.add(key); groups.push(group); }
    });
    return groups.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function getOrderedGroupNames() {
    const all = getGroupNames();
    return [...groupOrder.filter(name => all.includes(name)), ...all.filter(name => !groupOrder.includes(name))];
  }

  function groupPresets(list) {
    const groups = Object.create(null);
    list.forEach(p => {
      const g = p.group || 'GERAL';
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });
    return groups;
  }

  function buildCard(p) {
    const card = document.createElement('div');
    card.className = 'ta-preset-card' + (selectMode ? ' select-mode-active' : '') + (selectMode && selectedIds.has(p.id) ? ' is-selected' : '');
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="ta-progress-bar"></div>
      <div class="ta-card-header-row">
        <span class="ta-preset-name"></span>
        <div class="ta-card-right">
          <label class="ta-preset-checkbox-wrap"><input type="checkbox" class="ta-checkbox" ${selectedIds.has(p.id) ? 'checked' : ''}></label>
          <div class="ta-preset-actions">
            <span class="ta-icon-btn ta-edit" title="Editar preset">✏️</span>
            <span class="ta-icon-btn ta-dup" title="Duplicar preset">⧉</span>
            <span class="ta-icon-btn ta-danger ta-del" title="Apagar preset">🗑️</span>
          </div>
        </div>
      </div>
    `;
    card.querySelector('.ta-preset-name').innerHTML = highlightMatch(p.name, searchQuery);
    const fieldResults = document.createElement('div');
    fieldResults.className = 'ta-field-results';
    fieldResults.hidden = true;
    fieldResults.setAttribute('role', 'status');
    fieldResults.setAttribute('aria-live', 'polite');
    card.appendChild(fieldResults);
    const fieldSummary = document.createElement('div');
    fieldSummary.className = 'ta-field-summary';
    fieldSummary.hidden = true;
    fieldSummary.setAttribute('role', 'status');
    card.appendChild(fieldSummary);
    if (lastApplicationFeedback?.id === String(p.id)) {
      const {fields, results, activeLabel} = lastApplicationFeedback;
      showFieldResults(card, fields, results, activeLabel);
    }

    card.onclick = async (e) => {
      if (organizingGroups) return;
      if (selectMode) { e.stopPropagation(); toggleSelect(p.id); return; }
      if (e.target.closest('.ta-preset-actions')) return;
      await applyPresetToCard(p, card);
    };
    card.querySelector('.ta-checkbox').onclick = (e) => { e.stopPropagation(); toggleSelect(p.id); };
    card.querySelector('.ta-edit').onclick = (e) => { e.stopPropagation(); openModal(p); };
    card.querySelector('.ta-dup').onclick = (e) => { e.stopPropagation(); duplicatePreset(p); };
    card.querySelector('.ta-del').onclick = async (e) => {
      e.stopPropagation();
      const ok = await showConfirmModal(`Apagar o preset "${p.name}"? Esta ação não pode ser desfeita.`, { title: 'Apagar preset', okText: 'OK, apagar', danger: true });
      if (ok) deletePresetsWithUndo([p.id]);
    };

    return card;
  }

  // Renderiza só a lista de presets (usado a cada digitação na busca, scroll
  // do modo compacto, etc.), sem tocar no input de busca, para não perder o
  // foco/cursor a cada atualização.
  function renderList() {
    const list = document.getElementById('ta-list');
    if (!list) return;
    list.innerHTML = '';

    const countEl = document.getElementById('ta-preset-count');
    if (countEl) countEl.textContent = `${presets.length} preset${presets.length === 1 ? '' : 's'} cadastrado${presets.length === 1 ? '' : 's'}`;

    const filtered = getFilteredPresets();

    if (filtered.length === 0) {
      renderEmptyState(list);
      return;
    }

    if (peekMode) {
      peekIndex = Math.min(peekIndex, filtered.length - 1);
      list.appendChild(buildCard(filtered[peekIndex]));
      return;
    }

    const groups = groupPresets(filtered);
    const names = Object.keys(groups).sort((a, b) => {
      const ai = groupOrder.indexOf(a), bi = groupOrder.indexOf(b);
      if (ai < 0 && bi < 0) return a.localeCompare(b, 'pt-BR');
      if (ai < 0) return 1; if (bi < 0) return -1; return ai - bi;
    });
    names.forEach(groupName => {
      const label = document.createElement('div');
      label.className = 'ta-group-label';
      label.textContent = `${groupName} · ${groups[groupName].length}`;
      label.dataset.group = groupName;
      // O arraste nativo pode sequestrar o ponteiro no widget; usamos os
      // eventos de ponteiro abaixo para manter a origem e o destino corretos.
      label.draggable = false;
      label.classList.toggle('ta-group-organizing', organizingGroups);
      if (organizingGroups) {
        label.title = 'Arraste para reposicionar';
        const controls = document.createElement('span');
        controls.className = 'ta-group-order-controls';
        controls.innerHTML = '<button type="button" title="Mover grupo para cima">↑</button><button type="button" title="Mover grupo para baixo">↓</button>';
        controls.querySelector('button').onclick = event => { event.stopPropagation(); moveGroup(groupName, -1); };
        controls.querySelectorAll('button')[1].onclick = event => { event.stopPropagation(); moveGroup(groupName, 1); };
        label.appendChild(controls);
        label.ondragstart = event => { draggedGroup = groupName; draggedLabel = label; event.dataTransfer?.setData('text/plain', groupName); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; label.classList.add('is-dragging'); };
        label.ondragend = () => { draggedGroup = null; draggedLabel?.classList.remove('is-dragging'); draggedLabel = null; draggedGhost?.remove(); draggedGhost = null; };
        label.ondragover = event => event.preventDefault();
        label.ondragenter = event => { event.preventDefault(); label.classList.add('is-drag-over'); };
        label.ondragleave = () => label.classList.remove('is-drag-over');
        label.ondrop = event => {
          event.preventDefault();
          label.classList.remove('is-drag-over');
          if (!draggedGroup || draggedGroup === groupName) return;
          reorderGroupBefore(draggedGroup, groupName);
        };
        label.onpointerdown = event => {
          if (event.target.closest('button')) return;
          event.preventDefault();
          draggedGroup = groupName;
          draggedLabel = label;
          label.classList.add('is-dragging');
          draggedGhost = label.cloneNode(true);
          draggedGhost.className = 'ta-group-drag-ghost';
          draggedGhost.querySelectorAll('button').forEach(button => button.remove());
          const rect = label.getBoundingClientRect();
          Object.assign(draggedGhost.style, { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px` });
          document.body.appendChild(draggedGhost);
        };
        label.onpointermove = event => {
          if (!draggedGroup) return;
          if (draggedGhost) { draggedGhost.style.left = `${event.clientX - 20}px`; draggedGhost.style.top = `${event.clientY - 14}px`; }
          const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('.ta-group-organizing');
          dragTargetGroup = target?.dataset?.group || null;
          if (dragTargetLabel !== target) {
            dragTargetLabel?.classList.remove('is-drag-over');
            dragTargetLabel = target;
            dragTargetLabel?.classList.add('is-drag-over');
          }
        };
        label.onpointerup = event => {
          const source = draggedGroup;
          const target = dragTargetGroup || groupName;
          if (!source || source === target) { draggedGroup = null; dragTargetGroup = null; draggedLabel?.classList.remove('is-dragging'); dragTargetLabel?.classList.remove('is-drag-over'); draggedLabel = null; dragTargetLabel = null; draggedGhost?.remove(); draggedGhost = null; return; }
          event.preventDefault();
          draggedGroup = null;
          dragTargetGroup = null;
          draggedLabel?.classList.remove('is-dragging');
          dragTargetLabel?.classList.remove('is-drag-over');
          draggedLabel = null;
          dragTargetLabel = null;
          draggedGhost?.remove();
          draggedGhost = null;
          reorderGroupBefore(source, target);
        };
      }
      list.appendChild(label);
      groups[groupName].forEach(p => list.appendChild(buildCard(p)));
    });
  }

  function moveGroup(groupName, direction) {
    const names = getOrderedGroupNames();
    const index = names.indexOf(groupName);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= names.length) return;
    [names[index], names[target]] = [names[target], names[index]];
    groupOrder = names;
    save();
  }

  function reorderGroupBefore(source, target) {
    const names = getOrderedGroupNames().filter(name => name !== source);
    const index = names.indexOf(target);
    if (index < 0) return;
    names.splice(index, 0, source);
    groupOrder = names;
    save();
  }

  function renderEmptyState(list) {
    const empty = document.createElement('div');
    empty.className = 'ta-empty-state';
    if (presets.length === 0) {
      empty.innerHTML = `<div class="ta-empty-icon">🗂️</div><div>Nenhum preset cadastrado ainda.</div><div class="ta-empty-sub">Clique em "+ Novo Preset" para criar o primeiro.</div>`;
    } else {
      empty.innerHTML = `<div class="ta-empty-icon">🔍</div><div>Nenhum preset encontrado.</div><div class="ta-empty-sub">Tente outro termo de busca ou crie um novo preset.</div>`;
      const ctaBtn = document.createElement('button');
      ctaBtn.className = 'ta-btn-add ta-empty-cta';
      ctaBtn.type = 'button';
      ctaBtn.innerHTML = '<span>+</span>Novo Preset';
      ctaBtn.onclick = () => openModal();
      empty.appendChild(ctaBtn);
    }
    list.appendChild(empty);
  }

  // Renderização completa: só usada quando algo estrutural muda (modo,
  // seleção, etc.), nunca a cada tecla digitada na busca.
  function render() {
    const selectionToolbar = document.getElementById('ta-selection-toolbar');
    if (selectionToolbar) selectionToolbar.classList.toggle('is-visible', selectMode);
    updateSelectionUI();
    const organizeButton = document.getElementById('ta-btn-organize-groups');
    document.getElementById('ticketai-widget')?.classList.toggle('ta-organizing-groups', organizingGroups);
    if (!dragPointerListenerInstalled) {
      document.addEventListener('pointerup', event => {
        if (!draggedGroup) return;
        const source = draggedGroup;
        const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('.ta-group-organizing')?.dataset?.group || null;
        draggedGroup = null;
        draggedLabel?.classList.remove('is-dragging');
        dragTargetLabel?.classList.remove('is-drag-over');
        draggedLabel = null;
        dragTargetLabel = null;
        draggedGhost?.remove();
        draggedGhost = null;
        if (target && source !== target) reorderGroupBefore(source, target);
      });
      dragPointerListenerInstalled = true;
    }
    if (organizeButton) {
      organizeButton.textContent = organizingGroups ? '✓' : '☷';
      organizeButton.title = organizingGroups ? 'Concluir organização' : 'Organizar grupos';
      organizeButton.classList.toggle('is-active', organizingGroups);
      organizeButton.onclick = () => { organizingGroups = !organizingGroups; render(); };
    }
    renderList();
  }

  function setupSearch() {
    const input = document.getElementById('ta-search-input');
    input.value = searchQuery;
    input.oninput = (e) => {
      searchQuery = e.target.value;
      renderList();
    };
  }

  // ---------------------------------------------------------------------
  // MENU DE OPÇÕES (ENGRENAGEM)
  // ---------------------------------------------------------------------

  let popoverCloseTimer = null;

  function clearPopoverAutoClose() {
    if (popoverCloseTimer) { clearTimeout(popoverCloseTimer); popoverCloseTimer = null; }
  }

  function schedulePopoverAutoClose() {
    clearPopoverAutoClose();
    popoverCloseTimer = setTimeout(() => closePopover(), 15000);
  }

  function closePopover() {
    clearPopoverAutoClose();
    const popover = document.getElementById('ta-popover');
    const gear = document.getElementById('ta-btn-gear');
    if (popover) popover.classList.remove('is-open');
    if (gear) gear.classList.remove('is-active');
  }

  function setupPopover() {
    const gear = document.getElementById('ta-btn-gear');
    const popover = document.getElementById('ta-popover');

    gear.onclick = (e) => {
      e.stopPropagation();
      const isOpen = popover.classList.toggle('is-open');
      gear.classList.toggle('is-active', isOpen);
      if (isOpen) schedulePopoverAutoClose(); else clearPopoverAutoClose();
    };

    document.getElementById('ta-popover-close').onclick = (e) => {
      e.stopPropagation();
      closePopover();
    };

    document.addEventListener('click', (e) => {
      if (!popover.classList.contains('is-open')) return;
      if (e.target.closest('#ta-popover') || e.target.closest('#ta-btn-gear')) return;
      closePopover();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && popover.classList.contains('is-open')) closePopover();
    });

    popover.addEventListener('mouseenter', () => {
      if (popover.classList.contains('is-open')) clearPopoverAutoClose();
    });
    popover.addEventListener('mouseleave', () => {
      if (popover.classList.contains('is-open')) schedulePopoverAutoClose();
    });

    document.getElementById('ta-btn-export').onclick = async () => {
      if (presets.length === 0) { await showAlertModal('Não há presets para exportar.'); return; }
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(presets, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', 'ticketai_presets.json');
      document.body.appendChild(a);
      a.click();
      a.remove();
      closePopover();
    };

    document.getElementById('ta-btn-import').onclick = () => {
      document.getElementById('ta-import-file').click();
      schedulePopoverAutoClose();
    };

    document.getElementById('ta-import-file').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (!Array.isArray(imported)) { await showAlertModal('Arquivo inválido.'); e.target.value = ''; return; }
          const valid = imported.filter(item => item && typeof item.name === 'string' && item.name.trim() !== '');
          if (valid.length === 0) { await showAlertModal('Nenhum preset válido encontrado.'); e.target.value = ''; return; }

          let idCounter = Date.now();
          const existingIds = new Set(presets.map(p => p.id));
          const normalized = valid.map(item => {
            let id = (typeof item.id === 'number' && !isNaN(item.id)) ? item.id : idCounter++;
            while (existingIds.has(id)) id = idCounter++;
            existingIds.add(id);
            return normalizeImportedPreset(item, id);
          });

          const identity = item => `${String(item.group || 'GERAL').trim().toLowerCase()}\u0000${String(item.name || '').trim().toLowerCase()}`;
          const existingKeys = new Set(presets.map(identity));
          const seenKeys = new Set();
          const duplicateKeys = new Set();
          normalized.forEach(item => {
            const key = identity(item);
            if (existingKeys.has(key) || seenKeys.has(key)) duplicateKeys.add(key);
            seenKeys.add(key);
          });
          const duplicates = normalized.filter(item => duplicateKeys.has(identity(item)));
          let toImport = normalized;
          if (duplicates.length) {
            const replace = await showConfirmModal(
              `${duplicates.length} preset${duplicates.length === 1 ? '' : 's'} já existe${duplicates.length === 1 ? '' : 'm'} com o mesmo nome e grupo. Deseja substituir?`,
              { title: 'Presets duplicados', okText: 'Substituir', cancelText: 'Manter atuais' }
            );
            if (replace) {
              const duplicateSet = new Set(duplicates.map(identity));
              presets = presets.filter(item => !duplicateSet.has(identity(item)));
            } else {
              const duplicateSet = new Set(duplicates.map(identity));
              toImport = normalized.filter(item => !duplicateSet.has(identity(item)));
            }
          }
          presets = [...presets, ...toImport];
          save();
          closePopover();
        } catch (err) {
          await showAlertModal('Erro ao ler o arquivo JSON.');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    };

    document.getElementById('ta-btn-delete-all').onclick = async (e) => {
      e.stopPropagation();
      if (presets.length === 0) { await showAlertModal('Não há presets cadastrados para apagar.'); return; }
      const total = presets.length;
      const ok = await showConfirmModal(`Apagar TODOS os ${total} presets cadastrados? Esta ação não pode ser desfeita.`, { title: 'Apagar tudo', okText: 'OK, apagar', danger: true });
      if (ok) {
        deletePresetsWithUndo(presets.map(p => p.id));
        closePopover();
      }
    };
  }

  // ---------------------------------------------------------------------
  // ATALHOS DE TECLADO
  // ---------------------------------------------------------------------

  function ensureWidgetVisible() {
    let widget = document.getElementById('ticketai-widget');
    if (!widget) {
      initWidget();
      widget = document.getElementById('ticketai-widget');
    } else if (widget.style.display === 'none') {
      widget.style.display = 'flex';
    }
    return widget;
  }

  function setupGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();

      // O cancelamento é cooperativo: preserva campos já alterados, mas faz
      // as esperas e as próximas etapas do preset pararem imediatamente.
      if (key === 'escape' && cancelActivePresetApplication()) {
        e.preventDefault();
        return;
      }

      // Alt+Q: abre o widget se não existir, ou alterna minimizado/maximizado.
      if (e.altKey && key === 'q') {
        e.preventDefault();
        const widget = document.getElementById('ticketai-widget');
        if (!widget) { initWidget(); return; }
        if (widget.style.display === 'none') { widget.style.display = 'flex'; return; }
        toggleMinimize(widget);
        return;
      }

      // Alt+W: abre/fecha o modo compacto (mostra 1 preset por vez).
      if (e.altKey && key === 'w') {
        e.preventDefault();
        const widget = ensureWidgetVisible();
        if (widget) togglePeek(widget);
        return;
      }

    }, true);
  }

  // ---------------------------------------------------------------------
  // INICIALIZAÇÃO
  // ---------------------------------------------------------------------

  function initWidget() {
    const existing = document.getElementById('ticketai-widget');
    if (existing) {
      existing.style.display = (existing.style.display === 'none') ? 'flex' : 'none';
      return;
    }

    injectStyles();
    const widget = buildWidgetDom();
    document.body.appendChild(widget);

    applySavedGeometry(widget);
    setupResize(widget);
    setupDrag(widget);
    setupHeaderButtons(widget);
    setupPeekWheel();
    setupPopover();
    setupModal();
    setupUndoToast();
    setupSelectionMode();
    setupSearch();

    chrome.storage.local.get(['ticketaiPresets', 'ticketaiGroupOrder'], (res) => {
      presets = res.ticketaiPresets || [];
      groupOrder = Array.isArray(res.ticketaiGroupOrder) ? res.ticketaiGroupOrder : [];
      render();
    });
  }

  chrome.runtime.onMessage.addListener((msg) => { if (msg.action === 'toggle_widget') initWidget(); });
  setupGlobalShortcuts();
})();
