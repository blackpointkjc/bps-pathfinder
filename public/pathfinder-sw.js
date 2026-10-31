/* Pathfinder offline app shell.
   Strategy: every same-origin GET goes to the network first (so a new release is
   never masked by a stale cache) and the successful response is stored. When the
   network is unavailable the stored copy is served instead, which lets the app
   open and navigate while the device is offline. */
const CACHE = 'pathfinder-offline-shell-v3';
const SHELL_URLS = ['/', '/index.html'];

/* Street-map tiles are a separate cache so a downloaded area survives app
   updates and can be served with no connection. The live map rotates between
   the provider's a-d subdomains, so every tile request is stored and matched
   under one canonical host. */
const TILE_CACHE = 'pathfinder-map-tiles-v1';
const TILE_HOSTS = ['basemaps.cartocdn.com'];
const BLANK_TILE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const tileHost = (url) => TILE_HOSTS.find((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
const canonicalTileKey = (url) => `https://a.${tileHost(url)}${url.pathname}${url.search}`;
const blankTile = () => {
  const bytes = Uint8Array.from(atob(BLANK_TILE), (char) => char.charCodeAt(0));
  return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } });
};

const isCacheablePath = (pathname) =>
  !pathname.startsWith('/api/') &&
  !pathname.startsWith('/functions/') &&
  !pathname.startsWith('/_api/');

const isNavigationRequest = (request) => request.mode === 'navigate';

const storeResponse = async (request, response) => {
  if (!response || !response.ok || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone()).catch(() => {});
};

const offlineShell = async (request) => {
  const cache = await caches.open(CACHE);
  return (
    (await cache.match(request)) ||
    (await cache.match('/')) ||
    (await cache.match('/index.html')) ||
    new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pathfinder offline</title><body style="font-family:system-ui;background:#08111d;color:#e5edf5;padding:2rem"><h1>Pathfinder is offline</h1><p>This page has not been saved on this device yet. Reconnect, open the page, then try again.</p></body>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  );
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('pathfinder-offline-shell-') && key !== CACHE)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'SAVE_ASSETS') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const urls = [...new Set([...(data.urls || []), ...SHELL_URLS])].filter((url) => {
        try {
          const parsed = new URL(url, self.location.origin);
          return parsed.origin === self.location.origin && isCacheablePath(parsed.pathname);
        } catch {
          return false;
        }
      });
      const results = await Promise.allSettled(
        urls.map(async (url) => {
          const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
          if (!response.ok) throw new Error(`${response.status} ${url}`);
          await cache.put(url, response.clone());
        }),
      );
      event.ports[0]?.postMessage({
        saved: results.filter((result) => result.status === 'fulfilled').length,
        failed: results.filter((result) => result.status === 'rejected').length,
      });
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (tileHost(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const key = canonicalTileKey(url);
      const cached = await cache.match(key);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response) await cache.put(key, response.clone()).catch(() => {});
        return response;
      } catch {
        // A tile outside a downloaded area must not break the map: Leaflet gets a
        // transparent tile and keeps the rest of the layer intact.
        return blankTile();
      }
    })());
    return;
  }

  // Vite's development and hot-reload modules must come only from the live
  // preview server, never from an offline cache of an older module graph.
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@vite/')
      || url.pathname.startsWith('/@react-refresh')
      || url.pathname.startsWith('/node_modules/.vite/')
      || url.searchParams.has('t') || url.searchParams.has('v')) return;
  if (url.origin !== self.location.origin || !isCacheablePath(url.pathname)) return;

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          // Every route is the same single-page shell, so keep one copy for deep links.
          await cache.put(request, response.clone()).catch(() => {});
          await cache.put('/', response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return offlineShell(request);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      await storeResponse(request, response);
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    }
  })());
});
