const RANKS=['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const level=(p:any)=>RANKS.indexOf(p.rank);
const name=(p:any)=>[p.rank,p.last_name||p.full_name||p.email].filter(Boolean).join(' ');
export function balancePlan(users:any[]) {
 const eligible=users.filter(p=>p.email&&!p.termination_date&&!['inactive','terminated'].includes(p.employment_status)&&!['client','student','pending'].includes(String(p.user_type||p.account_type||p.portal_type||'').toLowerCase())&&String(p.account_status||'').toLowerCase()!=='pending'&&level(p)>=0&&!['client','student','pending'].some(r=>(p.additional_roles||[]).includes(r)));
 const field=eligible.filter(p=>level(p)>2).sort((a,b)=>level(a)-level(b)||String(a.hire_date||'9999').localeCompare(String(b.hire_date||'9999'))||String(a.id).localeCompare(String(b.id)));
 const totals:any={A:0,B:0},counts:any={},assignment=new Map();
 for(const p of field){counts[p.rank]||={A:0,B:0};const c=counts[p.rank];let to=c.A<c.B?'A':c.B<c.A?'B':totals.A<totals.B?'A':totals.B<totals.A?'B':['A','B'].includes(p.platoon)?p.platoon:'A';assignment.set(p.id,to);totals[to]++;c[to]++;}
 const projected=eligible.map(p=>({...p,platoon:level(p)<=2?'Command':assignment.get(p.id)}));
 const loads:any={};
 const supervisor=(p:any)=>{const pool=projected.filter(s=>level(s)>=0&&level(s)<level(p)&&s.id!==p.id&&(level(s)<2||level(s)===2&&s.oversight_platoon===p.platoon||level(s)>2&&s.platoon===p.platoon));pool.sort((a,b)=>level(b)-level(a)||(loads[a.id]||0)-(loads[b.id]||0)||String(a.id).localeCompare(String(b.id)));return pool[0];};
 const assigned=projected.sort((a,b)=>level(a)-level(b)||String(a.id).localeCompare(String(b.id))).map(p=>{if(level(p)<=2)return p;const s=supervisor(p);if(s)loads[s.id]=(loads[s.id]||0)+1;return {...p,supervisor_id:s?.id||'',supervisor_email:s?.email||'',supervisor_name:s?name(s):''};});
 const changes=assigned.filter(p=>level(p)>2).map(p=>{const old=users.find(u=>u.id===p.id);const s=assigned.find(u=>u.id===p.supervisor_id);const next=assigned.find(u=>u.id===s?.supervisor_id);const updates={platoon:p.platoon,supervisor_id:p.supervisor_id,supervisor_email:p.supervisor_email,supervisor_name:p.supervisor_name,next_level_supervisor_id:next?.id||'',next_level_supervisor_email:next?.email||'',next_level_supervisor_name:next?name(next):''};return {id:p.id,name:name(p),from:old.platoon||'Unassigned',to:p.platoon,old_command:old.supervisor_name||'Unassigned',new_command:p.supervisor_name||'Unassigned',updates,changed:['platoon','supervisor_id','next_level_supervisor_id'].some(k=>String(old[k]||'')!==String(updates[k as keyof typeof updates]||''))};}).filter(p=>p.changed);
 return {counts:totals,changes,warnings:assigned.filter(p=>level(p)>2&&!p.supervisor_id).map(p=>name(p)+' has no eligible command officer')};
}
export async function rosterVersion(users:any[]) {
 const snapshot=users.map(p=>[p.id,p.updated_date,p.rank,p.platoon,p.supervisor_id,p.oversight_platoon,p.termination_date,p.employment_status,p.additional_roles,p.hire_date]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
 return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
