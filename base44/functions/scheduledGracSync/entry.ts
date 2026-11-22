import {createClientFromRequest} from 'npm:@base44/sdk';
import {handleGracIngestion} from '../ingestGractivecalls/entry.ts';
export default async function(req){
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 if(user.role!=='admin'||user.disabled||user.termination_date)return Response.json({error:'Server administrator access required'},{status:403});
 const run=()=>handleGracIngestion(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({scheduled:true,fast_sync:true})}));
 let response=await run();
 if(response.status<500)return response;
 let result=await response.clone().json().catch(()=>({}));
 if(/rate.limit|too many|429/i.test(String(result.error||''))){
  const seconds=Math.min(18,Math.max(3,Number(String(result.error).match(/retry after (\d+)/i)?.[1])||8));
  await new Promise(resolve=>setTimeout(resolve,seconds*1000));
  response=await run();if(response.status<500)return response;
  result=await response.clone().json().catch(()=>({}));
 }
 console.warn('GRAC server refresh deferred; workflow will continue',String(result.error||'source unavailable'));
 return Response.json({success:false,deferred:true,retryable:true,error:String(result.error||'Temporary source failure'),retry_after_seconds:25});
}
