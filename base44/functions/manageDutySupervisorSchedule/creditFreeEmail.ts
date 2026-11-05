import {sendManagementEmail} from './graphDelivery.ts';
export async function sendCreditFreeEmail(base44:any,payload:any){
 const to=String(payload?.to||'').trim(),subject=String(payload?.subject||'').trim(),body=String(payload?.body||payload?.html||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!subject||!body)throw Error('Valid email recipient, subject and content are required.');
 return sendManagementEmail(base44,to,subject,body,/<[a-z][\s\S]*>/i.test(body));
}
