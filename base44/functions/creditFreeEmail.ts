// Central company-mail transport: no Base44 Core.SendEmail integration credits.
// Microsoft Graph is called directly using the configured management mailbox.
import {sendManagementEmail} from './createPortalAccount/graphDelivery.ts';
export async function sendCreditFreeEmail(base44:any,payload:any){
 const to=String(payload?.to||'').trim();
 const subject=String(payload?.subject||'').trim();
 const body=String(payload?.body||payload?.html||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!subject||!body)throw Error('Valid email recipient, subject and content are required.');
 return sendManagementEmail(base44,to,subject,body,/<[a-z][\s\S]*>/i.test(body));
}
