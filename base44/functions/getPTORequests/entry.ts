import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized', requests: [] }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = user.role === 'admin' || roles.has('hr') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'HR access required', requests: [] }, { status: 403 });

    const requests = await base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 2000);
    return Response.json({ success: true, requests: requests || [] });
  } catch (error) {
    console.error('getPTORequests failed', error);
    return Response.json({ error: error?.message || 'Unable to load PTO requests', requests: [] });
  }
});
