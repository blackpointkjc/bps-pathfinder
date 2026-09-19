import { createClientFromRequest } from 'npm:@base44/sdk';

const normalized = (value:any) => String(value || '').trim().toLowerCase();
const delay = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
async function readRowsWithRetry(label:string, loader:()=>Promise<any[]>, optional=false) {
  let lastError:any = null;
  for (let attempt=0; attempt<3; attempt+=1) {
    try {
      const rows = await loader();
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(450 * (attempt + 1));
    }
  }
  console.error(`getSupervisorScopedTasks could not load ${label}`, lastError);
  if (optional) return [];
  throw lastError || new Error(`Unable to load ${label}`);
}
const RANK_ORDER = ['colonel', 'lt colonel', 'major', 'captain', 'lieutenant', 'first sergeant', 'sergeant', 'corporal', 'senior officer', 'officer', 'unarmed officer'];
const OPERATIONAL_RANKS = new Set(RANK_ORDER);
const normalizeRank = (value:any) => {
  const rank = String(value || '').trim().toLowerCase().replace(/\./g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return rank === 'lieutenant colonel' ? 'lt colonel' : rank;
};
const rankLevel = (user:any) => RANK_ORDER.indexOf(normalizeRank(user?.rank));
const reviewerOutranks = (reviewer:any, officer:any) => {
  const reviewerLevel = rankLevel(reviewer);
  const officerLevel = rankLevel(officer);
  return reviewerLevel >= 0 && officerLevel >= 0 && reviewerLevel < officerLevel;
};

const TIME_ZONE = 'America/New_York';
const easternParts = (value: Date | string = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return { date: '', minutes: -1 };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type:string) => Number(parts.find(part => part.type === type)?.value || 0);
  return {
    date: `${read('year')}-${String(read('month')).padStart(2, '0')}-${String(read('day')).padStart(2, '0')}`,
    minutes: (read('hour') % 24) * 60 + read('minute'),
  };
};
const wallMinutes = (value:any) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
  if (!match) return -1;
  let hour = Number(match[1]);
  const suffix = normalized(match[3]);
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2]);
};

