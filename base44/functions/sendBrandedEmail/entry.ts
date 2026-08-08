import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { brandedPayload } from '../_shared/blackPointEmail.ts';

const smsGatewayPattern = /@(txt\.att\.net|vtext\.com|tmomail\.net|messaging\.sprintpcs\.com|vmobl\.com|mmst5\.tracfone\.com)$/i;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const recipient = String(payload?.to || '').trim();
    if (!recipient) return Response.json({ error: 'Recipient is required' }, { status: 400 });

    const outgoing = smsGatewayPattern.test(recipient) ? payload : brandedPayload(payload);
    await base44.asServiceRole.integrations.Core.SendEmail(outgoing);
    return Response.json({ success: true, to: recipient });
  } catch (error) {
    console.error('sendBrandedEmail failed', error);
    return Response.json({ error: error?.message || 'Unable to send email' }, { status: 500 });
  }
});
