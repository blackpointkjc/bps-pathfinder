import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadBrowserContext, checkDestination } from '../../shared/browserContext.ts';

// Browserless shared-fleet US-West (San Francisco) endpoint. Do not switch
// to chrome-us-east: it requires a private/enterprise fleet token.
const HOST = 'https://production-sfo.browserless.io';
const BQL_ENDPOINT = HOST + '/chromium/bql';
// Browserless caps the actual session lifetime by account plan.
// Use a Free-plan-compatible initial link. Longer plans can be negotiated separately.
const SESSION_TIERS = [
  { viewer: 90000, reconnect: 115000 },
  { viewer: 780000, reconnect: 840000 },
  { viewer: 1620000, reconnect: 1680000 },
  { viewer: 3300000, reconnect: 3360000 },
];
const asRows = (data:any) => Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
function verifiedReconnectEndpoint(raw:string, token:string):string {
  const parsed=new URL(raw);
  if(parsed.origin!==HOST || !/\/chromium\/bql\//.test(parsed.pathname)) throw new Error('Browser reconnect endpoint was rejected');
  parsed.searchParams.set('token',token);
  return parsed.href;
}
function gqlError(data:any):string {
  return (Array.isArray(data?.errors) ? data.errors : []).map((x:any)=>String(x?.message||'')).join('; ').slice(0,240);
}
function sessionMutation(url:string, liveMs:number, idleMs:number, admin:boolean, width:number, height:number, create:boolean):string {
  return [
    create ? 'mutation PathfinderBrowser($url: String!) {' : 'mutation PathfinderBrowser {',
    ...(create ? [
      ' viewport(width: '+width+', height: '+height+', deviceScaleFactor: 1) { width height }',
      ' goto(url:$url, waitUntil:domContentLoaded) { status }',
    ] : []),
    ' liveURL(detached:true, interactable:'+String(admin)+', showBrowserInterface:'+String(admin)+', type:jpeg, quality:85, captureScale:1, resizable:true, timeout:'+liveMs+') { liveURL timeout }',
    ' reconnect(timeout:'+idleMs+') { browserQLEndpoint }',
    '}'
  ].join('\n');
}


export default async function (req: Request): Promise<Response> {
  try {
    const api = createClientFromRequest(req);
    const me = await api.auth.me().catch(() => null);
    if (!me) return Response.json({error:'Please sign in.'},{status:401});
    const context = await loadBrowserContext(api, me);
    const configured = Boolean(Deno.env.get('BROWSERLESS_TOKEN')?.trim());
    const body = await req.json().catch(() => ({}));
    if (body.action === 'status') return Response.json({configured, provider:'Browserless Google Chrome', role:context.summary.profile});
    if (body.action === 'test') {
      if (context.user.role !== 'admin') return Response.json({error:'Admin role required to test the browser engine.'},{status:403});
      if (!configured) return Response.json({reachable:false, error:'Browserless credential not configured.'});
      try {
        const health = await fetch(BQL_ENDPOINT + '?token=' + encodeURIComponent(Deno.env.get('BROWSERLESS_TOKEN')!.trim()), {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({query:'mutation BrowserHealth { goto(url: "https://example.com", waitUntil: domContentLoaded) { status } }'}),
          signal:AbortSignal.timeout(15000)
        });
        const payload = await health.json().catch(() => ({}));
        const passed = health.ok && !payload?.errors?.length && Number(payload?.data?.goto?.status) >= 200 && Number(payload?.data?.goto?.status) < 400;
        return Response.json({reachable:passed, http_status:health.status, website_status:payload?.data?.goto?.status || null,
          error:passed?'':Array.isArray(payload?.errors)?String(payload.errors[0]?.message||'').slice(0,180):'Chrome health request failed.'});
      } catch (_error) {return Response.json({reachable:false,error:'The provider could not complete the live browser test.'});}
    }
    if (body.action === 'renew') {
      const sessionId=String(body.session_id||'');
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return Response.json({error:'Invalid session identifier.'},{status:400});
      const found=asRows(await api.asServiceRole.entities.BrowserRemoteSession.filter({
        session_id:sessionId,user_id:context.user.id,active:true
      }, '-created_date', 1));
      const saved=found[0];
      if (!saved) return Response.json({error:'Your browser session is no longer available.',code:'SESSION_EXPIRED'},{status:410});
      if (!configured) return Response.json({error:'Browser engine is not configured.'},{status:503});
      const isAdmin=context.user.role==='admin';
      if (!isAdmin && (!saved.view_only || !(new URL(saved.initial_url).hostname.toLowerCase().endsWith('.gov')))) {
        return Response.json({error:'Browser permissions changed; access was revoked.',code:'POLICY_CHANGED'},{status:403});
      }
      const token=Deno.env.get('BROWSERLESS_TOKEN')!.trim();
      let endpoint:string;
      try { endpoint=verifiedReconnectEndpoint(String(saved.reconnect_endpoint),token); }
      catch {return Response.json({error:'Previous browser connection could not be verified.',code:'SESSION_EXPIRED'},{status:410});}
      const intended=Math.max(80000,Math.min(3300000,Number(saved.plan_window_ms)||100000));
      const query=sessionMutation(saved.initial_url,intended,intended+Math.min(60000,3300000-intended),isAdmin,1280,760,false);
      try {
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({query,variables:{url:saved.initial_url}}),signal:AbortSignal.timeout(20000)});
        const data=await response.json().catch(()=>({}));
        const viewer=data?.data?.liveURL?.liveURL;
        const reconnect=data?.data?.reconnect?.browserQLEndpoint;
        if(!response.ok || gqlError(data) || typeof viewer!=='string' || typeof reconnect!=='string' || !viewer.startsWith(HOST+'/')) {
          return Response.json({error:'The provider reached its browser session limit. Pathfinder can start a new session.',code:'SESSION_EXPIRED'},{status:410});
        }
        const expires=Math.max(1000,Number(data.data.liveURL.timeout)||intended);
        await api.asServiceRole.entities.BrowserRemoteSession.update(saved.id,{
          reconnect_endpoint:reconnect,viewer_expires_at:new Date(Date.now()+expires).toISOString(),
          last_renewed_at:new Date().toISOString()
        });
        return Response.json({viewer_url:viewer,session_id:sessionId,expires_in_ms:expires,
          view_only:Boolean(saved.view_only),reused_session:true},{headers:{'Cache-Control':'no-store'}});
      }catch {
        return Response.json({error:'The existing browser session could not be resumed.',code:'SESSION_EXPIRED'},{status:410});
      }
    }
    if (!configured) return Response.json({error:'The Chrome remote-browser service is not connected. A system admin must configure BROWSERLESS_TOKEN in the Base44 application secrets.',code:'ENGINE_NOT_CONFIGURED'},{status:503});
    // An interactable viewer contains its own address bar. Without an upstream
    // policy-enforcing gateway, only unrestricted administrator profiles may
    // receive a live viewer. Other roles still use policy-filtered web search.
    const isAdmin = context.user.role === 'admin';
    // Non-admin employees can view an approved .gov page in a remotely rendered
    // read-only session. Interactive navigation outside the approved domain is
    // NOT exposed without a policy-enforcing gateway.
    const requestedGovernmentPage = (() => {try {return new URL(String(body.url||'')).hostname.toLowerCase().endsWith('.gov');} catch{return false;}})();
    if (!isAdmin && !requestedGovernmentPage) return Response.json({error:'Managed interactive browsing for restricted employee roles requires a policy-enforcing remote web gateway.',code:'MANAGED_GATEWAY_REQUIRED'},{status:403});
    const raw = String(body.url || '').trim();
    let target: URL;
    try {target = new URL(raw);} catch {return Response.json({error:'Enter a valid web address.'},{status:400});}
    if (!['https:','http:'].includes(target.protocol) || target.username || target.password) return Response.json({error:'Only regular HTTPS and HTTP web pages are allowed.'},{status:400});
    const decision = checkDestination(context, target.href);
    if (!decision.allowed) return Response.json({error:decision.reason,code:'BLOCKED_BY_POLICY'},{status:403});
    const token = Deno.env.get('BROWSERLESS_TOKEN')!.trim();
    // Match the actual viewer dimensions to avoid enlarging and blurring a
    // smaller remote desktop. Clamp untrusted values to reasonable bounds.
    const viewportWidth = Math.max(360, Math.min(1600, Math.round(Number(body.viewport_width)||1280)));
    const viewportHeight = Math.max(400, Math.min(950, Math.round(Number(body.viewport_height)||760)));
    let selected:any=null;
    let failure='The provider did not start the Chrome session.';
    for (const tier of SESSION_TIERS.slice(0, 1)) {
      const query=sessionMutation(target.href,tier.viewer,tier.reconnect,isAdmin,viewportWidth,viewportHeight,true);
      try {
        const response=await fetch(BQL_ENDPOINT+'?token='+encodeURIComponent(token),{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({query,variables:{url:target.href}}),signal:AbortSignal.timeout(27000)
        });
        const bodyText=await response.text();
        let json:any={};
        try {json=JSON.parse(bodyText);}catch {}
        const safeDiagnostic = String(gqlError(json) || json?.message || json?.error || bodyText || '')
          .replace(/token=[^\s&"']+/gi, 'token=[redacted]')
          .replace(/2VXm34bXPFAh2Dc851fb23d9a0f20109c850c80808f6358b8/gi, '[redacted]')
          .slice(0,180);
        const problem=gqlError(json);
        if (response.ok && !problem && json?.data?.liveURL?.liveURL && json?.data?.reconnect?.browserQLEndpoint) {
          selected={tier,json};
          break;
        }
        failure=problem||('Browserless HTTP '+response.status+(safeDiagnostic ? ': '+safeDiagnostic : ''));
        // A lower-tier timeout may work when this token's plan disallows the
        // larger reconnect or live URL lifetime. Do not retry unrelated failures.
        if (!/exceed|maximum|session duration|timeout.*allowed|allowed.*timeout|plan limit/i.test(failure)) break;
      }catch(error:any) {
        failure=error?.name==='TimeoutError'?'The browser provider timed out.':'Browser provider connection failed.';
        break;
      }
    }
    if (!selected) return Response.json({error:'Remote browser launch failed. '+failure.slice(0,230),code:'BROWSER_PROVIDER_ERROR'},{status:502});
    const viewer=selected.json.data.liveURL.liveURL;
    const reconnect=selected.json.data.reconnect.browserQLEndpoint;
    if(typeof viewer!=='string' || !viewer.startsWith(HOST+'/')) return Response.json({error:'Browser viewer link was rejected.'},{status:502});
    const applied=Math.max(1000,Number(selected.json.data.liveURL.timeout)||selected.tier.viewer);
    const sessionId=crypto.randomUUID();
    await api.asServiceRole.entities.BrowserRemoteSession.create({
      session_id:sessionId,user_id:context.user.id,reconnect_endpoint:reconnect,
      viewer_expires_at:new Date(Date.now()+applied).toISOString(),
      created_at:new Date().toISOString(),last_renewed_at:new Date().toISOString(),
      initial_url:target.href,plan_window_ms:selected.tier.viewer,view_only:!isAdmin,active:true
    });
    return Response.json({
      viewer_url:viewer,session_id:sessionId,expires_in_ms:applied,
      provider:'Browserless Chrome · US West',view_only:!isAdmin,region:'us-west-sfo',
      renewed_automatically:true
    }, {headers:{'Cache-Control':'no-store'}});
  } catch(e:any) {
    return Response.json({error:e?.name==='TimeoutError'?'The Chrome browser provider timed out.':'The Chrome session could not be started.'},{status:502});
  }
}