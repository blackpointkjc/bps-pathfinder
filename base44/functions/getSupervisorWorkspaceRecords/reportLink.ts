const text=(v,max=500)=>String(v??'').trim().slice(0,max);
const actorName=u=>[u.rank,u.last_name].filter(Boolean).join(' ')||u.full_name||u.email;
const random=(n=6)=>Array.from(crypto.getRandomValues(new Uint8Array(n))).map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function linkSubmittedReport(db,u,name,report){
 const prior=await db.PSCase.filter({source_entity:name,source_record_id:report.id},'-created_date',1);
 if(prior[0])return {reference:prior[0].reference,existing:true};
 const tracking_code=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0');
 const reference='IA-'+new Date().getFullYear()+'-'+random(6).toUpperCase();
 const description=text(report.description||report.observations||report.summary||report.supervisor_notes||report.incident_description||report.comments||('Submitted '+name+' for Professional Standards review.'),12000);
 const personnel=report.officer_email?await db.User.filter({email:report.officer_email},'-updated_date',1):[];
 const officer=personnel[0];
 const c=await db.PSCase.create({reference,tracking_hash:await hash(tracking_code),kind:name==='Commendation'||report.commendation===true?'commendation':'complaint',source_type:'staff_report',source_entity:name,source_record_id:report.id,anonymous:name==='ConfidentialReport'&&report.anonymous===true,complainant_name:actorName(u),contact_preference:'none',incident_date:text(report.incident_date||report.inspection_date||report.review_date||report.created_date||new Date().toISOString(),40),location:text(report.location||report.location_name||'Internal personnel report',500),officers:text(report.officer_name||report.officer_inspected||report.officer_email||'Not identified',1000),officer_ids:officer?[officer.id]:[],description,status:'new',public_status:'Received',public_message:'Your report was received by Professional Standards.',category:name,priority:'normal',version:1,legal_hold:false});
 await db.PSRecord.create({case_id:c.id,kind:'source_report',title:'Submitted '+name,body:'Original report ID: '+report.id,source_entity:name,source_record_id:report.id,author_id:u.id,author_name:actorName(u),status:'linked'});
 await db.PSAudit.create({case_id:c.id,actor_id:u.id,actor_name:actorName(u),action:'staff_report_submitted',details:name+' '+report.id});
 return {reference,tracking_code,submitted_at:c.created_date||new Date().toISOString()};
}
