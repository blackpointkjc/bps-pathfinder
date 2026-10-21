const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://example.test'});
for(const name of ['window','document','HTMLFormElement','HTMLSelectElement','HTMLOptionElement','Document','NodeFilter','DocumentFragment','SVGElement','HTMLElement','Element','Node','MutationObserver','CustomEvent','Event','KeyboardEvent','MouseEvent','HTMLInputElement'])globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.getComputedStyle=dom.window.getComputedStyle;
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
HTMLElement.prototype.hasPointerCapture=()=>false;HTMLElement.prototype.setPointerCapture=()=>{};HTMLElement.prototype.releasePointerCapture=()=>{};
let scrolled=0;HTMLElement.prototype.scrollIntoView=function(){scrolled++;};
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react'),{render,fireEvent,screen,waitFor,act,cleanup}=require('@testing-library/react'),userEvent=require('@testing-library/user-event').default,{QueryClient,QueryClientProvider}=require('@tanstack/react-query'),assert=require('assert/strict');
const officer={id:'u1',email:'officer@test',rank:'Lieutenant',first_name:'PrivateFirst',last_name:'Example',unit_number:'400',platoon:'A',status:'Available',session_active:true};
const client={id:'client',email:'client@test',additional_roles:['client'],assigned_sites:['Armstrong','Oliver Crossing']};
const order={id:'a',site_name:'Armstrong',site_address:'Richmond VA',post_type:'armed',source_import_key:'black_point_handbook_2025_a',site_overview:'Unique Armstrong overview.',patrol_schedule:'Hourly perimeter patrol.',special_instructions:'Armstrong\nSite Overview\nUnique Armstrong overview.\nPatrol Schedule\nHourly perimeter patrol.\nIncident Response\nReport incidents immediately.'};
const orders=[order,{...order,id:'a-old',site_overview:'OLD DUPLICATE'},{id:'b',site_name:'Oliver Crossing',site_overview:'Unique Oliver overview.'},{id:'private',site_name:'OTHER CLIENT',site_overview:'PRIVATE DATA'}];
const modules={};
function load(path){
 if(modules[path])return modules[path];const exports={};modules[path]=exports;
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,window,document,Date,Intl,Set,Map,console,requestAnimationFrame,require:name=>{
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name==='@/components/SiteChainOfCommand')return {default:()=>React.createElement('div',{'data-chain':''},'Live site chain')};
  if(name==='@/utils/clientPreview')return {getClientPreviewId:()=>'',getClientPortalUser:async()=>client};
  if(name==='@/lib/appDirectory')return {listDirectoryUsers:async()=>[officer],listDirectoryLocations:async()=>[{id:'site-a',site_name:'Armstrong',assigned_supervisors:['officer@test']},{id:'site-b',site_name:'Oliver Crossing'}]};
  if(name==='@/api/base44Client')return {base44:{entities:{PostOrder:{list:async()=>orders},GeneralPostOrder:{list:async()=>[{id:'g1',section_title:'Company conduct',content:'Shared company rules.',active:true},{id:'g2',section_title:'Duplicate company conduct',content:'Shared company rules.',active:true},{id:'old',section_title:'Old orders',content:'HIDDEN OLD POLICY',active:false}]}}}};
  if(name.startsWith('@/')){const file='src/'+name.slice(2);for(const ext of ['', '.js','.jsx'])if(fs.existsSync(file+ext)&&fs.statSync(file+ext).isFile())return load(file+ext);throw Error(name);}
  return require(name);
 }});return exports;
}
const commandCalls=[
 {id:'c1',incident:'Priority incident',location:'Armstrong gate',priority:'critical',agency:'RPD',status:'New',assigned_units:[],time_received:'2026-10-20T14:00:00Z'},
 {id:'c2',incident:'Routine check',location:'Oliver Crossing lobby',priority:'low',agency:'RPD',status:'On Scene',assigned_units:['u1'],time_received:'2026-10-20T15:00:00Z'},
 {id:'c3',incident:'Medical response',location:'Community center',priority:'high',agency:'RFD',source:'pulsepoint',assigned_units:[],time_received:'2026-10-20T16:00:00Z'}
];
const events=[];
const Workspace=load('src/components/dispatch/LiveCommandWorkspace.jsx').default;
function CommandHarness({readOnly=false}){
 const [selected,setSelected]=React.useState(null);
 return React.createElement(Workspace,{calls:commandCalls,allCalls:commandCalls,units:[officer],syncStatus:{state:'ok'},selectedCall:selected,onOpen:setSelected,onClose:()=>setSelected(null),onMap:call=>events.push('map:'+call.id),onRefresh:()=>events.push('refresh'),onPriority:async call=>events.push('priority:'+call.id),onClear:async call=>events.push('clear:'+call.id),canChangePriority:!readOnly,canClear:!readOnly,priorityOf:c=>c.priority,identifierOf:c=>({value:c.id}),incidentOf:c=>c.incident,timeOf:()=> '10:00 AM',elapsedOf:()=> '5m',isExternal:c=>c.source==='pulsepoint',actions:React.createElement('button',null,'New BOLO'),settings:React.createElement('button',null,'Duty setting')});
}
(async()=>{
 const user=userEvent.setup({document});render(React.createElement(CommandHarness));
 assert.equal(document.querySelectorAll('article').length,3);assert.equal(document.querySelector('article').textContent.includes('Priority incident'),true,'critical incident is first');
 assert(!document.body.textContent.includes('PrivateFirst'),'field roster uses rank and last name');
 await user.click(screen.getByRole('button',{name:'Needs dispatch',exact:true}));assert.equal(document.querySelectorAll('article').length,1);
 await user.click(screen.getByRole('button',{name:'Map',exact:true}));assert(events.includes('map:c1'));
 await user.click(screen.getByRole('button',{name:'Open incident',exact:true}));const dialog=await screen.findByRole('dialog');assert(dialog.textContent.includes('Armstrong gate'));assert(dialog.textContent.includes('No unit has been assigned.'));
 await user.click(require('@testing-library/react').within(dialog).getByRole('button',{name:'Change priority'}));assert(events.includes('priority:c1'));
 await user.click(require('@testing-library/react').within(dialog).getByRole('button',{name:'Clear call'}));await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));assert(events.includes('clear:c1'));
 await user.click(screen.getByRole('button',{name:'All calls',exact:true}));fireEvent.change(screen.getByRole('textbox',{name:'Search live incidents'}),{target:{value:'Oliver'}});assert.equal(document.querySelectorAll('article').length,1);assert(document.querySelector('article').textContent.includes('Routine check'));
 fireEvent.change(screen.getByRole('textbox',{name:'Search live incidents'}),{target:{value:''}});fireEvent.change(screen.getByRole('combobox',{name:'Filter live command by agency'}),{target:{value:'RFD'}});assert.equal(document.querySelectorAll('article').length,1);assert(document.querySelector('article').textContent.includes('Medical response'));
 await user.click(screen.getByRole('button',{name:'Refresh',exact:true}));assert(events.includes('refresh'));
 cleanup();render(React.createElement(CommandHarness,{readOnly:true}));assert.equal(screen.queryByRole('button',{name:'Clear call',exact:true}),null);assert.equal(screen.queryByRole('button',{name:'Change priority',exact:true}),null);cleanup();
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});render(React.createElement(QueryClientProvider,{client:qc},React.createElement(load('src/pages/ClientDocuments.jsx').default)));
 await screen.findByText('Unique Armstrong overview.');assert.equal(document.body.textContent.split('Unique Armstrong overview.').length-1,1);assert.equal(document.body.textContent.split('Hourly perimeter patrol.').length-1,1);
 assert(!document.body.textContent.includes('OLD DUPLICATE'));assert(!document.body.textContent.includes('PRIVATE DATA'));assert(!document.body.textContent.includes('Shared company rules.'));
 await user.click(screen.getByRole('button',{name:'Contacts & command',exact:true}));await screen.findByText('Live site chain');assert.equal(document.querySelectorAll('[data-chain]').length,1,'chain rendered once');
 await user.click(screen.getByRole('button',{name:'Company orders & emergency plan',exact:true}));await screen.findByText('Shared company rules.');assert.equal(document.body.textContent.split('Shared company rules.').length-1,1);assert(!document.body.textContent.includes('HIDDEN OLD POLICY'));assert.equal(document.querySelectorAll('[data-chain]').length,0);
 await user.click(screen.getByRole('button',{name:'Property instructions',exact:true}));await user.click(screen.getByRole('button',{name:'Oliver Crossing',exact:true}));await screen.findByText('Unique Oliver overview.');assert(!document.body.textContent.includes('Unique Armstrong overview.'),'only selected property instructions render');
 cleanup();qc.clear();
 console.log('PASS: redesigned command queue priority/filter/search, incident details, map/priority/clear/refresh handlers and permission gates; client portfolio switching, no duplicate property versions, one command chain, one shared company library and inactive-policy filtering.');
})().catch(error=>{console.error(error);process.exit(1)});
