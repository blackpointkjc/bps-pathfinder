// Match the authoritative open time punch, never a scheduled/assigned post alone.
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function isClockedInAtProperty(entries, property, now = Date.now()) {
  if (!property) return false;
  const entry = (entries || []).filter(row => !row.clock_out && row.archived !== true
    && Number.isFinite(Date.parse(row.clock_in)) && Date.parse(row.clock_in) <= now)
    .sort((a, b) => Date.parse(b.clock_in) - Date.parse(a.clock_in))[0];
  if (!entry) return false;
  if (entry.location_id) return String(entry.location_id) === String(property.id);
  // TimeClock and change-post currently persist "site name - address".
  const site = normalize(property.site_name);
  const address = normalize(property.address);
  const punch = normalize(entry.location);
  return Boolean(site && (punch === site || (address && punch === `${site} - ${address}`)));
}
