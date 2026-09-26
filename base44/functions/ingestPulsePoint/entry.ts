import { createClientFromRequest } from 'npm:@base44/sdk';
import { createDecipheriv, createHash } from 'node:crypto';

const HASH_PASSWORD = 'tombrady5rings';
const GIBA_URL = 'https://web.pulsepoint.org/DB/giba.php?agency_id=';
const GABC_URL = 'https://web.pulsepoint.org/DB/gabc.php';
const AGENCY_DATA_URL = 'https://web.pulsepoint.org/DB/GeolocationAgency.php?id=';
const DEFAULT_AREAS = [
  { key: 'richmond_va', label: 'Richmond, VA', lat: 37.5407, lng: -77.4360, source: 'richmond' },
  { key: 'chesterfield_va', label: 'Chesterfield County, VA', lat: 37.3771, lng: -77.50499, source: 'chesterfield' },
];

const DEFAULT_AGENCIES = [
  { agencyId: '76000', agencyKey: '76000', name: 'City of Richmond [VA]', shortName: 'City of Richmond', type: 'Fire/EMS', source: 'richmond', area: 'Richmond, VA', areaLat: 37.5407, areaLng: -77.4360 },
  { agencyId: 'EMS1402', agencyKey: 'EMS1402', name: 'Chesterfield Co [VA]', shortName: 'Chesterfield Co', type: 'Fire/EMS', source: 'chesterfield', area: 'Chesterfield County, VA', areaLat: 37.3771, areaLng: -77.50499 },
];

const CALL_TYPES: Record<string, string> = {
  AA: 'Auto Aid', MU: 'Mutual Aid', ST: 'Strike Team/Task Force', AC: 'Aircraft Crash', AE: 'Aircraft Emergency', AES: 'Aircraft Emergency Standby',
  LZ: 'Landing Zone', AED: 'AED Alarm', OA: 'Alarm', CMA: 'Carbon Monoxide', FA: 'Fire Alarm', MA: 'Manual Alarm', SD: 'Smoke Detector', TRBL: 'Trouble Alarm',
  WFA: 'Waterflow Alarm', FL: 'Flooding', LR: 'Ladder Request', LA: 'Lift Assist', PA: 'Police Assist', PS: 'Public Service', SH: 'Sheared Hydrant',
  EX: 'Explosion', PE: 'Pipeline Emergency', TE: 'Transformer Explosion', AF: 'Appliance Fire', CHIM: 'Chimney Fire', CF: 'Commercial Fire',
  WSF: 'Confirmed Structure Fire', WVEG: 'Confirmed Vegetation Fire', CB: 'Controlled Burn/Prescribed Fire', ELF: 'Electrical Fire', EF: 'Extinguished Fire',
  FIRE: 'Fire', FULL: 'Full Assignment', IF: 'Illegal Fire', MF: 'Marine Fire', OF: 'Outside Fire', PF: 'Pole Fire', GF: 'Refuse/Garbage Fire',
  RF: 'Residential Fire', SF: 'Structure Fire', VEG: 'Vegetation Fire', VF: 'Vehicle Fire', WCF: 'Working Commercial Fire', WRF: 'Working Residential Fire',
  BT: 'Bomb Threat', EE: 'Electrical Emergency', EM: 'Emergency', ER: 'Emergency Response', GAS: 'Gas Leak', HC: 'Hazardous Condition', HMR: 'Hazmat Response',
  TD: 'Tree Down', WE: 'Water Emergency', AI: 'Arson Investigation', HMI: 'Hazmat Investigation', INV: 'Investigation', OI: 'Odor Investigation',
  SI: 'Smoke Investigation', LO: 'Lockout', CL: 'Commercial Lockout', RL: 'Residential Lockout', VL: 'Vehicle Lockout', IFT: 'Interfacility Transfer',
  ME: 'Medical Emergency', MCI: 'Multi Casualty', EQ: 'Earthquake', FLW: 'Flood Warning', TOW: 'Tornado Warning', TSW: 'Tsunami Warning',
  CA: 'Community Activity', FW: 'Fire Watch', NO: 'Notification', STBY: 'Standby', TEST: 'Test', TRNG: 'Training', UNK: 'Unknown',
  AR: 'Animal Rescue', CR: 'Cliff Rescue', CSR: 'Confined Space', ELR: 'Elevator Rescue', RES: 'Rescue', RR: 'Rope Rescue', TR: 'Technical Rescue',
  TNR: 'Trench Rescue', USAR: 'Urban Search and Rescue', VS: 'Vessel Sinking', WR: 'Water Rescue', TCE: 'Expanded Traffic Collision',
  RTE: 'Railroad/Train Emergency', TC: 'Traffic Collision', TCS: 'Traffic Collision Involving Structure', TCT: 'Traffic Collision Involving Train', WA: 'Wires Arcing', WD: 'Wires Down',
};

