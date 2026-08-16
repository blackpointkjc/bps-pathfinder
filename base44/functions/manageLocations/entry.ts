import { createClientFromRequest } from 'npm:@base44/sdk';

function rolesOf(user: any) {
  return new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const roles = rolesOf(user);
    const authorized = !!user && (
      user.role === 'admin' ||
      roles.has('full_access') ||
      roles.has('support') ||
      roles.has('support_staff')
    );
    if (!authorized) {
      return Response.json({ error: 'Location management access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list').toLowerCase();

    if (action === 'list') {
      const locations = await base44.asServiceRole.entities.Location.list('site_name', 1000);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const result = [];
      for (const location of locations || []) {
        let current = location;
        if (location.active && location.contract_end_date) {
          const end = new Date(location.contract_end_date);
          if (!Number.isNaN(end.getTime())) {
            end.setHours(12, 0, 0, 0);
            if (today.getTime() >= end.getTime()) {
              await base44.asServiceRole.entities.Location.update(location.id, { active: false });
              current = { ...location, active: false };
            }
          }
        }
        result.push(current);
      }
      return Response.json({ success: true, locations: result });
    }

    if (action === 'create') {
      if (!body.data?.site_name) {
        return Response.json({ error: 'Site name is required' }, { status: 400 });
      }
      const location = await base44.asServiceRole.entities.Location.create(body.data);
      return Response.json({ success: true, location });
    }

    if (action === 'update') {
      if (!body.id || !body.data) {
        return Response.json({ error: 'Location id and update data are required' }, { status: 400 });
      }
      await base44.asServiceRole.entities.Location.update(body.id, body.data);
      const location = await base44.asServiceRole.entities.Location.get(body.id);
      return Response.json({ success: true, location });
    }

    if (action === 'delete') {
      if (!body.id) {
        return Response.json({ error: 'Location id is required' }, { status: 400 });
      }
      await base44.asServiceRole.entities.Location.delete(body.id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unsupported location action' }, { status: 400 });
  } catch (error) {
    console.error('manageLocations failed', error);
    return Response.json({ error: error?.message || 'Unable to manage locations' }, { status: 500 });
  }
});
