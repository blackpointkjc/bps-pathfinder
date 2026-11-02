// Confidential Microsoft Graph storage, scoped to an approved SharePoint site.
// IA access is enforced by professionalStandards before calling these helpers.
// Never share the underlying library publicly or expose Graph credentials.
const GRAPH = 'https://graph.microsoft.com/v1.0';
const ROOT = 'Pathfinder Professional Standards';
const enc = (value:string) => encodeURIComponent(value);

function config() {
  return {
    tenant: Deno.env.get('IA_GRAPH_TENANT_ID') || '07f32330-fc73-4d73-a835-e9c47ba798c7',
    client: Deno.env.get('IA_GRAPH_CLIENT_ID') || '',
    secret: Deno.env.get('IA_GRAPH_CLIENT_SECRET') || '',
    site: Deno.env.get('IA_GRAPH_SITE_ID') || '',
    drive: Deno.env.get('IA_GRAPH_DRIVE_ID') || '',
  };
}

async function graphError(result:Response,operation:string):Promise<never> {
  const data = await result.json().catch(()=>({}));
  const hint = String(data?.error?.message || data?.error_description || `Microsoft HTTP ${result.status}`).slice(0,220);
  throw new Error(`${operation} failed: ${hint}`);
}

let tokenCache:{accessToken:string;expires:number}={accessToken:'',expires:0};
async function serviceToken(){
  const {tenant,client,secret,site}=config();
  if(!client || !secret || !site) throw new Error('Microsoft company storage is not configured. Set IA_GRAPH_CLIENT_ID, IA_GRAPH_CLIENT_SECRET and IA_GRAPH_SITE_ID as Pathfinder backend secrets. This requires an Entra server app with Sites.Selected and site-level write permission. Do not reconnect personal OneDrive.');
  if(tokenCache.accessToken && Date.now()<tokenCache.expires-120_000)return tokenCache.accessToken;
  const payload=new URLSearchParams({client_id:client,client_secret:secret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'});
  const response=await fetch(`https://login.microsoftonline.com/${enc(tenant)}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:payload,signal:AbortSignal.timeout(18000)});
  if(!response.ok)await graphError(response,'Confidential Microsoft authentication');
  const data=await response.json();
  if(!data.access_token)throw new Error('Microsoft did not return a confidential application access token.');
  tokenCache={accessToken:String(data.access_token),expires:Date.now()+Math.max(300,Number(data.expires_in||3600))*1000};
  return tokenCache.accessToken;
}
async function graph(token:string,path:string,options:RequestInit={}){
  const headers=new Headers(options.headers||{});
  headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(GRAPH+path,{...options,headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)await graphError(response,'Microsoft private-file operation');
  return response;
}
async function authorizedDrive(token:string){
  const {site,drive}=config();
  // The SharePoint site may be configured as its Graph site id or its
  // hostname:path: locator; retain the ':' and '/' separators for Graph.
  const siteLocator = /^https:\/\//i.test(site)
    ? (() => { const url=new URL(site); return `${url.hostname}:${url.pathname.replace(/\/$/,'')}:`; })()
    : site;
  const safeSite = siteLocator.includes(':/') ? siteLocator.split('/').map(part=>part.replace(/ /g,'%20')).join('/') : enc(siteLocator);
  const path=drive?`/drives/${enc(drive)}?$select=id,driveType,webUrl`:`/sites/${safeSite}/drive?$select=id,driveType,webUrl`;
  const result=await (await graph(token,path)).json();
  if(!result.id)throw new Error('Microsoft did not return the authorized private document library.');
  return {id:String(result.id),driveType:String(result.driveType||'documentLibrary')};
}
async function ensureFolder(token:string,drive:string,parentId:string|null,name:string){
  const base=parentId?`/drives/${enc(drive)}/items/${enc(parentId)}`:`/drives/${enc(drive)}/root`;
  const reply=await fetch(GRAPH+base+'/children',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}),signal:AbortSignal.timeout(20000)});
  if(reply.ok)return String((await reply.json()).id);
  if(reply.status!==409)await graphError(reply,'Private folder creation');
  const existing=parentId?`/drives/${enc(drive)}/items/${enc(parentId)}:/${enc(name)}`:`/drives/${enc(drive)}/root:/${enc(name)}`;
  const item=await (await graph(token,existing)).json();
  if(!item.folder)throw new Error('The required case-storage path is occupied by a file.');
  return String(item.id);
}
async function caseFolder(token:string,drive:string,reference:string){
  const root=await ensureFolder(token,drive,null,ROOT);
  const cases=await ensureFolder(token,drive,root,'IA Case Evidence');
  return ensureFolder(token,drive,cases,reference.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,95));
}
export async function putOneDriveEvidence(_db:any,reference:string,file:File,sha:string){
  const token=await serviceToken();
  const {id:drive}=await authorizedDrive(token);
  const folder=await caseFolder(token,drive,reference);
  const name=`${sha.slice(0,18)}-${crypto.randomUUID()}-${String(file.name||'evidence').replace(/[^A-Za-z0-9._-]/g,'_').slice(-100)}`;
  const response=await graph(token,`/drives/${enc(drive)}/items/${enc(folder)}:/${enc(name)}:/content`,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:await file.arrayBuffer()});
  const result=await response.json();
  if(!result.id||String(result.parentReference?.driveId)!==drive)throw new Error('Microsoft did not verify the uploaded file in the authorized library.');
  return `onedrive:${drive}:${result.id}`;
}
export async function oneDriveEvidenceLink(_db:any,uri:string){
  if(!uri.startsWith('onedrive:'))throw new Error('Invalid Microsoft evidence reference.');
  const [drive,id]=uri.slice(9).split(':');
  if(!drive||!id)throw new Error('Invalid evidence file identifier.');
  const token=await serviceToken();
  const configured=await authorizedDrive(token);
  if(drive!==configured.id)throw new Error('This file belongs to an earlier private drive. It requires a controlled migration before access can be restored.');
  const response=await graph(token,`/drives/${enc(drive)}/items/${enc(id)}`);
  const item=await response.json();
  const url=item['@microsoft.graph.downloadUrl'];
  if(!url||!String(url).startsWith('https://'))throw new Error('Microsoft did not prepare a temporary private download link.');
  return {signed_url:url,expires_in:300,provider:'microsoft-graph',access:'case-authorized'};
}
export async function oneDriveStorageStatus(_db:any){
  const cfg=config();
  const missing=['IA_GRAPH_CLIENT_ID','IA_GRAPH_CLIENT_SECRET','IA_GRAPH_SITE_ID'].filter((name,i)=>![cfg.client,cfg.secret,cfg.site][i]);
  const path=ROOT+'/IA Case Evidence/<case reference>';
  if(missing.length)return {ready:false,provider:'Microsoft SharePoint private library',code:'SERVER_CREDENTIALS_MISSING',missing, path,message:'Company-managed private storage needs a confidential Microsoft application and a SharePoint site authorization. Configure backend secrets; personal OneDrive sign-in cannot complete this setup.'};
  try{
    const token=await serviceToken();
    const drive=await authorizedDrive(token);
    // Verify write access too: ensure the two private parent folders exist.
    // A read-only Sites.Selected grant must not be misreported as ready.
    const root=await ensureFolder(token,drive.id,null,ROOT);
    await ensureFolder(token,drive.id,root,'IA Case Evidence');
    return {ready:true,provider:'Microsoft SharePoint private library',path,drive_type:drive.driveType,message:'Company document library access verified. Secure IA Case Evidence folder is created and writable; case folders will be created on upload.'};
  }catch(error:any){
    return {ready:false,provider:'Microsoft SharePoint private library',code:'SERVER_STORAGE_VERIFICATION_FAILED',path,message:String(error?.message||'Microsoft private document library is unavailable').slice(0,280)};
  }
}
