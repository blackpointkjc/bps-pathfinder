const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

        const user = await base44.auth.me().then(__portalAppIdentity);
        
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