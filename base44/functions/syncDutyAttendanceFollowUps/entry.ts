import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { clean, lower, isAdminAccount, isSupervisorRole, isAvailable, supervisorDisplayName as displayName } from '../../shared/supervisorIdentity.ts';

const isAdminUser = isAdminAccount;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch((error:any) => (error?.status === 401 ? null : Promise.reject(error)));
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    if (!isAdminUser(me)) return Response.json({ error:'Administrator access required' }, { status:403 });

    const request = await req.json().catch(() => ({}));
    const periodStart = clean(request?.period_start).slice(0, 10);
    const periodEnd = clean(request?.period_end).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      return Response.json({ error:'A valid review period is required' }, { status:400 });
    }
    const monthKey = periodStart.slice(0, 7);
    const nowIso = new Date().toISOString();

    const findings:any[] = [];
    for (const row of Array.isArray(request?.findings) ? request.findings.slice(0, 400) : []) {
      const email = lower(row?.officer_email);
      if (!email) continue;
      const items = (Array.isArray(row?.items) ? row.items : []).slice(0, 25)
        .map((item:any) => ({
          type:clean(item?.type) || 'duty',
          label:clean(item?.label).slice(0, 200),
          date:clean(item?.date).slice(0, 20),
          property:clean(item?.property).slice(0, 200),
        }))
        .filter((item:any) => item.label);
      if (!items.length) continue;
      findings.push({
        officer_email: email,
        officer_name: clean(row?.officer_name).slice(0, 120) || email,
        officer_id: clean(row?.officer_id),
        items,
      });
    }

    const users = await base44.asServiceRole.entities.User.list('-updated_date', 2000).catch(() => []);
    const supervisorPool = (users || []).filter((user:any) => isSupervisorRole(user) && !isAdminUser(user) && isAvailable(user));
    const candidates = supervisorPool.length
      ? supervisorPool
      : (users || []).filter((user:any) => isAdminUser(user) && isAvailable(user));

    const openRows = await base44.asServiceRole.entities.SupervisorFollowUp.filter({ status:'open' }, '-created_date', 500).catch(() => []);
    const workload = new Map<string, number>();
    const lastAssigned = new Map<string, number>();
    for (const row of openRows || []) {
      const owner = clean(row?.assigned_to_id);
      if (!owner) continue;
      workload.set(owner, (workload.get(owner) || 0) + 1);
      const at = new Date(row?.assigned_at || row?.created_date || 0).getTime();
      if (Number.isFinite(at) && at > (lastAssigned.get(owner) || 0)) lastAssigned.set(owner, at);
    }
    const periodRows = (openRows || []).filter((row:any) => clean(row?.period_start) === periodStart);
    const stateByKey = new Map<string, any>();
    for (const row of periodRows) {
      const key = clean(row?.task_key);
      if (key && !stateByKey.has(key)) stateByKey.set(key, row);
    }

    // Rotation: the least-loaded supervisor is chosen, and load plus the most
    // recent assignment time both count — so consecutive follow-ups spread across
    // the roster instead of landing on one supervisor.
    const pickSupervisor = (excludeEmail: string) => {
      const pool = candidates.filter((user:any) => lower(user.email) !== excludeEmail);
      if (!pool.length) return null;
      return [...pool].sort((left:any, right:any) => {
        const loadDiff = (workload.get(String(left.id)) || 0) - (workload.get(String(right.id)) || 0);
        if (loadDiff) return loadDiff;
        const timeDiff = (lastAssigned.get(String(left.id)) || 0) - (lastAssigned.get(String(right.id)) || 0);
        if (timeDiff) return timeDiff;
        return displayName(left).localeCompare(displayName(right));
      })[0];
    };

    let created = 0;
    let reassigned = 0;
    let retained = 0;
    let unassigned = 0;
    const assignments:any[] = [];
    const activeKeys = new Set<string>();

    for (const finding of findings.sort((a:any, b:any) => b.items.length - a.items.length)) {
      const taskKey = `duty-followup-${monthKey}-${finding.officer_email}`.slice(0, 200);
      activeKeys.add(taskKey);
      const existing = stateByKey.get(taskKey) || null;
      const keep = existing?.assigned_to_id
        ? candidates.find((user:any) => String(user.id) === String(existing.assigned_to_id) && lower(user.email) !== finding.officer_email)
        : null;
      const chosen = keep || pickSupervisor(finding.officer_email);
      if (!chosen?.id) { unassigned += 1; continue; }

      const dutyCount = finding.items.filter((item:any) => item.type !== 'call_out').length;
      const summary = [
        dutyCount ? `${dutyCount} missed dut${dutyCount === 1 ? 'y' : 'ies'}` : '',
        finding.items.length - dutyCount ? `${finding.items.length - dutyCount} call-out${finding.items.length - dutyCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' · ') || `${finding.items.length} finding${finding.items.length === 1 ? '' : 's'}`;
      const payload = {
        task_key: taskKey,
        title: `Reach out to ${finding.officer_name}`,
        officer_email: finding.officer_email,
        officer_name: finding.officer_name,
        officer_id: finding.officer_id || '',
        period_start: periodStart,
        period_end: periodEnd,
        month_key: monthKey,
        summary,
        items: finding.items,
        finding_count: finding.items.length,
        severity: finding.items.length >= 3 ? 'critical' : finding.items.length >= 2 ? 'high' : 'normal',
        assigned_to_id: String(chosen.id),
        assigned_to_email: lower(chosen.email),
        assigned_to_name: displayName(chosen),
        assigned_at: existing && String(existing.assigned_to_id) === String(chosen.id) ? (existing.assigned_at || nowIso) : nowIso,
        assignment_basis: keep ? 'retained' : 'rotation',
        status: 'open',
        last_seen_at: nowIso,
      };

      let saved:any = null;
      if (!existing) {
        saved = await base44.asServiceRole.entities.SupervisorFollowUp.create(payload);
        created += 1;
      } else {
        const changed = String(existing.assigned_to_id || '') !== String(chosen.id);
        if (changed) reassigned += 1; else retained += 1;
        saved = await base44.asServiceRole.entities.SupervisorFollowUp.update(existing.id, payload);
      }
      workload.set(String(chosen.id), (workload.get(String(chosen.id)) || 0) + 1);
      lastAssigned.set(String(chosen.id), Date.now());
      assignments.push({ officer_name: finding.officer_name, assigned_to_name: payload.assigned_to_name, finding_count: finding.items.length });

      if (!existing || String(existing.assigned_to_id || '') !== String(chosen.id)) {
        await base44.asServiceRole.entities.Notification.create({
          recipient_email: payload.assigned_to_email,
          type: 'supervisor_task',
          title: payload.title,
          message: `${summary} · ${periodStart} to ${periodEnd}`,
          is_read: false,
          related_id: saved?.id || '',
          priority: payload.severity,
          requires_acknowledgment: false,
          source_name: 'Duty & Attendance',
          task_key: taskKey,
        }).catch(() => null);
      }
    }

    // Follow-ups whose findings were exempted, corrected or withdrawn are retired
    // so a supervisor never chases an officer about an obligation that no longer exists.
    let closed = 0;
    for (const row of periodRows) {
      const key = clean(row?.task_key);
      if (!key || activeKeys.has(key)) continue;
      await base44.asServiceRole.entities.SupervisorFollowUp.update(row.id, {
        status: 'auto_closed',
        completed_at: nowIso,
        completed_by: 'Pathfinder Duty & Attendance Review',
        completion_note: 'No outstanding duty or attendance findings remain for this period.',
        last_seen_at: nowIso,
      }).catch(() => null);
      await base44.asServiceRole.entities.Notification.updateMany(
        { task_key: key, is_read: false },
        { $set: { is_read: true, acknowledged_at: nowIso } },
      ).catch(() => null);
      closed += 1;
    }

    return Response.json({
      success: true,
      period_start: periodStart,
      period_end: periodEnd,
      open_count: assignments.length,
      created,
      reassigned,
      retained,
      closed,
      unassigned,
      supervisor_count: candidates.length,
      assignments,
    });
  } catch (error:any) {
    console.error('syncDutyAttendanceFollowUps failed', error);
    return Response.json({ error: error?.message || 'Unable to assign supervisor follow-ups' }, { status: 500 });
  }
}