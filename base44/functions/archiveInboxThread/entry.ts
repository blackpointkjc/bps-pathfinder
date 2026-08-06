import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { thread_key } = await req.json();
    if (!thread_key || typeof thread_key !== 'string') {
      return Response.json({ error: 'thread_key is required' }, { status: 400 });
    }

    const hiddenAt = new Date().toISOString();
    const existing = await base44.asServiceRole.entities.InboxThreadPreference.filter({
      user_email: currentUser.email,
      thread_key,
    }, '-created_date', 20);

    let preference;
    if (existing?.length) {
      preference = await base44.asServiceRole.entities.InboxThreadPreference.update(existing[0].id, {
        hidden: true,
        hidden_at: hiddenAt,
      });
      for (const duplicate of existing.slice(1)) {
        await base44.asServiceRole.entities.InboxThreadPreference.delete(duplicate.id).catch(() => null);
      }
    } else {
      preference = await base44.asServiceRole.entities.InboxThreadPreference.create({
        user_email: currentUser.email,
        thread_key,
        hidden: true,
        hidden_at: hiddenAt,
      });
    }

    return Response.json({ success: true, preference });
  } catch (error) {
    console.error('archiveInboxThread failed', error);
    return Response.json({ error: error?.message || 'Unable to archive conversation' }, { status: 500 });
  }
});
