import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const MAP: Record<string,string> = {
  'Colonel (Director of Company Operations)': 'Colonel',
  'Lt Colonel (Director of Security Operations)': 'Lt Colonel',
  'Major (Supervisor of Field Operations)': 'Major',
  'Major (Director of Field Operations)': 'Major',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r:string) => String(r).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Forbidden' }, { status: 403 });
    const users = await base44.asServiceRole.entities.User.list('-created_date', 500);
    let updated = 0;
    for (const person of users || []) {
      const next = MAP[String(person.rank || '')];
      if (next && next !== person.rank) { await base44.asServiceRole.entities.User.update(person.id, { rank: next }); updated++; }
    }
    return Response.json({ success: true, updated });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to normalize ranks' }, { status: 500 });
  }
});
