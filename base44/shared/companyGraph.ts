const GRAPH='https://graph.microsoft.com/v1.0';
const env=name=>Deno.env.get(name)||'';
let cached=null;
export function companyGraphConfig(){
 return {tenant:env('GRAPH_TENANT_ID')||env('MICROSOFT_TENANT_ID')||env('IA_GRAPH_TENANT_ID')||'07f32330-fc73-4d73-a835-e9c47ba798c7',
 client:env('GRAPH_CLIENT_ID')||env('MICROSOFT_CLIENT_ID')||env('IA_GRAPH_CLIENT_ID'),
 secret:env('GRAPH_CLIENT_SECRET')||env('MICROSOFT_CLIENT_SECRET')||env('IA_GRAPH_CLIENT_SECRET'),
 sender:env('GRAPH_SENDER_EMAIL')||'management@blackpointkjc.com'};
}
function rolesFromToken(token){
 try{const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(part)).roles||[];}catch{return [];}
}
export async function companyGraphHealth(){
 const cfg=companyGraphConfig();
 if(!cfg.client||!cfg.secret)return {configured:false,mail_send_granted:false,error:'Company Graph application credentials are missing.'};
 try{const result=await getCompanyGraphAuthorization();return {configured:true,mail_send_granted:result.roles.includes('Mail.Send'),roles:result.roles,sender:cfg.sender};}
 catch(error){return {configured:true,mail_send_granted:false,error:error.message};}
}
async function getCompanyGraphAuthorization(){
 if(cached&&cached.expires>Date.now()+120000)return cached;
 const cfg=companyGraphConfig();
 if(!cfg.client||!cfg.secret)throw Error('Company Graph application credentials are missing. Configure GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET (or the existing IA_GRAPH credentials).');
 const response=await fetch('https://login.microsoftonline.com/'+encodeURIComponent(cfg.tenant)+'/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.client,client_secret:cfg.secret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw Error('Company Microsoft Graph application authorization failed: '+String(data.error||response.status)+'. Check the company app credential and tenant.');
 cached={token:String(data.access_token),roles:rolesFromToken(data.access_token),expires:Date.now()+Number(data.expires_in||3600)*1000};return cached;
}
export async function getCompanyGraphToken(){
 const auth=await getCompanyGraphAuthorization();
 if(!auth.roles.includes('Mail.Send'))throw Error('The company Graph application needs the Mail.Send APPLICATION permission with administrator consent. Personal Outlook connections are not used.');
 return auth.token;
}
export async function sendCompanyEmail({to,subject,body,html=false,from,replyTo}){
 const cfg=companyGraphConfig(),sender=from||cfg.sender;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to||'')))throw Error('A valid email recipient is required.');
 const token=await getCompanyGraphToken();
 const response=await fetch(GRAPH+'/users/'+encodeURIComponent(sender)+'/sendMail',{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({message:{subject:String(subject||'Pathfinder notification').slice(0,250),body:{contentType:html?'HTML':'Text',content:String(body||'')},from:{emailAddress:{address:sender,name:'BlackPoint Pathfinder'}},replyTo:[{emailAddress:{address:replyTo||sender}}],toRecipients:[{emailAddress:{address:String(to).trim()}}]},saveToSentItems:true})});
 if(response.status!==202){const data=await response.json().catch(()=>({}));throw Error('Company Graph email was not accepted ('+response.status+'): '+String(data?.error?.code||'sendMail failed')+'.');}
 return {accepted:true,provider:'microsoft_graph',request_id:response.headers.get('request-id')||''};
}
