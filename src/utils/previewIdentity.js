import { isClientAccount, isOperationalOfficer } from '../lib/directoryUtils.js';

export function previewAccountType(person) {
  if (isClientAccount(person)) return 'Client';
  if (isOperationalOfficer(person)) return 'Officer';
  const roles = [person?.role, ...([].concat(person?.additional_roles || []))].map(role => String(role).toLowerCase());
  if (roles.includes('student') || person?.user_type === 'student') return 'Student';
  return roles.includes('admin') || roles.includes('full_access') ? 'Admin' : 'Staff';
}

export function previewDisplayName(person) {
  if (!person) return 'Selected user';
  const first = String(person.first_name || '').trim();
  const last = String(person.last_name || '').trim();
  // Legacy full_name sometimes holds the login handle, not a person's name.
  const full = String(person.full_name || '').trim();
  const realFull = full.includes(' ') && !full.includes('@') ? full : '';
  if (previewAccountType(person) === 'Officer') {
    return [person.rank || 'Officer', last || realFull.split(/\s+/).pop() || first || 'Name unavailable'].filter(Boolean).join(' ');
  }
  return [first, last].filter(Boolean).join(' ') || realFull || 'Name unavailable';
}
