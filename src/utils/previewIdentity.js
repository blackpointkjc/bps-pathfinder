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


export const PREVIEW_ROLE_FILTERS = [
 ['all', 'All roles'], ['client', 'Clients'], ['officer', 'Officers'],
 ['supervisor', 'Supervisors'], ['admin', 'Administrators'], ['dispatch', 'Dispatch / CAD'],
 ['hr', 'HR'], ['trainer', 'Trainers'], ['student', 'Students'], ['staff', 'Other staff'],
];

export function previewRoleGroups(person) {
 const roles = new Set([person?.role, ...[].concat(person?.additional_roles || [])].map(value => String(value || '').trim().toLowerCase()));
 const type = previewAccountType(person);
 if (type === 'Client') return new Set(['client']);
 if (type === 'Student') return new Set(['student']);
 const groups = new Set();
 const rank = String(person?.rank || '').trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');
 if (type === 'Officer' || roles.has('officer')) groups.add('officer');
 if (person?.is_supervisor || roles.has('supervisor') || ['corporal','sergeant','first sergeant','lieutenant','lt','captain','major','lt colonel','lieutenant colonel','lt col','colonel'].includes(rank)) groups.add('supervisor');
 if (roles.has('admin') || roles.has('full_access')) groups.add('admin');
 if (person?.dispatch_role || ['dispatch','dispatcher','cad_access'].some(role => roles.has(role))) groups.add('dispatch');
 if (roles.has('hr') || rank === 'human resources') groups.add('hr');
 if (roles.has('trainer') || roles.has('training')) groups.add('trainer');
 if (!groups.size) groups.add('staff');
 return groups;
}

export function filterPreviewUsers(users, role = 'all', search = '') {
 const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return users.filter(person => {
  if (role !== 'all' && !previewRoleGroups(person).has(role)) return false;
  const text = [previewDisplayName(person), previewAccountType(person), person.first_name, person.last_name, person.email, person.full_name, person.rank, person.unit_number].filter(Boolean).join(' ').toLowerCase();
  return terms.every(term => text.includes(term));
 });
}
