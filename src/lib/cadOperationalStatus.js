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

export const cadAgeMinutes = (call, now = Date.now()) => {
  const anchor = cadAnchor(call);
  return anchor ? Math.max(0, (now - anchor) / 60000) : 0;
};

/** ok → watch → overdue for one incident, on its own priority clock. */
export const cadServiceLevel = (call, now = Date.now()) => {
  const priority = cadPriority(call);
  const sla = CAD_SLA[priority];
  const minutes = cadAgeMinutes(call, now);
  return {
    priority,
    code: sla.code,
    label: sla.label,
    minutes,
    unassigned: cadNeedsDispatch(call),
    target: sla.overdue,
    state: minutes >= sla.overdue ? 'overdue' : minutes >= sla.watch ? 'watch' : 'ok',
  };
};

export const cadAgeLabel = minutes => {
  if (minutes == null) return '—';
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return 'under 1m';
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
};

/** Display reference for an incident, matching the command board. */
export const cadReferenceValue = call => cadReference(call) || 'REFERENCE PENDING';

export const cadNeedsDispatch = call => !(Array.isArray(call?.assigned_units) && call.assigned_units.length);
export const cadUnassigned = cadNeedsDispatch;

export const cadUnitAvailable = unit => String(unit?.status || '') === 'Available'
  && !unit?.connection_stale
  && (unit?.presence_online === true || unit?.session_active === true);

const unitStatus = unit => String(unit?.status || '').trim().toLowerCase();

/** One pass over the queue produces every counter on the CAD status bar. */
export const cadTelemetry = (calls = [], units = [], now = Date.now()) => {
  const rows = (calls || []).filter(Boolean);
  const levels = rows.map(call => ({ call, level: cadServiceLevel(call, now) }));
  const roster = (units || []).filter(Boolean);
  const onDuty = roster.filter(unit => unitStatus(unit) && unitStatus(unit) !== 'out of service');
  const oldest = levels.reduce((worst, row) => (!worst || row.level.minutes > worst.level.minutes ? row : worst), null);
  return {
    active: rows.length,
    unassigned: levels.filter(row => row.level.unassigned).length,
    urgent: levels.filter(row => ['critical', 'high'].includes(row.level.priority)).length,
    overdue: levels.filter(row => row.level.state === 'overdue').length,
    watch: levels.filter(row => row.level.state === 'watch').length,
    oldest: oldest?.level.minutes || 0,
    oldestMinutes: oldest?.level.minutes || 0,
    oldestCall: oldest?.call || null,
    available: roster.filter(cadUnitAvailable).length,
    distress: roster.filter(unit => unitStatus(unit) === 'distress').length,
    onDuty: onDuty.length,
    levels,
  };
};