import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

function parseCadNumber(value: unknown) {
  const match = String(value || '').trim().match(/^B(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = user.role === 'admin' || user.role === 'dispatch' || roles.has('cad_access') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const counters = await base44.asServiceRole.entities.CadCounter.filter({ counter_key: 'dispatch_call' });
    let counter = counters?.[0];

    if (!counter) {
      const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
      const highest = (calls || []).reduce((max: number, call: any) => Math.max(max, parseCadNumber(call.call_id)), 0);
      counter = await base44.asServiceRole.entities.CadCounter.create({
        counter_key: 'dispatch_call',
        last_number: highest,
      });
    }

    const next = Number(counter.last_number || 0) + 1;
    await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: next });

    return Response.json({ success: true, cad_number: `B${String(next).padStart(4, '0')}`, sequence: next });
  } catch (error) {
    console.error('issueCadNumber failed', error);
    return Response.json({ error: error?.message || 'Unable to issue CAD number' }, { status: 500 });
  }
});