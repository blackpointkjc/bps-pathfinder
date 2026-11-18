import {useRef,useState} from 'react';
import {base44} from '@/api/base44Client';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Search,UserRound,CarFront,FileText,MapPin,CalendarDays,ArrowUpRight,AlertTriangle,Loader2,Shield,X,ChevronDown,Clock3} from 'lucide-react';
import '@/components/reports/pathfinderRecordsTheme.css';

const clean=value=>String(value??'').trim();
const lower=value=>clean(value).toLowerCase();
const formatLabel=value=>clean(value).replaceAll('_',' ').replace(/\b\w/g,ch=>ch.toUpperCase());
const dateLabel=value=>{if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'America/New_York'}).format(date):clean(value).slice(0,16)};
const recordTitle=item=>clean(item?.label||item?.citation_number||item?.call_number||item?.report_number||item?.id)||'Company record';
const badgeClass='rounded-md border border-[#35556b] bg-[#122f43] px-2 py-1 text-[10px] font-bold text-cyan-200';
const leaseBadge=status=>lower(status)==='active'?'border-emerald-700/50 bg-emerald-950/30 text-emerald-300':lower(status)==='former'?'border-slate-600 bg-slate-800 text-slate-300':'border-amber-700/50 bg-amber-950/30 text-amber-300';
const hiddenDetails=new Set(['id','updated_by','created_by_id','created_by','app_id','_id','_rev']);
const importantFields=['report_number','case_number','citation_number','call_number','call_id','incident','call_type','status','priority','date','incident_date','violation_date','time_received','location','site_name','property_name','unit_number','building','lease_status','resident_type','phone','email','subject_name','person_name','full_name','vehicle_plate','license_plate','vehicle_state','vehicle_vin','vin','officer_name','assigned_to','supervisor_review_status','client_review_status'];
const longFields=new Set(['narrative','description','summary','statement_of_facts','facts_basis','details','report_text','notes','incident_summary','ai_summary','violation_description','disposition','findings']);
const printable=v=>v===null||v===undefined||v===''?'Not recorded':Array.isArray(v)?v.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join('\n'):typeof v==='object'?JSON.stringify(v,null,2):typeof v==='boolean'?(v?'Yes':'No'):String(v);

