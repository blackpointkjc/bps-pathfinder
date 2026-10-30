import {useMemo,useState,useEffect} from 'react';
import {base44} from '@/api/base44Client';
import {rentRollRowsFromText,RENT_ROLL_CSV_HEADERS} from '@/lib/rentRollCsv';
import {Download,FileUp,CheckCircle2,AlertTriangle} from 'lucide-react';

const button='rounded-lg border border-cyan-700 bg-[#0a2639] px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-50';
const example=['Sample Resident','101','Building A','active','','','','','ABC123','VA','Toyota','Camry','Gray','P-101','active','',''];
function downloadTemplate(){
 const escape=value=>'"'+String(value||'').replaceAll('"','""')+'"';
 const content=[RENT_ROLL_CSV_HEADERS,example].map(row=>row.map(escape).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='property-rent-roll-import-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export default function RentRollImportPanel({site,onImported,onImportingChange}){
 const [raw,setRaw]=useState(''),[source,setSource]=useState(''),[progress,setProgress]=useState(0);
 const [busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[summary,setSummary]=useState(null);
 const parsed=useMemo(()=>{
  try{return rentRollRowsFromText(raw)}catch(e){return{rows:[],errors:[e.message||'Invalid CSV'],headerDetected:false}}
 },[raw]);
 useEffect(()=>{setRaw('');setSource('');setProgress(0);setSummary(null);setError('');setConfirmed(false)},[site]);
 const fileSelected=async file=>{
  if(!file)return;
  if(file.size>1500000){setError('CSV file must be 1.5 MB or smaller. Split larger files.');return;}
  try{const content=await file.text();setRaw(content);setSource(file.name);setError('');setSummary(null);setConfirmed(false)}
  catch(e){setError('Unable to read CSV: '+e.message)}
 };
 const importRows=async()=>{
  if(!site||!confirmed||busy||!parsed.rows.length)return;
  setBusy(true);onImportingChange?.(true);setError('');setSummary(null);setProgress(0);
  const result={residents_created:0,residents_updated:0,vehicles_created:0,duplicates:0,errors:[],processed:0};
  try{
   for(let i=0;i<parsed.rows.length;i+=25){
    const chunk=parsed.rows.slice(i,i+25),payload=chunk.map(({_source_row,...row})=>row);
    const response=await base44.functions.invoke('manageParkingRecords',{action:'import_residents',site_name:site,rows:payload});
    const answer=response?.data||response||{};
    if(answer.error)throw Error(answer.error);
    for(const key of ['residents_created','residents_updated','vehicles_created','duplicates','processed'])result[key]+=Number(answer[key]||0);
    result.errors.push(...(answer.errors||[]).map(row=>`CSV row ${chunk[Math.max(0,Number(row.row||1)-1)]?._source_row||i+Number(row.row||1)}: ${row.error}`));
    setProgress(Math.min(parsed.rows.length,i+chunk.length));
   }
   setSummary(result);
   window.dispatchEvent(new CustomEvent('pathfinder:rent-roll-updated',{detail:{site}}));
   await onImported?.();
  }catch(e){setError('Import stopped: '+(e?.response?.data?.error||e?.data?.error||e.message||'Server unavailable')+'. Previously completed batches remain saved; reimporting is safe and matches existing residents and vehicle plates.');setSummary(result);if(result.processed>0){try{await onImported?.()}catch{}}}
  finally{setBusy(false);onImportingChange?.(false)}
 };
 return <section className="space-y-3 rounded-xl border border-cyan-600/60 bg-[#0b263c] p-3 sm:p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-black text-cyan-100"><FileUp size={19}/>Bulk import rent roll / residents</h3><p className="mt-1 text-xs text-slate-300">Upload a CSV or paste a list. All residents and vehicles will be linked to <b>{site||'the selected property'}</b>. Matching resident names and units are updated instead of duplicated.</p></div><button type="button" className={button} onClick={downloadTemplate}><Download size={13} className="mr-1 inline"/>Download CSV template</button></div>
  <label className="block text-xs font-semibold">Choose a CSV / text file<input type="file" accept=".csv,.txt,text/csv,text/plain" disabled={!site||busy} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs" onChange={e=>{void fileSelected(e.target.files?.[0]);e.target.value=''}}/></label>
  <label className="block text-xs font-semibold">Or paste a list (CSV columns or one resident name + unit per line)<textarea value={raw} disabled={!site||busy} onChange={e=>{setRaw(e.target.value);setSource('Pasted list');setConfirmed(false);setSummary(null)}} rows={4} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" placeholder={'full_name,unit_number,vehicle_plate,vehicle_state\nJane Example,101,ABC123,VA\nJane Example,101,DEF456,VA\nJohn Example,102'}/></label>
  {!!raw.trim()&&<div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3"><p className="text-xs font-bold text-cyan-200">Preview {parsed.rows.length} valid resident row(s){source?` · ${source}`:''} · {parsed.headerDetected?'CSV header detected':'No header; using Name, Unit, Plate, State order'}</p>
   <div className="mt-2 max-h-44 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-1">Name</th><th className="p-1">Unit</th><th className="p-1">Vehicle</th><th className="p-1">Lease</th></tr></thead><tbody>{parsed.rows.slice(0,12).map((row,index)=><tr key={index}><td className="p-1">{row.full_name}</td><td className="p-1">{row.unit_number}</td><td className="p-1">{row.vehicle_plate||'—'}</td><td className="p-1">{row.lease_status||'active'}</td></tr>)}</tbody></table></div>
   {parsed.errors.length>0&&<div className="mt-2 text-xs text-amber-200"><AlertTriangle size={14} className="mr-1 inline"/>{parsed.errors.length} malformed row(s) skipped: {parsed.errors.slice(0,4).join(' · ')}</div>}
  </div>}
  <label className="flex items-start gap-2 text-xs text-amber-100"><input type="checkbox" checked={confirmed} disabled={!site||busy||!parsed.rows.length} onChange={e=>setConfirmed(e.target.checked)}/><span>I verified that these records belong to <b>{site||'the selected property'}</b>, and I am authorized to add or update this property’s residents and vehicles.</span></label>
  <button type="button" disabled={!confirmed||!site||busy||!parsed.rows.length} onClick={importRows} className="w-full rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?`Importing ${progress} / ${parsed.rows.length} rows…`:`Import ${parsed.rows.length} resident row(s) into ${site||'selected property'}`}</button>
  {error&&<p role="alert" className="rounded-lg border border-red-600 bg-red-950/40 p-3 text-xs text-red-200">{error}</p>}
  {summary&&<div role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/20 p-3 text-xs text-emerald-200"><p className="flex items-center gap-2 font-black"><CheckCircle2 size={15}/>Batch import results: {summary.processed} rows processed</p><p className="mt-1">{summary.residents_created} residents added · {summary.residents_updated} residents updated · {summary.vehicles_created} vehicles added · {summary.duplicates} existing vehicles skipped</p>{summary.errors.length>0&&<div className="mt-2 max-h-32 overflow-auto text-amber-200">{summary.errors.slice(0,20).map((e,i)=><p key={i}>{e}</p>)}{summary.errors.length>20&&<p>Plus {summary.errors.length-20} more row errors</p>}</div>}</div>}
 </section>;
}
