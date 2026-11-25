const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { createClientFromRequest } from 'npm:@base44/sdk';
import { isLiveLocationHidden } from './privacy.ts';
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

    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'activate';
    const officerId = body.officer_id || user.id;
    const isSelf = officerId === user.id;

    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if(roles.has('client')||roles.has('student')||roles.has('visitor')||['client','student'].includes(String(user.user_type||'').toLowerCase()))return Response.json({error:'Officer access required'},{status:403});
    const authorized =
      isSelf ||
      user.role === 'admin' ||
      user.role === 'dispatch' ||
      roles.has('full_access') ||
      roles.has('supervisor') ||
      roles.has('dispatch');
    if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (!['activate', 'clear', 'location', 'acknowledge', 'responders_enroute'].includes(action)) return Response.json({ error: 'Invalid action' }, { status: 400 });

    const officer = await base44.asServiceRole.entities.User.get(officerId).catch(()=>null);
    if (!officer) return Response.json({ error: 'Officer not found' }, { status: 404 });

    const now = new Date().toISOString();

    const db=base44.asServiceRole.entities;
    const activeStates=['active','acknowledged','responders_enroute'];
    const valid=(lat:any,lon:any)=>lat!=null&&lon!=null&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180&&!(Number(lat)===0&&Number(lon)===0);
    const privateLocation=await isLiveLocationHidden(base44,officer);
    const locationPatch=(loc:any)=>valid(loc?.lat,loc?.lon)&&!privateLocation?{current_latitude:Number(loc.lat),current_longitude:Number(loc.lon),location_description:`${Number(loc.lat).toFixed(5)}, ${Number(loc.lon).toFixed(5)}`}:{};
    if(action==='location'){
      if(!isSelf)return Response.json({error:'Only the officer can send live coordinates'},{status:403});
      const row=body.distress_id?await db.OfficerDistress.get(body.distress_id).catch(()=>null):null;
      if(!row||row.officer_id!==officer.id||!activeStates.includes(row.status))return Response.json({success:true,active:false});
      const patch=locationPatch(body.location);
      if(!Object.keys(patch).length)return Response.json({success:true,active:true,location_saved:false});
      await db.OfficerDistress.update(row.id,{...patch,...(!valid(row.latitude,row.longitude)?{latitude:patch.current_latitude,longitude:patch.current_longitude}:{})});
      return Response.json({success:true,active:true,location_saved:true});
    }
    const [units,sessions,alerts]=await Promise.all([
      db.Unit.filter({user_id:officer.id},'-last_update_at',30),
      db.ActiveOfficer.filter({officer_email:officer.email},'-last_update',15),
      db.OfficerDistress.filter({officer_id:officer.id},'-activated_at',50)
    ]);
    const open=(alerts||[]).filter((row:any)=>activeStates.includes(row.status));
    const liveSessions=(sessions||[]).filter((row:any)=>row.session_active!==false);
    const aliases=[...new Set([officer.id,officer.email,...units.map((u:any)=>u.id),...sessions.map((u:any)=>u.id)].filter(Boolean).map(String))];
    const syncStatus=async(status:string,callId?:string,info?:string)=>{
      const callPatch=callId===undefined?{}:{current_call_id:callId,current_call_info:info||''};
      await Promise.all([
        db.User.update(officer.id,{status,last_updated:now,status_since:now,...callPatch}),
        ...units.map((u:any)=>db.Unit.update(u.id,{status,last_update_at:now})),
        ...liveSessions.map((u:any)=>db.ActiveOfficer.update(u.id,{status,last_update:now,...callPatch}))
      ]);
    };
    if(action==='acknowledge'||action==='responders_enroute'){
      if(isSelf && user.role!=='admin' && user.role!=='dispatch' && !roles.has('dispatch')&&!roles.has('supervisor')&&!roles.has('full_access'))return Response.json({error:'Dispatch authorization required'},{status:403});
      const row=open.find((a:any)=>String(a.id)===String(body.distress_id));
      if(!row)return Response.json({error:'Active distress not found'},{status:404});
      await db.OfficerDistress.update(row.id,action==='acknowledge'?{status:'acknowledged',acknowledged_at:now,acknowledged_by:user.id,acknowledged_by_name:user.full_name||user.email}:{status:'responders_enroute'});
      return Response.json({success:true});
    }

    if (action === 'activate') {
      if(open.length){await syncStatus('Distress');return Response.json({success:true,status:'Distress',distress_id:open[0].id,alert:open[0]});}
      const fallback=liveSessions.flatMap((row:any)=>[
        {lat:row.reliable_latitude,lon:row.reliable_longitude,at:row.reliable_gps_updated_at},
        {lat:row.latitude,lon:row.longitude,at:row.gps_updated_at}
      ]).filter((fix:any)=>valid(fix.lat,fix.lon)&&Date.now()-Date.parse(fix.at)<60000&&Date.parse(fix.at)<=Date.now()+5000).sort((a:any,b:any)=>Date.parse(b.at)-Date.parse(a.at))[0];
      const supplied=isSelf&&valid(body.location?.lat,body.location?.lon)?body.location:null;
      const loc=privateLocation?null:supplied||fallback;
      const lat=loc?Number(loc.lat):null,lon=loc?Number(loc.lon):null;
      const distressData = {
        officer_id: officer.id,
        officer_name: officer.full_name || 'Unknown Officer',
        unit_number: officer.unit_number || '???',
        rank: officer.rank || '',
        last_name: officer.last_name || String(officer.full_name || '').split(' ').pop() || '',
        ...(valid(lat,lon)?{latitude:lat,longitude:lon,current_latitude:lat,current_longitude:lon}:{}),
        location_description: valid(lat,lon) ? `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}` : (privateLocation ? 'Live location hidden' : 'GPS unavailable — awaiting location'),
        status: 'active',
        activated_at: now,
        notes: isSelf ? '' : `Triggered by dispatch (${[user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email})`,
      };
      const created = await base44.asServiceRole.entities.OfficerDistress.create(distressData);
      await base44.asServiceRole.entities.CallStatusLog.create({
        call_id: created?.id || officer.id,
        incident_type: 'Officer emergency',
        location: distressData.location_description,
        old_status: officer.status || '',
        new_status: 'Distress',
        unit_id: officer.id,
        unit_name: officer.unit_number || officer.full_name || officer.email,
        notes: distressData.notes || 'Officer emergency activated',
        latitude: lat,
        longitude: lon,
        event_key: `distress:${created?.id || officer.id}:activated`,
        event_type: 'officer_emergency',
        announcement_text: `Emergency traffic. Officer emergency activated. Unit ${officer.unit_number || 'unknown'}. All available units respond.`,
        announcement_priority: 'emergency',
        cad_number: '',
        triggering_action: 'manageOfficerDistress.activate',
        audio_enabled: true,
        sensitive: true,
      });
      await syncStatus('Distress');
      return Response.json({ success: true, status: 'Distress', distress_id: created?.id || null, alert:created });
    }

    if(!open.length)return Response.json({success:true,status:officer.status,cleared:0,next_call_id:officer.current_call_id||''});
    // Resolve only the distress incident. Ordinary assignments remain intact.
    const groups=await Promise.all(aliases.map(id=>db.CallAssignment.filter({unit_id:id},'-assigned_at',300)));
    const assignments=[...new Map(groups.flat().map((row:any)=>[row.id,row])).values()].filter((row:any)=>!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()));
    const candidates=(await Promise.all([...new Map(assignments.map((row:any)=>[row.call_id,row])).values()].map(async (assignment:any)=>{
      const call=await db.DispatchCall.get(assignment.call_id).catch(()=>null);
      return call&&!call.manual_dismissed&&!['cleared','cancelled','canceled','closed','resolved','completed'].includes(String(call.status||'').toLowerCase())?{assignment,call}:null;
    }))).filter(Boolean);
    const weights:any={critical:0,high:1,medium:2,low:3};
    candidates.sort((a:any,b:any)=>(weights[String(a.call.priority).toLowerCase()]??2)-(weights[String(b.call.priority).toLowerCase()]??2)||Date.parse(a.assignment.assigned_at)-Date.parse(b.assignment.assigned_at));
    const next=candidates[0];
    const status=next?({on_scene:'On Scene',enroute:'Enroute'} as any)[next.assignment.status]||'Dispatched':liveSessions.length?'Available':'Out of Service';
    await Promise.all(open.map((row:any)=>db.OfficerDistress.update(row.id,{status:'cleared',cleared_at:now,cleared_by:user.id,cleared_by_name:user.full_name||user.email,notes:isSelf?'Officer cancelled':'Cleared by dispatch'})));
    await syncStatus(status,next?.call.id||'',next?`${next.call.incident||'Call for service'} · ${next.call.location||''}`:'');
    return Response.json({success:true,status,cleared:open.length,next_call_id:next?.call.id||'',next_call_number:next?(next.call.agency_cad_number||next.call.bps_reference||next.call.call_id||next.call.id):''});
  } catch (error) {
    console.error('manageOfficerDistress failed', error);
    return Response.json({ error: error?.message || 'Unable to update distress' }, { status: 500 });
  }
});