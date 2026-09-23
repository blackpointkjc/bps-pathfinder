import { createClientFromRequest } from 'npm:@base44/sdk';

// Server-side navigation geocoding fallback: avoids browser CORS blocks that
// previously turned Search back into GO with no destination to navigate to.
const valid = (lat: unknown, lon: unknown) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
  && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180;
const fetchJson = async (url: string, ms = 5500) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Pathfinder-Navigation/1.0' },
    signal: AbortSignal.timeout(ms),
  });
  if (!response.ok) throw new Error('Navigation geocoder returned ' + response.status);
  return response.json();
};

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Sign in is required.' }, { status: 401 });
    const input = await req.json().catch(() => ({}));
    const query = String(input.query || '').trim().slice(0, 180);
    if (query.length < 3) return Response.json({ error: 'Enter at least three characters.' }, { status: 400 });
    const lat = Number(input.latitude), lon = Number(input.longitude);
    const near = valid(lat, lon) && input.latitude != null && input.longitude != null
      ? '&lat=' + lat + '&lon=' + lon : '';
    const encoded = encodeURIComponent(query);
    const hasHouseNumber = /^\\d{1,6}\\s/.test(query);
    const providers: Array<() => Promise<any[]>> = [
      async () => {
        const result = await fetchJson('https://photon.komoot.io/api/?q=' + encoded + '&limit=8' + near);
        return (result?.features || []).filter((f: any) =>
          !f?.properties?.countrycode || String(f.properties.countrycode).toLowerCase() === 'us'
        ).map((f: any) => {
          const p = f.properties || {};
          const place = [p.housenumber, p.street, p.city, p.state].filter(Boolean).join(' ');
          const label = place || [p.name, p.city, p.state].filter(Boolean).join(', ') || query;
          return { name: label, address: label, coords: [f.geometry?.coordinates?.[1], f.geometry?.coordinates?.[0]], type: p.type || '' };
        });
      },
      async () => {
        const result = await fetchJson('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=' +
          encoded + '&benchmark=Public_AR_Current&vintage=Current_Current&format=json');
        return (result?.result?.addressMatches || []).map((m: any) => ({
          name: m.matchedAddress || query, address: m.matchedAddress || query,
          coords: [m.coordinates?.y, m.coordinates?.x], type: 'address',
        }));
      },
    ];
    // Search parallel rather than waiting for each provider to time out.
    const settled = await Promise.allSettled(hasHouseNumber ? [providers[1](), providers[0]()] : [providers[0](), providers[1]()]);
    const seen = new Set<string>();
    const results: any[] = [];
    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue;
      for (const row of outcome.value) {
        if (!valid(row.coords?.[0], row.coords?.[1])) continue;
        const key = Number(row.coords[0]).toFixed(5) + ':' + Number(row.coords[1]).toFixed(5);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ...row, coords: [Number(row.coords[0]), Number(row.coords[1])] });
        if (results.length >= 6) break;
      }
      if (results.length >= 6) break;
    }
    return Response.json({ success: true, results, providers_checked: settled.length });
  } catch (error) {
    console.error('Navigation geocode failed', error);
    return Response.json({ error: 'The address service is unavailable. Use Open in Google Maps.' }, { status: 502 });
  }
});
