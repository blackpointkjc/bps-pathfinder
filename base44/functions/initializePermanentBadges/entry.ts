import {createClientFromRequest} from 'npm:@base44/sdk';
const RESERVED = [
 {id:'6a72bbee2842d6338cbae513',badge:'4001',last:'hiers'},
 {id:'6a406e7f5968db44ad597d61',badge:'4002',last:'sherrill'},
 {id:'6ac889ba810b2036456a6d24',badge:'4003',last:'jones'},
 {id:'6ad1a4589148f235c2c15623',badge:'4004',last:'robinson'},
 {id:'6ad1ab9d4b2e4e06c9916653',badge:'4005',last:'cook'},
];
Deno.serve(async req => {
 try {
  const api=createClientFromRequest(req);
  const me=await api.auth.me();
  if (!me || (me.role!=='admin' && !(me.additional_roles || []).includes('full_access'))) return Response.json({error:'System administrator required'},{status:403});
  const users=await api.asServiceRole.entities.User.list(undefined,1000);
  const issues=[];
  for(const entry of RESERVED){
   const user=(users||[]).find((u:any)=>u.id===entry.id);
   if(!user || String(user.last_name || '').trim().toLowerCase() !== entry.last) issues.push(`Personnel identity mismatch for ${entry.badge}`);
   if((users||[]).some((u:any)=>u.id!==entry.id && String(u.badge_number || '').trim()===entry.badge)) issues.push(`Badge ${entry.badge} already belongs to another record`);
  }
  if(issues.length) return Response.json({error:'Badge reconciliation stopped to prevent a conflict',issues},{status:409});
  const updated=[];
  for(const entry of RESERVED){
   const user=(users||[]).find((u:any)=>u.id===entry.id);
   if(String(user.badge_number||'').trim()!==entry.badge){
    await api.asServiceRole.entities.User.update(entry.id,{badge_number:entry.badge});
   }
   const reread=await api.asServiceRole.entities.User.get(entry.id);
   if(String(reread?.badge_number||'').trim()!==entry.badge) throw new Error(`Badge ${entry.badge} was not confirmed saved`);
   updated.push({id:entry.id,badge:entry.badge});
  }
  return Response.json({success:true,updated});
 }catch(error:any){return Response.json({error:error?.message || 'Badge reconciliation failed'},{status:500});}
});
