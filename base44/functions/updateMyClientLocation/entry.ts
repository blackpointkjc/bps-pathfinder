import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const isAdminPreview = user.role === 'admin' || roles.has('full_access');
    const isClient = roles.has('client') || String(user.user_type || '').toLowerCase() === 'client';
    if (!isClient && !isAdminPreview) return Response.json({ error: 'Client access required' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const locationId = String(body.location_id || '');
    if (!locationId) return Response.json({ error: 'Location is required' }, { status: 400 });

    const location = await base44.asServiceRole.entities.Location.get(locationId);
    if (!location) return Response.json({ error: 'Location not found' }, { status: 404 });

    if (!isAdminPreview) {
      const assigned = new Set([
        ...(Array.isArray(user.assigned_locations) ? user.assigned_locations : []),
        ...(Array.isArray(user.assigned_sites) ? user.assigned_sites : []),
        ...(user.assigned_location ? [user.assigned_location] : []),
      ].map((value: any) => String(value || '').trim()).filter(Boolean));
      const assignedByEmail = String(location.assigned_client_email || '').toLowerCase() === String(user.email || '').toLowerCase();
      if (!assigned.has(String(location.site_name || '').trim()) && !assignedByEmail) {
        return Response.json({ error: 'You can only edit your assigned location' }, { status: 403 });
      }
    }

    const data = body.data || {};
    const update = {
      address: String(data.address || '').trim(),
      site_email: String(data.site_email || '').trim(),
      notes: String(data.notes || ''),
    };
    await base44.asServiceRole.entities.Location.update(locationId, update);
    return Response.json({ success: true, location: { ...location, ...update } });
  } catch (error) {
    console.error('updateMyClientLocation failed', error);
    return Response.json({ error: error?.message || 'Unable to update location' }, { status: 500 });
  }
});
