import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => lower(role)));
const identities = (user: any) => new Set([
  user?.email,
  user?.work_email,
  user?.pathfinder_email,
  user?.microsoft_email,
  user?.outlook_email,
  ...(Array.isArray(user?.email_aliases) ? user.email_aliases : []),
].map(lower).filter(Boolean));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedEmail = lower(body.officer_email);
    const roles = rolesOf(me);
    const canSearchOthers = me.role === 'admin' || roles.has('full_access');
    let officer = me;

    if (requestedEmail && !identities(me).has(requestedEmail)) {
      if (!canSearchOthers) return Response.json({ error: 'Incident History access denied.' }, { status: 403 });
      const users = await base44.asServiceRole.entities.User.list('-updated_date', 1500);
      officer = (users || []).find((person: any) => identities(person).has(requestedEmail));
      if (!officer) return Response.json({ error: 'Selected officer was not found.' }, { status: 404 });
    }

    const officerEmails = identities(officer);
    const reports = await base44.asServiceRole.entities.IncidentReport.list('-created_date', 2500);
    const authored = (reports || []).filter((report: any) =>
      String(report.reporting_officer_id || report.created_by_id || '') === String(officer.id || '')
      || officerEmails.has(lower(report.reporting_officer_email))
      || officerEmails.has(lower(report.officer_email))
      || officerEmails.has(lower(report.created_by))
    );

    return Response.json({
      success: true,
      officer: { id: officer.id, email: officer.email },
      reports: authored,
    });
  } catch (error) {
    console.error('getIncidentReportHistory failed', error);
    return Response.json({ error: error?.message || 'Unable to load Incident History.' }, { status: 500 });
  }
});
