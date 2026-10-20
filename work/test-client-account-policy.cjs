const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const policy={};vm.runInNewContext(compile(fs.readFileSync('base44/functions/getAdminUserAccounts/clientAccountPolicy.ts','utf8')),{exports:policy});
const client={id:'client',email:'client@test',role:'user',additional_roles:['client'],rank:'Client',unit_number:'650',badge_number:'4006',platoon:'A',employment_status:'active',assigned_locations:['Armstrong'],first_name:'Client',last_name:'Example'};
const officer={id:'officer',email:'officer@test',role:'user',additional_roles:['officer','cad_access'],rank:'Lieutenant',unit_number:'400',platoon:'A',employment_status:'active',hourly_rate:24};
const db=[structuredClone(client),structuredClone(officer)];
let handler,actor={id:'employee',role:'user',additional_roles:['officer']},writes=0;
vm.runInNewContext(compile(fs.readFileSync('base44/functions/getAdminUserAccounts/entry.ts','utf8').replace(/^import .*;\n/gm,'')),{
 Deno:{serve:fn=>handler=fn},Response,console,...policy,
 createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:{User:{list:async()=>structuredClone(db),update:async(id,patch)=>{writes++;Object.assign(db.find(p=>p.id===id),patch);}}}}}),
});
(async()=>{
 let response=await handler(new Request('https://test'));assert.equal(response.status,403);assert.equal(writes,0);
 actor={id:'admin',role:'admin'};
 response=await handler(new Request('https://test'));let result=await response.json();
 assert.equal(response.status,200);assert.equal(result.users.length,1);assert.equal(result.users[0].id,'officer');
 for(const field of ['unit_number','badge_number','platoon','supervisor_id','division'])assert.equal(db[0][field],'',field);
 assert.equal(db[0].employment_status,'not_employee');assert.equal(db[0].status,'Out of Service');assert.equal(db[0].is_supervisor,false);assert.equal(db[0].dispatch_role,false);
 assert.deepEqual(db[0].assigned_locations,['Armstrong'],'client property permissions are retained');
 assert.deepEqual(db[1],officer,'employee record unchanged');
 const count=writes;await handler(new Request('https://test'));assert.equal(writes,count,'migration writes once');
 assert.deepEqual(Object.keys(policy.clientOperationalPatch({...officer,additional_roles:['client','officer']})),[],'do not guess about mixed-role staff');
 const edits=fs.readFileSync('src/pages/ManageClients.jsx','utf8');
 assert(!edits.includes('client_system_admin'));assert(!edits.includes('Adds full administrative authority'));
 console.log('PASS: admin-only/idempotent client cleanup, no employee identifiers or CAD flags, property permissions retained, clients omitted from staff account API, employee records unchanged, client admin control removed.');
})().catch(error=>{console.error(error);process.exit(1);});
