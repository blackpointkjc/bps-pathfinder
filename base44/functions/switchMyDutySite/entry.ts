import { createClientFromRequest } from 'npm:@base44/sdk';
const clean=(v:unknown)=>String(v||'').trim();
const lower=(v:unknown)=>clean(v).toLowerCase();
const distance=(a:number,b:number,c:number,d:number)=>{const rad=Math.PI/180,R=6371000,da=(c-a)*rad,db=(d-b)*rad,h=Math.sin(da/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(db/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));};
const point=(p:any)=>Array.isArray(p)?{lat:Number(p[0]),lng:Number(p[1])}:{lat:Number(p?.lat),lng:Number(p?.lng)};
const inPolygon=(lat:number,lng:number,raw:any[])=>{const polygon=raw.map(point).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));if(polygon.length<3)return null;let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a.lng>lng)!==(b.lng>lng))&&(lat<((b.lat-a.lat)*(lng-a.lng))/((b.lng-a.lng)||Number.EPSILON)+a.lat))inside=!inside;}return inside;};
const edgeDistance=(lat:number,lng:number,raw:any[])=>{const poly=raw.map(point);let near=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],x=(a.lng-lng)*111320*Math.cos(lat*Math.PI/180),y=(a.lat-lat)*111320,dx=(b.lng-a.lng)*111320*Math.cos(lat*Math.PI/180),dy=(b.lat-a.lat)*111320,t=(dx*dx+dy*dy)?Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy))):0;near=Math.min(near,Math.hypot(x+t*dx,y+t*dy));}return near;};
Deno.serve(async req=>{
  try{
    const base44=createClientFromRequest(req);
    const me=await base44.auth.me().catch(()=>null);
    if(!me?.email)return Response.json({error:'Sign in before switching duty sites'},{status:401});
    const input=await req.json().catch(()=>({}));
    const activeId=clean(input.active_entry_id),siteId=clean(input.location_id);
    const lat=Number(input.latitude),lng=Number(input.longitude),accuracy=Number(input.accuracy);
    if(!activeId||!siteId||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy>1500)return Response.json({error:'Current shift, destination site and recent usable GPS coordinates are required'},{status:400});
    const [active,site]=await Promise.all([
      base44.asServiceRole.entities.TimeEntry.get(activeId).catch(()=>null),
      base44.asServiceRole.entities.Location.get(siteId).catch(()=>null)
    ]);
    if(!active||lower(active.officer_email)!==lower(me.email))return Response.json({error:'Your current duty shift could not be verified. Refresh Time Clock.'},{status:403});
    if(active.archived===true||active.clock_out)return Response.json({error:'Your existing duty segment already ended. Refresh Time Clock before switching.'},{status:409});
    if(!site||site.active===false)return Response.json({error:'Destination site is not available'},{status:404});
    const oldSite=clean(active.location).split(' - ')[0];
    if(lower(oldSite)===lower(site.site_name))return Response.json({error:'You are already assigned to this site.'},{status:400});
    if(!site.is_special_event&&site.allow_clock_in_anywhere!==true){
      const polygon=Array.isArray(site.geofence_polygon)&&site.geofence_polygon.length>=3?site.geofence_polygon:Array.isArray(site.property_monitoring_polygon)&&site.property_monitoring_polygon.length>=3?site.property_monitoring_polygon:[];
      if(polygon.length>=3){if(!inPolygon(lat,lng,polygon)&&edgeDistance(lat,lng,polygon)>50)return Response.json({error:`Outside the approved site boundary for ${site.site_name}`},{status:403});}
      else{const slat=Number(site.latitude),slng=Number(site.longitude);if(!Number.isFinite(slat)||!Number.isFinite(slng)||distance(lat,lng,slat,slng)>Number(site.geofence_radius_meters||100))return Response.json({error:`Outside the geofence for ${site.site_name}`},{status:403});}
    }
    // Close the current segment first: createVerifiedTimeEntry rejects a second
    // open segment with HTTP 409. If create fails, reopen the old segment.
    const now=new Date().toISOString();
    const completed={clock_out:now,clock_out_latitude:lat,clock_out_longitude:lng,
      notes:[active.notes,`Duty site transfer to ${site.site_name} at ${now}`].filter(Boolean).join('\n')};
    await base44.asServiceRole.entities.TimeEntry.update(activeId,completed);
    try{
      const next=await base44.asServiceRole.entities.TimeEntry.create({
        officer_email:lower(me.email),
        clock_in:now,location:`${site.site_name} - ${site.address||''}`.trim(),
        clock_in_latitude:lat,clock_in_longitude:lng,clock_in_accuracy:accuracy,
        location_verification_status:accuracy<=100?'verified':'low_accuracy_review',
        location_verification_note:accuracy>100?'Duty transfer with verified property boundary and reduced GPS accuracy':'',
        notes:`Continued duty segment transferred from ${oldSite} at ${now}.`,
      });
      return Response.json({success:true,entry:next,previous_entry_id:activeId,transferred_at:now,message:`Site changed to ${site.site_name}; duty session continued.`});
    }catch(error:any){
      const throttled=Number(error?.status||error?.response?.status)===429||/rate limit|429|too many requests/i.test(String(error?.message||error));
      const recovery=await base44.asServiceRole.entities.TimeEntry.update(activeId,{clock_out:null,clock_out_latitude:null,clock_out_longitude:null,notes:active.notes||''}).then(()=>true).catch(()=>false);
      return Response.json({error:recovery?`Site change was not saved; original duty shift remains active. ${error?.message||''}`:'Site change failed and original shift could not be reopened. Contact command immediately to correct the time ledger.',rollback_ok:recovery,rate_limited:throttled},{status:recovery?(throttled?429:502):500});
    }
  }catch(error:any){return Response.json({error:error?.message||'Duty-site switch failed'},{status:500});}
});
