const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://example.test'});
for(const name of ['window','document','HTMLFormElement','HTMLSelectElement','HTMLOptionElement','Document','NodeFilter','DocumentFragment','SVGElement','HTMLElement','Element','Node','MutationObserver','CustomEvent','Event','KeyboardEvent','MouseEvent','HTMLInputElement'])globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.getComputedStyle=dom.window.getComputedStyle;
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
HTMLElement.prototype.hasPointerCapture=()=>false;HTMLElement.prototype.setPointerCapture=()=>{};HTMLElement.prototype.releasePointerCapture=()=>{};
let scrolled=0;HTMLElement.prototype.scrollIntoView=function(){scrolled++;};
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react'),{render,fireEvent,screen,waitFor,act,cleanup}=require('@testing-library/react'),userEvent=require('@testing-library/user-event').default,{QueryClient,QueryClientProvider}=require('@tanstack/react-query'),assert=require('assert/strict');
const officer={id:'officer',email:'officer@test',rank:'Lieutenant',last_name:'Example',additional_roles:['officer','supervisor'],employment_status:'active'},actor={id:'admin',email:'admin@test',role:'admin'};
const vehicle={id:'car',vehicle_id:'Car 1',year:2026,make:'Ford',model:'Explorer',status:'Active'};
let fleet=[{id:'v1',vehicle_id:'car',vehicle_label:'Car 1',assignment_date:'2026-10-18',start_time:'18:00',end_time:'23:00',primary_officer_email:officer.email,status:'scheduled',location:'Armstrong',notes:'old vehicle note'}];
let duty=[{id:'d1',supervisor_email:officer.email,supervisor_name:'Lieutenant Example',assignment_date:'2026-10-18',start_time:'18:00',end_time:'23:00',location:'Armstrong',status:'scheduled',notes:'old duty note'}];
const calls=[],notices=[];
const api={entities:new Proxy({},{get:()=>({subscribe:()=>()=>{}})}),functions:{invoke:async(name,body={})=>{
 calls.push({name,body:structuredClone(body)});
 if(name==='getFleetScheduleData'){
  if(body.action==='save'){const row={...body.assignment,id:body.assignment.id||'v-new',vehicle_label:'Car 1'};fleet=[...fleet.filter(x=>x.id!==row.id),row];return {data:{success:true,assignment:row}};}
  if(body.action==='delete'){fleet=fleet.filter(x=>x.id!==body.id);return {data:{success:true}};}
  return {data:{success:true,vehicles:[vehicle],assignments:fleet,schedules:[]}};
 }
 if(name==='manageDutySupervisorSchedule'){
  if(body.action==='save'){const row={...body.assignment,id:body.assignment.id||'d-new'};duty=[...duty.filter(x=>x.id!==row.id),row];return {data:{success:true,assignment:row}};}
  if(body.action==='delete'){duty=duty.filter(x=>x.id!==body.id);return {data:{success:true}};}
  return {data:{success:true,assignments:duty}};
 }
 throw Error('Unexpected invocation '+name);
}}};
const modules={};
function load(path){
 if(modules[path])return modules[path];const exports={};modules[path]=exports;
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,window,document,navigator,HTMLElement,localStorage:dom.window.localStorage,requestAnimationFrame,cancelAnimationFrame,queueMicrotask,Date,Intl,Set,Map,console,setTimeout,clearTimeout,require:name=>{
  if(name==='@/api/base44Client')return {base44:api,clearBase44ReadCacheMatching:()=>{}};
  if(name==='@/lib/AuthContext')return {useAuth:()=>({user:actor,isLoadingAuth:false})};
  if(name==='@/lib/appDirectory')return {listDirectoryUsers:async()=>[officer],listDirectoryLocations:async()=>[{id:'site',site_name:'Armstrong',active:true}]};
  if(name==='@/lib/fleetScheduleSync')return {syncOfficerVehicles:async()=>({created:0})};
  if(name==='@/lib/reportPrint')return {openBlackPointReport:()=>{}};
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name==='sonner')return {toast:{success:m=>notices.push(m),error:m=>{throw Error(m);}}};
  if(name.startsWith('@/')){const file='src/'+name.slice(2);for(const ext of ['', '.js','.jsx'])if(fs.existsSync(file+ext)&&fs.statSync(file+ext).isFile())return load(file+ext);throw Error(name);}
  return require(name);
 }});return exports;
}
const UI=load('src/components/ui/dialog.jsx'),h=React.createElement;
function mount(Component,querySeed){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 for(const [key,value]of Object.entries(querySeed))qc.setQueryData([key],value);
 const child=h(UI.Dialog,{open:true},h(UI.DialogContent,null,h(UI.DialogHeader,null,h(UI.DialogTitle,null,'Scheduling action')),h(Component,{embedded:true,editorOnly:true,weekStart:'2026-10-18'})));
 render(h(QueryClientProvider,{client:qc},child));return qc;
}
const byLabel=label=>screen.getByText(label,{selector:'label'}).parentElement;
(async()=>{
 const user=userEvent.setup({document});
 const Fleet=load('src/pages/FleetVehicleAssignments.jsx').default;
 const qc=mount(Fleet,{fleetUsers:[officer],fleetLocations:[{id:'site',site_name:'Armstrong'}],fleetScheduleData:{vehicles:[vehicle],assignments:fleet,schedules:[]}});
 await user.click(screen.getByRole('button',{name:'Edit',exact:true}));
 await waitFor(()=>assert.equal(document.activeElement.type,'date'));
 assert(screen.getByText('Edit vehicle assignment'));assert.equal(byLabel('Notes').querySelector('input').value,'old vehicle note');assert(scrolled>0,'edit scrolls editor into view');
 fireEvent.change(byLabel('Notes').querySelector('input'),{target:{value:'updated vehicle note'}});
 await user.click(screen.getByRole('button',{name:'UPDATE ASSIGNMENT'}));
 await waitFor(()=>assert.equal(fleet[0].notes,'updated vehicle note'));
 assert(calls.some(c=>c.name==='getFleetScheduleData'&&c.body.action==='save'&&c.body.assignment.id==='v1'));
 await user.click(screen.getByRole('button',{name:'Remove',exact:true}));
 const alert=await screen.findByRole('alertdialog');assert.equal(alert.style.pointerEvents,'auto');assert.equal(alert.style.zIndex,'2147483647');
 await user.click(screen.getByRole('button',{name:'Remove assignment'}));
 await waitFor(()=>assert.equal(qc.getQueryData(['fleetScheduleData']).assignments.length,0));assert.equal(fleet.length,0);
 await user.click(screen.getByRole('button',{name:'New reservation'}));
 for(const [label,choice]of [['Vehicle',/Car 1/],['Primary Officer',/Lieutenant Example/],['Location',/^Armstrong$/]]){
  await user.click(byLabel(label).querySelector('[role=combobox]'));await user.click(await screen.findByRole('option',{name:choice}));
 }
 await user.click(screen.getByRole('button',{name:'CREATE ASSIGNMENT'}));
 await waitFor(()=>assert.equal(fleet.length,1));assert.equal(fleet[0].primary_officer_email,officer.email);assert.equal(fleet[0].vehicle_id,'car');
 const deletes=calls.filter(c=>c.body.action==='delete').length;
 await user.click(screen.getByRole('button',{name:'Remove',exact:true}));await user.click(await screen.findByRole('button',{name:'Cancel',exact:true}));
 assert.equal(calls.filter(c=>c.body.action==='delete').length,deletes,'Cancel does not send deletion');assert.equal(fleet.length,1);
 cleanup();qc.clear();
 const Duty=load('src/pages/DutySupervisorScheduling.jsx').default;
 const dutyQC=mount(Duty,{dutySupervisorUsers:[officer],dutySupervisorLocations:[{id:'site',site_name:'Armstrong'}],dutySupervisorAssignments:duty});
 await user.click(screen.getByRole('button',{name:'Edit',exact:true}));
 await waitFor(()=>assert.equal(document.activeElement.type,'date'));
 assert(screen.getByText('Editing existing coverage'));assert.equal(byLabel('Notes').querySelector('input').value,'old duty note');
 fireEvent.change(byLabel('Notes').querySelector('input'),{target:{value:'updated duty note'}});
 await user.click(screen.getByRole('button',{name:'UPDATE COVERAGE'}));
 await waitFor(()=>assert.equal(duty[0].notes,'updated duty note'));
 assert(calls.some(c=>c.name==='manageDutySupervisorSchedule'&&c.body.action==='save'&&c.body.assignment.id==='d1'));
 await user.click(screen.getByRole('button',{name:'Remove',exact:true}));
 await user.click(await screen.findByRole('button',{name:'Confirm',exact:true}));
 await waitFor(()=>assert.equal(dutyQC.getQueryData(['dutySupervisorAssignments']).length,0));
 assert.equal(duty.length,0);
 await user.click(screen.getByRole('button',{name:'Lieutenant Example',exact:true}));
 await user.click(screen.getByRole('button',{name:'SCHEDULE SUPERVISOR'}));
 await waitFor(()=>assert.equal(duty.length,1));
 assert.equal(duty[0].supervisor_email,officer.email);
 cleanup();dutyQC.clear();
 console.log('PASS: actual vehicle and duty forms inside real Radix dialogs support Edit → focus/reveal → Save existing ID; Remove confirms above parent and refreshes rows; Cancel preserves data; dropdown choices/create assign correct vehicle/officer and duty supervisor.');
})().catch(error=>{console.error(error);process.exit(1)});
