const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Runs production functions unchanged; only exposes closure bindings to tests.
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const exposed = source.replace('  setupGlobalShortcuts();', `
  globalThis.api = { applyPresetToCard, selectOptionByText, getOpenDropdownContainer,
    clearDropdownSelection, groupPresets, normalizeBetaField, betaLegacyFields,
    findFieldButton, findFieldTextInput };
`);

class Element {
  constructor(attrs = {}) { this.attrs = attrs; this.events = []; this.isConnected = true; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  getBoundingClientRect() { return {left: 0, top: 0, width: 10, height: 10}; }
  matches(selector) { return selector === '.Select-menu' && this.menu === true; }
  closest() { return this.owner || null; }
  querySelector(selector) { return this.queries?.[selector] || null; }
  querySelectorAll(selector) { return this.queries?.[selector] || []; }
  dispatchEvent(event) { this.events.push(event.type); this.onEvent?.(event); }
}
class Input extends Element {
  constructor(value = '') { super(); this.value = value; this.tagName = 'INPUT'; }
  get value() { return this._value; }
  set value(value) { this._value = String(value); }
  get checked() { return !!this._checked; }
  set checked(value) { this._checked = value; }
}
class Event { constructor(type) { this.type = type; } }

function setup() {
  const ids = {}, labels = [], heading = new Element(), dialog = new Element();
  heading.textContent = 'Propriedades dependentes';
  dialog.queries = {'h1, h2, h3': [heading], '[class*="FormControl__LabelWrapper"]': labels};
  dialog.contains = () => true;
  const document = {
    body: new Element(), addEventListener() {},
    getElementById: id => ids[id] || null,
    querySelectorAll: selector => selector === '[role="dialog"]' ? [dialog] : [],
    querySelector() { throw new Error('Global lookup must not be used'); }
  };
  let now = 0;
  const context = { document, window: {HTMLInputElement: Input, HTMLTextAreaElement: Input},
    chrome: {runtime: {onMessage: {addListener() {}}}},
    performance, console: {debug() {}}, Event, MouseEvent: Event, PointerEvent: Event,
    getComputedStyle: () => ({visibility: 'visible'}),
    Date: {now: () => now},
    setTimeout: (fn, delay) => { now += delay; queueMicrotask(fn); },
  };
  vm.createContext(context); vm.runInContext(exposed, context);
  function field(labelText, input) {
    const label = {textContent: labelText, parentElement: new Element()};
    label.parentElement.queries = input instanceof Input
      ? {'textarea, input[type="text"]': input}
      : {'button[data-dropdown="true"]': input};
    labels.push(label);
    return input;
  }
  function dropdown(label, options = {}) {
    const id = `menu-${labels.length}`;
    const button = field(label, new Element({'aria-owns': id, 'data-dropdown-open': 'true'}));
    const menu = new Element(); menu.menu = true; menu.queries = {};
    ids[id] = menu;
    for (const [text, element] of Object.entries(options)) {
      menu.queries[`[title="${text}"], [data-option-value="${text}"]`] = element;
    }
    return {button, menu};
  }
  return {api: context.api, field, dropdown, document, dialog, ids};
}

test('funcional: aplica descrição e dropdown na ordem do preset', async () => {
  const h = setup(), input = h.field('Descrição do ticket', new Input('antes'));
  const option = new Element();
  option.onEvent = e => { if (e.type === 'click') assert.equal(input.value, 'depois'); };
  h.dropdown('Produto', {'Cilia Web': option});
  const result = await h.api.applyPresetToCard({fields: [
    {label:'Descrição do ticket', type:'input', value:'depois'},
    {label:'Produto', type:'dropdown', value:'Cilia Web'}
  ]}, null);
  assert.equal(result.Produto, true);
  assert.deepEqual(option.events, ['pointerdown','mousedown','pointerup','mouseup','click']);
});

test('funcional: campo vazio limpa texto e envia eventos', async () => {
  const h = setup(), input = h.field('Descrição do ticket', new Input('antes'));
  const result = await h.api.applyPresetToCard({fields:[{label:'Descrição do ticket',type:'input',value:''}]}, null);
  assert.equal(input.value, ''); assert.equal(result['Descrição do ticket'], true);
  assert.deepEqual(input.events, ['input','change','blur']);
});

test('funcional: opção vazia clica no botão interno de limpeza', async () => {
  const h = setup(), {menu} = h.dropdown('Produto');
  const option = new Element(), button = new Element(); option.queries = {button};
  menu.queries['[data-option-value=""]'] = option;
  const result = await h.api.applyPresetToCard({fields:[{label:'Produto',value:''}]}, null);
  assert.equal(result.Produto,true); assert.equal(button.events.at(-1),'click');
});

test('funcional: multisseleção vazia desmarca seleção anterior', async () => {
  const h = setup(), {menu} = h.dropdown('Categoria'), checked = new Input(); checked.checked = true;
  menu.queries['input[type="checkbox"]'] = [checked];
  const result = await h.api.applyPresetToCard({fields:[{label:'Categoria',type:'multi',value:[]}]}, null);
  assert.equal(checked.checked,false); assert.equal(result.Categoria,true);
});

test('regressao: preset legado continua aplicando texto e produto', async () => {
  const h = setup(), input = h.field('Descrição do ticket', new Input());
  const option = new Element(); h.dropdown('Produto', {ADR:option});
  const result = await h.api.applyPresetToCard({descricao:'legado',produto:'ADR'},null);
  assert.equal(input.value,'legado'); assert.equal(result.produto,true);
});

test('regressao: campo desabilitado preserva valor existente', async () => {
  const h=setup(), input=h.field('Descrição',new Input('preservar'));
  await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',enabled:false,value:''}]},null);
  assert.equal(input.value,'preservar'); assert.deepEqual(input.events,[]);
});

test('regressao: agrupamento normal preserva ordem e grupo padrão', () => {
  const h=setup(), presets=[{group:'A',name:'1'},{group:'A',name:'2'},{name:'3'}];
  const groups=h.api.groupPresets(presets);
  assert.equal(groups.A.length,2); assert.equal(groups.A[1],presets[1]); assert.equal(groups.GERAL[0],presets[2]);
});

test('regressao: portal aria-owns e pesquisa local selecionam assunto', async () => {
  const h=setup(), option=new Element(), {menu}=h.dropdown('Assunto',{'Cadastro':option});
  const input=new Input(); menu.queries['input[placeholder="Pesquisar"]']=input;
  const result=await h.api.applyPresetToCard({fields:[{label:'Assunto',type:'search',value:'Cadastro'}]},null);
  assert.equal(input.value,'Cadastro'); assert.equal(result.Assunto,true);
});

test('regressao: pesquisa de Assunto fora da lista, dentro do portal vinculado', async () => {
  const h=setup(), option=new Element(), {button,menu}=h.dropdown('Assunto',{'Cadastro':option});
  const input=new Input(), portal=new Element();
  portal.queries={'.Select-menu':menu,'input[placeholder="Pesquisar"]':input};
  h.ids[button.getAttribute('aria-owns')]=portal;
  const result=await h.api.applyPresetToCard({fields:[{label:'Assunto',type:'search',value:'Cadastro'}]},null);
  assert.equal(input.value,'Cadastro'); assert.equal(result.Assunto,true);
});

test('extremos: ausência de opção nunca procura nem clica fora da lista', async () => {
  const h=setup(), {button}=h.dropdown('Categoria');
  assert.equal(await h.api.selectOptionByText('Dúvida',button),false);
});

test('extremos: sem vínculo, lista oculta e botão desconectado falham', async () => {
  const h=setup(), {button,menu}=h.dropdown('Produto');
  menu.hidden=true; assert.equal(h.api.getOpenDropdownContainer(button),null);
  menu.hidden=false; button.isConnected=false; assert.equal(h.api.getOpenDropdownContainer(button),null);
  button.isConnected=true; delete button.attrs['aria-owns']; assert.equal(h.api.getOpenDropdownContainer(button),null);
});

test('extremos: sem modal não procura campos atrás da página', () => {
  const h=setup(); h.dialog.hidden=true;
  assert.equal(h.api.findFieldButton('Produto'),null);
  assert.equal(h.api.findFieldTextInput('Descrição'),null);
});

test('extremos: nomes de grupo reservados continuam renderizáveis', () => {
  const h=setup();
  for(const group of ['constructor','toString','__proto__']) {
    const preset={group,name:'Teste'}; assert.equal(h.api.groupPresets([preset])[group][0],preset);
  }
});

test('extremos: dropdown sem limpeza retorna falha', async () => {
  const h=setup(); h.dropdown('Produto');
  assert.equal((await h.api.applyPresetToCard({fields:[{label:'Produto',value:''}]},null)).Produto,false);
});

test('extremos: opção desabilitada não recebe clique', async () => {
  const h=setup(), option=new Element({'aria-disabled':'true'}), {button}=h.dropdown('Produto',{ADR:option});
  assert.equal(await h.api.selectOptionByText('ADR',button),false); assert.deepEqual(option.events,[]);
});

test('extremos: checkbox que recusa limpeza não indica sucesso', async () => {
  const h=setup(), {menu}=h.dropdown('Categoria'), checked=new Input(); checked.checked=true;
  checked.onEvent=()=>{checked.checked=true;}; menu.queries['input[type="checkbox"]']=[checked];
  assert.equal((await h.api.applyPresetToCard({fields:[{label:'Categoria',type:'multi',value:[]}]},null)).Categoria,false);
});

test('extremos: normalização mantém zero e tolera entrada nula', () => {
  const h=setup(); assert.equal(h.api.normalizeBetaField({label:'Código',value:0}).value,'0');
  assert.equal(h.api.normalizeBetaField(null).label,'');
});
