import {createClientFromRequest} from 'npm:@base44/sdk';
import {portalSessionState} from '../../shared/portalLoginGuard.ts';
const clean=(v:any,n=180)=>String(v??'').trim().slice(0,n);
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const VIDEO='https://media.base44.com/videos/public/694de31c7e0f5645fb95de52/8b3f7aa83_pathfinder-sign-in-background.mp4';
const POSTER='https://media.base44.com/images/public/694de31c7e0f5645fb95de52/a30c3100c_pathfinder_login_video_preview.jpg';
const activePerson=(u:any)=>!u.disabled&&!u.termination_date&&!['terminated','suspended','denied'].includes(String(u.employment_status||u.account_status||'').toLowerCase());
const hasRole=(u:any,role:string)=>activePerson(u)&&[u.role,...(u.additional_roles||[])].some(v=>String(v).toLowerCase()===role);
const personName=(u:any)=>[u.first_name,u.last_name].filter(Boolean).join(' ').trim()||u.full_name||u.email;
async function roster(sdk:any){const rows=[];for(let skip=0;;skip+=500){const page=await sdk.asServiceRole.entities.User.list('id',500,skip);rows.push(...page);if(page.length<500)return rows;}}
const originalVideo=()=>({kind:'video',title:'BlackPoint Field Operations',caption:'The fleet and the people behind the mission',video_url:VIDEO,image_url:POSTER,active:true,sort_order:0,builtin:true});
export default async function(req:Request){
 let phase='start';
 try{
  const sdk=createClientFromRequest(req),db=sdk.asServiceRole.entities.PortalShowcase;
  const body=await req.json().catch(()=>({}));
  if(body.action==='public'){
   phase='read public showcase';const rows=await db.list('-created_date',100);
   const dateParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
   const now=`${dateParts.find(p=>p.type==='year')?.value}-${dateParts.find(p=>p.type==='month')?.value}`;
   const active=rows.filter((r:any)=>r.active===true);
   const gallery=[...(rows.some((r:any)=>r.kind==='video')?active.filter((r:any)=>r.kind==='video'):[originalVideo()]),...active.filter((r:any)=>r.kind==='photo')]
    .sort((a:any,b:any)=>Number(a.sort_order||0)-Number(b.sort_order||0));
   const honorees=active.filter((r:any)=>['officer','supervisor'].includes(r.kind)&&r.month===now).sort((a:any,b:any)=>String(b.updated_date||'').localeCompare(String(a.updated_date||'')));
   if(honorees.some((r:any)=>r.user_id)){
    const people=await sdk.asServiceRole.entities.User.filter({id:{$in:honorees.map((r:any)=>r.user_id).filter(Boolean)}});
    for(const r of honorees){const person=people.find((u:any)=>u.id===r.user_id);if(person){r.title=personName(person);r.image_url=person.profile_photo_url||person.profile_photo_original_url||'';}else if(r.user_id){r.active=false;}}
   }
   const safe=(r:any)=>({id:r.id,kind:r.kind,title:r.title,caption:r.caption,image_url:r.image_url,video_url:r.video_url||'',month:r.month});
   return json({photos:gallery.slice(0,20).map(safe),recognition:['officer','supervisor'].map(kind=>honorees.find((r:any)=>r.kind===kind&&r.active!==false)).filter(Boolean).map(safe)});
  }
  phase='authenticate administrator';
  const me=await sdk.auth.me().catch(()=>null);
  if(!me?.id||me.disabled||me.termination_date||me.role!=='admin')return json({error:'Administrator access required'},403);
  // Base44 session remains authoritative; do not depend on optional profile-sync
  // availability for the branding manager to load.
  phase='check session';
  const state=await portalSessionState(req,sdk,me).catch(()=>({state:'unavailable'}));
  if(state.state==='invalid')return json({error:'Your session expired. Sign in again.'},401);
  if(body.action==='people'){
   const people=await roster(sdk);
   return json({people:people.filter((u:any)=>hasRole(u,'officer')||hasRole(u,'supervisor')).map((u:any)=>({id:u.id,name:personName(u),rank:u.rank||'',roles:['officer','supervisor'].filter(role=>hasRole(u,role)),profile_photo_url:u.profile_photo_url||u.profile_photo_original_url||''})).sort((a:any,b:any)=>a.name.localeCompare(b.name))});
  }
  if(body.action==='list'){
   phase='list records';const items=await db.list('-created_date',100);
   return json({items:items.some((r:any)=>r.kind==='video')?items:[originalVideo(),...items]});
  }
  if(body.action==='save'){
   const r={...(body.item||{})};
   if(['officer','supervisor'].includes(r.kind)){
    const person=await sdk.asServiceRole.entities.User.get(clean(r.user_id,120)).catch(()=>null);
    if(!person||!hasRole(person,r.kind))return json({error:'Select an employee with the '+r.kind+' role'},400);
    r.title=personName(person);r.image_url=person.profile_photo_url||person.profile_photo_original_url||'';
   }
   if(!['photo','video','officer','supervisor'].includes(r.kind))return json({error:'Choose a valid showcase type'},400);
   if(!clean(r.title,110))return json({error:'Enter a title or name'},400);
   const image=clean(r.image_url,700000),video=clean(r.video_url,2000),month=clean(r.month,7);
   if(image&&!(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||/^https:\/\//.test(image)))return json({error:'Invalid photo format'},400);
   if(image.length>650000)return json({error:'Image too large. Choose a smaller photo.'},413);
   if(r.kind==='photo'&&!image)return json({error:'A gallery photo is required'},400);
   if(r.kind==='video'&&!/^https:\/\/[^\s]+\.(?:mp4|webm)(?:\?[^\s]*)?$/i.test(video))return json({error:'Enter a secure MP4 or WebM video URL'},400);
   if(['officer','supervisor'].includes(r.kind)&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return json({error:'Select a valid award month'},400);
   const value={user_id:['officer','supervisor'].includes(r.kind)?clean(r.user_id,120):'',kind:r.kind,title:clean(r.title,110),caption:clean(r.caption,240),image_url:image,video_url:r.kind==='video'?video:'',month:['photo','video'].includes(r.kind)?'':month,active:r.active!==false,sort_order:Math.min(9999,Math.max(0,Number(r.sort_order)||0)),updated_by:me.email||me.id};
   phase='save record';
   if(['officer','supervisor'].includes(value.kind)&&value.active){
    const existing=await db.filter({kind:value.kind,month:value.month},'-created_date',100);
    for(const p of existing)if(p.id!==r.id&&p.active)await db.update(p.id,{active:false});
   }
   let id=clean(r.id,120);
   if(r.kind==='video'&&!id){const previous=await db.filter({kind:'video'},'-created_date',1);id=previous[0]?.id||'';}
   const saved=id?await db.update(id,value):await db.create(value);
   return json({success:true,id:saved?.id||id});
  }
  if(body.action==='delete'){
   const id=clean(body.id,120);if(!id)return json({error:'Cannot delete built-in video. Disable it in Edit.'},400);
   phase='delete record';await db.delete(id);return json({success:true});
  }
  return json({error:'Unknown operation'},400);
 }catch(error){console.error('portalShowcase',phase,String((error as Error)?.message||error));return json({error:'Showcase service unavailable',code:'SHOWCASE_BACKEND_ERROR',phase},503);}
}
