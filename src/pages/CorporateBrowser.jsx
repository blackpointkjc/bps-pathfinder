import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ClipboardCopy, Download, Loader2, Printer, Search, Send, ShieldCheck, Terminal } from 'lucide-react';
import BrowserHeader from '@/components/browser/BrowserHeader';
import BrowserSearchResults from '@/components/browser/BrowserSearchResults';
import BrowserDirectory from '@/components/browser/BrowserDirectory';
import AccessDeniedPanel from '@/components/browser/AccessDeniedPanel';
import BrowserRequestDialog from '@/components/browser/BrowserRequestDialog';
import BrowserIdleGuard from '@/components/browser/BrowserIdleGuard';

const STATUS_STYLES = {
  pending: 'border-amber-700 bg-amber-500/10 text-amber-200',
  approved: 'border-emerald-700 bg-emerald-500/10 text-emerald-200',
  denied: 'border-red-800 bg-red-500/10 text-red-200',
  expired: 'border-slate-700 bg-slate-800 text-slate-300',
};

export default function CorporateBrowser() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState('');
  const [denied, setDenied] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [requestDomain, setRequestDomain] = useState('');
  const [busyDomain, setBusyDomain] = useState('');

  const { data: user } = useQuery({ queryKey: ['browserViewer'], queryFn: () => base44.auth.me(), staleTime: 300000 });

  const sessionQuery = useQuery({
    queryKey: ['browserSession', user?.email],
    queryFn: async () => (await base44.functions.invoke('browserAccessCheck', {})).data,
    enabled: Boolean(user?.email),
    staleTime: 60000,
  });

  const searchMutation = useMutation({
    mutationFn: async text => (await base44.functions.invoke('browserSearch', { query: text })).data,
  });

  const checkMutation = useMutation({
    mutationFn: async payload => (await base44.functions.invoke('browserAccessCheck', payload)).data,
  });

  const requestMutation = useMutation({
    mutationFn: async ({ domain, justification }) => base44.entities.BrowserAccessRequest.create({
      user_email: user?.email || '',
      user_name: [user?.rank, user?.last_name].filter(Boolean).join(' ') || user?.full_name || user?.email || '',
      domain,
      justification,
      status: 'pending',
      source: 'search',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browserMyRequests'] });
      setRequestDomain('');
    },
  });

  const { data: myRequests = [] } = useQuery({
    queryKey: ['browserMyRequests', user?.email],
    queryFn: async () => {
      const result = await base44.entities.BrowserAccessRequest.filter(
        { user_email: user?.email },
        { sort: '-created_date', limit: 8 },
      );
      return Array.isArray(result) ? result : result?.items || [];
    },
    enabled: Boolean(user?.email),
    staleTime: 30000,
  });

  const policy = sessionQuery.data?.policy;
  const directory = sessionQuery.data?.directory || [];
  const results = searchMutation.data?.results || [];

  const permissions = useMemo(() => ([
    { key: 'downloads', label: 'Downloads', allowed: Boolean(policy?.allow_downloads), icon: Download },
    { key: 'print', label: 'Printing', allowed: Boolean(policy?.allow_print), icon: Printer },
    { key: 'clipboard', label: 'Clipboard', allowed: Boolean(policy?.allow_clipboard), icon: ClipboardCopy },
    { key: 'devtools', label: 'Developer tools', allowed: Boolean(policy?.allow_devtools), icon: Terminal },
  ]), [policy]);

  const ensureUrl = value => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

  const openDestination = async (rawValue, allowedHint, source) => {
    const url = ensureUrl(String(rawValue || '').trim());
    if (!url || url === 'https://') return;
    setBusyDomain(rawValue);
    try {
      // Never trust a search-result hint: recheck the current server policy
      // before offering any external link, including when rules changed.
      const data = await checkMutation.mutateAsync({ url, source });
      setDenied({ url, decision: data?.decision });
    } catch (error) {
      setDenied({
        url,
        decision: { allowed: false, domain: rawValue, reason: error?.response?.data?.error || 'The policy check could not be completed. Try again.' },
      });
    } finally {
      setBusyDomain('');
    }
  };

  const runSearch = text => {
    const value = String(text || '').trim();
    if (value.length < 2) return;
    setSearchError('');
    setDenied(null);
    searchMutation.mutate(value, {
      onError: error => setSearchError(
        error?.response?.data?.error || 'Approved search is unavailable right now. Use the company resources below.',
      ),
    });
  };

  return (
    <div className="min-h-full space-y-4 bg-slate-950 p-4 text-white md:p-6">
      <BrowserHeader policy={policy} engine={sessionQuery.data?.engine} loading={sessionQuery.isLoading} />

      <BrowserIdleGuard minutes={policy?.session_timeout_minutes || 15}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
              <form
                onSubmit={event => {
                  event.preventDefault();
                  runSearch(query);
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search approved work-related information…"
                    aria-label="Search approved work-related information"
                    maxLength={200}
                    className="h-11 w-full rounded-lg border border-slate-600 bg-slate-950 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchMutation.isPending || query.trim().length < 2}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cyan-700 bg-cyan-600/20 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-600/30 disabled:opacity-60"
                >
                  {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {searchMutation.isPending ? 'Searching…' : 'Search'}
                </button>
              </form>

              <form
                onSubmit={event => {
                  event.preventDefault();
                  openDestination(address, false, 'navigation');
                  setAddress('');
                }}
                className="mt-2 flex flex-col gap-2 sm:flex-row"
              >
                <input
                  value={address}
                  onChange={event => setAddress(event.target.value)}
                  placeholder="Go to an approved address, for example law.lis.virginia.gov"
                  aria-label="Approved address"
                  className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={checkMutation.isPending || address.trim().length < 4}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 text-xs font-semibold text-slate-200 hover:border-slate-400 disabled:opacity-60"
                >
                  Check destination
                </button>
              </form>

              {searchMutation.data?.summary && (
                <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">
                  {searchMutation.data.summary}
                </p>
              )}
              {searchError && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {searchError}
                </p>
              )}
              {sessionQuery.isError && (
                <p className="mt-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-xs text-red-200">
                  Your browsing profile could not be loaded. Reload the page before continuing.
                </p>
              )}
            </section>

            <AccessDeniedPanel
              state={denied}
              onDismiss={() => setDenied(null)}
              onRequest={setRequestDomain}
              onOpenApproved={url => window.open(url, '_blank', 'noopener,noreferrer')}
            />

            {searchMutation.isPending && (
              <p className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking results against your browsing profile…
              </p>
            )}

            {!searchMutation.isPending && results.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">Approved search results</h2>
                  <span className="text-[11px] text-slate-400">
                    {results.filter(item => item.allowed).length} approved · {results.filter(item => !item.allowed).length} blocked
                  </span>
                </div>
                <BrowserSearchResults
                  results={results}
                  busyDomain={busyDomain}
                  onOpen={openDestination}
                  onRequest={setRequestDomain}
                />
              </div>
            )}

            {searchMutation.isSuccess && results.length === 0 && (
              <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
                No approved sources matched that question. Try different wording or use the company resources.
              </p>
            )}

            <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
              <h2 className="text-sm font-bold text-white">My access requests</h2>
              {myRequests.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">No access requests submitted.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-800">
                  {myRequests.map(request => (
                    <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{request.domain}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {request.justification}
                          {request.status === 'approved' && request.expires_at
                            ? ` · expires ${new Date(request.expires_at).toLocaleString()}`
                            : ''}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[request.status] || STATUS_STYLES.pending}`}>
                        {request.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <BrowserDirectory entries={directory} onOpen={openDestination} />

            <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <h2 className="text-sm font-bold text-white">Session controls</h2>
              </div>
              <ul className="mt-2 space-y-1.5">
                {permissions.map(item => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        <Icon className="h-3.5 w-3.5 text-slate-500" /> {item.label}
                      </span>
                      <span className={item.allowed ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300'}>
                        {item.allowed ? 'Allowed' : 'Blocked'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 border-t border-slate-800 pt-2 text-[11px] leading-5 text-slate-500">
                Locked down: private browsing, guest sessions, unapproved extensions, DNS and proxy changes, and clearing
                security audit records.
              </p>
            </section>
          </aside>
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> Company browsing policy enforced · activity is logged for security review
          </span>
          <span>Approved search only · {policy?.name || 'no profile'}</span>
        </footer>
      </BrowserIdleGuard>

      <BrowserRequestDialog
        open={Boolean(requestDomain)}
        domain={requestDomain}
        submitting={requestMutation.isPending}
        onOpenChange={open => { if (!open) setRequestDomain(''); }}
        onSubmit={justification => requestMutation.mutate({ domain: requestDomain, justification })}
      />
    </div>
  );
}