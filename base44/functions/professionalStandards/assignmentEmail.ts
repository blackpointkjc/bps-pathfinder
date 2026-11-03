import {blackPointEmail} from './blackPointEmail.ts';

const portalUrl='https://bpspf.blackpointkjc.com/ProfessionalStandards';
const escape=(v:any)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const display=(v:any)=>escape(String(v??'').trim()||'Not recorded');
const readable=(v:any)=>String(v??'').replaceAll('_',' ').replace(/\b\w/g,(m)=>m.toUpperCase());
const field=(label:string,value:any)=>`<tr><th align="left" style="padding:10px 12px;border-bottom:1px solid #304054;color:#9bb0c9;width:42%;font-size:13px">${escape(label)}</th><td style="padding:10px 12px;border-bottom:1px solid #304054;color:#fff;font-size:14px">${display(value)}</td></tr>`;
export function iaCaseEmail(caseInfo:any,assignee:any,kind:'assignment'|'status'|'reminder'|'task',options:{taskTitle?:string,taskDue?:string}={}){
 const headline={assignment:'An IA case has been assigned to you',status:'An assigned IA case has been updated',reminder:'An IA investigation deadline requires attention',task:'An IA follow-up task requires attention'}[kind];
 const reference=String(caseInfo?.reference||'').trim();
 const subject=`Professional Standards · ${kind==='reminder'?'Deadline reminder':kind==='task'?'Task reminder':kind==='status'?'Case update':'Case assignment'} · ${reference}`;
 const brief=kind==='task'&&options.taskTitle?`<p><strong>Assigned follow-up:</strong> ${display(options.taskTitle)}</p>`:'';
 const html=`<p style="font-size:16px"><strong>${escape(headline)}.</strong> Review your restricted case workspace in Pathfinder and complete required investigative steps.</p>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#122033;border:1px solid #304054;border-collapse:collapse;margin:15px 0">
 ${field('Case number',reference)}${field('Assigned investigator',[assignee?.rank,assignee?.last_name||assignee?.full_name||assignee?.email].filter(Boolean).join(' '))}
 ${field('Case category',readable(caseInfo?.category))}${field('Priority',readable(caseInfo?.priority))}${field('Workflow status',readable(caseInfo?.status))}
 ${field('Incident date',caseInfo?.incident_date)}${field('Incident location',caseInfo?.location)}
 ${field('Involved officers',caseInfo?.officers)}${field('Case deadline',caseInfo?.due_date)}
 ${options.taskDue?field('Follow-up due',options.taskDue):''}</table>${brief}
 <p><strong>Required action:</strong> Sign in to Pathfinder, open Professional Standards, locate case <strong>${escape(reference)}</strong>, and review the full case file, evidence, assigned tasks, and applicable deadlines.</p>
 <p style="font-size:12px;color:#aebbd0"><strong>Restricted · Internal Affairs / Professional Standards.</strong> This message is intended solely for the assigned authorized staff member. Do not forward it or reply with confidential case evidence. Full complaint narratives, witness statements, evidence, and investigative findings must be reviewed inside Pathfinder rather than transmitted in an email.</p>`;
 return {subject,html:blackPointEmail(subject,html,'Open assigned IA case',portalUrl)};
}
