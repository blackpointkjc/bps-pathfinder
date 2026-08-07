export function normalizeRank(rank) {
  const raw = String(rank || '').trim();
  if (!raw) return '';
  if (/^colonel\b/i.test(raw)) return 'Colonel';
  if (/^(lt\.?\s*colonel|lieutenant colonel)\b/i.test(raw)) return 'Lt Colonel';
  if (/^major\b/i.test(raw)) return 'Major';
  return raw.replace(/\s*\([^)]*\)\s*/g, '').trim();
}

export function rankLastName(person, fallback = '') {
  const rank = normalizeRank(person?.rank);
  const last = String(person?.last_name || '').trim();
  return [rank, last].filter(Boolean).join(' ') || fallback || person?.full_name || person?.email || '';
}
