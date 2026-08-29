import { createClientFromRequest } from 'npm:@base44/sdk';

const round = (value: number, digits = 2) => Number(Number(value || 0).toFixed(digits));
const dateOnly = (value: unknown) => {
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return '';
  // Payroll periods are company Eastern dates. Convert time-entry timestamps to
  // the same zone before comparing them to period boundaries; UTC slicing can
  // move late-evening shifts into the wrong payroll period.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

function paidHours(entry: any) {
  const start = new Date(entry.clock_in).getTime();
  const end = new Date(entry.clock_out).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const breakMs = (Array.isArray(entry.break_periods) ? entry.break_periods : []).reduce((total: number, period: any) => {
    const breakStart = new Date(period?.start).getTime();
    const breakEnd = new Date(period?.end).getTime();
    if (!Number.isFinite(breakStart) || !Number.isFinite(breakEnd) || breakEnd <= breakStart) return total;
    return total + Math.max(0, Math.min(end, breakEnd) - Math.max(start, breakStart));
  }, 0);
  const actualHours = Math.max(0, (end - start - breakMs) / 3600000);
  if (!entry?.payroll_adjustment_decision) return actualHours;
  const approvedHours = Number(entry.payroll_hours_override);
  return Number.isFinite(approvedHours) && approvedHours >= 0 ? approvedHours : actualHours;
}

function sundayKey(value: unknown) {
  const date = new Date(String(value));
  const sunday = new Date(date);
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  return sunday.toISOString().slice(0, 10);
}

function holidayName(value: unknown) {
  const date = new Date(String(value));
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  const week = Math.ceil(day / 7);
  if (month === 1 && day === 1) return "New Year's Day";
  if (month === 1 && weekday === 1 && week === 3) return 'Martin Luther King Jr. Day';
  if (month === 6 && day === 19) return 'Juneteenth';
  if (month === 7 && day === 4) return 'Independence Day';
  if (month === 11 && weekday === 4 && week === 4) return 'Thanksgiving Day';
  if (month === 12 && day === 25) return 'Christmas Day';
  return '';
}

function annualFederalTax(taxable: number, status: string) {
  if (status === 'married_joint') {
    if (taxable <= 23200) return taxable * .10;
    if (taxable <= 94300) return 2320 + (taxable - 23200) * .12;
    if (taxable <= 201050) return 10852 + (taxable - 94300) * .22;
    if (taxable <= 383900) return 34337 + (taxable - 201050) * .24;
    if (taxable <= 487450) return 78221 + (taxable - 383900) * .32;
    if (taxable <= 731200) return 111357 + (taxable - 487450) * .35;
    return 196669.5 + (taxable - 731200) * .37;
  }
  if (status === 'head_of_household') {
    if (taxable <= 16550) return taxable * .10;
    if (taxable <= 63100) return 1655 + (taxable - 16550) * .12;
    if (taxable <= 100500) return 7241 + (taxable - 63100) * .22;
    if (taxable <= 191950) return 15469 + (taxable - 100500) * .24;
    if (taxable <= 243700) return 37417 + (taxable - 191950) * .32;
    if (taxable <= 609350) return 53977 + (taxable - 243700) * .35;
    return 181954.5 + (taxable - 609350) * .37;
  }
  if (taxable <= 11600) return taxable * .10;
  if (taxable <= 47150) return 1160 + (taxable - 11600) * .12;
  if (taxable <= 100525) return 5426 + (taxable - 47150) * .22;
  if (taxable <= 191950) return 17168.5 + (taxable - 100525) * .24;
  if (taxable <= 243725) return 39110.5 + (taxable - 191950) * .32;
  if (taxable <= 609350) return 55678.5 + (taxable - 243725) * .35;
  return 183647.25 + (taxable - 609350) * .37;
}

function withholding(gross: number, officer: any, payPeriods: number) {
  let annualWages = gross * payPeriods + Number(officer.w4_step4a_other_income || 0);
  annualWages = Math.max(0, annualWages - Number(officer.w4_step4b_deductions || 0));
  const filing = officer.tax_filing_status || 'single';
  const standard = filing === 'married_joint' ? 29200 : filing === 'head_of_household' ? 21900 : 14600;
  let federal = Math.max(0, annualFederalTax(Math.max(0, annualWages - standard), filing) - Number(officer.w4_step3_dependents_amount || 0));
  federal = federal / payPeriods + Number(officer.w4_step4c_extra_withholding || 0);
  if (officer.exempt_from_federal_tax) federal = 0;

  let state = 0;
  if (officer.work_state === 'VA') {
    state = gross <= 3000 ? gross * .02 : gross <= 5000 ? 60 + (gross - 3000) * .03 : gross <= 17000 ? 120 + (gross - 5000) * .05 : 720 + (gross - 17000) * .0575;
  } else if (officer.work_state === 'MD') state = gross * .0575;
  else if (officer.work_state === 'DC') state = gross * .065;
  else if (officer.work_state === 'NC') state = gross * .0475;
  state = Math.max(0, state - Number(officer.state_withholding_allowances || 0) * 38.46);
  if (officer.exempt_from_state_tax) state = 0;
  return { federal, state };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const manualRun = body.force === true || Boolean(body.period_id) || ['run_now', 'preview'].includes(String(body.action || '').toLowerCase());
    if (manualRun) {
      const caller = await base44.auth.me().catch(() => null);
      if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const callerRoles = new Set((caller.additional_roles || []).map((r: string) => String(r).toLowerCase()));
      if (caller.role !== 'admin' && !callerRoles.has('full_access') && !callerRoles.has('accounting')) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find(item => item.type === type)?.value || '';
    const easternHour = Number(part('hour'));
    const easternToday = `${part('year')}-${part('month')}-${part('day')}`;
    const yesterday = new Date(`${easternToday}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const endedDate = yesterday.toISOString().slice(0, 10);

    // Scheduled payroll becomes eligible at 8:00 AM Eastern on the day after
    // the configured period ends. Hourly runs after 8 AM safely catch up a
    // missed execution; authorized manual runs are available at any time after
    // the period end date.
    if (!manualRun && easternHour < 8) {
      return Response.json({ success: true, skipped: true, reason: 'Scheduled payroll begins at 8:00 AM Eastern' });
    }

    // The period end-date check below remains the authoritative safety boundary.
    // Read sequentially rather than issuing six large entity reads at once. The
    // prior Promise.all burst could be throttled and surfaced to the page as a 500.
    const periods = await base44.asServiceRole.entities.PayrollPeriod.list('start_date', 1000);
    const users = await base44.asServiceRole.entities.User.list(undefined, 2000);
    const existingPayroll = await base44.asServiceRole.entities.PayrollEntry.list('-created_date', 5000);
    const configs = await base44.asServiceRole.entities.PayrollConfig.list(undefined, 20);
    const ptoUsage = await base44.asServiceRole.entities.PTOUsage.list('-usage_date', 5000);
    const expenseReports = await base44.asServiceRole.entities.ExpenseReport.list('-expense_date', 5000);
    const entries = await base44.asServiceRole.entities.TimeEntry.list('-clock_in', 10000);
    const usersByEmail = new Map((users || []).map((user: any) => [String(user.email || '').toLowerCase(), user]));
    const payrollKey = (item: any) =>
      `${String(item.officer_email || '').toLowerCase()}|${item.pay_period_start}|${item.pay_period_end}`;
    const existingKeys = new Set((existingPayroll || []).map(payrollKey));
    const existingByKey = new Map((existingPayroll || []).map((item: any) => [payrollKey(item), item]));
    const recalculateExisting = manualRun && body.force === true;
    const hasMissingEligibleOfficer = (candidate: any) => {
      const eligibleEmails = new Set<string>();
      for (const timeEntry of entries || []) {
        const day = dateOnly(timeEntry.clock_in);
        if (!timeEntry.clock_in || !timeEntry.clock_out || timeEntry.archived === true || day < candidate.start_date || day > candidate.end_date) continue;
        const email = String(timeEntry.officer_email || '').toLowerCase();
        const officer = usersByEmail.get(email) as any;
        if (email && officer && Number(officer.hourly_rate || 0) > 0) eligibleEmails.add(email);
      }
      for (const usage of ptoUsage || []) {
        if (usage.status !== 'active' || usage.usage_date < candidate.start_date || usage.usage_date > candidate.end_date) continue;
        const email = String(usage.officer_email || '').toLowerCase();
        const officer = usersByEmail.get(email) as any;
        if (email && officer && Number(officer.hourly_rate || 0) > 0) eligibleEmails.add(email);
      }
      for (const expense of expenseReports || []) {
        if (expense.status !== 'approved' || !expense.expense_date || expense.expense_date < candidate.start_date || expense.expense_date > candidate.end_date) continue;
        const email = String(expense.officer_email || '').toLowerCase();
        const officer = usersByEmail.get(email) as any;
        if (email && officer) eligibleEmails.add(email);
      }
      return [...eligibleEmails].some(email => !existingKeys.has(`${email}|${candidate.start_date}|${candidate.end_date}`));
    };
    const period = body.period_id
      ? (periods || []).find((item: any) => item.id === body.period_id)
      : [...(periods || [])]
          .filter((item: any) => item.end_date <= endedDate)
          .sort((a: any, b: any) => String(a.end_date).localeCompare(String(b.end_date)))
          .find(hasMissingEligibleOfficer);
    if (!period) return Response.json({ success: true, skipped: true, reason: `No incomplete payroll period ended on or before ${endedDate}` });
    if (body.period_id && !recalculateExisting && !hasMissingEligibleOfficer(period)) {
      return Response.json({ success: true, skipped: true, period_id: period.id, period_name: period.period_name, reason: 'Every eligible officer already has a payroll record for this period' });
    }

    const config = configs?.[0] || {};
    const threshold = Number(config.overtime_threshold_hours || 40);
    const overtimeMultiplier = Number(config.overtime_multiplier || 1.5);
    const holidayMultiplier = Number(config.holiday_multiplier || 2);
    const grouped = new Map<string, any>();

    for (const timeEntry of entries || []) {
      const day = dateOnly(timeEntry.clock_in);
      if (!timeEntry.clock_in || !timeEntry.clock_out || timeEntry.archived === true || day < period.start_date || day > period.end_date) continue;
      const email = String(timeEntry.officer_email || '').toLowerCase();
      const officer = usersByEmail.get(email) as any;
      if (!officer || Number(officer.hourly_rate || 0) <= 0) continue;
      if (!grouped.has(email)) grouped.set(email, { officer, weekly: {}, holidays: [] });
      const data = grouped.get(email);
      const hours = paidHours(timeEntry);
      const holiday = holidayName(timeEntry.clock_in);
      if (holiday) data.holidays.push({ date: day, name: holiday, hours });
      else {
        const week = sundayKey(timeEntry.clock_in);
        data.weekly[week] = Number(data.weekly[week] || 0) + hours;
      }
    }

    let created = 0;
    let updated = 0;
    let duplicates = 0;
    const skippedNoRate: string[] = [];
    // Ensure officers who only have PTO or an approved reimbursement in the
    // period still receive a payroll row.
    for (const usage of ptoUsage || []) {
      if (usage.status !== 'active' || usage.usage_date < period.start_date || usage.usage_date > period.end_date) continue;
      const email = String(usage.officer_email || '').toLowerCase();
      const officer = usersByEmail.get(email) as any;
      if (!officer || Number(officer.hourly_rate || 0) <= 0) continue;
      if (!grouped.has(email)) grouped.set(email, { officer, weekly: {}, holidays: [] });
    }
    for (const expense of expenseReports || []) {
      if (expense.status !== 'approved' || !expense.expense_date || expense.expense_date < period.start_date || expense.expense_date > period.end_date) continue;
      const email = String(expense.officer_email || '').toLowerCase();
      const officer = usersByEmail.get(email) as any;
      if (!email || !officer) continue;
      if (!grouped.has(email)) grouped.set(email, { officer, weekly: {}, holidays: [] });
    }

    for (const [email, data] of grouped.entries()) {
      const key = `${email}|${period.start_date}|${period.end_date}`;
      const existingForKey = existingByKey.get(key);
      if (existingForKey && !recalculateExisting) { duplicates += 1; continue; }
      const officer = data.officer;
      const baseRate = Number(officer.hourly_rate);
      const overtimeRate = Number(officer.overtime_rate_override || baseRate * overtimeMultiplier);
      const holidayRate = Number(officer.holiday_rate_override || baseRate * holidayMultiplier);
      let regularHours = 0;
      let overtimeHours = 0;
      Object.values(data.weekly).forEach((hours: any) => {
        regularHours += Math.min(Number(hours), threshold);
        overtimeHours += Math.max(0, Number(hours) - threshold);
      });
      const holidayHours = data.holidays.reduce((sum: number, item: any) => sum + item.hours, 0);
      const officerPto = (ptoUsage || []).filter((usage: any) =>
        usage.status === 'active' &&
        String(usage.officer_email || '').toLowerCase() === email &&
        usage.usage_date >= period.start_date && usage.usage_date <= period.end_date
      );
      const ptoHours = officerPto.reduce((sum: number, usage: any) => sum + Number(usage.hours || 0), 0);
      const regularPay = regularHours * baseRate;
      const overtimePay = overtimeHours * overtimeRate;
      const holidayPay = holidayHours * holidayRate;
      // PTO is always paid at straight-time base rate and never contributes toward
      // the weekly overtime threshold. Only hours actually worked create overtime.
      const ptoPay = ptoHours * baseRate;
      const gross = regularPay + overtimePay + holidayPay + ptoPay;
      const officerExpenses = (expenseReports || []).filter((expense: any) =>
        expense.status === 'approved' &&
        String(expense.officer_email || '').toLowerCase() === email &&
        expense.expense_date >= period.start_date && expense.expense_date <= period.end_date
      );
      const reimbursementTotal = round(officerExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0));
      // Approved expenses are reimbursements, not taxable wages. Keep gross pay
      // unchanged and add reimbursement only to the amount paid to the officer.
      const net = gross + reimbursementTotal;

      const payrollData = {
        officer_email: email,
        pay_period_start: period.start_date,
        pay_period_end: period.end_date,
        pay_date: period.deposit_date || period.end_date,
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
        tax_free_reimbursements: reimbursementTotal,
        expense_reimbursement_detail: JSON.stringify(officerExpenses.map((expense: any) => ({
          expense_id: expense.id,
          expense_date: expense.expense_date,
          category: expense.category,
          amount: Number(expense.amount || 0),
          description: expense.description || '',
          tax_free: true,
        }))),
        total_payment_due: round(gross + reimbursementTotal),
        federal_tax: 0,
        state_tax: 0,
        social_security: 0,
        medicare: 0,
        other_deductions: 0,
        net_pay: round(net),
        qualified_overtime_premium: 0,
        qualified_tips: 0,
        tip_occupation_code: '000',
        holidays_worked: JSON.stringify(data.holidays),
        pto_detail: JSON.stringify(officerPto.map((usage: any) => ({ date: usage.usage_date, hours: Number(usage.hours || 0), reason: usage.reason || '', source_type: usage.source_type || '' }))),
        payment_method: officer.payment_method || 'direct_deposit',
        notes: `${existingForKey ? 'Recalculated' : 'Automatically generated'} after ${period.period_name || 'payroll period'} ended.${reimbursementTotal > 0 ? ` Includes $${reimbursementTotal.toFixed(2)} in tax-free expense reimbursements.` : ''}`,
        last_recalculated_at: new Date().toISOString(),
        payroll_source: existingForKey ? 'manual_recalculation' : 'scheduled_generation',
      };
      const payrollEntry = existingForKey
        ? await base44.asServiceRole.entities.PayrollEntry.update(existingForKey.id, payrollData)
        : await base44.asServiceRole.entities.PayrollEntry.create({ ...payrollData, status: 'ready' });
      if (existingForKey) updated += 1;
      else created += 1;
      for (const expense of officerExpenses) {
        await base44.asServiceRole.entities.ExpenseReport.update(expense.id, {
          payroll_period_id: period.id,
          payroll_entry_id: payrollEntry.id,
          payroll_attached_at: new Date().toISOString(),
          tax_free: true,
        }).catch(() => null);
      }
    }

    if (period.status !== 'closed') await base44.asServiceRole.entities.PayrollPeriod.update(period.id, { status: 'closed' });
    const next = (periods || []).filter((item: any) => item.start_date > period.end_date).sort((a: any, b: any) => a.start_date.localeCompare(b.start_date))[0];
    if (next && next.status !== 'current') await base44.asServiceRole.entities.PayrollPeriod.update(next.id, { status: 'current' });

    const accountingUsers = (users || []).filter((user: any) => {
      const roles = (user.additional_roles || []).map((role: unknown) => String(role).toLowerCase());
      return user.role === 'admin' || roles.includes('accounting') || roles.includes('full_access');
    });
    for (const user of accountingUsers) {
      if (!user.email) continue;
      await base44.asServiceRole.entities.Notification.create({
        recipient_email: user.email,
        recipient_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        type: 'payroll',
        priority: 'high',
        title: `Payroll ${updated > 0 ? 'recalculated' : 'ready'}: ${period.period_name}`,
        message: `${created} payroll report record(s) created and ${updated} recalculated for ${period.start_date} through ${period.end_date}. Open Payroll to review the current approved hours and amounts.`, 
        action_url: '/AccountingCenter?section=payroll',
        read: false,
      });
    }

    return Response.json({ success: true, period_id: period.id, period_name: period.period_name, created, updated, duplicates, skipped_no_rate: skippedNoRate });
  } catch (error) {
    console.error('generateScheduledPayroll failed', error);
    return Response.json({ error: error?.message || 'Unable to generate scheduled payroll' }, { status: 500 });
  }
});