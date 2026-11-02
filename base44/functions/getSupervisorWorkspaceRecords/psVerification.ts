export async function verifiedPS(sdk,user,request){
 const body=await request.clone().json().catch(()=>({}));
 if(!['inspections','writeups','force'].includes(String(body.kind||'').toLowerCase()))return true;
 
 const whole=String(user?.id)==='6ae7d733d4b1a647cd3e6f38'&&(user.additional_roles||[]).includes('full_access');
 if(!whole&&!(user?.additional_roles||[]).includes('ia'))return false;
 if(!whole&&user.ps_role!=='reviewer')return false;
 if(user?.disabled||user?.termination_date||['denied','suspended','terminated'].includes(String(user?.account_status||user?.employment_status||'').toLowerCase()))return false;
 const locks=await sdk.asServiceRole.entities.AccountLock.filter({user_id:user.id,locked:true},'-created_date',1);
 return !locks.length;
}
