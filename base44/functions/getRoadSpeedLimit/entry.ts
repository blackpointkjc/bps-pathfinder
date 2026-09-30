import { createClientFromRequest } from 'npm:@base44/sdk';

const valid = (value: unknown) => Number.isFinite(Number(value));

function parseMph(raw: unknown) {
  const text = String(raw || '').trim().toLowerCase();
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (text.includes('mph')) return Math.round(value);
  return Math.round(value * 0.621371);
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeRoad(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|place|pl|boulevard|blvd|lane|ln|court|ct|parkway|pkwy|highway|hwy)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Sign in required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (![lat, lng].every(valid)) {
      return Response.json({ error: 'Valid coordinates are required' }, { status: 400 });
    }

    const requestedRoad = String(body.road_name || '').trim();
    const delta = 0.00125;
    const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');

    const osmResponse = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`, {
      headers: {
        Accept: 'application/xml',
        'User-Agent': 'BPS-Pathfinder-SpeedLimit/1.0',
      },
      signal: AbortSignal.timeout(6500),
    }).catch(() => null);

    if (!osmResponse?.ok) {
      return Response.json({
        success: true,
        speed_limit_mph: null,
        road_name: requestedRoad,
        source: '',
        estimated: false,
      });
    }

    const xml = await osmResponse.text();
    const nodes = new Map<string, [number, number]>();
    for (const match of xml.matchAll(/<node\s+[^>]*id="([^"]+)"[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*\/?>(?:<\/node>)?/g)) {
      nodes.set(match[1], [Number(match[2]), Number(match[3])]);
    }

    const metersPerLat = 111320;
    const metersPerLng = 111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180));
    const pointToSegmentMeters = (a:[number,number], b:[number,number]) => {
      const ax = (a[1] - lng) * metersPerLng;
      const ay = (a[0] - lat) * metersPerLat;
      const bx = (b[1] - lng) * metersPerLng;
      const by = (b[0] - lat) * metersPerLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, (-(ax * dx + ay * dy)) / lengthSq)) : 0;
      return Math.hypot(ax + t * dx, ay + t * dy);
    };

    const wanted = normalizeRoad(requestedRoad);
    const roads:any[] = [];
    for (const wayMatch of xml.matchAll(/<way\s+[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/way>/g)) {
      const inner = wayMatch[2];
      const tags:Record<string,string> = {};
      for (const tag of inner.matchAll(/<tag\s+k="([^"]+)"\s+v="([^"]*)"\s*\/>/g)) {
        tags[decodeXml(tag[1])] = decodeXml(tag[2]);
      }
      if (!tags.highway) continue;

      const refs = [...inner.matchAll(/<nd\s+ref="([^"]+)"\s*\/>/g)].map(match => match[1]);
      let nearest = Infinity;
      for (let i = 1; i < refs.length; i += 1) {
        const a = nodes.get(refs[i - 1]);
        const b = nodes.get(refs[i]);
        if (a && b) nearest = Math.min(nearest, pointToSegmentMeters(a, b));
      }

      roads.push({
        id: wayMatch[1],
        name: tags.name || tags.ref || '',
        ref: tags.ref || '',
        highway: tags.highway,
        mph: parseMph(tags.maxspeed || tags['maxspeed:forward'] || tags['maxspeed:backward']),
        distance: nearest,
      });
    }

    const namedMatches = wanted
      ? roads.filter(road => {
          const actual = normalizeRoad(road.name);
          return actual && (actual === wanted || actual.includes(wanted) || wanted.includes(actual));
        })
      : [];

    const candidates = namedMatches.length
      ? namedMatches
      : roads.filter(road => road.highway !== 'service');

    const currentRoad =
      candidates.sort((a,b) => a.distance - b.distance)[0]
      || roads.sort((a,b) => a.distance - b.distance)[0]
      || null;

    if (Number.isFinite(currentRoad?.mph)) {
      return Response.json({
        success: true,
        speed_limit_mph: currentRoad.mph,
        road_name: currentRoad.name || requestedRoad,
        source: 'OpenStreetMap road segment',
        estimated: false,
      });
    }

    if (currentRoad?.highway === 'residential') {
      return Response.json({
        success: true,
        speed_limit_mph: 25,
        road_name: currentRoad.name || requestedRoad,
        source: 'Residential-road fallback',
        estimated: true,
      });
    }

    return Response.json({
      success: true,
      speed_limit_mph: null,
      road_name: currentRoad?.name || requestedRoad || '',
      source: '',
      estimated: false,
    });
  } catch (error: any) {
    console.error('getRoadSpeedLimit failed', error);
    return Response.json({ error: error?.message || 'Speed-limit lookup failed' }, { status: 500 });
  }
});
