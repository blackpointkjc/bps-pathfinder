import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const normalizeRoles = (user: any) => new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'list';
    const roles = normalizeRoles(user);
    const hasHR = user.role === 'admin' || roles.has('hr') || roles.has('full_access');

    if (action === 'list') {
      const requests = await base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 5000);
      const visibleRequests = (requests || []).filter((entry: any) => entry.reason !== 'PTO workflow verification record');
      if (hasHR) return Response.json({ success: true, requests: visibleRequests });
      const mine = visibleRequests.filter((entry: any) =>
        String(entry.requested_by_email || entry.created_by || '').toLowerCase() === String(user.email || '').toLowerCase()
      );
      return Response.json({ success: true, requests: mine });
    }

    if (action === 'submit') {
      const { start_date, end_date, reason, request_type = 'paid', hours_requested = 0, pto_balance_at_request = 0 } = body;
      if (!start_date || !end_date || !reason) {
        return Response.json({ error: 'Start date, end date, and reason are required' }, { status: 400 });
      }
      const created = await base44.asServiceRole.entities.TimeOffRequest.create({
        start_date,
        end_date,
        reason,
        request_type,
        hours_requested: Number(hours_requested || 0),
        pto_balance_at_request: Number(pto_balance_at_request || 0),
        status: 'pending',
        requested_by_email: user.email,
        requested_by_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
      });
      return Response.json({ success: true, request: created });
    }

    if (!hasHR) return Response.json({ error: 'HR access required' }, { status: 403 });

    if (action === 'review') {
      const { request_id, status, admin_notes = '' } = body;
      if (!request_id || !['approved', 'denied'].includes(status)) {
        return Response.json({ error: 'A request and valid decision are required' }, { status: 400 });
      }
      const all = await base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 5000);
      const request = (all || []).find((entry: any) => entry.id === request_id);
      if (!request) return Response.json({ error: 'PTO request not found' }, { status: 404 });

      await base44.asServiceRole.entities.TimeOffRequest.update(request_id, {
        status,
        admin_notes,
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString(),
      });

      const officerEmail = request.requested_by_email || request.created_by;
      if (status === 'approved' && request.request_type === 'paid' && officerEmail) {
        const users = await base44.asServiceRole.entities.User.list();
        const officer = (users || []).find((entry: any) => String(entry.email).toLowerCase() === String(officerEmail).toLowerCase());
        if (officer?.id) {
          const hours = Number(request.hours_requested || 0);
          await base44.asServiceRole.entities.User.update(officer.id, {
            pto_balance_hours: Math.max(0, Number(officer.pto_balance_hours || 0) - hours),
            pto_year_to_date_used: Number(officer.pto_year_to_date_used || 0) + hours,
          });
        }
      }
      return Response.json({ success: true });
    }

    if (action === 'cancel_approved') {
      const { request_id, admin_notes = '' } = body;
      if (!request_id) return Response.json({ error: 'PTO request is required' }, { status: 400 });
      const all = await base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 5000);
      const request = (all || []).find((entry: any) => entry.id === request_id);
      if (!request) return Response.json({ error: 'PTO request not found' }, { status: 404 });
      if (request.status !== 'approved') return Response.json({ error: 'Only approved PTO requests can be removed' }, { status: 400 });
      if (String(request.admin_notes || '').startsWith('Manual ')) return Response.json({ error: 'Manual balance entries must be corrected from Manual PTO' }, { status: 400 });

      const hours = Number(request.hours_requested || 0);
      const officerEmail = request.requested_by_email || request.created_by;
      if (request.request_type === 'paid' && officerEmail && hours > 0) {
        const users = await base44.asServiceRole.entities.User.list();
        const officer = (users || []).find((entry: any) => String(entry.email || '').toLowerCase() === String(officerEmail).toLowerCase());
        if (!officer?.id) return Response.json({ error: 'Officer account not found; hours were not changed' }, { status: 404 });
        await base44.asServiceRole.entities.User.update(officer.id, {
          pto_balance_hours: Number(officer.pto_balance_hours || 0) + hours,
          pto_year_to_date_used: Math.max(0, Number(officer.pto_year_to_date_used || 0) - hours),
        });
      }

      await base44.asServiceRole.entities.TimeOffRequest.update(request_id, {
        status: 'cancelled',
        cancelled_by: user.email,
        cancelled_date: new Date().toISOString(),
        hours_restored: request.request_type === 'paid' ? hours : 0,
        admin_notes: [request.admin_notes, admin_notes || 'Approved PTO removed by HR; hours restored.'].filter(Boolean).join(' | '),
      });
      return Response.json({ success: true, restored_hours: request.request_type === 'paid' ? hours : 0 });
    }

    if (action === 'manual') {
      const { officer_email, start_date, end_date, pto_type = 'pto', hours, reason = '', remove_shifts = true } = body;
      if (!officer_email || !start_date || !end_date || !hours) {
        return Response.json({ error: 'Officer, dates, and hours are required' }, { status: 400 });
      }
      const users = await base44.asServiceRole.entities.User.list();
      const officer = (users || []).find((entry: any) => String(entry.email).toLowerCase() === String(officer_email).toLowerCase());
      if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });
      const amount = Number(hours);
      if (pto_type === 'pto') {
        await base44.asServiceRole.entities.User.update(officer.id, {
          pto_balance_hours: Number(officer.pto_balance_hours || 0) + amount,
        });
      } else {
        await base44.asServiceRole.entities.User.update(officer.id, {
          sick_time_balance_hours: Number(officer.sick_time_balance_hours || 0) + amount,
        });
      }

      if (remove_shifts) {
        const schedules = await base44.asServiceRole.entities.Schedule.list('-shift_date', 5000);
        const affected = (schedules || []).filter((shift: any) => shift.officer_email === officer_email && shift.shift_date >= start_date && shift.shift_date <= end_date && !shift.is_open);
        for (const shift of affected) {
          await base44.asServiceRole.entities.Schedule.update(shift.id, { officer_email: 'OPEN', is_open: true });
        }
      }

      const record = await base44.asServiceRole.entities.TimeOffRequest.create({
        start_date,
        end_date,
        reason: reason || `Manual ${pto_type === 'pto' ? 'PTO' : 'sick time'} entry by HR`,
        request_type: pto_type === 'pto' ? 'paid' : 'unpaid',
        hours_requested: amount,
        pto_balance_at_request: Number(officer.pto_balance_hours || 0),
        status: 'approved',
        requested_by_email: officer_email,
        requested_by_name: [officer.first_name, officer.last_name].filter(Boolean).join(' ') || officer_email,
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString(),
        admin_notes: `Manual ${pto_type === 'pto' ? 'PTO' : 'sick time'} entry`,
      });
      return Response.json({ success: true, request: record });
    }

    return Response.json({ error: 'Unsupported PTO action' }, { status: 400 });
  } catch (error) {
    console.error('getPTORequests failed', error);
    return Response.json({ error: error?.message || 'Unable to process PTO request' }, { status: 500 });
  }
});