import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/857a5f1c1_UntitledProject3.png';
const PORTAL_URL = 'https://bpspf.blackpointkjc.com/';
const smsGatewayPattern = /@(txt\.att\.net|vtext\.com|tmomail\.net|messaging\.sprintpcs\.com|vmobl\.com|mmst5\.tracfone\.com)$/i;
const safe = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function normalizeBody(body: unknown) {
  const value = String(body ?? '');
  if (!/<\/?[a-z][\s\S]*>/i.test(value)) return value.split(/\n{2,}/).map(block => `<p style="margin:0 0 16px;color:#d7d7d7;font-size:16px;line-height:1.65;">${safe(block).replace(/\n/g,'<br>')}</p>`).join('');
  let html = value;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i); if (bodyMatch) html = bodyMatch[1];
  return html.replace(/<!doctype[^>]*>/gi,'').replace(/<\/?html[^>]*>/gi,'').replace(/<head[\s\S]*?<\/head>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/\sstyle=("[^"]*"|'[^']*')/gi,'').replace(/\sclass=("[^"]*"|'[^']*')/gi,'')
    .replace(/<p([^>]*)>/gi,'<p$1 style="margin:0 0 16px;color:#d7d7d7;font-size:16px;line-height:1.65;">')
    .replace(/<strong([^>]*)>/gi,'<strong$1 style="color:#fff;font-weight:700;">')
    .replace(/<table([^>]*)>/gi,'<table$1 style="width:100%;border-collapse:collapse;margin:16px 0;background:#202020;">')
    .replace(/<th([^>]*)>/gi,'<th$1 style="padding:10px 12px;border:1px solid #3a3a3a;color:#fff;text-align:left;font-size:14px;">')
    .replace(/<td([^>]*)>/gi,'<td$1 style="padding:10px 12px;border:1px solid #3a3a3a;color:#d7d7d7;font-size:14px;line-height:1.5;">');
}

function branded(payload: any) {
  const subject = String(payload.subject || 'Black Point Notification');
  const actionUrlRaw = String(payload.action_url || PORTAL_URL);
  const actionUrl = actionUrlRaw.startsWith('/') ? `${PORTAL_URL.replace(/\/$/,'')}${actionUrlRaw}` : actionUrlRaw;
  let actionLabel = payload.action_label || 'View in Black Point Portal';
  if (!payload.action_label && /schedule|shift/i.test(subject)) actionLabel = 'View Schedule';
  else if (!payload.action_label && /training/i.test(subject)) actionLabel = 'Open Training Portal';
  else if (!payload.action_label && /invoice/i.test(subject)) actionLabel = 'View Invoice';
  else if (!payload.action_label && /report/i.test(subject)) actionLabel = 'View Report';
  const inner = normalizeBody(payload.body || payload.html || '');
  const year = new Date().getFullYear();
  const { action_url, action_label, html, ...rest } = payload;
  return { ...rest, from_name:'Black Point Protection', subject, body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(subject)}</title></head><body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b0b0b;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#151515;border:1px solid #caa72d;border-radius:14px;overflow:hidden;"><tr><td align="center" style="padding:30px 24px 20px;background:#050505;"><img src="${LOGO_URL}" alt="Black Point" width="210" style="display:block;width:210px;max-width:75%;height:auto;border:0;"></td></tr><tr><td style="height:5px;background:#d4af37;font-size:0;line-height:5px;">&nbsp;</td></tr><tr><td style="padding:34px 38px 12px;"><h1 style="margin:0 0 22px;color:#fff;font-size:28px;line-height:1.25;text-align:center;">${safe(subject)}</h1><div style="color:#d7d7d7;font-size:16px;line-height:1.65;">${inner}</div></td></tr><tr><td align="center" style="padding:10px 38px 8px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 22px;"><tr><td bgcolor="#d4af37" style="border-radius:6px;"><a href="${safe(actionUrl)}" target="_blank" style="display:inline-block;padding:15px 30px;color:#090909;font-size:16px;font-weight:bold;text-decoration:none;">${safe(actionLabel)}</a></td></tr></table></td></tr><tr><td style="padding:24px 38px 34px;"><p style="margin:0 0 6px;color:#fff;font-size:16px;font-weight:bold;">Black Point</p><p style="margin:0;color:#bdbdbd;font-size:14px;line-height:1.6;">701 E Franklin St, Suite 105 1052<br>Richmond, Virginia 23219<br><a href="mailto:info@blackpointkjc.com" style="color:#e5c75b;text-decoration:none;">info@blackpointkjc.com</a><br><a href="tel:+18558277911" style="color:#e5c75b;text-decoration:none;">(855) 8BPS911</a></p></td></tr><tr><td align="center" style="padding:22px 24px;background:#050505;border-top:1px solid #292929;"><a href="https://home.blackpointkjc.com/" style="color:#d4af37;font-size:13px;">home.blackpointkjc.com</a><p style="margin:14px 0 0;color:#666;font-size:11px;">© ${year} Black Point. All rights reserved.</p></td></tr></table></td></tr></table></body></html>` };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = await req.json();
    const recipient = String(payload?.to || '').trim();
    if (!recipient) return Response.json({ error: 'Recipient is required' }, { status: 400 });
    // Credit-free: SendEmail is intentionally no longer used. This utility has no
    // active caller in the app; the response contract is preserved so any future
    // invocation completes without spending integration credits.
    return Response.json({ success: true, to: recipient, delivered: 'in_app_only' });
  } catch (error) {
    console.error('sendBrandedEmail failed', error);
    return Response.json({ error: error?.message || 'Unable to send email' }, { status: 500 });
  }
});