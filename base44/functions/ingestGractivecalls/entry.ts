import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GRAC_API_URL = 'https://gractivecalls.com/api/active';
const ACTIVE_SOURCES = new Set(['richmond', 'henrico', 'chesterfield']);
const ALLOWED_AGENCIES = new Set(['RPD', 'RFD', 'HPD', 'HFD', 'CCPD', 'CCFD']);

const AGENCY_SOURCE: Record<string, string> = {
  RPD: 'richmond',
  RFD: 'richmond',
  HPD: 'henrico',
  HFD: 'henrico',
  CCPD: 'chesterfield',
  CCFD: 'chesterfield',
};

function normalizeStatus(rawStatus: unknown) {
  const value = String(rawStatus || '').trim().toUpperCase();
  if (!value) return 'New';
  if (value.includes('DISPATCH') || value.includes('ASSIGN')) return 'Dispatched';
  if (value.includes('ENROUTE') || value.includes('EN ROUTE')) return 'Enroute';
  if (value.includes('ARRIV') || value.startsWith('ARV') || value.includes('ON SCENE')) return 'On Scene';
  if (value.includes('PEND')) return 'Pending';
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

function normalizeCall(row: any) {
  const agency = String(row?.agency || '').trim().toUpperCase();
  if (!row?._id || !row?.incident || !row?.location || !ALLOWED_AGENCIES.has(agency)) return null;

  const source = AGENCY_SOURCE[agency];
  const latitude = validCoordinate(row?.coords?.[0]);
  const longitude = validCoordinate(row?.coords?.[1]);
  const received = new Date(row.timeReceived);

  return {
    call_id: `grac-${String(row._id)}`,
    incident: String(row.incident).trim(),
    location: String(row.location).trim(),
    agency,
    zone: String(row.district || '').trim(),
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.incident),
    time_received: Number.isNaN(received.getTime()) ? new Date().toISOString() : received.toISOString(),
    source,
    description: `${String(row.incident).trim()} at ${String(row.location).trim()}`,
    ...(latitude !== null && longitude !== null
      ? {
          latitude,
          longitude,
          geo_confidence: 'high',
          geo_method: 'grac',
          geo_approximate: false,
        }
      : {}),
  };
}

function changed(existing: any, incoming: any) {
  const fields = [
    'call_id', 'incident', 'location', 'agency', 'zone', 'status', 'priority',
    'time_received', 'source', 'description', 'latitude', 'longitude',
    'geo_confidence', 'geo_method', 'geo_approximate',
  ];
  return fields.some((field) => existing?.[field] !== incoming?.[field]);
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'dispatch') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const response = await fetch(GRAC_API_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BPS-Pathfinder-CAD/2.0',
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return Response.json(
        { success: false, error: `GRAC API returned HTTP ${response.status}` },
        { status: 502 },
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return Response.json(
        { success: false, error: 'GRAC API returned an unexpected response' },
        { status: 502 },
      );
    }

    const incoming = payload.map(normalizeCall).filter(Boolean);
    if (incoming.length === 0) {
      return Response.json(
        { success: false, error: 'GRAC API returned no usable active calls; existing data was preserved' },
        { status: 502 },
      );
    }

    const allExisting = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000);
    const byCallId = new Map<string, any>();
    const duplicateIds = new Set<string>();

    for (const record of allExisting || []) {
      if (!record.call_id) continue;
      const current = byCallId.get(record.call_id);
      if (!current) {
        byCallId.set(record.call_id, record);
      } else {
        const keepRecord = new Date(record.updated_date || record.created_date).getTime() >
          new Date(current.updated_date || current.created_date).getTime();
        duplicateIds.add(keepRecord ? current.id : record.id);
        if (keepRecord) byCallId.set(record.call_id, record);
      }
    }

    const incomingIds = new Set(incoming.map((call: any) => call.call_id));
    let created = 0;
    let updated = 0;
    let removed = 0;

    for (const call of incoming as any[]) {
      const existing = byCallId.get(call.call_id);
      if (!existing) {
        await base44.asServiceRole.entities.DispatchCall.create(call);
        created += 1;
      } else if (changed(existing, call)) {
        await base44.asServiceRole.entities.DispatchCall.update(existing.id, call);
        updated += 1;
      }
    }

    // DispatchCall is the live queue, not historical storage. Remove every row that is
    // absent from GRAC, from a retired scraper, manually inserted, or a duplicate.
    for (const record of allExisting || []) {
      const isDuplicate = duplicateIds.has(record.id);
      const isCurrentGrac = incomingIds.has(record.call_id);
      const isLegacySource = ACTIVE_SOURCES.has(record.source) && !String(record.call_id || '').startsWith('grac-');
      if (isDuplicate || !isCurrentGrac || isLegacySource) {
        try {
          await base44.asServiceRole.entities.DispatchCall.delete(record.id);
          removed += 1;
        } catch (error) {
          console.warn(`Unable to remove stale DispatchCall ${record.id}:`, error?.message);
        }
      }
    }

    return Response.json({
      success: true,
      source: GRAC_API_URL,
      active: incoming.length,
      created,
      updated,
      removed,
      synced_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('GRAC ingestion failed:', error);
    return Response.json(
      { success: false, error: error?.message || 'GRAC ingestion failed' },
      { status: 500 },
    );
  }
});