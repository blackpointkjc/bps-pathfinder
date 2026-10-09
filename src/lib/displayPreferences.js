export const DISPLAY_DEFAULTS = Object.freeze({
  text: 'standard', contrast: 'standard', spacing: 'standard', motion: 'system',
});
export const DISPLAY_OPTIONS = Object.freeze({
  text: ['standard', 'large', 'extra-large'],
  contrast: ['standard', 'high'],
  spacing: ['standard', 'comfortable'],
  motion: ['system', 'reduced'],
});
export function normalizeDisplayPreferences(value) {
  return Object.fromEntries(Object.entries(DISPLAY_DEFAULTS).map(([key, fallback]) =>
    [key, DISPLAY_OPTIONS[key].includes(value?.[key]) ? value[key] : fallback]));
}
export function displayStorageKey(userId) {
  return 'bps:display:v1:' + (userId || 'local');
}
export function readDisplayPreferences(storage, key) {
  try { return normalizeDisplayPreferences(JSON.parse(storage.getItem(key))); }
  catch { return { ...DISPLAY_DEFAULTS }; }
}
