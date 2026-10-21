import { createClientFromRequest } from 'npm:@base44/sdk';
import { balancePlan,rosterVersion } from './plan.ts';
import { notifyPlatoonChange } from './notifyPlatoonChange.ts';
Deno.serve(async req=>{
 try {
 const client=createClientFromRequest(req),me=await client.auth.me();
 if(!me)return Response.json({error:'Unauthorized'},{status:401});
 if(me.role!=='admin'&&!(me.additional_roles||[]).includes('full_access'))return Response.json({error:'Administrator access required'},{status:403});
 const {action='preview',version}=await req.json();
 if(!['preview','apply'].includes(action))return Response.json({error:'Invalid action'},{status:400});
 const entities=client.asServiceRole.entities;
 const users=await entities.User.list('id',5000);
 if(users.length>=5000)return Response.json({error:'Roster too large for safe balancing'},{status:409});
 const plan=balancePlan(users),currentVersion=await rosterVersion(users);
 if(action==='preview')return Response.json({...plan,version:currentVersion});
 if(!version||version!==currentVersion)return Response.json({error:'Roster changed since preview. Generate a fresh preview.'},{status:409});
 if(plan.warnings.length)return Response.json({error:'Resolve missing command coverage before applying.',warnings:plan.warnings},{status:409});
 const applied=[],failed=[];
 for(const change of plan.changes){
  let saved=false;
  try {
   const before=await entities.User.get(change.id);
   const original=users.find(p=>p.id===change.id);
   if(before.updated_date!==original.updated_date)throw new Error('Officer changed during apply. Preview again.');
   await entities.User.update(change.id,change.updates);saved=true;
   const after=await entities.User.get(change.id);
   if(Object.entries(change.updates).some(([k,v])=>String(after[k]||'')!==String(v)))throw new Error('Assignment persistence could not be verified');
   await notifyPlatoonChange(entities,before,after);
   applied.push(change.id);
  }catch(error){failed.push({id:change.id,assignment_saved:saved,error:error.message});break;}
 }
 return Response.json({success:!failed.length,applied,failed,remaining:plan.changes.length-applied.length-failed.length,...(failed.length?{error:'Balance stopped after a failure. Review saved assignments and notification status before generating another preview.'}:{})});
 }catch(error){return Response.json({error:error.message||'Balance failed'},{status:500});}
});
