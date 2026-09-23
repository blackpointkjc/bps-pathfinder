import { createClientFromRequest } from 'npm:@base44/sdk';

const valid = (value: unknown) => Number.isFinite(Number(value));
Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
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
