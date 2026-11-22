import {createClientFromRequest} from 'npm:@base44/sdk';
import {companyGraphHealth} from '../../shared/companyGraph.ts';
import {handleWeeklyBilling} from '../generateWeeklyInvoices/entry.ts';
export default async function(req){
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 if(user.role!=='admin'||user.disabled||user.termination_date)return Response.json({error:'Server administrator access required'},{status:403});
 const started=new Date().toISOString(),graph=await companyGraphHealth();
 if(!graph.mail_send_granted){
  await sdk.asServiceRole.entities.AccountingAutomationRun.create({job:'retry_verified_invoice_delivery',mode:'server_workflow',started_at:started,completed_at:new Date().toISOString(),status:'held',held_count:1,reason:graph.error||'Company Graph requires Mail.Send application permission with administrator consent.'});
  return Response.json({success:true,held:true,reason:'Company Graph Mail.Send application permission is not yet available.'});
 }
 const response=await handleWeeklyBilling(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({scheduled:true,action:'send_ready_drafts'})}));
 const result=await response.clone().json().catch(()=>({}));
 await sdk.asServiceRole.entities.AccountingAutomationRun.create({job:'retry_verified_invoice_delivery',mode:'server_workflow',started_at:started,completed_at:new Date().toISOString(),status:result.error?'failed':'completed',sent_count:Number(result.sent)||0,failed_count:Number(result.failed)||0,held_count:Number(result.held)||0,reason:String(result.error||'')});
 return response;
}
