import { createClientFromRequest } from 'npm:@base44/sdk';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function loadUsers(base44: any) {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const rows = await base44.asServiceRole.entities.User.list(undefined, 1000);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(500 * (attempt + 1));
    }
  }
  throw lastError || new Error('Unable to load client users');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser) return Response.json({ error: 'Unauthorized', clients: [] }, { status: 401 });

    const roles = new Set((currentUser.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = currentUser.role === 'admin' || roles.has('accounting') || roles.has('hr') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'Client directory access required', clients: [] }, { status: 403 });

    const allUsers = await loadUsers(base44);
    const clients = (allUsers || [])
      .filter((entry: any) => {
        const entryRoles = (entry.additional_roles || []).map((role: string) => String(role).toLowerCase());
        const rank = String(entry.rank || '').toLowerCase();
        const userType = String(entry.user_type || '').toLowerCase();
        return !entry.termination_date && (
          entryRoles.includes('client') ||
          rank === 'client' ||
          userType === 'client' ||
          Boolean(entry.assigned_location) ||
          (entry.assigned_locations || []).length > 0 ||
          (entry.assigned_sites || []).length > 0
        );
      })
      .map((entry: any) => ({
        id: entry.id,
        email: entry.email || '',
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || `${entry.first_name || ''} ${entry.last_name || ''}`.trim(),
        mobile_phone: entry.mobile_phone || '',
        assigned_location: entry.assigned_location || '',
        assigned_locations: entry.assigned_locations || [],
        assigned_sites: entry.assigned_sites || [],
        additional_roles: entry.additional_roles || [],
      }))
      .sort((a: any, b: any) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));

    return Response.json({ success: true, clients });
  } catch (error) {
    console.error('getClientUsers failed', error);
    return Response.json({ error: error?.message || 'Unable to load clients', clients: [] }, { status: 500 });
  }
});