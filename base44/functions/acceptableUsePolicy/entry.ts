import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const VERSION = '2026-10-31-v1';
const TITLE = 'Pathfinder Corporate Systems & Internet Acceptable Use Policy';
const unpack = (x: any) => Array.isArray(x) ? x : (Array.isArray(x?.items) ? x.items : []);
const nameOf = (u: any) => [u.first_name,u.last_name].filter(Boolean).join(' ').trim() || u.full_name || u.email || 'Employee';

export default async function(req: Request): Promise<Response> {
  try {
    const api = createClientFromRequest(req);
    const caller = await api.auth.me().catch(() => null);
    if (!caller?.id || !caller?.email) return Response.json({error:'Authentication required'},{status:401});
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'status');
    if (action === 'report') {
      const current = await api.asServiceRole.entities.User.get(caller.id);
      if (!current || String(current.role).toLowerCase() !== 'admin') return Response.json({error:'Admin role required'},{status:403});
      const rows = unpack(await api.asServiceRole.entities.AcceptableUseAcknowledgment.list('-accepted_at', 1500));
      return Response.json({policy_version: VERSION, accepted_count: rows.filter(row=>row.policy_version===VERSION).length, records: rows.map(row=>({
        user_id:row.user_id,user_email:row.user_email,user_name:row.user_name,
        signed_name:row.signed_name, accepted_at:row.accepted_at,policy_version:row.policy_version,status:row.status
      }))},{headers:{'Cache-Control':'no-store'}});
    }
    const profile = await api.asServiceRole.entities.User.get(caller.id);
    if (!profile || String(profile.email || '').toLowerCase() !== String(caller.email).toLowerCase()) return Response.json({error:'Unable to confirm current account'},{status:403});
    const existing = unpack(await api.asServiceRole.entities.AcceptableUseAcknowledgment.filter({user_id:profile.id,policy_version:VERSION},{limit:5})).find(x=>x.status==='approved');
    if (action === 'status') {
      return Response.json({policy_version:VERSION,policy_title:TITLE,accepted:Boolean(existing), accepted_at:existing?.accepted_at || null, user_name:nameOf(profile)},{headers:{'Cache-Control':'no-store'}});
    }
    if (action !== 'accept') return Response.json({error:'Unsupported action'},{status:400});
    if (existing) return Response.json({accepted:true,accepted_at:existing.accepted_at,policy_version:VERSION},{headers:{'Cache-Control':'no-store'}});
    if (body.confirmed !== true || body.policy_version !== VERSION) return Response.json({error:'Review and explicitly accept the current policy version.'},{status:400});
    const signature=String(body.signature || '').trim().replace(/\s+/g,' ').slice(0,100);
    if (signature.length < 3 || !/[a-z]/i.test(signature)) return Response.json({error:'Enter your full name to sign the acknowledgment.'},{status:400});
    const receipt=await api.asServiceRole.entities.AcceptableUseAcknowledgment.create({
      user_id:profile.id,user_email:profile.email,user_name:nameOf(profile),
      policy_version:VERSION,policy_title:TITLE,signed_name:signature,
      accepted_at:new Date().toISOString(),status:'approved',
      source:'first-login-required-acknowledgment',
      user_agent:String(req.headers.get('user-agent') || '').slice(0,180)
    });
    return Response.json({accepted:true,accepted_at:receipt.accepted_at,policy_version:VERSION},{headers:{'Cache-Control':'no-store'}});
  } catch(error: any) {
    return Response.json({error:'Unable to verify or record acceptable-use approval.',detail:String(error?.message||'').slice(0,130)},{status:500});
  }
}