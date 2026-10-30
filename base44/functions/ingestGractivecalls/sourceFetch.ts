// Retry one failed public-source request inside a bounded 15-second budget.
// The canonical JSON endpoint is private/non-cacheable. The website fallback may
// be CDN-cached, so callers must not use it to veto newer JSON incidents.
export async function fetchCadSource(primaryUrl: string, fallbackUrl: string, accept: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(attempt ? fallbackUrl : primaryUrl, {
        cache: 'no-store',
        headers: { Accept: accept, 'User-Agent': 'BPS-Pathfinder-CAD/4.4', 'Cache-Control': 'no-cache, no-store, max-age=0', Pragma: 'no-cache' },
        signal: AbortSignal.timeout(attempt ? 5000 : 10000),
      });
      if (!response.ok) {
        const error = new Error('CAD source returned HTTP ' + response.status);
        if (response.status < 500 && response.status !== 429) throw Object.assign(error, { permanent: true });
        throw error;
      }
      // Read the body under the same timeout, not after the retry budget expires.
      const text = await response.text();
      return { text, cacheAgeSeconds: Number(response.headers.get('Age') || 0), fetchedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if ((error as any)?.permanent) break;
    }
  }
  throw lastError;
}
