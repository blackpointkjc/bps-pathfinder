const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/857a5f1c1_UntitledProject3.png';
const PORTAL_URL = 'https://bpspf.blackpointkjc.com/';

const replaceLegacyBranding = value => String(value || '')
  .replace(/Black Point Portal/gi, 'Black Point Portal')
  .replace(/Black Point Protection Services/gi, 'Black Point Protection Services')
  .replace(/Black Point Protection/gi, 'Black Point Protection')
  .replace(/Black Point Portal/gi, 'Black Point Portal')
  .replace(/virtusconnect\.base44\.app/gi, 'bpspf.blackpointkjc.com')
  .replace(/pathfinderbps\.base44\.app/gi, 'bpspf.blackpointkjc.com');

const plainToHtml = text => replaceLegacyBranding(text)
  .split(/\n{2,}/)
  .map(block => `<p style="margin:0 0 16px;line-height:1.65;color:#e5e7eb;">${block.replace(/\n/g, '<br>')}</p>`)
  .join('');

export function buildBlackPointEmail({ subject = 'Black Point Notification', body = '', actionUrl = PORTAL_URL, actionLabel = 'View in Black Point Portal' } = {}) {
  const cleanSubject = replaceLegacyBranding(subject);
  const cleaned = replaceLegacyBranding(body);
  const existingBody = /<\/?[a-z][\s\S]*>/i.test(cleaned) ? cleaned : plainToHtml(cleaned);
  const inner = existingBody
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');
  const safeUrl = replaceLegacyBranding(actionUrl || PORTAL_URL);
  const safeLabel = replaceLegacyBranding(actionLabel || 'View in Black Point Portal');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cleanSubject}</title></head>
  <body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0b;padding:28px 12px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background-color:#151515;border:1px solid #caa72d;border-radius:14px;overflow:hidden;">
        <tr><td align="center" style="padding:30px 24px 20px;background-color:#050505;">
          <img src="${LOGO_URL}" alt="Black Point" width="210" style="display:block;width:210px;max-width:75%;height:auto;border:0;">
        </td></tr>
        <tr><td style="height:5px;line-height:5px;font-size:0;background-color:#d4af37;">&nbsp;</td></tr>
        <tr><td style="padding:34px 38px 12px;"><h1 style="margin:0 0 16px;color:#ffffff;font-size:28px;line-height:1.25;text-align:center;">${cleanSubject}</h1><div style="font-size:16px;color:#d7d7d7;line-height:1.65;">${inner}</div></td></tr>
        ${safeUrl ? `<tr><td style="padding:10px 38px 8px;text-align:center;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 22px;"><tr><td align="center" bgcolor="#d4af37" style="border-radius:6px;"><a href="${safeUrl}" target="_blank" style="display:inline-block;padding:15px 30px;color:#090909;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;">${safeLabel}</a></td></tr></table><p style="margin:0 0 18px;color:#bdbdbd;font-size:14px;line-height:1.65;text-align:center;">Portal address:<br><a href="${safeUrl}" style="color:#e5c75b;text-decoration:underline;">${safeUrl}</a></p></td></tr>` : ''}
        <tr><td style="padding:24px 38px 34px;"><p style="margin:0 0 6px;color:#ffffff;font-size:16px;font-weight:bold;">Black Point</p><p style="margin:0;color:#bdbdbd;font-size:14px;line-height:1.6;">701 E Franklin St, Suite 105 1052<br>Richmond, Virginia 23219<br><a href="mailto:info@blackpointkjc.com" style="color:#e5c75b;text-decoration:none;">info@blackpointkjc.com</a><br><a href="tel:+18558277911" style="color:#e5c75b;text-decoration:none;">(855) 8BPS911</a></p></td></tr>
        <tr><td align="center" style="padding:22px 24px;background-color:#050505;border-top:1px solid #292929;"><p style="margin:0 0 8px;color:#8f8f8f;font-size:12px;line-height:1.5;">Need more information? Visit our main website.</p><p style="margin:0;"><a href="https://home.blackpointkjc.com/" target="_blank" style="color:#d4af37;font-size:13px;text-decoration:underline;">home.blackpointkjc.com</a></p><p style="margin:14px 0 0;color:#666666;font-size:11px;">© ${new Date().getFullYear()} Black Point. All rights reserved.</p></td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

export function brandEmailPayload(payload = {}) {
  const subject = replaceLegacyBranding(payload.subject || 'Black Point Notification');
  const originalBody = payload.body || payload.html || '';
  const urlMatch = String(originalBody).match(/href=["']([^"']+)["']/i);
  const actionUrl = replaceLegacyBranding(payload.action_url || urlMatch?.[1] || PORTAL_URL);
  let actionLabel = 'View in Black Point Portal';
  if (/training/i.test(subject)) actionLabel = 'Open Training Portal';
  else if (/invoice/i.test(subject)) actionLabel = 'View Invoice';
  else if (/report/i.test(subject)) actionLabel = 'View Report';
  else if (/pto|time off/i.test(subject)) actionLabel = 'View Time-Off Request';
  else if (/schedule|shift/i.test(subject)) actionLabel = 'View Schedule';
  return {
    ...payload,
    from_name: 'Black Point Protection',
    subject,
    body: buildBlackPointEmail({ subject, body: originalBody, actionUrl, actionLabel }),
  };
}
