import { base44 } from '@/api/base44Client';
import { cleanIncident } from '@/utils/callUtils';

const TERMINAL_CALL_STATUSES = new Set([
  'cleared', 'clear', 'cancelled', 'canceled', 'resolved', 'closed', 'complete', 'completed'
]);

export function isActiveDispatchCall(call) {
  if (!call) return false;
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

// Returns ALL dispatch calls (active + cleared/history), deduped by stable key
// and sorted most-recent first. Used by report call-linking so officers can link
// reports to calls that have already moved to history, and search them by CAD number.
export async function listAllDispatchCallsForLinking(limit = 1000) {
  const calls = await base44.entities.DispatchCall.list('-time_received', limit);
  const deduped = new Map();
  for (const call of calls || []) {
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