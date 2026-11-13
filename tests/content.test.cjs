const { test } = require('node:test');

function singleCategory(h) {
  const choice=new Element(), empty=new Element();
  const {button,menu}=h.dropdown('Categoria',{'Indevido':choice,'':empty});
  menu.owner=new Element({class:'Select Select--single is-open'});
  button.selected=[];
  let value='Dúvida';
  button.querySelectorAll=selector=>selector==='[data-component-name="UITag"]' && value
    ? [{textContent:value}] : selector==='[data-option-text="true"]' && !value ? [{textContent:''}] : [];
  choice.onEvent=e=>{if(e.type==='click')value='Indevido';};
  empty.onEvent=e=>{if(e.type==='click')value='';};
  menu.queries['[data-option-value=""]']=empty;
  return {button,menu,choice,empty,value:()=>value};
}

test('funcional: preset legado substitui Categoria simples e confirma UITag',async()=>{
  const h=setup(), c=singleCategory(h);
  const result=await h.api.applyPresetToCard({categoria:'Indevido'},null);
  assert.equal(result.categoria,true);assert.equal(c.value(),'Indevido');
});

test('funcional: campo multi antigo limpa Categoria agora simples pela opção vazia',async()=>{
  const h=setup(), c=singleCategory(h);
  const result=await h.api.applyPresetToCard({fields:[{label:'Categoria',type:'multi',value:[]}]},null);
  assert.equal(result.Categoria,true);assert.equal(c.value(),'');
});

test('extremos: múltiplos valores não sobrescrevem Categoria simples',async()=>{
  const h=setup(), c=singleCategory(h);
  const result=await h.api.applyPresetToCard({fields:[{label:'Categoria',type:'multi',value:['Indevido','Problema']}]},null);
  assert.equal(result.Categoria,false);assert.equal(c.value(),'Dúvida');
  assert.deepEqual(c.choice.events,[]);assert.deepEqual(c.empty.events,[]);
});

test('extremos: Categoria simples sem opção vazia preserva valor e falha',async()=>{
  const h=setup(), c=singleCategory(h);delete c.menu.queries['[data-option-value=""]'];
  const result=await h.api.applyPresetToCard({fields:[{label:'Categoria',type:'multi',value:[]}]},null);
  assert.equal(result.Categoria,false);assert.equal(c.value(),'Dúvida');
});

test('regressao: leitura importa Categoria UITag como dropdown e ignora busca interna',()=>{
  const h=setup(), c=singleCategory(h), control=new Element();
  h.dialog.innerText='Propriedades dependentes';
  control.queries={'.FormControl__StyledInnerLabel-kxPGLN':{textContent:'Categoria'},
    'button[data-dropdown="true"]':c.button, input:new Input('busca')};
  h.dialog.queries['[data-test-id="FormControl"]']=[control];
  const fields=h.api.readCurrentClassification();
  assert.equal(fields[0].type,'dropdown');assert.equal(fields[0].value,'Dúvida');
});

test('regressao: Categoria múltipla antiga continua limpando e selecionando checkbox',async()=>{
  const h=setup(), cb=new Input(), option=new Element(), {menu}=h.dropdown('Categoria',{Indevido:option});
  cb.checked=true;menu.queries['input[type="checkbox"]']=[cb];
  const result=await h.api.applyPresetToCard({categoria:'Indevido'},null);
  assert.equal(result.categoria,true);assert.equal(cb.checked,false);assert.equal(option.events.at(-1),'click');
});

test('regressao: leitura preserva nome iniciado por Pipeline', () => {
  const h=setup(); h.ticketProperty('Pipeline','Pipeline de Suporte');
  assert.equal(h.api.readCurrentWorkflow().pipeline,'Pipeline de Suporte');
});

test('funcional: status UITag sem atributos abre modal e permite classificar', async () => {
  const h=setup(), input=h.field('Descrição',new Input('antes'));
  h.ticketProperty('Pipeline','Pipeline de Suporte');
  const {menu}=h.ticketProperty('Status do ticket','Novo');
  const modal=h.dropdown('Status do ticket'); modal.button.selected=[]; modal.button.textContent='Novo';
  const option=new Element({role:'option'}); option.textContent='Fechado';
  option.onEvent=e=>{if(e.type==='click')modal.button.textContent='Fechado';};
  menu.queries['[role="option"]']=[option];
  const result=await h.api.applyPresetToCard({workflow:{pipeline:'Pipeline de Suporte',status:'Fechado'},fields:[{label:'Descrição',type:'input',value:'depois'}]},null);
  assert.equal(result.Pipeline,true); assert.equal(result['Status do ticket'],true);
  assert.equal(input.value,'depois'); assert.equal(option.events.at(-1),'click');
});

