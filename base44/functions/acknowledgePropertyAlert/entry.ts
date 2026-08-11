import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin'
      || user.role === 'dispatch'
      || roles.has('full_access')
      || roles.has('supervisor')
      || roles.has('cad_access')
      || roles.has('officer')
      || Boolean(user.dispatch_role);
    if (!allowed) return Response.json({ error: 'Property alert access required' }, { status: 403 });

    const { alert_id, action = 'acknowledged' } = await req.json().catch(() => ({}));
    if (!alert_id) return Response.json({ error: 'alert_id is required' }, { status: 400 });
    if (!['acknowledged', 'silenced'].includes(action)) {
      return Response.json({ error: 'action must be acknowledged or silenced' }, { status: 400 });
    }

    const alert = await base44.asServiceRole.entities.PropertyAlert.get(alert_id);
    if (!alert) return Response.json({ error: 'Property alert not found' }, { status: 404 });

    const userEmail = String(user.email || '').trim().toLowerCase();
    if (!userEmail) return Response.json({ error: 'Signed-in user email is required' }, { status: 400 });

    const existing = await base44.asServiceRole.entities.PropertyAlertReceipt.filter({
      user_email: userEmail,
      call_id: String(alert.callId || ''),
      property_id: String(alert.propertyId || ''),
    }, '-dismissed_at', 10).catch(() => []);

    const data = {
      alert_id,
      call_id: String(alert.callId || ''),
      property_id: String(alert.propertyId || ''),
      user_email: userEmail,
      action,
      dismissed_at: new Date().toISOString(),
    };

    const receipt = existing?.[0]
      ? await base44.asServiceRole.entities.PropertyAlertReceipt.update(existing[0].id, data)
      : await base44.asServiceRole.entities.PropertyAlertReceipt.create(data);

    // PropertyAlert is a shared event. Do not mark the event globally acknowledged:
    // every CAD/officer account gets its own dismissal receipt.
    return Response.json({ success: true, alert, receipt });
  } catch (error) {
    console.error('acknowledgePropertyAlert failed', error);
    return Response.json({ error: error?.message || 'Unable to dismiss property alert' }, { status: 500 });
  }
});
