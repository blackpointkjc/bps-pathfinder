import {createClientFromRequest} from 'npm:@base44/sdk';
import {handleGracIngestion} from '../ingestGractivecalls/entry.ts';
export default async function(req){
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 if(user.role!=='admin'||user.disabled||user.termination_date)return Response.json({error:'Server administrator access required'},{status:403});
 return handleGracIngestion(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({scheduled:true,fast_sync:true})}));
}
