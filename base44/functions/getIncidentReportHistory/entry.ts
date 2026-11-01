import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T00:00:00.000Z';
function __portalLoginIsCurrent(request){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  const encoded=token.split('.')[1];
  const claims=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
  return Number(claims.iat)>=Math.floor(Date.parse(__portalReauthAfter)/1000);
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

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
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!__portalLoginIsCurrent(req))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const me = await base44.auth.me().then(__limitFullAccess);
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
