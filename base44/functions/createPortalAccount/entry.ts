import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { accountType, first_name, last_name, email, mobile_phone, assigned_location } = body;
    if (!['client', 'student'].includes(accountType)) {
      return Response.json({ error: 'Invalid account type' }, { status: 400 });
    }
    if (!first_name || !last_name || !email) {
      return Response.json({ error: 'First name, last name, and email are required' }, { status: 400 });
    }

    const roles = new Set((currentUser.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const fullAccess = currentUser.role === 'admin' || roles.has('full_access');
    const canCreateClient = fullAccess || roles.has('hr');
    const canCreateStudent = fullAccess || roles.has('trainer');
    if ((accountType === 'client' && !canCreateClient) || (accountType === 'student' && !canCreateStudent)) {
      return Response.json({ error: 'You do not have permission to create this account type' }, { status: 403 });
    }

    const users = await base44.asServiceRole.entities.User.list();
    let portalUser = (users || []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

    if (!portalUser) {
      const invitation = await base44.asServiceRole.users.inviteUser(email, 'user');
      portalUser = invitation?.user || invitation;
      if (!portalUser?.id) {
        const refreshed = await base44.asServiceRole.entities.User.list();
        portalUser = (refreshed || []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      }
    }

    if (!portalUser?.id) {
      return Response.json({
        success: true,
        invitation_sent: true,
        assignment_pending: true,
        message: 'Invitation sent. Role assignment will be available after the user accepts the invitation.'
      });
    }

    const updates: Record<string, unknown> = {
      first_name,
      last_name,
      mobile_phone: mobile_phone || '',
      role: 'user',
      additional_roles: [accountType],
      assigned_location: accountType === 'client' ? assigned_location || '' : '',
      assigned_locations: accountType === 'client' && assigned_location ? [assigned_location] : [],
      assigned_sites: accountType === 'client' && assigned_location ? [assigned_location] : [],
      rank: accountType === 'student' ? 'Student' : 'Client',
    };
    await base44.asServiceRole.entities.User.update(portalUser.id, updates);

    if (accountType === 'client' && assigned_location) {
      const locations = await base44.asServiceRole.entities.Location.list();
      const location = (locations || []).find((l: any) => l.site_name === assigned_location);
      if (location?.id) {
        await base44.asServiceRole.entities.Location.update(location.id, { assigned_client_email: email });
      }
    }

    return Response.json({ success: true, invitation_sent: true, user_id: portalUser.id });
  } catch (error) {
    console.error('createPortalAccount failed', error);
    return Response.json({ error: error.message || 'Unable to create portal account' }, { status: 500 });
  }
});