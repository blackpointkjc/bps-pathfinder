import {createClientFromRequest,psRole,notify} from './security.ts';
import {blackPointEmail} from './blackPointEmail.ts';

const OWNER='6ae7d733d4b1a647cd3e6f38';
const URL='https://bpspf.blackpointkjc.com/ProfessionalStandards';
const esc=(value:any)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const label=(value:any)=>String(value??'').replace(/_/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase());
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const safeAdmin=(u:any)=>Boolean(u?.id&&u?.email&&u?.role==='admin'&&!u.disabled&&!u.termination_date&&!['terminated','suspended','denied'].includes(String(u.account_status||u.employment_status||'').toLowerCase())&&(psRole(u)||String(u.id)===OWNER));
const row=(c:any,people:Map<string,any>)=>{
  const investigator=people.get(String(c.investigator_id||''));
  const assigned=investigator?[investigator.rank,investigator.last_name||investigator.full_name].filter(Boolean).join(' '):'Unassigned';
  const details=[c.category&&label(c.category),c.priority&&`Priority ${label(c.priority)}`,c.due_date&&`Due ${c.due_date}`].filter(Boolean).join(' · ');
  return `<tr><td style="padding:12px;border:1px solid #304054"><strong>${esc(c.reference)}</strong><br><small>${esc(label(c.kind))} · ${esc(details)}</small></td><td style="padding:12px;border:1px solid #304054">${esc(label(c.status))}</td><td style="padding:12px;border:1px solid #304054">${esc(assigned)}</td><td style="padding:12px;border:1px solid #304054">${esc(c.updated_date||c.created_date||'')}</td></tr>`;
};
export default async function(req:Request){
  try{
    const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null),db=sdk.asServiceRole.entities;
    // A scheduled Base44 workflow runs as a service identity. Manual preview
    // and retry remain reviewer-only; ordinary staff never gain roster access.
    let scheduled=Boolean(user?.is_service);
    if(!user&&req.headers.get('Authorization')){try{await sdk.entities.SystemScanRun.list('-created_date',1);scheduled=true;}catch{}}
    if(!scheduled&&(!user||!safeAdmin(user)))return Response.json({error:'Authorized IA administrator access required.'},{status:403});
    const request=await req.json().catch(()=>({}));
    const today=day();
    const [cases,users]=await Promise.all([db.PSCase.list('-updated_date',1000),db.User.list('-created_date',1000)]);
    if(cases.length>=1000)return Response.json({error:'IA case count exceeds digest limit; do not send incomplete report.'},{status:409});
    const people=new Map(users.map((u:any)=>[String(u.id),u]));
    const recipients=[...new Map(users.filter(safeAdmin).map((u:any)=>[String(u.email).toLowerCase(),u])).values()];
    const subject=`Black Point · Daily IA Case Status · ${today}`;
    const open=cases.filter((c:any)=>c.status!=='closed');
    const recent=cases.filter((c:any)=>String(c.updated_date||c.created_date||'').slice(0,10)>=today);
    const content=`<p>Restricted daily Professional Standards case inventory for ${esc(today)} (Eastern Time). All open and closed cases are included. Each case's latest recorded status is shown below.</p>
    <p><strong>${cases.length}</strong> total cases · <strong>${open.length}</strong> open · <strong>${cases.length-open.length}</strong> closed · <strong>${recent.length}</strong> updated today.</p>
    <table><thead><tr><th>IA Reference / Category</th><th>Status</th><th>Investigator</th><th>Last Updated (UTC)</th></tr></thead><tbody>${cases.map((c:any)=>row(c,people)).join('')||'<tr><td colspan="4">No IA cases recorded.</td></tr>'}</tbody></table>
    <p><strong>Required review:</strong> Open Pathfinder Professional Standards to read the restricted investigation file, case activity, tasks, and deadlines. Email does not include complainant contact details, witness statements, evidence, or findings.</p>
    <p><small>CONFIDENTIAL · Internal Affairs administration only. Do not forward outside authorized personnel. Daily distribution excludes administrators who lack IA authorization.</small></p>`;
    const html=blackPointEmail(subject,content,'Review IA case dashboard',URL);
    let sent=0,failed=0,skipped=0;const outcomes=[];
    for(const person of recipients){
      const to=String(person.work_email||person.email).trim();
      const earlier=await db.PSNotification.filter({to,subject,status:'sent'},'-created_date',1).catch(()=>[]);
      if(earlier.length){skipped++;outcomes.push({to,status:'already_sent'});continue;}
      const delivered=await notify(sdk,to,subject,html,user||null,'',true);
      if(delivered)sent++;else failed++;
      outcomes.push({to,status:delivered?'accepted':'failed'});
    }
    return Response.json({success:true,date:today,cases:cases.length,recipients:recipients.length,sent,failed,skipped,outcomes});
  }catch(error:any){console.error('IA daily digest failed',String(error?.message||error));return Response.json({error:'Daily Professional Standards case update could not be completed.'},{status:500});}
}
