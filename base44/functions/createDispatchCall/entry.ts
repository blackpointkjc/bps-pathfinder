import { createClientFromRequest } from 'npm:@base44/sdk';

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat: number, lng: number, polygon: any[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = Number(Array.isArray(polygon[i]) ? polygon[i][0] : polygon[i]?.lat);
    const xi = Number(Array.isArray(polygon[i]) ? polygon[i][1] : polygon[i]?.lng);
    const yj = Number(Array.isArray(polygon[j]) ? polygon[j][0] : polygon[j]?.lat);
    const xj = Number(Array.isArray(polygon[j]) ? polygon[j][1] : polygon[j]?.lng);
    if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function callIsInsideProperty(call: any, location: any) {
  const lat = Number(call?.latitude);
  const lng = Number(call?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

  // Manual CAD calls follow the exact same rule as imported calls: only the
  // custom Property Monitoring polygon saved on the Location page can create a
  // PropertyAlert. No address, radius, or alternate geofence fallback is allowed.
  const polygon = Array.isArray(location.property_monitoring_polygon)
    ? location.property_monitoring_polygon
    : [];
  if (polygon.length < 3) return null;

  return pointInPolygon(lat, lng, polygon) ? 0 : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access') || Boolean(user.dispatch_role);
    if (!allowed) return Response.json({ error: 'Dispatch access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const data = body.data || {};
    const requestedUnits = Array.isArray(body.selected_units) ? [...new Set(body.selected_units.filter(Boolean).map(String))] : [];
    if (!String(data.incident || '').trim() || !String(data.location || '').trim()) {
      return Response.json({ error: 'Incident type and location are required' }, { status: 400 });
    }

    // Normalize every selected unit to the immutable User id when a person is
    // behind it. Older CAD screens may send a Unit id or ActiveOfficer session id;
    // storing that transient id would make the officer queue unable to see the call.
    const selectedUnits: string[] = [];
    for (const rawUnitId of requestedUnits) {
      let selectedOfficer = await base44.asServiceRole.entities.User.get(rawUnitId).catch(() => null);
      if (!selectedOfficer?.email) {
        const unitRecord = await base44.asServiceRole.entities.Unit.get(rawUnitId).catch(() => null);
        if (unitRecord?.user_id) selectedOfficer = await base44.asServiceRole.entities.User.get(unitRecord.user_id).catch(() => null);
        if (!selectedOfficer?.email && unitRecord?.user_email) {
          const matches = await base44.asServiceRole.entities.User.filter({ email: unitRecord.user_email }, '-updated_date', 1).catch(() => []);
          selectedOfficer = matches?.[0] || null;
        }
      }
      if (!selectedOfficer?.email) {
        const liveSession = await base44.asServiceRole.entities.ActiveOfficer.get(rawUnitId).catch(() => null);
        if (liveSession?.officer_email) {
          const matches = await base44.asServiceRole.entities.User.filter({ email: liveSession.officer_email }, '-updated_date', 1).catch(() => []);
          selectedOfficer = matches?.[0] || null;
        }
      }

      const canonicalUnitId = String(selectedOfficer?.id || rawUnitId);
      if (!selectedUnits.includes(canonicalUnitId)) selectedUnits.push(canonicalUnitId);
      if (!selectedOfficer?.email) continue; // Spare/non-user unit records remain supported.

      const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter(
        { officer_email: String(selectedOfficer.email).trim().toLowerCase() },
        '-last_update',
        5,
      ).catch(() => []);
      const newestSession = (sessions || []).sort((a: any, b: any) =>
        new Date(b.last_update || b.updated_date || b.created_date || 0).getTime()
        - new Date(a.last_update || a.updated_date || a.created_date || 0).getTime()
      )[0];
      const sessionAt = new Date(newestSession?.last_update || newestSession?.updated_date || newestSession?.created_date || 0).getTime();
      const heartbeatFresh = newestSession?.session_active !== false
        && Number.isFinite(sessionAt)
        && sessionAt >= Date.now() - 15 * 60 * 1000;
      if (!heartbeatFresh) {
        return Response.json({
          error: `${selectedOfficer.unit_number ? `Unit ${selectedOfficer.unit_number}` : selectedOfficer.full_name || selectedOfficer.email} has a stale Pathfinder connection and cannot be app-dispatched until the device heartbeat recovers.`,
          code: 'UNIT_CONNECTION_STALE',
          officer_email: selectedOfficer.email,
        }, { status: 409 });
      }
    }

    const allowedPriorities = new Set(['low', 'medium', 'high', 'critical']);
    const priority = allowedPriorities.has(data.priority) ? data.priority : 'medium';
    const now = new Date().toISOString();
    const createdCall = await base44.asServiceRole.entities.DispatchCall.create({
      ...data,
      priority,
      assigned_units: selectedUnits,
      status: selectedUnits.length ? 'Dispatched' : (data.status || 'New'),
      time_received: data.time_received || now,
      time_dispatched: selectedUnits.length ? (data.time_dispatched || now) : null,
    });

    const locations = await base44.asServiceRole.entities.Location.list('site_name', 300).catch(() => []);
    const monitoredMatches = (locations || [])
      .filter((location: any) => location.active !== false && location.property_monitoring_enabled === true)
      .map((location: any) => ({ location, distance: callIsInsideProperty(createdCall, location) }))
      .filter((match: any) => match.distance !== null);

    const assignmentWrites = selectedUnits.map((unitId: any, index: number) =>
      base44.asServiceRole.entities.CallAssignment.create({
        call_id: createdCall.id,
        unit_id: unitId,
        role: index === 0 ? 'primary' : 'backup',
        assigned_at: now,
        status: 'pending',
      })
    );

    const alertWrites = monitoredMatches.map(({ location, distance }: any) => {
      const sourceKey = [
        String(location.id || ''),
        String(createdCall.external_call_id || createdCall.agency_cad_number || createdCall.bps_reference || createdCall.call_id || createdCall.id || ''),
        String(createdCall.incident || '').trim().toUpperCase(),
        String(createdCall.location || '').trim().toUpperCase(),
      ].join('|');
      return base44.asServiceRole.entities.PropertyAlert.create({
        callId: createdCall.id,
        propertyId: location.id,
        propertyName: location.site_name || 'Monitored Property',
        callIncident: createdCall.incident || 'Unknown incident',
        callLocation: createdCall.location || '',
        callPriority: createdCall.priority || 'medium',
        callStatus: createdCall.status || 'New',
        cadNumber: String(createdCall.agency_cad_number || createdCall.bps_reference || createdCall.call_id || createdCall.id || ''),
        callTime: createdCall.time_received || createdCall.created_date || now,
        time_received: createdCall.time_received || createdCall.created_date || now,
        source_key: sourceKey,
        distanceMeters: Number(distance || 0),
        acknowledged: false,
        description: `Call is inside the ${location.site_name || 'monitored'} property boundary.`,
      });
    });

    const warnings:string[] = [];
    const assignmentResults = await Promise.allSettled(assignmentWrites);
    const failedAssignments = assignmentResults.filter((result:any) => result.status === 'rejected');
    if (failedAssignments.length) {
      warnings.push(`${failedAssignments.length} unit assignment record${failedAssignments.length === 1 ? '' : 's'} could not be written immediately.`);
      console.warn('Dispatch call saved with assignment write failures', failedAssignments);
    }

    const propertyAlertResults = await Promise.allSettled(alertWrites);
    const propertyAlerts = propertyAlertResults
      .filter((result:any) => result.status === 'fulfilled')
      .map((result:any) => result.value);
    const failedPropertyAlerts = propertyAlertResults.filter((result:any) => result.status === 'rejected');
    if (failedPropertyAlerts.length) {
      warnings.push('The call was saved, but one monitored-property alert will need automatic retry.');
      console.warn('Dispatch call saved with property alert write failures', failedPropertyAlerts);
    }
    // A manually created CAD call inside a monitored property must enter the same
    // verified property-alert evaluation path as an imported emergency call.
    // Evaluation is attached to the saved PropertyAlert identity, so refreshes
    // and realtime reconnects cannot create a second assignment.
    await Promise.all(propertyAlerts.flatMap((propertyAlert: any) => [
      base44.asServiceRole.functions.invoke('notifyPropertyAlertSms', {
        property_alert_id: propertyAlert.id,
      }).catch((error: any) => {
        console.error('Property-call SMS notification failed', {
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error),
        });
        return null;
      }),
      base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', {
        call_id: createdCall.id,
        property_alert_id: propertyAlert.id,
      }).catch((error: any) => {
        console.error('Automatic property-dispatch evaluation failed', {
          call_id: createdCall.id,
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error),
        });
        return null;
      })
    ]));

    const cadNumber = createdCall.agency_cad_number || createdCall.bps_reference || createdCall.call_id || createdCall.id;
    const priorityEvent = priority === 'critical' || priority === 'high';
    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id: createdCall.id,
      incident_type: createdCall.incident || '',
      location: createdCall.location || '',
      old_status: '',
      new_status: createdCall.status || 'New',
      unit_name: user.unit_number || user.full_name || user.email || 'Dispatch',
      notes: 'Verified new CAD call created',
      latitude: createdCall.latitude,
      longitude: createdCall.longitude,
      event_key: `call:${createdCall.id}:created`,
      event_type: priorityEvent ? 'priority_call' : 'new_call',
      announcement_text: `${priorityEvent ? 'New priority call received' : 'New call received'}. ${createdCall.incident || 'Call for service'}. Priority ${priority}. CAD number ${cadNumber}.`,
      announcement_priority: priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'normal',
      cad_number: String(cadNumber),
      triggering_action: 'createDispatchCall',
      audio_enabled: true,
      sensitive: false,
    }).catch((error:any) => {
      warnings.push('The call was saved, but its CAD audio/log event did not post immediately.');
      console.error('CallStatusLog create failed after call save', error?.message || error);
      return null;
    });

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'DispatchCall',
      entity_id: createdCall.id,
      action: 'create',
      actor_id: user.id,
      actor_name: [user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email,
      after_value: JSON.stringify(createdCall),
      timestamp: now,
    }).catch(() => null);

    return Response.json({
      success: true,
      call: createdCall,
      property_alerts_created: propertyAlerts.length,
      warnings,
    });
  } catch (error) {
    console.error('createDispatchCall failed', error);
    return Response.json({ error: error?.message || 'Unable to create dispatch call' }, { status: 500 });
  }
});
