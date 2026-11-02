// Shared server-only TomTom first-choice geocoder for CAD/dispatch, properties,
// and PulsePoint; never send either service key to the browser.
const bounds = { minLat: 36.0, maxLat: 39.6, minLon: -83.8, maxLon: -75.0 };
export async function tomtomGeocode(address: string, options: { strictNumber?: boolean } = {}) {
  const query = String(address || '').trim();
  if (query.length < 5 || /^(?:unknown|address unavailable|unassigned|n\/a)$/i.test(query)) return null;
  const expectedNumber = query.match(/^\s*(\d{1,6})\b/)?.[1] || '';
  const keys = [...new Set([Deno.env.get('TOMTOM_API_KEY'),Deno.env.get('TOMTOM_API_KEY_BACKUP')].filter(Boolean))];
  for (const key of keys) {
    const params = new URLSearchParams({ key: String(key), limit: '5', countrySet: 'US', language: 'en-US', typeahead: 'false' });
    const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params}`;
    let response: Response;
    try { response = await fetch(endpoint, { signal: AbortSignal.timeout(4200), headers: { Accept: 'application/json' } }); }
    catch { continue; }
    if (!response.ok) {
      if ([401,403,408,429,500,502,503,504].includes(response.status)) continue;
      break;
    }
    const data = await response.json().catch(() => null);
    for (const item of data?.results || []) {
      const lat = Number(item.position?.lat), lon = Number(item.position?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < bounds.minLat || lat > bounds.maxLat || lon < bounds.minLon || lon > bounds.maxLon) continue;
      const roadAddress = String(item.address?.freeformAddress || '');
      const candidateNumber = String(item.address?.streetNumber || '');
      const candidateType = String(item.type || '').toLowerCase();
      if (expectedNumber && options.strictNumber !== false && candidateNumber !== expectedNumber) continue;
      // Reject POI/city-only results when the caller needs an exact numbered address.
      if (expectedNumber && !candidateType.includes('address') && candidateNumber !== expectedNumber) continue;
      return { latitude: lat, longitude: lon, lat, lon,
        formatted_address: roadAddress || query, geo_method:'tomtom',
        geo_confidence: expectedNumber && candidateNumber === expectedNumber ? 'high' : 'medium',
        geo_approximate: !expectedNumber || candidateNumber !== expectedNumber,
        provider:'TomTom Search' };
    }
    return null;
  }
  return null;
}
