import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||user.termination_date||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const { officer_email } = await req.json();

    if (!officer_email) {
      return Response.json({ error: 'officer_email is required' }, { status: 400 });
    }

    // Authenticate caller and enforce authorization: admins may calculate PTO for
    // any officer; non-admins may only calculate for their own account.
    let caller;
    try {
      caller = await base44.auth.me().then(__limitFullAccess);
    } catch (_e) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!caller) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    const roles = new Set((caller.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const canRecalculateOthers = caller.role === 'admin' || roles.has('hr') || roles.has('full_access') || String(caller.rank || '').trim().toLowerCase() === 'human resources';
    if (!canRecalculateOthers && String(caller.email || '').toLowerCase() !== String(officer_email).toLowerCase()) {
      return Response.json({ error: 'Not authorized to calculate PTO for this officer' }, { status: 403 });
    }

    // Query only this officer's PTO/work ledgers. Loading every employee's full
    // history on each balance refresh was unnecessarily expensive and made this
    // function much more likely to collide with the global request allowance.
    const normalizedEmail = String(officer_email).trim().toLowerCase();
    const [users, allUsage, allAdjustments, allEntries] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ email: normalizedEmail }, '-updated_date', 5),
      base44.asServiceRole.entities.PTOUsage.filter({ officer_email: normalizedEmail }, '-usage_date', 1000),
      base44.asServiceRole.entities.PTOAdjustment.filter({ officer_email: normalizedEmail }, '-granted_at', 1000),
      base44.asServiceRole.entities.TimeEntry.filter({ officer_email: normalizedEmail }, '-clock_in', 3000),
    ]);
    const officer = users?.[0];

    if (!officer) {
      return Response.json({ error: 'Officer not found' }, { status: 404 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const normalizedRank = String(officer.rank || '').trim().toLowerCase();
    const annualEntitlement = normalizedRank === 'colonel' || normalizedRank === 'lt colonel' || normalizedRank === 'lieutenant colonel' ? 180 : 40;

    // Leave requests and balance adjustments are separate ledgers. Only actual
    // approved paid leave counts as PTO used. Bonuses/grants never count as earned accrual.
    const approvedPaidUsage = (allUsage || []).filter((usage: any) => {
      const requestDate = new Date(usage.usage_date || usage.recorded_at || 0);
      return String(usage.officer_email || '').trim().toLowerCase() === String(officer_email).trim().toLowerCase() &&
        usage.status === 'active' &&
        requestDate.getFullYear() === currentYear;
    });
    const bonusHours = (allAdjustments || [])
      .filter((entry: any) => String(entry.officer_email || '').trim().toLowerCase() === String(officer_email).trim().toLowerCase() && entry.active !== false)
      .reduce((sum: number, entry: any) => sum + Number(entry.hours || 0), 0);

    // Build list of date ranges where officer was actually on paid leave.
    const ptoDateRanges = approvedPaidUsage.map(usage => ({
      start: new Date(`${usage.usage_date}T00:00:00`),
      end: new Date(`${usage.usage_date}T23:59:59`)
    }));

    // Get completed time entries from this calendar year only.
    const officerEntries = (allEntries || []).filter(e => {
      const clockIn = new Date(e.clock_in || 0);
      return String(e.officer_email || '').trim().toLowerCase() === String(officer_email).trim().toLowerCase() &&
        Boolean(e.clock_out) &&
        clockIn.getFullYear() === currentYear;
    });

    // Calculate total hours worked, excluding hours during PTO weeks
    let totalHoursWorked = 0;
    
    for (const entry of officerEntries) {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      
      // Check if this shift falls during a PTO week
      const isDuringPTO = ptoDateRanges.some(range => 
        clockIn >= range.start && clockIn <= range.end
      );
      
      // Only count hours if NOT during PTO
      if (!isDuringPTO) {
        const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);
        totalHoursWorked += hoursWorked;
      }
    }

    // Accrual is proportional to hours worked against a 2,040-hour work year.
    // Colonel/Lt Colonel accrue up to 180 hours/year; every other rank accrues
    // up to 40 hours/year.
    const accrualRate = annualEntitlement / 2040;
    const ptoAccruedFromWork = Math.min(annualEntitlement, totalHoursWorked * accrualRate);

    // Earned PTO comes only from worked hours. There is no sick-leave conversion
    // or sick-time credit in the PTO accrual calculation.
    const totalPtoAccrued = Math.min(annualEntitlement, ptoAccruedFromWork);

    // Calculate used PTO
    const ptoUsed = approvedPaidUsage.reduce((sum, usage) => sum + Number(usage.hours || 0), 0);

    // Earned PTO is capped by rank entitlement; approved HR bonus/grant hours sit
    // on top of that entitlement and persist through future recalculations.
    const earnedAvailable = Math.max(0, Math.min(totalPtoAccrued, annualEntitlement));
    const ptoBalance = Math.max(0, earnedAvailable + bonusHours - ptoUsed);

    // Update officer PTO fields
    await base44.asServiceRole.entities.User.update(officer.id, {
      pto_year_to_date_accrued: totalPtoAccrued,
      pto_year_to_date_used: ptoUsed,
      pto_balance_hours: ptoBalance
    });

    return Response.json({ 
      success: true,
      officer_email,
      total_hours_worked: totalHoursWorked,
      accrual_rate: accrualRate,
      annual_entitlement: annualEntitlement,
      current_year: currentYear,
      bonus_hours: bonusHours,
      pto_from_work: ptoAccruedFromWork,
      total_pto_accrued: totalPtoAccrued,
      pto_used: ptoUsed,
      pto_balance: ptoBalance
    });

  } catch (error) {
    console.error('PTO calculation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});