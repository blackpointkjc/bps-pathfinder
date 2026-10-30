import React,{useState} from 'react';
import { base44 } from '@/api/base44Client';
import { announceRecordSearch } from '@/utils/voiceAnnouncer';
export default function RecordsCheckButton({name='',plate='',site='',compact=false}){
 const [checking,setChecking]=useState(false),[report,setReport]=useState(null),[error,setError]=useState('');
 const check=async()=>{
  const query=String(plate||name||'').trim();if(query.length<2)return;
  setChecking(true);setError('');
  try{
   // Narrow internal company-record search. No outside DMV, court or NCIC lookups.
   const payload=(await base44.functions.invoke('searchCompanyRecords',{query,search_type:plate?'vehicle':'person',entities:['ParkingViolation','TrespassingNotice','MDTrespassNotice','IncidentReport','BOLOAlert']}));
   const data=payload?.data||payload;
   if(data?.error)throw Error(data.error);
   const matches=data.results||[];
   setReport({matches,total:data.total_matches??matches.length});
   announceRecordSearch(matches,{searchType:plate?'vehicle':'person',warrantMatches:0,warrantStatusText:''});
   if(!matches.length&&typeof window!=='undefined'&&window.speechSynthesis){
    // Only a local record search result; never announce a person is legally cleared.
    const speech=new SpeechSynthesisUtterance('Pathfinder company records check: no matching internal records located.');
    speech.rate=1;window.speechSynthesis.speak(speech);
   }
  }catch(e){setError(e.message||'Records search unavailable');}finally{setChecking(false);}
 };
 return <div className={compact?'space-y-1':'space-y-2 rounded-lg border border-cyan-900/50 p-3'}>
  <button type="button" disabled={checking||!(plate||name)} onClick={check} className="rounded-md bg-cyan-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{checking?'Checking records…':`Run Pathfinder ${plate?'vehicle':'person'} records check`}</button>
  {error&&<p role="alert" className="text-xs text-amber-400">{error}</p>}
  {report&&<div role="status" className="text-xs text-slate-200"><b>{report.total} company-record matches</b>{site&&<span> · Property: {site}</span>}{report.matches.slice(0,5).map((item,i)=><div key={`${item.entity}-${i}`} className="mt-1 border-l-2 border-cyan-700 pl-2">{item.source}: {item.label||item.summary||'Existing record'} {item.status&&`(${item.status})`}</div>)}<p className="mt-1 text-[10px] text-slate-400">Internal Pathfinder records only. Not a DMV, warrant, NCIC or court verification.</p></div>}
 </div>;
}
