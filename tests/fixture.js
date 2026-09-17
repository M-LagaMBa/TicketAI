// Minimal DOM contract observed in HubSpot; not a replacement for React integration QA.
const stored = JSON.parse(localStorage.getItem('ticketai-test') || 'null') || {
  ticketaiGeom:{left:650,top:35,width:460,height:610},
  ticketaiPresets:[
    {id:1,name:'Preset legado',group:'QA',descricao:'Texto legado',produto:'Cilia Web',categoria:'Dúvida',assunto:'Cadastro'},
    {id:2,name:'Limpar campos',group:'QA',fields:[
      {label:'Descrição do ticket',value:'',type:'textarea'},
      {label:'Categoria',value:[],type:'multi'}
    ]}
  ]
};
const showStorage=()=>document.getElementById('saved').textContent=JSON.stringify(stored.ticketaiPresets,null,2);
window.chrome={runtime:{onMessage:{addListener(){}}},storage:{local:{
  get(keys,callback){queueMicrotask(()=>callback(structuredClone(stored)));},
  set(values,callback){Object.assign(stored,structuredClone(values));localStorage.setItem('ticketai-test',JSON.stringify(stored));showStorage();if(callback)queueMicrotask(callback);}
}}};
showStorage();
let externalClicks=0;
document.getElementById('external').onclick=e=>{e.currentTarget.textContent=`Elemento externo — cliques: ${++externalClicks}`;};
const fields=document.getElementById('fields');
const portals=[];
function closeMenus(){for(const {button,portal} of portals){portal.hidden=true;button.dataset.dropdownOpen='false';}}
function control(label){
  const row=document.createElement('div');row.dataset.testId='FormControl';
  const wrapper=document.createElement('div');wrapper.className='FormControl__LabelWrapper';
  const text=document.createElement('label');text.className='FormControl__StyledInnerLabel-kxPGLN';text.textContent=label;
  wrapper.append(text);row.append(wrapper);fields.append(row);return {row,text};
}
const description=control('Descrição do ticket');
const textarea=document.createElement('textarea');textarea.id='description';textarea.value='Texto anterior';
description.text.htmlFor=textarea.id;description.row.append(textarea);
function dropdown(label,options,initial,{multi=false,search=false}={}){
  const {row,text}=control(label),button=document.createElement('button'),selected=document.createElement('span');
  const id=`portal-${portals.length}`;
  button.id=`field-${portals.length}`;text.htmlFor=button.id;
  button.dataset.dropdown='true';button.dataset.dropdownOpen='false';button.setAttribute('aria-owns',id);
  selected.dataset.optionText='true';selected.textContent=initial;button.append(selected);row.append(button);
  const portal=document.createElement('div');portal.id=id;portal.className='Select';portal.hidden=true;
  if(search){const input=document.createElement('input');input.type='search';input.placeholder='Pesquisar';portal.append(input);}
  const menu=document.createElement('div');menu.className='Select-menu';portal.append(menu);document.body.append(portal);
  const checks=[];
  for(const value of options){
    if(multi){
      const option=document.createElement('label');option.title=value;option.dataset.optionValue=value;
      const cb=document.createElement('input');cb.type='checkbox';cb.checked=value===initial;checks.push({cb,value});
      cb.onchange=()=>{selected.textContent=checks.filter(item=>item.cb.checked).map(item=>item.value).join(', ');};
      option.append(cb,document.createTextNode(value));menu.append(option);
    }else{
      const option=document.createElement('span');option.dataset.optionValue=value;
      const choice=document.createElement('button');choice.title=value;choice.textContent=value||'(Vazio)';
      choice.onclick=()=>{selected.textContent=value;closeMenus();};option.append(choice);menu.append(option);
    }
  }
  button.onclick=()=>{const open=portal.hidden;closeMenus();portal.hidden=!open;button.dataset.dropdownOpen=String(open);};
  portals.push({button,portal});
}
dropdown('Produto',['','Cilia Web','ADR'],'ADR');
dropdown('Categoria',['Dúvida','Solicitação de serviço'],'Solicitação de serviço',{multi:true});
dropdown('Assunto',['','Cadastro','Teste'],'Teste',{search:true});
// A click starting an async preset must not dismiss the menu it just opened.
// This handler belongs to the fixture, not to HubSpot's React components.
document.addEventListener('click',e=>{
  if(!e.target.closest('.Select')&&!e.target.closest('[data-dropdown]')&&!e.target.closest('#ticketai-widget'))closeMenus();
});
