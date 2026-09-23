import { createClientFromRequest } from 'npm:@base44/sdk';

const GRAC_API_URL = 'https://gractivecalls.com/api/active';
const HENRICO_ACTIVE_URL = 'https://activecalls.henrico.gov/';
const CHESTERFIELD_CALLS_URL = 'https://api.chesterfield.gov/api/Police/V1.1/Calls/CallsForService';
const CHESTERFIELD_PUBLIC_API_KEY = Deno.env.has('CHESTERFIELD_PUBLIC_API_KEY') ? Deno.env.get('CHESTERFIELD_PUBLIC_API_KEY') : null;
const ALLOWED_AGENCIES = new Set(['RPD', 'RFD', 'HPD', 'HFD', 'CCPD', 'CCFD']);
const AGENCY_SOURCE: Record<string, string> = { RPD: 'richmond', RFD: 'richmond', HPD: 'henrico', HFD: 'henrico', CCPD: 'chesterfield', CCFD: 'chesterfield' };
const PROPERTY_MONITORING_EDGE_TOLERANCE_METERS = 100;

const normalizeStatus = (raw: unknown) => {
  const value = String(raw || '').trim().toUpperCase();
  if (value.includes('DISPATCH') || value.includes('ASSIGN')) return 'Dispatched';
  if (value.includes('ENROUTE') || value.includes('EN ROUTE')) return 'Enroute';
  if (value.includes('ARRIV') || value.startsWith('ARV') || value.includes('ON SCENE')) return 'On Scene';
  return 'New';
};

const normalizePriority = (incident: unknown) => {
  const text = String(incident || '').toUpperCase();
  if (/SHOOT|STABB|ROBBERY|ARMED|PERSON SHOT|OFFICER (DOWN|NEEDS)|EXPLOSION/.test(text)) return 'critical';
  if (/ASSAULT|DOMESTIC.*VIOLENT|FIGHT|MISSING PERSON|PERSONAL INJURY|BURGLARY.*PROGRESS/.test(text)) return 'high';
  if (/CRASH|ACCIDENT|FIRE|EMS|SUSPICIOUS|LARCENY|DOMESTIC/.test(text)) return 'medium';
  return 'low';
};

const validCoordinate = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;

const cleanMatchText = (value: unknown) => String(value || '').toUpperCase().replace(/\bBLOCK\b/g, '').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

function callMinute(value: unknown) {
  const text = String(value || '');
  const simple = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (simple) {
    let hour = Number(simple[1]) % 12;
    if (simple[3].toUpperCase() === 'PM') hour += 12;
    return hour * 60 + Number(simple[2]);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return -1;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  return (Number(parts.find(part => part.type === 'hour')?.value || 0) % 24) * 60 + Number(parts.find(part => part.type === 'minute')?.value || 0);
}

function chooseOfficial(call: any, rows: any[]) {
  const location = cleanMatchText(call.location);
  const incident = cleanMatchText(call.incident);
  const minute = callMinute(call.time_received);
  return rows.find(row => {
    const rowMinute = callMinute(row.received);
    const rawDistance = Math.abs(minute - rowMinute);
    const distance = Math.min(rawDistance, 1440 - rawDistance);
    const sameLocation = cleanMatchText(row.location) === location;
    const sameIncident = cleanMatchText(row.incident) === incident;
    return sameLocation && distance <= 3 && (sameIncident || Boolean(location));
  }) || null;
}

async function fetchOfficialTable(url: string) {
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html', 'User-Agent': 'BPS-Pathfinder/4.1' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const html = await response.text();
    const rows: any[] = [];
    for (const part of html.split('</tr>')) {
      const cells = [...part.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => String(match[1] || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim());
      if (cells.length >= 4 && /^\d+$/.test(cells[0])) rows.push({ official: cells[0], received: cells[1], location: cells[2], incident: cells[3] });
    }
    return rows;
  } catch (error) {
    console.warn('Official table lookup failed', error?.message || error);
    return [];
  }
}

async function fetchOfficialJson(url: string, headers: Record<string, string>) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.calls) ? payload.calls : [];
    return list.map((row: any) => ({ official: String(row?.id || '').trim(), received: row?.callReceivedFormatted || row?.callReceived || '', location: row?.location || '', incident: row?.type || '' })).filter((row: any) => row.official && row.location);
  } catch (error) {
    console.warn('Official JSON lookup failed', error?.message || error);
    return [];
  }
}

async function enrichOfficialIdentifiers(calls: any[]) {
  const [henricoRows, chesterfieldRows] = await Promise.all([
    fetchOfficialTable(HENRICO_ACTIVE_URL),
    CHESTERFIELD_PUBLIC_API_KEY
      ? fetchOfficialJson(CHESTERFIELD_CALLS_URL, {
          Accept: 'application/json',
          'X-ApiKey': CHESTERFIELD_PUBLIC_API_KEY,
          'X-UserId': 'bps-pathfinder',
          'X-SessionId': `bps-${new Date().toISOString().slice(0, 10)}`,
        })
      : Promise.resolve([]),
  ]);

  return calls.map(call => {
    const agency = String(call.agency || '').toUpperCase();
    const rows = agency === 'HPD' ? henricoRows : agency === 'CCPD' ? chesterfieldRows : [];
    const match = rows.length ? chooseOfficial(call, rows) : null;
    if (!match?.official) return call;
    return {
      ...call,
      agency_cad_number: String(match.official),
      cad_number_source: 'official_government_feed',
      official_cad_verified: true,
    };
  });
}

function extractOfficialCadNumber(row: any) {
  const candidates = [
    row?.cadNumber,
    row?.cad_number,
    row?.cad,
    row?.CAD,
    row?.callNumber,
    row?.call_number,
    row?.eventNumber,
    row?.event_number,
  ];
  const value = candidates.find(candidate => candidate !== null && candidate !== undefined && String(candidate).trim());
  if (value === undefined) return '';
  const normalized = String(value).trim().replace(/\s+/g, ' ');
  return normalized.length <= 40 ? normalized : '';
}

function externalKey(record: any) {
  if (record?.external_call_id) return String(record.external_call_id);
  const descriptionMatch = String(record?.description || '').match(/\[GRAC:([^\]]+)\]/);
  if (descriptionMatch?.[1]) return descriptionMatch[1];
  const legacy = String(record?.call_id || '');
  return legacy.startsWith('grac-') ? legacy.slice(5) : '';
}

function legacyKey(record: any) {
  const agency = String(record?.agency || '').trim().toUpperCase();
  const incident = String(record?.incident || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const received = record?.time_received ? new Date(record.time_received).toISOString() : '';
  if (!ALLOWED_AGENCIES.has(agency) || !incident || !received) return '';
  return `${agency}|${received}|${incident}`;
}

function recordKey(record: any) {
  return externalKey(record) || legacyKey(record);
}

function normalizeCall(row: any) {
  const agency = String(row?.agency || '').trim().toUpperCase();
  if (!row?._id || !row?.incident || !row?.location || !ALLOWED_AGENCIES.has(agency)) return null;
  const external_call_id = String(row._id);
  const received = new Date(row.timeReceived);
  const latitude = validCoordinate(row?.coords?.[0]);
  const longitude = validCoordinate(row?.coords?.[1]);
  const agency_cad_number = extractOfficialCadNumber(row);
  return {
    external_call_id,
    ...(agency_cad_number ? {
      agency_cad_number,
      cad_number_source: 'official_government_feed',
      official_cad_verified: true,
    } : {
      cad_number_source: 'bps_internal',
      official_cad_verified: false,
    }),
    incident: String(row.incident).trim(),
    location: String(row.location).trim(),
    agency,
    zone: String(row.district || '').trim(),
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.incident),
    time_received: Number.isNaN(received.getTime()) ? new Date().toISOString() : received.toISOString(),
    source: AGENCY_SOURCE[agency],
    description: `${String(row.incident).trim()} at ${String(row.location).trim()}`,
    ...(latitude !== null && longitude !== null ? { latitude, longitude, geo_confidence: 'high', geo_method: 'grac', geo_approximate: false } : {}),
  };
}


