import { incidentPriority } from '@/lib/incidentPriority';
import { cadReference } from '@/lib/cadReference';
import { easternTimestampMs } from '@/lib/easternTime';

/**
 * CommandCentral-style service levels for the CAD Center.
 * Each priority escalates on its own clock, measured from call receipt, so a
 * P1 holding for three minutes escalates long before a routine report.
 */
export const CAD_SLA = {
  critical: { code: 'P1', label: 'P1 · Critical', watch: 1, overdue: 3 },
  high: { code: 'P2', label: 'P2 · High', watch: 3, overdue: 8 },
  medium: { code: 'P3', label: 'P3 · Standard', watch: 6, overdue: 15 },
  low: { code: 'P4', label: 'P4 · Low', watch: 10, overdue: 25 },
};

export const cadPriority = call => {
  const value = String(incidentPriority(call) || 'medium').toLowerCase();
  return CAD_SLA[value] ? value : 'medium';
};

/** One trusted received-time anchor, matching the elapsed timer on the board. */
export const cadAnchor = call => {
  const created = easternTimestampMs(call?.created_date);
  const received = easternTimestampMs(call?.time_received);
  if (received && created && Math.abs(received - created) < 24 * 60 * 60 * 1000) return received;
  return created || received || null;
};

export const cadServiceLevel = (call, now = Date.now()) => {
  const priority = cadPriority(call);
  const sla = CAD_SLA[priority];
  const anchor = cadAnchor(call);
  const minutes = anchor ? Math.max(0, (now - anchor) / 60000) : null;
  const state = minutes == null
    ? 'unknown'
    : minutes >= sla.overdue
      ? 'overdue'
      : minutes >= sla.watch
        ? 'watch'
        : 'normal';
  return { priority, code: sla.code, label: sla.label, minutes, state };
};

export const cadAgeLabel = minutes => {
  if (minutes == null) return '—';
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
};

export const cadReferenceValue = call => cadReference(call) || 'REFERENCE PENDING';

export const cadNeedsDispatch = call => !(Array.isArray(call?.assigned_units) && call.assigned_units.length);

export const cadUnitAvailable = unit => String(unit?.status || '') === 'Available'
  && !unit?.connection_stale
  && (unit?.presence_online === true || unit?.session_active === true);

/** One pass over the queue produces every counter on the CAD status bar. */
export const cadTelemetry = (calls = [], units = [], now = Date.now()) => {
  const levels = calls.map(call => cadServiceLevel(call, now));
  return {
    active: calls.length,
    unassigned: calls.filter(cadNeedsDispatch).length,
    urgent: levels.filter(level => level.priority === 'critical' || level.priority === 'high').length,
    overdue: levels.filter(level => level.state === 'overdue').length,
    oldest: levels.reduce((max, level) => Math.max(max, level.minutes ?? 0), 0),
    available: units.filter(cadUnitAvailable).length,
    distress: units.filter(unit => String(unit?.status || '').toLowerCase() === 'distress').length,
    onDuty: units.filter(unit => String(unit?.status || '').toLowerCase() !== 'out of service').length,
  };
};