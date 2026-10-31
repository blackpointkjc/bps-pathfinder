// Loads the managed-browser context for a signed-in employee and evaluates
// individual destinations. Used by browserAccessCheck and browserSearch.
import { resolvePolicy, policySummary, evaluateDomain, directoryEntries, isResearchDomain, matchesDomain, normalizeDomain } from "./browserPolicy.ts";
import { withRateLimitRetry } from "./rateLimitRetry.ts";

function unwrap(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

export async function loadBrowserContext(base44, user) {
  const read = (operation: () => Promise<any>, label: string) => withRateLimitRetry(operation, { attempts: 3, label });
  const [policiesResult, rulesResult, grantsResult] = await Promise.all([
    read(() => base44.asServiceRole.entities.BrowserPolicy.filter({ active: true }, { limit: 100 }), 'BrowserPolicy read'),
    read(() => base44.asServiceRole.entities.BrowserSiteRule.filter({ active: true }, { limit: 200 }), 'BrowserSiteRule read'),
    read(() => base44.entities.BrowserAccessRequest.filter({ user_email: user.email, status: "approved" }, { limit: 100 }), 'BrowserAccessRequest read'),
  ]);

  const policies = unwrap(policiesResult);
  const siteRules = unwrap(rulesResult);
  const now = Date.now();
  const grants = unwrap(grantsResult).filter(item => {
    if (!item || !item.expires_at) return false;
    return new Date(item.expires_at).getTime() > now;
  });

  const { policy, basis } = resolvePolicy(policies, user);
  const summary = { ...policySummary(policy), basis };

  return { user, policy, basis, summary, siteRules, grants };
}

export function checkDestination(context, domainOrUrl) {
  return evaluateDomain({
    domain: domainOrUrl,
    policy: context.policy,
    siteRules: context.siteRules,
    grants: context.grants,
    user: context.user,
  });
}

// Company-approved directory shown on the employee homepage.
export function buildDirectory(context) {
  const candidates = new Set([...(context.policy?.allowed_domains || []), ...directoryEntries()]);
  const entries = [];
  for (const domain of candidates) {
    const clean = normalizeDomain(domain);
    if (!clean) continue;
    if (clean === 'gov' || clean === 'edu' || clean === 'mil') continue;
    const decision = checkDestination(context, clean);
    entries.push({
      domain: clean,
      category: decision.category,
      category_label: decision.category_label,
      allowed: decision.allowed,
      reason: decision.reason,
    });
  }
  return entries
    .filter((entry, index, list) => list.findIndex(item => item.domain === entry.domain) === index)
    .sort((a, b) => Number(b.allowed) - Number(a.allowed) || a.domain.localeCompare(b.domain))
    .slice(0, 18);
}

export function isApprovedReference(domain) {
  return isResearchDomain(normalizeDomain(domain));
}

export function domainIs(target, entry) {
  return matchesDomain(target, entry);
}

export async function logActivity(base44, user, payload) {
  const record = {
    user_email: user.email,
    user_name: [user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email,
    occurred_at: new Date().toISOString(),
    device_label: typeof navigator !== 'undefined' ? 'Managed browser' : 'Managed browser',
    ...payload,
  };
  return base44.entities.BrowserActivity.create(record);
}