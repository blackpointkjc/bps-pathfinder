export const FULL_ACCESS_OWNER_ID = '6ae7d733d4b1a647cd3e6f38';
export const isFullAccessOwner = user => String(user?.id || '') === FULL_ACCESS_OWNER_ID;
export const hasWholeAppAccess = user => isFullAccessOwner(user) && (user?.additional_roles || []).includes('full_access');
export const hasIAAccess = user => !!user && !user.disabled && !user.termination_date && !['denied','suspended','terminated'].includes(String(user.account_status || user.employment_status || '').toLowerCase()) && !['client','student','visitor'].some(role => (user.additional_roles || []).includes(role) || user.user_type === role) && (hasWholeAppAccess(user) || (user.additional_roles || []).includes('ia'));
export const iaRole = user => hasIAAccess(user) ? hasWholeAppAccess(user) || user.ps_role === 'reviewer' ? 'reviewer' : 'investigator' : '';
