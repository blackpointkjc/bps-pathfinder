const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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
 }catch(error){if(Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message)))throw error;return false;}
}

const lower = (v: unknown) => String(v || '').trim().toLowerCase();
const terminal = new Set(['cleared','cancelled','canceled','closed','resolved','completed']);
// The officer's CallAssignment is the canonical queue lifecycle. An upstream/public
// time_closed timestamp must not remove a Pathfinder assignment before the officer
// or dispatcher actually clears/unassigns it.
const isTerminalCall = (call: any) => terminal.has(lower(call?.status)) || call?.manual_dismissed === true;
const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !['officer','supervisor','dispatch','dispatcher'].includes(lower(__portalCaller.role)) && __portalCaller.dispatch_role!==true && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const me = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles=new Set((me.additional_roles||[]).map(lower));
    if(['client','student','pending','visitor'].some(r=>roles.has(r)||lower(me.user_type)===r||lower(me.role)===r)||me.portal_approved===false)return Response.json({error:'Officer access required'},{status:403});
    const db=base44.asServiceRole.entities;
    const warnings:string[]=[];
    const optional=async(label:string,read:()=>Promise<any>)=>{try{return await read();}catch(error){warnings.push(label+' delayed');return [];}};
    const validId=(id:any)=>/^[a-f0-9]{24}$/i.test(String(id||''));
    const pages=async(entity:any,query:any,sort:string)=>{
      const rows:any[]=[];for(let skip=0;skip<2000;skip+=200){const page=await entity.filter(query,sort,200,skip);if(!Array.isArray(page))throw Error('Invalid officer queue response');rows.push(...page);if(page.length<200)return rows;}
      throw Error('Officer queue exceeds safe read limit');
    };
    // Canonical assignments are scoped to the authenticated officer. Do not
    // download the entire CAD history or the company directory on every refresh.
    const [ownedUnits,sessions]=await Promise.all([
      db.Unit.filter({user_id:me.id},'-last_update_at',20),
      db.ActiveOfficer.filter({officer_email:me.email},'-last_update',10)
    ]);
    const aliases=[...new Set([String(me.id),String(me.email||''),...(ownedUnits||[]).map((r:any)=>String(r.id)),...(sessions||[]).map((r:any)=>String(r.id))].filter(Boolean))];
    const [assignments,linkedRecords]=await Promise.all([
      pages(db.CallAssignment,{unit_id:{$in:aliases}},'-assigned_at'),
      optional('Legacy attachments',()=>pages(db.DispatchCall,{assigned_units:{$in:aliases},manual_dismissed:{$ne:true},status:{$nin:['Cleared','Cancelled','Canceled','Closed','Completed','Resolved','cleared','cancelled','canceled','closed','completed','resolved']}},'-created_date'))
    ]);
    const activeAssignments=assignments.filter((a:any)=>!terminal.has(lower(a.status))&&!a.cleared_at);
    const linkedCalls=linkedRecords.filter((call:any)=>Array.isArray(call.assigned_units)&&call.assigned_units.some((id:any)=>aliases.includes(String(id)))&&!isTerminalCall(call)&&(!assignments.some((a:any)=>String(a.call_id)===String(call.id))||activeAssignments.some((a:any)=>String(a.call_id)===String(call.id))));
    const callIds=[...new Set([...activeAssignments.map((a:any)=>String(a.call_id||'')),...linkedCalls.map((c:any)=>String(c.id))].filter(Boolean))];
    const callById=new Map(linkedCalls.map((c:any)=>[String(c.id),c]));
    const missing=callIds.filter(id=>validId(id)&&!callById.has(id));
    for(let i=0;i<missing.length;i+=100){
      const rows=await pages(db.DispatchCall,{id:{$in:missing.slice(i,i+100)}},'-created_date');
      for(const c of rows)callById.set(String(c.id),c);
    }
    const calls=callIds.map(id=>callById.get(id)).filter(c=>c&&!isTerminalCall(c));
    if(!calls.length&&callIds.length&&callIds.some(id=>!callById.has(id)))warnings.push('Some assigned incident records are unavailable');
    const visibleIds=calls.map(c=>String(c.id));
    const [allRecentAssignments,welfareChecks]=await Promise.all([
      visibleIds.length?optional('Co-responder details',()=>pages(db.CallAssignment,{call_id:{$in:visibleIds},status:{$nin:[...terminal]}},'-assigned_at')):[],
      visibleIds.length?optional('Welfare checks',()=>db.OfficerWelfareCheck.filter({officer_email:lower(me.email),status:'pending'},'-requested_at',100)):[],
    ]);
    // Own assignments must survive optional co-responder lookup failures.
    const allAssignments=[...new Map([...activeAssignments,...allRecentAssignments].map((a:any)=>[String(a.id),a])).values()];
    const actorIds=[...new Set(allAssignments.map((a:any)=>String(a.unit_id||'')).filter(validId))];
    const directory=actorIds.length?await optional('Officer names',()=>db.User.filter({id:{$in:actorIds}},'-updated_date',200)):[];
    const queue: any[] = [];
    const actors=new Map((directory||[]).map((u:any)=>[String(u.id),u]));
    const named=(u:any)=>[u?.rank,u?.last_name||String(u?.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ')||'CAD';
    for (const call of calls) {
      const assignment = activeAssignments.find((a: any) => String(a.call_id) === String(call.id));
      // Unit queue data stays independent of the dispatcher call's global
      // status. Notes are loaded separately through sharedCadTimeline, the
      // *only* shared live stream between the two views.
      const allCallAssignments=allAssignments.filter((row:any)=>String(row.call_id)===String(call.id));
      const activeForCall=(allCallAssignments||[]).filter((a:any)=>!terminal.has(lower(a.status))&&!a.cleared_at);
      const namedPrimary=activeForCall.find((a:any)=>lower(a.role)==='primary')||activeForCall.slice().sort((a:any,b:any)=>Date.parse(a.assigned_at||0)-Date.parse(b.assigned_at||0))[0];
      const ownStatus=assignment?.status||'pending';
      queue.push({
        ...call,
        assignment:{...(assignment||{assigned_at:call.time_dispatched||call.created_date,unit_id:me.id,call_id:call.id}),status:ownStatus},
        assigned_officers:activeForCall.map((a:any)=>({
          unit_id:a.unit_id,officer_name:actors.has(String(a.unit_id))?named(actors.get(String(a.unit_id))):'Assigned Officer',
          role:String(a.id)===String(namedPrimary?.id)?'primary':'additional',status:a.status||'pending',assigned_at:a.assigned_at,
        })).sort((a:any,b:any)=>(a.role==='primary'?-1:1)-(b.role==='primary'?-1:1)),
        welfare_check: (welfareChecks || []).find((check:any) => String(check.call_id) === String(call.id) && lower(check.status) === 'pending') || null,
        queue_priority: priorityWeight[lower(call.priority)] ?? 2,
      });
    }

    const currentId=String((sessions||[]).find((s:any)=>s.session_active!==false)?.current_call_id||me.current_call_id||'');
    queue.sort((a, b) => {
      if(String(a.id)===currentId||String(b.id)===currentId)return Number(String(b.id)===currentId)-Number(String(a.id)===currentId);
      const p = Number(a.queue_priority) - Number(b.queue_priority);
      if (p) return p;
      const at = new Date(a.assignment?.assigned_at || a.time_received || a.created_date || 0).getTime();
      const bt = new Date(b.assignment?.assigned_at || b.time_received || b.created_date || 0).getTime();
      return at - bt;
    });

    return Response.json({ success: true, queue, current_call_id: queue[0]?.id || '', count: queue.length,warnings,fetched_at:new Date().toISOString() });
  } catch (error:any) {
    console.error('getMyDispatchQueue failed', error);
    return Response.json({ error: error?.message || 'Unable to load officer dispatch queue' }, { status: Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message))?429:500 });
  }
});