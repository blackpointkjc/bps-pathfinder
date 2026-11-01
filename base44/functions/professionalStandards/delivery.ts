import {sendManagementEmail} from './graphDelivery.ts';
// IA correspondence always uses the shared IA mailbox linked by Colonel Hiers.
export async function companyDelivery(base44,to,subject,body,actor=null,html=false){
 return await sendManagementEmail(base44,to,subject,body,html);
}
