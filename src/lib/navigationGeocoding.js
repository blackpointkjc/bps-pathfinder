import { base44 } from '@/api/base44Client';
import { withRequestTimeout } from '@/lib/requestTimeout';

// Try the app's server-side geocoder first so browser CORS/provider blocking
// cannot silently turn Search back to GO. Public browser services remain backup.
const fetchJson = async (url, timeoutMs = 6500) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Geocoding service returned ${response.status}`);
  return response.json();
};

const valid = coords => Array.isArray(coords) && coords.length === 2
  && coords.every(value => Number.isFinite(Number(value)))
  && Math.abs(Number(coords[0])) <= 90 && Math.abs(Number(coords[1])) <= 180;

const unique = rows => {
  const seen = new Set();
  return rows.filter(row => {
    if (!valid(row.coords)) return false;
    const key = row.coords.map(value => Number(value).toFixed(5)).join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
};

export async function lookupNavigationDestinations(query, location) {
  const value = String(query || '').trim();
  if (value.length < 3) return [];
  const encoded = encodeURIComponent(value);
  const searches = [
    async () => {
      const rows = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=us&addressdetails=1&q=${encoded}`);
      return (rows || []).map(row => ({
        coords: [Number(row.lat), Number(row.lon)],
        name: row.display_name,
        address: row.display_name,
        type: row.type,
      }));
    },
    async () => {
      const near = valid(location) ? `&lat=${Number(location[0])}&lon=${Number(location[1])}` : '';
      const payload = await fetchJson(`https://photon.komoot.io/api/?q=${encoded}&limit=6${near}`);
      return (payload.features || []).map(item => {
        const p = item.properties || {};
        const label = [p.housenumber, p.street, p.city, p.state].filter(Boolean).join(' ');
        return {
          coords: [Number(item.geometry?.coordinates?.[1]), Number(item.geometry?.coordinates?.[0])],
          name: label || p.name || value,
          address: label || p.name || value,
          type: p.type || '',
        };
      });
    },
    async () => {
      // US Census is a street-address fallback when public OSM hosts are blocked.
      const payload = await fetchJson(`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
      return (payload.result?.addressMatches || []).map(match => ({
        coords: [Number(match.coordinates?.y), Number(match.coordinates?.x)],
        name: match.matchedAddress || value,
        address: match.matchedAddress || value,
        type: 'address',
      }));
    },
  ];
  try {
    const response = await withRequestTimeout(base44.functions.invoke('geocodeNavigationDestination', {
      query: value,
      ...(valid(location) ? { latitude: Number(location[0]), longitude: Number(location[1]) } : {}),
    }), 10_000, 'Navigation address lookup');
    const payload = response?.data || response || {};
    const matches = unique(payload.results || []);
    if (matches.length) return matches;
  } catch (error) {
    console.warn('[NAV] Server address lookup failed; trying public services:', error?.message || error);
  }
  // Parallel backup: a failed provider no longer blocks the other two for
  // another 6.5 seconds each. Always return only valid mapped coordinates.
  const settled = await Promise.allSettled(searches.map(search => search()));
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const matches = unique(result.value);
    if (matches.length) return matches;
  }
  return [];
}
