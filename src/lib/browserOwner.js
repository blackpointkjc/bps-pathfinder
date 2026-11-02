// Website policy administration is reserved for the verified owner profile.
// This ID is the existing Colonel Hiers personnel ID used elsewhere in Pathfinder.
export const BROWSER_POLICY_OWNER_ID = '6ae7d733d4b1a647cd3e6f38';
export function canManageWebsiteRestrictions(user) {
  return String(user?.id || '') === BROWSER_POLICY_OWNER_ID &&
    String(user?.role || '').toLowerCase() === 'admin' &&
    user?.user_type !== 'client';
}
