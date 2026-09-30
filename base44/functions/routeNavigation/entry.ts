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

      const endpoints = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];
      const fetchOverpass = async (query: string) => {
        const result = await Promise.any(endpoints.map(host =>
          fetch(`${host}?data=${encodeURIComponent(query)}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-Navigation/1.0' },
            signal: AbortSignal.timeout(7000),
          }).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          })
        )).catch(() => null);
        return result || { elements: [] };
      };

      const parseMph = (raw: unknown) => {
        const text = String(raw || '').trim().toLowerCase();
        const value = Number.parseFloat(text);
        if (!Number.isFinite(value) || value <= 0) return null;
        if (text.includes('mph')) return Math.round(value);
        return Math.round(value * 0.621371);
      };
      const readLimit = (tags: any = {}) =>
        parseMph(tags.maxspeed || tags['maxspeed:forward'] || tags['maxspeed:backward']);
      const normalizeRoad = (value: unknown) => String(value || '')
        .toLowerCase()
        .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|place|pl|boulevard|blvd|lane|ln|court|ct|parkway|pkwy|highway|hwy)\b/g, '')
        .replace(/[^a-z0-9]/g, '');
      const distanceMeters = (aLat:number, aLng:number, bLat:number, bLng:number) => {
        const toRad = (value:number) => value * Math.PI / 180;
        const dLat = toRad(bLat - aLat);
        const dLng = toRad(bLng - aLng);
        const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      const escapeTag = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      // First identify the nearest actual roadway, even when this exact segment
      // does not have a maxspeed tag.
      const nearby = await fetchOverpass(
        `[out:json][timeout:6];way(around:70,${lat},${lng})[highway];out tags center 80;`
      );
      const requestedRoad = String(body.road_name || '').trim();
      const wanted = normalizeRoad(requestedRoad);
      const roads = (nearby?.elements || []).map((element:any) => {
        const tags = element?.tags || {};
        const name = String(tags.name || tags.ref || '');
        const centerLat = Number(element?.center?.lat);
        const centerLng = Number(element?.center?.lon);
        return {
          id: element?.id,
          name,
          ref: String(tags.ref || ''),
          highway: String(tags.highway || ''),
          mph: readLimit(tags),
          distance: Number.isFinite(centerLat) && Number.isFinite(centerLng)
            ? distanceMeters(lat, lng, centerLat, centerLng)
            : Infinity,
        };
      }).filter((road:any) => road.highway);

      const sameNamedRoads = wanted
        ? roads.filter((road:any) => {
            const actual = normalizeRoad(road.name);
            return actual && (actual === wanted || actual.includes(wanted) || wanted.includes(actual));
          })
        : [];
      const currentRoad = (sameNamedRoads.length ? sameNamedRoads : roads)
        .sort((a:any,b:any) => a.distance - b.distance)[0] || null;

      if (Number.isFinite(currentRoad?.mph)) {
        return Response.json({
          success: true,
          speed_limit_mph: currentRoad.mph,
          road_name: currentRoad.name,
          source: 'OpenStreetMap',
          estimated: false,
        });
      }

      // If the immediate segment has no maxspeed tag, look farther along the same
      // named/ref roadway. This is common where OSM splits one road into many ways.
      const roadName = currentRoad?.name || requestedRoad;
      const roadRef = currentRoad?.ref || '';
      const broaderQueries:string[] = [];
      if (roadName) broaderQueries.push(
        `[out:json][timeout:6];way(around:3000,${lat},${lng})[highway][name="${escapeTag(roadName)}"][maxspeed];out tags 40;`
      );
      if (roadRef) broaderQueries.push(
        `[out:json][timeout:6];way(around:3000,${lat},${lng})[highway][ref="${escapeTag(roadRef)}"][maxspeed];out tags 40;`
      );

      for (const query of broaderQueries) {
        const broader = await fetchOverpass(query);
        const limits = (broader?.elements || [])
          .map((element:any) => readLimit(element?.tags || {}))
          .filter((value:any) => Number.isFinite(value));
        const unique = [...new Set(limits)];
        if (unique.length === 1) {
          return Response.json({
            success: true,
            speed_limit_mph: unique[0],
            road_name: roadName,
            source: 'OpenStreetMap nearby segment',
            estimated: false,
          });
        }
      }

      // A clearly identified local residential street often has no maxspeed tag.
      // Do not guess on arterials/highways. For residential only, provide a marked
      // fallback estimate so the UI never presents it as a verified posted limit.
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
