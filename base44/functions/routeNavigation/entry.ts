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
      const query = `[out:json][timeout:5];way(around:35,${lat},${lng})[highway][maxspeed];out tags;`;
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-Navigation/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return Response.json({ success: true, speed_limit_mph: null, source: '' });
      const data = await response.json();
      const requestedRoad = String(body.road_name || '').trim().toLowerCase();
      const parseMph = raw => {
        const text = String(raw || '').trim().toLowerCase();
        const value = Number.parseFloat(text);
        if (!Number.isFinite(value) || value <= 0) return null;
        if (text.includes('mph')) return Math.round(value);
        return Math.round(value * 0.621371);
      };
      const rows = (data?.elements || []).map(element => ({
        mph: parseMph(element?.tags?.maxspeed),
        name: String(element?.tags?.name || element?.tags?.ref || ''),
      })).filter(row => Number.isFinite(row.mph));
      const best = rows.find(row => requestedRoad && row.name.toLowerCase() === requestedRoad) || rows[0] || null;
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
