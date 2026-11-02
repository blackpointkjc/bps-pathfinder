import {isFullAccessOwner} from '@/lib/portalAccess';
const OPTIONS=[
 ['officer','Officer','Officer workspace and employee tools'],
 ['supervisor','Supervisor','Command and supervisor workspace'],
 ['cad_access','CAD Access','Dispatch, live map and field records'],
 ['support','Support Staff','Support staff workspace'],
 ['hr','Human Resources','Employee records and HR workspace'],
 ['trainer','Training','Courses, student records and compliance'],
 ['ia','Internal Affairs / Professional Standards','Confidential investigations and personnel standards'],
 ['accounting','Accounting','Payroll, invoices and financial reports'],
 ['full_access','Full Access — Colonel Hiers only','Every Pathfinder workspace and tool']
];
export default function AdditionalRolesEditor({account,value,onChange,canEditRoles=true}){
 const roles=value.additional_roles||[];
 const changeRole=(role,checked)=>onChange(previous=>({...previous,additional_roles:checked?[...new Set([...(previous.additional_roles||[]),role])]:(previous.additional_roles||[]).filter(v=>v!==role),...(role==='ia'?{ps_role:checked?previous.ps_role==='reviewer'?'reviewer':'investigator':'none'}:{})}));
 return <section className="my-4 rounded-xl border border-slate-600 bg-slate-950 p-4 text-white">
  <h3 className="mb-3 text-base font-semibold">Additional Roles</h3>{!canEditRoles&&<p className="mb-3 text-xs text-amber-200">Only Colonel Hiers can change roles. These permissions are shown read-only.</p>}
  <div className="grid gap-3 md:grid-cols-2">{OPTIONS.filter(([id])=>!['full_access','accounting'].includes(id)||isFullAccessOwner(account)).map(([id,label,description])=><label key={id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 p-3"><input type="checkbox" className="mt-1" checked={roles.includes(id)} disabled={!canEditRoles} onChange={event=>changeRole(id,event.target.checked)}/><span><strong className="block text-sm">{label}</strong><small className="text-slate-300">{description}</small></span></label>)}</div>
  {roles.includes('ia')&&<label className="mt-4 block text-sm font-semibold">Internal Affairs permission level<select className="mt-2 w-full rounded-lg border border-slate-500 bg-slate-950 p-3 text-white" value={value.ps_role==='reviewer'?'reviewer':'investigator'} disabled={!canEditRoles} onChange={event=>onChange(previous=>({...previous,ps_role:event.target.value}))}><option value="investigator">Investigator — assigned investigations only</option><option value="reviewer">Reviewer — all cases, approvals, audits and exports</option></select><span className="mt-2 block text-xs font-normal text-slate-300">{value.ps_role==='reviewer'?'Can see all IA cases, assign investigators, approve another investigator’s findings, issue training or suspension, and access audit records and exports. Cannot approve their own investigation.':'Can work assigned cases only: evidence, interviews, notes, tasks and recommended findings. Cannot approve findings, suspend accounts, order training or export case information.'}</span></label>}
 </section>;
}
