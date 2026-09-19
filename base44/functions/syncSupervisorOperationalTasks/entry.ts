import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const clean = (value: unknown) => String(value || '').trim();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const RANKS = new Set(['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel']);

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map(lower));
const isSupervisor = (user: any) => {
  const roles = rolesOf(user);
  return !!user?.email && !user?.termination_date
    && !['terminated','on_leave'].includes(lower(user?.employment_status))
    && (user.role === 'admin' || lower(user.role) === 'supervisor' || user.is_supervisor === true || roles.has('supervisor') || roles.has('full_access') || RANKS.has(lower(user.rank)));
};
const displayName = (user: any) => {
  const rank = clean(user?.rank);
  const last = clean(user?.last_name) || clean(user?.full_name).split(/\s+/).pop() || '';
  return [rank, last].filter(Boolean).join(' ') || clean(user?.full_name) || clean(user?.email) || 'Supervisor';
};
const validCoord = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
const validPosition = (lat: unknown, lon: unknown) => validCoord(lat) && validCoord(lon)
  && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180
  && !(Number(lat) === 0 && Number(lon) === 0);
const distanceMiles = (lat1:number, lon1:number, lat2:number, lon2:number) => {
  const r = 3958.8;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};
async function readRows(label:string, loader:()=>Promise<any[]>, optional=false) {
  let last:any = null;
  for (let attempt=0; attempt<3; attempt+=1) {
    try {
      const rows = await loader();
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      last = error;
      if (attempt < 2) await delay(350 * (attempt + 1));
    }
  }
  console.error(`syncSupervisorOperationalTasks could not load ${label}`, last);
  if (optional) return [];
  throw last || new Error(`Unable to load ${label}`);
}
const eastern = (value: Date | string = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return { date:'', minutes:-1 };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(date);
  const n = (type:string) => Number(parts.find(part => part.type === type)?.value || 0);
  return { date:`${n('year')}-${String(n('month')).padStart(2,'0')}-${String(n('day')).padStart(2,'0')}`, minutes:(n('hour')%24)*60+n('minute') };
};
const wallMinutes = (value:any) => {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
  if (!match) return -1;
  let hour = Number(match[1]);
  const suffix = lower(match[3]);
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2]);
};
const dayKey = (value:any) => eastern(value).date;
const siteNameFrom = (value:any) => clean(value).split(':')[0].split(' - ')[0].trim();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    if (!isSupervisor(me)) return Response.json({ error:'Supervisor access required' }, { status:403 });

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const current = eastern();
    const recentCutoffIso = new Date(now - 21 * 86400000).toISOString();
    const recentCutoffDate = dayKey(recentCutoffIso);

    const users = await readRows('users', () => base44.asServiceRole.entities.User.list('-updated_date', 1500));
    const activeRows = await readRows('active officers', () => base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1500), true);
    const locations = await readRows('locations', () => base44.asServiceRole.entities.Location.list('site_name', 1000), true);
    const schedules = await readRows('today schedules', () => base44.asServiceRole.entities.Schedule.filter({ shift_date: current.date }, 'start_time', 1500), true);
    const timeEntries = await readRows('recent time entries', () => base44.asServiceRole.entities.TimeEntry.filter({ clock_in: { $gte: recentCutoffIso } }, '-clock_in', 5000), true);
    const dailyReports = await readRows('recent daily reports', () => base44.asServiceRole.entities.DailyActivityReport.filter({ report_date: { $gte: recentCutoffDate } }, '-report_date', 5000), true);
    const complaints = await readRows('complaints', () => base44.asServiceRole.entities.Complaint.list('-complaint_date', 1000), true);
    const writeups = await readRows('write-ups', () => base44.asServiceRole.entities.WriteUpReport.list('-report_date', 1000), true);
    const reviews = await readRows('performance reviews', () => base44.asServiceRole.entities.PerformanceReview.list('-review_date', 1000), true);
    const inspections = await readRows('inspections', () => base44.asServiceRole.entities.InspectionReport.list('-inspection_date', 1000), true);
    const states = await readRows('supervisor task states', () => base44.asServiceRole.entities.WorkQueueState.filter({ queue_role:'supervisor' }, '-last_seen_at', 5000), true);

    const userByEmail = new Map<string, any>();
    const userById = new Map<string, any>();
    for (const user of users || []) {
      if (user?.email) userByEmail.set(lower(user.email), user);
      if (user?.id) userById.set(String(user.id), user);
    }
    const newestActive = new Map<string, any>();
    for (const row of activeRows || []) {
      const email = lower(row?.officer_email);
      if (!email || newestActive.has(email)) continue;
      newestActive.set(email, row);
    }
    const locationByName = new Map<string,any>();
    for (const location of locations || []) {
      if (!location?.site_name) continue;
      locationByName.set(lower(location.site_name), location);
    }
    const resolveSite = (value:any) => {
      const key = lower(siteNameFrom(value));
      if (!key) return null;
      if (locationByName.has(key)) return locationByName.get(key);
      return (locations || []).find((row:any) => {
        const site = lower(row.site_name);
        const raw = lower(value);
        return raw === site || raw.startsWith(site + ':') || raw.startsWith(site + ' - ');
      }) || null;
    };
    const originFor = (task:any) => {
      const site = resolveSite(task.location);
      if (site && validPosition(site.latitude, site.longitude)) return { lat:Number(site.latitude), lon:Number(site.longitude), source:'site' };
      const officer = task.officer_email ? newestActive.get(lower(task.officer_email)) : null;
      if (officer) {
        const gpsAt = new Date(officer.gps_updated_at || 0).getTime();
        const accuracy = Number(officer.accuracy);
        if (validPosition(officer.latitude, officer.longitude) && Number.isFinite(gpsAt) && gpsAt >= now - 5*60*1000 && (!Number.isFinite(accuracy) || accuracy <= 2000)) {
          return { lat:Number(officer.latitude), lon:Number(officer.longitude), source:'officer_gps' };
        }
        const officerSite = resolveSite(officer.current_location);
        if (officerSite && validPosition(officerSite.latitude, officerSite.longitude)) return { lat:Number(officerSite.latitude), lon:Number(officerSite.longitude), source:'officer_site' };
      }
      return null;
    };

    const todaysEntries = (timeEntries || []).filter((entry:any) => entry.archived !== true && dayKey(entry.clock_in) === current.date);
    const reportShiftIds = new Set((dailyReports || []).map((report:any)=>String(report.shift_id || '')).filter(Boolean));
    const reportLegacyKeys = new Set((dailyReports || []).map((report:any)=>`${lower(report.officer_email || report.created_by)}|${clean(report.report_date)}|${lower(siteNameFrom(report.location))}`));
    const tasks:any[] = [];

    for (const shift of schedules || []) {
      if (shift.archived === true || shift.is_open === true || lower(shift.officer_email) === 'open') continue;
      const start = wallMinutes(shift.start_time);
      if (start < 0 || start > current.minutes - 5) continue;
      const hasPunch = todaysEntries.some((entry:any) =>
        lower(entry.officer_email) === lower(shift.officer_email)
        && (lower(siteNameFrom(entry.location)) === lower(siteNameFrom(shift.location)) || Math.abs(eastern(entry.clock_in).minutes - start) <= 240)
      );
      if (hasPunch) continue;
      const officer = userByEmail.get(lower(shift.officer_email));
      tasks.push({
        key:`missed-clock-${shift.id}`, kind:'missed_clock_in', source_id:String(shift.id), officer_id:String(officer?.id || ''), officer_email:lower(shift.officer_email),
        title:'Officer Failed to Check In', person:displayName(officer || { email:shift.officer_email }), location:clean(shift.location),
        detail:`${shift.start_time || 'Scheduled'} at ${siteNameFrom(shift.location) || 'assigned site'}`, priority:'critical',
        speech:`Attention supervisor. ${displayName(officer || { email:shift.officer_email })} failed to check in for the ${shift.start_time || 'scheduled'} shift at ${siteNameFrom(shift.location) || 'the assigned site'}. Supervisor follow-up is assigned to you.`,
      });
    }

    for (const entry of timeEntries || []) {
      if (!entry?.id || !entry.clock_in || !entry.clock_out || entry.archived === true) continue;
      if (new Date(entry.clock_out).getTime() < now - 21*86400000) continue;
      if (reportShiftIds.has(String(entry.id))) continue;
      const legacyKey = `${lower(entry.officer_email)}|${dayKey(entry.clock_in)}|${lower(siteNameFrom(entry.location))}`;
      if (reportLegacyKeys.has(legacyKey)) continue;
      const officer = userByEmail.get(lower(entry.officer_email));
      tasks.push({
        key:`missing-report-${entry.id}`, kind:'missing_report', source_id:String(entry.id), officer_id:String(officer?.id || ''), officer_email:lower(entry.officer_email),
        title:'Required Daily Report Missing', person:displayName(officer || { email:entry.officer_email }), location:clean(entry.location),
        detail:`${dayKey(entry.clock_in)} · ${siteNameFrom(entry.location) || 'assigned site'}`, priority:'high',
        speech:`Attention supervisor. A required daily activity report is missing for ${displayName(officer || { email:entry.officer_email })} at ${siteNameFrom(entry.location) || 'the assigned site'}. Follow-up is assigned to you.`,
      });
    }

    for (const row of complaints || []) {
      if (!['pending','under_investigation'].includes(lower(row.investigation_status))) continue;
      const officer = userByEmail.get(lower(row.officer_email));
      tasks.push({ key:`complaint-${row.id}`, kind:'complaint', source_id:String(row.id), officer_id:String(officer?.id || ''), officer_email:lower(row.officer_email), title:'Complaint Investigation', person:displayName(officer || { email:row.officer_email }), location:clean(row.location), detail:'Complaint investigation or follow-up required', priority:'high', speech:`Attention supervisor. A complaint investigation requires action for ${displayName(officer || { email:row.officer_email })}. The task is assigned to you.` });
    }
    for (const row of writeups || []) {
      if (lower(row.status) !== 'pending_approval') continue;
      const officer = userByEmail.get(lower(row.officer_email));
      tasks.push({ key:`writeup-${row.id}`, kind:'writeup', source_id:String(row.id), officer_id:String(officer?.id || ''), officer_email:lower(row.officer_email), title:'Write-Up Review', person:displayName(officer || { email:row.officer_email }), location:clean(row.location), detail:'Disciplinary review requires supervisor action', priority:'high', speech:`Attention supervisor. A write-up requires supervisory review for ${displayName(officer || { email:row.officer_email })}. The task is assigned to you.` });
    }
    for (const row of reviews || []) {
      const stage = lower(row.workflow_stage || (row.supervisor_review_pending ? 'supervisor_pending' : ''));
      const officer = userById.get(String(row.officer_id || '')) || userByEmail.get(lower(row.officer_email));
      if (stage === 'supervisor_pending' && !row.supervisor_review_completed) {
        tasks.push({ key:`review-${row.id}`, kind:'review', source_id:String(row.id), officer_id:String(officer?.id || row.officer_id || ''), officer_email:lower(row.officer_email), title:'Performance Review Pending', person:displayName(officer || { email:row.officer_email }), location:clean(officer?.assigned_location), detail:'Supervisor review and ratings require action', priority:'high', speech:`Attention supervisor. A performance review for ${displayName(officer || { email:row.officer_email })} requires your action.` });
      }
      if (stage === 'officer_pending' && !row.officer_acknowledged) {
        tasks.push({ key:`review-followup-${row.id}`, kind:'review_follow_up', source_id:String(row.id), officer_id:String(officer?.id || row.officer_id || ''), officer_email:lower(row.officer_email), title:'Performance Review Follow-Up', person:displayName(officer || { email:row.officer_email }), location:clean(officer?.assigned_location), detail:'Officer acknowledgement follow-up requires action', priority:'normal', speech:`Supervisor reminder. Officer acknowledgement is still pending for ${displayName(officer || { email:row.officer_email })}'s performance review.` });
      }
    }
    for (const row of inspections || []) {
      if (!row.follow_up_required || row.follow_up_completed) continue;
      const officer = userByEmail.get(lower(row.officer_email));
      tasks.push({ key:`inspection-${row.id}`, kind:'inspection', source_id:String(row.id), officer_id:String(officer?.id || ''), officer_email:lower(row.officer_email), title:'Officer Inspection Follow-Up', person:displayName(officer || { email:row.officer_email }), location:clean(row.location), detail:clean(row.location) || 'Inspection follow-up required', priority:'high', speech:`Attention supervisor. An officer inspection follow-up is pending for ${displayName(officer || { email:row.officer_email })}. The task is assigned to you.` });
    }

    const stateByKey = new Map<string,any>();
    for (const state of states || []) {
      const key = clean(state.task_key);
      if (key && !stateByKey.has(key)) stateByKey.set(key, state);
    }
    const activeTaskKeys = new Set(tasks.map(task => task.key));
    const managedKinds = new Set(['missed_clock_in','missing_report','complaint','writeup','review','review_follow_up','inspection']);

    // Automatically close generated tasks that no longer exist in the source data.
    for (const state of states || []) {
      if (state.status !== 'open' || !managedKinds.has(clean(state.source_kind)) || activeTaskKeys.has(clean(state.task_key))) continue;
      await base44.asServiceRole.entities.WorkQueueState.update(state.id, {
        status:'auto_completed', completed_at:nowIso, completed_by:'Pathfinder Supervisor Operations',
        completion_note:'Source condition cleared automatically.', last_seen_at:nowIso,
      }).catch(() => null);
      if (state.alert_notification_id) {
        await base44.asServiceRole.entities.Notification.update(state.alert_notification_id, { is_read:true, acknowledged_at:nowIso }).catch(() => null);
      }
    }

    // Clear replayed/stale task banners: unread supervisor_task notifications
    // whose task no longer exists, plus every legacy daily-report announcement
    // (that announcement path is retired), are acknowledged so they can never
    // return after a supervisor finishes the item or the source condition clears.
    const unreadTaskNotifications = await readRows('unread supervisor task notifications', () =>
      base44.asServiceRole.entities.Notification.filter({ type: 'supervisor_task', is_read: false }, '-created_date', 500), true);
    for (const notification of unreadTaskNotifications || []) {
      const key = clean(notification.task_key);
      if (!key || (!key.startsWith('missing-report-') && activeTaskKeys.has(key))) continue;
      await base44.asServiceRole.entities.Notification.update(notification.id, { is_read: true, acknowledged_at: nowIso }).catch(() => null);
    }

    const workload = new Map<string,number>();
    for (const state of states || []) {
      if (state.status === 'open' && state.assigned_to_id) workload.set(String(state.assigned_to_id), (workload.get(String(state.assigned_to_id)) || 0) + 1);
    }
    const sessionHealthyCutoff = now - 15*60*1000;
    const gpsFreshCutoff = now - 5*60*1000;
    const candidates = (users || []).filter(isSupervisor).map((user:any) => {
      const session = newestActive.get(lower(user.email));
      const sessionAt = new Date(session?.last_update || 0).getTime();
      const status = lower(session?.status || user.status);
      if (!session || session.session_active === false || !Number.isFinite(sessionAt) || sessionAt < sessionHealthyCutoff) return null;
      if (['out of service','out_of_service','oos','distress','emergency'].includes(status)) return null;
      const gpsAt = new Date(session.gps_updated_at || 0).getTime();
      const accuracy = Number(session.accuracy);
      if (validPosition(session.latitude, session.longitude) && Number.isFinite(gpsAt) && gpsAt >= gpsFreshCutoff && (!Number.isFinite(accuracy) || accuracy <= 2000)) {
        return { user, lat:Number(session.latitude), lon:Number(session.longitude), positionSource:'gps', workload:workload.get(String(user.id)) || 0 };
      }
      const site = resolveSite(session.current_location || user.assigned_location);
      if (site && validPosition(site.latitude, site.longitude)) {
        return { user, lat:Number(site.latitude), lon:Number(site.longitude), positionSource:'site', workload:workload.get(String(user.id)) || 0 };
      }
      return { user, lat:null, lon:null, positionSource:'none', workload:workload.get(String(user.id)) || 0 };
    }).filter(Boolean);

    const assigned:any[] = [];
    for (const task of tasks) {
      const existing = stateByKey.get(task.key);
      if (existing?.status === 'completed' || existing?.status === 'auto_completed') continue;
      const origin = originFor(task);
      const eligible = candidates.filter((candidate:any) => String(candidate.user.id) !== String(task.officer_id || ''));
      if (!eligible.length) continue;

      let chosen:any = null;
      let distance:number | null = null;
      let basis = 'least_loaded';
      if (origin) {
        const withPosition = eligible.filter((candidate:any) => validPosition(candidate.lat, candidate.lon))
          .map((candidate:any) => ({ ...candidate, distance:distanceMiles(origin.lat, origin.lon, candidate.lat, candidate.lon) }))
          .sort((a:any,b:any) => a.distance-b.distance || a.workload-b.workload);
        if (withPosition.length) {
          chosen = withPosition[0];
          distance = chosen.distance;
          basis = chosen.positionSource === 'gps' ? 'nearest_gps' : 'nearest_site';
        }
      }
      if (!chosen) chosen = [...eligible].sort((a:any,b:any) => a.workload-b.workload || displayName(a.user).localeCompare(displayName(b.user)))[0];
      if (!chosen?.user?.id || !chosen.user.email) continue;

      const assignmentChanged = !existing || String(existing.assigned_to_id || '') !== String(chosen.user.id);
      let state = existing;
      if (!state) {
        state = await base44.asServiceRole.entities.WorkQueueState.create({
          task_key:task.key, queue_role:'supervisor', status:'open', title:task.title, person:task.person,
          source_kind:task.kind, source_id:task.source_id, assigned_to_id:String(chosen.user.id),
          assigned_to_email:lower(chosen.user.email), assigned_to_name:displayName(chosen.user), assigned_at:nowIso,
          assigned_distance_miles:distance === null ? null : Number(distance.toFixed(2)), assignment_basis:basis,
          source_location:task.location || '', source_latitude:origin?.lat ?? null, source_longitude:origin?.lon ?? null,
          last_seen_at:nowIso,
        });
        workload.set(String(chosen.user.id), (workload.get(String(chosen.user.id)) || 0) + 1);
      } else if (assignmentChanged) {
        if (state.alert_notification_id) {
          await base44.asServiceRole.entities.Notification.update(state.alert_notification_id, { is_read:true, acknowledged_at:nowIso }).catch(() => null);
        }
        state = await base44.asServiceRole.entities.WorkQueueState.update(state.id, {
          assigned_to_id:String(chosen.user.id), assigned_to_email:lower(chosen.user.email), assigned_to_name:displayName(chosen.user),
          assigned_at:nowIso, assigned_distance_miles:distance === null ? null : Number(distance.toFixed(2)), assignment_basis:basis,
          source_location:task.location || '', source_latitude:origin?.lat ?? null, source_longitude:origin?.lon ?? null,
          last_seen_at:nowIso, alert_notification_id:'',
        });
      } else {
        await base44.asServiceRole.entities.WorkQueueState.update(state.id, { last_seen_at:nowIso }).catch(() => null);
      }

      // Missing daily reports stay in the Supervisor Operations work queue, but
      // they must not create a global red banner/voice announcement for every report.
      if ((assignmentChanged || !state?.alert_notification_id) && task.kind !== 'missing_report') {
        const eventKey = `supervisor-task:${task.key}:${chosen.user.id}`;
        const prior = await base44.asServiceRole.entities.Notification.filter({ recipient_email:lower(chosen.user.email), type:'supervisor_task', task_key:task.key, is_read:false }, '-created_date', 5).catch(() => []);
        let notification = prior?.[0] || null;
        if (!notification) {
          notification = await base44.asServiceRole.entities.Notification.create({
            recipient_email:lower(chosen.user.email), type:'supervisor_task', title:task.title,
            message:`${task.person} · ${task.detail}`, is_read:false, related_id:task.source_id, priority:task.priority,
            requires_acknowledgment:true, source_name:'Supervisor Operations', task_key:task.key,
            event_key:eventKey, announcement_text:task.speech,
          });
        }
        if (notification?.id && state?.id) {
          await base44.asServiceRole.entities.WorkQueueState.update(state.id, { alert_notification_id:notification.id, last_seen_at:nowIso }).catch(() => null);
          state = { ...state, alert_notification_id:notification.id };
        }
      }
      assigned.push({
        ...state,
        detail:task.detail,
        priority:task.priority,
        announcement_text:task.speech,
        event_key:`supervisor-task:${task.key}:${chosen.user.id}`,
      });
    }

    const myId = String(me.id || '');
    const myEmail = lower(me.email);
    const myAssigned = assigned
      .filter((task:any) => String(task.assigned_to_id || '') === myId || lower(task.assigned_to_email) === myEmail)
      .sort((a:any,b:any) => {
        const priority = (v:any) => ({critical:4,high:3,normal:2,low:1}[lower(v)] || 0);
        return priority(b.priority)-priority(a.priority) || new Date(a.assigned_at || 0).getTime()-new Date(b.assigned_at || 0).getTime();
      });

    return Response.json({
      success:true,
      generated_at:nowIso,
      open_task_count:assigned.length,
      assigned_tasks:myAssigned,
      assigned_to_me_count:myAssigned.length,
      active_supervisors:candidates.map((candidate:any)=>({ id:candidate.user.id, name:displayName(candidate.user), unit_number:candidate.user.unit_number || '', position_source:candidate.positionSource })),
    });
  } catch (error) {
    console.error('syncSupervisorOperationalTasks failed', error);
    return Response.json({ error:error?.message || 'Unable to synchronize supervisor operational tasks', assigned_tasks:[] }, { status:500 });
  }
});