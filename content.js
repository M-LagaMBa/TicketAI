(function() {
  if (window.hasTicketAILoaded) return;
  window.hasTicketAILoaded = true;

  let presets = [];
  let searchQuery = "";
  let editingId = null;
  let currentScreen = "use"; // "use" | "manage"

  // ---------------------------------------------------------------------
  // UTILITÁRIOS
  // ---------------------------------------------------------------------

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
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
    const setter = Object.getOwnPropertyDescriptor(
      input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    ).set;
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
  // seleção (ex: Categoria), clicando no mesmo tipo de elemento usado para
  // selecionar (o que tem o atributo title), não na linha inteira.
  async function clearMultiSelection(container) {
    let guard = 0;
    let selected = container.querySelectorAll('[role="option"][aria-selected="true"]');
    while (selected.length > 0 && guard < 8) {
      const optionEl = selected[0];
      const target = optionEl.querySelector('[title]') || optionEl;
      simulateClick(target);
      await sleep(180);
      selected = container.querySelectorAll('[role="option"][aria-selected="true"]');
      guard++;
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

  // Preenche o preset inteiro na ordem correta (campos dependentes exigem
  // que cada etapa termine antes de abrir a próxima).
  async function applyPreset(preset) {
    const results = { descricao: true, produto: true, categoria: true, assunto: true };

    const descInput = findFieldTextInput('Descrição do ticket');
    if (descInput && preset.descricao) {
      fillTextInput(descInput, preset.descricao);
      await sleep(300);
    } else if (preset.descricao) {
      results.descricao = false;
    }

    if (preset.produto) {
      results.produto = await fillDropdownField('Produto', preset.produto);
      await sleep(300);
    }

    if (preset.categoria) {
      results.categoria = await fillDropdownField('Categoria', preset.categoria, { multi: true });
      await sleep(300);
    }

    if (preset.assunto) {
      results.assunto = await fillSearchField('Assunto', preset.assunto);
      await sleep(200);
    }

    simulateClick(document.body); // fecha qualquer dropdown que tenha ficado aberto
    return results;
  }

  // ---------------------------------------------------------------------
  // ESTILOS (mesmo design system do Widgetize)
  // ---------------------------------------------------------------------

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #ticketai-widget {
        position: fixed; top: 20px; right: 20px; width: 380px; height: 650px;
        min-width: 280px; min-height: 300px; background: rgba(13, 17, 23, 0.98);
        border: 1px solid rgba(0, 210, 255, 0.3); border-radius: 24px;
        z-index: 2147483647; display: flex; flex-direction: column;
        box-shadow: 0 30px 60px rgba(0,0,0,0.8); font-family: 'Inter', sans-serif;
        color: #f0f6fc; backdrop-filter: blur(20px); overflow: visible;
      }
      .ta-resizer { position: absolute; top: 0; width: 15px; height: 100%; cursor: ew-resize; z-index: 10001; }
      .ta-resizer-left { left: 0; }
      .ta-resizer-right { right: 0; }
      .ta-resizer-vertical { position: absolute; left: 0; width: 100%; height: 15px; cursor: ns-resize; z-index: 10001; }
      .ta-resizer-top { top: 0; }
      .ta-resizer-bottom { bottom: 0; }
      #ticketai-widget.is-minimized { height: 55px !important; min-height: 55px !important; overflow: hidden; }
      #ticketai-widget.is-minimized .ta-body, #ticketai-widget.is-minimized .ta-footer { display: none !important; }
      #ticketai-widget.ta-anim { transition: height 0.25s ease; }
      .ta-header { padding: 0 20px; height: 55px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: move; flex-shrink: 0; border-radius: 24px 24px 0 0; }
      .ta-header span { font-weight: 800; font-size: 11px; color: #00d2ff; text-transform: uppercase; pointer-events: none; }
      .ta-btn-group { display: flex; gap: 12px; z-index: 10002; }
      .ta-h-btn { cursor: pointer; font-size: 18px; opacity: 0.6; transition: 0.2s; }
      .ta-body { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; }
      .ta-body::-webkit-scrollbar { width: 6px; }
      .ta-body::-webkit-scrollbar-track { background: transparent; }
      .ta-body::-webkit-scrollbar-thumb { background: rgba(0,210,255,0.3); border-radius: 10px; }
      .ta-search-input { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 10px; padding: 8px 12px; font-size: 12px; margin-bottom: 10px; outline: none; flex-shrink: 0; box-sizing: border-box; }
      .ta-search-input:focus { border-color: #00d2ff; }
      .ta-group-label { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 6px; }
      .ta-group-label:first-child { margin-top: 0; }
      .ta-preset-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .ta-preset-card:hover { border-color: #00d2ff; background: rgba(255, 255, 255, 0.05); }
      .ta-preset-card.ta-filled { border-color: #4ade80 !important; box-shadow: 0 0 0 2px rgba(74,222,128,0.3); }
      .ta-preset-name { font-size: 13px; color: #d1d5db; }
      .ta-preset-actions { display: flex; gap: 10px; flex-shrink: 0; }
      .ta-icon-btn { font-size: 14px; opacity: 0.55; cursor: pointer; transition: 0.2s; }
      .ta-icon-btn:hover { opacity: 1; color: #00d2ff; }
      .ta-icon-btn.ta-danger:hover { color: #f87171; }
      .ta-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; opacity: 0.6; gap: 6px; flex: 1; }
      .ta-empty-icon { font-size: 26px; margin-bottom: 6px; }
      .ta-empty-sub { font-size: 11px; opacity: 0.7; }
      .ta-footer { padding: 15px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
      .ta-footer-row { display: flex; gap: 8px; }
      .ta-btn { display: flex; align-items: center; justify-content: center; gap: 7px; flex: 1; background: rgba(0, 210, 255, 0.06); color: #00d2ff; border: 1px solid rgba(0, 210, 255, 0.35); border-radius: 10px; padding: 9px 16px; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 0.6px; font-size: 11px; transition: 0.2s; }
      .ta-btn:hover { background: rgba(0, 210, 255, 0.14); border-color: #00d2ff; }
      .ta-gear-wrap { position: relative; flex-shrink: 0; }
      .ta-btn-gear { width: 38px; height: 100%; min-height: 38px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
      .ta-btn-gear:hover, .ta-btn-gear.is-active { background: rgba(0,210,255,0.12); border-color: #00d2ff; color: #00d2ff; transform: rotate(20deg); }
      .ta-popover { position: absolute; bottom: calc(100% + 8px); right: 0; background: #10151c; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 6px; min-width: 160px; box-shadow: 0 12px 30px rgba(0,0,0,0.5); opacity: 0; transform: translateY(6px) scale(0.97); pointer-events: none; transition: 0.18s ease; z-index: 20; }
      .ta-popover.is-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .ta-popover-item { font-size: 10px; padding: 7px; background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: 0.2s; text-transform: uppercase; font-weight: bold; text-align: center; }
      .ta-popover-item:hover { background: rgba(255,255,255,0.1); border-color: #00d2ff; }
      .ta-popover-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }
      .ta-back-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; cursor: pointer; }
      .ta-back-row span { font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.5px; }
      .ta-dev-footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 2px; }
      .ta-dev-label { font-size: 8px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 2px; }
      .ta-dev-name { color: #00d2ff; font-weight: 900; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; text-shadow: 0 0 10px rgba(0,210,255,0.3); }
      .ta-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; opacity: 0; pointer-events: none; transition: 0.15s; border-radius: 24px; }
      .ta-modal-overlay.is-visible { opacity: 1; pointer-events: auto; }
      .ta-modal { background: #10151c; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 18px; width: 88%; max-width: 300px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); max-height: 85%; overflow-y: auto; }
      .ta-modal-title { font-size: 12px; font-weight: 800; color: #00d2ff; text-transform: uppercase; letter-spacing: 0.5px; }
      .ta-field-label { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; margin-bottom: 3px; }
      .ta-field-input { width: 100%; background: #000; color: #fff; border: 1px solid #333; border-radius: 8px; padding: 8px 10px; outline: none; font-size: 12px; box-sizing: border-box; }
      .ta-field-input:focus { border-color: #00d2ff; }
      .ta-modal-actions { display: flex; gap: 8px; margin-top: 6px; }
      .ta-cancel-link { background: transparent; color: #ff6b6b; border: none; font-size: 11px; cursor: pointer; margin-top: 5px; text-decoration: underline; text-align: center; width: 100%; display: block; }
      .ta-toast { display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(74,222,128,0.1); border: 1px solid rgba(74,222,128,0.35); color: #4ade80; border-radius: 10px; font-size: 11px; overflow: hidden; max-height: 0; opacity: 0; margin-bottom: 0; flex-shrink: 0; transition: max-height 0.2s ease, opacity 0.2s ease, margin-bottom 0.2s ease, padding 0.2s ease; }
      .ta-toast.is-visible { max-height: 40px; opacity: 1; margin-bottom: 10px; padding: 9px 12px; }
      .ta-undo-toast { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #10151c; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 0 12px; font-size: 11px; color: #d1d5db; overflow: hidden; max-height: 0; opacity: 0; margin-bottom: 0; flex-shrink: 0; transition: max-height 0.2s ease, opacity 0.2s ease, margin-bottom 0.2s ease, padding 0.2s ease; }
      .ta-undo-toast.is-visible { max-height: 40px; opacity: 1; margin-bottom: 10px; padding: 9px 12px; }
      .ta-undo-toast button { background: none; border: none; color: #00d2ff; font-weight: 800; cursor: pointer; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; flex-shrink: 0; }
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
        <span>TicketAI</span>
        <div class="ta-btn-group">
          <div class="ta-h-btn" id="ta-btn-min">-</div>
          <div class="ta-h-btn" id="ta-btn-close">✕</div>
        </div>
      </div>
      <div class="ta-body" id="ta-body">
        <div class="ta-toast" id="ta-toast">Preenchido</div>
        <div class="ta-undo-toast" id="ta-undo-toast">
          <span id="ta-undo-toast-text">Preset apagado</span>
          <button id="ta-undo-toast-btn" type="button">Desfazer</button>
        </div>
      </div>
      <div class="ta-footer">
        <div class="ta-footer-row">
          <div class="ta-gear-wrap">
            <button id="ta-btn-gear" class="ta-btn-gear" title="Opções" type="button">⚙</button>
            <div class="ta-popover" id="ta-popover">
              <button id="ta-btn-manage" class="ta-popover-item" type="button">Gerenciar Presets</button>
              <div class="ta-popover-divider"></div>
              <button id="ta-btn-export" class="ta-popover-item" type="button">Exportar</button>
              <button id="ta-btn-import" class="ta-popover-item" type="button">Importar</button>
              <input type="file" id="ta-import-file" style="display:none" accept=".json">
            </div>
          </div>
        </div>
        <div class="ta-dev-footer">
          <span class="ta-dev-label">Desenvolvido por</span>
          <span class="ta-dev-name">Lagamba Tech</span>
        </div>
      </div>

      <div class="ta-modal-overlay" id="ta-modal-overlay">
        <div class="ta-modal">
          <div class="ta-modal-title" id="ta-modal-title">Novo preset</div>
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
            <button id="ta-modal-save" class="ta-btn" style="flex:1">Salvar</button>
          </div>
          <div id="ta-modal-cancel" class="ta-cancel-link">Cancelar</div>
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
      if (drag) { widget.style.left = (e.clientX - oX) + 'px'; widget.style.top = (e.clientY - oY) + 'px'; widget.style.right = 'auto'; }
    });
    document.addEventListener('mouseup', () => {
      if (drag) { drag = false; saveGeometry(widget); }
    });
  }

  function setupMinimize(widget) {
    document.getElementById('ta-btn-min').onclick = (e) => {
      e.stopPropagation();
      widget.classList.add('ta-anim');
      widget.classList.toggle('is-minimized');
      setTimeout(() => widget.classList.remove('ta-anim'), 260);
    };
    document.getElementById('ta-btn-close').onclick = () => widget.style.display = 'none';
  }

  // ---------------------------------------------------------------------
  // TOASTS (feedback e desfazer)
  // ---------------------------------------------------------------------

  function showFillToast(text) {
    const toast = document.getElementById('ta-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 2500);
  }

  let pendingUndo = null;

  function showUndoToast(preset) {
    if (pendingUndo) clearTimeout(pendingUndo.timer);
    const toast = document.getElementById('ta-undo-toast');
    if (!toast) { pendingUndo = null; return; }
    toast.classList.add('is-visible');
    const timer = setTimeout(() => {
      toast.classList.remove('is-visible');
      pendingUndo = null;
    }, 20000);
    pendingUndo = { preset, timer };
  }

  function undoDelete() {
    if (!pendingUndo) return;
    clearTimeout(pendingUndo.timer);
    presets.push(pendingUndo.preset);
    pendingUndo = null;
    document.getElementById('ta-undo-toast').classList.remove('is-visible');
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

  function deletePresetWithUndo(id) {
    const index = presets.findIndex(p => p.id === id);
    if (index === -1) return;
    const [removed] = presets.splice(index, 1);
    save();
    showUndoToast(removed);
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
  }

  function closeModal() {
    document.getElementById('ta-modal-overlay').classList.remove('is-visible');
    editingId = null;
  }

  function setupModal() {
    document.getElementById('ta-modal-cancel').onclick = () => closeModal();

    document.getElementById('ta-modal-save').onclick = () => {
      const name = document.getElementById('ta-field-name').value.trim();
      if (!name) { alert('Informe um nome para o preset.'); return; }

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

  function renderUseScreen(body) {
    const searchWrap = document.createElement('input');
    searchWrap.type = 'text';
    searchWrap.className = 'ta-search-input';
    searchWrap.placeholder = 'Buscar preset...';
    searchWrap.value = searchQuery;
    searchWrap.oninput = (e) => { searchQuery = e.target.value; render(); };
    body.appendChild(searchWrap);

    const filtered = getFilteredPresets();
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ta-empty-state';
      empty.innerHTML = presets.length === 0
        ? `<div class="ta-empty-icon">🗂️</div><div>Nenhum preset cadastrado ainda.</div><div class="ta-empty-sub">Abra "Gerenciar Presets" no menu para criar o primeiro.</div>`
        : `<div class="ta-empty-icon">🔍</div><div>Nenhum preset encontrado.</div>`;
      body.appendChild(empty);
      return;
    }

    const groups = groupPresets(filtered);
    Object.keys(groups).sort().forEach(groupName => {
      const label = document.createElement('div');
      label.className = 'ta-group-label';
      label.textContent = groupName;
      body.appendChild(label);

      groups[groupName].forEach(p => {
        const card = document.createElement('div');
        card.className = 'ta-preset-card';
        card.innerHTML = `<span class="ta-preset-name">${escapeHtml(p.name)}</span>`;
        card.onclick = async () => {
          const results = await applyPreset(p);
          const falhou = Object.values(results).some(r => r === false);
          card.classList.add('ta-filled');
          setTimeout(() => card.classList.remove('ta-filled'), 800);
          showFillToast(falhou ? 'Preenchido parcialmente, confira os campos' : 'Preenchido');
        };
        body.appendChild(card);
      });
    });
  }

  function renderManageScreen(body) {
    const backRow = document.createElement('div');
    backRow.className = 'ta-back-row';
    backRow.innerHTML = `<span class="ta-icon-btn">←</span><span>Voltar</span>`;
    backRow.onclick = () => { currentScreen = 'use'; render(); };
    body.appendChild(backRow);

    const addBtn = document.createElement('button');
    addBtn.className = 'ta-btn';
    addBtn.style.marginBottom = '10px';
    addBtn.textContent = '+ Novo preset';
    addBtn.onclick = () => openModal();
    body.appendChild(addBtn);

    if (presets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ta-empty-state';
      empty.innerHTML = `<div class="ta-empty-icon">🗂️</div><div>Nenhum preset cadastrado ainda.</div>`;
      body.appendChild(empty);
      return;
    }

    presets.forEach(p => {
      const card = document.createElement('div');
      card.className = 'ta-preset-card';
      card.innerHTML = `
        <span class="ta-preset-name">${escapeHtml(p.name)} <span style="opacity:0.5;font-size:10px">(${escapeHtml(p.group || 'GERAL')})</span></span>
        <div class="ta-preset-actions">
          <span class="ta-icon-btn ta-edit" title="Editar">📝</span>
          <span class="ta-icon-btn ta-danger ta-del" title="Apagar">🗑️</span>
        </div>
      `;
      card.querySelector('.ta-edit').onclick = (e) => { e.stopPropagation(); openModal(p); };
      card.querySelector('.ta-del').onclick = (e) => { e.stopPropagation(); deletePresetWithUndo(p.id); };
      body.appendChild(card);
    });
  }

  function render() {
    const body = document.getElementById('ta-body');
    if (!body) return;

    const toast = document.getElementById('ta-toast');
    const undoToast = document.getElementById('ta-undo-toast');
    body.innerHTML = '';
    if (toast) body.appendChild(toast);
    if (undoToast) body.appendChild(undoToast);

    if (currentScreen === 'manage') renderManageScreen(body);
    else renderUseScreen(body);
  }

  // ---------------------------------------------------------------------
  // MENU DE OPÇÕES (ENGRENAGEM): gerenciar, exportar, importar
  // ---------------------------------------------------------------------

  function closePopover() {
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
    };

    document.addEventListener('click', (e) => {
      if (!popover.classList.contains('is-open')) return;
      if (e.target.closest('#ta-popover') || e.target.closest('#ta-btn-gear')) return;
      closePopover();
    });

    document.getElementById('ta-btn-manage').onclick = () => {
      currentScreen = 'manage';
      closePopover();
      render();
    };

    document.getElementById('ta-btn-export').onclick = () => {
      if (presets.length === 0) return alert('Não há presets para exportar.');
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
    };

    document.getElementById('ta-import-file').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (!Array.isArray(imported)) { alert('Arquivo inválido.'); return; }
          const valid = imported.filter(item => item && typeof item.name === 'string' && item.name.trim() !== '');
          if (valid.length === 0) { alert('Nenhum preset válido encontrado.'); return; }

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
          alert('Erro ao ler o arquivo JSON.');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    };
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
    setupMinimize(widget);
    setupPopover();
    setupModal();
    setupUndoToast();

    chrome.storage.local.get(['ticketaiPresets'], (res) => {
      presets = res.ticketaiPresets || [];
      render();
    });
  }

  chrome.runtime.onMessage.addListener((msg) => { if (msg.action === 'toggle_widget') initWidget(); });
})();
