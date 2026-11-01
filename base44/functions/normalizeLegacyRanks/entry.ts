import { createClientFromRequest } from 'npm:@base44/sdk';

const MAP: Record<string,string> = {
  'Colonel (Director of Company Operations)': 'Colonel',
  'Lt Colonel (Director of Security Operations)': 'Lt Colonel',
  'Major (Supervisor of Field Operations)': 'Major',
  'Major (Director of Field Operations)': 'Major',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r:string) => String(r).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Forbidden' }, { status: 403 });
    const users = await base44.asServiceRole.entities.User.list('-created_date', 500);
    let updated = 0;
    for (const person of users || []) {
      const next = MAP[String(person.rank || '')];
      if (next && next !== person.rank) { await base44.asServiceRole.entities.User.update(person.id, { rank: next }); updated++; }
    }
    return Response.json({ success: true, updated });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to normalize ranks' }, { status: 500 });
  }
});
