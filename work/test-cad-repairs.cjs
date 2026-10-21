const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(p,deps={}){const exports={};vm.runInNewContext(compile(p),{exports,console,Set,Map,URLSearchParams,window:{location:{pathname:'/CADCenter',search:'?section=live&tool=command'}},require:n=>n in deps?deps[n]:require(n)});return exports;}
function backend(p,client){let handler;vm.runInNewContext(compile(p),{exports:{},console,Response,Request,Date,Set,Map,Deno:{serve:f=>handler=f},require:n=>({createClientFromRequest:()=>client})});return body=>handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));}
(async()=>{
 const nav=load('src/lib/cadNavigation.js',{'@/utils':{createPageUrl:p=>'/'+p}}).cadDestination;
 for(const [page,section,tool] of [['BOLOAlerts','alerts','bolo'],['Navigation','live','map'],['CallHistory','history','history']]){
  const url=new URL(nav(page,{new:'1',call_id:'c'}),'https://test');assert.equal(url.pathname,'/CADCenter');assert.equal(url.searchParams.get('section'),section);assert.equal(url.searchParams.get('tool'),tool);assert.equal(url.searchParams.get('call_id'),'c');
 }
 const adminNav=nav('BOLOAlerts',{new:'1'},{pathname:'/AdminCenter',search:'?admin_center=cad&cad_tool=command'});assert(adminNav.startsWith('/AdminCenter?'));assert(adminNav.includes('admin_center=cad'));assert(adminNav.includes('cad_tool=bolo'));
 const embedded=nav('BOLOAlerts',{new:'1'},{search:'?cad_tool=command'});assert(embedded.includes('cad_tool=bolo'));assert(embedded.includes('cad_section=alerts'));
 const directory=[{id:'a',email:'a@test',rank:'Officer',last_name:'Alpha'},{id:'b',email:'b@test',rank:'Sergeant',last_name:'Beta',status:'Out of Service'},{id:'client',email:'client@test',rank:'Client',additional_roles:['client']}];
 const operational=p=>p.email&&p.rank!=='Client';
 const merge=load('src/hooks/useCadRoster.js',{'react':React,'@/lib/appDirectory':{},'@/lib/directoryUtils':{isOperationalOfficer:operational},'@/lib/officerLocationHub':{}}).mergeCadRoster;
 assert.equal(merge(directory,[]).length,2);assert.equal(merge(directory,[])[0].status,'Out of Service');
 const merged=merge(directory,[{id:'a',officer_email:'a@test',status:'Available',presence_online:true}]);assert.equal(merged.length,2);assert.equal(merged[0].last_name,'Alpha');assert.equal(merged[0].status,'Available');
 assert.equal(merge(merged,[]).length,2);
 let actor={role:'user'},writes=[],alerts=0;
 const call={id:'call',call_id:'CAD-123',incident:'Test',location:'Test Street',created_date:'2026-10-01',status:'Cleared'};
 const db={DispatchCall:{get:async()=>call},CallHistory:{get:async()=>({...call,id:'archive',original_call_id:'old'}),filter:async()=>[{...call,id:'archive',original_call_id:'old'}]},Location:{get:async()=>({id:'p',site_name:'Test Property'})},PropertyCallLink:{filter:async q=>writes.filter(x=>x.call_id===q.call_id&&x.property_id===q.property_id),create:async data=>{writes.push({...data,id:'link'});return writes.at(-1);}},PropertyAlert:{create:async()=>alerts++}};
 const client={auth:{me:async()=>actor},asServiceRole:{entities:db}};
 const link=backend('base44/functions/link-call-property/entry.ts',client);
 assert.equal((await link({call_id:'call',property_id:'p'})).status,403);
 actor={role:'dispatch',email:'dispatcher@test'};assert.equal((await link({call_id:'call'})).status,400);
 const result=await (await link({call_id:'call',property_id:'p'})).json();assert.equal(result.success,true);assert.equal(result.link.property_name,'Test Property');assert.equal(writes.length,1);assert.equal(alerts,0);
 assert.equal((await (await link({call_id:'call',property_id:'p'})).json()).duplicate,true);assert.equal(writes.length,1);
 db.DispatchCall.get=async()=>null;
 const old=await (await link({call_id:'old',property_id:'p'})).json();assert.equal(old.success,true);assert.equal(old.link.archive_id,'archive');
 // History backend searches persisted active AND archived calls and restores manual property attribution.
 let queries=[];
 const empty={list:async()=>[],filter:async()=>[]};
 const histDb=new Proxy({...db,DispatchCall:{...empty,filter:async q=>{queries.push(q);return[];}},CallHistory:{...empty,filter:async q=>{queries.push(q);return[{...call,id:'archive',original_call_id:'old'}];}},PropertyCallLink:{list:async()=>writes}}, {get:(o,k)=>o[k]||empty});
 const history=backend('base44/functions/getCallHistoryFeed/entry.ts',{auth:{me:async()=>actor},asServiceRole:{entities:histDb}});
 const historyResponse=await history({search:'CAD-123'});assert.equal(historyResponse.status,200);
 const feed=await historyResponse.json();assert(feed.rows.some(r=>r._propertyCall&&r._propertyName.includes('Test Property')));assert.equal(queries.length,2);
 const searchPattern=queries[0].$or[0].call_id.$regex;assert.equal(searchPattern,'CAD-123');
 queries=[];await history({search:'CAD.[12]'});assert.equal(new RegExp(queries[0].$or[0].call_id.$regex).test('CADx1'),false);
 // Personnel buttons execute their actual handlers and show persistent inline feedback.
 let state=[],cursor=0,invocations=[],response={success:true,status:'Out of Service'};
 const hooks={...React,useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useEffect:()=>{}};
 const controls=load('src/components/admin/OfficerCommandControls.jsx',{'react':hooks,'@/components/admin/OfficerVehicleDefault':{default:()=>null},'@/lib/AuthContext':{useAuth:()=>({user:{role:'admin'}})},'@tanstack/react-query':{useQuery:()=>({data:[]}),useQueryClient:()=>({invalidateQueries:async()=>{}})},'@/api/base44Client':{base44:{functions:{invoke:async(name,data)=>{invocations.push({name,data});return{data:response};}}}},'@/lib/appDirectory':{invalidateAppDirectory(){}},'@/utils/rankPolicy':{rankLevel:r=>r==='Officer'?10:0},sonner:{toast:{success(){},error(){}}}}).default;
 const render=()=>{cursor=0;return controls({officer:{id:'o',email:'o@test',rank:'Officer',last_name:'Test',platoon:'A'},users:[]});};
 const nodes=(n,out=[])=>{if(n&&typeof n==='object'){out.push(n);React.Children.forEach(n.props?.children,c=>nodes(c,out));}return out;};
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
 let tree=render(),button=nodes(tree).find(n=>n.type==='button'&&text(n)==='Restrict to Out of Service');button.props.onClick();tree=render();assert(text(tree).includes('Enter a reason before restricting this officer.'));assert.equal(invocations.length,0);
 const reason=nodes(tree).find(n=>n.type==='input'&&n.props.placeholder==='Reason for supervisor override');reason.props.onChange({target:{value:'Fixture reason'}});tree=render();
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Restrict to Out of Service').props.onClick();await new Promise(r=>setImmediate(r));tree=render();assert.equal(invocations[0].name,'forceOfficerStatus');assert.equal(invocations[0].data.officer_id,'o');assert(text(tree).includes('Officer restricted to Out of Service.'));
 response={success:false,error:'Backend rejected update'};await nodes(tree).find(n=>n.type==='button'&&text(n)==='Release CAD restriction').props.onClick();await new Promise(r=>setImmediate(r));tree=render();assert(text(tree).includes('Backend rejected update'));
 const notificationSchema=JSON.parse(fs.readFileSync('base44/entities/Notification.jsonc'));assert(notificationSchema.properties.type.enum.includes('system_issue'));assert(!fs.readFileSync('base44/functions/forceOfficerStatus/entry.ts','utf8').includes("type: 'status_override'"));
 for(const p of ['src/pages/CADCenter.jsx','src/pages/DispatchCenter.jsx','src/components/dispatch/LiveCommandWorkspace.jsx'])assert(!fs.readFileSync(p,'utf8').includes('cad-console.css'));
 const dispatch=fs.readFileSync('src/pages/DispatchCenter.jsx','utf8');assert(dispatch.includes('aria-label="Live tactical map"'));assert(!dispatch.includes('xl:max-h-[320px]'));assert(dispatch.includes('<CallHistory embedded'));
 console.log('PASS: inline BOLO/map/history routing; directory officers survive empty/live-only snapshots; property linking auth, persistence, duplicate prevention, archive fallback and no emergency alerts; persisted CAD/archive search and property attribution; actual personnel click handlers, validation, success/error feedback; supported notification type; fixed stylesheet and popup-only tactical map.');
})().catch(e=>{console.error(e);process.exit(1);});
