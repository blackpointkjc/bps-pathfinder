// Base44 sends Core.SendEmail through the app’s verified no-reply domain.
export async function companyDelivery(base44,to,subject,body,actor=null,html=false){
 const result=await base44.asServiceRole.integrations.Core.SendEmail({to,subject,body,from_name:'BlackPoint Pathfinder'});
 if(result?.error||result?.success===false)throw new Error('The no-reply email provider rejected delivery.');
 return true;
}
