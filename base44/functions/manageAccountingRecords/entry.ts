import { createClientFromRequest } from 'npm:@base44/sdk';

const ALLOWED_ENTITIES = new Set(['Invoice', 'PayrollEntry', 'PayrollConfig', 'W2Form']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('accounting') && !roles.has('full_access')) {
      return Response.json({ error: 'Accounting access required' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (body.action === 'set_billing_contact') {
      const id=String(body.location_id || '');
      const email=String(body.contact_email || '').trim().toLowerCase();
      if (!id) return Response.json({error:'Location is required'},{status:400});
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({error:'Enter a valid client billing email address or leave blank for management fallback'},{status:400});
      const location=await base44.asServiceRole.entities.Location.get(id).catch(()=>null);
      if (!location) return Response.json({error:'Location not found'},{status:404});
      const record=await base44.asServiceRole.entities.Location.update(id,{billing_contact_email:email});
      return Response.json({success:true,record});
    }
    const entity = String(body.entity || '');
    const action = String(body.action || '');
    if (!ALLOWED_ENTITIES.has(entity)) return Response.json({ error: 'Unsupported accounting entity' }, { status: 400 });
    const api = (base44.asServiceRole.entities as any)[entity];
    if (!api) return Response.json({ error: 'Accounting entity unavailable' }, { status: 400 });

    if (action === 'create') {
      const record = await api.create(body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'bulkCreate') {
      const records = await api.bulkCreate(body.data || []);
      return Response.json({ success: true, records });
    }
    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      const record = await api.update(body.id, body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      await api.delete(body.id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error:any) {
    console.error('manageAccountingRecords failed', error);
    return Response.json({ error: error?.message || 'Unable to update accounting records' }, { status: 500 });
  }
});
