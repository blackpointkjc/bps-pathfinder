// Public CAD timestamps identify when the agency received the call, not when
// Pathfinder's polling job first observed it. Never confuse those two clocks.
export const LIVE_PROPERTY_UPSTREAM_MAX_AGE_MS = 15 * 60 * 1000;
export function propertyAlertUpstreamDelayMs(alert, now=Date.now()) {
  const received=Date.parse(String(alert?.callTime || alert?.time_received || alert?.timeReceived || ''));
  const detected=Date.parse(String(alert?.created_date || alert?.detectedAt || ''));
  if (!Number.isFinite(received) || !Number.isFinite(detected)) return null;
  return Math.max(0, detected-received);
}
export function propertyAlertWasTimely(alert) {
  const delay=propertyAlertUpstreamDelayMs(alert);
  // Missing upstream timing is not proof that a call was received just now.
  return delay !== null && delay <= LIVE_PROPERTY_UPSTREAM_MAX_AGE_MS;
}
export function propertyAlertDelayLabel(alert) {
  const delay=propertyAlertUpstreamDelayMs(alert);
  if(delay===null)return 'Upstream call time unavailable';
  const minutes=Math.max(0,Math.floor(delay/60000));
  return minutes===0 ? 'Received and detected within one minute' : `Public-source delay: ${minutes} minute${minutes===1?'':'s'}`;
}
