import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const entries = await base44.asServiceRole.entities.TimeEntry.filter(
      { officer_email: String(me.email) },
      '-clock_in',
      2000,
    );
    return Response.json({ success: true, entries: (entries || []).filter((entry: any) => entry.archived !== true) });
  } catch (error) {
    console.error('getMyTimeEntries failed', error);
    return Response.json({ error: error?.message || 'Unable to load time entries', entries: [] }, { status: 500 });
  }
});