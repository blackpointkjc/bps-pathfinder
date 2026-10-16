import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function readWithRetry<T>(label: string, loader: () => Promise<T>, fallback: T, maxAttempts = 1): Promise<{ data: T; error: string }> {
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return { data: await loader(), error: '' };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) await wait(250 * (attempt + 1));
    }
  }
  const message = `${label} unavailable: ${lastError?.message || lastError || 'unknown error'}`;
  console.warn(message);
  return { data: fallback, error: message };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const allowed = user.role === 'admin' || Boolean(user.dispatch_role) || roles.has('cad_access') || roles.has('full_access') || roles.has('dispatch') || roles.has('supervisor') || (user.is_supervisor === true || ['corporal','first sergeant','sergeant','sgt','lieutenant','lt','lt colonel','lt col','lieutenant colonel','captain','major','colonel'].includes(String(user.rank || '').toLowerCase().replace(/[.]/g, '').trim()));
    if (!allowed) return Response.json({ error: 'CAD access required' }, { status: 403 });

    // Call history is core data; property-alert enrichment is optional. Never
    // let a slow PropertyAlert read turn hundreds of valid calls into a "0 records"
    // screen. Keep the reads bounded and perform the optional enrichment last.
    const [activeRead, archivedRead, alertRead] = await Promise.all([
      readWithRetry('Active calls', () => base44.asServiceRole.entities.DispatchCall.list('-created_date', 500), []),
      readWithRetry('Archived calls', () => base44.asServiceRole.entities.CallHistory.list('-archived_date', 1000), []),
      readWithRetry('Property alerts', () => base44.asServiceRole.entities.PropertyAlert.list('-created_date', 1000), []),
    ]);
    const active:any[] = activeRead.data || [];
    const archived:any[] = archivedRead.data || [];
    const alerts:any[] = alertRead.data || [];
    if (!active.length && !archived.length && activeRead.error && archivedRead.error) {
      throw new Error(`Call data unavailable. ${activeRead.error}; ${archivedRead.error}`);
    }

    // Keep historical unit attribution even after a call is closed.
    const assignmentRead = await readWithRetry('Call assignments', () => base44.asServiceRole.entities.CallAssignment.list('-assigned_at', 1500), []);
    const userRead = await readWithRetry('Officer directory', () => base44.asServiceRole.entities.User.list('-updated_date', 750), []);
    const unitRead = await readWithRetry('CAD units', () => base44.asServiceRole.entities.Unit.list('-last_update_at', 500), []);
    const usersById = new Map((userRead.data || []).map((person: any) => [String(person.id), person]));
    const unitsById = new Map((unitRead.data || []).map((unit: any) => [String(unit.id), unit]));
    const assignmentsByCall = new Map<string, any[]>();
    for (const assignment of assignmentRead.data || []) {
      const id = String(assignment.call_id || '');
      if (!id) continue;
      if (!assignmentsByCall.has(id)) assignmentsByCall.set(id, []);
      assignmentsByCall.get(id)!.push(assignment);
    }
    const assignmentDetails = (callId: string, existing: any[] = []) => {
      const records = assignmentsByCall.get(callId) || [];
      const ids = [...new Set([...existing.map(String), ...records.map((item: any) => String(item.unit_id || ''))].filter(Boolean))];
      return ids.map(id => {
        const unit = unitsById.get(id);
        const officer = usersById.get(String(unit?.user_id || id));
        const number = officer?.unit_number || unit?.unit_number || '';
        const name = officer?.full_name || [officer?.rank, officer?.last_name || officer?.first_name].filter(Boolean).join(' ');
        const label = [number ? 'Unit ' + number : '', name].filter(Boolean).join(' — ') || 'Unit ID ' + id;
        const assignment = records.find((item: any) => String(item.unit_id) === id);
        return { unit_id: id, label, officer_name: name || '', unit_number: number, role: assignment?.role || '', assigned_at: assignment?.assigned_at || '', status: assignment?.status || '' };
      });
    };
    const activeById = new Map((active || []).map((row: any) => [String(row.id), row]));
    const archivedByOriginalId = new Map<string, any>();
    for (const row of archived || []) {
      if (row?.original_call_id) archivedByOriginalId.set(String(row.original_call_id), row);
    }

    const propertyFingerprint = (time: any, incident: any, location: any) => [
      String(time || ''),
      String(incident || '').trim().toUpperCase(),
      String(location || '').trim().toUpperCase(),
    ].join('|');

    const alertByCallId = new Map<string, any>();
    const alertByFingerprint = new Map<string, any>();
    for (const alert of alerts || []) {
      if (!alert?.callId) continue;
      const key = String(alert.callId);
      const prior = alertByCallId.get(key);
      const currentStamp = new Date(alert.created_date || 0).getTime();
      const priorStamp = new Date(prior?.created_date || 0).getTime();
      const hasTime = Boolean(alert.callTime || alert.time_received);
      const priorHasTime = Boolean(prior?.callTime || prior?.time_received);
      if (!prior || (hasTime && !priorHasTime) || (hasTime === priorHasTime && currentStamp > priorStamp)) alertByCallId.set(key, alert);
      const fp = propertyFingerprint(alert.callTime || alert.time_received, alert.callIncident, alert.callLocation);
      if (fp && !fp.startsWith('|')) {
        const priorFp = alertByFingerprint.get(fp);
        const priorFpStamp = new Date(priorFp?.created_date || 0).getTime();
        if (!priorFp || currentStamp > priorFpStamp) alertByFingerprint.set(fp, alert);
      }
    }

    const decorate = (row: any, source: 'active' | 'archived') => {
      const directOriginalId = source === 'archived' ? String(row.original_call_id || '') : String(row.id || '');
      const fingerprintAlert = source === 'archived'
        ? alertByFingerprint.get(propertyFingerprint(row.time_received || row.created_date, row.incident, row.location))
        : null;
      const alert = (directOriginalId ? alertByCallId.get(directOriginalId) : null) || fingerprintAlert;
      const originalId = directOriginalId || String(fingerprintAlert?.callId || '');
      return {
        ...row,
        original_call_id: source === 'archived' ? (originalId || row.original_call_id || '') : row.original_call_id,
        call_id: row.call_id || fingerprintAlert?.callId || row.id,
        _source: source,
        _assignedUnitDetails: assignmentDetails(originalId, Array.isArray(row.assigned_units) ? row.assigned_units : []),
        _propertyCall: Boolean(alert),
        _propertyAlert: alert || null,
        _propertyName: alert?.propertyName || '',
        _propertyId: alert?.propertyId || '',
        _propertyLifecycle: alert?.lifecycle_status || '',
        _propertyDistanceMeters: Number.isFinite(Number(alert?.distanceMeters)) ? Number(alert.distanceMeters) : null,
      };
    };

    const activeRows = (active || []).map((row: any) => decorate(row, 'active'));
    const archivedRowsRaw = (archived || []).map((row: any) => decorate(row, 'archived'));

    // Older versions could archive the same upstream call repeatedly when the
    // source continued reporting it. Collapse those historical duplicates by the
    // real call timestamp + incident + location so Call History shows one event.
    const historyFingerprint = (row: any) => [
      String(row?.time_received || row?.created_date || ''),
      String(row?.incident || '').trim().toUpperCase(),
      String(row?.location || '').trim().toUpperCase(),
      String(row?.agency || '').trim().toUpperCase(),
    ].join('|');
    const archivedSeen = new Set<string>();
    const archivedRows = archivedRowsRaw
      .sort((a: any, b: any) => new Date(b.archived_date || b.created_date || 0).getTime() - new Date(a.archived_date || a.created_date || 0).getTime())
      .filter((row: any) => {
        const key = historyFingerprint(row);
        if (!key || archivedSeen.has(key)) return false;
        archivedSeen.add(key);
        return true;
      });

    const representedPropertyCallIds = new Set<string>();
    for (const row of activeRows) if (row._propertyCall) representedPropertyCallIds.add(String(row.id));
    for (const row of archivedRows) if (row._propertyCall && row.original_call_id) representedPropertyCallIds.add(String(row.original_call_id));

    // PropertyAlert is the monitoring system's authoritative record. If the linked
    // CAD row is no longer available for any reason, keep the event visible in
    // history instead of silently dropping a property call that the briefing counted.
    const syntheticPropertyRows = [];
    for (const [callId, alert] of alertByCallId.entries()) {
      if (representedPropertyCallIds.has(callId)) continue;
      const activeCall = activeById.get(callId);
      const archivedCall = archivedByOriginalId.get(callId);
      if (activeCall || archivedCall) continue;
      syntheticPropertyRows.push({
        id: `property-alert-${alert.id}`,
        original_call_id: callId,
        call_id: callId,
        time_received: alert.callTime || alert.time_received || alert.created_date,
        created_date: alert.created_date,
        incident: alert.callIncident || 'Monitored Property Call',
        location: alert.callLocation || alert.propertyName || 'Monitored property',
        agency: 'MONITORING',
        status: alert.callStatus || (['resolved', 'false_alarm', 'test'].includes(String(alert.lifecycle_status || '').toLowerCase()) ? 'Closed' : (alert.acknowledged ? 'Closed' : 'Pending')),
        description: alert.description || `Property monitoring alert for ${alert.propertyName || 'monitored property'}`,
        assigned_units: assignmentDetails(callId).map((item: any) => item.unit_id),
        _assignedUnitDetails: assignmentDetails(callId),
        _source: 'property_alert',
        _propertyCall: true,
        _propertyAlert: alert,
        _propertyName: alert.propertyName || '',
        _propertyId: alert.propertyId || '',
        _propertyLifecycle: alert.lifecycle_status || '',
        _propertyDistanceMeters: Number.isFinite(Number(alert.distanceMeters)) ? Number(alert.distanceMeters) : null,
      });
    }

    return Response.json({
      success: true,
      rows: [...activeRows, ...archivedRows, ...syntheticPropertyRows],
      counts: {
        active: activeRows.length,
        archived: archivedRows.length,
        propertyAlerts: alertByCallId.size,
        syntheticPropertyRows: syntheticPropertyRows.length,
      },
      warnings: [activeRead.error, archivedRead.error, alertRead.error, assignmentRead.error, userRead.error, unitRead.error].filter(Boolean),
    });
  } catch (error) {
    console.error('getCallHistoryFeed failed:', error);
    return Response.json({ error: error?.message || 'Unable to load call history' }, { status: 500 });
  }
});