const UNIT_STATUS: Record<string, string> = {
  DP: 'Dispatched', AK: 'Acknowledged', ER: 'Enroute', OS: 'On Scene', TR: 'Transport', TA: 'Transport Arrived', AQ: 'Available in Quarters', AR: 'Available on Radio', AE: 'Available on Scene',
};

function decodePulsePoint(data: any) {
  if (!data?.ct || !data?.iv || !data?.s) throw new Error('Unexpected PulsePoint encoded response');
  const cipherText = Buffer.from(data.ct, 'base64');
  const initVector = Buffer.from(data.iv, 'hex');
  const salt = Buffer.from(data.s, 'hex');
  let key = Buffer.alloc(0);
  let intermediateHash: Buffer | null = null;
  while (key.length < 32) {
    const hash = createHash('md5');
    if (intermediateHash) hash.update(intermediateHash);
    hash.update(HASH_PASSWORD);
    hash.update(salt);
    intermediateHash = hash.digest();
    key = Buffer.concat([key, intermediateHash]);
  }
  const decipher = createDecipheriv('aes-256-cbc', key.subarray(0, 32), initVector);
  const output = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  const text = output.toString().slice(1, -1).replaceAll(/\\"/g, '"').replaceAll(/\\n/g, '');
  return JSON.parse(text);
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-PulsePoint/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  const contentType = response.headers.get('content-type') || '';
  if (response.status === 202 && response.headers.get('x-amzn-waf-action') === 'challenge') {
    const error = new Error('PulsePoint API requires an AWS WAF browser challenge; backend sync cannot read the feed directly right now.');
    (error as any).code = 'PULSEPOINT_WAF_CHALLENGE';
    throw error;
  }
  if (!response.ok) throw new Error(`PulsePoint request failed HTTP ${response.status}`);
  if (!contentType.includes('application/json')) {
    const preview = (await response.text()).slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`PulsePoint returned ${contentType || 'non-JSON'} instead of JSON: ${preview}`);
  }
  return response.json();
}

function parseList(value: unknown) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

async function agencyIdsFromArea(area: any) {
  const encoded = await fetchJson(`${GABC_URL}?lat=${encodeURIComponent(area.lat)}&lng=${encodeURIComponent(area.lng)}`);
  const decoded = decodePulsePoint(encoded);
  const agencies = Array.isArray(decoded?.searchagencies) ? decoded.searchagencies : [];
  const resolved: any[] = [];
  for (const agency of agencies) {
    const key = String(agency?.id || '').trim();
    if (!key) continue;
    const detail = await fetchJson(`${AGENCY_DATA_URL}${encodeURIComponent(key)}`).catch(() => null);
    const agencyId = String(detail?.agencyid || '').trim();
    if (!agencyId) continue;
    resolved.push({
      agencyId,
      agencyKey: key,
      name: detail?.agencyname || agency?.Display1 || area.label,
      shortName: detail?.short_agencyname || '',
      type: detail?.agencytype || '',
      source: area.source,
      area: area.label,
      areaLat: area.lat,
      areaLng: area.lng,
    });
  }
  return resolved;
}

