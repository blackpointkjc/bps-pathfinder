export const ACCOUNTING_OWNER_ID = '6a72bbee2842d6338cbae513';
export const canAccessAccounting = user => String(user?.id || '') === ACCOUNTING_OWNER_ID;
