import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = lower(error?.message || error?.response?.data?.error);
      const transient = message.includes('rate limit') || message.includes('429') || message.includes('timeout') || message.includes('temporar') || message.includes('500');
      if (!transient || attempt === attempts - 1) throw error;
      await wait(attempt === 0 ? 250 : 700);
    }
  }
  throw lastError;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('dispatch') || roles.has('supervisor') || roles.has('cad_access') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    // This function is an oversight/read service only. Actual automatic dispatch is
    // triggered by property-alert ingestion / call creation / explicit evaluation.
    // Keeping this path read-only prevents a CAD status refresh from recursively
    // launching dispatch work and taking the CAD workspace down under load.
    const evaluations = await withRetry(() => base44.asServiceRole.entities.AutoDispatchEvaluation.list('-evaluated_at', 120));

    // These two lookups are optional display filters. A transient failure must not
    // turn Automatic Dispatch into an outage; return the latest known evaluations.
    const activeCalls = await withRetry(() => base44.asServiceRole.entities.DispatchCall.list('-created_date', 250), 2).catch(() => []);
    const propertyAlerts = await withRetry(() => base44.asServiceRole.entities.PropertyAlert.list('-created_date', 250), 2).catch(() => []);

    const activeCallIds = new Set((activeCalls || []).map((item: any) => String(item.id)));
    const knownAlertIds = new Set((propertyAlerts || []).map((item: any) => String(item.id)));
    const latestByAlert = new Map<string, any>();

    for (const row of evaluations || []) {
      const key = String(row.property_alert_id || row.event_key || row.id || '');
      if (!key || latestByAlert.has(key)) continue;
      if (row.configuration_snapshot?.simulation === true || String(row.event_key || '').endsWith(':simulation')) continue;
      // Filter to active calls when the active-call dataset loaded successfully.
      if (activeCallIds.size && row.call_id && !activeCallIds.has(String(row.call_id))) continue;
      // Filter deleted/orphaned alerts only when alert data loaded successfully.
      if (knownAlertIds.size && row.property_alert_id && !knownAlertIds.has(String(row.property_alert_id))) continue;
      latestByAlert.set(key, row);
    }

    return Response.json({
      success: true,
      service_status: 'online',
      evaluations: [...latestByAlert.values()].slice(0, 20),
      partial: activeCallIds.size === 0 || knownAlertIds.size === 0,
    });
  } catch (error) {
    console.error('getAutoDispatchEvaluations failed', error);
    return Response.json({ error: error?.message || 'Unable to load automatic-dispatch evaluations' }, { status: 500 });
  }
});