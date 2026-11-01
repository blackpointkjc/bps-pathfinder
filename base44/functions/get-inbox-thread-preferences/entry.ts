import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const currentUser = await base44.auth.me();
    if (!currentUser?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userEmail = String(currentUser.email).trim().toLowerCase();
    const allPreferences = await base44.asServiceRole.entities.InboxThreadPreference.list('-created_date', 1000);
    const preferences = (allPreferences || []).filter((item) =>
      String(item.user_email || '').trim().toLowerCase() === userEmail && item.hidden !== false
    );

    return Response.json({ success: true, preferences });
  } catch (error) {
    console.error('get-inbox-thread-preferences failed', error);
    return Response.json({ error: error?.message || 'Unable to load archived conversations' }, { status: 500 });
  }
});