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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!__portalLoginIsCurrent(req))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized', users: [] }, { status: 401 });
        }
        
        // Only fetch the fields we actually need to minimize CPU/data
        const allUsers = await base44.asServiceRole.entities.User.list();

        const isPrivileged = user.role === 'admin' || user.dispatch_role === true;

        // Regular users see active field units only
        // Admin/Dispatch also see Supervisor status units and Out of Service
        const REGULAR_STATUSES = new Set(['Available', 'On Scene', 'Enroute', 'Busy']);
        const PRIVILEGED_STATUSES = new Set(['Available', 'On Scene', 'Enroute', 'Supervisor', 'Out of Service', 'Busy']);
        const allowedStatuses = isPrivileged ? PRIVILEGED_STATUSES : REGULAR_STATUSES;

        const cutoff = Date.now() - 12 * 60 * 60 * 1000; // 12 hours - full shift window

        const activeUsers = (allUsers || []).filter(u => {
            if (u.id === user.id) return false;
            if (!allowedStatuses.has(u.status)) return false;
            // Supervisor status: hide from regular users (extra guard)
            if (!isPrivileged && u.status === 'Supervisor') return false;
            // Must have valid GPS coordinates
            const lat = parseFloat(u.latitude), lng = parseFloat(u.longitude);
            if (isNaN(lat) || isNaN(lng)) return false;
            // Must have been updated within the shift window
            const lastUpdated = u.last_updated ? new Date(u.last_updated).getTime() : 0;
            return lastUpdated > cutoff;
        });

        return Response.json({
            success: true,
            users: activeUsers,
            total: activeUsers.length
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        return Response.json({ success: false, error: error.message, users: [] }, { status: 200 });
    }
});