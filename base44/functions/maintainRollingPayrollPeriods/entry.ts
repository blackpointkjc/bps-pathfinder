import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const DAY = 24 * 60 * 60 * 1000;
const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const fmt = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => fmt(new Date(parseDate(value).getTime() + days * DAY));
const diffDays = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || roles.has('accounting') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Accounting access required' }, { status: 403 });

    const periods = await base44.asServiceRole.entities.PayrollPeriod.list('start_date', 1000);
    const sorted = [...(periods || [])].sort((a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date)));
    if (sorted.length < 3) {
      return Response.json({ error: 'Enter the first three payroll periods before generating the rolling schedule.' }, { status: 400 });
    }

    const seed = sorted.slice(0, 3);
    const startIntervals = [diffDays(seed[0].start_date, seed[1].start_date), diffDays(seed[1].start_date, seed[2].start_date)];
    const cycleDays = Math.round((startIntervals[0] + startIntervals[1]) / 2);
    const periodLength = Math.round(seed.reduce((sum: number, p: any) => sum + diffDays(p.start_date, p.end_date) + 1, 0) / 3);
    const depositOffset = Math.round(seed.reduce((sum: number, p: any) => sum + diffDays(p.end_date, p.deposit_date), 0) / 3);
    if (cycleDays < 7 || cycleDays > 31 || periodLength < 7 || periodLength > 31) {
      return Response.json({ error: 'The first three periods do not form a reliable repeating pattern.' }, { status: 400 });
    }

    const now = new Date();
    const horizon = new Date(Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate(), 12));
    const existingStarts = new Set(sorted.map((p: any) => p.start_date));
    const generated: any[] = [];
    let cursor = sorted[sorted.length - 1];
    let nextNumber = Number(cursor.period_number || 0) + 1;
    let guard = 0;

    while (parseDate(cursor.end_date) < horizon && guard++ < 100) {
      const startDate = addDays(cursor.start_date, cycleDays);
      const endDate = addDays(startDate, periodLength - 1);
      const depositDate = addDays(endDate, depositOffset);
      const year = Number(startDate.slice(0, 4));
      if (nextNumber > 27) nextNumber = 1;
      const periodName = `PP ${String(nextNumber).padStart(2, '0')}-${year}`;
      const today = fmt(now);
      const row = {
        period_name: periodName,
        start_date: startDate,
        end_date: endDate,
        deposit_date: depositDate,
        year,
        period_number: nextNumber,
        status: today < startDate ? 'upcoming' : today <= endDate ? 'current' : 'closed',
      };
      if (!existingStarts.has(startDate)) {
        generated.push(row);
        existingStarts.add(startDate);
      }
      cursor = row;
      nextNumber += 1;
    }

    if (generated.length) await base44.asServiceRole.entities.PayrollPeriod.bulkCreate(generated);

    const all = await base44.asServiceRole.entities.PayrollPeriod.list('start_date', 1000);
    const today = fmt(now);
    await Promise.all((all || []).map((period: any) => {
      const status = today < period.start_date ? 'upcoming' : today <= period.end_date ? 'current' : 'closed';
      return period.status === status ? Promise.resolve() : base44.asServiceRole.entities.PayrollPeriod.update(period.id, { status });
    }));

    return Response.json({ success: true, created: generated.length, through: generated.at(-1)?.end_date || cursor.end_date, pattern: { cycleDays, periodLength, depositOffset } });
  } catch (error) {
    console.error('maintainRollingPayrollPeriods failed', error);
    return Response.json({ error: error?.message || 'Unable to maintain payroll periods' }, { status: 500 });
  }
});