import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized', users: [] }, { status: 401 });
    const allUsers = await base44.asServiceRole.entities.User.list();
    const users = (allUsers || []).filter((entry: any) => !entry.termination_date).map((entry: any) => ({
      email: entry.email,
      first_name: entry.first_name || '',
      last_name: entry.last_name || '',
      full_name: entry.full_name || '',
      rank: entry.rank || '',
      profile_photo_url: entry.profile_photo_url || '',
      mobile_phone: entry.mobile_phone || '',
    }));
    return Response.json({ success: true, users });
  } catch (error) {
    return Response.json({ error: error.message, users: [] }, { status: 500 });
  }
});
