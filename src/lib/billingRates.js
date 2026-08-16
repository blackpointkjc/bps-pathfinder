const dateKey = value => String(value || '').slice(0, 10);
const emailKey = value => String(value || '').trim().toLowerCase();
const localDateKey = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDefaultBillingPeriod = (now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  // Before the Sunday 8 AM invoice run, keep the just-completed week selected
  // instead of presenting accounting and clients with an empty new week.
  if (now.getDay() === 0 && now.getHours() < 8) start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { startDate: localDateKey(start), endDate: localDateKey(end) };
};

export const normalizeSiteName = value => String(value || '').split(/\s*(?::|\s-\s)\s*/)[0].trim();

export const calculateLiveHours = (entry, now = new Date()) => {
  if (!entry?.clock_in) return 0;
  const start = new Date(entry.clock_in).getTime();
  const end = entry.clock_out ? new Date(entry.clock_out).getTime() : new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const breakMs = (Array.isArray(entry.break_periods) ? entry.break_periods : []).reduce((total, period) => {
    const breakStart = new Date(period?.start).getTime();
    const rawEnd = period?.end ? new Date(period.end).getTime() : (entry.on_break ? end : NaN);
    if (!Number.isFinite(breakStart) || !Number.isFinite(rawEnd) || rawEnd <= breakStart) return total;
    return total + Math.max(0, Math.min(end, rawEnd) - Math.max(start, breakStart));
  }, 0);
  return Math.max(0, (end - start - breakMs) / 3600000);
};

export const findScheduleForEntry = (entry, schedules = []) => {
  const site = normalizeSiteName(entry?.location);
  const email = emailKey(entry?.officer_email);
  const day = dateKey(entry?.clock_in);
  return schedules.find(shift =>
    shift?.archived !== true &&
    emailKey(shift?.officer_email) === email &&
    normalizeSiteName(shift?.location) === site &&
    dateKey(shift?.shift_date) === day
  ) || null;
};

export const resolveBillingRate = (entry, location, schedules = []) => {
  const schedule = findScheduleForEntry(entry, schedules);
  const shiftType = String(schedule?.shift_type || 'normal').toLowerCase();
  const details = `${schedule?.site_details || ''} ${schedule?.special_instructions || ''}`.toLowerCase();
  const isUnarmed = /\bunarmed\b/.test(details);
  let field = isUnarmed ? 'site_bill_rate_unarmed' : 'site_bill_rate';
  let label = isUnarmed ? 'Standard unarmed' : 'Standard armed';

  if (shiftType === 'holiday_coverage') {
    field = isUnarmed ? 'site_bill_rate_holiday_unarmed' : 'site_bill_rate_holiday_armed';
    label = isUnarmed ? 'Holiday unarmed' : 'Holiday armed';
  } else if (shiftType === 'rush_coverage') {
    field = isUnarmed ? 'site_bill_rate_rush_unarmed' : 'site_bill_rate_rush_armed';
    label = isUnarmed ? 'Rush unarmed' : 'Rush armed';
  }

  const baseRate = Number(location?.[isUnarmed ? 'site_bill_rate_unarmed' : 'site_bill_rate']) ||
    Number(location?.site_bill_rate) || 0;
  return {
    rate: Number(location?.[field]) || baseRate,
    rateField: field,
    rateLabel: label,
    shiftType,
    schedule,
  };
};
