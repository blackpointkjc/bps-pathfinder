const clean = value => String(value || '').trim().toLowerCase();
export function briefingPersonnelIndex(users = []) {
  const claims = new Map();
  const add = (key, person) => {
    if (!key) return;
    if (!claims.has(key)) claims.set(key, new Map());
    claims.get(key).set(String(person.id || person.email), person);
  };
  for (const person of users) {
    const aliases = [person.email, person.work_email, person.pathfinder_email, person.microsoft_email, person.outlook_email, ...(person.email_aliases || [])].map(clean).filter(Boolean);
    for (const alias of aliases) {
      add(alias, person);
      const [mailbox, domain] = alias.split('@');
      // These are the company's legacy and migrated login domains only.
      // Ambiguous ownership is deliberately left unresolved.
      if (['blackpointkjc.com', 'employee.blackpointkjc.com'].includes(domain)) {
        add(mailbox + '@blackpointkjc.com', person);
        add(mailbox + '@employee.blackpointkjc.com', person);
      }
    }
  }
  return new Map([...claims].filter(([, owners]) => owners.size === 1).map(([key, owners]) => [key, [...owners.values()][0]]));
}
export function briefingOfficerName(row) {
  const person = row.person;
  if (person?.last_name || person?.first_name) return [person.rank || 'Officer', person.last_name || person.first_name].filter(Boolean).join(' ');
  return [person?.full_name, row.unit?.officer_name, row.entry?.officer_name, row.shift?.officer_name].find(value => value && !String(value).includes('@')) || 'Officer details unavailable';
}
export function mergeBriefingStaffing(scheduled = [], onDuty = []) {
  const present = new Set(scheduled.map(row => row.email));
  return [...scheduled, ...onDuty.filter(row => !present.has(row.email)).map(row => ({
    ...row, shift: { id: 'active-' + row.email, location: row.entry?.location || '', start_time: '', end_time: '' }
  }))];
}
