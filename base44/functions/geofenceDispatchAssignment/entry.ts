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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = lower(error?.message || error?.response?.data?.error);
      const transient = message.includes('rate limit') || message.includes('429') || message.includes('timeout') || message.includes('temporar') || message.includes('500');
      if (!transient || attempt === attempts - 1) throw error;
      await wait(attempt === 0 ? 250 : 750);
    }
  }
  throw lastError;
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

    const activeCall = await withRetry(() => base44.asServiceRole.entities.DispatchCall.get(callId)).catch(() => null);
    const archivedCalls = !activeCall && simulation
      ? await base44.asServiceRole.entities.CallHistory.filter({ original_call_id: callId }, '-archived_date', 1).catch(() => [])
      : [];
    const call = activeCall || archivedCalls?.[0] || null;
    // Keep every automatic-dispatch check lightweight. The prior implementation
    // loaded thousands of unrelated accounting/CAD rows on every refresh, which
    // made a healthy dispatch decision vulnerable to rate limits and generic 500s.
    // Resolve the exact alert/property first, then load only operational datasets.
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });
    const alert = input.property_alert_id
      ? await withRetry(() => base44.asServiceRole.entities.PropertyAlert.get(String(input.property_alert_id))).catch(() => null)
      : (await withRetry(() => base44.asServiceRole.entities.PropertyAlert.filter({ callId }, '-created_date', 1)).catch(() => []))?.[0] || null;
    if (!alert || String(alert.callId) !== callId) return Response.json({ error: 'No property alert is linked to this CAD call' }, { status: 400 });
    const property = await withRetry(() => base44.asServiceRole.entities.Location.get(String(alert.propertyId))).catch(() => null);
    if (!property) return Response.json({ error: 'Linked property configuration was not found' }, { status: 400 });

    let users = await withRetry(() => base44.asServiceRole.entities.User.list('-updated_date', 750));
    let activeOfficers = await withRetry(() => base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 300));
    let timeEntries = await withRetry(() => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 1500));
    let assignments = await withRetry(() => base44.asServiceRole.entities.CallAssignment.list('-assigned_at', 800));

    const propertyLat = Number(property.latitude ?? call.latitude);
    const propertyLon = Number(property.longitude ?? call.longitude);
    if (!Number.isFinite(propertyLat) || !Number.isFinite(propertyLon)) {
      return Response.json({ error: 'Property has no reliable coordinates' }, { status: 400 });
    }

    // Admin-only test units make Phase 2A simulation deterministic without
    // modifying production users, live GPS sessions, assignments, or statuses.
    // They exist only in memory for this request.
    if (simulation && Array.isArray(input.test_units)) {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Administrator access is required for synthetic dispatch tests' }, { status: 403 });
      }
      const nowIso = new Date().toISOString();
      users = input.test_units.map((unit: any, index: number) => ({
        id: String(unit.id || `simulation-unit-${index + 1}`),
        email: String(unit.email || `simulation-${index + 1}@example.invalid`),
        full_name: String(unit.name || `Simulation Unit ${index + 1}`),
        unit_number: String(unit.unit_number || `T${index + 1}`),
        rank: String(unit.rank || 'officer'),
        additional_roles: ['officer'],
        status: String(unit.status || 'Available'),
        assigned_location_ids: [property.id],
        division: property.division,
        subdivision: property.subdivision,
        officer_certifications: unit.qualifications || [],
        equipment: unit.equipment || [],
      }));
      activeOfficers = input.test_units.map((unit: any, index: number) => ({
        id: `simulation-session-${index + 1}`,
        officer_email: String(unit.email || `simulation-${index + 1}@example.invalid`),
        unit_number: String(unit.unit_number || `T${index + 1}`),
        status: String(unit.status || 'Available'),
        session_active: unit.session_active !== false,
        clock_in_time: unit.clock_in_time || nowIso,
        last_update: unit.last_update || nowIso,
        gps_updated_at: unit.gps_updated_at || nowIso,
        accuracy: unit.accuracy ?? 10,
        latitude: unit.latitude,
        longitude: unit.longitude,
        current_location: property.site_name || property.address,
      }));
      timeEntries = input.test_units.filter((unit: any) => unit.session_active !== false).map((unit: any, index: number) => ({
        id: `simulation-entry-${index + 1}`,
        officer_email: String(unit.email || `simulation-${index + 1}@example.invalid`),
        clock_in: unit.clock_in_time || nowIso,
        location: property.site_name || property.address,
        archived: false,
      }));
      assignments = [];
    }

    // Automatic assignment is opt-in per property. Shadow remains the default;
    // only an explicit saved live mode may change operational records.
    const configuredMode = property.auto_dispatch_enabled === true ? (property.auto_dispatch_mode || 'shadow') : 'disabled';
    const liveApproved = Boolean(property.auto_dispatch_live_approved_at && property.auto_dispatch_live_approved_by);
    const requestedMode = ['disabled', 'manual_review', 'live'].includes(configuredMode) ? configuredMode : 'shadow';
    // A stale/direct data edit cannot bypass the Phase 2B administrator approval gate.
    const mode = requestedMode === 'live' && !liveApproved ? 'manual_review' : requestedMode;
    const radius = Math.max(0.1, Number(property.auto_dispatch_response_radius_miles || 5));

    // A completed live evaluation is the permanent idempotency receipt for this
    // property-alert event. Refreshes, ingestion reconnects, and timed rechecks
    // must never assign or announce the same alert again.
    if (mode === 'live' && !simulation) {
      const completed = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({
        property_alert_id: alert.id,
        mode: 'live',
        decision: 'assigned',
      }, '-evaluated_at', 1).catch(() => []);
      if (completed?.length) {
        const selectedIds = new Set((completed[0].recommended_unit_ids || []).map(String));
        return Response.json({
          success: true,
          mode: 'live',
          shadow_mode: false,
          simulation: false,
          assignment_created: false,
          unit_status_changed: false,
          duplicate_event: true,
          call_id: callId,
          decision: 'assigned',
          recommendations: (completed[0].ranking || []).filter((item: any) => selectedIds.has(String(item.unit_id))),
          excluded_units: completed[0].excluded_units || [],
          evaluation_id: completed[0].id,
          staffing_shortfall: 0,
          message: 'This property alert was already assigned. No duplicate action was taken.',
        });
      }
    }
    const requiredUnits = Math.max(1, Number(property.auto_dispatch_required_units || 1), property.auto_dispatch_backup_required ? 2 : 1);
    const requiredQualifications = list(property.auto_dispatch_required_qualifications);
    const requiredEquipment = list(property.auto_dispatch_required_equipment);
    const requiredRanks = list(property.auto_dispatch_required_ranks);
    const now = Date.now();
    const freshCutoff = now - 2 * 60 * 1000;

    const activeByEmail = new Map<string, any>();
    for (const active of activeOfficers || []) {
      const email = lower(active.officer_email);
      if (!email) continue;
      const previous = activeByEmail.get(email);
      if (!previous || new Date(active.last_update || active.updated_date || 0).getTime() > new Date(previous.last_update || previous.updated_date || 0).getTime()) {
        activeByEmail.set(email, active);
      }
    }
    const openEntryByEmail = new Map<string, any>();
    for (const entry of timeEntries || []) {
      const email = lower(entry.officer_email);
      if (!email || !entry.clock_in || entry.clock_out || entry.archived === true) continue;
      const previous = openEntryByEmail.get(email);
      if (!previous || new Date(entry.clock_in).getTime() > new Date(previous.clock_in).getTime()) {
        openEntryByEmail.set(email, entry);
      }
    }
    // Assignment lifecycle is authoritative for unit occupancy. Clearing/archive
    // workflows already close CallAssignment rows; avoiding a second full call-list
    // read keeps this evaluator fast and reliable during refresh/reconnect storms.
    const busyUnitIds = new Set((assignments || [])
      .filter((item: any) => item.call_id !== callId
        && !['cleared', 'cancelled'].includes(lower(item.status)))
      .map((item: any) => String(item.unit_id)));

    const ranked: any[] = [];
    const excluded: any[] = [];
    for (const officer of users || []) {
      if (!isFieldOfficer(officer)) continue;
      const reasons: string[] = [];
      const email = lower(officer.email);
      const session = activeByEmail.get(email);
      const openEntry = openEntryByEmail.get(email);
      const clockedIn = Boolean(openEntry || (session && session.session_active !== false));
      const status = lower(session?.status || officer.status || (openEntry ? 'Available' : ''));
      const gpsAt = new Date(session?.gps_updated_at || 0).getTime();
      const accuracy = Number(session?.accuracy);
      const lat = Number(session?.latitude);
      const lon = Number(session?.longitude);
      const reliableGps = Boolean(session && session.session_active !== false
        && Number.isFinite(gpsAt) && gpsAt >= freshCutoff
        && Number.isFinite(lat) && Number.isFinite(lon)
        && Number.isFinite(accuracy) && accuracy <= 100);

      // GPS improves ranking but is not an eligibility requirement. If location
      // cannot be obtained, a true open TimeEntry is the authoritative fallback.
      if (!clockedIn) reasons.push('Officer is not currently clocked in');
      if (status !== 'available') reasons.push(`Status is ${session?.status || officer.status || 'unknown'}, not Available`);
      if (busyUnitIds.has(String(officer.id))) reasons.push('Officer has another active call assignment');

      const authorizationValues = [
        officer.assigned_location, officer.assigned_location_id, officer.location_id,
        ...(Array.isArray(officer.assigned_locations) ? officer.assigned_locations : []),
        ...(Array.isArray(officer.assigned_sites) ? officer.assigned_sites : []),
        officer.division, officer.subdivision, session?.current_location, openEntry?.location,
      ].map(lower).filter(Boolean);
      const propertyValues = [property.id, property.site_name, property.address, property.division, property.subdivision].map(lower).filter(Boolean);
      const authorizedForProperty = authorizationValues.some(authorization =>
        propertyValues.some(propertyValue => authorization === propertyValue
          || (propertyValue.length >= 4 && (authorization.includes(propertyValue) || propertyValue.includes(authorization))))
      );
      // A reliable GPS result keeps response-area policy strict. With no GPS,
      // clocked-in units remain eligible but matching-area units rank ahead.
      if (reliableGps && !authorizedForProperty) reasons.push('No matching property, division, or response-area authorization');

      const officerQualifications = [
        ...list(officer.officer_certifications),
        ...list(officer.certifications),
        ...list(officer.qualifications),
        ...list(officer.licenses),
      ];
      const officerEquipment = [
        ...list(officer.equipment),
        ...list(officer.assigned_equipment),
        ...list(officer.vehicle_type),
        ...list(officer.assigned_vehicle),
      ];
      const missingQualifications = requiredQualifications.filter((item: string) => !officerQualifications.includes(item));
      const missingEquipment = requiredEquipment.filter((item: string) => !officerEquipment.includes(item));
      if (missingQualifications.length) reasons.push(`Missing qualification: ${missingQualifications.join(', ')}`);
      if (missingEquipment.length) reasons.push(`Missing equipment: ${missingEquipment.join(', ')}`);
      if (requiredRanks.length && !requiredRanks.includes(lower(officer.rank))) reasons.push('Rank does not meet property policy');

      const distance = reliableGps ? distanceMiles(propertyLat, propertyLon, lat, lon) : Number.POSITIVE_INFINITY;
      if (reliableGps && distance > radius) reasons.push(`Outside configured ${radius} mile response radius`);

      const locationFallback = !reliableGps;
      const clockInTime = openEntry?.clock_in || session?.clock_in_time || null;
      const summary = {
        unit_id: officer.id,
        officer_email: officer.email,
        unit_number: session?.unit_number || officer.unit_number || '',
        officer_name: officer.full_name || [officer.first_name, officer.last_name].filter(Boolean).join(' '),
        status: session?.status || officer.status || (openEntry ? 'Available' : ''),
        distance_miles: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
        eta_minutes: Number.isFinite(distance) ? Math.max(1, Math.ceil(distance * 2)) : null,
        location_fallback: locationFallback,
        authorization_fallback: locationFallback && !authorizedForProperty,
        clock_in_time: clockInTime,
      };
      if (reasons.length) {
        const gpsReason = locationFallback && clockedIn ? ['GPS unavailable; clock-in fallback considered'] : [];
        excluded.push({ ...summary, reasons: [...reasons, ...gpsReason] });
      } else {
        const score = locationFallback ? (authorizedForProperty ? 10000 : 11000) : Number(distance.toFixed(3));
        ranked.push({
          ...summary,
          score,
          reasons: locationFallback
            ? ['Clocked in', 'Available', authorizedForProperty ? 'Authorized response area' : 'Company-wide clocked-in fallback', 'GPS unavailable; location requirement waived', 'No higher-priority assignment']
            : ['Clocked in', 'Available', 'Fresh reliable GPS', 'Authorized', 'Within radius', 'No higher-priority assignment'],
        });
      }
    }

    ranked.sort((a, b) => {
      if (Boolean(a.location_fallback) !== Boolean(b.location_fallback)) return a.location_fallback ? 1 : -1;
      if (a.score !== b.score) return a.score - b.score;
      return new Date(a.clock_in_time || 0).getTime() - new Date(b.clock_in_time || 0).getTime();
    });
    const existingCallAssignments = (assignments || []).filter((item: any) =>
      String(item.call_id) === callId && !['cleared', 'cancelled'].includes(lower(item.status))
    );
    const existingAssignedUnitIds = new Set(existingCallAssignments.map((item: any) => String(item.unit_id)));
    const remainingUnitsRequired = Math.max(0, requiredUnits - existingAssignedUnitIds.size);
    const newRecommendations = ranked
      .filter((item: any) => !existingAssignedUnitIds.has(String(item.unit_id)))
      .slice(0, remainingUnitsRequired);
    const existingAssignmentSummaries = existingCallAssignments.map((assignment: any) => {
      const officer = (users || []).find((item: any) => String(item.id) === String(assignment.unit_id));
      const session = activeByEmail.get(lower(officer?.email));
      const lat = Number(session?.latitude);
      const lon = Number(session?.longitude);
      const distance = Number.isFinite(lat) && Number.isFinite(lon)
        ? distanceMiles(propertyLat, propertyLon, lat, lon)
        : Number.NaN;
      return {
        unit_id: String(assignment.unit_id),
        officer_email: officer?.email || '',
        unit_number: session?.unit_number || officer?.unit_number || '',
        officer_name: officer?.full_name || [officer?.first_name, officer?.last_name].filter(Boolean).join(' '),
        status: session?.status || officer?.status || assignment.status || '',
        distance_miles: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
        eta_minutes: Number.isFinite(distance) ? Math.max(1, Math.ceil(distance * 2)) : null,
        role: assignment.role || 'backup',
        already_assigned: true,
      };
    });
    const recommendations = [...existingAssignmentSummaries, ...newRecommendations];
    const totalStaffedUnits = existingAssignedUnitIds.size + newRecommendations.length;
    const staffingShortfall = Math.max(0, requiredUnits - totalStaffedUnits);
    const decision = mode === 'disabled' ? 'disabled'
      : mode === 'manual_review' ? 'manual_review'
      : mode !== 'live' || simulation
        ? (recommendations.length ? 'recommended' : 'no_eligible_unit')
        : totalStaffedUnits === 0
          ? 'no_eligible_unit'
          : staffingShortfall > 0 ? 'partially_assigned' : 'assigned';
    const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;

    let assignmentCreated = false;
    let unitStatusChanged = false;
    if (['assigned', 'partially_assigned'].includes(decision) && newRecommendations.length) {
      const nowIso = new Date().toISOString();
      const existingAssignedIds = new Set(Array.isArray(call.assigned_units) ? call.assigned_units.map(String) : []);
      const nextAssignedIds = new Set(existingAssignedIds);
      let hasPrimaryAssignment = existingCallAssignments.some((item: any) => lower(item.role) === 'primary');

      for (const recommendation of newRecommendations) {
        const unitId = String(recommendation.unit_id);
        const assignmentRole = hasPrimaryAssignment ? 'backup' : 'primary';
        hasPrimaryAssignment = true;
        nextAssignedIds.add(unitId);
        const existingAssignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: callId, unit_id: unitId }, '-assigned_at', 20).catch(() => []);
        const hasActiveAssignment = (existingAssignments || []).some((item: any) => !['cleared', 'cancelled'].includes(lower(item.status)));
        // Automatic dispatch must never resurrect an officer who already cleared this call.
        // A dispatcher can explicitly reassign later through the manual assignment workflow,
        // but realtime/refresh reevaluation cannot recreate the cleared assignment.
        const wasPreviouslyCleared = (existingAssignments || []).some((item: any) => lower(item.status) === 'cleared');
        if (!hasActiveAssignment && !wasPreviouslyCleared) {
          await base44.asServiceRole.entities.CallAssignment.create({
            call_id: callId,
            unit_id: unitId,
            role: assignmentRole,
            assigned_at: nowIso,
            status: 'pending',
            description: `Automatically assigned from verified property alert ${alert.id}`,
          });
          assignmentCreated = true;
        }

        const officer = (users || []).find((item: any) => String(item.id) === unitId);
        const session = activeByEmail.get(lower(officer?.email));
        const statusUpdate = {
          status: 'Dispatched',
          current_call_id: callId,
          current_call_info: `${cadNumber} · ${call.incident || 'Property alert'} · ${property.site_name || property.address}`,
          last_updated: nowIso,
          status_since: nowIso,
        };
        if (officer && lower(officer.status) !== 'dispatched') {
          await base44.asServiceRole.entities.User.update(officer.id, statusUpdate);
          unitStatusChanged = true;
        }
        if (session && lower(session.status) !== 'dispatched') {
          await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
            status: 'Dispatched',
            current_call_info: statusUpdate.current_call_info,
            last_update: nowIso,
            session_active: true,
          });
          unitStatusChanged = true;
        }
        const linkedUnits = await base44.asServiceRole.entities.Unit.filter({ user_id: unitId }).catch(() => []);
        await Promise.all((linkedUnits || []).map((unit: any) => base44.asServiceRole.entities.Unit.update(unit.id, {
          status: 'Dispatched',
          assigned_call_ids: Array.from(new Set([...(unit.assigned_call_ids || []).map(String), callId])),
          last_update_at: nowIso,
        })));

        const assignmentEventKey = `autodispatch:${alert.id}:assignment:${unitId}`;
        const existingLogs = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: assignmentEventKey }, '-created_date', 1).catch(() => []);
        if (!existingLogs?.length) {
          const unitLabel = recommendation.unit_number ? `Unit ${recommendation.unit_number}` : (recommendation.officer_name || 'Assigned unit');
          await base44.asServiceRole.entities.CallStatusLog.create({
            call_id: callId,
            incident_type: call.incident || '',
            location: call.location || property.address || '',
            old_status: call.status || '',
            new_status: 'Dispatched',
            unit_id: unitId,
            unit_name: unitLabel,
            notes: assignmentRole === 'primary' ? 'Automatic property-alert primary assignment' : 'Automatic property-alert backup assignment',
            latitude: propertyLat,
            longitude: propertyLon,
            event_key: assignmentEventKey,
            event_type: assignmentRole === 'primary' ? 'unit_dispatched' : 'additional_unit',
            announcement_text: `Property alert. ${unitLabel}, respond to ${property.site_name || property.address}. ${call.incident || 'Property alert'}. Priority ${call.priority || 'medium'}. CAD number ${cadNumber}.`,
            announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
            cad_number: String(cadNumber),
            triggering_action: 'geofenceDispatchAssignment.live',
            audio_enabled: true,
            sensitive: false,
          });
        }

        if (officer?.email) {
          const existingNotifications = await base44.asServiceRole.entities.Notification.filter({ recipient_email: lower(officer.email), related_id: callId, type: 'call_assignment' }, '-created_date', 20).catch(() => []);
          if (!existingNotifications?.length) {
            await base44.asServiceRole.entities.Notification.create({
              recipient_email: lower(officer.email),
              type: 'call_assignment',
              title: `Automatic Dispatch · ${cadNumber}`,
              message: `Unit ${recommendation.unit_number || ''}, respond to ${property.site_name || property.address}. ${call.incident || 'Property alert'}. Priority ${call.priority || 'medium'}. Safety warning: ${property.property_safety_warnings || call.hazards || 'None listed'}.`,
              is_read: false,
              related_id: callId,
              priority: ['critical', 'high'].includes(lower(call.priority)) ? 'critical' : 'high',
              requires_acknowledgment: true,
              source_name: 'Automatic Property Dispatch',
            });
          }
        }
      }

      await Promise.all([
        base44.asServiceRole.entities.DispatchCall.update(callId, {
          assigned_units: Array.from(nextAssignedIds),
          status: call.status === 'New' ? 'Dispatched' : call.status,
          time_dispatched: call.time_dispatched || nowIso,
        }),
        base44.asServiceRole.entities.PropertyAlert.update(alert.id, {
          lifecycle_status: decision === 'partially_assigned' ? 'partially_assigned' : 'assigned',
          acknowledged: false,
        }),
      ]);
    }

    // A live staffing shortage is a durable operational event. Emit the visual,
    // audio, supervisor notification, and audit record once; timed rechecks
    // update the evaluation but cannot replay this warning.
    if (mode === 'live' && !simulation && staffingShortfall > 0) {
      const shortageKind = totalStaffedUnits === 0 ? 'no-eligible-unit' : 'backup-shortfall';
      const shortageEventKey = `autodispatch:${alert.id}:staffing-shortfall:${shortageKind}`;
      const existingShortageLogs = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: shortageEventKey }, '-created_date', 1).catch(() => []);
      if (!existingShortageLogs?.length) {
        const shortageMessage = totalStaffedUnits === 0
          ? `Property alert. No eligible unit available. CAD number ${cadNumber}.`
          : `Property alert. Additional qualified unit required. ${staffingShortfall} unit${staffingShortfall === 1 ? '' : 's'} still needed. CAD number ${cadNumber}.`;
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id: callId,
          incident_type: call.incident || 'Property alert',
          location: call.location || property.address || '',
          old_status: call.status || '',
          new_status: call.status || 'New',
          notes: shortageMessage,
          event_key: shortageEventKey,
          event_type: totalStaffedUnits === 0 ? 'property_alert' : 'backup_requested',
          announcement_text: shortageMessage,
          announcement_priority: ['critical', 'high'].includes(lower(call.priority)) ? lower(call.priority) : 'high',
          cad_number: String(cadNumber),
          triggering_action: 'geofenceDispatchAssignment.staffing_shortfall',
          audio_enabled: true,
          sensitive: false,
        });
        const operationalRecipients = (users || []).filter((recipient: any) => {
          const recipientRoles = new Set((recipient.additional_roles || []).map(lower));
          return recipient.email && (recipient.role === 'admin' || recipient.role === 'dispatch' || Boolean(recipient.dispatch_role)
            || recipientRoles.has('supervisor') || recipientRoles.has('full_access') || recipientRoles.has('cad_access'));
        });
        for (const recipient of operationalRecipients) {
          const notificationTitle = totalStaffedUnits === 0
            ? `No eligible unit available · ${cadNumber}`
            : `Automatic dispatch needs backup · ${cadNumber}`;
          const prior = await base44.asServiceRole.entities.Notification.filter({
            recipient_email: lower(recipient.email),
            related_id: callId,
            title: notificationTitle,
          }, '-created_date', 1).catch(() => []);
          if (!prior?.length) await base44.asServiceRole.entities.Notification.create({
            recipient_email: lower(recipient.email),
            type: 'system_issue',
            title: notificationTitle,
            message: shortageMessage,
            is_read: false,
            related_id: callId,
            priority: 'critical',
            requires_acknowledgment: true,
            source_name: 'Automatic Property Dispatch',
          });
        }
        await base44.asServiceRole.entities.AuditLog.create({
          entity_type: 'PropertyAlert',
          entity_id: alert.id,
          action: 'status_change',
          actor_id: user.id,
          actor_name: 'Automatic Property Dispatch',
          before_value: JSON.stringify({ required_units: requiredUnits }),
          after_value: JSON.stringify({ staffed_units: totalStaffedUnits, staffing_shortfall: staffingShortfall, event_key: shortageEventKey }),
          field_changed: 'automatic_dispatch_staffing',
          timestamp: new Date().toISOString(),
          description: shortageMessage,
        }).catch(() => null);
      }
    }
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
      ranking: [...existingAssignmentSummaries, ...ranked.filter((item: any) => !existingAssignedUnitIds.has(String(item.unit_id)))],
      excluded_units: excluded,
      evaluated_at: new Date().toISOString(),
      evaluated_by: user.id,
      configuration_snapshot: {
        configured_mode: configuredMode,
        live_approved: liveApproved,
        live_approved_at: property.auto_dispatch_live_approved_at || null,
        live_approved_by: property.auto_dispatch_live_approved_by || null,
        response_radius_miles: radius,
        required_units: requiredUnits,
        staffed_units: totalStaffedUnits,
        staffing_shortfall: staffingShortfall,
        backup_required: Boolean(property.auto_dispatch_backup_required),
        required_qualifications: requiredQualifications,
        required_equipment: requiredEquipment,
        required_ranks: requiredRanks,
        simulation,
        call_source: activeCall ? 'active' : 'archived_test',
      },
      description: simulation
        ? 'Phase 2A safety simulation; no assignment or unit status was changed.'
        : decision === 'assigned' ? 'Verified property alert fully staffed with the closest eligible unit(s) in live mode.'
        : decision === 'partially_assigned' ? `Closest eligible unit(s) assigned; ${staffingShortfall} additional qualified unit(s) still required.`
        : decision === 'no_eligible_unit' ? 'No eligible unit available. Manual assignment remains available.' : 'Phase 2 shadow recommendation; no assignment or unit status was changed.',
    };
    const existing = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ event_key: eventKey }, '-evaluated_at', 1).catch(() => []);
    const evaluation = existing?.length
      ? await base44.asServiceRole.entities.AutoDispatchEvaluation.update(existing[0].id, evaluationData)
      : await base44.asServiceRole.entities.AutoDispatchEvaluation.create(evaluationData);

    return Response.json({
      success: true,
      shadow_mode: mode !== 'live' || simulation,
      mode,
      simulation,
      assignment_created: assignmentCreated,
      unit_status_changed: unitStatusChanged,
      call_id: callId,
      property: { id: property.id, name: property.site_name, address: property.address },
      decision,
      recommendations,
      excluded_units: excluded,
      evaluation_id: evaluation?.id,
      staffing_shortfall: staffingShortfall,
      message: decision === 'assigned' ? 'Closest eligible unit assignment created.'
        : decision === 'partially_assigned' ? `Closest eligible unit assigned; ${staffingShortfall} additional qualified unit(s) still required.`
        : decision === 'no_eligible_unit' ? 'No eligible unit available.' : 'Shadow recommendation created. Dispatcher retains full control.',
    });
  } catch (error) {
    console.error('geofenceDispatchAssignment failed', error);
    return Response.json({ error: error?.message || 'Unable to evaluate automatic dispatch' }, { status: 500 });
  }
});