async function resolveAgencies(body: any) {
  const explicit = parseList(body?.agency_ids || body?.agencyIds || Deno.env.get('PULSEPOINT_AGENCY_IDS'));
  if (explicit.length) {
    const knownById = new Map(DEFAULT_AGENCIES.map(agency => [String(agency.agencyId), agency]));
    return explicit.map(id => knownById.get(String(id)) || { agencyId: id, agencyKey: '', name: id, shortName: id, type: '', source: 'pulsepoint', area: 'Configured PulsePoint agency', areaLat: null, areaLng: null });
  }
  const requestedAreaKeys = new Set(parseList(body?.area_keys || body?.areaKeys));
  const keys = requestedAreaKeys.size ? requestedAreaKeys : new Set(DEFAULT_AREAS.map(area => area.key));
  const resolved: any[] = [];
  if (keys.has('richmond_va')) resolved.push(...DEFAULT_AGENCIES.filter(agency => agency.source === 'richmond'));
  if (keys.has('chesterfield_va')) resolved.push(...DEFAULT_AGENCIES.filter(agency => agency.source === 'chesterfield'));
  const knownSources = new Set(DEFAULT_AGENCIES.map(agency => agency.source));
  const discoveryAreas = DEFAULT_AREAS.filter(area => keys.has(area.key) && !knownSources.has(area.source));
  const discovered = (await Promise.all(discoveryAreas.map(area => agencyIdsFromArea(area).catch(error => {
    console.warn('PulsePoint agency discovery failed', area.key, error?.message || error);
    return [];
  })))).flat();
  resolved.push(...discovered);
  const unique = new Map<string, any>();
  for (const agency of resolved) unique.set(String(agency.agencyId), agency);
  return [...unique.values()];
}

function statusFromUnits(units: any[] = []) {
  const statuses = units.map(unit => UNIT_STATUS[String(unit?.PulsePointDispatchStatus || '').trim()] || '').filter(Boolean);
  if (statuses.some(status => status === 'On Scene' || status === 'Available on Scene')) return 'On Scene';
  if (statuses.some(status => status === 'Enroute' || status === 'Transport')) return 'Enroute';
  if (statuses.some(status => status === 'Dispatched' || status === 'Acknowledged')) return 'Dispatched';
  return 'New';
}

function priorityFor(type: string) {
  const text = String(type || '').toUpperCase();
  if (/CARDIAC|ARREST|MCI|MULTI CASUALTY|WORKING|EXPLOSION|STRUCTURE FIRE|RESCUE/.test(text)) return 'critical';
  if (/MEDICAL|TRAFFIC COLLISION|HAZMAT|GAS|FIRE|EMERGENCY|WATER RESCUE|TECHNICAL RESCUE/.test(text)) return 'high';
  if (/ALARM|INVESTIGATION|PUBLIC SERVICE|LIFT ASSIST|LOCKOUT/.test(text)) return 'medium';
  return 'low';
}

function validNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number : null;
}

function firstValue(source: any, keys: string[], fallback: any = '') {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function rowAgencyId(row: any) {
  return String(firstValue(row, ['AgencyID', 'agencyId', 'agency_id', 'AgencyId', 'agencyID'], '')).trim();
}

async function geocodePulsePointAddress(address: string, agency: any) {
  const cleanAddress = String(address || '').trim();
  if (!cleanAddress || /address unavailable/i.test(cleanAddress)) return null;
  const suffix = String(agency?.area || agency?.name || 'Virginia').trim();
  const query = /\bVA\b|Virginia/i.test(cleanAddress) ? cleanAddress : `${cleanAddress}, ${suffix}`;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
    const results = await fetchJson(url);
    const match = Array.isArray(results) ? results[0] : null;
    const latitude = validNumber(match?.lat);
    const longitude = validNumber(match?.lon);
    if (latitude !== null && longitude !== null) {
      return { latitude, longitude, geo_confidence: 'medium', geo_method: 'street', geo_approximate: true };
    }
  } catch (error) {
    console.warn('PulsePoint address geocode failed', cleanAddress, error?.message || error);
  }
  return null;
}

