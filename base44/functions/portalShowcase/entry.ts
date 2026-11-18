import {createClientFromRequest} from 'npm:@base44/sdk';
import {portalSessionState} from '../../shared/portalLoginGuard.ts';
const text=(value:any,n=180)=>String(value??'').trim().slice(0,n);
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 try{
  const sdk=createClientFromRequest(req),db=sdk.asServiceRole.entities.PortalShowcase;
  const body=await req.json().catch(()=>({}));
  if(body.action==='public'){
   const all=await db.list('-created_date',100);
   const now=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
   const active=all.filter((r:any)=>r.active===true);
   const photos=active.filter((r:any)=>r.kind==='photo').sort((a:any,b:any)=>Number(a.sort_order||0)-Number(b.sort_order||0));
   const recognition=active.filter((r:any)=>['officer','supervisor'].includes(r.kind)&&r.month===now).sort((a:any,b:any)=>String(b.updated_date||'').localeCompare(String(a.updated_date||'')));
   const safe=(r:any)=>({id:r.id,kind:r.kind,title:r.title,caption:r.caption,image_url:r.image_url,month:r.month});
   return json({photos:photos.slice(0,20).map(safe),recognition:['officer','supervisor'].map(kind=>recognition.find((r:any)=>r.kind===kind)).filter(Boolean).map(safe)});
  }
  const me=await sdk.auth.me().catch(()=>null);
  if(!me?.id||me.disabled||me.termination_date||me.role!=='admin')return json({error:'Administrator access required'},403);
  const session=await portalSessionState(req,sdk,me).catch(()=>({state:'invalid'}));
  if(session.state==='invalid')return json({error:'Your administrator session expired. Sign in again.'},401);
  if(body.action==='list')return json({items:await db.list('-created_date',100)});
  if(body.action==='save'){
   const record=body.item||{};
   if(!['photo','officer','supervisor'].includes(record.kind))return json({error:'Choose a valid showcase type'},400);
   if(!text(record.title,110))return json({error:'Enter a title or recipient name'},400);
   const image=text(record.image_url,700000);
   if(image && !(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||/^https:\/\//.test(image)))return json({error:'Invalid photo format'},400);
   if(image.length>650000)return json({error:'Image is too large; choose a smaller photo'},413);
   const month=text(record.month,7);
   if(record.kind!=='photo'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return json({error:'Choose a valid recognition month'},400);
   const value={kind:record.kind,title:text(record.title,110),caption:text(record.caption,240),image_url:image,month:record.kind==='photo'?'':month,active:record.active!==false,sort_order:Math.max(0,Math.min(9999,Number(record.sort_order)||0)),updated_by:me.email||me.id};
   // One recipient of each category per month: replace the previous choice.
   if(record.kind!=='photo'&&value.active){
    const peers=await db.filter({kind:value.kind,month:value.month},'-created_date',100);
    for(const p of peers)if(p.id!==record.id&&p.active)await db.update(p.id,{active:false});
   }
   const saved=record.id?await db.update(text(record.id,120),value):await db.create(value);
   return json({success:true,id:saved?.id||record.id});
  }
  if(body.action==='delete'){
   const id=text(body.id,120);if(!id)return json({error:'Record ID required'},400);
   await db.delete(id);return json({success:true});
  }
  return json({error:'Unknown operation'},400);
 }catch(error){console.error('portalShowcase',String((error as Error)?.message||error));return json({error:'Showcase service unavailable. Please retry.'},503);}
}
