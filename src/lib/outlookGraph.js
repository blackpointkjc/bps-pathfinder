import { base44 } from '@/api/base44Client';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const MICROSOFT_AUTH_ROOT = 'https://login.microsoftonline.com';
// Public Microsoft Entra identifiers for the Pathfinder single-tenant SPA.
// These are application identifiers, not secrets.
const PATHFINDER_MICROSOFT_CLIENT_ID = '5cf1a58f-17d1-46d4-a7fd-ff5fcd7624eb';
const PATHFINDER_MICROSOFT_TENANT_ID = '07f32330-fc73-4d73-a835-e9c47ba798c7';
const PATHFINDER_OUTLOOK_REDIRECT_URI = 'https://bpspf.blackpointkjc.com/OutlookMail';
export const DEFAULT_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Mail.ReadWrite.Shared',
  'Mail.Send.Shared',
  'Chat.ReadWrite',
  'Chat.Create',
  'User.ReadBasic.All',
  'ChatMessage.Read',
  'ChatMessage.Send',
  'ChannelMessage.Read.All',
  'ChannelMessage.Send',
];

const encoder = new TextEncoder();
let graphRateLimitUntil = 0;

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

const BUILT_IN_MICROSOFT_CONFIG = Object.freeze({
  id: 'pathfinder-built-in',
  clientId: PATHFINDER_MICROSOFT_CLIENT_ID,
  tenant: PATHFINDER_MICROSOFT_TENANT_ID,
  enabled: true,
  managed: true,
});

export async function getMicrosoftMailConfig() {
  // Pathfinder is a single-tenant internal application. The Entra application
  // identifiers are public identifiers (not secrets), so keep them in the app
  // configuration and avoid a Base44 entity read on every login/notification poll.
  return BUILT_IN_MICROSOFT_CONFIG;
}

export async function saveMicrosoftMailConfig() {
  // Retained for compatibility with older UI code. Configuration is now managed
  // centrally and is intentionally not editable by end users.
  return BUILT_IN_MICROSOFT_CONFIG;
}

export function getOutlookRedirectUri() {
  // Microsoft Entra requires an exact redirect URI match. Base44 preview hosts use
  // temporary preview-sandbox origins that are not (and should not need to be)
  // registered in Entra. Always use Pathfinder's stable production callback URI.
  return PATHFINDER_OUTLOOK_REDIRECT_URI;
}

export function getOutlookRedirectOrigin() {
  return new URL(PATHFINDER_OUTLOOK_REDIRECT_URI).origin;
}

export async function isMicrosoftConfigured() {
  const config = await getMicrosoftMailConfig();
  return Boolean(config?.enabled && config?.clientId);
}

export function getStoredOutlookToken(userId) {
  if (!userId) return null;
  try {
    return JSON.parse(localStorage.getItem(tokenKey(userId)) || 'null');
  } catch {
    return null;
  }
}

export function getMissingMicrosoftScopes(userId, requiredScopes = DEFAULT_SCOPES) {
  const token = getStoredOutlookToken(userId);
  const granted = new Set(String(token?.scope || '').toLowerCase().split(/\s+/).filter(Boolean));
  return (requiredScopes || [])
    .filter(scope => !['openid', 'profile', 'offline_access'].includes(String(scope).toLowerCase()))
    .filter(scope => !granted.has(String(scope).toLowerCase()));
}

function storeOutlookToken(userId, tokenResponse, prior = null) {
  const expiresIn = Number(tokenResponse.expires_in || 3600);
  // The browser keeps only the short-lived access token. The long-lived Microsoft
  // refresh credential is persisted by microsoftOAuthVault and never written to
  // localStorage, so the connection follows the Pathfinder account across devices.
  const next = {
    access_token: tokenResponse.access_token,
    id_token: tokenResponse.id_token || prior?.id_token || null,
    scope: tokenResponse.scope || prior?.scope || DEFAULT_SCOPES.join(' '),
    token_type: tokenResponse.token_type || 'Bearer',
    expires_at: Date.now() + Math.max(60, expiresIn) * 1000,
    connected_at: prior?.connected_at || new Date().toISOString(),
  };
  localStorage.setItem(tokenKey(userId), JSON.stringify(next));
  return next;
}

