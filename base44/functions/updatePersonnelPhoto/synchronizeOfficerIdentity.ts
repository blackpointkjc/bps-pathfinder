export async function synchronizeOfficerIdentity(entities: any, user: any, previous: any = null) {
  const emails = [...new Set([user.email,user.work_email,user.pathfinder_email,...(user.email_aliases || [])].filter(Boolean).map((v: any) => String(v).trim().toLowerCase()))];
  const warnings: string[] = [];
  const identity = { rank: user.rank || '', unit_number: String(user.unit_number || '') };
  for (const [name,query] of [['OfficerRoster',{ email: { $in:emails } }],['ActiveOfficer',{ officer_email: { $in:emails } }],['Unit',{ user_id:user.id }]] as const) {
    try {
      const rows = await entities[name].filter(query, '-updated_date', 1000);
      for (const row of rows || []) {
        const fields = name === 'ActiveOfficer' ? { ...identity, profile_photo_url:user.profile_photo_url || '' } : name === 'Unit' ? { unit_id:identity.unit_number, label:[identity.rank,user.last_name].filter(Boolean).join(' ') || user.full_name || user.email } : identity;
        const patch = Object.fromEntries(Object.entries(fields).filter(([key,value]) => String(row[key] ?? '') !== String(value)));
        if (Object.keys(patch).length) await entities[name].update(row.id, patch);
      }
    } catch (error: any) { warnings.push(name + ' identity sync needs retry.'); console.warn(name + ' identity sync failed',error?.message); }
  }
  if (previous && String(previous.profile_photo_url||'') !== String(user.profile_photo_url||'')) {
    for (const name of ['OfficerChatMessage','SupervisorChatMessage']) {
      try {
        let offset=0;
        while(true){
          const rows=await entities[name].filter({sender_email:{$in:emails}},'created_date',100,offset);
          for (const row of rows||[]) if(row.sender_photo_url!==user.profile_photo_url)await entities[name].update(row.id,{sender_photo_url:user.profile_photo_url||''});
          if(!rows||rows.length<100)break;
          offset+=100;
        }
      }catch{warnings.push(name+' portrait synchronization needs retry.');}
    }
  }
  return warnings;
}
