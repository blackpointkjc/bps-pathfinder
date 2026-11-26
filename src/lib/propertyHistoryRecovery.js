import {callTimestamp,isValidCallRecord} from '../../base44/functions/_shared/callFeedPolicy.js';
import {addressHistoryPattern} from '../../base44/functions/_shared/addressHistoryMatch.js';

// Read the actual alert records independently of the history function version.
// No writes, synthetic incidents or inferred clearance. Snapshot status only.
export async function recoverPropertyHistory({entities,search='',since,until,agency='ALL',status='ALL',cursor=null,pageSize=40}){
  const snapshot=cursor?.snapshot_at||new Date().toISOString();
  const end=Math.min(Date.parse(until||snapshot),Date.parse(snapshot));
  const start=Math.max(Date.parse(snapshot)-90*86400000,Date.parse(since||'')||0);
  const dateRange={$gte:new Date(start).toISOString(),$lte:new Date(end).toISOString()};
  const q=String(search).trim().toLowerCase(),pattern=addressHistoryPattern(q);
  let offset=Number(cursor?.offset)||0,done=false;
  const rows=[],seen=new Set();
  // Bounded pages; advance every raw row consumed, not only matches.
  for(let batch=0;batch<4&&!done&&rows.length<pageSize;batch++){
    const raw=await entities.PropertyAlert.filter({callTime:dateRange},'-callTime',100,offset);
    if(!Array.isArray(raw))throw Error('Property alert directory returned an invalid response');
    let used=0;
    for(const a of raw){
      if(rows.length>=pageSize)break;
      used++;
      const row={id:'property-alert:'+a.id,original_call_id:String(a.callId||''),call_id:a.cadNumber||'',incident:a.callIncident,location:a.callLocation,agency:a.agency||'BPS',status:a.callStatus||'Recorded',time_received:a.callTime||a.time_received||a.created_date,description:a.description||'',_source:'property',_propertyCall:true,_propertyAlert:a,_propertyName:a.propertyName||'',_propertyId:a.propertyId||'',_propertyLifecycle:a.lifecycle_status||'',_referenceEntity:'PropertyAlert',_referenceId:a.id};
      if(a.is_test===true||String(a.lifecycle_status).toLowerCase()==='test'||!isValidCallRecord(row))continue;
      if(callTimestamp(row)<start||callTimestamp(row)>end)continue;
      if(agency!=='ALL'&&row.agency!==agency)continue;
      if(status!=='ALL'&&row.status!==status)continue;
      if(q&&![row.call_id,row.incident,row.location,row._propertyName,row.description].some(v=>String(v||'').toLowerCase().includes(q))&&!(pattern&&new RegExp(pattern,'i').test(row.location)))continue;
      const key=row.original_call_id||row.id;
      if(seen.has(key)){const prior=rows.find(r=>(r.original_call_id||r.id)===key);prior._propertyName=[...new Set([prior._propertyName,row._propertyName].filter(Boolean))].join(' / ');continue;}
      seen.add(key);rows.push(row);
    }
    offset+=used;
    done=raw.length<100&&used===raw.length;
  }
  return {success:true,rows,has_more:!done,next_cursor:done?null:{direct_property:true,offset,snapshot_at:snapshot},scan_incomplete:!done&&rows.length<pageSize,property_recovery:true};
}
