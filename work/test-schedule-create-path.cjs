const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const tree=ts.createSourceFile('s.jsx',fs.readFileSync('src/pages/AdminScheduling.jsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
let check,create;
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='checkApprovedLeave')check=node.initializer.getText(tree);
 if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='createShiftMutation'){
  const obj=node.initializer.arguments[0];
  create=obj.properties.find(p=>p.name.getText(tree)==='mutationFn').initializer.getText(tree);
 }
 ts.forEachChild(node,visit);
}visit(tree);
(async()=>{
 const {approvedLeaveConflicts}=await import('../src/utils/scheduleLeave.js');
 const writes=[];let approved=[],reads=0;
 const ctx={allUsers:[{id:'j',email:'jsherrill@blackpointkjc.com',rank:'Lt Colonel',last_name:'Sherrill'}],clearBase44ReadCacheMatching:()=>{},approvedLeaveConflicts,setScheduleLeaveWarning:()=>{},console,base44:{entities:{TimeOffRequest:{filter:async query=>{reads++;assert.equal(query.status,'approved');return approved;}},Schedule:{create:async row=>{writes.push(row);return {...row,id:'test-save'};}}},functions:{invoke:async name=>{assert.notEqual(name,'getPTORequests','full PTO function must not be a save dependency');return {};}}}};
 ctx.checkApprovedLeave=vm.runInNewContext('('+check+')',ctx);
 const save=vm.runInNewContext('('+create+')',ctx);
 const row={officer_email:'jsherrill@blackpointkjc.com',shift_date:'2026-10-18',start_time:'19:00',end_time:'03:00',location:'Test fixture only'};
 const created=await save(row);assert.equal(created.id,'test-save');assert.equal(writes.length,1);assert.equal(reads,1);
 approved=[{status:'approved',requested_by_email:row.officer_email,start_date:'2026-10-18',end_date:'2026-10-19'}];
 await assert.rejects(save(row),/Lt Colonel Sherrill has approved/);
 assert.equal(writes.length,1,'conflicting leave must stop writes');
 console.log('PASS: Sherrill Oct 18 19:00 test save reaches Schedule.create without PTO backend; confirmed leave still blocks a conflicting write');
})().catch(e=>{console.error(e);process.exitCode=1});
