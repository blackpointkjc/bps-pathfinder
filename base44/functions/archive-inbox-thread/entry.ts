import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { thread_key } = await req.json();
    if (!thread_key || typeof thread_key !== 'string') {
      return Response.json({ error: 'thread_key is required' }, { status: 400 });
    }

    const userEmail = String(currentUser.email).trim().toLowerCase();
    const hiddenAt = new Date().toISOString();
    const allPreferences = await base44.asServiceRole.entities.InboxThreadPreference.list('-created_date', 1000);
    const existing = (allPreferences || []).filter((item) =>
      String(item.user_email || '').trim().toLowerCase() === userEmail && item.thread_key === thread_key
    );

    let preference;
    if (existing.length) {
      preference = await base44.asServiceRole.entities.InboxThreadPreference.update(existing[0].id, {
        user_email: userEmail,
        hidden: true,
        hidden_at: hiddenAt,
      });
      for (const duplicate of existing.slice(1)) {
        await base44.asServiceRole.entities.InboxThreadPreference.delete(duplicate.id).catch(() => null);
      }
    } else {
      preference = await base44.asServiceRole.entities.InboxThreadPreference.create({
        user_email: userEmail,
        thread_key,
        hidden: true,
        hidden_at: hiddenAt,
      });
    }

    return Response.json({ success: true, preference });
  } catch (error) {
    console.error('archive-inbox-thread failed', error);
    return Response.json({ error: error?.message || 'Unable to archive conversation' }, { status: 500 });
  }
});