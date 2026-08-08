import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const COMMAND_RANKS = new Set(['Colonel','Lt Colonel','Major']);
const OPERATIONAL_RANKS = new Set(['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer']);
const rolesOf = (u:any) => new Set((u?.additional_roles || []).map((r:any) => String(r).toLowerCase()));
const operational = (u:any) => {
  const roles = rolesOf(u);
  return !u?.termination_date && OPERATIONAL_RANKS.has(u?.rank) && roles.has('officer') && roles.has('cad_access');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    const roles = rolesOf(me);
    if (me.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access')) {
      return Response.json({ error:'Supervisor access required' }, { status:403 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    const users = (allUsers || []).filter(operational);
    let assigned:any[] = [];
    if (COMMAND_RANKS.has(me.rank)) {
      assigned = users.filter((u:any) => u.id !== me.id);
    } else {
      const children = new Map<string, any[]>();
      for (const user of users) {
        if (!user.supervisor_id) continue;
        if (!children.has(user.supervisor_id)) children.set(user.supervisor_id, []);
        children.get(user.supervisor_id)!.push(user);
      }
      const seen = new Set([me.id]);
      const queue = [...(children.get(me.id) || [])];
      while (queue.length) {
        const person = queue.shift();
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);
        assigned.push(person);
        queue.push(...(children.get(person.id) || []));
      }
    }

    const emails = new Set(assigned.map((u:any) => String(u.email || '').toLowerCase()).filter(Boolean));
    const isAssigned = (email:any) => emails.has(String(email || '').toLowerCase());
    const [complaints, writeups, reviews, inspections] = await Promise.all([
      base44.asServiceRole.entities.Complaint.list('-complaint_date', 1000),
      base44.asServiceRole.entities.WriteUpReport.list('-report_date', 1000),
      base44.asServiceRole.entities.PerformanceReview.list('-review_date', 1000),
      base44.asServiceRole.entities.InspectionReport.list('-inspection_date', 1000),
    ]);

    return Response.json({
      assignedPeople: assigned.map((u:any) => ({ id:u.id, email:u.email, first_name:u.first_name, last_name:u.last_name, rank:u.rank, unit_number:u.unit_number, platoon:u.platoon, supervisor_id:u.supervisor_id })),
      complaints: (complaints || []).filter((c:any) => isAssigned(c.officer_email) && ['pending','under_investigation'].includes(c.investigation_status)),
      writeups: (writeups || []).filter((w:any) => isAssigned(w.officer_email) && w.status === 'pending_approval'),
      reviews: (reviews || []).filter((r:any) => isAssigned(r.officer_email) && r.supervisor_review_pending && !r.supervisor_review_completed),
      inspections: (inspections || []).filter((i:any) => isAssigned(i.officer_email) && i.follow_up_required && !i.follow_up_completed),
    });
  } catch (error) {
    console.error('getSupervisorScopedTasks failed', error);
    return Response.json({ error:'Unable to load supervisor tasks', details:error?.message }, { status:500 });
  }
});
