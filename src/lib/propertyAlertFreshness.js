// Public CAD timestamps identify when the agency received the call, not when
// Pathfinder's polling job first observed it. Never confuse those two clocks.
export const LIVE_PROPERTY_UPSTREAM_MAX_AGE_MS = 15 * 60 * 1000;
export function parseCadUtcTime(value) {
  const raw=String(value || '').trim();
  if (!raw) return NaN;
  // Base44 entity timestamps may omit a UTC suffix; treat them as UTC, not
  // the operator's local browser time zone.
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`);
}
export function propertyAlertUpstreamDelayMs(alert) {
  const received=parseCadUtcTime(alert?.callTime || alert?.time_received || alert?.timeReceived);
  const detected=parseCadUtcTime(alert?.created_date || alert?.detectedAt);
  if (!Number.isFinite(received) || !Number.isFinite(detected)) return null;
  return Math.max(0, detected-received);
}
export function propertyAlertWasTimely(alert) {
  const detected=parseCadUtcTime(alert?.created_date||alert?.detectedAt);
  const status=String(alert?.callStatus||'').trim().toLowerCase();
  const lifecycle=String(alert?.lifecycle_status||'').trim().toLowerCase();
  return Number.isFinite(detected)&&alert?.is_test!==true&&!['cleared','cancelled','canceled','closed','resolved','completed'].includes(status)&&!['resolved','false_alarm','test','inactive','closed'].includes(lifecycle);
}
export function propertyAlertDelayLabel(alert) {
  const delay=propertyAlertUpstreamDelayMs(alert);
  if(delay===null)return 'Upstream call time unavailable';
  const minutes=Math.max(0,Math.floor(delay/60000));
  return minutes===0 ? 'Received and detected within one minute' : `Public-source delay: ${minutes} minute${minutes===1?'':'s'}`;
}
