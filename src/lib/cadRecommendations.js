const FRESH_FIX_MS = 5 * 60 * 1000;

const point = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return [latitude, longitude];
};

const freshPoint = unit => {
  if (!unit || unit.live_location_hidden === true) return null;
  const stamp = Date.parse(String(unit.gps_updated_at || unit.last_gps_updated_at || ''));
  if (!Number.isFinite(stamp) || Date.now() - stamp > FRESH_FIX_MS) return null;
  return point(unit.latitude, unit.longitude);
};

export function cadDistanceMiles(from, to) {
  if (!from || !to) return null;
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Why a unit cannot take a new call, mirroring the dispatch assignment rules. */
export function cadUnitBlockReason(unit) {
  if (!unit) return 'Unavailable';
  if (unit.dispatch_hold_new_calls === true) return 'Dispatch hold';
  if (unit.session_active === false || unit.presence_state === 'offline') return 'Offline';
  if (unit.connection_stale || unit.presence_state === 'stale') return 'Connection stale';
  const status = String(unit.status || '').trim().toLowerCase();
  if (['out of service', 'out-of-service', 'oos', 'distress', 'offline'].includes(status)) return unit.status;
  return '';
}

const activeLoad = unit => {
  if (Array.isArray(unit?.assigned_call_ids) && unit.assigned_call_ids.length) return unit.assigned_call_ids.length;
  if (unit?.current_call_id) return 1;
  return 0;
};

/**
 * Ranks eligible field units for one incident using availability, distance from
 * the call and how much work the unit is already carrying. Returns nothing when
 * no unit qualifies, so the board never recommends a unit it cannot dispatch.
 */
export function cadRecommendUnits(call, units = [], limit = 3) {
  const target = point(call?.latitude, call?.longitude);
  const assigned = new Set((call?.assigned_units || []).map(String));
  return units
    .filter(unit => unit && !assigned.has(String(unit.id)))
    .map(unit => {
      const blocked = cadUnitBlockReason(unit);
      const distance = target ? cadDistanceMiles(target, freshPoint(unit)) : null;
      const load = activeLoad(unit);
      const status = String(unit.status || '').trim();
      const statusBonus = status === 'Available' ? 26 : status === 'Busy' ? 4 : 10;
      const distanceBonus = distance == null ? 6 : Math.max(0, 26 - distance * 2.6);
      const reasons = [];
      if (status) reasons.push(status);
      reasons.push(distance == null ? 'No live GPS fix' : `${distance.toFixed(1)} mi`);
      if (load) reasons.push(`${load} active call${load === 1 ? '' : 's'}`);
      return {
        unit,
        distance,
        blocked,
        score: Math.round((blocked ? 0 : 60) + statusBonus + distanceBonus - load * 8),
        reasons,
      };
    })
    .filter(item => !item.blocked)
    .sort((a, b) => b.score - a.score || (a.distance ?? Infinity) - (b.distance ?? Infinity))
    .slice(0, limit);
}