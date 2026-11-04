const text=(v,max=500)=>String(v??'').trim().slice(0,max);
const actorName=u=>[u.rank,u.last_name].filter(Boolean).join(' ')||u.full_name||u.email;
const random=(n=6)=>Array.from(crypto.getRandomValues(new Uint8Array(n))).map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
// Case numbers are human-readable references, not database IDs. Preserve the
// immutable PSCase.id for evidence, audits, notifications and investigations.
async function nextIAReference(db:any){
 const year=new Date().getFullYear();
 const prefix=`IA-${year}-`;
 const rows=await db.PSCase.list('-created_date',1000);
 const used=new Set((rows||[]).map((item:any)=>String(item.reference||'')));
 const highest=(rows||[]).reduce((max:number,item:any)=>{
   const value=String(item.reference||'');
   if(!value.startsWith(prefix))return max;
   const suffix=value.slice(prefix.length);
   return /^\d{4}$/.test(suffix)?Math.max(max,Number(suffix)):max;
 },0);
 for(let number=highest+1;number<=9999;number++){
   const reference=prefix+String(number).padStart(4,'0');
   if(!used.has(reference)&&!(await db.PSCase.filter({reference},'-created_date',1)).length)return reference;
 }
 throw new Error('The annual Investigation case number range is full. Contact an administrator.');
}

async function createReportLink(db,u,name,report){
 const prior=await db.PSCase.filter({source_entity:name,source_record_id:report.id},'-created_date',1);
 if(prior[0])return {reference:prior[0].reference,existing:true};
 const tracking_code=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0');
 const reference=await nextIAReference(db);
 const description=text(report.description||report.observations||report.summary||report.supervisor_notes||report.incident_description||report.comments||('Submitted '+name+' for Professional Standards review.'),12000);
 const personnel=report.officer_email?await db.User.filter({email:report.officer_email},'-updated_date',1):[];
 const officer=personnel[0];
 const c=await db.PSCase.create({reference,tracking_hash:await hash(tracking_code),kind:name==='Commendation'||report.commendation===true?'commendation':'complaint',source_type:'staff_report',source_entity:name,source_record_id:report.id,anonymous:name==='ConfidentialReport'&&report.anonymous===true,complainant_name:actorName(u),contact_preference:'none',incident_date:text(report.incident_date||report.inspection_date||report.review_date||report.created_date||new Date().toISOString(),40),location:text(report.location||report.location_name||'Internal personnel report',500),officers:text(report.officer_name||report.officer_inspected||report.officer_email||'Not identified',1000),officer_ids:officer?[officer.id]:[],description,status:'new',public_status:'Received',public_message:'Your report was received by Professional Standards.',category:({UseOfForceReport:'use_of_force',InspectionReport:'policy_procedure',PerformanceReview:'policy_procedure',OfficerPerformanceReview:'policy_procedure',WriteUpReport:'policy_procedure',Commendation:'commendation'})[name]||(report.commendation?'commendation':'unclassified'),priority:'normal',version:1,legal_hold:false});
 await db.PSRecord.create({case_id:c.id,kind:'source_report',title:'Submitted '+name,body:'Original report ID: '+report.id,source_entity:name,source_record_id:report.id,author_id:u.id,author_name:actorName(u),status:'linked'}).catch(()=>null);
 await db.PSAudit.create({case_id:c.id,actor_id:u.id,actor_name:actorName(u),action:'staff_report_submitted',details:name+' '+report.id}).catch(()=>null);
 return {reference,tracking_code,submitted_at:c.created_date||new Date().toISOString()};
}

export async function linkSubmittedReport(db,u,name,report){
 try{return await createReportLink(db,u,name,report);}catch{return {pending:true,source_entity:name,source_record_id:report.id,message:'Report saved. IA case creation needs retry; do not submit the report again.'};}
}
