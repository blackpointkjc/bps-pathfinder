export const absenceWindows = person => [
 ...(person?.out_of_office && person?.out_of_office_source !== 'approved_leave' ? [{start:person.out_of_office_start,end:person.out_of_office_return}] : []),
 ...(Array.isArray(person?.approved_leave_windows) ? person.approved_leave_windows : []),
 ...(person?.out_of_office && person?.out_of_office_source === 'approved_leave' && !Array.isArray(person?.approved_leave_windows) ? [{start:person.out_of_office_start,end:person.out_of_office_return}] : [])
].filter(w => Number.isFinite(Date.parse(w.start)) && Number.isFinite(Date.parse(w.end)) && Date.parse(w.end)>Date.parse(w.start));
export const isOutOfOffice = (person, now=Date.now()) => absenceWindows(person).some(w => now>=Date.parse(w.start)&&now<Date.parse(w.end));
