const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/857a5f1c1_UntitledProject3.png';
const PORTAL_URL = 'https://pathfinderbps.base44.app';

const replaceLegacyBranding = value => String(value || '')
  .replace(/Black Point Portal/gi, 'Black Point Portal')
  .replace(/Black Point Protection Services/gi, 'Black Point Protection Services')
  .replace(/Black Point Protection/gi, 'Black Point Protection')
  .replace(/Black Point Portal/gi, 'Black Point Portal')
  .replace(/virtusconnect\.base44\.app/gi, 'pathfinderbps.base44.app');

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
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#111827;border:1px solid #374151;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.45);">
        <tr><td style="padding:30px 34px 22px;text-align:center;background:#080d16;border-bottom:3px solid #c9a227;">
          <img src="${LOGO_URL}" alt="Black Point Protection" width="92" style="display:block;margin:0 auto 14px;max-width:92px;height:auto;">
          <div style="font-size:21px;font-weight:800;letter-spacing:2px;color:#ffffff;">BLACK POINT PROTECTION</div>
          <div style="margin-top:6px;font-size:11px;letter-spacing:2px;color:#c9a227;">BPS PATHFINDER · UNIFIED OPERATIONS PLATFORM</div>
        </td></tr>
        <tr><td style="padding:32px 34px 10px;"><h1 style="margin:0 0 20px;font-size:25px;line-height:1.25;color:#ffffff;">${cleanSubject}</h1><div style="font-size:15px;color:#e5e7eb;">${inner}</div></td></tr>
        ${safeUrl ? `<tr><td style="padding:12px 34px 34px;text-align:center;"><a href="${safeUrl}" style="display:inline-block;background:#c9a227;color:#090909;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:9px;">${safeLabel}</a></td></tr>` : ''}
        <tr><td style="padding:20px 34px;background:#080d16;border-top:1px solid #374151;text-align:center;color:#9ca3af;font-size:12px;line-height:1.6;">Black Point Protection Services<br>BPS Pathfinder · Secure Company Communication</td></tr>
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
