import { createClientFromRequest } from 'npm:@base44/sdk';

const terminal = new Set(['cleared','clear','cancelled','canceled','resolved','closed','complete','completed']);
const lower = (v:any) => String(v || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map((r:string) => lower(r)));
    const allowed = me.role === 'admin' || lower(me.role) === 'dispatch' || me.dispatch_role === true || roles.has('dispatch') || roles.has('cad_access') || roles.has('full_access') || roles.has('officer') || roles.has('supervisor');
    if (!allowed) return Response.json({ error: 'Operational access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(50, Math.min(3000, Number(body?.limit || 1500)));
    const [live, history, alerts] = await Promise.all([
      base44.asServiceRole.entities.DispatchCall.list('-time_received', limit).catch(() => []),
      base44.asServiceRole.entities.CallHistory.list('-archived_date', limit).catch(() => []),
      base44.asServiceRole.entities.PropertyAlert.list('-created_date', limit).catch(() => []),
    ]);

    const propertyByCall = new Map<string, any>();
    for (const alert of alerts || []) {
      const key = String(alert.callId || '');
      if (!key || propertyByCall.has(key)) continue;
      propertyByCall.set(key, {
        property_id: alert.propertyId || '',
        property_name: alert.propertyName || '',
        property_call_location: alert.callLocation || '',
        property_call_incident: alert.callIncident || '',
      });
    }

    const normalizeHistory = (h:any) => {
      const callId = h?.call_id || h?.agency_cad_number || h?.bps_reference || '';
      const id = h?.original_call_id || h?.id;
      return {
        ...h,
        id,
        original_call_id: h?.original_call_id || id,
        call_id: callId,
        bps_reference: h?.bps_reference || (/^BPS-/i.test(callId) ? callId : ''),
        agency_cad_number: h?.agency_cad_number || '',
        incident: h?.incident || h?.incident_type || h?.call_type || '',
        location: h?.location || h?.address || '',
        time_received: h?.time_received || h?.call_time || h?.created_date || '',
        status: h?.status || 'Cleared',
        updated_date: h?.archived_date || h?.updated_date || h?.created_date,
        _archived: true,
      };
    };

    const merged = [...(live || []).map((c:any) => ({...c, _archived:false})), ...(history || []).map(normalizeHistory)]
      .map((call:any) => {
        const property = propertyByCall.get(String(call.id || '')) || propertyByCall.get(String(call.original_call_id || ''));
        return property ? { ...call, ...property } : call;
      });

    const deduped = new Map<string, any>();
    for (const call of merged) {
      const fallback = [call.incident, call.location, call.time_received].filter(Boolean).join('|').toLowerCase();
      const key = String(call.external_call_id || call.original_call_id || call.agency_cad_number || call.bps_reference || call.call_id || fallback || call.id);
      const prior = deduped.get(key);
      if (!prior) { deduped.set(key, call); continue; }
      // Prefer live row over history for the same call; otherwise newest row wins.
      if (prior._archived && !call._archived) { deduped.set(key, call); continue; }
      if (prior._archived === call._archived) {
        const a = new Date(prior.updated_date || prior.time_received || prior.created_date || 0).getTime();
        const b = new Date(call.updated_date || call.time_received || call.created_date || 0).getTime();
        if (b > a) deduped.set(key, call);
      }
    }

    const calls = [...deduped.values()].sort((a:any,b:any) => new Date(b.time_received || b.created_date || 0).getTime() - new Date(a.time_received || a.created_date || 0).getTime());
    const activeCount = calls.filter((c:any) => !c._archived && !terminal.has(lower(c.status))).length;
    return Response.json({ success:true, calls, active_count: activeCount, history_count: calls.length - activeCount });
  } catch (error) {
    console.error('getDispatchCallLinkFeed failed', error);
    return Response.json({ error: error?.message || 'Unable to load dispatch call link feed', calls: [] }, { status: 500 });
  }
});