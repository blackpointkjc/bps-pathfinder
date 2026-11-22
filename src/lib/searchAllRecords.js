import {base44} from '@/api/base44Client';
export async function searchAllRecords(payload,{onProgress,isCurrent=()=>true}={}){
 const records=new Map(),failures=new Set();let cursor=null,sources=0,warrants=0;
 do{
  if(!isCurrent())return {cancelled:true};
  const response=await base44.functions.invoke('searchCompanyRecords',{...payload,cursor});
  const data=response?.data||{};
  if(data.error)throw Error(data.error);
  for(const row of data.results||[])records.set(row.entity+':'+row.id,row);
  for(const label of data.failed_source_labels||[])failures.add(label);
  cursor=data.next_cursor||null;sources=data.total_sources||sources;warrants=[...records.values()].filter(r=>r.warrant_issued).length;
  if(!isCurrent())return {cancelled:true};
  onProgress?.({results:[...records.values()],source:cursor?.source??sources,total_sources:sources});
 }while(cursor);
 return {results:[...records.values()],total_matches:records.size,partial:failures.size>0,failed_source_labels:[...failures],warrant_matches:warrants};
}
