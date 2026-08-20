const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const MICROSOFT_AUTH_ROOT = 'https://login.microsoftonline.com';
const DEFAULT_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
];

const encoder = new TextEncoder();

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return b64url(bytes).slice(0, length);
}

async function sha256(value) {
  return crypto.subtle.digest('SHA-256', encoder.encode(value));
}

function tokenKey(userId) {
  return `bps:outlook-token:${String(userId || '').trim()}`;
}

function oauthStateKey(userId) {
  return `bps:outlook-oauth:${String(userId || '').trim()}`;
}

export function getMicrosoftClientId() {
  return String(import.meta.env.VITE_MICROSOFT_CLIENT_ID || '').trim();
}

export function getMicrosoftTenant() {
  return String(import.meta.env.VITE_MICROSOFT_TENANT || 'common').trim() || 'common';
}

export function getOutlookRedirectUri() {
  return `${window.location.origin}/OutlookMail`;
}

export function isMicrosoftConfigured() {
  return Boolean(getMicrosoftClientId());
}

export function getStoredOutlookToken(userId) {
  if (!userId) return null;
  try {
    return JSON.parse(localStorage.getItem(tokenKey(userId)) || 'null');
  } catch {
    return null;
  }
}

function storeOutlookToken(userId, tokenResponse, prior = null) {
  const expiresIn = Number(tokenResponse.expires_in || 3600);
  const next = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || prior?.refresh_token || null,
    id_token: tokenResponse.id_token || prior?.id_token || null,
    scope: tokenResponse.scope || prior?.scope || DEFAULT_SCOPES.join(' '),
    token_type: tokenResponse.token_type || 'Bearer',
    expires_at: Date.now() + Math.max(60, expiresIn) * 1000,
    connected_at: prior?.connected_at || new Date().toISOString(),
  };
  localStorage.setItem(tokenKey(userId), JSON.stringify(next));
  return next;
}

export function disconnectOutlook(userId) {
  if (userId) localStorage.removeItem(tokenKey(userId));
}

export async function beginOutlookConnection(userId) {
  const clientId = getMicrosoftClientId();
  if (!clientId) throw new Error('Microsoft 365 has not been configured by the administrator.');
  if (!userId) throw new Error('A Pathfinder user session is required.');

  const verifier = randomString(96);
  const challenge = b64url(await sha256(verifier));
  const nonce = randomString(32);
  const state = randomString(40);
  sessionStorage.setItem(oauthStateKey(userId), JSON.stringify({ verifier, state, nonce, created_at: Date.now() }));

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: getOutlookRedirectUri(),
    response_mode: 'query',
    scope: DEFAULT_SCOPES.join(' '),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  window.location.assign(`${MICROSOFT_AUTH_ROOT}/${encodeURIComponent(getMicrosoftTenant())}/oauth2/v2.0/authorize?${params.toString()}`);
}

export async function handleOutlookOAuthCallback(userId) {
  if (!userId || typeof window === 'undefined') return { handled: false };
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const oauthError = params.get('error');
  if (!code && !oauthError) return { handled: false };

  const savedRaw = sessionStorage.getItem(oauthStateKey(userId));
  let saved = null;
  try { saved = JSON.parse(savedRaw || 'null'); } catch { saved = null; }

  const cleanUrl = `${window.location.origin}${window.location.pathname}`;

  if (oauthError) {
    window.history.replaceState({}, document.title, cleanUrl);
    const detail = params.get('error_description') || oauthError;
    return { handled: true, success: false, error: detail };
  }

  if (!saved?.verifier || !saved?.state || returnedState !== saved.state) {
    window.history.replaceState({}, document.title, cleanUrl);
    return { handled: true, success: false, error: 'The Microsoft sign-in response could not be verified. Please connect again.' };
  }

  const clientId = getMicrosoftClientId();
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getOutlookRedirectUri(),
    code_verifier: saved.verifier,
    scope: DEFAULT_SCOPES.join(' '),
  });

  const response = await fetch(`${MICROSOFT_AUTH_ROOT}/${encodeURIComponent(getMicrosoftTenant())}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  sessionStorage.removeItem(oauthStateKey(userId));
  window.history.replaceState({}, document.title, cleanUrl);
  if (!response.ok || !payload.access_token) {
    return { handled: true, success: false, error: payload.error_description || payload.error || 'Microsoft sign-in failed.' };
  }

  storeOutlookToken(userId, payload);
  return { handled: true, success: true };
}

async function refreshOutlookToken(userId, existing) {
  const clientId = getMicrosoftClientId();
  if (!clientId || !existing?.refresh_token) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: existing.refresh_token,
    scope: DEFAULT_SCOPES.join(' '),
  });
  const response = await fetch(`${MICROSOFT_AUTH_ROOT}/${encodeURIComponent(getMicrosoftTenant())}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    disconnectOutlook(userId);
    return null;
  }
  return storeOutlookToken(userId, payload, existing);
}

export async function getOutlookAccessToken(userId) {
  const existing = getStoredOutlookToken(userId);
  if (!existing?.access_token) return null;
  if (Number(existing.expires_at || 0) > Date.now() + 90_000) return existing.access_token;
  const refreshed = await refreshOutlookToken(userId, existing);
  return refreshed?.access_token || null;
}