const GRAC_WEBSITE_URL = 'https://gractivecalls.com/';

function decodeHtmlText(value: unknown) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function easternWebsiteTimeToIso(value: unknown) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
  let hour = Number(match[4]) % 12;
  if (match[6].toUpperCase() === 'PM') hour += 12;
  const minute = Number(match[5]);
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = desiredWallClock;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(utc));
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value || 0);
    const renderedWallClock = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour') % 24, part('minute'), 0, 0);
    const delta = desiredWallClock - renderedWallClock;
    utc += delta;
    if (Math.abs(delta) < 1000) break;
  }
  return new Date(utc).toISOString();
}

async function websiteCallId(row: { agency: string; time_received: string; incident: string; location: string }) {
  const seed = [row.agency, row.time_received, cleanMatchText(row.incident), cleanMatchText(row.location)].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return 'web-' + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchLiveWebsiteCalls() {
  const url = `${GRAC_WEBSITE_URL}?bpspf_live=${Date.now()}-${crypto.randomUUID()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html',
      'User-Agent': 'BPS-Pathfinder-CAD/4.2',
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Pragma: 'no-cache',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GRAC website returned HTTP ${response.status}`);
  const html = await response.text();
  const calls: any[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => decodeHtmlText(match[1]));
    if (cells.length < 5) continue;
    const [receivedText, incident, location, agencyRaw, statusText] = cells;
    const agency = String(agencyRaw || '').trim().toUpperCase();
    if (!ALLOWED_AGENCIES.has(agency) || !incident || !location) continue;
    const time_received = easternWebsiteTimeToIso(receivedText);
    if (!time_received) continue;
    const base = {
      agency,
      incident: String(incident).trim(),
      location: String(location).trim(),
      time_received,
    };
    calls.push({
      external_call_id: await websiteCallId(base),
      incident: base.incident,
      location: base.location,
      agency,
      zone: '',
      status: normalizeStatus(statusText),
      priority: normalizePriority(base.incident),
      time_received,
      source: AGENCY_SOURCE[agency],
      description: `${base.incident} at ${base.location} [GRAC-WEBSITE]`,
      cad_number_source: 'bps_internal',
      official_cad_verified: false,
      source_channel: 'grac_website_live',
    });
  }
  return calls;
}

function liveMergeKey(call: any) {
  return [String(call?.agency || '').toUpperCase(), String(call?.time_received || ''), cleanMatchText(call?.incident), cleanMatchText(call?.location)].join('|');
}

function mergeLiveWebsiteAndApi(websiteCalls: any[], apiCalls: any[]) {
  const byKey = new Map<string, any>();
  for (const web of websiteCalls || []) byKey.set(liveMergeKey(web), web);
  for (const api of apiCalls || []) {
    const key = liveMergeKey(api);
    const web = byKey.get(key);
    if (!web) {
      byKey.set(key, api);
      continue;
    }
    // Website owns what is currently visible/status; API enriches stable id/GPS.
    byKey.set(key, {
      ...api,
      ...web,
      external_call_id: api.external_call_id || web.external_call_id,
      ...(Number.isFinite(Number(api.latitude)) && Number.isFinite(Number(api.longitude)) ? {
        latitude: Number(api.latitude), longitude: Number(api.longitude),
        geo_confidence: api.geo_confidence || 'high', geo_method: api.geo_method || 'grac',
        geo_approximate: api.geo_approximate === true,
      } : {}),
      agency_cad_number: api.agency_cad_number || web.agency_cad_number || '',
      official_cad_verified: api.official_cad_verified === true,
      cad_number_source: api.official_cad_verified === true ? (api.cad_number_source || 'upstream_public_feed') : 'bps_internal',
      source_channel: 'grac_website_live+api',
    });
  }
  return [...byKey.values()];
}

