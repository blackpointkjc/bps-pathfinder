import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, serverUrl, token, functionsVersion } = appParams;

// Use Base44's SDK directly. Do not globally proxy, queue, cache, or back off
// application reads here: this client is shared by authentication, CAD, schedules,
// inbox, staffing, reports, and every other Pathfinder workspace. A global request
// governor can make one failing/rate-limited area appear to take the entire app
// offline. Polling/realtime cadence is controlled by the individual features.
export const base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false,
});

// Kept for callers such as Layout's "Refresh App" button. The raw SDK has no
// application-wide read cache to clear, so this intentionally does nothing.
export function clearBase44ReadCache() {}

export function getBase44RequestHealth() {
  return {
    queuedReads: 0,
    activeReads: 0,
    rateLimitedUntil: null,
    recentRateLimitAt: null,
  };
}

// Browser-side AI is routed through the app's own backend function so legacy call
// sites cannot accidentally create a second external integration path.
if (base44.integrations?.Core?.InvokeLLM) {
  base44.integrations.Core.InvokeLLM = async payload => {
    const response = await base44.functions.invoke('internalAssistant', payload || {});
    const data = response?.data || response || {};
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

// Browser-side email is sent through the signed-in user's connected Microsoft
// Outlook mailbox. This preserves existing SendEmail call sites without consuming
// a separate Base44 email integration path.
if (base44.integrations?.Core?.SendEmail) {
  base44.integrations.Core.SendEmail = async payload => {
    const actor = await base44.auth.me();
    if (!actor?.id) throw new Error('A signed-in Pathfinder user is required to send Outlook email.');
    const { sendOutlookMail } = await import('@/lib/outlookGraph');
    const rawTo = Array.isArray(payload?.to) ? payload.to : String(payload?.to || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawCc = Array.isArray(payload?.cc) ? payload.cc : String(payload?.cc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawBcc = Array.isArray(payload?.bcc) ? payload.bcc : String(payload?.bcc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    if (!rawTo.length) throw new Error('An email recipient is required.');
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
