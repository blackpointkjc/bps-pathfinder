import { createClientFromRequest } from 'npm:@base44/sdk';

const normalized = (value:any) => String(value || '').trim().toLowerCase();
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
    const request = await req.json().catch(() => ({}));
    const roles = rolesOf(me);
    if (me.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access')) {
      return Response.json({ error:'Supervisor access required' }, { status:403 });
    }

    const [allUsers, teamsLinks, outlookLinks] = await Promise.all([
      base44.asServiceRole.entities.User.list(undefined, 1000),
      base44.asServiceRole.entities.MicrosoftTeamsIdentity.list('-updated_at', 1000).catch(() => []),
      base44.asServiceRole.entities.OutlookMailboxLink.list('-last_verified_at', 1000).catch(() => []),
    ]);
    const users = (allUsers || []).filter(operational);
    let assigned:any[] = [];
    if (me.role === 'admin') {
      assigned = users.filter((u:any) => u.id !== me.id);
    } else {
      const myPlatoon = normalized(me.platoon || me.subdivision);
      if (myPlatoon) {
        assigned = users.filter((u:any) => u.id !== me.id && normalized(u.platoon || u.subdivision) === myPlatoon);
      } else {
        // Legacy fallback for supervisors not yet assigned a platoon: limit them
        // to the explicit reporting chain instead of exposing company-wide tasks.
        const children = new Map<string, any[]>();
        for (const person of users) {
          if (!person.supervisor_id) continue;
          if (!children.has(person.supervisor_id)) children.set(person.supervisor_id, []);
          children.get(person.supervisor_id)!.push(person);
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
    }

    const aliasesByUser = new Map<string, Set<string>>();
    for (const person of assigned) aliasesByUser.set(String(person.id), new Set([normalized(person.email)].filter(Boolean)));
    for (const link of teamsLinks || []) {
      if (link?.active === false || !aliasesByUser.has(String(link?.user_id))) continue;
      const set = aliasesByUser.get(String(link.user_id))!;
      [link.pathfinder_email, link.microsoft_email].map(normalized).filter(Boolean).forEach((email:string) => set.add(email));
    }
    for (const link of outlookLinks || []) {
      if (link?.connected === false || !aliasesByUser.has(String(link?.user_id))) continue;
      const set = aliasesByUser.get(String(link.user_id))!;
      [link.pathfinder_email, link.outlook_email].map(normalized).filter(Boolean).forEach((email:string) => set.add(email));
    }
    const emails = new Set([...aliasesByUser.values()].flatMap(set => [...set]));
    const isAssigned = (email:any) => emails.has(normalized(email));
    const assignedPeople = assigned.map((u:any) => ({
      id:u.id,
      email:u.email,
      work_email:u.email,
      email_aliases:[...(aliasesByUser.get(String(u.id)) || new Set([normalized(u.email)].filter(Boolean)))],
      first_name:u.first_name,
      last_name:u.last_name,
      rank:u.rank,
      unit_number:u.unit_number,
      platoon:u.platoon,
      supervisor_id:u.supervisor_id,
    }));
    if (request?.peopleOnly) return Response.json({ assignedPeople });

    const [complaints, writeups, reviews, inspections] = await Promise.all([
      base44.asServiceRole.entities.Complaint.list('-complaint_date', 1000),
      base44.asServiceRole.entities.WriteUpReport.list('-report_date', 1000),
      base44.asServiceRole.entities.PerformanceReview.list('-review_date', 1000),
      base44.asServiceRole.entities.InspectionReport.list('-inspection_date', 1000),
    ]);

    return Response.json({
      assignedPeople,
      complaints: (complaints || []).filter((c:any) => isAssigned(c.officer_email) && ['pending','under_investigation'].includes(c.investigation_status)),
      writeups: (writeups || []).filter((w:any) => isAssigned(w.officer_email) && w.status === 'pending_approval'),
      reviews: (reviews || []).filter((r:any) => {
        if (!r.supervisor_review_pending || r.supervisor_review_completed) return false;
        if (me.role === 'admin') return true;
        if (String(r.assigned_supervisor_id || '') === String(me.id || '')) return true;
        return isAssigned(r.officer_email) || assigned.some((person:any) => String(person.id) === String(r.officer_id || ''));
      }),
      inspections: (inspections || []).filter((i:any) => isAssigned(i.officer_email) && i.follow_up_required && !i.follow_up_completed),
    });
  } catch (error) {
    console.error('getSupervisorScopedTasks failed', error);
    return Response.json({ error:'Unable to load supervisor tasks', details:error?.message }, { status:500 });
  }
});
