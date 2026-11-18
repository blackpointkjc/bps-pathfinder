import { rankLevel } from '@/utils/rankPolicy';
const name=person=>rankLevel(person.rank)<999?[person.rank,person.last_name].filter(Boolean).join(' '):[person.first_name,person.last_name].filter(Boolean).join(' ')||person.full_name||person.email;
export default function EmployeeDirectory({employees=[],onEdit,onPhoto}){
 return <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-950">
  <table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="p-4">Employee</th><th className="p-4">Assignment</th><th className="p-4">Contact</th><th className="p-4">Employment</th><th className="p-4 text-right">Actions</th></tr></thead>
   <tbody className="divide-y divide-slate-800">{employees.map(person=><tr key={person.id} className="hover:bg-slate-900/70">
    <td className="p-4"><div className="flex items-center gap-3">{person.profile_photo_url?<button type="button" onClick={()=>onPhoto?.({url:person.profile_photo_original_url||person.profile_photo_url,name:name(person)})} aria-label={'View photo of '+name(person)}><img src={person.profile_photo_url} alt="" className="h-11 w-11 rounded-full object-cover"/></button>:<span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs text-cyan-200">{person.first_name?.[0]}{person.last_name?.[0]}</span>}<div><strong className="block text-white">{name(person)}</strong><span className="mt-1 block text-xs text-slate-400">{[person.first_name,person.last_name].filter(Boolean).join(' ')}</span></div></div></td>
    <td className="p-4 text-slate-300"><span className="block">{person.division||'No division assigned'}</span><span className="mt-1 block text-xs text-slate-400">{person.platoon?'Platoon '+person.platoon:'No platoon'}{person.unit_number?' · Unit '+person.unit_number:''}</span></td>
    <td className="p-4"><a className="block break-all text-cyan-200" href={'mailto:'+person.email}>{person.email}</a>{person.mobile_phone&&<a className="mt-1 block text-xs text-slate-400" href={'tel:'+person.mobile_phone}>{person.mobile_phone}</a>}</td>
    <td className="p-4 text-xs text-slate-300"><span className={'rounded-full border px-2 py-1 '+(person.termination_date?'border-red-800 text-red-200':'border-emerald-800 text-emerald-200')}>{person.termination_date?'Former employee':'Active employee'}</span>{person.hire_date&&<span className="mt-2 block text-slate-400">Hired {person.hire_date}</span>}</td>
    <td className="p-4 text-right"><button type="button" onClick={()=>onEdit(person)} className="whitespace-nowrap rounded-lg border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-950">Manage employee</button></td>
   </tr>)}</tbody>
  </table>{!employees.length&&<p className="p-8 text-center text-sm text-slate-400">No employees match these filters.</p>}
 </div>;
}
