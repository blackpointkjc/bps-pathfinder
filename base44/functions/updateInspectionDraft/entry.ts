import {linkSubmittedReport} from './reportLink.ts';
import {verifiedPS} from './psVerification.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||user.termination_date||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const ALLOWED_FIELDS = [
  'inspection_date', 'officer_inspected', 'officer_email', 'location',
  'uniform_appearance', 'equipment_condition', 'post_knowledge',
  'professionalism', 'observations', 'areas_of_concern', 'commendations',
  'follow_up_required', 'inspection_result'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

if(!await verifiedPS(base44,user,req))return Response.json({error:'Additional email verification required for Professional Standards',code:'PS_VERIFICATION_REQUIRED'},{status:403});
await base44.asServiceRole.entities.PSAudit.create({actor_id:user.id,actor_name:user.email,action:'legacy_workflow_access',details:'updateInspectionDraft'});
    const roles = new Set((user.additional_roles || []).map((role) => String(role).toLowerCase()));
    const rank = String(user.rank || '').trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');
    const supervisor = user.ps_role === 'reviewer' || user.role === 'admin' || user.is_supervisor === true || roles.has('supervisor') || roles.has('full_access') || ['corporal','first sergeant','sergeant','lieutenant','lt','lt colonel','lt col','lieutenant colonel','captain','major','colonel'].includes(rank);
    if (!supervisor) return Response.json({ error: 'Supervisor access required' }, { status: 403 });

    const { inspection_id, inspection } = await req.json();
    if (!inspection_id || !inspection) {
      return Response.json({ error: 'Inspection ID and form data are required' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.InspectionReport.get(inspection_id);
    if (!existing) return Response.json({ error: 'Inspection draft not found' }, { status: 404 });
    if (existing.inspection_result) {
      return Response.json({ error: 'Only inspection drafts can be completed here' }, { status: 409 });
    }

    const isAdmin = user.ps_role === 'reviewer' || user.role === 'admin' || roles.has('full_access');
    if(!isAdmin){
      const platoon=String(user.oversight_platoon||user.platoon||'').trim().toLowerCase();
      const candidates=await base44.asServiceRole.entities.User.filter({email:existing.officer_email},'-updated_date',1).catch(()=>[]);
      const officer=candidates[0];
      const n=v=>String(v||'').trim().toLowerCase();
      const chain=['colonel','lt colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'];
      const level=(value:any)=>{const raw=n(value).replace(/[.]/g,'');return chain.indexOf(raw==='lieutenant colonel'||raw==='lt col'?'lt colonel':raw);};
      const senior=['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','lt','lt col'].includes(n(user.rank));
      if(level(user.rank)<0 || level(officer?.rank)<=level(user.rank))return Response.json({error:'Inspection target must be a lower-ranking officer'},{status:403});
      if(!officer||(!platoon || platoon==='command')||n(officer.platoon)!==platoon
        ||!n(user.division)||!n(user.subdivision)||n(officer.division)!==n(user.division)||n(officer.subdivision)!==n(user.subdivision)
        ||(!senior&&(!n(user.substation)||n(officer.substation)!==n(user.substation))))
        return Response.json({error:'Inspection is outside your assigned platoon or operational area'},{status:403});
      if(inspection.officer_email&&n(inspection.officer_email)!==n(existing.officer_email))
        return Response.json({error:'Inspection officer cannot be changed by this supervisor'},{status:403});
    }
    const isOwner = existing.created_by_id === user.id || existing.created_by === user.email;
    let isAssignedSupervisor = false;
    const siteCheckId = String(existing.observations || '').match(/Site check record ID:\s*([^\s]+)/)?.[1];
    if (siteCheckId) {
      const siteCheck = await base44.asServiceRole.entities.SupervisorSiteCheck.get(siteCheckId).catch(() => null);
      isAssignedSupervisor = siteCheck?.supervisor_email?.toLowerCase() === user.email?.toLowerCase();
    }

    if (!isAdmin && !isOwner && !isAssignedSupervisor) {
      return Response.json({ error: 'This inspection draft belongs to another supervisor' }, { status: 403 });
    }

    const clean = {};
    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(inspection, field)) clean[field] = inspection[field];
    }
    if (!clean.inspection_result || !['pass', 'fail'].includes(clean.inspection_result)) {
      return Response.json({ error: 'Select PASS or FAIL before completing the draft' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.InspectionReport.update(inspection_id, clean);
    const receipt=await linkSubmittedReport(base44.asServiceRole.entities,user,'InspectionReport',{...existing,...clean,...updated,id:inspection_id});
    return Response.json({ success: true, inspection: updated,receipt });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to update inspection draft' }, { status: 500 });
  }
});