async function fastGeocodeWebsiteCall(call: any) {
  if (Number.isFinite(Number(call?.latitude)) && Number.isFinite(Number(call?.longitude))) return call;
  const agency = String(call?.agency || '').toUpperCase();
  const area = ['HPD','HFD'].includes(agency) ? 'Henrico County, VA'
    : ['CCPD','CCFD'].includes(agency) ? 'Chesterfield County, VA'
      : 'Richmond, VA';
  const address = `${String(call?.location || '').replace(/^RICH:\s*/i, '')}, ${area}`;
  const photon = fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=3&lang=en`, {
    headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-CAD/4.2' }, signal: AbortSignal.timeout(4500),
  }).then(async response => {
    if (!response.ok) return null;
    const data = await response.json();
    const feature = (data?.features || []).find((item: any) => {
      const p = item?.properties || {};
      return !p.state || p.state === 'Virginia' || p.state === 'VA';
    }) || data?.features?.[0];
    return feature ? { latitude: Number(feature.geometry?.coordinates?.[1]), longitude: Number(feature.geometry?.coordinates?.[0]) } : null;
  }).catch(() => null);
  const census = fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4500),
  }).then(async response => {
    if (!response.ok) return null;
    const data = await response.json();
    const match = data?.result?.addressMatches?.[0];
    return match ? { latitude: Number(match.coordinates?.y), longitude: Number(match.coordinates?.x) } : null;
  }).catch(() => null);
  const settled = await Promise.all([census, photon]);
  const coords = settled.find(value => value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
  return coords ? { ...call, ...coords, geo_confidence: 'medium', geo_method: 'street', geo_approximate: true } : call;
}

async function geocodeFreshWebsiteOnlyCalls(calls: any[]) {
  const now = Date.now();
  const candidates = (calls || []).filter(call => call?.source_channel === 'grac_website_live'
    && !Number.isFinite(Number(call.latitude))
    && now - new Date(call.time_received || 0).getTime() <= 45 * 60_000).slice(0, 12);
  const replacements = new Map<string, any>();
  for (let offset = 0; offset < candidates.length; offset += 3) {
    const batch = await Promise.all(candidates.slice(offset, offset + 3).map(fastGeocodeWebsiteCall));
    batch.forEach(call => replacements.set(liveMergeKey(call), call));
  }
  return (calls || []).map(call => replacements.get(liveMergeKey(call)) || call);
}

function persistableCall(call: any) {
  const { source_channel: _sourceChannel, ...persistable } = call || {};
  return persistable;
}

function changed(existing: any, incoming: any) {
  const fields = ['external_call_id','agency_cad_number','bps_reference','cad_number_source','official_cad_verified','call_id','incident','location','agency','zone','status','priority','time_received','source','description','latitude','longitude','geo_confidence','geo_method','geo_approximate'];
  return fields.some(field => existing?.[field] !== incoming?.[field]);
}

function pointInPolygon(lat: number, lng: number, polygon: any[] = []) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const latI = Number(Array.isArray(a) ? a[0] : a?.lat);
    const lngI = Number(Array.isArray(a) ? a[1] : a?.lng);
    const latJ = Number(Array.isArray(b) ? b[0] : b?.lat);
    const lngJ = Number(Array.isArray(b) ? b[1] : b?.lng);
    if (![latI, lngI, latJ, lngJ].every(Number.isFinite)) continue;
    const intersects = ((lngI > lng) !== (lngJ > lng)) &&
      (lat < ((latJ - latI) * (lng - lngI)) / ((lngJ - lngI) || Number.EPSILON) + latI);
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (v: number) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentMeters(lat: number, lng: number, a: any, b: any) {
  const aLat = Number(Array.isArray(a) ? a[0] : a?.lat);
  const aLng = Number(Array.isArray(a) ? a[1] : a?.lng);
  const bLat = Number(Array.isArray(b) ? b[0] : b?.lat);
  const bLng = Number(Array.isArray(b) ? b[1] : b?.lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity;
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(lat * Math.PI / 180);
  const ax = (aLng - lng) * metersPerLng;
  const ay = (aLat - lat) * metersPerLat;
  const bx = (bLng - lng) * metersPerLng;
  const by = (bLat - lat) * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((-ax) * dx + (-ay) * dy) / lengthSq)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
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
  const street = cleaned.replace(/^\d+\s*/, '').replace(/\b(?:RICHMOND|VA|VIRGINIA)\b.*$/, '').trim();
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
  if (location?.active === false || location?.property_monitoring_enabled !== true) return null;

  const lat = Number(call?.latitude);
  const lng = Number(call?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

  const polygon = Array.isArray(location.property_monitoring_polygon)
    ? location.property_monitoring_polygon
    : [];
  const boundaryType = String(location.property_monitoring_boundary_type || (polygon.length >= 3 ? 'polygon' : 'circle')).toLowerCase();

  if (boundaryType === 'polygon' && polygon.length >= 3) {
    if (pointInPolygon(lat, lng, polygon)) return { relation: 'inside', distanceMeters: 0 };

    // Public CAD coordinates are frequently pinned to a roadway/address centroid
    // instead of the exact parcel/building. Allow a small 100m buffer around the
    // SAVED custom polygon so legitimate property calls are not lost, while still
    // rejecting the much wider nearby-area matches that caused prior false alerts.
    let edgeDistance = Infinity;
    for (let i = 0; i < polygon.length; i += 1) {
      edgeDistance = Math.min(
        edgeDistance,
        pointToSegmentMeters(lat, lng, polygon[i], polygon[(i + 1) % polygon.length]),
      );
    }
    return edgeDistance <= PROPERTY_MONITORING_EDGE_TOLERANCE_METERS
      ? { relation: 'nearby', distanceMeters: edgeDistance }
      : null;
  }

  // Circle mode is an explicit administrator choice. Honor the configured
  // property-monitoring radius exactly; never substitute the officer clock-in
  // geofence radius.
  const centerLat = Number(location.latitude);
  const centerLng = Number(location.longitude);
  const radiusMeters = Number(location.property_monitoring_radius_meters || 0);
  if (![centerLat, centerLng, radiusMeters].every(Number.isFinite) || radiusMeters <= 0) return null;
  const centerDistance = distanceMeters(lat, lng, centerLat, centerLng);
  return centerDistance <= radiusMeters
    ? { relation: 'inside', distanceMeters: 0 }
    : null;
}

function propertyAlertFingerprint(call: any, propertyId: any) {
  return [
    String(propertyId || ''),
    String(call?.external_call_id || call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || ''),
    String(call?.incident || '').trim().toUpperCase(),
    String(call?.location || '').trim().toUpperCase(),
  ].join('|');
}

async function createImmediatePropertyAlerts(
  base44: any,
  call: any,
  monitored: any[],
  existingCallPropertyKeys: Set<string>,
  existingKeys: Set<string>,
  sideEffects: Promise<any>[],
) {
  if (!call?.id || ['Cleared', 'Cancelled'].includes(String(call.status || ''))) return 0;
  let created = 0;
  for (const location of monitored || []) {
    const match = propertyMatch(call, location);
    if (!match) continue;
    const key = propertyAlertFingerprint(call, location.id);
    const callPropertyKey = `${String(location.id || '')}|${String(call.id || '')}`;
    if (existingCallPropertyKeys.has(callPropertyKey) || existingKeys.has(key)) continue;

    const propertyAlert = await base44.asServiceRole.entities.PropertyAlert.create({
      callId: call.id,
      propertyId: location.id,
      propertyName: location.site_name || 'Monitored Property',
      callIncident: call.incident || 'Unknown incident',
      callLocation: call.location || '',
      callPriority: call.priority || 'medium',
      callStatus: call.status || 'New',
      cadNumber: String(call.agency_cad_number || call.bps_reference || call.call_id || call.id || ''),
      callTime: call.time_received || call.created_date || new Date().toISOString(),
      time_received: call.time_received || call.created_date || new Date().toISOString(),
      source_key: key,
      distanceMeters: Number(match.distanceMeters || 0),
      acknowledged: false,
      description: match.relation === 'inside'
        ? `Call is inside the ${location.site_name || 'monitored'} property boundary.`
        : `Call is within ${Math.round(Number(match.distanceMeters || 0) / 0.3048)} feet of the ${location.site_name || 'monitored'} property boundary.`,
    });

    // The PropertyAlert create above is the realtime audio trigger. Everything
    // below starts immediately but is deliberately kept off the critical path so
    // SMS/provider latency and assignment evaluation can never delay speech.
    const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
    const propertyEventKey = `property-alert:${propertyAlert.id}:created`;
    sideEffects.push(
      base44.asServiceRole.entities.CallStatusLog.create({
        call_id: String(call.id),
        incident_type: call.incident || 'Call for service',
        location: call.location || location.address || '',
        old_status: '',
        new_status: call.status || 'New',
        notes: `Monitored-property active call detected for ${location.site_name || location.address || 'property'}.`,
        latitude: call.latitude,
        longitude: call.longitude,
        event_key: propertyEventKey,
        event_type: 'property_alert',
        announcement_text: `Active call for service at ${location.site_name || location.address || 'monitored property'}. ${call.incident || 'Call for service'} at ${call.location || location.address || 'address unavailable'}. CAD number ${cadNumber}.`,
        announcement_priority: ['critical', 'high'].includes(String(call.priority || '').toLowerCase()) ? String(call.priority).toLowerCase() : 'high',
        cad_number: String(cadNumber),
        triggering_action: 'ingestGractivecalls.property_alert_created',
        audio_enabled: true,
        sensitive: false,
      }).catch((error: any) => console.error('Unable to publish property alert announcement event', error?.message || error)),
      base44.asServiceRole.functions.invoke('notifyPropertyAlertSms', {
        property_alert_id: propertyAlert.id,
      }).catch((error: any) => console.error('Property-call SMS notification failed', {
        property_alert_id: propertyAlert.id,
        error: error?.message || String(error),
      })),
      base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', {
        call_id: call.id,
        property_alert_id: propertyAlert.id,
      }).catch((error: any) => console.error('Automatic property-dispatch evaluation failed', {
        call_id: call.id,
        property_alert_id: propertyAlert.id,
        error: error?.message || String(error),
      })),
    );

    existingKeys.add(key);
    existingCallPropertyKeys.add(callPropertyKey);
    created += 1;
  }
  return created;
}

async function reconcilePropertyAlerts(base44: any) {
  const [calls, locations, existingAlerts, existingEvaluations] = await Promise.all([
    base44.asServiceRole.entities.DispatchCall.list('-created_date', 300),
    base44.asServiceRole.entities.Location.list('site_name', 100),
    // Read ALL alerts, not only unacknowledged alerts. An acknowledged alert is
    // still the authoritative record for that call/property pair and must not be
    // recreated every ingestion cycle.
    base44.asServiceRole.entities.PropertyAlert.list('-created_date', 1000).catch(() => []),
    base44.asServiceRole.entities.AutoDispatchEvaluation.list('-evaluated_at', 1000).catch(() => []),
  ]);
  const activeCalls = (calls || []).filter((call: any) => !['Cleared', 'Cancelled'].includes(call.status));
  const recentHistoryCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentClearedCalls = (calls || []).filter((call: any) => {
    if (!['Cleared', 'Cancelled'].includes(String(call.status || ''))) return false;
    const stamp = new Date(call.time_received || call.created_date || 0).getTime();
    return Number.isFinite(stamp) && stamp >= recentHistoryCutoff;
  });
  const monitored = (locations || []).filter((location: any) => location.active !== false && location.property_monitoring_enabled === true);
  // A CAD source can recycle an old active call with a new internal row ID. Use
  // the call's source-time/incident/location fingerprint as the alert identity so
  // one real-world call can only create one property alert for a property.
  const alertFingerprint = (call: any, propertyId: any) => [
    String(propertyId || ''),
    String(call?.external_call_id || call?.agency_cad_number || call?.bps_reference || call?.call_id || call?.id || ''),
    String(call?.incident || '').trim().toUpperCase(),
    String(call?.location || '').trim().toUpperCase(),
  ].join('|');
  // callId + propertyId is the strongest guard for the current persisted call row.
  // This also protects older PropertyAlert rows created before source_key/callTime
  // were part of the entity schema (those fields were silently discarded).
  const existingCallPropertyKeys = new Set((existingAlerts || []).map((alert: any) =>
    `${String(alert?.propertyId || '')}|${String(alert?.callId || '')}`
  ));
  const existingKeys = new Set((existingAlerts || []).map((alert: any) => {
    if (alert?.source_key) return String(alert.source_key);
    return [
      String(alert?.propertyId || ''),
      String(alert?.callTime || alert?.time_received || alert?.created_date || ''),
      String(alert?.callIncident || '').trim().toUpperCase(),
      String(alert?.callLocation || '').trim().toUpperCase(),
    ].join('|');
  }));
  let propertyAlertsCreated = 0;

  // Backfill recently-cleared property calls into durable history. These rows are
  // intentionally silent: no audio, SMS, or dispatch assignment is replayed for
  // an incident that has already ended.
  for (const call of recentClearedCalls) {
    for (const location of monitored) {
      const match = propertyMatch(call, location);
      if (!match) continue;
      const key = alertFingerprint(call, location.id);
      const callPropertyKey = `${String(location.id || '')}|${String(call.id || '')}`;
      if (existingCallPropertyKeys.has(callPropertyKey) || existingKeys.has(key)) continue;
      await base44.asServiceRole.entities.PropertyAlert.create({
        callId: call.id,
        propertyId: location.id,
        propertyName: location.site_name || 'Monitored Property',
        callIncident: call.incident || 'Unknown incident',
        callLocation: call.location || '',
        callPriority: call.priority || 'medium',
        callStatus: call.status || 'Cleared',
        cadNumber: String(call.agency_cad_number || call.bps_reference || call.call_id || call.id || ''),
        callTime: call.time_received || call.created_date,
        time_received: call.time_received || call.created_date,
        source_key: key,
        distanceMeters: Number(match.distanceMeters || 0),
        acknowledged: true,
        lifecycle_status: 'resolved',
        description: match.relation === 'inside'
          ? `Historical property call was inside the ${location.site_name || 'monitored'} property boundary.`
          : `Historical property call was within ${Math.round(Number(match.distanceMeters || 0) / 0.3048)} feet of the ${location.site_name || 'monitored'} property boundary.`,
      });
      existingKeys.add(key);
      existingCallPropertyKeys.add(callPropertyKey);
      propertyAlertsCreated += 1;
    }
  }

  for (const call of activeCalls) {
    for (const location of monitored) {
      const match = propertyMatch(call, location);
      if (!match) continue;
      const key = alertFingerprint(call, location.id);
      const callPropertyKey = `${String(location.id || '')}|${String(call.id || '')}`;
      if (existingCallPropertyKeys.has(callPropertyKey) || existingKeys.has(key)) continue;
      const propertyAlert = await base44.asServiceRole.entities.PropertyAlert.create({
        callId: call.id,
        propertyId: location.id,
        propertyName: location.site_name || 'Monitored Property',
        callIncident: call.incident || 'Unknown incident',
        callLocation: call.location || '',
        callPriority: call.priority || 'medium',
        callStatus: call.status || 'New',
        cadNumber: String(call.agency_cad_number || call.bps_reference || call.call_id || call.id || ''),
        callTime: call.time_received || call.created_date,
        time_received: call.time_received || call.created_date,
        source_key: key,
        distanceMeters: Number(match.distanceMeters || 0),
        acknowledged: false,
        description: match.relation === 'inside'
          ? `Call is inside the ${location.site_name || 'monitored'} property boundary.`
          : `Call is within ${Math.round(Number(match.distanceMeters || 0) / 0.3048)} feet of the ${location.site_name || 'monitored'} property boundary.`,
      });
      // Every newly verified monitored-property alert owns one durable CAD audio
      // event. Auto-dispatch may later create assignment/escalation events, but a
      // staffing shortage or disabled auto-dispatch must never make the original
      // active-call announcement disappear.
      const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
      const propertyEventKey = `property-alert:${propertyAlert.id}:created`;
      const priorPropertyEvents = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: propertyEventKey }, '-created_date', 1).catch(() => []);
      if (!priorPropertyEvents?.length) {
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id: String(call.id),
          incident_type: call.incident || 'Call for service',
          location: call.location || location.address || '',
          old_status: '',
          new_status: call.status || 'New',
          notes: `Monitored-property active call detected for ${location.site_name || location.address || 'property'}.`,
          latitude: call.latitude,
          longitude: call.longitude,
          event_key: propertyEventKey,
          event_type: 'property_alert',
          announcement_text: `Active call for service at ${location.site_name || location.address || 'monitored property'}. ${call.incident || 'Call for service'} at ${call.location || location.address || 'address unavailable'}. CAD number ${cadNumber}.`,
          announcement_priority: ['critical', 'high'].includes(String(call.priority || '').toLowerCase()) ? String(call.priority).toLowerCase() : 'high',
          cad_number: String(cadNumber),
          triggering_action: 'ingestGractivecalls.property_alert_created',
          audio_enabled: true,
          sensitive: false,
        }).catch((error: any) => console.error('Unable to publish property alert announcement event', error?.message || error));
      }
      // Notify command staff and the on-property team from the saved alert identity.
      // The SMS function owns per-recipient delivery receipts, so ingestion retries
      // cannot send duplicate texts for the same property call.
      await base44.asServiceRole.functions.invoke('notifyPropertyAlertSms', {
        property_alert_id: propertyAlert.id,
      }).catch((error: any) => {
        console.error('Property-call SMS notification failed', {
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error),
        });
      });

      // Evaluate when the verified alert is created, not only when a dispatcher
      // opens a page. The property's saved mode controls preview, review, or live
      // assignment; the evaluator provides the idempotency receipt.
      await base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', {
        call_id: call.id,
        property_alert_id: propertyAlert.id,
      }).catch((error: any) => {
        console.error('Automatic property-dispatch evaluation failed', {
          call_id: call.id,
          property_alert_id: propertyAlert.id,
          error: error?.message || String(error),
        });
      });
      existingKeys.add(key);
      existingCallPropertyKeys.add(callPropertyKey);
      propertyAlertsCreated += 1;
    }
  }
  // Re-evaluate active, unacknowledged alerts when an administrator changes a
  // property from Shadow to Live, and while waiting for an eligible unit. Honor
  // the property's configured interval; the evaluator's permanent assigned
  // receipt prevents duplicate assignments and announcements across retries.
  const activeCallIds = new Set(activeCalls.map((call: any) => String(call.id)));
  const propertyById = new Map(monitored.map((location: any) => [String(location.id), location]));
  const latestEvaluationByAlert = new Map<string, any>();
  for (const evaluation of existingEvaluations || []) {
    const alertId = String(evaluation.property_alert_id || '');
    if (!alertId || latestEvaluationByAlert.has(alertId)) continue;
    latestEvaluationByAlert.set(alertId, evaluation);
  }
  const nowMs = Date.now();
  for (const alert of existingAlerts || []) {
    const lifecycle = String(alert.lifecycle_status || 'active').toLowerCase();
    if (!activeCallIds.has(String(alert.callId)) || ['resolved', 'false_alarm', 'test'].includes(lifecycle)) continue;

    // Give a recent alert a short retry window for temporary carrier/provider
    // failures. Successful recipients are suppressed by PropertyAlertSmsDelivery.
    // The age guard prevents old historical alerts from suddenly generating SMS.
    const alertAt = new Date(alert.callTime || alert.time_received || alert.created_date || 0).getTime();
    if (Number.isFinite(alertAt) && nowMs - alertAt >= 0 && nowMs - alertAt <= 15 * 60 * 1000) {
      await base44.asServiceRole.functions.invoke('notifyPropertyAlertSms', {
        property_alert_id: alert.id,
      }).catch((error: any) => console.error('Recent property-call SMS retry failed', {
        property_alert_id: alert.id,
        error: error?.message || String(error),
      }));
    }

    const property = propertyById.get(String(alert.propertyId));
    if (!property || property.auto_dispatch_enabled !== true || property.auto_dispatch_mode !== 'live') continue;
    const latest = latestEvaluationByAlert.get(String(alert.id));
    if (latest?.mode === 'live' && latest?.decision === 'assigned') continue;
    const lastAt = new Date(latest?.evaluated_at || latest?.updated_date || 0).getTime();
    const intervalMs = Math.max(30, Number(property.auto_dispatch_recheck_seconds || 60)) * 1000;
    if (Number.isFinite(lastAt) && nowMs - lastAt < intervalMs) continue;
    await base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', {
      call_id: alert.callId,
      property_alert_id: alert.id,
    }).catch((error: any) => console.error('Live automatic-dispatch recheck failed', {
      call_id: alert.callId,
      property_alert_id: alert.id,
      error: error?.message || String(error),
    }));
  }

  return propertyAlertsCreated;
}

async function ensurePhase2ASafetyEvidence(base44: any) {
  const existing = await base44.asServiceRole.entities.AutoDispatchEvaluation.list('-evaluated_at', 1).catch(() => []);
  if (existing?.length) return { status: 'already_verified', evaluation_id: existing[0].id };

  const alerts = await base44.asServiceRole.entities.PropertyAlert.list('-created_date', 100).catch(() => []);
  for (const alert of alerts || []) {
    if (!alert?.id || !alert?.callId) continue;
    const archived = await base44.asServiceRole.entities.CallHistory.filter({ original_call_id: alert.callId }, '-archived_date', 1).catch(() => []);
    if (!archived?.length) continue;
    const response = await base44.asServiceRole.functions.invoke('testAutoDispatchShadow', {
      call_id: alert.callId,
      property_alert_id: alert.id,
      simulation: true,
    });
    const result = response?.data || response || {};
    if (result.error) throw new Error(result.error);
    return { status: result.passed ? 'passed' : 'failed', checks: result.checks || {}, tested_at: result.tested_at };
  }
  return { status: 'waiting_for_property_alert' };
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
  // The monthly counter is authoritative after first creation. Scanning up to
  // 1,000 DispatchCall rows on every live poll added needless latency and read
  // pressure before a new website call could be published to BPSPF.
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
  if (last > 99_999_999) throw new Error(`The ${period} BPS sequence has reached its eight-digit limit.`);
  await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: last });
  return Array.from({ length: count }, (_, index) => `BPS-${period}-${first + index}`);
}

function chooseCanonical(records: any[]) {
  return [...records].sort((a, b) => {
    // If any duplicate row was manually dismissed, keep that row as canonical so
    // duplicate cleanup can never preserve an active twin and resurrect the call.
    const aManual = a.manual_dismissed === true ? 0 : 1;
    const bManual = b.manual_dismissed === true ? 0 : 1;
    if (aManual !== bManual) return aManual - bManual;
    const aOfficial = a.official_cad_verified && a.agency_cad_number ? 0 : 1;
    const bOfficial = b.official_cad_verified && b.agency_cad_number ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    const aRef = String(a.bps_reference || a.call_id || '');
    const bRef = String(b.bps_reference || b.call_id || '');
    if (aRef !== bRef) return aRef.localeCompare(bRef);
    return new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();
  })[0];
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function acquireIngestionLease(base44: any) {
  const token = crypto.randomUUID();
  const now = Date.now();
  const counters = await base44.asServiceRole.entities.CadCounter.filter({ counter_key: 'dispatch_call' });
  let counter = counters?.[0];

  if (!counter) {
    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000);
    const highest = (calls || []).reduce((max: number, call: any) => {
      const match = String(call.call_id || '').match(/^B(\d+)$/i);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    counter = await base44.asServiceRole.entities.CadCounter.create({
      counter_key: 'dispatch_call',
      last_number: highest,
      ingestion_lock_token: '',
      ingestion_locked_until: new Date(0).toISOString(),
    });
  }

  const lockedUntil = new Date(counter.ingestion_locked_until || 0).getTime();
  if (lockedUntil > now) return null;

  await base44.asServiceRole.entities.CadCounter.update(counter.id, {
    ingestion_lock_token: token,
    ingestion_locked_until: new Date(now + 60_000).toISOString(),
  });

  // Let simultaneous contenders finish their writes, then only the final token owner proceeds.
  await wait(500);
  const verified = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: 'dispatch_call' }))?.[0];
  return verified?.ingestion_lock_token === token ? { id: verified.id, token } : null;
}

async function releaseIngestionLease(base44: any, lease: any) {
  if (!lease) return;
  const current = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: 'dispatch_call' }))?.[0];
  if (current?.id === lease.id && current?.ingestion_lock_token === lease.token) {
    await base44.asServiceRole.entities.CadCounter.update(lease.id, {
      ingestion_lock_token: '',
      ingestion_locked_until: new Date(0).toISOString(),
    }).catch(() => null);
  }
}

// Minute-cadence, alert-first ingestion. Keep expensive official source
// enrichment and long history reconciliation out of the live notification path.
async function ingestFastPublishedCalls(base44: any, incoming: any[]) {
  const started = Date.now();
  const [saved, history, locations, alerts] = await Promise.all([
    base44.asServiceRole.entities.DispatchCall.list('-created_date', 500),
    base44.asServiceRole.entities.CallHistory.list('-archived_date', 500).catch(() => []),
    base44.asServiceRole.entities.Location.list('site_name', 100).catch(() => []),
    base44.asServiceRole.entities.PropertyAlert.list('-created_date', 300).catch(() => []),
  ]);
  const byExternal = new Map<string, any>();
  const byLegacy = new Map<string, any>();
  for (const row of saved || []) {
    if (externalKey(row) && !byExternal.has(externalKey(row))) byExternal.set(externalKey(row), row);
    if (legacyKey(row) && !byLegacy.has(legacyKey(row))) byLegacy.set(legacyKey(row), row);
  }
  const archivedExternal = new Set((history || []).map((row: any) => externalKey(row)).filter(Boolean));
  const archivedLegacy = new Set((history || []).map((row: any) => legacyKey(row)).filter(Boolean));
  const monitored = (locations || []).filter((row: any) => row.active !== false && row.property_monitoring_enabled === true);
  const callPropertyKeys = new Set((alerts || []).map((row: any) => String(row.propertyId || '') + '|' + String(row.callId || '')));
  const alertKeys = new Set((alerts || []).map((row: any) => String(row.source_key ||
    [row.propertyId || '', row.callTime || row.time_received || row.created_date || '',
      String(row.callIncident || '').toUpperCase(), String(row.callLocation || '').toUpperCase()].join('|'))));
  const now = Date.now();
  const recent = incoming.filter(row => new Date(row.time_received || 0).getTime() >= now - 3 * 60 * 60_000)
    .sort((a, b) => new Date(b.time_received).getTime() - new Date(a.time_received).getTime());
  const seen = new Set<string>();
  const newCalls = recent.filter(row => {
    const external = externalKey(row), legacy = legacyKey(row), key = external || legacy;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return !byExternal.has(external) && !byLegacy.has(legacy)
      && !archivedExternal.has(external) && !archivedLegacy.has(legacy);
  }).slice(0, 40);
  const numbers = await reserveCadNumbers(base44, newCalls.length);
  const sideEffects: Promise<any>[] = [];
  let created = 0, updated = 0, propertyAlertsCreated = 0, alertFailures = 0;
  // New records and their PropertyAlert realtime events precede all updates.
  for (let offset = 0; offset < newCalls.length; offset += 4) {
    await Promise.all(newCalls.slice(offset, offset + 4).map(async (row, index) => {
      const reference = numbers[offset + index], official = String(row.agency_cad_number || '').trim();
      const call = await base44.asServiceRole.entities.DispatchCall.create({
        ...persistableCall(row), bps_reference: reference, call_id: official || reference,
        cad_number_source: official ? 'official_government_feed' : 'bps_internal',
        official_cad_verified: Boolean(official),
      });
      created++;
      try {
        propertyAlertsCreated += await createImmediatePropertyAlerts(
          base44, call, monitored, callPropertyKeys, alertKeys, sideEffects
        );
      } catch (error) {
        alertFailures++;
        console.error('Fast CAD property-alert creation failed; next sync will retry', error?.message || error);
      }
    }));
  }
  const updateQueue = recent.filter(row => {
    const existing = byExternal.get(externalKey(row)) || byLegacy.get(legacyKey(row));
    return existing && existing.manual_dismissed !== true &&
      ['incident','location','agency','zone','status','priority','time_received','latitude','longitude']
        .some(field => row[field] !== undefined && row[field] !== existing[field]);
  }).slice(0, 60);
  for (let offset = 0; offset < updateQueue.length; offset += 4) {
    await Promise.all(updateQueue.slice(offset, offset + 4).map(async row => {
      const previous = byExternal.get(externalKey(row)) || byLegacy.get(legacyKey(row));
      const patch = {
        ...persistableCall(row),
        agency_cad_number: previous.official_cad_verified ? previous.agency_cad_number : (row.agency_cad_number || ''),
        bps_reference: previous.bps_reference, call_id: previous.call_id,
        cad_number_source: previous.cad_number_source || 'bps_internal',
        official_cad_verified: previous.official_cad_verified === true,
      };
      await base44.asServiceRole.entities.DispatchCall.update(previous.id, patch);
      updated++;
      if (!['Cleared', 'Cancelled'].includes(String(patch.status || ''))) {
        try {
          propertyAlertsCreated += await createImmediatePropertyAlerts(
            base44, { ...previous, ...patch }, monitored, callPropertyKeys, alertKeys, sideEffects
          );
        } catch (error) {
          alertFailures++;
          console.error('Fast CAD updated-call alert failed; next sync will retry', error?.message || error);
        }
      }
    }));
  }
  // An earlier alert write or geocoder may have failed after DispatchCall was
  // already saved. Recheck recent persisted calls on every minute run, even if
  // the call's upstream fields did not change, so the warning cannot be lost.
  for (const row of recent.slice(0, 80)) {
    const previous = byExternal.get(externalKey(row)) || byLegacy.get(legacyKey(row));
    if (!previous || previous.manual_dismissed === true || ['Cleared', 'Cancelled'].includes(String(previous.status || ''))) continue;
    try {
      propertyAlertsCreated += await createImmediatePropertyAlerts(
        base44, { ...previous, ...row, id: previous.id }, monitored, callPropertyKeys, alertKeys, sideEffects
      );
    } catch (error) {
      alertFailures++;
      console.error('Fast CAD missing-property-alert retry failed', error?.message || error);
    }
  }
  const liveKeys = new Set(incoming.flatMap(row => [externalKey(row), legacyKey(row)]).filter(Boolean));
  const disappeared = (saved || []).filter(row => {
    const receivedAt = new Date(row.time_received || row.created_date || 0).getTime();
    return receivedAt >= now - 3 * 60 * 60_000 && receivedAt <= now &&
      !['Cleared','Cancelled'].includes(String(row.status || '')) &&
      row.manual_dismissed !== true && !liveKeys.has(externalKey(row)) && !liveKeys.has(legacyKey(row));
  }).slice(0, 20);
  for (let offset = 0; offset < disappeared.length; offset += 4) {
    await Promise.all(disappeared.slice(offset, offset + 4).map(row =>
      base44.asServiceRole.entities.DispatchCall.update(row.id, {
        status: 'Cleared', time_closed: row.time_closed || new Date().toISOString(),
      }).catch(error => console.warn('Fast CAD close failed', error?.message || error))
    ));
  }
  await Promise.allSettled(sideEffects);
  return { success: true, lightweight: true, active: incoming.length,
    created, updated, removed: disappeared.length, property_alerts_created: propertyAlertsCreated,
    alert_failures: alertFailures, synced_at: new Date().toISOString(), duration_ms: Date.now() - started };
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const scheduledRun = body?.scheduled === true;
    const user = await base44.auth.me().catch(() => null);

    // Scheduled Base44 automations do not depend on an interactive officer session.
    // Interactive/manual recovery still requires an authenticated internal user.
    if (!scheduledRun) {
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const roles = new Set((user.additional_roles || []).map((role: string) => String(role).trim().toLowerCase()));
      const primaryRole = String(user.role || '').trim().toLowerCase();
      const restrictedRoles = new Set(['client', 'student', 'pending']);
      const isInternalUser = !restrictedRoles.has(primaryRole)
        && String(user.employment_status || 'active').trim().toLowerCase() !== 'terminated';
      const hasCadAccess = primaryRole === 'admin'
        || primaryRole === 'dispatch'
        || user.dispatch_role === true
        || roles.has('dispatch')
        || roles.has('cad_access')
        || roles.has('full_access');
      // Every authenticated internal app session may refresh this public, read-only
      // emergency feed. Writes remain confined to this audited service-role function.
      // Client/student/pending accounts cannot invoke ingestion.
      if (!isInternalUser && !hasCadAccess) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lease = await acquireIngestionLease(base44);
    if (!lease) {
      return Response.json({ success: true, skipped: true, reason: 'GRAC synchronization already in progress' });
    }

    try {
    // The website table is the live source of truth. Pull it every run and merge
    // the JSON API only as an enrichment source for stable IDs/coordinates. This
    // prevents a lagging /api/active cache from holding a website-visible call for
    // 10-20 minutes before BPSPF can see it.
    const liveSourceUrl = `${GRAC_API_URL}?bpspf=${Date.now()}-${crypto.randomUUID()}`;
    const [websiteResult, apiResult] = await Promise.allSettled([
      fetchLiveWebsiteCalls(),
      fetch(liveSourceUrl, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BPS-Pathfinder-CAD/4.2',
          'Cache-Control': 'no-cache, no-store, max-age=0',
          Pragma: 'no-cache',
        },
        signal: AbortSignal.timeout(10_000),
      }).then(async response => {
        if (!response.ok) throw new Error(`GRAC API returned HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error('Unexpected GRAC API response');
        return payload.map(normalizeCall).filter(Boolean) as any[];
      }),
    ]);
    const websiteIncoming = websiteResult.status === 'fulfilled' ? websiteResult.value : [];
    const apiIncoming = apiResult.status === 'fulfilled' ? apiResult.value : [];
    if (!websiteIncoming.length && !apiIncoming.length) {
      console.error('No GRAC live source available', {
        website: websiteResult.status === 'rejected' ? websiteResult.reason?.message || String(websiteResult.reason) : 'empty',
        api: apiResult.status === 'rejected' ? apiResult.reason?.message || String(apiResult.reason) : 'empty',
      });
      return Response.json({ success: false, error: 'No usable active calls; existing data preserved' }, { status: 502 });
    }
    let incoming = mergeLiveWebsiteAndApi(websiteIncoming, apiIncoming);
    // Website-only rows do not carry map coordinates. Geocode only the newest
    // unmatched rows immediately so monitored-property alerts can be evaluated in
    // the same minute rather than waiting for the slower API to catch up.
    incoming = await geocodeFreshWebsiteOnlyCalls(incoming);
    // Publish new calls and monitored-property speech before lengthy enrichment.
    if (scheduledRun || body?.live_sync === true || body?.fast_sync === true) {
      return Response.json(await ingestFastPublishedCalls(base44, incoming));
    }
    // The full historical reconciliation remains available for maintenance.
    incoming = await enrichOfficialIdentifiers(incoming);

    let existingCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000);
    const incomingByLegacy = new Map(incoming.map(call => [legacyKey(call), call]));
    const groups = new Map<string, any[]>();
    for (const record of existingCalls || []) {
      const key = legacyKey(record) || externalKey(record);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) || []), record]);
    }

    let duplicatesRemoved = 0;
    for (const [key, records] of groups) {
      const canonical = chooseCanonical(records);
      const matchingIncoming = incomingByLegacy.get(legacyKey(canonical));
      const upstreamId = matchingIncoming?.external_call_id || externalKey(canonical);
      if (upstreamId && canonical.external_call_id !== upstreamId) {
        await base44.asServiceRole.entities.DispatchCall.update(canonical.id, { external_call_id: upstreamId });
      }
      for (const duplicate of records) {
        if (duplicate.id === canonical.id) continue;
        await base44.asServiceRole.entities.DispatchCall.delete(duplicate.id).catch(() => null);
        duplicatesRemoved += 1;
      }
    }

    existingCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000);
    const byExternal = new Map<string, any>();
    const byLegacy = new Map<string, any>();
    for (const record of existingCalls || []) {
      const external = externalKey(record);
      const legacy = legacyKey(record);
      if (external && !byExternal.has(external)) byExternal.set(external, record);
      if (legacy && !byLegacy.has(legacy)) byLegacy.set(legacy, record);
    }

    // Calls are intentionally removed from DispatchCall after one hour and kept in
    // CallHistory. GRAC can continue publishing an old call while it remains active;
    // without this tombstone check ingestion would recreate it on every sync and the
    // property-monitoring system would generate a new alert for the same call.
    const archivedHistory = await base44.asServiceRole.entities.CallHistory.list('-archived_date', 2000).catch(() => []);
    const archivedByExternal = new Set((archivedHistory || []).map((row: any) => externalKey(row)).filter(Boolean));
    const archivedByLegacy = new Set((archivedHistory || []).map((row: any) => legacyKey(row)).filter(Boolean));

    // Preload the property-monitoring state once so every call can be checked
    // immediately after its DispatchCall write instead of waiting for the entire
    // ingest batch to finish.
    const [immediateLocations, immediateExistingAlerts] = await Promise.all([
      base44.asServiceRole.entities.Location.list('site_name', 100).catch(() => []),
      base44.asServiceRole.entities.PropertyAlert.list('-created_date', 1000).catch(() => []),
    ]);
    const immediateMonitored = (immediateLocations || [])
      .filter((location: any) => location.active !== false && location.property_monitoring_enabled === true);
    const immediateCallPropertyKeys = new Set((immediateExistingAlerts || []).map((alert: any) =>
      `${String(alert?.propertyId || '')}|${String(alert?.callId || '')}`
    ));
    const immediateAlertKeys = new Set((immediateExistingAlerts || []).map((alert: any) => {
      if (alert?.source_key) return String(alert.source_key);
      return [
        String(alert?.propertyId || ''),
        String(alert?.callTime || alert?.time_received || alert?.created_date || ''),
        String(alert?.callIncident || '').trim().toUpperCase(),
        String(alert?.callLocation || '').trim().toUpperCase(),
      ].join('|');
    }));
    const immediatePropertySideEffects: Promise<any>[] = [];
    let immediatePropertyAlertsCreated = 0;

    const uniqueExisting = [...new Map(existingCalls.map(record => [record.id, record])).values()];
    const needingCad = uniqueExisting.filter(record =>
      recordKey(record) && !/^BPS-\d{6}-\d{1,8}$/i.test(String(record.bps_reference || ''))
    );
    const newCalls = incoming.filter(call =>
      !byExternal.has(call.external_call_id) &&
      !byLegacy.has(legacyKey(call)) &&
      !archivedByExternal.has(externalKey(call)) &&
      !archivedByLegacy.has(legacyKey(call))
    );
    const cadNumbers = await reserveCadNumbers(base44, needingCad.length + newCalls.length);
    let cadIndex = 0;
    for (const record of needingCad) {
      const bpsReference = cadNumbers[cadIndex++];
      const officialCad = String(record.agency_cad_number || '').trim();
      const cleanDescription = String(record.description || '')
        .replace(/\s*\[GRAC:[^\]]+\]\s*/gi, ' ')
        .replace(/\s*\[CAD:[^\]]+\]\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      await base44.asServiceRole.entities.DispatchCall.update(record.id, {
        bps_reference: bpsReference,
        call_id: officialCad || bpsReference,
        cad_number_source: officialCad ? 'official_government_feed' : 'bps_internal',
        official_cad_verified: Boolean(officialCad),
        external_call_id: externalKey(record),
        description: cleanDescription,
      });
    }

    let created = 0, updated = 0, removed = 0;
    for (const callData of incoming) {
      const incomingExternal = externalKey(callData);
      const incomingLegacy = legacyKey(callData);
      const existing = byExternal.get(callData.external_call_id) || byLegacy.get(incomingLegacy);
      const alreadyArchived = archivedByExternal.has(incomingExternal) || archivedByLegacy.has(incomingLegacy);
      if (!existing && alreadyArchived) {
        // Keep the one-hour archive authoritative. Do not resurrect a call that the
        // CAD history system has already moved out of the active queue.
        continue;
      }
      if (!existing) {
        const bpsReference = cadNumbers[cadIndex++];
        const officialCad = String(callData.agency_cad_number || '').trim();
        const createdRecord = await base44.asServiceRole.entities.DispatchCall.create({
          ...callData,
          bps_reference: bpsReference,
          call_id: officialCad || bpsReference,
          cad_number_source: officialCad ? 'official_government_feed' : 'bps_internal',
          official_cad_verified: Boolean(officialCad),
          description: callData.description,
        });
        created += 1;
        immediatePropertyAlertsCreated += await createImmediatePropertyAlerts(
          base44,
          createdRecord,
          immediateMonitored,
          immediateCallPropertyKeys,
          immediateAlertKeys,
          immediatePropertySideEffects,
        );
      } else {
        const matchedOfficialCad = String(callData.agency_cad_number || '').trim();
        const existingAgency = String(existing.agency || callData.agency || '').toUpperCase();
        const existingCallId = String(existing.call_id || '').trim();
        const chesterfieldPublicId = existingAgency === 'CCPD' && /^B\d+$/i.test(existingCallId) ? existingCallId : '';
        const savedOfficialCad = existing.official_cad_verified ? String(existing.agency_cad_number || '').trim() : chesterfieldPublicId;
        const officialCad = matchedOfficialCad || savedOfficialCad;
        const bpsReference = String(existing.bps_reference || '').trim();
        const manuallyCleared = existing.manual_dismissed === true;
        const incomingWithCad = {
          ...callData,
          // A Pathfinder manual clear is authoritative for this exact upstream call
          // ID. GRAC may continue publishing it, but ingestion must keep it dismissed.
          status: manuallyCleared ? 'Cleared' : callData.status,
          manual_dismissed: manuallyCleared,
          ...(manuallyCleared ? { manual_dismissed_at: existing.manual_dismissed_at || existing.time_cleared || new Date().toISOString() } : {}),
          agency_cad_number: officialCad,
          bps_reference: bpsReference,
          call_id: officialCad || bpsReference || existing.call_id,
          cad_number_source: officialCad ? 'official_government_feed' : 'bps_internal',
          official_cad_verified: Boolean(officialCad),
          description: callData.description,
          ...(manuallyCleared ? { time_cleared: existing.time_cleared || existing.manual_dismissed_at || new Date().toISOString() } : {}),
        };
        if (changed(existing, incomingWithCad)) {
          await base44.asServiceRole.entities.DispatchCall.update(existing.id, incomingWithCad);
          const updatedRecord = { ...existing, ...incomingWithCad, id: existing.id };
          updated += 1;
          immediatePropertyAlertsCreated += await createImmediatePropertyAlerts(
            base44,
            updatedRecord,
            immediateMonitored,
            immediateCallPropertyKeys,
            immediateAlertKeys,
            immediatePropertySideEffects,
          );
        }
      }
    }

    const currentExternalKeys = new Set(incoming.map(call => call.external_call_id));
    const currentLegacyKeys = new Set(incoming.map(call => legacyKey(call)));
    for (const record of existingCalls || []) {
      const external = externalKey(record);
      const legacy = legacyKey(record);
      if (recordKey(record) && !currentExternalKeys.has(external) && !currentLegacyKeys.has(legacy)) {
        await base44.asServiceRole.entities.DispatchCall.update(record.id, {
          status: 'Cleared',
          time_closed: record.time_closed || new Date().toISOString(),
        }).catch(() => null);
        removed += 1;
      }
    }

    // Side effects were started as soon as each verified PropertyAlert was created.
    // Wait for those background writes before the safety reconciliation so it can
    // see any auto-dispatch receipts and avoid redundant work.
    await Promise.allSettled(immediatePropertySideEffects);

    // Final reconciliation closes any race caused by simultaneous browser sync requests.
    const finalCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000);
    const finalGroups = new Map<string, any[]>();
    for (const record of finalCalls || []) {
      const key = legacyKey(record) || externalKey(record);
      if (key) finalGroups.set(key, [...(finalGroups.get(key) || []), record]);
    }
    for (const records of finalGroups.values()) {
      const canonical = chooseCanonical(records);
      for (const duplicate of records) {
        if (duplicate.id !== canonical.id) {
          await base44.asServiceRole.entities.DispatchCall.delete(duplicate.id).catch(() => null);
          duplicatesRemoved += 1;
        }
      }
    }

    const reconciledPropertyAlertsCreated = await reconcilePropertyAlerts(base44).catch(error => {
      console.error('Property alert reconciliation failed:', error);
      return 0;
    });
    const propertyAlertsCreated = immediatePropertyAlertsCreated + reconciledPropertyAlertsCreated;
    const phase2aSafety = await ensurePhase2ASafetyEvidence(base44).catch(error => {
      console.error('Phase 2A shadow safety verification failed:', error);
      return { status: 'failed', error: error?.message || String(error) };
    });
    // Automatic-dispatch acknowledgement/welfare monitoring is owned by its own
    // scheduled backend automation. Do not invoke it again from every GRAC ingest;
    // the duplicate nested run was one of the largest avoidable request bursts.

    return Response.json({ success: true, active: incoming.length, created, updated, removed, duplicates_removed: duplicatesRemoved, property_alerts_created: propertyAlertsCreated, phase_2a_safety: phase2aSafety, synced_at: new Date().toISOString(), duration_ms: Date.now() - startedAt });
    } finally {
      await releaseIngestionLease(base44, lease);
    }
  } catch (error) {
    console.error('GRAC ingestion failed:', error);
    return Response.json({ success: false, error: error?.message || 'GRAC ingestion failed' }, { status: 500 });
  }
});