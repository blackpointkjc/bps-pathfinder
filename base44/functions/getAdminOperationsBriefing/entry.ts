import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async req => {
  try {
    const api = createClientFromRequest(req);
    const me = await api.auth.me();
    const roles = new Set((me?.additional_roles || []).map((role:unknown) => String(role).toLowerCase()));
    if (!me || (me.role !== 'admin' && !roles.has('full_access')))
      return Response.json({error:'Administrator access required'},{status:403});

    const sourceErrors:string[] = [];
    const read = async (label:string, callback:()=>Promise<any[]>) => {
      try { const result = await callback(); return Array.isArray(result) ? result : []; }
      catch(error) { sourceErrors.push(label); console.warn('Admin briefing source unavailable:',label); return null; }
    };
    // These operations are serialized to avoid introducing new Base44 request bursts.
    const users = await read('User directory',()=>api.asServiceRole.entities.User.list('-updated_date',1000));
    const enrollments = await read('Student enrollment',()=>api.asServiceRole.entities.StudentEnrollment.list('-created_date',250));
    const access = await read('Access requests',()=>api.asServiceRole.entities.AccessRequest.filter({status:'pending'},'-created_date',150));
    const tasks = await read('Assigned work',()=>api.asServiceRole.entities.Task.filter({status:'open'},'-created_date',250));
    const officerReviews = (tasks || []).filter((item:any)=>item.title === 'Review new officer certifications');
    const pendingEmployees = (users || []).filter((user:any)=>{
      const rank = String(user.rank || '').toLowerCase();
      const assigned = (user.additional_roles || []).length || user.role === 'admin' || user.role === 'dispatch';
      return !assigned && !user.termination_date && rank !== 'student registration pending';
    });
    const enrollmentRows = (enrollments || []).filter((item:any)=>['invited','profile_submitted'].includes(item.status));
    const namesById = new Map((users || []).map((user:any)=>[String(user.id), [user.first_name,user.last_name].filter(Boolean).join(' ').trim() || user.full_name?.trim() || user.email || `Account ${user.id}`]));
    return Response.json({
      success:true, generated_at:new Date().toISOString(), source_errors:sourceErrors,
      status:{
        pending_employees: users === null ? null : pendingEmployees.length,
        pending_access_requests: access === null ? null : access.length,
        pending_students: enrollments === null ? null : enrollmentRows.length,
        pending_trainer_reviews: tasks === null ? null : officerReviews.length,
        pending_hr: users === null || access === null ? null : pendingEmployees.length + access.length,
      },
      items:[
        ...pendingEmployees.slice(0,30).map((item:any)=>({id:'employee-'+item.id,area:'HR',label:'Employee onboarding / access approval',person:namesById.get(String(item.id)) || 'Employee',status:'Pending admin review',page:'AdminCenter?admin_ops_section=people'})),
        ...(access || []).slice(0,25).map((item:any)=>({id:'access-'+item.id,area:'HR',label:'Account access request',person:item.full_name || item.email || 'Applicant',status:'Awaiting HR/admin decision',page:'AdminCenter?admin_ops_section=people'})),
        ...enrollmentRows.slice(0,35).map((item:any)=>({id:'student-'+item.id,area:'Student',label:'Student registration',person:[item.first_name,item.last_name].filter(Boolean).join(' ') || item.email,status:item.status==='profile_submitted'?'Ready for trainer review':'Waiting for student registration',page:'TrainerCenter?section=students'})),
        ...officerReviews.slice(0,35).map((item:any)=>({
          id:'training-'+item.id, area:'Training',
          label:'Review officer certifications',
          person:namesById.get(String(item.related_id)) || item.related_name?.trim() || `Officer account unavailable · ${item.related_id || item.id}`,
          owner:namesById.get(String(item.assigned_to)) || item.assigned_name?.trim() || 'Trainer assignment unavailable',
          status:'Certification review pending',
          page:'TrainerCenter?section=compliance' + (item.related_id ? '&officer_id='+encodeURIComponent(item.related_id) : ''),
          action:'Review certifications',
        })),
      ],
    });
  } catch(error) {
    console.error('Admin operations briefing unavailable',error?.message || error);
    return Response.json({error:'Unable to load administrator operations briefing'},{status:500});
  }
});