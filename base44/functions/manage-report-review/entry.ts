import { createClientFromRequest } from "npm:@base44/sdk";

const TYPE_MAP: Record<string, { entity: string; approveStatus: string; todoType: string }> = {
  shift: { entity: 'ShiftReport', approveStatus: 'approved', todoType: 'shift_report' },
  daily_activity: { entity: 'DailyActivityReport', approveStatus: 'approved', todoType: 'daily_activity_report' },
  incident: { entity: 'IncidentReport', approveStatus: 'approved', todoType: 'incident_report' },
  trespass: { entity: 'TrespassingNotice', approveStatus: 'approved', todoType: 'trespass_notice' },
  parking: { entity: 'ParkingViolation', approveStatus: 'approved', todoType: 'parking_violation' },
  criminal: { entity: 'CriminalComplaint', approveStatus: 'approved', todoType: 'criminal_complaint' },
  summons: { entity: 'Summons', approveStatus: 'appeared', todoType: 'summons' },
  dispatcher_log: { entity: 'DispatcherShiftReport', approveStatus: 'approved', todoType: 'dispatcher_shift_log' },
};

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => lower(role)));
const siteKey = (value: unknown) => lower(value).split(' - ')[0].split(':')[0].trim();

function reviewerAllowed(user: any) {
  const roles = rolesOf(user);
  return user?.role === 'admin' || roles.has('full_access') || roles.has('report_review');
}

function reportAuthorEmail(report: any, users: any[]) {
  const direct = report?.dispatcher_email || report?.officer_email || report?.reporting_officer_email || report?.primary_officer_email;
  if (direct) return String(direct);
  const ref = String(report?.created_by_id || report?.created_by || '');
  const match = users.find((user: any) => String(user?.id || '') === ref || lower(user?.email) === lower(ref));
  return match?.email || (ref.includes('@') ? ref : '');
}

function reportAuthorName(report: any, users: any[], email: string) {
  if (report?.dispatcher_name) return String(report.dispatcher_name);
  const match = users.find((user: any) => lower(user?.email) === lower(email) || String(user?.id || '') === String(report?.created_by_id || ''));
  return [match?.rank, match?.first_name, match?.last_name].filter(Boolean).join(' ') || match?.full_name || email || 'Officer';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (!reviewerAllowed(me)) return Response.json({ error: 'Report review access required' }, { status: 403 });

    const { action, type, reportId, reason } = await req.json();
    const config = TYPE_MAP[String(type || '')];
    if (!config || !reportId) return Response.json({ error: 'A valid report type and report ID are required' }, { status: 400 });
    if (!['approve', 'reject'].includes(action)) return Response.json({ error: 'Action must be approve or reject' }, { status: 400 });
    if (action === 'reject' && !String(reason || '').trim()) return Response.json({ error: 'A rejection reason is required' }, { status: 400 });

    const entity = (base44.asServiceRole.entities as any)[config.entity];
    const report = await entity.get(reportId);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    const users = await base44.asServiceRole.entities.User.list('-updated_date', 3000);
    let updated: any;

    if (action === 'approve') {
      updated = await entity.update(reportId, {
        status: config.approveStatus,
        admin_notes: '',
        was_rejected: false,
      });

      // Client portal reads the approved report directly. This notification is only
      // a heads-up and must never block the approval itself.
      if (report?.location) {
        try {
          const locations = await base44.asServiceRole.entities.Location.list('site_name', 1000);
          const location = locations.find((row: any) => siteKey(row?.site_name) === siteKey(report.location));
          if (location) {
            const clientEmails = users.filter((user: any) => {
              const roles = rolesOf(user);
              const assigned = [
                ...(Array.isArray(user?.assigned_locations) ? user.assigned_locations : []),
                ...(Array.isArray(user?.assigned_sites) ? user.assigned_sites : []),
                user?.assigned_location,
              ].filter(Boolean).map(siteKey);
              return roles.has('client') && assigned.includes(siteKey(location.site_name));
            }).map((user: any) => user.email).filter(Boolean);
            if (clientEmails.length) {
              await base44.asServiceRole.entities.Announcement.create({
                title: `Approved report available - ${location.site_name}`,
                message: `A ${String(type).replaceAll('_', ' ')} has been approved and is now available in the Client Portal for ${location.site_name}.`,
                priority: type === 'incident' ? 'important' : 'normal',
                pinged_users: clientEmails,
              });
            }
          }
        } catch (notifyError) {
          console.warn('Report approved but client notification failed', notifyError);
        }
      }
    } else {
      updated = await entity.update(reportId, {
        status: 'rejected',
        admin_notes: String(reason).trim(),
        was_rejected: true,
      });
      const officerEmail = reportAuthorEmail(report, users);
      if (officerEmail) {
        const existing = await base44.asServiceRole.entities.ReportTodo.filter({
          officer_email: officerEmail,
          report_type: config.todoType,
          report_id: reportId,
          completed: false,
        }, '-created_date', 20);
        const todoData = {
          officer_email: officerEmail,
          officer_name: reportAuthorName(report, users, officerEmail),
          report_type: config.todoType,
          report_id: reportId,
          admin_feedback: String(reason).trim(),
          created_by_admin: me.email,
          completed: false,
          rejection_count: Math.max(1, Number(existing?.[0]?.rejection_count || 0) + 1),
        };
        if (existing?.[0]?.id) await base44.asServiceRole.entities.ReportTodo.update(existing[0].id, todoData);
        else await base44.asServiceRole.entities.ReportTodo.create(todoData);
      }
    }

    return Response.json({ success: true, report: updated, action, type });
  } catch (error) {
    console.error('manage-report-review failed', error);
    return Response.json({ error: error?.message || 'Unable to review report' }, { status: 500 });
  }
});