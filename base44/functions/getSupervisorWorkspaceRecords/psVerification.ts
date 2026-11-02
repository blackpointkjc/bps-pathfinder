export async function verifiedPS(sdk,user,request){
 const body=await request.clone().json().catch(()=>({}));
 if(!['inspections','writeups','force'].includes(String(body.kind||'').toLowerCase()))return true;
 
 // Native supervisor tools use the main portal session and organizational scope.
 if(user?.disabled||user?.termination_date||['denied','suspended','terminated'].includes(String(user?.account_status||user?.employment_status||'').toLowerCase()))return false;
 const locks=await sdk.asServiceRole.entities.AccountLock.filter({user_id:user.id,locked:true},'-created_date',1);
 return !locks.length;
}
