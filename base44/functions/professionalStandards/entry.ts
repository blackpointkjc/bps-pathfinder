import {putOneDriveEvidence,oneDriveEvidenceLink,oneDriveStorageStatus} from './oneDriveEvidence.ts';
import {IA_CATEGORIES,PUBLIC_UPDATE_MESSAGES,publicMessage} from './publicPolicy.ts';
import {linkSubmittedReport} from './reportLink.ts';
import {globalCaseTools,linkedCaseTools} from './caseTools.ts';
import {createClientFromRequest,text,roles,manager,psRole,identity,hash,random,fail,audit,notify,actorName} from './security.ts';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||(user.termination_date&&Date.parse(user.termination_date)<=Date.now())||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
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
 if(!legacyEntities.has(name)||!['list','filter','get','create','update','delete'].includes(method))fail('Unsupported reporting operation.');
 if(!privileged&&!u.portal_approved&&u.role!=='admin')fail('An approved staff account is required.',403);
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
 let receipt=null;
 if(['create','update'].includes(method)&&result?.id&&(name!=='ClientFeedback'||result.complaint||result.commendation)&&String(result.status||'').toLowerCase()!=='draft'){receipt=await linkSubmittedReport(db,u,name,result);}
 await audit(db,u,'legacy_'+method+'_completed','',name+' '+requestId);
 return Response.json({result,receipt});
}


const kinds=['note','interview','task','allegation','corrective_action','policy','evidence'];
const allowedFiles=/^(image\/(jpeg|png|webp|heic)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|wav|x-wav|ogg|webm)|application\/(pdf|msword|vnd.openxmlformats-officedocument.wordprocessingml.document)|text\/plain)$/;
const publicStates=Object.keys(PUBLIC_UPDATE_MESSAGES);
// The worker is reused across requests; cache the directory briefly so every
// case message, evidence upload, and status refresh does not spend a User.list.
let personnelCache:{expires:number;people:any[];pending:Promise<any[]>|null}={expires:0,people:[],pending:null};
async function casePersonnel(db:any){
 if(Date.now()<personnelCache.expires)return personnelCache.people;
 if(personnelCache.pending)return personnelCache.pending;
 personnelCache.pending=db.User.list('-created_date',1000).then((people:any[])=>{
  personnelCache.people=people;personnelCache.expires=Date.now()+120_000;
  return people;
 }).finally(()=>{personnelCache.pending=null;});
 return personnelCache.pending;
}

