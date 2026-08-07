const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/857a5f1c1_UntitledProject3.png';
const PORTAL_URL = 'https://bpspf.blackpointkjc.com/';
const TEMPLATE_MARKER = 'BLACK_POINT_STANDARD_EMAIL';

const replaceLegacyBranding = value => String(value ?? '')
  .replace(/virtusconnect\.base44\.app/gi, 'bpspf.blackpointkjc.com')
  .replace(/pathfinderbps\.base44\.app/gi, 'bpspf.blackpointkjc.com')
  .replace(/BPSConnect\.net/gi, 'bpspf.blackpointkjc.com');

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const escapeAttribute = value => escapeHtml(value);

const plainToHtml = text => replaceLegacyBranding(text)
  .split(/\n{2,}/)
  .map(block => `<p style="margin:0 0 16px;color:#d7d7d7;font-size:16px;line-height:1.65;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
  .join('');

/**
 * Removes page-specific email themes (blue/green/purple cards, gradients, etc.)
 * while preserving the actual message structure. This makes the shared Black Point
 * shell the only visual email theme used by the app.
 */
function normalizeHtmlContent(value) {
  let html = replaceLegacyBranding(value);

  // If a caller supplied a complete HTML document, keep only its message body.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) html = bodyMatch[1];

  html = html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--(?!\s*BLACK_POINT_STANDARD_EMAIL)[\s\S]*?-->/g, '')
    // Strip old visual themes and unsafe event attributes. The Black Point shell
    // below is the single source of truth for email styling.
    .replace(/\sstyle=("[^"]*"|'[^']*')/gi, '')
    .replace(/\sclass=("[^"]*"|'[^']*')/gi, '')
    .replace(/\sbgcolor=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\son[a-z]+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Apply the same Black Point typography and content styling to legacy HTML.
  html = html
    .replace(/<h2([^>]*)>/gi, '<h2$1 style="margin:0 0 16px;color:#ffffff;font-size:22px;line-height:1.3;">')
    .replace(/<h1([^>]*)>/gi, '<h2$1 style="margin:0 0 16px;color:#ffffff;font-size:22px;line-height:1.3;">')
    .replace(/<\/h1>/gi, '</h2>')
    .replace(/<h3([^>]*)>/gi, '<h3$1 style="margin:18px 0 10px;color:#ffffff;font-size:18px;line-height:1.4;">')
    .replace(/<p([^>]*)>/gi, '<p$1 style="margin:0 0 16px;color:#d7d7d7;font-size:16px;line-height:1.65;">')
    .replace(/<a([^>]*)>/gi, '<a$1 style="color:#e5c75b;text-decoration:underline;">')
    .replace(/<strong([^>]*)>/gi, '<strong$1 style="color:#ffffff;font-weight:700;">')
    .replace(/<li([^>]*)>/gi, '<li$1 style="margin:0 0 8px;color:#d7d7d7;font-size:16px;line-height:1.55;">')
    .replace(/<table([^>]*)>/gi, '<table$1 style="width:100%;border-collapse:collapse;margin:16px 0;background-color:#202020;">')
    .replace(/<th([^>]*)>/gi, '<th$1 style="padding:10px 12px;border:1px solid #3a3a3a;color:#ffffff;text-align:left;font-size:14px;line-height:1.4;">')
    .replace(/<td([^>]*)>/gi, '<td$1 style="padding:10px 12px;border:1px solid #3a3a3a;color:#d7d7d7;font-size:14px;line-height:1.5;">')
    .replace(/<hr([^>]*)>/gi, '<hr$1 style="border:0;border-top:1px solid #3a3a3a;margin:22px 0;">');

  return html;
}

function prepareContent(body) {
  const cleaned = replaceLegacyBranding(body);
  if (!/<\/?[a-z][\s\S]*>/i.test(cleaned)) return plainToHtml(cleaned);
  return normalizeHtmlContent(cleaned);
}

export function buildBlackPointEmail({
  subject = 'Black Point Notification',
  body = '',
  actionUrl = PORTAL_URL,
  actionLabel = 'View in Black Point Portal',
} = {}) {
  const cleanSubject = replaceLegacyBranding(subject);
  const safeSubject = escapeHtml(cleanSubject);
  const inner = prepareContent(body);
  const normalizedUrl = replaceLegacyBranding(actionUrl || PORTAL_URL);
  const resolvedUrl = normalizedUrl.startsWith('/')
    ? `${PORTAL_URL.replace(/\/$/, '')}${normalizedUrl}`
    : normalizedUrl;
  const safeUrl = escapeAttribute(resolvedUrl);
  const safeLabel = escapeHtml(replaceLegacyBranding(actionLabel || 'View in Black Point Portal'));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;">
  <!-- ${TEMPLATE_MARKER} -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safeSubject}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#0b0b0b;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background-color:#151515;border:1px solid #caa72d;border-radius:14px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:30px 24px 20px;background-color:#050505;">
              <img src="${LOGO_URL}" alt="Black Point" width="210" style="display:block;width:210px;max-width:75%;height:auto;border:0;">
            </td>
          </tr>
          <tr><td style="height:5px;line-height:5px;font-size:0;background-color:#d4af37;">&nbsp;</td></tr>
          <tr>
            <td style="padding:34px 38px 12px;">
              <h1 style="margin:0 0 22px;color:#ffffff;font-size:28px;line-height:1.25;text-align:center;">${safeSubject}</h1>
              <div style="font-size:16px;color:#d7d7d7;line-height:1.65;">${inner}</div>
            </td>
          </tr>
          ${safeUrl ? `<tr>
            <td style="padding:10px 38px 8px;text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 22px;">
                <tr><td align="center" bgcolor="#d4af37" style="border-radius:6px;"><a href="${safeUrl}" target="_blank" style="display:inline-block;padding:15px 30px;color:#090909;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;">${safeLabel}</a></td></tr>
              </table>
              <p style="margin:0 0 18px;color:#bdbdbd;font-size:14px;line-height:1.65;text-align:center;">Portal address:<br><a href="${safeUrl}" style="color:#e5c75b;text-decoration:underline;">${safeUrl}</a></p>
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:24px 38px 34px;">
              <p style="margin:0 0 6px;color:#ffffff;font-size:16px;font-weight:bold;">Black Point</p>
              <p style="margin:0;color:#bdbdbd;font-size:14px;line-height:1.6;">701 E Franklin St, Suite 105 1052<br>Richmond, Virginia 23219<br><a href="mailto:info@blackpointkjc.com" style="color:#e5c75b;text-decoration:none;">info@blackpointkjc.com</a><br><a href="tel:+18558277911" style="color:#e5c75b;text-decoration:none;">(855) 8BPS911</a></p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 24px;background-color:#050505;border-top:1px solid #292929;">
              <p style="margin:0 0 8px;color:#8f8f8f;font-size:12px;line-height:1.5;">Need more information? Visit our main website.</p>
              <p style="margin:0;"><a href="https://home.blackpointkjc.com/" target="_blank" style="color:#d4af37;font-size:13px;text-decoration:underline;">home.blackpointkjc.com</a></p>
              <p style="margin:14px 0 0;color:#666666;font-size:11px;">© ${new Date().getFullYear()} Black Point. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function brandEmailPayload(payload = {}) {
  const subject = replaceLegacyBranding(payload.subject || 'Black Point Notification');
  const originalBody = payload.body || payload.html || '';
  const alreadyBranded = String(originalBody).includes(TEMPLATE_MARKER);
  const urlMatch = String(originalBody).match(/href=["']([^"']+)["']/i);
  const actionUrl = replaceLegacyBranding(payload.action_url || urlMatch?.[1] || PORTAL_URL);

  let actionLabel = payload.action_label || 'View in Black Point Portal';
  if (!payload.action_label && /trespass/i.test(subject)) actionLabel = 'Open Trespass Management';
  else if (!payload.action_label && /training/i.test(subject)) actionLabel = 'Open Training Portal';
  else if (!payload.action_label && /invoice/i.test(subject)) actionLabel = 'View Invoice';
  else if (!payload.action_label && /report/i.test(subject)) actionLabel = 'View Report';
  else if (!payload.action_label && /pto|time off/i.test(subject)) actionLabel = 'View Time-Off Request';
  else if (!payload.action_label && /schedule|shift/i.test(subject)) actionLabel = 'View Schedule';
  else if (!payload.action_label && /performance review/i.test(subject)) actionLabel = 'View Performance Review';

  // action_url/action_label/html are internal rendering helpers only. Do not pass
  // unsupported fields through to Base44's SendEmail integration.
  const { action_url, action_label, html, ...sendablePayload } = payload;

  return {
    ...sendablePayload,
    from_name: 'Black Point Protection',
    subject,
    body: alreadyBranded
      ? originalBody
      : buildBlackPointEmail({ subject, body: originalBody, actionUrl, actionLabel }),
  };
}
