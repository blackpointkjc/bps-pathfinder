import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const GRAC_API_URL = 'https://gractivecalls.com/api/active';
const HENRICO_ACTIVE_URL = 'https://activecalls.henrico.gov/';
const CHESTERFIELD_CALLS_URL = 'https://api.chesterfield.gov/api/Police/V1.1/Calls/CallsForService';
const CHESTERFIELD_PUBLIC_API_KEY = '9f42e1e5-200a-4540-86de-74b8c2a11670';
const ALLOWED_AGENCIES = new Set(['RPD', 'RFD', 'HPD', 'HFD', 'CCPD', 'CCFD']);
const AGENCY_SOURCE: Record<string, string> = { RPD: 'richmond', RFD: 'richmond', HPD: 'henrico', HFD: 'henrico', CCPD: 'chesterfield', CCFD: 'chesterfield' };

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
    const distance = Math.min(Math.abs(minute - rowMinute), 1440 - Math.abs(minute - rowMinute));
    return cleanMatchText(row.location) === location && cleanMatchText(row.incident) === incident && distance <= 3;
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

function changed(existing: any, incoming: any) {
  const fields = ['external_call_id','agency_cad_number','bps_reference','cad_number_source','official_cad_verified','call_id','incident','location','agency','zone','status','priority','time_received','source','description','latitude','longitude','geo_confidence','geo_method','geo_approximate'];
  return fields.some(field => existing?.[field] !== incoming?.[field]);
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
  const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
  const highest = (calls || []).reduce((max: number, call: any) => {
    const match = String(call.bps_reference || call.call_id || '').match(/^BPS-(\d{6})-(\d{1,8})$/i);
    return Math.max(max, match && match[1] === period ? Number(match[2]) : 0);
  }, Number(counter?.last_number || 0));
  if (!counter) counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: counterKey, last_number: highest });
  const first = Math.max(highest, Number(counter.last_number || 0)) + 1;
  const last = first + count - 1;
  if (last > 99_999_999) throw new Error(`The ${period} BPS sequence has reached its eight-digit limit.`);
  await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: last });
  return Array.from({ length: count }, (_, index) => `BPS-${period}-${first + index}`);
}

function chooseCanonical(records: any[]) {
  return [...records].sort((a, b) => {
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
    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
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

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('cad_access') && !roles.has('full_access')) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const lease = await acquireIngestionLease(base44);
    if (!lease) {
      return Response.json({ success: true, skipped: true, reason: 'GRAC synchronization already in progress' });
    }

    try {
    const response = await fetch(GRAC_API_URL, { headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-CAD/4.0' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return Response.json({ success: false, error: `GRAC API returned HTTP ${response.status}` }, { status: 502 });
    const payload = await response.json();
    if (!Array.isArray(payload)) return Response.json({ success: false, error: 'Unexpected GRAC response' }, { status: 502 });
    const incoming = payload.map(normalizeCall).filter(Boolean) as any[];
    if (!incoming.length) return Response.json({ success: false, error: 'No usable active calls; existing data preserved' }, { status: 502 });

    let existingCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
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

    existingCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const byExternal = new Map<string, any>();
    const byLegacy = new Map<string, any>();
    for (const record of existingCalls || []) {
      const external = externalKey(record);
      const legacy = legacyKey(record);
      if (external && !byExternal.has(external)) byExternal.set(external, record);
      if (legacy && !byLegacy.has(legacy)) byLegacy.set(legacy, record);
    }

    const uniqueExisting = [...new Map(existingCalls.map(record => [record.id, record])).values()];
    const needingCad = uniqueExisting.filter(record =>
      recordKey(record) && !/^BPS-\d{6}-\d{1,8}$/i.test(String(record.bps_reference || ''))
    );
    const newCalls = incoming.filter(call =>
      !byExternal.has(call.external_call_id) && !byLegacy.has(legacyKey(call))
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
      const existing = byExternal.get(callData.external_call_id) || byLegacy.get(legacyKey(callData));
      if (!existing) {
        const bpsReference = cadNumbers[cadIndex++];
        const officialCad = String(callData.agency_cad_number || '').trim();
        await base44.asServiceRole.entities.DispatchCall.create({
          ...callData,
          bps_reference: bpsReference,
          call_id: officialCad || bpsReference,
          cad_number_source: officialCad ? 'official_government_feed' : 'bps_internal',
          official_cad_verified: Boolean(officialCad),
          description: callData.description,
        });
        created += 1;
      } else {
        const officialCad = String(callData.agency_cad_number || '').trim();
        const bpsReference = String(existing.bps_reference || '').trim();
        const incomingWithCad = {
          ...callData,
          bps_reference: bpsReference,
          call_id: officialCad || bpsReference || existing.call_id,
          cad_number_source: officialCad ? 'official_government_feed' : 'bps_internal',
          official_cad_verified: Boolean(officialCad),
          description: callData.description,
        };
        if (changed(existing, incomingWithCad)) {
          await base44.asServiceRole.entities.DispatchCall.update(existing.id, incomingWithCad);
          updated += 1;
        }
      }
    }

    const currentExternalKeys = new Set(incoming.map(call => call.external_call_id));
    const currentLegacyKeys = new Set(incoming.map(call => legacyKey(call)));
    for (const record of existingCalls || []) {
      const external = externalKey(record);
      const legacy = legacyKey(record);
      if (recordKey(record) && !currentExternalKeys.has(external) && !currentLegacyKeys.has(legacy)) {
        await base44.asServiceRole.entities.DispatchCall.delete(record.id).catch(() => null);
        removed += 1;
      }
    }

    // Final reconciliation closes any race caused by simultaneous browser sync requests.
    const finalCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
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

    return Response.json({ success: true, active: incoming.length, created, updated, removed, duplicates_removed: duplicatesRemoved, synced_at: new Date().toISOString(), duration_ms: Date.now() - startedAt });
    } finally {
      await releaseIngestionLease(base44, lease);
    }
  } catch (error) {
    console.error('GRAC ingestion failed:', error);
    return Response.json({ success: false, error: error?.message || 'GRAC ingestion failed' }, { status: 500 });
  }
});