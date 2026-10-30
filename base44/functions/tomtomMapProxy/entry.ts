import { createClientFromRequest } from 'npm:@base44/sdk';

// A restricted, authenticated TomTom SDK resource proxy. The TomTom key never
// reaches the browser, including the style, sprite and glyph documents.
const allowedPath = /^\/(?:maps|map|styles|traffic|search|routing|orbis)\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/;
const allowableOrigin = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'pathfinderbps.base44.app' || url.hostname === 'app.base44.com'
        || url.hostname === 'base44.app' || url.hostname.endsWith('.base44.app'));
  } catch { return false; }
};
const activeRequests = new Map<string, { since: number; count: number }>();

Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const cors = new Headers({
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Authorization, Base44-App-Id, Base44-Functions-Version, Content-Type, TomTom-Api-Version',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '1800',
  });
  if (allowableOrigin(origin)) {
    cors.set('Access-Control-Allow-Origin', origin);
    cors.set('Access-Control-Allow-Credentials', 'true');
  }
  const jsonError = (status: number, code: string) => Response.json({ error: code }, { status, headers: cors });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return jsonError(405, 'method_not_allowed');
  try {
    const url = new URL(req.url);
    const suffix = url.searchParams.get('resourcePath') || url.pathname.match(/\btomtomMapProxy(\/.*)$/)?.[1];
    if (!suffix || suffix.length > 500 || !allowedPath.test(suffix) || suffix.includes('..'))
      return jsonError(400, 'unsupported_tomtom_resource');
    const me = await createClientFromRequest(req).auth.me().catch(() => null);
    if (!me?.id || me.disabled === true) return jsonError(401, 'sign_in_required');
    const now = Date.now();
    const id = String(me.id);
    const existing = activeRequests.get(id);
    const usage = existing && now - existing.since < 60_000 ? existing : { since: now, count: 0 };
    usage.count += 1;
    activeRequests.set(id, usage);
    if (usage.count > 650) return jsonError(429, 'map_resource_rate_limited');
    if (activeRequests.size > 600) for (const [key, v] of activeRequests) if (now - v.since > 90_000) activeRequests.delete(key);

    const keys = [...new Set([Deno.env.get('TOMTOM_API_KEY'), Deno.env.get('TOMTOM_API_KEY_BACKUP')].filter(Boolean))] as string[];
    if (!keys.length) return jsonError(503, 'tomtom_not_configured');
    const params = new URLSearchParams(url.search);
    params.delete('key');
    params.delete('resourcePath');
    if (params.toString().length > 1900) return jsonError(400, 'query_too_long');
    const version = req.headers.get('TomTom-Api-Version');
    let lastStatus = 503;
    for (const key of keys) {
      const target = new URL(`https://api.tomtom.com${suffix}`);
      const query = new URLSearchParams(params);
      query.set('key', key);
      target.search = query.toString();
      let response: Response;
      try {
        response = await fetch(target, {
          headers: {
            'Accept': req.headers.get('accept') || '*/*',
            'TomTom-Api-Key': key,
            ...(version ? { 'TomTom-Api-Version': version } : {}),
          }, signal: AbortSignal.timeout(8500),
        });
      } catch { continue; }
      lastStatus = response.status;
      if (!response.ok && [401, 403, 408, 429, 500, 502, 503, 504].includes(response.status)) continue;
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const out = new Headers(cors);
      out.set('Content-Type', contentType);
      out.set('Cache-Control', response.ok && /(?:image\/|font\/)/.test(contentType)
        ? 'private, max-age=90' : 'private, no-store');
      const isText = contentType.includes('json') || contentType.startsWith('text/') || contentType.includes('javascript');
      if (isText) {
        let body = await response.text();
        for (const secret of keys) {
          body = body.split(secret).join('');
          body = body.split(encodeURIComponent(secret)).join('');
        }
        // Do not send absolute upstream URLs or secret-bearing query strings
        // from style responses to MapLibre; preserve the secure proxy prefix.
        const proxyPrefix = `${url.origin}${url.pathname.replace(/\/tomtomMapProxy(?:\/.*)?$/, '/tomtomMapProxy')}`;
        body = body.replace(/https:\/\/api\.tomtom\.com/gi, proxyPrefix);
        return new Response(body, { status: response.status, headers: out });
      }
      return new Response(response.body, { status: response.status, headers: out });
    }
    return jsonError(lastStatus === 429 ? 429 : 502, 'tomtom_map_resource_unavailable');
  } catch (error) {
    console.error('tomtomMapProxy failed:', String((error as Error)?.message || error));
    return jsonError(502, 'tomtom_map_resource_unavailable');
  }
});
