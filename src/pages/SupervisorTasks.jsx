import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, RefreshCw, Search, ShieldCheck, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import SupervisorActionItem from '@/components/supervisor/SupervisorActionItem';
import { ACTION_GROUPS, buildSupervisorActionItems, summarizeActionItems } from '@/lib/supervisorActionItems';

export default function SupervisorTasks() {
  const queryClient = useQueryClient();
  const navigate=useNavigate();
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [completingId, setCompletingId] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const { data: payload = {}, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['supervisorScopedTasks', user?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSupervisorScopedTasks', {});
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      return data;
    },
    enabled: hasSupervisorAccess(user),
    staleTime: 60000, refetchOnWindowFocus: false, refetchInterval: 180000, retry: false,
  });

  // Parking notices are real supervisor approval tasks, not just a separate
  // archive menu. Load a small, server-filtered queue only while this page is
  // mounted; no full resident or vehicle scans from the client.
  const {data:parkingQueue={},isFetching:parkingFetching,refetch:refreshParking} = useQuery({
    queryKey:['supervisorParkingReviewQueue',user?.id],
    queryFn:async()=>{
      const response=await base44.functions.invoke('manageParkingRecords',{action:'review_queue'});
      const result=response?.data||response||{};
      if(result.error)throw new Error(result.error);
      return result;
    },
    enabled:hasSupervisorAccess(user),staleTime:120000,refetchInterval:180000,refetchOnWindowFocus:false,retry:1,
  });
  const parkingReviews=parkingQueue.reviews||[];
  // Action Items is an individual's assigned work queue, not every pending
  // officer record in their area. Unassigned source findings remain in the
  // underlying oversight module until a supervisor is given ownership.
  const items = useMemo(() => buildSupervisorActionItems(payload).filter(item =>
    item.source === 'queue' || item.source === 'followup'), [payload]);
  const baseSummary=useMemo(()=>summarizeActionItems(items),[items]);
  const summary=useMemo(()=>({...baseSummary,
    total:baseSummary.total+parkingReviews.length,
    urgent:baseSummary.urgent+parkingReviews.length,
    byGroup:{...baseSummary.byGroup,reports:(baseSummary.byGroup.reports||0)+parkingReviews.length},
  }),[baseSummary,parkingReviews.length]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      if (group !== 'all' && item.group !== group) return false;
      if (!term) return true;
      return [item.title, item.person, item.detail, item.assignedTo]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    });
  }, [items, group, search]);

  const complete = async item => {
    if (!item?.complete) return;
    setCompletingId(item.id);
    try {
      const response = await base44.functions.invoke('getSupervisorScopedTasks', item.complete);
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      toast.success(`Officer outreach recorded for ${item.person || 'the officer'}.`);
      queryClient.invalidateQueries({ queryKey: ['supervisorScopedTasks'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboardWorkQueue'] });
      await refetch();
    } catch (failure) {
      toast.error(failure?.message || 'This action item could not be completed.');
    } finally {
      setCompletingId(null);
    }
  };

  if (user && !hasSupervisorAccess(user)) {
    return (
      <div className="p-8 text-center">
        <UserCheck className="mx-auto mb-4 h-16 w-16 text-slate-400" />
        <h2 className="mb-2 text-2xl font-bold text-slate-900">Supervisor access required</h2>
        <p className="text-slate-600">This action list is limited to supervisory personnel.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070d17] p-3 pb-10 text-white sm:p-4">
      <div className="mx-auto max-w-[1500px] space-y-4">
        {parkingReviews.length>0&&(group==='all'||group==='reports')&&<section className="rounded-xl border border-amber-500/40 bg-[#132236] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-black text-amber-200">Parking approval tasks ({parkingReviews.length})</h2><p className="mt-1 text-xs text-slate-400">Issued notices awaiting supervisor approval or return with correction notes.</p></div><button type="button" className="rounded-lg border border-cyan-600 px-3 py-2 text-xs font-bold" disabled={parkingFetching} onClick={()=>refreshParking()}>Refresh parking tasks</button></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{parkingReviews.slice(0,15).map(review=><button type="button" key={review.id} className="rounded-lg border border-slate-600 p-3 text-left hover:border-amber-500" onClick={()=>navigate(`${createPageUrl('SupervisorCenter')}?section=command&tool=parking`)}><div className="text-sm font-bold text-white">{review.citation_number||'Parking notice'} · {review.license_plate||'No plate'}</div><div className="mt-1 text-xs text-slate-300">{review.location} · {review.violation_date} · {review.violation_type}</div><div className="mt-1 text-[11px] text-amber-200">Open Parking Review to approve or return</div></button>)}</div>
        </section>}
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-[#10233b] via-[#0b1726] to-[#07101c] p-4 shadow-lg sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10"><ClipboardList className="h-5 w-5 text-emerald-300" /></div>
              <div>
                <h1 className="text-xl font-black leading-tight text-white">Supervisor Action Items</h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  Only verified action items assigned to you for officers within your authorized chain of command.
                </p>
              </div>
            </div>
            <Button onClick={() => refetch()} disabled={isFetching} className="h-11 border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-[#0b1725] px-2.5 py-1 font-bold text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              {payload.fullAccess ? 'Company-wide view' : 'Assigned to you'}
            </span>
            <span>Work rotates automatically across supervisors by open workload, so no single supervisor receives every follow-up.</span>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Unable to load supervisor action items: {error.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-500/30 bg-[#0d2033] p-4">
            <div className="text-3xl font-black text-white">{summary.total}</div>
            <div className="text-sm font-bold text-white">Open action items</div>
            <p className="text-xs text-blue-200">{summary.urgent} high or critical</p>
          </div>
          <div className="rounded-xl border border-cyan-500/30 bg-[#0d2033] p-4">
            <div className="text-3xl font-black text-white">{summary.byGroup.duty}</div>
            <div className="text-sm font-bold text-white">Duty &amp; attendance</div>
            <p className="text-xs text-cyan-200">Officer outreach follow-ups</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-[#0d2033] p-4">
            <div className="text-3xl font-black text-white">{summary.byGroup.conduct}</div>
            <div className="text-sm font-bold text-white">Conduct &amp; inspections</div>
            <p className="text-xs text-amber-200">Complaints, write-ups, inspections</p>
          </div>
          <div className="rounded-xl border border-purple-500/30 bg-[#0d2033] p-4">
            <div className="text-3xl font-black text-white">{summary.oldestDays}</div>
            <div className="text-sm font-bold text-white">Oldest item (days)</div>
            <p className="text-xs text-purple-200">{summary.byGroup.reviews} review · {summary.byGroup.reports} report · {summary.byGroup.live} live</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0a1421] p-4 shadow-lg sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setGroup('all')}
                className={`min-h-9 rounded-lg border px-3 text-[11px] font-black uppercase tracking-wider transition ${group === 'all' ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100' : 'border-slate-700 bg-[#0b1725] text-slate-300 hover:text-white'}`}
              >
                All ({summary.total})
              </button>
              {ACTION_GROUPS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setGroup(option.id)}
                  className={`min-h-9 rounded-lg border px-3 text-[11px] font-black uppercase tracking-wider transition ${group === option.id ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100' : 'border-slate-700 bg-[#0b1725] text-slate-300 hover:text-white'}`}
                >
                  {option.label} ({summary.byGroup[option.id] || 0})
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search officer or task"
                className="h-11 w-[240px] border-slate-700 bg-[#0b1725] pl-9 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {isLoading && <div className="rounded-xl border border-dashed border-slate-800 p-7 text-center text-sm text-slate-400">Loading your action items…</div>}
            {!isLoading && !visibleItems.length && (
              <div className="rounded-xl border border-dashed border-slate-800 p-7 text-center text-sm text-emerald-300">
                {items.length ? 'No action item matches this filter.' : 'Nothing is waiting on you. Every assigned follow-up is complete.'}
              </div>
            )}
            {!isLoading && visibleItems.map(item => (
              <SupervisorActionItem
                key={item.id}
                item={item}
                showAssignee={Boolean(payload.fullAccess)}
                onComplete={complete}
                completing={completingId === item.id}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}