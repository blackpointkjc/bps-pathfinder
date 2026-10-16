import { siteReportingChains } from '@/utils/commandReporting';
const nameOf = person => [person.rank,person.first_name,person.last_name].filter(Boolean).join(' ') || person.full_name || 'Assigned supervisor';
export default function SiteChainOfCommand({ assignedSupervisors = [], users = [] }) {
 const chains=siteReportingChains(assignedSupervisors,users);
 return <section className="min-w-0 space-y-3 rounded-lg border border-slate-500/40 p-3" aria-label="Site chain of command">
  <h3 className="text-sm font-bold">Site Chain of Command</h3>
  {!chains.length && <p className="text-sm opacity-75">No site supervisor assigned.</p>}
  {chains.map((chain,i)=><div key={i} className="min-w-0 space-y-2">
   {[...chain.levels].reverse().map((level,index)=><div key={index} className="min-w-0">
    {index>0 && <p className="my-1 text-xs opacity-70">↓ Chain of command</p>}
    <div className="flex flex-wrap justify-center gap-2">{level.map(person=><div key={person.id} className="min-w-0 flex-1 rounded border border-slate-500/30 p-2 text-sm" style={{flexBasis:200,overflowWrap:'anywhere'}}>
     <div className="font-semibold">{nameOf(person)}</div><div className="text-xs opacity-75">{index===chain.levels.length-1?'Assigned site supervisor':'Reporting command'}{person.unit_number ? ` · Unit ${person.unit_number}`:''}</div>
    </div>)}</div>
   </div>)}
   {chain.unresolved && <p className="text-xs opacity-75">Assigned supervisor record unavailable: {chain.reference}</p>}
   {chain.incomplete && <p className="text-xs opacity-75">Further reporting assignment is not recorded.</p>}
  </div>)}
 </section>;
}
