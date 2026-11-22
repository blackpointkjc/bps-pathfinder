const humanName=value=>typeof value==='string'&&value.trim()&&!/^[a-f\d]{20,32}$/i.test(value.trim())&&!value.includes('@')?value.trim():'';
export async function reportOfficerName(base44:any,record:any){
 const users=base44.asServiceRole.entities.User;
 const ids=[record.issued_by_id,record.reporting_officer_id,record.officer_id,record.created_by_id].filter(value=>typeof value==='string'&&/^[a-f\d]{20,32}$/i.test(value));
 for(const id of [...new Set(ids)]){
  const user=await users.get(id).catch(()=>null);
  if(!user)continue;
  const name=[user.first_name,user.last_name].filter(Boolean).join(' ').trim()||humanName(user.full_name);
  if(name){const rank=humanName(user.rank);return rank&&!name.toLowerCase().startsWith(rank.toLowerCase())?rank+' '+name:name;}
 }
 const cached=[record.issued_by_name,record.reporting_officer_name,record.officer_name,record.complainant_name,record.filed_by_name,record.issued_by].map(humanName).find(Boolean);
 if(cached)return cached;
 const emails=[record.reporting_officer_email,record.officer_email,record.created_by,record.issued_by].filter(value=>typeof value==='string'&&value.includes('@'));
 for(const email of [...new Set(emails)]){
  const rows=await users.filter({email},'-created_date',1).catch(()=>[]);const user=rows?.[0];
  if(user){const name=[user.first_name,user.last_name].filter(Boolean).join(' ').trim()||humanName(user.full_name);if(name)return [humanName(user.rank),name].filter(Boolean).join(' ');}
 }
 return '';
}
