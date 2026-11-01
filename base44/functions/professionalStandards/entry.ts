import {globalCaseTools,linkedCaseTools} from './caseTools.ts';
import {createClientFromRequest,text,roles,manager,psRole,identity,hash,random,fail,audit,notify,actorName} from './security.ts';
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

const legacyEntities=new Set(['Complaint','Commendation','ConfidentialReport','UseOfForceReport','WriteUpReport','InspectionReport','PerformanceReview','OfficerPerformanceReview','ClientFeedback']);
async function legacyRequest(base44,db,u,body,privileged=false){
 const name=text(body.entity,80),method=text(body.method,30),args=Array.isArray(body.args)?body.args:[];
 if(name==='ClientFeedback'&&!privileged)fail('Reviewer access required.',403);
 if(!legacyEntities.has(name)||!['list','filter','get','create','update','delete'].includes(method))fail('Unsupported reporting operation.');
 if(method==='delete'&&!manager(u))fail('Only main account administrators may delete legacy reports.',403);
 if(args.length>5)fail('Invalid operation arguments.');
 const entity=(privileged?base44.asServiceRole.entities:base44.entities)[name];
 const requestId=random(8);
 await audit(db,u,'legacy_'+method+'_requested','',name+' '+requestId+(typeof args[0]==='string'?' '+text(args[0],100):''));
 let result;
 if(method==='list')result=await entity.list(text(args[0],100)||'-created_date',Math.min(1000,Math.max(1,Number(args[1])||200)),Math.max(0,Number(args[2])||0));
 if(method==='filter')result=await entity.filter(args[0]||{},text(args[1],100)||'-created_date',Math.min(1000,Math.max(1,Number(args[2])||200)),Math.max(0,Number(args[3])||0));
 if(method==='get')result=await entity.get(text(args[0],100));
 if(['create','update'].includes(method)){
  const value=method==='create'?args[0]:args[1];
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Report data is required.');
  const patch=Object.fromEntries(Object.entries(value).filter(([k])=>!['id','created_by','created_by_id','app_id','created_date','updated_date'].includes(k)));
  result=method==='create'?await entity.create(patch):await entity.update(text(args[0],100),patch);
 }
 if(method==='delete')result=await entity.delete(text(args[0],100));
 await audit(db,u,'legacy_'+method+'_completed','',name+' '+requestId);
 return Response.json({result});
}

