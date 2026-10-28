const normalize = value => String(value || '').toLowerCase().normalize('NFKD')
  .replace(/virginia/g, 'va').replace(/[^a-z0-9]+/g, ' ').trim();
const valid = (lat, lng) => [lat, lng].every(v => v != null && String(v).trim() !== '' && Number.isFinite(Number(v)))
  && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 && !(Number(lat) === 0 && Number(lng) === 0);
export function matchManagedLocations(rows, query) {
  const tokens = normalize(query).split(/\s+/).filter(token => token && !['in', 'at', 'the'].includes(token));
  if (!tokens.length) return [];
  return rows.filter(row => {
    const words = normalize([row.site_name, row.address, row.city, row.state, row.zip_code, row.postal_code, row.division, row.subdivision].filter(Boolean).join(' ')).split(/\s+/);
    return tokens.every(token => words.some(word => word.startsWith(token)));
  }).sort((a,b) => Number(normalize(b.site_name) === normalize(query)) - Number(normalize(a.site_name) === normalize(query)))
    .map(row => ({
      locationId: row.id, name: row.site_name, address: row.address,
      label: row.active === false ? 'Managed property · inactive' : 'Managed property',
      type: 'managed_property',
      coords: valid(row.latitude, row.longitude) ? [Number(row.latitude), Number(row.longitude)] : null,
    }));
}
