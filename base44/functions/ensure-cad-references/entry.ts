import { createClientFromRequest } from 'npm:@base44/sdk';
const valid=(value:any)=>{const text=String(value||'').trim();return !!text&&!/^[a-f0-9]{24}$/i.test(text)&&!/^property-alert-|^web-|^https?:|^[a-f0-9]{48,}$/i.test(text)&&/^(?:BPS-\d{6}-\d{1,8}|CAD[- ]|[A-Z]{0,6}[- ]?\d{3,})/i.test(text);};
const ref=(row:any)=>[row?.agency_cad_number,row?.bps_reference,row?.cadNumber,row?.call_number,row?.call_id].find(valid)||'';
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const collections=['DispatchCall','CallHistory','PropertyAlert','PropertyCallLink'];
const keys=(entity:string,row:any)=>{
 const id=entity==='PropertyAlert'?row.callId:entity==='PropertyCallLink'?row.call_id:row.original_call_id||row.id;
 const stamp=row.time_received||row.callTime,incident=row.incident||row.callIncident,location=row.location||row.callLocation;
 return [id&&'id:'+id,row.external_call_id&&'external:'+row.external_call_id,stamp&&incident&&location&&'event:'+JSON.stringify([stamp,String(incident).trim().toUpperCase(),String(location).trim().toUpperCase()])].filter(Boolean);
};
async function reserve(api:any,count:number){
 if(!count)return [];
 const entity=api.asServiceRole.entities.CadCounter;
 let lease=(await entity.filter({counter_key:'dispatch_call'},undefined,1))[0];
 if(!lease)lease=await entity.create({counter_key:'dispatch_call',last_number:0});
 const now=Date.now();
 if(new Date(lease.ingestion_locked_until||0).getTime()>now)throw Object.assign(Error('CAD source synchronization is in progress'),{status:409});
 const token=crypto.randomUUID();
 await entity.update(lease.id,{ingestion_lock_token:token,ingestion_locked_until:new Date(now+15000).toISOString()});
 await pause(500);
 const verified=(await entity.filter({counter_key:'dispatch_call'},undefined,1))[0];
 if(verified?.ingestion_lock_token!==token)throw Object.assign(Error('CAD reference allocation will retry'),{status:409});
 try{
  const period=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).format(new Date()).replace(/\D/g,'');
  const counterKey='bps_dispatch_call:'+period;
  let counter=(await entity.filter({counter_key:counterKey},undefined,1))[0];
  if(!counter)counter=await entity.create({counter_key:counterKey,last_number:0});
  const first=Number(counter.last_number||0)+1,last=first+count-1;
  if(last>99999999)throw Error('CAD reference sequence is full');
  await entity.update(counter.id,{last_number:last});
  return Array.from({length:count},(_,i)=>`BPS-${period}-${first+i}`);
 }finally{
  await entity.update(lease.id,{ingestion_lock_token:'',ingestion_locked_until:new Date(0).toISOString()});
 }
}
Deno.serve(async req=>{
 try{
  const api=createClientFromRequest(req),actor=await api.auth.me();
  const roles=new Set([actor?.role,...(actor?.additional_roles||[])].map((v:any)=>String(v||'').toLowerCase()));
  if(!actor||!['admin','dispatch','dispatcher','cad_access','full_access','supervisor'].some(role=>roles.has(role))&&!actor.dispatch_role)return Response.json({error:'CAD access required'},{status:403});
  const body=await req.json().catch(()=>({}));
  if(body.action==='allocate')return Response.json({success:true,references:await reserve(api,1)});
  const selected=Array.isArray(body.records)?body.records.slice(0,60):[];
  const rows:any[]=[];
  for(const entity of collections){
   const ids=selected.filter((r:any)=>r.entity===entity).map((r:any)=>String(r.id||'')).filter(Boolean);
   if(ids.length)for(const row of await api.asServiceRole.entities[entity].filter({id:{$in:ids}},'-created_date',100))rows.push({entity,row});
  }
  // Read original counterparts once, so a surviving archive/property alert reuses
  // its already assigned CAD number instead of receiving a second number.
  const identities=[...new Set(rows.flatMap(({entity,row})=>keys(entity,row).filter((key:any)=>String(key).startsWith('id:')).map((key:any)=>String(key).slice(3))))];
  const related:any[]=[];
  if(identities.length){
   for(const [entity,field] of [['DispatchCall','id'],['CallHistory','original_call_id'],['PropertyAlert','callId'],['PropertyCallLink','call_id']]){
    const found=await api.asServiceRole.entities[entity].filter({[field]:{$in:identities}},'-created_date',150);
    for(const row of found)related.push({entity,row});
   }
  }
  const known=new Map<string,string>();
  for(const {entity,row} of [...related,...rows])if(ref(row))for(const key of keys(entity,row))known.set(key,ref(row));
  const groups=new Map<string,{reference:string;items:any[]}>();
  for(const item of rows){
   if(ref(item.row))continue;
   const aliases=keys(item.entity,item.row),key=aliases[0]||item.entity+':'+item.row.id;
   let group=[...groups.values()].find(g=>g.items.some(other=>keys(other.entity,other.row).some((v:any)=>aliases.includes(v))));
   if(!group){group={reference:aliases.map((key:any)=>known.get(key)).find(Boolean)||'',items:[]};groups.set(key,group);}
   group.items.push(item);
  }
  const missing=[...groups.values()].filter(g=>!g.reference),allocated=await reserve(api,missing.length);
  missing.forEach((g,i)=>g.reference=allocated[i]);
  const mappings:any[]=[],failures:any[]=[];
  for(const group of groups.values())for(const {entity,row} of group.items){
   try{
    const updates=entity==='PropertyAlert'?{cadNumber:group.reference}:entity==='PropertyCallLink'?{call_number:group.reference}:{bps_reference:group.reference,...(!valid(row.call_id)?{call_id:group.reference}:{})};
    const saved=await api.asServiceRole.entities[entity].update(row.id,updates);
    if(ref(saved)!==group.reference)throw Error('Reference save could not be verified');
    mappings.push({entity,id:row.id,reference:group.reference});
   }catch(error:any){failures.push({entity,id:row.id,error:error?.message||'Reference save failed'});if(/rate.limit|429/i.test(String(error?.message||'')))break;}
  }
  return Response.json({success:!failures.length,mappings,failures});
 }catch(error:any){return Response.json({error:error?.message||'Unable to assign CAD references',retryable:[409,429].includes(Number(error?.status||error?.response?.status))},{status:Number(error?.status||error?.response?.status)||500});}
});
