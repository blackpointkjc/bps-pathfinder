import { canManageWebsiteRestrictions } from '@/lib/browserOwner';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { ExternalLink, Globe } from 'lucide-react';
import { createPageUrl } from '@/utils';
import AdminBrowserOverview from '@/components/browser/AdminBrowserOverview';
import BrowserPolicyPanel from '@/components/browser/BrowserPolicyPanel';
import BrowserSiteRulesPanel from '@/components/browser/BrowserSiteRulesPanel';
import BrowserRequestsPanel from '@/components/browser/BrowserRequestsPanel';
import BrowserActivityPanel from '@/components/browser/BrowserActivityPanel';

const TOOLS = [
  { id: 'overview', label: 'Overview' },
  { id: 'profiles', label: 'Profiles & employees' },
  { id: 'lists', label: 'Allow & block lists' },
  { id: 'requests', label: 'Access requests' },
  { id: 'activity', label: 'Activity log' },
];

export default function AdminBrowserControl() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('browser_tool');
  const [active, setActive] = useState(TOOLS.some(tool => tool.id === requested) ? requested : 'overview');
  const [engineTest,setEngineTest] = useState(null);
  const [testingEngine,setTestingEngine] = useState(false);
  const testEngine=async()=>{setTestingEngine(true);setEngineTest(null);try{const result=(await base44.functions.invoke('browserRemoteSession',{action:'test'})).data;setEngineTest(result||{reachable:false,error:'Browser response empty'});}catch(error){setEngineTest({reachable:false,error:error?.response?.data?.error||'Could not run live browser check.'});}finally{setTestingEngine(false);}};
  const focusEmail = params.get('email') || '';

  const { data: reviewer } = useQuery({ queryKey: ['browserReviewer'], queryFn: () => base44.auth.me(), staleTime: 300000 });

  const { data: browserEngine, isLoading: browserEngineLoading, refetch: refreshBrowserEngine } = useQuery({
    queryKey: ['browserRemoteEngineStatus'],
    enabled: canManageWebsiteRestrictions(reviewer),
    queryFn: async () => (await base44.functions.invoke('browserRemoteSession', {action:'status'})).data,
    staleTime: 30000,
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['browserPendingCount'],
    enabled: canManageWebsiteRestrictions(reviewer),
    queryFn: () => base44.entities.BrowserAccessRequest.count({ status: 'pending' }),
    staleTime: 30000,
  });

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set('browser_tool', active);
    window.history.replaceState({}, '', `${window.location.pathname}?${next.toString()}`);
  }, [active]);

  if (!reviewer) return <div className="min-h-screen bg-[#071321] p-8 text-sm text-slate-300">Verifying browser administration access…</div>;
  if (!canManageWebsiteRestrictions(reviewer)) return <div className="min-h-screen bg-[#071321] p-8 text-sm text-amber-200">Website Restrictions is restricted to Colonel Hiers' authorized administrator account.</div>;
  return (
    <div className="min-h-full space-y-3 bg-slate-950 p-4 text-white md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-700 bg-cyan-500/10">
            <Globe className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight md:text-2xl">Corporate internet browser</h1>
            <p className="text-xs text-slate-400">Restriction profiles, allow and block lists, access requests and security reporting</p>
          </div>
        </div>
        <Link
          to={createPageUrl('CorporateBrowser')}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-600 px-3 text-xs font-semibold text-slate-200 hover:border-cyan-700 hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open managed browser
        </Link>
      </header>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold text-slate-100">Interactive Google Chrome browser engine: <span className={browserEngine?.configured ? 'text-emerald-300' : 'text-amber-300'}>{browserEngineLoading ? 'Checking…' : browserEngine?.configured ? 'Credential configured' : 'Not configured'}</span></div><div className="flex gap-2"><button type="button" onClick={() => refreshBrowserEngine()} className="rounded border border-slate-500 px-3 py-1.5 text-slate-100">Refresh credential status</button>{browserEngine?.configured&&<button type="button" disabled={testingEngine} onClick={testEngine} className="rounded border border-cyan-600 bg-cyan-900/30 px-3 py-1.5 text-cyan-100 disabled:opacity-50">{testingEngine?'Testing…':'Test live Chrome'}</button>}</div></div>
        {engineTest && <p className={`mt-2 rounded-lg border p-2 ${engineTest.reachable?'border-emerald-700 bg-emerald-950/30 text-emerald-200':'border-amber-700 bg-amber-950/20 text-amber-200'}`}>{engineTest.reachable?'Live remote Chrome connection verified.':'Chrome connection not verified: '+(engineTest.error||'Provider test failed.')}</p>}
        {!browserEngine?.configured && <p className="mt-2 text-slate-300">For websites that block ordinary embedding, Pathfinder uses an interactive remote Chrome session. Add the Browserless API token as <code className="text-cyan-300">BROWSERLESS_TOKEN</code> in this Base44 app's Secrets settings to enable it. The token remains on the server. Until it is configured, full interactive browsing cannot start. Restricted employee roles also require a policy-enforcing gateway before receiving unrestricted browser controls.</p>}
      </section>
      <div className="sticky top-0 z-20 flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-950/95 px-2 py-2 backdrop-blur">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActive(tool.id)}
            aria-current={active === tool.id ? 'page' : undefined}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition ${
              active === tool.id
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-100'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white'
            }`}
          >
            {tool.label}
            {tool.id === 'requests' && pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {active === 'overview' && <AdminBrowserOverview />}

      {active === 'profiles' && (
        <div className="space-y-3">
          <p className="rounded-xl border border-cyan-800 bg-slate-900 p-3 text-xs text-cyan-100">Browser permissions follow the live profiles under HR → Manage Company Employees: Admin → Administrator Access; Supervisor / HR / Full Access → Limited Business Access; Officer → Officer Work Research; all others → Strict Search Only. Higher roles override lower roles automatically; no separate employee assignment is required.</p>
          <BrowserPolicyPanel />
        </div>
      )}

      {active === 'lists' && <BrowserSiteRulesPanel />}
      {active === 'requests' && <BrowserRequestsPanel reviewer={reviewer} />}
      {active === 'activity' && <BrowserActivityPanel />}

      <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] leading-5 text-slate-500">
        Activity logging exists for legitimate business and security review. Tell employees what is recorded, keep retention
        limited, and pair this console with MDM, DNS filtering or a secure web gateway for enforcement outside this browser.
      </p>
    </div>
  );
}