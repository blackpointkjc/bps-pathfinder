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
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const stable = (rows: any[]) => JSON.stringify((rows || []).map(row => ({
  id: row.id,
  call_id: row.call_id,
  unit_id: row.unit_id,
  status: row.status,
  assigned_at: row.assigned_at,
})).sort((a, b) => String(a.id).localeCompare(String(b.id))));
const unitState = (rows: any[]) => JSON.stringify((rows || []).map(row => ({
  id: row.id,
  officer_email: row.officer_email,
  status: row.status,
  current_call_info: row.current_call_info,
})).sort((a, b) => String(a.id).localeCompare(String(b.id))));

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
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('dispatch') || roles.has('supervisor') || roles.has('cad_access') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    const { call_id, property_alert_id, simulation = false } = await req.json().catch(() => ({}));
    if (!call_id || !property_alert_id) return Response.json({ error: 'call_id and property_alert_id are required' }, { status: 400 });

    const [beforeAssignments, beforeUnits, alert] = await Promise.all([
      base44.asServiceRole.entities.CallAssignment.filter({ call_id }, '-assigned_at', 100),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1000),
      base44.asServiceRole.entities.PropertyAlert.get(property_alert_id),
    ]);
    if (!alert || String(alert.callId) !== String(call_id)) {
      return Response.json({ error: 'The property alert is not linked to the selected call' }, { status: 400 });
    }
    const property = await base44.asServiceRole.entities.Location.get(String(alert.propertyId));
    const propertyLat = Number(property?.latitude);
    const propertyLon = Number(property?.longitude);
    if (!Number.isFinite(propertyLat) || !Number.isFinite(propertyLon)) {
      return Response.json({ error: 'The test property requires valid coordinates' }, { status: 400 });
    }
    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const testUnits = [
      {
        id: 'simulation-nearest-qualified',
        email: 'simulation-nearest@example.invalid',
        unit_number: 'TEST-1',
        status: 'Available',
        latitude: propertyLat + 0.001,
        longitude: propertyLon + 0.001,
        gps_updated_at: nowIso,
        last_update: nowIso,
        accuracy: 8,
      },
      {
        id: 'simulation-stale-excluded',
        email: 'simulation-stale@example.invalid',
        unit_number: 'TEST-2',
        status: 'Out of Service',
        latitude: propertyLat + 0.002,
        longitude: propertyLon + 0.002,
        gps_updated_at: staleIso,
        last_update: staleIso,
        accuracy: 250,
      },
    ];

    const simulationInput = { call_id, property_alert_id, simulation: true, test_units: testUnits };
    const firstResponse = await base44.functions.invoke('geofenceDispatchAssignment', simulationInput);
    const first = firstResponse?.data || firstResponse || {};
    if (first.error) throw new Error(first.error);
    const secondResponse = await base44.functions.invoke('geofenceDispatchAssignment', simulationInput);
    const second = secondResponse?.data || secondResponse || {};
    if (second.error) throw new Error(second.error);

    const [afterAssignments, afterUnits, evaluations] = await Promise.all([
      base44.asServiceRole.entities.CallAssignment.filter({ call_id }, '-assigned_at', 100),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1000),
      base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ property_alert_id, call_id }, '-evaluated_at', 20),
    ]);

    const simulationEvaluations = (evaluations || []).filter((row: any) =>
      row.configuration_snapshot?.simulation === true || String(row.event_key || '').endsWith(':simulation')
    );
    const checks = {
      property_alert_link_verified: first.call_id === call_id && second.call_id === call_id,
      shadow_mode_enforced: first.shadow_mode === true && second.shadow_mode === true,
      no_assignment_created: stable(beforeAssignments) === stable(afterAssignments) && first.assignment_created === false && second.assignment_created === false,
      no_unit_status_changed: unitState(beforeUnits) === unitState(afterUnits) && first.unit_status_changed === false && second.unit_status_changed === false,
      duplicate_evaluation_prevented: first.evaluation_id && first.evaluation_id === second.evaluation_id && simulationEvaluations.length === 1,
      staffing_shortfall_recorded: Number.isFinite(Number(first.staffing_shortfall)),
      exclusion_reasons_present: Array.isArray(first.excluded_units) && first.excluded_units.every((row: any) => Array.isArray(row.reasons) && row.reasons.length > 0),
      recommendation_has_distance_eta: Array.isArray(first.recommendations) && first.recommendations.length > 0 && first.recommendations.every((row: any) =>
        row.already_assigned === true || (Number.isFinite(Number(row.distance_miles)) && Number.isFinite(Number(row.eta_minutes)))
      ),
      nearest_qualified_unit_selected: first.recommendations?.[0]?.unit_id === 'simulation-nearest-qualified',
      stale_unavailable_unit_excluded: first.excluded_units?.some((row: any) =>
        row.unit_id === 'simulation-stale-excluded'
        && Array.isArray(row.reasons)
        && row.reasons.some((reason: string) => /stale|unreliable|out of service|not Available/i.test(reason))
      ),
    };
    const passed = Object.values(checks).every(Boolean);

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'AutoDispatchEvaluation',
      entity_id: first.evaluation_id || property_alert_id,
      action: 'update',
      actor_id: user.id,
      actor_name: user.full_name || user.email || 'Dispatcher',
      after_value: JSON.stringify(checks),
      field_changed: 'phase_2a_shadow_safety_test',
      timestamp: new Date().toISOString(),
      description: passed ? 'Phase 2A shadow safety test passed without creating an assignment or changing unit status.' : 'Phase 2A shadow safety test found a failure; live assignment remains locked.',
    }).catch(() => null);

    return Response.json({ success: passed, passed, checks, evaluation: first, tested_at: new Date().toISOString() });
  } catch (error) {
    console.error('testAutoDispatchShadow failed', error);
    return Response.json({ error: error?.response?.data?.error || error?.message || 'Shadow safety test failed' }, { status: 500 });
  }
});
