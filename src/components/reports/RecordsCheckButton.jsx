import {useState} from 'react';
import {base44} from '@/api/base44Client';
import {announceRecordSearch,announceVoice} from '@/utils/voiceAnnouncer';
import {Search,Users,MapPin,ShieldCheck,CarFront,AlertTriangle} from 'lucide-react';

const leaseLabel=value=>({active:'Active',pending:'Pending',former:'Former'}[String(value||'').toLowerCase()]||String(value||'Not recorded'));
const leaseClass=value=>String(value||'').toLowerCase()==='active'?'border-emerald-700/50 bg-emerald-950/30 text-emerald-300':String(value||'').toLowerCase()==='former'?'border-slate-600 bg-slate-800 text-slate-300':'border-amber-700/40 bg-amber-950/30 text-amber-200';

export default function RecordsCheckButton({name='',plate='',site='',compact=false}){
 const [checking,setChecking]=useState(false),[report,setReport]=useState(null),[error,setError]=useState('');
 const check=async()=>{
  const query=String(plate||name||'').trim();if(query.length<2)return;
  setChecking(true);setError('');setReport(null);
  // The resident registry is a separate, property-scoped source. A temporary
  // general records outage must not erase a successful resident lookup.
  const tasks=[base44.functions.invoke('searchCompanyRecords',{query,search_type:plate?'vehicle':'person',entities:['ParkingViolation','TrespassingNotice','MDTrespassNotice','IncidentReport','BOLOAlert']})];
  if(site)tasks.push(base44.functions.invoke('manageParkingRecords',{action:'records_check',site_name:site,query}));
  try{
   const [companyResult,registryResult]=await Promise.allSettled(tasks);
   const failures=[];
   let companyMatches=[],registryMatches=[];
   if(companyResult.status==='fulfilled'){
     const result=companyResult.value?.data||companyResult.value||{};
     if(result.error)failures.push(result.error);else companyMatches=result.results||[];
   }else failures.push(companyResult.reason?.response?.data?.error||companyResult.reason?.message||'Company records unavailable');
   if(site){
    if(registryResult.status==='fulfilled'){
     const result=registryResult.value?.data||registryResult.value||{};
     if(result.error)failures.push(result.error);else registryMatches=result.matches||[];
    }else failures.push(registryResult.reason?.response?.data?.error||registryResult.reason?.message||'Resident registry unavailable');
   }
   if(failures.length===tasks.length)throw Error(failures.join(' · '));
   const residents=registryMatches.filter(row=>row.source==='Property resident registry');
   const other=[...registryMatches.filter(row=>row.source!=='Property resident registry'),...companyMatches];
   setReport({residents,other,total:residents.length+other.length,property:site});
   if(failures.length)setError('Partial results: '+failures.join(' · '));
   announceRecordSearch([...registryMatches,...companyMatches],{searchType:plate?'vehicle':'person',warrantMatches:0,warrantStatusText:''});
   const trespass=other.filter(row=>['TrespassingNotice','MDTrespassNotice'].includes(row.entity)||/trespass/i.test(String(row.source||'')));
   if(trespass.length)announceVoice(`Attention, Pathfinder shows ${trespass.length} previous trespass notice record${trespass.length===1?'':'s'} associated with this search. Verify notice status and subject identification before acting.`,{priority:'high',rate:0.8,dedupeMs:3500,force:true});
  }catch(e){setError(e?.message||'Records search unavailable');}finally{setChecking(false);}
 };
 return <div className={compact?'space-y-2':'space-y-3 rounded-xl border border-[#2d5068] bg-[#0c2030] p-4'}>
  <button type="button" disabled={checking||!(plate||name)} onClick={check} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-600 bg-[#0b6585] px-4 py-2 text-xs font-black text-white transition hover:bg-[#0d7898] disabled:opacity-40"><Search size={15}/>{checking?'Checking records…':`Run Pathfinder ${plate?'vehicle':'person'} records check`}</button>
  {error&&<p role="alert" className="rounded-md border border-amber-700/50 bg-amber-950/25 px-3 py-2 text-xs text-amber-300">{error}</p>}
  {report&&<section role="status" className="space-y-3 rounded-xl border border-[#35546b] bg-[#0a1928] p-3 text-xs text-slate-200">
   <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-black text-cyan-200">Pathfinder internal records check · {report.total} results</div>{report.property&&<span className="flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={12}/>{report.property}</span>}</div>
   {report.residents.length>0&&<div className="space-y-2"><h3 className="flex items-center gap-2 border-b border-[#35546b] pb-2 font-bold text-white"><Users size={15} className="text-cyan-300"/>All matching residents ({report.residents.length})</h3><div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1" aria-label="All matching resident records">{report.residents.map((resident,i)=><article key={`${resident.id||'resident'}-${i}`} className="rounded-lg border border-[#314c61] bg-[#102b3f] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-white">{resident.full_name||'Name not recorded'}</strong><span className={`rounded border px-2 py-1 text-[10px] font-bold ${leaseClass(resident.lease_status)}`}>Lease: {leaseLabel(resident.lease_status)}</span></div><p className="mt-2 flex items-start gap-1.5 text-xs text-slate-200"><MapPin size={13} className="mt-0.5 shrink-0 text-cyan-400"/><span>Apartment / address: <strong>{resident.address||resident.unit_number||'Not recorded'}</strong>{resident.building?` · Building ${resident.building}`:''}</span></p><p className="mt-1 text-[10px] text-slate-400">Property rent-roll record · {resident.site_name||site}</p></article>)}</div></div>}
   {report.other.length>0&&<div className="space-y-2"><h3 className="flex items-center gap-2 border-b border-[#35546b] pb-2 font-bold text-white"><ShieldCheck size={15} className="text-cyan-300"/>Other company records ({report.other.length})</h3><div className="max-h-72 space-y-2 overflow-y-auto">{report.other.map((item,i)=><article key={`${item.entity||item.source}-${item.id||i}-${i}`} className="rounded-md border-l-2 border-cyan-500 bg-[#123049] px-3 py-2"><b>{item.source||'Company record'}</b>: {item.label||item.full_name||item.citation_number||item.vehicle_plate||item.license_plate||item.summary||'Existing record'}{item.status&&` (${item.status})`}</article>)}</div></div>}
   {report.total===0&&<p className="py-3 text-center text-slate-400">No matching records found for this search.</p>}
   <p className="flex items-center gap-1.5 border-t border-[#35546b] pt-2 text-[10px] text-slate-400"><AlertTriangle size={12}/>Company and property records only. Lease status is the recorded registry status, not an independently verified current tenancy. Not a DMV, warrant, NCIC or court check.</p>
  </section>}
 </div>;
}