async function persistOutlookCredential(userId, tokenResponse) {
  if (!userId || !tokenResponse?.refresh_token || !tokenResponse?.access_token) return null;
  const result = await base44.functions.invoke('microsoftOAuthVault', {
    action: 'store',
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    scope: tokenResponse.scope || DEFAULT_SCOPES.join(' '),
  });
  const payload = result?.data || result || {};
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

async function restoreOutlookTokenFromServer(userId) {
  if (!userId) return null;
  const result = await base44.functions.invoke('microsoftOAuthVault', { action: 'restore' });
  const payload = result?.data || result || {};
  if (!payload?.connected || !payload?.access_token) return null;
  return storeOutlookToken(userId, {
    access_token: payload.access_token,
    expires_in: payload.expires_in || 3600,
    scope: payload.scope || DEFAULT_SCOPES.join(' '),
    token_type: 'Bearer',
  }, getStoredOutlookToken(userId));
}

export async function disconnectOutlook(userId) {
  if (userId) localStorage.removeItem(tokenKey(userId));
  if (!userId) return;
  try { await base44.functions.invoke('microsoftOAuthVault', { action: 'disconnect' }); } catch {}
  try {
    const links = await base44.entities.OutlookMailboxLink.filter({ user_id: userId }, '-last_verified_at', 5);
    for (const link of links || []) {
      await base44.entities.OutlookMailboxLink.update(link.id, {
        connected: false,
        disconnected_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      });
    }
  } catch {}
}

export async function beginOutlookConnection(userId) {
  const config = await getMicrosoftMailConfig();
  const clientId = config?.clientId;
  if (!config?.enabled || !clientId) throw new Error('Microsoft 365 has not been configured by the administrator.');
  if (!userId) throw new Error('A Pathfinder user session is required.');

  const verifier = randomString(96);
  const challenge = b64url(await sha256(verifier));
  const nonce = randomString(32);
  const state = randomString(40);
  localStorage.setItem(oauthStateKey(userId), JSON.stringify({ verifier, state, nonce, created_at: Date.now() }));

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

  const authorizeUrl = `${MICROSOFT_AUTH_ROOT}/${encodeURIComponent(config.tenant || 'common')}/oauth2/v2.0/authorize?${params.toString()}`;

  // Base44 Preview renders the app inside an iframe. Microsoft blocks its login
  // page from being embedded, so always launch authentication in a top-level
  // popup/new tab. The callback returns to the Pathfinder origin and shares the
  // same localStorage/session token state with the app.
  const popup = window.open(authorizeUrl, 'pathfinder-microsoft-auth', 'popup=yes,width=620,height=780,resizable=yes,scrollbars=yes');
  if (!popup) {
    throw new Error('Your browser blocked the Microsoft sign-in window. Allow pop-ups for Pathfinder and try again.');
  }
  try { popup.focus(); } catch {}
}

async function completeOutlookOAuthCallback(userId, callback = {}, { cleanBrowserUrl = false } = {}) {
  if (!userId) return { handled: false };
  const code = callback.code || '';
  const returnedState = callback.state || '';
  const oauthError = callback.error || '';
  if (!code && !oauthError) return { handled: false };

  const savedRaw = localStorage.getItem(oauthStateKey(userId));
  let saved = null;
  try { saved = JSON.parse(savedRaw || 'null'); } catch { saved = null; }

  if (cleanBrowserUrl && typeof window !== 'undefined') {
    window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
  }

  if (oauthError) {
    return { handled: true, success: false, error: callback.error_description || oauthError };
  }

  if (!saved?.verifier || !saved?.state || returnedState !== saved.state) {
    return { handled: true, success: false, error: 'The Microsoft sign-in response could not be verified. Please connect again.' };
  }

  const config = await getMicrosoftMailConfig();
  const clientId = config?.clientId;
  if (!clientId) return { handled: true, success: false, error: 'Microsoft mail configuration is missing. Ask an administrator to configure it and try again.' };
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getOutlookRedirectUri(),
    code_verifier: saved.verifier,
    scope: DEFAULT_SCOPES.join(' '),
  });

  const response = await fetch(`${MICROSOFT_AUTH_ROOT}/${encodeURIComponent(config.tenant || 'common')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  localStorage.removeItem(oauthStateKey(userId));
  if (!response.ok || !payload.access_token) {
    return { handled: true, success: false, error: payload.error_description || payload.error || 'Microsoft sign-in failed.' };
  }

  // Persist the refresh credential on the backend before declaring the account
  // connected. This makes the Microsoft link durable across browsers/devices.
  await persistOutlookCredential(userId, payload);
  storeOutlookToken(userId, payload);
  return { handled: true, success: true };
}

export async function handleOutlookOAuthMessage(userId, messageData = {}) {
  if (messageData?.type !== 'bps:outlook-oauth-callback') return { handled: false };
  return completeOutlookOAuthCallback(userId, messageData, { cleanBrowserUrl: false });
}

export async function handleOutlookOAuthCallback(userId) {
  if (!userId || typeof window === 'undefined') return { handled: false };
  const params = new URLSearchParams(window.location.search);
  return completeOutlookOAuthCallback(userId, {
    code: params.get('code') || '',
    state: params.get('state') || '',
    error: params.get('error') || '',
    error_description: params.get('error_description') || '',
  }, { cleanBrowserUrl: true });
}

// When Microsoft redirects to the stable production callback from a Base44 preview
// popup, relay the authorization response back to the preview opener. The preview
// holds the PKCE verifier, so it performs the token exchange there using the same
// stable redirect URI. postMessage is intentionally used instead of touching the
// opener DOM, which is cross-origin in preview mode.
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const hasOAuthResponse = params.has('code') || params.has('error');
    if (hasOAuthResponse && window.opener && window.opener !== window && window.location.origin === getOutlookRedirectOrigin()) {
      window.opener.postMessage({
        type: 'bps:outlook-oauth-callback',
        code: params.get('code') || '',
        state: params.get('state') || '',
        error: params.get('error') || '',
        error_description: params.get('error_description') || '',
      }, '*');
      window.setTimeout(() => window.close(), 500);
    }
  } catch {}
}

async function refreshOutlookToken(userId, existing) {
  try {
    return await restoreOutlookTokenFromServer(userId);
  } catch (error) {
    console.warn('[Outlook] Durable Microsoft token refresh failed:', error?.message);
    return null;
  }
}

export async function getOutlookAccessToken(userId) {
  let existing = getStoredOutlookToken(userId);
  if (!existing?.access_token) {
    existing = await restoreOutlookTokenFromServer(userId).catch(() => null);
    if (!existing?.access_token) return null;
  }
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

  if (graphRateLimitUntil > Date.now()) {
    await new Promise(resolve => window.setTimeout(resolve, graphRateLimitUntil - Date.now()));
  }

  let response = await fetch(url, { ...options, headers });
  if (response.status === 429) {
    const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get('Retry-After') || 3)));
    graphRateLimitUntil = Math.max(graphRateLimitUntil, Date.now() + retryAfter * 1000);
    await new Promise(resolve => window.setTimeout(resolve, retryAfter * 1000));
    response = await fetch(url, { ...options, headers });
  }
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
    const graphCode = payload?.error?.code || '';
    const graphMessage = payload?.error?.message || `Microsoft Graph request failed (${response.status}).`;
    const error = new Error(graphCode ? `${graphCode}: ${graphMessage}` : graphMessage);
    error.status = response.status;
    error.code = graphCode || error.code;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function syncOutlookMailboxLink(userId, pathfinderEmail, profile) {
  const outlookEmail = String(profile?.mail || profile?.userPrincipalName || '').trim().toLowerCase();
  if (!userId || !outlookEmail) return null;
  const now = new Date().toISOString();
  const links = await base44.entities.OutlookMailboxLink.filter({ user_id: userId }, '-last_verified_at', 5);
  const existing = (links || []).find(link => String(link.outlook_email || '').trim().toLowerCase() === outlookEmail) || links?.[0];
  const pathfinderNormalized = String(pathfinderEmail || '').trim().toLowerCase();
  const profileName = profile?.displayName || '';
  const microsoftUserId = profile?.id || '';

  // Verification runs frequently for notifications. Do not write the same mailbox
  // mapping over and over; only persist when identity/connection data changed or
  // the durable verification timestamp is more than 6 hours old.
  const lastVerifiedMs = existing?.last_verified_at ? new Date(existing.last_verified_at).getTime() : 0;
  const staleVerification = !Number.isFinite(lastVerifiedMs) || Date.now() - lastVerifiedMs > 6 * 60 * 60 * 1000;
  const changed = !existing
    || String(existing.pathfinder_email || '').trim().toLowerCase() !== pathfinderNormalized
    || String(existing.outlook_email || '').trim().toLowerCase() !== outlookEmail
    || String(existing.outlook_display_name || '') !== profileName
    || String(existing.microsoft_user_id || '') !== microsoftUserId
    || existing.connected !== true;

  const payload = {
    user_id: userId,
    pathfinder_email: pathfinderNormalized,
    outlook_email: outlookEmail,
    outlook_display_name: profileName,
    microsoft_user_id: microsoftUserId,
    connected: true,
    connected_at: existing?.connected_at || now,
    last_verified_at: changed || staleVerification ? now : existing?.last_verified_at,
    disconnected_at: null,
  };

  let durableLink;
  if (existing?.id) {
    if (changed || staleVerification) await base44.entities.OutlookMailboxLink.update(existing.id, payload);
    if (changed) {
      for (const duplicate of (links || []).filter(link => link.id !== existing.id)) {
        if (duplicate.connected !== false) await base44.entities.OutlookMailboxLink.update(duplicate.id, { connected: false, disconnected_at: now });
      }
    }
    durableLink = { ...existing, ...payload };
  } else {
    durableLink = await base44.entities.OutlookMailboxLink.create(payload);
  }

  // Keep a credential-free directory mapping for Teams routing. This contains no
  // access/refresh token and lets Pathfinder resolve a private-message recipient
  // even when their Pathfinder login email differs from Microsoft 365.
  try {
    const identities = await base44.entities.MicrosoftTeamsIdentity.filter({ user_id: userId }, '-updated_at', 5);
    const identityPayload = {
      user_id: userId,
      pathfinder_email: pathfinderNormalized,
      microsoft_email: outlookEmail,
      microsoft_user_id: microsoftUserId,
      display_name: profileName,
      active: true,
      updated_at: now,
    };
    if (identities?.[0]?.id) {
      await base44.entities.MicrosoftTeamsIdentity.update(identities[0].id, identityPayload);
    } else {
      await base44.entities.MicrosoftTeamsIdentity.create(identityPayload);
    }
  } catch (error) {
    console.warn('[Teams] Unable to refresh Microsoft identity directory:', error?.message);
  }
  return durableLink;
}

export async function getOutlookConnectionStatus(userId, pathfinderEmail = '') {
  const config = await getMicrosoftMailConfig();
  if (!config?.enabled || !config?.clientId) return { connected: false, configured: false, config };
  let stored = getStoredOutlookToken(userId);
  if (!stored?.access_token) {
    stored = await restoreOutlookTokenFromServer(userId).catch(() => null);
  }
  if (!stored?.access_token) {
    let savedLink = null;
    try {
      const links = await base44.entities.OutlookMailboxLink.filter({ user_id: userId, connected: true }, '-last_verified_at', 1);
      savedLink = links?.[0] || null;
    } catch {}
    return { connected: false, configured: true, savedLink };
  }
  try {
    const profile = await graphRequest(userId, '/me?$select=id,displayName,mail,userPrincipalName');
    const mailboxLink = await syncOutlookMailboxLink(userId, pathfinderEmail, profile).catch(() => null);
    return {
      connected: true,
      configured: true,
      profile,
      mailboxLink,
      email: profile?.mail || profile?.userPrincipalName || '',
      pathfinderEmail: String(pathfinderEmail || '').trim(),
    };
  } catch (error) {
    if (error.code === 'OUTLOOK_CONNECTION_REQUIRED' || error.status === 401 || error.status === 403) {
      return { connected: false, configured: true, error: error.message };
    }
    throw error;
  }
}

function mailboxRoot(mailboxEmail = '') {
  const clean = String(mailboxEmail || '').trim();
  return clean ? `/users/${encodeURIComponent(clean)}` : '/me';
}

export async function listOutlookFolders(userId, mailboxEmail = '') {
  const payload = await graphRequest(userId, `${mailboxRoot(mailboxEmail)}/mailFolders?$top=50&$select=id,displayName,totalItemCount,unreadItemCount`);
  return payload?.value || [];
}

export async function listOutlookMessages(userId, folderId = 'inbox', nextLink = null, mailboxEmail = '') {
  const select = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,body,hasAttachments,conversationId';
  const url = nextLink || `${mailboxRoot(mailboxEmail)}/mailFolders/${encodeURIComponent(folderId)}/messages?$top=35&$select=${encodeURIComponent(select)}&$orderby=receivedDateTime desc`;
  const payload = await graphRequest(userId, url);
  return { messages: payload?.value || [], nextLink: payload?.['@odata.nextLink'] || null };
}

export async function getOutlookMessage(userId, messageId, mailboxEmail = '') {
  return graphRequest(userId, `${mailboxRoot(mailboxEmail)}/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,body,hasAttachments,conversationId`);
}

export async function getOutlookAttachments(userId, messageId, mailboxEmail = '') {
  const payload = await graphRequest(userId, `${mailboxRoot(mailboxEmail)}/messages/${encodeURIComponent(messageId)}/attachments?$top=50`);
  return payload?.value || [];
}

export async function verifySharedMailboxAccess(userId, mailboxEmail) {
  const clean = String(mailboxEmail || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) throw new Error('Enter a valid shared mailbox email address.');

  // Ask Microsoft directly instead of blocking based on the locally cached scope string.
  // This avoids false negatives after an administrator changes delegated permissions.
  const inbox = await graphRequest(userId, `/users/${encodeURIComponent(clean)}/mailFolders/inbox?$select=id,displayName,totalItemCount,unreadItemCount`);
  return {
    id: '',
    displayName: clean,
    email: clean,
    inbox,
  };
}

export async function listSavedSharedMailboxes(userId) {
  if (!userId) return [];
  return base44.entities.OutlookSharedMailbox.filter({ user_id: userId, active: true }, '-last_used_at', 50);
}

export async function saveSharedMailbox(userId, pathfinderEmail, mailbox) {
  const email = String(mailbox?.email || '').trim().toLowerCase();
  if (!userId || !email) throw new Error('Shared mailbox information is incomplete.');
  const rows = await base44.entities.OutlookSharedMailbox.filter({ user_id: userId, mailbox_email: email }, '-updated_date', 1);
  const existing = rows?.[0] || null;
  const status = mailbox?.connectionStatus || (mailbox?.inbox ? 'verified' : 'pending');
  const payload = {
    user_id: userId,
    pathfinder_email: String(pathfinderEmail || '').trim().toLowerCase(),
    mailbox_email: email,
    display_name: mailbox?.displayName || existing?.display_name || email,
    microsoft_user_id: mailbox?.id || existing?.microsoft_user_id || '',
    active: true,
    connection_status: status,
    last_error: String(mailbox?.lastError || ''),
    verified_at: status === 'verified' ? new Date().toISOString() : (existing?.verified_at || null),
    last_used_at: new Date().toISOString(),
  };
  if (existing?.id) {
    await base44.entities.OutlookSharedMailbox.update(existing.id, payload);
    return { ...existing, ...payload };
  }
  return base44.entities.OutlookSharedMailbox.create(payload);
}

export async function renameSharedMailbox(linkId, displayName) {
  const clean = String(displayName || '').trim();
  if (!linkId) throw new Error('Shared mailbox link is missing.');
  if (!clean) throw new Error('Enter a mailbox display name.');
  await base44.entities.OutlookSharedMailbox.update(linkId, {
    display_name: clean,
    last_used_at: new Date().toISOString(),
  });
  return { id: linkId, display_name: clean };
}

export async function removeSharedMailbox(linkId) {
  if (!linkId) return;
  await base44.entities.OutlookSharedMailbox.update(linkId, { active: false });
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

export async function sendOutlookMail(userId, { to = [], cc = [], bcc = [], subject = '', body = '', attachments = [], mailboxEmail = '' }) {
  const graphAttachments = [];
  for (const file of attachments || []) {
    if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name} is larger than the 3 MB quick-attachment limit.`);
    graphAttachments.push(await fileToAttachment(file));
  }
  const recipient = address => ({ emailAddress: { address: String(address).trim() } });
  const sharedFrom = String(mailboxEmail || '').trim();
  const message = {
    subject,
    body: { contentType: 'HTML', content: String(body || '').replace(/\n/g, '<br>') },
    toRecipients: to.filter(Boolean).map(recipient),
    ccRecipients: cc.filter(Boolean).map(recipient),
    bccRecipients: bcc.filter(Boolean).map(recipient),
    ...(sharedFrom ? { from: { emailAddress: { address: sharedFrom } } } : {}),
    ...(graphAttachments.length ? { attachments: graphAttachments } : {}),
  };

  // For delegated shared-mail sending Microsoft requires the message.from property.
  // Use /me/sendMail for shared mailboxes so Send As / Send on Behalf can be honored
  // without additionally requiring Full Access just to submit the message. The shared
  // mailbox still needs the Exchange Send As or Send on Behalf right.
  const endpoint = sharedFrom ? '/me/sendMail' : '/me/sendMail';
  await graphRequest(userId, endpoint, { method: 'POST', body: JSON.stringify({ message, saveToSentItems: true }) });
}

