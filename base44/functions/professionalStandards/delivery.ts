import nodemailer from 'npm:nodemailer@6.9.16';
export async function companyDelivery(base44,to,subject,body,actor=null,html=false){
 const mailboxes=await base44.asServiceRole.entities.CompanyImapMailbox.filter({active:true},'-updated_date',100);
 const admin=actor?.role==='admin'||(actor?.additional_roles||[]).includes('full_access');
 const approved=mailboxes.filter(m=>m.approved_by_company===true&&m.password&&m.smtp_host);
 const ia=approved.find(m=>String(m.mailbox_email||'').toLowerCase()==='ia@blackpointkjc.com');
 const system=ia||approved.find(m=>String(m.mailbox_email||'').toLowerCase()==='management@blackpointkjc.com');
 const authorizedSystem=admin||['reviewer','investigator'].includes(actor?.ps_role)||(actor?.additional_roles||[]).some(r=>['hr','trainer'].includes(r));
 const owned=actor?approved.find(m=>m.user_id===actor.id):null;
 const mailbox=actor?(owned||(authorizedSystem?system:null)):system;
 if(!mailbox)throw new Error('No approved sending mailbox is configured.');
 const transport=nodemailer.createTransport({host:String(mailbox.smtp_host).toLowerCase()==='imap.purelymail.com'?'smtp.purelymail.com':mailbox.smtp_host,port:Number(mailbox.smtp_port||465),secure:mailbox.smtp_secure!==false,auth:{user:mailbox.username,pass:mailbox.password},connectionTimeout:10000,socketTimeout:15000});
 const result=await transport.sendMail({from:{name:html?'BPS Pathfinder Accounts':'Black Point Professional Standards',address:mailbox.mailbox_email},replyTo:html?(mailbox.reply_to||mailbox.mailbox_email):'IA@blackpointkjc.com',to,subject,...(html?{html:body}:{text:body})});
 if(result.rejected?.length||!result.accepted?.length)throw new Error('Email was not accepted for delivery.');
 return true;
}
