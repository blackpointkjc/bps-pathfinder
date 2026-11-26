const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { addressHistoryPattern } from './addressHistoryMatch.js';
import { callTimestamp, isValidCallRecord } from './callFeedPolicy.js';
import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||user.termination_date||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const validCad = (value:any) => {const text=String(value||'').trim();return !!text&&!/^[a-f0-9]{24}$/i.test(text)&&!/^property-alert-|^web-|^https?:|^[a-f0-9]{48,}$/i.test(text)&&/^(?:BPS-\d{6}-\d{1,8}|CAD[- ]|[A-Z]{0,6}[- ]?\d{3,})/i.test(text);};
const cadRef = (row:any) => [row?.agency_cad_number,row?.bps_reference,row?.cadNumber,row?.call_number,row?.call_id].find(validCad)||'';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function readWithRetry<T>(label: string, loader: () => Promise<T>, fallback: T, maxAttempts = 1): Promise<{ data: T; error: string }> {
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return { data: await loader(), error: '' };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) await wait(250 * (attempt + 1));
    }
  }
  const message = `${label} unavailable: ${lastError?.message || lastError || 'unknown error'}`;
  console.warn(message);
  return { data: fallback, error: message };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const allowed = roles.has('officer') || user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role) || roles.has('cad_access') || roles.has('full_access') || roles.has('dispatch') || roles.has('supervisor') || (user.is_supervisor === true || ['corporal','first sergeant','sergeant','sgt','lieutenant','lt','lt colonel','lt col','lieutenant colonel','captain','major','colonel'].includes(String(user.rank || '').toLowerCase().replace(/[.]/g, '').trim()));
    if (!allowed || ['client','student','visitor'].some(role=>roles.has(role)||lower(user.user_type)===role||lower(user.role)===role)) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const input=await req.json().catch(()=>({}));
    // Fetch optional linked reports and assignments only for an expanded call.
    // The history table itself no longer needs six expensive enrichment reads.
    if(input.action==='call_details'){
      const id=String(input.call_id||'').trim().slice(0,100);
      const number=String(input.call_number||'').trim().slice(0,100);
      if(!id)return Response.json({error:'Call id required'},{status:400});
      const db=base44.asServiceRole.entities;
      if(roles.has('client')||roles.has('student')||['client','student'].includes(lower(user.user_type)))return Response.json({error:'CAD access required'},{status:403});
      const [live,archives,archiveById]=await Promise.all([
        readWithRetry('Original call',()=>db.DispatchCall.get(id),null),
        readWithRetry('Archived call',()=>db.CallHistory.filter({original_call_id:id},'-archived_date',10),[]),
        readWithRetry('Archive record',()=>db.CallHistory.get(id),null)
      ]);
      const archived=(archives.data||[])[0]||archiveById.data;
      const call=live.data||archived;
      if(!call)return Response.json({error:'Original or archived CAD record unavailable'},{status:404});
      const ids=[...new Set([live.data?.id,archived?.original_call_id,archived?.id].filter(Boolean).map(String))];
      const filter={call_id:{$in:ids}};
      const readPages=async(entity:any,sort:string)=>{
        const out:any[]=[];
        for(let skip=0;skip<2000;skip+=200){
          const page=await entity.filter(filter,sort,200,skip);
          if(!Array.isArray(page))throw Error('Invalid record response');
          out.push(...page);if(page.length<200)return out;
        }
        throw Error('Activity exceeds 2000 records; contact administrator for full export');
      };
      const [links,assignments,notes,logs]=await Promise.all([
        readWithRetry('Linked reports',()=>readPages(db.ReportCallLink,'-linked_at'),[]),
        readWithRetry('Assigned units',()=>readPages(db.CallAssignment,'-assigned_at'),[]),
        readWithRetry('Officer and dispatch notes',()=>readPages(db.CallNote,'-created_date'),[]),
        readWithRetry('CAD status activity',()=>readPages(db.CallStatusLog,'-created_date'),[])
      ]);
      const actorIds=[...new Set([...assignments.data.map(a=>a.unit_id),...notes.data.map(n=>n.author_id),...logs.data.map(l=>l.unit_id)].filter(Boolean).map(String))];
      const [units,sessions]=await Promise.all([
        readWithRetry('Unit names',()=>actorIds.length?db.Unit.filter({id:{$in:actorIds}},'-last_update_at',500):Promise.resolve([]),[]),
        readWithRetry('Session names',()=>actorIds.length?db.ActiveOfficer.filter({id:{$in:actorIds}},'-created_date',500):Promise.resolve([]),[])
      ]);
      const peopleIds=[...new Set([...actorIds,...units.data.map(u=>u.user_id)].filter(Boolean).map(String))];
      const emails=[...new Set([...actorIds.filter(id=>id.includes('@')),...sessions.data.map(u=>u.officer_email)].filter(Boolean))];
      const people=await readWithRetry('Officer names',()=>peopleIds.length?db.User.filter({$or:[{id:{$in:peopleIds}},{email:{$in:emails}}]},'-updated_date',500):Promise.resolve([]),[]);
      const label=(key:any,fallback='')=>{
        const unit=units.data.find(u=>String(u.id)===String(key)),session=sessions.data.find(u=>String(u.id)===String(key));
        const person=people.data.find(u=>String(u.id)===String(unit?.user_id||key)||lower(u.email)===lower(session?.officer_email||key));
        return fallback||[person?.unit_number?'Unit '+person.unit_number:'',person?.rank,person?.last_name||person?.full_name].filter(Boolean).join(' ')||unit?.label||session?.officer_name||'Officer not identified';
      };
      const timestamp=(v:any)=>{const raw=String(v||'');return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)?raw:raw+'Z');};
      const timeline=[
        ...notes.data.map(n=>({id:'note-'+n.id,kind:'note',title:n.note_type==='clear'?'Clearance note':'Officer / dispatch note',actor:label(n.author_id,n.author_name),text:n.note,at:n.created_date})),
        ...logs.data.map(l=>({id:'log-'+l.id,kind:'activity',title:String(l.event_type||l.new_status||'CAD update').replace(/_/g,' '),actor:label(l.unit_id,l.unit_name||(!l.unit_id?'CAD / Dispatch':'')),text:[l.old_status&&l.new_status&&l.old_status!==l.new_status?l.old_status+' → '+l.new_status:'',l.notes,l.announcement_text].filter(Boolean).join(' · '),at:l.created_date})),
        ...assignments.data.flatMap(a=>[['assigned_at','Assigned'],['accepted_at','Acknowledged'],['cleared_at','Unit cleared']].filter(([field])=>a[field]).map(([field,title])=>({id:'assignment-'+a.id+'-'+field,kind:'assignment',title,actor:label(a.unit_id),text:field==='cleared_at'?a.description||'':a.role||'',at:a[field]}))),
        ...[['time_received','Call received'],['time_dispatched','Dispatched'],['time_enroute','En route'],['time_on_scene','On scene'],['time_cleared','Call cleared'],['time_closed','Call closed']].filter(([field])=>call[field]).map(([field,title])=>({id:'call-'+field,kind:'record',title,actor:'CAD record',text:'',at:call[field]}))
      ].sort((a,b)=>(timestamp(a.at)||0)-(timestamp(b.at)||0));
      const linked=links.data.filter(row=>lower(row.status||'active')!=='detached').map(row=>({id:row.id,report_id:row.report_id,report_type:row.report_type,report_number:row.report_number||row.report_id,call_number:row.call_number||cadRef(call)||number,linked_at:row.linked_at}));
      return Response.json({success:true,linked_reports:linked,assignments:assignments.data.map(row=>({unit_id:row.unit_id,label:label(row.unit_id),role:row.role,status:row.status,assigned_at:row.assigned_at,accepted_at:row.accepted_at,cleared_at:row.cleared_at,description:row.description})),timeline,disposition:call.disposition||'',narrative:call.description||'',note_count:notes.data.length,log_count:logs.data.length,warnings:[links.error,assignments.error,notes.error,logs.error,units.error,sessions.error,people.error].filter(Boolean)});
    }
    const search=String(input.search||'').trim().slice(0,160);
    const addressPattern=addressHistoryPattern(search);
    const pageSize=Math.max(25,Math.min(100,Math.floor(Number(input.page_size)||75)));
    const cursor=input.cursor||{};
    const snapshotMs=Math.min(Date.now(),Date.parse(cursor.snapshot_at||'')||Date.now());
    const snapshot=new Date(snapshotMs).toISOString();
    const since=new Date(Math.max(snapshotMs-90*86400000,Math.min(snapshotMs,Date.parse(input.since||'')||0))).toISOString();
    const until=new Date(Math.min(snapshotMs,Date.parse(input.until||'')||snapshotMs)).toISOString();
    const db=base44.asServiceRole.entities;
    const dateRange={$gte:since,$lte:until};
    const states:any={
      active:{entity:db.DispatchCall,field:'time_received',offset:Math.max(0,Math.floor(Number(cursor.active)||0)),buffer:[],done:cursor.active_done===true,error:''},
      archived:{entity:db.CallHistory,field:'time_received',offset:Math.max(0,Math.floor(Number(cursor.archived)||0)),buffer:[],done:cursor.archived_done===true,error:''},
      property:{entity:db.PropertyAlert,field:'callTime',offset:Math.max(0,Math.floor(Number(cursor.property)||0)),buffer:[],done:cursor.property_done===true,error:''}
    };
    // A raw cursor advances for every database row examined, including rows
    // rejected by search, date/status filters, validation or deduplication.
    // Buffered, unconsumed rows are fetched again from their exact offset.
    const asProperty=(alert:any)=>({
      id:'property-alert:'+alert.id,original_call_id:String(alert.callId||''),call_id:alert.cadNumber||'',
      bps_reference:/^BPS-/i.test(String(alert.cadNumber||''))?alert.cadNumber:'',
      incident:alert.callIncident||'Property alert',location:alert.callLocation||'',
      time_received:alert.callTime||alert.time_received||alert.created_date,agency:'BPS',
      status:alert.callStatus||alert.lifecycle_status||'Recorded',is_test:alert.is_test,
      _source:'property',_propertyCall:true,_propertyAlert:alert,_propertyName:alert.propertyName||'',
      _propertyId:alert.propertyId||'',_propertyLifecycle:alert.lifecycle_status||'',
      _referenceEntity:'PropertyAlert',_referenceId:String(alert.id)
    });
    const matchesFilters=(row:any)=>{
      const timestamp=callTimestamp(row);
      if(timestamp<Date.parse(since)||timestamp>Date.parse(until))return false;
      if(input.agency&&input.agency!=='ALL'&&row.agency!==input.agency)return false;
      const status=row.time_cleared?'Cleared':row.time_on_scene&&!['cleared','closed','cancelled','canceled','completed','resolved'].includes(lower(row.status))?'On Scene':row.status;
      if(input.status&&input.status!=='ALL'&&status!==input.status)return false;
      if(!search)return true;
      return ['call_id','bps_reference','agency_cad_number','incident','location','original_call_id','agency','_propertyName'].some(field=>lower(row[field]).includes(lower(search)))||Boolean(addressPattern&&new RegExp(addressPattern,'i').test(String(row.location||'')));
    };
    const selected:any[]=[];
    const seen=new Set<string>();
    let scanned=0,reads=0;
    const batchSize=pageSize+1;
    const scanLimit=Math.max(1000,batchSize*12);
    const warnings:string[]=[];
    const fill=async(key:string)=>{
      const state=states[key];
      if(state.done||state.error||state.buffer.length)return;
      if(state.end){state.done=true;return;}
      const result=await readWithRetry(key+' call history',()=>state.entity.filter({[state.field]:dateRange},'-'+state.field,batchSize,state.offset),[]);
      reads++;
      if(result.error){state.error=result.error;return;}
      const raw=result.data||[];
      state.end=raw.length<batchSize;
      // Only use a property-alert row as history when neither the live nor
      // archived original exists anywhere, not merely outside this page.
      if(key==='property'&&raw.length){
        const refs=[...new Set(raw.map((r:any)=>String(r.callId||'')).filter(Boolean))];
        const [live,archived]=await Promise.all([
          readWithRetry('Property original calls',()=>refs.length?db.DispatchCall.filter({id:{$in:refs}},'-time_received',batchSize):Promise.resolve([]),[]),
          readWithRetry('Property archived calls',()=>refs.length?db.CallHistory.filter({original_call_id:{$in:refs}},'-time_received',batchSize):Promise.resolve([]),[])
        ]);
        if(live.error||archived.error){state.error=live.error||archived.error;return;}
        const linked=new Set([...live.data.map(r=>String(r.id)),...archived.data.map(r=>String(r.original_call_id))]);
        state.buffer=raw.map((r:any)=>({row:asProperty(r),skip:linked.has(String(r.callId||''))}));
      }else if(key==='archived'&&raw.length){
        const refs=[...new Set(raw.map((r:any)=>String(r.original_call_id||'')).filter(Boolean))];
        const live=await readWithRetry('Archive duplicate check',()=>refs.length?db.DispatchCall.filter({id:{$in:refs}},'-time_received',batchSize):Promise.resolve([]),[]);
        if(live.error)warnings.push(live.error);
        const linked=new Set(live.data.map(r=>String(r.id)));
        state.buffer=raw.map((r:any)=>({row:r,skip:linked.has(String(r.original_call_id||''))}));
      }else state.buffer=raw.map((row:any)=>({row,skip:false}));
      if(!state.buffer.length)state.done=true;
    };
    while(selected.length<pageSize&&scanned<scanLimit&&reads<42){
      await Promise.all(Object.keys(states).map(fill));
      if(states.active.error&&states.archived.error)throw Error('Both active and archived call sources are temporarily unavailable.');
      const heads=Object.entries(states).filter(([,v]:any)=>v.buffer.length).map(([source,v]:any)=>({source,...v.buffer[0]}));
      if(!heads.length)break;
      heads.sort((a,b)=>callTimestamp(b.row)-callTimestamp(a.row)||['active','archived','property'].indexOf(a.source)-['active','archived','property'].indexOf(b.source));
      const item=heads[0],state=states[item.source];
      state.buffer.shift();state.offset++;scanned++;
      if(!state.buffer.length&&state.end)state.done=true;
      const row=item.row;
      if(item.skip||!isValidCallRecord(row)||!matchesFilters(row))continue;
      const identity=String(row.original_call_id||row.id);
      if(seen.has(identity))continue;
      seen.add(identity);selected.push(item);
    }
    const activeRead={error:states.active.error},archivedRead={error:states.archived.error};
    const propertyRows=selected.filter(item=>item.source==='property').map(item=>item.row);
    const active:any[] = selected.filter(item=>item.source==='active').map(item=>item.row);
    const archived:any[] = selected.filter(item=>item.source==='archived').map(item=>item.row);
    const ids = [...new Set(selected.flatMap(({row})=>[String(row.id||''),String(row.original_call_id||'')]).filter(Boolean))];
    const numbers = [...new Set(selected.map(({row})=>String(cadRef(row)||'')).filter(Boolean))];
    const callFilter = { call_id: { $in: ids } };
    // Only enrich this page. The former global reads fetched 8,000+ unrelated rows.
    // Live CAD / Call History must paint quickly under Base44 API limits.
    // Extra joins are optional. The full audit/enrichment path remains
    // available with include_details:true, but default history returns the
    // authoritative core records using no extra cross-entity roundtrips.
    const includeDetails=input.include_details===true;
    const emptyRead={data:[],error:''};
    // Property history is core CAD data, not an optional detail join.
    // The old normal list path set alertRead to [] when include_details=false,
    // making every property call disappear from the Property tab.
    const [alertRead,propertyLinksRead] = await Promise.all([
      readWithRetry('Property alerts',()=>ids.length?db.PropertyAlert.filter({callId:{$in:ids}},'-created_date',500):Promise.resolve([]),[]),
      readWithRetry('Manual property links',()=>ids.length?db.PropertyCallLink.filter({$or:[{call_id:{$in:ids}},{archive_id:{$in:ids}}]},'-linked_at',500):Promise.resolve([]),[])
    ]);
    const [assignmentRead,linkedRead] = includeDetails ? await Promise.all([
      readWithRetry('Call assignments',()=>ids.length?base44.asServiceRole.entities.CallAssignment.filter(callFilter,'-assigned_at',300):Promise.resolve([]),[]),
      readWithRetry('Linked reports',()=>ids.length?base44.asServiceRole.entities.ReportCallLink.filter({$or:[callFilter,{call_number:{$in:numbers}}]},'-linked_at',300):Promise.resolve([]),[])
    ]) : [emptyRead,emptyRead];
    const alerts:any[] = alertRead.data || [];
    const unitIds = [...new Set([
      ...(assignmentRead.data||[]).map((row:any)=>String(row.unit_id||'')),
      ...selected.flatMap(({row})=>Array.isArray(row.assigned_units)?row.assigned_units.map(String):[]),
    ].filter(Boolean))];
    const unitRead = includeDetails ? await readWithRetry('CAD units',()=>unitIds.length?base44.asServiceRole.entities.Unit.filter({id:{$in:unitIds}},'-last_update_at',300):Promise.resolve([]),[]) : emptyRead;
    const userIds = [...new Set([...unitIds,...(unitRead.data||[]).map((row:any)=>String(row.user_id||''))].filter(Boolean))];
    const emails = (unitRead.data||[]).map((row:any)=>String(row.user_email||row.email||'')).filter(Boolean);
    const userRead = includeDetails ? await readWithRetry('Assigned officers',()=>userIds.length?base44.asServiceRole.entities.User.filter({$or:[{id:{$in:userIds}},{email:{$in:emails}}]},'-updated_date',300):Promise.resolve([]),[]) : emptyRead;
    const hasMore=Object.values(states).some((state:any)=>!state.done&&!state.error);
    const nextCursor=hasMore?{snapshot_at:snapshot,...Object.fromEntries(Object.entries(states).flatMap(([key,state]:any)=>[[key,state.offset],[key+'_done',state.done||!!state.error]]))}:null;
    const linksByCall=new Map<string,any[]>();
    for(const link of linkedRead.data||[]){
      if(String(link.status||'active').toLowerCase()==='detached')continue;
      for(const key of [String(link.call_id||''),String(link.call_number||'')]){
        if(!key)continue;
        if(!linksByCall.has(key))linksByCall.set(key,[]);
        if(!linksByCall.get(key)!.some((row:any)=>row.id===link.id))linksByCall.get(key)!.push(link);
      }
    }
    const linkedReports=(id:string,number:string)=>{
      const combined=[...(linksByCall.get(String(id||''))||[]),...(linksByCall.get(String(number||''))||[])];
      return [...new Map(combined.map((row:any)=>[String(row.id),{id:row.id,report_id:row.report_id,report_type:row.report_type,report_number:row.report_number||row.report_id,call_number:row.call_number,linked_at:row.linked_at}])).values()];
    };

    const usersById = new Map((userRead.data || []).map((person: any) => [String(person.id), person]));
    const officersByEmail=new Map((userRead.data||[]).map((person:any)=>[String(person.email||'').toLowerCase(),person]));
    const officersByNumber=new Map((userRead.data||[]).filter((p:any)=>p.unit_number).map((person:any)=>[String(person.unit_number||'').replace(/^0+/,''),person]));
    const unitsById = new Map((unitRead.data || []).map((unit: any) => [String(unit.id), unit]));
    const assignmentsByCall = new Map<string, any[]>();
    for (const assignment of assignmentRead.data || []) {
      const id = String(assignment.call_id || '');
      if (!id) continue;
      if (!assignmentsByCall.has(id)) assignmentsByCall.set(id, []);
      assignmentsByCall.get(id)!.push(assignment);
    }
    const assignmentDetails = (callId: string, existing: any[] = []) => {
      const records = assignmentsByCall.get(callId) || [];
      const ids = [...new Set([...existing.map(String), ...records.map((item: any) => String(item.unit_id || ''))].filter(Boolean))];
      return ids.map(id => {
        const unit = unitsById.get(id);
        const officer = usersById.get(String(unit?.user_id || id))
          ||officersByEmail.get(String(unit?.user_email||unit?.email||'').toLowerCase())
          ||officersByNumber.get(String(unit?.unit_number||'').replace(/^0+/,''))
          ||(userRead.data||[]).find((u:any)=>String(u.username||'').toLowerCase()===String(unit?.officer_name||'').toLowerCase());
        const number = officer?.unit_number || unit?.unit_number || '';
        const name = [officer?.rank||'Officer', officer?.last_name||String(officer?.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ');
        const label = [number ? 'Unit ' + number : '', name||'Officer not identified'].filter(Boolean).join(' — ');
        const assignment = records.find((item: any) => String(item.unit_id) === id);
        return { unit_id: id, label, officer_name: name || '', unit_number: number, role: assignment?.role || '', assigned_at: assignment?.assigned_at || '', status: assignment?.status || '' };
      });
    };
    const propertyFingerprint = (time: any, incident: any, location: any) => [
      String(time || ''),
      String(incident || '').trim().toUpperCase(),
      String(location || '').trim().toUpperCase(),
    ].join('|');

    const alertByCallId = new Map<string, any>();
    const alertByFingerprint = new Map<string, any>();
    for (const alert of alerts || []) {
      if (!alert?.callId) continue;
      const key = String(alert.callId);
      const prior = alertByCallId.get(key);
      const currentStamp = new Date(alert.created_date || 0).getTime();
      const priorStamp = new Date(prior?.created_date || 0).getTime();
      const hasTime = Boolean(alert.callTime || alert.time_received);
      const priorHasTime = Boolean(prior?.callTime || prior?.time_received);
      if (!prior || (hasTime && !priorHasTime) || (hasTime === priorHasTime && currentStamp > priorStamp)) alertByCallId.set(key, alert);
      const fp = propertyFingerprint(alert.callTime || alert.time_received, alert.callIncident, alert.callLocation);
      if (fp && !fp.startsWith('|')) {
        const priorFp = alertByFingerprint.get(fp);
        const priorFpStamp = new Date(priorFp?.created_date || 0).getTime();
        if (!priorFp || currentStamp > priorFpStamp) alertByFingerprint.set(fp, alert);
      }
    }

    const decorate = (row: any, source: 'active' | 'archived') => {
      const directOriginalId = source === 'archived' ? String(row.original_call_id || '') : String(row.id || '');
      const fingerprintAlert = source === 'archived'
        ? alertByFingerprint.get(propertyFingerprint(row.time_received || row.created_date, row.incident, row.location))
        : null;
      const alert = (directOriginalId ? alertByCallId.get(directOriginalId) : null) || fingerprintAlert;
      const originalId = directOriginalId || String(fingerprintAlert?.callId || '');
      return {
        ...row,
        original_call_id: source === 'archived' ? (originalId || row.original_call_id || '') : row.original_call_id,
        call_id: cadRef(row) || cadRef(alert),
        bps_reference: row.bps_reference || (/^BPS-/i.test(cadRef(alert)) ? cadRef(alert) : ''),
        _referenceEntity:source==='archived'?'CallHistory':'DispatchCall',_referenceId:String(row.id),
        _source: source,
        _assignedUnitDetails: assignmentDetails(originalId, Array.isArray(row.assigned_units) ? row.assigned_units : []),
        _linkedReports:linkedReports(originalId||String(row.id||''),String(row.call_id||row.agency_cad_number||row.bps_reference||'')),
        _propertyCall: Boolean(alert),
        _propertyAlert: alert || null,
        _propertyName: alert?.propertyName || '',
        _propertyId: alert?.propertyId || '',
        _propertyLifecycle: alert?.lifecycle_status || '',
        _propertyDistanceMeters: Number.isFinite(Number(alert?.distanceMeters)) ? Number(alert.distanceMeters) : null,
      };
    };

    const activeRows = (active || []).map((row: any) => decorate(row, 'active'));
    const archivedRowsRaw = (archived || []).map((row: any) => decorate(row, 'archived'));

    // Do not collapse different calls merely because their timestamp, incident
    // and street match. Only the canonical original ID is a duplicate key.
    const archivedRows=archivedRowsRaw;
    const manualLinks:any[]=propertyLinksRead.data||[];
    const allRows=[...activeRows,...archivedRows];
    const decorated=allRows.map(row=>{
      const ids=[String(row.id||''),String(row.original_call_id||'')];
      const links=manualLinks.filter(link=>ids.includes(String(link.call_id))||ids.includes(String(link.archive_id||'')));
      return links.length?{...row,_propertyLinks:links,_propertyCall:true,_propertyName:[row._propertyName,...links.map(l=>l.property_name)].filter(Boolean).join(' / '),_propertyId:row._propertyId||links[0].property_id}:row;
    });
    return Response.json({
      success: true,
      rows: [...decorated,...propertyRows].sort((a,b)=>callTimestamp(b)-callTimestamp(a)),
      next_cursor: nextCursor,
      has_more: hasMore,
      days:90, since, snapshot_at:snapshot,
      counts: {
        active: activeRows.length,
        archived: archivedRows.length,
        propertyAlerts: alertByCallId.size,
        loaded: decorated.length+propertyRows.length,
      },
      warnings: [...warnings,states.property.error,activeRead.error, archivedRead.error, alertRead.error, assignmentRead.error, userRead.error, unitRead.error,linkedRead.error,propertyLinksRead.error].filter(Boolean),
    });
  } catch (error:any) {
    console.error('getCallHistoryFeed failed:', error);
    return Response.json({ error: error?.message || 'Unable to load call history' }, { status: 500 });
  }
});
