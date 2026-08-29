import { createClientFromRequest } from 'npm:@base44/sdk';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));

const PAYROLL_FIELDS = new Set([
  'payroll_adjustment_decision',
  'payroll_hours_override',
  'actual_hours_snapshot',
  'approved_hours_snapshot',
  'performance_exception',
  'performance_overage_counted',
  'payroll_adjustment_reason',
  'relief_officer_email',
  'payroll_adjusted_by',
  'payroll_adjusted_at',
]);

const actualPaidHours = (entry: any) => {
  const shiftStart = new Date(entry?.clock_in || '').getTime();
  const shiftEnd = new Date(entry?.clock_out || '').getTime();
  if (!Number.isFinite(shiftStart) || !Number.isFinite(shiftEnd) || shiftEnd <= shiftStart) return 0;

  const breakMs = (Array.isArray(entry?.break_periods) ? entry.break_periods : []).reduce((total: number, period: any) => {
    const breakStart = new Date(period?.start || '').getTime();
    const breakEnd = new Date(period?.end || '').getTime();
    if (!Number.isFinite(breakStart) || !Number.isFinite(breakEnd) || breakEnd <= breakStart) return total;
    const boundedStart = Math.max(shiftStart, breakStart);
    const boundedEnd = Math.min(shiftEnd, breakEnd);
    return total + Math.max(0, boundedEnd - boundedStart);
  }, 0);

  return Math.max(0, (shiftEnd - shiftStart - breakMs) / 3600000);
};

const round = (value: number, digits = 2) => Number(Number(value || 0).toFixed(digits));

