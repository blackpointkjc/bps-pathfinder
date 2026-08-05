import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const GRAC_API_URL = 'https://gractivecalls.com/api/active';
const ALLOWED_AGENCIES = new Set(['RPD', 'RFD', 'HPD', 'HFD', 'CCPD', 'CCFD']);
const AGENCY_SOURCE: Record<string, string> = { RPD: 'richmond', RFD: 'richmond', HPD: 'henrico', HFD: 'henrico', CCPD: 'chesterfield', CCFD: 'chesterfield' };

function normalizeStatus(rawStatus: unknown) {
  const value = String(rawStatus || '').trim().toUpperCase();
  if (!value) return 'New';
  if (value.includes('DISPATCH') || value.includes('ASSIGN')) return 'Dispatched';
  if (value.includes('ENROUTE') || value.includes('EN ROUTE')) return 'Enroute';
  if (value.includes('ARRIV') || value.startsWith('ARV') || value.includes('ON SCENE')) return 'On Scene';
  return 'New';
}

function normalizePriority(incident: unknown) {
  const text = String(incident || '').toUpperCase();
  if (/SHOOT|STABB|ROBBERY|ARMED|PERSON SHOT|OFFICER (DOWN|NEEDS)|EXPLOSION/.test(text)) return 'critical';
  if (/ASSAULT|DOMESTIC.*VIOLENT|FIGHT|MISSING PERSON|PERSONAL INJURY|BURGLARY.*PROGRESS/.test(text)) return 'high';
  if (/CRASH|ACCIDENT|FIRE|EMS|SUSPICIOUS|LARCENY|DOMESTIC/.test(text)) return 'medium';
  return 'low';
}

function validCoordinate(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function externalKey(record: any) {
  const match = String(record?.description || '').match(/\[GRAC:([^\]]+)\]/);
  return match?.[1] || '';
}

function normalizeCall(row: any) {
  const agency = String(row?.agency || '').trim().toUpperCase();
  if (!row?._id || !row?.incident || !row?.location || !ALLOWED_AGENCIES.has(agency)) return null;
  const source = AGENCY_SOURCE[agency];
  const latitude = validCoordinate(row?.coords?.[0]);
  const longitude = validCoordinate(row?.coords?.[1]);
  const received = new Date(row.timeReceived);
  const key = String(row._id);
  return {
    external_key: key,
    incident: String(row.incident).trim(),
    location: String(row.location).trim(),
    agency,
    zone: String(row.district || '').trim(),
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.incident),
    time_received: Number.isNaN(received.getTime()) ? new Date().toISOString() : received.toISOString(),
    source,
    description: `${String(row.incident).trim()} at ${String(row.location).trim()} [GRAC:${key}]`,
    ...(latitude !== null && longitude !== null ? { latitude, longitude, geo_confidence: 'high', geo_method: 'grac', geo_approximate: false } : {}),
  };
}

function changed(existing: any, incoming: any) {
  const fields = ['incident','location','agency','zone','status','priority','time_received','source','description','latitude','longitude','geo_confidence','geo_method','geo_approximate'];
  return fields.some(field => existing?.[field] !== incoming?.[field]);
}

async function reserveCadNumbers(base44: any, count: number) {
  if (count <= 0) return [];
  const counters = await base44.asServiceRole.entities.CadCounter.filter({ counter_key: 'dispatch_call' });
  let counter = counters?.[0];
  if (!counter) {
    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const highest = (calls || []).reduce((max: number, call: any) => {
      const match = String(call.call_id || '').match(/^B(\d+)$/i);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: 'dispatch_call', last_number: highest });
  }
  const first = Number(counter.last_number || 0) + 1;
  const last = first + count - 1;
  await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: last });
  return Array.from({ length: count }, (_, index) => `B${String(first + index).padStart(4, '0')}`);
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('cad_access') && !roles.has('full_access')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const response = await fetch(GRAC_API_URL, { headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-CAD/3.0' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return Response.json({ success: false, error: `GRAC API returned HTTP ${response.status}` }, { status: 502 });
    const payload = await response.json();
    if (!Array.isArray(payload)) return Response.json({ success: false, error: 'GRAC API returned an unexpected response' }, { status: 502 });

    const incoming = payload.map(normalizeCall).filter(Boolean) as any[];
    if (!incoming.length) return Response.json({ success: false, error: 'GRAC API returned no usable active calls; existing data was preserved' }, { status: 502 });

    const existingCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const existingExternal = new Map<string, any>();
    for (const record of existingCalls || []) {
      const key = externalKey(record);
      if (key) existingExternal.set(key, record);
    }

    const newCalls = incoming.filter(call => !existingExternal.has(call.external_key));
    const cadNumbers = await reserveCadNumbers(base44, newCalls.length);
    let cadIndex = 0;
    let created = 0;
    let updated = 0;
    let removed = 0;

    for (const incomingCall of incoming) {
      const { external_key, ...callData } = incomingCall;
      const existing = existingExternal.get(external_key);
      if (!existing) {
        await base44.asServiceRole.entities.DispatchCall.create({ ...callData, call_id: cadNumbers[cadIndex++] });
        created += 1;
      } else if (changed(existing, callData)) {
        await base44.asServiceRole.entities.DispatchCall.update(existing.id, callData);
        updated += 1;
      }
    }

    const currentKeys = new Set(incoming.map(call => call.external_key));
    for (const record of existingCalls || []) {
      const key = externalKey(record);
      const legacyExternalId = String(record.call_id || '').startsWith('grac-');
      if (legacyExternalId || (key && !currentKeys.has(key))) {
        try {
          await base44.asServiceRole.entities.DispatchCall.delete(record.id);
          removed += 1;
        } catch (error) {
          console.warn(`Unable to remove stale external call ${record.id}:`, error?.message);
        }
      }
    }

    return Response.json({ success: true, active: incoming.length, created, updated, removed, synced_at: new Date().toISOString(), duration_ms: Date.now() - startedAt });
  } catch (error) {
    console.error('GRAC ingestion failed:', error);
    return Response.json({ success: false, error: error?.message || 'GRAC ingestion failed' }, { status: 500 });
  }
});