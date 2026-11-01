import {createClientFromRequest} from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T00:00:00.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<30*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
const lower=(v:any)=>String(v||'').trim().toLowerCase();
Deno.serve(async req=>{
  try{
    const base44=createClientFromRequest(req),actor=await base44.auth.me().then(__limitFullAccess).catch(()=>null);
 const __portalCaller=await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
 let __portalService=false;if(!__portalCaller&&req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
 if((!__portalCaller&&!__portalService)||(__portalCaller&&((__portalCaller.additional_roles||[]).includes('visitor')||__portalCaller.disabled||__portalCaller.termination_date||String(__portalCaller.employment_status||'').toLowerCase()==='terminated'||(!__portalCaller.is_service&&__portalCaller.role!=='admin'&&!(__portalCaller.additional_roles||[]).length&&!['investigator','reviewer'].includes(__portalCaller.ps_role)))))return Response.json({error:'Approved portal access required'},{status:403});
 base44.auth.me=async()=>__portalCaller;

    if(!actor)return Response.json({error:'Sign in required'},{status:401});
    const roles=new Set((actor.additional_roles||[]).map(lower));
    const commandRank=['corporal','first sergeant','sergeant','sgt','lieutenant','lt','lt colonel','lieutenant colonel','captain','major','colonel'].includes(lower(actor.rank).replace(/[.]/g,''));
    if(!['admin','dispatch'].includes(lower(actor.role))&&!actor.dispatch_role&&!actor.is_supervisor&&!commandRank&&!['full_access','supervisor','cad_access','dispatch'].some(x=>roles.has(x)))return Response.json({error:'Only authorized dispatch/command personnel can hold new calls'},{status:403});
    const body=await req.json().catch(()=>({})),officerId=String(body.officer_id||'');
    if(!officerId||typeof body.hold!=='boolean')return Response.json({error:'Select officer and hold/resume action'},{status:400});
    // Dispatch boards can pass a User, Unit, or ActiveOfficer ID. Resolve
    // to the canonical User before setting the hold rather than rejecting
    // valid officers because the board uses an operational record ID.
    let officer=await base44.asServiceRole.entities.User.get(officerId).catch(()=>null);
    if(!officer){
      const unit=await base44.asServiceRole.entities.Unit.get(officerId).catch(()=>null);
      const active=unit?null:await base44.asServiceRole.entities.ActiveOfficer.get(officerId).catch(()=>null);
      const userId=String(unit?.user_id||active?.user_id||'');
      if(userId)officer=await base44.asServiceRole.entities.User.get(userId).catch(()=>null);
      if(!officer){
        const email=lower(unit?.user_email||active?.officer_email);
        if(email){const matches=await base44.asServiceRole.entities.User.filter({email},'-created_date',2).catch(()=>[]);if(matches.length===1)officer=matches[0];}
      }
    }
    if(!officer?.id)return Response.json({error:'Officer account not found for this unit. Verify the unit-to-user link.'},{status:404});
    const who=[officer.rank,officer.last_name].filter(Boolean).join(' ')||'Officer';
    const reason=String(body.reason||'').trim().slice(0,400),now=new Date().toISOString();
    const updated=await base44.asServiceRole.entities.User.update(officer.id,{dispatch_hold_new_calls:body.hold,dispatch_hold_reason:body.hold?reason:'',dispatch_hold_at:now,dispatch_hold_by:actor.email||''});
    await base44.asServiceRole.entities.AuditLog.create({entity_type:'User',entity_id:officer.id,action:'status_change',actor_id:actor.id,actor_name:actor.email||'',timestamp:now,description:`${who}: ${body.hold?'New CAD assignments held':'New CAD assignments resumed'}${reason?' — '+reason:''}`}).catch(()=>null);
    return Response.json({success:true,hold:body.hold,officer:who,message:`${who} ${body.hold?'cannot receive NEW calls until dispatch clears the hold':'can receive additional calls. Existing assignments retained.'}`});
  }catch(error:any){return Response.json({error:error?.message||'Dispatch availability update failed'},{status:500});}
});
