import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userEmail = String(currentUser.email).trim().toLowerCase();
    const allPreferences = await base44.asServiceRole.entities.InboxThreadPreference.list('-created_date', 1000);
    const preferences = (allPreferences || []).filter((item) =>
      String(item.user_email || '').trim().toLowerCase() === userEmail && item.hidden !== false
    );

    return Response.json({ success: true, preferences });
  } catch (error) {
    console.error('get-inbox-thread-preferences failed', error);
    return Response.json({ error: error?.message || 'Unable to load archived conversations' }, { status: 500 });
  }
});