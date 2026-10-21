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
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const period=parts.find(p=>p.type==='year')!.value+parts.find(p=>p.type==='month')!.value;
 const counterKey='bps_dispatch_call:'+period;
 let counter=(await entity.filter({counter_key:counterKey},undefined,1))[0];
 if(!counter)counter=await entity.create({counter_key:counterKey,last_number:0});
 const now=Date.now();
 if(new Date(counter.ingestion_locked_until||0).getTime()>now)throw Object.assign(Error('CAD reference allocation is in progress'),{status:409});
 const token=crypto.randomUUID();
 await entity.update(counter.id,{ingestion_lock_token:token,ingestion_locked_until:new Date(now+15000).toISOString()});
 await pause(500);
 const verified=(await entity.filter({counter_key:counterKey},undefined,1))[0];
 if(verified?.ingestion_lock_token!==token)throw Object.assign(Error('CAD reference allocation will retry'),{status:409});
 const first=Number(verified.last_number||0)+1,last=first+count-1;
 if(last>99999999)throw Error('CAD reference sequence is full');
 // Reserve the range and release only the number-allocation lease. Public feed
 // fetching/geocoding cannot hold a manual CAD entry or a historical repair.
 await entity.update(counter.id,{last_number:last,ingestion_lock_token:'',ingestion_locked_until:new Date(0).toISOString()});
 return Array.from({length:count},(_,i)=>`BPS-${period}-${first+i}`);
}
Deno.serve(async req=>{
 let migration:any=null,migrationApi:any=null;
 try{
  const api=createClientFromRequest(req),actor=await api.auth.me().catch(()=>null);
  const roles=new Set([actor?.role,...(actor?.additional_roles||[])].map((v:any)=>String(v||'').toLowerCase()));
  let trustedService=false;
  if(!actor&&req.headers.get('Authorization')){try{await api.entities.CadCounter.filter({counter_key:'dispatch_call'},undefined,1);trustedService=true;}catch{}}
  if(!trustedService&&(!actor||!['admin','dispatch','dispatcher','cad_access','full_access','supervisor'].some(role=>roles.has(role))&&!actor.dispatch_role))return Response.json({error:'CAD access required'},{status:403});
  const body=await req.json().catch(()=>({}));
  if(body.action==='status'){const counts:any={};for(const entity of collections)counts[entity]=await api.asServiceRole.entities[entity].count();return Response.json({counts});}
  if(body.action==='allocate')return Response.json({success:true,references:await reserve(api,Math.max(1,Math.min(100,Number(body.count)||1)))});
  const selected=Array.isArray(body.records)?body.records.slice(0,500):[];
  const rows:any[]=[];
  let scanPage:any[]=[],scanStage=0,scanEntity='';
  if(body.action==='backfill'){
   const counters=api.asServiceRole.entities.CadCounter;
   let state=(await counters.filter({counter_key:'cad_reference_backfill_v2'},undefined,1))[0];
   if(!state)state=await counters.create({counter_key:'cad_reference_backfill_v2',last_number:0,migration_stage:0,migration_cursor:'',migration_complete:false,migration_updated:0});
   if(state.migration_complete)return Response.json({success:true,done:true,scanned:state.last_number,updated:state.migration_updated,mappings:[]});
   if(new Date(state.ingestion_locked_until||0).getTime()>Date.now())return Response.json({error:'Historical CAD reference batch is in progress',retryable:true},{status:409});
   const token=crypto.randomUUID();
   await counters.update(state.id,{ingestion_lock_token:token,ingestion_locked_until:new Date(Date.now()+60000).toISOString()});
   await pause(250);
   const verified=(await counters.filter({counter_key:'cad_reference_backfill_v2'},undefined,1))[0];
   if(verified?.ingestion_lock_token!==token)return Response.json({error:'Historical reference batch will retry',retryable:true},{status:409});
   migration=verified;migrationApi=api;
   scanStage=Number(verified.migration_stage||0);
   scanEntity=['CallHistory','PropertyAlert','DispatchCall','PropertyCallLink'][scanStage];
   if(!scanEntity){await counters.update(state.id,{migration_complete:true});return Response.json({success:true,done:true,mappings:[]});}
   scanPage=verified.migration_cursor?await api.asServiceRole.entities[scanEntity].filter({id:{$gt:verified.migration_cursor}},'id',500):await api.asServiceRole.entities[scanEntity].list('id',500);
   for(const row of scanPage)rows.push({entity:scanEntity,row});
  }

  for(const entity of collections){
   const ids=selected.filter((r:any)=>r.entity===entity).map((r:any)=>String(r.id||'')).filter((id:string)=>/^[a-f0-9]{24}$/i.test(id));
   if(ids.length)for(const row of await api.asServiceRole.entities[entity].filter({id:{$in:ids}},'-created_date',500))rows.push({entity,row});
  }
  // Read original counterparts once, so a surviving archive/property alert reuses
  // its already assigned CAD number instead of receiving a second number.
  const identities=[...new Set(rows.filter(item=>!ref(item.row)).flatMap(({entity,row})=>keys(entity,row).filter((key:any)=>String(key).startsWith('id:')).map((key:any)=>String(key).slice(3))))];
  const related:any[]=[];
  if(identities.length){
   for(const [entity,field] of [['DispatchCall','id'],['CallHistory','original_call_id'],['PropertyAlert','callId'],['PropertyCallLink','call_id']]){
    const values=field==='id'?identities.filter(id=>/^[a-f0-9]{24}$/i.test(id)):identities;
    if(!values.length)continue;
    const found=await api.asServiceRole.entities[entity].filter({[field]:{$in:values}},'-created_date',1000);
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
  const mappings:any[]=migration?[]:rows.filter(item=>ref(item.row)).map(item=>({entity:item.entity,id:item.row.id,reference:ref(item.row)})),failures:any[]=[];
  const updatesByEntity=new Map<string,any[]>();
  for(const group of groups.values())for(const {entity,row} of group.items){
   const updates=entity==='PropertyAlert'?{cadNumber:group.reference}:entity==='PropertyCallLink'?{call_number:group.reference}:{bps_reference:group.reference,...(!valid(row.call_id)?{call_id:group.reference}:{})};
   if(!updatesByEntity.has(entity))updatesByEntity.set(entity,[]);
   updatesByEntity.get(entity)!.push({id:row.id,...updates});
  }
  for(const [entity,updates] of updatesByEntity){
   const service=api.asServiceRole.entities[entity];
   const saved=typeof service.bulkUpdate==='function'?await service.bulkUpdate(updates):await Promise.all(updates.map(update=>service.update(update.id,Object.fromEntries(Object.entries(update).filter(([key])=>key!=='id')))));
   const persisted=Array.isArray(saved)?saved:saved?.data;
   if(!Array.isArray(persisted))throw Error('CAD reference batch did not return verified records');
   const byId=new Map(persisted.map((row:any)=>[String(row.id),row]));
   for(const update of updates){
    const expected=ref(update),row=byId.get(String(update.id));
    if(!row||ref(row)!==expected)throw Error('CAD reference save could not be verified for '+update.id);
    mappings.push({entity,id:update.id,reference:expected});
   }
  }
  if(migration){
   const nextStage=scanPage.length<500?scanStage+1:scanStage;
   const cursor=scanPage.length<500?'':String(scanPage[scanPage.length-1].id);
   const scanned=Number(migration.last_number||0)+scanPage.length,updated=Number(migration.migration_updated||0)+mappings.length,done=nextStage>=4;
   await api.asServiceRole.entities.CadCounter.update(migration.id,{migration_stage:nextStage,migration_cursor:cursor,last_number:scanned,migration_updated:updated,migration_complete:done});
   return Response.json({success:true,done,scanned,updated,entity:scanEntity,mappings,failures});
  }
  return Response.json({success:true,mappings,failures});
 }catch(error:any){return Response.json({error:error?.message||'Unable to assign CAD references',retryable:[409,429].includes(Number(error?.status||error?.response?.status))},{status:Number(error?.status||error?.response?.status)||500});}
 finally{if(migration&&migrationApi)await migrationApi.asServiceRole.entities.CadCounter.update(migration.id,{ingestion_lock_token:'',ingestion_locked_until:new Date(0).toISOString()}).catch(()=>null);}
});
