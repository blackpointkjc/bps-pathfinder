import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadBrowserContext, checkDestination, buildDirectory, logActivity } from '../../shared/browserContext.ts';
import { extractDomain, SEARCH_ENGINE_LABEL } from '../../shared/browserPolicy.ts';

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One sentence describing what the results cover' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string', description: 'Full https URL of the source page' },
          snippet: { type: 'string', description: 'One or two sentence factual summary' },
        },
        required: ['title', 'url'],
      },
    },
  },
  required: ['results'],
};

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

    const prompt = [
      'You are the approved company search engine for a security company intranet browser.',
      'Search the web and return the most useful work, legal, regulatory, safety, technical and reference sources for the question below.',
      'Rules:',
      '- Return 6 to 10 results as real, complete https page URLs that you actually found.',
      '- Prefer government, court, statute, regulatory, standards, vendor documentation, university and reference websites.',
      '- Never include adult content, gambling, dating, piracy, streaming, music, social media, retail or shopping results.',
      '- Each snippet must be one or two factual sentences, under 220 characters.',
      safeSearch ? '- Apply strict safe search filtering to this query.' : '',
      `Question: ${query}`,
    ].filter(Boolean).join('\n');

    let payload: any = { results: [], summary: '' };
    try {
      payload = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        model: 'gemini_3_flash',
        response_json_schema: RESULT_SCHEMA,
      });
    } catch (searchError: any) {
      return Response.json({
        error: 'Approved search is temporarily unavailable. Use the approved directory or try again.',
        detail: searchError?.message || '',
        policy: context.summary,
        directory: buildDirectory(context),
        engine: SEARCH_ENGINE_LABEL,
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
      engine: SEARCH_ENGINE_LABEL,
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