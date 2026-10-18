import {createClientFromRequest} from 'npm:@base44/sdk';
const lower=(v:any)=>String(v||'').trim().toLowerCase();
Deno.serve(async req=>{
  try{
    const base44=createClientFromRequest(req),actor=await base44.auth.me().catch(()=>null);
    if(!actor)return Response.json({error:'Sign in required'},{status:401});
    const roles=new Set((actor.additional_roles||[]).map(lower));
    const commandRank=['corporal','first sergeant','sergeant','sgt','lieutenant','lt','lt colonel','lieutenant colonel','captain','major','colonel'].includes(lower(actor.rank).replace(/[.]/g,''));
    if(!['admin','dispatch'].includes(lower(actor.role))&&!actor.dispatch_role&&!actor.is_supervisor&&!commandRank&&!['full_access','supervisor','cad_access','dispatch'].some(x=>roles.has(x)))return Response.json({error:'Only authorized dispatch/command personnel can hold new calls'},{status:403});
    const body=await req.json().catch(()=>({})),officerId=String(body.officer_id||'');
    if(!officerId||typeof body.hold!=='boolean')return Response.json({error:'Select officer and hold/resume action'},{status:400});
    const officer=await base44.asServiceRole.entities.User.get(officerId).catch(()=>null);
    if(!officer)return Response.json({error:'Officer not found'},{status:404});
    const who=[officer.rank,officer.last_name].filter(Boolean).join(' ')||'Officer';
    const reason=String(body.reason||'').trim().slice(0,400),now=new Date().toISOString();
    const updated=await base44.asServiceRole.entities.User.update(officerId,{dispatch_hold_new_calls:body.hold,dispatch_hold_reason:body.hold?reason:'',dispatch_hold_at:now,dispatch_hold_by:actor.email||''});
    await base44.asServiceRole.entities.AuditLog.create({entity_type:'User',entity_id:officerId,action:'status_change',actor_id:actor.id,actor_name:actor.email||'',timestamp:now,description:`${who}: ${body.hold?'New CAD assignments held':'New CAD assignments resumed'}${reason?' — '+reason:''}`}).catch(()=>null);
    return Response.json({success:true,hold:body.hold,officer:who,message:`${who} ${body.hold?'cannot receive NEW calls until dispatch clears the hold':'can receive additional calls. Existing assignments retained.'}`});
  }catch(error:any){return Response.json({error:error?.message||'Dispatch availability update failed'},{status:500});}
});
