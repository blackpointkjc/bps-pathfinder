import {createClientFromRequest} from 'npm:@base44/sdk';
import {companyGraphHealth} from '../../shared/companyGraph.ts';
export default async function(req){
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(!user)return Response.json({error:'Unauthorized'},{status:401});
 if(user.role!=='admin'||user.disabled)return Response.json({error:'Administrator access required'},{status:403});
 const graph=await companyGraphHealth();
 const counters=await sdk.asServiceRole.entities.CadCounter.filter({counter_key:'dispatch_call'},'-updated_date',1).catch(()=>[]);
 const result={server_auth:'verified_platform_admin',graph,grac:counters[0]?{last_poll_at:counters[0].last_source_poll_at,last_poll_status:counters[0].last_source_poll_status,duration_ms:counters[0].last_source_poll_duration_ms}:null};
 console.info('COMPANY_JOB_HEALTH',JSON.stringify(result));return Response.json(result);
}
