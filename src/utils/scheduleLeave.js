import { shiftOverlapsLeave } from './leaveWindow.js';
const clean = value => String(value || '').trim().toLowerCase();

export function approvedLeaveConflicts(shifts, requests, users = []) {
 const result = [];
 for (const shift of shifts) {
  if (shift.is_open || ['','open','unassigned'].includes(clean(shift.officer_email))) continue;
  const officer = users.find(user => [user.email,...(user.email_aliases || [])].some(value => clean(value) === clean(shift.officer_email)));
  const identities = new Set([shift.officer_email,officer?.email,...(officer?.email_aliases || [])].map(clean).filter(Boolean));
  const day = String(shift.shift_date || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
  for (const leave of requests) {
   if (clean(leave.status) !== 'approved') continue;
   if (!identities.has(clean(leave.requested_by_email || leave.created_by)) && !(officer?.id && String(leave.created_by_id || '') === String(officer.id))) continue;
   if (shiftOverlapsLeave(shift,leave)) {
    result.push({shift,leave,officer});
   }
  }
 }
 return result;
}
