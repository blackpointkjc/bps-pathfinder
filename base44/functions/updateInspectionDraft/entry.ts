import { createClientFromRequest } from 'npm:@base44/sdk';

const ALLOWED_FIELDS = [
  'inspection_date', 'officer_inspected', 'officer_email', 'location',
  'uniform_appearance', 'equipment_condition', 'post_knowledge',
  'professionalism', 'observations', 'areas_of_concern', 'commendations',
  'follow_up_required', 'inspection_result'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role) => String(role).toLowerCase()));
    const supervisor = user.role === 'admin' || roles.has('supervisor') || roles.has('full_access');
    if (!supervisor) return Response.json({ error: 'Supervisor access required' }, { status: 403 });

    const { inspection_id, inspection } = await req.json();
    if (!inspection_id || !inspection) {
      return Response.json({ error: 'Inspection ID and form data are required' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.InspectionReport.get(inspection_id);
    if (!existing) return Response.json({ error: 'Inspection draft not found' }, { status: 404 });
    if (existing.inspection_result) {
      return Response.json({ error: 'Only inspection drafts can be completed here' }, { status: 409 });
    }

    const isAdmin = user.role === 'admin' || roles.has('full_access');
    const isOwner = existing.created_by_id === user.id || existing.created_by === user.email;
    let isAssignedSupervisor = false;
    const siteCheckId = String(existing.observations || '').match(/Site check record ID:\s*([^\s]+)/)?.[1];
    if (siteCheckId) {
      const siteCheck = await base44.asServiceRole.entities.SupervisorSiteCheck.get(siteCheckId).catch(() => null);
      isAssignedSupervisor = siteCheck?.supervisor_email?.toLowerCase() === user.email?.toLowerCase();
    }

    if (!isAdmin && !isOwner && !isAssignedSupervisor) {
      return Response.json({ error: 'This inspection draft belongs to another supervisor' }, { status: 403 });
    }

    const clean = {};
    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(inspection, field)) clean[field] = inspection[field];
    }
    if (!clean.inspection_result || !['pass', 'fail'].includes(clean.inspection_result)) {
      return Response.json({ error: 'Select PASS or FAIL before completing the draft' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.InspectionReport.update(inspection_id, clean);
    return Response.json({ success: true, inspection: updated });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to update inspection draft' }, { status: 500 });
  }
});
