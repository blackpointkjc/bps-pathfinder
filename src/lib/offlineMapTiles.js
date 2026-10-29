/* Offline street-map tiles.
   Street reference tiles are the same CARTO raster tiles the live map draws, so a
   downloaded area looks exactly like the connected map (roads and place names) with
   no satellite imagery and no offline routing. Tiles are stored in Cache Storage;
   the service worker serves them back when the device has no connection. */
const TILE_CACHE = 'pathfinder-map-tiles-v1';
const CARTO_KEY = 'cb1_2ias_1_14dba310e123052c62d832d9';
const TILE_BASE = `https://a.basemaps.cartocdn.com/rastertiles/voyager`;
const CONCURRENCY = 5;
export const TILE_HOSTS = ['basemaps.cartocdn.com'];

// Virginia state outline, generous enough to cover every county border.
export const VIRGINIA_BOUNDS = { north: 39.47, south: 36.54, west: -83.68, east: -75.24 };

export const tileUrl = (z, x, y) => `${TILE_BASE}/${z}/${x}/${y}.png?key=${CARTO_KEY}`;

const lonToX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const latToY = (lat, z) => {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
};

export function tilesForBounds(bounds, zoom) {
  const max = 2 ** zoom - 1;
  const clamp = value => Math.min(Math.max(value, 0), max);
  const x1 = clamp(lonToX(bounds.west, zoom));
  const x2 = clamp(lonToX(bounds.east, zoom));
  const y1 = clamp(latToY(bounds.north, zoom));
  const y2 = clamp(latToY(bounds.south, zoom));
  const tiles = [];
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) tiles.push({ z: zoom, x, y });
  }
  return tiles;
}

export function boundsAround(latitude, longitude, kilometers) {
  const latDelta = kilometers / 111;
  const lngDelta = kilometers / (111 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
  return {
    north: latitude + latDelta,
    south: latitude - latDelta,
    west: longitude - lngDelta,
    east: longitude + lngDelta,
  };
}

// Each scope keeps the tile count readable: the state download stays at overview
// detail, while the local scopes stay sharp enough to read street names.
export function downloadScope(scope, center) {
  if (scope === 'state') return { bounds: VIRGINIA_BOUNDS, zooms: [7, 8, 9, 10, 11] };
  if (scope === 'region') return { bounds: boundsAround(center.lat, center.lng, 25), zooms: [10, 11, 12, 13, 14] };
  return { bounds: boundsAround(center.lat, center.lng, 3), zooms: [12, 13, 14, 15, 16] };
}

export function scopeTileCount(scope, center) {
  const { bounds, zooms } = downloadScope(scope, center);
  return zooms.reduce((total, zoom) => total + tilesForBounds(bounds, zoom).length, 0);
}

export async function storedTileCount() {
  try {
    const cache = await caches.open(TILE_CACHE);
    return (await cache.keys()).length;
  } catch {
    return 0;
  }
}

export async function downloadScopeTiles({ scope, center, onProgress, signal }) {
  if (!('caches' in window)) throw new Error('This browser cannot store offline maps');
  const { bounds, zooms } = downloadScope(scope, center);
  const urls = zooms.flatMap(zoom => tilesForBounds(bounds, zoom).map(tile => tileUrl(tile.z, tile.x, tile.y)));
  const cache = await caches.open(TILE_CACHE);
  let done = 0;
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const queue = [...urls];
  const report = () => onProgress?.({ done, total: urls.length, saved, skipped, failed });
  report();
  const run = async () => {
    while (queue.length && !signal?.aborted) {
      const url = queue.shift();
      try {
        const existing = await cache.match(url);
        if (existing) {
          skipped++;
        } else {
          // Opaque requests let a tile download succeed without CORS on the tile host.
          const response = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
          await cache.put(url, response);
          saved++;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 15 === 0 || !queue.length) report();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
  report();
  if (signal?.aborted) throw new Error('Download stopped. Tiles already saved stay on this device.');
  return { total: urls.length, saved, skipped, failed, urls };
}

export async function removeTiles(urls = []) {
  if (!urls.length) return;
  const cache = await caches.open(TILE_CACHE);
  await Promise.all(urls.map(url => cache.delete(url).catch(() => false)));
}