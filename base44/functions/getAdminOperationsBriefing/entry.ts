import { createClientFromRequest } from 'npm:@base44/sdk';

// Warm-worker successful source cache avoids repeated company-wide scans.
const sourceCache = new Map<string, { value:any[]; freshUntil:number; staleUntil:number }>();
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async req => {
  try {
    const api = createClientFromRequest(req);
    const me = await api.auth.me();
    const roles = new Set((me?.additional_roles || []).map((role:unknown) => String(role).toLowerCase()));
    if (!me || (me.role !== 'admin' && !roles.has('full_access')))
      return Response.json({error:'Administrator access required'},{status:403});

    const sourceErrors:string[] = [];
    const staleSources:string[] = [];
    const read = async (label:string, callback:()=>Promise<any[]>) => {
      const prior = sourceCache.get(label);
      if (prior && prior.freshUntil > Date.now()) return prior.value;
      for (let attempt=0; attempt<2; attempt++) {
        try {
          const result = await callback();
          if (!Array.isArray(result)) throw new Error('Invalid source response');
          sourceCache.set(label, { value:result, freshUntil:Date.now()+120000, staleUntil:Date.now()+600000 });
          return result;
        } catch(error:any) {
          const rateLimited = Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(String(error?.message || ''));
          if (attempt === 0 && !rateLimited) { await sleep(300); continue; }
          if (prior && prior.staleUntil > Date.now()) { staleSources.push(label); return prior.value; }
          sourceErrors.push(label);
          console.warn('Admin briefing source unavailable:',label,error?.message || error);
          return null;
        }
      }
      sourceErrors.push(label);
      return null;
    };
    // These operations are serialized to avoid introducing new Base44 request bursts.
    const users = await read('User directory',()=>api.asServiceRole.entities.User.list('-updated_date',1000));
    // These tables are independently optional; loading in parallel reduces the
    // chance that three sequential scans exceed the backend read budget.
    const [enrollments,access,tasks]=await Promise.all([
      read('Student enrollment',()=>api.asServiceRole.entities.StudentEnrollment.list('-created_date',100)),
      read('Access requests',()=>api.asServiceRole.entities.AccessRequest.list('-created_date',150)),
      read('Assigned work',()=>api.asServiceRole.entities.Task.list('-created_date',250)),
    ]);
    const pendingAccess=(access||[]).filter((row:any)=>String(row.status||'pending').toLowerCase()==='pending');
    const openTasks=(tasks||[]).filter((row:any)=>String(row.status||'open').toLowerCase()==='open');
    // Trainer assignments remain actionable, but the admin queue counts officers.
    const officerReviews = [...new Map(openTasks
      .filter((item:any)=>item.title === 'Review new officer certifications')
      .map((item:any)=>[String(item.related_id || item.id),item])).values()];
    const pendingEmployees = (users || []).filter((user:any)=>{
      const rank = String(user.rank || '').toLowerCase();
      const assigned = (user.additional_roles || []).length || user.role === 'admin' || user.role === 'dispatch';
      return !assigned && !user.termination_date && rank !== 'student registration pending';
    });
    const enrollmentRows = (enrollments || []).filter((item:any)=>['invited','profile_submitted'].includes(item.status));
    const namesById = new Map((users || []).map((user:any)=>[String(user.id), [user.first_name,user.last_name].filter(Boolean).join(' ').trim() || user.full_name?.trim() || user.email || `Account ${user.id}`]));
    return Response.json({
      success:true, generated_at:new Date().toISOString(), source_errors:sourceErrors, stale_sources:staleSources,
      status:{
        pending_employees: users === null ? null : pendingEmployees.length,
        pending_access_requests: access === null ? null : pendingAccess.length,
        pending_students: enrollments === null ? null : enrollmentRows.length,
        pending_trainer_reviews: tasks === null ? null : officerReviews.length,
        pending_hr: users === null || access === null ? null : pendingEmployees.length + pendingAccess.length,
      },
      items:[
        ...pendingEmployees.slice(0,30).map((item:any)=>({id:'employee-'+item.id,area:'HR',label:'Employee onboarding / access approval',person:namesById.get(String(item.id)) || 'Employee',status:'Pending admin review',page:'AdminCenter?admin_ops_section=people'})),
        ...pendingAccess.slice(0,25).map((item:any)=>({id:'access-'+item.id,area:'HR',label:'Account access request',person:item.full_name || item.email || 'Applicant',status:'Awaiting HR/admin decision',page:'AdminCenter?admin_ops_section=people'})),
        ...enrollmentRows.slice(0,35).map((item:any)=>({id:'student-'+item.id,area:'Student',label:'Student registration',person:[item.first_name,item.last_name].filter(Boolean).join(' ') || item.email,status:item.status==='profile_submitted'?'Ready for trainer review':'Waiting for student registration',page:'TrainerCenter?section=students'})),
        ...officerReviews.slice(0,35).map((item:any)=>({
          id:'training-'+(item.related_id || item.id), area:'Training',
          label:'Review officer certifications',
          person:namesById.get(String(item.related_id)) || item.related_name?.trim() || `Officer account unavailable · ${item.related_id || item.id}`,
          status:'Certification review pending',
          page:'TrainerCenter?section=compliance' + (item.related_id ? '&officer_id='+encodeURIComponent(item.related_id) : ''),
          action:'Review certifications',
        })),
      ],
    });
  } catch(error:any) {
    console.error('Admin operations briefing unavailable',error?.message || error);
    return Response.json({error:'Unable to load administrator operations briefing'},{status:500});
  }
});