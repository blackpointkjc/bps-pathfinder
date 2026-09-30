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
      const query = `[out:json][timeout:5];way(around:25,${lat},${lng})[highway][maxspeed];out tags;`;
      const urls = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ].map(host => `${host}?data=${encodeURIComponent(query)}`);
      const response = await Promise.any(urls.map(url => fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-Navigation/1.0' },
        signal: AbortSignal.timeout(6500),
      }).then(result => {
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        return result;
      }))).catch(() => null);
      if (!response) return Response.json({ success: true, speed_limit_mph: null, source: '' });
      const data = await response.json();
      const requestedRoad = String(body.road_name || '').trim().toLowerCase();
      const parseMph = raw => {
        const text = String(raw || '').trim().toLowerCase();
        const value = Number.parseFloat(text);
        if (!Number.isFinite(value) || value <= 0) return null;
        if (text.includes('mph')) return Math.round(value);
        return Math.round(value * 0.621371);
      };
      const normalizeRoad = value => String(value || '').toLowerCase().replace(/\b(street|st|road|rd|avenue|ave|drive|dr|place|pl|boulevard|blvd|lane|ln|court|ct)\b/g, '').replace(/[^a-z0-9]/g, '');
      const rows = (data?.elements || []).map(element => ({
        mph: parseMph(element?.tags?.maxspeed || element?.tags?.['maxspeed:forward'] || element?.tags?.['maxspeed:backward']),
        name: String(element?.tags?.name || element?.tags?.ref || ''),
      })).filter(row => Number.isFinite(row.mph));
      const wanted = normalizeRoad(requestedRoad);
      const matched = wanted ? rows.find(row => {
        const actual = normalizeRoad(row.name);
        return actual && (actual === wanted || actual.includes(wanted) || wanted.includes(actual));
      }) : null;
      const distinctLimits = [...new Set(rows.map(row => row.mph))];
      const best = matched || (rows.length && distinctLimits.length === 1 ? rows[0] : (!wanted ? rows[0] : null));
      return Response.json({ success: true, speed_limit_mph: best?.mph || null, road_name: best?.name || '', source: best ? 'OpenStreetMap' : '' });
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
      } catch (error) {
        last = error?.message || String(error);
      }
    }
    return Response.json({ error: 'No routing provider returned a route', detail: last }, { status: 502 });
  } catch (error) {
    console.error('routeNavigation failed', error);
    return Response.json({ error: error?.message || 'Route failed' }, { status: 500 });
  }
});
