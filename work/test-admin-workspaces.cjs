const fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),assert=require('assert/strict');
const fixture={id:'officer',email:'officer@test',rank:'Lieutenant',last_name:'Example',platoon:'A',unit_number:'401',additional_roles:['officer']};
const actor={id:'admin',role:'admin',email:'admin@test'};
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const stub=label=>({children})=>React.createElement('div',{'data-panel':label},children||label);
const ui=new Proxy({},{get:(_,name)=>name==='Dialog'?({open,children})=>open?React.createElement('div',null,children):null:stub(name)});
const qc={invalidateQueries:async()=>{},setQueryData:()=>{}};
let search='';
const cache={};
function load(path){
 if(cache[path])return cache[path];
 const exports={};cache[path]=exports;
 vm.runInNewContext(compile(path),{exports,URLSearchParams,window:{location:{search},history:{},matchMedia:()=>({matches:true})},console,Date,Set,Map,require:name=>{
  if(name==='react'||name==='react/jsx-runtime'||name==='date-fns')return require(name);
  if(name==='@tanstack/react-query')return {useQueryClient:()=>qc,useMutation:()=>({mutate:()=>{},isPending:false}),useQuery:({queryKey})=>({data:queryKey[0]==='currentUser'?actor:queryKey[0]==='portalUsers'?[fixture,actor]:queryKey[0]==='activeDivisions'?[]:[],isLoading:false})};
  if(name==='react-router-dom')return {useNavigate:()=>()=>{}};
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name==='@/lib/AuthContext')return {useAuth:()=>({user:actor})};
  if(name==='@/utils/rankPolicy')return {rankLevel:rank=>['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Officer'].indexOf(rank),getPayRangeForRank:()=>({}),nextUnitNumber:()=>'',previewRankChange:()=>({})};
  if(name==='@/api/base44Client')return {base44:{entities:{},functions:{}}};
  if(name.startsWith('@/components/ui/'))return ui;
  if(name==='./InlineSection')return load('src/components/admin/workspaces/InlineSection.jsx');
  if(name==='./InlineSection.jsx')return load('src/components/admin/workspaces/InlineSection.jsx');
  if(name==='@/components/admin/VehicleManagement')return {default:stub('Company vehicle inventory')};
  if(name==='@/components/dispatch/MaintenanceTracking')return {default:stub('Asset maintenance')};
  if(name==='@/components/admin/ScheduleBoard')return {default:stub('Primary schedule board')};
  if(name.startsWith('@/pages/'))return {default:stub(name.split('/').pop())};
  if(name==='../components/ProfilePhotoCropper')return {default:()=>null};
  return {};
 }});
 return exports;
}
const render=path=>renderToStaticMarkup(React.createElement(load(path).default));
let html=render('src/components/admin/workspaces/SchedulingWorkspace.jsx');
for(const label of ['Scheduling &amp; Coverage','Primary schedule board','Duty supervisor coverage','Vehicles for scheduled shifts','Staffing plans','Open shifts &amp; officer bids','Time off','Additional coverage requests'])assert(html.includes(label),label);
assert(!html.includes('data-panel="DutySupervisorScheduling"'),'closed panels do not mount their network-heavy pages');
cache['src/components/admin/workspaces/SchedulingWorkspace.jsx']=null;search='?admin_schedule_tool=duty';
html=render('src/components/admin/workspaces/SchedulingWorkspace.jsx');assert(html.includes('data-panel="DutySupervisorScheduling"'),'legacy duty deep link expands inline content');
html=render('src/components/admin/workspaces/AssetsWorkspace.jsx');assert(html.includes('Company vehicle inventory'));assert(html.includes('Asset maintenance'));
html=render('src/components/admin/OfficerCommandControls.jsx'); // no officer safely renders nothing
assert.equal(html,'');
html=renderToStaticMarkup(React.createElement(load('src/components/admin/OfficerCommandControls.jsx').default,{officer:fixture,users:[fixture,{id:'major',rank:'Major',last_name:'Command'}]}));
for(const label of ['Platoon &amp; chain of command','CAD duty controls','Force sign out','Lock account','Save command assignment'])assert(html.includes(label),label);
html=render('src/pages/AdminUsers.jsx');
for(const label of ['Accounts &amp; Access','Search accounts','Access role','Manage account','Lieutenant Example','officer@test'])assert(html.includes(label),label);
assert(!html.includes('Pending Role Assignment'),'active account directory no longer labels every account pending');
console.log('PASS: real workspace/account/personnel components render; inline tools are lazy, deep links expand in place, assets include fleet/maintenance, account directory includes active officers, and CAD actions share the selected officer.');
