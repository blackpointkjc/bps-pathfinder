export async function verifiedPS(sdk,user,request){
 const body=await request.clone().json().catch(()=>({}));
 if(!['inspections','writeups','force'].includes(String(body.kind||'').toLowerCase()))return true;
 
 const whole=String(user?.id)==='6a72bbee2842d6338cbae513'&&(user.additional_roles||[]).includes('full_access');
 if(!whole&&!(user?.additional_roles||[]).includes('ia'))return false;
 if(!whole&&user.ps_role!=='reviewer')return false;
 if(user?.disabled||user?.termination_date||['denied','suspended','terminated'].includes(String(user?.account_status||user?.employment_status||'').toLowerCase()))return false;
 const token=String(body.ps_access||'');
 if(!token)return false;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const rows=await sdk.asServiceRole.entities.PSAccess.filter({user_id:user.id,session_hash:digest,verified:true},'-created_date',1);
 return !!rows[0]&&Date.parse(rows[0].session_expires_at)>Date.now();
}
