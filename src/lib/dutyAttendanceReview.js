import { calculateJobDutyCompliance, calculateCallOutAttendance } from '@/lib/performanceScoring';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { comparePersonnel } from '@/utils/rankPolicy';

const emailKey = value => String(value || '').trim().toLowerCase();
const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Review windows are calendar based so an administrator can look back at any
// period and compare every officer against the same obligation set.
export function reviewPeriodDates(preset, today = new Date()) {
  if (preset === 'last_month') {
    return {
      start_date: isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      end_date: isoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (preset === 'last_30' || preset === 'last_90') {
    const start = new Date(today);
    start.setDate(start.getDate() - (preset === 'last_30' ? 29 : 89));
    return { start_date: isoDate(start), end_date: isoDate(today) };
  }
  return {
    start_date: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end_date: isoDate(today),
  };
}

function missedDutyItems(jobDuty) {
  return (jobDuty?.shifts || []).flatMap(shift => {
    const items = [];
    if (shift.daily_activity?.required && !shift.daily_activity?.completed) {
      items.push({ date: shift.shift_date, property: shift.property, label: 'Daily activity report missing' });
    }
    (shift.incidents?.items || []).filter(item => item.status === 'missing').forEach(item => {
      items.push({ date: shift.shift_date, property: shift.property, label: `Incident report missing · ${item.call_number || 'property call'}` });
    });
    const missedScans = Number(shift.qr?.missed || 0);
    if (missedScans > 0) {
      items.push({ date: shift.shift_date, property: shift.property, label: `${missedScans} QR checkpoint${missedScans === 1 ? '' : 's'} missed` });
    }
    return items;
  }).sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
}

export function buildDutyAttendanceRows(data = {}, { start_date, end_date } = {}) {
  const officers = (data.users || []).filter(isOperationalOfficer).sort(comparePersonnel);
  return officers.map(officer => {
    const email = emailKey(officer.email);
    const entries = (data.timeEntries || []).filter(entry => emailKey(entry.officer_email) === email);
    const callOuts = (data.callOuts || []).filter(row => emailKey(row.officer_email) === email);
    const jobDuty = calculateJobDutyCompliance({
      officer,
      timeEntries: entries,
      dailyReports: data.dailyActivityReports || [],
      incidentReports: data.incidentReports || [],
      dispatchCalls: data.dispatchCalls || [],
      callOuts,
      qrScans: data.qrScans || [],
      allTimeEntries: data.timeEntries || entries,
      qrCheckpoints: data.qrCheckpoints || [],
      dutyRules: data.dutyRules || [],
      locations: data.locations || [],
      monthStart: start_date,
      monthEnd: end_date,
    });
    const attendance = calculateCallOutAttendance(callOuts, data.schedules || [], start_date, end_date, officer);
    return { officer, jobDuty, attendance, missedDuties: missedDutyItems(jobDuty) };
  });
}

export function summarizeReview(rows = []) {
  const dutyScored = rows.filter(row => row.jobDuty?.score != null);
  const attendanceScored = rows.filter(row => row.attendance?.score != null);
  return {
    officers: rows.length,
    averageDuty: dutyScored.length
      ? Math.round(dutyScored.reduce((sum, row) => sum + row.jobDuty.score, 0) / dutyScored.length)
      : null,
    averageAttendance: attendanceScored.length
      ? Math.round(attendanceScored.reduce((sum, row) => sum + row.attendance.score, 0) / attendanceScored.length)
      : null,
    missedDuties: rows.reduce((sum, row) => sum + Number(row.jobDuty?.countedMissed || 0), 0),
    callOuts: rows.reduce((sum, row) => sum + Number(row.attendance?.count || 0), 0),
    flagged: rows.filter(row => (row.jobDuty?.countedMissed || 0) > 0 || (row.attendance?.count || 0) > 0).length,
  };
}