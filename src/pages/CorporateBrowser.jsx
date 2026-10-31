import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, ArrowRight, Globe2, Home, LockKeyhole, Plus, RotateCw, Search, ShieldCheck, X, AlertTriangle, Loader2, BookOpen, Landmark, BadgeCheck, Moon, Sun, Maximize2, Minimize2 } from 'lucide-react';
import BrowserRequestDialog from '@/components/browser/BrowserRequestDialog';
import BrowserIdleGuard from '@/components/browser/BrowserIdleGuard';
import { profileLabel } from '@/lib/browserProfiles';

const blank = id => ({ id, title: 'New tab', history: [{kind:'home'}], index:0 });
const domainOf = raw => { try { return new URL(raw).hostname.toLowerCase().replace(/^www\./,''); } catch { return ''; } };
const validSite = entry => /^(https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/?!#]|$)/i.test(entry);
const asUrl = text => /^https?:\/\//i.test(text) ? text : 'https://'+text;
const titleFor = state => state.kind==='home'?'New tab':state.kind==='search'?'Search: '+state.query.slice(0,24):state.kind==='blocked'?'Access blocked':state.kind==='engineUnavailable'?'Browser connection needed':domainOf(state.url) || 'Website';

export default function CorporateBrowser() {
  const [tabs,setTabs] = useState([blank('initial')]);
  const initialGoogleStarted = useRef(false);
  const [activeId,setActiveId] = useState('initial');
  const [omnibox,setOmnibox] = useState('');
  const [busy,setBusy] = useState(false);
  const [requestDomain,setRequestDomain] = useState('');
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  const [nightMode,setNightMode] = useState(true);
  const [wideView,setWideView] = useState(false);
  const [requestError,setRequestError] = useState('');
  const tab=tabs.find(item=>item.id===activeId)||tabs[0];
  const page=tab.history[tab.index];
  const {data:user}=useQuery({queryKey:['browserViewer'],queryFn:()=>base44.auth.me(),staleTime:60000});
  const {data:session,isLoading:loadingPolicy,isError:policyError,refetch:refreshPolicy}=useQuery({
    queryKey:['browserSession',user?.email],enabled:!!user?.email,queryFn:async()=> (await base44.functions.invoke('browserAccessCheck',{})).data,staleTime:15000
  });
  const policy=session?.policy;
  const admin=policy?.profile==='admin_access';
  const {data:chromeEngine} = useQuery({queryKey:['browserRemoteEngineStatus'],enabled:!!user?.email && admin,queryFn:async()=>(await base44.functions.invoke('browserRemoteSession',{action:'status'})).data,staleTime:60000});
  const search=useMutation({mutationFn:async query=>(await base44.functions.invoke('browserSearch',{query})).data});
  const check=useMutation({mutationFn:async url=>(await base44.functions.invoke('browserAccessCheck',{url,source:'navigation'})).data});
  const remote=useMutation({mutationFn:async url=>(await base44.functions.invoke('browserRemoteSession',{url})).data});
  const request=useMutation({mutationFn:async ({domain,justification})=>base44.entities.BrowserAccessRequest.create({
    user_email:user?.email||'', user_name:user?.full_name||user?.email||'',domain,justification,status:'pending',source:'search'
  })});
  const results=page.kind==='search' ? (page.results||[]) : [];
  const push = state => setTabs(list=>list.map(item=>item.id===activeId?{...item,history:[...item.history.slice(0,item.index+1),state],index:item.index+1,title:titleFor(state)}:item));
  const goHistory = change => { const index=tab.index+change;if(index<0||index>=tab.history.length)return;setTabs(list=>list.map(item=>item.id===activeId?{...item,index,title:titleFor(item.history[index])}:item));setError('');};
  const addTab = () => {const id='tab'+Date.now()+Math.random().toString(36).slice(2,6);setTabs(list=>[...list,blank(id)]);setActiveId(id);setOmnibox('');setError('');search.reset();};
  const closeTab = id => {const next=tabs.filter(item=>item.id!==id);if(!next.length){setTabs([blank('initial')]);setActiveId('initial');return;}setTabs(next);if(activeId===id)setActiveId(next[next.length-1].id);};
  useEffect(()=>{setOmnibox(page.kind==='site'||page.kind==='blocked'||page.kind==='engineUnavailable'?page.url:page.kind==='search'?page.query:'');},[activeId,tab.index]);
  const doSearch = async query => {
    // Administrator searches happen in real Google Search inside remote Chrome.
    // Restricted staff keep the server-filtered public-web result viewer.
    if (admin && chromeEngine?.configured) return visit('https://www.google.com/search?q='+encodeURIComponent(query));
    setBusy(true);setError('');
    const tabId=activeId;
    const targetIndex=tab.index+1;
    push({kind:'search',query,results:[]});
    try {
      const response=await search.mutateAsync(query);
      setTabs(list=>list.map(item=>item.id===tabId?{...item,history:item.history.map((entry,index)=>index===targetIndex&&entry.kind==='search'&&entry.query===query?{...entry,results:response.results||[],engine:response.engine||'Bing'}:entry)}:item));
    }
    catch(e){setError(e?.response?.data?.error||e?.message||'Live web search is unavailable.');}
    finally{setBusy(false);}
  };
  const visit = async input => {
    setBusy(true);setError('');
    let url;
    try {url=new URL(asUrl(input.trim()));if(!['https:','http:'].includes(url.protocol))throw Error('Only normal web addresses are supported.');}
    catch {setError('Enter a valid internet address.');setBusy(false);return;}
    try {
      const data=await check.mutateAsync(url.href);
      if(!data?.decision?.allowed){push({kind:'blocked',url:url.href,reason:data?.decision?.reason||'This site is restricted by your browsing profile.'});return;}
      if(data?.policy?.strict_search_only && data?.decision?.basis !== 'Government .gov access'){push({kind:'blocked',url:url.href,reason:'Your HR role is set to Strict Search Only. Government .gov domains remain approved.'});return;}
      try {
        const viewer=await remote.mutateAsync(url.href);
        if (!viewer?.viewer_url) throw new Error('Remote Chrome did not return a viewer.');
        push({kind:'site',url:url.href,viewer:viewer.viewer_url,viewOnly:viewer.view_only===true});
      } catch(engineError) {
        const msg=engineError?.response?.data?.error || engineError?.message || 'Remote Chrome service is unavailable.';
        push({kind:'engineUnavailable',url:url.href,reason:msg});
      }
    }catch(e){setError(e?.response?.data?.error||'Unable to verify this destination. Access was not granted.');}
    finally{setBusy(false);}
  };
  // Start authorized administrators directly at Google in remote Chrome.
  // The remote viewer supplies its own tabs/address bar; don't draw another.
  useEffect(()=>{
    if(!admin || !chromeEngine?.configured || initialGoogleStarted.current) return;
    initialGoogleStarted.current=true;
    if(page.kind==='home') void visit('https://www.google.com/');
  },[admin,chromeEngine?.configured]);
  const navigate = value => {const input=String(value||'').trim();if(!input)return; if(validSite(input))visit(input);else doSearch(input);};
  const resubmitRequest=async justification=>{try{setRequestError('');await request.mutateAsync({domain:requestDomain,justification});setRequestDomain('');}catch(e){setRequestError(e?.message||'Could not submit request');}};
  return <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center bg-[#050e1a] px-2 py-3 text-[#e2e8f0] sm:px-4 sm:py-4">
    <div className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-[#304965] bg-[#091523] shadow-[0_8px_32px_rgba(0,0,0,.28)] transition-[max-width] duration-200 ${wideView ? 'max-w-[1600px]' : 'max-w-[1200px]'}`}>
      {page.kind!=='site' && <div className="flex min-h-[43px] items-end gap-1 overflow-x-auto border-b border-[#bdc6d2] bg-[#dee4ed] px-2 pt-1.5" role="tablist" aria-label="Browser tabs">
        {tabs.map(item=><div key={item.id} role="tab" aria-selected={activeId===item.id} className={`flex h-9 min-w-[125px] max-w-[225px] flex-1 items-center gap-2 rounded-t-xl px-3 text-[12px] ${activeId===item.id?'bg-white text-[#202124]':'bg-[#ccd5e1] text-[#414c5a] hover:bg-[#e7ecf3]'}`}>
          <button type="button" onClick={()=>setActiveId(item.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><Globe2 className="h-4 w-4 shrink-0 text-[#64748b]"/><span className="truncate">{item.title}</span></button>
          <button type="button" onClick={()=>closeTab(item.id)} aria-label={'Close '+item.title} className="rounded p-1 hover:bg-[#b9c3d1]"><X className="h-3.5 w-3.5"/></button>
        </div>)}
        <button type="button" onClick={addTab} aria-label="New tab" title="New tab" className="mb-1 rounded-full p-2 hover:bg-[#cbd5e1]"><Plus className="h-4 w-4"/></button>
      </div>}
      {page.kind!=='site' && <div className="flex items-center gap-1 border-b border-[#e2e8f0] bg-white px-2 py-2 sm:gap-2 sm:px-3">
        <button type="button" aria-label="Back" title="Back" disabled={tab.index===0} onClick={()=>goHistory(-1)} className="rounded-full p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowLeft className="h-4 w-4"/></button>
        <button type="button" aria-label="Forward" title="Forward" disabled={tab.index>=tab.history.length-1} onClick={()=>goHistory(1)} className="rounded-full p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowRight className="h-4 w-4"/></button>
        <button type="button" aria-label="Reload" title="Reload" onClick={()=>{setReload(n=>n+1);refreshPolicy();if(page.kind==='search')doSearch(page.query);}} className="rounded-full p-2 hover:bg-slate-100"><RotateCw className="h-4 w-4"/></button>
        <button type="button" aria-label="Home" title="Home" onClick={()=>push({kind:'home'})} className="hidden rounded-full p-2 hover:bg-slate-100 sm:block"><Home className="h-4 w-4"/></button>
        <form className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#d5dce5] bg-[#f1f3f4] px-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-400" onSubmit={event=>{event.preventDefault();navigate(omnibox);}}>
          {page.kind==='site'?<LockKeyhole className="h-4 w-4 shrink-0 text-green-700"/>:<Search className="h-4 w-4 shrink-0 text-slate-500"/>}
          <input value={omnibox} onChange={event=>setOmnibox(event.target.value)} autoComplete="off" spellCheck={false} aria-label="Search the internet or enter a website address" placeholder="Search the web or enter an address" className="h-10 w-full min-w-0 bg-transparent text-[13px] text-[#202124] outline-none placeholder:text-[#697586]"/>
          {omnibox && <button type="button" aria-label="Clear address" onClick={()=>setOmnibox('')}><X className="h-4 w-4 text-slate-500"/></button>}
        </form>
        <button type="button" onClick={()=>navigate(omnibox)} disabled={busy||loadingPolicy} className="rounded-full bg-[#1a73e8] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:'Go'}</button>
      </div>}
      {page.kind!=='site' && <nav className="flex flex-wrap items-center gap-2 border-b border-[#d7e2ec] bg-[#f8fafc] px-3 py-1.5 text-[11px] sm:gap-4" aria-label="Approved bookmarks">
        <span className="hidden items-center gap-1 font-bold text-slate-500 sm:inline-flex"><BookOpen className="h-3.5 w-3.5"/>Research shortcuts</span>
        {[['VA Courts','https://www.vacourts.gov'],['Virginia.gov','https://www.virginia.gov'],['USA.gov','https://www.usa.gov'],['IRS.gov','https://www.irs.gov']].map(([label,url])=><button type="button" key={url} onClick={()=>visit(url)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"><Landmark className="h-3 w-3"/>{label}</button>)}
      </nav>}
      {page.kind!=='site' && <div className="flex items-center justify-between gap-2 border-b border-[#e5e7eb] bg-[#fafbfc] px-4 py-1.5 text-[11px] text-[#5f6368]">
        <span className="truncate">{loadingPolicy?'Checking your access…':`${admin && chromeEngine?.configured ? 'Google Search in Chrome' : 'Public internet search'} · ${profileLabel(policy?.profile)}`}</span>
        <span className="inline-flex shrink-0 items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-[#188038]"/>Pathfinder policy</span>
      </div>}
      <main className={`min-h-[390px] flex-1 overflow-y-auto ${page.kind==='site'?'bg-[#0b1624]':'bg-[#f5f7fa]'}`}>
        {policyError && <div className="m-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">Unable to check your browser permissions. Reload the page before browsing.</div>}
        {error && <div className="m-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
        {page.kind==='home' && <div className="mx-auto flex min-h-[440px] w-full max-w-3xl flex-col items-center justify-center px-5 py-12">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#0d456b] to-[#081522] text-cyan-300 shadow-xl shadow-cyan-800/20"><ShieldCheck className="h-11 w-11"/></div>
          <h1 className="text-center text-3xl font-black tracking-tight text-[#15283b] sm:text-4xl">Pathfinder <span className="text-[#1577bf]">Secure Web</span></h1>
          <p className="mb-8 mt-2 text-center text-xs font-semibold uppercase tracking-[.24em] text-[#718096]">A safer way to work online</p>
          <form className="flex w-full items-center gap-3 rounded-full border border-[#dfe1e5] bg-white px-5 shadow-[0_2px_7px_rgba(0,0,0,.10)] hover:shadow-md" onSubmit={event=>{event.preventDefault();navigate(omnibox);}}>
            <Search className="h-5 w-5 shrink-0 text-slate-400"/><input value={omnibox} onChange={event=>setOmnibox(event.target.value)} placeholder="Search the public internet" className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none"/><button aria-label="Search" type="submit"><ArrowRight className="h-5 w-5 text-[#1a73e8]"/></button>
          </form>
          <p className="mt-5 text-center text-xs text-[#5f6368]">Search the public internet · Government websites approved · Company access policy applies</p>
        </div>}
        {page.kind==='search' && <div className="mx-auto w-full max-w-4xl px-5 py-7 sm:px-10">
          <div className="border-b border-slate-200 pb-4"><h1 className="text-xl font-medium text-[#202124]">Search results for {page.query}</h1><p className="mt-1 text-xs text-[#70757a]">Live public internet search · {page.engine||'Web search'}</p></div>
          {busy && <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin"/>Searching the web…</div>}
          {!busy && results.length===0 && !error && <p className="py-12 text-sm text-slate-500">No results returned. Try another search.</p>}
          {!busy && results.map((item,i)=> <article key={item.url+'-'+i} className="max-w-[740px] border-b border-slate-100 py-5">
            <div className="mb-1 flex items-center gap-2 text-xs text-[#4d5156]"><Globe2 className="h-4 w-4 text-slate-500"/><span className="truncate">{item.domain}</span>{!item.allowed && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">Blocked</span>}</div>
            <button type="button" onClick={()=>item.allowed?visit(item.url):item.basis==='Mandatory company restriction'?undefined:setRequestDomain(item.domain)} className="block text-left text-xl font-medium leading-7 text-[#1a0dab] hover:underline">{item.title||item.domain}</button>
            <p className="mt-1 text-sm leading-6 text-[#4d5156]">{item.snippet}</p>
            {!item.allowed && (item.basis==='Mandatory company restriction' ? <p className="mt-1 text-xs font-medium text-red-700">Blocked by company-wide internet policy</p> : <button type="button" onClick={()=>setRequestDomain(item.domain)} className="mt-1 text-xs text-[#b45309] underline">Request website access</button>)}
          </article>)}
        </div>}
        {page.kind==='blocked' && <div className="mx-auto max-w-xl px-6 py-20 text-center"><AlertTriangle className="mx-auto h-12 w-12 text-amber-500"/><h1 className="mt-5 text-2xl font-semibold">Website access restricted</h1><p className="mt-3 break-words text-sm text-slate-600">{page.url}</p><p className="mt-3 text-sm text-slate-600">{page.reason}</p><div className="mt-6 flex justify-center gap-3"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={()=>setRequestDomain(domainOf(page.url))}>Request access</button><button className="rounded-lg border px-4 py-2 text-sm" onClick={()=>push({kind:'home'})}>New search</button></div></div>}
        {page.kind==='engineUnavailable' && <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-6 py-16 text-center"><Globe2 className="h-14 w-14 text-slate-500"/><h1 className="mt-5 text-2xl font-semibold">Chrome browser service not connected</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your company profile permits this website. Pathfinder needs its remote Chrome browser service connected to display it fully inside the app.</p><p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">{page.reason}</p><button type="button" onClick={()=>visit(page.url)} className="mt-6 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Retry in-app browser</button></div>}
        {page.kind==='site' && <div className="flex flex-col bg-[#091523]">
          <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[#294258] bg-[#0d1c2d] px-3 py-1.5 text-xs text-slate-300">
            <span className="min-w-0 truncate">{domainOf(page.url)}{page.viewOnly?' · Government research — read only':''}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={()=>setNightMode(value=>!value)} aria-pressed={nightMode} title={nightMode?'Turn off night dimming':'Dim page for night shift'} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[#3f5b72] px-2 hover:bg-[#183047]">{nightMode?<Sun className="h-3.5 w-3.5"/>:<Moon className="h-3.5 w-3.5"/>}<span className="hidden sm:inline">{nightMode?'Daylight':'Night dim'}</span></button>
              <button type="button" onClick={()=>setWideView(value=>!value)} aria-pressed={wideView} title={wideView?'Compact browser':'Wider browser'} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[#3f5b72] px-2 hover:bg-[#183047]">{wideView?<Minimize2 className="h-3.5 w-3.5"/>:<Maximize2 className="h-3.5 w-3.5"/>}<span className="hidden sm:inline">{wideView?'Compact':'Wider'}</span></button>
            </div>
          </div>
          <iframe key={page.viewer} src={page.viewer} title={'Interactive Google Chrome browser - '+domainOf(page.url)} allow="clipboard-read; clipboard-write; fullscreen" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads" style={{filter:nightMode?'brightness(0.66) contrast(1.05)':'none'}} className="h-[min(72dvh,690px)] min-h-[360px] w-full border-0 bg-[#0b1624] transition-[filter] duration-150 sm:min-h-[450px]"/>
        </div>}
      </main>

    </div>
    {requestError && <p className="p-2 text-xs text-red-700">{requestError}</p>}
    <BrowserRequestDialog open={!!requestDomain} domain={requestDomain} submitting={request.isPending} onOpenChange={open=>!open&&setRequestDomain('')} onSubmit={resubmitRequest}/>
  </div>;
}