// Shared by the backend feed and every browser live-call consumer.
export const ACTIVE_WINDOW_MS = 60 * 60 * 1000;
const TERMINAL = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
export function callTimestamp(call) {
  const value = call?.time_received || call?.created_date;
  if (!value) return 0;
  const raw = String(value).trim();
  const stamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + 'Z');
  return Number.isFinite(stamp) ? stamp : 0;
}
export function isValidCallRecord(call) {
  if (!call || call.is_test === true || call.is_demo === true || call.is_sample === true) return false;
  const incident = String(call.incident || '').trim();
  const location = String(call.location || '').trim();
  if (!incident || !location || /<\/?(?:html|body|table|script|div)\b/i.test(incident + location)) return false;
  if (/^(?:incident(?: type)?|call type|time received|loading\.{0,3}|no (?:active )?calls(?: found)?)$/i.test(incident)) return false;
  return !['test', 'demo', 'sample'].includes(String(call.lifecycle_status || '').toLowerCase());
}
export function isVisibleActiveCall(call, now = Date.now()) {
  if (!isValidCallRecord(call) || call.manual_dismissed === true || call.time_cleared
    || TERMINAL.has(String(call.status || '').trim().toLowerCase())) return false;
  const stamp = callTimestamp(call);
  const retained = ['public_helpme','dispatch_manual','field_initiated','CAD clone'].includes(call.source) || (call.agency==='BPS' && call.cad_number_source==='bps_internal' && !call.external_call_id) || (Array.isArray(call.assigned_units) && call.assigned_units.some(id=>String(id||'').trim()));
  return stamp > 0 && stamp <= now + 120000 && (retained || now - stamp <= ACTIVE_WINDOW_MS);
}
