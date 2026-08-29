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

      return Response.json({
        success: true,
        entry,
        actual_hours: actualHours,
        approved_hours: approvedHours,
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
      return Response.json({ success: true, entry });
    }

    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Time entry ID is required' }, { status: 400 });
      const data = body.data || {};
      if (Object.keys(data).some(field => PAYROLL_FIELDS.has(field))) {
        return Response.json({ error: 'Use the audited payroll decision action for payroll fields' }, { status: 400 });
      }
      const entry = await base44.asServiceRole.entities.TimeEntry.update(body.id, data);
      return Response.json({ success: true, entry });
    }

    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Time entry ID is required' }, { status: 400 });
      await base44.asServiceRole.entities.TimeEntry.delete(body.id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageHRTimeEntries failed', error);
    return Response.json({ error: error?.message || 'Unable to manage HR time entries' }, { status: 500 });
  }
});
