import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((me.additional_roles || []).map((role: string) => lower(role)));
    const blocked = roles.has('client') || roles.has('student') || roles.has('pending')
      || ['client', 'student', 'pending'].includes(lower(me.user_type))
      || ['client', 'student'].includes(lower(me.rank));
    if (blocked) return Response.json({ error: 'Operational access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(50, Math.min(200, Number(body?.limit || 100)));
    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', limit);

    return Response.json({
      success: true,
      calls: Array.isArray(calls) ? calls : [],
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('getActiveDispatchCalls failed', error);
    return Response.json(
      { error: error?.message || 'Unable to load active dispatch calls' },
      { status: 500 },
    );
  }
});
