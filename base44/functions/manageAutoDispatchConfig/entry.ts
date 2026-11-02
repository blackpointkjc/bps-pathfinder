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

const normalizeRole = (value: any) => String(value || '').trim().toLowerCase();

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

    const roles = new Set((user.additional_roles || []).map(normalizeRole));
    const isAdmin = normalizeRole(user.role) === 'admin';
    const canManage = isAdmin || roles.has('full_access');
    if (!canManage) return Response.json({ error: 'Automatic dispatch administration access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = normalizeRole(body.action || 'list');

    if (action === 'list') {
      const [rows, equipment] = await Promise.all([
        base44.asServiceRole.entities.Location.list('site_name', 1000),
        base44.asServiceRole.entities.Equipment.list('equipment_type', 1000).catch(() => []),
      ]);
      const locations = (rows || []).filter((location: any) => location.active !== false && location.property_monitoring_enabled === true);
      const activeEquipment = (equipment || []).filter((item: any) => normalizeRole(item.status) !== 'retired');
      return Response.json({ success: true, locations, equipment: activeEquipment });
    }

    if (action === 'update_mode') {
      const id = String(body.id || '').trim();
      const mode = normalizeRole(body.mode);
      if (!id) return Response.json({ error: 'Property id is required' }, { status: 400 });
      if (!['disabled','shadow','manual_review','live'].includes(mode)) return Response.json({ error: 'Invalid automatic dispatch mode' }, { status: 400 });

      const before = await base44.asServiceRole.entities.Location.get(id);
      if (!before) return Response.json({ error: 'Property not found' }, { status: 404 });
      if (before.active === false || before.property_monitoring_enabled !== true) {
        return Response.json({ error: 'Property Monitoring must be enabled before automatic dispatch can be configured' }, { status: 400 });
      }

      const update: any = {
        auto_dispatch_enabled: mode !== 'disabled',
        auto_dispatch_mode: mode,
      };
      if (mode === 'live') {
        if (!isAdmin) return Response.json({ error: 'Primary administrator approval is required to activate LIVE automatic dispatch' }, { status: 403 });
        update.auto_dispatch_live_approved_at = new Date().toISOString();
        update.auto_dispatch_live_approved_by = user.id;
      } else {
        update.auto_dispatch_live_approved_at = null;
        update.auto_dispatch_live_approved_by = '';
      }

      await base44.asServiceRole.entities.Location.update(id, update);
      const location = await base44.asServiceRole.entities.Location.get(id);

      // Turning LIVE on should take effect immediately for calls that are already
      // active at this monitored property. Previously Pathfinder waited for the
      // ingestion/recheck loop, so administrators could enable LIVE and see no
      // assignment even though eligible clocked-in units were available.
      let reevaluated = 0;
      if (mode === 'live') {
        const [alerts, calls] = await Promise.all([
          base44.asServiceRole.entities.PropertyAlert.filter({ propertyId: id }, '-created_date', 50).catch(() => []),
          base44.asServiceRole.entities.DispatchCall.list('-created_date', 500).catch(() => []),
        ]);
        const inactiveStatuses = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
        const activeCallIds = new Set((calls || [])
          .filter((call: any) => !inactiveStatuses.has(normalizeRole(call.status)))
          .map((call: any) => String(call.id)));
        const actionable = (alerts || [])
          .filter((item: any) => !['resolved', 'false_alarm', 'test'].includes(normalizeRole(item.lifecycle_status || 'active')))
          .filter((item: any) => item?.callId && activeCallIds.has(String(item.callId)))
          .slice(0, 20);
        for (const alert of actionable) {
          const response = await base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', {
            call_id: alert.callId,
            property_alert_id: alert.id,
          }).catch(() => null);
          const payload = response?.data || response || {};
          if (payload?.success) reevaluated += 1;
        }
      }

      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Location', entity_id: id, action: 'update', actor_id: user.id,
        actor_name: user.full_name || user.email || 'Administrator',
        before_value: JSON.stringify({ auto_dispatch_enabled: before.auto_dispatch_enabled, auto_dispatch_mode: before.auto_dispatch_mode }),
        after_value: JSON.stringify({ auto_dispatch_enabled: location.auto_dispatch_enabled, auto_dispatch_mode: location.auto_dispatch_mode }),
        field_changed: 'auto_dispatch_enabled,auto_dispatch_mode', timestamp: new Date().toISOString(),
        description: `Automatic dispatch mode changed to ${mode}.`,
      }).catch(() => null);
      return Response.json({ success: true, location, reevaluated_active_alerts: reevaluated });
    }

    if (action === 'evaluate_active') {
      const id = String(body.id || '').trim();
      if (!id) return Response.json({ error: 'Property id is required' }, { status: 400 });
      const property = await base44.asServiceRole.entities.Location.get(id);
      if (!property) return Response.json({ error: 'Property not found' }, { status: 404 });
      const [alerts, calls] = await Promise.all([
        base44.asServiceRole.entities.PropertyAlert.filter({ propertyId: id }, '-created_date', 75).catch(() => []),
        base44.asServiceRole.entities.DispatchCall.list('-created_date', 500).catch(() => []),
      ]);
      const inactiveStatuses = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
      const activeCallIds = new Set((calls || [])
        .filter((call: any) => !inactiveStatuses.has(normalizeRole(call.status)))
        .map((call: any) => String(call.id)));
      const actionable = (alerts || [])
        .filter((item: any) => !['resolved', 'false_alarm', 'test'].includes(normalizeRole(item.lifecycle_status || 'active')))
        .filter((item: any) => item?.callId && activeCallIds.has(String(item.callId)))
        .slice(0, 25);
      const evaluations:any[] = [];
      for (const alert of actionable) {
        const response = await base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', {
          call_id: alert.callId,
          property_alert_id: alert.id,
        }).catch((error: any) => ({ data: { error: error?.message || String(error) } }));
        const payload = response?.data || response || {};
        evaluations.push({
          call_id: alert.callId,
          property_alert_id: alert.id,
          success: payload?.success === true,
          mode: payload?.mode || property.auto_dispatch_mode || 'disabled',
          decision: payload?.decision || '',
          recommendations: payload?.recommendations || [],
          excluded_units: payload?.excluded_units || [],
          staffing_shortfall: payload?.staffing_shortfall ?? null,
          error: payload?.error || '',
        });
      }
      return Response.json({
        success: true,
        property: { id: property.id, name: property.site_name || property.address || 'Property' },
        evaluated: evaluations.length,
        evaluations,
      });
    }

    if (action === 'update_settings') {
      const id = String(body.id || '').trim();
      if (!id) return Response.json({ error: 'Property id is required' }, { status: 400 });
      const before = await base44.asServiceRole.entities.Location.get(id);
      if (!before) return Response.json({ error: 'Property not found' }, { status: 404 });

      const settings = body.settings || {};
      const update: any = {
        auto_dispatch_response_radius_miles: Math.max(0.1, Number(settings.auto_dispatch_response_radius_miles ?? before.auto_dispatch_response_radius_miles ?? 5)),
        auto_dispatch_required_units: Math.max(1, Math.floor(Number(settings.auto_dispatch_required_units ?? before.auto_dispatch_required_units ?? 1))),
        auto_dispatch_backup_required: settings.auto_dispatch_backup_required === true,
        auto_dispatch_acknowledgement_seconds: Math.max(30, Math.floor(Number(settings.auto_dispatch_acknowledgement_seconds ?? before.auto_dispatch_acknowledgement_seconds ?? 120))),
        auto_dispatch_escalation_seconds: Math.max(60, Math.floor(Number(settings.auto_dispatch_escalation_seconds ?? before.auto_dispatch_escalation_seconds ?? 300))),
        auto_dispatch_recheck_seconds: Math.max(30, Math.floor(Number(settings.auto_dispatch_recheck_seconds ?? before.auto_dispatch_recheck_seconds ?? 60))),
        auto_dispatch_required_qualifications: Array.isArray(settings.auto_dispatch_required_qualifications) ? settings.auto_dispatch_required_qualifications.filter(Boolean) : (before.auto_dispatch_required_qualifications || []),
        auto_dispatch_required_equipment: Array.isArray(settings.auto_dispatch_required_equipment) ? settings.auto_dispatch_required_equipment.filter(Boolean) : (before.auto_dispatch_required_equipment || []),
        auto_dispatch_required_ranks: Array.isArray(settings.auto_dispatch_required_ranks) ? settings.auto_dispatch_required_ranks.filter(Boolean) : (before.auto_dispatch_required_ranks || []),
        property_safety_warnings: String(settings.property_safety_warnings ?? before.property_safety_warnings ?? '').slice(0, 2000),
        property_access_instructions: String(settings.property_access_instructions ?? before.property_access_instructions ?? '').slice(0, 2000),
      };

      await base44.asServiceRole.entities.Location.update(id, update);
      const location = await base44.asServiceRole.entities.Location.get(id);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Location', entity_id: id, action: 'update', actor_id: user.id,
        actor_name: user.full_name || user.email || 'Administrator',
        before_value: JSON.stringify(Object.fromEntries(Object.keys(update).map(key => [key, before?.[key]]))),
        after_value: JSON.stringify(Object.fromEntries(Object.keys(update).map(key => [key, location?.[key]]))),
        field_changed: Object.keys(update).join(',').slice(0, 500), timestamp: new Date().toISOString(),
        description: 'Automatic dispatch operating settings updated.',
      }).catch(() => null);
      return Response.json({ success: true, location });
    }

    return Response.json({ error: 'Unsupported automatic dispatch action' }, { status: 400 });
  } catch (error) {
    console.error('manageAutoDispatchConfig failed', error);
    return Response.json({ error: error?.message || 'Unable to manage automatic dispatch configuration' }, { status: 500 });
  }
});