async function normalizeIncident(row: any, agency: any) {
  const id = String(firstValue(row, ['ID', 'id', 'IncidentID', 'incidentId', 'PulsePointIncidentID', 'pulsePointIncidentId'], '')).trim();
  if (!id) return null;
  const typeCode = String(firstValue(row, ['PulsePointIncidentCallType', 'CallType', 'callType', 'incidentType', 'type', 'Type'], '')).trim();
  const incident = CALL_TYPES[typeCode] || typeCode || 'PulsePoint Incident';
  const received = new Date(firstValue(row, ['CallReceivedDateTime', 'callReceivedDateTime', 'received_at', 'receivedAt', 'timestamp', 'time'], Date.now()));
  const latitude = validNumber(firstValue(row, ['Latitude', 'latitude', 'lat', 'Lat']));
  const longitude = validNumber(firstValue(row, ['Longitude', 'longitude', 'lng', 'lon', 'Long']));
  const unitsRaw = firstValue(row, ['Unit', 'Units', 'units'], []);
  const units = Array.isArray(unitsRaw) ? unitsRaw : [];
  const assignedUnits = units.map(unit => String(firstValue(unit, ['UnitID', 'unitId', 'id', 'name'], '')).trim()).filter(Boolean);
  const location = String(firstValue(row, ['FullDisplayAddress', 'fullDisplayAddress', 'address', 'Address', 'Location', 'location'], 'PulsePoint address unavailable')).trim();
  const fallbackLatitude = validNumber(agency?.areaLat);
  const fallbackLongitude = validNumber(agency?.areaLng);
  let geo = latitude !== null && longitude !== null
    ? { latitude, longitude, geo_confidence: 'high', geo_method: 'pulsepoint', geo_approximate: true }
    : await geocodePulsePointAddress(location, agency);
  if (!geo && fallbackLatitude !== null && fallbackLongitude !== null) {
    geo = { latitude: fallbackLatitude, longitude: fallbackLongitude, geo_confidence: 'low', geo_method: 'pulsepoint', geo_approximate: true };
  }
  return {
    external_call_id: `pulsepoint:${agency.agencyId}:${id}`,
    agency_cad_number: '',
    cad_number_source: 'upstream_public_feed',
    official_cad_verified: false,
    incident,
    location,
    agency: agency.shortName || agency.agencyId,
    zone: agency.area || agency.name || '',
    status: statusFromUnits(units),
    priority: priorityFor(incident),
    time_received: Number.isNaN(received.getTime()) ? new Date().toISOString() : received.toISOString(),
    source: agency.source || 'pulsepoint',
    source_channel: 'pulsepoint_respond',
    description: `${incident} at ${location || 'address unavailable'} (${agency.name || agency.agencyId})`,
    assigned_units: assignedUnits,
    ...(geo || { geo_confidence: 'unmappable', geo_method: 'none', geo_approximate: true }),
  };
}

function easternMonthParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value || String(date.getUTCFullYear());
  const month = parts.find(part => part.type === 'month')?.value || String(date.getUTCMonth() + 1).padStart(2, '0');
  return { year, month };
}

async function reserveCadNumbers(base44: any, count: number) {
  if (count <= 0) return [];
  const { year, month } = easternMonthParts(new Date());
  const period = `${year}${month}`;
  const counterKey = `bps_dispatch_call:${period}`;
  const counters = await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey });
  let counter = counters?.[0];
  let highest = Number(counter?.last_number || 0);
  if (!counter) {
    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000);
    highest = (calls || []).reduce((max: number, call: any) => {
      const match = String(call.bps_reference || call.call_id || '').match(/^BPS-(\d{6})-(\d{1,8})$/i);
      return Math.max(max, match && match[1] === period ? Number(match[2]) : 0);
    }, 0);
    counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: counterKey, last_number: highest });
  }
  const first = Math.max(highest, Number(counter.last_number || 0)) + 1;
  const last = first + count - 1;
  await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: last });
  return Array.from({ length: count }, (_value, index) => `BPS-${period}-${first + index}`);
}

function changed(existing: any, incoming: any) {
  const fields = ['external_call_id','agency_cad_number','call_id','incident','location','agency','zone','status','priority','time_received','source','source_channel','description','latitude','longitude','geo_confidence','geo_method','geo_approximate','assigned_units'];
  return fields.some(field => JSON.stringify(existing?.[field] ?? null) !== JSON.stringify(incoming?.[field] ?? null));
}

async function publishAudioEvent(base44: any, call: any) {
  const eventKey = `pulsepoint:${call.external_call_id}:new`;
  const existing = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: eventKey }, '-created_date', 1).catch(() => []);
  if (existing?.length) return false;
  const cadNumber = 'PP';
  await base44.asServiceRole.entities.CallStatusLog.create({
    call_id: String(call.id),
    incident_type: call.incident || 'PulsePoint incident',
    location: call.location || '',
    old_status: '',
    new_status: call.status || 'New',
    notes: `PulsePoint Respond incident imported from ${call.zone || call.agency || 'PulsePoint'}.`,
    latitude: call.latitude,
    longitude: call.longitude,
    event_key: eventKey,
    event_type: ['critical', 'high'].includes(String(call.priority || '').toLowerCase()) ? 'priority_call' : 'new_call',
    announcement_text: `PulsePoint incident. ${call.incident || 'Call for service'} at ${call.location || 'address unavailable'}. Reference ${cadNumber}.`,
    announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
    cad_number: String(cadNumber || ''),
    triggering_action: 'ingestPulsePoint.new_call',
    audio_enabled: true,
    sensitive: false,
  });
  return true;
}

