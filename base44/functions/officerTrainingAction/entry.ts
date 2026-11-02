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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__portalAppIdentity);
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || '');
    const assignmentId = String(body.assignment_id || '');
    if (!assignmentId) return Response.json({ error: 'Assignment is required' }, { status: 400 });

    const assignments = await base44.asServiceRole.entities.TrainingAssignment.list('-assigned_date', 5000);
    const assignment = (assignments || []).find((entry: any) => String(entry.id) === assignmentId);
    if (!assignment) return Response.json({ error: 'Training assignment not found' }, { status: 404 });
    if (String(assignment.officer_email || '').toLowerCase() !== String(user.email).toLowerCase()) {
      return Response.json({ error: 'You can only update your own training assignments' }, { status: 403 });
    }

    if (action === 'complete_module') {
      await base44.asServiceRole.entities.TrainingAssignment.update(assignment.id, { status: 'approved' });
      return Response.json({ success: true });
    }

    if (action === 'submit') {
      const form = body.form || {};
      const submissions = await base44.asServiceRole.entities.TrainingSubmission.list('-submission_date', 5000);
      const version = (submissions || []).filter((entry: any) => entry.assignment_id === assignment.id && String(entry.officer_email || '').toLowerCase() === String(user.email).toLowerCase()).length + 1;
      const submission = await base44.asServiceRole.entities.TrainingSubmission.create({
        assignment_id: assignment.id,
        training_name: assignment.training_name,
        officer_email: user.email,
        officer_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
        submission_date: new Date().toISOString(),
        photo_url_1: form.photo_url_1 || '',
        photo_url_2: form.photo_url_2 || '',
        document_url: form.document_url || '',
        document_name: form.document_name || '',
        certificate_number: form.certificate_number || '',
        issue_date: form.issue_date || null,
        expiration_date: form.expiration_date || null,
        officer_notes: form.officer_notes || '',
        status: 'pending_review',
        version,
      });
      await base44.asServiceRole.entities.TrainingAssignment.update(assignment.id, { status: 'pending_review' });
      return Response.json({ success: true, submission });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('officerTrainingAction failed', error);
    return Response.json({ error: error?.message || 'Unable to update training' }, { status: 500 });
  }
});
