import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadBrowserContext, checkDestination, buildDirectory, logActivity } from '../../shared/browserContext.ts';
import { extractDomain } from '../../shared/browserPolicy.ts';

// Resolves the employee's managed browsing profile and, when a destination is
// supplied, decides whether it may be opened and records the request.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error: any) => (error?.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const target = String(body?.url || body?.domain || '').trim().slice(0, 500);
    const source = ['search', 'navigation', 'directory', 'request'].includes(body?.source) ? body.source : 'navigation';
    const deviceLabel = String(body?.device_label || '').slice(0, 120) || 'Managed browser';
    const query = String(body?.query || '').slice(0, 200);

    const context = await loadBrowserContext(base44, user);
    const base = {
      policy: context.summary,
      directory: buildDirectory(context),
    };

    if (!target) {
      return Response.json(base);
    }

    const domain = extractDomain(target);
    if (!domain || !domain.includes('.')) {
      return Response.json({ ...base, decision: { allowed: false, domain: target, category: '', category_label: 'Invalid address', reason: 'Enter a valid website address, for example vacourts.gov.' } });
    }

    const decision = { ...checkDestination(context, target), domain };
    await logActivity(base44, user, {
      domain,
      url: String(body?.url || `https://${domain}`).slice(0, 1000),
      category: decision.category || 'unclassified',
      decision: decision.allowed ? 'allowed' : 'blocked',
      reason: decision.reason,
      basis: decision.basis,
      source,
      query,
      device_label: deviceLabel,
    });

    return Response.json({ ...base, decision });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Browser policy check failed' }, { status: 500 });
  }
}