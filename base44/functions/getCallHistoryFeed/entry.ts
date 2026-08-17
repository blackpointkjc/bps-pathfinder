import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const allowed = user.role === 'admin' || Boolean(user.dispatch_role) || roles.has('cad_access') || roles.has('full_access') || roles.has('dispatch') || roles.has('supervisor');
    if (!allowed) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const [active, archived, alerts] = await Promise.all([
      base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.CallHistory.list('-archived_date', 2000).catch(() => []),
      base44.asServiceRole.entities.PropertyAlert.list('-created_date', 3000).catch(() => []),
    ]);

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
      if (!prior || currentStamp > priorStamp) alertByCallId.set(key, alert);
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
      const alert = directOriginalId ? alertByCallId.get(directOriginalId) : fingerprintAlert;
      const originalId = directOriginalId || String(fingerprintAlert?.callId || '');
      return {
        ...row,
        original_call_id: source === 'archived' ? (originalId || row.original_call_id || '') : row.original_call_id,
        call_id: row.call_id || fingerprintAlert?.callId || row.id,
        _source: source,
        _propertyCall: Boolean(alert),
        _propertyAlert: alert || null,
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
        status: alert.acknowledged ? 'Closed' : 'Pending',
        description: alert.description || `Property monitoring alert for ${alert.propertyName || 'monitored property'}`,
        assigned_units: [],
        _source: 'property_alert',
        _propertyCall: true,
        _propertyAlert: alert,
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
    });
  } catch (error) {
    console.error('getCallHistoryFeed failed:', error);
    return Response.json({ error: error?.message || 'Unable to load call history' }, { status: 500 });
  }
});
