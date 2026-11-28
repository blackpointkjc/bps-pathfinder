import { incidentPriority } from '@/lib/incidentPriority';
import { easternTimestampMs } from '@/lib/easternTime';

/**
 * CommandCentral-style service levels for the CAD Center.
 * Each priority escalates on its own clock (minutes from call receipt), so a
 * P1 holding for three minutes escalates the board long before a routine report.
 */
export const CAD_SLA = {
  critical: { code: 'P1', watch: 1, overdue: 3 },
  high: { code: 'P2', watch: 3, overdue: 8 },
  medium: { code: 'P3', watch: 6, overdue: 15 },
  low: { code: 'P4', watch: 10, overdue: 25 },
};

export const cadPriority = call => {
  const value = String(incidentPriority(call) || 'medium').toLowerCase();
  return CAD_SLA[value] ? value : 'medium';
};

/** One trusted received-time anchor, matching the elapsed timer on the board. */
export const cadAnchor = call => {
  const created = easternTimestampMs(call?.created_date);
  const received = easternTimestampMs(call?.time_received);
  if (received && created && Math.abs(received - created) < 86400000) return received;
  return created || received || null;
};

export const cadUnassigned = call => !(Array.isArray(call?.assigned_units) && call.assigned_units.length);

export const cadAgeMinutes = (call, now = Date.now()) => {
  const anchor = cadAnchor(call);
  return anchor ? Math.max(0, (now - anchor) / 60000) : 0;
};

export const cadAgeLabel = minutes => {
  const value = Math.max(0, Math.floor(Number(minutes) || 0));
  if (value < 1) return 'under 1m';
  if (value < 60) return `${value}m`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
};

/** ok → watch → overdue for one incident. */
export const cadServiceLevel = (call, now = Date.now()) => {
  const priority = cadPriority(call);
  const sla = CAD_SLA[priority];
  const minutes = cadAgeMinutes(call, now);
  return {
    priority,
    code: sla.code,
    minutes,
    unassigned: cadUnassigned(call),
    target: sla.overdue,
    state: minutes >= sla.overdue ? 'overdue' : minutes >= sla.watch ? 'watch' : 'ok',
  };
};

const unitStatus = unit => String(unit?.status || '').trim().toLowerCase();

/** Board telemetry shared by the CAD status bar and the resource board. */
export const cadTelemetry = (calls = [], units = [], now = Date.now()) => {
  const rows = (calls || []).filter(Boolean);
  const levels = rows.map(call => ({ call, level: cadServiceLevel(call, now) }));
  const onDuty = (units || []).filter(unit => unitStatus(unit) && unitStatus(unit) !== 'out of service');
  const oldest = levels.reduce((worst, row) => (!worst || row.level.minutes > worst.level.minutes ? row : worst), null);
  return {
    active: rows.length,
    unassigned: levels.filter(row => row.level.unassigned).length,
    urgent: levels.filter(row => ['critical', 'high'].includes(row.level.priority)).length,
    overdue: levels.filter(row => row.level.state === 'overdue').length,
    watch: levels.filter(row => row.level.state === 'watch').length,
    onDuty: onDuty.length,
    available: onDuty.filter(unit => unitStatus(unit) === 'available').length,
    distress: (units || []).filter(unit => unitStatus(unit) === 'distress').length,
    oldestMinutes: oldest?.level.minutes || 0,
    oldestCall: oldest?.call || null,
    levels,
  };
};

/** Display reference for an incident, matching the command board. */
export const cadReferenceValue = call => {
  const official = String(call?.agency_cad_number || (call?.official_cad_verified ? call?.call_id : '') || '').trim();
  const compact = value => String(value || '').trim().replace(/^(BPS-\d{6}-)0+(\d+)$/i, '$1$2');
  const bps = compact(call?.bps_reference);
  const legacy = compact(call?.call_id);
  if (official) return official;
  if (bps) return bps;
  if (legacy && !/^B\d+$/i.test(legacy)) return legacy;
  return 'Reference pending';
};