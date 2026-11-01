import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
const compile=(source,name,deps={})=>new Function(...Object.keys(deps),transformSync(source.replace(/^import .*;\n/gm,'').replaceAll('export ',''),{loader:'ts',target:'es2022'}).code+';return '+name+';')(...Object.values(deps));
for(const folder of ['professionalStandards','professionalStandardsDeadlines','createPortalAccount']){
 let routed=0,smtp=0;
 const delivery=compile(fs.readFileSync('base44/functions/'+folder+'/delivery.ts','utf8'),'companyDelivery',{
  nodemailer:{createTransport:()=>({sendMail:async()=>{smtp++;return {accepted:['test@example.invalid']};}})},
  sendManagementEmail:async(_sdk,to,subject,body,html)=>{routed++;assert.equal(to,'test@example.invalid');assert.ok(subject);assert.ok(body);return true;}
 });
 const sdk={asServiceRole:{entities:{CompanyImapMailbox:{filter:async()=>[{user_id:'other',mailbox_email:'other@example.invalid',active:true,approved_by_company:true,password:'test-only',smtp_host:'smtp.example.invalid'}]}}}};
 assert.equal(await delivery(sdk,'test@example.invalid','Test subject','Test body',{id:'admin',role:'admin'},true),true);
 assert.equal(routed,1,'administrator invitation must use management Outlook when no owned SMTP sender exists');assert.equal(smtp,0,'never borrow an unrelated employee mailbox');
}
let requests=[],updated;
const sdk={asServiceRole:{entities:{
 OutlookSharedMailbox:{filter:async()=>[{user_id:'management-owner'}]},
 MicrosoftOAuthCredential:{filter:async()=>[{id:'test-credential',refresh_token:'test-refresh',scope:'Mail.Send Mail.Send.Shared User.Read offline_access'}],update:async(_id,patch)=>{updated=patch;}}
}}};
const fakeFetch=async(url,options)=>{
 requests.push({url,options});
 if(url.includes('oauth2/v2.0/token')){assert.equal(options.body.get('refresh_token'),'test-refresh');return {ok:true,json:async()=>({access_token:'test-access',refresh_token:'test-rotated',scope:'Mail.Send Mail.Send.Shared'})};}
 assert.equal(options.headers.Authorization,'Bearer test-access');
 const body=JSON.parse(options.body);assert.equal(body.message.toRecipients[0].emailAddress.address,'test@example.invalid');assert.equal(body.message.replyTo[0].emailAddress.address,'IA@blackpointkjc.com');return {ok:true,status:202};
};
const send=compile(fs.readFileSync('base44/functions/professionalStandards/graphDelivery.ts','utf8'),'sendManagementEmail',{fetch:fakeFetch,AbortSignal});
assert.equal(await send(sdk,'test@example.invalid','Test subject','Test body'),true);assert.equal(requests.length,2);assert.equal(updated.refresh_token,'test-rotated');
console.log('PASS: account invitations and IA mail use the existing management Outlook sender when SMTP is unavailable; unrelated employee mailboxes are never borrowed; token refresh and Graph delivery are validated without sending email.');
const fullSecurity=fs.readFileSync('base44/functions/professionalStandards/security.ts','utf8');
let notifySource=fullSecurity.slice(fullSecurity.indexOf('export async function notify'),fullSecurity.indexOf('export {createClientFromRequest}'));
notifySource=notifySource.replace("const {companyDelivery}=await import('./delivery.ts');","const companyDelivery=deliver;");
const notifications=[];
const queueSdk={asServiceRole:{entities:{PSNotification:{
 create:async value=>{const row={...value,id:'message-1'};notifications.push(row);return row;},
 update:async(id,patch)=>{const row=notifications.find(v=>v.id===id);Object.assign(row,patch);return row;},
 get:async id=>notifications.find(v=>v.id===id)
}},integrations:{Core:{SendEmail:async()=>{throw Error('unavailable');}}}}};
let connectionRestored=false;
const queue=compile(notifySource,'notify',{deliver:async()=>{if(!connectionRestored)throw Error('Management Microsoft authorization expired');return true;}});
assert.equal(await queue(queueSdk,'test@example.invalid','Test assignment','Test body',{id:'reviewer'}),false);
assert.equal(notifications[0].status,'failed');assert.match(notifications[0].last_error,/Reconnect/);
connectionRestored=true;
assert.equal(await queue(queueSdk,'test@example.invalid','Test assignment','Test body',{id:'reviewer'},notifications[0].id),true);
assert.equal(notifications.length,1);assert.equal(notifications[0].status,'sent');assert.equal(notifications[0].attempts,2);assert.equal(notifications[0].last_error,'');
console.log('PASS: failed email is retained with its connection error and can be retried without duplicating the notification.');
