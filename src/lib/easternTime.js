export const EASTERN_TIME_ZONE = 'America/New_York';

/**
 * Base44 built-in timestamps are UTC, but some arrive without a trailing Z.
 * Browsers otherwise interpret those timestamp strings as local time and then
 * convert them a second time when formatting for Eastern Time.
 */
export function parseServerTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatEasternTime(value, options = {}) {
  const parsed = parseServerTimestamp(value);
  if (!parsed) return '—';
  return parsed.toLocaleTimeString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}

export function formatEasternDateTime(value, options = {}) {
  const parsed = parseServerTimestamp(value);
  if (!parsed) return '—';
  return parsed.toLocaleString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}

export function easternTimestampMs(value) {
  return parseServerTimestamp(value)?.getTime() ?? null;
}
