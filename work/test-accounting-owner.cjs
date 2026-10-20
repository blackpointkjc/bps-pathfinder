const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const OWNER='6a72bbee2842d6338cbae513';
const actors=[null,{id:'other-admin',role:'admin',additional_roles:['full_access','accounting']},{id:'hr',role:'user',additional_roles:['hr','accounting']},{id:'lookalike',email:'kavonhiers@team-hsg.com',rank:'Colonel',unit_number:'100',role:'admin'}];
function load(name,actor){
 let handler,reads=0;
 const entity=new Proxy({},{get:()=>new Proxy({},{get:(_,method)=>async()=>{reads++;return method==='list'||method==='filter'?[]:{};}})});
 const source=fs.readFileSync('base44/functions/'+name+'/entry.ts','utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},Date,Intl,Set,Map,Response,console,setTimeout,Deno:{serve:fn=>handler=fn},createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:entity}})});
 return {handler,reads:()=>reads};
}
(async()=>{
 const names=['getAccountingData','manageAccountingRecords','manageAccountingPayroll','manageAccountingExpenses','updatePayrollConfig','getPayrollPTOUsage','maintainRollingPayrollPeriods','generateScheduledPayroll','generateWeeklyInvoices','applyInvoiceLateFees'];
 for(const name of names){
  for(const actor of actors){
   const api=load(name,actor);
   const response=await api.handler(new Request('https://test',{method:'POST',body:JSON.stringify({force:true,manual:true,action:'run_now',period_id:'test'})}));
   assert([401,403].includes(response.status),name+' denies '+actor?.id+': '+response.status);
   assert.equal(api.reads(),0,name+' denies before financial reads/writes');
  }
 }
 let api=load('getAccountingData',{id:OWNER,role:'user',additional_roles:[]});
 const response=await api.handler(new Request('https://test',{method:'POST',body:JSON.stringify({scope:'invoices'})}));
 assert.equal(response.status,200);assert(api.reads()>0,'owner identity is sufficient');
 const frontend={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/accountingAccess.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:frontend});
 for(const actor of actors)assert.equal(frontend.canAccessAccounting(actor),false);
 assert(frontend.canAccessAccounting({id:OWNER}));
 for(const name of ['PayrollEntry','W2Form','PayrollConfig','CompanyExpense','RecurringCompanyBill','Invoice']){
  const schema=JSON.parse(fs.readFileSync('base44/entities/'+name+'.jsonc'));
  for(const action of ['create','update','delete'])assert.equal(schema.rls[action].user_condition.id,OWNER,name+' '+action);
  const read=JSON.stringify(schema.rls.read);assert(!read.includes('"admin"'));assert(read.includes(OWNER));
 }
 console.log('PASS: 10 actual financial handlers deny other admins/full-access/HR/accounting and lookalike identities before data access; owner permitted; direct financial RLS and UI policy restricted.');
})().catch(e=>{console.error(e);process.exit(1)});
