const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
const officer={id:'o',email:'o@test',rank:'Lieutenant',last_name:'Cook',platoon:'A',additional_roles:['officer']};
const cover={id:'s',email:'s@test',rank:'Sergeant',last_name:'Robinson',platoon:'A',supervisor_id:'o',additional_roles:['officer']};
const ranks=await import('../src/utils/rankPolicy.js'),dir=await import('../src/lib/directoryUtils.js'),command=await import('../src/utils/commandReporting.js'),absence=await import('../src/utils/outOfOffice.js');
const ui=new Proxy({},{get:()=>({children})=>React.createElement('div',null,children)});
const common=name=>{
 if(name==='react'||name==='react/jsx-runtime')return require(name);
 if(name==='@tanstack/react-query')return {useQueryClient:()=>({invalidateQueries:async()=>{}}),useMutation:()=>({mutate:()=>{}}),useQuery:({queryKey})=>({data:queryKey[0]==='currentUser'?{role:'admin'}:queryKey[0]==='officerDirectory'?[officer,cover]:queryKey[0]==='officerCoverageDirectory'?[officer,cover]:queryKey[0]==='adminOfficerPrivateProfile'?officer:[],isPending:false,isError:false})};
 if(name==='@/utils/rankPolicy')return ranks;
 if(name==='@/utils/commandReporting')return command;
 if(name==='@/utils/outOfOffice')return absence;
 if(name==='@/lib/directoryUtils')return dir;
 if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
 if(name.startsWith('@/components/ui/'))return ui;
 return {};
};
const editor={};
vm.runInNewContext(compile('src/components/AdminOutOfOffice.jsx'),{exports:editor,require:common});
const page={};let first=true;
vm.runInNewContext(compile('src/pages/AdminOfficerManagement.jsx'),{exports:page,require:name=>{
 if(name==='react')return {...React,useState:value=>{if(first){first=false;return React.useState('o@test');}return React.useState(value);}};
 if(name==='@/components/AdminOutOfOffice')return editor;
 return common(name);
}});
const html=renderToStaticMarkup(React.createElement(page.default));
assert.ok(html.includes('Officer Availability &amp; Assignments'));
assert.ok(html.includes('Out of Office &amp; Acting Coverage'));
assert.ok(html.includes('Sergeant Robinson'));
assert.ok(html.includes('Approved working windows'));
assert.equal((html.match(/type="datetime-local"/g)||[]).length,2);
assert.ok(html.includes('Save availability'));
assert.ok(html.includes('Return now'));
assert.ok(!html.includes('href="/AdminAbsenceCoverage"'));
assert.ok(!html.includes('Select an officer to manage'));
console.log('PASS: selected officer shows absence dates, save/return controls, automatic cover and weekly availability inline; no separate coverage link');
})().catch(error=>{console.error(error);process.exitCode=1});
