import {createClientFromRequest} from 'npm:@base44/sdk';
import {companyGraphHealth} from '../../shared/companyGraph.ts';
Deno.serve(async(req)=>{
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 console.info('COMPANY_JOB_CHECK_STARTED',JSON.stringify({authenticated:!!user,role:user?.role||''}));
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 if(user.role!=='admin'||user.disabled)return Response.json({error:'Administrator access required'},{status:403});
 const graph=await companyGraphHealth();
 const counters=await sdk.asServiceRole.entities.CadCounter.filter({counter_key:'dispatch_call'},'-updated_date',1).catch(()=>[]);
 const result={server_auth:'verified_platform_admin',graph,grac:counters[0]?{last_poll_at:counters[0].last_source_poll_at,last_poll_status:counters[0].last_source_poll_status,duration_ms:counters[0].last_source_poll_duration_ms}:null};
 await sdk.asServiceRole.entities.SystemScanRun.create({hour_key:'company-job-check:'+new Date().toISOString(),status:graph.mail_send_granted?'healthy':'issues_found',areas_checked:2,scanned_at:new Date().toISOString(),audit_json:JSON.stringify(result),triggered_by:'Company server authentication verification'});
 console.info('COMPANY_JOB_HEALTH',JSON.stringify(result));return Response.json(result);
});
