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

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

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

    const user = await base44.auth.me().then(__limitFullAccess).catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = lower(user.role) === 'admin' || roles.has('trainer') || roles.has('training') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Trainer or administrator access required.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = lower(body.action || 'create');

    if (action === 'delete') {
      const id = String(body.id || '').trim();
      if (!id) return Response.json({ error: 'Document id is required.' }, { status: 400 });
      await base44.asServiceRole.entities.TrainingDocument.delete(id);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'TrainingDocument',
        entity_id: id,
        action: 'delete',
        actor_id: String(user.id || user.email || ''),
        actor_name: user.full_name || user.email || 'Trainer',
        timestamp: new Date().toISOString(),
        description: 'Training document deleted from Trainer Center.',
      }).catch(() => null);
      return Response.json({ success: true, deleted: id });
    }

    if (action !== 'create') return Response.json({ error: 'Unsupported action.' }, { status: 400 });
    const data = body.data || {};
    const title = String(data.title || '').trim();
    const fileUrl = String(data.file_url || '').trim();
    const fileName = String(data.file_name || '').trim();
    if (!title || !fileUrl || !fileName) return Response.json({ error: 'Title and uploaded file are required.' }, { status: 400 });
    const category = ['site_procedures','safety','emergency','training','policies','other'].includes(lower(data.category)) ? lower(data.category) : 'other';
    const row = await base44.asServiceRole.entities.TrainingDocument.create({
      title,
      description: String(data.description || '').slice(0, 4000),
      file_url: fileUrl,
      file_name: fileName,
      category,
      locations: Array.isArray(data.locations) ? data.locations.filter(Boolean).slice(0, 250) : [],
      uploaded_date: new Date().toISOString(),
      uploaded_by: user.email || '',
    });
    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'TrainingDocument',
      entity_id: row.id,
      action: 'create',
      actor_id: String(user.id || user.email || ''),
      actor_name: user.full_name || user.email || 'Trainer',
      timestamp: new Date().toISOString(),
      description: `Training document uploaded: ${title}`,
    }).catch(() => null);
    return Response.json({ success: true, document: row });
  } catch (error) {
    console.error('manageTrainingDocuments failed', error);
    return Response.json({ error: error?.message || 'Unable to manage training documents.' }, { status: 500 });
  }
});
