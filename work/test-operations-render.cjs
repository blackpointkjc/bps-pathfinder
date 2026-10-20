const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const fixture={
 operationsLocations:[{id:'a',site_name:'Armstrong',address:'Richmond'},{id:'b',site_name:'Other property'}],
 postOrders:[{id:'post',site_name:'Armstrong',site_overview:'Armstrong-specific instructions'},{id:'other-post',site_name:'Other property',site_overview:'OTHER PROPERTY SECRET'}],
 jobDutyRules:[{id:'rule',property_site:'Armstrong',qr_required:true,qr_frequency_minutes:45}],
 qrCheckpoints:[{id:'cp',property_site:'Armstrong',checkpoint_name:'Front Gate',location_label:'Main entrance'},{id:'other',property_site:'Other property',checkpoint_name:'OTHER CHECKPOINT'}],
 generalPostOrders:[{id:'general',section_title:'Professional conduct',content:'Shared company instruction'}]
};
const outputs={};
const source=fs.readFileSync('src/components/AdminOperationsWorkbench.jsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compiled,{
 exports:outputs,crypto:{randomUUID:()=> 'fixture'},window:{location:{search:''}},
 require:name=>{
  if(name==='react')return React;
  if(name==='react/jsx-runtime')return require(name);
  if(name==='@tanstack/react-query')return {useQuery:({queryKey})=>({data:fixture[queryKey[0]],isPending:false,isError:false}),useQueryClient:()=>({})};
  if(name==='@/lib/AuthContext')return {useAuth:()=>({user:{role:'admin',email:'admin@test'}})};
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name==='sonner')return {toast:{}};
  return {default:()=>null};
 }
});
const html=renderToStaticMarkup(React.createElement(outputs.default));
assert.ok(html.includes('Armstrong-specific instructions'));
assert.ok(!html.includes('OTHER PROPERTY SECRET'));
assert.ok(html.includes('Front Gate'));
assert.ok(!html.includes('OTHER CHECKPOINT'));
assert.ok(html.includes('Professional conduct'));
assert.equal((html.match(/Site Operations<\/h1>/g)||[]).length,1);
assert.ok(!html.includes('ADMIN CONTROL CENTER'));
assert.ok(!html.includes('role="tab"'));
assert.ok(html.includes('Patrol &amp; reporting standards'));
console.log('PASS: single inline workspace renders selected-site instructions/checkpoints and shared orders without nested tabs or cross-site content');
