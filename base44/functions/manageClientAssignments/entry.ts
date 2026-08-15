import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = rolesOf(user);
    const authorized = user.role === 'admin' || roles.has('hr') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'HR or Admin access required' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const { action, client_id } = body;
    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const locations = await base44.asServiceRole.entities.Location.list('site_name', 1000);

    if (action === 'sync_all') {
      for (const entry of users || []) {
        const entryRoles = rolesOf(entry);
        const isClient = entryRoles.has('client') || String(entry.user_type || '').toLowerCase() === 'client' || String(entry.rank || '').toLowerCase() === 'client';
        if (!isClient || !entry.id || !entry.email) continue;
        const names = (locations || []).filter((location: any) => String(location.assigned_client_email || '').toLowerCase() === String(entry.email).toLowerCase()).map((location: any) => location.site_name).filter(Boolean);
        await base44.asServiceRole.entities.User.update(entry.id, { assigned_location: names[0] || '', assigned_locations: names, assigned_sites: names });
      }
      return Response.json({ success: true });
    }

    if (!client_id) return Response.json({ error: 'Client is required' }, { status: 400 });
    const client = (users || []).find((entry: any) => String(entry.id) === String(client_id));
    if (!client) return Response.json({ error: 'Client account not found' }, { status: 404 });
    const clientRoles = rolesOf(client);
    if (!clientRoles.has('client') && String(client.user_type || '').toLowerCase() !== 'client' && String(client.rank || '').toLowerCase() !== 'client') {
      return Response.json({ error: 'Selected account is not a client account' }, { status: 400 });
    }

    if (action === 'update') {
      const data = body.data || {};
      const propertyNames = [...new Set([...(Array.isArray(data.property_names) ? data.property_names : []), ...(Array.isArray(data.assigned_locations) ? data.assigned_locations : []), data.property_name].filter(Boolean).map((name: unknown) => String(name).trim()).filter(Boolean))];
      if (!data.first_name || !data.last_name || !data.email || !propertyNames.length) {
        return Response.json({ error: 'First name, last name, email, and at least one property are required' }, { status: 400 });
      }

      const oldAssignedNames = new Set([
        client.assigned_location,
        ...(client.assigned_locations || []),
        ...(client.assigned_sites || []),
      ].filter(Boolean));

      await base44.asServiceRole.entities.User.update(client.id, {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        mobile_phone: data.mobile_phone || '',
        additional_roles: [...new Set([...(client.additional_roles || []).filter((r: string) => String(r).toLowerCase() !== 'client'), 'client'])],
        assigned_location: propertyNames[0],
        assigned_locations: propertyNames,
        assigned_sites: propertyNames,
      });

      for (const location of locations || []) {
        const matchesOld = oldAssignedNames.has(location.site_name) || String(location.assigned_client_email || '').toLowerCase() === String(client.email || '').toLowerCase();
        if (matchesOld && !propertyNames.includes(location.site_name)) {
          await base44.asServiceRole.entities.Location.update(location.id, { assigned_client_email: null });
        }
        if (propertyNames.includes(location.site_name)) {
          await base44.asServiceRole.entities.Location.update(location.id, { assigned_client_email: data.email });
        }
      }
      return Response.json({ success: true });
    }

    if (action === 'remove') {
      const nextRoles = (client.additional_roles || []).filter((role: string) => String(role).toLowerCase() !== 'client');
      await base44.asServiceRole.entities.User.update(client.id, {
        additional_roles: nextRoles,
        assigned_location: '',
        assigned_locations: [],
        assigned_sites: [],
      });
      for (const location of locations || []) {
        if (String(location.assigned_client_email || '').toLowerCase() === String(client.email || '').toLowerCase()) {
          await base44.asServiceRole.entities.Location.update(location.id, { assigned_client_email: null });
        }
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageClientAssignments failed', error);
    return Response.json({ error: error?.message || 'Unable to manage client assignment' }, { status: 500 });
  }
});
