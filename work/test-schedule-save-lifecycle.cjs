const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/pages/AdminScheduling.jsx','utf8');
const tree=ts.createSourceFile('schedule.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
let handler;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='handleAddShift')handler=node.initializer.getText(tree);ts.forEachChild(node,visit);}
visit(tree);assert.ok(handler);
const make=()=>{
 const changes=[],messages=[];
 let resolve,reject;
 const pending=new Promise((a,b)=>{resolve=a;reject=b;});
 const ctx={newShift:{officer_email:'jsherrill@test',is_open:false},applyToWholeWeek:true,weekShifts:[{date:'2026-10-25',start_time:'19:00',end_time:'03:00',location:'Armstrong'}],locations:[{site_name:'Armstrong',address:'Richmond'}],bulkCreateShiftsMutation:{isPending:false,mutateAsync:()=>pending},createShiftMutation:{isPending:false},setScheduleSaveError:value=>messages.push(value),setShowAddDialog:value=>changes.push(['dialog',value]),setApplyToWholeWeek:value=>changes.push(['week',value]),setWeekShifts:value=>changes.push(['rows',value]),setNewShift:value=>changes.push(['draft',value]),toast:{success:()=>{}},alert:()=>{}};
 return {fn:vm.runInNewContext('('+handler+')',ctx),changes,messages,resolve,reject,ctx};
};
(async()=>{
 const failed=make();const task=failed.fn();
 await Promise.resolve();
 assert.equal(failed.changes.length,0,'pending request must not clear form or close dialog');
 failed.reject(new Error('Leave verification service unavailable'));await task;
 assert.equal(failed.changes.length,0,'failed request must preserve all entered shifts');
 assert.ok(failed.messages.includes('Leave verification service unavailable'));
 const saved=make();const success=saved.fn();saved.resolve([{id:'saved-shift'}]);await success;
 assert.ok(saved.changes.some(([key,value])=>key==='dialog'&&value===false));
 assert.ok(saved.changes.some(([key])=>key==='draft'));
 const pair=make();pair.ctx.applyToWholeWeek=false;pair.ctx.newShift={officer_email:'jsherrill@test',partner_officer_email:'other@test',shift_date:'2026-10-25',start_time:'19:00',end_time:'03:00',location:'Armstrong'};
 const pairTask=pair.fn();await Promise.resolve();assert.equal(pair.changes.length,0);pair.reject(new Error('Save rejected'));await pairTask;assert.equal(pair.changes.length,0);
 console.log('PASS: weekly and paired forms retained while pending and on failure; form closes and resets only after confirmed success');
})().catch(error=>{console.error(error);process.exitCode=1});
