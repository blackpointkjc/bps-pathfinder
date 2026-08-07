import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Forbidden' }, { status: 403 });

    let deleted = 0;
    for (let pass = 0; pass < 500; pass++) {
      const rows = await base44.asServiceRole.entities.LocationLog.list('-created_date', 500);
      if (!rows?.length) break;
      for (const row of rows) {
        await base44.asServiceRole.entities.LocationLog.delete(row.id);
        deleted++;
      }
      if (rows.length < 500) break;
    }
    return Response.json({ success: true, deleted });
  } catch (error) {
    console.error('purgeLegacyLocationLogs failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
