import {createClientFromRequest} from 'npm:@base44/sdk';
const sourceId='6a72bbee2842d6338cbae513',destinationId='6ae7d733d4b1a647cd3e6f38';
export default async function(req:Request){
 const db=createClientFromRequest(req).asServiceRole.entities;
 const body=await req.json().catch(()=>({}));if(!/^[a-f0-9]{64}$/.test(body.capability||''))return Response.json({error:'Unauthorized'},{status:401});
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.capability)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const records=await db.PersonnelTransferBackup.filter({source_id:sourceId,destination_id:destinationId,capability_hash:hash},'-created_date',1);
 const job=records[0];if(!job||!['authorized','running'].includes(job.status)||Date.parse(job.expires_at)<Date.now())return Response.json({error:'Transfer authorization expired or consumed'},{status:403});
 const [source,destination]=await Promise.all([db.User.get(sourceId),db.User.get(destinationId)]);
 if(source.email!=='kavonhiers@team-hsg.com'||destination.email!=='kshiers@blackpointkjc.com')return Response.json({error:'Identity mismatch'},{status:409});
 await db.PersonnelTransferBackup.update(job.id,{status:'running'});
 try{
 const omit=new Set(['id','email','full_name','created_date','updated_date','created_by','created_by_id','app_id','collaborator_role','_app_role','is_verified','is_service','force_password_reset','disabled','disabled_reason','status','status_since','last_updated','current_call_id','current_call_info','latitude','longitude','heading','speed','accuracy','show_on_map','current_latitude','current_longitude','last_known_latitude','last_known_longitude','last_known_location','dispatch_hold_new_calls','dispatch_hold_reason','dispatch_hold_at','dispatch_hold_by']);
 const profile=Object.fromEntries(Object.entries(job.source_profile).filter(([k])=>!omit.has(k)));
 if(!job.manifest.profile_applied)await db.User.update(destinationId,{...profile,role:'admin',profile_photo_original_url:profile.profile_photo_url,portal_approved:true,account_status:'active',transferred_from_user_id:sourceId});
 const counts:any={...(job.manifest.counts||{})};
 const cursor=Number(job.manifest.cursor||0);
 for(const entry of job.manifest.entities.slice(cursor,cursor+1)){
  const fields=Object.keys(entry.fields),query={$or:fields.flatMap(k=>[{[k]:sourceId},{[k]:source.email}])};let changed=0;
  for(let batch=0;batch<1;batch++){
   const rows=await db[entry.entity].filter(query,'created_date',20);if(!rows.length)break;
   for(const row of rows){const patch:any={};for(const field of fields){const v=row[field];if(v===sourceId)patch[field]=destinationId;else if(v===source.email)patch[field]=destination.email;else if(Array.isArray(v)&&v.some(x=>x===sourceId||x===source.email))patch[field]=[...new Set(v.map(x=>x===sourceId?destinationId:x===source.email?destination.email:x))];}if(Object.keys(patch).length){await db[entry.entity].update(row.id,patch);changed++;}}
   if(rows.length<100)break;
  }counts[entry.entity]=(counts[entry.entity]||0)+changed;
 await db.PersonnelTransferBackup.update(job.id,{manifest:{...job.manifest,counts,profile_applied:true,cursor:job.manifest.entities.indexOf(entry)+(changed<20?1:0)}});
 }
 if(cursor+1<job.manifest.entities.length||Object.values(counts).some(v=>false))return Response.json({success:true,pending:true,cursor:cursor+1,total:job.manifest.entities.length});
 // Reassign current reporting lines without rewriting historical audit actors.
 const people=await db.User.list('-updated_date',500);for(const p of people){const patch:any={};for(const prefix of ['supervisor','next_level_supervisor'])if(p[prefix+'_id']===sourceId||p[prefix+'_email']===source.email){patch[prefix+'_id']=destinationId;patch[prefix+'_email']=destination.email;patch[prefix+'_name']=[source.rank,source.last_name].filter(Boolean).join(' ');}if(Object.keys(patch).length)await db.User.update(p.id,patch);}
 await db.User.update(sourceId,{role:'user',rank:'Support Staff',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none',hidden_portals:[],portal_approved:true,account_status:'active',transferred_to_user_id:destinationId,unit_number:'',badge_number:'',profile_photo_url:'',profile_photo_original_url:''});
 for(const id of [sourceId,destinationId]){const sessions=await db.PortalAuthSession.filter({user_id:id},'-created_date',500);for(const session of sessions)await db.PortalAuthSession.update(session.id,{revoked:true,revoked_at:new Date().toISOString()});}
 await db.PersonnelTransferBackup.update(job.id,{status:'complete',manifest:{...job.manifest,counts},capability_hash:''});
 return Response.json({success:true,counts});
 }catch(error){await db.PersonnelTransferBackup.update(job.id,{status:'failed',last_error:String(error?.message||error).slice(0,300)});return Response.json({error:'Transfer stopped safely; the protected backup is retained.'},{status:500});}
}
