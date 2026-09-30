import { createClientFromRequest } from 'npm:@base44/sdk';

const valid = (value: unknown) => Number.isFinite(Number(value));
Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (body.mode === 'speed_limit') {
      const lat = Number(body.latitude), lng = Number(body.longitude);
      if (![lat, lng].every(valid)) return Response.json({ error: 'Valid coordinates are required' }, { status: 400 });

      const parseMph = (raw: unknown) => {
        const text = String(raw || '').trim().toLowerCase();
        const value = Number.parseFloat(text);
        if (!Number.isFinite(value) || value <= 0) return null;
        if (text.includes('mph')) return Math.round(value);
        return Math.round(value * 0.621371);
      };
      const decodeXml = (value: string) => value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const normalizeRoad = (value: unknown) => String(value || '')
        .toLowerCase()
        .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|place|pl|boulevard|blvd|lane|ln|court|ct|parkway|pkwy|highway|hwy)\b/g, '')
        .replace(/[^a-z0-9]/g, '');

      // The regular OSM map endpoint is much faster and more reliable for a tiny
      // live-position window than public Overpass servers. Pull the actual road
      // geometry around the vehicle and pick the nearest segment.
      const delta = 0.00125;
      const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
      const osmResponse = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`, {
        headers: { Accept: 'application/xml', 'User-Agent': 'BPS-Pathfinder-Navigation/1.0' },
        signal: AbortSignal.timeout(6500),
      }).catch(() => null);
      if (!osmResponse?.ok) {
        return Response.json({ success: true, speed_limit_mph: null, road_name: String(body.road_name || ''), source: '', estimated: false });
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

      const requestedRoad = String(body.road_name || '').trim();
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
      const candidates = namedMatches.length ? namedMatches : roads.filter(road => road.highway !== 'service');
      const currentRoad = candidates.sort((a,b) => a.distance - b.distance)[0] || roads.sort((a,b) => a.distance - b.distance)[0] || null;

      if (Number.isFinite(currentRoad?.mph)) {
        return Response.json({
          success: true,
          speed_limit_mph: currentRoad.mph,
          road_name: currentRoad.name || requestedRoad,
          source: 'OpenStreetMap road segment',
          estimated: false,
        });
      }

      // For the Richmond/Henrico residential grid, the local road segment may be
      // mapped without maxspeed. Keep that case usable, but clearly label it as
      // an estimate rather than pretending OSM supplied a posted sign value.
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
    }
    const lat = Number(body.origin_lat), lng = Number(body.origin_lng);
    const destLat = Number(body.dest_lat), destLng = Number(body.dest_lng);
    if (![lat,lng,destLat,destLng].every(valid)) return Response.json({ error: 'Valid route coordinates are required' }, { status: 400 });
    const path = `${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const providers = [
      'https://router.project-osrm.org/route/v1/driving/',
      'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
    ];
    let last = '';
    for (const host of providers) {
      try {
        const response = await fetch(host + path, {
          headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-Navigation/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) { last = `HTTP ${response.status}`; continue; }
        const data = await response.json();
        const route = data?.routes?.[0];
        if (route?.geometry?.coordinates?.length > 1) return Response.json({ success: true, route });
        last = 'No route returned';
      } catch (error: any) {
        last = error?.message || String(error);
      }
    }
    return Response.json({ error: 'No routing provider returned a route', detail: last }, { status: 502 });
  } catch (error: any) {
    console.error('routeNavigation failed', error);
    return Response.json({ error: error?.message || 'Route failed' }, { status: 500 });
  }
});
