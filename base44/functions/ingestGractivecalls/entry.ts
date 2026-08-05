import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const GRAC_API_URL = 'https://gractivecalls.com/api/active';
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

function externalKey(record: any) {
  if (record?.external_call_id) return String(record.external_call_id);
  const descriptionMatch = String(record?.description || '').match(/\[GRAC:([^\]]+)\]/);
  if (descriptionMatch?.[1]) return descriptionMatch[1];
  const legacy = String(record?.call_id || '');
  return legacy.startsWith('grac-') ? legacy.slice(5) : '';
}

function normalizeCall(row: any) {
  const agency = String(row?.agency || '').trim().toUpperCase();
  if (!row?._id || !row?.incident || !row?.location || !ALLOWED_AGENCIES.has(agency)) return null;
  const external_call_id = String(row._id);
  const received = new Date(row.timeReceived);
  const latitude = validCoordinate(row?.coords?.[0]);
  const longitude = validCoordinate(row?.coords?.[1]);
  return {
    external_call_id,
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
  const fields = ['external_call_id','incident','location','agency','zone','status','priority','time_received','source','description','latitude','longitude','geo_confidence','geo_method','geo_approximate'];
  return fields.some(field => existing?.[field] !== incoming?.[field]);
}

async function reserveCadNumbers(base44: any, count: number) {
  if (count <= 0) return [];
  const counters = await base44.asServiceRole.entities.CadCounter.filter({ counter_key: 'dispatch_call' });
  let counter = counters?.[0];
  const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
  const highest = (calls || []).reduce((max: number, call: any) => {
    const match = String(call.call_id || '').match(/^B(\d+)$/i);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, Number(counter?.last_number || 0));
  if (!counter) counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: 'dispatch_call', last_number: highest });
  const first = Math.max(highest, Number(counter.last_number || 0)) + 1;
  const last = first + count - 1;
  await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: last });
  return Array.from({ length: count }, (_, index) => `B${String(first + index).padStart(4, '0')}`);
}

function chooseCanonical(records: any[]) {
  return [...records].sort((a, b) => {
    const aValid = /^B\d+$/i.test(String(a.call_id || '')) ? 0 : 1;
    const bValid = /^B\d+$/i.test(String(b.call_id || '')) ? 0 : 1;
    if (aValid !== bValid) return aValid - bValid;
    const aNum = Number(String(a.call_id || '').replace(/^B/i, '')) || Number.MAX_SAFE_INTEGER;
    const bNum = Number(String(b.call_id || '').replace(/^B/i, '')) || Number.MAX_SAFE_INTEGER;
    if (aNum !== bNum) return aNum - bNum;
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
    const groups = new Map<string, any[]>();
    for (const record of existingCalls || []) {
      const key = externalKey(record);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) || []), record]);
    }

    let duplicatesRemoved = 0;
    for (const [key, records] of groups) {
      const canonical = chooseCanonical(records);
      if (canonical.external_call_id !== key) await base44.asServiceRole.entities.DispatchCall.update(canonical.id, { external_call_id: key });
      for (const duplicate of records) {
        if (duplicate.id === canonical.id) continue;
        await base44.asServiceRole.entities.DispatchCall.delete(duplicate.id).catch(() => null);
        duplicatesRemoved += 1;
      }
    }

    existingCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const byExternal = new Map<string, any>();
    for (const record of existingCalls || []) {
      const key = externalKey(record);
      if (key && !byExternal.has(key)) byExternal.set(key, record);
    }

    const needingCad = [...byExternal.values()].filter(record => !/^B\d+$/i.test(String(record.call_id || '')));
    const newCalls = incoming.filter(call => !byExternal.has(call.external_call_id));
    const cadNumbers = await reserveCadNumbers(base44, needingCad.length + newCalls.length);
    let cadIndex = 0;
    for (const record of needingCad) {
      const cadNumber = cadNumbers[cadIndex++];
      const cleanDescription = String(record.description || '')
        .replace(/\s*\[GRAC:[^\]]+\]\s*/gi, ' ')
        .replace(/\s*\[CAD:[^\]]+\]\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      await base44.asServiceRole.entities.DispatchCall.update(record.id, {
        call_id: cadNumber,
        external_call_id: externalKey(record),
        description: cleanDescription ? `${cleanDescription} [CAD:${cadNumber}]` : `[CAD:${cadNumber}]`,
      });
    }

    let created = 0, updated = 0, removed = 0;
    for (const callData of incoming) {
      const existing = byExternal.get(callData.external_call_id);
      if (!existing) {
        const cadNumber = cadNumbers[cadIndex++];
        await base44.asServiceRole.entities.DispatchCall.create({
          ...callData,
          call_id: cadNumber,
          description: `${callData.description} [CAD:${cadNumber}]`,
        });
        created += 1;
      } else {
        const cadNumber = /^B\d+$/i.test(String(existing.call_id || '')) ? existing.call_id : '';
        const incomingWithCad = {
          ...callData,
          description: cadNumber ? `${callData.description} [CAD:${cadNumber}]` : callData.description,
        };
        if (changed(existing, incomingWithCad)) {
          await base44.asServiceRole.entities.DispatchCall.update(existing.id, incomingWithCad);
          updated += 1;
        }
      }
    }

    const currentKeys = new Set(incoming.map(call => call.external_call_id));
    for (const record of existingCalls || []) {
      const key = externalKey(record);
      if (key && !currentKeys.has(key)) {
        await base44.asServiceRole.entities.DispatchCall.delete(record.id).catch(() => null);
        removed += 1;
      }
    }

    // Final reconciliation closes any race caused by simultaneous browser sync requests.
    const finalCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const finalGroups = new Map<string, any[]>();
    for (const record of finalCalls || []) {
      const key = externalKey(record);
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