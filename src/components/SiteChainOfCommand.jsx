import { primarySiteReportingChain } from '@/utils/commandReporting';
import { displayCommandName } from '@/utils/platoonChain';

export default function SiteChainOfCommand({ assignedSupervisors = [], users = [] }) {
 const chain = primarySiteReportingChain(assignedSupervisors, users);
 return <section className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-white" aria-label="Site chain of command">
  <h3 className="text-sm font-bold text-cyan-200">Site Chain of Command</h3>
  {!chain && <p className="text-sm text-slate-400">No site supervisor assigned.</p>}
  {chain?.assignmentRequired && <p className="text-sm text-amber-200">{chain.unresolved ? 'Site supervisor information is unavailable. Please contact dispatch to verify the assignment.' : 'A single site supervisor needs to be designated for this property. Please contact dispatch.'}</p>}
  {chain && [...chain.levels].reverse().map((level,index) => <div key={index} className="min-w-0">
   {index > 0 && <div aria-hidden="true" className="mx-auto my-2 h-6 w-px bg-cyan-700"/>}
   <div className="flex flex-wrap justify-center gap-3">{level.map(person => <article key={person.id} className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
    <div className="flex items-center gap-3">
     {person.profile_photo_url ? <img src={person.profile_photo_url} alt={displayCommandName(person)} loading="lazy" className="h-16 w-16 shrink-0 rounded-full border border-slate-600 object-cover"/> : <div aria-label="Photo unavailable" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 font-bold text-slate-200">{person.first_name?.[0]}{person.last_name?.[0]}</div>}
     <div className="min-w-0"><div className="break-words font-bold">{displayCommandName(person)}</div><div className="mt-1 text-xs font-semibold text-cyan-300">{index === chain.levels.length - 1 ? 'Site Supervisor' : 'Reporting Command'}</div><div className="mt-1 text-xs text-slate-400">{[person.unit_number ? `Unit ${person.unit_number}` : '', person.platoon ? `Platoon ${person.platoon}` : ''].filter(Boolean).join(' · ')}</div></div>
    </div>
   </article>)}</div>
  </div>)}
  {chain?.incomplete && <p className="text-xs text-slate-400">Further reporting assignment is not recorded.</p>}
 </section>;
}
