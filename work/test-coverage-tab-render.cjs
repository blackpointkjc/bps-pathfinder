const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 const dir=await import('../src/lib/directoryUtils.js');
 const names=await import('../src/utils/previewIdentity.js');
 const command=await import('../src/utils/commandReporting.js');
 const absence=await import('../src/utils/outOfOffice.js');
 const ranks=await import('../src/utils/rankPolicy.js');
 const people=[{id:'officer',email:'officer@test',rank:'Lieutenant',last_name:'Cook',platoon:'A',additional_roles:['officer']},{id:'cover',email:'cover@test',rank:'Sergeant',last_name:'Robinson',platoon:'A',additional_roles:['officer'],supervisor_id:'officer'}];
 const admin={id:'admin',role:'admin'};
 const qc={invalidateQueries:async()=>{},removeQueries:()=>{}};
 const common=name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='@/lib/AuthContext')return {useAuth:()=>({user:admin})};
  if(name==='@tanstack/react-query')return {useQueryClient:()=>qc,useQuery:({queryKey})=>({data:queryKey[0]==='adminCenterSignedInUser'?admin:people,isPending:false,isError:false})};
  if(name==='@/lib/directoryUtils')return dir;
  if(name==='@/utils/previewIdentity')return names;
  if(name==='@/utils/commandReporting')return command;
  if(name==='@/utils/outOfOffice')return absence;
  if(name==='@/utils/rankPolicy')return ranks;
  if(name==='@/hooks/useAvailabilityClock')return {useAvailabilityClock:()=>{}};
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  return {default:()=>null};
 };
 const editor={};
 vm.runInNewContext(compile('src/components/AdminOutOfOffice.jsx'),{exports:editor,require:common});
 const manager={};let stringState=0;
 vm.runInNewContext(compile('src/components/OfficerAbsenceManager.jsx'),{exports:manager,require:name=>{
  if(name==='react')return {...React,useState:initial=>React.useState(initial===''&&++stringState===2?'officer':initial)};
  if(name==='@/components/AdminOutOfOffice')return editor;
  return common(name);
 }});
 const rendered=renderToStaticMarkup(React.createElement(manager.default));
 assert.ok(rendered.includes('Lieutenant Cook'));
 assert.ok(rendered.includes('Sergeant Robinson'));
 assert.ok(rendered.includes('datetime-local'));
 assert.ok(rendered.includes('Save availability'));
 assert.ok(rendered.includes('Return now'));
 const root={};
 vm.runInNewContext(compile('src/pages/AdminCenter.jsx'),{
 exports:root,window:{location:{search:'?admin_center=admin&admin_ops_section=coverage'}},URLSearchParams,
 require:name=>{
  if(name==='@/components/OfficerAbsenceManager')return manager;
  if(name==='react-router-dom')return {useNavigate:()=>()=>{}};
  if(name==='@/components/UnifiedCenter')return {default:({queryParam,children})=>React.createElement('div',null,children(queryParam==='admin_ops_section'?'coverage':'admin'))};
  return common(name);
 }});
 stringState=0;
 const tab=renderToStaticMarkup(React.createElement(root.default));
 assert.ok(tab.includes('Out of Office &amp; Coverage'));
 assert.ok(tab.includes('Set out of office'));
 console.log('PASS: inline Admin tab renders officer list, selected officer dates, automatic coverage, Save and Return now controls');
})().catch(error=>{console.error(error);process.exitCode=1});