function ResidentResult({item,onOpen}){
 return <button type="button" onClick={()=>onOpen(item)} className="group flex w-full flex-col gap-2 rounded-xl border border-[#2c485e] bg-[#0c2335] p-4 text-left transition hover:border-cyan-500/70 hover:bg-[#112b40]">
   <div className="flex flex-wrap items-center justify-between gap-3"><strong className="flex items-center gap-2 text-sm text-white"><UserRound size={16} className="text-cyan-400"/>{item.full_name||'Name not recorded'}</strong><span className={`rounded-md border px-2 py-1 text-[10px] font-bold capitalize ${leaseBadge(item.lease_status)}`}>{item.lease_status||'Unknown'} lease</span></div>
   <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300"><span className="inline-flex items-center gap-1"><MapPin size={13} className="text-cyan-400"/>{item.address||item.unit_number||'Address not recorded'}{item.building?` · Building ${item.building}`:''}</span><span className="text-slate-500">{item.site_name}</span></div>
   <span className="flex items-center gap-1 text-[11px] font-bold text-cyan-300">Open resident record <ArrowUpRight size={12}/></span>
 </button>;
}
function ReportResult({item,onOpen}){
 const location=clean(item.location||item.linked_call_location);
 const vehicle=[item.vehicle_description,item.vehicle_plate&&`Plate ${item.vehicle_plate}${item.vehicle_state?' '+item.vehicle_state:''}`].filter(Boolean).join(' · ');
 return <button type="button" onClick={()=>onOpen(item)} className="group w-full rounded-xl border border-[#2c485e] bg-[#0c2335] p-4 text-left transition hover:border-cyan-500/70 hover:bg-[#112b40]">
  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={badgeClass}>{item.source||'Company report'}</span>{item.match_context&&<span className="rounded-md border border-[#32475b] px-2 py-1 text-[10px] text-slate-300">Matched {item.match_context}</span>}{item.status&&<span className="rounded-md bg-[#293e50] px-2 py-1 text-[10px] font-semibold capitalize text-slate-200">{formatLabel(item.status)}</span>}{item.date&&<span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><CalendarDays size={12}/>{dateLabel(item.date)}</span>}</div><h3 className="mt-2 break-words text-base font-black text-white">{recordTitle(item)}</h3></div><span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-300 group-hover:text-cyan-100">View report <ArrowUpRight size={14}/></span></div>
  {(item.person||location||vehicle||item.linked_call_type)&&<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-300">{item.person&&<span className="inline-flex items-center gap-1"><UserRound size={13} className="text-cyan-400"/>{item.person}</span>}{location&&<span className="inline-flex items-center gap-1"><MapPin size={13} className="text-cyan-400"/>{location}</span>}{vehicle&&<span className="inline-flex items-center gap-1"><CarFront size={13} className="text-cyan-400"/>{vehicle}</span>}{item.linked_call_type&&<span className="text-slate-400">{item.linked_call_type}</span>}</div>}
  {item.warrant_issued&&<div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300"><AlertTriangle size={13}/>Historical warrant reference in report — current status unverified</div>}
 </button>;
}
function ReportDetail({item,record,loading,error}){
 if(loading)return <div role="status" className="flex items-center gap-2 py-8 text-sm text-cyan-200"><Loader2 className="animate-spin" size={17}/>Loading the source report…</div>;
 if(error)return <div className="space-y-3"><div role="alert" className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-200">Full source report could not load: {error}. The matching record summary is shown below.</div><div className="rounded-lg border border-[#29445a] p-4"><p className="text-sm font-bold text-white">{recordTitle(item)}</p><p className="mt-2 text-xs text-slate-300">{item?.summary||item?.location||'No further summary was returned.'}</p></div></div>;
 const r=record||item;
 if(!r)return null;
 const primary=importantFields.filter(key=>r[key]!==undefined&&r[key]!==null&&r[key]!=='');
 const narrative=Object.keys(r).filter(key=>longFields.has(key)&&r[key]);
 const remaining=Object.keys(r).filter(key=>!hiddenDetails.has(key)&&!primary.includes(key)&&!narrative.includes(key)&&r[key]!==undefined&&r[key]!==null&&r[key]!=='');
 return <div className="space-y-5">
   {item?.source==='Property resident registry'&&<div className="flex flex-wrap gap-2 text-xs"><span className={badgeClass}>Property: {item.site_name}</span><span className={`rounded-md border px-2 py-1 font-semibold capitalize ${leaseBadge(item.lease_status)}`}>{item.lease_status||'Unknown'} lease</span></div>}
   {item?.warrant_issued&&<p className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-3 text-xs text-amber-200">This report contains a historical warrant reference. It does not confirm the warrant is currently active.</p>}
   <div className="grid gap-2 sm:grid-cols-2">{primary.map(key=><div key={key} className="rounded-lg border border-[#2a4357] bg-[#0b1929] p-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{formatLabel(key)}</p><p className="whitespace-pre-wrap break-words text-sm text-slate-100">{printable(r[key])}</p></div>)}</div>
   {narrative.map(key=><section key={key} className="rounded-xl border border-[#2a4357] bg-[#0a1a2a] p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-300">{formatLabel(key)}</h4><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{printable(r[key])}</p></section>)}
   {remaining.length>0&&<details className="rounded-xl border border-[#2a4357] bg-[#0b1929] p-3"><summary className="cursor-pointer text-xs font-bold text-cyan-300">Additional report fields ({remaining.length})</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{remaining.map(key=><div key={key} className="min-w-0 rounded-lg border border-[#24394d] bg-[#0c2030] p-3"><p className="mb-1 text-[10px] uppercase text-slate-500">{formatLabel(key)}</p><pre className="whitespace-pre-wrap break-words font-sans text-xs text-slate-200">{printable(r[key])}</pre></div>)}</div></details>}
   <p className="text-[11px] text-slate-500">Internal Pathfinder source record. Verify current facts, legal status, and identifiers before taking enforcement action.</p>
 </div>;
}

export default function RecordsAssistant(){
 const [query,setQuery]=useState('');
 const [results,setResults]=useState([]);
 const [residents,setResidents]=useState([]);
 const [selected,setSelected]=useState(null);
 const [detail,setDetail]=useState(null);
 const [detailLoading,setDetailLoading]=useState(false);
 const [detailError,setDetailError]=useState('');
 const [error,setError]=useState('');
 const [partial,setPartial]=useState('');
 const [searched,setSearched]=useState(false);
 const [searching,setSearching]=useState(false);
 const [searchedText,setSearchedText]=useState('');
 const [count,setCount]=useState(0);
 const [sourceFilter,setSourceFilter]=useState('all');
 const latest=useRef(0);
 const detailSequence=useRef(0);
 const runSearch=async event=>{
  event?.preventDefault();const term=clean(query);if(term.length<2)return;
  const seq=++latest.current;
  setSearching(true);setSearched(false);setError('');setPartial('');setSourceFilter('all');setResults([]);setResidents([]);
  // Both searches run concurrently. The property registry is scoped to the
  // employee's authorized operational sites by the backend, with no dropdown.
  const settled=await Promise.allSettled([
   base44.functions.invoke('searchCompanyRecords',{query:term,search_type:'all'}),
   base44.functions.invoke('manageParkingRecords',{action:'search_all',query:term}),
  ]);
  if(seq!==latest.current)return;
  const problems=[];let ok=0,company=[],people=[],matched=0;
  if(settled[0].status==='fulfilled'){
   const d=settled[0].value?.data||settled[0].value||{};
   if(d.error)problems.push(d.error);else{ok++;company=d.results||[];matched=Number(d.total_matches)||company.length;if(d.partial||d.truncated)problems.push(d.truncated?'Company results exceed the display limit; narrow your search to see more':'Some company sources were unavailable');}
  }else problems.push(settled[0].reason?.response?.data?.error||settled[0].reason?.message||'Company record search failed');
  if(settled[1].status==='fulfilled'){
   const d=settled[1].value?.data||settled[1].value||{};
   if(d.error)problems.push(d.error);else{ok++;people=d.matches||[];if(d.partial)problems.push('Property registry exceeded the safe search limit');}
  }else problems.push(settled[1].reason?.response?.data?.error||settled[1].reason?.message||'Resident registry search failed');
  setResults(company);setResidents(people);setCount(matched+people.length);
  if(!ok)setError(problems.join(' · ')||'Records search unavailable');else if(problems.length)setPartial(problems.join(' · '));
  setSearchedText(term);setSearched(true);setSearching(false);
 };
 const openRecord=async item=>{
   const seq=++detailSequence.current;setSelected(item);setDetail(null);setDetailError('');
   if(item.source==='Property resident registry'){setDetail(item);setDetailLoading(false);return;}
   setDetailLoading(true);
   try{
    const response=await base44.functions.invoke('searchCompanyRecords',{action:'get',entity:item.entity,id:item.id});
    const d=response?.data||response||{};
    if(d.error||!d.record)throw Error(d.error||'Source record unavailable');
    if(seq===detailSequence.current)setDetail(d.record);
   }catch(e){if(seq===detailSequence.current)setDetailError(e?.response?.data?.error||e.message||'Source report unavailable');}
   finally{if(seq===detailSequence.current)setDetailLoading(false);}
 };
 const sources=[...new Set(results.map(r=>r.source).filter(Boolean))];
 const filtered=sourceFilter==='all'?results:results.filter(r=>r.source===sourceFilter);
 return <div className="bps-records-workspace min-h-full"><div className="bps-records-inner space-y-4">
   <header className="bps-records-hero p-5 sm:p-6"><div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-cyan-300"><Search size={22}/></div><div><p className="bps-records-eyebrow">Pathfinder / Intelligence</p><h1 className="bps-records-heading">Records AI</h1><p className="mt-1 text-xs text-slate-400">One search for company reports, CAD calls, parking notices, vehicles, and residents.</p></div></div></header>
   <form onSubmit={runSearch} className="bps-records-card space-y-3 p-4 sm:p-5"><label className="block text-xs font-bold text-slate-400">Search all authorized records<div className="mt-2 flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search size={17} className="absolute left-3 top-3.5 text-slate-500"/><input autoComplete="off" className="bps-records-input !min-h-12 !pl-10" placeholder="Name, apartment, address, plate, CAD call or report number…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search all Pathfinder records"/></div><button disabled={searching||clean(query).length<2} className="bps-records-button bps-records-button-primary !min-h-12 !min-w-[115px]" type="submit">{searching?<Loader2 size={16} className="animate-spin"/>:<Search size={16}/>}Search</button></div></label></form>
   {error&&<div role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-200">{error}</div>}
   {partial&&<div role="status" className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-200">Some results may be missing: {partial}.</div>}
   {searched&&!error&&<div className="flex flex-wrap items-center gap-2 px-1 text-sm text-slate-300"><strong className="text-lg text-white">{count}</strong> {count===1?'result':'results'} for <strong className="text-white">{searchedText}</strong></div>}
   {residents.length>0&&<section className="bps-records-card space-y-3 p-4 sm:p-5"><h2 className="text-sm font-black text-white">Residents <span className="text-slate-400">({residents.length})</span></h2><div className="grid gap-2 md:grid-cols-2">{residents.map((item,i)=><ResidentResult key={`${item.id||i}-${i}`} item={item} onOpen={openRecord}/>)}</div></section>}
   {results.length>0&&<section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3 px-1"><h2 className="text-sm font-black text-white">Reports, calls & notices <span className="text-slate-400">({results.length})</span></h2>{sources.length>1&&<div className="flex max-w-full flex-wrap gap-1.5"><button type="button" aria-pressed={sourceFilter==='all'} className="bps-records-tab !min-h-8 !px-2.5 !py-1 !text-[11px]" onClick={()=>setSourceFilter('all')}>All</button>{sources.map(source=><button type="button" key={source} aria-pressed={sourceFilter===source} className="bps-records-tab !min-h-8 !px-2.5 !py-1 !text-[11px]" onClick={()=>setSourceFilter(source)}>{source}</button>)}</div>}</div><div className="space-y-2">{filtered.map((item,i)=><ReportResult key={`${item.entity}-${item.id||i}-${i}`} item={item} onOpen={openRecord}/>)}</div></section>}
   {searched&&!searching&&!error&&count===0&&<div className="bps-records-card p-10 text-center"><Shield size={28} className="mx-auto mb-3 text-slate-500"/><p className="font-bold text-slate-200">No matching company records</p><p className="mt-1 text-xs text-slate-400">Try a more specific name, address, or record number.</p></div>}
   {searched&&<p className="px-1 text-[11px] text-slate-500">Pathfinder records are internal historical records, not a current government database. Confirm active legal or enforcement statuses independently.</p>}
   <Dialog open={!!selected} onOpenChange={open=>{if(!open){++detailSequence.current;setSelected(null);setDetail(null);}}}><DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto border-[#35546b] bg-[#081a29] p-0 text-white"><DialogHeader className="sticky top-0 z-10 border-b border-[#29445a] bg-[#102a3d] p-5"><DialogTitle className="flex items-center gap-2 text-lg font-black"><FileText size={18} className="text-cyan-300"/>{selected?.source==='Property resident registry'?selected?.full_name:recordTitle(selected)}</DialogTitle><DialogDescription className="text-xs text-slate-400">{selected?.source||'Pathfinder source record'} · In-app record detail</DialogDescription></DialogHeader><div className="p-5"><ReportDetail item={selected} record={detail} loading={detailLoading} error={detailError}/></div></DialogContent></Dialog>
 </div></div>;
}
