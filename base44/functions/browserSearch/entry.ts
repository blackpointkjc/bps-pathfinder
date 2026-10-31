import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadBrowserContext, checkDestination, buildDirectory, logActivity } from '../../shared/browserContext.ts';
import { extractDomain, SEARCH_ENGINE_LABEL } from '../../shared/browserPolicy.ts';

// Query a public internet search index, rather than generating suggested links
// with an LLM. The RSS feed is a best-effort public endpoint; if unavailable
// we report failure instead of displaying invented results.
function xmlText(value: string): string {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]>/g, '$1')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n) || 32)).trim();
}
async function liveSearch(query: string, safe: boolean) {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'rss');
  url.searchParams.set('setlang', 'en-US');
  if (safe) url.searchParams.set('adlt', 'strict');
  const response = await fetch(url, { headers: { 'Accept': 'application/rss+xml,application/xml,text/xml', 'User-Agent': 'Mozilla/5.0 (compatible; PathfinderCompanySearch/1.0)' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Search index unavailable (' + response.status + ')');
  const xml = await response.text();
  if (!xml.includes('<rss') && !xml.includes('<item>')) throw new Error('Search index did not return an RSS result');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 15).map(match => {
    const item = match[1];
    const field = (key: string) => xmlText(item.match(new RegExp('<' + key + '>([\\s\\S]*?)<\\/' + key + '>', 'i'))?.[1] || '');
    return { title: field('title'), url: field('link'), snippet: field('description') };
  }).filter(item => item.url.startsWith('https://') || item.url.startsWith('http://'));
}

// Company-approved search. Every result is returned with the policy decision so the
// employee sees which destinations the profile permits before attempting to open one.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error: any) => (error?.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (query.length < 2) return Response.json({ error: 'Enter a search question' }, { status: 400 });

    const context = await loadBrowserContext(base44, user);
    const safeSearch = context.summary.safe_search !== false;

    let payload: any = { results: [], summary: '' };
    try {
      payload.results = await liveSearch(query, safeSearch);
      payload.summary = 'Live internet search results from the Bing public search index.';
    } catch (searchError: any) {
      return Response.json({
        error: 'Live internet search is unavailable. No generated or simulated results were substituted.',
        detail: searchError?.message || '',
        policy: context.summary,
        directory: buildDirectory(context),
        engine: 'Bing web search (live)',
      }, { status: 502 });
    }

    const rawResults = Array.isArray(payload?.results) ? payload.results : [];
    const seen = new Set();
    const results = [];

    for (const item of rawResults) {
      const url = String(item?.url || '').trim();
      const domain = extractDomain(url);
      if (!domain || !domain.includes('.') || seen.has(domain)) continue;
      seen.add(domain);
      const decision = checkDestination(context, url);
      results.push({
        title: String(item?.title || domain).slice(0, 200),
        url: /^https?:\/\//i.test(url) ? url : `https://${domain}`,
        domain,
        snippet: String(item?.snippet || '').slice(0, 300),
        allowed: decision.allowed,
        category: decision.category || '',
        category_label: decision.category_label || 'Uncategorized',
        reason: decision.reason,
      });
      if (results.length >= 10) break;
    }

    const ordered = [...results.filter(item => item.allowed), ...results.filter(item => !item.allowed)];

    await logActivity(base44, user, {
      domain: 'approved-search',
      url: 'https://search.pathfinder.internal',
      query,
      category: 'search',
      decision: 'allowed',
      reason: `${SEARCH_ENGINE_LABEL} query executed`,
      source: 'search',
      device_label: 'Managed browser',
    });

    return Response.json({
      policy: context.summary,
      engine: 'Bing web search (live)',
      summary: String(payload?.summary || '').slice(0, 400),
      query,
      results: ordered,
      blocked_count: ordered.filter(item => !item.allowed).length,
      directory: buildDirectory(context),
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Search failed' }, { status: 500 });
  }
}