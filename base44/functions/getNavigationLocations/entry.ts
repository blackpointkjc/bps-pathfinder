import { createClientFromRequest } from 'npm:@base44/sdk';
const lower=(value:any)=>String(value||'').trim().toLowerCase();
Deno.serve(async req=>{
  try {
    const api=createClientFromRequest(req); const user=await api.auth.me();
    if(!user)return Response.json({error:'Sign in required'},{status:401});
    const roles=new Set([user.role,...(user.additional_roles||[])].map(lower));
    const blocked=['client','student','pending'].some(role=>roles.has(role)) || ['client','student','pending'].includes(lower(user.user_type)) || !!user.termination_date;
    const allowed=['admin','officer','supervisor','dispatch','cad_access','full_access'].some(role=>roles.has(role)) || ['officer','unarmed officer','senior officer','corporal','sergeant','first sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel'].includes(lower(user.rank));
    if(blocked||!allowed)return Response.json({error:'Operational access required'},{status:403});
    const locations:any[]=[];
    for(let skip=0;skip<10000;skip+=500){
      const page=await api.asServiceRole.entities.Location.list('-id',500,skip);
      locations.push(...page.map(row=>({id:row.id,site_name:row.site_name,address:row.address,latitude:row.latitude,longitude:row.longitude,division:row.division,subdivision:row.subdivision,active:row.active})));
      if(page.length<500)return Response.json({locations});
    }
    return Response.json({error:'Property directory exceeds the complete lookup limit'},{status:503});
  }catch(error){return Response.json({error:error?.message||'Managed properties unavailable'},{status:500});}
});
