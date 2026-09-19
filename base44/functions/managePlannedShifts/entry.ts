import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const ALLOWED_FIELDS = [
  'location','day_of_week','specific_date','shift_type','start_time','end_time',
  'preferred_officers','num_officers','priority','is_required','notes','active'
];

function cleanData(input: any) {
  const output: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) if (input?.[field] !== undefined) output[field] = input[field];
  if (Array.isArray(output.preferred_officers)) {
    output.preferred_officers = [...new Set((output.preferred_officers as any[]).map(value => lower(value)).filter(Boolean))].slice(0, 3);
  }
  if (output.num_officers !== undefined) output.num_officers = Math.max(1, Math.min(10, Number(output.num_officers) || 1));
  return output;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const allowed = user.role === 'admin' || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Administrator or full-access permission is required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = lower(body.action || 'list');

    if (action === 'list') {
      const rows = await base44.asServiceRole.entities.PlannedShift.list('location', 1000).catch(() => []);
      return Response.json({ success: true, rows: rows || [] });
    }

    if (action === 'create') {
      const data = cleanData(body.data || {});
      if (!data.location || !data.start_time || !data.end_time) {
        return Response.json({ error: 'Location, start time, and end time are required' }, { status: 400 });
      }
      const row = await base44.asServiceRole.entities.PlannedShift.create(data);
      return Response.json({ success: true, row });
    }

    const id = String(body.id || '').trim();
    if (!id) return Response.json({ error: 'Planned shift ID is required' }, { status: 400 });

    if (action === 'update') {
      const row = await base44.asServiceRole.entities.PlannedShift.update(id, cleanData(body.data || {}));
      return Response.json({ success: true, row });
    }

    if (action === 'delete') {
      await base44.asServiceRole.entities.PlannedShift.delete(id);
      return Response.json({ success: true });
    }

    if (action === 'post') {
      const targetDate = String(body.target_date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        return Response.json({ error: 'A valid target date is required' }, { status: 400 });
      }
      const shift = await base44.asServiceRole.entities.PlannedShift.get(id);
      if (!shift) return Response.json({ error: 'Planned shift was not found' }, { status: 404 });

      const locations = await base44.asServiceRole.entities.Location.list('site_name', 1000).catch(() => []);
      const location = (locations || []).find((item: any) => String(item.site_name || '') === String(shift.location || ''));
      const locationLabel = location?.address ? `${location.site_name}: ${location.address}` : String(shift.location || '');

      const startMinutes = Number(String(shift.start_time || '').replace(':', ''));
      const endMinutes = Number(String(shift.end_time || '').replace(':', ''));
      const overnight = Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes < startMinutes;
      const preferred = Array.isArray(shift.preferred_officers) ? shift.preferred_officers.map(lower).filter(Boolean).slice(0, 3) : [];
      const count = Math.max(1, Math.min(10, Number(shift.num_officers) || 1));

      const rows = Array.from({ length: count }, (_, index) => {
        const officerEmail = preferred[index] || 'OPEN';
        return {
          officer_email: officerEmail,
          shift_date: targetDate,
          start_time: shift.start_time,
          end_time: shift.end_time,
          location: locationLabel,
          is_open: officerEmail === 'OPEN',
          is_split_shift: overnight,
        };
      });

      const created = await base44.asServiceRole.entities.Schedule.bulkCreate(rows);
      await base44.asServiceRole.entities.PlannedShift.update(id, { active: false });
      return Response.json({ success: true, created: created || rows, posted_count: rows.length });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('managePlannedShifts failed', error);
    return Response.json({ error: error?.message || 'Unable to manage planned shifts' }, { status: 500 });
  }
});
