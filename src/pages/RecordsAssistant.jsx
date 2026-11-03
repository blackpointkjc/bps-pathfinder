import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {base44} from '@/api/base44Client';
import {createPageUrl} from '@/utils';
import {Search,UserRound,CarFront,FileText,MapPin,CalendarDays,ArrowUpRight,AlertTriangle,Loader2,Shield,ChevronDown} from 'lucide-react';
import '@/components/reports/pathfinderRecordsTheme.css';

const modes=[['all','All records'],['person','People'],['vehicle','Vehicles']];
const clean=value=>String(value??'').trim();
const normalized=value=>clean(value).toLowerCase();
const dateLabel=value=>{if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'America/New_York'}).format(date):clean(value).slice(0,16)};
const titleOf=item=>clean(item?.label||item?.linked_call_number||item?.id)||'Unnamed record';
const recordLink=item=>item.entity==='BOLOAlert'||item.source==='BOLO / Alerts'
  ? `${createPageUrl('CADCenter')}?section=alerts&tool=bolo&open=${encodeURIComponent(item.id)}`
  : `${createPageUrl('RecordViewer')}?id=${encodeURIComponent(item.id)}&entity=${encodeURIComponent(item.entity)}`;
const leaseStyle=status=>normalized(status)==='active'?'border-emerald-700/50 bg-emerald-950/25 text-emerald-300':normalized(status)==='former'?'border-slate-600 bg-slate-800/60 text-slate-300':'border-amber-700/50 bg-amber-950/25 text-amber-300';
const uiButton='inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#36546a] bg-[#132e41] px-3 py-2 text-xs font-bold text-cyan-100 transition hover:border-cyan-500 hover:bg-[#17374c]';

function CompanyRecord({item}){
 const reference=titleOf(item);
 const type=clean(item?.source||item?.entity).replace(/^CAD \/ /,'');
 const location=clean(item.location||item.linked_call_location);
 const person=clean(item.person);
 const vehicle=[item.vehicle_description,item.vehicle_plate&&`Plate ${item.vehicle_plate}${item.vehicle_state?' '+item.vehicle_state:''}`].filter(Boolean).join(' · ');
 return <article className="rounded-xl border border-[#29445a] bg-[#0d2132] p-4 transition hover:border-cyan-700/60 sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="min-w-0 flex-1 space-y-2">
       <div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="rounded-md border border-[#36566b] bg-[#143147] px-2 py-1 font-bold text-cyan-200">{type||'Company record'}</span>{item.status&&<span className="rounded-md bg-[#25394b] px-2 py-1 font-semibold capitalize text-slate-300">{clean(item.status).replaceAll('_',' ')}</span>}{item.date&&<span className="inline-flex items-center gap-1 text-slate-400"><CalendarDays size={13}/>{dateLabel(item.date)}</span>}</div>
       <h3 className="break-words text-base font-black text-white">{reference}</h3>
       {(person||vehicle||location||item.linked_call_type)&&<div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs leading-5 text-slate-300">
        {person&&<span className="inline-flex items-start gap-1.5"><UserRound size={14} className="mt-0.5 shrink-0 text-cyan-400"/>{person}</span>}
        {vehicle&&<span className="inline-flex items-start gap-1.5"><CarFront size={14} className="mt-0.5 shrink-0 text-cyan-400"/>{vehicle}</span>}
        {location&&<span className="inline-flex items-start gap-1.5"><MapPin size={14} className="mt-0.5 shrink-0 text-cyan-400"/>{location}</span>}
        {item.linked_call_type&&<span className="text-slate-400">{item.linked_call_type}</span>}
       </div>}
       {item.warrant_issued&&<p className="flex items-center gap-1.5 text-xs text-amber-300"><AlertTriangle size={14} className="shrink-0"/>Historical warrant information appears in this report. Current status is not verified.</p>}
     </div>
     <Link className={`${uiButton} shrink-0`} to={recordLink(item)}><FileText size={15}/>View record<ArrowUpRight size={13}/></Link>
   </div>
  </article>;
}

