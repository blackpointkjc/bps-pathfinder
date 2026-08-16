import { createClientFromRequest } from 'npm:@base44/sdk';

const DAY_MS = 86400000;
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const siteOf = (value: unknown) => String(value || '').split(/\s*(?::|\s-\s)\s*/)[0].trim();
const hoursBetween = (start: unknown, end: unknown) => {
  const ms = new Date(String(end)).getTime() - new Date(String(start)).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0;
};
const scheduleFor = (entry: any, schedules: any[]) => (schedules || []).find((shift: any) =>
  shift.archived !== true &&
  String(shift.officer_email || '').toLowerCase() === String(entry.officer_email || '').toLowerCase() &&
  siteOf(shift.location) === siteOf(entry.location) &&
  String(shift.shift_date || '').slice(0, 10) === String(entry.clock_in || '').slice(0, 10)
);
const rateFor = (entry: any, location: any, schedules: any[]) => {
  const shift = scheduleFor(entry, schedules);
  const shiftType = String(shift?.shift_type || 'normal').toLowerCase();
  const details = `${shift?.site_details || ''} ${shift?.special_instructions || ''}`.toLowerCase();
  const unarmed = /\\bunarmed\\b/.test(details);
  let field = unarmed ? 'site_bill_rate_unarmed' : 'site_bill_rate';
  let label = unarmed ? 'Standard unarmed' : 'Standard armed';
  if (shiftType === 'holiday_coverage') {
    field = unarmed ? 'site_bill_rate_holiday_unarmed' : 'site_bill_rate_holiday_armed';
    label = unarmed ? 'Holiday unarmed' : 'Holiday armed';
  } else if (shiftType === 'rush_coverage') {
    field = unarmed ? 'site_bill_rate_rush_unarmed' : 'site_bill_rate_rush_armed';
    label = unarmed ? 'Rush unarmed' : 'Rush armed';
  }
  const base = Number(location?.[unarmed ? 'site_bill_rate_unarmed' : 'site_bill_rate']) || Number(location?.site_bill_rate) || 0;
  return { rate: Number(location?.[field]) || base, label };
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const easternParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const easternWeekday = easternParts.find(part => part.type === 'weekday')?.value;
    const easternHour = Number(easternParts.find(part => part.type === 'hour')?.value);
    // The automation checks hourly on Sunday so this guard remains correct through
    // daylight-saving changes while still running exactly once at 8 AM Eastern.
    if (easternWeekday !== 'Sun' || easternHour !== 8) {
      return Response.json({ success: true, skipped: true, reason: 'Outside Sunday 8 AM Eastern billing window' });
    }

    // The Sunday run closes the Sunday-Saturday week that ended the day before.
    const periodEndDate = new Date(now.getTime() - DAY_MS);
    const periodStartDate = new Date(periodEndDate.getTime() - 6 * DAY_MS);
    const periodStart = dateOnly(periodStartDate);
    const periodEnd = dateOnly(periodEndDate);

    const [entries, locations, users, invoices, schedules] = await Promise.all([
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 10000),
      base44.asServiceRole.entities.Location.list('site_name', 2000),
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.Invoice.list('-created_date', 5000),
      base44.asServiceRole.entities.Schedule.list('-shift_date', 10000),
    ]);

    const clients = (users || []).filter((user: any) => {
      const roles = (user.additional_roles || []).map((role: unknown) => String(role).toLowerCase());
      return roles.includes('client') || String(user.user_type || '').toLowerCase() === 'client';
    });
    const officers = new Map((users || []).map((user: any) => [String(user.email || '').toLowerCase(), user]));
    const existingKeys = new Set((invoices || []).map((invoice: any) =>
      [String(invoice.client_email || '').toLowerCase(), invoice.site_name, invoice.period_start, invoice.period_end].join('|')
    ));
    const yearPrefix = String(now.getUTCFullYear()).slice(-2);
    let sequence = Math.max(0, ...(invoices || [])
      .map((invoice: any) => String(invoice.invoice_number || ''))
      .filter((number: string) => number.startsWith(yearPrefix))
      .map((number: string) => Number(number.slice(2)) || 0));

    let created = 0;
    let skipped = 0;
    for (const client of clients) {
      const assigned = new Set([
        ...(Array.isArray(client.assigned_locations) ? client.assigned_locations : []),
        ...(Array.isArray(client.assigned_sites) ? client.assigned_sites : []),
        ...(client.assigned_location ? [client.assigned_location] : []),
      ].map(siteOf).filter(Boolean));

      for (const location of (locations || [])) {
        const siteName = siteOf(location.site_name);
        const ownsSite = assigned.has(siteName) ||
          String(location.assigned_client_email || '').toLowerCase() === String(client.email || '').toLowerCase();
        const rate = Number(location.site_bill_rate || 0);
        if (!ownsSite || !siteName || rate <= 0) continue;

        const key = [String(client.email || '').toLowerCase(), siteName, periodStart, periodEnd].join('|');
        if (existingKeys.has(key)) { skipped += 1; continue; }

        const siteEntries = (entries || []).filter((entry: any) => {
          const entryDate = String(entry.clock_in || '').slice(0, 10);
          return entry.clock_in && entry.clock_out && siteOf(entry.location) === siteName &&
            entryDate >= periodStart && entryDate <= periodEnd && entry.archived !== true;
        });
        if (!siteEntries.length) continue;

        let totalHours = 0;
        let totalAmount = 0;
        const shifts = siteEntries.map((entry: any) => {
          const hours = Math.round(hoursBetween(entry.clock_in, entry.clock_out) * 100) / 100;
          const shiftRate = rateFor(entry, location, schedules || []);
          totalHours += hours;
          totalAmount += hours * shiftRate.rate;
          const officer = officers.get(String(entry.officer_email || '').toLowerCase()) as any;
          return {
            date: String(entry.clock_in).slice(0, 10),
            officer: officer ? `${officer.rank ? officer.rank + ' ' : ''}${officer.last_name || officer.full_name || 'Officer'}` : 'Officer',
            clockIn: String(entry.clock_in),
            clockOut: String(entry.clock_out),
            hours: hours.toFixed(2),
            rate: shiftRate.rate.toFixed(2),
            rateType: shiftRate.label,
            amount: (hours * shiftRate.rate).toFixed(2),
          };
        });

        sequence += 1;
        const due = new Date(now.getTime() + 15 * DAY_MS);
        const invoiceNumber = `${yearPrefix}${String(sequence).padStart(3, '0')}`;
        await base44.asServiceRole.entities.Invoice.create({
          invoice_number: invoiceNumber,
          client_email: client.email,
          site_name: siteName,
          period_start: periodStart,
          period_end: periodEnd,
          total_hours: totalHours,
          bill_rate: rate,
          total_amount: totalAmount,
          shifts: JSON.stringify(shifts),
          notes: 'Automatically generated weekly invoice.',
          due_date: dateOnly(due),
          status: 'sent',
        });
        await base44.asServiceRole.entities.Notification.create({
          recipient_email: client.email,
          recipient_name: client.full_name || `${client.first_name || ''} ${client.last_name || ''}`.trim(),
          type: 'invoice',
          priority: 'normal',
          title: `New Invoice - ${invoiceNumber}`,
          message: `Your weekly invoice for ${siteName} is available. Total: $${totalAmount.toFixed(2)}.`,
          action_url: '/ClientCenter?section=requests&tool=payroll',
          read: false,
        });
        existingKeys.add(key);
        created += 1;
      }
    }

    return Response.json({ success: true, period_start: periodStart, period_end: periodEnd, created, skipped });
  } catch (error) {
    console.error('generateWeeklyInvoices failed', error);
    return Response.json({ error: error?.message || 'Unable to generate weekly invoices' }, { status: 500 });
  }
});
