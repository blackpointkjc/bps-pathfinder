import {sendManagementEmail} from './graphDelivery.ts';
export async function companyDelivery(base44:any,to:string,subject:string,body:string,actor:any=null,html=false){
 return sendManagementEmail(base44,to,subject,body,html);
}
