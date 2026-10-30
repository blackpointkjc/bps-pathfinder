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

// Virginia's official state-maintained-road speed-limit inventory supplements
// OSM's missing maxspeed tags. Do not manufacture a limit from road class.
async function lookupVirginiaPostedLimit(lat: number, lng: number, heading: number, requestedRoad: string) {
  if (lat < 36.4 || lat > 39.6 || lng < -83.8 || lng > -75.1) return null;
  const query = new URLSearchParams({
    f: 'json', geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', distance: '65', units: 'esriSRUnit_Meter',
    outFields: 'CAR_SPEED_LIMIT,ROUTE_COMMON_NAME', returnGeometry: 'true', outSR: '4326', resultRecordCount: '40',
  });
  const endpoint = 'https://services.arcgis.com/p5v98VHDX9Atv3l7/arcgis/rest/services/VDOT_Posted_Speed_Limits/FeatureServer/0/query?';
  const response = await fetch(endpoint + query, { signal: AbortSignal.timeout(3200) }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null);
  const metersLng = 111320 * Math.cos(lat * Math.PI / 180);
  const wanted = normalizeRoad(requestedRoad);
  let best: any = null;
  for (const feature of payload?.features || []) {
    const mph = Number(feature?.attributes?.CAR_SPEED_LIMIT);
    if (!Number.isFinite(mph) || mph < 10 || mph > 90) continue;
    const name = String(feature?.attributes?.ROUTE_COMMON_NAME || '');
    const nameMatch = wanted && normalizeRoad(name) && (normalizeRoad(name).includes(wanted) || wanted.includes(normalizeRoad(name)));
    let nearest = Infinity, nearestBearing = 0;
    for (const path of feature?.geometry?.paths || []) for (let i = 1; i < path.length; i++) {
      const a = path[i-1], b = path[i];
      const ax = (a[0]-lng)*metersLng, ay = (a[1]-lat)*111320;
      const dx = (b[0]-a[0])*metersLng, dy = (b[1]-a[1])*111320;
      const t = Math.max(0, Math.min(1, -(ax*dx+ay*dy)/Math.max(0.00001, dx*dx+dy*dy)));
      const dist = Math.hypot(ax+t*dx, ay+t*dy);
      if (dist < nearest) { nearest = dist; nearestBearing = (Math.atan2(dx,dy)*180/Math.PI+360)%360; }
    }
    const angle = Number.isFinite(heading) ? Math.abs((((heading-nearestBearing)%180)+270)%180-90) : 0;
    // On divided highways, do not use speed limits from the wrong road.
    if (nearest > (nameMatch ? 45 : 25) || angle > 50) continue;
    const score = nearest + angle*0.35 - (nameMatch ? 15 : 0);
    if (!best || score < best.score) best = { score, mph, name, dist: nearest };
  }
  return best ? { speed_limit_mph: Math.round(best.mph), road_name: best.name || requestedRoad, source: 'Virginia DOT posted speed limits', estimated: false, matched_distance_m: Math.round(best.dist) } : null;
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
    const speedMph = Number(body.speed_mph);
    // Low-speed compass values are frequently noisy: prefer the nearest
    // geometry rather than excluding the correct roadway on a bad bearing.
    const reportedHeading = body.heading === null || body.heading === undefined || body.heading === '' ? Number.NaN : Number(body.heading);
    const heading = Number.isFinite(speedMph) && speedMph < 12 ? Number.NaN : reportedHeading;
    const accuracy = body.accuracy === null || body.accuracy === undefined || body.accuracy === '' ? Number.NaN : Number(body.accuracy);
    // Do not publish a posted speed limit from a coarse network/Wi-Fi fix. At
    // street intersections a 100m+ fix can easily land on the wrong road.
    if (Number.isFinite(accuracy) && accuracy > 75) {
      return Response.json({
        success: true,
        speed_limit_mph: null,
        road_name: requestedRoad,
        source: '',
        estimated: false,
        reason: 'gps_accuracy_too_low',
      });
    }
    const delta = 0.00125;
    const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');

    const virginiaLookup = lookupVirginiaPostedLimit(lat, lng, heading, requestedRoad).catch(() => null);
    const osmResponse = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`, {
      headers: {
        Accept: 'application/xml',
        'User-Agent': 'BPS-Pathfinder-SpeedLimit/1.0',
      },
      signal: AbortSignal.timeout(4500),
    }).catch(() => null);

    if (!osmResponse?.ok) {
      const virginia = await virginiaLookup;
      return Response.json({ success: true, ...(virginia || {
        speed_limit_mph: null, road_name: requestedRoad, source: '',
        estimated: false, reason: 'posted_limit_unavailable',
      }) });
    }

    const xml = await osmResponse.text();
    const nodes = new Map<string, [number, number]>();
    for (const match of xml.matchAll(/<node\s+[^>]*id="([^"]+)"[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*\/?>(?:<\/node>)?/g)) {
      nodes.set(match[1], [Number(match[2]), Number(match[3])]);
    }

    const metersPerLat = 111320;
    const metersPerLng = 111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180));
    const pointToSegment = (a:[number,number], b:[number,number]) => {
      const ax = (a[1] - lng) * metersPerLng;
      const ay = (a[0] - lat) * metersPerLat;
      const bx = (b[1] - lng) * metersPerLng;
      const by = (b[0] - lat) * metersPerLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, (-(ax * dx + ay * dy)) / lengthSq)) : 0;
      const distance = Math.hypot(ax + t * dx, ay + t * dy);
      const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      return { distance, bearing };
    };
    const headingDifference = (segmentBearing:number) => {
      if (!Number.isFinite(heading)) return 0;
      const direct = Math.abs((((heading - segmentBearing) % 360) + 540) % 360 - 180);
      // Road direction is effectively bidirectional for matching purposes.
      return Math.min(direct, Math.abs(180 - direct));
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
      let nearestBearing = 0;
      for (let i = 1; i < refs.length; i += 1) {
        const a = nodes.get(refs[i - 1]);
        const b = nodes.get(refs[i]);
        if (!a || !b) continue;
        const segment = pointToSegment(a, b);
        if (segment.distance < nearest) {
          nearest = segment.distance;
          nearestBearing = segment.bearing;
        }
      }

      const genericMph = parseMph(tags.maxspeed);
      const forwardMph = parseMph(tags['maxspeed:forward']);
      const backwardMph = parseMph(tags['maxspeed:backward']);
      let mph = genericMph;
      if (!mph && (forwardMph || backwardMph)) {
        if (!Number.isFinite(heading)) mph = forwardMph || backwardMph;
        else {
          const direct = Math.abs((((heading - nearestBearing) % 360) + 540) % 360 - 180);
          mph = direct <= 90 ? (forwardMph || backwardMph) : (backwardMph || forwardMph);
        }
      }

      roads.push({
        id: wayMatch[1],
        name: tags.name || tags.ref || '',
        ref: tags.ref || '',
        highway: tags.highway,
        mph,
        distance: nearest,
        headingDifference: headingDifference(nearestBearing),
      });
    }

    const hasRoadNameMatch = (road:any) => {
      if (!wanted) return false;
      const actual = normalizeRoad(road.name);
      return Boolean(actual && (actual === wanted || actual.includes(wanted) || wanted.includes(actual)));
    };

    // Only tagged posted limits are eligible. Never invent 25 MPH from a
    // residential classification: that caused a nearby side street to overwrite
    // the actual 35/45 MPH roadway. Prefer the named route segment, then the
    // nearest directionally compatible tagged segment.
    const posted = roads
      .filter(road => Number.isFinite(road.mph) && road.mph > 0 && road.highway !== 'service')
      .filter(road => road.distance <= (hasRoadNameMatch(road) ? 45 : 25))
      .filter(road => !Number.isFinite(heading) || road.headingDifference <= 50)
      .map(road => ({
        ...road,
        nameMatch: hasRoadNameMatch(road),
        score: road.distance + road.headingDifference * 0.35 - (hasRoadNameMatch(road) ? 35 : 0),
      }))
      .sort((a,b) => a.score - b.score);

    const currentRoad = posted[0] || null;
    if (currentRoad) {
      return Response.json({
        success: true,
        speed_limit_mph: currentRoad.mph,
        road_name: currentRoad.name || requestedRoad,
        source: 'OpenStreetMap posted maxspeed',
        estimated: false,
        matched_distance_m: Math.round(currentRoad.distance),
      });
    }

    const virginia = await virginiaLookup;
    if (virginia) return Response.json({ success: true, ...virginia });
    return Response.json({
      success: true,
      speed_limit_mph: null,
      road_name: requestedRoad || '',
      source: '',
      estimated: false,
      reason: 'no_reliable_posted_limit',
    });
  } catch (error: any) {
    console.error('getRoadSpeedLimit failed', error);
    return Response.json({ error: error?.message || 'Speed-limit lookup failed' }, { status: 500 });
  }
});
