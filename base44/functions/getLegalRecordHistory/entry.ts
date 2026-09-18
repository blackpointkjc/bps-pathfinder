import { createClientFromRequest } from 'npm:@base44/sdk';

const ENTITY_MAP:any = {
  trespass: 'TrespassingNotice',
  complaint: 'CriminalComplaint',
  summons: 'Summons',
  subpoena: 'WitnessSubpoenaRequest',
};

const refsForUser = (user:any) => new Set(
  [user?.id, user?.email, user?.work_email, user?.pathfinder_email, user?.microsoft_email]
    .filter(Boolean)
    .map((value:any) => String(value).trim().toLowerCase())
);

const belongsTo = (record:any, refs:Set<string>) => [
  record?.created_by_id,
  record?.created_by,
  record?.created_by_email,
  record?.officer_email,
  record?.submitted_by,
  record?.submitted_by_email,
  record?.reporting_officer_email,
  record?.requested_by_email,
  record?.requested_by_id,
].filter(Boolean).some(value => refs.has(String(value).trim().toLowerCase()));

const retry = async <T>(fn:() => Promise<T>):Promise<T> => {
  let last:any;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fn(); }
    catch (error) {
      last = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw last;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const type = String(body?.type || '').toLowerCase();
    const entityName = ENTITY_MAP[type];
    if (!entityName) return Response.json({ error: 'Unknown legal record type' }, { status: 400 });

    const roles = new Set((user.additional_roles || []).map((role:string) => String(role).toLowerCase()));
    const isAdmin = user.role === 'admin' || roles.has('full_access');
    const refs = refsForUser(user);
    const action = String(body?.action || 'list').toLowerCase();

    if (action === 'update') {
      const id = String(body?.id || '');
      if (!id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      const existing = await retry(() => base44.asServiceRole.entities[entityName].get(id));
      if (!existing) return Response.json({ error: 'Record not found' }, { status: 404 });
      if (!isAdmin && !belongsTo(existing, refs)) return Response.json({ error: 'You can only edit your own legal record' }, { status: 403 });
      const data = body?.data && typeof body.data === 'object' ? body.data : {};
      const updated = await retry(() => base44.asServiceRole.entities[entityName].update(id, data));
      return Response.json({ success: true, record: updated || { ...existing, ...data, id } });
    }

    const rows:any[] = await retry(() => base44.asServiceRole.entities[entityName].list('-updated_date', 500));
    const visible = isAdmin ? (rows || []) : (rows || []).filter(record => belongsTo(record, refs));

    return Response.json({
      success: true,
      rows: visible,
      total: visible.length,
      is_admin: isAdmin,
    });
  } catch (error) {
    console.error('getLegalRecordHistory failed', error);
    return Response.json({ error: error?.message || 'Unable to load legal record history' }, { status: 500 });
  }
});
