import { createClientFromRequest } from 'npm:@base44/sdk';

const valid = (value: unknown) => Number.isFinite(Number(value));
// Every TomTom operation stays server-side. A key that is disabled or
// exhausted can fail over to the secondary secret; OSRM remains available.
async function fetchTomTomRoute(lat:number,lng:number,destLat:number,destLng:number,heading:number) {
  const keys = [...new Set([Deno.env.get('TOMTOM_API_KEY'), Deno.env.get('TOMTOM_API_KEY_BACKUP')].filter(Boolean))];
  if (!keys.length) return null;
  const params = new URLSearchParams({
    routeType: 'fastest', traffic: 'true', travelMode: 'car',
    instructionsType: 'text', language: 'en-US', routeRepresentation: 'polyline',
    sectionType: 'speedLimit',
  });
  params.append('sectionType', 'traffic');
  if (Number.isFinite(heading)) params.set('vehicleHeading', String(Math.round(((heading%360)+360)%360)));
  const path = `/routing/1/calculateRoute/${lat},${lng}:${destLat},${destLng}/json`;
  for (const key of keys) {
    const q = new URLSearchParams(params); q.set('key', key);
    try {
      const result = await fetch(`https://api.tomtom.com${path}?${q.toString()}`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000),
      });
      if (!result.ok) {
        if ([401,403,408,429,500,502,503,504].includes(result.status)) continue;
        return null;
      }
      const payload = await result.json();
      const raw = payload.routes?.[0];
      const leg = raw?.legs?.[0];
      const pts = (leg?.points || []).filter((x:any)=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude));
      const instructions = raw?.guidance?.instructions || [];
      const meters = Number(raw?.summary?.lengthInMeters);
      const seconds = Number(raw?.summary?.travelTimeInSeconds);
      if (pts.length < 2 || !Number.isFinite(meters) || meters <= 0 || !Number.isFinite(seconds) || seconds <= 0 || !instructions.length) return null;
      // Translate TomTom guidance to the OSRM-compatible internal model. The
      // existing step engine/voice prompts must continue to work without any
      // browser-side TomTom SDK or new exposed keys.
      const osmSteps = instructions.map((instruction:any, index:number) => {
        const maneuver = String(instruction.maneuver || '').toUpperCase();
        const kind = maneuver.includes('ARRIVE') ? 'arrive'
          : maneuver.includes('DEPART') ? 'depart'
          : maneuver.includes('ROUNDABOUT') ? 'roundabout'
          : maneuver.includes('EXIT') ? 'off ramp'
          : maneuver.includes('UTURN') ? 'turn'
          : maneuver.includes('RAMP') ? 'on ramp'
          : maneuver.includes('KEEP') || maneuver.includes('BEAR') ? 'fork'
          : maneuver.includes('TURN') ? 'turn' : 'continue';
        const modifier = maneuver.includes('UTURN') ? 'uturn'
          : maneuver.includes('LEFT') ? (maneuver.includes('SHARP') ? 'sharp left' : maneuver.includes('BEAR') ? 'slight left' : 'left')
          : maneuver.includes('RIGHT') ? (maneuver.includes('SHARP') ? 'sharp right' : maneuver.includes('BEAR') ? 'slight right' : 'right')
          : 'straight';
        const here = Number(instruction.routeOffsetInMeters) || 0;
        const following = instructions[index+1];
        const next = following ? Number(following.routeOffsetInMeters) : meters;
        return {
          name: String(instruction.street || instruction.roadNumbers?.[0] || ''),
          ref: instruction.roadNumbers?.join(';') || '',
          destinations: String(instruction.signpostText || ''),
          distance: Math.max(0, (Number.isFinite(next) ? next : meters) - here),
          // TomTom supplies route-wide travel time, not reliable per-instruction
          // durations. Allocate its traffic-aware ETA by remaining road distance
          // so the browser cannot collapse a long route to one minute.
          duration: seconds * Math.max(0, (Number.isFinite(next) ? next : meters) - here) / Math.max(1, meters),
          maneuver: { type: kind, modifier, exit: instruction.roundaboutExitNumber,
            location: [Number(instruction.point?.longitude || pts[0].longitude), Number(instruction.point?.latitude || pts[0].latitude)] },
          instruction: String(instruction.message || ''),
        };
      });
      const speedLimitSections = (raw.sections || [])
        .filter((section:any)=>String(section.sectionType || '').toUpperCase() === 'SPEED_LIMIT')
        .map((section:any)=>({
          start: Number(section.startPointIndex), end: Number(section.endPointIndex),
          mph: Math.round(Number(section.maxSpeedLimitInKmh) * 0.621371),
        }))
        .filter((section:any)=>Number.isInteger(section.start) && Number.isInteger(section.end)
          && section.start >= 0 && section.end > section.start && section.end < pts.length
          && section.mph >= 10 && section.mph <= 90);
      const trafficSegments = (raw.sections || [])
        .filter((section:any)=>String(section.sectionType || '').toUpperCase() === 'TRAFFIC')
        .map((section:any)=>{
          const start = Number(section.startPointIndex), end = Number(section.endPointIndex);
          const magnitude = Number(section.magnitudeOfDelay || 0);
          const severity = String(section.simpleCategory || '').toUpperCase();
          return { coords: pts.slice(start, end + 1).map((pt:any)=>[pt.latitude,pt.longitude]),
            condition: severity === 'ROAD_CLOSURE' || magnitude >= 3 ? 'heavy' : magnitude >= 2 ? 'moderate' : 'free',
            category: severity || 'TRAFFIC', delaySeconds: Number(section.delayInSeconds || 0) };
        }).filter((section:any)=>section.coords.length >= 2);
      return {
        geometry: { type: 'LineString', coordinates: pts.map((x:any)=>[x.longitude,x.latitude]) },
        distance: meters, duration: seconds, legs: [{steps:osmSteps}],
        speedLimitSections, trafficSegments,
        trafficDelaySeconds: Number(raw.summary?.trafficDelayInSeconds || 0),
        provider: 'TomTom traffic-aware routing',
      };
    } catch { /* Key, network or provider failure: try backup or OSRM fallback */ }
  }
  return null;
}

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

      const hasRoadNameMatch = (road:any) => {
        if (!wanted) return false;
        const actual = normalizeRoad(road.name);
        return Boolean(actual && (actual === wanted || actual.includes(wanted) || wanted.includes(actual)));
      };
      const posted = roads
        .filter(road => Number.isFinite(road.mph) && road.mph > 0 && road.highway !== 'service')
        .filter(road => road.distance <= (hasRoadNameMatch(road) ? 65 : 35))
        .map(road => ({ ...road, score: road.distance - (hasRoadNameMatch(road) ? 35 : 0) }))
        .sort((a,b) => a.score - b.score);
      const currentRoad = posted[0] || null;

      if (currentRoad) {
        return Response.json({
          success: true,
          speed_limit_mph: currentRoad.mph,
          road_name: currentRoad.name || requestedRoad,
          source: 'OpenStreetMap posted maxspeed',
          estimated: false,
        });
      }

      return Response.json({
        success: true,
        speed_limit_mph: null,
        road_name: requestedRoad || '',
        source: '',
        estimated: false,
        reason: 'no_reliable_posted_limit',
      });
    }
    const lat = Number(body.origin_lat), lng = Number(body.origin_lng);
    const destLat = Number(body.dest_lat), destLng = Number(body.dest_lng);
    if (![lat,lng,destLat,destLng].every(valid)) return Response.json({ error: 'Valid route coordinates are required' }, { status: 400 });
    const originHeading = body.origin_heading === null || body.origin_heading === undefined || body.origin_heading === ''
      ? Number.NaN
      : Number(body.origin_heading);
    const originAccuracy = body.origin_accuracy === null || body.origin_accuracy === undefined || body.origin_accuracy === ''
      ? Number.NaN
      : Number(body.origin_accuracy);
    const moving = Number(body.origin_speed_mph) >= 5;
    const tomtom = await fetchTomTomRoute(lat, lng, destLat, destLng, moving ? originHeading : NaN);
    if (tomtom) return Response.json({ success: true, route: tomtom, heading_constrained: moving && Number.isFinite(originHeading), provider: 'TomTom' });
    const query = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' });
    // On divided highways/interchanges, coordinate-only matching can snap to the
    // wrong carriageway or a nearby ramp. Constrain the origin by travel heading
    // while the vehicle is moving so maneuvers match the road the officer is on.
    if (moving && Number.isFinite(originHeading)) query.set('bearings', `${Math.round(((originHeading % 360) + 360) % 360)},55;`);
    if (Number.isFinite(originAccuracy) && originAccuracy > 0) {
      query.set('radiuses', `${Math.round(Math.max(25, Math.min(100, originAccuracy * 2)))};unlimited`);
    }
    const constrainedPath = `${lng},${lat};${destLng},${destLat}?${query.toString()}`;
    const fallbackQuery = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' });
    const fallbackPath = `${lng},${lat};${destLng},${destLat}?${fallbackQuery.toString()}`;
    const routePaths = constrainedPath === fallbackPath ? [fallbackPath] : [constrainedPath, fallbackPath];
    const providers = [
      'https://router.project-osrm.org/route/v1/driving/',
      'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
    ];
    let last = '';
    for (const path of routePaths) {
      for (const host of providers) {
        try {
          const response = await fetch(host + path, {
            headers: { Accept: 'application/json', 'User-Agent': 'BPS-Pathfinder-Navigation/1.0' },
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) { last = `HTTP ${response.status}`; continue; }
          const data = await response.json();
          const route = data?.routes?.[0];
          if (route?.geometry?.coordinates?.length > 1) return Response.json({ success: true, route, heading_constrained: path === constrainedPath && constrainedPath !== fallbackPath });
          last = data?.code || 'No route returned';
        } catch (error: any) {
          last = error?.message || String(error);
        }
      }
    }
    return Response.json({ error: 'No routing provider returned a route', detail: last }, { status: 502 });
  } catch (error: any) {
    console.error('routeNavigation failed', error);
    return Response.json({ error: error?.message || 'Route failed' }, { status: 500 });
  }
});