function pointInPolygon(lat: number, lng: number, polygon: any[] = []) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = Number(Array.isArray(polygon[i]) ? polygon[i][0] : polygon[i]?.lat);
    const xi = Number(Array.isArray(polygon[i]) ? polygon[i][1] : polygon[i]?.lng);
    const yj = Number(Array.isArray(polygon[j]) ? polygon[j][0] : polygon[j]?.lat);
    const xj = Number(Array.isArray(polygon[j]) ? polygon[j][1] : polygon[j]?.lng);
    if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi)) inside = !inside;
  }
  return inside;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizedStreet(value: unknown) {
  const cleaned = String(value || '')
    .toUpperCase()
    .replace(/\bNORTH\b/g, 'N').replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E').replace(/\bWEST\b/g, 'W')
    .replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bROAD\b/g, 'RD').replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bLANE\b/g, 'LN').replace(/\bDRIVE\b/g, 'DR')
    .replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1')
    .replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const number = Number(cleaned.match(/^\d+/)?.[0]);
  const street = cleaned.replace(/^\d+\s*/, '').replace(/\b(?:RICHMOND|CHESTERFIELD|VA|VIRGINIA)\b.*$/, '').trim();
  return { number, street };
}

function sameStreetBlock(callLocation: unknown, propertyAddress: unknown) {
  const call = normalizedStreet(callLocation);
  const property = normalizedStreet(propertyAddress);
  if (!Number.isFinite(call.number) || !Number.isFinite(property.number) || !call.street || !property.street) return false;
  const callStreet = call.street.replace(/\b(?:ST|AVE|RD|BLVD|LN|DR)\b$/, '').trim();
  const propertyStreet = property.street.replace(/\b(?:ST|AVE|RD|BLVD|LN|DR)\b$/, '').trim();
  return callStreet === propertyStreet && Math.floor(call.number / 100) === Math.floor(property.number / 100);
}

function propertyMatch(call: any, location: any) {
  const lat = Number(call?.latitude);
  const lng = Number(call?.longitude);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (!hasCoordinates) {
    return sameStreetBlock(call?.location, location?.address)
      ? { relation: 'nearby', distanceMeters: 0, addressFallback: true }
      : null;
  }
  const boundaryType = String(location.property_monitoring_boundary_type || '').toLowerCase();
  const polygon = Array.isArray(location.property_monitoring_polygon) ? location.property_monitoring_polygon : [];
  if ((boundaryType === 'polygon' || polygon.length >= 3) && polygon.length >= 3) {
    return pointInPolygon(lat, lng, polygon) ? { relation: 'inside', distanceMeters: 0 } : null;
  }
  const centerLat = Number(location.latitude);
  const centerLng = Number(location.longitude);
  const radius = Number(location.property_monitoring_radius_meters || 0);
  if (![centerLat, centerLng, radius].every(Number.isFinite) || radius <= 0) return null;
  return distanceMeters(lat, lng, centerLat, centerLng) <= radius ? { relation: 'inside', distanceMeters: 0 } : null;
}

function propertyAlertFingerprint(call: any, propertyId: any) {
  return [
    String(propertyId || ''),
    String(call?.external_call_id || call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || ''),
    String(call?.incident || '').trim().toUpperCase(),
    String(call?.location || '').trim().toUpperCase(),
  ].join('|');
}

