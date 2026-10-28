import {createClientFromRequest} from 'npm:@base44/sdk';
const cache=new Map<string,{at:number,data:any}>();
Deno.serve(async req=>{try{
 const api=createClientFromRequest(req),user=await api.auth.me();
 const roles=[user?.role,...(user?.additional_roles||[])].map(r=>String(r).toLowerCase());
 if(!user||user.termination_date||['client','student','pending'].some(r=>roles.includes(r)||String(user.user_type).toLowerCase()===r))return Response.json({error:'Operational sign-in required'},{status:403});
 const body=await req.json(),lat=Number(body.latitude),lng=Number(body.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return Response.json({error:'Invalid map center'},{status:400});
 const key=lat.toFixed(3)+','+lng.toFixed(3),saved=cache.get(key);if(saved&&Date.now()-saved.at<3600000)return Response.json(saved.data);
 const query=`[out:json][timeout:20][maxsize:16000000];(way[highway](around:1500,${lat},${lng});node[place][name](around:1500,${lat},${lng}););out geom;`;
 const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('Map provider is busy. Retry later.');
 const text=await response.text();if(text.length>8000000)throw new Error('Area too detailed to save');
 const payload=JSON.parse(text);if(payload.remark||!payload.elements?.length)throw new Error('Incomplete map. Retry later.');
 const features=payload.elements.flatMap((item:any)=>item.type==='way'&&item.geometry?.length>1?[{type:'Feature',properties:{name:item.tags?.name||''},geometry:{type:'LineString',coordinates:item.geometry.map((p:any)=>[p.lon,p.lat])}}]:item.type==='node'&&item.tags?.name?[{type:'Feature',properties:{name:item.tags.name},geometry:{type:'Point',coordinates:[item.lon,item.lat]}}]:[]);
 const data={center:[lat,lng],radius:1500,downloadedAt:new Date().toISOString(),attribution:'© OpenStreetMap contributors · ODbL',geojson:{type:'FeatureCollection',features}};
 if(cache.size>=50)cache.delete(cache.keys().next().value!);cache.set(key,{at:Date.now(),data});return Response.json(data);
}catch(error){return Response.json({error:error?.message||'Map download failed'},{status:503});}});
