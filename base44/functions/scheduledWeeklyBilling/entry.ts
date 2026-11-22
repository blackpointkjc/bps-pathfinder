import {createClientFromRequest} from 'npm:@base44/sdk';
import {handleWeeklyBilling} from '../generateWeeklyInvoices/entry.ts';
export default async function(req){
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 if(user.role!=='admin'||user.disabled||user.termination_date)return Response.json({error:'Server administrator access required'},{status:403});
 const started=new Date().toISOString();
 const response=await handleWeeklyBilling(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({scheduled:true,action:'scheduled'})}));
 const result=await response.clone().json().catch(()=>({}));
 await sdk.asServiceRole.entities.AccountingAutomationRun.create({job:'weekly_client_invoices',mode:'server_workflow',started_at:started,completed_at:new Date().toISOString(),status:result.error?'failed':result.skipped===true?'skipped':'completed',created_count:Number(result.created)||0,sent_count:Number(result.sent)||0,failed_count:Number(result.delivery_failed)||0,held_count:Number(result.held)||0,reason:String(result.reason||result.error||'')});
 return response;
}