const easternDateOnly = (value: unknown) => {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const payrollPaidHours = (entry: any) => {
  const actual = actualPaidHours(entry);
  if (!entry?.payroll_adjustment_decision) return actual;
  const approved = Number(entry.payroll_hours_override);
  return Number.isFinite(approved) && approved >= 0 ? approved : actual;
};

const sundayKey = (value: unknown) => {
  const day = easternDateOnly(value);
  if (!day) return '';
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
};

const holidayName = (value: unknown) => {
  const day = easternDateOnly(value);
  if (!day) return '';
  const date = new Date(`${day}T12:00:00Z`);
  const month = date.getUTCMonth() + 1;
  const dateOfMonth = date.getUTCDate();
  const weekday = date.getUTCDay();
  const week = Math.ceil(dateOfMonth / 7);
  if (month === 1 && dateOfMonth === 1) return "New Year's Day";
  if (month === 1 && weekday === 1 && week === 3) return 'Martin Luther King Jr. Day';
  if (month === 6 && dateOfMonth === 19) return 'Juneteenth';
  if (month === 7 && dateOfMonth === 4) return 'Independence Day';
  if (month === 11 && weekday === 4 && week === 4) return 'Thanksgiving Day';
  if (month === 12 && dateOfMonth === 25) return 'Christmas Day';
  return '';
};

async function syncPayrollPeriodForEntry(base44: any, touchedEntry: any) {
  const email = String(touchedEntry?.officer_email || '').trim().toLowerCase();
  const touchedDate = easternDateOnly(touchedEntry?.clock_in);
  if (!email || !touchedDate) return 0;

  const periods = await base44.asServiceRole.entities.PayrollPeriod.list('-start_date', 1000);
  const period = (periods || []).find((item: any) =>
    item.start_date <= touchedDate && item.end_date >= touchedDate
  );
  if (!period) return 0;

  const payrollRows = await base44.asServiceRole.entities.PayrollEntry.filter({
    officer_email: email,
    pay_period_start: period.start_date,
    pay_period_end: period.end_date,
  }, '-created_date', 100).catch(() => []);
  if (!payrollRows?.length) return 0;

  const users = await base44.asServiceRole.entities.User.list(undefined, 2000);
  const officer = (users || []).find((item: any) => String(item.email || '').trim().toLowerCase() === email);
  if (!officer || Number(officer.hourly_rate || 0) <= 0) return 0;

  const configs = await base44.asServiceRole.entities.PayrollConfig.list(undefined, 20).catch(() => []);
  const timeEntries = await base44.asServiceRole.entities.TimeEntry.filter({ officer_email: email }, '-clock_in', 5000).catch(() => []);
  const ptoUsage = await base44.asServiceRole.entities.PTOUsage.filter({ officer_email: email }, '-usage_date', 5000).catch(() => []);
  const expenses = await base44.asServiceRole.entities.ExpenseReport.filter({ officer_email: email }, '-expense_date', 5000).catch(() => []);

  const config = configs?.[0] || {};
  const threshold = Number(config.overtime_threshold_hours || 40);
  const overtimeMultiplier = Number(config.overtime_multiplier || 1.5);
  const holidayMultiplier = Number(config.holiday_multiplier || 2);
  const weekly: Record<string, number> = {};
  const holidays: any[] = [];

  for (const entry of timeEntries || []) {
    const day = easternDateOnly(entry.clock_in);
    if (!entry.clock_in || !entry.clock_out || entry.archived === true || day < period.start_date || day > period.end_date) continue;
    const hours = payrollPaidHours(entry);
    const holiday = holidayName(entry.clock_in);
    if (holiday) holidays.push({ date: day, name: holiday, hours });
    else {
      const week = sundayKey(entry.clock_in);
      weekly[week] = Number(weekly[week] || 0) + hours;
    }
  }

  let regularHours = 0;
  let overtimeHours = 0;
  Object.values(weekly).forEach(hours => {
    regularHours += Math.min(Number(hours), threshold);
    overtimeHours += Math.max(0, Number(hours) - threshold);
  });
  const holidayHours = holidays.reduce((sum, item) => sum + Number(item.hours || 0), 0);
  const officerPto = (ptoUsage || []).filter((usage: any) =>
    usage.status === 'active' &&
    usage.usage_date >= period.start_date &&
    usage.usage_date <= period.end_date
  );
  const ptoHours = officerPto.reduce((sum: number, usage: any) => sum + Number(usage.hours || 0), 0);
  const officerExpenses = (expenses || []).filter((expense: any) =>
    ['approved', 'reimbursed', 'paid'].includes(String(expense.status || '').toLowerCase()) &&
    expense.expense_date >= period.start_date &&
    expense.expense_date <= period.end_date
  );

  const baseRate = Number(officer.hourly_rate || 0);
  const overtimeRate = Number(officer.overtime_rate_override || baseRate * overtimeMultiplier);
  const holidayRate = Number(officer.holiday_rate_override || baseRate * holidayMultiplier);
  const regularPay = regularHours * baseRate;
  const overtimePay = overtimeHours * overtimeRate;
  const holidayPay = holidayHours * holidayRate;
  const ptoPay = ptoHours * baseRate;
  const gross = regularPay + overtimePay + holidayPay + ptoPay;
  const reimbursementTotal = officerExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0);
  const recalculatedAt = new Date().toISOString();

  for (const payrollRow of payrollRows) {
    const deductions = Number(payrollRow.federal_tax || 0)
      + Number(payrollRow.state_tax || 0)
      + Number(payrollRow.social_security || 0)
      + Number(payrollRow.medicare || 0)
      + Number(payrollRow.other_deductions || 0);
    const netPay = Math.max(0, gross - deductions) + reimbursementTotal;
    await base44.asServiceRole.entities.PayrollEntry.update(payrollRow.id, {
      regular_hours: round(regularHours, 4),
      overtime_hours: round(overtimeHours, 4),
      holiday_hours: round(holidayHours, 4),
      pto_hours: round(ptoHours, 4),
      hours_worked: round(regularHours + overtimeHours + holidayHours, 4),
      total_paid_hours: round(regularHours + overtimeHours + holidayHours + ptoHours, 4),
      hourly_rate: baseRate,
      overtime_rate: overtimeRate,
      holiday_rate: holidayRate,
      regular_pay: round(regularPay),
      overtime_pay: round(overtimePay),
      holiday_pay: round(holidayPay),
      pto_pay: round(ptoPay),
      gross_pay: round(gross),
      tax_free_reimbursements: round(reimbursementTotal),
      total_payment_due: round(netPay),
      net_pay: round(netPay),
      holidays_worked: JSON.stringify(holidays),
      pto_detail: JSON.stringify(officerPto.map((usage: any) => ({
        date: usage.usage_date,
        hours: Number(usage.hours || 0),
        reason: usage.reason || '',
        source_type: usage.source_type || '',
      }))),
      last_recalculated_at: recalculatedAt,
      payroll_source: 'time_entry_sync',
    });
  }

  return payrollRows.length;
}

