import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('CAD shell opens the command board without loading other workstations',()=>{
 const shell=read('src/pages/CADCenter.jsx');
 for(const name of ['Navigation','UnitStatus','BOLOAlerts','CallHistory','OfficerDispatchQueue','CadCommandPalette','CadResponseAnalytics','CadResourceBoard']){
  assert.ok(shell.includes('const '+name+'=lazy(()=>import('),name);
  assert.ok(!shell.includes('import '+name+' from '),name);
 }
 assert.ok(shell.includes("import CommandDashboard from './CommandDashboard'"));
 assert.ok(shell.includes('<Suspense fallback={<CadToolLoading label={active.label}/>}>'));
 assert.ok(shell.includes('{paletteOpen&&<Suspense'));
 assert.ok(read('src/components/dispatch/cad/UnifiedCadGrid.jsx').includes('const TacticalCommandMap=lazy'));
 assert.ok(read('src/components/dispatch/LiveCommandWorkspace.jsx').includes('const TacticalCommandMap=lazy'));
});
test('startup warms one authorized route and live feed precedes property history',()=>{
 const prep=read('src/lib/lazyPages.js').split('export function prepareWorkspace')[1];
 assert.ok(prep.includes('route&&canAccessPage(user,route)'));
 assert.ok(prep.includes('prepareToolLoaders(load?[load]:[]'));
 assert.ok(prep.includes('concurrency:1'));
 assert.ok(!prep.includes('getAppDirectory'));
 assert.ok(read('src/pages/CommandDashboard.jsx').includes('useRecentPropertyIncidents(authenticatedUser?.id,!loading)'));
 assert.ok(read('src/hooks/useRecentPropertyIncidents.js').includes('enabled:!!userId&&enabled'));
 assert.ok(read('src/pages/CADCenter.jsx').includes('<DashboardDataProvider loadRoster={false}>'));
 const roster=read('src/hooks/useCadRoster.js');
 assert.ok(roster.indexOf('await statusRequest;')<roster.indexOf('await getAppDirectory(force)'));
});

test('CAD modules initialize lazy components after imports in an order-preserving module transform',async()=>{
 const ts=(await import('typescript')).default;
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url);
 const React=require('react');
 for(const path of ['src/components/dispatch/LiveCommandWorkspace.jsx','src/components/dispatch/cad/UnifiedCadGrid.jsx','src/pages/CADCenter.jsx']){
  const source=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  let executable=false,reactImport=false,lazyCount=0;
  for(const stmt of source.statements){
   if(ts.isImportDeclaration(stmt)){
    assert.equal(executable,false,path+' has a late import: '+stmt.getText(source));
    if(stmt.moduleSpecifier.text==='react'&&stmt.importClause?.namedBindings?.elements?.some(e=>e.name.text==='lazy'))reactImport=true;
   }else{
    executable=true;
    if(ts.isVariableStatement(stmt)&&stmt.getText(source).includes('=lazy(')){assert.ok(reactImport,path+' initializes lazy too early');lazyCount++;}
   }
  }
  assert.ok(lazyCount>0);
  // Execute the actual transformed module, not just a string match.
  // Dependencies unrelated to initialization are inert; React.lazy is real.
  const compiled=ts.transpileModule(read(path),{fileName:path,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  const fake=new Proxy({__esModule:true},{get:(obj,key)=>key==='__esModule'?true:()=>null});
  new Function('require','module','exports',compiled)(name=>name==='react'?React:name==='react/jsx-runtime'?require(name):fake,mod,mod.exports);
  assert.equal(typeof mod.exports.default,'function',path+' failed module initialization');
 }
});
