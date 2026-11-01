import { createClientFromRequest } from 'npm:@base44/sdk';
import { isLiveLocationHidden } from './privacy.ts';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

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

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'activate';
    const officerId = body.officer_id || user.id;
    const isSelf = officerId === user.id;

    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const authorized =
      isSelf ||
      user.role === 'admin' ||
      user.role === 'dispatch' ||
      roles.has('full_access') ||
      roles.has('supervisor') ||
      roles.has('dispatch');
    if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (!['activate', 'clear'].includes(action)) return Response.json({ error: 'Invalid action' }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const officer = (users || []).find((u: any) => u.id === officerId);
    if (!officer) return Response.json({ error: 'Officer not found' }, { status: 404 });

    const now = new Date().toISOString();

    const syncStatus = async (status: string) => {
      await base44.asServiceRole.entities.User.update(officer.id, {
        status,
        last_updated: now,
        status_since: now,
      });
      const units = await base44.asServiceRole.entities.Unit.list(undefined, 500);
      const linked = (units || []).filter((u: any) =>
        u.user_id === officer.id ||
        String(u.user_email || '').toLowerCase() === String(officer.email || '').toLowerCase()
      );
      await Promise.all(linked.map((u: any) =>
        base44.asServiceRole.entities.Unit.update(u.id, {
          status,
          last_update_at: now,
        })
      ));
    };

    if (action === 'activate') {
      const privateLocation = await isLiveLocationHidden(base44, officer);
      const loc = privateLocation ? null : body.location || null;
      const lat = loc?.lat ?? null;
      const lon = loc?.lon ?? null;
      const distressData = {
        officer_id: officer.id,
        officer_name: officer.full_name || 'Unknown Officer',
        unit_number: officer.unit_number || '???',
        rank: officer.rank || '',
        last_name: officer.last_name || String(officer.full_name || '').split(' ').pop() || '',
        latitude: lat,
        longitude: lon,
        current_latitude: lat,
        current_longitude: lon,
        location_description: (lat && lon) ? `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}` : (privateLocation ? 'Live location hidden' : officer.last_known_location || 'Location unavailable'),
        status: 'active',
        activated_at: now,
        notes: isSelf ? '' : `Triggered by dispatch (${[user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email})`,
      };
      const created = await base44.asServiceRole.entities.OfficerDistress.create(distressData);
      await base44.asServiceRole.entities.CallStatusLog.create({
        call_id: created?.id || officer.id,
        incident_type: 'Officer emergency',
        location: distressData.location_description,
        old_status: officer.status || '',
        new_status: 'Distress',
        unit_id: officer.id,
        unit_name: officer.unit_number || officer.full_name || officer.email,
        notes: distressData.notes || 'Officer emergency activated',
        latitude: lat,
        longitude: lon,
        event_key: `distress:${created?.id || officer.id}:activated`,
        event_type: 'officer_emergency',
        announcement_text: `Emergency traffic. Officer emergency activated. Unit ${officer.unit_number || 'unknown'}. All available units respond.`,
        announcement_priority: 'emergency',
        cad_number: '',
        triggering_action: 'manageOfficerDistress.activate',
        audio_enabled: true,
        sensitive: true,
      });
      await syncStatus('Distress');
      return Response.json({ success: true, status: 'Distress', distress_id: created?.id || null });
    }

    // clear
    const allAlerts = await base44.asServiceRole.entities.OfficerDistress.filter({ officer_id: officer.id }, '-activated_at', 20);
    const open = (allAlerts || []).filter((a: any) => a.status !== 'cleared');
    for (const a of open) {
      await base44.asServiceRole.entities.OfficerDistress.update(a.id, {
        status: 'cleared',
        cleared_at: now,
        cleared_by: user.id,
        cleared_by_name: user.full_name,
        notes: isSelf ? 'Officer cancelled' : 'Cleared by dispatch',
      });
    }
    await syncStatus('Available');
    return Response.json({ success: true, status: 'Available', cleared: open.length });
  } catch (error) {
    console.error('manageOfficerDistress failed', error);
    return Response.json({ error: error?.message || 'Unable to update distress' }, { status: 500 });
  }
});