import { createClientFromRequest } from 'npm:@base44/sdk';

const MANAGEMENT = 'management@blackpointkjc.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const CLIENT = '5cf1a58f-17d1-46d4-a7fd-ff5fcd7624eb';
const TENANT = '07f32330-fc73-4d73-a835-e9c47ba798c7';
const ORIGIN = 'https://bpspf.blackpointkjc.com';

const norm = (v: any) => String(v || '').trim().toLowerCase();
const esc = (v: any) => String(v ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function activeInternalUser(u: any) {
  const roles = new Set([u?.role, ...(u?.additional_roles || [])].map((x: any) => norm(x)).filter(Boolean));
  const type = norm(u?.user_type || u?.account_type || u?.portal_type);
  return Boolean(u?.id && u?.email)
    && !u?.termination_date
    && norm(u?.employment_status) !== 'terminated'
    && u?.disabled !== true
    && u?.active !== false
    && type !== 'client'
    && type !== 'student'
    && !roles.has('client')
    && !roles.has('student');
}

async function graphToken(base44: any) {
  const mailboxes = await base44.asServiceRole.entities.OutlookSharedMailbox.filter({
    mailbox_email: MANAGEMENT,
    active: true,
  }, '-updated_date', 1);
  const mailbox = mailboxes?.[0];
  if (!mailbox) throw new Error('Management Outlook mailbox is not configured.');

  const credentials = await base44.asServiceRole.entities.MicrosoftOAuthCredential.filter({
    user_id: mailbox.user_id,
    active: true,
  }, '-last_refreshed_at', 1);
  const credential = credentials?.[0];
  if (!credential?.refresh_token) throw new Error('Management Outlook authorization is unavailable.');

  const scope = String(credential.scope || 'Mail.Send Mail.Send.Shared User.Read offline_access');
  const response = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    body: new URLSearchParams({
      client_id: CLIENT,
      grant_type: 'refresh_token',
      refresh_token: String(credential.refresh_token),
      scope,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || 'Microsoft token refresh failed.');
  }
  await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(credential.id, {
    refresh_token: String(payload.refresh_token || credential.refresh_token),
    scope: String(payload.scope || scope),
    last_refreshed_at: new Date().toISOString(),
    last_error: '',
    active: true,
  }).catch(() => null);
  return String(payload.access_token);
}

async function recipientAddresses(base44: any) {
  const [users, credentials, preferences] = await Promise.all([
    base44.asServiceRole.entities.User.list(undefined, 5000),
    base44.asServiceRole.entities.MicrosoftOAuthCredential.list('-last_refreshed_at', 5000).catch(() => []),
    base44.asServiceRole.entities.EmailRecipientPreference.list('-updated_date', 5000).catch(() => []),
  ]);

  const workByUserId = new Map<string, string>();
  const workByLogin = new Map<string, string>();
  for (const credential of credentials || []) {
    if (credential?.active === false || !credential?.microsoft_email) continue;
    const work = norm(credential.microsoft_email);
    if (credential.user_id && !workByUserId.has(String(credential.user_id))) workByUserId.set(String(credential.user_id), work);
    if (credential.pathfinder_email && !workByLogin.has(norm(credential.pathfinder_email))) workByLogin.set(norm(credential.pathfinder_email), work);
  }
  const preferredByLogin = new Map<string, string>();
  for (const preference of preferences || []) {
    if (preference?.active === false || !preference?.login_email || !preference?.work_email) continue;
    preferredByLogin.set(norm(preference.login_email), norm(preference.work_email));
  }

  const addresses: string[] = [];
  for (const user of (users || []).filter(activeInternalUser)) {
    const login = norm(user.email);
    const work = preferredByLogin.get(login)
      || workByUserId.get(String(user.id))
      || workByLogin.get(login)
      || login;
    if (work && !addresses.includes(work)) addresses.push(work);
  }
  return addresses;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

type InlinePhoto = { cid: string; contentType: string; contentBytes: string; name: string };

async function preparePhotos(urls: string[]): Promise<InlinePhoto[]> {
  const photos: InlinePhoto[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    const source = String(urls[i] || '').trim();
    if (!source) continue;
    const cid = `bolo-photo-${i + 1}`;
    try {
      if (source.startsWith('data:')) {
        const match = source.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
        if (match) {
          photos.push({ cid, contentType: match[1] || 'image/jpeg', contentBytes: match[2], name: `bolo-photo-${i + 1}.${(match[1] || 'image/jpeg').split('/')[1] || 'jpg'}` });
          continue;
        }
      }
      const response = await fetch(source);
      if (!response.ok) continue;
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      photos.push({ cid, contentType, contentBytes: bytesToBase64(bytes), name: `bolo-photo-${i + 1}.${contentType.split('/')[1] || 'jpg'}` });
    } catch (error) {
      console.warn('BOLO email photo could not be embedded:', source.slice(0, 80), error?.message || error);
    }
  }
  return photos;
}

function buildHtml(b: any, photos: InlinePhoto[]) {
  const parties = b.parties?.length ? b.parties : (b.subject_name ? [{ name: b.subject_name, dob: b.subject_dob, race: b.subject_race, sex: b.subject_sex, height: b.subject_height, weight: b.subject_weight }] : []);
  const vehicles = b.vehicles?.length ? b.vehicles : [];
  const subject = parties.map((p: any) => p.name).filter(Boolean).join(' · ') || 'No person identified';
  const vehicle = vehicles.map((v: any) => [v.year, v.color, v.make, v.model, v.plate && `PLATE ${v.plate}${v.state ? `/${v.state}` : ''}`].filter(Boolean).join(' ')).join(' | ') || 'No vehicle information';
  const partyDetails = parties.map((p: any) => [p.name, p.dob && `DOB ${p.dob}`, p.race && `Race ${p.race}`, p.sex && `Sex ${p.sex}`, p.height && `HT ${p.height}`, p.weight && `WT ${p.weight}`].filter(Boolean).join(' · ')).filter(Boolean);
  const photoCells = photos.map((photo, index) => `<td style="width:50%;padding:6px;vertical-align:middle;text-align:center;background:#080b10;border:1px solid #7f1d1d"><img alt="BOLO photo ${index + 1}" src="cid:${photo.cid}" style="display:block;max-width:100%;width:auto;height:auto;max-height:390px;margin:0 auto"></td>`);
  const photoRows: string[] = [];
  for (let i = 0; i < photoCells.length; i += 2) photoRows.push(`<tr>${photoCells[i]}${photoCells[i + 1] || '<td></td>'}</tr>`);

  return `<!doctype html><html><body style="margin:0;background:#080d15;color:#fff;font-family:Arial,Helvetica,sans-serif"><div style="max-width:900px;margin:0 auto;padding:20px"><div style="border:3px solid #991b1b;border-radius:14px;background:#1a171f;padding:22px"><div style="font-size:25px;font-weight:900;color:#fca5a5;letter-spacing:4px;margin-bottom:20px">⚠ BE ON THE LOOKOUT</div><table width="100%" cellpadding="0" cellspacing="0" style="color:#fff;font-size:13px"><tr><td style="padding-right:10px"><b style="color:#f87171">BOLO / CASE</b><br>${esc(b.bolo_number || 'BOLO')} ${b.case_number ? `· ${esc(b.case_number)}` : ''}</td><td style="padding-right:10px"><b style="color:#f87171">JURISDICTION</b><br>${esc(b.jurisdiction || 'Not listed')}</td><td><b style="color:#f87171">ISSUED BY</b><br>${esc(b.issued_by || 'Black Point Protection')}</td></tr></table><h1 style="font-size:27px;margin:20px 0 14px;color:#fff">${esc(b.title || 'BOLO')}</h1><table width="100%" cellpadding="0" cellspacing="0" style="color:#fff;font-size:14px"><tr><td width="50%" style="padding:7px 12px 7px 0"><b style="color:#f87171">PERSON / SUBJECT</b><br>${esc(subject)}</td><td width="50%" style="padding:7px 0"><b style="color:#f87171">VEHICLE</b><br>${esc(vehicle)}</td></tr><tr><td style="padding:12px 12px 7px 0"><b style="color:#f87171">LAST KNOWN / LAST SEEN</b><br>${esc(b.last_known_location || 'Unknown')}</td><td style="padding:12px 0 7px"><b style="color:#f87171">TRAVEL / DIRECTION</b><br>${esc(b.last_known_direction || 'Unknown')}</td></tr></table>${partyDetails.length ? `<div style="border-top:1px solid #7f1d1d;margin-top:16px;padding-top:13px;font-size:13px"><b style="color:#f87171">IDENTIFIERS</b><br>${partyDetails.map(esc).join('<br>')}</div>` : ''}<div style="border-top:1px solid #7f1d1d;margin-top:16px;padding-top:14px;line-height:1.55;font-size:14px"><b style="color:#fca5a5">DESCRIPTION / NARRATIVE: </b>${esc(b.description || 'No narrative entered')}</div>${b.contact_info || b.linked_call_number || b.linked_incident_report_number ? `<div style="border-top:1px solid #7f1d1d;margin-top:16px;padding-top:13px;font-size:13px">${b.contact_info ? `<b style="color:#f87171">CONTACT:</b> ${esc(b.contact_info)}<br>` : ''}${b.linked_call_number ? `<b style="color:#f87171">CAD:</b> ${esc(b.linked_call_number)}<br>` : ''}${b.linked_incident_report_number ? `<b style="color:#f87171">INCIDENT REPORT:</b> ${esc(b.linked_incident_report_number)}` : ''}</div>` : ''}${photoRows.length ? `<div style="border-top:1px solid #7f1d1d;margin-top:18px;padding-top:14px"><b style="color:#f87171;font-size:13px">PHOTOS / IDENTIFIERS</b><table width="100%" cellpadding="0" cellspacing="8" style="margin-top:8px">${photoRows.join('')}</table></div>` : ''}</div></div></body></html>`;
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { bolo } = await req.json().catch(() => ({}));
    if (!bolo?.id) return Response.json({ error: 'BOLO is required' }, { status: 400 });

    const [accessToken, recipients, photos] = await Promise.all([
      graphToken(base44),
      recipientAddresses(base44),
      preparePhotos(Array.isArray(bolo.photo_urls) ? bolo.photo_urls : []),
    ]);
    const body = buildHtml(bolo, photos);
    const attachments = photos.map(photo => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: photo.name,
      contentType: photo.contentType,
      contentBytes: photo.contentBytes,
      isInline: true,
      contentId: photo.cid,
    }));

    let sent = 0;
    const failures: string[] = [];
    for (const recipient of recipients) {
      try {
        const response = await fetch(`${GRAPH}/users/${encodeURIComponent(MANAGEMENT)}/sendMail`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: `BOLO ALERT — ${bolo.title || bolo.bolo_number || 'Be On The Lookout'}`,
              body: { contentType: 'HTML', content: body },
              from: { emailAddress: { address: MANAGEMENT, name: 'Black Point Management' } },
              toRecipients: [{ emailAddress: { address: recipient } }],
              attachments,
            },
            saveToSentItems: true,
          }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail?.error?.message || `Microsoft Graph ${response.status}`);
        }
        sent += 1;
      } catch (error) {
        failures.push(`${recipient}: ${error?.message || String(error)}`);
      }
    }

    await base44.asServiceRole.entities.BoloEmailAudit2.create({
      bolo_id: String(bolo.id),
      sent,
      failed: failures.length,
      sender: MANAGEMENT,
      sent_at: new Date().toISOString(),
    }).catch(() => null);

    return Response.json({ success: failures.length === 0, sent, failed: failures.length, total: recipients.length, sender: MANAGEMENT, embedded_photos: photos.length, recipients, failures });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});