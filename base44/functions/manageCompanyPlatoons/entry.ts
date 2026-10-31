import { createClientFromRequest } from 'npm:@base44/sdk';
const trim=(v:any)=>String(v||'').trim();
const key=(v:any)=>trim(v).toLowerCase();
Deno.serve(async(req)=>{
 try{
  const sdk=createClientFromRequest(req);
  const me=await sdk.auth.me().catch(()=>null);
  if(!me)return Response.json({error:'Sign in required'},{status:401});
  const body=await req.json().catch(()=>({}));
  const action=trim(body.action||'list');
  const admin=me.role==='admin'||(me.additional_roles||[]).some((role:any)=>key(role)==='full_access');
  const rows=await sdk.asServiceRole.entities.CompanyPlatoon.list('region',1000);
  if(action==='list')return Response.json({success:true,platoons:rows||[]});
  if(!admin)return Response.json({error:'Administrator access required'},{status:403});
  if(!['create','update','delete'].includes(action))return Response.json({error:'Unsupported operation'},{status:400});
  const id=trim(body.id);
  const original=action==='create'?null:(rows||[]).find((row:any)=>String(row.id)===id);
  if(action!=='create'&&!original)return Response.json({error:'Platoon does not exist'},{status:404});
  if(action==='delete'){
    const personnel=await sdk.asServiceRole.entities.User.list('-updated_date',1000);
    const assigned=(personnel||[]).filter((p:any)=>key(p.division)===key(original.region)
      &&key(p.platoon).replace(/^platoon\s+/,'')===key(original.name).replace(/^platoon\s+/,''));
    if(assigned.length)return Response.json({
      error:`Cannot permanently delete ${original.name} in ${original.region}: ${assigned.length} officer${assigned.length===1?' is':'s are'} still assigned. Reassign them in Manage Officers, or archive the Platoon while preserving their assignments.`,
      assigned_count:assigned.length,can_archive:true,
    },{status:409});
    await sdk.asServiceRole.entities.CompanyPlatoon.delete(id);
    return Response.json({success:true});
  }
  const data=body.data||{};
  // Preserve historic 'A'/'B' officer assignments when admins type 'Platoon A'.
  const name=trim(data.name??original?.name).replace(/^platoon\s+/i,'');
  const region=trim(data.region??original?.region);
  if(!name||!region||name.length>80||region.length>120)return Response.json({error:'A valid platoon name and region are required'},{status:400});
  const regions=await sdk.asServiceRole.entities.Division.list('division_name',1000);
  if(!(regions||[]).some((r:any)=>key(r.division_name)===key(region)&&(r.division_level==='region'||(!r.division_level&&r.is_subdivision!==true))&&r.active!==false))
    return Response.json({error:'Create or activate this Region in Company Structure before assigning platoons'},{status:400});
  if((rows||[]).some((r:any)=>r.id!==id&&key(r.name).replace(/^platoon\s+/,'')===key(name)&&key(r.region)===key(region)))
    return Response.json({error:'This platoon already exists within the selected Region'},{status:409});
  if(action==='update'&&(key(original.name)!==key(name)||key(original.region)!==key(region))){
    const personnel=await sdk.asServiceRole.entities.User.list('-updated_date',1000);
    if((personnel||[]).some((p:any)=>key(p.division)===key(original.region)&&key(p.platoon)===key(original.name)))
      return Response.json({error:'Platoon has assigned officers. Transfer them before changing its name or Region.'},{status:409});
  }
  const next={name,region,active:data.active!==undefined?data.active!==false:original?.active!==false,notes:trim(data.notes??original?.notes)};
  const platoon=action==='create'?await sdk.asServiceRole.entities.CompanyPlatoon.create(next):await sdk.asServiceRole.entities.CompanyPlatoon.update(id,next);
  return Response.json({success:true,platoon});
 }catch(e:any){console.error('manageCompanyPlatoons',e);return Response.json({error:'Unable to manage platoons'},{status:503});}
});
