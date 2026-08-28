import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('dispatch') || roles.has('supervisor') || roles.has('cad_access') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });
    const evaluations = await base44.asServiceRole.entities.AutoDispatchEvaluation.list('-evaluated_at', 50);
    return Response.json({ success: true, evaluations: evaluations || [] });
  } catch (error) {
    console.error('getAutoDispatchEvaluations failed', error);
    return Response.json({ error: error?.message || 'Unable to load automatic-dispatch evaluations' }, { status: 500 });
  }
});
