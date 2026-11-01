import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<30*60*1000;
 }catch{return false;}
}

Deno.serve(async req => {
  try {
    const api = createClientFromRequest(req);
    const me = await api.auth.me();
    if (!me?.id || !me?.email) return Response.json({ error: 'Sign-in required' }, { status: 401 });
 if(!await __portalLoginIsCurrent(req,api,me))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    const roles = new Set((me.additional_roles || []).map((role:unknown) => String(role).toLowerCase()));
    if (me.role === 'admin' || roles.size || me.rank === 'Student') return Response.json({ success: true, student_pending: false });
    const email = String(me.email).trim().toLowerCase();
    const rows = await api.asServiceRole.entities.StudentEnrollment.filter({ email }, '-created_date', 3);
    const enrollment = (rows || []).find((item:any) => ['invited','profile_submitted'].includes(item.status));
    if (!enrollment) return Response.json({ success: true, student_pending: false });
    // Preserve the original identity and permissions; attach only student-pending metadata.
    const profile = {
      rank: 'Student Registration Pending',
      first_name: me.first_name || enrollment.first_name,
      last_name: me.last_name || enrollment.last_name,
      date_of_birth: me.date_of_birth || enrollment.date_of_birth,
    };
    await api.asServiceRole.entities.User.update(me.id, profile);
    if (enrollment.user_id !== me.id) {
      await api.asServiceRole.entities.StudentEnrollment.update(enrollment.id, { user_id: me.id });
    }
    return Response.json({ success: true, student_pending: true, ...profile });
  } catch(error) {
    console.error('Unable to resolve student enrollment', error?.message || error);
    return Response.json({ error: 'Student enrollment verification temporarily unavailable' }, { status: 503 });
  }
});