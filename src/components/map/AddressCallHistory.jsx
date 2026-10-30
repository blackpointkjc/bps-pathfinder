import { useEffect, useState } from 'react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
const cache = new Map();
const pending = new Map();
async function readHistory(key, input, refresh) {
  if (!refresh && cache.get(key)?.until > Date.now()) return cache.get(key).data;
  if (pending.has(key)) return pending.get(key);
  if (refresh) clearBase44ReadCacheMatching('function:getAddressCallHistory:');
  const task = base44.functions.invoke('getAddressCallHistory', input).then(response => {
    const data = response?.data || response;
    if (data.error) throw new Error(data.error);
    if (data.partial) clearBase44ReadCacheMatching("function:getAddressCallHistory:");
    if (!data.partial) cache.set(key, { data, until: Date.now() + 60000 });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return data;
  }).finally(() => pending.delete(key));
  pending.set(key, task); return task;
}
export default function AddressCallHistory({ address = '', propertyId = '', excludeCallId = '' }) {
  const [state, setState] = useState({loading:true});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState({loading:true});
    const key = JSON.stringify(['v2',address,propertyId]);
    readHistory(key,{address,propertyId,version:2},retry > 0).then(data => {if(active)setState({data});}).catch(error=>{if(active)setState({error:error.message || 'History unavailable'});});
    return () => {active=false;};
  }, [address,propertyId,retry]);
  const data=state.data;
  const calls=(data?.calls||[]).filter(call=>String(call.id)!==String(excludeCallId));
  return <section aria-label="Address call history" className="mt-3 rounded-xl border border-amber-700/60 bg-slate-950 p-3 text-sm text-white">
    <h3 className="font-bold text-amber-200">Call history · last 90 days</h3>
    {state.loading?<p role="status">Loading recorded calls…</p>:state.error?<div role="alert"><p>{state.error}</p><button type="button" onClick={()=>setRetry(n=>n+1)} className="min-h-11 underline">Retry history</button></div>:<>
      <p className="mt-1 font-bold">{data.partial?'At least ':''}{data.count} recorded calls{data.count>1?' · Repeat-call location':''}</p>
      <p className="text-xs text-slate-300">{data.scope}. {data.partial?'Some records could not be checked; this is not a complete count.':'Count is limited to records retained in Pathfinder.'}</p>
      {data.partial && <button type="button" onClick={()=>setRetry(n=>n+1)} className="min-h-11 underline">Retry missing history</button>}
      <div className="mt-2 flex flex-wrap gap-2">{Object.entries(data.types||{}).map(([type,count])=><span key={type} className="rounded border border-slate-600 px-2 py-1 text-xs">{type}: {count}</span>)}</div>
      <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Previous call details ({calls.length} shown)</summary>
        {calls.map(call=><div key={call.id} className="border-t border-slate-700 py-2"><strong>{call.incident}</strong><p>{call.location}</p><p className="text-xs text-slate-300">{new Date(call.time).toLocaleString('en-US',{timeZone:'America/New_York'})} ET · {call.status}{call.reference?' · '+call.reference:''}</p></div>)}
        {!calls.length&&<p>No previous call details found in this result.</p>}
        {data.count>data.displayed&&<p className="text-xs">Showing the most recent {data.displayed} calls.</p>}
      </details>
    </>}
  </section>;
}
