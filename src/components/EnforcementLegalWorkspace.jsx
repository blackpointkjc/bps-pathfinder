import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, FileText, Loader2, Scale, Search, ShieldAlert, UserX, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import CenterToolSection from '@/components/CenterToolSection';
import { rankVirginiaFieldCodes } from '@/pages/VirginiaFieldLawAssistant';

const LEGAL_ENTITIES = ['TrespassingNotice', 'CriminalComplaint', 'Summons'];
const ENTITY_TOOL = {
  TrespassingNotice: 'trespass',
  CriminalComplaint: 'complaint',
  Summons: 'summons',
};
const ENTITY_ICON = {
  TrespassingNotice: UserX,
  CriminalComplaint: ShieldAlert,
  Summons: FileText,
};

const normalize = value => String(value || '').trim().toLowerCase();

function lawMatches(query) {
  const q = normalize(query);
  if (q.length < 2) return [];
  return rankVirginiaFieldCodes(query, 8).map(item => ({
    id: `law:${item.code}`,
    entity: 'VirginiaLaw',
    source: 'Virginia Law',
    tool: 'law',
    label: `${item.name} · ${item.code}`,
    location: item.category,
    status: item.level,
    summary: item.elements,
    url: item.url,
  }));
}

export default function EnforcementLegalWorkspace({ tools, queryParam = 'tool', workspaceClassName = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['enforcementLegalGlobalSearch', debouncedSearch],
    queryFn: async () => {
      const response = await base44.functions.invoke('searchCompanyRecords', {
        query: debouncedSearch,
        search_type: 'all',
        entities: LEGAL_ENTITIES,
      });
      const payload = response?.data || response || {};
      if (payload?.error) throw new Error(payload.error);
      return payload;
    },
    enabled: debouncedSearch.length >= 2,
    staleTime: 30000,
    retry: 1,
  });

  const results = useMemo(() => {
    if (debouncedSearch.length < 2) return [];
    const records = (data?.results || [])
      .filter(item => LEGAL_ENTITIES.includes(item.entity))
      .map(item => ({ ...item, tool: ENTITY_TOOL[item.entity] }));
    return [...lawMatches(debouncedSearch), ...records].slice(0, 80);
  }, [data, debouncedSearch]);

  const counts = useMemo(() => results.reduce((acc, item) => {
    acc[item.tool] = (acc[item.tool] || 0) + 1;
    return acc;
  }, {}), [results]);

  const openTool = result => {
    if (result?.entity === 'VirginiaLaw' && result?.url) {
      const params = new URLSearchParams(location.search);
      params.set(queryParam, 'law');
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
      return;
    }
    const tool = result?.tool;
    if (!tool) return;
    const params = new URLSearchParams(location.search);
    params.set(queryParam, tool);
    const query = params.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : '' }, { replace: true });
  };

  return (
    <div className="w-full bg-[#07101b]">
      <div className="sticky top-0 z-40 border-b border-[#284661] bg-[#071421]/95 px-3 py-3 shadow-xl backdrop-blur md:px-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="min-w-0 lg:w-64">
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Enforcement & Legal Search</div>
              <div className="mt-0.5 text-[10px] text-slate-400">Search Virginia law, trespass, complaints and summons together.</div>
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Describe a situation or search name, DOB, ID, vehicle, Virginia code, warrant, report or CAD #…"
                className="h-11 border-[#315879] bg-[#050c14] pl-10 pr-10 text-sm text-white placeholder:text-slate-600 focus-visible:ring-cyan-500"
                aria-label="Search all Enforcement and Legal records"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Clear enforcement search">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {debouncedSearch.length >= 2 && (
              <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase">
                <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-1 text-blue-200">Law {counts.law || 0}</span>
                <span className="rounded-full border border-amber-800 bg-amber-950/40 px-2 py-1 text-amber-200">Trespass {counts.trespass || 0}</span>
                <span className="rounded-full border border-red-800 bg-red-950/40 px-2 py-1 text-red-200">Complaints {counts.complaint || 0}</span>
                <span className="rounded-full border border-violet-800 bg-violet-950/40 px-2 py-1 text-violet-200">Summons {counts.summons || 0}</span>
              </div>
            )}
          </div>

          {debouncedSearch.length >= 2 && (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-[#050c14]">
              {isFetching && (
                <div className="flex items-center gap-2 px-4 py-3 text-xs font-bold text-cyan-200"><Loader2 className="h-4 w-4 animate-spin" /> Searching Enforcement & Legal…</div>
              )}
              {error && !isFetching && (
                <div className="flex items-center gap-3 px-4 py-3 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">Search could not load: {error.message}</span>
                  <button type="button" onClick={() => refetch()} className="rounded border border-amber-700 px-2 py-1 text-[10px] font-black uppercase hover:bg-amber-950">Retry</button>
                </div>
              )}
              {!isFetching && !error && results.length === 0 && (
                <div className="px-4 py-3 text-xs text-slate-500">No Enforcement & Legal matches found for “{debouncedSearch}”.</div>
              )}
              {!error && results.length > 0 && (
                <div className="max-h-72 divide-y divide-slate-800 overflow-y-auto">
                  {results.map(result => {
                    const Icon = result.entity === 'VirginiaLaw' ? Scale : (ENTITY_ICON[result.entity] || FileText);
                    return (
                      <button key={`${result.entity}:${result.id}`} type="button" onClick={() => openTool(result)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-900/90">
                        <div className="mt-0.5 rounded-lg border border-slate-700 bg-slate-900 p-2"><Icon className="h-4 w-4 text-cyan-300" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-black uppercase tracking-wider text-cyan-300">{result.source}</span>{result.status && <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[8px] font-bold uppercase text-slate-400">{result.status}</span>}</div>
                          <div className="mt-0.5 break-words text-sm font-black text-white">{result.label || result.person || 'Legal record'}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                            {result.person && <span>{result.person}</span>}
                            {result.location && <span>{result.location}</span>}
                            {result.linked_call_number && <span>CAD {result.linked_call_number}</span>}
                            {result.warrant_number && <span className="font-bold text-red-300">Warrant {result.warrant_number}</span>}
                          </div>
                          {result.summary && <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{result.summary}</div>}
                        </div>
                        <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-600" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <CenterToolSection
        tools={tools}
        queryParam={queryParam}
        workspaceClassName={workspaceClassName}
        componentProps={{ sharedSearch: search, onSharedSearchChange: setSearch }}
      />
    </div>
  );
}
