import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const list = (value: any) => Array.isArray(value) ? value.map(lower).filter(Boolean) : String(value || '').split(',').map(lower).filter(Boolean);

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasRole(user: any, role: string) {
  return (user?.additional_roles || []).map(lower).includes(lower(role));
}

function isFieldOfficer(user: any) {
  const rank = lower(user?.rank);
  if (!user?.email || user?.termination_date) return false;
  if (hasRole(user, 'client') || hasRole(user, 'student') || hasRole(user, 'pending')) return false;
  if (Boolean(user.dispatch_role) && !hasRole(user, 'officer')) return false;
  return hasRole(user, 'officer') || ['officer', 'corporal', 'sergeant', 'lieutenant', 'captain', 'major', 'lt colonel', 'lieutenant colonel', 'colonel'].includes(rank);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const authorized = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || hasRole(user, 'full_access') || hasRole(user, 'cad_access') || hasRole(user, 'supervisor') || hasRole(user, 'dispatch');
    if (!authorized) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    const callId = String(input.call_id || '');
    const simulation = input.simulation === true;
    if (!callId) return Response.json({ error: 'Missing call_id' }, { status: 400 });

    const activeCall = await base44.asServiceRole.entities.DispatchCall.get(callId).catch(() => null);
    const archivedCalls = !activeCall && simulation
      ? await base44.asServiceRole.entities.CallHistory.filter({ original_call_id: callId }, '-archived_date', 1).catch(() => [])
      : [];
    const call = activeCall || archivedCalls?.[0] || null;
    const [alerts, locations, users, timeEntries, activeOfficers, assignments] = await Promise.all([
      base44.asServiceRole.entities.PropertyAlert.filter({ callId }, '-created_date', 20),
      base44.asServiceRole.entities.Location.list('-updated_date', 1000),
      base44.asServiceRole.entities.User.list('-updated_date', 1000),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 3000),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1000),
      base44.asServiceRole.entities.CallAssignment.list('-assigned_at', 3000),
    ]);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });

    const alert = input.property_alert_id
      ? (alerts || []).find((item: any) => item.id === input.property_alert_id)
      : (alerts || [])[0];
    if (!alert) return Response.json({ error: 'No property alert is linked to this CAD call' }, { status: 400 });
    const property = (locations || []).find((item: any) => String(item.id) === String(alert.propertyId));
    if (!property) return Response.json({ error: 'Linked property configuration was not found' }, { status: 400 });

    const propertyLat = Number(property.latitude ?? call.latitude);
    const propertyLon = Number(property.longitude ?? call.longitude);
    if (!Number.isFinite(propertyLat) || !Number.isFinite(propertyLon)) {
      return Response.json({ error: 'Property has no reliable coordinates' }, { status: 400 });
    }

    // Phase 2 begins in recommendation-only shadow mode. A stored "live" value
    // is deliberately treated as shadow until the separate live-assignment
    // activation phase is tested and approved.
    const configuredMode = property.auto_dispatch_enabled === true ? (property.auto_dispatch_mode || 'shadow') : 'disabled';
    const mode = configuredMode === 'disabled' ? 'disabled' : configuredMode === 'manual_review' ? 'manual_review' : 'shadow';
    const radius = Math.max(0.1, Number(property.auto_dispatch_response_radius_miles || 5));
    const requiredUnits = Math.max(1, Number(property.auto_dispatch_required_units || 1), property.auto_dispatch_backup_required ? 2 : 1);
    const requiredQualifications = list(property.auto_dispatch_required_qualifications);
    const requiredEquipment = list(property.auto_dispatch_required_equipment);
    const requiredRanks = list(property.auto_dispatch_required_ranks);
    const now = Date.now();
    const freshCutoff = now - 2 * 60 * 1000;

    const openByEmail = new Map<string, any>();
    for (const entry of timeEntries || []) {
      if (!entry.officer_email || !entry.clock_in || entry.clock_out || entry.archived === true) continue;
      const email = lower(entry.officer_email);
      if (!openByEmail.has(email)) openByEmail.set(email, entry);
    }
    const activeByEmail = new Map<string, any>();
    for (const active of activeOfficers || []) {
      const email = lower(active.officer_email);
      if (!email) continue;
      const previous = activeByEmail.get(email);
      if (!previous || new Date(active.last_update || active.updated_date || 0).getTime() > new Date(previous.last_update || previous.updated_date || 0).getTime()) {
        activeByEmail.set(email, active);
      }
    }
    const busyUnitIds = new Set((assignments || [])
      .filter((item: any) => item.call_id !== callId && !['cleared', 'cancelled'].includes(lower(item.status)))
      .map((item: any) => String(item.unit_id)));

    const ranked: any[] = [];
    const excluded: any[] = [];
    for (const officer of users || []) {
      if (!isFieldOfficer(officer)) continue;
      const reasons: string[] = [];
      const email = lower(officer.email);
      const session = activeByEmail.get(email);
      const timeEntry = openByEmail.get(email);
      const status = lower(session?.status || officer.status);
      const gpsAt = new Date(session?.gps_updated_at || 0).getTime();
      const accuracy = Number(session?.accuracy);
      const lat = Number(session?.latitude);
      const lon = Number(session?.longitude);

      if (!timeEntry) reasons.push('Officer is not clocked in with an active work session');
      if (!session || session.session_active === false) reasons.push('No active signed-in GPS session');
      if (status !== 'available') reasons.push(`Status is ${session?.status || officer.status || 'unknown'}, not Available`);
      if (!Number.isFinite(gpsAt) || gpsAt < freshCutoff) reasons.push('GPS location is stale');
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(accuracy) || accuracy > 100) reasons.push('GPS location is missing or unreliable');
      if (busyUnitIds.has(String(officer.id))) reasons.push('Officer has another active call assignment');

      const authorizationValues = [
        officer.assigned_location, officer.assigned_location_id, officer.location_id,
        officer.division, officer.subdivision, timeEntry?.location,
      ].map(lower).filter(Boolean);
      const propertyValues = [property.id, property.site_name, property.address, property.division, property.subdivision].map(lower).filter(Boolean);
      if (!authorizationValues.some(value => propertyValues.includes(value))) reasons.push('No matching property, division, or response-area authorization');

      const officerQualifications = [...list(officer.certifications), ...list(officer.qualifications), ...list(officer.licenses)];
      const officerEquipment = [...list(officer.equipment), ...list(officer.assigned_equipment), ...list(officer.vehicle_type)];
      const missingQualifications = requiredQualifications.filter((item: string) => !officerQualifications.includes(item));
      const missingEquipment = requiredEquipment.filter((item: string) => !officerEquipment.includes(item));
      if (missingQualifications.length) reasons.push(`Missing qualification: ${missingQualifications.join(', ')}`);
      if (missingEquipment.length) reasons.push(`Missing equipment: ${missingEquipment.join(', ')}`);
      if (requiredRanks.length && !requiredRanks.includes(lower(officer.rank))) reasons.push('Rank does not meet property policy');

      let distance = Number.POSITIVE_INFINITY;
      if (Number.isFinite(lat) && Number.isFinite(lon)) distance = distanceMiles(propertyLat, propertyLon, lat, lon);
      if (!Number.isFinite(distance) || distance > radius) reasons.push(`Outside configured ${radius} mile response radius`);

      const summary = {
        unit_id: officer.id,
        officer_email: officer.email,
        unit_number: session?.unit_number || officer.unit_number || '',
        officer_name: officer.full_name || [officer.first_name, officer.last_name].filter(Boolean).join(' '),
        status: session?.status || officer.status || '',
        distance_miles: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
        eta_minutes: Number.isFinite(distance) ? Math.max(1, Math.ceil(distance * 2)) : null,
      };
      if (reasons.length) excluded.push({ ...summary, reasons });
      else ranked.push({ ...summary, score: Number(distance.toFixed(3)), reasons: ['Clocked in', 'Active session', 'Available', 'Fresh reliable GPS', 'Authorized', 'Within radius', 'No higher-priority assignment'] });
    }

    ranked.sort((a, b) => a.score - b.score);
    const recommendations = ranked.slice(0, requiredUnits);
    const decision = mode === 'disabled' ? 'disabled'
      : mode === 'manual_review' ? 'manual_review'
      : recommendations.length ? 'recommended' : 'no_eligible_unit';
    const eventKey = `autodispatch:${alert.source_key || alert.id}:${mode}${simulation ? ':simulation' : ''}`;
    const evaluationData = {
      event_key: eventKey,
      property_alert_id: alert.id,
      call_id: callId,
      cad_number: call.agency_cad_number || call.call_id || call.bps_reference || '',
      property_id: property.id,
      mode,
      decision,
      recommended_unit_ids: recommendations.map((item: any) => item.unit_id),
      ranking: ranked,
      excluded_units: excluded,
      evaluated_at: new Date().toISOString(),
      evaluated_by: user.id,
      configuration_snapshot: {
        configured_mode: configuredMode,
        response_radius_miles: radius,
        required_units: requiredUnits,
        backup_required: Boolean(property.auto_dispatch_backup_required),
        required_qualifications: requiredQualifications,
        required_equipment: requiredEquipment,
        required_ranks: requiredRanks,
        simulation,
        call_source: activeCall ? 'active' : 'archived_test',
      },
      description: simulation
        ? 'Phase 2A safety simulation; no assignment or unit status was changed.'
        : decision === 'no_eligible_unit' ? 'No eligible unit available. Manual assignment remains available.' : 'Phase 2 shadow recommendation; no assignment or unit status was changed.',
    };
    const existing = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ event_key: eventKey }, '-evaluated_at', 1).catch(() => []);
    const evaluation = existing?.length
      ? await base44.asServiceRole.entities.AutoDispatchEvaluation.update(existing[0].id, evaluationData)
      : await base44.asServiceRole.entities.AutoDispatchEvaluation.create(evaluationData);

    return Response.json({
      success: true,
      shadow_mode: true,
      simulation,
      assignment_created: false,
      unit_status_changed: false,
      call_id: callId,
      property: { id: property.id, name: property.site_name, address: property.address },
      decision,
      recommendations,
      excluded_units: excluded,
      evaluation_id: evaluation?.id,
      message: decision === 'no_eligible_unit' ? 'No eligible unit available.' : 'Shadow recommendation created. Dispatcher retains full control.',
    });
  } catch (error) {
    console.error('geofenceDispatchAssignment failed', error);
    return Response.json({ error: error?.message || 'Unable to evaluate automatic dispatch' }, { status: 500 });
  }
});