export default function RecordsAssistant(){
 const [mode,setMode]=useState('all');
 const [query,setQuery]=useState('');
 const [site,setSite]=useState('');
 const [sites,setSites]=useState([]);
 const [propertyError,setPropertyError]=useState('');
 const [results,setResults]=useState([]);
 const [propertyResults,setPropertyResults]=useState([]);
 const [error,setError]=useState('');
 const [partial,setPartial]=useState('');
 const [searched,setSearched]=useState(false);
 const [searching,setSearching]=useState(false);
 const [sourceFilter,setSourceFilter]=useState('all');
 const [searchedText,setSearchedText]=useState('');
 const latest=useRef(0);
 useEffect(()=>{let live=true;
   base44.functions.invoke('manageParkingRecords',{action:'sites'}).then(response=>{
     const data=response?.data||response||{};
     if(!live)return;
     if(data.error)throw Error(data.error);
     setSites(Array.isArray(data.sites)?data.sites:[]);
   }).catch(err=>{if(live)setPropertyError(err?.response?.data?.error||err?.message||'Property list unavailable');});
   return()=>{live=false};
 },[]);
 const changeScope=(next,kind='site')=>{if(kind==='site')setSite(next);else setMode(next);setSearched(false);setSearching(false);setError('');setPartial('');setResults([]);setPropertyResults([]);setSourceFilter('all');latest.current++;};
 const search=async event=>{
   event?.preventDefault();const term=clean(query);if(term.length<2)return;
   const seq=++latest.current;
   setSearching(true);setSearched(false);setError('');setPartial('');setSourceFilter('all');
   setResults([]);setPropertyResults([]);
   const jobs=[base44.functions.invoke('searchCompanyRecords',{query:term,search_type:mode})];
   if(site)jobs.push(base44.functions.invoke('manageParkingRecords',{action:'records_check',site_name:site,query:term}));
   const settled=await Promise.allSettled(jobs);
   if(seq!==latest.current)return;
   const problems=[];
   let successfulQueries=0;
   if(settled[0].status==='fulfilled'){
     const data=settled[0].value?.data||settled[0].value||{};
     if(data.error)problems.push(data.error);
     else {successfulQueries++;setResults(data.results||[]);if(data.partial&&data.failed_sources)problems.push(`${data.failed_sources} company source${data.failed_sources===1?' was':'s were'} unavailable`);}
   }else problems.push(settled[0].reason?.response?.data?.error||settled[0].reason?.message||'Company records unavailable');
   if(site){
     if(settled[1].status==='fulfilled'){
       const data=settled[1].value?.data||settled[1].value||{};
       if(data.error)problems.push(data.error);else {successfulQueries++;setPropertyResults(data.matches||[]);}
     }else problems.push(settled[1].reason?.response?.data?.error||settled[1].reason?.message||'Property registry unavailable');
   }
   if(successfulQueries===0)setError(problems.join(' · ')||'Search unavailable');else if(problems.length)setPartial(problems.join(' · '));
   setSearchedText(term);setSearched(true);setSearching(false);
 };
 const residents=propertyResults.filter(item=>item.source==='Property resident registry');
 const propertyOther=propertyResults.filter(item=>item.source!=='Property resident registry');
 const sources=useMemo(()=>[...new Set(results.map(item=>clean(item.source)).filter(Boolean))],[results]);
 const shown=sourceFilter==='all'?results:results.filter(item=>item.source===sourceFilter);
 const total=results.length+propertyResults.length;
 return <div className="bps-records-workspace min-h-full"><div className="bps-records-inner space-y-4">
   <header className="bps-records-hero p-5 sm:p-6"><div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-cyan-300"><Search size={22}/></div><div><p className="bps-records-eyebrow">Pathfinder / Records</p><h1 className="bps-records-heading">Records AI</h1><p className="mt-1 text-xs text-slate-400">Find people, vehicles, reports, and property residents.</p></div></div></header>
   <form onSubmit={search} className="bps-records-card space-y-4 p-4 sm:p-5">
     <div className="flex flex-wrap gap-2" role="group" aria-label="Search category">{modes.map(([id,label])=><button type="button" key={id} aria-pressed={mode===id} onClick={()=>changeScope(id,'mode')} className="bps-records-tab flex-1 sm:flex-none">{label}</button>)}</div>
     <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
       <label className="min-w-0 flex-1 text-[11px] font-bold text-slate-400">Search records<div className="relative mt-1.5"><Search size={17} className="absolute left-3 top-3.5 text-slate-500"/><input autoComplete="off" className="bps-records-input !min-h-12 !pl-10" placeholder={mode==='person'?'Enter a name…':mode==='vehicle'?'Enter a plate, VIN, or vehicle details…':'Enter a name, call number, address, or keyword…'} value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search Pathfinder records"/></div></label>
       <label className="min-w-0 sm:w-[230px] text-[11px] font-bold text-slate-400">Property records<div className="relative mt-1.5"><select className="bps-records-input !min-h-12 !pr-9" value={site} onChange={e=>changeScope(e.target.value)} aria-label="Select property for resident lookup"><option value="">Company records only</option>{sites.map(value=><option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-4 text-slate-500"/></div></label>
       <button disabled={searching||clean(query).length<2} className="bps-records-button bps-records-button-primary !min-h-12 sm:min-w-[125px]" type="submit">{searching?<Loader2 size={16} className="animate-spin"/>:<Search size={16}/>}Search</button>
     </div>
     {site&&<p className="flex items-center gap-1.5 text-[11px] text-cyan-300"><MapPin size={13}/>Includes resident names, apartment addresses, and lease status at {site}.</p>}
     {propertyError&&<p className="text-[11px] text-amber-300">Property lookup unavailable: {propertyError}. Company records search is still available.</p>}
   </form>
   {error&&<div role="alert" className="rounded-lg border border-amber-700/50 bg-amber-950/25 p-3 text-sm text-amber-200">{error}</div>}
   {partial&&<div role="status" className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200">Partial results: {partial}.</div>}
   {searched&&!error&&<div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-300"><span><strong className="text-lg text-white">{total}</strong> matching {total===1?'record':'records'} for <strong className="text-white">{searchedText}</strong>{site&&<span className="text-slate-400"> · {site}</span>}</span></div>}
   {residents.length>0&&<section className="bps-records-card space-y-3 p-4 sm:p-5"><h2 className="text-sm font-black text-white">Residents <span className="ml-1 text-slate-400">({residents.length})</span></h2><div className="grid gap-2 md:grid-cols-2">{residents.map((row,i)=><article className="rounded-lg border border-[#305068] bg-[#10273a] p-3" key={`${row.id||i}-${i}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{row.full_name||'Name not recorded'}</strong><span className={`rounded-md border px-2 py-1 text-[10px] font-bold capitalize ${leaseStyle(row.lease_status)}`}>{row.lease_status||'Unknown'} lease</span></div><p className="mt-2 flex items-start gap-1.5 text-xs text-slate-300"><MapPin size={14} className="mt-0.5 shrink-0 text-cyan-400"/><span>{row.address||row.unit_number||'Address not recorded'}{row.building?` · Building ${row.building}`:''}</span></p></article>)}</div></section>}
   {propertyOther.length>0&&<section className="bps-records-card p-4 sm:p-5"><h2 className="mb-3 text-sm font-bold text-white">Property parking records <span className="text-slate-400">({propertyOther.length})</span></h2><div className="space-y-2">{propertyOther.map((item,i)=><p key={`${item.id||i}-${i}`} className="rounded-md border border-[#29445a] p-3 text-xs"><strong>{item.citation_number||'Parking record'}</strong> · {item.status||'Status unknown'}{item.license_plate&&` · Plate ${item.license_plate}`}</p>)}</div></section>}
   {results.length>0&&<section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2 px-1"><h2 className="text-sm font-black text-white">Company records <span className="text-slate-400">({results.length})</span></h2>{sources.length>1&&<div className="flex max-w-full flex-wrap gap-1.5"><button type="button" aria-pressed={sourceFilter==='all'} className="bps-records-tab !min-h-8 !px-2.5 !py-1 !text-[11px]" onClick={()=>setSourceFilter('all')}>All</button>{sources.map(source=><button key={source} type="button" aria-pressed={sourceFilter===source} onClick={()=>setSourceFilter(source)} className="bps-records-tab !min-h-8 !px-2.5 !py-1 !text-[11px]">{source}</button>)}</div>}</div><div className="space-y-2.5">{shown.map((item,i)=><CompanyRecord key={`${item.entity||'record'}-${item.id||i}-${i}`} item={item}/>)}</div></section>}
   {searched&&!searching&&!error&&total===0&&<div className="bps-records-card p-9 text-center"><Shield className="mx-auto mb-2 text-slate-500" size={28}/><p className="font-bold text-slate-200">No matching records</p><p className="mt-1 text-xs text-slate-400">Try another name or search all records for mentions in report narratives.</p></div>}
   {searched&&<p className="px-1 text-[11px] text-slate-500">Results are from Pathfinder records only. Report content and any warrant references may be historical; verify current information with the appropriate authority before taking action.</p>}
  </div></div>;
}
