(function() {
  if (window.hasTicketAILoaded) return;
  window.hasTicketAILoaded = true;

  const TICKETAI_VERSION = '2.4';

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
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Ícones locais: nenhuma biblioteca remota ou permissão adicional.
  function uiIcon(name) {
    const paths = {
      layers: '<path d="m12 3 10 6-10 6L2 9l10-6Z"/><path d="m2 15 10 6 10-6M2 12l10 6 10-6"/>',
      search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
      up: '<path d="m5 12 7-7 7 7M12 19V5"/>',
      down: '<path d="m5 12 7 7 7-7M12 5v14"/>',
      grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
      download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
      upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
      select: '<path d="m3 6 2 2 4-4m-6 9 2 2 4-4M13 6h8M13 13h8M3 20h18"/>',
      resize: '<path d="M8 3H3v5M16 21h5v-5M3 3l7 7m4 4 7 7"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      minus: '<path d="M5 12h14"/>',
      compact: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
      help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2M12 16h.01"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z"/>',
      copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/>',
      arrow: '<path d="M6 18 18 6M6 6h12v12"/>',
      left: '<path d="m15 5-7 7 7 7"/>',
      right: '<path d="m9 5 7 7-7 7"/>',
      groups: '<path d="M8 6h12M8 12h9M8 18h6M4 6h.01M4 12h.01M4 18h.01"/>',
      check: '<path d="m5 12 4 4 10-10"/>',
      settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
      read: '<path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5M8 9h8M8 13h8M8 17h4"/>'
    };
    return `<svg class="ta-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`;
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
    // O rótulo acessível fica fora do botão; seu texto é somente o valor.
    // Remover o prefixo "Pipeline" mutilaria nomes como "Pipeline de Suporte".
    return (button.textContent || '').trim();
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
    return labelText === 'Status do ticket' &&
      valuesMatch(modalDropdownValue(labelText), valueText);
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

      const dropdown = control.querySelector('button[data-dropdown="true"]');
      if (dropdown) {
        const selected = selectedDropdownValues(dropdown) || [];
        results.push({ index: results.length + 1, label,
          value: selected.length > 1 ? selected : (selected[0] || ''),
          type: selected.length > 1 ? 'multi' : 'dropdown' });
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
        type: 'dropdown'
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
      if (!scope) return null;
      const visible = item => item.getClientRects().length > 0 &&
        getComputedStyle(item).visibility !== 'hidden';
      const attributed = scope.querySelector(sel);
      if (attributed && visible(attributed)) return attributed;
      // Os Status atuais usam UITag dentro de role=option, sem title/value.
      // Só aceita uma correspondência exata dentro do portal deste botão.
      const options = Array.from(scope.querySelectorAll('[role="option"]'))
        .filter(item => visible(item) && valuesMatch(item.textContent, text));
      return options.length === 1 ? options[0] : null;
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
  function selectedDropdownValues(button) {
    const marked = Array.from(button.querySelectorAll('[data-option-text="true"]'));
    // UITag aparece no botão selecionado; nunca lê opções do portal aberto.
    const nodes = marked.length ? marked : Array.from(button.querySelectorAll('[data-component-name="UITag"]'));
    return nodes.length ? nodes.map(el => (el.textContent || '').trim()).filter(Boolean) : null;
  }

  function fieldValueMatches(field) {
    const type = field.type || 'dropdown';
    if (type === 'input' || type === 'textarea') {
      const input = findFieldTextInput(field.label);
      const expected = Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? '');
      return !!input && input.value === expected;
    }
    const button = findFieldButton(field.label);
    if (!button) return false;
    const selected = selectedDropdownValues(button);
    const expected = (Array.isArray(field.value) ? field.value : [field.value ?? ''])
      .map(value => String(value).trim()).filter(Boolean);
    // Ausência do marcador de seleção é inconclusiva, inclusive ao limpar.
    if (!selected) return false;
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
  let cardConfirmation = null;
  let confirmationTimer = null;

  function clearCardConfirmation() {
    if (confirmationTimer !== null) clearTimeout(confirmationTimer);
    confirmationTimer = null;
    cardConfirmation = null;
    refreshCardConfirmation();
  }

  function refreshCardConfirmation() {
    const widget = document.getElementById('ticketai-widget');
    for (const card of widget?.querySelectorAll('.ta-preset-card') || []) renderCardConfirmation(card);
  }

  function beginCardConfirmation(preset) {
    clearCardConfirmation();
    cardConfirmation = {id:String(preset.id), status:'running', results:{}, expanded:false};
    refreshCardConfirmation();
  }

  function finishCardConfirmation(preset, results) {
    if (!cardConfirmation || cardConfirmation.id !== String(preset.id)) return;
    const labels = {descricao:'Descrição do ticket', produto:'Produto', categoria:'Categoria', assunto:'Assunto'};
    const named = Object.fromEntries(Object.entries(results)
      .filter(([key])=>!labels[key] || Array.isArray(preset.fields) || !!preset[key])
      .map(([key,value])=>[labels[key] || key,value]));
    cardConfirmation.results = named;
    cardConfirmation.status = Object.values(named).some(ok=>ok===false) ? 'partial' : 'success';
    refreshCardConfirmation();
    if (cardConfirmation.status === 'success') {
      const completed = cardConfirmation;
      confirmationTimer = setTimeout(()=>{if(cardConfirmation===completed)clearCardConfirmation();},2000);
    }
  }

  function renderCardConfirmation(card) {
    const hint = card.querySelector('.ta-apply-hint');
    if (!hint) return;
    const state = cardConfirmation?.id === card.dataset.id ? cardConfirmation : null;
    const status = state?.status || 'idle';
    card.dataset.confirmation = status;
    card.classList.remove('ta-filled','ta-application-failed');
    const action = card.querySelector('.ta-apply-preset');
    const name = card.querySelector('.ta-preset-name')?.textContent || '';
    hint.innerHTML = status === 'running' ? '<span class="ta-confirm-spinner" aria-hidden="true"></span><span>Aplicando…</span>'
      : status === 'success' ? '<span aria-hidden="true">✓</span><span>Aplicado</span>'
      : status === 'partial' ? '<span aria-hidden="true">⚠</span><span>Conferir campos</span>' : uiIcon('arrow');
    action.title = status === 'idle' ? 'Aplicar preset' : '';
    action.setAttribute('aria-label',`${selectMode?'Selecionar':status==='partial'?'Conferir campos de':status==='success'?'Aplicado':status==='running'?'Aplicando':'Aplicar'} ${name}`);
    if(status==='partial')action.setAttribute('aria-expanded',String(state.expanded));
    else action.removeAttribute('aria-expanded');
    const details = card.querySelector('.ta-confirm-details');
    if (!details) return;
    details.hidden = status !== 'partial' || !state.expanded;
    if(status==='partial'){
      const entries=Object.entries(state.results),confirmed=entries.filter(([,ok])=>ok===true).length;
      details.querySelector('.ta-confirm-count').textContent=`${confirmed} de ${entries.length} campos aplicados`;
      details.querySelector('.ta-confirm-pending').textContent=entries.filter(([,ok])=>ok===false).map(([label])=>`${label}: não confirmado`).join('\n');
    }
  }
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
    clearCardConfirmation();
    lastApplicationFeedback = null;
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
    lastApplicationFeedback = null;
    applyingPreset = true;
    activePresetApplication = {cancelled: false};
    setInterfaceBusy(true);
    beginCardConfirmation(preset);
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
      finishCardConfirmation(preset,result);
      return result;
    } finally {
      applyingPreset = false;
      setInterfaceBusy(false);
      activePresetApplication = null;
      card?.setAttribute('aria-busy', 'false');
    }
  }

  function setInterfaceBusy(busy) {
    const widget = document.getElementById('ticketai-widget');
    for (const button of widget?.querySelectorAll('.ta-apply-preset,.ta-confirm-retry,.ta-more,#ta-btn-add,#ta-btn-gear,#ta-btn-organize-groups') || []) {
      if (button.tagName === 'BUTTON') button.disabled = busy;
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
    const list = [...new Set((Array.isArray(values) ? values : [values])
      .map(value => String(value ?? '').trim()).filter(Boolean))];

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

    if (!container) return false;
    // Presets antigos marcam Categoria como multi, mas o HubSpot pode agora
    // apresentar um Select--single. Não limpa nem escolhe parte de uma lista.
    const single = (container.closest('.Select')?.getAttribute('class') || '')
      .split(/\s+/).includes('Select--single');
    if (single) {
      if (list.length > 1) return false;
      return list.length ? selectOptionByText(list[0], btn) : clearDropdownSelection(btn);
    }
    if (!await clearMultiSelection(container)) return false;

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
    const overlay=document.getElementById('ta-modal-overlay'),modal=overlay?.querySelector('.ta-modal');
    if(!overlay||!modal)return;
    const isEditing=!!preset;
    let fields=(initialFields||[]).map(normalizeBetaField);
    const workflow=normalizeWorkflow(preset?.workflow);
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',isEditing?'Editar preset':'Novo preset');
    modal.style.cssText='';
    modal.innerHTML=`<div class="ta-newpreset-header"><button type="button" id="ta-unified-close" class="ta-icon" aria-label="Voltar aos presets">${uiIcon('left')}</button><div><h2 class="ta-newpreset-title">${isEditing?'Editar preset':'Novo preset'}</h2><p class="ta-newpreset-subtitle">Defina o que será aplicado ao ticket.</p></div></div>
      <form class="ta-newpreset-body" id="ta-editor-form">
        <div class="ta-newpreset-grid"><label class="ta-newpreset-main-field">Nome do preset<input id="ta-unified-name" type="text" placeholder="Ex.: E-mail em cópia" value="${escapeHtml(preset?.name||'')}"></label><label class="ta-newpreset-main-field">Grupo<input id="ta-unified-group" type="text" placeholder="Ex.: E-mail" list="ta-group-options" value="${escapeHtml(preset?.group||'')}"><datalist id="ta-group-options">${getGroupNames().map(g=>`<option value="${escapeHtml(g)}">`).join('')}</datalist></label></div>
        <section><h3 class="ta-newpreset-section-title">Preenchimento a partir do ticket</h3><button type="button" id="ta-read-ticket-data" class="ta-secondary ta-newpreset-mode">${uiIcon('read')}Ler dados atuais</button><p class="ta-newpreset-help">Importa os dados visíveis no HubSpot.</p></section>
        <details class="ta-workflow-options" ${workflow.pipeline||workflow.status?'open':''}><summary>Pipeline e Status <span class="ta-demo-label">Opcional</span></summary><div class="ta-workflow-grid"><div class="ta-workflow-entry"><label><input id="ta-workflow-pipeline-enabled" type="checkbox" aria-label="Aplicar Pipeline" ${workflow.pipeline?'checked':''}>Pipeline</label><input id="ta-workflow-pipeline" aria-label="Pipeline" type="text" value="${escapeHtml(workflow.pipeline)}" placeholder="Pipeline de Suporte"></div><div class="ta-workflow-entry"><label><input id="ta-workflow-status-enabled" type="checkbox" aria-label="Aplicar Status do ticket" ${workflow.status?'checked':''}>Status do ticket</label><input id="ta-workflow-status" aria-label="Status do ticket" type="text" value="${escapeHtml(workflow.status)}" placeholder="Fechado"></div></div></details>
        <div id="ta-unified-status" class="ta-newpreset-status" role="status" aria-live="polite"></div>
        <section><div class="ta-newpreset-section-head"><h3 class="ta-newpreset-section-title">Campos do preset</h3><span id="ta-unified-count" class="ta-newpreset-count"></span></div><div id="ta-unified-fields"></div><button type="button" id="ta-unified-add" class="ta-newpreset-add">${uiIcon('plus')}Adicionar campo</button></section>
      </form>
      ${viewFooter('<button id="ta-unified-cancel" class="ta-newpreset-cancel" type="button">Cancelar</button><button id="ta-unified-save" class="ta-newpreset-save" type="button">Salvar preset '+uiIcon('check')+'</button>')}`;
    const container=modal.querySelector('#ta-unified-fields'),count=modal.querySelector('#ta-unified-count'),status=modal.querySelector('#ta-unified-status');
    const pipeline=modal.querySelector('#ta-workflow-pipeline'),stage=modal.querySelector('#ta-workflow-status'),pipelineOn=modal.querySelector('#ta-workflow-pipeline-enabled'),stageOn=modal.querySelector('#ta-workflow-status-enabled');
    const syncWorkflow=()=>{pipeline.disabled=!pipelineOn.checked;stage.disabled=!stageOn.checked;};
    pipelineOn.onchange=syncWorkflow;stageOn.onchange=syncWorkflow;syncWorkflow();
    const setStatus=(text,kind='')=>{status.textContent=text;status.className='ta-newpreset-status '+kind;};
    function renderFields(){
      container.innerHTML='';count.textContent=`${fields.filter(f=>f.enabled!==false).length}/${fields.length} selecionados`;
      if(!fields.length){const empty=document.createElement('p');empty.className='ta-newpreset-help';empty.textContent='Nenhum campo adicionado.';container.appendChild(empty);}
      fields.forEach((f,i)=>{
        const row=document.createElement('div');row.className='ta-newpreset-field'+(f.enabled===false?' is-disabled':'');
        const top=document.createElement('div');top.className='ta-newpreset-field-top';
        const check=document.createElement('input');check.type='checkbox';check.checked=f.enabled!==false;check.setAttribute('aria-label',`Aplicar campo ${f.label||i+1}`);check.onchange=()=>{f.enabled=check.checked;renderFields();};
        const label=document.createElement('input');label.className='ta-field-label-input';label.type='text';label.value=f.label;label.placeholder='Nome da propriedade';label.setAttribute('aria-label',`Nome da propriedade ${i+1}`);
        const remove=document.createElement('button');remove.className='ta-icon ta-newpreset-remove';remove.type='button';remove.innerHTML=uiIcon('close');remove.setAttribute('aria-label',`Remover campo ${i+1}`);remove.onclick=()=>{fields.splice(i,1);renderFields();};
        f.type=betaInferTypeFromLabel(f.label,f.type);
        const value=document.createElement(f.type==='textarea'?'textarea':'input');if(value.tagName==='INPUT')value.type='text';value.className='ta-field-value-input';value.value=betaFieldDisplayValue(f);value.placeholder=f.type==='multi'?'Valores separados por vírgula':'Deixe vazio para limpar';value.setAttribute('aria-label',`Valor de ${f.label||'campo '+(i+1)}`);
        value.oninput=()=>{f.value=f.type==='multi'?value.value.split(',').map(v=>v.trim()).filter(Boolean):value.value;};
        label.oninput=()=>{f.label=label.value;f.type=betaInferTypeFromLabel(f.label,f.type);value.oninput();check.setAttribute('aria-label',`Aplicar campo ${f.label||i+1}`);value.setAttribute('aria-label',`Valor de ${f.label||'campo '+(i+1)}`);};
        top.append(check,label,remove);row.append(top,value);container.appendChild(row);
      });
    }
    modal.querySelector('#ta-read-ticket-data').onclick=()=>{
      const current=readCurrentWorkflow(),detected=readCurrentClassification();
      if(current.pipeline){pipeline.value=current.pipeline;pipelineOn.checked=true;}
      if(current.status){stage.value=current.status;stageOn.checked=true;}
      syncWorkflow();if(current.pipeline||current.status)modal.querySelector('.ta-workflow-options').open=true;
      if(detected.length){fields=detected.map(f=>normalizeBetaField({...f,enabled:String(betaFieldDisplayValue(f)).trim()!==''&&!/proprietário do ticket/i.test(f.label)}));renderFields();}
      const result=describeTicketImport(current,detected.length);setStatus(result.text,result.kind);
    };
    modal.querySelector('#ta-unified-add').onclick=()=>{fields.push({label:'',value:'',type:'dropdown',enabled:true});renderFields();container.querySelectorAll('.ta-field-label-input')[fields.length-1]?.focus();};
    modal.querySelector('#ta-unified-close').onclick=closeModal;modal.querySelector('#ta-unified-cancel').onclick=closeModal;
    const savePreset=()=>{
      const name=modal.querySelector('#ta-unified-name').value.trim(),typedGroup=modal.querySelector('#ta-unified-group').value.trim();
      const group=getGroupNames().find(g=>g.toLowerCase()===typedGroup.toLowerCase())||typedGroup||'GERAL';
      const all=fields.map(normalizeBetaField),enabled=all.filter(f=>f.enabled!==false);
      const savedWorkflow={pipeline:pipelineOn.checked?pipeline.value.trim():'',status:stageOn.checked?stage.value.trim():''};
      if(!name){setStatus('Informe um nome para o preset.','error');modal.querySelector('#ta-unified-name').focus();return;}
      if(enabled.some(f=>!f.label)){setStatus('Informe o nome de todas as propriedades selecionadas.','error');return;}
      if(pipelineOn.checked&&!savedWorkflow.pipeline){setStatus('Informe a Pipeline ou desative sua aplicação.','error');return;}
      if(stageOn.checked&&!savedWorkflow.status){setStatus('Informe o Status ou desative sua aplicação.','error');return;}
      if(!enabled.length&&!savedWorkflow.pipeline&&!savedWorkflow.status){setStatus('Selecione ao menos um campo, Pipeline ou Status.','error');return;}
      const data={name,group,fields:all,...(savedWorkflow.pipeline||savedWorkflow.status?{workflow:savedWorkflow}:{})};
      lastApplicationFeedback=null;
      if(isEditing){const existing=presets.find(p=>p.id===preset.id);if(existing){Object.assign(existing,data);if(!data.workflow)delete existing.workflow;}}
      else presets.push({id:generateId(),...data});
      closeModal();save();
    };
    modal.querySelector('#ta-unified-save').onclick=savePreset;
    modal.querySelector('#ta-editor-form').onsubmit=e=>{e.preventDefault();savePreset();};
    overlay.classList.add('is-visible');renderFields();setTimeout(()=>modal.querySelector('#ta-unified-name')?.focus(),0);
  }


  // UI da versão 2.4: mesma composição e tokens do protótipo aprovado.
  let secondaryView = 'list';
  let backupDraft = '';
  let backupError = '';
  let floatingCardMenu = null;

  function productSignature() {
    return `<div class="ta-dev-footer"><div class="ta-dev-signature"><span>Desenvolvido por</span> <a href="https://m.lagamba.workers.dev/" target="_blank" rel="noopener noreferrer">Lagamba Tech</a></div><span class="ta-version">V ${TICKETAI_VERSION}</span></div>`;
  }

  function viewHeading(title, subtitle) {
    return `<div class="ta-view-heading"><button type="button" class="ta-icon" data-ta-action="back" aria-label="Voltar aos presets">${uiIcon('left')}</button><div><h2>${title}</h2><p>${subtitle}</p></div></div>`;
  }

  function viewFooter(buttons) {
    return `<footer class="ta-footer"><div class="ta-footer-row">${buttons}</div>${productSignature()}</footer>`;
  }

  function injectStyles() {
    if (document.getElementById('ticketai-design-v24')) return;
    const style = document.createElement('style');
    style.id = 'ticketai-design-v24';
    style.textContent = `
      #ticketai-widget{--ta-accent:#f5b544;--ta-bg:#101318;--ta-surface:#191e26;--ta-border:#303845;--ta-text:#edf0f5;--ta-muted:#a1adbd;position:fixed;top:20px;right:20px;width:440px;height:670px;min-width:296px;min-height:350px;max-width:calc(100vw - 12px);max-height:calc(100vh - 12px);display:flex;flex-direction:column;background:var(--ta-bg);color:var(--ta-text);border:1px solid var(--ta-border);border-radius:18px;box-shadow:0 12px 35px #0003;z-index:2147483647;overflow:hidden;font:14px/1.45 Inter,system-ui,sans-serif;color-scheme:dark;container-type:inline-size}
      #ticketai-widget,#ticketai-widget *,#ticketai-widget *::before,#ticketai-widget *::after{box-sizing:border-box}
      #ticketai-widget button,#ticketai-widget input,#ticketai-widget select,#ticketai-widget textarea{font:inherit}
      #ticketai-widget button{cursor:pointer;color:inherit}
      #ticketai-widget :is(button,input,select,textarea,a,summary):focus-visible{outline:2px solid var(--ta-accent);outline-offset:3px}
      #ticketai-widget button:disabled{opacity:.45;cursor:default}
      #ticketai-widget [hidden]{display:none!important}
      #ticketai-widget .ta-svg{width:18px;height:18px;flex-shrink:0;pointer-events:none;display:block}
      #ticketai-widget .ta-header{height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 15px;border-bottom:1px solid var(--ta-border);cursor:grab}
      #ticketai-widget .ta-title{display:flex;align-items:center;gap:7px;pointer-events:none}
      #ticketai-widget .ta-brand-mark{color:var(--ta-accent);display:flex}
      #ticketai-widget .ta-title strong{font-size:16px;font-weight:600}
      #ticketai-widget .ta-title-ai{color:var(--ta-accent)}
      #ticketai-widget .ta-btn-group{display:flex;gap:0}
      #ticketai-widget .ta-icon,#ticketai-widget .ta-h-btn{width:36px;height:36px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid transparent;border-radius:8px;padding:0}
      #ticketai-widget .ta-btn-group .ta-icon{width:31px;height:34px}
      #ticketai-widget .ta-icon:hover{background:var(--ta-surface);border-color:var(--ta-border)}
      #ticketai-widget .ta-body,#ticketai-widget .ta-secondary-view{flex:1;min-height:0;display:flex;flex-direction:column}
      #ticketai-widget .ta-search-area{padding:13px 16px 9px;flex-shrink:0}
      #ticketai-widget .ta-search-row{display:flex;gap:7px;align-items:center}
      #ticketai-widget .ta-search{flex:1;min-width:0;display:flex;align-items:center;gap:9px;border:1px solid var(--ta-border);border-radius:9px;padding:0 12px;background:#141920;color:var(--ta-muted)}
      #ticketai-widget .ta-search:focus-within{border-color:var(--ta-accent)}
      #ticketai-widget .ta-search-input{background:transparent;color:var(--ta-text);border:0;min-width:0;width:100%;padding:11px 0;outline:none}
      #ticketai-widget .ta-search-input:focus,#ticketai-widget .ta-search-input:focus-visible{outline:none;box-shadow:none}
      #ticketai-widget .ta-search-input::-webkit-search-cancel-button{display:none}
      #ticketai-widget .ta-search-clear{flex-shrink:0;width:24px;height:24px;padding:3px;border:0;border-radius:5px;background:transparent;color:var(--ta-muted);display:flex;align-items:center;justify-content:center}
      #ticketai-widget .ta-search-clear:hover{background:var(--ta-surface);color:var(--ta-text)}
      #ticketai-widget input::placeholder{color:var(--ta-muted)}
      #ticketai-widget .ta-organize-groups{border:1px solid var(--ta-border);background:var(--ta-surface);height:42px;width:42px}
      #ticketai-widget .ta-list-meta{display:flex;justify-content:space-between;align-items:center;color:var(--ta-muted);font-size:12px;margin-top:11px;gap:8px}
      #ticketai-widget #ta-list,#ticketai-widget .ta-view-scroll{overflow-y:auto;min-height:0;flex:1;padding:0 16px 18px;scrollbar-width:thin;scrollbar-color:var(--ta-border) transparent}
      #ticketai-widget .ta-group-label{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--ta-muted);margin:17px 0 8px;display:flex;gap:7px;align-items:center}
      #ticketai-widget .ta-group-label:first-child{margin-top:6px}
      #ticketai-widget .ta-group-label span{letter-spacing:0;opacity:.7}
      #ticketai-widget .ta-preset-card{position:relative;border:1px solid var(--ta-border);border-radius:10px;background:var(--ta-surface);margin-bottom:7px;padding:0 6px 0 0}
      #ticketai-widget .ta-card-header-row{display:flex;align-items:center;gap:4px}
      #ticketai-widget .ta-apply-preset{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;flex:1;min-width:0;padding:12px;background:none;border:0;border-radius:9px}
      #ticketai-widget .ta-apply-preset:hover{background:#ffffff06}
      #ticketai-widget .ta-preset-name{font-weight:500;overflow-wrap:anywhere;min-width:0}
      #ticketai-widget .ta-apply-hint{color:var(--ta-accent);display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:22px;flex-shrink:0;font-size:12px;white-space:nowrap}
      #ticketai-widget .ta-apply-hint .ta-svg{width:15px;height:15px}
      #ticketai-widget .ta-more{width:36px;height:36px;background:none;color:var(--ta-text);border:1px solid transparent;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}
      #ticketai-widget .ta-more:hover{background:#ffffff06;border-color:var(--ta-border)}
      #ticketai-widget .ta-preset-actions{position:absolute;width:180px;padding:5px;background:#242c37;border:1px solid #455163;border-radius:10px;box-shadow:0 10px 30px #0006;z-index:25}
      #ticketai-widget .ta-preset-actions button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;border-radius:6px;text-align:left;padding:10px}
      #ticketai-widget .ta-preset-actions button:hover{background:#ffffff0a}
      #ticketai-widget .ta-danger{color:#ffada6!important}
      #ticketai-widget .ta-preset-checkbox-wrap{display:none;padding-left:13px}
      #ticketai-widget .select-mode-active .ta-preset-checkbox-wrap{display:flex}
      #ticketai-widget .select-mode-active .ta-more,#ticketai-widget .select-mode-active .ta-apply-hint{display:none}
      #ticketai-widget .ta-preset-card.is-selected{border-color:var(--ta-accent);background:#2d281e}
      #ticketai-widget input[type=checkbox]{accent-color:var(--ta-accent);width:16px;height:16px;margin:0 6px 0 0;flex-shrink:0}
      #ticketai-widget .ta-selection-toolbar{display:none;margin:0 16px 10px;padding:9px;border:1px solid #67532e;background:#2a251b;border-radius:8px;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap;font-size:12px}
      #ticketai-widget .ta-selection-toolbar.is-visible{display:flex}
      #ticketai-widget .ta-selection-actions{display:flex;gap:5px;flex-wrap:wrap}
      #ticketai-widget .ta-selection-actions button{border:1px solid var(--ta-border);border-radius:6px;background:var(--ta-surface);padding:6px 8px;font-size:12px}
      #ticketai-widget .ta-footer{flex-shrink:0;border-top:1px solid var(--ta-border);padding:7px 16px 6px;background:var(--ta-bg)}
      #ticketai-widget .ta-footer-row{display:flex;gap:8px}
      #ticketai-widget .ta-primary,#ticketai-widget .ta-btn-add,#ticketai-widget .ta-newpreset-save{background:var(--ta-accent);color:#17130b;border:1px solid var(--ta-accent);border-radius:8px;padding:10px 14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:500}
      #ticketai-widget .ta-secondary,#ticketai-widget .ta-newpreset-cancel{background:var(--ta-surface);border:1px solid var(--ta-border);border-radius:8px;padding:10px 14px;display:inline-flex;align-items:center;justify-content:center;gap:7px}
      #ticketai-widget .ta-footer-row .ta-primary,#ticketai-widget .ta-btn-add,#ticketai-widget .ta-newpreset-save{flex:1}
      #ticketai-widget .ta-dev-footer{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;margin-top:4px;padding-top:0;text-align:center;color:var(--ta-muted);font-size:11px}
      #ticketai-widget .ta-dev-signature{white-space:nowrap;line-height:14px;color:#8c98a9}
      #ticketai-widget .ta-dev-signature a{font-size:11px;line-height:14px;letter-spacing:0;font-weight:400;color:#aeb9c8;text-decoration:none}
      #ticketai-widget .ta-dev-signature a:hover{color:var(--ta-accent);text-decoration:underline;text-underline-offset:3px}
      #ticketai-widget .ta-version{font-size:11px;line-height:13px;color:#8c98a9}
      #ticketai-widget .ta-view-heading,#ticketai-widget .ta-newpreset-header{padding:16px 18px 12px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--ta-border);flex-shrink:0}
      #ticketai-widget .ta-view-heading h2,#ticketai-widget .ta-newpreset-title{font-size:16px;margin:0;font-weight:500}
      #ticketai-widget .ta-view-heading p,#ticketai-widget .ta-newpreset-subtitle{font-size:12px;color:var(--ta-muted);margin:2px 0 0}
      #ticketai-widget .ta-settings{padding:18px;display:flex;flex-direction:column;gap:18px}
      #ticketai-widget .ta-action-list{display:flex;flex-direction:column;gap:6px}
      #ticketai-widget .ta-action-list>button{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--ta-border);border-radius:9px;background:var(--ta-surface);text-align:left}
      #ticketai-widget .ta-action-list>button>span{flex:1}
      #ticketai-widget .ta-action-list small{display:block;font-size:11px;color:var(--ta-muted);margin-top:2px}
      #ticketai-widget .ta-group-order{display:flex;align-items:center;gap:8px;padding:12px 8px;margin:7px 0;border:1px solid var(--ta-border);border-radius:9px;background:var(--ta-surface)}
      #ticketai-widget .ta-grip{color:var(--ta-muted);cursor:grab;display:flex;padding:4px}
      #ticketai-widget .ta-group-name{flex:1;min-width:0;overflow-wrap:anywhere}
      #ticketai-widget .ta-group-name small{display:block;color:var(--ta-muted);font-size:11px}
      #ticketai-widget .ta-group-order.is-dragging{opacity:.45}
      #ticketai-widget .ta-group-order.is-drag-over{border-color:var(--ta-accent);box-shadow:0 -3px var(--ta-accent)}
      #ticketai-widget .ta-modal-overlay{position:absolute;inset:44px 0 0;display:none;z-index:30;min-height:0;padding:0;background:var(--ta-bg);border:0;border-radius:0}
      #ticketai-widget .ta-modal-overlay.is-visible{display:flex}
      #ticketai-widget .ta-modal{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--ta-bg);color:var(--ta-text)}
      #ticketai-widget .ta-newpreset-body{padding:16px;overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;scrollbar-width:thin;scrollbar-color:var(--ta-border) transparent}
      #ticketai-widget .ta-newpreset-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      #ticketai-widget .ta-newpreset-main-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--ta-muted);min-width:0}
      #ticketai-widget .ta-newpreset-body input:not([type=checkbox]),#ticketai-widget .ta-newpreset-body textarea,#ticketai-widget .ta-backup-input{background:#141920;color:var(--ta-text);border:1px solid var(--ta-border);border-radius:7px;width:100%;padding:10px;min-width:0}
      #ticketai-widget .ta-newpreset-body textarea{resize:vertical;min-height:58px}
      #ticketai-widget .ta-newpreset-section-title{font-size:13px;font-weight:500;margin:0 0 9px}
      #ticketai-widget .ta-newpreset-section-title strong{font-weight:500}
      #ticketai-widget .ta-newpreset-help,#ticketai-widget .ta-newpreset-status{font-size:12px;color:var(--ta-muted);margin:7px 0 0}
      #ticketai-widget .ta-newpreset-status:empty{display:none}
      #ticketai-widget .ta-newpreset-status.error{color:#ffada6}
      #ticketai-widget .ta-newpreset-status.success{color:#7ddbb0}
      #ticketai-widget .ta-newpreset-mode{width:100%;justify-content:flex-start;text-align:left}
      #ticketai-widget .ta-workflow-options{border-block:1px solid var(--ta-border);padding:12px 0}
      #ticketai-widget .ta-workflow-options summary{cursor:pointer;font-size:13px}
      #ticketai-widget .ta-demo-label{font-size:11px;border:1px solid var(--ta-border);padding:3px 7px;border-radius:5px;color:var(--ta-muted);margin-left:5px}
      #ticketai-widget .ta-workflow-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
      #ticketai-widget .ta-workflow-entry{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--ta-muted)}
      #ticketai-widget .ta-workflow-entry label{display:flex;align-items:center;gap:2px}
      #ticketai-widget .ta-newpreset-section-head,#ticketai-widget .ta-newpreset-field-top{display:flex;align-items:center;justify-content:space-between;gap:4px}
      #ticketai-widget .ta-newpreset-count{font-size:11px;color:var(--ta-muted)}
      #ticketai-widget .ta-newpreset-field{margin-top:11px}
      #ticketai-widget .ta-newpreset-field-top{margin-bottom:5px;font-size:12px}
      #ticketai-widget .ta-newpreset-field.is-disabled{opacity:.55}
      #ticketai-widget .ta-newpreset-field-top .ta-field-label-input{background:transparent!important;padding:4px 6px!important;border-color:transparent!important;font-weight:500;flex:1;font-size:13px!important}
      #ticketai-widget .ta-field-label-input:hover,#ticketai-widget .ta-field-label-input:focus{border-color:var(--ta-border)!important}
      #ticketai-widget .ta-newpreset-remove{width:28px;height:28px;color:var(--ta-muted)}
      #ticketai-widget .ta-newpreset-add,#ticketai-widget .ta-link{background:none;border:0;color:var(--ta-accent);display:flex;gap:7px;align-items:center;padding:10px 0}
      #ticketai-widget .ta-newpreset-order{display:none}
      #ticketai-widget .ta-group-picker{position:relative}
      #ticketai-widget .ta-group-suggestions{position:absolute;left:0;right:0;top:calc(100% + 4px);background:#242c37;border:1px solid #455163;border-radius:8px;padding:5px;z-index:2;max-height:150px;overflow:auto}
      #ticketai-widget .ta-group-suggestion{display:block;width:100%;padding:8px;background:none;border:0;text-align:left;border-radius:5px}
      #ticketai-widget .ta-group-suggestion:hover{background:#ffffff09}
      #ticketai-widget #ta-confirm-overlay{padding:15px;align-items:center;justify-content:center;background:#080b11b8;backdrop-filter:blur(3px)}
      #ticketai-widget #ta-confirm-overlay .ta-modal{background:#202733;border:1px solid #445063;border-radius:13px;padding:18px;width:100%;height:auto;max-height:100%;overflow:auto;display:block;box-shadow:0 15px 40px #0005}
      #ticketai-widget .ta-confirm-title{font-size:16px;margin:0 0 9px;font-weight:500}
      #ticketai-widget .ta-confirm-message{font-size:13px;color:var(--ta-muted);margin:0 0 15px}
      #ticketai-widget .ta-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:17px}
      #ticketai-widget .ta-modal-actions .ta-primary{flex:0 0 auto}
      #ticketai-widget .ta-confirm-ok-danger{background:var(--ta-surface);border-color:var(--ta-border);color:#ffada6}
      #ticketai-widget .ta-help-content dl{margin:0;font-size:12px}
      #ticketai-widget .ta-help-content dt{color:var(--ta-accent);margin-top:10px}
      #ticketai-widget .ta-help-content dd{margin:3px 0;color:var(--ta-muted)}
      #ticketai-widget .ta-backup-input{min-height:180px;resize:vertical;font:11px/1.45 ui-monospace,monospace}
      #ticketai-widget .ta-backup-label{font-size:12px;color:var(--ta-muted);display:flex;flex-direction:column;gap:7px}
      #ticketai-widget .ta-backup-label input[type=file]{width:100%;font-size:12px}
      #ticketai-widget .ta-backup-error{font-size:12px;color:#ffada6;margin:0}
      #ticketai-widget .ta-field-results,#ticketai-widget .ta-field-summary,#ticketai-widget .ta-progress-bar{display:none}
      #ticketai-widget .ta-preset-card[data-confirmation=running] .ta-apply-hint{color:var(--ta-muted)}
      #ticketai-widget .ta-preset-card[data-confirmation=success]{background:#16251d;border-color:color-mix(in srgb,#88d4ac 38%,var(--ta-border))}
      #ticketai-widget .ta-preset-card[data-confirmation=success] .ta-apply-hint{color:#88d4ac}
      #ticketai-widget .ta-preset-card[data-confirmation=partial]{background:#2a251b;border-color:color-mix(in srgb,var(--ta-accent) 48%,var(--ta-border))}
      #ticketai-widget .ta-preset-card[data-confirmation=running] .ta-apply-preset:disabled{opacity:1}
      #ticketai-widget .ta-confirm-spinner{height:12px;width:12px;border:1.5px solid var(--ta-border);border-top-color:var(--ta-muted);border-radius:50%;animation:ta-confirm-spin .8s linear infinite}
      @keyframes ta-confirm-spin{to{transform:rotate(360deg)}}
      #ticketai-widget .ta-confirm-details{padding:8px 12px 10px;border-top:1px solid var(--ta-border);font-size:12px}
      #ticketai-widget .ta-confirm-count{font-weight:500;margin-bottom:7px}
      #ticketai-widget .ta-confirm-pending{white-space:pre-line;overflow-wrap:anywhere;color:var(--ta-accent)}
      #ticketai-widget .ta-confirm-actions{display:flex;gap:16px;margin-top:8px}
      #ticketai-widget .ta-confirm-actions button{background:transparent;border:0;border-radius:4px;padding:4px 0;font-size:12px;color:var(--ta-accent)}
      #ticketai-widget .ta-confirm-actions .ta-confirm-dismiss{color:var(--ta-muted)}
      #ticketai-widget .ta-undo-toast{display:none;margin:0 16px 10px;padding:10px 12px;border-left:3px solid var(--ta-accent);border-radius:7px;background:#302719;font-size:12px;align-items:center;justify-content:space-between;gap:8px}
      #ticketai-widget .ta-undo-toast.is-visible{display:flex}
      #ticketai-widget .ta-undo-toast button{color:var(--ta-accent);border:0;background:none;font-size:12px;padding:3px}
      #ticketai-widget .ta-empty-state{padding:36px 10px;text-align:center;color:var(--ta-muted)}
      #ticketai-widget .ta-empty-sub{font-size:12px;margin-top:5px}
      #ticketai-widget .ta-empty-icon{display:none}
      #ticketai-widget .ta-highlight{background:#57431e;color:#ffe2a2;border-radius:2px}
      #ticketai-widget .ta-compact-nav{display:none;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--ta-muted);padding:2px 10px}
      #ticketai-widget .ta-compact-nav button{background:none;border:0;color:inherit;width:29px;height:29px;padding:5px;display:flex}
      #ticketai-widget.is-peek{width:320px!important;height:auto!important;min-height:0!important}
      #ticketai-widget.is-peek .ta-search-area,#ticketai-widget.is-peek .ta-selection-toolbar,#ticketai-widget.is-peek .ta-footer{display:none}
      #ticketai-widget.is-peek .ta-compact-nav{display:flex}
      #ticketai-widget.is-peek .ta-body{flex:0 1 auto}
      #ticketai-widget.is-peek #ta-list{flex:0 1 auto;padding:2px 10px 4px}
      #ticketai-widget.is-peek .ta-apply-preset{padding:8px 10px;gap:8px}
      #ticketai-widget.is-peek .ta-preset-card{margin-bottom:3px}
      #ticketai-widget.is-peek .ta-apply-hint{font-size:12px}
      #ticketai-widget.is-peek:has(>.ta-preset-actions:not([hidden])){min-height:178px!important}
      #ticketai-widget.is-minimized{height:44px!important;min-height:44px!important}
      #ticketai-widget.is-minimized .ta-body,#ticketai-widget.is-minimized .ta-secondary-view,#ticketai-widget.is-minimized .ta-modal-overlay,#ticketai-widget.is-minimized .ta-resizer-corner{display:none}
      #ticketai-widget .ta-resizer{position:absolute;top:0;width:5px;height:100%;cursor:ew-resize;z-index:40}
      #ticketai-widget .ta-resizer-left{left:0}#ticketai-widget .ta-resizer-right{right:0}
      #ticketai-widget .ta-resizer-vertical{position:absolute;left:0;width:100%;height:5px;cursor:ns-resize;z-index:40}
      #ticketai-widget .ta-resizer-top{top:0}#ticketai-widget .ta-resizer-bottom{bottom:0}
      #ticketai-widget .ta-resizer-corner{position:absolute;right:1px;bottom:1px;border:0;background:transparent;color:transparent;padding:0;width:12px;height:12px;cursor:nwse-resize;z-index:41}
      #ticketai-widget .ta-resizer-corner .ta-svg{width:13px;height:13px}
      @container(max-width:360px){#ticketai-widget .ta-newpreset-grid,#ticketai-widget .ta-workflow-grid{grid-template-columns:1fr}#ticketai-widget .ta-meta-hint{display:none}#ticketai-widget .ta-btn-group .ta-icon{width:29px}}
      @media(prefers-reduced-motion:reduce){#ticketai-widget *,#ticketai-widget *::before{transition:none!important;animation:none!important}}
    `;
    document.head.appendChild(style);
  }

  function buildWidgetDom() {
    const widget = document.createElement('div');
    widget.id = 'ticketai-widget';
    widget.innerHTML = `
      <div class="ta-resizer ta-resizer-left" id="ta-res-l"></div><div class="ta-resizer ta-resizer-right" id="ta-res-r"></div><div class="ta-resizer-vertical ta-resizer-top" id="ta-res-t"></div><div class="ta-resizer-vertical ta-resizer-bottom" id="ta-res-b"></div>
      <header class="ta-header" id="ta-drag-h"><div class="ta-title"><strong>Ticket<span class="ta-title-ai">AI</span></strong></div><div class="ta-btn-group">
        <button type="button" class="ta-icon" id="ta-btn-help" aria-label="Ajuda e atalhos" title="Ajuda e atalhos">${uiIcon('help')}</button>
        <button type="button" class="ta-icon" id="ta-btn-peek" aria-label="Alternar modo compacto" title="Modo compacto · Alt+W">${uiIcon('compact')}</button>
        <button type="button" class="ta-icon" id="ta-btn-min" aria-label="Minimizar ou expandir" title="Minimizar · Alt+Q">${uiIcon('minus')}</button>
        <button type="button" class="ta-icon" id="ta-btn-close" aria-label="Fechar widget" title="Fechar">${uiIcon('close')}</button>
      </div></header>
      <div class="ta-body" id="ta-body">
        <div class="ta-search-area"><div class="ta-search-row"><div class="ta-search">${uiIcon('search')}<input type="search" id="ta-search-input" class="ta-search-input" aria-label="Buscar preset ou grupo" placeholder="Buscar preset ou grupo"><button type="button" id="ta-search-clear" class="ta-search-clear" aria-label="Limpar busca" title="Limpar busca" hidden>${uiIcon('close')}</button></div><button id="ta-btn-organize-groups" class="ta-icon ta-organize-groups" type="button" aria-label="Organizar grupos" title="Organizar grupos">${uiIcon('groups')}</button></div><div class="ta-list-meta"><span id="ta-preset-count"></span><span class="ta-meta-hint">Aplicação com um clique</span></div></div>
        <div class="ta-undo-toast" id="ta-undo-toast"><span id="ta-undo-toast-text"></span><button id="ta-undo-toast-btn" type="button">Desfazer</button></div>
        <div class="ta-selection-toolbar" id="ta-selection-toolbar"><span id="ta-selection-count">0 selecionados</span><div class="ta-selection-actions"><button id="ta-btn-select-all" type="button">Selecionar tudo</button><button id="ta-btn-selection-delete" type="button" class="ta-danger">Apagar</button><button id="ta-btn-selection-cancel" type="button">Cancelar</button></div></div>
        <div class="ta-compact-nav"><button type="button" id="ta-peek-prev" aria-label="Preset anterior">${uiIcon('left')}</button><span id="ta-peek-position"></span><button type="button" id="ta-peek-next" aria-label="Próximo preset">${uiIcon('right')}</button></div>
        <div id="ta-list"></div>
        ${viewFooter(`<button id="ta-btn-add" class="ta-btn-add" type="button">${uiIcon('plus')}Novo preset</button><button id="ta-btn-gear" class="ta-secondary" type="button" aria-label="Opções">${uiIcon('settings')}</button>`)}
      </div>
      <div class="ta-secondary-view" id="ta-secondary-view" hidden></div>
      <div class="ta-modal-overlay" id="ta-modal-overlay"><div class="ta-modal"></div></div>
      <div class="ta-modal-overlay" id="ta-confirm-overlay"><section class="ta-modal"><h2 class="ta-confirm-title" id="ta-confirm-title">Confirmar</h2><div class="ta-confirm-message" id="ta-confirm-message"></div><div class="ta-modal-actions"><button id="ta-confirm-dismiss" class="ta-secondary" type="button" hidden>Cancelar</button><button id="ta-confirm-cancel" class="ta-secondary" type="button">Cancelar</button><button id="ta-confirm-ok" class="ta-primary" type="button">OK</button></div></section></div>
      <button class="ta-resizer-corner" id="ta-res-corner" type="button" aria-label="Redimensionar widget; use as setas"></button>`;
    return widget;
  }

  function showProductView(view) {
    if (applyingPreset) return;
    closeCardMenus();
    secondaryView = view;
    organizingGroups = view === 'groups';
    const widget = document.getElementById('ticketai-widget');
    widget?.classList.remove('is-peek', 'is-minimized');
    peekMode = false;
    render();
  }

  function renderSecondaryView() {
    const panel = document.getElementById('ta-secondary-view');
    if (!panel) return;
    panel.hidden = secondaryView === 'list';
    document.getElementById('ta-body').hidden = secondaryView !== 'list';
    if (panel.hidden) return;
    const option = (action,title,description,icon,danger='') => `<button type="button" data-ta-action="${action}" class="${danger}">${uiIcon(icon)}<span>${title}${description?`<small>${description}</small>`:''}</span></button>`;
    if (secondaryView === 'options') {
      panel.innerHTML = viewHeading('Opções','Presets, backups e modos do widget.') + `<div class="ta-view-scroll ta-settings"><div class="ta-action-list">
        ${option('select-mode','Selecionar presets','Apagar vários de uma vez','select')}
        ${option('groups','Organizar grupos','Arrastar ou mover com setas','groups')}
        ${option('export','Exportar backup','Gerar JSON dos seus presets','download')}
        ${option('import','Importar backup','Ler arquivo ou colar JSON','upload')}
        ${option('delete-all','Apagar todos','Confirmação e desfazer por 20 segundos','trash','ta-danger')}
        </div><div class="ta-action-list">${option('compact','Modo compacto','Um preset por vez · Alt+W · roda do mouse','compact')}${option('reset-geometry','Restaurar posição e tamanho','','resize')}${option('help','Ajuda e atalhos','','help')}</div></div>` + viewFooter('<button type="button" class="ta-primary" data-ta-action="back">Voltar aos presets</button>');
    } else if (secondaryView === 'groups') {
      const names = getOrderedGroupNames();
      panel.innerHTML = viewHeading('Organizar grupos','Arraste um grupo ou use as setas para reposicionar.') + `<div class="ta-view-scroll" style="padding-top:10px">${names.map((g,i)=>`<div class="ta-group-order ta-group-organizing" draggable="true" data-group="${escapeHtml(g)}"><span class="ta-grip">${uiIcon('grip')}</span><div class="ta-group-name">${escapeHtml(g)}<small>${presets.filter(p=>(p.group||'GERAL')===g).length} presets</small></div><button class="ta-icon" type="button" data-ta-action="group-up" data-group="${escapeHtml(g)}" aria-label="Mover ${escapeHtml(g)} para cima" ${i===0?'disabled':''}>${uiIcon('up')}</button><button class="ta-icon" type="button" data-ta-action="group-down" data-group="${escapeHtml(g)}" aria-label="Mover ${escapeHtml(g)} para baixo" ${i===names.length-1?'disabled':''}>${uiIcon('down')}</button></div>`).join('') || '<p class="ta-newpreset-help">Crie um preset para organizar os grupos.</p>'}</div>` + viewFooter('<button type="button" class="ta-primary" data-ta-action="back">Concluir</button>');
    } else {
      const exporting = secondaryView === 'export';
      panel.innerHTML = viewHeading(exporting?'Exportar backup':'Importar backup',exporting?'Seus presets em um arquivo JSON.':'O arquivo será lido localmente.') + `<div class="ta-view-scroll ta-settings">${exporting?'':'<label class="ta-backup-label">Selecionar arquivo JSON<input id="ta-import-file" type="file" accept=".json,application/json"></label>'}<label class="ta-backup-label">${exporting?'Prévia do JSON':'Ou cole o JSON do backup'}<textarea id="ta-backup-json" class="ta-backup-input" spellcheck="false" ${exporting?'readonly':''}>${escapeHtml(exporting?JSON.stringify(presets,null,2):backupDraft)}</textarea></label><p class="ta-newpreset-help">${exporting?'Guarde este arquivo para restaurar seus presets.':'Aceita presets legados e campos dinâmicos. Nome e grupo identificam duplicados.'}</p>${backupError?`<p class="ta-backup-error" role="alert">${escapeHtml(backupError)}</p>`:''}</div>` + viewFooter(`<button type="button" class="ta-secondary" data-ta-action="options">Voltar</button><button type="button" class="ta-primary" data-ta-action="${exporting?'download':'process-import'}">${uiIcon(exporting?'download':'upload')}${exporting?'Baixar JSON':'Importar presets'}</button>`);
      if (!exporting) {
        panel.querySelector('#ta-backup-json').oninput = e => {backupDraft=e.target.value;};
        panel.querySelector('#ta-import-file').onchange = e => {
          const file=e.target.files[0]; if(!file)return;
          const reader=new FileReader(); reader.onload=()=>{backupDraft=String(reader.result||'');backupError='';renderSecondaryView();};
          reader.onerror=()=>{backupError='Não foi possível ler o arquivo.';renderSecondaryView();}; reader.readAsText(file);
        };
      }
    }
  }

  function showProductHelp() {
    showConfirmModal('',{title:'Ajuda e atalhos',okOnly:true,okText:'Entendi',contentHtml:'<div class="ta-help-content"><dl><dt>Alt + Q</dt><dd>Abrir ou alternar minimizado / expandido.</dd><dt>Alt + W</dt><dd>Ativar ou sair do modo compacto.</dd><dt>Esc</dt><dd>Cancelar próximas etapas da aplicação; fora dela, fechar menus e diálogos.</dd><dt>Modo compacto</dt><dd>Use a roda do mouse ou as setas para trocar de preset.</dd><dt>Posição e tamanho</dt><dd>Arraste o cabeçalho. Redimensione pelo canto inferior direito ou use as setas com esse controle focado.</dd></dl></div>'});
  }


  function saveGeometry(widget) {
    const geom = {
      left: widget.offsetLeft,
      top: widget.offsetTop,
      width: widget.classList.contains('is-peek') ? (parseFloat(widget.style.width) || 440) : widget.offsetWidth,
      height: widget.classList.contains('is-peek') || widget.classList.contains('is-minimized')
        ? (parseFloat(widget.style.height) || 670) : widget.offsetHeight
    };
    chrome.storage.local.set({ ticketaiGeom: geom });
  }

  function constrainGeometry(g, viewportWidth, viewportHeight) {
    const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const width = Math.min(Math.max(296, number(g.width, 440)), Math.max(1, viewportWidth - 12));
    const height = Math.min(Math.max(350, number(g.height, 670)), Math.max(1, viewportHeight - 12));
    return {width, height,
      left: Math.max(6, Math.min(number(g.left, viewportWidth - width - 20), viewportWidth - width - 6)),
      top: Math.max(6, Math.min(number(g.top, 20), viewportHeight - height - 6))};
  }

  function fitWidgetToViewport(widget) {
    if (window.innerWidth <= 0 || window.innerHeight <= 0 || widget.style.display === 'none') return;
    const g = constrainGeometry({left:parseFloat(widget.style.left) || widget.offsetLeft, top:parseFloat(widget.style.top) || widget.offsetTop,
      width:parseFloat(widget.style.width) || widget.offsetWidth,
      height:parseFloat(widget.style.height) || 670}, window.innerWidth, window.innerHeight);
    Object.assign(widget.style, {left:`${g.left}px`, top:`${g.top}px`, right:'auto', width:`${g.width}px`, height:`${g.height}px`});
  }

  function applySavedGeometry(widget) {
    chrome.storage.local.get(['ticketaiGeom'], (res) => {
      const g = res.ticketaiGeom;
      const bounded = constrainGeometry(g || {}, window.innerWidth, window.innerHeight);
      widget.style.left = bounded.left + 'px';
      widget.style.top = bounded.top + 'px';
      widget.style.right = 'auto';
      widget.style.width = bounded.width + 'px';
      widget.style.height = bounded.height + 'px';
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
        } else if (side === 'corner') {
          widget.style.width = Math.max(296,startWidth+mE.clientX-startX)+'px';
          widget.style.height = Math.max(350,startHeight+mE.clientY-startY)+'px';
        }
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        fitWidgetToViewport(widget); saveGeometry(widget);
      };
      window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
    };
    document.getElementById('ta-res-l').onmousedown = (e) => startResizing(e, 'left');
    document.getElementById('ta-res-r').onmousedown = (e) => startResizing(e, 'right');
    document.getElementById('ta-res-t').onmousedown = (e) => startResizing(e, 'top');
    document.getElementById('ta-res-b').onmousedown = (e) => startResizing(e, 'bottom');
    const corner=document.getElementById('ta-res-corner');
    corner.onmousedown=e=>startResizing(e,'corner');
    corner.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();
      const width=widget.offsetWidth+(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0);
      const height=widget.offsetHeight+(e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0);
      widget.style.width=width+'px';widget.style.height=height+'px';fitWidgetToViewport(widget);saveGeometry(widget);
    };
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
      if (drag) { drag = false; fitWidgetToViewport(widget); saveGeometry(widget); }
    });
  }


  // Modo compacto: mostra 1 preset por vez, sem rodapé nem busca. Role o
  // mouse sobre o card para passar para o próximo/anterior preset. A posição
  // (top/left) nunca é alterada automaticamente — fica exatamente onde o
  // usuário colocou, em qualquer troca de modo. Se precisar reposicionar,
  // o cabeçalho continua arrastável mesmo com o modo compacto ativo.
  function togglePeek(widget) {
    closeModal();
    closeCardMenus();
    secondaryView = 'list';
    organizingGroups = false;
    selectMode = false;
    selectedIds.clear();
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
    document.getElementById('ta-peek-prev').onclick=()=>{peekIndex=Math.max(0,peekIndex-1);renderList();};
    document.getElementById('ta-peek-next').onclick=()=>{peekIndex=Math.min(getFilteredPresets().length-1,peekIndex+1);renderList();};
    document.getElementById('ta-btn-peek').onclick=()=>togglePeek(widget);
    document.getElementById('ta-btn-min').onclick=()=>toggleMinimize(widget);
    document.getElementById('ta-btn-close').onclick=()=>{closeCardMenus();widget.style.display='none';};
    document.getElementById('ta-btn-help').onclick=()=>showProductHelp();
  }

  function setupDesignInteractions(widget) {
    document.addEventListener('click', event => {
      if (!event.target.closest('.ta-preset-card')) closeCardMenus();
    });
    document.addEventListener('keydown', event => {
      if (widget.style.display === 'none' || event.defaultPrevented) return;
      const confirm = document.getElementById('ta-confirm-overlay');
      const editor = document.getElementById('ta-modal-overlay');
      const activeDialog = confirm?.classList.contains('is-visible') ? confirm
        : editor?.classList.contains('is-visible') ? editor : null;
      if (event.key === 'Escape') {
        if (activeDialog === confirm) {
          const cancel = document.getElementById('ta-confirm-cancel');
          const dismiss=document.getElementById('ta-confirm-dismiss');
          (!dismiss.hidden?dismiss:cancel.style.display === 'none' ? document.getElementById('ta-confirm-ok') : cancel).click();
        } else if (activeDialog === editor) closeModal();
        else {
          closeCardMenus();
          if (secondaryView !== 'list') showProductView('list');
          if (selectMode) exitSelectMode();
        }
      }
      if (event.key === 'Tab' && activeDialog) {
        const controls = Array.from(activeDialog.querySelectorAll('button,input,textarea,select,a[href],summary'))
          .filter(el => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    });
    window.addEventListener('resize', () => fitWidgetToViewport(widget));
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
    showProductView('list');
    closeCardMenus();
    const widget = document.getElementById('ticketai-widget');
    widget?.classList.remove('is-peek', 'is-minimized');
    peekMode = false;
    const fields = Array.isArray(preset?.fields)
      ? preset.fields
      : betaLegacyFields(preset);
    openUnifiedPresetModal(preset, fields);
  }

  function closeModal() {
    document.getElementById('ta-modal-overlay').classList.remove('is-visible');
    editingId = null;
    document.getElementById('ta-btn-add')?.focus();
  }

  // Modal de confirmação/aviso dentro do próprio widget, substituindo
  // confirm()/alert() nativos do navegador (que aparecem fora da extensão,
  // atrás/sobre a página do Hubspot, e quebram a experiência).
  function showConfirmModal(message, opts = {}) {
    const { okOnly = false, title = 'Confirmar', okText = 'OK', cancelText = 'Cancelar', danger = false, allowDismiss = false, contentHtml = '' } = opts;
    return new Promise((resolve) => {
      const overlay = document.getElementById('ta-confirm-overlay');
      const iconEl = document.getElementById('ta-confirm-icon');
      const titleEl = document.getElementById('ta-confirm-title');
      const msgEl = document.getElementById('ta-confirm-message');
      const okBtn = document.getElementById('ta-confirm-ok');
      const cancelBtn = document.getElementById('ta-confirm-cancel');
      const dismissBtn = document.getElementById('ta-confirm-dismiss');
      if (!overlay || !msgEl || !okBtn || !cancelBtn) { resolve(true); return; }

      titleEl.textContent = title;
      if(contentHtml)msgEl.innerHTML=contentHtml;else msgEl.textContent = message;
      okBtn.textContent = okText;
      cancelBtn.textContent = cancelText;
      cancelBtn.style.display = okOnly ? 'none' : '';
      dismissBtn.hidden = !allowDismiss;
      if (iconEl) iconEl.style.display = danger ? 'block' : 'none';
      okBtn.classList.toggle('ta-confirm-ok-danger', danger);
      overlay.classList.add('is-visible');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'ta-confirm-title');
      const previousFocus = document.activeElement;
      (danger && !okOnly ? cancelBtn : okBtn).focus();

      const cleanup = (result) => {
        overlay.classList.remove('is-visible');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        dismissBtn.onclick = null;
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(result);
      };
      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      dismissBtn.onclick = () => cleanup(null);
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
    document.getElementById('ta-btn-selection-cancel').onclick=exitSelectMode;
    document.getElementById('ta-btn-select-all').onclick=()=>{
      const visible=getFilteredPresets(),all=visible.length&&visible.every(p=>selectedIds.has(p.id));
      visible.forEach(p=>all?selectedIds.delete(p.id):selectedIds.add(p.id));renderList();updateSelectionUI();
    };
    document.getElementById('ta-btn-selection-delete').onclick=async()=>{
      if(!selectedIds.size)return;
      const ok=await showConfirmModal('Excluir os '+selectedIds.size+' presets selecionados? Você poderá desfazer por 20 segundos.',{title:'Excluir presets?',okText:'Excluir',danger:true});
      if(ok){const ids=Array.from(selectedIds);selectMode=false;selectedIds.clear();deletePresetsWithUndo(ids);}
    };
  }

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
        <label class="ta-preset-checkbox-wrap"><input type="checkbox" class="ta-checkbox" aria-label="Selecionar ${escapeHtml(p.name)}" ${selectedIds.has(p.id) ? 'checked' : ''}></label>
        <button type="button" class="ta-apply-preset" ${applyingPreset ? 'disabled' : ''} aria-label="${selectMode ? 'Selecionar' : 'Aplicar'} ${escapeHtml(p.name)}"><span class="ta-preset-name"></span><span class="ta-apply-hint" role="status" aria-live="polite">${uiIcon('arrow')}</span></button>
        <button type="button" class="ta-more" ${applyingPreset ? 'disabled' : ''} aria-label="Opções de ${escapeHtml(p.name)}" aria-expanded="false">${uiIcon('more')}</button>
      </div>
      <div class="ta-preset-actions" hidden>
        <button type="button" class="ta-icon-btn ta-edit">${uiIcon('edit')}Editar</button>
        <button type="button" class="ta-icon-btn ta-dup">${uiIcon('copy')}Duplicar</button>
        <button type="button" class="ta-icon-btn ta-danger ta-del">${uiIcon('trash')}Excluir</button>
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
    const confirmationDetails=document.createElement('div');
    confirmationDetails.className='ta-confirm-details';confirmationDetails.hidden=true;
    confirmationDetails.innerHTML='<div class="ta-confirm-count"></div><div class="ta-confirm-pending"></div><div class="ta-confirm-actions"><button type="button" class="ta-confirm-retry">Tentar novamente</button><button type="button" class="ta-confirm-dismiss">Fechar</button></div>';
    card.appendChild(confirmationDetails);
    confirmationDetails.querySelector('.ta-confirm-retry').onclick=e=>{e.stopPropagation();if(!applyingPreset)applyPresetToCard(p,card);};
    confirmationDetails.querySelector('.ta-confirm-dismiss').onclick=e=>{e.stopPropagation();clearCardConfirmation();lastApplicationFeedback=null;closePreviousFeedback();};
    if (lastApplicationFeedback?.id === String(p.id)) {
      const {fields, results, activeLabel} = lastApplicationFeedback;
      showFieldResults(card, fields, results, activeLabel);
    }

    card.querySelector('.ta-apply-preset').onclick = async (e) => {
      e.stopPropagation();
      if (organizingGroups) return;
      if (selectMode) { toggleSelect(p.id); return; }
      if(cardConfirmation?.id===String(p.id)&&cardConfirmation.status==='partial'){
        cardConfirmation.expanded=!cardConfirmation.expanded;renderCardConfirmation(card);return;
      }
      await applyPresetToCard(p, card);
    };
    const actionMenu=card.querySelector('.ta-preset-actions');
    card.querySelector('.ta-more').onclick = e => {
      e.stopPropagation();
      if (applyingPreset) return;
      const actions = actionMenu;
      const open = actions.hidden || !actions.isConnected;
      closeCardMenus();
      if(!open)return;
      const widget=document.getElementById('ticketai-widget');
      widget.appendChild(actions);actions.hidden=false;floatingCardMenu=actions;
      const rect=card.getBoundingClientRect(),bounds=widget.getBoundingClientRect();
      const menuHeight=actions.offsetHeight;
      actions.style.right='12px';actions.style.top=Math.max(44,Math.min(rect.bottom-bounds.top-4,bounds.height-menuHeight-12))+'px';
      card.querySelector('.ta-more').setAttribute('aria-expanded', String(open));
    };
    card.querySelector('.ta-checkbox').onclick = (e) => { e.stopPropagation(); toggleSelect(p.id); };
    card.querySelector('.ta-edit').onclick = (e) => { e.stopPropagation(); openModal(p); };
    card.querySelector('.ta-dup').onclick = (e) => { e.stopPropagation(); duplicatePreset(p); };
    card.querySelector('.ta-del').onclick = async (e) => {
      e.stopPropagation();
      const ok = await showConfirmModal(`Excluir o preset "${p.name}"? Você poderá desfazer por 20 segundos.`, { title: 'Excluir preset', okText: 'Excluir', danger: true });
      if (ok) deletePresetsWithUndo([p.id]);
    };

    renderCardConfirmation(card);
    return card;
  }

  function closeCardMenus() {
    if(floatingCardMenu){floatingCardMenu.hidden=true;floatingCardMenu.remove();floatingCardMenu=null;}
    const widget = document.getElementById('ticketai-widget');
    for (const card of widget?.querySelectorAll('.ta-preset-card') || []) {
      const actions = card.querySelector('.ta-preset-actions');
      if (actions) actions.hidden = true;
      card.querySelector('.ta-more')?.setAttribute('aria-expanded', 'false');
    }
  }

  // Renderiza só a lista de presets (usado a cada digitação na busca, scroll
  // do modo compacto, etc.), sem tocar no input de busca, para não perder o
  // foco/cursor a cada atualização.
  function renderList() {
    const list=document.getElementById('ta-list');if(!list)return;
    closeCardMenus();list.innerHTML='';
    const filtered=getFilteredPresets(),names=getOrderedGroupNames();
    const count=document.getElementById('ta-preset-count');
    if(count)count.textContent=presets.length+' presets'+(searchQuery?' · '+filtered.length+' encontrados':'');
    peekIndex=Math.max(0,Math.min(peekIndex,filtered.length-1));
    const ordered=names.flatMap(g=>filtered.filter(p=>(p.group||'GERAL')===g));
    const position=document.getElementById('ta-peek-position'),previous=document.getElementById('ta-peek-prev'),next=document.getElementById('ta-peek-next');
    if(position)position.textContent=ordered.length?(ordered[peekIndex].group||'GERAL')+' · '+(peekIndex+1)+' de '+ordered.length:'Nenhum preset';
    if(previous)previous.disabled=peekIndex===0;if(next)next.disabled=peekIndex>=ordered.length-1;
    if(!filtered.length){renderEmptyState(list);return;}
    if(peekMode){list.appendChild(buildCard(ordered[peekIndex]));return;}
    for(const group of names){const groupItems=filtered.filter(p=>(p.group||'GERAL')===group);if(!groupItems.length)continue;
      const label=document.createElement('div');label.className='ta-group-label';label.innerHTML=highlightMatch(group,searchQuery)+' <span>'+groupItems.length+'</span>';list.appendChild(label);
      groupItems.forEach(p=>list.appendChild(buildCard(p)));
    }
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
    const toolbar=document.getElementById('ta-selection-toolbar');if(toolbar)toolbar.classList.toggle('is-visible',selectMode);
    updateSelectionUI();renderList();renderSecondaryView();
  }

  function setupSearch() {
    const input = document.getElementById('ta-search-input');
    const clear = document.getElementById('ta-search-clear');
    input.value = searchQuery;
    clear.hidden = input.value.length === 0;
    input.oninput = (e) => {
      searchQuery = e.target.value;
      clear.hidden = searchQuery.length === 0;
      renderList();
    };
    clear.onclick = () => {
      input.value = '';
      searchQuery = '';
      clear.hidden = true;
      renderList();
      input.focus();
    };
  }

  // ---------------------------------------------------------------------
  // MENU DE OPÇÕES (ENGRENAGEM)
  // ---------------------------------------------------------------------

  function closePopover() { showProductView('list'); }

  function setupPopover() {
    const widget=document.getElementById('ticketai-widget');
    document.getElementById('ta-btn-gear').onclick=()=>showProductView('options');
    document.getElementById('ta-btn-organize-groups').onclick=()=>showProductView('groups');
    widget.addEventListener('click',async e=>{
      const button=e.target.closest('button[data-ta-action]');if(!button)return;
      const action=button.dataset.taAction;
      if(applyingPreset)return;
      if(action==='back'){showProductView('list');return;}
      if(action==='options'||action==='groups'){showProductView(action);return;}
      if(action==='help'){showProductHelp();return;}
      if(action==='compact'){togglePeek(widget);return;}
      if(action==='reset-geometry'){const g=constrainGeometry({},window.innerWidth,window.innerHeight);Object.assign(widget.style,{left:g.left+'px',top:g.top+'px',width:g.width+'px',height:g.height+'px',right:'auto'});saveGeometry(widget);showProductView('list');return;}
      if(action==='group-up'||action==='group-down'){moveGroup(button.dataset.group,action==='group-up'?-1:1);return;}
      if(action==='select-mode'){selectMode=true;selectedIds.clear();showProductView('list');return;}
      if(action==='export'||action==='import'){backupDraft='';backupError='';showProductView(action);return;}
      if(action==='download'){
        if(!presets.length){await showAlertModal('Não há presets para exportar.');return;}
        const link=document.createElement('a');link.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(presets,null,2));link.download='ticketai_presets.json';document.body.appendChild(link);link.click();link.remove();return;
      }
      if(action==='process-import'){await importBackupText(backupDraft);return;}
      if(action==='delete-all'){
        if(!presets.length){await showAlertModal('Não há presets cadastrados para apagar.');return;}
        const confirmed=await showConfirmModal(`Excluir todos os ${presets.length} presets? Você poderá desfazer por 20 segundos.`,{title:'Excluir todos os presets?',okText:'Excluir',danger:true});
        if(confirmed){secondaryView='list';deletePresetsWithUndo(presets.map(p=>p.id));}return;
      }
    });
    widget.addEventListener('dragstart',e=>{const row=e.target.closest('.ta-group-organizing');if(!row)return;draggedGroup=row.dataset.group;e.dataTransfer?.setData('text/plain',draggedGroup);if(e.dataTransfer)e.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');});
    widget.addEventListener('dragover',e=>{const row=e.target.closest('.ta-group-organizing');if(!row||!draggedGroup)return;e.preventDefault();widget.querySelectorAll('.is-drag-over').forEach(el=>el.classList.remove('is-drag-over'));row.classList.add('is-drag-over');});
    widget.addEventListener('drop',e=>{const row=e.target.closest('.ta-group-organizing');if(!row||!draggedGroup)return;e.preventDefault();const from=draggedGroup;draggedGroup=null;reorderGroupBefore(from,row.dataset.group);});
    widget.addEventListener('dragend',()=>{draggedGroup=null;widget.querySelectorAll('.is-dragging,.is-drag-over').forEach(el=>el.classList.remove('is-dragging','is-drag-over'));});
  }

  async function importBackupText(raw) {
    let imported;
    try{const data=JSON.parse(raw);imported=Array.isArray(data)?data:data?.presets;if(!Array.isArray(imported))throw new Error();}
    catch{backupError='JSON inválido. Informe uma lista de presets.';renderSecondaryView();return;}
    const valid=imported.filter(p=>p&&typeof p.name==='string'&&p.name.trim());
    if(!valid.length){backupError='Nenhum preset válido encontrado.';renderSecondaryView();return;}
    let id=generateId();const normalized=valid.map(p=>normalizeImportedPreset(p,id++));
    const identity=p=>`${String(p.group||'GERAL').trim().toLowerCase()}\u0000${p.name.trim().toLowerCase()}`;
    const incoming=new Map(normalized.map(p=>[identity(p),p]));
    const duplicates=[...incoming.keys()].filter(k=>presets.some(p=>identity(p)===k));
    let replace=false;
    if(duplicates.length){
      replace=await showConfirmModal(`${duplicates.length} preset${duplicates.length===1?' já existe':'s já existem'} com o mesmo nome e grupo.`,{title:'Presets duplicados',okText:'Substituir',cancelText:'Manter atuais',allowDismiss:true});
      if(replace===null)return;
    }
    if(replace)presets=presets.filter(p=>!duplicates.includes(identity(p)));
    const toImport=[...incoming].filter(([key])=>replace||!duplicates.includes(key)).map(([,p])=>p);
    presets.push(...toImport);backupDraft='';backupError='';secondaryView='list';save();
  }


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
    setupDesignInteractions(widget);
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
