import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (!roles.has('officer') && user.role !== 'admin' && !roles.has('full_access')) {
      return Response.json({ error: 'Officer access required' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const shiftId = String(body.shift_id || '');
    if (!shiftId) return Response.json({ error: 'Shift is required' }, { status: 400 });

    const shift = await base44.asServiceRole.entities.Schedule.get(shiftId);
    if (!shift) return Response.json({ error: 'Shift not found' }, { status: 404 });
    if (!shift.is_open || String(shift.officer_email || '').toUpperCase() !== 'OPEN') {
      return Response.json({ error: 'This shift is no longer available' }, { status: 409 });
    }

    const pto = await base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 5000);
    const onApprovedLeave = (pto || []).some((request: any) => {
      const email = String(request.requested_by_email || request.created_by || '').toLowerCase();
      const status = String(request.status || '').toLowerCase();
      return email === String(user.email).toLowerCase() && status === 'approved' && shift.shift_date >= String(request.start_date || '').slice(0, 10) && shift.shift_date <= String(request.end_date || '').slice(0, 10);
    });
    if (onApprovedLeave) return Response.json({ error: 'You cannot claim a shift during approved time off' }, { status: 409 });

    await base44.asServiceRole.entities.Schedule.update(shiftId, { officer_email: user.email, is_open: false });
    return Response.json({ success: true, shift_id: shiftId });
  } catch (error) {
    console.error('claimOpenShift failed', error);
    return Response.json({ error: error?.message || 'Unable to claim shift' }, { status: 500 });
  }
});
