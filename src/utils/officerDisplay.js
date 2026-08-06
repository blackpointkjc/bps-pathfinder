export function getRankLastName(user, fallback = 'Unknown Officer') {
  if (!user) return fallback;
  const rank = String(user.rank || user.job_title || 'Officer').trim();
  const lastName = String(user.last_name || '').trim();
  if (lastName) return `${rank} ${lastName}`.trim();
  const fullName = String(user.full_name || '').trim();
  if (fullName) {
    const parts = fullName.split(/\s+/);
    return `${rank} ${parts[parts.length - 1]}`.trim();
  }
  return fallback;
}

export function getRankLastNameByEmail(users, email, fallback) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = (users || []).find(item => String(item.email || '').trim().toLowerCase() === normalized);
  return getRankLastName(user, fallback || normalized || 'Unknown Officer');
}
