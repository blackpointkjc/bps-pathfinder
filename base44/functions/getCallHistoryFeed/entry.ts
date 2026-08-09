import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

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

    const alertByCallId = new Map<string, any>();
    for (const alert of alerts || []) {
      if (!alert?.callId) continue;
      const key = String(alert.callId);
      const prior = alertByCallId.get(key);
      const currentStamp = new Date(alert.created_date || 0).getTime();
      const priorStamp = new Date(prior?.created_date || 0).getTime();
      if (!prior || currentStamp > priorStamp) alertByCallId.set(key, alert);
    }

    const decorate = (row: any, source: 'active' | 'archived') => {
      const originalId = source === 'archived' ? String(row.original_call_id || '') : String(row.id || '');
      const alert = originalId ? alertByCallId.get(originalId) : null;
      return {
        ...row,
        _source: source,
        _propertyCall: Boolean(alert),
        _propertyAlert: alert || null,
      };
    };

    const activeRows = (active || []).map((row: any) => decorate(row, 'active'));
    const archivedRows = (archived || []).map((row: any) => decorate(row, 'archived'));

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
        time_received: alert.created_date,
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
