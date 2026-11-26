// Shared portal-session verification for Pathfinder backend functions.
//
// A portal session is bound to the signed-in account, not to one exact access
// token string: the platform rotates access tokens during a live session, and a
// rotating token used to look like a signed-out session (401) even though the
// operator never left their desk.
//
// States returned:
//   'current'  the token belongs to a live portal session for this account
//   'invalid'  the account has no live portal session (revoked, expired, or superseded)
//   'unknown'  the session store could not be read; callers keep working and the
//              next request verifies again instead of ending a valid session
export const PORTAL_REAUTH_AFTER = '2026-11-01T22:38:04.000Z';
const IDLE_MS = 13 * 60 * 60 * 1000;
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

const digest = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
  .map(value => value.toString(16).padStart(2, '0')).join('');

const bearer = (request: any) => String(
  request?.headers?.get?.('authorization') || request?.headers?.get?.('on-behalf-of') || ''
).replace(/^Bearer\s+/i, '');

const live = (row: any, userId: string) => Boolean(row)
  && !row.revoked
  && String(row.user_id || '') === String(userId)
  && Date.parse(row.started_at || '') >= Date.parse(PORTAL_REAUTH_AFTER)
  && Date.now() - Date.parse(row.last_activity_at || '') < IDLE_MS;

const readSessions = async (db: any, filter: any, sort: string, limit: number) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rows = await db.PortalAuthSession.filter(filter, sort, limit);
      return { rows: Array.isArray(rows) ? rows : [] };
    } catch (error) {
      if (attempt === 1) return { error };
      await delay(250);
    }
  }
  return { error: new Error('Session store unavailable') };
};

export async function portalSessionState(request: any, sdk: any, user: any) {
  if (!user || user.is_service) return { state: 'invalid', row: null };
  const token = bearer(request);
  if (!token) return { state: 'invalid', row: null };

  let tokenHash;
  try {
    tokenHash = await digest(token);
  } catch {
    return { state: 'unknown', row: null };
  }

  const db = sdk.asServiceRole.entities;
  const direct = await readSessions(db, { token_hash: tokenHash }, '-created_date', 1);
  if (direct.error) return { state: 'unknown', row: null };
  const matched = direct.rows[0];
  if (matched) return { state: live(matched, user.id) ? 'current' : 'invalid', row: matched };

  // No row for this exact token: the platform issued a newer token for an account
  // whose portal session is still live. Adopt it rather than ending the session.
  const open = await readSessions(db, { user_id: user.id }, '-last_activity_at', 5);
  if (open.error) return { state: 'unknown', row: null };
  const active = open.rows.find((row: any) => live(row, user.id));
  if (!active) return { state: 'invalid', row: null };

  const adopted = { ...active, token_hash: tokenHash };
  try {
    await db.PortalAuthSession.update(active.id, { token_hash: tokenHash });
  } catch {
    return { state: 'unknown', row: adopted };
  }
  return { state: 'current', row: adopted };
}