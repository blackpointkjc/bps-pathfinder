const __portalAppIdentity=(user:any)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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

const ALLOWED_ENTITIES = new Set([
  'TrainingClass', 'TrainingAttendee', 'TrainingCertificate', 'TrainingSchoolSettings',
  'TrainingModule', 'TrainingRequirement', 'TrainingAssignment', 'TrainingSubmission', 'CertificationTodo'
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('trainer') && !roles.has('full_access')) {
      return Response.json({ error: 'Trainer access required' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const entity = String(body.entity || '');
    const action = String(body.action || '');
    if (!ALLOWED_ENTITIES.has(entity)) return Response.json({ error: 'Unsupported training entity' }, { status: 400 });

    const api = (base44.asServiceRole.entities as any)[entity];
    if (!api) return Response.json({ error: 'Training entity unavailable' }, { status: 400 });

    if (action === 'create') {
      const record = await api.create(body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      const record = await api.update(body.id, body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      await api.delete(body.id);
      return Response.json({ success: true });
    }
    if (action === 'bulkCreate') {
      const records = await api.bulkCreate(body.data || []);
      return Response.json({ success: true, records });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageTrainingRecords failed', error);
    return Response.json({ error: error?.message || 'Unable to update training records' }, { status: 500 });
  }
});
