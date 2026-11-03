const LOGO_URL = 'https://bpspf.blackpointkjc.com/black-point-shield.webp';
const PORTAL_URL = 'https://bpspf.blackpointkjc.com/';
const TEMPLATE_MARKER = 'BLACK_POINT_STANDARD_EMAIL';

const safe = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const replaceLegacy = (value: unknown) => String(value ?? '')
  .replace(/virtusconnect\.base44\.app/gi, 'bpspf.blackpointkjc.com')
  .replace(/pathfinderbps\.base44\.app/gi, 'bpspf.blackpointkjc.com')
  .replace(/BPSConnect\.net/gi, 'bpspf.blackpointkjc.com');

function normalizeHtml(value: unknown) {
  let html = replaceLegacy(value);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) html = bodyMatch[1];
  html = html
    .replace(/<!doctype[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\sstyle=("[^"]*"|'[^']*')/gi, '').replace(/\sclass=("[^"]*"|'[^']*')/gi, '')
    .replace(/\sbgcolor=("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\son[a-z]+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return html
    .replace(/<h1([^>]*)>/gi, '<h2$1 style="margin:0 0 16px;color:#fff;font-size:22px;line-height:1.3;">').replace(/<\/h1>/gi, '</h2>')
    .replace(/<h2([^>]*)>/gi, '<h2$1 style="margin:0 0 16px;color:#fff;font-size:22px;line-height:1.3;">')
    .replace(/<h3([^>]*)>/gi, '<h3$1 style="margin:18px 0 10px;color:#fff;font-size:18px;line-height:1.4;">')
    .replace(/<p([^>]*)>/gi, '<p$1 style="margin:0 0 16px;color:#d7d7d7;font-size:16px;line-height:1.65;">')
    .replace(/<a([^>]*)>/gi, '<a$1 style="color:#e5c75b;text-decoration:underline;">')
    .replace(/<strong([^>]*)>/gi, '<strong$1 style="color:#fff;font-weight:700;">')
    .replace(/<li([^>]*)>/gi, '<li$1 style="margin:0 0 8px;color:#d7d7d7;font-size:16px;line-height:1.55;">')
    .replace(/<table([^>]*)>/gi, '<table$1 style="width:100%;border-collapse:collapse;margin:16px 0;background:#202020;">')
    .replace(/<th([^>]*)>/gi, '<th$1 style="padding:10px 12px;border:1px solid #3a3a3a;color:#fff;text-align:left;font-size:14px;">')
    .replace(/<td([^>]*)>/gi, '<td$1 style="padding:10px 12px;border:1px solid #3a3a3a;color:#d7d7d7;font-size:14px;line-height:1.5;">');
}

function contentHtml(body: unknown) {
  const value = replaceLegacy(body);
  if (!/<\/?[a-z][\s\S]*>/i.test(value)) {
    return value.split(/\n{2,}/).map(block => `<p style="margin:0 0 16px;color:#d7d7d7;font-size:16px;line-height:1.65;">${safe(block).replace(/\n/g, '<br>')}</p>`).join('');
  }
  return normalizeHtml(value);
}

export function blackPointEmail(subject: string, content: string, actionLabel = 'View in Black Point Portal', actionUrl = PORTAL_URL) {
  const cleanSubject = replaceLegacy(subject || 'Black Point Notification');
  const normalizedUrl = replaceLegacy(actionUrl || PORTAL_URL);
  const resolvedUrl = normalizedUrl.startsWith('/') ? `${PORTAL_URL.replace(/\/$/, '')}${normalizedUrl}` : normalizedUrl;
  const inner = String(content || '').includes(TEMPLATE_MARKER) ? content : contentHtml(content);
  const year = new Date().getFullYear();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${safe(cleanSubject)}</title></head><body style="margin:0;padding:0;background-color:#07101a;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;"><!-- ${TEMPLATE_MARKER} --><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#07101a;"><tr><td align="center" style="padding:22px 10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background-color:#0d1623;border:1px solid #23324a;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.28);"><tr><td style="padding:18px 24px;background-color:#08111d;border-bottom:1px solid #23324a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td valign="middle"><img src="${LOGO_URL}" alt="Black Point" width="86" style="display:block;width:86px;max-width:30vw;height:auto;border:0;background:transparent;"></td><td align="right" valign="middle" style="font-size:10px;line-height:1.3;letter-spacing:.12em;text-transform:uppercase;color:#6f8099;">BLACK POINT<br><span style="color:#d4af37;">PATHFINDER</span></td></tr></table></td></tr><tr><td style="padding:24px 26px 8px;"><div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7d8da5;">Company Communication</div><h1 style="margin:6px 0 18px;color:#ffffff;font-size:22px;line-height:1.25;text-align:left;">${safe(cleanSubject)}</h1><div style="color:#d7d7d7;font-size:15px;line-height:1.6;">${inner}</div></td></tr><tr><td align="left" style="padding:8px 26px 22px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 12px;"><tr><td align="center" bgcolor="#d4af37" style="border-radius:9px;"><a href="${safe(resolvedUrl)}" target="_blank" style="display:inline-block;padding:12px 20px;color:#090909;font-size:14px;font-weight:800;text-decoration:none;border-radius:9px;">${safe(actionLabel)}</a></td></tr></table><p style="margin:0;color:#697a92;font-size:11px;line-height:1.5;">Pathfinder: <a href="${safe(resolvedUrl)}" style="color:#c9ad48;text-decoration:none;">${safe(resolvedUrl)}</a></p></td></tr><tr><td style="padding:18px 26px;background-color:#08111d;border-top:1px solid #23324a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td valign="top" style="color:#8090a8;font-size:11px;line-height:1.55;"><strong style="color:#d5dce6;">Black Point Protection</strong><br>701 E Franklin St, Suite 105 1052 · Richmond, VA 23219<br><a href="mailto:info@blackpointkjc.com" style="color:#c9ad48;text-decoration:none;">info@blackpointkjc.com</a> · <a href="tel:+18558277911" style="color:#c9ad48;text-decoration:none;">(855) 8BPS911</a></td><td align="right" valign="bottom" style="color:#58687d;font-size:10px;line-height:1.45;">© ${year} Black Point<br><a href="https://home.blackpointkjc.com/" target="_blank" style="color:#8d7a38;text-decoration:none;">home.blackpointkjc.com</a></td></tr></table></td></tr></table></td></tr></table></body></html>`;
}

export function brandedPayload(payload: any = {}) {
  const subject = replaceLegacy(payload.subject || 'Black Point Notification');
  let actionLabel = payload.action_label || 'View in Black Point Portal';
  if (!payload.action_label && /schedule|shift/i.test(subject)) actionLabel = 'View Schedule';
  else if (!payload.action_label && /training/i.test(subject)) actionLabel = 'Open Training Portal';
  else if (!payload.action_label && /invoice/i.test(subject)) actionLabel = 'View Invoice';
  else if (!payload.action_label && /report/i.test(subject)) actionLabel = 'View Report';
  else if (!payload.action_label && /pto|time off/i.test(subject)) actionLabel = 'View Time-Off Request';
  const { action_url, action_label, html, ...rest } = payload;
  return {
    ...rest,
    from_name: 'Black Point Protection',
    subject,
    body: blackPointEmail(subject, payload.body || payload.html || '', actionLabel, payload.action_url || PORTAL_URL),
  };
}