const kinds=['note','interview','task','allegation','corrective_action','policy','evidence'];
const allowedFiles=/^(image\/(jpeg|png|webp|heic)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|wav|x-wav|ogg|webm)|application\/(pdf|msword|vnd.openxmlformats-officedocument.wordprocessingml.document)|text\/plain)$/;
const publicStates=['Received','Under review','Investigation in progress','Review completed','Closed'];
const buckets=new Map();
function throttle(req,action){
 const key=String(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'shared').split(',')[0]+':'+action;
 const now=Date.now(), b=buckets.get(key)||{at:now,n:0};
 if(now-b.at>600000){b.at=now;b.n=0;} b.n++;buckets.set(key,b);
 if(b.n>(action==='track'?30:8))fail('Too many requests. Please try again in ten minutes.',429);
 if(buckets.size>5000)buckets.clear();
}
async function upload(base44,db,u,c,files){
 const results=[];
 if(files.length>5)fail('Attach at most five files.');
 if(files.some(f=>!allowedFiles.test(f.type)||f.size>20*1024*1024||f.size===0))fail('Use a supported photo, video, audio, PDF, Word or text file, up to 20 MB each.');
 for(const file of files){
  const file_hash=await hash(new Uint8Array(await file.arrayBuffer()));
  const existing=await db.PSRecord.filter({case_id:c.id,kind:'evidence',file_hash},'-created_date',1);
  if(existing[0]){results.push(existing[0]);continue;}
  const {file_uri}=await base44.asServiceRole.integrations.Core.UploadPrivateFile({file});
  if(!file_uri)fail('Evidence upload was not confirmed.',503);
  results.push(await db.PSRecord.create({case_id:c.id,kind:'evidence',title:text(file.name,200),file_name:text(file.name,200),file_uri,file_type:file.type,file_size:file.size,file_hash,author_id:u?.id||'',author_name:actorName(u),status:'received'}));
 }
 return results;
}
export default async function(req){
 const base44=createClientFromRequest(req),db=base44.asServiceRole.entities;
 try{
  let body,files=[];
  if(req.headers.get('content-type')?.includes('multipart/form-data')){
   const form=await req.formData(); body=JSON.parse(String(form.get('payload')||'{}'));files=[...form.entries()].filter(([key,f])=>key.startsWith('file_')&&f instanceof File).map(([,f])=>f);
  }else body=await req.json();
  const action=text(body.action,50);
  if(action==='contact')return Response.json({phone:'855-8BPS911 ext. 799',email:'IA@blackpointkjc.com',office_hours:'Monday–Friday, 8:00 AM–6:00 PM Eastern. Contact the office for language or accessibility assistance.',address:'701 E Franklin St, Suite 105 1052, Richmond, VA 23219',instructions:'For immediate danger or an emergency, call 911. This form is for complaints and commendations, not emergency dispatch. You may report anonymously. Keep your reference and private tracking code; anonymous codes cannot be recovered.'});
  if(action==='submit'){
   throttle(req,'submit');
   if(body.website)fail('Submission could not be accepted.');
   if(!['complaint','commendation'].includes(body.kind))fail('Choose complaint or commendation.');
   if(text(body.description,12001).length<20||text(body.description,12001).length>12000)fail('Enter between 20 and 12,000 characters describing the incident.');
   if(!text(body.location)||!text(body.incident_date)||!Number.isFinite(Date.parse(body.incident_date)))fail('Incident date and location are required.');
   if(Date.parse(body.incident_date)>Date.now()+86400000)fail('Incident date cannot be in the future.');
   if(files.length>5||files.some(f=>!allowedFiles.test(f.type)||f.size>20*1024*1024||f.size===0))fail('Check file types and the five-file / 20 MB per file limits.');
   const anonymous=body.anonymous===true;
   if(!anonymous&&(!text(body.complainant_name)||!['email','phone','none'].includes(body.contact_preference)))fail('Enter your name and a contact preference, or choose anonymous.');
   if(!anonymous&&body.contact_preference==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(body.contact_email)))fail('Enter a valid email address.');
   if(!anonymous&&body.contact_preference==='phone'&&!text(body.contact_phone))fail('Enter a phone number.');
   const tracking_code=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0'),reference='PS-'+new Date().getFullYear()+'-'+random(6).toUpperCase();
   const c=await db.PSCase.create({reference,tracking_hash:await hash(tracking_code),kind:body.kind,anonymous,complainant_name:anonymous?'Anonymous':text(body.complainant_name,200),contact_email:anonymous?'':text(body.contact_email,250),contact_phone:anonymous?'':text(body.contact_phone,80),contact_preference:anonymous?'none':text(body.contact_preference,30),language:text(body.language,100),accessibility:text(body.accessibility,1000),incident_date:text(body.incident_date,40),location:text(body.location,500),officers:text(body.officers,1000),witnesses:text(body.witnesses,2000),description:text(body.description,12000),status:'new',public_status:'Received',public_message:'Your submission has been received for intake review.',category:'unclassified',priority:'normal',version:1,legal_hold:false});
   await audit(db,null,'public_submission',c.id,body.kind);
   let evidence_error='';
   try{await upload(base44,db,null,c,files);}catch{evidence_error='Your report was saved, but one or more evidence files could not be attached. Use your reference and private code to retry from Check Status.';}
   return Response.json({reference,tracking_code,evidence_error,submitted_at:c.created_date||new Date().toISOString()});
  }
  if(action==='track'||action==='public_evidence'||action==='public_followup'){
   throttle(req,'track');
   const list=await db.PSCase.filter({reference:text(body.reference,80).toUpperCase()},'-created_date',1);
   const c=list[0],h=await hash(text(body.tracking_code,100));
   if(!c)fail('Reference or private tracking code is incorrect.',404);
   if(c.tracking_locked_until&&Date.parse(c.tracking_locked_until)>Date.now())fail('Tracking is temporarily locked. Please wait 15 minutes and try again.',429);
   if(h!==c.tracking_hash){
    const failures=(c.tracking_locked_until&&Date.parse(c.tracking_locked_until)<=Date.now()?0:Number(c.tracking_failures||0))+1;
    await db.PSCase.update(c.id,{tracking_failures:failures,tracking_locked_until:failures>=5?new Date(Date.now()+15*60000).toISOString():''});
    fail('Reference or private tracking code is incorrect.',404);
   }
   if(c.tracking_failures||c.tracking_locked_until)await db.PSCase.update(c.id,{tracking_failures:0,tracking_locked_until:''});
   if(action==='public_followup'){
    const message=text(body.message,6000);
    if(message.length<10)fail('Enter at least 10 characters of additional information.');
    await db.PSRecord.create({case_id:c.id,kind:'public_followup',title:'Additional information from complainant',body:message,author_name:'Complainant (private tracking code)',status:'received'});
    await audit(db,null,'public_followup_received',c.id);
    return Response.json({success:true});
   }
   if(action==='public_evidence'){await upload(base44,db,null,c,files);await audit(db,null,'public_evidence_added',c.id);return Response.json({success:true});}
   return Response.json({reference:c.reference,kind:c.kind,status:c.public_status||'Received',message:c.public_message||'',submitted_at:c.created_date,updated_at:c.updated_date});
  }
  const u=await identity(base44),role=psRole(u);
 if(!await __portalLoginIsCurrent(req,base44,u))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
  if(!role)fail('Professional Standards access is required. Contact your administrator.',403);
  if(action==='legacy_entity')return await legacyRequest(base44,db,u,body,role==='reviewer');
  const review=role==='reviewer';
  const canRead=c=>review||!c.investigator_id||c.investigator_id===u.id;
  const staff=await db.User.list('-created_date',1000);
  const eligible=staff.filter(v=>psRole(v));
  const staffSummary=eligible.map(v=>({id:v.id,name:actorName(v),email:v.email,role:psRole(v)}));
  const globalTools=await globalCaseTools({action,body,db,u,review,base44,audit,notify,fail});
  if(globalTools)return globalTools;
  if(action==='create_case'){
   const input=body.case||{},sourceEntity=text(input.source_entity,80),sourceId=text(input.source_record_id,100);
   let source=null;
   if(sourceEntity||sourceId){
    if(!review)fail('Only reviewers may open cases from existing personnel reports.',403);
    if(!legacyEntities.has(sourceEntity)||!sourceId)fail('Select a valid source report.');
    const previous=await db.PSCase.filter({source_entity:sourceEntity,source_record_id:sourceId},'-created_date',1);
    if(previous[0])return Response.json({success:true,case_id:previous[0].id,reference:previous[0].reference,existing:true});
    source=await db[sourceEntity].get(sourceId);
   }
   const description=text(input.description||source?.description||source?.observations||source?.investigation_notes||source?.summary,12000);
   const location=text(input.location||source?.location||'Internal report',500);
   const incident_date=text(input.incident_date||source?.incident_date||source?.inspection_date||source?.shift_date||source?.report_date||source?.created_date,40);
   if(description.length<20)fail('Enter at least 20 characters describing the case.');
   if(!incident_date||!Number.isFinite(Date.parse(incident_date)))fail('A valid incident date is required.');
   const investigator_id=review?text(input.investigator_id,100):u.id;
   if(investigator_id&&!eligible.some(p=>p.id===investigator_id))fail('Choose an active authorized investigator.');
   const reference='IA-'+new Date().getFullYear()+'-'+random(6).toUpperCase();
   const officer_ids=[...new Set(Array.isArray(input.officer_ids)?input.officer_ids.map(v=>text(v,100)):staff.filter(v=>source?.officer_email&&[v.email,v.work_email,v.pathfinder_email].includes(source.officer_email)).map(v=>v.id))];
   if(officer_ids.length>25||officer_ids.some(id=>!staff.some(v=>v.id===id&&!['client','student','visitor'].some(r=>(v.additional_roles||[]).includes(r)||v.user_type===r))))fail('Choose valid involved officers.');
   const created=await db.PSCase.create({reference,tracking_hash:await hash(random()),kind:input.kind==='commendation'?'commendation':'complaint',source_type:source?'existing_report':'staff_intake',source_entity:sourceEntity,source_record_id:sourceId,officer_ids,anonymous:false,complainant_name:'Staff intake',contact_preference:'none',incident_date,location,officers:text(input.officers||source?.officer_name||source?.officer_inspected||source?.officer_email,1000),description,status:investigator_id?'investigating':'triage',public_status:'Under review',public_message:'',category:text(input.category||source?.complaint_type||source?.violation_type||'unclassified',200),priority:['low','normal','high','critical'].includes(input.priority)?input.priority:'normal',investigator_id,due_date:text(input.due_date,40),version:1,legal_hold:false});
   await audit(db,u,'staff_case_opened',created.id,source?sourceEntity+' '+sourceId:'Staff intake');
   if(source)await db.PSRecord.create({case_id:created.id,kind:'source_report',title:'Linked '+sourceEntity,body:'Original report ID: '+sourceId,source_entity:sourceEntity,source_record_id:sourceId,author_id:u.id,author_name:actorName(u),status:'linked'});
   let email_sent=null;
   if(investigator_id)email_sent=await notify(base44,eligible.find(p=>p.id===investigator_id)?.email,'Professional Standards assignment '+reference,'A case has been assigned to you. Sign in to Pathfinder and open Professional Standards.',u);
   return Response.json({success:true,case_id:created.id,reference,email_sent});
  }
  if(action==='list'||action==='reports'){
   const page=Math.max(0,Math.min(10000,Number(body.page)||0)),limit=50;
   const query=review?{}:{$or:[{investigator_id:u.id},{investigator_id:''},{status:'new'}]};
   const rows=await db.PSCase.filter(query,'-created_date',limit,page*limit);
   const findings={};if(action==='reports'&&rows.length){const ids=new Set(rows.filter(canRead).map(c=>c.id));const allegations=await db.PSRecord.filter({kind:'allegation'},'-created_date',1000);for(const r of allegations){if(ids.has(r.case_id))findings[r.finding||'pending']=(findings[r.finding||'pending']||0)+1;}}
   await audit(db,u,action==='reports'?'report_view':'inbox_view');
   return Response.json({findings,cases:rows.filter(canRead).map(({tracking_hash,tracking_failures,tracking_locked_until,...c})=>c),staff:staffSummary,reviewer:review,page,has_more:rows.length===limit});
  }
  if(action==='export'){
   if(!review)fail('Only reviewers may export case information.',403);
   const rows=await db.PSCase.list('-created_date',1000);
   await audit(db,u,'restricted_export','',String(rows.length)+' case summaries');
   return Response.json({rows:rows.map(c=>({reference:c.reference,kind:c.kind,status:c.status,category:c.category,priority:c.priority,created_date:c.created_date,closed_at:c.closed_at||''})),limited:rows.length===1000});
  }
  if(action==='audit_history'){
   if(!review)fail('Reviewer access required.',403);
   await audit(db,u,'audit_history_view');
   return Response.json({events:await db.PSAudit.list('-created_date',250)});
  }
  const c=await db.PSCase.get(text(body.case_id,100));
  if(!c||!canRead(c))fail('Case not available.',403);
  if(action==='resend_assignment'){
   if(!review)fail('Reviewer access required.',403);
   const person=eligible.find(p=>p.id===c.investigator_id);
   if(!person)fail('Assign an active investigator before sending an alert.');
   const email_sent=await notify(base44,person.email,'Professional Standards assignment '+c.reference,'A case is assigned to you. Sign in to Pathfinder and open Professional Standards.',u);
   await audit(db,u,'assignment_notification_resent',c.id);
   return Response.json({success:true,email_sent});
  }
  const records=await db.PSRecord.filter({case_id:c.id},'created_date',1000);
  const caseTools=await linkedCaseTools({action,body,db,u,c,records,review,editable:review||c.investigator_id===u.id,base44,audit,notify,fail,text,actorName});
  if(caseTools)return caseTools;
  if(action==='get'){
   await audit(db,u,'case_view',c.id);
   const history=await db.PSAudit.filter({case_id:c.id},'-created_date',250);
   const {tracking_hash,tracking_failures,tracking_locked_until,...safe}=c;
   return Response.json({case:safe,records:records.map(({file_uri,...r})=>r),audit:history,staff:staffSummary,reviewer:review});
  }
  const editable=review||c.investigator_id===u.id;
  if(!editable)fail('Assign the case before editing it.',403);
  if(action==='update'){
   if(Number(body.version)!==Number(c.version))fail('This case changed. Reload it before saving.',409);
   if(['approved','closed'].includes(c.status)&&!review)fail('Only a reviewer can reopen an approved or closed case.',403);
   const p=body.patch||{},updates={};
   for(const key of ['category','priority','due_date','retention_until'])if(p[key]!==undefined)updates[key]=text(p[key],200);
   if(p.legal_hold!==undefined){if(!review)fail('Only reviewers manage legal holds.',403);updates.legal_hold=p.legal_hold===true;}
   if(p.investigator_id!==undefined){
    if(!review)fail('Only reviewers assign investigators.',403);
    if(p.investigator_id&&!eligible.some(v=>v.id===p.investigator_id))fail('Choose an active Professional Standards staff member.');
    updates.investigator_id=text(p.investigator_id,100);
   }
   if(p.status!==undefined){
    if(!['new','triage','investigating','pending_review','approved','closed','returned'].includes(p.status))fail('Invalid case status.');
    if(['approved','closed','returned'].includes(p.status)&&!review)fail('Reviewer approval is required.',403);
    if(['approved','closed'].includes(p.status)){
     if(!text(c.outcome_summary,12000))fail('Document the investigation outcome before approval.');
     if((p.investigator_id??c.investigator_id)===u.id)fail('An independent reviewer must approve an investigator’s case.',403);
     if(!['pending_review','approved'].includes(c.status))fail('Send the investigation for review first.');
     const allegations=records.filter(r=>r.kind==='allegation');
     if(c.kind==='complaint'&&(!allegations.length||allegations.some(r=>!r.finding||r.finding==='pending')))fail('Document a finding for every allegation before approval.');
     if(p.status==='closed'&&records.some(r=>['task','corrective_action'].includes(r.kind)&&r.status!=='completed'))fail('Complete outstanding tasks and corrective actions before closing.');
     updates.reviewer_id=u.id;updates.reviewed_at=new Date().toISOString();
     if(p.status==='closed')updates.closed_at=new Date().toISOString();
    }
    updates.status=p.status;
   }
   if(p.public_status!==undefined||p.public_message!==undefined){
    if(!review)fail('Only reviewers publish complainant updates.',403);
    if(p.public_status&&!publicStates.includes(p.public_status))fail('Invalid public status.');
    if(p.public_status)updates.public_status=p.public_status;
    if(p.public_message!==undefined)updates.public_message=text(p.public_message,2000);
   }
   updates.version=Number(c.version||0)+1;
   await audit(db,u,'case_update_requested',c.id,JSON.stringify(updates));
   await db.PSCase.update(c.id,updates);
   await audit(db,u,'case_updated',c.id,Object.keys(updates).join(', '));
   let email_sent=null;
   if(updates.investigator_id){const person=eligible.find(v=>v.id===updates.investigator_id);email_sent=await notify(base44,person?.email,'Professional Standards assignment '+c.reference,'A case has been assigned to you. Sign in to BPS Pathfinder and open Professional Standards.',u);}
   if(body.send_notice===true&&c.contact_preference==='email'&&c.contact_email){
    if(!review)fail('Reviewer access required.',403);
    email_sent=await notify(base44,c.contact_preference==='email'?c.contact_email:'','Professional Standards update '+c.reference,(updates.public_message||c.public_message||'A status update is available using your reference and private tracking code.'),u);
    await audit(db,u,'approved_notice',c.id,email_sent?'sent':'not delivered / no email preference');
   }
   return Response.json({success:true,email_sent});
  }
  if(action==='add_record'){
   if(['approved','closed'].includes(c.status))fail('Reopen the case before adding records.');
   const r=body.record||{};
   if(!kinds.includes(r.kind)||r.kind==='evidence')fail('Choose a valid record type.');
   if(!text(r.title))fail('A title is required.');
   if(r.assigned_to&&!eligible.some(v=>v.id===r.assigned_to))fail('Choose an authorized staff assignee.');
   const finding=['pending','sustained','not_sustained','unfounded','exonerated','policy_failure'].includes(r.finding)?r.finding:'pending';
   await audit(db,u,'record_add_requested',c.id,r.kind);
   await db.PSRecord.create({case_id:c.id,kind:r.kind,title:text(r.title,300),body:text(r.body,12000),person:text(r.person,300),policy:text(r.policy,500),finding:r.kind==='allegation'?finding:'',status:'open',assigned_to:text(r.assigned_to,100),due_date:text(r.due_date,40),author_id:u.id,author_name:actorName(u)});
   let email_sent=null;
   if(r.assigned_to)email_sent=await notify(base44,eligible.find(v=>v.id===r.assigned_to)?.email,'Professional Standards task '+c.reference,'A task or follow-up has been assigned. Open Professional Standards to review the deadline.',u);
   await audit(db,u,'record_added',c.id,r.kind);
   return Response.json({success:true,email_sent});
  }
  if(action==='complete_record'||action==='finding'){
   const r=records.find(r=>r.id===body.record_id);
   if(!r)fail('Record not found.',404);
   if(c.status==='closed'||action==='finding'&&c.status==='approved')fail('Reopen the case before changing findings or closed records.');
   let patch={};
   if(action==='finding'){
    if(r.kind!=='allegation'||!['sustained','not_sustained','unfounded','exonerated','policy_failure'].includes(body.finding))fail('Choose a valid allegation finding.');
    patch={finding:body.finding};
   }else{if(!['task','corrective_action'].includes(r.kind))fail('Only tasks and corrective actions can be completed.');if(r.action_type==='suspension')fail('Use Lift suspension to document reinstatement and restore access.');if(r.action_type==='training'){const training=await db.TrainingAssignment.get(r.linked_id);if(training?.status!=='approved')fail('Training must be completed and approved in the training portal first.');}patch={status:'completed'};}
   await audit(db,u,action+'_requested',c.id,r.id);
   await db.PSRecord.update(r.id,patch);await audit(db,u,action,c.id,r.id);
   return Response.json({success:true});
  }
  if(action==='upload'){if(['closed','approved'].includes(c.status))fail('Reopen the case before adding evidence.');await upload(base44,db,u,c,files);await audit(db,u,'evidence_added',c.id);return Response.json({success:true});}
  if(action==='evidence_url'){
   const r=records.find(r=>r.id===body.record_id&&r.kind==='evidence');
   if(!r?.file_uri)fail('Evidence not found.',404);
   await audit(db,u,'evidence_view',c.id,r.id);
   return Response.json(await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({file_uri:r.file_uri,expires_in:300}));
  }
  fail('Unknown action.');
 }catch(error){return Response.json({error:error.status?error.message:'The request could not be completed. Please retry or contact an administrator.'},{status:error.status||500});}
}
