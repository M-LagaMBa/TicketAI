(function() {
  if (window.hasTicketAILoaded) return;
  window.hasTicketAILoaded = true;

  const TICKETAI_VERSION = '1.5';

  let presets = [];
  let searchQuery = "";
  let editingId = null;
  let selectMode = false;
  let selectedIds = new Set();
  let peekMode = false;
  let peekIndex = 0;
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
    const all = document.querySelectorAll('div, h1, h2, h3');
    for (const el of all) {
      if ((el.textContent || '').trim() === 'Propriedades dependentes') {
        let candidate = el;
        for (let i = 0; i < 8 && candidate; i++) {
          if (candidate.offsetHeight > 250 && candidate.offsetWidth > 250) return candidate;
          candidate = candidate.parentElement;
        }
        return el.closest('div') || document;
      }
    }
    return document;
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
    const labelSelector = '[class*="FormControl__LabelWrapper"]';
    const labels = scope.querySelectorAll(labelSelector);
    const target = labelText.trim().toLowerCase();

    for (const label of labels) {
      const txt = (label.textContent || '').replace('*', '').trim().toLowerCase();
      if (!txt.startsWith(target)) continue;

      let el = label.parentElement;
      for (let i = 0; i < 6 && el; i++) {
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
    const labelSelector = '[class*="FormControl__LabelWrapper"]';
    const labels = scope.querySelectorAll(labelSelector);
    const target = labelText.trim().toLowerCase();

    for (const label of labels) {
      const txt = (label.textContent || '').replace('*', '').trim().toLowerCase();
      if (!txt.startsWith(target)) continue;

      let el = label.parentElement;
      for (let i = 0; i < 6 && el; i++) {
        const input = el.querySelector('textarea, input[type="text"]');
        if (input) return input;
        el = el.parentElement;
      }
    }
    return null;
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

  // Clica no elemento (botão, checkbox ou div com título) cujo atributo
  // title ou data-option-value bate com o texto da opção desejada.
  async function selectOptionByText(text) {
    const sel = `[title="${cssEscapeValue(text)}"], [data-option-value="${cssEscapeValue(text)}"]`;
    const el = await waitFor(() => document.querySelector(sel), 3000);
    if (!el) return false;
    simulateClick(el);
    return true;
  }

  // Desmarca todas as opções já selecionadas dentro de um campo de múltipla
  // seleção (ex: Categoria). A seleção real fica no `checked` do checkbox,
  // não no atributo aria-selected da linha (esse só reflete foco/destaque).
  // Usamos o setter nativo + evento "change" (técnica padrão para forçar
  // atualização de componentes React controlados), em vez de depender só
  // de clique simulado, que nem sempre alterna o estado de forma confiável.
  async function clearMultiSelection(container) {
    const checkboxSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked').set;
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    for (const cb of checkboxes) {
      if (!cb.checked) continue;
      checkboxSetter.call(cb, false);
      cb.dispatchEvent(new Event('click', { bubbles: true }));
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(120);
    }
  }

  // Campo com dropdown simples (Produto): abre e seleciona a opção pelo texto.
  // Passe { multi: true } para campos de múltipla seleção (ex: Categoria):
  // nesse caso, desmarca qualquer opção já selecionada antes de marcar a nova,
  // evitando que o preset anterior deixe categorias "presas" junto com a nova.
  async function fillDropdownField(labelText, valueText, opts = {}) {
    if (!valueText) return true;
    const btn = findFieldButton(labelText);
    if (!btn) return false;

    if (btn.getAttribute('data-dropdown-open') !== 'true') {
      simulateClick(btn);
    }
    await sleep(250);

    if (opts.multi) {
      const container = document.querySelector('.Select--multi');
      if (container) await clearMultiSelection(container);
    }

    const ok = await selectOptionByText(valueText);
    return ok;
  }

  // Campo de busca (Assunto): abre, digita para filtrar, e clica no resultado.
  async function fillSearchField(labelText, valueText) {
    if (!valueText) return true;
    const btn = findFieldButton(labelText);
    if (!btn) return false;

    if (btn.getAttribute('data-dropdown-open') !== 'true') {
      simulateClick(btn);
    }
    await sleep(250);

    const searchInput = await waitFor(
      () => document.querySelector('input[placeholder="Pesquisar"]'),
      2000
    );
    if (searchInput) {
      fillTextInput(searchInput, valueText);
      await sleep(400);
    }

    const ok = await selectOptionByText(valueText);
    return ok;
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
  async function applyPresetToCard(preset, card) {
    const progressBar = card ? card.querySelector('.ta-progress-bar') : null;
    const fields = ['descricao', 'produto', 'categoria', 'assunto'].filter(f => preset[f]);
    const totalSteps = Math.max(fields.length, 1);
    let doneSteps = 0;
    const bump = () => {
      doneSteps++;
      const target = Math.min(92, Math.round((doneSteps / totalSteps) * 92));
      setProgress(progressBar, target);
    };

    const results = { descricao: true, produto: true, categoria: true, assunto: true };

    if (preset.descricao) {
      const descInput = findFieldTextInput('Descrição do ticket');
      if (descInput) { fillTextInput(descInput, preset.descricao); bump(); await sleep(300); }
      else { results.descricao = false; bump(); }
    }

    if (preset.produto) {
      results.produto = await fillDropdownField('Produto', preset.produto);
      bump();
      await sleep(300);
    }

    if (preset.categoria) {
      results.categoria = await fillDropdownField('Categoria', preset.categoria, { multi: true });
      bump();
      await sleep(300);
    }

    if (preset.assunto) {
      results.assunto = await fillSearchField('Assunto', preset.assunto);
      bump();
      await sleep(200);
    }

    simulateClick(document.body); // fecha qualquer dropdown que tenha ficado aberto

    const falhouAlgo = ['descricao', 'produto', 'categoria', 'assunto'].some(f => preset[f] && results[f] === false);
    if (card) {
      setProgress(progressBar, 100);
      card.classList.add(falhouAlgo ? 'ta-filled-warning' : 'ta-filled');
      setTimeout(() => {
        card.classList.remove('ta-filled', 'ta-filled-warning');
        setProgress(progressBar, 0);
      }, 900);
    }

    return results;
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
      .ta-h-btn { cursor: pointer; font-size: 13px; opacity: 0.55; transition: 0.2s; line-height: 1; color: #9BA4B5; }
      .ta-h-btn:hover { opacity: 1; color: #E6EDF3; }
      .ta-h-btn#ta-btn-close:hover { color: #EF4444; }
      .ta-body { flex: 1; overflow-y: auto; padding: 15px; margin-right: 6px; display: flex; flex-direction: column; }
      .ta-body::-webkit-scrollbar { width: 6px; }
      .ta-body::-webkit-scrollbar-track { background: transparent; }
      .ta-body::-webkit-scrollbar-thumb { background: #2A313B; border-radius: 10px; }
      .ta-body::-webkit-scrollbar-thumb:hover { background: #3a4452; }
      .ta-search-row { display: flex; gap: 8px; margin-bottom: 10px; flex-shrink: 0; }
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
      .ta-preset-card.ta-filled-warning { border-color: #F59E0B !important; box-shadow: 0 0 0 2px rgba(245,158,11,0.25); }
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
      .ta-selection-toolbar { display: none; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; font-size: 10px; color: #F59E0B; flex-shrink: 0; }
      .ta-selection-toolbar.is-visible { display: flex; }
      .ta-selection-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .ta-selection-actions button { font-size: 9px; padding: 5px 8px; background: transparent; color: #E6EDF3; border: 1px solid #2A313B; border-radius: 7px; cursor: pointer; text-transform: uppercase; font-weight: bold; transition: 0.15s; }
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
      .ta-modal-overlay { position: absolute; top: 36px; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 50; opacity: 0; pointer-events: none; transition: 0.15s; border-radius: 0 0 16px 16px; }
      .ta-modal-overlay.is-visible { opacity: 1; pointer-events: auto; }
      .ta-modal { background: #161B22; border: 1px solid #2A313B; border-radius: 14px; padding: 18px; width: 88%; max-width: 300px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); max-height: 85%; overflow-y: auto; }
      .ta-modal::-webkit-scrollbar { width: 6px; }
      .ta-modal::-webkit-scrollbar-track { background: transparent; }
      .ta-modal::-webkit-scrollbar-thumb { background: #2A313B; border-radius: 10px; }
      .ta-modal::-webkit-scrollbar-thumb:hover { background: #3a4452; }
      .ta-modal-title { font-size: 12px; font-weight: 800; color: #E6EDF3; text-transform: uppercase; letter-spacing: 0.5px; }
      .ta-modal-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .ta-modal-close { cursor: pointer; font-size: 16px; opacity: 0.55; transition: 0.2s; line-height: 1; color: #9BA4B5; }
      .ta-modal-close:hover { opacity: 1; color: #EF4444; }
      .ta-field-label { font-size: 10px; color: #9BA4B5; text-transform: uppercase; margin-bottom: 3px; font-weight: 600; letter-spacing: 0.3px; }
      .ta-field-input { width: 100%; background: #0D1117; color: #E6EDF3; border: 1px solid #2A313B; border-radius: 8px; padding: 8px 10px; outline: none; font-size: 12px; box-sizing: border-box; transition: 0.15s; }
      .ta-field-input::placeholder { color: #6B7280; }
      .ta-field-input:focus { border-color: #F59E0B; box-shadow: 0 0 0 3px rgba(245,158,11,0.12); }
      .ta-modal-actions { display: flex; gap: 8px; margin-top: 6px; }
      .ta-cancel-link { background: transparent; color: #9BA4B5; border: none; font-size: 11px; cursor: pointer; margin-top: 5px; text-decoration: underline; text-align: center; width: 100%; display: block; transition: 0.15s; }
      .ta-cancel-link:hover { color: #E6EDF3; }
      .ta-confirm-icon { font-size: 30px; text-align: center; margin: 4px 0 2px; }
      .ta-confirm-message { font-size: 12px; color: #9BA4B5; line-height: 1.5; text-align: center; }
      .ta-confirm-cancel-btn { background: transparent; color: #9BA4B5; border: 1px solid #2A313B; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 0.6px; font-size: 11px; transition: 0.15s; }
      .ta-confirm-cancel-btn:hover { border-color: #9BA4B5; color: #E6EDF3; }
      .ta-confirm-ok-danger { background: #EF4444 !important; color: #fff !important; border: 1px solid #EF4444 !important; }
      .ta-confirm-ok-danger:hover { background: #dc2626 !important; }
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
          <div class="ta-h-btn" id="ta-btn-peek" title="Modo compacto (mostra 1 preset por vez, role o mouse para trocar) — Alt+W">▤</div>
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
        </div>
        <div id="ta-list"></div>
      </div>
      <div class="ta-footer">
        <div class="ta-footer-row">
          <button id="ta-btn-add" class="ta-btn-add" title="Novo preset (Ctrl+N)" type="button"><span>+</span>Novo Preset</button>
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
    document.getElementById('ta-btn-peek').onclick = (e) => { e.stopPropagation(); togglePeek(widget); };
    document.getElementById('ta-btn-min').onclick = (e) => { e.stopPropagation(); toggleMinimize(widget); };
    document.getElementById('ta-btn-close').onclick = () => widget.style.display = 'none';
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
    chrome.storage.local.set({ ticketaiPresets: presets }, render);
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
    editingId = preset ? preset.id : null;
    document.getElementById('ta-modal-title').textContent = preset ? 'Editar preset' : 'Novo preset';
    document.getElementById('ta-field-name').value = preset ? preset.name : '';
    document.getElementById('ta-field-group').value = preset ? preset.group : '';
    document.getElementById('ta-field-descricao').value = preset ? preset.descricao : '';
    document.getElementById('ta-field-produto').value = preset ? preset.produto : '';
    document.getElementById('ta-field-categoria').value = preset ? preset.categoria : '';
    document.getElementById('ta-field-assunto').value = preset ? preset.assunto : '';
    document.getElementById('ta-modal-overlay').classList.add('is-visible');
    document.getElementById('ta-field-name').focus();
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
    document.getElementById('ta-btn-add').onclick = () => openModal();
    document.getElementById('ta-modal-cancel').onclick = () => closeModal();
    document.getElementById('ta-modal-close').onclick = () => closeModal();

    document.getElementById('ta-modal-save').onclick = async () => {
      const name = document.getElementById('ta-field-name').value.trim();
      if (!name) { await showAlertModal('Informe um nome para o preset.'); return; }

      const data = {
        name,
        group: document.getElementById('ta-field-group').value.trim() || 'GERAL',
        descricao: document.getElementById('ta-field-descricao').value.trim(),
        produto: document.getElementById('ta-field-produto').value.trim(),
        categoria: document.getElementById('ta-field-categoria').value.trim(),
        assunto: document.getElementById('ta-field-assunto').value.trim()
      };

      if (editingId) {
        const p = presets.find(x => x.id === editingId);
        if (p) Object.assign(p, data);
      } else {
        presets.push({ id: generateId(), ...data });
      }

      closeModal();
      save();
    };
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

  function groupPresets(list) {
    const groups = {};
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

    card.onclick = async (e) => {
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
    Object.keys(groups).sort().forEach(groupName => {
      const label = document.createElement('div');
      label.className = 'ta-group-label';
      label.textContent = `${groupName} · ${groups[groupName].length}`;
      list.appendChild(label);
      groups[groupName].forEach(p => list.appendChild(buildCard(p)));
    });
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
            return {
              id,
              name: item.name,
              group: item.group || 'GERAL',
              descricao: item.descricao || '',
              produto: item.produto || '',
              categoria: item.categoria || '',
              assunto: item.assunto || ''
            };
          });

          presets = [...presets, ...normalized];
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

      // Ctrl+N: abre o formulário de novo preset. Obs: o navegador pode
      // reservar esse atalho para "nova janela" e não deixar a extensão
      // capturá-lo; se isso acontecer, avise para trocarmos por outra tecla.
      if (e.ctrlKey && key === 'n') {
        e.preventDefault();
        const widget = ensureWidgetVisible();
        if (widget) {
          widget.classList.remove('is-minimized', 'is-peek');
          peekMode = false;
        }
        openModal();
      }
    });
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

    chrome.storage.local.get(['ticketaiPresets'], (res) => {
      presets = res.ticketaiPresets || [];
      render();
    });
  }

  chrome.runtime.onMessage.addListener((msg) => { if (msg.action === 'toggle_widget') initWidget(); });
  setupGlobalShortcuts();
})();