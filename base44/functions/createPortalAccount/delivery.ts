// Direct authenticated Microsoft Graph delivery replaces credit-based SendEmail.
import {sendCreditFreeEmail} from '../creditFreeEmail.ts';
export async function companyDelivery(base44:any,to:string,subject:string,body:string,actor:any=null,html=false){
 return sendCreditFreeEmail(base44,{to,subject,body});
}