test('regressao: troca efetiva de pipeline confirma valor completo', async () => {
  const h=setup(), option=new Element();
  h.ticketProperty('Pipeline','Outra',{'Pipeline de Suporte':option});
  const result=await h.api.applyPresetToCard({workflow:{pipeline:'Pipeline de Suporte'},fields:[]},null);
  assert.equal(result.Pipeline,true); assert.equal(h.api.readCurrentWorkflow().pipeline,'Pipeline de Suporte');
});

for(const scenario of ['ausente','oculta','desabilitada','duplicada','parcial']) {
  test(`extremos: opção por role ${scenario} não é selecionada`,async()=>{
    const h=setup(), {button,menu}=h.ticketProperty('Status do ticket','Novo');
    const option=new Element({role:'option'}); option.textContent='Fechado';
    if(scenario==='oculta')option.hidden=true;
    if(scenario==='desabilitada')option.attrs['aria-disabled']='true';
    if(scenario==='parcial')option.textContent='Fechado parcialmente';
    const duplicate=new Element({role:'option'});duplicate.textContent='Fechado';
    menu.queries['[role="option"]']=scenario==='ausente'?[]:scenario==='duplicada'?[option,duplicate]:[option];
    assert.equal(await h.api.selectOptionByText('Fechado',button),false);
    assert.deepEqual(option.events,[]);assert.deepEqual(duplicate.events,[]);
  });
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Runs production functions unchanged; only exposes closure bindings to tests.
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const exposed = source.replace('  setupGlobalShortcuts();', `
  globalThis.api = { applyPresetToCard, selectOptionByText, getOpenDropdownContainer,
    clearDropdownSelection, groupPresets, normalizeBetaField, betaLegacyFields,
    findFieldButton, findFieldTextInput, fieldValueMatches, confirmFieldValue, readCurrentClassification,
    normalizeWorkflow, normalizeImportedPreset, valuesMatch, readCurrentWorkflow, describeTicketImport, cancelActivePresetApplication,
    reorderGroupBefore, getOrderedGroupNames, constrainGeometry,
    escapeHtml, beginCardConfirmation, finishCardConfirmation, clearCardConfirmation,
    confirmationState:()=>cardConfirmation };
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

function setup({deferUiTimers=false}={}) {
  const uiTimers = new Map();
  let timerId=0;
  const ids = {}, labels = [], ticketLabels = [], listFilterLabels = [], heading = new Element(), ticketCard = new Element(), dialog = new Element();
  heading.textContent = 'Propriedades dependentes';
  dialog.queries = {'h1, h2, h3': [heading], '[class*="FormControl__LabelWrapper"]': labels};
  dialog.contains = () => true;
  const document = {
    body: new Element(), addEventListener() {},
    createElement() { return {set textContent(value) {this.innerHTML=String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}}; },
    getElementById: id => ids[id] || null,
    querySelectorAll: selector => selector === '[role="dialog"]' ? [dialog]
      : selector === 'h1, h2, h3, [role="heading"]' ? [ticketCard.heading]
      : selector === 'div, span, label' ? [...listFilterLabels, ...ticketLabels] : [],
    querySelector() { throw new Error('Global lookup must not be used'); }
  };
  ticketCard.heading = new Element();
  ticketCard.heading.textContent = 'Destaques de Ticket';
  ticketCard.heading.parentElement = ticketCard;
  ticketCard.querySelectorAll = selector => selector === 'div, span, label' ? ticketLabels : [];
  let now = 0;
  const context = { document, window: {HTMLInputElement: Input, HTMLTextAreaElement: Input},
    chrome: {runtime: {onMessage: {addListener() {}}}},
    performance, console: {debug() {}}, Event, MouseEvent: Event, PointerEvent: Event,
    getComputedStyle: () => ({visibility: 'visible'}),
    console: {debug() {}, group() {}, groupEnd() {}, warn() {}, log() {}, table() {}},
    Date: {now: () => now},
    setTimeout: (fn, delay) => {
      if(deferUiTimers&&delay>=2000){const id=++timerId;uiTimers.set(id,{fn,delay});return id;}
      now += delay; queueMicrotask(fn);
    },
    clearTimeout:id=>uiTimers.delete(id),
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
    button.selected = [{textContent: ''}];
    button.querySelectorAll = selector => selector === '[data-option-text="true"]' ? button.selected : [];
    const menu = new Element(); menu.menu = true; menu.queries = {};
    ids[id] = menu;
    for (const [text, element] of Object.entries(options)) {
      menu.queries[`[title="${text}"], [data-option-value="${text}"]`] = element;
      const previous = element.onEvent;
      element.onEvent = event => {
        previous?.(event);
        if (event.type === 'click') button.selected = [{textContent: text}];
      };
    }
    return {button, menu};
  }
  function ticketProperty(label, value, options = {}) {
    const id = `ticket-menu-${ticketLabels.length}`, labelNode = new Element(), parent = new Element();
    labelNode.textContent = label; labelNode.parentElement = parent;
    const button = new Element({'aria-owns': id}); button.textContent = value;
    parent.queries = {button:[button]}; ticketLabels.push(labelNode);
    const menu = new Element(); menu.menu = true; menu.queries = {}; ids[id] = menu;
    for (const [text, option] of Object.entries(options)) {
      menu.queries[`[title="${text}"], [data-option-value="${text}"]`] = option;
      option.onEvent = event => { if (event.type === 'click') button.textContent = text; };
    }
    return {button,menu};
  }
  function listFilter(label, value) {
    const labelNode = new Element(), parent = new Element(), button = new Element();
    labelNode.textContent = label; labelNode.parentElement = parent;
    button.textContent = `${label} ${value}`; parent.queries = {button:[button]};
    listFilterLabels.push(labelNode);
    return button;
  }
  return {api: context.api, field, dropdown, ticketProperty, listFilter, document, dialog, ids, uiTimers};
}

test('regressao: geometria antiga fora da tela preserva controles dentro da janela',()=>{
  const h=setup(),g=h.api.constrainGeometry({left:1800,top:900,width:440,height:900},800,600);
  assert.equal(g.height,588);assert.equal(g.top,6);assert.equal(g.left,354);
  assert.ok(g.left+g.width<=794);assert.ok(g.top+g.height<=594);
});

test('extremos: geometria inválida e viewport estreita não excedem a área disponível',()=>{
  const h=setup(),g=h.api.constrainGeometry({left:-30,top:-80,width:Infinity,height:'inválido'},320,480);
  assert.equal(g.width,308);assert.equal(g.height,468);assert.equal(g.left,6);assert.equal(g.top,6);
});

test('extremos: nomes com aspas e marcação permanecem texto em atributos da interface',()=>{
  const h=setup(),escaped=h.api.escapeHtml('\" onmouseover=\"alert(1)\"><img src=x>\'');
  assert.equal(escaped.includes('"'),false);assert.equal(escaped.includes("'"),false);
  assert.equal(escaped.includes('<'),false);assert.match(escaped,/&quot;/);assert.match(escaped,/&lt;img/);
});







test('funcional: confirmação de sucesso permanece dois segundos e encerra sem persistir',()=>{
  const h=setup({deferUiTimers:true}),preset={id:7};
  h.api.beginCardConfirmation(preset);assert.equal(h.api.confirmationState().status,'running');
  h.api.finishCardConfirmation(preset,{Categoria:true});assert.equal(h.api.confirmationState().status,'success');
  const timer=[...h.uiTimers.values()][0];assert.equal(timer.delay,2000);timer.fn();
  assert.equal(h.api.confirmationState(),null);
});

test('regressao: temporizador de sucesso antigo não apaga uma aplicação nova',()=>{
  const h=setup({deferUiTimers:true});h.api.beginCardConfirmation({id:1});h.api.finishCardConfirmation({id:1},{Produto:true});
  const previous=[...h.uiTimers.values()][0];h.api.beginCardConfirmation({id:2});
  assert.equal(h.uiTimers.size,0);previous.fn();assert.equal(h.api.confirmationState().id,'2');
  assert.equal(h.api.confirmationState().status,'running');
});

test('extremos: falha de workflow e categoria legada permanecem disponíveis sem expirar',()=>{
  const h=setup({deferUiTimers:true});h.api.beginCardConfirmation({id:3});
  h.api.finishCardConfirmation({id:3,categoria:'Indevido',descricao:'Texto'},{Pipeline:false,categoria:false,descricao:true});
  assert.equal(h.api.confirmationState().status,'partial');assert.equal(h.uiTimers.size,0);
  assert.equal(h.api.confirmationState().results.Categoria,false);
  assert.equal(h.api.confirmationState().results['Descrição do ticket'],true);
  h.api.clearCardConfirmation();assert.equal(h.api.confirmationState(),null);
});

test('regressao: conclusão antiga não substitui o estado de outro preset',()=>{
  const h=setup({deferUiTimers:true});h.api.beginCardConfirmation({id:4});
  h.api.finishCardConfirmation({id:3},{Produto:true});
  assert.equal(h.api.confirmationState().status,'running');assert.equal(h.uiTimers.size,0);
});

test('regressao: contagem legada exclui propriedades não configuradas',()=>{
  const h=setup({deferUiTimers:true});h.api.beginCardConfirmation({id:5});
  h.api.finishCardConfirmation({id:5,categoria:'Indevido'},{descricao:true,produto:true,categoria:true,assunto:true});
  assert.deepEqual(Object.keys(h.api.confirmationState().results),['Categoria']);
});

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

test('funcional: workflow do preset preserva Pipeline e Status opcionais', () => {
  const h=setup();
  const filled=h.api.normalizeWorkflow({pipeline:' [Sinistros] Pipeline de Suporte ',status:'Fechado'});
  assert.equal(filled.pipeline,'[Sinistros] Pipeline de Suporte'); assert.equal(filled.status,'Fechado');
  const empty=h.api.normalizeWorkflow(null);
  assert.equal(empty.pipeline,''); assert.equal(empty.status,'');
  assert.equal(h.api.valuesMatch('[Sinistros] Pipeline de Suporte','[sinistros] pipeline de suporte'),true);
});

test('regressao: importação preserva Pipeline e Status do backup v2', () => {
  const h=setup();
  const preset=h.api.normalizeImportedPreset({
    name:'Criar usuário', group:'Cadastro', fields:[{label:'Produto',value:'Cilia Web'}],
    workflow:{pipeline:'[Sinistros] Pipeline de Suporte',status:'Fechado'}
  },123);
  assert.equal(preset.id,123);
  assert.equal(preset.workflow.pipeline,'[Sinistros] Pipeline de Suporte');
  assert.equal(preset.workflow.status,'Fechado');
});

test('funcional: leitura única informa Pipeline, Status e classificação importados', () => {
  const h=setup();
  const result=h.api.describeTicketImport({pipeline:'[Sinistros] Pipeline de Suporte',status:'Fechado'},3);
  assert.equal(result.kind,'success');
  assert.equal(result.text,'✓ Pipeline, Status e 3 campos importados. Revise antes de salvar.');
});

test('extremos: leitura única preserva importação parcial e orienta abrir o modal', () => {
  const h=setup();
  const onlyWorkflow=h.api.describeTicketImport({pipeline:'[Sinistros] Pipeline de Suporte',status:''},0);
  assert.equal(onlyWorkflow.kind,'success');
  assert.match(onlyWorkflow.text,/Abra o modal “Propriedades dependentes”/);
  const none=h.api.describeTicketImport({},0);
  assert.equal(none.kind,'error');
});

test('extremos: falha na Pipeline interrompe classificação e informa o card', async () => {
  const h=setup(), input=h.field('Descrição',new Input('preservar'));
  const output={hidden:true,textContent:''}, classes=[];
  const card={querySelector:selector=>selector==='.ta-field-results'?output:null,
    setAttribute(){},classList:{add:name=>classes.push(name),remove(){}}};
  const result=await h.api.applyPresetToCard({workflow:{pipeline:'Inexistente'},fields:[{label:'Descrição',type:'input',value:'não aplicar'}]},card);
  assert.equal(result.Pipeline,false); assert.equal(input.value,'preservar');
  assert.equal(output.hidden,false); assert.equal(output.textContent,'Pipeline: Não confirmado — confira no HubSpot');
  assert.ok(classes.includes('ta-application-failed'));
});

test('funcional: Pipeline já correta é preservada e Status é ajustado antes da classificação', async () => {
  const h=setup(), input=h.field('Descrição',new Input());
  const pipelineOption=new Element(), statusOption=new Element();
  const pipeline=h.ticketProperty('Pipeline','[Sinistros] Pipeline de Suporte',{'[Sinistros] Pipeline de Suporte':pipelineOption});
  h.ticketProperty('Status do ticket','Novo',{Fechado:statusOption});
  const result=await h.api.applyPresetToCard({workflow:{pipeline:'[Sinistros] Pipeline de Suporte',status:'Fechado'},fields:[{label:'Descrição',type:'input',value:'classificar'}]},null);
  assert.equal(result.Pipeline,true); assert.equal(result['Status do ticket'],true); assert.equal(input.value,'classificar');
  assert.deepEqual(pipelineOption.events,[]); assert.equal(statusOption.events.at(-1),'click');
});

test('regressao: no modo Exibir ignora os filtros da lista e lê os Destaques de Ticket', () => {
  const h=setup();
  h.listFilter('Pipeline','Pipeline de Suporte');
  h.listFilter('Status do ticket','Novo');
  h.ticketProperty('Pipeline','[Sinistros] Pipeline de Suporte',{});
  h.ticketProperty('Status do ticket','Fechado',{});
  const workflow=h.api.readCurrentWorkflow();
  assert.equal(workflow.pipeline,'[Sinistros] Pipeline de Suporte');
  assert.equal(workflow.status,'Fechado');
});

test('funcional: leitura do ticket prioriza Status selecionado no modal de propriedades', () => {
  const h=setup();
  h.ticketProperty('Pipeline','[Sinistros] Pipeline de Suporte',{});
  h.ticketProperty('Status do ticket','Novo',{});
  const {button}=h.dropdown('Status do ticket');
  button.selected=[{textContent:'Fechado'}];
  const workflow=h.api.readCurrentWorkflow();
  assert.equal(workflow.pipeline,'[Sinistros] Pipeline de Suporte');
  assert.equal(workflow.status,'Fechado');
});

test('regressao: Status confirmado no modal permite classificação antes do Salvar manual', async () => {
  const h=setup(), input=h.field('Descrição',new Input());
  h.ticketProperty('Pipeline','[Sinistros] Pipeline de Suporte',{});
  const modalStatusOption=new Element(), modalStatus=h.dropdown('Status do ticket',{Fechado:modalStatusOption});
  const sideStatusOption=new Element(), sideStatus=h.ticketProperty('Status do ticket','Novo',{Fechado:sideStatusOption});
  sideStatusOption.onEvent=event=>{if(event.type==='click')modalStatus.button.selected=[{textContent:'Fechado'}];};
  const result=await h.api.applyPresetToCard({workflow:{pipeline:'[Sinistros] Pipeline de Suporte',status:'Fechado'},fields:[{label:'Descrição',type:'input',value:'classificar'}]},null);
  assert.equal(result['Status do ticket'],true); assert.equal(input.value,'classificar');
  assert.equal(sideStatus.button.textContent,'Novo');
});

test('extremos: Status indisponível interrompe a classificação após Pipeline confirmada', async () => {
  const h=setup(), input=h.field('Descrição',new Input('preservar'));
  h.ticketProperty('Pipeline','[Sinistros] Pipeline de Suporte',{});
  const output={hidden:true,textContent:''};
  const card={querySelector:selector=>selector==='.ta-field-results'?output:null,
    setAttribute(){},classList:{add(){},remove(){}}};
  const result=await h.api.applyPresetToCard({workflow:{pipeline:'[Sinistros] Pipeline de Suporte',status:'Fechado'},fields:[{label:'Descrição',type:'input',value:'não aplicar'}]},card);
  assert.equal(result.Pipeline,true); assert.equal(result['Status do ticket'],false); assert.equal(input.value,'preservar');
  assert.equal(output.textContent,'Status do ticket: Não confirmado — confira no HubSpot');
});

test('funcional: confirma múltiplas seleções sem depender da ordem', async () => {
  const h=setup(), {button}=h.dropdown('Categoria');
  button.selected=[{textContent:'B'},{textContent:'A'}];
  assert.equal(await h.api.confirmFieldValue({label:'Categoria',type:'multi',value:['A','B']}),true);
});

test('funcional: resultado por campo fica visível e acessível após aplicação', async () => {
  const h=setup(); h.field('Descrição',new Input());
  const output={hidden:true,textContent:''}, attrs={};
  const card={querySelector:selector=>selector==='.ta-field-results'?output:null,
    setAttribute:(name,value)=>attrs[name]=value,classList:{add(){},remove(){}}};
  await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'ok'}]},card);
  assert.equal(output.hidden,true);
  assert.equal(output.textContent,'Descrição: Confirmado');
  assert.equal(attrs['aria-busy'],'false');
});

test('funcional: painel de confirmação fecha após sucesso', async () => {
  const h=setup(), input=h.field('Descrição',new Input());
  const output={hidden:true,textContent:''}, summary={hidden:true,textContent:''};
  const card={dataset:{id:'ok'},querySelector:selector=>selector==='.ta-field-results'?output:selector==='.ta-field-summary'?summary:null,
    setAttribute(){},classList:{add(){},remove(){}}};
  h.ids['ticketai-widget']={querySelectorAll:()=>[card]};
  await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'ok'}]},card);
  assert.equal(output.hidden,true); assert.equal(summary.hidden,true);
});

test('funcional: novo preset fecha feedback de erro anterior', async () => {
  const h=setup(), oldOutput={hidden:false}, oldSummary={hidden:false}, oldCard={dataset:{id:'erro'},
    querySelector:selector=>selector==='.ta-field-results'?oldOutput:selector==='.ta-field-summary'?oldSummary:null,
    classList:{remove(){}}};
  const input=h.field('Descrição',new Input());
  const newCard={dataset:{id:'novo'},querySelector:()=>null,setAttribute(){},classList:{add(){},remove(){}}};
  h.ids['ticketai-widget']={querySelectorAll:()=>[oldCard,newCard]};
  await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'novo'}]},newCard);
  assert.equal(oldOutput.hidden,true); assert.equal(oldSummary.hidden,true);
});

test('regressao: falha de confirmação também aparece no preset legado', async () => {
  const h=setup(), option=new Element(); h.dropdown('Produto',{ADR:option});
  option.onEvent=()=>{};
  assert.equal((await h.api.applyPresetToCard({produto:'ADR'},null)).produto,false);
});

test('regressao: limpeza confirma remoção do valor anterior', async () => {
  const h=setup(), {button,menu}=h.dropdown('Produto'), option=new Element();
  button.selected=[{textContent:'ADR'}];
  option.onEvent=event=>{if(event.type==='click')button.selected=[{textContent:''}];};
  menu.queries['[data-option-value=""]']=option;
  assert.equal((await h.api.applyPresetToCard({fields:[{label:'Produto',value:''}]},null)).Produto,true);
});

test('regressao: card reconstruído durante aplicação recebe resultado final', async () => {
  const h=setup(), input=h.field('Descrição',new Input());
  const oldOutput={textContent:''}, newOutput={textContent:''};
  const makeCard=output=>({dataset:{id:'1'},querySelector:selector=>selector==='.ta-field-results'?output:null,
    setAttribute(){},classList:{add(){},remove(){}}});
  const oldCard=makeCard(oldOutput), newCard=makeCard(newOutput);
  let cards=[oldCard];
  h.ids['ticketai-widget']={querySelectorAll:()=>cards};
  input.onEvent=()=>{cards=[newCard];};
  await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'novo'}]},oldCard);
  assert.equal(newOutput.textContent,'Descrição: Confirmado');
  assert.equal(newOutput.hidden,true);
});

test('extremos: clique aceito sem mudança de valor não informa sucesso', async () => {
  const h=setup(), option=new Element(); h.dropdown('Produto',{ADR:option});
  option.onEvent=()=>{};
  assert.equal((await h.api.applyPresetToCard({fields:[{label:'Produto',value:'ADR'}]},null)).Produto,false);
  assert.equal(option.events.at(-1),'click');
});

test('extremos: texto rejeitado após evento não informa sucesso', async () => {
  const h=setup(), input=h.field('Descrição',new Input('antes'));
  input.onEvent=()=>{input.value='antes';};
  assert.equal((await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'novo'}]},null))['Descrição'],false);
});

test('extremos: reversão assíncrona é detectada durante confirmação', async () => {
  const h=setup(), option=new Element(), {button}=h.dropdown('Produto',{ADR:option});
  option.onEvent=event=>{
    if(event.type==='click') {
      button.selected=[{textContent:'ADR'}];
      queueMicrotask(()=>{button.selected=[{textContent:'anterior'}];});
    }
  };
  assert.equal((await h.api.applyPresetToCard({fields:[{label:'Produto',value:'ADR'}]},null)).Produto,false);
});

test('extremos: campo posterior que invalida anterior é detectado no fim', async () => {
  const h=setup(), first=new Element(), {button}=h.dropdown('Produto',{ADR:first});
  const input=h.field('Descrição',new Input());
  input.onEvent=()=>{button.selected=[{textContent:'outro'}];};
  const result=await h.api.applyPresetToCard({fields:[{label:'Produto',value:'ADR'},
    {label:'Descrição',type:'input',value:'depois'}]},null);
  assert.equal(result.Produto,false); assert.equal(result['Descrição'],true);
});

test('extremos: seleção extra e marcador ausente não confirmam valor', () => {
  const h=setup(), {button}=h.dropdown('Categoria');
  button.selected=[{textContent:'A'},{textContent:'B'}];
  assert.equal(h.api.fieldValueMatches({label:'Categoria',type:'multi',value:['A']}),false);
  button.selected=[];
  assert.equal(h.api.fieldValueMatches({label:'Categoria',type:'multi',value:[]}),false);
});

test('extremos: aplicações concorrentes não disputam os controles', async () => {
  const h=setup(), input=h.field('Descrição',new Input());
  const first=h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'primeiro'}]},null);
  assert.equal(await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'segundo'}]},null),null);
  await first; assert.equal(input.value,'primeiro');
  await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'terceiro'}]},null);
  assert.equal(input.value,'terceiro');
});

test('funcional: cancelamento interrompe os próximos campos sem deixar marcação no preset', async () => {
  const h=setup(), primeiro=h.field('Primeiro',new Input()), segundo=h.field('Segundo',new Input());
  primeiro.onEvent=event=>{if(event.type==='input')h.api.cancelActivePresetApplication();};
  const output={hidden:true,textContent:''}, summary={hidden:true,textContent:''}, progress={style:{width:''}};
  const card={querySelector:selector=>selector==='.ta-field-results'?output:selector==='.ta-field-summary'?summary:selector==='.ta-progress-bar'?progress:null,
    setAttribute(){},classList:{add(){},remove(){}}};
  const result=await h.api.applyPresetToCard({fields:[
    {label:'Primeiro',type:'input',value:'aplicado'}, {label:'Segundo',type:'input',value:'não aplicar'}
  ]},card);
  assert.equal(result,null); assert.equal(primeiro.value,'aplicado'); assert.equal(segundo.value,'');
  assert.equal(output.hidden,true); assert.equal(summary.hidden,true);
  assert.equal(progress.style.width,'0%');
});

test('extremos: cancelar sem aplicação ativa não altera o próximo preset', async () => {
  const h=setup(), input=h.field('Descrição',new Input());
  assert.equal(h.api.cancelActivePresetApplication(),false);
  const result=await h.api.applyPresetToCard({fields:[{label:'Descrição',type:'input',value:'ok'}]},null);
  assert.equal(result['Descrição'],true); assert.equal(input.value,'ok');
});

test('extremos: erro de controle é reportado sem conteúdo do ticket e libera próxima aplicação', async () => {
  const h=setup(), input=h.field('Descrição',new Input());
  input.onEvent=()=>{throw new Error('conteúdo privado');};
  const output={hidden:true,textContent:''};
  const card={querySelector:selector=>selector==='.ta-field-results'?output:null,
    setAttribute(){},classList:{add(){},remove(){}}};
  const preset={fields:[{label:'Descrição',type:'input',value:'texto privado'}]};
  assert.equal((await h.api.applyPresetToCard(preset,card))['Descrição'],false);
  assert.equal(output.textContent,'Descrição: Não confirmado — confira no HubSpot');
  input.onEvent=null;
  assert.equal((await h.api.applyPresetToCard(preset,null))['Descrição'],true);
});
