import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if (!__portalCaller || (__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const allowed = user.role === 'admin' || roles.has('hr') || roles.has('full_access') || String(user.rank || '').toLowerCase() === 'human resources';
    if (!allowed) return Response.json({ error: 'HR access required' }, { status: 403 });

    const { action, equipment_id, officer_email } = await req.json().catch(() => ({}));
    if (!equipment_id || !['assign', 'unassign'].includes(action)) {
      return Response.json({ error: 'equipment_id and valid action are required' }, { status: 400 });
    }
    const equipment = await base44.asServiceRole.entities.Equipment.get(equipment_id);
    if (!equipment) return Response.json({ error: 'Equipment not found' }, { status: 404 });

    if (action === 'assign') {
      if (!officer_email) return Response.json({ error: 'officer_email is required' }, { status: 400 });
      const users = await base44.asServiceRole.entities.User.filter({ email: officer_email });
      const target = users?.[0];
      if (!target || target.termination_date) return Response.json({ error: 'Active employee not found' }, { status: 404 });
      const updated = await base44.asServiceRole.entities.Equipment.update(equipment_id, { assigned_to: officer_email, status: 'assigned' });
      return Response.json({ success: true, equipment: updated });
    }

    const updated = await base44.asServiceRole.entities.Equipment.update(equipment_id, { assigned_to: null, status: 'available' });
    return Response.json({ success: true, equipment: updated });
  } catch (error) {
    console.error('manageHREquipment failed', error);
    return Response.json({ error: error?.message || 'Unable to update equipment assignment' }, { status: 500 });
  }
});