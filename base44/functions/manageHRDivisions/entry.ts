import { createClientFromRequest } from 'npm:@base44/sdk';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = rolesOf(user);
    const hasHR = user.role === 'admin' || roles.has('hr') || roles.has('full_access') || String(user.rank || '').toLowerCase() === 'human resources';
    if (!hasHR) return Response.json({ error: 'HR access required' }, { status: 403 });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'list';
    if (action === 'list') {
      const divisions = await base44.asServiceRole.entities.Division.list('division_name', 1000);
      return Response.json({ success: true, divisions: divisions || [] });
    }
    if (action === 'create') {
      const division = await base44.asServiceRole.entities.Division.create(body.data || {});
      return Response.json({ success: true, division });
    }
    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Division ID required' }, { status: 400 });
      const old=await base44.asServiceRole.entities.Division.get(body.id);
      if(old && (old.division_level==='region'||old.is_subdivision!==true)
          && body.data?.division_name && String(body.data.division_name).trim().toLowerCase()!==String(old.division_name).trim().toLowerCase()){
        const platoons=await base44.asServiceRole.entities.CompanyPlatoon.filter({region:old.division_name},'-created_date',1000).catch(()=>[]);
        if(platoons.length)return Response.json({error:'Move or reassign this Region’s Platoons before renaming the Region.'},{status:409});
      }
      const division = await base44.asServiceRole.entities.Division.update(body.id, body.data || {});
      return Response.json({ success: true, division });
    }
    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Division ID required' }, { status: 400 });
      const original=await base44.asServiceRole.entities.Division.get(body.id);
      if(original && (original.division_level==='region'||original.is_subdivision!==true)){
        const platoons=await base44.asServiceRole.entities.CompanyPlatoon.filter({region:original.division_name},'-created_date',1000).catch(()=>[]);
        if(platoons.length)return Response.json({error:'This Region has Platoons. Move or delete them before deleting the Region.'},{status:409});
      }
      await base44.asServiceRole.entities.Division.delete(body.id);
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageHRDivisions failed', error);
    return Response.json({ error: error?.message || 'Unable to manage divisions' }, { status: 500 });
  }
});