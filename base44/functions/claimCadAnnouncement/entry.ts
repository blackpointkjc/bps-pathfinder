import { createClientFromRequest } from 'npm:@base44/sdk';

const clean = (value: unknown) => String(value || '').trim();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const eventKey = clean(body.event_key);
    const userEmail = clean(user.email).toLowerCase();
    if (!eventKey) return Response.json({ error: 'event_key is required' }, { status: 400 });

    if (body.action === 'finalize') {
      const receiptId = clean(body.receipt_id);
      if (!receiptId) return Response.json({ error: 'receipt_id is required' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.CadAnnouncementReceipt.get(receiptId).catch(() => null);
      if (!existing || clean(existing.user_email).toLowerCase() !== userEmail || clean(existing.event_key) !== eventKey) {
        return Response.json({ error: 'Announcement receipt not found' }, { status: 404 });
      }
      const allowedStates = new Set(['played', 'quiet', 'blocked', 'failed', 'disabled']);
      const state = allowedStates.has(clean(body.state)) ? clean(body.state) : 'failed';
      const updated = await base44.asServiceRole.entities.CadAnnouncementReceipt.update(receiptId, {
        state,
        error: clean(body.error).slice(0, 500),
        processed_at: new Date().toISOString(),
      });
      return Response.json({ success: true, receipt: updated });
    }

    const existing = await base44.asServiceRole.entities.CadAnnouncementReceipt.filter(
      { event_key: eventKey, user_email: userEmail },
      '-processed_at',
      5,
    );
    if (existing?.length) {
      return Response.json({ success: true, claimed: false, receipt: existing[0] });
    }

    const receipt = await base44.asServiceRole.entities.CadAnnouncementReceipt.create({
      event_key: eventKey,
      event_id: clean(body.event_id),
      user_email: userEmail,
      device_id: clean(body.device_id).slice(0, 250),
      state: 'quiet',
      processed_at: new Date().toISOString(),
      cad_number: clean(body.cad_number),
      event_type: clean(body.event_type),
    });
    return Response.json({ success: true, claimed: true, receipt });
  } catch (error) {
    console.error('claimCadAnnouncement failed', error);
    return Response.json({ error: error?.message || 'Unable to claim announcement' }, { status: 500 });
  }
});
