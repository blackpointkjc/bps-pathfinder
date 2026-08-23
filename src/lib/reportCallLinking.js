import { base44 } from '@/api/base44Client';
import { cleanIncident } from '@/utils/callUtils';

const TERMINAL_CALL_STATUSES = new Set([
  'cleared', 'clear', 'cancelled', 'canceled', 'resolved', 'closed', 'complete', 'completed'
]);

export function isActiveDispatchCall(call) {
  if (!call || call._archived) return false;
  const status = String(call.status || '').trim().toLowerCase();
  if (TERMINAL_CALL_STATUSES.has(status)) return false;
  if (call.cleared === true || call.cancelled === true || call.canceled === true || call.resolved === true) return false;
  return true;
}

export function callDisplayNumber(call) {
  return call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || '';
}

export async function listActiveDispatchCalls(limit = 500) {
  const calls = await base44.entities.DispatchCall.list('-time_received', limit);
  const deduped = new Map();
  for (const call of calls || []) {
    if (!isActiveDispatchCall(call)) continue;
    const descriptionKey = [call.incident, call.location, call.time_received].filter(Boolean).join('|').toLowerCase();
    const key = call.external_call_id || call.original_call_id || call.agency_cad_number || call.bps_reference || call.call_id || descriptionKey || call.id;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, call);
      continue;
    }
    const existingTs = new Date(existing.updated_date || existing.time_received || existing.created_date || 0).getTime();
    const candidateTs = new Date(call.updated_date || call.time_received || call.created_date || 0).getTime();
    if (candidateTs > existingTs) deduped.set(key, call);
  }
  return [...deduped.values()].sort((a, b) => new Date(b.time_received || b.created_date || 0) - new Date(a.time_received || a.created_date || 0));
}

// Returns ALL dispatch calls (active + archived history), deduped by stable key
// and sorted most-recent first. Used by report call-linking so officers can link
// reports to calls that have already aged out of the live CAD queue, and search
// them by any part of the CAD number (e.g. the last 5 digits of the BPS reference).
export async function listAllDispatchCallsForLinking(limit = 1000) {
  const [activeCalls, historyCalls, propertyAlerts] = await Promise.all([
    base44.entities.DispatchCall.list('-time_received', limit).catch(() => []),
    base44.entities.CallHistory.list('-archived_date', limit).catch(() => []),
    base44.entities.PropertyAlert.list('-created_date', limit).catch(() => []),
  ]);

  // Archived calls live in CallHistory with a different shape. Normalize them so
  // the combobox and form helpers can treat them like DispatchCall records. The
  // original DispatchCall id is retained so report links reference the source call.
  const mapHistory = (h) => {
    const callId = h?.call_id || '';
    const bpsRef = h?.bps_reference || (callId.startsWith('BPS-') ? callId : '');
    return {
      id: h?.original_call_id || h?.id,
      original_call_id: h?.original_call_id,
      call_id: callId,
      bps_reference: bpsRef,
      agency_cad_number: '',
      external_call_id: h?.external_call_id,
      incident: h?.incident,
      location: h?.location,
      cross_street: h?.cross_street,
      agency: h?.agency,
      status: h?.status || 'Cleared',
      priority: h?.priority,
      zone: h?.zone,
      latitude: h?.latitude,
      longitude: h?.longitude,
      description: h?.description,
      ai_summary: h?.ai_summary,
      time_received: h?.time_received,
      time_cleared: h?.time_cleared,
      time_closed: h?.time_closed,
      updated_date: h?.archived_date || h?.updated_date,
      created_date: h?.archived_date || h?.created_date,
      _archived: true,
    };
  };

  const propertyByCall = new Map();
  for (const alert of propertyAlerts || []) {
    const key = String(alert.callId || '');
    if (!key || propertyByCall.has(key)) continue;
    propertyByCall.set(key, {
      property_id: alert.propertyId || '',
      property_name: alert.propertyName || '',
      property_call_location: alert.callLocation || '',
      property_call_incident: alert.callIncident || '',
    });
  }

  const merged = [...(activeCalls || []), ...(historyCalls || []).map(mapHistory)].map(call => {
    const property = propertyByCall.get(String(call.id || ''))
      || propertyByCall.get(String(call.original_call_id || ''))
      || null;
    return property ? { ...call, ...property } : call;
  });
  const deduped = new Map();
  for (const call of merged) {
    const descriptionKey = [call.incident, call.location, call.time_received].filter(Boolean).join('|').toLowerCase();
    const key = call.external_call_id || call.original_call_id || call.bps_reference || call.agency_cad_number || call.call_id || descriptionKey || call.id;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, call);
      continue;
    }
    const existingTs = new Date(existing.updated_date || existing.time_received || existing.created_date || 0).getTime();
    const candidateTs = new Date(call.updated_date || call.time_received || call.created_date || 0).getTime();
    if (candidateTs > existingTs) deduped.set(key, call);
  }
  return [...deduped.values()].sort((a, b) => new Date(b.time_received || b.created_date || 0) - new Date(a.time_received || a.created_date || 0));
}

export function applyDispatchCallToForm(prev, call) {
  if (!call) return prev;
  return {
    ...prev,
    linked_call_id: call.id || '',
    linked_call_number: callDisplayNumber(call),
    linked_call_type: cleanIncident(call),
    linked_call_location: call.location || '',
    location: prev.location || call.location || '',
  };
}

export async function createReportCallLink({ callId, callNumber, reportType, reportId, reportNumber = '', primaryOfficerId = '', primaryOfficerName = '' }) {
  if (!callId || !reportId || !reportType) return null;
  const existing = await base44.entities.ReportCallLink.filter({ report_type: reportType, report_id: reportId }).catch(() => []);
  const activeExisting = (existing || []).find(link => link.status !== 'detached');
  const payload = {
    call_id: callId,
    call_number: callNumber || '',
    report_type: reportType,
    report_id: reportId,
    report_number: reportNumber || '',
    primary_officer_id: primaryOfficerId || '',
    primary_officer_name: primaryOfficerName || '',
    linked_at: new Date().toISOString(),
    status: 'active',
  };
  if (activeExisting?.id) return base44.entities.ReportCallLink.update(activeExisting.id, payload);
  return base44.entities.ReportCallLink.create(payload);
}