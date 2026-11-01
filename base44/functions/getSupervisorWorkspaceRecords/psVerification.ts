export async function verifiedPS(sdk,user,request){
 if(user?.ps_role!=='reviewer'||user.role==='admin'||(user.additional_roles||[]).includes('full_access'))return true;
 const body=await request.clone().json().catch(()=>({}));
 const token=String(body.ps_access||'');
 if(!token)return false;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const rows=await sdk.asServiceRole.entities.PSAccess.filter({user_id:user.id,session_hash:digest,verified:true},'-created_date',1);
 return !!rows[0]&&Date.parse(rows[0].session_expires_at)>Date.now();
}
