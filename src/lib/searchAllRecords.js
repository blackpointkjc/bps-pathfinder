import {base44} from '@/api/base44Client';
const boundedSearch=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Company record search timed out. Please retry.')),45000);Promise.resolve(promise).then(resolve,reject).finally(()=>clearTimeout(timer));});
export async function searchAllRecords(payload,{onProgress,isCurrent=()=>true}={}){
 const records=new Map(),failures=new Set();let cursor=null,sources=0,warrants=0,successfulPages=0;
 do{
  if(!isCurrent())return {cancelled:true};
  let response;
  try{response=await boundedSearch(base44.functions.invoke('searchCompanyRecords',{...payload,cursor}));}
  catch(error){if(!successfulPages)throw error;failures.add(error?.message||'Remaining sources unavailable');break;}
  const data=response?.data||response||{};
  if(!Array.isArray(data.results)&&!data.error)throw Error('Record search returned an invalid response. Please retry.');
  if(data.error)throw Error(data.error);
  successfulPages+=Number(data.searched_sources)||0;
  for(const row of data.results||[])records.set(row.entity+':'+row.id,row);
  for(const label of data.failed_source_labels||[])failures.add(label);
  cursor=data.next_cursor||null;sources=data.total_sources||sources;warrants=[...records.values()].filter(r=>r.warrant_issued).length;
  if(!isCurrent())return {cancelled:true};
  onProgress?.({results:[...records.values()],source:cursor?.source??sources,total_sources:sources});
 }while(cursor);
 if(!successfulPages)throw Error('No authorized record sources could be searched. Please retry.');
 const order={reference:0,person:1,vehicle:2,location:3,'report text':4};
 const sorted=[...records.values()].sort((a,b)=>(order[a.match_context]??5)-(order[b.match_context]??5)||String(b.date||'').localeCompare(String(a.date||'')));
 return {results:sorted,total_matches:records.size,partial:failures.size>0,failed_source_labels:[...failures],warrant_matches:warrants};
}
