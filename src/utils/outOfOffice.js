export function isOutOfOffice(person, now = Date.now()) {
 if (!person?.out_of_office) return false;
 const start = Date.parse(person.out_of_office_start || '');
 const end = Date.parse(person.out_of_office_return || '');
 return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
}
