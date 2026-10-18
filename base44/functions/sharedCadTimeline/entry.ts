import {createClientFromRequest} from 'npm:@base44/sdk';
const lower=(v:any)=>String(v||'').trim().toLowerCase();
const name=(u:any)=>[String(u?.rank||'').trim(),String(u?.last_name||'').trim()||String(u?.full_name||'').trim().split(/\s+/).pop()].filter(Boolean).join(' ')||'Dispatch';
Deno.serve(async req=>{
  try{
    const base44=createClientFromRequest(req);
    const me=await base44.auth.me().catch(()=>null);
    if(!me)return Response.json({error:'Sign in to access the CAD timeline'},{status:401});
    const body=await req.json().catch(()=>({}));
    const callId=String(body.call_id||'').trim(), action=lower(body.action||'read');
    if(!callId||!['read','post'].includes(action))return Response.json({error:'Valid CAD call and action are required'},{status:400});
    const call=await base44.asServiceRole.entities.DispatchCall.get(callId).catch(()=>null);
    if(!call)return Response.json({error:'CAD call not found'},{status:404});
    const roles=new Set((me.additional_roles||[]).map(lower));
    const rank=lower(me.rank);
    const command=me.role==='admin'||me.role==='dispatch'||me.dispatch_role===true||me.is_supervisor===true||roles.has('full_access')||roles.has('cad_access')||roles.has('dispatch')||roles.has('supervisor')||['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','sergeant','corporal'].includes(rank);
    const assignments=await base44.asServiceRole.entities.CallAssignment.filter({call_id:callId},'-assigned_at',100);
    const unitAliases=[String(me.id),lower(me.email)];
    if(!command){
      const [units,sessions]=await Promise.all([
        base44.asServiceRole.entities.Unit.filter({user_id:me.id},'-last_update_at',15).catch(()=>[]),
        base44.asServiceRole.entities.ActiveOfficer.filter({officer_email:me.email},'-last_update',10).catch(()=>[]),
      ]);
      for(const row of [...(units||[]),...(sessions||[])])if(row.id)unitAliases.push(String(row.id));
    }
    const owns=(assignments||[]).some((a:any)=>unitAliases.includes(String(a.unit_id))&&!['cleared','cancelled','canceled'].includes(lower(a.status)))
      ||(call.assigned_units||[]).some((id:any)=>unitAliases.includes(String(id)));
    if(!command&&!owns)return Response.json({error:'This CAD call is not assigned to your unit'},{status:403});
    if(action==='post'){
      const text=String(body.note||'').trim();
      if(!text||text.length>1500)return Response.json({error:'A call note between 1 and 1500 characters is required'},{status:400});
      const saved=await base44.asServiceRole.entities.CallNote.create({call_id:callId,author_id:String(me.id),author_name:name(me),note:text,note_type:'update'});
      return Response.json({success:true,note:{...saved,author_name:name(me)}});
    }
    const [notes,logs]=await Promise.all([
      base44.asServiceRole.entities.CallNote.filter({call_id:callId},'-created_date',120),
      base44.asServiceRole.entities.CallStatusLog.filter({call_id:callId},'-created_date',150),
    ]);
    const userIds=new Set([...notes,...logs].map((row:any)=>String(row.author_id||row.unit_id||'')).filter(Boolean));
    const [directory]=await Promise.all([base44.asServiceRole.entities.User.list('-updated_date',450).catch(()=>[])]);
    const actors=new Map((directory||[]).filter((u:any)=>userIds.has(String(u.id))).map((u:any)=>[String(u.id),u]));
    // Historical records predate canonical User IDs. Resolve legacy usernames,
    // unit identifiers and email prefixes without changing the audit record.
    const alias=new Map<string,any>();
    for(const officer of directory||[]){
      const keys=[officer.id,officer.email,officer.username,officer.unit_number&&`Unit ${officer.unit_number}`,
        String(officer.email||'').split('@')[0],officer.full_name,[officer.rank,officer.last_name].filter(Boolean).join(' ')];
      for(const key of keys)if(key)alias.set(lower(key),officer);
    }
    const label=(id:string,fallback:string)=>{
      const resolved=actors.get(id)||alias.get(lower(id))||alias.get(lower(fallback));
      if(resolved)return name(resolved);
      if(fallback==='Dispatch'||fallback==='CAD')return fallback;
      if(/^(Colonel|Lt Colonel|Lieutenant Colonel|Major|Captain|Lieutenant|Sergeant|Sgt|Corporal|Officer)\s+/i.test(fallback))return fallback;
      return fallback.includes('@')?'Dispatch':`Officer ${fallback.split(/\s+/).pop()||'Unknown'}`;
    };
    const historicalText=(value:any)=>String(value||'').replace(/\bUnit\s+(\d+)\b/gi,(original:string,number:string)=>{
      const officer=alias.get(lower(`Unit ${number}`));
      return officer?name(officer):original;
    });
    const mirrored=(log:any)=>{
      const prefixes:any={unit_acknowledged:'[ACKNOWLEDGED]',unit_enroute:'[ENROUTE]',unit_on_scene:'[ON SCENE]',unit_cleared:'[CLEARED]'};
      const prefix=prefixes[String(log.event_type||'')];if(!prefix)return false;
      const at=Date.parse(log.created_date||'');
      return (notes||[]).some((row:any)=>String(row.author_id)===String(log.unit_id)&&String(row.note||'').startsWith(prefix)&&Math.abs(Date.parse(row.created_date||'')-at)<20000);
    };
    const timeline=[
      ...(notes||[]).map((row:any)=>({id:String(row.id),kind:'note',author_name:label(String(row.author_id||''),String(row.author_name||'Dispatch')),note:historicalText(row.note),created_date:row.created_date})),
      ...(logs||[]).filter((row:any)=>!mirrored(row)&&(row.event_type!=='call_updated'||row.notes||row.announcement_text)).map((row:any)=>({
        id:`activity-${row.id}`,kind:'activity',author_name:label(String(row.unit_id||''),String(row.unit_name||'Dispatch')),
        note:historicalText(`[${String(row.event_type||'CAD UPDATE').replace(/_/g,' ').toUpperCase()}] ${row.notes||row.announcement_text||`${row.old_status||'Call'} → ${row.new_status||'Updated'}`}`),
        created_date:row.created_date,
      })),
    ].sort((a:any,b:any)=>Date.parse(a.created_date||'')-Date.parse(b.created_date||''));
    return Response.json({success:true,call_id:callId,notes:timeline,generated_at:new Date().toISOString()});
  }catch(error:any){return Response.json({error:error?.message||'Unable to load the shared CAD timeline'},{status:500});}
});