export async function graphRequest(userId, pathOrUrl, options = {}) {
  const token = await getOutlookAccessToken(userId);
  if (!token) {
    const error = new Error('Microsoft 365 connection required.');
    error.code = 'OUTLOOK_CONNECTION_REQUIRED';
    throw error;
  }

  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${GRAPH_ROOT}${pathOrUrl}`;
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    const refreshed = await refreshOutlookToken(userId, getStoredOutlookToken(userId));
    if (!refreshed?.access_token) {
      const error = new Error('Microsoft 365 authorization expired. Please reconnect.');
      error.code = 'OUTLOOK_CONNECTION_REQUIRED';
      throw error;
    }
    headers.set('Authorization', `Bearer ${refreshed.access_token}`);
    response = await fetch(url, { ...options, headers });
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Microsoft Graph request failed (${response.status}).`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function getOutlookConnectionStatus(userId) {
  if (!isMicrosoftConfigured()) return { connected: false, configured: false };
  const stored = getStoredOutlookToken(userId);
  if (!stored?.access_token) return { connected: false, configured: true };
  try {
    const profile = await graphRequest(userId, '/me?$select=id,displayName,mail,userPrincipalName');
    return {
      connected: true,
      configured: true,
      profile,
      email: profile?.mail || profile?.userPrincipalName || '',
    };
  } catch (error) {
    if (error.code === 'OUTLOOK_CONNECTION_REQUIRED' || error.status === 401 || error.status === 403) {
      return { connected: false, configured: true, error: error.message };
    }
    throw error;
  }
}

export async function listOutlookFolders(userId) {
  const payload = await graphRequest(userId, '/me/mailFolders?$top=50&$select=id,displayName,totalItemCount,unreadItemCount');
  return payload?.value || [];
}

export async function listOutlookMessages(userId, folderId = 'inbox', nextLink = null) {
  const select = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,body,hasAttachments,conversationId';
  const url = nextLink || `/me/mailFolders/${encodeURIComponent(folderId)}/messages?$top=35&$select=${encodeURIComponent(select)}&$orderby=receivedDateTime desc`;
  const payload = await graphRequest(userId, url);
  return { messages: payload?.value || [], nextLink: payload?.['@odata.nextLink'] || null };
}

export async function getOutlookMessage(userId, messageId) {
  return graphRequest(userId, `/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,body,hasAttachments,conversationId`);
}

export async function getOutlookAttachments(userId, messageId) {
  const payload = await graphRequest(userId, `/me/messages/${encodeURIComponent(messageId)}/attachments?$top=50`);
  return payload?.value || [];
}

function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read attachment.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const contentBytes = value.includes(',') ? value.split(',')[1] : value;
      resolve({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBytes,
      });
    };
    reader.readAsDataURL(file);
  });
}

export async function sendOutlookMail(userId, { to = [], cc = [], bcc = [], subject = '', body = '', attachments = [] }) {
  const graphAttachments = [];
  for (const file of attachments || []) {
    if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name} is larger than the 3 MB quick-attachment limit.`);
    graphAttachments.push(await fileToAttachment(file));
  }
  const recipient = address => ({ emailAddress: { address: String(address).trim() } });
  const message = {
    subject,
    body: { contentType: 'HTML', content: String(body || '').replace(/\n/g, '<br>') },
    toRecipients: to.filter(Boolean).map(recipient),
    ccRecipients: cc.filter(Boolean).map(recipient),
    bccRecipients: bcc.filter(Boolean).map(recipient),
    ...(graphAttachments.length ? { attachments: graphAttachments } : {}),
  };
  await graphRequest(userId, '/me/sendMail', { method: 'POST', body: JSON.stringify({ message, saveToSentItems: true }) });
}

export async function replyOutlookMail(userId, messageId, comment) {
  await graphRequest(userId, `/me/messages/${encodeURIComponent(messageId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ comment: String(comment || '') }),
  });
}

export async function forwardOutlookMail(userId, messageId, to, comment = '') {
  const recipients = to.filter(Boolean).map(address => ({ emailAddress: { address: String(address).trim() } }));
  await graphRequest(userId, `/me/messages/${encodeURIComponent(messageId)}/forward`, {
    method: 'POST',
    body: JSON.stringify({ comment: String(comment || ''), toRecipients: recipients }),
  });
}

export async function setOutlookMessageRead(userId, messageId, isRead = true) {
  return graphRequest(userId, `/me/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  });
}

export async function deleteOutlookMessage(userId, messageId) {
  await graphRequest(userId, `/me/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
}

export async function getLatestUnreadMail(userId) {
  const select = 'id,subject,from,receivedDateTime,isRead,bodyPreview';
  const payload = await graphRequest(userId, `/me/mailFolders/inbox/messages?$top=10&$filter=isRead eq false&$select=${encodeURIComponent(select)}&$orderby=receivedDateTime desc`);
  return payload?.value || [];
}

export function stripHtml(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    return doc.body?.textContent || '';
  } catch {
    return String(html).replace(/<[^>]+>/g, ' ');
  }
}