async function syncTouchedPayrollRecords(base44: any, entries: any[]) {
  const seen = new Set<string>();
  let updated = 0;
  for (const entry of entries || []) {
    const key = `${String(entry?.officer_email || '').trim().toLowerCase()}|${easternDateOnly(entry?.clock_in)}`;
    if (!entry?.officer_email || !entry?.clock_in || seen.has(key)) continue;
    seen.add(key);
    updated += await syncPayrollPeriodForEntry(base44, entry);
  }
  return updated;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = rolesOf(user);
    const hasHR = user.role === 'admin'
      || roles.has('hr')
      || roles.has('full_access')
      || String(user.rank || '').trim().toLowerCase() === 'human resources';
    const hasPayrollAuthority = hasHR;
    if (!hasHR) return Response.json({ error: 'HR access required' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'list';

    if (action === 'list') {
      const [entries, callOuts] = await Promise.all([
        base44.asServiceRole.entities.TimeEntry.list('-created_date', 5000),
        base44.asServiceRole.entities.CallOut.list('-call_out_date', 5000).catch(() => []),
      ]);
      return Response.json({ success: true, entries: entries || [], call_outs: callOuts || [] });
    }

    if (action === 'payroll_decision') {
      if (!hasPayrollAuthority) {
        return Response.json({ error: 'HR or administrator access is required for payroll decisions' }, { status: 403 });
      }
      if (!body.id) return Response.json({ error: 'Time entry ID is required' }, { status: 400 });

      const decision = String(body.decision || '');
      const validDecisions = new Set([
        'relief_delay_approved',
        'pay_overage_with_performance',
        'deny_overage_pay',
      ]);
      if (!validDecisions.has(decision)) {
        return Response.json({ error: 'Select a valid payroll decision' }, { status: 400 });
      }

      const reason = String(body.reason || '').trim();
      if (!reason) return Response.json({ error: 'An audit reason is required' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.TimeEntry.get(body.id);
      if (!existing?.clock_in || !existing?.clock_out) {
        return Response.json({ error: 'Payroll decisions require a completed time entry' }, { status: 400 });
      }

      const actualHours = Number(actualPaidHours(existing).toFixed(4));
      let approvedHours = actualHours;
      if (decision === 'deny_overage_pay') {
        approvedHours = Number(body.approved_hours);
        if (!Number.isFinite(approvedHours) || approvedHours < 0 || approvedHours > actualHours) {
          return Response.json({ error: `Approved payroll hours must be between 0 and ${actualHours.toFixed(2)}` }, { status: 400 });
        }
        approvedHours = Number(approvedHours.toFixed(4));
      }

      const now = new Date().toISOString();
      const performanceException = decision === 'relief_delay_approved';
      const performanceOverageCounted = decision !== 'relief_delay_approved';
      const reliefOfficerEmail = decision === 'relief_delay_approved'
        ? String(body.relief_officer_email || '').trim().toLowerCase()
        : '';

      const update = {
        payroll_adjustment_decision: decision,
        payroll_hours_override: approvedHours,
        actual_hours_snapshot: actualHours,
        approved_hours_snapshot: approvedHours,
        performance_exception: performanceException,
        performance_overage_counted: performanceOverageCounted,
        payroll_adjustment_reason: reason,
        relief_officer_email: reliefOfficerEmail,
        payroll_adjusted_by: String(user.email || ''),
        payroll_adjusted_at: now,
      };

      const entry = await base44.asServiceRole.entities.TimeEntry.update(body.id, update);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'TimeEntry',
        entity_id: body.id,
        action: 'payroll_adjustment_decision',
        actor_id: user.id,
        actor_name: user.full_name || user.email,
        before_value: JSON.stringify({
          clock_in: existing.clock_in,
          clock_out: existing.clock_out,
          payroll_adjustment_decision: existing.payroll_adjustment_decision || '',
          payroll_hours_override: existing.payroll_hours_override ?? null,
        }),
        after_value: JSON.stringify(update),
        notes: reason,
        timestamp: now,
      }).catch(() => null);

      const payrollEntriesUpdated = await syncTouchedPayrollRecords(base44, [entry]);

      return Response.json({
        success: true,
        entry,
        actual_hours: actualHours,
        approved_hours: approvedHours,
        payroll_entries_updated: payrollEntriesUpdated,
        true_punches_preserved: true,
      });
    }

    if (action === 'create') {
      const data = body.data || {};
      if (!data.officer_email || !data.clock_in) {
        return Response.json({ error: 'Officer and clock-in time are required' }, { status: 400 });
      }
      for (const field of PAYROLL_FIELDS) delete data[field];
      const entry = await base44.asServiceRole.entities.TimeEntry.create(data);
      const payrollEntriesUpdated = entry.clock_out ? await syncTouchedPayrollRecords(base44, [entry]) : 0;
      return Response.json({ success: true, entry, payroll_entries_updated: payrollEntriesUpdated });
    }

    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Time entry ID is required' }, { status: 400 });
      const data = body.data || {};
      if (Object.keys(data).some(field => PAYROLL_FIELDS.has(field))) {
        return Response.json({ error: 'Use the audited payroll decision action for payroll fields' }, { status: 400 });
      }
      const existing = await base44.asServiceRole.entities.TimeEntry.get(body.id);
      const entry = await base44.asServiceRole.entities.TimeEntry.update(body.id, data);
      const payrollEntriesUpdated = await syncTouchedPayrollRecords(base44, [existing, entry]);
      return Response.json({ success: true, entry, payroll_entries_updated: payrollEntriesUpdated });
    }

    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Time entry ID is required' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.TimeEntry.get(body.id);
      await base44.asServiceRole.entities.TimeEntry.delete(body.id);
      const payrollEntriesUpdated = await syncTouchedPayrollRecords(base44, [existing]);
      return Response.json({ success: true, payroll_entries_updated: payrollEntriesUpdated });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageHRTimeEntries failed', error);
    return Response.json({ error: error?.message || 'Unable to manage HR time entries' }, { status: 500 });
  }
});
