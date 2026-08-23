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

// Force every browser upload in Pathfinder through the credit-free internal file route.
// Do this unconditionally so no page can fall back to Base44 Core.UploadFile when the
// SDK integration object is missing, lazy-loaded, or plan-limited.
base44.integrations = base44.integrations || {};
base44.integrations.Core = base44.integrations.Core || {};
base44.integrations.Core.UploadFile = async ({ file } = {}) => {
  if (!file) throw new Error('A file is required.');
  if (Number(file.size || 0) > 5 * 1024 * 1024) throw new Error('Files larger than 5 MB must be reduced before upload.');
  const data_url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read this file.'));
    reader.readAsDataURL(file);
  });
  const response = await base44.functions.invoke('storeInternalFile', { data_url, name: file.name || 'attachment' });
  const data = response?.data || response || {};
  if (data?.error) throw new Error(data.error);
  return data;
};

if (base44.integrations?.Core?.SendEmail) {
  base44.integrations.Core.SendEmail = async payload => {
    const actor = await base44.auth.me();
    if (!actor?.id) throw new Error('A signed-in Pathfinder user is required to send Outlook email.');
    const { sendOutlookMail } = await import('@/lib/outlookGraph');
    const to = Array.isArray(payload?.to) ? payload.to : String(payload?.to || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const cc = Array.isArray(payload?.cc) ? payload.cc : String(payload?.cc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const bcc = Array.isArray(payload?.bcc) ? payload.bcc : String(payload?.bcc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    if (!to.length) throw new Error('An email recipient is required.');
    await sendOutlookMail(actor.id, {
      to,
      cc,
      bcc,
      subject: String(payload?.subject || 'Black Point Notification'),
      body: String(payload?.body || payload?.html || ''),
      attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
      mailboxEmail: String(payload?.mailboxEmail || payload?.from_mailbox || '').trim(),
    });
    return { success: true, delivered: 'microsoft_outlook', to };
  };
}
