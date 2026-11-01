import { createClientFromRequest } from 'npm:@base44/sdk';
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const ALLOWED_ENTITIES = new Set([
  'TrainingClass', 'TrainingAttendee', 'TrainingCertificate', 'TrainingSchoolSettings',
  'TrainingModule', 'TrainingRequirement', 'TrainingAssignment', 'TrainingSubmission', 'CertificationTodo'
]);

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
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('trainer') && !roles.has('full_access')) {
      return Response.json({ error: 'Trainer access required' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const entity = String(body.entity || '');
    const action = String(body.action || '');
    if (!ALLOWED_ENTITIES.has(entity)) return Response.json({ error: 'Unsupported training entity' }, { status: 400 });

    const api = (base44.asServiceRole.entities as any)[entity];
    if (!api) return Response.json({ error: 'Training entity unavailable' }, { status: 400 });

    if (action === 'create') {
      const record = await api.create(body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      const record = await api.update(body.id, body.data || {});
      return Response.json({ success: true, record });
    }
    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Record id is required' }, { status: 400 });
      await api.delete(body.id);
      return Response.json({ success: true });
    }
    if (action === 'bulkCreate') {
      const records = await api.bulkCreate(body.data || []);
      return Response.json({ success: true, records });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageTrainingRecords failed', error);
    return Response.json({ error: error?.message || 'Unable to update training records' }, { status: 500 });
  }
});
