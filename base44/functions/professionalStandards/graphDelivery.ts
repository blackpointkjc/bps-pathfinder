const MANAGEMENT='management@blackpointkjc.com';
const GRAPH='https://graph.microsoft.com/v1.0';
const CLIENT='5cf1a58f-17d1-46d4-a7fd-ff5fcd7624eb';
const TENANT='07f32330-fc73-4d73-a835-e9c47ba798c7';
const ORIGIN='https://bpspf.blackpointkjc.com';
async function graphToken(base44: any) {
  const mailboxes = await base44.asServiceRole.entities.OutlookSharedMailbox.filter({
    mailbox_email: MANAGEMENT,
    active: true,
  }, '-updated_date', 1);
  const mailbox = mailboxes?.[0];
  if (!mailbox) throw new Error('Management Outlook mailbox is not configured.');

  const credentials = await base44.asServiceRole.entities.MicrosoftOAuthCredential.filter({
    user_id: mailbox.user_id,
    active: true,
  }, '-last_refreshed_at', 1);
  const credential = credentials?.[0];
  if (!credential?.refresh_token) throw new Error('Management Outlook authorization is unavailable.');

  const scope = String(credential.scope || 'Mail.Send Mail.Send.Shared User.Read offline_access');
  const response = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    body: new URLSearchParams({
      client_id: CLIENT,
      grant_type: 'refresh_token',
      refresh_token: String(credential.refresh_token),
      scope,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const detail = String(payload?.error_description || payload?.error || '');
    const expired = /AADSTS700084|refresh token.*expired|invalid_grant|interaction_required/i.test(detail);
    if (expired) {
      await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(credential.id, {
        last_error: 'Microsoft session expired; interactive sign-in required.',
        active: false,
      }).catch(() => null);
      throw new Error('The management Microsoft session has expired. An administrator must sign in again before BOLO email can be sent.');
    }
    throw new Error('Microsoft email authorization failed. An administrator should reconnect the management mailbox.');
  }
  await base44.asServiceRole.entities.MicrosoftOAuthCredential.update(credential.id, {
    refresh_token: String(payload.refresh_token || credential.refresh_token),
    scope: String(payload.scope || scope),
    last_refreshed_at: new Date().toISOString(),
    last_error: '',
    active: true,
  }).catch(() => null);
  return String(payload.access_token);
}

export async function sendManagementEmail(base44,to,subject,body,html=false){
 const access=await graphToken(base44);
 const response=await fetch(GRAPH+'/users/'+encodeURIComponent(MANAGEMENT)+'/sendMail',{method:'POST',headers:{Authorization:'Bearer '+access,'content-type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({message:{subject,body:{contentType:html?'HTML':'Text',content:body},from:{emailAddress:{address:MANAGEMENT,name:html?'BlackPoint Pathfinder Accounts':'BlackPoint Professional Standards'}},replyTo:[{emailAddress:{address:html?MANAGEMENT:'IA@blackpointkjc.com'}}],toRecipients:[{emailAddress:{address:to}}]},saveToSentItems:true})});
 if(!response.ok)throw new Error('The management mailbox did not accept the email for delivery.');
 return true;
}
