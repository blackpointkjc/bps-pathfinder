const normalizeEmail = value => String(value || '').trim().toLowerCase();

const storageKey = email => `bps:announcements-read:${normalizeEmail(email)}`;

export function getLocalReadAnnouncementIds(email) {
  if (!email || typeof window === 'undefined') return new Set();
  try {
    const values = JSON.parse(window.localStorage.getItem(storageKey(email)) || '[]');
    return new Set(Array.isArray(values) ? values.map(value => String(value || '')).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function markAnnouncementsReadLocally(email, announcementIds) {
  if (!email || typeof window === 'undefined') return new Set();
  const readIds = getLocalReadAnnouncementIds(email);
  (announcementIds || []).forEach(value => {
    const id = String(value || '');
    if (id) readIds.add(id);
  });
  try {
    window.localStorage.setItem(storageKey(email), JSON.stringify(Array.from(readIds).slice(-1000)));
  } catch {
    // Server receipts remain the durable cross-device source.
  }
  return readIds;
}
