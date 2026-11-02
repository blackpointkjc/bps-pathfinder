const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import {createClientFromRequest} from 'npm:@base44/sdk';
import {synchronizeOfficerIdentity} from './synchronizeOfficerIdentity.ts';
export default async function(req){
 try{
  const sdk=createClientFromRequest(req),me=await sdk.auth.me().then(__portalAppIdentity).catch(()=>null);
  if(!me)return Response.json({error:'Sign in to update a photo.'},{status:401});
  const checked=await sdk.functions.invoke('portalSession',{action:'check'});
  if(!checked.data?.success)return Response.json({error:'Sign in again before updating a photo.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
  const body=await req.json(),id=String(body.user_id||me.id);
  if(id!==me.id&&me.role!=='admin')return Response.json({error:'You may only replace your own profile photo.'},{status:403});
  const photo=String(body.profile_photo_url||''),original=String(body.profile_photo_original_url||photo);
  if([photo,original].some(v=>v.length>15000000||v&&!/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(v)))return Response.json({error:'Upload a supported profile photo first.'},{status:400});
  const db=sdk.asServiceRole.entities,previous=await db.User.get(id);
  await db.User.update(id,{profile_photo_url:photo,profile_photo_original_url:original});
  const saved=await db.User.get(id);
  if(saved.profile_photo_url!==photo||saved.profile_photo_original_url!==original)return Response.json({error:'Photo replacement was not confirmed. Please retry.'},{status:503});
  let warnings:any[]=[];
  try{warnings=await synchronizeOfficerIdentity(db,saved,previous);}catch(error:any){warnings=['Photo saved; roster propagation will retry: '+String(error?.message||error).slice(0,150)];}
  await db.AuditLog.create({entity_type:'User',entity_id:id,action:'update',actor_id:me.id,actor_name:me.email,timestamp:new Date().toISOString(),description:'Profile portrait replaced and synchronized.'}).catch(()=>null);
  return Response.json({success:true,user_id:id,profile_photo_url:photo,profile_photo_original_url:original,warnings});
 }catch{return Response.json({error:'Photo could not be updated. Please retry.'},{status:500});}
}
