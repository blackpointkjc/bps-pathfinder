import {isScheduledPlatformJob} from './scheduledPlatformJob.ts';
const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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

const ARCHIVE_AFTER_MS = 60 * 60 * 1000;
const ARCHIVE_SCAN_LIMIT = 1000;
const ARCHIVE_BATCH_LIMIT = 20;

function callTimestamp(call: any) {
    const created = call?.created_date ? new Date(call.created_date).getTime() : 0;
    const received = call?.time_received ? new Date(call.time_received).getTime() : 0;
    if (Number.isFinite(received) && received > 0 && Number.isFinite(created) && created > 0 && Math.abs(received - created) < 24 * 60 * 60 * 1000) return received;
    if (Number.isFinite(created) && created > 0) return created;
    return Number.isFinite(received) && received > 0 ? received : 0;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
        const body=await req.json().catch(()=>({}));
        const rawUser=await base44.auth.me().catch(()=>null);
        const scheduled=isScheduledPlatformJob(rawUser,body);
        const user=__limitFullAccess(__portalAppIdentity(rawUser));
        if(!scheduled){
          if(!user||user.is_service||!await __portalLoginIsCurrent(req,base44,user))return Response.json({error:'Current authorized portal session required'},{status:401});
          if((user.additional_roles||[]).some(r=>['visitor','client','student'].includes(String(r).toLowerCase()))||['visitor','client','student'].includes(String(user.user_type||'').toLowerCase()))return Response.json({error:'Operational access required'},{status:403});
        }
        const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        // Any authenticated operational user may trigger the archive pass. The
        // actual archive/delete writes use service role, so normal users never
        // receive direct write access to DispatchCall or CallHistory.
        const authorized = scheduled || user.role === 'admin' || user.role === 'dispatch' || user.role === 'supervisor' || user.role === 'officer' || roles.has('full_access') || roles.has('cad_access') || roles.has('dispatch') || roles.has('supervisor') || roles.has('officer');
        if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });

        // Scan a broad oldest-first window. The old newest-only scan could miss
        // stale calls whenever the active table had enough newer rows in front of them.
        const activeCalls = await base44.asServiceRole.entities.DispatchCall.list('created_date', ARCHIVE_SCAN_LIMIT);

        const now = new Date();
        let archivedCount = 0, deferredCount=0, failedCount=0;

        const archiveCandidates = (activeCalls || [])
            .map(call => ({ call, stamp: callTimestamp(call) }))
            .filter(item => item.stamp > 0 && now.getTime() - item.stamp >= ARCHIVE_AFTER_MS)
            // Website requests are not external feed events. Never archive
            // open/unassigned Help Me calls on the one-hour timer.
            .filter(item => {
              const c=item.call,terminal=['cleared','cancelled','canceled','closed','completed','resolved'].includes(String(c.status||'').toLowerCase())||c.manual_dismissed===true||!!c.time_cleared;
              // Only external feed events expire by age. Internal/website requests
              // remain active until explicit clearance, even when unassigned.
              const external=/^(grac_|pulsepoint)/i.test(String(c.source_channel||''))||/^pulsepoint:/i.test(String(c.external_call_id||''));
              return terminal||(external&&c.source!=='public_helpme');
            })
            .filter(({call})=>!(call.assigned_units||[]).some((id:any)=>String(id).trim()))
            .sort((a, b) => a.stamp - b.stamp)
            .slice(0, ARCHIVE_BATCH_LIMIT);

        if(body.dry_run===true)return Response.json({success:true,dry_run:true,scanned:activeCalls.length,candidates:archiveCandidates.length});
        for (const { call, stamp } of archiveCandidates) {
            const ageMs = now.getTime() - stamp;

            // Website disappearance or the one-hour timer must never remove an
            // officer's assigned call. Only explicit Pathfinder clearance ends it.
            if ((call.assigned_units || []).some((id:any) => String(id).trim())) continue;
            let assignments: any[];
            try {
                assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: String(call.id) }, '-assigned_at', 1000);
            } catch (error:any) {
                deferredCount++;console.warn('Deferring archive until assignments can be verified', error?.message || error);
                continue;
            }
            if (assignments.some((row:any)=>!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()))) continue;

            if (ageMs >= ARCHIVE_AFTER_MS) {
                try {
                    const fresh=await base44.asServiceRole.entities.DispatchCall.get(call.id);
                    if(!fresh||fresh.updated_date!==call.updated_date||(fresh.assigned_units||[]).some((id:any)=>String(id).trim())){deferredCount++;continue;}
                    const finalAssignments=await base44.asServiceRole.entities.CallAssignment.filter({call_id:String(call.id)},'-assigned_at',1000);
                    if(finalAssignments.some((r:any)=>!['cleared','cancelled','canceled'].includes(String(r.status||'').toLowerCase()))){deferredCount++;continue;}
                    const existing = await base44.asServiceRole.entities.CallHistory.filter({ original_call_id: call.id }, '-archived_date', 1);
                    const snapshot = {
                            original_call_id: call.id,
                            call_id: call.call_id,
                            bps_reference: call.bps_reference || (call.call_id && call.call_id.startsWith('BPS-') ? call.call_id : ''),
                            agency_cad_number: call.agency_cad_number || '',
                            external_call_id: call.external_call_id,
                            time_received: call.time_received || call.created_date,
                            incident: call.incident,
                            location: call.location,
                            cross_street: call.cross_street,
                            agency: call.agency || 'BPS',
                            status: call.status || 'Completed',
                            priority: call.priority,
                            zone: call.zone,
                            latitude: call.latitude,
                            longitude: call.longitude,
                            description: call.description,
                            disposition: call.disposition,
                            ai_summary: call.ai_summary,
                            assigned_units: call.assigned_units || [],
                            caller_name: call.caller_name,
                            caller_phone: call.caller_phone,
                            hazards: call.hazards,
                            time_dispatched: call.time_dispatched,
                            time_enroute: call.time_enroute,
                            time_on_scene: call.time_on_scene,
                            time_cleared: call.time_cleared,
                            time_closed: call.time_closed,
                            source: call.source,
                            archived_date: now.toISOString()
                    };
                    if (!existing?.length) await base44.asServiceRole.entities.CallHistory.create(snapshot);
                    else {
                        // Recover fields missing from an earlier archival attempt before
                        // deleting the last live record. Never replace a saved value with blank.
                        const patch=Object.fromEntries(Object.entries(snapshot).filter(([key,value])=>key!=='archived_date'&&value!==null&&value!==undefined&&value!==''&&(existing[0][key]===null||existing[0][key]===undefined||existing[0][key]==='')));
                        if(Object.keys(patch).length)await base44.asServiceRole.entities.CallHistory.update(existing[0].id,patch);
                    }

                    // Once a call leaves the active CAD queue, any open property alert
                    // for that same call must close with it. Otherwise the shell can keep
                    // presenting a property alert for a call that is already in history.
                    const openPropertyAlerts = await base44.asServiceRole.entities.PropertyAlert.filter({ callId: call.id, acknowledged: false }, '-created_date', 50).catch(() => []);
                    for (const alert of openPropertyAlerts || []) {
                        await base44.asServiceRole.entities.PropertyAlert.update(alert.id, {
                            acknowledged: true,
                            acknowledgedAt: now.toISOString(),
                            closed_with_call: true,
                            callTime: alert.callTime || call.time_received || call.created_date,
                            time_received: alert.time_received || call.time_received || call.created_date,
                        }).catch(() => null);
                    }

                    // The complete copy above remains available for incident-report linkage.
                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    archivedCount++;
                    console.log(`Archived: ${call.incident} @ ${call.location} (age: ${Math.round(ageMs / 60000)}min)`);
                } catch (error: any) {
                    failedCount++;console.error('Failed to archive call', error?.message||error);
                }
            }
        }

        return Response.json({
            success: failedCount===0,
            archivedCount, deferredCount, failedCount,
            scanned: Array.isArray(activeCalls) ? activeCalls.length : 0,
            candidates: archiveCandidates.length,
            message: `Archived ${archivedCount} calls at 1 hour elapsed`
        },{status:failedCount?503:200});

    } catch (error: any) {
        console.error('Error archiving old calls:', error);
        return Response.json({
            error: 'Failed to archive calls',
            details: error.message
        }, { status: 500 });
    }
});