const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),dates=require('date-fns');
const today=dates.format(new Date(),'yyyy-MM-dd');
const outputs={};
const compiled=ts.transpileModule(fs.readFileSync('src/components/scheduling/ApprovedLeavePanel.jsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compiled,{exports:outputs,require:name=>{
 if(name==='react'||name==='react/jsx-runtime'||name==='date-fns')return require(name);
 if(name==='@tanstack/react-query')return {useQuery:()=>({data:[{id:'yes',status:'approved',start_date:today,end_date:today,requested_by_email:'r@test',request_type:'unpaid'},{id:'pending',status:'pending',start_date:today,end_date:today,requested_by_name:'Pending Person'}]}),useQueryClient:()=>({})};
 if(name==='@/utils/previewIdentity')return {previewDisplayName:p=>p.rank+' '+p.last_name};
 return {};
}});
const html=renderToStaticMarkup(React.createElement(outputs.default,{users:[{email:'r@test',first_name:'Cameron',last_name:'Robinson',rank:'First Sergeant'}],schedules:[{officer_email:'r@test',shift_date:today}]}));
assert.ok(html.includes('First Sergeant Robinson'));
assert.ok(!html.includes('Cameron'));
assert.ok(!html.includes('Pending Person'));
assert.ok(html.includes('1 assigned shift(s) conflict'));
assert.ok(html.includes('AdminPTOApproval'));
console.log('PASS: approved leave visible in scheduling, pending leave excluded, conflict flagged, rank/last name and approval link rendered');
