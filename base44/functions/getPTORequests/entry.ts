import { createClientFromRequest } from 'npm:@base44/sdk';

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

    if (action === 'ensure_admin_grants') {
      // Legacy compatibility only. Automatic grants are intentionally disabled.
      // PTO grants/bonuses now live in PTOAdjustment and are never created on page load.
      return Response.json({ success: true, granted: 0, synchronized: 0, disabled: true });
    }

    if (action === 'list') {
      const requests = await base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 5000);
      const visibleRequests = (requests || []).filter((entry: any) => {
        if (entry.reason === 'PTO workflow verification record') return false;
        // Balance adjustments are not leave requests and must never appear in PTO request history.
        if (/^PTO Bonus\b|^Admin PTO Grant\b|^Manual PTO\b|^Manual sick time\b/i.test(String(entry.admin_notes || ''))) return false;
        if (/^Annual administrative PTO grant$/i.test(String(entry.reason || ''))) return false;
        return true;
      });
      if (hasHR) return Response.json({ success: true, requests: visibleRequests });
      const myEmail = String(user.email || '').toLowerCase();
      const myId = String(user.id || '');
      const mine = visibleRequests.filter((entry: any) => {
        const requestEmail = String(entry.requested_by_email || entry.created_by || '').toLowerCase();
        const creatorId = String(entry.created_by_id || '');
        return requestEmail === myEmail || (!!myId && creatorId === myId);
      });
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

      const users = await base44.asServiceRole.entities.User.list();
      const creatorOfficer = (users || []).find((entry: any) => String(entry.id || '') === String(request.created_by_id || ''));
      const officerEmail = request.requested_by_email || request.created_by || creatorOfficer?.email;
      if (status === 'approved' && request.request_type === 'paid' && officerEmail) {
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
      const users = await base44.asServiceRole.entities.User.list();
      const creatorOfficer = (users || []).find((entry: any) => String(entry.id || '') === String(request.created_by_id || ''));
      const officerEmail = request.requested_by_email || request.created_by || creatorOfficer?.email;
      if (request.request_type === 'paid' && officerEmail && hours > 0) {
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
        admin_notes: admin_notes || `Approved PTO was cancelled by HR. ${hours.toFixed(1)} hours were returned to the officer's PTO balance.`,
      });
      return Response.json({ success: true, removed_from_hr: true, restored_hours: request.request_type === 'paid' ? hours : 0 });
    }

    if (action === 'bonus') {
      const { officer_email, hours, reason = '' } = body;
      if (!officer_email || !hours || Number(hours) <= 0) {
        return Response.json({ error: 'Officer and positive bonus hours are required' }, { status: 400 });
      }
      const users = await base44.asServiceRole.entities.User.list();
      const officer = (users || []).find((entry: any) => String(entry.email || '').toLowerCase() === String(officer_email).toLowerCase());
      if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });
      const amount = Number(hours);
      const now = new Date();
      const record = await base44.asServiceRole.entities.PTOAdjustment.create({
        officer_email: String(officer.email || officer_email).toLowerCase(),
        officer_id: String(officer.id),
        hours: amount,
        adjustment_type: 'bonus',
        reason: reason || 'PTO bonus awarded by HR',
        granted_by: user.email,
        granted_at: now.toISOString(),
        year: now.getFullYear(),
        active: true,
        source_key: `bonus:${officer.id}:${crypto.randomUUID()}`,
      });
      const newBalance = Number(officer.pto_balance_hours || 0) + amount;
      await base44.asServiceRole.entities.User.update(officer.id, { pto_balance_hours: newBalance });
      return Response.json({ success: true, adjustment: record, hours_added: amount, balance: newBalance });
    }

    if (action === 'manual') {
      const { officer_email, hours, reason = '' } = body;
      if (!officer_email || !hours || Number(hours) <= 0) {
        return Response.json({ error: 'Officer and positive PTO hours are required' }, { status: 400 });
      }
      const users = await base44.asServiceRole.entities.User.list();
      const officer = (users || []).find((entry: any) => String(entry.email).toLowerCase() === String(officer_email).toLowerCase());
      if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });
      const amount = Number(hours);
      const now = new Date();
      const record = await base44.asServiceRole.entities.PTOAdjustment.create({
        officer_email: String(officer.email || officer_email).toLowerCase(),
        officer_id: String(officer.id),
        hours: amount,
        adjustment_type: 'manual_correction',
        reason: reason || 'PTO balance adjustment by HR',
        granted_by: user.email,
        granted_at: now.toISOString(),
        year: now.getFullYear(),
        active: true,
        source_key: `manual:${officer.id}:${crypto.randomUUID()}`,
      });
      const newBalance = Number(officer.pto_balance_hours || 0) + amount;
      await base44.asServiceRole.entities.User.update(officer.id, { pto_balance_hours: newBalance });
      return Response.json({ success: true, adjustment: record, hours_added: amount, balance: newBalance });
    }

    return Response.json({ error: 'Unsupported PTO action' }, { status: 400 });
  } catch (error) {
    console.error('getPTORequests failed', error);
    return Response.json({ error: error?.message || 'Unable to process PTO request' }, { status: 500 });
  }
});