const keyFor = id => 'pf:gps:recent:v1:' + id;
export function readRecentDestinations(id) {
  if (!id) return [];
  try { const rows = JSON.parse(localStorage.getItem(keyFor(id)) || '[]'); return Array.isArray(rows) ? rows.slice(0, 20) : []; } catch { return []; }
}
export function rememberDestination(id, destination) {
  if (!id || !Array.isArray(destination.coords)) return [];
  const key = destination.locationId || destination.coords.map(Number).map(n => n.toFixed(5)).join(':');
  const item = { key, name: destination.name || destination.address || 'Map pin', address: destination.address || '', coords: destination.coords, locationId: destination.locationId || '', visitedAt: Date.now() };
  const rows = [item, ...readRecentDestinations(id).filter(row => row.key !== key)].slice(0, 20);
  try { localStorage.setItem(keyFor(id), JSON.stringify(rows)); } catch { /* Navigation remains available without browser storage. */ }
  return rows;
}
