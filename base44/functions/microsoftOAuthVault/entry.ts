import { createClientFromRequest } from 'npm:@base44/sdk';

const CLIENT_ID = '5cf1a58f-17d1-46d4-a7fd-ff5fcd7624eb';
const TENANT_ID = '07f32330-fc73-4d73-a835-e9c47ba798c7';
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const GRAPH_ME = 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName';
const DEFAULT_SCOPE = [
  'openid','profile','offline_access','User.Read','Mail.ReadWrite','Mail.Send',
  'Mail.ReadWrite.Shared','Mail.Send.Shared','Chat.ReadWrite','Chat.Create',
  'User.ReadBasic.All','ChatMessage.Read','ChatMessage.Send','ChannelMessage.Read.All','ChannelMessage.Send'
].join(' ');

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

async function graphProfile(accessToken: string) {
  const response = await fetch(GRAPH_ME, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error(payload?.error?.message || 'Microsoft profile verification failed.');
  return payload;
}

async function refresh(refreshToken: string, scope = DEFAULT_SCOPE) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: scope || DEFAULT_SCOPE,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) throw new Error(payload?.error_description || payload?.error || 'Microsoft authorization could not be refreshed.');
  return payload;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller?.id) return json({ error: 'Authentication required.' }, 401);

    const input = await req.json().catch(() => ({}));
    const action = String(input?.action || 'restore');
    const rows = await base44.asServiceRole.entities.MicrosoftOAuthCredential.filter({ user_id: caller.id }, '-updated_date', 5).catch(() => []);
    const current = (rows || []).find((row: any) => row.active !== false) || rows?.[0] || null;

    if (action === 'disconnect') {
      for (const row of rows || []) {
        if (row.active !== false) await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(row.id, { active: false, last_error: '', last_refreshed_at: new Date().toISOString() });
      }
      return json({ ok: true });
    }

    if (action === 'store') {
      const refreshToken = String(input?.refresh_token || '');
      const accessToken = String(input?.access_token || '');
      if (!refreshToken || !accessToken) return json({ error: 'Microsoft returned an incomplete authorization response.' }, 400);
      const profile = await graphProfile(accessToken);
      const microsoftEmail = String(profile.mail || profile.userPrincipalName || '').trim().toLowerCase();
      if (!microsoftEmail) return json({ error: 'Microsoft account email could not be verified.' }, 400);

      const now = new Date().toISOString();
      const payload = {
        user_id: caller.id,
        pathfinder_email: String(caller.email || '').trim().toLowerCase(),
        microsoft_email: microsoftEmail,
        microsoft_user_id: String(profile.id || ''),
        display_name: String(profile.displayName || ''),
        refresh_token: refreshToken,
        scope: String(input?.scope || DEFAULT_SCOPE),
        active: true,
        connected_at: current?.connected_at || now,
        last_refreshed_at: now,
        last_error: '',
      };
      if (current?.id) await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(current.id, payload);
      else await base44.asServiceRole.entities.MicrosoftOAuthCredential.create(payload);
      for (const duplicate of (rows || []).filter((row: any) => row.id !== current?.id)) {
        if (duplicate.active !== false) await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(duplicate.id, { active: false });
      }
      return json({ ok: true, profile, microsoft_email: microsoftEmail });
    }

    if (!current?.refresh_token || current.active === false) return json({ connected: false }, 200);

    try {
      const token = await refresh(String(current.refresh_token), String(current.scope || DEFAULT_SCOPE));
      const profile = await graphProfile(token.access_token);
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(current.id, {
        refresh_token: token.refresh_token || current.refresh_token,
        scope: token.scope || current.scope || DEFAULT_SCOPE,
        microsoft_email: String(profile.mail || profile.userPrincipalName || current.microsoft_email || '').trim().toLowerCase(),
        microsoft_user_id: String(profile.id || current.microsoft_user_id || ''),
        display_name: String(profile.displayName || current.display_name || ''),
        active: true,
        last_refreshed_at: now,
        last_error: '',
      });
      return json({
        connected: true,
        access_token: token.access_token,
        expires_in: Number(token.expires_in || 3600),
        scope: token.scope || current.scope || DEFAULT_SCOPE,
        profile,
      });
    } catch (error) {
      await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(current.id, {
        active: false,
        last_error: error?.message || 'Microsoft refresh failed.',
        last_refreshed_at: new Date().toISOString(),
      }).catch(() => null);
      return json({ connected: false, error: error?.message || 'Microsoft authorization expired.' }, 200);
    }
  } catch (error) {
    console.error('microsoftOAuthVault error', error);
    return json({ error: error?.message || 'Microsoft credential service failed.' }, 500);
  }
});