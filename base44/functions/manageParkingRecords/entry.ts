import { createClientFromRequest } from 'npm:@base44/sdk';

// Property and person data is ONLY served through this authenticated, site-
// scoped endpoint. Both new entities deny all direct browser CRUD via RLS.
const clean = (value: unknown, max=160) => String(value ?? '').trim().slice(0,max);
const siteKey = (value: unknown) => clean(value).split(' - ')[0].split(':')[0].trim().toLowerCase();
const plateKey = (value: unknown) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
const dates = () => new Date().toISOString();
const fail = (error: string, status=400) => Response.json({error},{status});
const history = (user:any, action:string, notes:string) => ({actor:clean(user.email||user.id),action,notes:clean(notes,600),at:dates()});
// Company properties may be linked to clients by assigned_client_email rather
// than by the user's assigned_locations array. Cache only this site's names,
// never resident data; users still authenticate on every function request.
const clientSiteCache = new Map<string,{expires:number,names:string[]}>();

Deno.serve(async req => {
  try {
    const sdk = createClientFromRequest(req);
    const user = await sdk.auth.me().catch(()=>null);
    if (!user?.id) return fail('Sign in required',401);
    const roles = new Set((user.additional_roles||[]).map((role:unknown)=>clean(role).toLowerCase()));
    const client = user.user_type==='client' || user.rank==='Client' || user.role==='client' || roles.has('client');
    const admin = !client && (user.role==='admin'||roles.has('full_access'));
    const supervisor = admin || (!client && (roles.has('supervisor')||user.is_supervisor===true||['sergeant','lieutenant','captain','major','colonel'].some(rank=>clean(user.rank).toLowerCase().includes(rank))));
    const officer = !client && (supervisor||['officer','dispatch','admin'].includes(user.role)||['officer','dispatch','cad_access'].some(role=>roles.has(role)));
    if(!client && !officer) return fail('Parking records access required',403);
    const entities = sdk.asServiceRole.entities;
    const assignedNames=[...(Array.isArray(user.assigned_locations)?user.assigned_locations:[]),
      ...(Array.isArray(user.assigned_sites)?user.assigned_sites:[]),
      ...(user.assigned_location?[user.assigned_location]:[])].map(value=>clean(value)).filter(Boolean);
    if(client&&user.email){
      const email=clean(user.email).toLowerCase();
      const cached=clientSiteCache.get(email);
      let named:string[]=[];
      if(cached&&cached.expires>Date.now())named=cached.names;
      else{
        try{
          const locations=await entities.Location.filter({assigned_client_email:email},'site_name',100);
          named=(locations||[]).filter((loc:any)=>clean(loc.assigned_client_email).toLowerCase()===email)
            .map((loc:any)=>clean(loc.site_name)).filter(Boolean);
          clientSiteCache.set(email,{names:named,expires:Date.now()+120_000});
          if(clientSiteCache.size>300)clientSiteCache.delete(clientSiteCache.keys().next().value as string);
        }catch(error){console.warn('Client site-email lookup unavailable',String((error as Error)?.message||error));}
      }
      assignedNames.push(...named);
    }
    const sites=new Set(assignedNames.map(siteKey).filter(Boolean));
    const scope = (selected:unknown) => !!siteKey(selected) && (!client || sites.has(siteKey(selected)));
    const data = await req.json().catch(()=>({}));
    const action = clean(data.action);
    const site = clean(data.site_name||data.location);
    const sitePermitted = () => scope(site) ? null : fail('Property not assigned or not selected',403);
    const residentFields = ['site_name','full_name','unit_number','lease_status','phone','email','notes','lease_start','lease_end','lease_id','building','resident_type','emergency_contact','vehicle_plate','vehicle_state','vehicle_year','vehicle_make','vehicle_model','vehicle_color','vehicle_vin'];
    const parkingFields = ['violation_date','violation_time','location','citation_number','call_number','vehicle_year','vehicle_make','vehicle_model','vehicle_color','license_plate','license_state','vehicle_vin','vehicle_owner','subject_name','subject_dob','unit_number','violation_type','description','photo_url','warning_issued','linked_call_id','linked_call_number','resident_id','resident_verified','vehicle_record_id'];
    const siteRecords = async (entity:any,limit=200) => {
      const rows = await entity.filter({site_name:site},'-created_date',limit);
      return rows.filter((row:any)=>siteKey(row.site_name)===siteKey(site));
    };
    // Returned parking notices are officer correction tasks. Restrict this
    // overview to the issuing officer, unless the caller is a full admin.
    if(action==='officer_tasks'){
      if(!officer)return fail('Officer access required',403);
      const returned=await entities.ParkingViolation.filter(admin?{status:'rejected'}:{officer_id:String(user.id)},'-created_date',120);
      return Response.json({tasks:(returned||[]).filter((v:any)=>v.status==='rejected'&&v.supervisor_review_status==='returned').map((v:any)=>({
        id:v.id,citation_number:v.citation_number,location:v.location,violation_date:v.violation_date,
        license_plate:v.license_plate,officer_id:v.officer_id,supervisor_notes:v.supervisor_notes,status:v.status,
      }))});
    }
    // Supervisor Action Items can display parking approvals without loading
    // resident PII or scanning every property's vehicle registry.
    if(action==='review_queue'){
      if(!supervisor)return fail('Supervisor approval access required',403);
      const pending=await entities.ParkingViolation.filter({status:'issued'},'-created_date',100);
      return Response.json({reviews:(pending||[]).filter((v:any)=>v.supervisor_review_status!=='approved').map((v:any)=>({
        id:v.id,citation_number:v.citation_number,location:v.location,violation_date:v.violation_date,
        license_plate:v.license_plate,violation_type:v.violation_type,officer_name:v.officer_name,
        status:v.status,supervisor_review_status:v.supervisor_review_status,
      }))});
    }
    if (action==='sites') {
      // Property options are returned without resident PII. Always prefer a
      // verified active duty assignment in officer apps; otherwise let staff
      // choose a property explicitly before any resident search.
      let options=[...new Map(assignedNames.map(name=>[siteKey(name),name])).values()];
      if(officer&&!client){
        try {const locations=await entities.Location.list('site_name',350);
          options=[...new Map([...(locations||[]).map((loc:any)=>clean(loc.site_name)).filter(Boolean),...options].map(name=>[siteKey(name),name])).values()];}
        catch(error){console.warn('Parking site list unavailable',String((error as Error)?.message||error));}
      }
      let dutySite='';
      if(officer&&user.email){try{
        const shifts=await entities.TimeEntry.filter({officer_email:user.email},'-clock_in',10);
        const current=(shifts||[]).find((row:any)=>row.clock_in&&!row.clock_out);
        const duty=clean(current?.location||'');
        dutySite=options.find(name=>siteKey(name)===siteKey(duty))||'';
      }catch(error){console.warn('Parking duty property lookup unavailable',String((error as Error)?.message||error));}}
      return Response.json({sites:options,duty_site:dutySite,role:client?'client':admin?'admin':supervisor?'supervisor':'officer'});
    }
    if (['overview','residents','rules','violations','resident_save','rule_save','issue','resubmit','review','records_check','export','rent_roll','vehicle_save','resident_lookup'].includes(action)) {
      const rejected=sitePermitted();if(rejected)return rejected;
    }
    // Single property-scoped resident/vehicle registry shared by the client,
    // officers' parking workflow, and incident/trespass party selectors.
    // A legacy single-car resident is projected as a vehicle until migrated,
    // without rewriting or losing any pre-existing lease record.
    const publicResident=(row:any)=>({id:row.id,site_name:row.site_name,full_name:row.full_name,
      unit_number:row.unit_number,building:row.building,lease_status:row.lease_status,
      lease_start:row.lease_start,lease_end:row.lease_end,resident_type:row.resident_type,
      vehicle_plate:row.vehicle_plate,vehicle_state:row.vehicle_state,vehicle_year:row.vehicle_year,
      vehicle_make:row.vehicle_make,vehicle_model:row.vehicle_model,vehicle_color:row.vehicle_color,vehicle_vin:row.vehicle_vin});
    const publicVehicle=(v:any)=>({id:v.id,resident_id:v.resident_id,site_name:v.site_name,
      plate:v.plate,state:v.state,year:v.year,make:v.make,model:v.model,color:v.color,vin:v.vin,
      permit_number:v.permit_number,permit_status:v.permit_status,vehicle_status:v.vehicle_status,unit_number:v.unit_number});
    const residentCars=(residents:any[],registered:any[])=>{
      const cars=registered.map(publicVehicle);
      for(const row of residents){
        if(!plateKey(row.vehicle_plate))continue;
        if(cars.some(v=>v.resident_id===row.id&&plateKey(v.plate)===plateKey(row.vehicle_plate)&&clean(v.state).toUpperCase()===clean(row.vehicle_state).toUpperCase()))continue;
        cars.push({id:'legacy:'+row.id,resident_id:row.id,site_name:site,plate:plateKey(row.vehicle_plate),state:clean(row.vehicle_state)||'VA',year:row.vehicle_year||'',make:row.vehicle_make||'',model:row.vehicle_model||'',color:row.vehicle_color||'',vin:row.vehicle_vin||'',permit_number:'',permit_status:'unknown',vehicle_status:'registered',unit_number:row.unit_number||''});
      }
      return cars;
    };
    if(action==='vehicle_save'){
      if(!client&&!admin)return fail('Client or administrator registration required',403);
      const input=data.vehicle||{};
      const resident=await entities.PropertyResident.get(clean(input.resident_id));
      if(!resident||siteKey(resident.site_name)!==siteKey(site))return fail('Select a resident on this property rent roll',404);
      const plate=plateKey(input.plate);
      if(plate.length<2)return fail('Vehicle license plate required');
      const record:any={site_name:site,resident_id:resident.id,resident_name:resident.full_name,unit_number:resident.unit_number,
        plate,state:clean(input.state||'VA',3).toUpperCase(),year:clean(input.year),make:clean(input.make),
        model:clean(input.model),color:clean(input.color),vin:clean(input.vin,25).toUpperCase(),
        permit_number:clean(input.permit_number),permit_status:clean(input.permit_status||'active'),
        vehicle_status:clean(input.vehicle_status||'registered'),updated_at:dates(),updated_by:clean(user.email)};
      let result;
      if(data.id){const existing=await entities.PropertyVehicle.get(clean(data.id));
        if(!existing||siteKey(existing.site_name)!==siteKey(site)||existing.resident_id!==resident.id)return fail('Vehicle is not linked to that resident at this property',404);
        result=await entities.PropertyVehicle.update(existing.id,record);
      }else result=await entities.PropertyVehicle.create(record);
      return Response.json({success:true,vehicle:publicVehicle(result)});
    }
    if (['overview','residents','records_check','rent_roll','resident_lookup'].includes(action)) {
      const rows=await siteRecords(entities.PropertyResident,300);
      const registered=await siteRecords(entities.PropertyVehicle,500);
      const vehicles=residentCars(rows,registered);
      if(action==='rent_roll'||action==='resident_lookup'){
        const q=clean(data.query,100).toLowerCase();
        const residents=rows.map(publicResident).filter(row=>{
          if(!q)return true;
          const cars=vehicles.filter(v=>v.resident_id===row.id);
          return [row.full_name,row.unit_number,row.building,...cars.map(v=>v.plate),...cars.map(v=>v.vin)].some(value=>clean(value).toLowerCase().includes(q));
        });
        if(action==='resident_lookup'&&!officer)return fail('Officer resident lookup access required',403);
        return Response.json({residents,vehicles:vehicles.filter(v=>residents.some(row=>row.id===v.resident_id)),source:'Property rent roll (not DMV/NCIC)'});
      }
      if(action==='residents'||action==='overview') {
        const residents=client?rows:rows.map(publicResident);
        if(action==='residents')return Response.json({residents,vehicles});
        const [rules,violations]=await Promise.all([siteRecords(entities.PropertyParkingRule,100),entities.ParkingViolation.filter({location:site},'-created_date',200)]);
        return Response.json({residents,vehicles,rules,violations:violations.filter((v:any)=>siteKey(v.location)===siteKey(site)&&(!client||v.client_visible!==false))});
      }
      if(!officer)return fail('Officer records access required',403);
      const query=clean(data.query,100).toLowerCase();if(query.length<2)return fail('Enter a person name, plate or VIN');
      const terms=query.split(/\s+/).filter(term=>/[a-z0-9]{2,}/i.test(term));
      if(!terms.length)return fail('Enter a name or a complete plate/VIN');
      const found=rows.filter((row:any)=> {
        const name=clean(row.full_name).toLowerCase();
        const cars=vehicles.filter(v=>v.resident_id===row.id);
        return terms.every(term=>name.includes(term)||cars.some(v=>plateKey(v.plate).includes(plateKey(term))||clean(v.vin).toUpperCase().includes(term.toUpperCase())));
      }).map((row:any)=>({id:row.id,source:'Property resident registry',...publicResident(row),
        vehicles:vehicles.filter(v=>v.resident_id===row.id)}));
      const parking=await entities.ParkingViolation.filter({location:site},'-created_date',150);
      const past=parking.filter((p:any)=>siteKey(p.location)===siteKey(site) && (plateKey(p.license_plate).includes(plateKey(query))||clean(p.subject_name||p.vehicle_owner).toLowerCase().includes(query))).slice(0,20)
        .map((p:any)=>({id:p.id,source:'Parking violation',citation_number:p.citation_number,date:p.violation_date,status:p.status,license_plate:p.license_plate,violation_type:p.violation_type}));
      return Response.json({matches:[...found,...past],resident_matches:found.length,prior_violations:past.length,source:'Internal Pathfinder records only; not DMV/NCIC'});
    }
    if(action==='resident_save') {
      if(!client&&!admin)return fail('Client or admin property access required',403);
      const input=data.resident||{};
      const record:any={site_name:site};for(const field of residentFields)if(field!=='site_name')record[field]=clean(input[field],field==='notes'?1000:180);
      if(!record.full_name)return fail('Resident name required');
      if(record.vehicle_plate)record.vehicle_plate=plateKey(record.vehicle_plate);
      record.updated_by=clean(user.email);record.updated_at=dates();
      let result;
      if(data.id){const old=await entities.PropertyResident.get(clean(data.id));if(!old||siteKey(old.site_name)!==siteKey(site))return fail('Resident not found at this property',404);result=await entities.PropertyResident.update(old.id,record);}
      else result=await entities.PropertyResident.create({...record,registered_by:clean(user.email)});
      return Response.json({success:true,resident:result});
    }
    if(action==='rule_save'){
      if(!client&&!admin)return fail('Client or admin property access required',403);
      const r=data.rule||{};
      const amount=Number(r.fine_amount||0);
      if(!clean(r.label)||!clean(r.violation_type)||!Number.isFinite(amount)||amount<0||amount>10000)return fail('A violation label, type, and valid fine are required');
      const record={site_name:site,label:clean(r.label),violation_type:clean(r.violation_type),description:clean(r.description,1200),fine_amount:amount,warning_only:r.warning_only===true,active:r.active!==false,updated_by:clean(user.email),updated_at:dates()};
      let result;
      if(data.id){const old=await entities.PropertyParkingRule.get(clean(data.id));if(!old||siteKey(old.site_name)!==siteKey(site))return fail('Rule not found at property',404);result=await entities.PropertyParkingRule.update(old.id,record);}
      else result=await entities.PropertyParkingRule.create(record);
      return Response.json({success:true,rule:result});
    }
    if(action==='issue'){
      if(!officer)return fail('Only officers can issue parking notices',403);
      const input=data.violation||{};
      const entry:any={};for(const field of parkingFields)if(input[field]!==undefined)entry[field]=typeof input[field]==='string'?clean(input[field],field==='description'?2200:300):input[field];
      if(!plateKey(entry.license_plate)||!clean(entry.violation_type))return fail('Plate and violation type are required');
      entry.license_plate=plateKey(entry.license_plate);entry.location=site;
      // Never trust a flag or linked resident id supplied by the officer.
      // Plate verification happens against server-side property records only.
      entry.resident_id='';entry.resident_verified=false;
      const residents=await siteRecords(entities.PropertyResident,300);
      const registeredVehicles=await siteRecords(entities.PropertyVehicle,500);
      const match=registeredVehicles.find((v:any)=>plateKey(v.plate)===entry.license_plate && clean(v.state).toUpperCase()===clean(entry.license_state).toUpperCase());
      const matchingResident=match?residents.find((r:any)=>r.id===match.resident_id):residents.find((r:any)=>plateKey(r.vehicle_plate)===entry.license_plate && clean(r.vehicle_state).toUpperCase()===clean(entry.license_state).toUpperCase());
      if(matchingResident){entry.resident_id=matchingResident.id;entry.resident_verified=true;entry.vehicle_record_id=match?.id||'';
        entry.unit_number=entry.unit_number||matchingResident.unit_number;entry.vehicle_owner=entry.vehicle_owner||matchingResident.full_name;}
      entry.violation_date=entry.violation_date||dates().slice(0,10);
      entry.violation_time=entry.violation_time||dates().slice(11,16);
      entry.citation_number=`BPS-PV-${crypto.randomUUID().slice(0,12).toUpperCase()}`;
      const rules=await siteRecords(entities.PropertyParkingRule,100);
      const rule=rules.find((r:any)=>r.violation_type===entry.violation_type&&r.active!==false);
      entry.warning_issued=rule?.warning_only===true||entry.warning_issued===true;
      entry.fine_amount=entry.warning_issued?0:Number(rule?.fine_amount||0);
      entry.status='issued';entry.supervisor_review_status='pending';entry.client_review_status='pending';entry.client_visible=true;
      entry.officer_name=clean(user.full_name||`${user.first_name||''} ${user.last_name||''}`.trim()||user.email);
      entry.officer_id=String(user.id);
      entry.approval_history=[history(user,'issued',entry.description||'Officer submitted parking notice')];
      const result=await entities.ParkingViolation.create(entry);
      return Response.json({success:true,violation:result});
    }
    if(action==='resubmit'){
      if(!officer)return fail('Officer report access required',403);
      const id=clean(data.id);
      const original=await entities.ParkingViolation.get(id);
      if(!original||!scope(original.location)||siteKey(original.location)!==siteKey(site))return fail('Notice not found at site',404);
      if(original.status!=='rejected'&&original.supervisor_review_status!=='returned')return fail('Only returned notices can be resubmitted');
      if(!admin && String(original.officer_id||original.created_by_id||original.created_by||'')!==String(user.id)
        && clean(original.created_by).toLowerCase()!==clean(user.email).toLowerCase())return fail('Only the issuing officer or an administrator may edit this notice',403);
      const input=data.violation||{};
      const patch:any={};for(const field of parkingFields){if(input[field]!==undefined)patch[field]=typeof input[field]==='string'?clean(input[field],field==='description'?2200:300):input[field];}
      if(patch.license_plate)patch.license_plate=plateKey(patch.license_plate);
      patch.location=original.location;patch.citation_number=original.citation_number;
      // The server's property registry is authoritative; a client payload
      // cannot mark an arbitrary plate as an active registered resident.
      const currentPlate=plateKey(patch.license_plate||original.license_plate);
      const currentState=clean(patch.license_state||original.license_state).toUpperCase();
      const residents=await siteRecords(entities.PropertyResident,300);
      const car=(await siteRecords(entities.PropertyVehicle,500)).find((v:any)=>plateKey(v.plate)===currentPlate&&clean(v.state).toUpperCase()===currentState);
      const registered=car?residents.find((r:any)=>r.id===car.resident_id):residents.find((r:any)=>plateKey(r.vehicle_plate)===currentPlate&&clean(r.vehicle_state).toUpperCase()===currentState);
      patch.resident_id=registered?.id||'';patch.resident_verified=!!registered;patch.vehicle_record_id=car?.id||'';
      patch.fine_amount=original.fine_amount;patch.status='issued';patch.supervisor_review_status='pending';patch.was_rejected=true;
      patch.approval_history=[...(Array.isArray(original.approval_history)?original.approval_history:[]),history(user,'resubmitted',patch.description||'Officer revised returned parking notice')].slice(-60);
      return Response.json({success:true,violation:await entities.ParkingViolation.update(id,patch)});
    }
    if(action==='violations'||action==='export'){
      const since=action==='export'?new Date(Date.now()-30*86400000).toISOString().slice(0,10):'';
      const chunkSize=action==='export'?250:150;
      let offset=Math.max(0,Math.min(2500,Number(data.offset)||0));
      const startingOffset=offset;
      const rows:any[]=[];
      let hasMore=false;
      const maxReads=action==='export'?12:1;
      for(let page=0;page<maxReads;page++){
        const batch=await entities.ParkingViolation.filter({location:site},'-created_date',chunkSize,offset);
        if(!Array.isArray(batch))throw Error('Parking records service returned invalid data');
        rows.push(...batch);
        offset+=batch.length;
        hasMore=batch.length===chunkSize;
        if(!hasMore)break;
      }
      const violations=rows.filter((row:any)=>siteKey(row.location)===siteKey(site) && (!since||String(row.violation_date||'')>=since)
        && (!client || row.client_visible!==false));
      return Response.json({violations,window_days:action==='export'?30:null,next_offset:hasMore?offset:null,
        truncated:action==='export'&&hasMore,starting_offset:startingOffset});
    }
    if(action==='review'){
      const id=clean(data.id);if(!id)return fail('Notice ID required');
      const old=await entities.ParkingViolation.get(id);
      if(!old||!scope(old.location)||siteKey(old.location)!==siteKey(site))return fail('Notice not found at this property',404);
      const status=clean(data.status);
      const notes=clean(data.notes,1000);
      let patch:any={};
      if(client){if(!['acknowledged','disputed','resolved'].includes(status))return fail('Invalid client response');patch={client_review_status:status,client_notes:notes};}
      else if(supervisor){if(!['approved','returned','rejected'].includes(status))return fail('Invalid supervisor decision');
        if(old.status!=='issued')return fail('Only submitted, pending notices can be approved or returned');
        if((status==='returned'||status==='rejected')&&!notes)return fail('A reason is required when returning a notice');
        patch=status==='approved'?{supervisor_review_status:'approved',status:'approved',supervisor_notes:notes}:{supervisor_review_status:'returned',status:'rejected',supervisor_notes:notes,admin_notes:notes,was_rejected:true};}
      else return fail('Review access required',403);
      patch.approval_history=[...(Array.isArray(old.approval_history)?old.approval_history:[]),history(user,client?'client_review':'supervisor_review',`${status}: ${notes}`)].slice(-60);
      const result=await entities.ParkingViolation.update(id,patch);
      return Response.json({success:true,violation:result});
    }
    return fail('Unknown parking action',400);
  } catch(error:any){console.error('manageParkingRecords',String(error?.message||error));return fail('Parking records request failed',503);}
});
