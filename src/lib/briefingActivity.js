import { parseServerTimestamp } from './easternTime';
// Activity counts describe what happened while away, independently of dismissal.
export function selectPropertyBriefingAlerts(alerts, _receipts, since, until = Date.now()) {
 const seen = new Set();
 return [...(alerts || [])].sort((a,b)=>String(b.created_date||'').localeCompare(String(a.created_date||''))).filter(item => {
  if (item.is_test === true || ['false_alarm','test'].includes(String(item.lifecycle_status||'').toLowerCase())) return false;
  const created = parseServerTimestamp(item.created_date || item.callTime || item.time_received)?.getTime() || 0;
  if (!created || created > until || (since && created <= since)) return false;
  const key = `${item.callId || item.call_id || item.id}:${item.propertyId || item.property_id || ''}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
 });
}