const categoryValues=new Set(IA_CATEGORIES.map(([id])=>id));
function caseCategory(value='unclassified',detail=''){
 const category=text(value,100),category_detail=category==='other'?text(detail,300):'';
 if(!categoryValues.has(category))fail('Choose a listed complaint category or Other.');
 if(category==='other'&&category_detail.length<3)fail('Describe the Other category in at least three characters.');
 return {category,category_detail};
}
const publicStateFor=status=>({new:'Received',triage:'Under review',investigating:'Investigation in progress',pending_review:'Under review',returned:'Investigation in progress',approved:'Review completed',closed:'Closed'})[status]||'Received';
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
  const file_uri=await putOneDriveEvidence(db,c.reference,file,file_hash);
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
   if(!anonymous&&!text(body.complainant_name))fail('Enter your name or choose anonymous.');
   const category=caseCategory(body.category||'unclassified',body.category_detail);
   const tracking_code=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0'),reference='PS-'+new Date().getFullYear()+'-'+random(6).toUpperCase();
   const c=await db.PSCase.create({reference,tracking_hash:await hash(tracking_code),kind:body.kind,anonymous,complainant_name:anonymous?'Anonymous':text(body.complainant_name,200),contact_email:'',contact_phone:'',contact_preference:'none',language:text(body.language,100),accessibility:text(body.accessibility,1000),incident_date:text(body.incident_date,40),location:text(body.location,500),officers:text(body.officers,1000),witnesses:text(body.witnesses,2000),description:text(body.description,12000),status:'new',public_status:'Received',public_message:'Your submission has been received for intake review.',...category,priority:'normal',version:1,legal_hold:false});
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
    await db.PSRecord.create({case_id:c.id,kind:'public_followup',title:'Message from reporter',body:message,author_name:'Reporter (verified tracking code)',status:'received'});
    await audit(db,null,'public_followup_received',c.id).catch(e=>console.error('Reporter follow-up audit unavailable',e));
    return Response.json({success:true});
   }
   if(action==='public_evidence'){const uploaded=await upload(base44,db,null,c,files);await audit(db,null,'public_evidence_added',c.id).catch(e=>console.error('Reporter evidence audit unavailable',e));return Response.json({success:true,received:uploaded.length});}
   const state=publicStates.includes(c.public_status)?c.public_status:publicStateFor(c.status);
   let investigator=null;
   if(c.investigator_id){
    const person=await db.User.get(c.investigator_id).catch(()=>null);
    if(person&&psRole(person)){
     const email=[person.work_email,person.pathfinder_email,person.email].find(v=>/^[^@\s]+@blackpointkjc\.com$/i.test(String(v||'')))||'IA@blackpointkjc.com';
     const photo=String(person.profile_photo_url||'');
     investigator={name:actorName(person),email,photo:/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(photo)?photo:''};
    }
   }
   // The reporter sees only their own submissions and content that an IA
   // reviewer explicitly published. Never expose notes, findings, discipline,
   // internal attachments, or the general case audit to the public endpoint.
   const history=[];
   for(let skip=0;skip<5000;skip+=500){
    const page=await db.PSRecord.filter({case_id:c.id},'-created_date',500,skip);
    history.push(...page);
    if(page.length<500)break;
   }
   const updates=history.filter(r=>r.kind==='public_update'&&publicStates.includes(r.title)).map(r=>({status:r.title,message:publicMessage(r.title,r.body),posted_at:r.created_date}));
   const timeline=history.filter(r=>['public_update','public_release','public_followup','evidence'].includes(r.kind))
    .filter(r=>r.kind!=='public_release'||r.status==='published')
    .map(r=>({id:r.id,kind:r.kind,title:r.kind==='public_followup'?'Your message received':r.kind==='evidence'?'Evidence received':r.title||'Public update',message:r.kind==='public_update'?publicMessage(r.title,r.body):r.kind==='public_release'?text(r.body,6000):r.kind==='public_followup'?text(r.body,6000):text(r.file_name||r.title,200),posted_at:r.created_date}))
    .reverse();
   // The intake receipt is the first public event, even for older cases that
   // predate the dedicated release-history records.
   timeline.unshift({id:'intake-'+c.id,kind:'receipt',title:'Submission received',message:'Your report was securely received by Professional Standards.',posted_at:c.created_date});
   return Response.json({reference:c.reference,kind:c.kind,status:state,message:publicMessage(state,c.public_message),investigator,updates,timeline,submitted_at:c.created_date,updated_at:c.updated_date});
  }
  const u=await identity(base44),role=psRole(u);
 if(!await __portalLoginIsCurrent(req,base44,u))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
  if(action==='report_receipt'){
   const name=text(body.source_entity,80);
   if(!legacyEntities.has(name))fail('Unsupported report.');
   const report=await base44.entities[name].get(text(body.source_record_id,100));
   if(!report?.id)fail('Report not available.',403);
   if(String(report.status||'').toLowerCase()==='draft')fail('Submit the report before creating an IA case.');
   return Response.json({receipt:await linkSubmittedReport(db,u,name,report)});
  }
  if(action==='legacy_entity')return await legacyRequest(base44,db,u,body,role==='reviewer');
  if(!role)fail('Professional Standards access is required. Contact your administrator.',403);
  const review=role==='reviewer';
  const canRead=c=>review||c.investigator_id===u.id;
  // Most actions only operate on the selected case and its records. Avoid
  // a global User.list for each click, message, upload, or audit refresh.
  const requiresPersonnel=['list','reports','create_case','get','update','resend_assignment','link_officers','officer_directory'].includes(action);
  const staff=requiresPersonnel?await casePersonnel(db):[];
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
   const category=caseCategory(input.category||'unclassified',input.category_detail);
   const officer_ids=[...new Set(Array.isArray(input.officer_ids)?input.officer_ids.map(v=>text(v,100)):staff.filter(v=>source?.officer_email&&[v.email,v.work_email,v.pathfinder_email].includes(source.officer_email)).map(v=>v.id))];
   if(officer_ids.length>25||officer_ids.some(id=>!staff.some(v=>v.id===id&&!['client','student','visitor'].some(r=>(v.additional_roles||[]).includes(r)||v.user_type===r))))fail('Choose valid involved officers.');
   const created=await db.PSCase.create({reference,tracking_hash:await hash(random()),kind:input.kind==='commendation'?'commendation':'complaint',source_type:source?'existing_report':'staff_intake',source_entity:sourceEntity,source_record_id:sourceId,officer_ids,anonymous:false,complainant_name:'Staff intake',contact_preference:'none',incident_date,location,officers:officer_ids.length?officer_ids.map(id=>actorName(staff.find(v=>v.id===id))).join('; '):text(input.officers||source?.officer_name||source?.officer_inspected||source?.officer_email,1000),description,status:'triage',public_status:investigator_id?'Investigator assigned':'Under review',public_message:publicMessage(investigator_id?'Investigator assigned':'Under review',''),...category,priority:['low','normal','high','critical'].includes(input.priority)?input.priority:'normal',investigator_id,due_date:text(input.due_date,40),version:1,legal_hold:false});
   await audit(db,u,'staff_case_opened',created.id,source?sourceEntity+' '+sourceId:'Staff intake');
   if(source)await db.PSRecord.create({case_id:created.id,kind:'source_report',title:'Linked '+sourceEntity,body:'Original report ID: '+sourceId,source_entity:sourceEntity,source_record_id:sourceId,author_id:u.id,author_name:actorName(u),status:'linked'});
   let email_sent=null;
   if(investigator_id)email_sent=await notify(base44,eligible.find(p=>p.id===investigator_id)?.email,'Professional Standards assignment '+reference,'A case has been assigned to you. Sign in to Pathfinder and open Professional Standards.',u);
   return Response.json({success:true,case_id:created.id,reference,email_sent});
  }
  if(action==='list'||action==='reports'){
   const page=Math.max(0,Math.min(10000,Number(body.page)||0)),limit=50;
   if((action==='reports'||body.view==='inbox')&&!review)fail('IA reviewer access is required for intake and reporting.',403);
   const query=!review?{investigator_id:u.id}:body.view==='inbox'?{$and:[{$or:[{investigator_id:''},{investigator_id:null},{investigator_id:{$exists:false}}]},{status:{$in:['new','triage']}}]}:{};
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
  if(action==='publish_public_release'){
   if(!review)fail('Only an authorized IA reviewer may publish case information.',403);
   if(Number(body.version)!==Number(c.version))fail('The case changed. Reload before publishing.',409);
   const title=text(body.title,140),message=text(body.message,6000);
   if(title.length<5||message.length<20)fail('Enter a public release title and at least 20 characters of approved information.');
   if(body.confirm_public_safe!==true)fail('Confirm this release contains no restricted or identifying investigation information.');
   // Explicit publication gate. Names of involved people, contact information,
   // or raw identifiers must never be released through public case tracking.
   const releaseText=title+' '+message;
   if(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(releaseText)||/(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/.test(releaseText)||/\b(?:ssn|social security number|date of birth|home address|driver.?s license)\b/i.test(releaseText))fail('Remove personal contact information and restricted identifiers before publishing.');
   const identifiers=[String(c.complainant_name||''),...String(c.officers||'').split(/[;,]/),...String(c.witnesses||'').split(/[;,]/)].map(v=>v.trim()).filter(v=>v.length>=4&&!/^(anonymous|unknown|none|n\/?a)$/i.test(v));
   if(identifiers.some(v=>releaseText.toLowerCase().includes(v.toLowerCase())))fail('Remove the names of people involved before publishing. Use an anonymous summary.');
   const published=await db.PSRecord.create({case_id:c.id,kind:'public_release',title,body:message,author_id:u.id,author_name:actorName(u),status:'published'});
   await audit(db,u,'public_information_released',c.id,published.id+' '+title);
   return Response.json({success:true,release_id:published.id});
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
   for(const key of ['priority','due_date','retention_until'])if(p[key]!==undefined)updates[key]=text(p[key],200);
   if(p.category!==undefined||p.category_detail!==undefined)Object.assign(updates,caseCategory(p.category??c.category,p.category_detail??c.category_detail));
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
    if(!review)fail('Only reviewers select approved public updates.',403);
    const state=p.public_status||c.public_status||'Received';
    if(!publicStates.includes(state))fail('Invalid public status.');
    if(p.public_message!==undefined&&!PUBLIC_UPDATE_MESSAGES[state].includes(p.public_message))fail('Choose a preapproved public message. Confidential findings and personnel actions cannot be published.');
    updates.public_status=state;updates.public_message=publicMessage(state,p.public_message);
   }
   if(updates.status!==undefined&&updates.status!==c.status){
    updates.public_status=publicStateFor(updates.status);
    updates.public_message=publicMessage(updates.public_status,'');
   }else if(updates.investigator_id&&updates.investigator_id!==c.investigator_id&&!['approved','closed'].includes(c.status)){
    updates.public_status='Investigator assigned';updates.public_message=publicMessage('Investigator assigned','');
   }
   updates.version=Number(c.version||0)+1;
   await audit(db,u,'case_update_requested',c.id,JSON.stringify(updates));
   await db.PSCase.update(c.id,updates);
   await audit(db,u,'case_updated',c.id,Object.keys(updates).join(', '));
   if(updates.public_status&&(updates.public_status!==c.public_status||updates.public_message!==c.public_message))await db.PSRecord.create({case_id:c.id,kind:'public_update',title:updates.public_status,body:publicMessage(updates.public_status,updates.public_message),author_id:u.id,author_name:actorName(u),status:'published'});
   let email_sent=null;
   const assignedId=updates.investigator_id??c.investigator_id,assigned=eligible.find(v=>v.id===assignedId);
   if(assigned&&((updates.investigator_id&&updates.investigator_id!==c.investigator_id)||(updates.status&&updates.status!==c.status))){
    const assignmentChanged=updates.investigator_id&&updates.investigator_id!==c.investigator_id;
    email_sent=await notify(base44,assigned.work_email||assigned.email,'Professional Standards '+(assignmentChanged?'assignment ':'case status ')+c.reference,assignmentChanged?'A case has been assigned to you. Sign in to Pathfinder and open Professional Standards.':'The status of your assigned case changed to '+text(updates.status,80)+'. Sign in to Pathfinder for the confidential investigation record. Public tracking displays only approved status information.',u);
   }
   // Complainants are never emailed, including when an older client sends send_notice.
   return Response.json({success:true,email_sent});
  }
  if(action==='add_record'){
   if(['approved','closed'].includes(c.status))fail('Reopen the case before adding records.');
   const r=body.record||{};
   if(!kinds.includes(r.kind)||r.kind==='evidence')fail('Choose a valid record type.');
   if(!text(r.title))fail('A title is required.');
   if(r.public_release===true&&!review)fail('Reviewer approval is required for public release.',403);
   if(r.assigned_to&&!eligible.some(v=>v.id===r.assigned_to))fail('Choose an authorized staff assignee.');
   const finding=['pending','sustained','not_sustained','unfounded','exonerated','policy_failure'].includes(r.finding)?r.finding:'pending';
   await audit(db,u,'record_add_requested',c.id,r.kind);
   await db.PSRecord.create({case_id:c.id,kind:r.kind,title:text(r.title,300),body:text(r.body,12000),person:text(r.person,300),policy:text(r.policy,500),finding:r.kind==='allegation'?finding:'',status:'open',assigned_to:text(r.assigned_to,100),due_date:text(r.due_date,40),author_id:u.id,author_name:actorName(u)});
   if(r.public_release===true){
    if(!review)fail('Only IA reviewers can authorize a public release.',403);
    const safeMessage=({interview:'An interview has been documented as part of the case review. Personal identities and testimony remain confidential.',note:'A case review update was recorded. Internal notes and identities remain confidential.',allegation:'An allegation has been added to the case review. No final public determination has been issued.',policy:'Relevant policies are being examined as part of the review.'} as Record<string,string>)[r.kind];
    if(safeMessage){
      await db.PSRecord.create({case_id:c.id,kind:'public_release',title:'Case review progress',body:safeMessage,author_id:u.id,author_name:actorName(u),status:'published'});
      await audit(db,u,'safe_public_record_released',c.id,r.kind);
    }
   }
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
   if(!String(r.file_uri).startsWith('onedrive:'))fail('Legacy private evidence needs migration to OneDrive before download without Base44 integration credits.',409);
   return Response.json(await oneDriveEvidenceLink(db,String(r.file_uri)));
  }
  fail('Unknown action.');
 }catch(error){return Response.json({error:error.status?error.message:'The request could not be completed. Please retry or contact an administrator.'},{status:error.status||500});}
}
