const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{webcrypto}=require('crypto');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function moduleAt(p,deps={}){const exports={};vm.runInNewContext(compile(p),{exports,console,Response,Request,TextEncoder,crypto:webcrypto,URLSearchParams,Date,Set,Map,require:n=>n in deps?deps[n]:require(n)});return exports;}
function backend(path,client,deps={}){let handler;vm.runInNewContext(compile(path),{exports:{},console,Response,Request,TextEncoder,crypto:webcrypto,Date,Set,Map,Deno:{serve:f=>handler=f},require:n=>n==='npm:@base44/sdk'?{createClientFromRequest:()=>client}:deps[n]});return body=>handler(new Request('http://test',{method:'POST',body:JSON.stringify(body)}));}
(async()=>{
 const permissions=moduleAt('src/lib/dispatchPermissions.js').canEditIncidentPriority;
 for(const u of [{role:'dispatch'},{dispatch_role:true},{additional_roles:[' Dispatch ']}])assert.equal(permissions(u),true);
 for(const u of [null,{role:'admin'},{is_supervisor:true},{additional_roles:['full_access','cad_access','supervisor']}])assert.equal(permissions(u),false);
 let writes=[],logs=[],actor={role:'admin'};
 const client={auth:{me:async()=>actor},asServiceRole:{entities:{DispatchCall:{get:async()=>({id:'c',priority:'medium',status:'New'}),update:async(...a)=>writes.push(a)},CallStatusLog:{create:async x=>logs.push(x)},AuditLog:{create:async()=>{}}}}};
 const priority=backend('base44/functions/updateCadCallPriority/entry.ts',client);
 for(const user of [null,{role:'admin'},{is_supervisor:true},{additional_roles:['full_access','supervisor','cad_access']}]){actor=user;const r=await priority({call_id:'c',priority:'critical'});assert.equal(r.status,user?403:401);}
 assert.equal(writes.length,0);
 actor={additional_roles:['dispatch'],id:'d'};
 assert.equal((await priority({call_id:'c',priority:'bad'})).status,400);
 assert.equal((await priority({call_id:'c',priority:'high'})).status,200);assert.equal(writes[0][1].priority,'high');assert.equal(writes[0][1].priority_override,true);assert.equal(logs.length,1);
 const planModule=moduleAt('base44/functions/balance-platoons/plan.ts');
 let users=[{id:'cmd',email:'cmd@test',rank:'Colonel',platoon:'Command',updated_date:'1'},...Array.from({length:9},(_,i)=>({id:'o'+i,email:'o'+i+'@test',rank:i<3?'Sergeant':'Officer',platoon:'A',updated_date:'1'})),{id:'student',email:'student@test',rank:'Officer',additional_roles:['student']}];
 const plan=planModule.balancePlan(users);assert(Math.abs(plan.counts.A-plan.counts.B)<=1);assert.equal(plan.counts.A+plan.counts.B,9);assert(!plan.changes.some(p=>['cmd','student'].includes(p.id)));assert.equal(plan.warnings.length,0);assert.deepEqual(JSON.stringify(plan),JSON.stringify(planModule.balancePlan([...users].reverse())));
 const version=await planModule.rosterVersion(users);assert.notEqual(version,await planModule.rosterVersion(users.map(u=>({...u,updated_date:'2'}))));
 const notices=[],notifications={filter:async q=>notices.filter(n=>n.event_key===q.event_key),create:async n=>notices.push(n)};
 const notify=moduleAt('base44/functions/updateUser/notifyPlatoonChange.ts').notifyPlatoonChange;
 const before={id:'o',platoon:'A',supervisor_id:'old'},after={id:'o',email:'o@test',platoon:'B',supervisor_id:'new',supervisor_name:'Sergeant Test',updated_date:'2'};
 await notify({Notification:notifications},before,after);await notify({Notification:notifications},before,after);
 assert.equal(notices.length,1);assert.equal(notices[0].recipient_email,'o@test');assert.equal(notices[0].requires_acknowledgment,true);assert(notices[0].announcement_text.includes('Call and report to your new command'));
 await notify({Notification:notifications},after,after);assert.equal(notices.length,1);
 let db=structuredClone(users),updates=0,notifyCount=0;
 const balanceClient={auth:{me:async()=>actor},asServiceRole:{entities:{User:{list:async()=>structuredClone(db),get:async id=>structuredClone(db.find(p=>p.id===id)),update:async(id,patch)=>{updates++;db=db.map(p=>p.id===id?{...p,...patch,updated_date:'2'}:p);}}}}};
 const balance=backend('base44/functions/balance-platoons/entry.ts',balanceClient,{'./plan.ts':planModule,'./notifyPlatoonChange.ts':{notifyPlatoonChange:async()=>notifyCount++}});
 actor={role:'user'};assert.equal((await balance({action:'preview'})).status,403);
 actor={role:'admin'};const preview=await (await balance({action:'preview'})).json();assert.equal(updates,0);assert.equal(notifyCount,0);
 assert.equal((await balance({action:'apply',version:'stale'})).status,409);assert.equal(updates,0);
 const result=await (await balance({action:'apply',version:preview.version})).json();assert.equal(result.success,true);assert.equal(updates,preview.changes.length);assert.equal(notifyCount,updates);
 assert.equal((await balance({action:'apply',version:preview.version})).status,409);

 db=structuredClone(users);updates=0;
 const failingBalance=backend('base44/functions/balance-platoons/entry.ts',balanceClient,{'./plan.ts':planModule,'./notifyPlatoonChange.ts':{notifyPlatoonChange:async()=>{throw new Error('Notification transport unavailable');}}});
 const failurePreview=await (await failingBalance({action:'preview'})).json();
 const failure=await (await failingBalance({action:'apply',version:failurePreview.version})).json();
 assert.equal(failure.success,false);assert.equal(failure.failed.length,1);assert.equal(failure.failed[0].assignment_saved,true);assert.equal(updates,1);assert.equal(failure.remaining,failurePreview.changes.length-1);
 const bannerSource=fs.readFileSync('src/components/GlobalMessageBanner.jsx','utf8');
 assert(bannerSource.includes("source.sourceName && record.source_name !== source.sourceName"));
 assert(bannerSource.includes("source.sourceName === 'Platoon Command') ? record.id : null"));
 assert(fs.readFileSync('src/pages/AdminOfficerManagement.jsx','utf8').includes('<PlatoonBalancePreview'));
 for(const [file,marker] of [['base44/functions/ingestGractivecalls/entry.ts','previous.priority_override ? {priority:previous.priority}'],['base44/functions/ingestPulsePoint/entry.ts','existing.priority_override ? existing.priority']])assert(fs.readFileSync(file,'utf8').includes(marker));
 const schema=JSON.parse(fs.readFileSync('base44/entities/DispatchCall.jsonc'));assert.equal(schema.properties.priority.rls.update,false);
 const selector=moduleAt('src/components/dispatch/IncidentPrioritySelect.jsx').default;
 const html=renderToStaticMarkup(React.createElement(selector,{call:{id:'c'},priority:'high',onSave:()=>{}}));assert.equal((html.match(/<option /g)||[]).length,4);assert(html.includes('value="high" selected'));
 let saved;const tree=selectorWithHooks();
 function selectorWithHooks(){const exports=moduleAt('src/components/dispatch/IncidentPrioritySelect.jsx',{'react':{...React,useState:x=>[x,()=>{}]}});return exports.default({call:{id:'c'},priority:'medium',onSave:async(call,next)=>{saved={call,next};}});}
 const select=tree.props.children[0].props.children[1];await select.props.onChange({stopPropagation(){},target:{value:'critical'}});assert.equal(saved.next,'critical');assert.equal(saved.call.id,'c');
 const workspace=moduleAt('src/components/dispatch/LiveCommandWorkspace.jsx',{'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'./cad-console.css':{},'./IncidentPrioritySelect':{default:selector},'@/utils/rankPolicy':{comparePersonnel:()=>0},'@/components/ui/dialog':new Proxy({},{get:(_,key)=>key==='Dialog'?()=>null:()=>null}),'lucide-react':new Proxy({},{get:()=>()=>null})}).default;
 const props={calls:[{id:'c',incident:'Test',priority:'high',location:'Test address'}],allCalls:[{id:'c'}],units:[],priorityOf:c=>c.priority||'high',identifierOf:()=>({value:'CAD-1'}),incidentOf:c=>c.incident,timeOf:()=>'',elapsedOf:()=>'',isExternal:()=>false};
 const officerHTML=renderToStaticMarkup(React.createElement(workspace,{...props,canChangePriority:false}));assert(officerHTML.includes('<table'));assert(!officerHTML.includes('Change priority for'));
 const dispatcherHTML=renderToStaticMarkup(React.createElement(workspace,{...props,canChangePriority:true}));assert(dispatcherHTML.includes('Change priority for'));
 console.log('PASS: dispatcher UI/backend role matrix, invalid priority denial, chosen priority persistence/log, four-option selector event, officer-hidden controls, rendered CAD table, balanced rank/total deterministic plan, excluded personnel, read-only preview, stale/replayed preview rejection, verified apply and notifications, targeted acknowledgment wording/dedup, direct priority FLS.');
})().catch(e=>{console.error(e);process.exit(1);});
