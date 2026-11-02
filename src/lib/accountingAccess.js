export const ACCOUNTING_OWNER_ID = '6ae7d733d4b1a647cd3e6f38';
export const canAccessAccounting = user => String(user?.id || '') === ACCOUNTING_OWNER_ID;
