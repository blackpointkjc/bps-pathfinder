import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('cad_access') && !roles.has('full_access')) {
      return Response.json({ error: 'CAD access required' }, { status: 403 });
    }

    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const legacy = (calls || []).filter((call: any) => !/^B\d+$/i.test(String(call.call_id || '')));
    if (!legacy.length) return Response.json({ success: true, updated: 0 });

    const counters = await base44.asServiceRole.entities.CadCounter.filter({ counter_key: 'dispatch_call' });
    let counter = counters?.[0];
    const highest = (calls || []).reduce((max: number, call: any) => {
      const match = String(call.call_id || '').match(/^B(\d+)$/i);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, Number(counter?.last_number || 0));

    if (!counter) {
      counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: 'dispatch_call', last_number: highest });
    }

    let next = highest;
    for (const call of legacy) {
      next += 1;
      const oldId = String(call.call_id || '');
      const externalId = oldId.startsWith('grac-') ? oldId.slice(5) : '';
      const existingDescription = String(call.description || '');
      const description = externalId && !existingDescription.includes('[GRAC:')
        ? `${existingDescription} [GRAC:${externalId}]`.trim()
        : existingDescription;
      await base44.asServiceRole.entities.DispatchCall.update(call.id, {
        call_id: `B${String(next).padStart(4, '0')}`,
        ...(description ? { description } : {}),
      });
    }
    await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: next });
    return Response.json({ success: true, updated: legacy.length, last_number: next });
  } catch (error) {
    console.error('ensureCadNumbers failed', error);
    return Response.json({ error: error?.message || 'Unable to repair CAD numbers' }, { status: 500 });
  }
});