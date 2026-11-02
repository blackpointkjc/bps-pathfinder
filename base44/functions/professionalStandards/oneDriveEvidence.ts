// Direct Microsoft Graph storage, with no Base44 integration-credit calls.
// A case lives in a private folder in the approved company owner's OneDrive.
// Every public upload is associated with a verified IA case; this module never
// creates anonymous sharing links or returns OAuth tokens to clients.
const GRAPH='https://graph.microsoft.com/v1.0';
const CLIENT='5cf1a58f-17d1-46d4-a7fd-ff5fcd7624eb';
const TENANT='07f32330-fc73-4d73-a835-e9c47ba798c7';
const OWNER_ID='6ae7d733d4b1a647cd3e6f38';
const ROOT='Pathfinder Professional Standards';
const enc=(s:string)=>encodeURIComponent(s);

async function responseError(result:Response,action:string){
 const detail=await result.json().catch(()=>({}));
 throw new Error(`${action}: ${String(detail?.error?.message||detail?.error_description||`Microsoft returned ${result.status}`).slice(0,180)}`);
}
async function credentialToken(db:any){
 const rows=await db.MicrosoftOAuthCredential.filter({user_id:OWNER_ID,active:true},'-last_refreshed_at',5);
 const record=rows.find((v:any)=>/\bFiles\.ReadWrite(?:\.All)?\b/i.test(String(v.scope||'')));
 if(!record?.refresh_token)throw new Error('OneDrive evidence storage is not authorized. Colonel Hiers must connect Microsoft 365 with OneDrive file access before uploading evidence. No Base44 upload credits were used.');
 const form=new URLSearchParams({client_id:CLIENT,grant_type:'refresh_token',refresh_token:String(record.refresh_token),scope:String(record.scope||'')});
 const reply=await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(18000)});
 if(!reply.ok)await responseError(reply,'OneDrive authorization');
 const data=await reply.json();
 if(!data.access_token)throw new Error('Microsoft did not grant a OneDrive access token. Reconnect the evidence storage account.');
 if(data.refresh_token&&data.refresh_token!==record.refresh_token){
  await db.MicrosoftOAuthCredential.update(record.id,{refresh_token:data.refresh_token,last_refreshed_at:new Date().toISOString(),scope:data.scope||record.scope}).catch(()=>null);
 }
 return String(data.access_token);
}
async function graph(token:string,path:string,init:RequestInit={}){
 const reply=await fetch(GRAPH+path,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers},signal:AbortSignal.timeout(30000)});
 if(!reply.ok)await responseError(reply,'OneDrive file operation');
 return reply;
}
async function ensureFolder(token:string,parentId:string|null,name:string){
 const base=parentId?`/me/drive/items/${enc(parentId)}`:'/me/drive/root';
 const created=await fetch(GRAPH+base+'/children',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}),signal:AbortSignal.timeout(20000)});
 if(created.ok){const item=await created.json();return String(item.id);}
 if(created.status!==409)await responseError(created,'OneDrive folder creation');
 const folderQuery=parentId?`/me/drive/items/${enc(parentId)}:/`+enc(name):'/me/drive/root:/'+enc(name);
 const existing=await graph(token,folderQuery);
 const item=await existing.json();
 if(!item.folder)throw new Error('The required evidence-storage path is occupied by a file, not a folder.');
 return String(item.id);
}
async function folderForCase(token:string,caseRef:string){
 const root=await ensureFolder(token,null,ROOT);
 const child=await ensureFolder(token,root,'IA Case Evidence');
 return ensureFolder(token,child,caseRef.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,95));
}
export async function putOneDriveEvidence(db:any,caseRef:string,file:File,sha:string){
 const token=await credentialToken(db);
 const folder=await folderForCase(token,caseRef);
 const name=`${sha.slice(0,18)}-${crypto.randomUUID()}-${String(file.name||'evidence').replace(/[^A-Za-z0-9._-]/g,'_').slice(-100)}`;
 const upload=await graph(token,`/me/drive/items/${enc(folder)}:/${enc(name)}:/content`,{method:'PUT',headers:{'content-type':file.type||'application/octet-stream'},body:await file.arrayBuffer()});
 const data=await upload.json();
 if(!data.id||!data.parentReference?.driveId)throw new Error('OneDrive did not confirm evidence storage.');
 return `onedrive:${data.parentReference.driveId}:${data.id}`;
}
export async function oneDriveEvidenceLink(db:any,uri:string){
 if(!uri.startsWith('onedrive:'))throw new Error('This evidence is not stored in OneDrive.');
 const [drive,id]=uri.slice('onedrive:'.length).split(':');
 if(!drive||!id)throw new Error('Evidence storage reference is invalid.');
 const token=await credentialToken(db);
 const response=await graph(token,`/drives/${enc(drive)}/items/${enc(id)}`);
 const item=await response.json();
 const download=item['@microsoft.graph.downloadUrl'];
 if(!download||!String(download).startsWith('https://'))throw new Error('Private OneDrive download link could not be prepared.');
 return {signed_url:download,expires_in:300,provider:'onedrive',access:'case-authorized'};
}
export async function oneDriveStorageStatus(db:any){
 const path=ROOT+'/IA Case Evidence/<case reference>';
 try{
  const token=await credentialToken(db);
  const response=await graph(token,'/me/drive?$select=id,driveType,webUrl');
  const drive=await response.json();
  if(!drive.id)throw new Error('Microsoft did not return an authorized OneDrive.');
  return {ready:true,provider:'Microsoft OneDrive',path,drive_type:drive.driveType||'business',message:'Microsoft file access verified.'};
 }catch(error:any){
  return {ready:false,provider:'Microsoft OneDrive',path,message:String(error?.message||'Microsoft evidence storage permission is unavailable').slice(0,260)};
 }
}