async function createPulsePointPropertyAlerts(base44: any, call: any) {
  if (!call?.id || ['Cleared', 'Cancelled'].includes(String(call.status || ''))) return 0;
  const [locations, existingAlerts] = await Promise.all([
    base44.asServiceRole.entities.Location.list('site_name', 500).catch(() => []),
    base44.asServiceRole.entities.PropertyAlert.list('-created_date', 1000).catch(() => []),
  ]);
  const existingCallPropertyKeys = new Set((existingAlerts || []).map((alert: any) => `${String(alert?.propertyId || '')}|${String(alert?.callId || '')}`));
  const existingKeys = new Set((existingAlerts || []).map((alert: any) => String(alert?.source_key || '')));
  let created = 0;
  for (const location of locations || []) {
    if (location.active === false || location.property_monitoring_enabled !== true) continue;
    const match = propertyMatch(call, location);
    if (!match) continue;
    const key = propertyAlertFingerprint(call, location.id);
    const callPropertyKey = `${String(location.id || '')}|${String(call.id || '')}`;
    if (existingCallPropertyKeys.has(callPropertyKey) || existingKeys.has(key)) continue;
    const propertyAlert = await base44.asServiceRole.entities.PropertyAlert.create({
      callId: call.id,
      propertyId: location.id,
      propertyName: location.site_name || 'Monitored Property',
      callIncident: call.incident || 'PulsePoint incident',
      callLocation: call.location || '',
      callPriority: call.priority || 'medium',
      callStatus: call.status || 'New',
      cadNumber: 'PP',
      callTime: call.time_received || call.created_date || new Date().toISOString(),
      time_received: call.time_received || call.created_date || new Date().toISOString(),
      source_key: key,
      distanceMeters: Number(match.distanceMeters || 0),
      acknowledged: false,
      description: match.relation === 'inside'
        ? `PulsePoint call is inside the ${location.site_name || 'monitored'} property boundary.`
        : `PulsePoint call is on or near the ${location.site_name || 'monitored'} property block.`, 
    });
    const cadNumber = 'PP';
    const propertyEventKey = `property-alert:${propertyAlert.id}:created`;
    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id: String(call.id),
      incident_type: call.incident || 'PulsePoint incident',
      location: call.location || location.address || '',
      old_status: '',
      new_status: call.status || 'New',
      notes: `PulsePoint monitored-property active call detected for ${location.site_name || location.address || 'property'}.`,
      latitude: call.latitude,
      longitude: call.longitude,
      event_key: propertyEventKey,
      event_type: 'property_alert',
      announcement_text: `PulsePoint property alert at ${location.site_name || location.address || 'monitored property'}. ${call.incident || 'Call for service'} at ${call.location || location.address || 'address unavailable'}. Reference ${cadNumber}.`,
      announcement_priority: ['critical', 'high'].includes(String(call.priority || '').toLowerCase()) ? String(call.priority).toLowerCase() : 'high',
      cad_number: String(cadNumber),
      triggering_action: 'ingestPulsePoint.property_alert_created',
      audio_enabled: true,
      sensitive: false,
    }).catch((error: any) => console.error('Unable to publish PulsePoint property alert audio event', error?.message || error));
    await Promise.all([
      base44.asServiceRole.functions.invoke('notifyPropertyAlertSms', { property_alert_id: propertyAlert.id }).catch((error: any) => console.error('PulsePoint property SMS notification failed', error?.message || error)),
      base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', { call_id: call.id, property_alert_id: propertyAlert.id }).catch((error: any) => console.error('PulsePoint property auto-dispatch failed', error?.message || error)),
    ]);
    existingKeys.add(key);
    existingCallPropertyKeys.add(callPropertyKey);
    created += 1;
  }
  return created;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const scheduledRun = body?.scheduled === true;
    const user = await base44.auth.me().catch(() => null);
    if (!scheduledRun) {
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const roles = new Set((user.additional_roles || []).map((role: string) => String(role).trim().toLowerCase()));
      const primaryRole = String(user.role || '').trim().toLowerCase();
      const hasCadAccess = primaryRole === 'admin' || primaryRole === 'dispatch' || user.dispatch_role === true || roles.has('dispatch') || roles.has('cad_access') || roles.has('full_access');
      if (!hasCadAccess) return Response.json({ error: 'CAD access required' }, { status: 403 });
    }

    const agencies = await resolveAgencies(body);
    if (!agencies.length) return Response.json({ success: false, error: 'No PulsePoint agencies found. Pass agency_ids or configure PULSEPOINT_AGENCY_IDS.' }, { status: 400 });

    const agencyById = new Map(agencies.map(agency => [String(agency.agencyId), agency]));
    let active: any[] = [];
    let feedSource = 'server';

    if (Array.isArray(body?.incidents)) {
      active = body.incidents;
      feedSource = 'browser_payload';
    } else if (body?.encoded_response && typeof body.encoded_response === 'object') {
      const decoded = decodePulsePoint(body.encoded_response);
      active = Array.isArray(decoded?.incidents?.active) ? decoded.incidents.active : [];
      feedSource = 'browser_encoded_payload';
    } else {
      const agencyIds = agencies.map(agency => agency.agencyId).join(',');
      const encoded = await fetchJson(`${GIBA_URL}${encodeURIComponent(agencyIds)}`);
      const decoded = decodePulsePoint(encoded);
      active = Array.isArray(decoded?.incidents?.active) ? decoded.incidents.active : [];
    }

    const incoming = (await Promise.all(active.map(row => {
      const agencyId = rowAgencyId(row);
      return normalizeIncident(row, agencyById.get(agencyId) || { agencyId: agencyId || 'PulsePoint', source: 'pulsepoint', area: 'PulsePoint' });
    }))).filter(Boolean);

    const [existingCalls, history] = await Promise.all([
      base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000),
      base44.asServiceRole.entities.CallHistory.list('-archived_date', 1000).catch(() => []),
    ]);
    const existingByExternal = new Map((existingCalls || []).filter((row: any) => String(row.external_call_id || '').startsWith('pulsepoint:')).map((row: any) => [String(row.external_call_id), row]));
    const archived = new Set((history || []).map((row: any) => String(row.external_call_id || '')).filter((key: string) => key.startsWith('pulsepoint:')));
    const incomingKeys = new Set(incoming.map((row: any) => String(row.external_call_id)));
    const newRows = incoming.filter((row: any) => !existingByExternal.has(row.external_call_id) && !archived.has(row.external_call_id));

    let created = 0, updated = 0, closed = 0, audio_events = 0, property_alerts_created = 0;
    for (let index = 0; index < newRows.length; index += 1) {
      const row = newRows[index];
      const call = await base44.asServiceRole.entities.DispatchCall.create({
        ...row,
        bps_reference: '',
        call_id: 'PP',
        source_first_seen_at: new Date().toISOString(),
      });
      created += 1;
      if (body?.include_audio !== false && await publishAudioEvent(base44, call)) audio_events += 1;
      property_alerts_created += await createPulsePointPropertyAlerts(base44, call).catch(error => {
        console.error('PulsePoint property alert creation failed', error?.message || error);
        return 0;
      });
    }

    for (const row of incoming) {
      const existing = existingByExternal.get(row.external_call_id);
      if (!existing) continue;
      const patch = {
        ...row,
        bps_reference: '',
        call_id: 'PP',
        source_first_seen_at: existing.source_first_seen_at || existing.created_date || new Date().toISOString(),
      };
      let currentCall = existing;
      if (changed(existing, patch)) {
        currentCall = await base44.asServiceRole.entities.DispatchCall.update(existing.id, patch);
        updated += 1;
      }
      property_alerts_created += await createPulsePointPropertyAlerts(base44, currentCall).catch(error => {
        console.error('PulsePoint property alert creation failed', error?.message || error);
        return 0;
      });
    }

    const recentCutoff = Date.now() - 4 * 60 * 60_000;
    for (const row of existingCalls || []) {
      const key = String(row.external_call_id || '');
      if (!key.startsWith('pulsepoint:') || incomingKeys.has(key) || ['Cleared', 'Cancelled'].includes(String(row.status || ''))) continue;
      const receivedAt = new Date(row.time_received || row.created_date || 0).getTime();
      if (Number.isFinite(receivedAt) && receivedAt >= recentCutoff) {
        await base44.asServiceRole.entities.DispatchCall.update(row.id, { status: 'Cleared', time_closed: row.time_closed || new Date().toISOString() }).catch(() => null);
        closed += 1;
      }
    }

    return Response.json({
      success: true,
      source: 'pulsepoint',
      agencies,
      feed_source: feedSource,
      raw_active_rows: active.length,
      active: incoming.length,
      created,
      updated,
      closed,
      audio_events,
      property_alerts_created,
      synced_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('PulsePoint ingestion failed', error);
    const wafBlocked = error?.code === 'PULSEPOINT_WAF_CHALLENGE';
    return Response.json({
      success: false,
      source: 'pulsepoint',
      blocked: wafBlocked,
      error: error?.message || 'PulsePoint ingestion failed',
    }, { status: wafBlocked ? 409 : 500 });
  }
});
