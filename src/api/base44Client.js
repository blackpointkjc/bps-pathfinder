import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// Browser-side email is sent through the signed-in user's connected Microsoft
// Outlook mailbox. This preserves the existing SendEmail call sites throughout
// Pathfinder while avoiding Base44 email integration credits. The dynamic import
// avoids a static circular dependency because outlookGraph uses this Base44 client
// for mailbox-link persistence.
if (base44.integrations?.Core?.InvokeLLM) {
  base44.integrations.Core.InvokeLLM = async payload => {
    const response = await base44.functions.invoke('internalAssistant', payload || {});
    const data = response?.data || response || {};
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

if (base44.integrations?.Core?.SendEmail) {
  base44.integrations.Core.SendEmail = async payload => {
    const actor = await base44.auth.me();
    if (!actor?.id) throw new Error('A signed-in Pathfinder user is required to send Outlook email.');
    const { sendOutlookMail } = await import('@/lib/outlookGraph');
    const rawTo = Array.isArray(payload?.to) ? payload.to : String(payload?.to || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawCc = Array.isArray(payload?.cc) ? payload.cc : String(payload?.cc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawBcc = Array.isArray(payload?.bcc) ? payload.bcc : String(payload?.bcc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    if (!rawTo.length) throw new Error('An email recipient is required.');
    // Notifications are stored against the Pathfinder login identity, but outbound
    // email must go to the employee's connected Microsoft/work mailbox when one exists.
    const allRaw = [...rawTo, ...rawCc, ...rawBcc];
    const resolvedResponse = await base44.functions.invoke('resolveNotificationEmails', { emails: allRaw }).catch(() => null);
    const resolved = resolvedResponse?.data?.emails || resolvedResponse?.emails || allRaw;
    let cursor = 0;
    const to = resolved.slice(cursor, cursor += rawTo.length);
    const cc = resolved.slice(cursor, cursor += rawCc.length);
    const bcc = resolved.slice(cursor, cursor += rawBcc.length);
    await sendOutlookMail(actor.id, {
      to,
      cc,
      bcc,
      subject: String(payload?.subject || 'Black Point Notification'),
      body: String(payload?.body || payload?.html || ''),
      attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
      mailboxEmail: String(payload?.mailboxEmail || payload?.from_mailbox || '').trim(),
    });
    return { success: true, delivered: 'microsoft_outlook', to, resolved_work_addresses: true };
  };
}
