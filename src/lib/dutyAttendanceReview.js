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

// Every outstanding obligation is listed with a stable key so an administrator can
// grant (or lift) an exemption. Exempted obligations stay visible, marked, and are
// removed from scoring instead of being silently credited as completed.
function dutyItems(jobDuty) {
  return (jobDuty?.shifts || []).flatMap(shift => {
    const items = [];
    const dar = shift.daily_activity || {};
    if (dar.excused) {
      items.push({ key: dar.key, item_type: 'dar', date: shift.shift_date, property: shift.property, label: 'Daily activity report exempted', exempt: true });
    } else if (dar.required && !dar.completed) {
      items.push({ key: dar.key, item_type: 'dar', date: shift.shift_date, property: shift.property, label: 'Daily activity report missing', exempt: false });
    }
    (shift.incidents?.items || []).filter(item => item.status === 'missing' || item.status === 'excused').forEach(item => {
      items.push({
        key: item.key || `incident:${item.call_id}`,
        item_type: 'incident',
        date: shift.shift_date,
        property: shift.property,
        label: `${item.status === 'excused' ? 'Incident report exempted' : 'Incident report missing'} · ${item.call_number || 'property call'}`,
        exempt: item.status === 'excused',
      });
    });
    const qr = shift.qr || {};
    const missed = Number(qr.missed || 0);
    const excusedQr = Number(qr.excused || 0);
    if (missed > 0) {
      items.push({ key: qr.key, item_type: 'qr', date: shift.shift_date, property: shift.property, label: `${missed} QR checkpoint${missed === 1 ? '' : 's'} missed`, exempt: false });
    } else if (excusedQr > 0) {
      items.push({ key: qr.key, item_type: 'qr', date: shift.shift_date, property: shift.property, label: `${excusedQr} QR checkpoint${excusedQr === 1 ? '' : 's'} exempted`, exempt: true });
    }
    return items;
  }).sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
}

function callOutItems(attendance) {
  const list = (attendance?.items || []).map(item => ({ ...item, key: `call_out:${item.id}`, exempt: false }));
  const excused = (attendance?.excusedItems || []).map(item => ({ ...item, key: `call_out:${item.id}`, exempt: true }));
  return [...list, ...excused].sort((left, right) => String(right.call_out_date || '').localeCompare(String(left.call_out_date || '')));
}

export function buildDutyAttendanceRows(data = {}, { start_date, end_date, adjustments = [] } = {}) {
  const officers = (data.users || []).filter(isOperationalOfficer).sort(comparePersonnel);
  return officers.map(officer => {
    const email = emailKey(officer.email);
    const officerAdjustments = adjustments.filter(row => emailKey(row.officer_email) === email && row.item_key);
    const exemptions = officerAdjustments.map(row => String(row.item_key));
    const exemptionReasons = Object.fromEntries(officerAdjustments.map(row => [String(row.item_key), String(row.reason || '')]));
    const entries = (data.timeEntries || []).filter(entry => emailKey(entry.officer_email) === email);
    const callOuts = (data.callOuts || []).filter(row => emailKey(row.officer_email) === email);
    const jobDuty = calculateJobDutyCompliance({
      officer,
      timeEntries: entries,
      schedules: data.schedules || [],
      dailyReports: data.dailyActivityReports || [],
      incidentReports: data.incidentReports || [],
      dispatchCalls: data.dispatchCalls || [],
      callOuts,
      qrScans: data.qrScans || [],
      allTimeEntries: data.timeEntries || entries,
      qrCheckpoints: data.qrCheckpoints || [],
      dutyRules: data.dutyRules || [],
      locations: data.locations || [],
      exemptions,
      monthStart: start_date,
      monthEnd: end_date,
    });
    const attendance = calculateCallOutAttendance(callOuts, data.schedules || [], start_date, end_date, officer, exemptions);
    return {
      officer,
      jobDuty,
      attendance,
      missedDuties: dutyItems(jobDuty),
      callOutItems: callOutItems(attendance),
      exemptions,
      exemptionReasons,
    };
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
    exempted: rows.reduce((sum, row) => sum + Number(row.exemptions?.length || 0), 0),
    flagged: rows.filter(row => (row.jobDuty?.countedMissed || 0) > 0 || (row.attendance?.count || 0) > 0).length,
  };
}