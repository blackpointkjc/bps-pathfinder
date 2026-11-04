const employee=p=>p&&!['client','student','visitor'].some(r=>(p.additional_roles||[]).includes(r)||p.user_type===r)&&((p.additional_roles||[]).some(r=>['officer','cad_access','supervisor'].includes(r))||['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','officer','unarmed officer','senior officer'].includes(String(p.rank||'').toLowerCase()));
const officerSummary=p=>({id:p.id,name:[p.rank,p.first_name,p.last_name].filter(Boolean).join(' ')||p.full_name||p.email,rank:p.rank||'',badge_number:p.badge_number||'',unit_number:p.unit_number||'',email:p.work_email||p.email,employment_status:p.employment_status||'active',profile_photo_url:p.profile_photo_url||'',division:p.division||'',subdivision:p.subdivision||''});
export async function globalCaseTools(ctx){
 const {action,body,db,u,review,base44,audit,notify,fail}=ctx;
 if(action==='officer_directory'){
  const users=await db.User.list('last_name',1000);
  return Response.json({officers:users.filter(employee).map(officerSummary)});
 }
 if(action==='training_options'){
  const rows=await db.TrainingRequirement.list('training_name',500);
  return Response.json({training:rows.filter(v=>v.active!==false).map(v=>({id:v.id,name:v.training_name,category:v.category,description:v.description||''}))});
 }
 if(action==='client_referrals'){
  if(!review)fail('Reviewer access required.',403);
  const rows=await db.ClientFeedback.filter({$or:[{complaint:true},{commendation:true}]},'-created_date',200);
  return Response.json({referrals:rows});
 }
 if(action==='notifications'){
  if(!review)fail('Reviewer access required.',403);
  const rows=await db.PSNotification.list('-created_date',100);
  return Response.json({notifications:rows.map(({body,...v})=>v)});
 }
 if(action==='retry_notification'){
  if(!review)fail('Reviewer access required.',403);
  const item=await db.PSNotification.get(String(body.notification_id||''));
  if(item&&/^Professional Standards update /i.test(item.subject||'')){await db.PSNotification.update(item.id,{status:'cancelled',last_error:'Submitter email is disabled. Updates remain on the private tracking webpage.'});fail('Submitter email is disabled. Updates are available on the tracking webpage.');}
  if(!item||['sent','cancelled'].includes(item.status))fail('Choose an unsent notification.');
  const sent=await notify(base44,item.to,item.subject,item.body,u,item.id);
  await audit(db,u,'notification_retry','',item.id);
  return Response.json({success:true,email_sent:sent});
 }
 return null;
}
export async function linkedCaseTools(ctx){
 const {action,body,db,u,c,records,review,editable,base44,audit,notify,fail,text,actorName}=ctx;
 const linked=new Set(c.officer_ids||[]);
 const getSubject=async()=>{
  const id=text(body.officer_id,100);
  if(!linked.has(id))fail('Link this officer to the case before opening their file or taking an action.',403);
  const person=await db.User.get(id);
  if(!employee(person))fail('Officer record not found.',404);
  return person;
 };
 if(action==='link_officers'){
  if(!editable)fail('Assign the case before changing involved officers.',403);
  const ids=[...new Set(Array.isArray(body.officer_ids)?body.officer_ids.map(v=>text(v,100)):[])];
  if(ids.length>25)fail('Link no more than 25 officers to a case.');
  const users=await db.User.list('last_name',1000);
  if(ids.some(id=>!users.some(v=>v.id===id&&employee(v))))fail('Choose officers from the personnel directory.');
  const names=ids.map(id=>{const person=users.find(v=>v.id===id);return [person.rank,person.first_name,person.last_name].filter(Boolean).join(' ')||person.full_name||person.email;});
  await db.PSCase.update(c.id,{officer_ids:ids,...(names.length?{officers:names.join('; ')}:{}),version:Number(c.version||0)+1});
  await audit(db,u,'case_officers_linked',c.id,ids.join(', '));
  return Response.json({success:true});
 }
 if(action==='officer_file'){
  const person=await getSubject(),legacyHiers=person.id==='6ae7d733d4b1a647cd3e6f38',emails=[...new Set([person.email,person.work_email,person.pathfinder_email,...(person.email_aliases||[]),...(legacyHiers?['kavonhiers@team-hsg.com']:[])].filter(Boolean))];
  const q={$or:[{officer_email:{$in:emails}},{officer_id:{$in:legacyHiers?[person.id,'6a72bbee2842d6338cbae513']:[person.id]}}]};
  const [training,writeups,inspections,reviews,profileEvents,caseActions]=await Promise.all([
   db.TrainingAssignment.filter({officer_email:{$in:emails}},'-created_date',50),
   db.WriteUpReport.filter(q,'-created_date',50),db.InspectionReport.filter(q,'-created_date',50),db.PerformanceReview.filter(q,'-created_date',50),
   (async()=>{
    const primary=await db.AuditLog.filter({entity_type:'User',entity_id:person.id},'-timestamp',500).catch(()=>[]);
    if(person.id!=='6ae7d733d4b1a647cd3e6f38')return primary;
    const legacy=await db.AuditLog.filter({entity_type:'User',entity_id:'6a72bbee2842d6338cbae513'},'-timestamp',500).catch(()=>[]);
    return [...primary,...legacy.map((event)=>({...event,id:'legacy-'+event.id,description:'Prior Hiers account · '+String(event.description||'Profile event')}))].sort((a,b)=>String(b.timestamp||b.created_date).localeCompare(String(a.timestamp||a.created_date)));
   })(),
   db.PSRecord.filter({officer_id:person.id},'-created_date',150).catch(()=>[])
  ]);
  const cleanReview=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!/pay|salary|hourly|bank|ssn|tax|signature/i.test(key)));
  await audit(db,u,'officer_file_view',c.id,person.id);
  return Response.json({officer:{...officerSummary(person),dcjs_number:person.dcjs_number||'',dcjs_expiration:person.dcjs_expiration||'',firearm_expiration:person.firearm_expiration||'',hire_date:person.hire_date||'',certifications:person.officer_certifications||[]},training,writeups,inspections,caseActions:caseActions.filter((row)=>['corrective_action','recommendation'].includes(row.kind)&&['executed','open','completed','applying'].includes(row.status)).map((row)=>({id:row.id,case_id:row.case_id,kind:row.kind,title:row.title,action_type:row.action_type,status:row.status,body:row.kind==='recommendation'?'Approved IA personnel decision':row.body,created_date:row.created_date})),reviews:reviews.map(cleanReview),profileEvents:profileEvents.map((row)=>({id:row.id,action:row.action,field_changed:row.field_changed,actor_name:row.actor_name,timestamp:row.timestamp||row.created_date,description:row.description,before_value:row.before_value,after_value:row.after_value}))});
 }
 // Investigator proposals are never disciplinary orders. They remain private
 // until an independent IA reviewer approves a final, editable decision.
 if(action==='recommend_action'){
  if(!editable || ['approved','closed'].includes(c.status))fail('This investigation cannot accept new recommendations.',403);
  const officer=await getSubject();
  const types=['counseling','written_warning','final_warning','duty_restriction','external_referral','training','suspension','other','no_action'];
  const type=text(body.directive_type,60),instructions=text(body.instructions,5000),reason=text(body.reason,5000);
  if(!types.includes(type)||reason.length<20||instructions.length<20)fail('Choose an action and provide at least 20 characters of rationale and proposed instructions.');
  const proposal=await db.PSRecord.create({case_id:c.id,kind:'recommendation',action_type:type,officer_id:officer.id,title:'Recommended: '+(type==='other'?text(body.custom_title,120)||'Other personnel action':type.replaceAll('_',' ')),body:JSON.stringify({reason,instructions,custom_title:text(body.custom_title,120),due_date:text(body.due_date,10),suspension_until:text(body.suspension_until,40)}),status:'proposed',author_id:u.id,author_name:actorName(u)});
  await audit(db,u,'personnel_action_recommended',c.id,proposal.id+' '+type+' '+officer.id);
  return Response.json({success:true,recommendation_id:proposal.id});
 }
 if(action==='decide_recommendation'){
  if(!review)fail('Only an IA reviewer can approve, change or reject proposed discipline.',403);
  if(c.status!=='approved')fail('Approve the investigation findings before enforcing a recommendation.',409);
  if(c.investigator_id===u.id)fail('An independent reviewer must authorize disciplinary action.',403);
  const proposed=records.find(r=>r.id===text(body.record_id,100)&&r.kind==='recommendation');
  if(!proposed)fail('Recommendation not found.',404);
  if(['executed','rejected'].includes(proposed.status))return Response.json({success:true,existing:true});
  if(['executing','execution_needs_review'].includes(proposed.status))fail('Execution was already started. Review personnel records and reconcile the action before retrying.',409);
  const decision=text(body.decision,20);
  if(!['approve','reject'].includes(decision))fail('Select approve or reject.');
  const rationale=text(body.review_reason,5000);
  if(rationale.length<20)fail('Document the independent review decision in at least 20 characters.');
  if(decision==='reject'){
   await db.PSRecord.update(proposed.id,{status:'rejected',policy:rationale});
   await audit(db,u,'personnel_recommendation_rejected',c.id,proposed.id+' '+rationale);
   return Response.json({success:true});
  }
  const type=text(body.directive_type||proposed.action_type,60);
  const types=['counseling','written_warning','final_warning','duty_restriction','external_referral','training','suspension','other','no_action'];
  if(!types.includes(type))fail('Unsupported personnel action.');
  const initial=JSON.parse(proposed.body||'{}');
  const reason=text(body.reason??initial.reason,5000),instructions=text(body.instructions??initial.instructions,5000);
  const customTitle=text(body.custom_title??initial.custom_title,120),due=text(body.due_date??initial.due_date,10);
  const until=text(body.suspension_until??initial.suspension_until,40);
  if(reason.length<20||instructions.length<20)fail('An approved action requires documented reasons and instructions.');
  if(type==='other'&&customTitle.length<5)fail('Describe the custom personnel action.');
  if(type==='training'&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||instructions.length<20))fail('Corrective training requires completion instructions and a due date.');
  const subject=await db.User.get(proposed.officer_id);
  if(!subject||!employee(subject)||subject.id===u.id)fail('Reviewer cannot impose this action on their own record.',403);
  if(type==='suspension'&&subject.role==='admin')fail('Administrator suspensions require main account administration.',403);
  // A durable lock prevents a repeated approval click from issuing a second
  // directive while its personnel record is being created.
  await db.PSRecord.update(proposed.id,{status:'executing',policy:rationale});
  const apply=async()=>{
   if(type==='no_action')return {success:true};
   if(type==='other'){
    const created=await db.PSRecord.create({case_id:c.id,kind:'corrective_action',action_type:'other',officer_id:subject.id,title:customTitle,body:reason+'\nEmployee instructions: '+instructions,due_date:due,status:'open',author_id:u.id,author_name:actorName(u)});
    await db.Notification.create({recipient_email:subject.email,title:'Personnel action: '+customTitle,message:instructions,type:'general',read:false});
    await audit(db,u,'custom_personnel_action_issued',c.id,subject.id+' '+created.id);
    return {success:true};
   }
   const extra=type==='suspension'?{action:'suspend_officer',suspension_until:until}:type==='training'?{action:'assign_training',training_name:customTitle||'Required corrective training',training_instructions:instructions, due_date:due}:{action:'issue_directive',directive_type:type,due_date:due,instructions};
   return await linkedCaseTools({...ctx,body:{...extra,officer_id:subject.id,reason},records:records.filter(row=>row.id!==proposed.id)});
  };
  try{
   const applied=await apply();
   if(!applied)fail('The personnel action could not be issued.');
   await db.PSRecord.update(proposed.id,{status:'executed',action_type:type,policy:rationale,linked_entity:'PSCase',linked_id:c.id,title:'Approved: '+(type==='other'?customTitle:type.replaceAll('_',' ')),body:JSON.stringify({reason,instructions,custom_title:customTitle,due_date:due,suspension_until:until,reviewer:u.id})});
   // Mirror the executed decision to the employee's permanent HR history;
   // this preserves the cross-workspace personnel file without copying IA evidence.
   await db.AuditLog.create({entity_type:'User',entity_id:subject.id,action:'disciplinary_action',actor_id:u.id,actor_name:actorName(u),timestamp:new Date().toISOString(),description:'IA '+c.reference+' · '+(type==='other'?customTitle:type.replaceAll('_',' '))+' approved and recorded',after_value:JSON.stringify({case_id:c.id,reference:c.reference,review_id:proposed.id,action:type,status:'executed'})});
   await audit(db,u,'personnel_recommendation_executed',c.id,proposed.id+' '+type+' '+subject.id+' reviewer:'+u.id);
   return Response.json({success:true,executed:true});
  }catch(error){
   // Do not automatically retry a partly applied suspension or directive.
   await db.PSRecord.update(proposed.id,{status:'execution_needs_review'}).catch(()=>null);
   throw error;
  }
 }
 if(action==='document_outcome'){
  if(!review)fail('Reviewer access required to document the case decision.',403);
  if(c.status==='closed')fail('Reopen the case before changing its outcome.');
  const summary=text(body.summary,12000),outcome=text(body.outcome,100);
  if(summary.length<20||!['sustained','not_sustained','unfounded','exonerated','policy_failure','mixed_findings','commendation'].includes(outcome))fail('Choose a result and document the decision in at least 20 characters.');
  await db.PSRecord.create({case_id:c.id,kind:'disposition',title:'Investigation result: '+outcome.replaceAll('_',' '),body:summary,finding:outcome,author_id:u.id,author_name:actorName(u),status:'recorded'});
  await db.PSCase.update(c.id,{outcome_summary:summary,outcome_recorded_by:u.id,outcome_recorded_at:new Date().toISOString(),version:Number(c.version||0)+1});
  // Fixed public milestone only; never disclose the disposition category or summary.
  if(!records.some(r=>r.kind==='public_release'&&r.policy==='milestone:disposition:'+c.id))await db.PSRecord.create({case_id:c.id,kind:'public_release',title:'Case decision documented',body:'A case decision has been documented for administrative review. Confidential details remain restricted.',policy:'milestone:disposition:'+c.id,author_id:u.id,author_name:'Professional Standards',status:'published'});
  await audit(db,u,'case_outcome_documented',c.id,outcome);
  return Response.json({success:true});
 }
 if(action==='issue_directive'){
  if(!review)fail('Only an IA reviewer may issue personnel directives.',403);
  if(c.status==='closed')fail('Reopen the case before issuing a directive.');
  const person=await getSubject(),type=text(body.directive_type,60),instructions=text(body.instructions,5000),reason=text(body.reason,5000),due=text(body.due_date,10);
  if(person.id===u.id)fail('Another reviewer must issue personnel actions involving you.',403);
  if(!['counseling','written_warning','final_warning','duty_restriction','external_referral'].includes(type)||instructions.length<20||reason.length<20)fail('Select a directive and document both private rationale and employee instructions in at least 20 characters.');
  if(['written_warning','final_warning'].includes(type)&&c.status!=='approved')fail('Approve the investigation findings before issuing a written or final warning.');
  const existing=records.find(r=>r.action_type===type&&r.officer_id===person.id&&r.status!=='completed');
  if(existing)return Response.json({success:true,existing:true});
  let linked=null;
  if(['written_warning','final_warning'].includes(type))linked=await db.WriteUpReport.create({report_date:new Date().toISOString(),officer_name:[person.first_name,person.last_name].filter(Boolean).join(' ')||person.full_name,officer_email:person.email,incident_date:c.incident_date||new Date().toISOString(),location:c.location||'Professional Standards',violation_type:'conduct_violation',severity:type,description:instructions,corrective_action:instructions,status:'approved',reviewed_by:u.email,reviewed_date:new Date().toISOString(),acknowledged_by_officer:false});
  const record=await db.PSRecord.create({case_id:c.id,kind:'corrective_action',action_type:type,officer_id:person.id,title:type.replaceAll('_',' '),body:reason+'\nEmployee instructions: '+instructions,due_date:due,status:'open',linked_entity:linked?'WriteUpReport':'',linked_id:linked?.id||'',author_id:u.id,author_name:actorName(u)});
  await db.Notification.create({recipient_email:person.email,title:'Personnel directive: '+type.replaceAll('_',' '),message:instructions+(due?' · Due '+due:''),type:'general',read:false});
  await audit(db,u,'personnel_directive_issued',c.id,person.id+' '+type+' '+record.id);
  const email_sent=await notify(base44,person.work_email||person.email,'BlackPoint personnel directive','A personnel directive has been issued. Sign in to Pathfinder to review your notification'+(linked?' and acknowledge the write-up.':'.'),u);
  return Response.json({success:true,email_sent});
 }
 if(action==='assign_training'){
  if(!review)fail('Only an IA reviewer may require corrective training.',403);
  if(c.status==='closed')fail('Reopen the case before assigning training.');
  const person=await getSubject(),reason=text(body.reason,5000),due=text(body.due_date,10);
  const requirement=body.requirement_id?await db.TrainingRequirement.get(text(body.requirement_id,100)):{id:'',training_name:text(body.training_name,300),description:text(body.training_instructions,5000),category:'in_service',required_proof_type:'document',requires_photos:false,requires_expiration_date:false,requires_certificate_number:false,active:true};
  if(!body.requirement_id&&(requirement.training_name.length<3||requirement.description.length<20))fail('Enter a course name and at least 20 characters of completion instructions.');

  if(!requirement||requirement.active===false||reason.length<10||!/^\d{4}-\d{2}-\d{2}$/.test(due))fail('Select a course, due date, and documented reason.');
  const email=person.work_email||person.email;
  const existing=await db.TrainingAssignment.filter({ps_case_id:c.id,officer_email:email,training_name:requirement.training_name},'-created_date',10);
  const activeAssignment=existing.find(v=>!['rejected','expired'].includes(v.status));
  if(activeAssignment){
   if(!records.some(r=>r.linked_entity==='TrainingAssignment'&&r.linked_id===activeAssignment.id))await db.PSRecord.create({case_id:c.id,kind:'corrective_action',action_type:'training',officer_id:person.id,linked_entity:'TrainingAssignment',linked_id:activeAssignment.id,title:'Required training: '+requirement.training_name,body:reason,due_date:activeAssignment.due_date,status:activeAssignment.status==='approved'?'completed':'open',author_id:u.id,author_name:actorName(u)});
   return Response.json({success:true,existing:true,training_assignment_id:activeAssignment.id});
  }

  const assignment=await db.TrainingAssignment.create({requirement_id:requirement.id,training_name:requirement.training_name,category:requirement.category,description:requirement.description||'',officer_email:email,officer_name:[person.first_name,person.last_name].filter(Boolean).join(' '),assigned_date:new Date().toISOString().slice(0,10),due_date:due,is_mandatory:true,priority:'high',status:'assigned',assigned_by:u.email,required_proof_type:requirement.required_proof_type||'',requires_photos:requirement.requires_photos===true,requires_expiration_date:requirement.requires_expiration_date===true,requires_certificate_number:requirement.requires_certificate_number===true,ps_case_id:c.id,ps_case_reference:c.reference,admin_notes:'Required training. Contact Training for completion instructions.'});
  await db.PSRecord.create({case_id:c.id,kind:'corrective_action',action_type:'training',officer_id:person.id,linked_entity:'TrainingAssignment',linked_id:assignment.id,title:'Required training: '+requirement.training_name,body:reason,due_date:due,status:'open',author_id:u.id,author_name:actorName(u)});
  await audit(db,u,'corrective_training_assigned',c.id,person.id+' '+assignment.id);
  const email_sent=await notify(base44,email,'Required Pathfinder training','Training has been assigned: '+requirement.training_name+'. Due '+due+'. Sign in to Pathfinder and open your training assignments.',u);
  return Response.json({success:true,email_sent,training_assignment_id:assignment.id});
 }
 if(action==='suspend_officer'){
  if(!review)fail('Only an IA reviewer may impose a suspension.',403);
  if(c.status==='closed')fail('Reopen the case before adding a suspension.');
  const person=await getSubject(),reason=text(body.reason,5000);
  if(person.id===u.id)fail('You cannot suspend your own account.',403);
  if(person.role==='admin')fail('System administrator suspensions require main account administration. Record the recommendation in this case.',403);
  if(reason.length<20)fail('Document the suspension decision and reason in at least 20 characters.');
  if(records.some(r=>r.action_type==='suspension'&&r.officer_id===person.id&&r.status!=='completed'))return Response.json({success:true,existing:true});
  const prior=await db.PSRecord.filter({officer_id:person.id,action_type:'suspension'},'-created_date',100);
  const baseline=prior.find(r=>r.status!=='completed'&&r.previous_account_state?.employment_status!=='suspended')?.previous_account_state;
  const now=new Date().toISOString(),previous=baseline||{employment_status:person.employment_status||'active',account_status:person.account_status||'approved',portal_approved:person.portal_approved!==false};

  const lock=await db.AccountLock.create({user_id:person.id,user_email:person.email,locked:true,reason:'Professional Standards suspension · '+c.reference,message:'Your account is suspended. Contact BlackPoint administration.',locked_by_email:u.email,locked_by_name:actorName(u),locked_at:now});
  let suspension;
  try{suspension=await db.PSRecord.create({case_id:c.id,kind:'corrective_action',action_type:'suspension',officer_id:person.id,linked_entity:'AccountLock',linked_id:lock.id,previous_account_state:previous,title:'Officer suspension',body:reason,status:'applying',suspension_until:text(body.suspension_until,40),author_id:u.id,author_name:actorName(u)});}catch(error){await db.AccountLock.update(lock.id,{locked:false,unlocked_at:now,unlocked_by_email:u.email});throw error;}
  await db.User.update(person.id,{employment_status:'suspended',account_status:'suspended',portal_approved:false,status:'Out of Service'});
  const sessions=await db.PortalAuthSession.filter({user_id:person.id},'-created_date',1000);
  for(const session of sessions)await db.PortalAuthSession.update(session.id,{revoked:true,revoked_at:now});
  const active=await db.ActiveOfficer.filter({officer_email:person.work_email||person.email},'-created_date',100);
  for(const row of active)await db.ActiveOfficer.update(row.id,{session_active:false,status:'Out of Service',last_update:now});
  const units=await db.Unit.filter({user_id:person.id},'-created_date',100);
  for(const row of units)await db.Unit.update(row.id,{status:'Out of Service',last_updated:now});
  await db.PSRecord.update(suspension.id,{status:'open'});
  await audit(db,u,'officer_suspended',c.id,person.id);
  const email_sent=await notify(base44,person.work_email||person.email,'BlackPoint account suspension','Your Pathfinder access has been suspended. Contact BlackPoint administration for instructions.',u);
  return Response.json({success:true,email_sent});
 }
 if(action==='lift_suspension'){
  if(!review)fail('Only an IA reviewer may lift this suspension.',403);
  const record=records.find(r=>r.id===body.record_id&&r.action_type==='suspension');
  if(!record||record.status==='completed')fail('Choose an active suspension.');
  const reason=text(body.reason,5000);if(reason.length<20)fail('Document the reinstatement decision in at least 20 characters.');
  const now=new Date().toISOString();
  await db.AccountLock.update(record.linked_id,{locked:false,unlocked_by_email:u.email,unlocked_at:now});
  const others=await db.AccountLock.filter({user_id:record.officer_id,locked:true},'-created_date',100);
  if(!others.length){
   const current=await db.User.get(record.officer_id);
   if(current.account_status==='suspended')await db.User.update(current.id,{...record.previous_account_state,status:'Out of Service'});
  }
  await db.PSRecord.update(record.id,{status:'completed'});
  await db.PSRecord.create({case_id:c.id,kind:'note',title:'Suspension lifted',body:reason,officer_id:record.officer_id,author_id:u.id,author_name:actorName(u),status:'recorded'});
  await audit(db,u,'suspension_lifted',c.id,record.officer_id);
  return Response.json({success:true});
 }
 return null;
}
