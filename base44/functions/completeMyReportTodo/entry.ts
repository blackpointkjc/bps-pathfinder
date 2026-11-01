import { createClientFromRequest } from 'npm:@base44/sdk';
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { todo_id } = await req.json().catch(() => ({}));
    if (!todo_id) return Response.json({ error: 'todo_id is required' }, { status: 400 });

    const todo = await base44.asServiceRole.entities.ReportTodo.get(todo_id);
    if (!todo) return Response.json({ error: 'Revision task not found' }, { status: 404 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const privileged = user.role === 'admin' || roles.has('full_access');
    const assignedToUser = String(todo.officer_email || '').toLowerCase() === String(user.email || '').toLowerCase();
    if (!privileged && !assignedToUser) return Response.json({ error: 'This revision task is not assigned to you' }, { status: 403 });

    const updated = await base44.asServiceRole.entities.ReportTodo.update(todo_id, { completed: true });
    return Response.json({ success: true, todo: updated });
  } catch (error) {
    console.error('completeMyReportTodo failed', error);
    return Response.json({ error: error?.message || 'Unable to complete revision task' }, { status: 500 });
  }
});