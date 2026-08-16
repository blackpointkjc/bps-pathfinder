import { createClientFromRequest } from 'npm:@base44/sdk';

const COMMAND_RANKS = new Set(['Colonel','Lt Colonel','Major']);
const rolesOf = (u:any) => new Set((u?.additional_roles || []).map((r:any)=>String(r).toLowerCase()));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    const roles = rolesOf(me);
    if (me.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access')) return Response.json({ error:'Supervisor access required' }, { status:403 });
    const { reviewId, signatureObtained, supervisorNotes } = await req.json();
    if (!reviewId) return Response.json({ error:'reviewId required' }, { status:400 });

    const [allUsers, review] = await Promise.all([
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.PerformanceReview.get(reviewId),
    ]);
    if (!review) return Response.json({ error:'Review not found' }, { status:404 });

    const users = allUsers || [];
    const assignedIds = new Set<string>();
    if (COMMAND_RANKS.has(me.rank)) {
      users.forEach((u:any) => { if (u.id !== me.id) assignedIds.add(u.id); });
    } else {
      const children = new Map<string, any[]>();
      users.forEach((u:any) => { if (u.supervisor_id) { if (!children.has(u.supervisor_id)) children.set(u.supervisor_id, []); children.get(u.supervisor_id)!.push(u); } });
      const queue = [...(children.get(me.id) || [])];
      while (queue.length) {
        const person = queue.shift();
        if (!person || assignedIds.has(person.id)) continue;
        assignedIds.add(person.id);
        queue.push(...(children.get(person.id) || []));
      }
    }
    const officer = users.find((u:any) => String(u.email || '').toLowerCase() === String(review.officer_email || '').toLowerCase());
    if (me.role !== 'admin' && !roles.has('full_access') && (!officer || !assignedIds.has(officer.id))) {
      return Response.json({ error:'This officer is not in your assigned command' }, { status:403 });
    }

    await base44.asServiceRole.entities.PerformanceReview.update(reviewId, {
      supervisor_review_completed: true,
      supervisor_review_completed_by: me.email,
      supervisor_review_completed_date: new Date().toISOString(),
      officer_signature_obtained: !!signatureObtained,
      supervisor_notes: supervisorNotes || '',
    });

    if (review.reviewer_email) {
      await base44.asServiceRole.entities.Notification.create({
        recipient_email: review.reviewer_email,
        type: 'training_reminder',
        title: 'Performance Review Completed',
        message: `${me.rank || 'Supervisor'} ${me.last_name || me.first_name || me.email} completed the review with ${review.officer_name || review.officer_email}`,
        priority: 'normal',
      });
    }
    return Response.json({ success:true });
  } catch (error) {
    console.error('completeSupervisorPerformanceReview failed', error);
    return Response.json({ error:'Unable to complete performance review', details:error?.message }, { status:500 });
  }
});