const rolesOf = (u:any) => new Set((u?.additional_roles || []).map((r:any) => String(r).toLowerCase()));
const operational = (u:any) => {
  const roles = rolesOf(u);
  const rank = normalizeRank(u?.rank);
  const type = normalized(u?.user_type || u?.account_type || u?.portal_type);
  const accountStatus = normalized(u?.account_status);
  if (!u?.email || u?.termination_date) return false;
  if (roles.has('client') || roles.has('student') || roles.has('pending')) return false;
  if (['client','student','pending'].includes(type) || accountStatus === 'pending') return false;
  // Operational officer status is established by rank OR officer/CAD/supervisor role.
  // Requiring both officer + cad_access excluded legitimate command staff and was
  // the reason several supervisor officer dropdowns appeared empty.
  return OPERATIONAL_RANKS.has(rank) || roles.has('officer') || roles.has('cad_access') || roles.has('supervisor');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    const request = await req.json().catch(() => ({}));
    const roles = rolesOf(me);
    if (me.role !== 'admin' && normalized(me.role) !== 'supervisor' && me.is_supervisor !== true && !roles.has('supervisor') && !roles.has('full_access') && !OPERATIONAL_RANKS.has(normalizeRank(me.rank))) {
      return Response.json({ error:'Supervisor access required' }, { status:403 });
    }

    const supervisorStates = await readRowsWithRetry(
      'supervisor work queue state',
      () => base44.asServiceRole.entities.WorkQueueState.filter({ queue_role:'supervisor' }, '-completed_at', 2000),
      true,
    );
    const completedSupervisorKeys = new Set(
      (supervisorStates || [])
        .filter((state:any) => ['completed','auto_completed'].includes(normalized(state.status)))
        .map((state:any) => String(state.task_key || ''))
    );

    if (normalized(request?.action) === 'finish') {
      const taskKey = String(request?.task_key || '').trim();
      if (!taskKey || taskKey.length > 240) return Response.json({ error:'A valid task key is required' }, { status:400 });
      const completedAt = new Date().toISOString();
      const assignedState = (supervisorStates || []).find((state:any) => String(state.task_key || '') === taskKey && state.status === 'open');
      const fullAccess = me.role === 'admin' || roles.has('full_access');
      if (assignedState?.assigned_to_id && !fullAccess
          && String(assignedState.assigned_to_id) !== String(me.id || '')
          && normalized(assignedState.assigned_to_email) !== normalized(me.email)) {
        return Response.json({ error:'This Supervisor Operations task is assigned to another supervisor.' }, { status:403 });
      }
      const title = String(request?.title || assignedState?.title || 'Supervisor follow-up').slice(0, 250);
      const person = String(request?.person || '').slice(0, 250);
      const sourceKind = String(request?.kind || '').slice(0, 100);
      const sourceId = String(request?.source_id || '').slice(0, 250);
      const supervisorPatch = {
        status:'completed',
        completed_at:completedAt,
        completed_by:me.email || String(me.id),
        completion_note:'Supervisor contacted officer',
        last_seen_at:completedAt,
      };
      const existingSupervisor = (supervisorStates || []).filter((state:any) => String(state.task_key) === taskKey);
      if (existingSupervisor.length) {
        await Promise.all(existingSupervisor.map((state:any) =>
          base44.asServiceRole.entities.WorkQueueState.update(state.id, supervisorPatch)
        ));
      } else {
        await base44.asServiceRole.entities.WorkQueueState.create({
          task_key:taskKey, queue_role:'supervisor', title, person,
          source_kind:sourceKind, source_id:sourceId, ...supervisorPatch,
        });
      }

      // Supervisors clear the operational queue everywhere they work, while
      // administrators retain a permanent, clearly worded completion record.
      const adminTaskKey = `supervisor-contacted-${taskKey}`;
      const adminStates = await base44.asServiceRole.entities.WorkQueueState
        .filter({ queue_role:'admin', task_key:adminTaskKey }, '-completed_at', 20)
        .catch(() => []);
      const adminRecord = {
        status:'completed',
        completed_at:completedAt,
        completed_by:me.email || String(me.id),
        completion_note:`Supervisor contacted officer regarding: ${title}`.slice(0, 1000),
        last_seen_at:completedAt,
      };
      if (adminStates.length) {
        await Promise.all(adminStates.map((state:any) =>
          base44.asServiceRole.entities.WorkQueueState.update(state.id, adminRecord)
        ));
      } else {
        await base44.asServiceRole.entities.WorkQueueState.create({
          task_key:adminTaskKey,
          queue_role:'admin',
          title:'Supervisor contacted officer',
          person,
          source_kind:sourceKind,
          source_id:sourceId,
          ...adminRecord,
        });
      }
      const supervisorNotifications = await base44.asServiceRole.entities.Notification.filter({
        type:'supervisor_task',
        task_key:taskKey,
      }, '-created_date', 20).catch(() => []);
      for (const notification of supervisorNotifications || []) {
        await base44.asServiceRole.entities.Notification.update(notification.id, {
          is_read:true,
          acknowledged_at:completedAt,
        }).catch(() => null);
      }

      await base44.asServiceRole.entities.AuditLog.create({
        entity_type:'WorkQueueState',
        entity_id:taskKey,
        action:'status_change',
        actor_id:String(me.id || me.email),
        actor_name:[me.first_name, me.last_name].filter(Boolean).join(' ') || me.email,
        before_value:JSON.stringify({ status:'open' }),
        after_value:JSON.stringify({ status:'completed', note:'Supervisor contacted officer' }),
        field_changed:'status',
        timestamp:completedAt,
        description:`Supervisor contacted officer and finished work item: ${title}`,
      }).catch(() => null);
      return Response.json({ success:true, task_key:taskKey, status:'completed', wording:'Supervisor contacted officer' });
    }

    // User identity is required for every supervisor join. Load it first and
    // retry it independently; optional Microsoft/Outlook aliases must never make
    // the whole work queue disappear.
    const allUsers = await readRowsWithRetry(
      'users',
      () => base44.asServiceRole.entities.User.list(undefined, 1000),
    );
    const teamsLinks = await readRowsWithRetry(
      'Teams identities',
      () => base44.asServiceRole.entities.MicrosoftTeamsIdentity.list('-updated_at', 1000),
      true,
    );
    const outlookLinks = await readRowsWithRetry(
      'Outlook identities',
      () => base44.asServiceRole.entities.OutlookMailboxLink.list('-last_verified_at', 1000),
      true,
    );
    const users = (allUsers || []).filter(operational);
    let assigned:any[] = [];
    if (me.role === 'admin' || roles.has('full_access')) {
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
        // Some older command accounts were never given supervisor_id/platoon data.
        // Do not leave their oversight tools with an empty officer dropdown: when
        // the reporting chain is absent, use the established rank hierarchy and
        // show only active operational personnel below the reviewer.
        if (!assigned.length && rankLevel(me) >= 0) {
          assigned = users.filter((u:any) => u.id !== me.id && reviewerOutranks(me, u));
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

    // These datasets used to fire as a seven-read burst. Read them in a
    // controlled sequence with independent retries so one throttled table cannot
    // blank every supervisor panel at once.
    const complaints = await readRowsWithRetry(
      'complaints',
      () => base44.asServiceRole.entities.Complaint.list('-complaint_date', 1000),
      true,
    );
    const writeups = await readRowsWithRetry(
      'write-ups',
      () => base44.asServiceRole.entities.WriteUpReport.list('-report_date', 1000),
      true,
    );
    const reviews = await readRowsWithRetry(
      'performance reviews',
      () => base44.asServiceRole.entities.PerformanceReview.list('-review_date', 1000),
      true,
    );
    const inspections = await readRowsWithRetry(
      'inspections',
      () => base44.asServiceRole.entities.InspectionReport.list('-inspection_date', 1000),
      true,
    );
    const schedules = await readRowsWithRetry(
      'schedules',
      () => base44.asServiceRole.entities.Schedule.list('-shift_date', 2500),
      true,
    );
    const timeEntries = await readRowsWithRetry(
      'time entries',
      () => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 2500),
      true,
    );
    const dailyReports = await readRowsWithRetry(
      'daily activity reports',
      () => base44.asServiceRole.entities.DailyActivityReport.list('-report_date', 2500),
      true,
    );

    const officerForReview = (review:any) => (allUsers || []).find((person:any) =>
      (review.officer_id && String(person.id || '') === String(review.officer_id)) ||
      (!review.officer_id && normalized(person.email) === normalized(review.officer_email))
    );

    const now = easternParts();
    const todayEntries = (timeEntries || []).filter((entry:any) => entry.archived !== true && easternParts(entry.clock_in).date === now.date);
    const missedClockIns = (schedules || []).filter((shift:any) => {
      if (!isAssigned(shift.officer_email) || shift.archived === true || shift.is_open === true || normalized(shift.officer_email) === 'open') return false;
      if (String(shift.shift_date || '') !== now.date) return false;
      const start = wallMinutes(shift.start_time);
      if (start < 0 || start > now.minutes - 5) return false;
      return !todayEntries.some((entry:any) => normalized(entry.officer_email) === normalized(shift.officer_email)
        && (normalized(entry.location) === normalized(shift.location) || Math.abs(easternParts(entry.clock_in).minutes - start) <= 240));
    });
    const reportShiftIds = new Set((dailyReports || []).map((report:any) => String(report.shift_id || '')).filter(Boolean));
    const reportLegacyKeys = new Set((dailyReports || []).map((report:any) =>
      `${normalized(report.officer_email || report.created_by)}|${String(report.report_date || '')}|${normalized(report.location)}`
    ));
    const recentCutoff = Date.now() - 21 * 86400000;
    const missingReports = (timeEntries || []).filter((entry:any) => {
      if (!isAssigned(entry.officer_email) || !entry.clock_in || !entry.clock_out || entry.archived === true) return false;
      if (new Date(entry.clock_out).getTime() < recentCutoff || reportShiftIds.has(String(entry.id))) return false;
      const key = `${normalized(entry.officer_email)}|${easternParts(entry.clock_in).date}|${normalized(entry.location)}`;
      return !reportLegacyKeys.has(key);
    });

    const visibleMissedClockIns = missedClockIns.filter((row:any) => !completedSupervisorKeys.has(`missed-clock-${row.id}`));
    const visibleMissingReports = missingReports.filter((row:any) => !completedSupervisorKeys.has(`missing-report-${row.id}`));
    const visibleComplaints = (complaints || []).filter((c:any) => isAssigned(c.officer_email) && ['pending','under_investigation'].includes(c.investigation_status))
      .filter((row:any) => !completedSupervisorKeys.has(`complaint-${row.id}`));
    const visibleWriteups = (writeups || []).filter((w:any) => isAssigned(w.officer_email) && w.status === 'pending_approval')
      .filter((row:any) => !completedSupervisorKeys.has(`writeup-${row.id}`));
    const visibleInspections = (inspections || []).filter((i:any) => isAssigned(i.officer_email) && i.follow_up_required && !i.follow_up_completed)
      .filter((row:any) => !completedSupervisorKeys.has(`inspection-${row.id}`));
    const visibleReviews = (reviews || []).filter((r:any) => {
      const stage = String(r.workflow_stage || (r.supervisor_review_pending ? 'supervisor_pending' : ''));
      if (stage !== 'supervisor_pending' || r.supervisor_review_completed) return false;
      const officer = officerForReview(r);
      if (!officer || !reviewerOutranks(me, officer)) return false;
      return String(r.assigned_supervisor_id || '') === String(me.id || '');
    }).filter((row:any) => !completedSupervisorKeys.has(`review-${row.id}`));
    const visibleReviewFollowUps = (reviews || []).filter((r:any) => {
      if (String(r.workflow_stage || '') !== 'officer_pending' || r.officer_acknowledged) return false;
      const officer = officerForReview(r);
      if (!officer || !reviewerOutranks(me, officer)) return false;
      return String(r.assigned_supervisor_id || '') === String(me.id || '');
    }).filter((row:any) => !completedSupervisorKeys.has(`review-followup-${row.id}`));

    return Response.json({
      assignedPeople,
      missedClockIns:visibleMissedClockIns,
      missingReports:visibleMissingReports,
      complaints: visibleComplaints,
      writeups: visibleWriteups,
      reviews: visibleReviews,
      reviewFollowUps: visibleReviewFollowUps,
      inspections: visibleInspections,
    });
  } catch (error) {
    console.error('getSupervisorScopedTasks failed', error);
    return Response.json({ error:'Unable to load supervisor tasks', details:error?.message }, { status:500 });
  }
});
