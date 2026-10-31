import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadBrowserContext, checkDestination } from '../../shared/browserContext.ts';

const HOST = 'https://production-sfo.browserless.io';
const VIEW_MS = 110000;

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
        const health = await fetch(HOST + '/chrome/bql?token=' + encodeURIComponent(Deno.env.get('BROWSERLESS_TOKEN')!.trim()), {
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
    const mutation = [
      'mutation StartBrowser($url: String!) {',
      ' goto(url: $url, waitUntil: domContentLoaded) { status }',
      ' liveURL(detached: true, interactable: '+String(isAdmin)+', showBrowserInterface: '+String(isAdmin)+', timeout: '+VIEW_MS+') { liveURL timeout }',
      ' reconnect(timeout: 120000) { browserQLEndpoint }',
      '}'
    ].join('\n');
    const response = await fetch(HOST + '/chrome/bql?token=' + encodeURIComponent(token), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({query:mutation,variables:{url:target.href}}),
      signal:AbortSignal.timeout(27000),
    });
    if (!response.ok) return Response.json({error:'Remote Chrome engine request failed ('+response.status+').',code:'BROWSER_PROVIDER_ERROR'},{status:502});
    const json = await response.json();
    if (json?.errors?.length) return Response.json({error:'The Chrome browser provider could not initialize a session.',code:'BROWSER_PROVIDER_ERROR'},{status:502});
    const viewer = json?.data?.liveURL?.liveURL;
    if (typeof viewer !== 'string' || !viewer.startsWith(HOST+'/')) return Response.json({error:'Remote Chrome did not provide a valid live viewer.',code:'BROWSER_PROVIDER_ERROR'},{status:502});
    return Response.json({viewer_url:viewer,expires_in_ms:json?.data?.liveURL?.timeout||VIEW_MS,provider:'Browserless Chrome',view_only:!isAdmin}, {headers:{'Cache-Control':'no-store'}});
  } catch(e:any) {
    return Response.json({error:e?.name==='TimeoutError'?'The Chrome browser provider timed out.':'The Chrome session could not be started.'},{status:502});
  }
}