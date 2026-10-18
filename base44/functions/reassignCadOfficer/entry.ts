import {createClientFromRequest} from 'npm:@base44/sdk';
const lower=(v:any)=>String(v||'').trim().toLowerCase();
const label=(u:any)=>[u?.rank||'Officer',u?.last_name||String(u?.full_name||'').trim().split(/\s+/).pop()].filter(Boolean).join(' ');
const terminal=(call:any)=>call?.manual_dismissed===true||['cleared','cancelled','canceled','closed','resolved','completed'].includes(lower(call?.status));
Deno.serve(async req=>{
  try{
    const api=createClientFromRequest(req);
    const actor=await api.auth.me().catch(()=>null);
    if(!actor)return Response.json({error:'Sign in required'},{status:401});
    const roles=new Set((actor.additional_roles||[]).map(lower));
    if(actor.role!=='admin'&&actor.role!=='dispatch'&&actor.dispatch_role!==true&&actor.is_supervisor!==true&&!['cad_access','full_access','dispatch','supervisor'].some(role=>roles.has(role)))return Response.json({error:'CAD supervisor or dispatch authorization required'},{status:403});
    const body=await req.json().catch(()=>({}));
    const sourceId=String(body.source_call_id||''),targetId=String(body.destination_call_id||''),officerId=String(body.officer_id||'');
    if(!sourceId||!targetId||!officerId||sourceId===targetId)return Response.json({error:'Select the assigned officer, current call and different destination call'},{status:400});
    const db=api.asServiceRole.entities;
    const [source,target,officer]=await Promise.all([
      db.DispatchCall.get(sourceId).catch(()=>null),db.DispatchCall.get(targetId).catch(()=>null),db.User.get(officerId).catch(()=>null)
    ]);
    if(!source||!target||!officer?.email)return Response.json({error:'Both CAD calls and the selected officer must exist'},{status:404});
    if(terminal(target))return Response.json({error:'Destination CAD call is closed or canceled'},{status:409});
    if(terminal(source))return Response.json({error:'Officer current call is already closed. Refresh assignments.'},{status:409});
    const [oldAssignments,newAssignments]=await Promise.all([
      db.CallAssignment.filter({call_id:sourceId},'-assigned_at',100),
      db.CallAssignment.filter({call_id:targetId},'-assigned_at',100)
    ]);
    const oldRows=(oldAssignments||[]).filter((a:any)=>String(a.unit_id)===officerId&&!['cleared','cancelled','canceled'].includes(lower(a.status)));
    const activeOld=oldRows.length||(source.assigned_units||[]).map(String).includes(officerId);
    if(!activeOld)return Response.json({error:`${label(officer)} is no longer assigned to this source call. Refresh CAD.`},{status:409});
    if((newAssignments||[]).some((a:any)=>String(a.unit_id)===officerId&&!['cleared','cancelled','canceled'].includes(lower(a.status)))||(target.assigned_units||[]).map(String).includes(officerId))return Response.json({error:'Officer is already assigned to the destination call'},{status:409});
    const now=new Date().toISOString();
    const targetUnits=[...new Set([...(target.assigned_units||[]).map(String),officerId])];
    const others=(newAssignments||[]).some((a:any)=>!['cleared','cancelled','canceled'].includes(lower(a.status)))||(target.assigned_units||[]).length>0;
    const cad=(call:any)=>call.agency_cad_number||call.bps_reference||call.call_id||call.id;
    const officerName=label(officer);
    // The new assignment is written first so a failure never leaves this officer
    // unassigned. If old-call release fails, remove the new assignment again.
    let created:any;
    try {
      created=await db.CallAssignment.create({call_id:targetId,unit_id:officerId,role:others?'backup':'primary',status:'pending',assigned_at:now});
      await db.DispatchCall.update(targetId,{assigned_units:targetUnits,status:target.status==='New'?'Dispatched':target.status,time_dispatched:target.time_dispatched||now});
    }catch(error:any){if(created?.id)await db.CallAssignment.update(created.id,{status:'cleared',cleared_at:now}).catch(()=>null);return Response.json({error:'Destination assignment could not be confirmed. Old assignment was preserved. '+String(error?.message||'')},{status:502});}
    try {
      for(const row of oldRows)await db.CallAssignment.update(row.id,{status:'cleared',cleared_at:now,description:[row.description,'Reassigned by CAD to '+cad(target)].filter(Boolean).join(' ').slice(0,1000)});
      const oldUnits=(source.assigned_units||[]).map(String).filter((id:string)=>id!==officerId);
      await db.DispatchCall.update(sourceId,{assigned_units:oldUnits});
    }catch(error:any){
      for(const row of oldRows)await db.CallAssignment.update(row.id,{status:row.status,cleared_at:row.cleared_at||null}).catch(()=>null);
      await db.DispatchCall.update(sourceId,{assigned_units:(source.assigned_units||[]).map(String)}).catch(()=>null);
      await db.CallAssignment.update(created.id,{status:'cleared',cleared_at:now}).catch(()=>null);
      await db.DispatchCall.update(targetId,{assigned_units:(target.assigned_units||[]).map(String)}).catch(()=>null);
      // Do not claim a successful transfer with diverged assignment ledgers.
      return Response.json({error:'Reassignment encountered an error while releasing the old unit. Contact dispatch to reconcile both call rosters. '+String(error?.message||'')},{status:502});
    }
    const text=`DISPATCH TO ${officerName.toUpperCase()}: YOU ARE RELIEVED FROM CAD ${cad(source)}. DISCONTINUE OPERATIONS AT YOUR PRESENT ASSIGNMENT. PROCEED TO ${target.location||'THE NEW INCIDENT LOCATION'}, CAD ${cad(target)}, ${target.incident||'CALL FOR SERVICE'}. ACKNOWLEDGE ASSIGNMENT AND ADVISE WHEN EN ROUTE.`;
    const eventKey=`cad-reassign:${officerId}:${sourceId}:${targetId}:${now}`;
    const log=(call:any,eventType:string,notes:string,announcement:string,kind:string)=>db.CallStatusLog.create({call_id:call.id,incident_type:call.incident||'',location:call.location||'',old_status:call.status||'',new_status:call.status||'',unit_id:officerId,unit_name:officerName,notes,event_key:`${eventKey}:${kind}`,event_type:eventType,announcement_text:announcement,announcement_priority:'high',cad_number:String(cad(call)),triggering_action:'reassignCadOfficer',audio_enabled:kind==='new',sensitive:false});
    const results=await Promise.allSettled([
      log(source,'unit_reassigned',`${officerName} reassigned from this call to CAD ${cad(target)} by ${label(actor)}.`,text,'old'),
      log(target,'unit_dispatched',`${officerName} reassigned from CAD ${cad(source)} as ${others?'additional':'primary'} responder by ${label(actor)}.`,text,'new'),
      db.CallNote.create({call_id:sourceId,author_id:actor.id,author_name:label(actor),note:`[REASSIGNMENT] ${officerName} released from CAD ${cad(source)} and assigned to CAD ${cad(target)}.`,note_type:'update'}),
      db.CallNote.create({call_id:targetId,author_id:actor.id,author_name:label(actor),note:`[REASSIGNMENT] ${officerName} assigned ${others?'additional':'primary'} unit from CAD ${cad(source)}. ${text}`,note_type:'update'}),
      db.Notification.create({recipient_email:lower(officer.email),type:'call_assignment',title:`CAD REASSIGNMENT · ${cad(target)}`,message:text,is_read:false,related_id:targetId,priority:'critical',source_name:'CAD Dispatch'}),
      db.User.update(officerId,{current_call_id:targetId,current_call_info:`${target.incident||'Call for service'} · ${target.location||''}`.slice(0,500),status:'Dispatched'}),
    ]);
    const sessions=await db.ActiveOfficer.filter({officer_email:officer.email},'-last_update',10).catch(()=>[]);
    await Promise.allSettled((sessions||[]).filter((row:any)=>row.session_active!==false).map((row:any)=>db.ActiveOfficer.update(row.id,{current_call_id:targetId,current_call_info:`${target.incident||''} · ${target.location||''}`.slice(0,500),status:'Dispatched'})));
    return Response.json({success:true,officer:officerName,from:cad(source),to:cad(target),instructions:text,warnings:results.filter(r=>r.status==='rejected').length});
  }catch(error:any){console.error('reassignCadOfficer failed',error);return Response.json({error:error?.message||'CAD reassignment failed'},{status:500});}
});