export async function replyOutlookMail(userId, messageId, comment, mailboxEmail = '') {
  await graphRequest(userId, `${mailboxRoot(mailboxEmail)}/messages/${encodeURIComponent(messageId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ comment: String(comment || '') }),
  });
}

export async function forwardOutlookMail(userId, messageId, to, comment = '', mailboxEmail = '') {
  const recipients = to.filter(Boolean).map(address => ({ emailAddress: { address: String(address).trim() } }));
  await graphRequest(userId, `${mailboxRoot(mailboxEmail)}/messages/${encodeURIComponent(messageId)}/forward`, {
    method: 'POST',
    body: JSON.stringify({ comment: String(comment || ''), toRecipients: recipients }),
  });
}

export async function setOutlookMessageRead(userId, messageId, isRead = true, mailboxEmail = '') {
  return graphRequest(userId, `${mailboxRoot(mailboxEmail)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  });
}

export async function deleteOutlookMessage(userId, messageId, mailboxEmail = '') {
  await graphRequest(userId, `${mailboxRoot(mailboxEmail)}/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
}

export async function getLatestUnreadMail(userId, mailboxEmail = '') {
  const select = 'id,subject,from,receivedDateTime,isRead,bodyPreview';
  const payload = await graphRequest(userId, `${mailboxRoot(mailboxEmail)}/mailFolders/inbox/messages?$top=10&$filter=isRead eq false&$select=${encodeURIComponent(select)}&$orderby=receivedDateTime desc`);
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
